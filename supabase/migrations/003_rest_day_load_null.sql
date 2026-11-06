-- ============================================================================
-- Belast – migrasjon: hviledager skal ha load = NULL (ikke 5) (issue #27)
-- Kjør dette i Supabase Dashboard → SQL Editor for EKSISTERENDE databaser.
-- Nye installasjoner kjører hele supabase/schema.sql og trenger ikke dette.
-- Idempotent: trygt å kjøre flere ganger.
--
-- Hva dette gjør:
--   1. load blir nullable (check-tillater NULL, 1-10 ellers).
--   2. Eksisterende hviledagsrader (activities = '{hviledag}' eller tom array)
--      får load = NULL. Historikken (SCD2) arkiverer gamle versjoner via trigger.
-- ============================================================================

-- 1. Fjern gammel check og sett ny som også tillater NULL
alter table public.day_entries
  drop constraint if exists day_entries_load_check;

alter table public.day_entries
  add constraint day_entries_load_check check (load is null or load between 1 and 10);

-- 2. Nullstill load på hviledager (denne UPDATE-en arkiveres i historikken)
update public.day_entries
set load = null, updated_at = now()
where not deleted
  and (activities = '{}' or activities = '{hviledag}');
