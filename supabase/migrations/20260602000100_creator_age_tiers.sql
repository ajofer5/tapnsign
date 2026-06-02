-- Creator age tiers
--
-- Adds:
--   profiles.birthday_year  — self-reported at signup, overwritten by Stripe Identity
--   profiles.is_creator     — true when user is 18+ (auto-set at signup and by Stripe webhook)
--
-- Rules:
--   • Under 13  → cannot create account (enforced app-side; no DB change needed)
--   • 13–17     → member account, browse/save only (is_creator = false)
--   • 18+       → is_creator = true automatically at signup
--   • Stripe Identity verifies DOB → overwrites birthday_year, re-evaluates is_creator
--     and strips it if the real ID shows under 18

alter table public.profiles
  add column if not exists birthday_year smallint,
  add column if not exists is_creator    boolean not null default false;

comment on column public.profiles.birthday_year is
  'Birth year — self-reported at signup, overwritten by Stripe Identity on verification.';
comment on column public.profiles.is_creator is
  'True when user is 18+. Auto-set at signup from self-reported DOB; re-evaluated by Stripe Identity webhook.';

-- Update the new-user trigger to read DOB from signup metadata and set is_creator
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_display_name text;
  v_birthday_year      smallint;
  v_birthday_month     smallint;
  v_birthday_day       smallint;
  v_is_creator         boolean := false;
begin
  derived_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  if derived_display_name is null then
    derived_display_name := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;

  -- Read DOB from signup metadata (passed via supabase.auth.signUp options.data)
  begin
    v_birthday_year  := (new.raw_user_meta_data ->> 'birthday_year')::smallint;
    v_birthday_month := (new.raw_user_meta_data ->> 'birthday_month')::smallint;
    v_birthday_day   := (new.raw_user_meta_data ->> 'birthday_day')::smallint;
  exception when others then
    v_birthday_year  := null;
    v_birthday_month := null;
    v_birthday_day   := null;
  end;

  -- Auto-grant creator access if self-reported age is 18+
  if v_birthday_year is not null then
    v_is_creator := (extract(year from now()) - v_birthday_year) >= 18;
  end if;

  insert into public.profiles (
    id,
    display_name,
    role,
    verification_status,
    birthday_year,
    birthday_month,
    birthday_day,
    is_creator
  ) values (
    new.id,
    derived_display_name,
    'member',
    'none',
    v_birthday_year,
    v_birthday_month,
    v_birthday_day,
    v_is_creator
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
