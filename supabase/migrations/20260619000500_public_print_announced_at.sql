alter table public.autographs
  add column if not exists public_print_announced_at timestamptz;

comment on column public.autographs.public_print_announced_at is
  'Set the first time a moment is announced to saved-creator followers after public prints are enabled.';
