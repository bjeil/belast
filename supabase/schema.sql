-- ============================================================================
-- Belast – Supabase database schema
-- Kjør dette i Supabase Dashboard → SQL Editor ( én gang )
-- ============================================================================

-- 1. Hovedtabell: én rad per dag per bruker
create table if not exists public.day_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  activities    text[] not null default '{}',
  load          int  not null check (load between 1 and 10),
  duration_min  int,
  note          text,
  pains         jsonb not null default '[]',
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false,
  unique (user_id, date)
);

-- Indeks for raske oppslag
create index if not exists day_entries_user_date_idx on public.day_entries (user_id, date);

-- 2. Row Level Security: brukere kan KUN se og endre egne rader
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

-- 3. Realtime: appen får beskjed når data endres på en annen enhet
alter publication supabase_realtime add table public.day_entries;

-- 4. Hjelpefunksjon: slett ALLE data for innlogget bruker (GDPR art. 17)
create or replace function public.delete_all_my_data()
returns void
language sql
security definer
as $$
  delete from public.day_entries where user_id = auth.uid();
$$;

-- ============================================================================
-- Ferdig! Etter dette:
--   1. Gå til Authentication → Providers → Email
--   2. FJERN haken for "Confirm email" (kritisk for første innlogging)
--   3. Authentication → Users → Add user:
--        Email: cbl@belast.app
--        Password: Fotball33
--        Auto Confirm User: ✅ (hak av)
-- ============================================================================
