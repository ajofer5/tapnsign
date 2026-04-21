create or replace function public.get_public_certificate(p_certificate_id text)
returns table (
  certificate_id text,
  created_at timestamptz,
  content_hash text,
  video_url text,
  thumbnail_url text,
  strokes_json jsonb,
  capture_width integer,
  capture_height integer,
  stroke_color text,
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
    a.strokes_json,
    a.capture_width,
    a.capture_height,
    a.stroke_color,
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

drop policy if exists "autographs_select_public_certificate" on public.autographs;
drop policy if exists "profiles_select_public_certificate_related" on public.profiles;
