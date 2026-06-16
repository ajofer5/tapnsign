-- Add print_preview_url cache to autographs table so web profile/listing cards
-- can show the protected small preview instead of the full-resolution print
-- layout used for Prodigi fulfillment.

alter table public.autographs
  add column if not exists print_preview_url text;

comment on column public.autographs.print_preview_url is
  'Cached URL of the protected small print preview image for web/app display.';

-- Update the profile page RPC to include print_preview_url in listing objects.
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
    from public.autographs a
   where a.owner_id = p_user_id
     and a.status = 'active'
     and a.visibility = 'public'
     and a.prints_enabled = true
     and (
       a.print_limit is null
       or (select count(*) from public.autograph_prints ap where ap.autograph_id = a.id) < a.print_limit
     );

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

  if v_profile.is_creator then
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
      'print_layout_url',        a.print_layout_url,
      'print_preview_url',       a.print_preview_url,
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
      'prints_enabled',          a.prints_enabled,
      'print_limit',             a.print_limit,
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
    left join lateral (
      select count(*)::int as total_print_count
      from public.autograph_prints ap
      where ap.autograph_id = a.id
    ) print_counts on true
    where a.owner_id = p_user_id
      and a.status = 'active'
      and a.visibility = 'public'
      and a.prints_enabled = true
      and (a.print_limit is null or print_counts.total_print_count < a.print_limit)
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
    'is_creator',                    v_profile.is_creator,
    'stats',                         coalesce(v_stats, '{}'::jsonb),
    'public_videos',                 v_public_videos,
    'active_listings',               v_public_videos
  );
end;
$$;

grant execute on function public.get_profile_page(uuid) to authenticated;
