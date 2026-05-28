alter table public.autographs
  add column if not exists preview_frame_times_ms integer[] not null default '{}'::integer[];

update public.autographs
set preview_frame_times_ms = array[1000, 2550, 4100, 5650, 7050]
where coalesce(array_length(preview_frame_urls, 1), 0) = 5
  and coalesce(array_length(preview_frame_times_ms, 1), 0) = 0;

update public.autographs
set preview_frame_times_ms = array[1000, 1550, 2100, 2650, 3200, 3750, 4300, 4850, 5400, 5950, 6500, 7050]
where coalesce(array_length(preview_frame_urls, 1), 0) = 12
  and coalesce(array_length(preview_frame_times_ms, 1), 0) = 0;

drop function if exists public.get_owned_listing_feed(uuid, integer, timestamptz, uuid);

create or replace function public.get_owned_listing_feed(
  p_owner_id uuid,
  p_limit integer default 24,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  certificate_id text,
  created_at timestamptz,
  creator_id uuid,
  owner_id uuid,
  sale_state text,
  listing_mode text,
  price_cents integer,
  video_url text,
  thumbnail_url text,
  preview_frame_urls text[],
  preview_frame_times_ms integer[],
  strokes_json jsonb,
  creator_sequence_number integer,
  series_sequence_number integer,
  capture_width integer,
  capture_height integer,
  stroke_color text,
  creator_display_name text,
  creator_verified boolean,
  owner_display_name text,
  series_name text,
  series_max_size integer,
  offer_locked_until timestamptz,
  is_for_sale boolean,
  auto_decline_below boolean,
  auto_accept_above boolean,
  print_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.certificate_id,
    a.created_at,
    a.creator_id,
    a.owner_id,
    a.sale_state,
    a.listing_mode,
    a.price_cents,
    a.video_url,
    a.thumbnail_url,
    a.preview_frame_urls,
    a.preview_frame_times_ms,
    a.strokes_json,
    a.creator_sequence_number,
    a.series_sequence_number,
    a.capture_width,
    a.capture_height,
    a.stroke_color,
    creator.display_name as creator_display_name,
    creator.verified as creator_verified,
    owner.display_name as owner_display_name,
    s.name as series_name,
    s.max_size as series_max_size,
    lock_offer.payment_due_at as offer_locked_until,
    a.is_for_sale,
    a.auto_decline_below,
    a.auto_accept_above,
    coalesce(print_counts.total_print_count, 0) as print_count
  from public.autographs a
  join public.profiles creator on creator.id = a.creator_id
  join public.profiles owner on owner.id = a.owner_id
  left join public.series s on s.id = a.series_id
  left join lateral (
    select ao.payment_due_at
    from public.autograph_offers ao
    where ao.autograph_id = a.id
      and ao.status = 'accepted'
      and ao.accepted_transfer_id is null
      and ao.payment_due_at > now()
    order by ao.payment_due_at desc
    limit 1
  ) lock_offer on true
  left join lateral (
    select count(*)::integer as total_print_count
    from public.autograph_prints ap
    where ap.autograph_id = a.id
  ) print_counts on true
  where a.owner_id = p_owner_id
    and a.status = 'active'
    and (
      p_before_created_at is null
      or p_before_id is null
      or (a.created_at, a.id) < (p_before_created_at, p_before_id)
    )
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

grant execute on function public.get_owned_listing_feed(uuid, integer, timestamptz, uuid) to authenticated;

drop function if exists public.get_marketplace_feed(integer, timestamptz, uuid, uuid);

create or replace function public.get_marketplace_feed(
  p_limit integer default 24,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_viewer_id uuid default null
)
returns table (
  id uuid,
  certificate_id text,
  created_at timestamptz,
  creator_id uuid,
  owner_id uuid,
  sale_state text,
  listing_mode text,
  price_cents integer,
  video_url text,
  thumbnail_url text,
  preview_frame_urls text[],
  preview_frame_times_ms integer[],
  strokes_json jsonb,
  template_id text,
  creator_sequence_number integer,
  series_sequence_number integer,
  capture_width integer,
  capture_height integer,
  stroke_color text,
  creator_display_name text,
  creator_verified boolean,
  creator_name_verified boolean,
  owner_display_name text,
  series_name text,
  series_max_size integer,
  offer_locked_until timestamptz,
  print_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.certificate_id,
    a.created_at,
    a.creator_id,
    a.owner_id,
    a.sale_state,
    a.listing_mode,
    a.price_cents,
    a.video_url,
    a.thumbnail_url,
    a.preview_frame_urls,
    a.preview_frame_times_ms,
    a.strokes_json,
    a.template_id,
    a.creator_sequence_number,
    a.series_sequence_number,
    a.capture_width,
    a.capture_height,
    a.stroke_color,
    creator.display_name as creator_display_name,
    creator.verified as creator_verified,
    creator.name_verified as creator_name_verified,
    owner.display_name as owner_display_name,
    s.name as series_name,
    s.max_size as series_max_size,
    locked_offer.payment_due_at as offer_locked_until,
    coalesce(print_counts.total_print_count, 0) as print_count
  from public.autographs a
  join public.profiles creator on creator.id = a.creator_id
  join public.profiles owner on owner.id = a.owner_id
  left join public.series s on s.id = a.series_id
  left join lateral (
    select ao.payment_due_at
    from public.autograph_offers ao
    where ao.autograph_id = a.id
      and ao.status = 'accepted'
      and ao.accepted_transfer_id is null
      and ao.payment_due_at > now()
    order by ao.payment_due_at desc
    limit 1
  ) locked_offer on true
  left join lateral (
    select count(*)::integer as total_print_count
    from public.autograph_prints ap
    where ap.autograph_id = a.id
  ) print_counts on true
  where a.status = 'active'
    and a.visibility = 'public'
    and a.sale_state = 'fixed'
    and (
      p_before_created_at is null
      or p_before_id is null
      or (a.created_at, a.id) < (p_before_created_at, p_before_id)
    )
    and not exists (
      select 1
      from public.blocked_users bu
      where (bu.blocker_id = coalesce(p_viewer_id, auth.uid()) and bu.blocked_user_id = a.owner_id)
         or (bu.blocker_id = a.owner_id and bu.blocked_user_id = coalesce(p_viewer_id, auth.uid()))
    )
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

grant execute on function public.get_marketplace_feed(integer, timestamptz, uuid, uuid) to authenticated, anon;

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
  v_first_verified_at timestamptz;
  v_creator_since timestamptz;
  v_public_videos_count bigint;
  v_avatar_url text;
  v_avatar_autograph jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return null;
  end if;

  select min(created_at)
    into v_first_verified_at
    from public.verification_events
   where user_id = p_user_id
     and status = 'verified';

  select min(created_at)
    into v_creator_since
    from public.autographs
   where creator_id = p_user_id;

  select count(*)
    into v_public_videos_count
    from public.autographs
   where owner_id = p_user_id
     and status = 'active'
     and visibility = 'public'
     and sale_state = 'fixed';

  select
    a.thumbnail_url,
    jsonb_build_object(
      'id', a.id,
      'thumbnail_url', a.thumbnail_url,
      'video_url', a.video_url,
      'strokes_json', a.strokes_json,
      'capture_width', a.capture_width,
      'capture_height', a.capture_height,
      'stroke_color', a.stroke_color
    )
    into v_avatar_url, v_avatar_autograph
    from public.autographs a
   where a.id = v_profile.profile_avatar_autograph_id
     and a.creator_id = p_user_id
     and a.status = 'active';

  if v_profile.role = 'verified' and v_profile.verified then
    select jsonb_build_object(
      'autographs_signed',    (select count(*) from public.autographs where creator_id = p_user_id),
      'unique_series_signed', (select count(distinct series_id) from public.autographs where creator_id = p_user_id and series_id is not null),
      'gold_signed',          (select count(*) from public.autographs where creator_id = p_user_id and stroke_color = '#C9A84C'),
      'autographs_owned',     count(*) filter (where owner_id = p_user_id),
      'unique_creators',      count(distinct creator_id) filter (where owner_id = p_user_id and creator_id <> p_user_id),
      'unique_series_owned',  count(distinct series_id) filter (where owner_id = p_user_id and series_id is not null),
      'public_videos_count',  v_public_videos_count
    )
    into v_stats
    from public.autographs
    where status = 'active'
      and owner_id = p_user_id;
  else
    select jsonb_build_object(
      'autographs_signed',    (select count(*) from public.autographs where creator_id = p_user_id),
      'unique_series_signed', (select count(distinct series_id) from public.autographs where creator_id = p_user_id and series_id is not null),
      'gold_signed',          (select count(*) from public.autographs where creator_id = p_user_id and stroke_color = '#C9A84C'),
      'autographs_owned',     count(*) filter (where owner_id = p_user_id),
      'unique_creators',      count(distinct creator_id) filter (where owner_id = p_user_id),
      'unique_series_owned',  count(distinct series_id) filter (where owner_id = p_user_id and series_id is not null),
      'public_videos_count',  v_public_videos_count
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
      'id',                      a.id,
      'creator_id',              a.creator_id,
      'owner_id',                a.owner_id,
      'certificate_id',          a.certificate_id,
      'created_at',              a.created_at,
      'visibility',              a.visibility,
      'sale_state',              a.sale_state,
      'listing_mode',            a.listing_mode,
      'is_for_sale',             a.is_for_sale,
      'listing_type',            a.listing_type,
      'price_cents',             a.price_cents,
      'reserve_price_cents',     a.reserve_price_cents,
      'auction_ends_at',         a.auction_ends_at,
      'thumbnail_url',           a.thumbnail_url,
      'video_url',               a.video_url,
      'preview_frame_urls',      a.preview_frame_urls,
      'preview_frame_times_ms',  a.preview_frame_times_ms,
      'strokes_json',            a.strokes_json,
      'capture_width',           a.capture_width,
      'capture_height',          a.capture_height,
      'stroke_color',            a.stroke_color,
      'template_id',             a.template_id,
      'creator_name',            p.display_name,
      'creator_verified',        p.verified,
      'creator_name_verified',   p.name_verified,
      'creator_sequence_number', a.creator_sequence_number,
      'series_name',             s.name,
      'series_sequence_number',  a.series_sequence_number,
      'series_max_size',         s.max_size,
      'owner_name',              owner_profile.display_name,
      'print_count',             (
        select count(*)::int
        from public.autograph_prints ap
        where ap.autograph_id = a.id
      ),
      'offer_locked_until',      locked_offer.payment_due_at
    ) as row
    from public.autographs a
    join public.profiles p on p.id = a.creator_id
    join public.profiles owner_profile on owner_profile.id = a.owner_id
    left join public.series s on s.id = a.series_id
    left join lateral (
      select ao.payment_due_at
      from public.autograph_offers ao
      where ao.autograph_id = a.id
        and ao.status = 'accepted'
        and ao.accepted_transfer_id is null
        and ao.payment_due_at > now()
      order by ao.payment_due_at desc
      limit 1
    ) locked_offer on true
    where a.owner_id = p_user_id
      and a.status = 'active'
      and a.visibility = 'public'
      and a.sale_state = 'fixed'
    order by a.created_at desc
    limit 20
  ) sub;

  return jsonb_build_object(
    'id',                            v_profile.id,
    'display_name',                  v_profile.display_name,
    'bio',                           v_profile.bio,
    'avatar_url',                    coalesce(v_avatar_url, v_profile.avatar_url),
    'avatar_autograph',              v_avatar_autograph,
    'profile_avatar_autograph_id',   v_profile.profile_avatar_autograph_id,
    'instagram_handle',              v_profile.instagram_handle,
    'instagram_status',              v_profile.instagram_status,
    'instagram_verified_at',         v_profile.instagram_verified_at,
    'personalized_requests_enabled', v_profile.personalized_requests_enabled,
    'personalized_min_price_cents',  v_profile.personalized_min_price_cents,
    'role',                          v_profile.role,
    'verified',                      v_profile.verified,
    'name_verified',                 v_profile.name_verified,
    'verification_status',           v_profile.verification_status,
    'member_since',                  v_profile.created_at,
    'first_verified_at',             v_first_verified_at,
    'creator_since',                 v_creator_since,
    'is_creator',                    v_profile.role = 'verified' and v_profile.verified,
    'stats',                         coalesce(v_stats, '{}'::jsonb),
    'public_videos',                 v_public_videos,
    'active_listings',               v_public_videos
  );
end;
$$;

grant execute on function public.get_profile_page(uuid) to authenticated;

drop function if exists public.get_public_certificate(text);

create or replace function public.get_public_certificate(p_certificate_id text)
returns table (
  certificate_id text,
  created_at timestamptz,
  content_hash text,
  video_url text,
  thumbnail_url text,
  preview_frame_urls text[],
  preview_frame_times_ms integer[],
  strokes_json jsonb,
  capture_width integer,
  capture_height integer,
  stroke_color text,
  template_id text,
  is_for_sale boolean,
  price_cents integer,
  creator_name text,
  creator_verified boolean,
  owner_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    a.certificate_id,
    a.created_at,
    a.content_hash,
    a.video_url,
    a.thumbnail_url,
    a.preview_frame_urls,
    a.preview_frame_times_ms,
    a.strokes_json,
    a.capture_width,
    a.capture_height,
    a.stroke_color,
    a.template_id,
    a.is_for_sale,
    a.price_cents,
    cp.display_name as creator_name,
    cp.verified as creator_verified,
    op.display_name as owner_name
  from public.autographs a
  join public.profiles cp on cp.id = a.creator_id
  join public.profiles op on op.id = a.owner_id
  where upper(replace(a.certificate_id::text, '-', '')) = upper(replace(p_certificate_id, '-', ''))
    and a.status = 'active'
  limit 1;
$$;

grant execute on function public.get_public_certificate(text) to anon, authenticated;
