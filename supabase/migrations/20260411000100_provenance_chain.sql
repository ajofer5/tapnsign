-- Provenance chain: privacy preference + public RPC for transfer history.
-- Adds history_privacy to profiles so collectors control how they appear
-- in public-facing certificate pages.

-- Privacy preference for how a user appears in provenance history.
-- 'anonymous' → shows "Anonymous Collector"
-- 'alias'     → shows display_name (default)
-- 'public'    → shows display_name (same as alias; reserved for future profile links)
alter table public.profiles
  add column if not exists history_privacy text not null default 'alias'
  constraint profiles_history_privacy_check check (history_privacy in ('anonymous', 'alias', 'public'));

-- Public RPC: returns the full provenance chain for a given certificate_id.
-- Security definer so anon callers can read transfers + profile display names
-- without direct table access. Privacy preference is enforced here.
create or replace function public.get_provenance_chain(p_certificate_id text)
returns table (
  event_order  integer,
  event_type   text,
  event_date   timestamptz,
  price_cents  integer,
  from_label   text,
  to_label     text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_autograph_id  uuid;
  v_celebrity_id  uuid;
  v_celebrity_name text;
  v_created_at    timestamptz;
begin
  select a.id, a.celebrity_id, p.display_name, a.created_at
  into v_autograph_id, v_celebrity_id, v_celebrity_name, v_created_at
  from public.autographs a
  join public.profiles p on p.id = a.celebrity_id
  where a.certificate_id = p_certificate_id
    and a.status = 'active';

  if not found then
    return;
  end if;

  -- Synthetic origin event (no transfer row exists for captures).
  return query
  select
    0                   as event_order,
    'signed'::text      as event_type,
    v_created_at        as event_date,
    null::integer       as price_cents,
    null::text          as from_label,
    v_celebrity_name    as to_label;

  -- Real transfer events ordered chronologically.
  return query
  select
    (row_number() over (order by t.transferred_at))::integer as event_order,
    t.transfer_type::text                                     as event_type,
    t.transferred_at                                          as event_date,
    t.price_cents,
    -- Creators are always named; collectors respect their privacy setting.
    case
      when t.from_user_id = v_celebrity_id then fp.display_name
      when fp.history_privacy = 'anonymous' then 'Anonymous Collector'
      else fp.display_name
    end as from_label,
    case
      when tp.history_privacy = 'anonymous' then 'Anonymous Collector'
      else tp.display_name
    end as to_label
  from public.transfers t
  left join public.profiles fp on fp.id = t.from_user_id
  left join public.profiles tp on tp.id = t.to_user_id
  where t.autograph_id = v_autograph_id
  order by t.transferred_at;

end;
$$;

grant execute on function public.get_provenance_chain(text) to anon, authenticated;
