-- TapnSign canonical backend foundation.
-- This migration establishes the first explicit schema contract for identity,
-- autograph provenance, marketplace state, and audit/event tables.

create extension if not exists pgcrypto;

do $$
begin
  create type public.profile_role as enum ('member', 'verified', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_status as enum ('none', 'pending', 'verified', 'failed', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.autograph_status as enum ('active', 'archived', 'removed', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.listing_type as enum ('fixed', 'auction');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.transfer_type as enum ('primary_sale', 'secondary_sale', 'trade', 'admin_adjustment', 'gift');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_purpose as enum ('verification_fee', 'fixed_price_purchase', 'auction_bid_authorization', 'auction_settlement');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_provider as enum ('stripe');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum ('created', 'requires_action', 'authorized', 'captured', 'failed', 'canceled', 'refunded');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.bid_status as enum ('active', 'outbid', 'won', 'lost', 'voided', 'authorization_canceled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.trade_offer_status as enum ('pending', 'accepted', 'declined', 'canceled', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.media_asset_kind as enum ('capture_video', 'thumbnail', 'certificate_preview');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.media_integrity_status as enum ('pending', 'verified', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_event_type as enum ('identity_session_created', 'identity_verified', 'identity_failed', 'identity_requires_input', 'identity_expired');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.ownership_event_source as enum ('capture', 'purchase', 'auction', 'trade', 'admin');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_certificate_id()
returns text
language sql
as $$
  select upper(encode(gen_random_bytes(10), 'hex'));
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_display_name text;
begin
  derived_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  if derived_display_name is null then
    derived_display_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  insert into public.profiles (
    id,
    display_name,
    role,
    verification_status
  ) values (
    new.id,
    derived_display_name,
    'member',
    'none'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.profile_role not null default 'member',
  verification_status public.verification_status not null default 'none',
  verified boolean generated always as (
    role = 'verified' and verification_status = 'verified'
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verification_updated_at timestamptz,
  suspended_at timestamptz,
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0)
);

comment on table public.profiles is 'Public user profile and verification state. Sensitive trust fields are backend-controlled.';
comment on column public.profiles.role is 'Trust role. Must not be client-writeable.';
comment on column public.profiles.verification_status is 'Stripe identity state. Must not be client-writeable.';

create table if not exists public.autographs (
  id uuid primary key default gen_random_uuid(),
  certificate_id text not null default public.generate_certificate_id(),
  celebrity_id uuid not null references auth.users(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  status public.autograph_status not null default 'active',
  ownership_source public.ownership_event_source not null default 'capture',
  certificate_version integer not null default 1,
  video_url text,
  strokes_json jsonb not null default '[]'::jsonb,
  capture_width integer not null,
  capture_height integer not null,
  content_hash text,
  integrity_manifest_hash text,
  media_asset_id uuid,
  latest_transfer_id uuid,
  is_for_sale boolean not null default false,
  listing_type public.listing_type,
  price_cents integer,
  reserve_price_cents integer,
  auction_ends_at timestamptz,
  open_to_trade boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autographs_certificate_id_unique unique (certificate_id),
  constraint autographs_capture_dimensions_positive check (capture_width > 0 and capture_height > 0),
  constraint autographs_price_positive check (price_cents is null or price_cents > 0),
  constraint autographs_reserve_positive check (reserve_price_cents is null or reserve_price_cents > 0),
  constraint autographs_listing_consistency check (
    (
      is_for_sale = false
      and listing_type is null
      and price_cents is null
      and reserve_price_cents is null
      and auction_ends_at is null
    )
    or
    (
      is_for_sale = true
      and listing_type = 'fixed'
      and price_cents is not null
      and reserve_price_cents is null
      and auction_ends_at is null
    )
    or
    (
      is_for_sale = true
      and listing_type = 'auction'
      and price_cents is null
      and reserve_price_cents is not null
      and auction_ends_at is not null
    )
  )
);

comment on table public.autographs is 'Canonical current-state autograph record. Ownership and listing mutations are backend-only.';
comment on column public.autographs.celebrity_id is 'Original creator/signer account.';
comment on column public.autographs.owner_id is 'Current owner. Must not be client-writeable after creation.';
comment on column public.autographs.content_hash is 'App-level authenticity/provenance hash. Should become backend-generated in later phases.';

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  autograph_id uuid not null references public.autographs(id) on delete cascade,
  kind public.media_asset_kind not null,
  storage_bucket text not null,
  storage_path text not null,
  public_url text,
  mime_type text not null,
  byte_size bigint,
  sha256 text,
  integrity_status public.media_integrity_status not null default 'pending',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint media_assets_storage_location_unique unique (storage_bucket, storage_path),
  constraint media_assets_byte_size_nonnegative check (byte_size is null or byte_size >= 0)
);

comment on table public.media_assets is 'Physical media artifacts associated with autographs.';

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null default 'stripe',
  purpose public.payment_purpose not null,
  status public.payment_status not null default 'created',
  user_id uuid references auth.users(id) on delete set null,
  autograph_id uuid references public.autographs(id) on delete set null,
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_payment_intent_id text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  failed_at timestamptz,
  canceled_at timestamptz,
  constraint payment_events_amount_positive check (amount_cents > 0),
  constraint payment_events_currency_not_blank check (length(btrim(currency)) > 0),
  constraint payment_events_stripe_payment_intent_unique unique (stripe_payment_intent_id)
);

comment on table public.payment_events is 'Authoritative payment audit log. Backend-only.';

create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  offerer_id uuid not null references auth.users(id) on delete cascade,
  offered_autograph_id uuid not null references public.autographs(id) on delete cascade,
  target_owner_id uuid not null references auth.users(id) on delete cascade,
  target_autograph_id uuid not null references public.autographs(id) on delete cascade,
  status public.trade_offer_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz,
  accepted_transfer_id uuid,
  constraint trade_offers_distinct_autographs check (offered_autograph_id <> target_autograph_id),
  constraint trade_offers_distinct_users check (offerer_id <> target_owner_id)
);

comment on table public.trade_offers is 'Trade proposals. Accept/decline is backend-only.';

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  autograph_id uuid not null references public.autographs(id) on delete cascade,
  bidder_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null,
  status public.bid_status not null default 'active',
  payment_event_id uuid references public.payment_events(id) on delete set null,
  payment_intent_id text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  voided_at timestamptz,
  constraint bids_amount_positive check (amount_cents > 0)
);

comment on table public.bids is 'Auction bids. Client writes are intentionally locked down until server-side bid flows exist.';

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  autograph_id uuid not null references public.autographs(id) on delete restrict,
  from_user_id uuid references auth.users(id) on delete set null,
  to_user_id uuid not null references auth.users(id) on delete restrict,
  transfer_type public.transfer_type not null default 'secondary_sale',
  price_cents integer,
  trade_offer_id uuid references public.trade_offers(id) on delete set null,
  payment_event_id uuid references public.payment_events(id) on delete set null,
  transferred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by_backend boolean not null default true,
  constraint transfers_price_nonnegative check (price_cents is null or price_cents >= 0),
  constraint transfers_distinct_users check (from_user_id is null or from_user_id <> to_user_id)
);

comment on table public.transfers is 'Immutable ownership transfer history.';

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type public.verification_event_type not null,
  status public.verification_status not null,
  stripe_verification_session_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.verification_events is 'Stripe Identity audit trail. Backend-only.';

create table if not exists public.watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  autograph_id uuid not null references public.autographs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, autograph_id)
);

comment on table public.watchlist is 'Per-user saved marketplace items.';

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint push_tokens_user_unique unique (user_id),
  constraint push_tokens_token_unique unique (token),
  constraint push_tokens_token_not_blank check (length(btrim(token)) > 0)
);

comment on table public.push_tokens is 'Current push token per user. Kept one-per-user for temporary app compatibility.';

alter table public.autographs
  add constraint autographs_media_asset_id_fkey
  foreign key (media_asset_id)
  references public.media_assets(id)
  on delete set null;

alter table public.autographs
  add constraint autographs_latest_transfer_id_fkey
  foreign key (latest_transfer_id)
  references public.transfers(id)
  on delete set null;

alter table public.trade_offers
  add constraint trade_offers_accepted_transfer_id_fkey
  foreign key (accepted_transfer_id)
  references public.transfers(id)
  on delete set null;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_verification_status_idx on public.profiles (verification_status);

create index if not exists autographs_owner_created_at_idx on public.autographs (owner_id, created_at desc);
create index if not exists autographs_celebrity_created_at_idx on public.autographs (celebrity_id, created_at desc);
create index if not exists autographs_certificate_id_idx on public.autographs (certificate_id);
create index if not exists autographs_listing_idx on public.autographs (is_for_sale, listing_type, created_at desc);
create index if not exists autographs_open_to_trade_idx on public.autographs (open_to_trade) where open_to_trade = true;
create index if not exists autographs_auction_ends_at_idx on public.autographs (auction_ends_at) where listing_type = 'auction';

create index if not exists media_assets_autograph_idx on public.media_assets (autograph_id, created_at desc);
create index if not exists media_assets_integrity_idx on public.media_assets (integrity_status, created_at desc);

create index if not exists payment_events_user_idx on public.payment_events (user_id, created_at desc);
create index if not exists payment_events_autograph_idx on public.payment_events (autograph_id, created_at desc);
create index if not exists payment_events_status_idx on public.payment_events (purpose, status, created_at desc);

create index if not exists trade_offers_target_owner_idx on public.trade_offers (target_owner_id, created_at desc);
create index if not exists trade_offers_offerer_idx on public.trade_offers (offerer_id, created_at desc);
create index if not exists trade_offers_target_autograph_idx on public.trade_offers (target_autograph_id, created_at desc);
create index if not exists trade_offers_status_idx on public.trade_offers (status, created_at desc);
create unique index if not exists trade_offers_pending_pair_idx
  on public.trade_offers (offered_autograph_id, target_autograph_id)
  where status = 'pending';

create index if not exists bids_autograph_amount_idx on public.bids (autograph_id, amount_cents desc) where status = 'active';
create index if not exists bids_bidder_created_at_idx on public.bids (bidder_id, created_at desc);

create index if not exists transfers_autograph_transferred_at_idx on public.transfers (autograph_id, transferred_at desc);
create index if not exists transfers_from_user_transferred_at_idx on public.transfers (from_user_id, transferred_at desc);
create index if not exists transfers_to_user_transferred_at_idx on public.transfers (to_user_id, transferred_at desc);

create index if not exists verification_events_user_created_at_idx on public.verification_events (user_id, created_at desc);

create index if not exists watchlist_user_created_at_idx on public.watchlist (user_id, created_at desc);

create index if not exists push_tokens_user_updated_at_idx on public.push_tokens (user_id, updated_at desc);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_autographs_updated_at
before update on public.autographs
for each row execute function public.set_updated_at();

create trigger set_payment_events_updated_at
before update on public.payment_events
for each row execute function public.set_updated_at();

create trigger set_push_tokens_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();
