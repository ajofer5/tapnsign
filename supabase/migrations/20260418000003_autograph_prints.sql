create table if not exists public.autograph_prints (
  id uuid primary key default gen_random_uuid(),
  autograph_id uuid not null references public.autographs(id) on delete cascade,
  owner_id_at_print uuid not null references auth.users(id) on delete restrict,
  print_sequence_number integer not null,
  status text not null default 'created' check (status in ('created', 'canceled')),
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  constraint autograph_prints_sequence_positive check (print_sequence_number > 0),
  constraint autograph_prints_sequence_unique unique (autograph_id, print_sequence_number),
  constraint autograph_prints_one_per_owner unique (autograph_id, owner_id_at_print)
);

comment on table public.autograph_prints is 'Official TapnSign physical print issuance history for autographs.';
comment on column public.autograph_prints.owner_id_at_print is 'Internal owner traceability at the time of official print creation. Not intended for public display.';

create index if not exists autograph_prints_autograph_idx
  on public.autograph_prints (autograph_id, created_at desc);

create index if not exists autograph_prints_owner_idx
  on public.autograph_prints (owner_id_at_print, created_at desc);
