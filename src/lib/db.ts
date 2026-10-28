import Dexie, { type Table } from 'dexie';
import type { Category, DayEntry, AppSettings } from './types';

export interface KeyValueRow {
  key: string;
  value: unknown;
}

/** Metadata for synkronisering per dag (lokal «vannmerke»). */
export interface SyncMetaRow {
  date: string; // primary key = date
  syncedAt: string; // ISO — når sist bekreftet i skyen
  dirty: boolean; // true = lokal endring ikke ennå pushet
  deleted: boolean; // true = tombstone, skal pushes som sletting
}

/** Konflikter mellom lokal og sky-versjon (sist-skrevet-vinner, taperen arkiveres). */
export interface ConflictRow {
  id?: number;
  date: string;
  detectedAt: string;
  localEntry: DayEntry;
  cloudEntry: DayEntry;
  resolution: 'local' | 'cloud';
}

class TrainingDB extends Dexie {
  days!: Table<DayEntry, string>;
  kv!: Table<KeyValueRow, string>;
  syncMeta!: Table<SyncMetaRow, string>;
  conflicts!: Table<ConflictRow, number>;
  categories!: Table<Category, number>;

  constructor() {
    super('belast');
    this.version(2).stores({
      days: 'id, date, updatedAt',
      kv: 'key',
      syncMeta: 'date, syncedAt, dirty',
      conflicts: '++id, date, detectedAt'
    });
    this.version(3).stores({
      categories: '++id, kind, key, & [kind+key]'
    });
  }
}

export const db = new TrainingDB();

export async function getAllEntries(): Promise<DayEntry[]> {
  const rows = await db.days.toArray();
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getEntry(date: string): Promise<DayEntry | undefined> {
  return db.days.get(date);
}

export async function saveEntry(entry: DayEntry): Promise<void> {
  await db.days.put({ ...entry, id: entry.date, updatedAt: new Date().toISOString() });
  await db.syncMeta.put({ date: entry.date, syncedAt: '', dirty: true, deleted: false });
}

export async function deleteEntry(date: string): Promise<void> {
  await db.days.delete(date);
  await db.syncMeta.put({ date, syncedAt: '', dirty: true, deleted: true });
}

/** Fysisk slett — brukes ved import og «slett alle data». */
export async function hardDeleteEntry(date: string): Promise<void> {
  await db.days.delete(date);
  await db.syncMeta.delete(date);
}

export async function clearAllEntries(): Promise<void> {
  await db.days.clear();
  await db.syncMeta.clear();
  await db.conflicts.clear();
}

/** Hent alle «dirty» (ikke-synkede) meta-rader. */
export async function getDirtySyncMeta(): Promise<SyncMetaRow[]> {
  return db.syncMeta.filter((m) => m.dirty).toArray();
}

/** Hent meta for én dag. */
export async function getSyncMeta(date: string): Promise<SyncMetaRow | undefined> {
  return db.syncMeta.get(date);
}

export async function markSynced(date: string, deleted = false): Promise<void> {
  await db.syncMeta.put({ date, syncedAt: new Date().toISOString(), dirty: false, deleted });
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return (row?.value as T) ?? fallback;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

export async function getSettings(): Promise<AppSettings> {
  return kvGet<AppSettings>('settings', { theme: 'dark' });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await kvSet('settings', settings);
}

/** Legg til konflikt i lokal logg. */
export async function addConflict(row: Omit<ConflictRow, 'id'>): Promise<void> {
  await db.conflicts.add(row);
}

export async function getConflicts(): Promise<ConflictRow[]> {
  return db.conflicts.orderBy('detectedAt').reverse().toArray();
}

export async function clearConflicts(): Promise<void> {
  await db.conflicts.clear();
}

// ---------------------------------------------------------------------------
// Kategorier (dimensjonstabell — også synkronisert til Supabase)
// ---------------------------------------------------------------------------

/** Hent alle kategorier (inkl. inaktive) sortert etter sortOrder. */
export async function getAllCategoryRows(): Promise<Category[]> {
  const rows = await db.categories.toArray();
  return rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder);
}

/** Hent én kategori på (kind, key). */
export async function getCategoryRow(kind: string, key: string): Promise<Category | undefined> {
  return db.categories.where('[kind+key]').equals([kind, key]).first();
}

/** Opprett eller oppdater kategori lokalt og merk den dirty for synk. */
export async function saveCategoryRow(category: Category): Promise<void> {
  const existing = await getCategoryRow(category.kind, category.key);
  const row: Category = {
    ...category,
    id: existing?.id,
    dirty: true,
    updatedAt: new Date().toISOString()
  };
  if (existing?.id !== undefined) {
    await db.categories.put(row, existing.id);
  } else {
    await db.categories.add(row);
  }
}

/** Hent alle dirty kategorier (ikke-synkede endringer). */
export async function getDirtyCategories(): Promise<Category[]> {
  return db.categories.filter((c) => !!c.dirty).toArray();
}

/** Merk kategori som synkronisert (kalles etter vellykket push). */
export async function markCategorySynced(kind: string, key: string, patch: Partial<Category> = {}): Promise<void> {
  const existing = await getCategoryRow(kind, key);
  if (!existing || existing.id === undefined) return;
  await db.categories.put({ ...existing, ...patch, dirty: false }, existing.id);
}

/** Slett alle kategorier lokalt (ved «slett alle data»). */
export async function clearAllCategories(): Promise<void> {
  await db.categories.clear();
}
