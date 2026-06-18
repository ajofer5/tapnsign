alter table public.web_print_orders
  add column if not exists autograph_ids uuid[];

alter table public.web_print_orders
  add column if not exists bundle_items jsonb not null default '[]'::jsonb;

create index if not exists web_print_orders_autograph_ids_gin_idx
  on public.web_print_orders using gin (autograph_ids);
