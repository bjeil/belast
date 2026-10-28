/**
 * Integrasjonstest: kjører den EKTE syncManager.sync() mot en in-memory
 * mock av Supabase. Verifiserer at plansynk ikke går i evig ping-pong:
 * etter én sync skal det ikke være dirty planer igjen, og en andre sync
 * skal ikke pushe noe nytt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeekPlanRow } from '../src/lib/supabaseTypes';

const USER_ID = 'test-user';

// --- In-memory «sky» --------------------------------------------------------
const weekPlansTable = new Map<string, WeekPlanRow>();

/** Chainable + thenable query-builder som dekker alle kall i sync.ts. */
function makeQuery(getRows: () => unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.order = chain;
  builder.upsert = (row: Record<string, unknown>) => {
    weekPlansTable.set(row.id as string, row as unknown as WeekPlanRow);
    return Promise.resolve({ data: null, error: null });
  };
  // Gjør builder awaitable — siste kall i kjeden løser med data
  builder.then = (resolve: (v: { data: unknown; error: null }) => void) => {
    resolve({ data: getRows(), error: null });
  };
  return builder;
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'week_plans'
        ? makeQuery(() => [...weekPlansTable.values()])
        : makeQuery(() => []),
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) })
    }),
    removeChannel: () => {}
  }
}));

vi.mock('../src/lib/auth', () => ({
  getUserId: async () => USER_ID
}));

// Dexie/indexedDB finnes ikke i jsdom — dag-synken er ikke i fokus her.
vi.mock('../src/lib/db', () => ({
  db: {},
  getAllEntries: async () => [],
  getDirtySyncMeta: async () => [],
  markSynced: async () => {},
  hardDeleteEntry: async () => {},
  addConflict: async () => {},
  getSyncMeta: async () => undefined,
  kvGet: async (_k: string, fallback: unknown) => fallback,
  kvSet: async () => {}
}));

import { syncManager } from '../src/lib/sync';
import {
  createPlan,
  deletePlan,
  emptyWeekDays,
  getDirtyPlans,
  getPlan,
  getPlanTombstones,
  savePlan,
  clearAllPlans
} from '../src/lib/plans';
import { clearAllCategories } from '../src/lib/categories';

function makePlanWithSession(name: string): ReturnType<typeof createPlan> {
  const plan = createPlan(name);
  plan.days = emptyWeekDays().map((d) =>
    d.weekday === 2
      ? { ...d, sessions: [{ activity: 'kamp_akademi', load: 8, durationMin: 90, note: 'Hard økt' }] }
      : d
  );
  return plan;
}

beforeEach(async () => {
  weekPlansTable.clear();
  await clearAllPlans();
  await clearAllCategories();
  syncManager.destroy();
});

describe('syncManager plansync — ingen evig ping-pong', () => {
  it('én sync pusher dirty plan og etterlater ingen dirty', async () => {
    await savePlan(makePlanWithSession('Uke 24'));
    expect(await getDirtyPlans()).toHaveLength(1);

    await syncManager.sync();

    expect(await getDirtyPlans()).toHaveLength(0);
    expect(weekPlansTable.size).toBe(1);
    expect(syncManager.getState().pendingPush).toBe(0);
  });

  it('gjentatte sync-runder konvergerer (ikke evig loop)', async () => {
    await savePlan(makePlanWithSession('Uke 25'));

    for (let i = 0; i < 5; i++) {
      await syncManager.sync();
      expect(await getDirtyPlans()).toHaveLength(0);
    }
    expect(weekPlansTable.size).toBe(1);
  });

  it('pull bringer plan fra sky til lokal uten å merke dirty', async () => {
    const cloudPlan = makePlanWithSession('Fra mobil');
    weekPlansTable.set(cloudPlan.id, {
      id: cloudPlan.id,
      user_id: USER_ID,
      name: cloudPlan.name,
      favorite: false,
      days: cloudPlan.days as never,
      updated_at: cloudPlan.updatedAt,
      deleted: false
    });

    await syncManager.sync();

    const local = await getPlan(cloudPlan.id);
    expect(local).toBeDefined();
    expect(local!.name).toBe('Fra mobil');
    expect(local!.dirty).toBe(false);
    expect(await getDirtyPlans()).toHaveLength(0);
  });

  it('lokal endring vinner over eldre sky-versjon', async () => {
    const plan = makePlanWithSession('Lokal først');
    await savePlan(plan);
    await syncManager.sync();

    const updated = { ...plan, name: 'Lokal endret', updatedAt: new Date().toISOString() };
    await savePlan(updated);
    expect(await getDirtyPlans()).toHaveLength(1);

    await syncManager.sync();
    expect(await getDirtyPlans()).toHaveLength(0);
    expect(weekPlansTable.get(plan.id)?.name).toBe('Lokal endret');
  });

  it('sletting lokalt lager tombstone, push fjerner den, pull sletter ikke noe nytt', async () => {
    const plan = makePlanWithSession('Skal bort');
    await savePlan(plan);
    await syncManager.sync();
    expect(weekPlansTable.has(plan.id)).toBe(true);

    await deletePlan(plan.id);
    expect(await getPlanTombstones()).toHaveLength(1);

    await syncManager.sync();
    expect(await getPlanTombstones()).toHaveLength(0);
    expect(weekPlansTable.get(plan.id)?.deleted).toBe(true);

    await syncManager.sync();
    expect(await getDirtyPlans()).toHaveLength(0);
    expect(await getPlanTombstones()).toHaveLength(0);
  });

  it('jsonb-nøkkelrekkefølge fra sky bryter ikke konvergens', async () => {
    const plan = makePlanWithSession('Jsonb-test');
    await savePlan(plan);
    await syncManager.sync();

    // Simuler jsonb roundtrip (sorterer nøkler alfabetisk internt)
    const row = weekPlansTable.get(plan.id)!;
    weekPlansTable.set(plan.id, { ...row, days: JSON.parse(JSON.stringify(row.days)) });

    await syncManager.sync();
    expect(await getDirtyPlans()).toHaveLength(0);
  });
});
