import { beforeEach, describe, expect, it } from 'vitest';
import {
  categoryLabel,
  makeCategoryKey,
  DEFAULT_CATEGORIES,
  getAllCategoryRows,
  saveCategoryRow,
  getCategoryRow,
  getDirtyCategories,
  markCategorySynced,
  clearAllCategories,
  seedDefaultCategories,
  addCategory,
  deactivateCategory
} from '../src/lib/categories';
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

// Kategorier lagres i localStorage (ikke Dexie/IndexedDB) — en Dexie
// schema-oppgradering blokkeres av andre åpne instanser og henger appen.
describe('localStorage-lager for kategorier', () => {
  beforeEach(async () => {
    await clearAllCategories();
  });

  it('seedDefaultCategories lagrer standardkategorier én gang', async () => {
    const first = await seedDefaultCategories();
    expect(first.length).toBe(DEFAULT_CATEGORIES.length);
    const second = await seedDefaultCategories();
    expect(second.length).toBe(DEFAULT_CATEGORIES.length);
  });

  it('save/get/markSynced roundtrip', async () => {
    await saveCategoryRow({ kind: 'activity', key: 'test', label: 'Test', sortOrder: 1, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
    expect((await getCategoryRow('activity', 'test'))?.label).toBe('Test');
    expect((await getDirtyCategories()).map((c) => c.key)).toContain('test');

    await markCategorySynced('activity', 'test');
    expect((await getDirtyCategories()).map((c) => c.key)).not.toContain('test');
    expect((await getCategoryRow('activity', 'test'))?.dirty).toBe(false);
  });

  it('addCategory lager unik nøkkel ved kollisjon', async () => {
    const a = await addCategory('activity', 'Min egen type');
    const b = await addCategory('activity', 'Min egen type');
    expect(a.key).toBe('min_egen_type');
    expect(b.key).toBe('min_egen_type_2');
    expect((await getAllCategoryRows()).filter((c) => c.kind === 'activity')).toHaveLength(2);
  });

  it('deaktivering beholdes i lageret', async () => {
    await addCategory('body_part', 'Skulder');
    await deactivateCategory('body_part', 'skulder');
    const cat = await getCategoryRow('body_part', 'skulder');
    expect(cat?.active).toBe(false);
    expect(categoryLabel(await getAllCategoryRows(), 'body_part', 'skulder').archived).toBe(true);
  });
});
