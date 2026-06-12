-- Web guest print orders: tracks physical print purchases made via the public profile page
-- without requiring a Supabase auth account (guest checkout).
-- Deliberately separate from autograph_prints (which is the digital-collectible ownership ledger).
create table if not exists public.web_print_orders (
  id uuid primary key default gen_random_uuid(),
  autograph_id uuid not null references public.autographs(id),
  quantity integer not null default 1 check (quantity >= 1 and quantity <= 5),
  buyer_email text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  prodigi_order_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'submitted', 'failed')),
  shipping_name text,
  shipping_line1 text,
  shipping_line2 text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  shipping_country text not null default 'US',
  amount_cents integer,
  created_at timestamptz not null default now()
);

comment on table public.web_print_orders is 'Guest print purchases from the public web profile page. No auth account required.';

create index if not exists web_print_orders_autograph_idx
  on public.web_print_orders (autograph_id, created_at desc);

create index if not exists web_print_orders_session_idx
  on public.web_print_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Service role only — no public RLS needed (accessed only via API routes with service key)
alter table public.web_print_orders enable row level security;
