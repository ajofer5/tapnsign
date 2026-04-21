alter table public.autographs
  add column if not exists video_sha256 text,
  add column if not exists strokes_sha256 text;

comment on column public.autographs.video_sha256 is 'Server-generated SHA-256 of the canonical uploaded capture video bytes.';
comment on column public.autographs.strokes_sha256 is 'Server-generated SHA-256 of the normalized stroke payload.';

create index if not exists autographs_creator_duplicate_lookup_idx
  on public.autographs (creator_id, video_sha256, strokes_sha256)
  where video_sha256 is not null and strokes_sha256 is not null and status <> 'deleted';
