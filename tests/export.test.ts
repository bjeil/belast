import { describe, expect, it } from 'vitest';
import type { Category, DayEntry } from '../src/lib/types';
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

describe('backup roundtrip', () => {
  it('bygger og parser backup (v2) uten tap av data', () => {
    const backup = buildBackup(entries, categories);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.format).toBe('belast-backup');
    expect(parsed.version).toBe(2);
    expect(parsed.categories).toEqual(categories);
    expect(parsed.entries).toEqual(entries);
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
