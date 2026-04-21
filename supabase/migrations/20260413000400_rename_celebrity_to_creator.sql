-- Rename celebrity → creator throughout the schema.
-- Covers: column renames, table rename, index renames, trigger function,
-- guard functions, RLS policies, and stored procedures.

-- ─── 1. Column renames ────────────────────────────────────────────────────────

alter table public.autographs
  rename column celebrity_id to creator_id;

alter table public.autographs
  rename column celebrity_sequence_number to creator_sequence_number;

alter table public.series
  rename column celebrity_id to creator_id;

alter table public.celebrity_sequence_counters
  rename column celebrity_id to creator_id;

-- ─── 2. Table rename ──────────────────────────────────────────────────────────

alter table public.celebrity_sequence_counters
  rename to creator_sequence_counters;

-- ─── 3. Index renames ─────────────────────────────────────────────────────────

alter index if exists autographs_celebrity_created_at_idx
  rename to autographs_creator_created_at_idx;

alter index if exists autographs_celebrity_sequence_idx
  rename to autographs_creator_sequence_idx;

alter index if exists series_celebrity_created_at_idx
  rename to series_creator_created_at_idx;

-- ─── 4. Trigger function: assign_creator_sequence_number ──────────────────────

create or replace function public.assign_creator_sequence_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_seq integer;
begin
  insert into public.creator_sequence_counters (creator_id, last_sequence_number)
  values (NEW.creator_id, 1)
  on conflict (creator_id) do update
    set last_sequence_number = creator_sequence_counters.last_sequence_number + 1
  returning last_sequence_number into v_next_seq;

  NEW.creator_sequence_number = v_next_seq;
  return NEW;
end;
$$;

-- Swap the trigger to the new function
drop trigger if exists assign_autograph_sequence_number on public.autographs;
create trigger assign_autograph_sequence_number
  before insert on public.autographs
  for each row execute function public.assign_creator_sequence_number();

-- Drop old function now that trigger is swapped
drop function if exists public.assign_celebrity_sequence_number();

-- ─── 5. Guard trigger: autograph insert ───────────────────────────────────────

create or replace function public.guard_autograph_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if new.creator_id <> auth.uid() or new.owner_id <> auth.uid() then
    raise exception 'autograph creator and owner must match the signed-in user';
  end if;

  if new.status <> 'active' then
    raise exception 'status is backend-only';
  end if;

  if new.ownership_source <> 'capture' then
    raise exception 'ownership source is backend-only';
  end if;

  if new.is_for_sale then
    raise exception 'client-created autographs cannot be listed immediately';
  end if;

  if new.open_to_trade then
    raise exception 'client-created autographs cannot be open to trade immediately';
  end if;

  if new.listing_type is not null then
    raise exception 'listing type is backend-only';
  end if;

  if new.price_cents is not null or new.reserve_price_cents is not null or new.auction_ends_at is not null then
    raise exception 'listing fields are backend-only';
  end if;

  if new.latest_transfer_id is not null or new.media_asset_id is not null then
    raise exception 'provenance pointers are backend-only';
  end if;

  new.certificate_id := public.generate_certificate_id();
  return new;
end;
$$;

-- ─── 6. RLS policy updates ────────────────────────────────────────────────────

-- profiles: anon select (certificate related)
drop policy if exists "profiles_select_public_certificate_related" on public.profiles;
create policy "profiles_select_public_certificate_related"
on public.profiles
for select
to anon
using (
  exists (
    select 1
    from public.autographs a
    where a.status = 'active'
      and a.certificate_id is not null
      and (a.creator_id = profiles.id or a.owner_id = profiles.id)
  )
);

-- autographs: select by creator
drop policy if exists "autographs_select_creator" on public.autographs;
create policy "autographs_select_creator"
on public.autographs
for select
to authenticated
using (auth.uid() = creator_id);

-- autographs: insert
drop policy if exists "autographs_insert_own_capture" on public.autographs;
create policy "autographs_insert_own_capture"
on public.autographs
for insert
to authenticated
with check (
  auth.uid() = creator_id
  and auth.uid() = owner_id
  and status = 'active'
  and ownership_source = 'capture'
  and is_for_sale = false
  and open_to_trade = false
  and listing_type is null
  and price_cents is null
  and reserve_price_cents is null
  and auction_ends_at is null
);

-- media_assets: select by creator or owner
drop policy if exists "media_assets_select_owner" on public.media_assets;
create policy "media_assets_select_owner"
on public.media_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.autographs a
    where a.id = media_assets.autograph_id
      and (a.owner_id = auth.uid() or a.creator_id = auth.uid())
  )
);

-- series: insert own
drop policy if exists "series_insert_own" on public.series;
create policy "series_insert_own"
on public.series
for insert
to authenticated
with check (creator_id = auth.uid());

-- series: delete own
drop policy if exists "series_delete_own" on public.series;
create policy "series_delete_own"
on public.series
for delete
to authenticated
using (creator_id = auth.uid());

-- ─── 7. Update get_provenance_chain RPC ───────────────────────────────────────

drop function if exists public.get_provenance_chain(text);

create or replace function public.get_provenance_chain(p_certificate_id text)
returns table (
  event_order  integer,
  event_type   text,
  event_date   timestamptz,
  price_cents  integer,
  from_label   text,
  to_label     text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_autograph_id  uuid;
  v_creator_id    uuid;
  v_creator_name  text;
  v_created_at    timestamptz;
begin
  select a.id, a.creator_id, p.display_name, a.created_at
  into v_autograph_id, v_creator_id, v_creator_name, v_created_at
  from public.autographs a
  join public.profiles p on p.id = a.creator_id
  where a.certificate_id = p_certificate_id
    and a.status = 'active';

  if not found then
    return;
  end if;

  return query
  select
    0                   as event_order,
    'signed'::text      as event_type,
    v_created_at        as event_date,
    null::integer       as price_cents,
    null::text          as from_label,
    v_creator_name      as to_label;

  return query
  select
    (row_number() over (order by t.transferred_at))::integer as event_order,
    t.transfer_type::text                                     as event_type,
    t.transferred_at                                          as event_date,
    t.price_cents,
    case
      when t.from_user_id = v_creator_id then fp.display_name
      when fp.history_privacy = 'anonymous' then 'Anonymous Collector'
      else fp.display_name
    end as from_label,
    case
      when tp.history_privacy = 'anonymous' then 'Anonymous Collector'
      else tp.display_name
    end as to_label
  from public.transfers t
  left join public.profiles fp on fp.id = t.from_user_id
  left join public.profiles tp on tp.id = t.to_user_id
  where t.autograph_id = v_autograph_id
  order by t.transferred_at;
end;
$$;

grant execute on function public.get_provenance_chain(text) to anon, authenticated;

-- ─── 8. Update get_profile_page RPC ──────────────────────────────────────────

create or replace function public.get_profile_page(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile       public.profiles%rowtype;
  v_stats         jsonb;
  v_listings      jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then return null; end if;

  -- Creator stats (only for verified creators)
  if v_profile.role = 'verified' and v_profile.verified then
    select jsonb_build_object(
      'autographs_signed',    count(*) filter (where creator_id = p_user_id),
      'unique_series_signed', count(distinct series_id) filter (where creator_id = p_user_id and series_id is not null),
      'gold_signed',          count(*) filter (where creator_id = p_user_id and stroke_color = '#C9A84C'),
      'autographs_owned',     count(*) filter (where owner_id = p_user_id),
      'unique_creators',      count(distinct creator_id) filter (where owner_id = p_user_id and creator_id <> p_user_id),
      'unique_series_owned',  count(distinct series_id) filter (where owner_id = p_user_id and series_id is not null)
    )
    into v_stats
    from public.autographs
    where status = 'active'
      and (creator_id = p_user_id or owner_id = p_user_id);
  else
    select jsonb_build_object(
      'autographs_signed',    0,
      'unique_series_signed', 0,
      'gold_signed',          0,
      'autographs_owned',     count(*) filter (where owner_id = p_user_id),
      'unique_creators',      count(distinct creator_id) filter (where owner_id = p_user_id),
      'unique_series_owned',  count(distinct series_id) filter (where owner_id = p_user_id and series_id is not null)
    )
    into v_stats
    from public.autographs
    where status = 'active'
      and owner_id = p_user_id;
  end if;

  -- Active listings (capped at 20)
  select jsonb_agg(row)
  into v_listings
  from (
    select jsonb_build_object(
      'id',                 a.id,
      'certificate_id',     a.certificate_id,
      'created_at',         a.created_at,
      'is_for_sale',        a.is_for_sale,
      'open_to_trade',      a.open_to_trade,
      'listing_type',       a.listing_type,
      'price_cents',        a.price_cents,
      'reserve_price_cents',a.reserve_price_cents,
      'auction_ends_at',    a.auction_ends_at,
      'thumbnail_url',      a.thumbnail_url,
      'stroke_color',       a.stroke_color,
      'creator_name',       p.display_name,
      'creator_verified',   p.verified
    ) as row
    from public.autographs a
    join public.profiles p on p.id = a.creator_id
    where a.owner_id = p_user_id
      and a.status = 'active'
      and (a.is_for_sale = true or a.open_to_trade = true)
    order by a.created_at desc
    limit 20
  ) sub;

  return jsonb_build_object(
    'id',             v_profile.id,
    'display_name',   v_profile.display_name,
    'role',           v_profile.role,
    'verified',       v_profile.verified,
    'member_since',   v_profile.created_at,
    'is_creator',     v_profile.role = 'verified' and v_profile.verified,
    'stats',          coalesce(v_stats, '{}'::jsonb),
    'active_listings', coalesce(v_listings, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_profile_page(uuid) to authenticated;
