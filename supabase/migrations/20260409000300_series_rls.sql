-- RLS for the series table.
-- Any authenticated user can read series (needed to display series names on autographs).
-- Only the celebrity who owns the series can insert/update/delete.

alter table public.series enable row level security;
alter table public.series force row level security;

drop policy if exists "series_select_authenticated" on public.series;
create policy "series_select_authenticated"
on public.series
for select
to authenticated
using (true);

drop policy if exists "series_insert_own" on public.series;
create policy "series_insert_own"
on public.series
for insert
to authenticated
with check (celebrity_id = auth.uid());

drop policy if exists "series_delete_own" on public.series;
create policy "series_delete_own"
on public.series
for delete
to authenticated
using (celebrity_id = auth.uid());
