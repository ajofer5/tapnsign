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
