create table if not exists public.interest_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  autograph_id uuid null references public.autographs(id) on delete cascade,
  creator_id uuid null references public.profiles(id) on delete cascade,
  series_id uuid null references public.series(id) on delete set null,
  event_type text not null check (event_type in ('view_autograph', 'view_profile', 'offer_sent', 'purchase_completed')),
  created_at timestamptz not null default now()
);

create index if not exists interest_events_user_created_idx
  on public.interest_events (user_id, created_at desc);

create index if not exists interest_events_user_event_created_idx
  on public.interest_events (user_id, event_type, created_at desc);

create index if not exists interest_events_autograph_created_idx
  on public.interest_events (autograph_id, created_at desc)
  where autograph_id is not null;

create index if not exists interest_events_creator_created_idx
  on public.interest_events (creator_id, created_at desc)
  where creator_id is not null;

alter table public.interest_events enable row level security;

drop policy if exists "interest events insert own" on public.interest_events;

create policy "interest events insert own"
  on public.interest_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "interest events select own" on public.interest_events;

create policy "interest events select own"
  on public.interest_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.log_interest_event(
  p_event_type text,
  p_autograph_id uuid default null,
  p_creator_id uuid default null,
  p_series_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_autograph_creator_id uuid;
  v_autograph_series_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_event_type not in ('view_autograph', 'view_profile', 'offer_sent', 'purchase_completed') then
    raise exception 'Unsupported event type';
  end if;

  if p_autograph_id is not null then
    select a.creator_id, a.series_id
      into v_autograph_creator_id, v_autograph_series_id
    from public.autographs a
    where a.id = p_autograph_id;
  end if;

  insert into public.interest_events (
    user_id,
    autograph_id,
    creator_id,
    series_id,
    event_type
  )
  values (
    v_user_id,
    p_autograph_id,
    coalesce(p_creator_id, v_autograph_creator_id),
    coalesce(p_series_id, v_autograph_series_id),
    p_event_type
  );
end;
$$;

grant execute on function public.log_interest_event(text, uuid, uuid, uuid) to authenticated;

create or replace function public.get_marketplace_recommendations(p_limit integer default 8)
returns table (
  autograph_id uuid,
  score numeric
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ),
  candidate_autographs as (
    select
      a.id,
      a.creator_id,
      a.series_id,
      a.created_at
    from public.autographs a
    cross join viewer v
    where a.status = 'active'
      and a.visibility = 'public'
      and a.sale_state = 'fixed'
      and a.owner_id <> v.user_id
      and not exists (
        select 1
        from public.autograph_offers ao
        where ao.autograph_id = a.id
          and ao.status = 'accepted'
          and ao.accepted_transfer_id is null
          and ao.payment_due_at > now()
      )
      and not exists (
        select 1
        from public.transfers t
        where t.autograph_id = a.id
          and t.to_user_id = v.user_id
      )
      and not exists (
        select 1
        from public.autograph_offers own_offer
        where own_offer.autograph_id = a.id
          and own_offer.buyer_id = v.user_id
          and own_offer.status in ('pending', 'accepted')
      )
  ),
  recent_events as (
    select
      ie.user_id,
      ie.autograph_id,
      ie.creator_id,
      ie.series_id,
      ie.event_type,
      ie.created_at,
      greatest(0.25, exp(-extract(epoch from (now() - ie.created_at)) / 2592000.0)) as recency_weight
    from public.interest_events ie
    join viewer v on v.user_id = ie.user_id
    where ie.created_at > now() - interval '120 days'
  ),
  creator_affinity as (
    select
      re.creator_id,
      sum(
        case re.event_type
          when 'purchase_completed' then 12
          when 'offer_sent' then 8
          when 'view_profile' then 4
          when 'view_autograph' then 3
          else 0
        end * re.recency_weight
      ) as score
    from recent_events re
    where re.creator_id is not null
    group by re.creator_id
  ),
  series_affinity as (
    select
      re.series_id,
      sum(
        case re.event_type
          when 'purchase_completed' then 6
          when 'offer_sent' then 5
          when 'view_autograph' then 2
          else 0
        end * re.recency_weight
      ) as score
    from recent_events re
    where re.series_id is not null
    group by re.series_id
  ),
  autograph_affinity as (
    select
      re.autograph_id,
      sum(
        case re.event_type
          when 'purchase_completed' then 0
          when 'offer_sent' then 4
          when 'view_autograph' then 3
          else 0
        end * re.recency_weight
      ) as score
    from recent_events re
    where re.autograph_id is not null
    group by re.autograph_id
  ),
  trending as (
    select
      ie.autograph_id,
      sum(
        case ie.event_type
          when 'purchase_completed' then 7
          when 'offer_sent' then 5
          when 'view_autograph' then 1
          else 0
        end
      ) as score
    from public.interest_events ie
    where ie.autograph_id is not null
      and ie.created_at > now() - interval '21 days'
    group by ie.autograph_id
  )
  select
    c.id as autograph_id,
    (
      coalesce(ca.score, 0) +
      coalesce(sa.score, 0) +
      coalesce(aa.score, 0) +
      coalesce(tr.score, 0) +
      greatest(0, 2 - extract(epoch from (now() - c.created_at)) / 1209600.0)
    )::numeric as score
  from candidate_autographs c
  left join creator_affinity ca on ca.creator_id = c.creator_id
  left join series_affinity sa on sa.series_id = c.series_id
  left join autograph_affinity aa on aa.autograph_id = c.id
  left join trending tr on tr.autograph_id = c.id
  order by score desc, c.created_at desc
  limit greatest(coalesce(p_limit, 8), 1);
$$;

grant execute on function public.get_marketplace_recommendations(integer) to authenticated;
