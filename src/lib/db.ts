import Dexie, { type Table } from 'dexie';
import type { DayEntry, Profile, AppSettings } from './types';

export interface KeyValueRow {
  key: string;
  value: unknown;
}

class TrainingDB extends Dexie {
  days!: Table<DayEntry, string>;
  kv!: Table<KeyValueRow, string>;

  constructor() {
    super('viking-treningsdagbok');
    this.version(1).stores({
      days: 'id, date, updatedAt',
      kv: 'key'
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
}

export async function deleteEntry(date: string): Promise<void> {
  await db.days.delete(date);
}

export async function clearAllEntries(): Promise<void> {
  await db.days.clear();
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
