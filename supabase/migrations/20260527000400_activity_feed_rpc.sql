create index if not exists autograph_offers_owner_activity_event_idx
  on public.autograph_offers (owner_id, (coalesce(responded_at, created_at)) desc, id desc);

create index if not exists autograph_offers_buyer_activity_event_idx
  on public.autograph_offers (buyer_id, (coalesce(responded_at, created_at)) desc, id desc);

create index if not exists personalized_requests_creator_activity_event_idx
  on public.personalized_autograph_requests (creator_id, (coalesce(completed_at, fulfilled_at, responded_at, created_at)) desc, id desc);

create index if not exists personalized_requests_requester_activity_event_idx
  on public.personalized_autograph_requests (requester_id, (coalesce(completed_at, fulfilled_at, responded_at, created_at)) desc, id desc);

drop function if exists public.get_activity_feed(uuid, integer, timestamptz, text);

create or replace function public.get_activity_feed(
  p_user_id uuid,
  p_limit integer default 40,
  p_before_event_at timestamptz default null,
  p_before_feed_id text default null
)
returns table (
  feed_id text,
  event_type text,
  autograph_id uuid,
  creator_name text,
  creator_sequence_number integer,
  series_name text,
  amount_cents integer,
  event_at timestamptz,
  status text,
  offer_id uuid,
  offer_role text,
  expires_at timestamptz,
  payment_due_at timestamptz,
  accepted_transfer_id uuid,
  personalized_request_id uuid,
  request_role text,
  recipient_name text,
  inscription_text text,
  completed_transfer_id uuid,
  is_actionable boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_user_id is distinct from auth.uid() then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  return query
  with transfers_feed as (
    select
      case
        when t.from_user_id = p_user_id then concat('transfer-sold-', t.id)
        else concat('transfer-purchased-', t.id)
      end::text as feed_id,
      case
        when t.from_user_id = p_user_id then 'sold'
        else 'purchased'
      end::text as event_type,
      t.autograph_id,
      creator.display_name as creator_name,
      a.creator_sequence_number,
      s.name as series_name,
      t.price_cents as amount_cents,
      t.transferred_at as event_at,
      null::text as status,
      null::uuid as offer_id,
      null::text as offer_role,
      null::timestamptz as expires_at,
      null::timestamptz as payment_due_at,
      null::uuid as accepted_transfer_id,
      null::uuid as personalized_request_id,
      null::text as request_role,
      null::text as recipient_name,
      null::text as inscription_text,
      null::uuid as completed_transfer_id,
      false as is_actionable
    from public.transfers t
    join public.autographs a on a.id = t.autograph_id
    join public.profiles creator on creator.id = a.creator_id
    left join public.series s on s.id = a.series_id
    where (t.from_user_id = p_user_id or t.to_user_id = p_user_id)
      and (
        p_before_event_at is null
        or t.transferred_at < p_before_event_at
        or (t.transferred_at = p_before_event_at and (
          case
            when t.from_user_id = p_user_id then concat('transfer-sold-', t.id)
            else concat('transfer-purchased-', t.id)
          end
        ) < p_before_feed_id)
      )
    order by t.transferred_at desc, feed_id desc
    limit v_limit
  ),
  offers_feed as (
    select
      concat('offer-', ao.id)::text as feed_id,
      case
        when ao.status = 'pending' and ao.owner_id = p_user_id then 'offer_received'
        when ao.status = 'pending' then 'offer_sent'
        when ao.status = 'accepted' then 'offer_accepted'
        when ao.status = 'on_hold' then 'offer_on_hold'
        when ao.status = 'declined' then 'offer_declined'
        when ao.status = 'withdrawn' then 'offer_withdrawn'
        else 'offer_expired'
      end::text as event_type,
      ao.autograph_id,
      creator.display_name as creator_name,
      a.creator_sequence_number,
      s.name as series_name,
      ao.amount_cents,
      coalesce(ao.responded_at, ao.created_at) as event_at,
      ao.status::text as status,
      ao.id as offer_id,
      case when ao.owner_id = p_user_id then 'owner' else 'buyer' end::text as offer_role,
      ao.expires_at,
      ao.payment_due_at,
      ao.accepted_transfer_id,
      null::uuid as personalized_request_id,
      null::text as request_role,
      null::text as recipient_name,
      null::text as inscription_text,
      null::uuid as completed_transfer_id,
      (
        ao.status = 'pending'
        or (ao.status = 'on_hold' and ao.buyer_id = p_user_id)
        or (ao.status = 'accepted' and ao.buyer_id = p_user_id and ao.accepted_transfer_id is null)
      ) as is_actionable
    from public.autograph_offers ao
    join public.autographs a on a.id = ao.autograph_id
    join public.profiles creator on creator.id = a.creator_id
    left join public.series s on s.id = a.series_id
    where (ao.owner_id = p_user_id or ao.buyer_id = p_user_id)
      and (
        p_before_event_at is null
        or coalesce(ao.responded_at, ao.created_at) < p_before_event_at
        or (
          coalesce(ao.responded_at, ao.created_at) = p_before_event_at
          and concat('offer-', ao.id) < p_before_feed_id
        )
      )
    order by coalesce(ao.responded_at, ao.created_at) desc, feed_id desc
    limit v_limit
  ),
  requests_feed as (
    select
      concat('personalized-', pr.id)::text as feed_id,
      case
        when pr.status = 'pending' and pr.creator_id = p_user_id then 'personalized_request_received'
        when pr.status = 'pending' then 'personalized_request_sent'
        when pr.status = 'countered' then 'personalized_request_countered'
        when pr.status = 'accepted' then 'personalized_request_accepted'
        when pr.status = 'declined' then 'personalized_request_declined'
        when pr.status = 'withdrawn' then 'personalized_request_withdrawn'
        when pr.status = 'expired' then 'personalized_request_expired'
        when pr.status = 'fulfilled' then 'personalized_request_fulfilled'
        else 'personalized_request_completed'
      end::text as event_type,
      pr.minted_autograph_id as autograph_id,
      creator.display_name as creator_name,
      minted.creator_sequence_number,
      null::text as series_name,
      pr.amount_cents,
      coalesce(pr.completed_at, pr.fulfilled_at, pr.responded_at, pr.created_at) as event_at,
      pr.status::text as status,
      null::uuid as offer_id,
      null::text as offer_role,
      pr.expires_at,
      pr.payment_due_at,
      null::uuid as accepted_transfer_id,
      pr.id as personalized_request_id,
      case when pr.creator_id = p_user_id then 'creator' else 'requester' end::text as request_role,
      pr.recipient_name,
      pr.inscription_text,
      pr.completed_transfer_id,
      (
        (pr.creator_id = p_user_id and pr.status in ('pending', 'accepted'))
        or (pr.requester_id = p_user_id and pr.status in ('pending', 'countered'))
        or (pr.requester_id = p_user_id and pr.status = 'fulfilled' and pr.completed_transfer_id is null)
      ) as is_actionable
    from public.personalized_autograph_requests pr
    join public.profiles creator on creator.id = pr.creator_id
    left join public.autographs minted on minted.id = pr.minted_autograph_id
    where (pr.creator_id = p_user_id or pr.requester_id = p_user_id)
      and (
        p_before_event_at is null
        or coalesce(pr.completed_at, pr.fulfilled_at, pr.responded_at, pr.created_at) < p_before_event_at
        or (
          coalesce(pr.completed_at, pr.fulfilled_at, pr.responded_at, pr.created_at) = p_before_event_at
          and concat('personalized-', pr.id) < p_before_feed_id
        )
      )
    order by coalesce(pr.completed_at, pr.fulfilled_at, pr.responded_at, pr.created_at) desc, feed_id desc
    limit v_limit
  ),
  all_events as (
    select * from transfers_feed
    union all
    select * from offers_feed
    union all
    select * from requests_feed
  )
  select
    all_events.feed_id,
    all_events.event_type,
    all_events.autograph_id,
    all_events.creator_name,
    all_events.creator_sequence_number,
    all_events.series_name,
    all_events.amount_cents,
    all_events.event_at,
    all_events.status,
    all_events.offer_id,
    all_events.offer_role,
    all_events.expires_at,
    all_events.payment_due_at,
    all_events.accepted_transfer_id,
    all_events.personalized_request_id,
    all_events.request_role,
    all_events.recipient_name,
    all_events.inscription_text,
    all_events.completed_transfer_id,
    all_events.is_actionable
  from all_events
  order by all_events.event_at desc, all_events.feed_id desc
  limit v_limit;
end;
$$;

grant execute on function public.get_activity_feed(uuid, integer, timestamptz, text) to authenticated;
