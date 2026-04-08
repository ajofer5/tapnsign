-- Phase 2.5 command hardening.
-- Adds idempotency support and transactional RPCs for purchase, bidding, and trade response.

alter table public.payment_events
  add column if not exists idempotency_key text;

create unique index if not exists payment_events_idempotency_unique_idx
  on public.payment_events (user_id, purpose, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists bids_payment_event_unique_idx
  on public.bids (payment_event_id)
  where payment_event_id is not null;

create unique index if not exists transfers_payment_event_unique_idx
  on public.transfers (payment_event_id)
  where payment_event_id is not null;

create unique index if not exists trade_offers_accepted_transfer_unique_idx
  on public.trade_offers (accepted_transfer_id)
  where accepted_transfer_id is not null;

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
    open_to_trade = false
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

create or replace function public.rpc_place_bid(
  p_payment_event_id uuid,
  p_bidder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_event public.payment_events%rowtype;
  v_autograph public.autographs%rowtype;
  v_existing_bid_id uuid;
  v_top_bid_amount integer;
  v_min_bid integer;
  v_bid_id uuid;
  v_outbid_records jsonb;
begin
  select *
  into v_payment_event
  from public.payment_events
  where id = p_payment_event_id
  for update;

  if not found then
    raise exception 'payment event not found';
  end if;

  if v_payment_event.user_id <> p_bidder_id then
    raise exception 'payment event does not belong to bidder';
  end if;

  if v_payment_event.purpose <> 'auction_bid_authorization' then
    raise exception 'payment event purpose mismatch';
  end if;

  if (v_payment_event.provider_metadata ->> 'bid_id') is not null then
    return jsonb_build_object(
      'status', 'already_completed',
      'bid_id', (v_payment_event.provider_metadata ->> 'bid_id')::uuid,
      'outbid_payment_intents', '[]'::jsonb
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

  if v_autograph.is_for_sale is distinct from true or v_autograph.listing_type is distinct from 'auction' then
    raise exception 'autograph is no longer an auction listing';
  end if;

  if v_autograph.owner_id = p_bidder_id then
    raise exception 'cannot bid on your own autograph';
  end if;

  if v_autograph.auction_ends_at is null or v_autograph.auction_ends_at <= now() then
    raise exception 'auction has ended';
  end if;

  select amount_cents
  into v_top_bid_amount
  from public.bids
  where autograph_id = v_autograph.id
    and status = 'active'
  order by amount_cents desc, created_at asc
  limit 1;

  v_min_bid := coalesce(v_top_bid_amount + 100, v_autograph.reserve_price_cents, 100);

  if v_payment_event.amount_cents < v_min_bid then
    raise exception 'bid amount is below minimum';
  end if;

  select id
  into v_existing_bid_id
  from public.bids
  where payment_event_id = p_payment_event_id
  limit 1;

  if v_existing_bid_id is not null then
    update public.payment_events
    set
      status = 'authorized',
      provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
        'bid_id', v_existing_bid_id::text
      )
    where id = p_payment_event_id;

    return jsonb_build_object(
      'status', 'already_completed',
      'bid_id', v_existing_bid_id,
      'outbid_payment_intents', '[]'::jsonb
    );
  end if;

  insert into public.bids (
    autograph_id,
    bidder_id,
    amount_cents,
    status,
    payment_event_id,
    payment_intent_id
  ) values (
    v_autograph.id,
    p_bidder_id,
    v_payment_event.amount_cents,
    'active',
    p_payment_event_id,
    v_payment_event.stripe_payment_intent_id
  )
  returning id into v_bid_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bid_id', id,
        'payment_event_id', payment_event_id,
        'payment_intent_id', payment_intent_id
      )
    ),
    '[]'::jsonb
  )
  into v_outbid_records
  from public.bids
  where autograph_id = v_autograph.id
    and status = 'active'
    and id <> v_bid_id;

  update public.bids
  set status = 'outbid'
  where autograph_id = v_autograph.id
    and status = 'active'
    and id <> v_bid_id;

  update public.payment_events
  set
    status = 'authorized',
    provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
      'bid_id', v_bid_id::text
    )
  where id = p_payment_event_id;

  return jsonb_build_object(
    'status', 'completed',
    'bid_id', v_bid_id,
    'outbid_payment_intents', v_outbid_records
  );
end;
$$;

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
    set
      status = 'declined',
      responded_at = now()
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
    open_to_trade = false
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
    open_to_trade = false
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
