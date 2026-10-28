import { describe, expect, it } from 'vitest';
import { categoryLabel, makeCategoryKey, DEFAULT_CATEGORIES } from '../src/lib/categories';
import type { Category } from '../src/lib/types';

const base: Category[] = [
  { kind: 'activity', key: 'kamp_akademi', label: 'Kamp – akademi', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'activity', key: 'trening_hana', label: 'Trening – Hana', sortOrder: 20, active: false, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'kne', label: 'Kne', sortOrder: 40, active: true, updatedAt: '2025-01-01T00:00:00.000Z' }
];

describe('categoryLabel', () => {
  it('returnerer etikett for kjent aktiv kategori', () => {
    expect(categoryLabel(base, 'activity', 'kamp_akademi')).toEqual({
      label: 'Kamp – akademi',
      archived: false
    });
  });

  it('markerer inaktive kategorier som arkivert', () => {
    expect(categoryLabel(base, 'activity', 'trening_hana')).toEqual({
      label: 'Trening – Hana',
      archived: true
    });
  });

  it('håndterer innebygd hviledag', () => {
    expect(categoryLabel(base, 'activity', 'hviledag')).toEqual({
      label: 'Hviledag',
      archived: false
    });
  });

  it('gir pent fallback for ukjente nøkler (f.eks. fra gamle versjoner)', () => {
    const { label, archived } = categoryLabel(base, 'activity', 'kamp_sonelag');
    expect(label).toBe('kamp sonelag (utgått)');
    expect(archived).toBe(true);
  });

  it('slår opp kroppsdeler', () => {
    expect(categoryLabel(base, 'body_part', 'kne')).toEqual({ label: 'Kne', archived: false });
  });
});

describe('makeCategoryKey', () => {
  it('lager stabil nøkkel fra etikett', () => {
    expect(makeCategoryKey('Kamp – akademi')).toBe('kamp_akademi');
    expect(makeCategoryKey('  Styrketrening  ')).toBe('styrketrening');
    expect(makeCategoryKey('Ankel (høyre)')).toBe('ankel_høyre');
  });
});

describe('DEFAULT_CATEGORIES', () => {
  it('inneholder nye standardverdier og ikke gamle sonelag/Hana', () => {
    const activityKeys = DEFAULT_CATEGORIES.filter((c) => c.kind === 'activity').map((c) => c.key);
    expect(activityKeys).toContain('kamp_akademi');
    expect(activityKeys).toContain('trening_akademi');
    expect(activityKeys).toContain('styrketrening');
    expect(activityKeys).toContain('egentrening');
    expect(activityKeys).not.toContain('kamp_sonelag');
    expect(activityKeys).not.toContain('trening_sonelag');
    expect(activityKeys).not.toContain('kamp_hana');
    expect(activityKeys).not.toContain('trening_hana');
  });

  it('alle standardkategorier er aktive og har unike nøkler per type', () => {
    for (const kind of ['activity', 'body_part'] as const) {
      const keys = DEFAULT_CATEGORIES.filter((c) => c.kind === kind).map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(DEFAULT_CATEGORIES.filter((c) => c.kind === kind).every((c) => c.active)).toBe(true);
    }
  });
});
