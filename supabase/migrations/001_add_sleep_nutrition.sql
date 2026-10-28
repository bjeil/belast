-- ============================================================================
-- Belast – migrasjon: legg til søvn- og næringsscore (issue #15)
-- Kjør dette i Supabase Dashboard → SQL Editor for EKSISTERENDE databaser.
-- Nye installasjoner kjører hele supabase/schema.sql og trenger ikke dette.
-- Idempotent: trygt å kjøre flere ganger.
-- ============================================================================

alter table public.day_entries
  add column if not exists sleep_score int check (sleep_score between 1 and 10);

alter table public.day_entries
  add column if not exists nutrition_score int check (nutrition_score between 1 and 10);
