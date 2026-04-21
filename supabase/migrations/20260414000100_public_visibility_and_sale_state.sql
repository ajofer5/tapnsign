-- Add explicit public/private visibility and sale state for autographs.
-- Keep legacy listing columns in place for compatibility while the app migrates.

do $$
begin
  create type public.autograph_visibility as enum ('private', 'public');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.autograph_sale_state as enum ('not_for_sale', 'fixed', 'auction');
exception
  when duplicate_object then null;
end $$;

alter table public.autographs
  add column if not exists visibility public.autograph_visibility not null default 'private',
  add column if not exists sale_state public.autograph_sale_state not null default 'not_for_sale';

update public.autographs
set
  visibility = case
    when is_for_sale = true then 'public'::public.autograph_visibility
    else 'private'::public.autograph_visibility
  end,
  sale_state = case
    when is_for_sale = true and listing_type = 'fixed' then 'fixed'::public.autograph_sale_state
    when is_for_sale = true and listing_type = 'auction' then 'auction'::public.autograph_sale_state
    else 'not_for_sale'::public.autograph_sale_state
  end
where visibility is distinct from case
    when is_for_sale = true then 'public'::public.autograph_visibility
    else 'private'::public.autograph_visibility
  end
   or sale_state is distinct from case
    when is_for_sale = true and listing_type = 'fixed' then 'fixed'::public.autograph_sale_state
    when is_for_sale = true and listing_type = 'auction' then 'auction'::public.autograph_sale_state
    else 'not_for_sale'::public.autograph_sale_state
  end;

create or replace function public.sync_autograph_public_state()
returns trigger
language plpgsql
as $$
begin
  -- Legacy listing writes still drive the new model.
  if new.is_for_sale = true and new.listing_type = 'fixed' then
    new.visibility := 'public';
    new.sale_state := 'fixed';
    new.reserve_price_cents := null;
    new.auction_ends_at := null;
    new.open_to_trade := false;
    return new;
  end if;

  if new.is_for_sale = true and new.listing_type = 'auction' then
    new.visibility := 'public';
    new.sale_state := 'auction';
    new.price_cents := null;
    new.open_to_trade := false;
    return new;
  end if;

  -- New model writes normalize the legacy listing fields.
  if new.sale_state = 'fixed' then
    new.visibility := 'public';
    new.is_for_sale := true;
    new.listing_type := 'fixed';
    new.reserve_price_cents := null;
    new.auction_ends_at := null;
    new.open_to_trade := false;
    return new;
  end if;

  if new.sale_state = 'auction' then
    new.visibility := 'public';
    new.is_for_sale := true;
    new.listing_type := 'auction';
    new.price_cents := null;
    new.open_to_trade := false;
    return new;
  end if;

  new.sale_state := 'not_for_sale';
  new.is_for_sale := false;
  new.listing_type := null;
  new.price_cents := null;
  new.reserve_price_cents := null;
  new.auction_ends_at := null;
  return new;
end;
$$;

drop trigger if exists sync_autograph_public_state on public.autographs;
create trigger sync_autograph_public_state
  before insert or update on public.autographs
  for each row execute function public.sync_autograph_public_state();

create index if not exists autographs_visibility_sale_state_idx
  on public.autographs (visibility, sale_state, created_at desc);

create or replace function public.get_profile_page(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_stats jsonb;
  v_public_videos jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return null;
  end if;

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

  select coalesce(jsonb_agg(row), '[]'::jsonb)
  into v_public_videos
  from (
    select jsonb_build_object(
      'id',                  a.id,
      'certificate_id',      a.certificate_id,
      'created_at',          a.created_at,
      'visibility',          a.visibility,
      'sale_state',          a.sale_state,
      'is_for_sale',         a.is_for_sale,
      'listing_type',        a.listing_type,
      'price_cents',         a.price_cents,
      'reserve_price_cents', a.reserve_price_cents,
      'auction_ends_at',     a.auction_ends_at,
      'thumbnail_url',       a.thumbnail_url,
      'stroke_color',        a.stroke_color,
      'creator_name',        p.display_name,
      'creator_verified',    p.verified
    ) as row
    from public.autographs a
    join public.profiles p on p.id = a.creator_id
    where a.owner_id = p_user_id
      and a.status = 'active'
      and a.visibility = 'public'
    order by a.created_at desc
    limit 20
  ) sub;

  return jsonb_build_object(
    'id',              v_profile.id,
    'display_name',    v_profile.display_name,
    'role',            v_profile.role,
    'verified',        v_profile.verified,
    'member_since',    v_profile.created_at,
    'is_creator',      v_profile.role = 'verified' and v_profile.verified,
    'stats',           coalesce(v_stats, '{}'::jsonb),
    'public_videos',   v_public_videos,
    'active_listings', v_public_videos
  );
end;
$$;

grant execute on function public.get_profile_page(uuid) to authenticated;
