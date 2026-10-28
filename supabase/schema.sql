-- ============================================================================
-- Belast – Supabase database schema
-- Kjør dette i Supabase Dashboard → SQL Editor (én gang)
-- ============================================================================

-- 1. Hovedtabell: én rad per dag per bruker
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
        insert into public.categories (user_id, kind, key, label, sort_order, active)
        values (u.id, 'activity', row_data[1], row_data[2], row_data[3]::int, true)
        on conflict (user_id, kind, key) do nothing;
      end loop;
      foreach row_data slice 1 in array defaults_body_part loop
        insert into public.categories (user_id, kind, key, label, sort_order, active)
        values (u.id, 'body_part', row_data[1], row_data[2], row_data[3]::int, true)
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
  deleted     boolean not null default false
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

-- 5. Hjelpefunksjon: slett ALLE data for innlogget bruker (GDPR art. 17)
create or replace function public.delete_all_my_data()
returns void
language sql
security definer
as $$
  delete from public.day_entries where user_id = auth.uid();
  delete from public.categories where user_id = auth.uid();
  delete from public.week_plans where user_id = auth.uid();
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
