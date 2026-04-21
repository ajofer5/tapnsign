-- Phase 2/3 schema: Series and Limited Series support.
-- Columns and table created now so no future migration is needed.
-- All series fields are nullable — unused until Phase 2 ships.

do $$
begin
  create type public.series_type as enum ('standard', 'limited');
exception
  when duplicate_object then null;
end $$;

-- Series table: named groupings of autographs with a platform-enforced cap.
-- standard = 50 max, limited = 25 max.
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  celebrity_id uuid not null references auth.users(id) on delete restrict,
  name varchar(20) not null,
  type public.series_type not null default 'standard',
  max_size integer not null,
  created_at timestamptz not null default now(),
  constraint series_name_not_blank check (length(btrim(name)) > 0),
  constraint series_max_size_positive check (max_size > 0),
  constraint series_standard_cap check (type <> 'standard' or max_size <= 50),
  constraint series_limited_cap check (type <> 'limited' or max_size <= 25)
);

comment on table public.series is 'Named autograph series per celebrity. standard cap=50, limited cap=25. Backend-controlled.';
comment on column public.series.name is 'Display name, max 20 characters.';
comment on column public.series.max_size is 'Hard cap on number of autographs in this series. Enforced by edge function at assignment time.';

create index if not exists series_celebrity_created_at_idx on public.series (celebrity_id, created_at desc);

-- Add series FK and series sequence number to autographs.
alter table public.autographs
  add column if not exists series_id uuid references public.series(id) on delete set null,
  add column if not exists series_sequence_number integer;

comment on column public.autographs.series_id is 'Optional series this autograph belongs to. Null until Phase 2.';
comment on column public.autographs.series_sequence_number is 'Sequential position within the series. Null until Phase 2.';

create index if not exists autographs_series_idx
  on public.autographs (series_id, series_sequence_number)
  where series_id is not null;
