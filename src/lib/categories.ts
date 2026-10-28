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

/*
 * Kategorier lagres i localStorage — IKKE i IndexedDB/Dexie.
 * En Dexie schema-oppgradering blokkeres mens andre instanser (PWA på
 * startskjermen, andre nettleserfaner) har databasen åpen, og da henger
 * alle databasekall — hele appen står stille. Kategorier er få og små,
 * så localStorage er tilstrekkelig (og de synkroniseres via Supabase).
 */
const STORAGE_KEY = 'belast:categories:v1';

function readStore(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Category =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as Category).kind === 'string' &&
        typeof (c as Category).key === 'string'
    );
  } catch {
    return [];
  }
}

function writeStore(categories: Category[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch {
    // localStorage full eller privat modus — valgene fungerer for økten
  }
}

// ---------------------------------------------------------------------------
// Lavnivå lager-API (samme navn som tidligere Dexie-versjon)
// ---------------------------------------------------------------------------

/** Hent alle kategorier (inkl. inaktive) sortert etter sortOrder. */
export async function getAllCategoryRows(): Promise<Category[]> {
  return readStore().sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder);
}

/** Hent én kategori på (kind, key). */
export async function getCategoryRow(kind: string, key: string): Promise<Category | undefined> {
  return readStore().find((c) => c.kind === kind && c.key === key);
}

/** Opprett eller oppdater kategori lokalt og merk den dirty for synk. */
export async function saveCategoryRow(category: Category): Promise<void> {
  const all = readStore();
  const idx = all.findIndex((c) => c.kind === category.kind && c.key === category.key);
  const row: Category = { ...category, dirty: true, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = row;
  else all.push(row);
  writeStore(all);
}

/** Hent alle dirty kategorier (ikke-synkede endringer). */
export async function getDirtyCategories(): Promise<Category[]> {
  return readStore().filter((c) => !!c.dirty);
}

/** Merk kategori som synkronisert (kalles etter vellykket push). */
export async function markCategorySynced(
  kind: string,
  key: string,
  patch: Partial<Category> = {}
): Promise<void> {
  const all = readStore();
  const idx = all.findIndex((c) => c.kind === kind && c.key === key);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...patch, dirty: false };
  writeStore(all);
}

/** Slett alle kategorier lokalt (ved «slett alle data»). */
export async function clearAllCategories(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Høynivå-API
// ---------------------------------------------------------------------------

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

/** Etikett for én nøkkel, lest fra lokalt lager. */
export async function getCategoryLabel(
  kind: CategoryKind,
  key: string
): Promise<{ label: string; archived: boolean }> {
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

/**
 * Flytt en aktiv kategori én plass opp eller ned i rekkefølgen (blant de
 * aktive kategoriene av samme type). sortOrder byttes mellom de to kategoriene,
 * slik at kategorier med ulik steglengde og inaktive kategorier (som beholder
 * plassen sin) ikke påvirkes. Returnerer alle kategorier av samme type, eller
 * undefined hvis kategorien ikke finnes, er inaktiv eller allerede ligger
 * øverst/nederst.
 */
export async function moveCategory(
  kind: CategoryKind,
  key: string,
  direction: 'up' | 'down'
): Promise<Category[] | undefined> {
  const active = (await getAllCategoryRows())
    .filter((c) => c.kind === kind && c.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  const idx = active.findIndex((c) => c.key === key);
  if (idx < 0) return undefined;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= active.length) return undefined;

  const a = active[idx];
  const b = active[swapIdx];
  await saveCategoryRow({ ...a, sortOrder: b.sortOrder });
  await saveCategoryRow({ ...b, sortOrder: a.sortOrder });
  return (await getAllCategoryRows())
    .filter((c) => c.kind === kind)
    .sort((x, y) => x.sortOrder - y.sortOrder || x.key.localeCompare(y.key));
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
