import { describe, expect, it } from 'vitest';
import { addDays, startOfDay } from 'date-fns';
import { toISODate } from '../src/lib/dates';
import { logTableRows } from '../src/lib/stats';
import type { DayEntry } from '../src/lib/types';

const NOW = new Date('2025-06-15T12:00:00'); // en søndag

const iso = (offset: number) => toISODate(addDays(startOfDay(NOW), -offset));

function entry(date: string, partial: Partial<DayEntry> = {}): DayEntry {
  return {
    id: date,
    date,
    activities: ['trening_akademi'],
    load: 5,
    durationMin: 60,
    pains: [],
    updatedAt: '2025-06-15T12:00:00.000Z',
    ...partial
  };
}

describe('logTableRows', () => {
  it('returnerer alle datoer de siste 30 dagene, nyeste først', () => {
    const rows = logTableRows([], 30, NOW);
    expect(rows).toHaveLength(30);
    expect(rows[0].date).toBe(iso(0));
    expect(rows[29].date).toBe(iso(29));
  });

  it('mapper ukedag riktig (mandag–søndag)', () => {
    const rows = logTableRows([], 30, NOW);
    // 2025-06-15 er en søndag
    expect(rows[0].weekday).toBe('søn');
    // 2025-06-09 er en mandag
    expect(rows[6].weekday).toBe('man');
    expect(rows[6].date).toBe('2025-06-09');
  });

  it('fyller inn tid i timer, belastning og smerte for loggførte dager', () => {
    const entries = [
      entry(iso(0), { load: 8, durationMin: 90, pains: [{ bodyPart: 'kne', level: 7 }], sleepScore: 7, nutritionScore: 6 }),
      entry(iso(1), { load: 3, durationMin: 30, pains: [{ bodyPart: 'rygg', level: 2 }, { bodyPart: 'kne', level: 4 }] })
    ];
    const rows = logTableRows(entries, 30, NOW);
    expect(rows[0]).toMatchObject({
      date: iso(0),
      weekday: 'søn',
      durationHours: 1.5,
      load: 8,
      pain: 7,
      hasPain: true,
      sleepScore: 7,
      nutritionScore: 6,
      logged: true
    });
    expect(rows[1].pain).toBe(6);
    expect(rows[1].durationHours).toBe(0.5);
    expect(rows[1].sleepScore).toBeNull();
    expect(rows[1].nutritionScore).toBeNull();
  });

  it('setter null for tid/belastning og 0 smerte for dager uten registrering', () => {
    const rows = logTableRows([], 30, NOW);
    const r = rows[10];
    expect(r.durationHours).toBeNull();
    expect(r.load).toBeNull();
    expect(r.pain).toBe(0);
    expect(r.hasPain).toBe(false);
    expect(r.sleepScore).toBeNull();
    expect(r.nutritionScore).toBeNull();
    expect(r.logged).toBe(false);
  });

  it('teller dag med registrering uten tid som null tid (ikke 0)', () => {
    const entries = [entry(iso(2), { durationMin: undefined })];
    const rows = logTableRows(entries, 30, NOW);
    expect(rows[2].durationHours).toBeNull();
    expect(rows[2].logged).toBe(true);
  });

  it('respekterer valgfritt antall dager', () => {
    expect(logTableRows([], 7, NOW)).toHaveLength(7);
    expect(logTableRows([], 90, NOW)).toHaveLength(90);
  });

  it('viser hviledag som null belastning (ikke 5)', () => {
    const entries = [entry(iso(2), { activities: ['hviledag'], load: null })];
    const rows = logTableRows(entries, 30, NOW);
    expect(rows[2].load).toBeNull();
    expect(rows[2].logged).toBe(true);
  });
});
