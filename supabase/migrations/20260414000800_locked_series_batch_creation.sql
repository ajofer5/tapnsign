create unique index if not exists autographs_series_sequence_unique_idx
  on public.autographs (series_id, series_sequence_number)
  where series_id is not null;

create unique index if not exists series_creator_name_normalized_unique_idx
  on public.series (
    creator_id,
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
  );

create or replace function public.prevent_series_membership_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'update'
     and old.series_id is not null
     and (
       new.series_id is distinct from old.series_id
       or new.series_sequence_number is distinct from old.series_sequence_number
     ) then
    raise exception 'Series membership is locked once created.';
  end if;

  return new;
end;
$$;

drop trigger if exists autographs_prevent_series_membership_change on public.autographs;
create trigger autographs_prevent_series_membership_change
before update on public.autographs
for each row
when (old.series_id is not null)
execute function public.prevent_series_membership_change();

create or replace function public.rpc_create_locked_series(
  p_creator_id uuid,
  p_name text,
  p_autograph_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series_id uuid;
  v_name text;
  v_count integer;
  v_bad_count integer;
begin
  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Series name is required.';
  end if;

  if length(v_name) > 20 then
    raise exception 'Series name must be 20 characters or fewer.';
  end if;

  if exists (
    select 1
    from public.series s
    where s.creator_id = p_creator_id
      and lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) =
          lower(regexp_replace(v_name, '\s+', ' ', 'g'))
  ) then
    raise exception 'You already have a series with this name.';
  end if;

  v_count := coalesce(array_length(p_autograph_ids, 1), 0);
  if v_count < 1 then
    raise exception 'Select at least one autograph.';
  end if;

  if v_count > 50 then
    raise exception 'Series can include at most 50 autographs.';
  end if;

  if exists (
    select 1
    from unnest(p_autograph_ids) as candidate
    group by candidate
    having count(*) > 1
  ) then
    raise exception 'Series selection contains duplicate autographs.';
  end if;

  select count(*)
  into v_bad_count
  from public.autographs a
  where a.id = any(p_autograph_ids)
    and (
      a.creator_id <> p_creator_id
      or a.owner_id <> p_creator_id
      or a.status <> 'active'
      or a.series_id is not null
    );

  if v_bad_count > 0 then
    raise exception 'All selected autographs must be active, owned by the creator, and not already in a series.';
  end if;

  if (
    select count(*)
    from public.autographs a
    where a.id = any(p_autograph_ids)
  ) <> v_count then
    raise exception 'One or more selected autographs could not be found.';
  end if;

  insert into public.series (creator_id, name, type, max_size)
  values (p_creator_id, v_name, 'standard', v_count)
  returning id into v_series_id;

  with ordered as (
    select
      a.id,
      row_number() over (order by a.created_at asc, a.id asc) as seq
    from public.autographs a
    where a.id = any(p_autograph_ids)
  )
  update public.autographs a
  set
    series_id = v_series_id,
    series_sequence_number = ordered.seq
  from ordered
  where a.id = ordered.id;

  return jsonb_build_object(
    'series', jsonb_build_object(
      'id', v_series_id,
      'name', v_name,
      'max_size', v_count
    ),
    'assignments',
    (
      select jsonb_agg(
        jsonb_build_object(
          'autograph_id', a.id,
          'series_sequence_number', a.series_sequence_number
        )
        order by a.series_sequence_number
      )
      from public.autographs a
      where a.series_id = v_series_id
    )
  );
end;
$$;

grant execute on function public.rpc_create_locked_series(uuid, text, uuid[]) to authenticated;
