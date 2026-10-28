import type { PlannedDay, WeekPlan } from './types';
import { WEEKDAY_LABELS } from './dates';

/**
 * Ukeplaner lagres i localStorage — IKKE i IndexedDB/Dexie (samme begrunnelse
 * som kategorier, se lib/categories.ts: en Dexie-oppgradering blokkeres mens
 * andre instanser har databasen åpen, og da henger hele appen).
 * Planene synkroniseres via Supabase (tabellen `week_plans`).
 */
const STORAGE_KEY = 'belast:weekPlans:v1';

/** Tombstones for planer slettet lokalt (skal pushes som sletting til skyen). */
const TOMBSTONE_KEY = 'belast:weekPlans:deleted:v1';

export interface PlanTombstone {
  id: string;
  deletedAt: string; // ISO
}

/** Tom uke: 7 dager mandag–søndag uten økter. */
export function emptyWeekDays(): PlannedDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday: weekday as PlannedDay['weekday'],
    sessions: []
  }));
}

/** Lag en ny, tom plan. */
export function createPlan(name: string): WeekPlan {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Ukeplan',
    favorite: false,
    days: emptyWeekDays(),
    updatedAt: new Date().toISOString()
  };
}

export interface PlanSummary {
  sessions: number; // antall planlagte økter
  totalLoad: number; // sum planlagt belastning
  totalDurationMin: number; // sum planlagt tid
  activeDays: number; // dager med minst én økt
}

/** Dashboard-oppsummering av én plan. */
export function summarizePlan(plan: WeekPlan): PlanSummary {
  let sessions = 0;
  let totalLoad = 0;
  let totalDurationMin = 0;
  let activeDays = 0;
  for (const day of plan.days) {
    if (day.sessions.length > 0) activeDays++;
    for (const s of day.sessions) {
      sessions++;
      totalLoad += s.load;
      totalDurationMin += s.durationMin;
    }
  }
  return { sessions, totalLoad, totalDurationMin, activeDays };
}

function readStore(): WeekPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is WeekPlan =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as WeekPlan).id === 'string' &&
        Array.isArray((p as WeekPlan).days)
    );
  } catch {
    return [];
  }
}

function writeStore(plans: WeekPlan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // localStorage full eller privat modus — valgene fungerer for økten
  }
}

/** Alle planer: favoritter først, deretter sist endret først. */
export async function getAllPlans(): Promise<WeekPlan[]> {
  const all = readStore();
  return all.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function getPlan(id: string): Promise<WeekPlan | undefined> {
  return readStore().find((p) => p.id === id);
}

/** Opprett eller oppdater plan lokalt og merk den dirty for synk. */
export async function savePlan(plan: WeekPlan): Promise<void> {
  const all = readStore();
  const idx = all.findIndex((p) => p.id === plan.id);
  const row: WeekPlan = { ...plan, dirty: true, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = row;
  else all.push(row);
  writeStore(all);
}

/** Slett plan lokalt og registrer tombstone slik at sletting synkroniseres. */
export async function deletePlan(id: string): Promise<void> {
  writeStore(readStore().filter((p) => p.id !== id));
  const tombstones = readTombstones();
  if (!tombstones.some((t) => t.id === id)) {
    tombstones.push({ id, deletedAt: new Date().toISOString() });
    writeTombstones(tombstones);
  }
}

function readTombstones(): PlanTombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is PlanTombstone =>
        !!t && typeof t === 'object' && typeof (t as PlanTombstone).id === 'string'
    );
  } catch {
    return [];
  }
}

function writeTombstones(tombstones: PlanTombstone[]): void {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones));
  } catch {
    // ignore
  }
}

/** Alle tombstones (planer slettet lokalt, ikke ennå bekreftet i skyen). */
export async function getPlanTombstones(): Promise<PlanTombstone[]> {
  return readTombstones();
}

/** Fjern tombstone etter vellykket push av sletting. */
export async function markPlanTombstoneSynced(id: string): Promise<void> {
  writeTombstones(readTombstones().filter((t) => t.id !== id));
}

/** Hent alle dirty planer (ikke-synkede endringer). */
export async function getDirtyPlans(): Promise<WeekPlan[]> {
  return readStore().filter((p) => !!p.dirty);
}

/** Merk plan som synkronisert (kalles etter vellykket push). */
export async function markPlanSynced(id: string, patch: Partial<WeekPlan> = {}): Promise<void> {
  const all = readStore();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...patch, dirty: false };
  writeStore(all);
}

/** Slett alle planer og tombstones lokalt (ved «slett alle data»). */
export async function clearAllPlans(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOMBSTONE_KEY);
  } catch {
    // ignore
  }
}

/** Etikett for en planlagt dag (0 = mandag … 6 = søndag). */
export function planDayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? '';
}
