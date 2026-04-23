-- Add decline_after column for scheduled auto-declines.
-- When a seller has auto_decline_below enabled and an offer comes in below
-- the estimated value, the offer is inserted normally but with decline_after
-- set to now() + 1 minute. A pg_cron job fires every minute to process these.

alter table public.autograph_offers
  add column if not exists decline_after timestamptz;

comment on column public.autograph_offers.decline_after is
  'When set, the offer will be auto-declined at this time (auto_decline_below flow).';

-- Function that processes scheduled auto-declines.
create or replace function public.auto_decline_pending_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.autograph_offers
  set status       = 'declined',
      responded_at = now(),
      updated_at   = now()
  where status       = 'pending'
    and decline_after is not null
    and decline_after < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.auto_decline_pending_offers() to authenticated;

-- Sweep every minute for auto-declines.
select cron.schedule(
  'auto-decline-pending-offers',
  '* * * * *',
  $$
    update public.autograph_offers
    set status = 'declined', responded_at = now(), updated_at = now()
    where status = 'pending'
      and decline_after is not null
      and decline_after < now();
  $$
);
