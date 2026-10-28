import { describe, it, expect } from 'vitest';
import {
  entryToRow,
  rowToEntry,
  sameDayContent,
  parsePains,
  categoryToRow,
  rowToCategory,
  sameCategoryContent,
  deepEqual,
  type DayEntryRow,
  type CategoryRow
} from '../src/lib/supabaseTypes';
import type { Category, DayEntry } from '../src/lib/types';

const USER_ID = 'test-user-uuid';

function makeEntry(overrides: Partial<DayEntry> = {}): DayEntry {
  return {
    id: '2026-01-15',
    date: '2026-01-15',
    activities: ['trening_akademi'],
    load: 7,
    durationMin: 90,
    pains: [{ bodyPart: 'kne', level: 3, note: 'Litt støl' }],
    note: 'God økt',
    updatedAt: '2026-01-15T20:00:00.000Z',
    ...overrides
  };
}

describe('entryToRow / rowToEntry roundtrip', () => {
  it('konverterer entry til rad og tilbake uten tap av data', () => {
    const entry = makeEntry();
    const row = entryToRow(entry, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(row.date).toBe('2026-01-15');
    expect(row.deleted).toBe(false);

    const fullRow: DayEntryRow = { id: 'some-uuid', ...row };
    const back = rowToEntry(fullRow);
    expect(back).toEqual(entry);
  });

  it('håndterer manglende valgfrie felt (durationMin, note)', () => {
    const entry = makeEntry({ durationMin: undefined, note: undefined });
    const row = entryToRow(entry, USER_ID);
    expect(row.duration_min).toBeNull();
    expect(row.note).toBeNull();

    const back = rowToEntry({ id: 'x', ...row });
    expect(back.durationMin).toBeUndefined();
    expect(back.note).toBeUndefined();
    expect(sameDayContent(back, entry)).toBe(true);
  });

  it('bevarer tom pains-liste', () => {
    const entry = makeEntry({ pains: [] });
    const back = rowToEntry({ id: 'x', ...entryToRow(entry, USER_ID) });
    expect(back.pains).toEqual([]);
  });
});

describe('sameDayContent', () => {
  it('er true for identiske innhold', () => {
    expect(sameDayContent(makeEntry(), makeEntry())).toBe(true);
  });

  it('er false når load er forskjellig', () => {
    expect(sameDayContent(makeEntry(), makeEntry({ load: 8 }))).toBe(false);
  });

  it('er false når aktiviteter er forskjellig', () => {
    expect(
      sameDayContent(makeEntry(), makeEntry({ activities: ['kamp_hana'] }))
    ).toBe(false);
  });

  it('er false når pains er forskjellig', () => {
    expect(
      sameDayContent(makeEntry(), makeEntry({ pains: [{ bodyPart: 'rygg', level: 5 }] }))
    ).toBe(false);
  });

  it('er false når note er forskjellig', () => {
    expect(sameDayContent(makeEntry(), makeEntry({ note: 'Annen kommentar' }))).toBe(false);
  });

  it('ignorerer updatedAt og id (ikke innhold)', () => {
    const a = makeEntry({ updatedAt: '2026-01-15T10:00:00.000Z' });
    const b = makeEntry({ updatedAt: '2026-01-16T10:00:00.000Z', id: 'annen-id' });
    expect(sameDayContent(a, b)).toBe(true);
  });
});

describe('categoryToRow / rowToCategory roundtrip', () => {
  const cat: Category = {
    kind: 'activity',
    key: 'kamp_akademi',
    label: 'Kamp – akademi',
    sortOrder: 10,
    active: true,
    updatedAt: '2026-01-15T20:00:00.000Z'
  };

  it('konverterer kategori til rad og tilbake uten tap av data', () => {
    const row = categoryToRow(cat, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(row.kind).toBe('activity');
    expect(row.key).toBe('kamp_akademi');

    const fullRow: CategoryRow = { id: 'some-uuid', ...row };
    const back = rowToCategory(fullRow);
    expect(back).toMatchObject({
      userId: USER_ID,
      kind: 'activity',
      key: 'kamp_akademi',
      label: 'Kamp – akademi',
      sortOrder: 10,
      active: true
    });
  });

  it('sameCategoryContent ignorerer tidsstempel og bruker-id', () => {
    const a = { ...cat, updatedAt: '2026-01-15T10:00:00.000Z', userId: 'annet' };
    const b = { ...cat, updatedAt: '2026-01-16T10:00:00.000Z' };
    expect(sameCategoryContent(a, b)).toBe(true);
  });

  it('sameCategoryContent er false når etikett eller status er forskjellig', () => {
    expect(sameCategoryContent(cat, { ...cat, label: 'Kamp – A-lag' })).toBe(false);
    expect(sameCategoryContent(cat, { ...cat, active: false })).toBe(false);
    expect(sameCategoryContent(cat, { ...cat, sortOrder: 99 })).toBe(false);
  });
});

describe('deepEqual (robust mot nøkkelrekkefølge i jsonb)', () => {
  it('er true for like innhold med ulik nøkkelrekkefølge', () => {
    // Postgres jsonb returnerer alltid nøkler alfabetisk sortert:
    // {"activity":..., "durationMin":..., "load":..., "note":...}
    // mens lokalt objekt kan ha annen rekkefølge.
    const local = { activity: 'kamp', load: 8, durationMin: 90, note: 'A' };
    const fromJsonb = { activity: 'kamp', durationMin: 90, load: 8, note: 'A' };
    expect(deepEqual(local, fromJsonb)).toBe(true);
  });

  it('er false når innhold faktisk er forskjellig', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual('x', 1)).toBe(false);
  });

  it('håndterer nøstede strukturer (sessions i dager)', () => {
    const a = [{ weekday: 0, sessions: [{ activity: 'x', load: 5, durationMin: 60, note: 'n' }] }];
    const b = [{ weekday: 0, sessions: [{ durationMin: 60, note: 'n', load: 5, activity: 'x' }] }];
    expect(deepEqual(a, b)).toBe(true);
  });
});

describe('sameDayContent (jsonb-robust)', () => {
  it('er true selv om pains kommer fra jsonb med annen nøkkelrekkefølge', () => {
    const local = makeEntry({ pains: [{ bodyPart: 'kne', level: 3, note: 'støl' }] });
    // Simuler jsonb-retur: nøkler alfabetisk (bodyPart, level, note) — samme her,
    // men poenget er at rekkefølge ikke skal spille noen rolle:
    const fromCloud = makeEntry({ pains: [{ level: 3, bodyPart: 'kne', note: 'støl' }] });
    expect(sameDayContent(local, fromCloud)).toBe(true);
  });
});

describe('parsePains', () => {
  it('returnerer tom liste for ugyldig input', () => {
    expect(parsePains(null)).toEqual([]);
    expect(parsePains(undefined)).toEqual([]);
    expect(parsePains('ikke-array')).toEqual([]);
    expect(parsePains({})).toEqual([]);
  });

  it('filtrerer bort ugyldige elementer', () => {
    const raw = [
      { bodyPart: 'kne', level: 4 },
      { bodyPart: 123, level: 4 },
      { level: 4 },
      null,
      'tekst',
      { bodyPart: 'fot', level: 'høy' }
    ];
    expect(parsePains(raw)).toEqual([{ bodyPart: 'kne', level: 4 }]);
  });

  it('bevarer note på gyldige elementer', () => {
    const raw = [{ bodyPart: 'lar', level: 2, note: 'Støl' }];
    expect(parsePains(raw)).toEqual([{ bodyPart: 'lar', level: 2, note: 'Støl' }]);
  });
});
