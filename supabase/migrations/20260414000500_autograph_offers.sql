-- Public-video offers for public, not-for-sale autographs.

do $$
begin
  create type public.autograph_offer_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.autograph_offers (
  id uuid primary key default gen_random_uuid(),
  autograph_id uuid not null references public.autographs(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status public.autograph_offer_status not null default 'pending',
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autograph_offers_distinct_users check (buyer_id <> owner_id)
);

comment on table public.autograph_offers is 'Offers made on public, not-for-sale autographs.';

create index if not exists autograph_offers_owner_idx
  on public.autograph_offers (owner_id, created_at desc);

create index if not exists autograph_offers_buyer_idx
  on public.autograph_offers (buyer_id, created_at desc);

create index if not exists autograph_offers_autograph_idx
  on public.autograph_offers (autograph_id, created_at desc);

create index if not exists autograph_offers_status_idx
  on public.autograph_offers (status, created_at desc);

create unique index if not exists autograph_offers_pending_buyer_unique_idx
  on public.autograph_offers (autograph_id, buyer_id)
  where status = 'pending';

drop trigger if exists set_autograph_offers_updated_at on public.autograph_offers;
create trigger set_autograph_offers_updated_at
before update on public.autograph_offers
for each row execute function public.set_updated_at();

create or replace function public.expire_autograph_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.autograph_offers
  set status = 'expired',
      responded_at = now(),
      updated_at = now()
  where status = 'pending'
    and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_autograph_offers() to authenticated;

alter table public.autograph_offers enable row level security;
alter table public.autograph_offers force row level security;

drop policy if exists "autograph_offers_select_related" on public.autograph_offers;
create policy "autograph_offers_select_related"
on public.autograph_offers
for select
to authenticated
using (buyer_id = auth.uid() or owner_id = auth.uid());

-- Sweep expired pending offers every 15 minutes when pg_cron is available.
select cron.schedule(
  'expire-autograph-offers',
  '*/15 * * * *',
  $$
    update public.autograph_offers
    set status = 'expired', responded_at = now(), updated_at = now()
    where status = 'pending'
      and expires_at < now();
  $$
);
