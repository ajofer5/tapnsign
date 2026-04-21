insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'autograph-videos',
  'autograph-videos',
  true,
  52428800,
  array['video/quicktime', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "autograph_videos_public_read" on storage.objects;
create policy "autograph_videos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'autograph-videos');

drop policy if exists "autograph_videos_owner_insert" on storage.objects;
drop policy if exists "autograph_videos_owner_update" on storage.objects;
drop policy if exists "autograph_videos_owner_delete" on storage.objects;
