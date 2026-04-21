-- Auto-expire pending trade offers that are past their expires_at
-- Also patches the rpc_respond_trade_offer function to block accepting expired offers

-- 1. Mark any existing pending offers without expires_at as expiring 24h from created_at
update public.trade_offers
set expires_at = created_at + interval '24 hours'
where status = 'pending'
  and expires_at is null;

-- 2. Update rpc_respond_trade_offer to reject expired offers
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

  -- Check expiry before any action
  if v_trade_offer.expires_at is not null and now() > v_trade_offer.expires_at then
    -- Auto-mark as expired if still pending
    if v_trade_offer.status = 'pending' then
      update public.trade_offers
      set status = 'expired', responded_at = now()
      where id = p_trade_offer_id;
    end if;
    raise exception 'trade offer has expired';
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
    autograph_id, from_user_id, to_user_id, transfer_type, trade_offer_id
  ) values (
    v_target_autograph.id, p_actor_id, v_trade_offer.offerer_id, 'trade', p_trade_offer_id
  )
  returning id into v_target_transfer_id;

  insert into public.transfers (
    autograph_id, from_user_id, to_user_id, transfer_type, trade_offer_id
  ) values (
    v_offered_autograph.id, v_trade_offer.offerer_id, p_actor_id, 'trade', p_trade_offer_id
  )
  returning id into v_offered_transfer_id;

  update public.autographs
  set
    owner_id = v_trade_offer.offerer_id, ownership_source = 'trade',
    latest_transfer_id = v_target_transfer_id, is_for_sale = false,
    listing_type = null, price_cents = null, reserve_price_cents = null,
    auction_ends_at = null, open_to_trade = false
  where id = v_target_autograph.id;

  update public.autographs
  set
    owner_id = p_actor_id, ownership_source = 'trade',
    latest_transfer_id = v_offered_transfer_id, is_for_sale = false,
    listing_type = null, price_cents = null, reserve_price_cents = null,
    auction_ends_at = null, open_to_trade = false
  where id = v_offered_autograph.id;

  -- Cancel other pending offers on these autographs
  update public.trade_offers
  set status = 'expired', responded_at = now()
  where status = 'pending'
    and id <> p_trade_offer_id
    and (
      target_autograph_id in (v_target_autograph.id, v_offered_autograph.id)
      or offered_autograph_id in (v_target_autograph.id, v_offered_autograph.id)
    );

  update public.trade_offers
  set status = 'accepted', responded_at = now(), accepted_transfer_id = v_target_transfer_id
  where id = p_trade_offer_id;

  return jsonb_build_object(
    'status', 'accepted',
    'accepted_transfer_id', v_target_transfer_id,
    'mirror_transfer_id', v_offered_transfer_id
  );
end;
$$;

-- 3. Add a pg_cron job to sweep expired pending offers every 15 minutes
-- (Only runs if pg_cron extension is enabled on this Supabase project)
select cron.schedule(
  'expire-trade-offers',
  '*/15 * * * *',
  $$
    update public.trade_offers
    set status = 'expired', responded_at = now()
    where status = 'pending'
      and expires_at is not null
      and expires_at < now();
  $$
);
