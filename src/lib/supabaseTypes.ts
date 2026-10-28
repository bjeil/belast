import type { ActivityType, BodyPart, DayEntry, PainEntry } from './types';

/** Supabase-rad slik den lagres i databasen (hybrid struktur). */
export interface DayEntryRow {
  id: string;
  user_id: string;
  date: string; // yyyy-MM-dd
  activities: ActivityType[];
  load: number;
  duration_min: number | null;
  note: string | null;
  pains: PainEntry[]; // jsonb
  updated_at: string; // ISO
  deleted: boolean;
}

/** Konverterer lokal DayEntry → database-rad (uten id/user_id, settes ved upsert). */
export function entryToRow(entry: DayEntry, userId: string): Omit<DayEntryRow, 'id'> {
  return {
    user_id: userId,
    date: entry.date,
    activities: entry.activities,
    load: entry.load,
    duration_min: entry.durationMin ?? null,
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
    pains: row.pains,
    note: row.note ?? undefined,
    updatedAt: row.updated_at
  };
}

/** Sammenligner to versjoner av samme dag — true hvis like (for konfliktsjekk). */
export function sameDayContent(a: DayEntry, b: DayEntry): boolean {
  return (
    a.load === b.load &&
    a.durationMin === b.durationMin &&
    a.note === b.note &&
    JSON.stringify(a.activities) === JSON.stringify(b.activities) &&
    JSON.stringify(a.pains) === JSON.stringify(b.pains)
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

export const BODY_PARTS_SET: ReadonlySet<string> = new Set<BodyPart>([
  'rygg', 'hofte', 'lar', 'kne', 'legg', 'fot', 'annet'
]);
