-- Storage bucket for print damage claim photos
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'damage-claim-photos',
  'damage-claim-photos',
  false,              -- private: only accessible via signed URLs or service role
  10485760,           -- 10 MB max per photo
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users can upload photos into their own folder only
-- Path convention: {user_id}/{filename}
drop policy if exists "damage_claim_photos_owner_insert" on storage.objects;
create policy "damage_claim_photos_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'damage-claim-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read their own uploaded photos
drop policy if exists "damage_claim_photos_owner_select" on storage.objects;
create policy "damage_claim_photos_owner_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'damage-claim-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users cannot update or delete — photos are evidence and must stay immutable
-- Service role (edge functions) has full access via bypass RLS
