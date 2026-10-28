import { beforeEach, describe, expect, it } from 'vitest';
import {
  createPlan,
  deletePlan,
  emptyWeekDays,
  getAllPlans,
  getDirtyPlans,
  getPlan,
  getPlanTombstones,
  markPlanSynced,
  markPlanTombstoneSynced,
  savePlan,
  savePlanFromCloud,
  removePlanLocally,
  clearAllPlans,
  summarizePlan,
  planDayLabel
} from '../src/lib/plans';
import { planToRow, rowToPlan, samePlanContent } from '../src/lib/supabaseTypes';
import type { WeekPlan } from '../src/lib/types';

function makePlan(overrides: Partial<WeekPlan> = {}): WeekPlan {
  return {
    id: 'plan-1',
    name: 'Uke 24',
    favorite: false,
    days: emptyWeekDays(),
    updatedAt: '2025-06-10T20:00:00.000Z',
    ...overrides
  };
}

beforeEach(async () => {
  await clearAllPlans();
});

describe('emptyWeekDays / createPlan', () => {
  it('lager 7 dager mandag–søndag uten økter', () => {
    const days = emptyWeekDays();
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.every((d) => d.sessions.length === 0)).toBe(true);
  });

  it('gir planen et unikt id og fallback-navn', () => {
    const a = createPlan('  ');
    const b = createPlan('Uke 25');
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe('Ukeplan');
    expect(b.name).toBe('Uke 25');
    expect(a.days).toHaveLength(7);
  });
});

describe('planDayLabel', () => {
  it('mapper 0–6 til norske ukedager', () => {
    expect(planDayLabel(0)).toBe('Man');
    expect(planDayLabel(6)).toBe('Søn');
  });
});

describe('lagring og henting', () => {
  it('lagrer og henter planer, favoritter først', async () => {
    const fav = makePlan({ id: 'a', name: 'Favoritt', favorite: true, updatedAt: '2025-06-01T00:00:00.000Z' });
    const other = makePlan({ id: 'b', name: 'Vanlig', favorite: false, updatedAt: '2025-06-20T00:00:00.000Z' });
    await savePlan(other);
    await savePlan(fav);
    const all = await getAllPlans();
    expect(all.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('oppdaterer eksisterende plan i stedet for å duplisere', async () => {
    await savePlan(makePlan());
    await savePlan(makePlan({ name: ' nytt navn ' }));
    const all = await getAllPlans();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe(' nytt navn ');
  });

  it('merker lagrede planer som dirty og rydder ved markPlanSynced', async () => {
    await savePlan(makePlan());
    expect(await getDirtyPlans()).toHaveLength(1);
    await markPlanSynced('plan-1');
    expect(await getDirtyPlans()).toHaveLength(0);
    expect((await getPlan('plan-1'))?.dirty).toBe(false);
  });
});

describe('savePlanFromCloud (synk — skal ikke merke dirty)', () => {
  it('lagrer plan fra sky uten dirty-flagg (hindrer evig ping-pong)', async () => {
    const cloudPlan = makePlan({ updatedAt: '2025-06-10T20:00:00.000Z' });
    await savePlanFromCloud(cloudPlan);
    const local = await getPlan('plan-1');
    expect(local).toBeDefined();
    expect(local!.dirty).toBe(false);
    expect(local!.updatedAt).toBe('2025-06-10T20:00:00.000Z');
    expect(await getDirtyPlans()).toHaveLength(0);
  });

  it('overskriver eksisterende lokal plan uten å merke dirty', async () => {
    await savePlan(makePlan({ name: 'Lokal endring' }));
    expect(await getDirtyPlans()).toHaveLength(1);

    const cloudPlan = makePlan({ name: 'Fra sky', updatedAt: '2025-06-11T20:00:00.000Z' });
    await savePlanFromCloud(cloudPlan);

    const local = await getPlan('plan-1');
    expect(local!.name).toBe('Fra sky');
    expect(local!.dirty).toBe(false);
    expect(await getDirtyPlans()).toHaveLength(0);
  });
});

describe('removePlanLocally (sletting fra sky)', () => {
  it('sletter plan uten å lage tombstone', async () => {
    await savePlan(makePlan());
    await removePlanLocally('plan-1');
    expect(await getAllPlans()).toHaveLength(0);
    expect(await getPlanTombstones()).toHaveLength(0);
  });

  it('sletter bare angitt plan', async () => {
    await savePlan(makePlan({ id: 'a' }));
    await savePlan(makePlan({ id: 'b' }));
    await removePlanLocally('a');
    const remaining = await getAllPlans();
    expect(remaining.map((p) => p.id)).toEqual(['b']);
    expect(await getPlanTombstones()).toHaveLength(0);
  });
});

describe('sletting og tombstones', () => {
  it('sletter plan lokalt og lager tombstone for synk', async () => {
    await savePlan(makePlan());
    await deletePlan('plan-1');
    expect(await getAllPlans()).toHaveLength(0);
    const tombstones = await getPlanTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].id).toBe('plan-1');
    await markPlanTombstoneSynced('plan-1');
    expect(await getPlanTombstones()).toHaveLength(0);
  });

  it('sletter ikke tombstones for andre planer', async () => {
    await savePlan(makePlan({ id: 'a' }));
    await savePlan(makePlan({ id: 'b' }));
    await deletePlan('a');
    await markPlanTombstoneSynced('a');
    // Slett b etterpå — tombstone for a er allerede borte, b får sin egen
    await deletePlan('b');
    expect((await getPlanTombstones()).map((t) => t.id)).toEqual(['b']);
  });
});

describe('summarizePlan', () => {
  it('summerer økter, tid, belastning og aktive dager', () => {
    const plan = makePlan({
      days: emptyWeekDays().map((d) =>
        d.weekday === 0
          ? {
              ...d,
              sessions: [
                { activity: 'kamp_akademi', load: 8, durationMin: 90 },
                { activity: 'styrketrening', load: 4, durationMin: 30, note: 'Lett' }
              ]
            }
          : d.weekday === 3
            ? { ...d, sessions: [{ activity: 'egentrening', load: 6, durationMin: 45 }] }
            : d
      )
    });
    const s = summarizePlan(plan);
    expect(s.sessions).toBe(3);
    expect(s.activeDays).toBe(2);
    expect(s.totalLoad).toBe(18);
    expect(s.totalDurationMin).toBe(165);
  });

  it('håndterer tom plan', () => {
    const s = summarizePlan(makePlan());
    expect(s).toEqual({ sessions: 0, totalLoad: 0, totalDurationMin: 0, activeDays: 0 });
  });
});

describe('planToRow / rowToPlan / samePlanContent', () => {
  it('roundtrip uten tap av data', () => {
    const plan = makePlan({
      favorite: true,
      days: emptyWeekDays().map((d) =>
        d.weekday === 2
          ? { ...d, sessions: [{ activity: 'trening_akademi', load: 5, durationMin: 60, note: 'Teknikk' }] }
          : d
      )
    });
    const row = planToRow(plan, 'user-1');
    expect(row.id).toBe('plan-1');
    expect(row.user_id).toBe('user-1');
    expect(row.deleted).toBe(false);
    expect(rowToPlan(row)).toEqual(plan);
  });

  it('samePlanContent ignorerer tidsstempel', () => {
    const a = makePlan({ name: 'A', updatedAt: '2025-06-01T00:00:00.000Z' });
    const b = makePlan({ name: 'A', updatedAt: '2025-06-02T00:00:00.000Z' });
    expect(samePlanContent(a, b)).toBe(true);
    expect(samePlanContent(a, makePlan({ name: 'B' }))).toBe(false);
    expect(samePlanContent(a, makePlan({ favorite: true }))).toBe(false);
  });

  it('samePlanContent er robust mot nøkkelrekkefølge i jsonb (fra Supabase)', () => {
    // Postgres jsonb returnerer alltid nøkler alfabetisk sortert:
    // {"durationMin":60,"load":5,"note":"x","activity":"kamp"} (activity sist!)
    // Lokalt kan rekkefølgen være en annen. Sammenligningen må ikke brytes av dette.
    const local = makePlan({
      days: emptyWeekDays().map((d) =>
        d.weekday === 0
          ? { ...d, sessions: [{ activity: 'kamp', load: 5, durationMin: 60, note: 'x' }] }
          : d
      )
    });
    // Simuler jsonb-retur med alfabetisk nøkkelrekkefølge
    const fromJsonb = makePlan({
      days: emptyWeekDays().map((d) =>
        d.weekday === 0
          ? { ...d, sessions: [{ durationMin: 60, load: 5, note: 'x', activity: 'kamp' }] as never }
          : d
      )
    });
    expect(samePlanContent(local, fromJsonb)).toBe(true);
  });

  it('samePlanContent er false når innhold faktisk er forskjellig', () => {
    const base = makePlan({
      days: emptyWeekDays().map((d) =>
        d.weekday === 1
          ? { ...d, sessions: [{ activity: 'gym', load: 7, durationMin: 45 }] }
          : d
      )
    });
    const annenLoad = makePlan({
      days: emptyWeekDays().map((d) =>
        d.weekday === 1
          ? { ...d, sessions: [{ activity: 'gym', load: 8, durationMin: 45 }] }
          : d
      )
    });
    expect(samePlanContent(base, annenLoad)).toBe(false);
  });
});
