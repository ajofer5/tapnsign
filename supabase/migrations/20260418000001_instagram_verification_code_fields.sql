alter table public.profiles
  add column if not exists instagram_verification_code text,
  add column if not exists instagram_verification_requested_at timestamptz,
  add column if not exists instagram_verification_expires_at timestamptz,
  add column if not exists instagram_verification_checked_at timestamptz;

update public.profiles
set
  instagram_verification_code = null,
  instagram_verification_requested_at = null,
  instagram_verification_expires_at = null,
  instagram_verification_checked_at = null
where coalesce(nullif(btrim(instagram_handle), ''), '') = '';
