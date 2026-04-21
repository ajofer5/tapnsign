-- Add birthday month/day to profiles.
-- Year is intentionally excluded for privacy.
-- These columns are backend-written only — populated by the Stripe Identity webhook
-- when a user completes identity verification. They drive the gold signature feature.

alter table public.profiles
  add column if not exists birthday_month smallint,
  add column if not exists birthday_day   smallint;

alter table public.profiles
  add constraint profiles_birthday_month_range
    check (birthday_month is null or (birthday_month >= 1 and birthday_month <= 12)),
  add constraint profiles_birthday_day_range
    check (birthday_day is null or (birthday_day >= 1 and birthday_day <= 31));

comment on column public.profiles.birthday_month is 'Birth month (1–12) from Stripe Identity DOB. Backend-written only. Drives gold signature feature.';
comment on column public.profiles.birthday_day   is 'Birth day of month (1–31) from Stripe Identity DOB. Backend-written only. Drives gold signature feature.';
