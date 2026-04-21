create or replace function public.guard_autograph_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  raise exception 'autograph minting is backend-only';
end;
$$;

drop policy if exists "autographs_insert_own_capture" on public.autographs;
