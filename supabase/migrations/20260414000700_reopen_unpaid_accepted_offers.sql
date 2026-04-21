-- Reopen accepted-but-unpaid offers after the payment window expires.

create or replace function public.expire_autograph_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_pending_expired integer := 0;
  v_reopened integer := 0;
begin
  update public.autograph_offers
  set status = 'expired',
      responded_at = now(),
      updated_at = now()
  where status = 'pending'
    and expires_at < now();

  get diagnostics v_pending_expired = row_count;

  update public.autograph_offers
  set
    status = 'pending',
    responded_at = null,
    accepted_at = null,
    payment_due_at = null,
    payment_event_id = null,
    updated_at = now()
  where status = 'accepted'
    and accepted_transfer_id is null
    and payment_due_at is not null
    and payment_due_at < now();

  get diagnostics v_reopened = row_count;
  v_count := v_pending_expired + v_reopened;
  return v_count;
end;
$$;

grant execute on function public.expire_autograph_offers() to authenticated;

select cron.schedule(
  'reopen-expired-accepted-autograph-offers',
  '*/15 * * * *',
  $$
    update public.autograph_offers
    set
      status = 'pending',
      responded_at = null,
      accepted_at = null,
      payment_due_at = null,
      payment_event_id = null,
      updated_at = now()
    where status = 'accepted'
      and accepted_transfer_id is null
      and payment_due_at is not null
      and payment_due_at < now();
  $$
);
