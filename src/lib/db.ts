import Dexie, { type Table } from 'dexie';
import type { DayEntry, Profile, AppSettings } from './types';

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

  constructor() {
    super('belast');
    this.version(2).stores({
      days: 'id, date, updatedAt',
      kv: 'key',
      syncMeta: 'date, syncedAt, dirty',
      conflicts: '++id, date, detectedAt'
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

export async function getProfile(): Promise<Profile> {
  return kvGet<Profile>('profile', { playerName: '', team: '' });
}

export async function saveProfile(profile: Profile): Promise<void> {
  await kvSet('profile', profile);
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
