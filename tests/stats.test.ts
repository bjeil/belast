import { describe, expect, it } from 'vitest';
import type { DayEntry } from '../src/lib/types';
import {
  computeWindowStats,
  computeACWR,
  acwrZone,
  dailyLoadSeries,
  weeklyLoadSeries,
  weeklyTrendSeries,
  heatmapData,
  loadVsPain,
  consecutiveHighPainDays,
  loadChangePercent
} from '../src/lib/stats';
import { currentStreak, longestStreak, windowDays, entriesInWindow, toISODate, weekStartISO } from '../src/lib/dates';
import { addDays, startOfDay } from 'date-fns';

const NOW = new Date('2025-06-15T12:00:00');

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

const iso = (offset: number) => toISODate(addDays(startOfDay(NOW), -offset));

describe('windowDays / entriesInWindow', () => {
  it('7-dagers vindu inneholder i dag og 6 dager bakover', () => {
    const days = windowDays(7, [], NOW);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(iso(0));
    expect(days[0]).toBe(iso(6));
  });

  it('filtrerer poster utenfor vinduet', () => {
    const entries = [entry(iso(0)), entry(iso(3)), entry(iso(40))];
    const inWindow = entriesInWindow(entries, 7, NOW);
    expect(inWindow).toHaveLength(2);
  });
});

describe('computeWindowStats', () => {
  const entries = [
    entry(iso(0), { activities: ['kamp_akademi'], load: 8, pains: [{ bodyPart: 'kne', level: 7 }] }),
    entry(iso(1), { activities: ['trening_hana'], load: 4 }),
    entry(iso(2), { activities: ['hviledag'], load: 1 }),
    entry(iso(10), { activities: ['egentrening'], load: 6, pains: [{ bodyPart: 'rygg', level: 3 }] })
  ];

  it('teller aktive dager, økter og belastning riktig', () => {
    const s = computeWindowStats(entries, 30, NOW);
    expect(s.activeDays).toBe(3); // hviledag teller ikke
    expect(s.totalSessions).toBe(3);
    expect(s.totalLoad).toBe(8 + 4 + 6);
    expect(s.avgLoad).toBeCloseTo(18 / 3);
    expect(s.maxLoad).toBe(8);
    expect(s.maxLoadDay).toBe(iso(0));
  });

  it('teller smerte per dag og kroppsdel', () => {
    const s = computeWindowStats(entries, 30, NOW);
    expect(s.totalPain).toBe(10);
    expect(s.daysWithPain).toBe(2);
    expect(s.highPainDays).toBe(1);
    expect(s.painByBodyPart.kne.count).toBe(1);
    expect(s.painByBodyPart.kne.maxLevel).toBe(7);
    expect(s.painByBodyPart.rygg.totalLevel).toBe(3);
  });

  it('splitter økter per type (hviledag er ikke en økt)', () => {
    const s = computeWindowStats(entries, 30, NOW);
    expect(s.byType['kamp_akademi']).toBe(1);
    expect(s.byType['trening_hana']).toBe(1);
    expect(s.byType['egentrening']).toBe(1);
    expect(s.byType['hviledag'] ?? 0).toBe(0);
    expect(s.totalSessions).toBe(3);
  });

  it('håndterer brukerdefinerte kategorinøkler', () => {
    const s = computeWindowStats(
      [entry(iso(0), { activities: ['kamp_hana', 'styrketrening'] })],
      7,
      NOW
    );
    expect(s.byType['kamp_hana']).toBe(1);
    expect(s.byType['styrketrening']).toBe(1);
    expect(s.totalSessions).toBe(2);
  });

  it('håndterer tom historikk', () => {
    const s = computeWindowStats([], 7, NOW);
    expect(s.activeDays).toBe(0);
    expect(s.totalLoad).toBe(0);
    expect(s.avgLoad).toBe(0);
  });
});

describe('computeACWR', () => {
  it('beregner forholdet mellom akutt (7d) og kronisk (28d)', () => {
    // 7 dager akutt med load 8, 28 dager kronisk med load 4
    const entries: DayEntry[] = [];
    for (let i = 0; i < 7; i++) entries.push(entry(iso(i), { load: 8 }));
    for (let i = 7; i < 35; i++) entries.push(entry(iso(i), { load: 4 }));
    const { acute, chronic, ratio } = computeACWR(entries, NOW);
    expect(acute).toBeCloseTo(8);
    expect(chronic).toBeCloseTo(4);
    expect(ratio).toBeCloseTo(2);
    expect(acwrZone(ratio)).toBe('danger');
  });

  it('returnerer null ratio når kronisk belastning er 0', () => {
    const entries = [entry(iso(0), { load: 5 }), entry(iso(1), { load: 5 })];
    expect(computeACWR(entries, NOW).ratio).toBeNull();
    expect(acwrZone(null)).toBe('unknown');
  });

  it('teller hviledager som 0 belastning', () => {
    const entries: DayEntry[] = [];
    for (let i = 7; i < 35; i++) entries.push(entry(iso(i), { activities: ['hviledag'], load: 1 }));
    expect(computeACWR(entries, NOW).chronic).toBe(0);
  });

  it('soner', () => {
    expect(acwrZone(0.5)).toBe('low');
    expect(acwrZone(1.0)).toBe('sweet');
    expect(acwrZone(1.4)).toBe('high');
    expect(acwrZone(1.6)).toBe('danger');
  });
});

describe('streaks', () => {
  it('teller nåværende streak bakover fra i dag', () => {
    const entries = [entry(iso(0)), entry(iso(1)), entry(iso(2)), entry(iso(5))];
    expect(currentStreak(entries, NOW)).toBe(3);
  });

  it('teller lengste streak', () => {
    const entries = [entry(iso(0)), entry(iso(1)), entry(iso(2)), entry(iso(10)), entry(iso(11))];
    expect(longestStreak(entries)).toBe(3);
  });
});

describe('serier', () => {
  it('dailyLoadSeries gir én verdi per dag, 0 på hvile/ikke registrert', () => {
    const entries = [entry(iso(1), { load: 7 }), entry(iso(3), { activities: ['hviledag'], load: 1 })];
    const series = dailyLoadSeries(entries, 7, NOW);
    expect(series).toHaveLength(7);
    expect(series[6].load).toBe(0); // i dag, ikke registrert
    expect(series[5].load).toBe(7);
    expect(series[3].load).toBe(0); // hviledag
  });

  it('dailyLoadSeries inkluderer varighet (treningstid) per dag', () => {
    const entries = [
      entry(iso(1), { load: 7, durationMin: 90 }),
      entry(iso(2), { load: 5, durationMin: undefined }), // ingen varighet
      entry(iso(3), { activities: ['hviledag'], load: 1, durationMin: 45 })
    ];
    const series = dailyLoadSeries(entries, 7, NOW);
    expect(series[5].durationMin).toBe(90); // i går
    expect(series[4].durationMin).toBe(0); // i forigårs: ikke ført
    expect(series[3].durationMin).toBe(0); // hviledag teller ikke
    expect(series[6].durationMin).toBe(0); // ikke registrert
  });

  it('weeklyLoadSeries summerer per uke (inkl. varighet)', () => {
    const entries = [entry(iso(0), { load: 5, durationMin: 60 }), entry(iso(1), { load: 5, durationMin: 30 }), entry(iso(9), { load: 4 })];
    const weeks = weeklyLoadSeries(entries, 4, NOW);
    const thisWeek = weeks[weeks.length - 1];
    expect(thisWeek.totalLoad).toBe(10);
    expect(thisWeek.sessions).toBe(2);
    expect(thisWeek.totalDurationMin).toBe(90);
  });

  it('heatmapData dekker alle dager i vinduet', () => {
    const entries = [entry(iso(0), { load: 6, pains: [{ bodyPart: 'fot', level: 2 }] })];
    const heat = heatmapData(entries, 30, NOW);
    expect(heat).toHaveLength(30);
    expect(heat[29].load).toBe(6);
    expect(heat[29].hasPain).toBe(true);
  });

  it('loadVsPain hopper over hviledager og ikke-registrerte dager', () => {
    const entries = [
      entry(iso(0), { load: 6, pains: [{ bodyPart: 'kne', level: 4 }] }),
      entry(iso(1), { activities: ['hviledag'], load: 1 })
    ];
    const data = loadVsPain(entries, 7, NOW);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ load: 6, pain: 4 });
  });

  it('weeklyTrendSeries aggregerer per uke: snitt belastning/smerte, sum varighet', () => {
    // NOW = 2025-06-15 (søndag). Siste 14 dager: 2025-06-02 (man) … 2025-06-15 (søn)
    // Uke 1: 02.06–08.06, uke 2: 09.06–15.06
    const entries = [
      entry('2025-06-02', { load: 8, durationMin: 60, pains: [{ bodyPart: 'kne', level: 4 }] }),
      entry('2025-06-04', { load: 4, durationMin: 30, pains: [{ bodyPart: 'kne', level: 2 }] }),
      entry('2025-06-09', { load: 6, durationMin: 90 }),
      entry('2025-06-15', { load: 10, durationMin: 45 }) // i dag, søndag i uke 2
    ];
    const weeks = weeklyTrendSeries(entries, 14, NOW);
    expect(weeks).toHaveLength(2);
    // Uke 1 starter mandag 2025-06-02
    expect(weeks[0].weekStart).toBe('2025-06-02');
    // snitt belastning: (8 + 0 + 4 + 0 + 0 + 0 + 0) / 7 = 12/7
    expect(weeks[0].load).toBeCloseTo(12 / 7);
    // snitt smerte: (4 + 0 + 2) / 7 = 6/7
    expect(weeks[0].pain).toBeCloseTo(6 / 7);
    // sum varighet
    expect(weeks[0].durationMin).toBe(90);
    // Uke 2 starter mandag 2025-06-09 og inneholder søndag 15.06
    expect(weeks[1].weekStart).toBe('2025-06-09');
    expect(weeks[1].load).toBeCloseTo(16 / 7);
    expect(weeks[1].pain).toBeCloseTo(0);
    expect(weeks[1].durationMin).toBe(135);
  });

  it('weeklyTrendSeries runder 90 dager opp til 13 hele uker', () => {
    const weeks = weeklyTrendSeries([], 90, NOW);
    expect(weeks).toHaveLength(13);
    // Første uke starter mandagen i uka 89 dager før i dag
    expect(weeks[0].weekStart).toBe(weekStartISO(iso(89)));
    // Siste uke starter mandagen i inneværende uke
    expect(weeks[12].weekStart).toBe(weekStartISO(iso(0)));
  });
});

describe('weekStartISO (norsk uke: mandag–søndag)', () => {
  it('returnerer mandag for alle dager i samme uke', () => {
    // 2025-06-09 er en mandag
    expect(weekStartISO('2025-06-09')).toBe('2025-06-09'); // man
    expect(weekStartISO('2025-06-10')).toBe('2025-06-09'); // tir
    expect(weekStartISO('2025-06-14')).toBe('2025-06-09'); // lør
    expect(weekStartISO('2025-06-15')).toBe('2025-06-09'); // søn
  });

  it('gir neste mandag for søndag (ikke søndag selv)', () => {
    // 2025-06-15 er søndag — uka starter mandag 09.06, ikke søndag 15.06
    expect(weekStartISO('2025-06-15')).not.toBe('2025-06-15');
    expect(weekStartISO('2025-06-16')).toBe('2025-06-16'); // neste mandag
  });
});

describe('varsler og endring', () => {
  it('consecutiveHighPainDays teller sammenhengende dager med smerte >= 6', () => {
    const entries = [
      entry(iso(0), { pains: [{ bodyPart: 'kne', level: 7 }] }),
      entry(iso(1), { pains: [{ bodyPart: 'kne', level: 6 }] }),
      entry(iso(2), { pains: [{ bodyPart: 'kne', level: 3 }] })
    ];
    expect(consecutiveHighPainDays(entries, 6, NOW)).toBe(2);
  });

  it('loadChangePercent sammenligner to perioder', () => {
    const entries: DayEntry[] = [];
    for (let i = 0; i < 7; i++) entries.push(entry(iso(i), { load: 10 })); // denne uken: 70
    for (let i = 7; i < 14; i++) entries.push(entry(iso(i), { load: 5 })); // forrige uke: 35
    expect(loadChangePercent(entries, 7, NOW)).toBeCloseTo(100);
  });

  it('loadChangePercent er null når forrige periode er 0', () => {
    const entries = [entry(iso(0), { load: 5 })];
    expect(loadChangePercent(entries, 7, NOW)).toBeNull();
  });
});
