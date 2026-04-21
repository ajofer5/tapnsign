-- Expand profile public video metadata so profile cards can match marketplace presentation.

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
      'id',                     a.id,
      'certificate_id',         a.certificate_id,
      'created_at',             a.created_at,
      'visibility',             a.visibility,
      'sale_state',             a.sale_state,
      'is_for_sale',            a.is_for_sale,
      'listing_type',           a.listing_type,
      'price_cents',            a.price_cents,
      'reserve_price_cents',    a.reserve_price_cents,
      'auction_ends_at',        a.auction_ends_at,
      'thumbnail_url',          a.thumbnail_url,
      'video_url',              a.video_url,
      'strokes_json',           a.strokes_json,
      'capture_width',          a.capture_width,
      'capture_height',         a.capture_height,
      'stroke_color',           a.stroke_color,
      'creator_name',           p.display_name,
      'creator_verified',       p.verified,
      'creator_sequence_number', a.creator_sequence_number,
      'series_name',            s.name,
      'series_sequence_number', a.series_sequence_number,
      'series_max_size',        s.max_size,
      'owner_name',             owner_profile.display_name
    ) as row
    from public.autographs a
    join public.profiles p on p.id = a.creator_id
    join public.profiles owner_profile on owner_profile.id = a.owner_id
    left join public.series s on s.id = a.series_id
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
