alter table public.web_print_orders
  add column if not exists disputed_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_amount_cents integer;

alter table public.web_print_orders
  add constraint web_print_orders_refund_nonnegative
    check (refund_amount_cents is null or refund_amount_cents >= 0);

comment on column public.web_print_orders.disputed_at is
  'Set when a Stripe dispute is opened for this web print order.';

comment on column public.web_print_orders.refunded_at is
  'Set when a full or partial refund is issued for this web print order.';

comment on column public.web_print_orders.refund_amount_cents is
  'Amount refunded in cents. Full refund = amount_cents. Partial refund = lesser amount.';

alter table public.royalties_ledger
  add column if not exists web_print_order_id uuid references public.web_print_orders(id) on delete restrict;

alter table public.royalties_ledger
  drop constraint if exists royalties_ledger_print_requires_print_id;

alter table public.royalties_ledger
  add constraint royalties_ledger_print_requires_source
    check (
      royalty_type not in ('print', 'print_owner')
      or print_id is not null
      or web_print_order_id is not null
    );

alter table public.royalties_ledger
  add constraint royalties_ledger_web_print_order_unique
    unique (web_print_order_id, creator_id, royalty_type);

create index if not exists royalties_ledger_web_print_order_idx
  on public.royalties_ledger(web_print_order_id)
  where web_print_order_id is not null;
