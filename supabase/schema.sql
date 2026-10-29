-- ============================================================================
-- Belast – Supabase database schema
-- Kjør dette i Supabase Dashboard → SQL Editor (én gang)
-- ============================================================================

-- 1. Hovedtabell: én rad per dag per bruker.
--    Appen forholder seg kun til denne "aktive" tabellen.
--    valid_from + day_entries_history gir SCD2-historikk (se nedenfor).
create table if not exists public.day_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  activities    text[] not null default '{}',
  load          int  not null check (load between 1 and 10),
  duration_min  int,
  sleep_score   int check (sleep_score between 1 and 10),
  nutrition_score int check (nutrition_score between 1 and 10),
  note          text,
  pains         jsonb not null default '[]',
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false,
  valid_from    timestamptz not null,
  unique (user_id, date)
);

-- Indeks for raske oppslag
create index if not exists day_entries_user_date_idx on public.day_entries (user_id, date);

-- 2. Dimensjonstabell: brukerstyrte kategorier (type trening / smertested).
--    Aktivitetstyper og kroppsdeler i day_entries refererer til `key` her.
--    Inaktive rader (active = false) beholdes slik at historikk ikke mister etiketter.
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('activity', 'body_part')),
  key         text not null,
  label       text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  valid_from  timestamptz not null,
  unique (user_id, kind, key)
);

create index if not exists categories_user_kind_idx on public.categories (user_id, kind);

-- Seed standardkategorier for eksisterende brukere (én gang).
-- Kjører bare for brukere som ikke allerede har kategorier.
do $$
declare
  u record;
  defaults_activity text[][] := array[
    array['kamp_akademi', 'Kamp – akademi', '10'],
    array['trening_akademi', 'Trening – akademi', '20'],
    array['kamp_hana', 'Kamp – Hana', '30'],
    array['trening_hana', 'Trening – Hana', '40'],
    array['egentrening', 'Egentrening', '50'],
    array['styrketrening', 'Styrketrening', '60'],
    array['gym', 'Gym', '70'],
    array['annet', 'Annet', '999']
  ];
  defaults_body_part text[][] := array[
    array['rygg', 'Rygg', '10'],
    array['hofte', 'Hofte', '20'],
    array['lar', 'Lår', '30'],
    array['kne', 'Kne', '40'],
    array['legg', 'Legg', '50'],
    array['fot', 'Fot', '60'],
    array['annet', 'Annet', '70']
  ];
  row_data text[];
begin
  for u in select id from auth.users loop
    if not exists (select 1 from public.categories where user_id = u.id) then
      foreach row_data slice 1 in array defaults_activity loop
        insert into public.categories (user_id, kind, key, label, sort_order, active, valid_from)
        values (u.id, 'activity', row_data[1], row_data[2], row_data[3]::int, true, now())
        on conflict (user_id, kind, key) do nothing;
      end loop;
      foreach row_data slice 1 in array defaults_body_part loop
        insert into public.categories (user_id, kind, key, label, sort_order, active, valid_from)
        values (u.id, 'body_part', row_data[1], row_data[2], row_data[3]::int, true, now())
        on conflict (user_id, kind, key) do nothing;
      end loop;
    end if;
  end loop;
end $$;

-- 2b. Ukeplaner: én rad per plan per bruker (planlagt trening mandag–søndag).
--     Slettede planer beholdes som tombstones (deleted = true) slik at
--     sletting synkroniseres til andre enheter.
create table if not exists public.week_plans (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  favorite    boolean not null default false,
  days        jsonb not null default '[]',
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false,
  valid_from  timestamptz not null default now()
);

create index if not exists week_plans_user_idx on public.week_plans (user_id);

-- 3. Row Level Security: brukere kan KUN se og endre egne rader
alter table public.day_entries enable row level security;

drop policy if exists "Brukere ser egne rader" on public.day_entries;
create policy "Brukere ser egne rader"
  on public.day_entries for select
  using (auth.uid() = user_id);

drop policy if exists "Brukere skriver egne rader" on public.day_entries;
create policy "Brukere skriver egne rader"
  on public.day_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Brukere oppdaterer egne rader" on public.day_entries;
create policy "Brukere oppdaterer egne rader"
  on public.day_entries for update
  using (auth.uid() = user_id);

drop policy if exists "Brukere sletter egne rader" on public.day_entries;
create policy "Brukere sletter egne rader"
  on public.day_entries for delete
  using (auth.uid() = user_id);

-- RLS for kategorier (samme mønster)
alter table public.categories enable row level security;

-- RLS for ukeplaner (samme mønster)
alter table public.week_plans enable row level security;

drop policy if exists "Brukere ser egne planer" on public.week_plans;
create policy "Brukere ser egne planer"
  on public.week_plans for select
  using (auth.uid() = user_id);

drop policy if exists "Brukere skriver egne planer" on public.week_plans;
create policy "Brukere skriver egne planer"
  on public.week_plans for insert
  with check (auth.uid() = user_id);

drop policy if exists "Brukere oppdaterer egne planer" on public.week_plans;
create policy "Brukere oppdaterer egne planer"
  on public.week_plans for update
  using (auth.uid() = user_id);

drop policy if exists "Brukere sletter egne planer" on public.week_plans;
create policy "Brukere sletter egne planer"
  on public.week_plans for delete
  using (auth.uid() = user_id);

drop policy if exists "Brukere ser egne kategorier" on public.categories;
create policy "Brukere ser egne kategorier"
  on public.categories for select
  using (auth.uid() = user_id);

drop policy if exists "Brukere skriver egne kategorier" on public.categories;
create policy "Brukere skriver egne kategorier"
  on public.categories for insert
  with check (auth.uid() = user_id);

drop policy if exists "Brukere oppdaterer egne kategorier" on public.categories;
create policy "Brukere oppdaterer egne kategorier"
  on public.categories for update
  using (auth.uid() = user_id);

drop policy if exists "Brukere sletter egne kategorier" on public.categories;
create policy "Brukere sletter egne kategorier"
  on public.categories for delete
  using (auth.uid() = user_id);

-- 4. Realtime: appen får beskjed når data endres på en annen enhet.
--    (Idempotent: sjekker først om tabellen allerede er med i publikasjonen,
--    ellers feiler `alter publication` ved gjentatt kjøring.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'day_entries'
  ) then
    alter publication supabase_realtime add table public.day_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'week_plans'
  ) then
    alter publication supabase_realtime add table public.week_plans;
  end if;
end $$;

-- 5. SCD2-historikk: én historikktabell per aktiv tabell.
--    Appen skriver aldri til historikken — triggerne under gjør det automatisk
--    på INSERT/UPDATE/DELETE. Hver historikkrad er én versjon med
--    gyldighetsintervall [valid_from, valid_to).
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
  valid_to    timestamptz not null
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

create index if not exists day_entries_history_user_date_idx
  on public.day_entries_history (user_id, date, valid_from);
create index if not exists categories_history_user_idx
  on public.categories_history (user_id, kind, key, valid_from);
create index if not exists week_plans_history_user_idx
  on public.week_plans_history (user_id, id, valid_from);

-- valid_from settes automatisk ved INSERT/UPDATE (default: updated_at)
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

-- Arkiver forrige versjon av raden i historikk ved UPDATE/DELETE.
-- (INSERT gir ingen historikkrad — første versjon arkiveres ved første endring.)
create or replace function public.archive_row_version()
returns trigger
language plpgsql
security definer
as $$
declare
  v_valid_to timestamptz := coalesce(new.updated_at, now());
begin
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

-- RLS for historikktabeller: brukere ser kun egen historikk.
-- Appen skriver aldri til historikken — kun trigger-funksjonen gjør det
-- (security definer), så INSERT-policy med check (true) er trygt.
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

-- 6. Hjelpefunksjon: slett ALLE data (aktiv + historikk) for innlogget bruker (GDPR art. 17)
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
-- Ferdig! Etter dette:
--   1. Gå til Authentication → Providers → Email
--   2. FJERN haken for "Confirm email" (kritisk for første innlogging)
--   3. Authentication → Users → Add user:
--        Email: cbl@belast.app
--        Password: Fotball33
--        Auto Confirm User: ✅ (hak av)
--   4. (Valgfritt) Sett visningsnavn i brukerens metadata:
--        user_metadata: { "player_name": "Ola" }
-- ============================================================================
