-- Cost basis tracking for future 1099-DA reporting.
-- cost_basis_cents: what the current owner paid to acquire this autograph.
--   0 for the original celebrity (created it), 0 for trade recipients (no cash exchanged).
-- acquired_at: when the current owner took ownership.

alter table public.autographs
  add column if not exists cost_basis_cents integer not null default 0,
  add column if not exists acquired_at timestamptz not null default now();

-- Backfill acquired_at for existing rows using created_at as a proxy.
update public.autographs
  set acquired_at = created_at
  where acquired_at = now();

-- Patch rpc_finalize_purchase to record cost basis on fixed-price sale.
create or replace function public.rpc_finalize_purchase(
  p_payment_event_id uuid,
  p_buyer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_event public.payment_events%rowtype;
  v_autograph public.autographs%rowtype;
  v_transfer_id uuid;
  v_existing_transfer_id uuid;
  v_transfer_type public.transfer_type;
begin
  select *
  into v_payment_event
  from public.payment_events
  where id = p_payment_event_id
  for update;

  if not found then
    raise exception 'payment event not found';
  end if;

  if v_payment_event.user_id <> p_buyer_id then
    raise exception 'payment event does not belong to buyer';
  end if;

  if v_payment_event.purpose <> 'fixed_price_purchase' then
    raise exception 'payment event purpose mismatch';
  end if;

  if (v_payment_event.provider_metadata ->> 'transfer_id') is not null then
    return jsonb_build_object(
      'status', 'already_completed',
      'transfer_id', (v_payment_event.provider_metadata ->> 'transfer_id')::uuid,
      'owner_id', p_buyer_id
    );
  end if;

  select *
  into v_autograph
  from public.autographs
  where id = v_payment_event.autograph_id
  for update;

  if not found then
    raise exception 'autograph not found';
  end if;

  if v_autograph.status <> 'active' then
    raise exception 'autograph is not active';
  end if;

  if v_autograph.is_for_sale is distinct from true or v_autograph.listing_type is distinct from 'fixed' then
    raise exception 'autograph is no longer a fixed-price listing';
  end if;

  if v_autograph.owner_id = p_buyer_id then
    raise exception 'buyer already owns autograph';
  end if;

  if v_autograph.price_cents is distinct from v_payment_event.amount_cents then
    raise exception 'listing price changed';
  end if;

  select id
  into v_existing_transfer_id
  from public.transfers
  where payment_event_id = p_payment_event_id
  limit 1;

  if v_existing_transfer_id is not null then
    update public.payment_events
    set
      status = 'captured',
      captured_at = coalesce(captured_at, now()),
      provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
        'transfer_id', v_existing_transfer_id::text
      )
    where id = p_payment_event_id;

    return jsonb_build_object(
      'status', 'already_completed',
      'transfer_id', v_existing_transfer_id,
      'owner_id', p_buyer_id
    );
  end if;

  v_transfer_type := case
    when v_autograph.celebrity_id = v_autograph.owner_id then 'primary_sale'::public.transfer_type
    else 'secondary_sale'::public.transfer_type
  end;

  insert into public.transfers (
    autograph_id,
    from_user_id,
    to_user_id,
    transfer_type,
    price_cents,
    payment_event_id
  ) values (
    v_autograph.id,
    v_autograph.owner_id,
    p_buyer_id,
    v_transfer_type,
    v_payment_event.amount_cents,
    p_payment_event_id
  )
  returning id into v_transfer_id;

  update public.autographs
  set
    owner_id = p_buyer_id,
    ownership_source = 'purchase',
    latest_transfer_id = v_transfer_id,
    is_for_sale = false,
    listing_type = null,
    price_cents = null,
    reserve_price_cents = null,
    auction_ends_at = null,
    open_to_trade = false,
    cost_basis_cents = v_payment_event.amount_cents,
    acquired_at = now()
  where id = v_autograph.id;

  update public.trade_offers
  set
    status = 'expired',
    responded_at = now()
  where status = 'pending'
    and (
      target_autograph_id = v_autograph.id
      or offered_autograph_id = v_autograph.id
    );

  update public.payment_events
  set
    status = 'captured',
    captured_at = coalesce(captured_at, now()),
    provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
      'transfer_id', v_transfer_id::text
    )
  where id = p_payment_event_id;

  return jsonb_build_object(
    'status', 'completed',
    'transfer_id', v_transfer_id,
    'owner_id', p_buyer_id
  );
end;
$$;

-- Patch rpc_respond_trade_offer to record cost basis (0) on trade acceptance.
create or replace function public.rpc_respond_trade_offer(
  p_trade_offer_id uuid,
  p_actor_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade_offer public.trade_offers%rowtype;
  v_target_autograph public.autographs%rowtype;
  v_offered_autograph public.autographs%rowtype;
  v_target_transfer_id uuid;
  v_offered_transfer_id uuid;
begin
  select *
  into v_trade_offer
  from public.trade_offers
  where id = p_trade_offer_id
  for update;

  if not found then
    raise exception 'trade offer not found';
  end if;

  if v_trade_offer.target_owner_id <> p_actor_id then
    raise exception 'only the target owner can respond to this trade offer';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'invalid trade offer action';
  end if;

  if p_action = 'decline' then
    if v_trade_offer.status = 'declined' then
      return jsonb_build_object('status', 'declined');
    end if;

    if v_trade_offer.status <> 'pending' then
      raise exception 'trade offer is no longer pending';
    end if;

    update public.trade_offers
    set status = 'declined', responded_at = now()
    where id = p_trade_offer_id;

    return jsonb_build_object('status', 'declined');
  end if;

  if v_trade_offer.status = 'accepted' then
    return jsonb_build_object(
      'status', 'accepted',
      'accepted_transfer_id', v_trade_offer.accepted_transfer_id
    );
  end if;

  if v_trade_offer.status <> 'pending' then
    raise exception 'trade offer is no longer pending';
  end if;

  select *
  into v_target_autograph
  from public.autographs
  where id = v_trade_offer.target_autograph_id
  for update;

  select *
  into v_offered_autograph
  from public.autographs
  where id = v_trade_offer.offered_autograph_id
  for update;

  if not found then
    raise exception 'autograph not found';
  end if;

  if v_target_autograph.status <> 'active' or v_offered_autograph.status <> 'active' then
    raise exception 'both autographs must still be active';
  end if;

  if v_target_autograph.owner_id <> p_actor_id then
    raise exception 'target owner no longer owns the target autograph';
  end if;

  if v_offered_autograph.owner_id <> v_trade_offer.offerer_id then
    raise exception 'offerer no longer owns the offered autograph';
  end if;

  if v_target_autograph.open_to_trade is distinct from true then
    raise exception 'target autograph is no longer open to trade';
  end if;

  insert into public.transfers (
    autograph_id,
    from_user_id,
    to_user_id,
    transfer_type,
    trade_offer_id
  ) values (
    v_target_autograph.id,
    p_actor_id,
    v_trade_offer.offerer_id,
    'trade',
    p_trade_offer_id
  )
  returning id into v_target_transfer_id;

  insert into public.transfers (
    autograph_id,
    from_user_id,
    to_user_id,
    transfer_type,
    trade_offer_id
  ) values (
    v_offered_autograph.id,
    v_trade_offer.offerer_id,
    p_actor_id,
    'trade',
    p_trade_offer_id
  )
  returning id into v_offered_transfer_id;

  -- Trades have $0 cash basis; acquired_at reflects the moment of exchange.
  update public.autographs
  set
    owner_id = v_trade_offer.offerer_id,
    ownership_source = 'trade',
    latest_transfer_id = v_target_transfer_id,
    is_for_sale = false,
    listing_type = null,
    price_cents = null,
    reserve_price_cents = null,
    auction_ends_at = null,
    open_to_trade = false,
    cost_basis_cents = 0,
    acquired_at = now()
  where id = v_target_autograph.id;

  update public.autographs
  set
    owner_id = p_actor_id,
    ownership_source = 'trade',
    latest_transfer_id = v_offered_transfer_id,
    is_for_sale = false,
    listing_type = null,
    price_cents = null,
    reserve_price_cents = null,
    auction_ends_at = null,
    open_to_trade = false,
    cost_basis_cents = 0,
    acquired_at = now()
  where id = v_offered_autograph.id;

  update public.trade_offers
  set
    status = 'expired',
    responded_at = now()
  where status = 'pending'
    and (
      target_autograph_id in (v_target_autograph.id, v_offered_autograph.id)
      or offered_autograph_id in (v_target_autograph.id, v_offered_autograph.id)
    );

  update public.trade_offers
  set
    status = 'accepted',
    responded_at = now(),
    accepted_transfer_id = v_target_transfer_id
  where id = p_trade_offer_id;

  return jsonb_build_object(
    'status', 'accepted',
    'accepted_transfer_id', v_target_transfer_id,
    'mirror_transfer_id', v_offered_transfer_id
  );
end;
$$;
