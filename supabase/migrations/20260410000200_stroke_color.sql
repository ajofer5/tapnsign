-- Stroke color for gold signature feature.
-- Default is red (#FA0909). Gold is #C9A84C.
-- Stored at capture time and used for all playback rendering.

alter table public.autographs
  add column if not exists stroke_color text not null default '#FA0909';
