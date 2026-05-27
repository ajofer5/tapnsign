-- Create dedicated bucket for print layout PNGs (used by Railway render worker).
-- Separates print assets from capture assets so MIME rules can never interfere.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'print-layouts',
  'print-layouts',
  true,
  52428800,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "print_layouts_public_read" on storage.objects;
create policy "print_layouts_public_read"
on storage.objects
for select
to public
using (bucket_id = 'print-layouts');

-- Restore autograph-videos to capture-only MIME types (video + JPEG frames).
-- PNG was inadvertently added during print layout work and caused capture uploads to break.
update storage.buckets
set allowed_mime_types = array['video/quicktime', 'image/jpeg']
where id = 'autograph-videos';
