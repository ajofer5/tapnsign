-- TapnSign enforcement and row-level security.
-- This locks down trust-sensitive fields and introduces the first explicit
-- access model. Marketplace mutations are intentionally deferred to later
-- backend refactors.

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if new.id <> old.id then
    raise exception 'profile id is immutable';
  end if;

  if new.role <> old.role then
    raise exception 'profile role is backend-only';
  end if;

  if new.verification_status <> old.verification_status then
    raise exception 'verification status is backend-only';
  end if;

  if new.verification_updated_at is distinct from old.verification_updated_at then
    raise exception 'verification timestamps are backend-only';
  end if;

  if new.suspended_at is distinct from old.suspended_at then
    raise exception 'suspension state is backend-only';
  end if;

  return new;
end;
$$;

create or replace function public.guard_autograph_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if new.celebrity_id <> auth.uid() or new.owner_id <> auth.uid() then
    raise exception 'autograph creator and owner must match the signed-in user';
  end if;

  if new.status <> 'active' then
    raise exception 'status is backend-only';
  end if;

  if new.ownership_source <> 'capture' then
    raise exception 'ownership source is backend-only';
  end if;

  if new.is_for_sale then
    raise exception 'client-created autographs cannot be listed immediately';
  end if;

  if new.open_to_trade then
    raise exception 'client-created autographs cannot be open to trade immediately';
  end if;

  if new.listing_type is not null then
    raise exception 'listing type is backend-only';
  end if;

  if new.price_cents is not null or new.reserve_price_cents is not null or new.auction_ends_at is not null then
    raise exception 'listing fields are backend-only';
  end if;

  if new.latest_transfer_id is not null or new.media_asset_id is not null then
    raise exception 'provenance pointers are backend-only';
  end if;

  -- Never trust a client-supplied certificate id.
  new.certificate_id := public.generate_certificate_id();

  return new;
end;
$$;

create or replace function public.guard_autograph_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  raise exception 'autograph updates are backend-only';
end;
$$;

create or replace function public.guard_payment_events_write()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return coalesce(new, old);
  end if;

  raise exception 'payment events are backend-only';
end;
$$;

create or replace function public.guard_verification_events_write()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return coalesce(new, old);
  end if;

  raise exception 'verification events are backend-only';
end;
$$;

create or replace function public.guard_media_assets_write()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return coalesce(new, old);
  end if;

  raise exception 'media assets are backend-only';
end;
$$;

create or replace function public.touch_push_token_last_seen()
returns trigger
language plpgsql
as $$
begin
  if new.token is distinct from old.token then
    new.last_seen_at = now();
  elsif new.last_seen_at is null then
    new.last_seen_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
before update on public.profiles
for each row execute function public.guard_profile_update();

drop trigger if exists guard_autograph_insert on public.autographs;
create trigger guard_autograph_insert
before insert on public.autographs
for each row execute function public.guard_autograph_insert();

drop trigger if exists guard_autograph_update on public.autographs;
create trigger guard_autograph_update
before update on public.autographs
for each row execute function public.guard_autograph_update();

drop trigger if exists guard_media_assets_insert on public.media_assets;
create trigger guard_media_assets_insert
before insert on public.media_assets
for each row execute function public.guard_media_assets_write();

drop trigger if exists guard_media_assets_update on public.media_assets;
create trigger guard_media_assets_update
before update on public.media_assets
for each row execute function public.guard_media_assets_write();

drop trigger if exists guard_media_assets_delete on public.media_assets;
create trigger guard_media_assets_delete
before delete on public.media_assets
for each row execute function public.guard_media_assets_write();

drop trigger if exists guard_payment_events_insert on public.payment_events;
create trigger guard_payment_events_insert
before insert on public.payment_events
for each row execute function public.guard_payment_events_write();

drop trigger if exists guard_payment_events_update on public.payment_events;
create trigger guard_payment_events_update
before update on public.payment_events
for each row execute function public.guard_payment_events_write();

drop trigger if exists guard_payment_events_delete on public.payment_events;
create trigger guard_payment_events_delete
before delete on public.payment_events
for each row execute function public.guard_payment_events_write();

drop trigger if exists guard_verification_events_insert on public.verification_events;
create trigger guard_verification_events_insert
before insert on public.verification_events
for each row execute function public.guard_verification_events_write();

drop trigger if exists guard_verification_events_update on public.verification_events;
create trigger guard_verification_events_update
before update on public.verification_events
for each row execute function public.guard_verification_events_write();

drop trigger if exists guard_verification_events_delete on public.verification_events;
create trigger guard_verification_events_delete
before delete on public.verification_events
for each row execute function public.guard_verification_events_write();

drop trigger if exists touch_push_token_last_seen on public.push_tokens;
create trigger touch_push_token_last_seen
before update on public.push_tokens
for each row execute function public.touch_push_token_last_seen();

alter table public.profiles enable row level security;
alter table public.autographs enable row level security;
alter table public.media_assets enable row level security;
alter table public.transfers enable row level security;
alter table public.bids enable row level security;
alter table public.trade_offers enable row level security;
alter table public.payment_events enable row level security;
alter table public.verification_events enable row level security;
alter table public.watchlist enable row level security;
alter table public.push_tokens enable row level security;

alter table public.profiles force row level security;
alter table public.autographs force row level security;
alter table public.media_assets force row level security;
alter table public.transfers force row level security;
alter table public.bids force row level security;
alter table public.trade_offers force row level security;
alter table public.payment_events force row level security;
alter table public.verification_events force row level security;
alter table public.watchlist force row level security;
alter table public.push_tokens force row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_update_own_display_name" on public.profiles;
create policy "profiles_update_own_display_name"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Temporary compatibility policy for the existing public verify page.
-- This should move to a narrow public certificate view or edge function later.
drop policy if exists "profiles_select_public_certificate_related" on public.profiles;
create policy "profiles_select_public_certificate_related"
on public.profiles
for select
to anon
using (
  exists (
    select 1
    from public.autographs a
    where a.status = 'active'
      and a.certificate_id is not null
      and (a.celebrity_id = profiles.id or a.owner_id = profiles.id)
  )
);

drop policy if exists "autographs_select_owner" on public.autographs;
create policy "autographs_select_owner"
on public.autographs
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "autographs_select_creator" on public.autographs;
create policy "autographs_select_creator"
on public.autographs
for select
to authenticated
using (auth.uid() = celebrity_id);

drop policy if exists "autographs_select_marketplace" on public.autographs;
create policy "autographs_select_marketplace"
on public.autographs
for select
to authenticated
using (status = 'active' and (is_for_sale = true or open_to_trade = true));

drop policy if exists "autographs_select_transfer_related" on public.autographs;
create policy "autographs_select_transfer_related"
on public.autographs
for select
to authenticated
using (
  exists (
    select 1
    from public.transfers t
    where t.autograph_id = autographs.id
      and (t.from_user_id = auth.uid() or t.to_user_id = auth.uid())
  )
);

drop policy if exists "autographs_select_public_certificate" on public.autographs;
create policy "autographs_select_public_certificate"
on public.autographs
for select
to anon
using (status = 'active' and certificate_id is not null);

drop policy if exists "autographs_insert_own_capture" on public.autographs;
create policy "autographs_insert_own_capture"
on public.autographs
for insert
to authenticated
with check (
  auth.uid() = celebrity_id
  and auth.uid() = owner_id
  and status = 'active'
  and ownership_source = 'capture'
  and is_for_sale = false
  and open_to_trade = false
  and listing_type is null
  and price_cents is null
  and reserve_price_cents is null
  and auction_ends_at is null
);

drop policy if exists "media_assets_select_owner" on public.media_assets;
create policy "media_assets_select_owner"
on public.media_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.autographs a
    where a.id = media_assets.autograph_id
      and (a.owner_id = auth.uid() or a.celebrity_id = auth.uid())
  )
);

drop policy if exists "transfers_select_related" on public.transfers;
create policy "transfers_select_related"
on public.transfers
for select
to authenticated
using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy if exists "bids_select_own" on public.bids;
create policy "bids_select_own"
on public.bids
for select
to authenticated
using (bidder_id = auth.uid());

drop policy if exists "bids_select_on_owned_autograph" on public.bids;
create policy "bids_select_on_owned_autograph"
on public.bids
for select
to authenticated
using (
  exists (
    select 1
    from public.autographs a
    where a.id = bids.autograph_id
      and a.owner_id = auth.uid()
  )
);

drop policy if exists "trade_offers_select_related" on public.trade_offers;
create policy "trade_offers_select_related"
on public.trade_offers
for select
to authenticated
using (offerer_id = auth.uid() or target_owner_id = auth.uid());

drop policy if exists "payment_events_select_own" on public.payment_events;
create policy "payment_events_select_own"
on public.payment_events
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "verification_events_select_own" on public.verification_events;
create policy "verification_events_select_own"
on public.verification_events
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own"
on public.watchlist
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own"
on public.watchlist
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own"
on public.watchlist
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
on public.push_tokens
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
on public.push_tokens
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
on public.push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
on public.push_tokens
for delete
to authenticated
using (user_id = auth.uid());
