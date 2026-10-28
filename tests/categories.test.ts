import { beforeEach, describe, expect, it } from 'vitest';
import {
  categoryLabel,
  makeCategoryKey,
  DEFAULT_CATEGORIES,
  getAllCategoryRows,
  saveCategoryRow,
  saveCategoryRowFromCloud,
  getCategoryRow,
  getDirtyCategories,
  markCategorySynced,
  clearAllCategories,
  seedDefaultCategories,
  addCategory,
  deactivateCategory,
  moveCategory
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

describe('saveCategoryRowFromCloud (synk — skal ikke merke dirty)', () => {
  beforeEach(async () => {
    await clearAllCategories();
  });

  it('lagrer kategori fra sky uten dirty-flagg (hindrer evig ping-pong)', async () => {
    const cloudCat: Category = {
      kind: 'activity',
      key: 'test',
      label: 'Test fra sky',
      sortOrder: 10,
      active: true,
      updatedAt: '2025-06-10T20:00:00.000Z'
    };
    await saveCategoryRowFromCloud(cloudCat);
    const local = await getCategoryRow('activity', 'test');
    expect(local).toBeDefined();
    expect(local!.dirty).toBe(false);
    expect(local!.updatedAt).toBe('2025-06-10T20:00:00.000Z');
    expect(await getDirtyCategories()).toHaveLength(0);
  });

  it('overskriver eksisterende lokal kategori uten å merke dirty', async () => {
    await saveCategoryRow({ kind: 'activity', key: 'test', label: 'Lokal', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
    expect(await getDirtyCategories()).toHaveLength(1);

    const cloudCat: Category = {
      kind: 'activity',
      key: 'test',
      label: 'Fra sky',
      sortOrder: 10,
      active: true,
      updatedAt: '2025-06-11T20:00:00.000Z'
    };
    await saveCategoryRowFromCloud(cloudCat);

    const local = await getCategoryRow('activity', 'test');
    expect(local!.label).toBe('Fra sky');
    expect(local!.dirty).toBe(false);
    expect(await getDirtyCategories()).toHaveLength(0);
  });
});

describe('moveCategory', () => {
  beforeEach(async () => {
    await clearAllCategories();
    await saveCategoryRow({ kind: 'activity', key: 'a', label: 'A', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
    await saveCategoryRow({ kind: 'activity', key: 'b', label: 'B', sortOrder: 20, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
    await saveCategoryRow({ kind: 'activity', key: 'c', label: 'C', sortOrder: 30, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
    await saveCategoryRow({ kind: 'body_part', key: 'kne', label: 'Kne', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
  });

  const order = async (kind: 'activity' | 'body_part') =>
    (await getAllCategoryRows())
      .filter((c) => c.kind === kind && c.active)
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((c) => c.key);

  it('flytter kategori ned og bytter sortOrder', async () => {
    await moveCategory('activity', 'a', 'down');
    expect(await order('activity')).toEqual(['b', 'a', 'c']);
  });

  it('flytter kategori opp og bytter sortOrder', async () => {
    await moveCategory('activity', 'c', 'up');
    expect(await order('activity')).toEqual(['a', 'c', 'b']);
  });

  it('returnerer undefined og endrer ingenting ved øverste/nederste plass', async () => {
    expect(await moveCategory('activity', 'a', 'up')).toBeUndefined();
    expect(await moveCategory('activity', 'c', 'down')).toBeUndefined();
    expect(await order('activity')).toEqual(['a', 'b', 'c']);
  });

  it('returnerer undefined for ukjent nøkkel', async () => {
    expect(await moveCategory('activity', 'finnes_ikke', 'up')).toBeUndefined();
  });

  it('returnerer undefined for inaktiv kategori', async () => {
    await deactivateCategory('activity', 'b');
    expect(await moveCategory('activity', 'b', 'up')).toBeUndefined();
    expect(await order('activity')).toEqual(['a', 'c']);
  });

  it('hopper over inaktive kategorier ved flytting', async () => {
    await deactivateCategory('activity', 'b');
    await moveCategory('activity', 'a', 'down');
    expect(await order('activity')).toEqual(['c', 'a']);
    // Inaktiv kategori beholder sin sortOrder og relative plass
    const inactive = await getCategoryRow('activity', 'b');
    expect(inactive?.sortOrder).toBe(20);
    expect(inactive?.active).toBe(false);
  });

  it('endrer ikke kategorier av annen type', async () => {
    await moveCategory('activity', 'a', 'down');
    expect(await order('body_part')).toEqual(['kne']);
  });

  it('markerer flyttede kategorier som dirty for synk', async () => {
    await markCategorySynced('activity', 'a');
    await markCategorySynced('activity', 'b');
    await moveCategory('activity', 'a', 'down');
    const dirty = (await getDirtyCategories()).filter((c) => c.kind === 'activity').map((c) => c.key);
    expect(dirty).toContain('a');
    expect(dirty).toContain('b');
  });

  it('fungerer med ulik steglengde i sortOrder', async () => {
    await saveCategoryRow({ kind: 'activity', key: 'd', label: 'D', sortOrder: 100, active: true, updatedAt: '2025-01-01T00:00:00.000Z' });
    await moveCategory('activity', 'c', 'down');
    expect(await order('activity')).toEqual(['a', 'b', 'd', 'c']);
    expect((await getCategoryRow('activity', 'c'))?.sortOrder).toBe(100);
    expect((await getCategoryRow('activity', 'd'))?.sortOrder).toBe(30);
  });
});
