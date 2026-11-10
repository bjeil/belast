-- ============================================================================
-- Belast – migrasjon 004: flytt alle tabeller fra public til eget skjema
-- "belast" (samme database). Public beholdes UAVBRUTT som backup.
-- Kjør dette i Supabase Dashboard → SQL Editor for EKSISTERENDE databaser
-- (prosjektet som skal bli "sandbox"-databasen).
-- Idempotent: trygt å kjøre flere ganger.
--
-- Hva dette gjør:
--   1. Oppretter skjemaet `belast`.
--   2. Kopierer ALLE tabeller (aktive + historikk) med struktur, data,
--      constraints, identiteter og indekser – public-tabellene røres ikke.
--   3. Legger til foreign keys mot auth.users (LIKE kopierer ikke FK-er).
--   4. Oppretter RLS-policyer, triggere og funksjoner på nytt i `belast`.
--   5. Legger belast-tabellene i realtime-publikasjonen.
--   6. Gir rollene anon/authenticated tilgang til skjemaet (PostgREST).
--
-- MANUELT etter dette (se README):
--   - Project Settings → API → "Exposed schemas": legg til `belast`
--   - Appen peker nå på skjema `belast` (db.schema i src/lib/supabase.ts)
-- ============================================================================

-- 1. Skjema
create schema if not exists belast;

-- 2. Kopier tabeller (struktur + data). Data kopieres kun hvis mål-tabellen er tom.
create table if not exists belast.day_entries        (like public.day_entries        including all);
create table if not exists belast.categories         (like public.categories         including all);
create table if not exists belast.week_plans         (like public.week_plans         including all);
create table if not exists belast.day_entries_history (like public.day_entries_history including all);
create table if not exists belast.categories_history  (like public.categories_history  including all);
create table if not exists belast.week_plans_history  (like public.week_plans_history  including all);

insert into belast.day_entries        select * from public.day_entries        where not exists (select 1 from belast.day_entries);
insert into belast.categories         select * from public.categories         where not exists (select 1 from belast.categories);
insert into belast.week_plans         select * from public.week_plans         where not exists (select 1 from belast.week_plans);
insert into belast.day_entries_history select * from public.day_entries_history where not exists (select 1 from belast.day_entries_history);
insert into belast.categories_history  select * from public.categories_history  where not exists (select 1 from belast.categories_history);
insert into belast.week_plans_history  select * from public.week_plans_history  where not exists (select 1 from belast.week_plans_history);

-- 3. Foreign keys mot auth.users (LIKE kopierer ikke FK-er)
alter table belast.day_entries add constraint day_entries_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table belast.categories  add constraint categories_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table belast.week_plans  add constraint week_plans_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- 4. RLS + policyer (samme mønster som i public)
alter table belast.day_entries        enable row level security;
alter table belast.categories         enable row level security;
alter table belast.week_plans         enable row level security;
alter table belast.day_entries_history enable row level security;
alter table belast.categories_history  enable row level security;
alter table belast.week_plans_history  enable row level security;

create policy "Brukere ser egne rader"
  on belast.day_entries for select using (auth.uid() = user_id);
create policy "Brukere skriver egne rader"
  on belast.day_entries for insert with check (auth.uid() = user_id);
create policy "Brukere oppdaterer egne rader"
  on belast.day_entries for update using (auth.uid() = user_id);
create policy "Brukere sletter egne rader"
  on belast.day_entries for delete using (auth.uid() = user_id);

create policy "Brukere ser egne kategorier"
  on belast.categories for select using (auth.uid() = user_id);
create policy "Brukere skriver egne kategorier"
  on belast.categories for insert with check (auth.uid() = user_id);
create policy "Brukere oppdaterer egne kategorier"
  on belast.categories for update using (auth.uid() = user_id);
create policy "Brukere sletter egne kategorier"
  on belast.categories for delete using (auth.uid() = user_id);

create policy "Brukere ser egne planer"
  on belast.week_plans for select using (auth.uid() = user_id);
create policy "Brukere skriver egne planer"
  on belast.week_plans for insert with check (auth.uid() = user_id);
create policy "Brukere oppdaterer egne planer"
  on belast.week_plans for update using (auth.uid() = user_id);
create policy "Brukere sletter egne planer"
  on belast.week_plans for delete using (auth.uid() = user_id);

create policy "Brukere ser egen historikk (dager)"
  on belast.day_entries_history for select using (auth.uid() = user_id);
create policy "Brukere ser egen historikk (kategorier)"
  on belast.categories_history for select using (auth.uid() = user_id);
create policy "Brukere ser egen historikk (planer)"
  on belast.week_plans_history for select using (auth.uid() = user_id);
create policy "System skriver historikk (dager)"
  on belast.day_entries_history for insert with check (true);
create policy "System skriver historikk (kategorier)"
  on belast.categories_history for insert with check (true);
create policy "System skriver historikk (planer)"
  on belast.week_plans_history for insert with check (true);

-- 5. Funksjoner i belast-skjemaet (fullt kvalifisert – search_path er ikke satt)
create or replace function belast.set_valid_from()
returns trigger
language plpgsql
as $$
begin
  if new.valid_from is null then
    new.valid_from := coalesce(new.updated_at, now());
  end if;
  return new;
end $$;

create or replace function belast.archive_row_version()
returns trigger
language plpgsql
security definer
as $$
declare
  v_valid_to timestamptz := coalesce(new.updated_at, now());
begin
  if tg_table_name = 'day_entries' then
    if tg_op = 'INSERT' then return new; end if;
    insert into belast.day_entries_history
      (id, user_id, date, activities, load, duration_min, sleep_score,
       nutrition_score, note, pains, updated_at, deleted, valid_from, valid_to)
    values
      (old.id, old.user_id, old.date, old.activities, old.load, old.duration_min,
       old.sleep_score, old.nutrition_score, old.note, old.pains, old.updated_at,
       old.deleted, old.valid_from, v_valid_to);
  elsif tg_table_name = 'categories' then
    if tg_op = 'INSERT' then return new; end if;
    insert into belast.categories_history
      (id, user_id, kind, key, label, sort_order, active, updated_at, valid_from, valid_to)
    values
      (old.id, old.user_id, old.kind, old.key, old.label, old.sort_order,
       old.active, old.updated_at, old.valid_from, v_valid_to);
  elsif tg_table_name = 'week_plans' then
    if tg_op = 'INSERT' then return new; end if;
    insert into belast.week_plans_history
      (id, user_id, name, favorite, days, updated_at, deleted, valid_from, valid_to)
    values
      (old.id, old.user_id, old.name, old.favorite, old.days, old.updated_at,
       old.deleted, old.valid_from, v_valid_to);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- GDPR: slett ALLE data (aktiv + historikk) for innlogget bruker i belast-skjemaet
create or replace function belast.delete_all_my_data()
returns void
language sql
security definer
as $$
  delete from belast.day_entries         where user_id = auth.uid();
  delete from belast.day_entries_history where user_id = auth.uid();
  delete from belast.categories          where user_id = auth.uid();
  delete from belast.categories_history  where user_id = auth.uid();
  delete from belast.week_plans          where user_id = auth.uid();
  delete from belast.week_plans_history  where user_id = auth.uid();
$$;

-- 6. Triggere på belast-tabellene
drop trigger if exists day_entries_valid_from on belast.day_entries;
create trigger day_entries_valid_from
  before insert or update on belast.day_entries
  for each row execute function belast.set_valid_from();

drop trigger if exists categories_valid_from on belast.categories;
create trigger categories_valid_from
  before insert or update on belast.categories
  for each row execute function belast.set_valid_from();

drop trigger if exists week_plans_valid_from on belast.week_plans;
create trigger week_plans_valid_from
  before insert or update on belast.week_plans
  for each row execute function belast.set_valid_from();

drop trigger if exists day_entries_archive on belast.day_entries;
create trigger day_entries_archive
  after insert or update or delete on belast.day_entries
  for each row execute function belast.archive_row_version();

drop trigger if exists categories_archive on belast.categories;
create trigger categories_archive
  after insert or update or delete on belast.categories
  for each row execute function belast.archive_row_version();

drop trigger if exists week_plans_archive on belast.week_plans;
create trigger week_plans_archive
  after insert or update or delete on belast.week_plans
  for each row execute function belast.archive_row_version();

-- 7. Realtime: belast-tabellene må i publikasjonen (appen lytter på schema 'belast')
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'belast' and tablename = 'day_entries'
  ) then
    alter publication supabase_realtime add table belast.day_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'belast' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table belast.categories;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'belast' and tablename = 'week_plans'
  ) then
    alter publication supabase_realtime add table belast.week_plans;
  end if;
end $$;

-- 8. Tilganger for PostgREST (anon/authenticated) – nødvendig for at appen
--    skal nå skjemaet via REST/RPC. Public beholdes urørt som backup.
grant usage on schema belast to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema belast to anon, authenticated;
grant execute on all functions in schema belast to anon, authenticated;
alter default privileges in schema belast
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema belast
  grant execute on functions to anon, authenticated;
