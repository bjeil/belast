import { describe, expect, it } from 'vitest';
import type { Category, DayEntry, WeekPlan } from '../src/lib/types';
import { buildBackup, parseBackup } from '../src/lib/export';

const categories: Category[] = [
  { kind: 'activity', key: 'kamp_akademi', label: 'Kamp – akademi', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' }
];

const entries: DayEntry[] = [
  {
    id: '2025-06-10',
    date: '2025-06-10',
    activities: ['kamp_akademi', 'egentrening'],
    load: 8,
    durationMin: 90,
    pains: [{ bodyPart: 'kne', level: 6, note: 'Vondt etter kamp' }],
    note: 'God kamp',
    updatedAt: '2025-06-10T20:00:00.000Z'
  },
  {
    id: '2025-06-11',
    date: '2025-06-11',
    activities: ['hviledag'],
    load: 1,
    pains: [],
    updatedAt: '2025-06-11T20:00:00.000Z'
  }
];

const plans: WeekPlan[] = [
  {
    id: 'plan-1',
    name: 'Uke 24',
    favorite: true,
    days: [
      {
        weekday: 0,
        sessions: [{ activity: 'trening_akademi', load: 5, durationMin: 60, note: 'Lett teknikk' }]
      }
    ],
    updatedAt: '2025-06-10T20:00:00.000Z'
  }
];

describe('backup roundtrip', () => {
  it('bygger og parser backup (v3) uten tap av data', () => {
    const backup = buildBackup(entries, categories, plans);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.format).toBe('belast-backup');
    expect(parsed.version).toBe(3);
    expect(parsed.categories).toEqual(categories);
    expect(parsed.entries).toEqual(entries);
    expect(parsed.plans).toEqual(plans);
  });

  it('aksepterer fortsatt gamle v2-backups (uten planer)', () => {
    const v2 = {
      format: 'belast-backup',
      version: 2,
      exportedAt: '2025-06-10T00:00:00.000Z',
      categories,
      entries
    };
    const parsed = parseBackup(JSON.stringify(v2));
    expect(parsed.entries).toEqual(entries);
    expect(parsed.categories).toEqual(categories);
    expect(parsed.plans).toBeUndefined();
  });

  it('aksepterer fortsatt gamle v1-backups (uten kategorier)', () => {
    const v1 = {
      format: 'belast-backup',
      version: 1,
      exportedAt: '2025-06-10T00:00:00.000Z',
      profile: { playerName: 'Ola', team: 'G13' },
      entries
    };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.entries).toEqual(entries);
    expect(parsed.categories).toBeUndefined();
  });

  it('avviser ugyldige filer', () => {
    expect(() => parseBackup('{"format":"nope"}')).toThrow();
    expect(() => parseBackup('ikke json')).toThrow();
  });
});
