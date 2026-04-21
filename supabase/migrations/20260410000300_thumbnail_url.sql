-- Thumbnail URL for OG image and social sharing.
-- Captured by the creator at submit time using the thumbnail picker screen.
-- Nullable — existing autographs and skipped pickers leave this null.

alter table public.autographs
  add column if not exists thumbnail_url text null;
