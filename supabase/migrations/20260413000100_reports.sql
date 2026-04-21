-- User-submitted content reports.
-- One report per user per autograph. Reason is a fixed enum for clean querying.
-- No auto-moderation — admin reviews via Supabase dashboard.

create type public.report_reason as enum (
  'impersonation',
  'offensive_content',
  'fraudulent_listing',
  'copyright_issue'
);

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  autograph_id    uuid not null references public.autographs(id) on delete cascade,
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  reason          public.report_reason not null,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint reports_one_per_user_per_autograph unique (autograph_id, reporter_id)
);

comment on table public.reports is 'User-submitted content reports. Reviewed manually by admins.';

create index if not exists reports_autograph_idx on public.reports (autograph_id, created_at desc);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

alter table public.reports enable row level security;
alter table public.reports force row level security;

-- Users can submit a report
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports
for insert
to authenticated
with check (reporter_id = auth.uid());

-- Users can see their own reports (so we can check if they already reported)
drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
on public.reports
for select
to authenticated
using (reporter_id = auth.uid());
