-- Extend autograph_prints with fulfillment and payment tracking
alter table public.autograph_prints
  add column if not exists payment_intent_id text,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists shipping_name text,
  add column if not exists shipping_line1 text,
  add column if not exists shipping_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_zip text,
  add column if not exists vendor_order_id text,
  add column if not exists vendor_submitted_at timestamptz,
  add column if not exists fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'payment_confirmed', 'submitted', 'shipped', 'delivered', 'failed'));

comment on column public.autograph_prints.payment_intent_id is 'Stripe PaymentIntent ID for the print bundle purchase.';
comment on column public.autograph_prints.payment_confirmed_at is 'Timestamp when Stripe confirmed payment.';
comment on column public.autograph_prints.shipping_name is 'Recipient name for physical delivery.';
comment on column public.autograph_prints.shipping_line1 is 'Street address line 1.';
comment on column public.autograph_prints.shipping_line2 is 'Street address line 2 (optional).';
comment on column public.autograph_prints.shipping_city is 'City.';
comment on column public.autograph_prints.shipping_state is 'State (2-letter US code).';
comment on column public.autograph_prints.shipping_zip is 'ZIP code.';
comment on column public.autograph_prints.vendor_order_id is 'Order ID returned by print vendor (Prodigi) after successful submission.';
comment on column public.autograph_prints.vendor_submitted_at is 'Timestamp when the order was submitted to the print vendor.';
comment on column public.autograph_prints.fulfillment_status is 'Lifecycle state of the physical print order.';

-- Index for looking up prints by payment intent (used by Stripe webhook)
create index if not exists autograph_prints_payment_intent_idx
  on public.autograph_prints (payment_intent_id)
  where payment_intent_id is not null;

-- Index for looking up prints by vendor order (used for fulfillment status updates)
create index if not exists autograph_prints_vendor_order_idx
  on public.autograph_prints (vendor_order_id)
  where vendor_order_id is not null;

-- -----------------------------------------------------------------------
-- Print damage claims
-- -----------------------------------------------------------------------
create table if not exists public.print_damage_claims (
  id uuid primary key default gen_random_uuid(),
  print_id uuid not null references public.autograph_prints(id) on delete restrict,
  claimant_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'evidence_requested', 'destruction_requested', 'approved', 'rejected')),

  -- Step 1: damage evidence
  damage_front_photo_url text,
  damage_back_photo_url text,
  damage_submitted_at timestamptz,

  -- Step 2: destruction confirmation
  destruction_photo_url text,
  destruction_submitted_at timestamptz,

  -- Admin review
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,

  -- Reprint authorization
  reprint_authorized_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Only one active claim per print at a time
  constraint print_damage_claims_one_active unique (print_id)
);

comment on table public.print_damage_claims is 'Damage claims submitted by collectors for physical prints. Approved claims authorize a reprint.';
comment on column public.print_damage_claims.status is 'pending: submitted, awaiting TapnSign review. evidence_requested: more info needed. destruction_requested: collector asked to submit cut-in-half photo. approved: reprint authorized. rejected: claim denied.';
comment on column public.print_damage_claims.reprint_authorized_at is 'When TapnSign authorized a reprint. When set, the associated autograph_print status is reset to allow a new print order.';

create index if not exists print_damage_claims_print_idx
  on public.print_damage_claims (print_id);

create index if not exists print_damage_claims_claimant_idx
  on public.print_damage_claims (claimant_id, created_at desc);

create index if not exists print_damage_claims_status_idx
  on public.print_damage_claims (status)
  where status in ('pending', 'evidence_requested', 'destruction_requested');

-- Auto-update updated_at
create or replace function public.set_print_damage_claims_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger print_damage_claims_updated_at
  before update on public.print_damage_claims
  for each row execute function public.set_print_damage_claims_updated_at();

-- -----------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------
alter table public.print_damage_claims enable row level security;

-- Collectors can view their own claims
create policy "claimants can view own claims"
  on public.print_damage_claims for select
  using (claimant_id = auth.uid());

-- Collectors can insert a claim (edge function validates ownership)
create policy "claimants can insert own claims"
  on public.print_damage_claims for insert
  with check (claimant_id = auth.uid());

-- Collectors can update only the photo columns on their own pending/destruction_requested claims
create policy "claimants can submit photos"
  on public.print_damage_claims for update
  using (
    claimant_id = auth.uid()
    and status in ('pending', 'destruction_requested')
  )
  with check (
    claimant_id = auth.uid()
  );

-- Service role (edge functions) has full access — no RLS restriction needed for service role
