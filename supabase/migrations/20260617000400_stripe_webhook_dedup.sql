-- Stripe webhook event deduplication table.
-- Stores processed event IDs so retried webhooks are skipped safely.
create table if not exists public.stripe_webhook_events (
  id             bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  event_type     text not null,
  processed_at   timestamptz not null default now()
);

-- Auto-purge events older than 30 days to keep the table small.
-- Stripe's retry window is 72 hours, so 30 days is more than sufficient.
create index if not exists stripe_webhook_events_processed_at_idx
  on public.stripe_webhook_events (processed_at);

-- Only the service role writes to this table.
alter table public.stripe_webhook_events enable row level security;
create policy "service role only" on public.stripe_webhook_events
  using (false);
