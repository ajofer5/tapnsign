-- Phase 1: Celebrity sequence numbers.
-- Every autograph gets a permanent sequential number per celebrity at capture time.
-- A counter table is used for atomic, race-condition-free assignment.

-- Counter table: one row per celebrity, incremented atomically on each autograph insert.
create table if not exists public.celebrity_sequence_counters (
  celebrity_id uuid primary key references auth.users(id) on delete restrict,
  last_sequence_number integer not null default 0
);

comment on table public.celebrity_sequence_counters is 'Atomic per-celebrity autograph sequence counter. Backend-only.';

-- Add sequence number column to autographs.
alter table public.autographs
  add column if not exists celebrity_sequence_number integer;

comment on column public.autographs.celebrity_sequence_number is 'Permanent sequential number for this autograph within the celebrity. Assigned at insert via trigger, never changes.';

create index if not exists autographs_celebrity_sequence_idx
  on public.autographs (celebrity_id, celebrity_sequence_number);

-- Trigger function: atomically increments the counter and assigns the next value.
create or replace function public.assign_celebrity_sequence_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_seq integer;
begin
  insert into public.celebrity_sequence_counters (celebrity_id, last_sequence_number)
  values (NEW.celebrity_id, 1)
  on conflict (celebrity_id) do update
    set last_sequence_number = celebrity_sequence_counters.last_sequence_number + 1
  returning last_sequence_number into v_next_seq;

  NEW.celebrity_sequence_number = v_next_seq;
  return NEW;
end;
$$;

drop trigger if exists assign_autograph_sequence_number on public.autographs;
create trigger assign_autograph_sequence_number
  before insert on public.autographs
  for each row execute function public.assign_celebrity_sequence_number();

-- Backfill counters and sequence numbers for any existing autographs.
-- Assigns numbers in creation order per celebrity.
do $$
declare
  r record;
  v_seq integer;
begin
  for r in
    select id, celebrity_id, created_at
    from public.autographs
    where celebrity_sequence_number is null
    order by celebrity_id, created_at, id
  loop
    insert into public.celebrity_sequence_counters (celebrity_id, last_sequence_number)
    values (r.celebrity_id, 1)
    on conflict (celebrity_id) do update
      set last_sequence_number = celebrity_sequence_counters.last_sequence_number + 1
    returning last_sequence_number into v_seq;

    update public.autographs
    set celebrity_sequence_number = v_seq
    where id = r.id;
  end loop;
end $$;
