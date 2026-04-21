create or replace function public.rpc_start_auction_settlement(
  p_autograph_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autograph public.autographs%rowtype;
  v_winner public.bids%rowtype;
  v_reserve_met boolean;
  v_loser_records jsonb;
begin
  select *
  into v_autograph
  from public.autographs
  where id = p_autograph_id
  for update;

  if not found then
    raise exception 'autograph not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bid_id', b.id,
        'bidder_id', b.bidder_id,
        'payment_event_id', b.payment_event_id,
        'payment_intent_id', b.payment_intent_id,
        'amount_cents', b.amount_cents
      )
    ),
    '[]'::jsonb
  )
  into v_loser_records
  from public.bids b
  where b.autograph_id = p_autograph_id
    and b.payment_intent_id is not null
    and (
      v_autograph.auction_settlement_bid_id is null
      or b.id <> v_autograph.auction_settlement_bid_id
    );

  if v_autograph.auction_settlement_status = 'settled' then
    return jsonb_build_object(
      'status', 'settled',
      'autograph_id', p_autograph_id,
      'winner_bid_id', v_autograph.auction_settlement_bid_id,
      'losers', v_loser_records
    );
  end if;

  if v_autograph.listing_type is distinct from 'auction' then
    return jsonb_build_object(
      'status', 'not_auction',
      'autograph_id', p_autograph_id
    );
  end if;

  if v_autograph.auction_ends_at is null or v_autograph.auction_ends_at > now() then
    return jsonb_build_object(
      'status', 'not_ready',
      'autograph_id', p_autograph_id
    );
  end if;

  select *
  into v_winner
  from public.bids
  where autograph_id = p_autograph_id
    and status in ('active', 'outbid', 'won')
    and payment_intent_id is not null
  order by amount_cents desc, created_at asc
  limit 1
  for update;

  v_reserve_met := v_winner.id is not null
    and v_winner.amount_cents >= coalesce(v_autograph.reserve_price_cents, 0);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bid_id', b.id,
        'bidder_id', b.bidder_id,
        'payment_event_id', b.payment_event_id,
        'payment_intent_id', b.payment_intent_id,
        'amount_cents', b.amount_cents
      )
    ),
    '[]'::jsonb
  )
  into v_loser_records
  from public.bids b
  where b.autograph_id = p_autograph_id
    and b.payment_intent_id is not null
    and (v_winner.id is null or b.id <> v_winner.id);

  if v_autograph.auction_settlement_status = 'unsold' then
    return jsonb_build_object(
      'status', 'unsold',
      'autograph_id', p_autograph_id,
      'losers', v_loser_records
    );
  end if;

  if not v_reserve_met then
    update public.autographs
    set
      visibility = 'public',
      sale_state = 'not_for_sale',
      is_for_sale = false,
      listing_type = null,
      price_cents = null,
      reserve_price_cents = null,
      auction_ends_at = null,
      open_to_trade = false,
      auction_settlement_status = 'unsold',
      auction_settlement_bid_id = null,
      auction_settlement_at = now()
    where id = p_autograph_id;

    if v_winner.id is not null then
      insert into public.autograph_offers (
        autograph_id,
        buyer_id,
        owner_id,
        amount_cents,
        status,
        expires_at
      )
      select
        p_autograph_id,
        v_winner.bidder_id,
        v_autograph.owner_id,
        v_winner.amount_cents,
        'pending',
        now() + interval '72 hours'
      where not exists (
        select 1
        from public.autograph_offers ao
        where ao.autograph_id = p_autograph_id
          and ao.buyer_id = v_winner.bidder_id
          and ao.status = 'pending'
      );
    end if;

    return jsonb_build_object(
      'status', 'unsold',
      'autograph_id', p_autograph_id,
      'losers', v_loser_records
    );
  end if;

  if v_autograph.auction_settlement_status = 'pending_capture'
     and v_autograph.auction_settlement_bid_id is not null
     and v_autograph.auction_settlement_bid_id <> v_winner.id then
    raise exception 'auction settlement winner mismatch';
  end if;

  update public.autographs
  set
    auction_settlement_status = 'pending_capture',
    auction_settlement_bid_id = v_winner.id,
    auction_settlement_at = coalesce(auction_settlement_at, now())
  where id = p_autograph_id;

  return jsonb_build_object(
    'status', 'pending_capture',
    'autograph_id', p_autograph_id,
    'winner_bid_id', v_winner.id,
    'winner_bidder_id', v_winner.bidder_id,
    'winner_amount_cents', v_winner.amount_cents,
    'winner_payment_event_id', v_winner.payment_event_id,
    'winner_payment_intent_id', v_winner.payment_intent_id,
    'seller_id', v_autograph.owner_id,
    'creator_id', v_autograph.creator_id,
    'losers', v_loser_records
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
    update public.autographs
    set
      visibility = 'public',
      sale_state = 'not_for_sale',
      is_for_sale = false,
      listing_type = null,
      price_cents = null,
      reserve_price_cents = null,
      auction_ends_at = null,
      open_to_trade = false
    where id = p_autograph_id;

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
