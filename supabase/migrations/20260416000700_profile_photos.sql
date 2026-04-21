alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_storage_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'profile-photos');

drop policy if exists "profile_photos_owner_insert" on storage.objects;
drop policy if exists "profile_photos_owner_update" on storage.objects;
drop policy if exists "profile_photos_owner_delete" on storage.objects;

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
     and visibility = 'public';

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
      'id',                     a.id,
      'creator_id',             a.creator_id,
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
    'id',                  v_profile.id,
    'display_name',        v_profile.display_name,
    'avatar_url',          v_profile.avatar_url,
    'role',                v_profile.role,
    'verified',            v_profile.verified,
    'verification_status', v_profile.verification_status,
    'member_since',        v_profile.created_at,
    'first_verified_at',   v_first_verified_at,
    'creator_since',       v_creator_since,
    'is_creator',          v_profile.role = 'verified' and v_profile.verified,
    'stats',               coalesce(v_stats, '{}'::jsonb),
    'public_videos',       v_public_videos,
    'active_listings',     v_public_videos
  );
end;
$$;

grant execute on function public.get_profile_page(uuid) to authenticated;
