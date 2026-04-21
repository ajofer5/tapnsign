create or replace function public.rpc_finalize_offer_purchase(
  p_offer_id uuid,
  p_payment_event_id uuid,
  p_buyer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.autograph_offers%rowtype;
  v_payment_event public.payment_events%rowtype;
  v_autograph public.autographs%rowtype;
  v_transfer_id uuid;
  v_existing_transfer_id uuid;
  v_transfer_type public.transfer_type;
begin
  select *
  into v_offer
  from public.autograph_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'offer not found';
  end if;

  if v_offer.buyer_id <> p_buyer_id then
    raise exception 'offer does not belong to buyer';
  end if;

  if v_offer.status <> 'accepted' then
    raise exception 'offer is not accepted';
  end if;

  if v_offer.payment_due_at is not null and v_offer.payment_due_at <= now() then
    update public.autograph_offers
    set
      status = 'pending',
      responded_at = null,
      accepted_at = null,
      payment_due_at = null,
      payment_event_id = null,
      updated_at = now()
    where id = p_offer_id;
    raise exception 'accepted offer payment window has expired and the offer was reopened';
  end if;

  if v_offer.accepted_transfer_id is not null then
    return jsonb_build_object(
      'status', 'already_completed',
      'transfer_id', v_offer.accepted_transfer_id,
      'owner_id', p_buyer_id
    );
  end if;

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

  if v_payment_event.purpose <> 'accepted_offer_purchase' then
    raise exception 'payment event purpose mismatch';
  end if;

  if v_payment_event.autograph_id <> v_offer.autograph_id then
    raise exception 'payment event autograph mismatch';
  end if;

  if v_payment_event.amount_cents <> v_offer.amount_cents then
    raise exception 'payment amount mismatch';
  end if;

  if (v_payment_event.provider_metadata ->> 'offer_id')::uuid <> p_offer_id then
    raise exception 'payment event offer mismatch';
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
  where id = v_offer.autograph_id
  for update;

  if not found then
    raise exception 'autograph not found';
  end if;

  if v_autograph.status <> 'active' then
    raise exception 'autograph is not active';
  end if;

  if v_autograph.owner_id <> v_offer.owner_id then
    raise exception 'owner changed before purchase could complete';
  end if;

  if v_autograph.owner_id = p_buyer_id then
    raise exception 'buyer already owns autograph';
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

    update public.autograph_offers
    set
      accepted_transfer_id = coalesce(accepted_transfer_id, v_existing_transfer_id),
      payment_event_id = coalesce(payment_event_id, p_payment_event_id),
      updated_at = now()
    where id = p_offer_id;

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
    open_to_trade = false
  where id = v_autograph.id;

  update public.autograph_offers
  set
    accepted_transfer_id = v_transfer_id,
    payment_event_id = p_payment_event_id,
    updated_at = now()
  where id = p_offer_id;

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

grant execute on function public.rpc_finalize_offer_purchase(uuid, uuid, uuid) to authenticated;
