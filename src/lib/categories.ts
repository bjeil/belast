import {
  getAllCategoryRows,
  getCategoryRow,
  saveCategoryRow,
  clearAllCategories
} from './db';
import type { Category, CategoryKind } from './types';
import { REST_DAY, REST_DAY_LABEL } from './types';

/**
 * Standardkategorier som brukes når brukeren ikke har egne ennå
 * (første gangs bruk, offline, eller før første synk). Kan overstyres
 * per bruker i Innstillinger → Kategorier.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { kind: 'activity', key: 'kamp_akademi', label: 'Kamp – akademi', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'activity', key: 'trening_akademi', label: 'Trening – akademi', sortOrder: 20, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'activity', key: 'styrketrening', label: 'Styrketrening', sortOrder: 30, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'activity', key: 'egentrening', label: 'Egentrening', sortOrder: 40, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'activity', key: 'annet', label: 'Annet', sortOrder: 50, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'rygg', label: 'Rygg', sortOrder: 10, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'hofte', label: 'Hofte', sortOrder: 20, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'lar', label: 'Lår', sortOrder: 30, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'kne', label: 'Kne', sortOrder: 40, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'legg', label: 'Legg', sortOrder: 50, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'fot', label: 'Fot', sortOrder: 60, active: true, updatedAt: '2025-01-01T00:00:00.000Z' },
  { kind: 'body_part', key: 'annet', label: 'Annet', sortOrder: 70, active: true, updatedAt: '2025-01-01T00:00:00.000Z' }
];

/** Alle kategorier (inkl. inaktive, for historikk-visning). */
export async function getAllCategories(): Promise<Category[]> {
  return getAllCategoryRows();
}

/** Kun aktive kategorier av en type, sortert etter rekkefølge. */
export async function getActiveCategories(kind: CategoryKind): Promise<Category[]> {
  const all = await getAllCategoryRows();
  return all
    .filter((c) => c.kind === kind && c.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Slå opp etikett for en nøkkel. Ukjente nøkler (f.eks. fra gamle versjoner
 * eller fjernede kategorier) vises pent med markering — historikk går aldri tapt.
 */
export function categoryLabel(
  categories: Category[],
  kind: CategoryKind,
  key: string
): { label: string; archived: boolean } {
  if (kind === 'activity' && key === REST_DAY) {
    return { label: REST_DAY_LABEL, archived: false };
  }
  const found = categories.find((c) => c.kind === kind && c.key === key);
  if (found) return { label: found.label, archived: !found.active };
  const pretty = key.replace(/_/g, ' ');
  return { label: `${pretty} (utgått)`, archived: true };
}

/** Etikett for én nøkkel, med fallback til standardkategorier. */
export async function getCategoryLabel(kind: CategoryKind, key: string): Promise<{ label: string; archived: boolean }> {
  return categoryLabel(await getAllCategoryRows(), kind, key);
}

/** Første oppsett: lagre standardkategorier lokalt dersom ingenting er lagret. */
export async function seedDefaultCategories(): Promise<Category[]> {
  const existing = await getAllCategoryRows();
  if (existing.length > 0) return existing;
  for (const c of DEFAULT_CATEGORIES) {
    await saveCategoryRow({ ...c, dirty: true });
  }
  return getAllCategoryRows();
}

/** Opprett ny kategori (med unik nøkkel basert på etikett). */
export async function addCategory(kind: CategoryKind, label: string): Promise<Category> {
  const base = makeCategoryKey(label) || `kategori_${Date.now()}`;
  let key = base;
  let n = 2;
  while (await getCategoryRow(kind, key)) {
    key = `${base}_${n++}`;
  }
  const siblings = (await getAllCategoryRows()).filter((c) => c.kind === kind);
  const maxOrder = siblings.reduce((m, c) => Math.max(m, c.sortOrder), 0);
  const category: Category = {
    kind,
    key,
    label: label.trim(),
    sortOrder: maxOrder + 10,
    active: true,
    updatedAt: new Date().toISOString()
  };
  await saveCategoryRow(category);
  return (await getCategoryRow(kind, key))!;
}

/** Gi kategori nytt navn (nøkkelen beholdes, slik at historikk ikke påvirkes). */
export async function renameCategory(kind: CategoryKind, key: string, label: string): Promise<void> {
  const existing = await getCategoryRow(kind, key);
  if (!existing) return;
  await saveCategoryRow({ ...existing, label: label.trim() });
}

/** Deaktiver ("fjern") kategori — beholdes for historikk, skjules i valg. */
export async function deactivateCategory(kind: CategoryKind, key: string): Promise<void> {
  const existing = await getCategoryRow(kind, key);
  if (!existing) return;
  await saveCategoryRow({ ...existing, active: false });
}

/** Aktiver kategori på nytt. */
export async function activateCategory(kind: CategoryKind, key: string): Promise<void> {
  const existing = await getCategoryRow(kind, key);
  if (!existing) return;
  await saveCategoryRow({ ...existing, active: true });
}

/** Bytt rekkefølge på to kategorier (kontekst: liste i samme type). */
export async function reorderCategories(kind: CategoryKind, keysInOrder: string[]): Promise<void> {
  for (let i = 0; i < keysInOrder.length; i++) {
    const existing = await getCategoryRow(kind, keysInOrder[i]);
    if (existing && existing.sortOrder !== (i + 1) * 10) {
      await saveCategoryRow({ ...existing, sortOrder: (i + 1) * 10 });
    }
  }
}

export async function clearCategories(): Promise<void> {
  await clearAllCategories();
}

/** Lag stabil nøkkel fra etikett (a-z0-9 + æøå, understrek). */
export function makeCategoryKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
