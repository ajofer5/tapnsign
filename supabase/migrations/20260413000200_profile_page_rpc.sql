-- Public RPC for profile page stats.
-- Returns profile info + computed stats in one round-trip.
-- Security definer so anon (web) and authenticated users can both call it.

create or replace function public.get_profile_page(p_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile        public.profiles%rowtype;
  v_is_creator     boolean;
  v_autographs_signed   bigint;
  v_unique_series_signed bigint;
  v_gold_signed    bigint;
  v_autographs_owned    bigint;
  v_unique_creators     bigint;
  v_unique_series_owned bigint;
  v_active_listings     jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return null;
  end if;

  v_is_creator := v_profile.role = 'verified' and v_profile.verification_status = 'verified';

  -- Creator stats (autographs they signed)
  select
    count(*),
    count(distinct series_id) filter (where series_id is not null),
    count(*) filter (where stroke_color = '#C9A84C')
  into v_autographs_signed, v_unique_series_signed, v_gold_signed
  from public.autographs
  where celebrity_id = p_user_id and status = 'active';

  -- Collector stats (autographs they own, excluding self-signed)
  select
    count(*),
    count(distinct celebrity_id) filter (where celebrity_id <> p_user_id),
    count(distinct series_id) filter (where series_id is not null)
  into v_autographs_owned, v_unique_creators, v_unique_series_owned
  from public.autographs
  where owner_id = p_user_id and status = 'active';

  -- Active listings (for sale or open to trade) — cap at 20 for the profile page
  select coalesce(jsonb_agg(l order by l.created_at desc), '[]'::jsonb)
  into v_active_listings
  from (
    select
      a.id,
      a.certificate_id,
      a.created_at,
      a.is_for_sale,
      a.open_to_trade,
      a.listing_type,
      a.price_cents,
      a.reserve_price_cents,
      a.auction_ends_at,
      a.thumbnail_url,
      a.stroke_color,
      p.display_name as celebrity_name,
      p.verified as celebrity_verified
    from public.autographs a
    join public.profiles p on p.id = a.celebrity_id
    where a.owner_id = p_user_id
      and a.status = 'active'
      and (a.is_for_sale = true or a.open_to_trade = true)
    limit 20
  ) l;

  return jsonb_build_object(
    'id',               v_profile.id,
    'display_name',     v_profile.display_name,
    'role',             v_profile.role,
    'verified',         v_profile.verified,
    'member_since',     v_profile.created_at,
    'is_creator',       v_is_creator,
    'stats', jsonb_build_object(
      'autographs_signed',    v_autographs_signed,
      'unique_series_signed', v_unique_series_signed,
      'gold_signed',          v_gold_signed,
      'autographs_owned',     v_autographs_owned,
      'unique_creators',      v_unique_creators,
      'unique_series_owned',  v_unique_series_owned
    ),
    'active_listings', v_active_listings
  );
end;
$$;

grant execute on function public.get_profile_page(uuid) to anon, authenticated;
