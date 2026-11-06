import { describe, expect, it, vi } from 'vitest';
import type { DayEntry } from '../src/lib/types';

const kvStore = new Map<string, unknown>();
vi.mock('../src/lib/db', () => ({
  kvGet: async <T>(key: string, fallback: T): Promise<T> => (kvStore.has(key) ? (kvStore.get(key) as T) : fallback),
  kvSet: async (key: string, value: unknown) => { kvStore.set(key, value); }
}));

import { mapLegacyActivities, mapLegacyActivityKey, isRestActivities, migrateRestDayLoadToNull } from '../src/lib/migrations';

describe('mapLegacyActivityKey', () => {
  it('mapper sonelag-nøkler til akademi', () => {
    expect(mapLegacyActivityKey('kamp_sonelag')).toBe('kamp_akademi');
    expect(mapLegacyActivityKey('trening_sonelag')).toBe('trening_akademi');
  });

  it('lar andre nøkler være urørt', () => {
    expect(mapLegacyActivityKey('kamp_hana')).toBe('kamp_hana');
    expect(mapLegacyActivityKey('egentrening')).toBe('egentrening');
    expect(mapLegacyActivityKey('hviledag')).toBe('hviledag');
    expect(mapLegacyActivityKey('styrketrening')).toBe('styrketrening');
  });
});

describe('mapLegacyActivities', () => {
  it('mapper alle aktiviteter i en liste', () => {
    const { activities, changed } = mapLegacyActivities(['kamp_sonelag', 'egentrening']);
    expect(activities).toEqual(['kamp_akademi', 'egentrening']);
    expect(changed).toBe(true);
  });

  it('fjerner duplikater som oppstår ved mapping', () => {
    const { activities, changed } = mapLegacyActivities(['kamp_sonelag', 'kamp_akademi']);
    expect(activities).toEqual(['kamp_akademi']);
    expect(changed).toBe(true);
  });

  it('rapporterer changed=false når ingenting må mappes', () => {
    const { activities, changed } = mapLegacyActivities(['trening_hana', 'hviledag']);
    expect(activities).toEqual(['trening_hana', 'hviledag']);
    expect(changed).toBe(false);
  });
});

describe('isRestActivities', () => {
  it('er true for tom liste og kun hviledag', () => {
    expect(isRestActivities([])).toBe(true);
    expect(isRestActivities(['hviledag'])).toBe(true);
  });

  it('er false for ekte treningsaktiviteter', () => {
    expect(isRestActivities(['kamp_akademi'])).toBe(false);
    expect(isRestActivities(['hviledag', 'gym'])).toBe(false);
  });
});

describe('migrateRestDayLoadToNull', () => {
  const entry = (date: string, partial: Partial<DayEntry> = {}): DayEntry => ({
    id: date,
    date,
    activities: ['kamp_akademi'],
    load: 5,
    pains: [],
    updatedAt: '2025-06-15T12:00:00.000Z',
    ...partial
  });

  it('setter load = null på hviledager, lar andre dager være', async () => {
    kvStore.clear();
    const entries = [
      entry('2025-06-10', { activities: ['hviledag'], load: 5 }),
      entry('2025-06-11', { activities: [], load: 7 }),
      entry('2025-06-12', { activities: ['kamp_akademi'], load: 8 }),
      entry('2025-06-13', { activities: ['hviledag'], load: null })
    ];
    const saved: DayEntry[] = [];
    const changed = await migrateRestDayLoadToNull(
      async () => entries,
      async (e) => { saved.push(e); }
    );
    expect(changed).toBe(2);
    expect(saved.map((e) => e.date).sort()).toEqual(['2025-06-10', '2025-06-11']);
    expect(saved.every((e) => e.load === null)).toBe(true);
  });

  it('er idempotent (kjører bare én gang)', async () => {
    kvStore.clear();
    const entries = [entry('2025-06-10', { activities: ['hviledag'], load: 5 })];
    const saved: DayEntry[] = [];
    const save = async (e: DayEntry) => { saved.push(e); };
    expect(await migrateRestDayLoadToNull(async () => entries, save)).toBe(1);
    expect(await migrateRestDayLoadToNull(async () => entries, save)).toBe(0);
    expect(saved).toHaveLength(1);
  });
});
