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
    when v_autograph.creator_id = v_autograph.owner_id then 'primary_sale'::public.transfer_type
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
    visibility = 'private',
    sale_state = 'not_for_sale',
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

create or replace function public.rpc_finalize_auction_settlement(
  p_autograph_id uuid,
  p_winner_bid_id uuid,
  p_capture_succeeded boolean,
  p_canceled_loser_payment_event_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autograph public.autographs%rowtype;
  v_winner public.bids%rowtype;
  v_transfer_id uuid;
  v_existing_transfer_id uuid;
  v_transfer_type public.transfer_type;
begin
  select *
  into v_autograph
  from public.autographs
  where id = p_autograph_id
  for update;

  if not found then
    raise exception 'autograph not found';
  end if;

  if v_autograph.auction_settlement_status = 'settled' then
    if array_length(p_canceled_loser_payment_event_ids, 1) is not null then
      update public.payment_events
      set
        status = 'canceled',
        canceled_at = coalesce(canceled_at, now())
      where id = any(p_canceled_loser_payment_event_ids);

      update public.bids
      set status = 'authorization_canceled'
      where payment_event_id = any(p_canceled_loser_payment_event_ids)
        and status <> 'won';
    end if;

    return jsonb_build_object(
      'status', 'settled',
      'transfer_id', v_autograph.latest_transfer_id
    );
  end if;

  if v_autograph.auction_settlement_status = 'unsold' then
    if array_length(p_canceled_loser_payment_event_ids, 1) is not null then
      update public.payment_events
      set
        status = 'canceled',
        canceled_at = coalesce(canceled_at, now())
      where id = any(p_canceled_loser_payment_event_ids);

      update public.bids
      set status = 'authorization_canceled'
      where payment_event_id = any(p_canceled_loser_payment_event_ids)
        and status <> 'won';
    end if;

    return jsonb_build_object('status', 'unsold');
  end if;

  if v_autograph.auction_settlement_status <> 'pending_capture' then
    raise exception 'auction is not pending capture';
  end if;

  if v_autograph.auction_settlement_bid_id is distinct from p_winner_bid_id then
    raise exception 'winner bid mismatch';
  end if;

  select *
  into v_winner
  from public.bids
  where id = p_winner_bid_id
  for update;

  if not found then
    raise exception 'winner bid not found';
  end if;

  if not p_capture_succeeded then
    update public.autographs
    set
      auction_settlement_status = 'none',
      auction_settlement_bid_id = null
    where id = p_autograph_id;

    return jsonb_build_object('status', 'capture_retry_needed');
  end if;

  select id
  into v_existing_transfer_id
  from public.transfers
  where payment_event_id = v_winner.payment_event_id
  limit 1;

  if v_existing_transfer_id is null then
    v_transfer_type := case
      when v_autograph.creator_id = v_autograph.owner_id then 'primary_sale'::public.transfer_type
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
      p_autograph_id,
      v_autograph.owner_id,
      v_winner.bidder_id,
      v_transfer_type,
      v_winner.amount_cents,
      v_winner.payment_event_id
    )
    returning id into v_transfer_id;
  else
    v_transfer_id := v_existing_transfer_id;
  end if;

  update public.autographs
  set
    owner_id = v_winner.bidder_id,
    ownership_source = 'auction',
    latest_transfer_id = v_transfer_id,
    visibility = 'private',
    sale_state = 'not_for_sale',
    is_for_sale = false,
    listing_type = null,
    price_cents = null,
    reserve_price_cents = null,
    auction_ends_at = null,
    open_to_trade = false,
    auction_settlement_status = 'settled',
    auction_settlement_bid_id = p_winner_bid_id,
    auction_settlement_at = now()
  where id = p_autograph_id;

  update public.payment_events
  set
    status = 'captured',
    captured_at = coalesce(captured_at, now()),
    provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || jsonb_build_object(
      'transfer_id', v_transfer_id::text
    )
  where id = v_winner.payment_event_id;

  update public.bids
  set status = 'won', settled_at = coalesce(settled_at, now())
  where id = p_winner_bid_id;

  update public.payment_events
  set
    status = 'canceled',
    canceled_at = coalesce(canceled_at, now())
  where id = any(p_canceled_loser_payment_event_ids);

  update public.bids
  set status = 'lost'
  where autograph_id = p_autograph_id
    and id <> p_winner_bid_id
    and status in ('active', 'outbid', 'authorization_canceled');

  update public.bids
  set status = 'authorization_canceled'
  where payment_event_id = any(p_canceled_loser_payment_event_ids)
    and id <> p_winner_bid_id;

  update public.trade_offers
  set
    status = 'expired',
    responded_at = now()
  where status = 'pending'
    and (
      target_autograph_id = p_autograph_id
      or offered_autograph_id = p_autograph_id
    );

  return jsonb_build_object(
    'status', 'settled',
    'transfer_id', v_transfer_id,
    'winner_bid_id', p_winner_bid_id
  );
end;
$$;
