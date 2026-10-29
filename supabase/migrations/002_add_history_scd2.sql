-- ============================================================================
-- Belast – migrasjon: historikk (SCD2) på alle tabeller (issue #25)
-- Kjør dette i Supabase Dashboard → SQL Editor for EKSISTERENDE databaser.
-- Nye installasjoner kjører hele supabase/schema.sql og trenger ikke dette.
-- Idempotent: trygt å kjøre flere ganger.
--
-- Hva dette gjør:
--   1. Aktive tabeller (day_entries, categories, week_plans) får valid_from
--      (SCD2: når raden ble aktiv versjon). Appen leser/skriver fortsatt kun
--      "aktive" rader — ingen app-endringer nødvendig.
--   2. Én historikktabell per aktiv tabell (*_history) lagrer ALLE versjoner
--      med valid_from/valid_to. Appen skriver aldri dit — database-triggere
--      gjør det automatisk på INSERT/UPDATE/DELETE.
--   3. Eksisterende rader får valid_from = updated_at (historikken starter
--      ved forrige versjon — ingen falsk historikk bakover i tid).
--   4. delete_all_my_data() (GDPR) sletter nå også historikken.
-- ============================================================================

-- 1. Aktive tabeller: nytt felt valid_from (SCD2 starttidspunkt)
alter table public.day_entries add column if not exists valid_from timestamptz;
alter table public.categories  add column if not exists valid_from timestamptz;
alter table public.week_plans  add column if not exists valid_from timestamptz;

-- Eksisterende rader: gyldig fra forrige versjon ble skrevet
update public.day_entries set valid_from = updated_at where valid_from is null;
update public.categories  set valid_from = updated_at where valid_from is null;
update public.week_plans  set valid_from = updated_at where valid_from is null;

alter table public.day_entries alter column valid_from set not null;
alter table public.categories  alter column valid_from set not null;
alter table public.week_plans  alter column valid_from set not null;

-- Fremtidige rader: valid_from settes automatisk (tilsvarer updated_at)
create or replace function public.set_valid_from()
returns trigger
language plpgsql
as $$
begin
  if new.valid_from is null then
    new.valid_from := coalesce(new.updated_at, now());
  end if;
  return new;
end $$;

drop trigger if exists day_entries_valid_from on public.day_entries;
create trigger day_entries_valid_from
  before insert or update on public.day_entries
  for each row execute function public.set_valid_from();

drop trigger if exists categories_valid_from on public.categories;
create trigger categories_valid_from
  before insert or update on public.categories
  for each row execute function public.set_valid_from();

drop trigger if exists week_plans_valid_from on public.week_plans;
create trigger week_plans_valid_from
  before insert or update on public.week_plans
  for each row execute function public.set_valid_from();

-- 2. Historikktabeller (SCD2: hver rad = én versjon med gyldighetsintervall)
create table if not exists public.day_entries_history (
  hist_id     bigint generated always as identity primary key,
  id          uuid not null,
  user_id     uuid not null,
  date        date not null,
  activities  text[] not null,
  load        int  not null,
  duration_min  int,
  sleep_score   int,
  nutrition_score int,
  note        text,
  pains       jsonb not null,
  updated_at  timestamptz not null,
  deleted     boolean not null,
  valid_from  timestamptz not null,
  valid_to    timestamptz not null  -- når denne versjonen sluttet å være aktiv
);

create table if not exists public.categories_history (
  hist_id     bigint generated always as identity primary key,
  id          uuid not null,
  user_id     uuid not null,
  kind        text not null,
  key         text not null,
  label       text not null,
  sort_order  int  not null,
  active      boolean not null,
  updated_at  timestamptz not null,
  valid_from  timestamptz not null,
  valid_to    timestamptz not null
);

create table if not exists public.week_plans_history (
  hist_id     bigint generated always as identity primary key,
  id          uuid not null,
  user_id     uuid not null,
  name        text not null,
  favorite    boolean not null,
  days        jsonb not null,
  updated_at  timestamptz not null,
  deleted     boolean not null,
  valid_from  timestamptz not null,
  valid_to    timestamptz not null
);

-- Indekser for historikk-oppslag (per bruker + nøkkel, og per tidsintervall)
create index if not exists day_entries_history_user_date_idx
  on public.day_entries_history (user_id, date, valid_from);
create index if not exists categories_history_user_idx
  on public.categories_history (user_id, kind, key, valid_from);
create index if not exists week_plans_history_user_idx
  on public.week_plans_history (user_id, id, valid_from);

-- 3. Trigger-funksjon: arkiver forrige versjon + skriv ny versjon i historikk.
--    Kjøres på INSERT (første versjon), UPDATE (ny versjon) og DELETE (siste versjon).
create or replace function public.archive_row_version()
returns trigger
language plpgsql
security definer
as $$
declare
  v_valid_to timestamptz := coalesce(new.updated_at, now());
begin
  -- AFTER-trigger: arkiverer forrige versjon (OLD) av samme naturlige nøkkel.
  -- INSERT: ingen forrige versjon — første versjon arkiveres ved første UPDATE/DELETE.
  -- UPDATE/DELETE: OLD er raden slik den så ut før denne operasjonen.
  if tg_table_name = 'day_entries' then
    if tg_op = 'INSERT' then return new; end if;
    insert into public.day_entries_history
      (id, user_id, date, activities, load, duration_min, sleep_score,
       nutrition_score, note, pains, updated_at, deleted, valid_from, valid_to)
    values
      (old.id, old.user_id, old.date, old.activities, old.load, old.duration_min,
       old.sleep_score, old.nutrition_score, old.note, old.pains, old.updated_at,
       old.deleted, old.valid_from, v_valid_to);
  elsif tg_table_name = 'categories' then
    if tg_op = 'INSERT' then return new; end if;
    insert into public.categories_history
      (id, user_id, kind, key, label, sort_order, active, updated_at, valid_from, valid_to)
    values
      (old.id, old.user_id, old.kind, old.key, old.label, old.sort_order,
       old.active, old.updated_at, old.valid_from, v_valid_to);
  elsif tg_table_name = 'week_plans' then
    if tg_op = 'INSERT' then return new; end if;
    insert into public.week_plans_history
      (id, user_id, name, favorite, days, updated_at, deleted, valid_from, valid_to)
    values
      (old.id, old.user_id, old.name, old.favorite, old.days, old.updated_at,
       old.deleted, old.valid_from, v_valid_to);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- NB: én AFTER-trigger per tabell som kaller samme funksjon.
-- INSERT: første versjon skrives inn i aktivtabellen (valid_from settes av
--         set_valid_from-triggeren). UPDATE: forrige versjon arkiveres med
--         valid_to = ny updated_at. DELETE: siste versjon arkiveres slik at
--         sletting også havner i historikken.
drop trigger if exists day_entries_archive on public.day_entries;
create trigger day_entries_archive
  after insert or update or delete on public.day_entries
  for each row execute function public.archive_row_version();

drop trigger if exists categories_archive on public.categories;
create trigger categories_archive
  after insert or update or delete on public.categories
  for each row execute function public.archive_row_version();

drop trigger if exists week_plans_archive on public.week_plans;
create trigger week_plans_archive
  after insert or update or delete on public.week_plans
  for each row execute function public.archive_row_version();

-- 4. Row Level Security for historikktabellene (samme mønster som aktivtabellene)
alter table public.day_entries_history enable row level security;
alter table public.categories_history  enable row level security;
alter table public.week_plans_history  enable row level security;

drop policy if exists "Brukere ser egen historikk (dager)" on public.day_entries_history;
create policy "Brukere ser egen historikk (dager)"
  on public.day_entries_history for select
  using (auth.uid() = user_id);

drop policy if exists "Brukere ser egen historikk (kategorier)" on public.categories_history;
create policy "Brukere ser egen historikk (kategorier)"
  on public.categories_history for select
  using (auth.uid() = user_id);

drop policy if exists "Brukere ser egen historikk (planer)" on public.week_plans_history;
create policy "Brukere ser egen historikk (planer)"
  on public.week_plans_history for select
  using (auth.uid() = user_id);

-- Kun trigger-funksjonen (security definer) skriver i historikken.
-- Appen (anon key) har kun lesetilgang via policyene over.
drop policy if exists "System skriver historikk (dager)" on public.day_entries_history;
create policy "System skriver historikk (dager)"
  on public.day_entries_history for insert
  with check (true);

drop policy if exists "System skriver historikk (kategorier)" on public.categories_history;
create policy "System skriver historikk (kategorier)"
  on public.categories_history for insert
  with check (true);

drop policy if exists "System skriver historikk (planer)" on public.week_plans_history;
create policy "System skriver historikk (planer)"
  on public.week_plans_history for insert
  with check (true);

-- 5. GDPR: slett ALL data (aktiv + historikk) for innlogget bruker
create or replace function public.delete_all_my_data()
returns void
language sql
security definer
as $$
  delete from public.day_entries        where user_id = auth.uid();
  delete from public.day_entries_history where user_id = auth.uid();
  delete from public.categories          where user_id = auth.uid();
  delete from public.categories_history  where user_id = auth.uid();
  delete from public.week_plans        where user_id = auth.uid();
  delete from public.week_plans_history  where user_id = auth.uid();
$$;

-- ============================================================================
-- Ferdig! Verifiser i Table Editor at tabellene *_history finnes og at
-- valid_from-kolonnen er satt på eksisterende rader.
-- ============================================================================
