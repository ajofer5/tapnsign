alter table public.payment_events
  add column if not exists verification_attempt_consumed_at timestamptz,
  add column if not exists verification_attempt_session_id text,
  add column if not exists verification_attempt_result public.verification_status,
  add column if not exists courtesy_retry_granted_at timestamptz,
  add column if not exists courtesy_retry_consumed_at timestamptz;

comment on column public.payment_events.verification_attempt_consumed_at is 'When this verification fee was consumed to create an identity verification session.';
comment on column public.payment_events.verification_attempt_session_id is 'Stripe Identity verification session created from this fee.';
comment on column public.payment_events.verification_attempt_result is 'Outcome of the identity verification attempt tied to this fee.';
comment on column public.payment_events.courtesy_retry_granted_at is 'Optional manual support override granting one extra verification attempt without repayment.';
comment on column public.payment_events.courtesy_retry_consumed_at is 'When the manual courtesy retry was consumed.';

create index if not exists payment_events_verification_attempt_idx
  on public.payment_events (purpose, user_id, verification_attempt_consumed_at, courtesy_retry_consumed_at, created_at desc);
