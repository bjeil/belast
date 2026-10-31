import type { ActivityType, BodyPart, Category, DayEntry, PainEntry, WeekPlan } from './types';

/** Supabase-rad slik den lagres i databasen (hybrid struktur). */
export interface DayEntryRow {
  id: string;
  user_id: string;
  date: string; // yyyy-MM-dd
  activities: ActivityType[]; // tekstnøkler, f.eks. "kamp_akademi"
  load: number | null;
  duration_min: number | null;
  sleep_score: number | null;
  nutrition_score: number | null;
  note: string | null;
  pains: PainEntry[]; // jsonb
  updated_at: string; // ISO
  deleted: boolean;
}

/** Supabase-rad for dimensjonstabellen `categories`. */
export interface CategoryRow {
  id: string; // uuid
  user_id: string;
  kind: 'activity' | 'body_part';
  key: string;
  label: string;
  sort_order: number;
  active: boolean;
  updated_at: string;
}

/** Konverterer lokal DayEntry → database-rad (uten id/user_id, settes ved upsert). */
export function entryToRow(entry: DayEntry, userId: string): Omit<DayEntryRow, 'id'> {
  return {
    user_id: userId,
    date: entry.date,
    activities: entry.activities,
    load: entry.load,
    duration_min: entry.durationMin ?? null,
    sleep_score: entry.sleepScore ?? null,
    nutrition_score: entry.nutritionScore ?? null,
    note: entry.note ?? null,
    pains: entry.pains,
    updated_at: entry.updatedAt,
    deleted: false
  };
}

/** Konverterer database-rad → lokal DayEntry. */
export function rowToEntry(row: DayEntryRow): DayEntry {
  return {
    id: row.date,
    date: row.date,
    activities: row.activities,
    load: row.load,
    durationMin: row.duration_min ?? undefined,
    sleepScore: row.sleep_score ?? undefined,
    nutritionScore: row.nutrition_score ?? undefined,
    pains: row.pains,
    note: row.note ?? undefined,
    updatedAt: row.updated_at
  };
}

/** Supabase-rad for ukeplaner (tabellen `week_plans`). */
export interface WeekPlanRow {
  id: string; // uuid — samme som lokal plan-id
  user_id: string;
  name: string;
  favorite: boolean;
  days: WeekPlan['days']; // jsonb
  updated_at: string; // ISO
  deleted: boolean;
}

/** Konverterer lokal plan → database-rad. */
export function planToRow(plan: WeekPlan, userId: string): WeekPlanRow {
  return {
    id: plan.id,
    user_id: userId,
    name: plan.name,
    favorite: plan.favorite,
    days: plan.days,
    updated_at: plan.updatedAt,
    deleted: false
  };
}

/** Konverterer database-rad → lokal plan. */
export function rowToPlan(row: WeekPlanRow): WeekPlan {
  return {
    id: row.id,
    name: row.name,
    favorite: row.favorite,
    days: row.days,
    updatedAt: row.updated_at
  };
}

/**
 * Robust dyp-sammenligning av vilkårlige verdier (objekter, arrayer, primitiver).
 * Rekkefølgen på nøkler i objekter er irrelevant — viktig fordi Postgres
 * jsonb alltid returnerer nøkler i alfabetisk rekkefølge, mens lokalt
 * JSON.stringify kan ha en annen rekkefølge.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
  }
  return false;
}

/** Sammenligner to planversjoner (innhold, ikke tidsstempel). */
export function samePlanContent(a: WeekPlan, b: WeekPlan): boolean {
  return (
    a.name === b.name &&
    a.favorite === b.favorite &&
    deepEqual(a.days, b.days)
  );
}

/** Konverterer lokal kategori → database-rad (uten id, settes ved upsert). */
export function categoryToRow(category: Category, userId: string): Omit<CategoryRow, 'id'> {
  return {
    user_id: userId,
    kind: category.kind,
    key: category.key,
    label: category.label,
    sort_order: category.sortOrder,
    active: category.active,
    updated_at: category.updatedAt
  };
}

/** Konverterer database-rad → lokal kategori. */
export function rowToCategory(row: CategoryRow): Category {
  return {
    userId: row.user_id,
    kind: row.kind,
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
    active: row.active,
    updatedAt: row.updated_at
  };
}

/** Sammenligner to versjoner av samme dag — true hvis like (for konfliktsjekk). */
export function sameDayContent(a: DayEntry, b: DayEntry): boolean {
  return (
    (a.load ?? null) === (b.load ?? null) &&
    a.durationMin === b.durationMin &&
    (a.sleepScore ?? null) === (b.sleepScore ?? null) &&
    (a.nutritionScore ?? null) === (b.nutritionScore ?? null) &&
    a.note === b.note &&
    deepEqual(a.activities, b.activities) &&
    deepEqual(a.pains, b.pains)
  );
}

/** Sammenligner to kategoriversjoner (innhold, ikke tidsstempel). */
export function sameCategoryContent(a: Category, b: Category): boolean {
  return (
    a.kind === b.kind &&
    a.key === b.key &&
    a.label === b.label &&
    a.sortOrder === b.sortOrder &&
    a.active === b.active
  );
}

/** Typesikker cast for pains fra jsonb (validerer struktur). */
export function parsePains(raw: unknown): PainEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is PainEntry =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as PainEntry).bodyPart === 'string' &&
      typeof (p as PainEntry).level === 'number'
  );
}
