import { kvGet, kvSet } from './db';
import type { DayEntry } from './types';

const MIGRATION_KEY = 'migrations:activityKeysV1';

/** Gamle faste nøkler → nye standardkategorier (kjøres én gang, idempotent). */
const ACTIVITY_KEY_MAP: Record<string, string> = {
  kamp_sonelag: 'kamp_akademi',
  trening_sonelag: 'trening_akademi'
};

export function mapLegacyActivityKey(key: string): string {
  return ACTIVITY_KEY_MAP[key] ?? key;
}

export function mapLegacyActivities(activities: string[]): {
  activities: string[];
  changed: boolean;
} {
  let changed = false;
  const mapped = activities.map((a) => {
    const next = mapLegacyActivityKey(a);
    if (next !== a) changed = true;
    return next;
  });
  // Fjern duplikater som kan oppstå ved mapping (f.eks. begge fantes)
  return { activities: [...new Set(mapped)], changed };
}

/**
 * Kjør én-gangs migrering av aktivitetsnøkler i alle lokale dager.
 * Returnerer antall dager som ble endret. Idempotent.
 */
export async function migrateLegacyActivityKeys(
  getAll: () => Promise<DayEntry[]>,
  save: (entry: DayEntry) => Promise<void>
): Promise<number> {
  if (await kvGet<boolean>(MIGRATION_KEY, false)) return 0;
  let changedCount = 0;
  for (const entry of await getAll()) {
    const { activities, changed } = mapLegacyActivities(entry.activities);
    if (changed) {
      changedCount++;
      await save({ ...entry, activities });
    }
  }
  await kvSet(MIGRATION_KEY, true);
  return changedCount;
}
