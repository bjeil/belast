import { describe, expect, it } from 'vitest';
import type { DayEntry } from '../src/lib/types';
import { buildBackup, parseBackup } from '../src/lib/export';

const entries: DayEntry[] = [
  {
    id: '2025-06-10',
    date: '2025-06-10',
    activities: ['kamp_sonelag', 'egentrening'],
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
  it('bygger og parser backup uten tap av data', () => {
    const profile = { playerName: 'Ola', birthYear: 2012, team: 'G13' };
    const backup = buildBackup(profile, entries);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.format).toBe('belast-backup');
    expect(parsed.profile).toEqual(profile);
    expect(parsed.entries).toEqual(entries);
  });

  it('avviser ugyldige filer', () => {
    expect(() => parseBackup('{"format":"nope"}')).toThrow();
    expect(() => parseBackup('ikke json')).toThrow();
  });
});
