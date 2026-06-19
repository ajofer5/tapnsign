alter table public.web_print_orders
  add column if not exists creator_id uuid references public.profiles(id) on delete set null,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists owner_payout_cents integer not null default 0,
  add column if not exists owner_connect_scheduled boolean not null default false,
  add column if not exists owner_connect_account_id text;

create index if not exists web_print_orders_owner_idx
  on public.web_print_orders(owner_id);

create index if not exists web_print_orders_creator_idx
  on public.web_print_orders(creator_id);

create index if not exists web_print_orders_payment_intent_idx
  on public.web_print_orders(stripe_payment_intent_id);
