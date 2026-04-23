-- Add auto-decline and auto-accept settings to autographs.
-- Sellers can opt in per listing.

alter table public.autographs
  add column if not exists auto_decline_below boolean not null default false,
  add column if not exists auto_accept_above  boolean not null default false;

comment on column public.autographs.auto_decline_below is
  'When true, offers below price_cents are automatically declined after a short delay.';
comment on column public.autographs.auto_accept_above is
  'When true, the first offer at or above price_cents is automatically accepted.';
