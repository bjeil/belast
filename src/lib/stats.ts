import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { REST_DAY, type ActivityType, type BodyPart, type DayEntry } from './types';
import { entriesInWindow, toISODate, windowDays, parseDay, weekdayIndex, WEEKDAY_LABELS_SHORT } from './dates';

export interface WindowStats {
  days: number; // antall dager i vinduet
  activeDays: number; // dager med registrert økt (ikke hviledag/ingen)
  totalSessions: number; // sum alle aktiviteter (multi-select teller flere)
  byType: Record<ActivityType, number>; // nøkkel = kategorinøkkel (dynamisk)
  totalLoad: number; // sum belastning over aktive dager
  avgLoad: number; // snitt belastning per aktiv dag
  maxLoad: number;
  maxLoadDay?: string;
  totalDurationMin: number;
  totalPain: number; // sum av alle smertenivåer
  avgPainPerDay: number; // snitt smerte per dag i vinduet (0 der ingen smerte)
  daysWithPain: number; // dager med minst én smerteregistrering
  highPainDays: number; // dager med smerte >= 6
  painByBodyPart: Record<BodyPart, { count: number; totalLevel: number; maxLevel: number }>;
  avgPainPerActiveDay: number;
}

function emptyWindowStats(days: number): WindowStats {
  return {
    days,
    activeDays: 0,
    totalSessions: 0,
    byType: {},
    totalLoad: 0,
    avgLoad: 0,
    maxLoad: 0,
    totalDurationMin: 0,
    totalPain: 0,
    avgPainPerDay: 0,
    daysWithPain: 0,
    highPainDays: 0,
    painByBodyPart: {},
    avgPainPerActiveDay: 0
  };
}

export const isRestDay = (e: DayEntry): boolean =>
  e.activities.length === 0 || (e.activities.length === 1 && e.activities[0] === REST_DAY);

/** Statistikk for et gitt tidsvindu. */
export function computeWindowStats(
  entries: DayEntry[],
  window: 7 | 30 | 90 | 'all',
  now: Date = new Date()
): WindowStats {
  const inWindow = entriesInWindow(entries, window, now) as DayEntry[];
  const days = windowDays(window, entries, now).length;
  const stats = emptyWindowStats(days);

  for (const e of inWindow) {
    if (!isRestDay(e)) {
      stats.activeDays++;
      stats.totalLoad += e.load;
      stats.totalDurationMin += e.durationMin ?? 0;
      if (e.load > stats.maxLoad) {
        stats.maxLoad = e.load;
        stats.maxLoadDay = e.date;
      }
      for (const a of e.activities) stats.byType[a] = (stats.byType[a] ?? 0) + 1;
      stats.totalSessions += e.activities.length;
    }
    const dayPain = e.pains.reduce((s, p) => s + p.level, 0);
    stats.totalPain += dayPain;
    if (e.pains.length > 0) {
      stats.daysWithPain++;
      if (e.pains.some((p) => p.level >= 6)) stats.highPainDays++;
    }
    for (const p of e.pains) {
      const agg = stats.painByBodyPart[p.bodyPart] ?? { count: 0, totalLevel: 0, maxLevel: 0 };
      agg.count++;
      agg.totalLevel += p.level;
      agg.maxLevel = Math.max(agg.maxLevel, p.level);
      stats.painByBodyPart[p.bodyPart] = agg;
    }
  }

  stats.avgLoad = stats.activeDays > 0 ? stats.totalLoad / stats.activeDays : 0;
  stats.avgPainPerDay = days > 0 ? stats.totalPain / days : 0;
  stats.avgPainPerActiveDay = stats.activeDays > 0 ? stats.totalPain / stats.activeDays : 0;
  return stats;
}

/**
 * Akutt:kronisk forhold (ACWR) på belastning.
 * Akutt = snitt daglig belastning siste 7 dager.
 * Kronisk = snitt daglig belastning de 28 foregående dagene (dag 8-35 bakover).
 * Returnerer null dersom det ikke finnes nok kronisk data.
 */
export function computeACWR(
  entries: DayEntry[],
  now: Date = new Date()
): { acute: number; chronic: number; ratio: number | null } {
  const byDate = new Map(entries.map((e) => [e.date, isRestDay(e) ? 0 : e.load]));
  const today = startOfDay(now);

  const avgOver = (offsets: number[]): number | null => {
    let sum = 0;
    let n = 0;
    for (const off of offsets) {
      const d = toISODate(addDays(today, -off));
      sum += byDate.get(d) ?? 0;
      n++;
    }
    return n > 0 ? sum / n : null;
  };

  const acute = avgOver([0, 1, 2, 3, 4, 5, 6]);
  const chronic = avgOver(Array.from({ length: 28 }, (_, i) => 7 + i));

  const ratio =
    acute !== null && chronic !== null && chronic > 0 ? acute / chronic : null;
  return { acute: acute ?? 0, chronic: chronic ?? 0, ratio };
}

export type AcwrZone = 'low' | 'sweet' | 'high' | 'danger' | 'unknown';

export function acwrZone(ratio: number | null): AcwrZone {
  if (ratio === null) return 'unknown';
  if (ratio < 0.8) return 'low';
  if (ratio <= 1.3) return 'sweet';
  if (ratio <= 1.5) return 'high';
  return 'danger';
}

export const ACWR_ZONE_LABELS: Record<AcwrZone, string> = {
  unknown: 'Mangler data',
  low: 'Lav belastning',
  sweet: 'Grønn sone (0,8–1,3)',
  high: 'Gul sone (1,3–1,5)',
  danger: 'Rød sone (>1,5)'
};

export interface DailyPoint {
  date: string;
  load: number;
  pain: number;
  durationMin: number; // treningstid i minutter (0 på hvile/ikke registrert)
}

/** Daglig serie for trendlinje: dato + belastning + smerte + varighet. */
export function dailyLoadSeries(
  entries: DayEntry[],
  days: number,
  now: Date = new Date()
): DailyPoint[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const today = startOfDay(now);
  const series: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = toISODate(addDays(today, -i));
    const e = byDate.get(iso);
    series.push({
      date: iso,
      load: e && !isRestDay(e) ? e.load : 0,
      pain: e ? e.pains.reduce((s, p) => s + p.level, 0) : 0,
      durationMin: e && !isRestDay(e) ? e.durationMin ?? 0 : 0
    });
  }
  return series;
}

/** Ukentlig oppsummering (for søylediagram): uke-start + total belastning. */
export function weeklyLoadSeries(
  entries: DayEntry[],
  weeks: number,
  now: Date = new Date()
): { weekStart: string; totalLoad: number; sessions: number; totalDurationMin: number }[] {
  const today = startOfDay(now);
  const start = addDays(today, -((weeks - 1) * 7));
  const firstMonday = addDays(start, -((start.getDay() + 6) % 7));
  const buckets = new Map<string, { totalLoad: number; sessions: number; totalDurationMin: number }>();
  for (let i = 0; i < weeks; i++) {
    buckets.set(toISODate(addDays(firstMonday, i * 7)), { totalLoad: 0, sessions: 0, totalDurationMin: 0 });
  }
  for (const e of entries) {
    const d = parseDay(e.date);
    if (d < start || d > today) continue;
    if (isRestDay(e)) continue;
    const monday = toISODate(addDays(d, -((d.getDay() + 6) % 7)));
    const b = buckets.get(monday);
    if (b) {
      b.totalLoad += e.load;
      b.sessions += e.activities.length;
      b.totalDurationMin += e.durationMin ?? 0;
    }
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => ({ weekStart, ...v }));
}

export interface WeeklyPoint {
  weekStart: string;
  load: number; // snitt belastning per dag i uka (0 på hvile/ikke registrert)
  pain: number; // snitt smerte (sum nivå) per dag i uka
  durationMin: number; // sum treningstid i minutter
}

/**
 * Ukentlig trend for lange vindu (f.eks. 90 dager): belastning og smerte som
 * snitt per dag, varighet som sum. Uker starter på mandag. Dager uten
 * registrering teller som 0 (og trekker snittet ned), i likhet med dagsserien.
 */
export function weeklyTrendSeries(
  entries: DayEntry[],
  days: number,
  now: Date = new Date()
): WeeklyPoint[] {
  const daily = dailyLoadSeries(entries, days, now);
  const weeks = Math.ceil(days / 7);
  const out: WeeklyPoint[] = [];
  for (let w = 0; w < weeks; w++) {
    const slice = daily.slice(w * 7, w * 7 + 7);
    if (slice.length === 0) break;
    const monday = toISODate(addDays(parseDay(slice[0].date), -((parseDay(slice[0].date).getDay() + 6) % 7)));
    out.push({
      weekStart: monday,
      load: slice.reduce((s, d) => s + d.load, 0) / slice.length,
      pain: slice.reduce((s, d) => s + d.pain, 0) / slice.length,
      durationMin: slice.reduce((s, d) => s + d.durationMin, 0)
    });
  }
  return out;
}

/** Kalender-heatmap: alle dager i vinduet med belastning 0-10. */
export function heatmapData(
  entries: DayEntry[],
  window: 7 | 30 | 90 | 'all',
  now: Date = new Date()
): { date: string; load: number; hasPain: boolean }[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return windowDays(window, entries, now).map((iso) => {
    const e = byDate.get(iso);
    return {
      date: iso,
      load: e && !isRestDay(e) ? e.load : 0,
      hasPain: !!e && e.pains.length > 0
    };
  });
}

/** Sammenheng belastning vs smerte per dag (scatter). */
export function loadVsPain(entries: DayEntry[], days: number, now: Date = new Date()): { date: string; load: number; pain: number }[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const today = startOfDay(now);
  const out: { date: string; load: number; pain: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = toISODate(addDays(today, -i));
    const e = byDate.get(iso);
    if (!e || isRestDay(e)) continue;
    out.push({
      date: iso,
      load: e.load,
      pain: e.pains.reduce((s, p) => s + p.level, 0)
    });
  }
  return out;
}

/** Antall sammenhengende dager bakover i tid med smerte >= terskel. */
export function consecutiveHighPainDays(entries: DayEntry[], threshold = 6, now: Date = new Date()): number {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  let count = 0;
  let cursor = startOfDay(now);
  for (let i = 0; i < 365; i++) {
    const e = byDate.get(toISODate(cursor));
    if (e && e.pains.some((p) => p.level >= threshold)) {
      count++;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return count;
}

/** Prosentvis endring i total belastning mellom to like lange perioder. */
export function loadChangePercent(entries: DayEntry[], window: 7 | 30 | 90, now: Date = new Date()): number | null {
  const today = startOfDay(now);
  const sum = (fromOffset: number, toOffset: number): number => {
    let total = 0;
    const byDate = new Map(entries.map((e) => [e.date, e]));
    for (let off = fromOffset; off <= toOffset; off++) {
      const e = byDate.get(toISODate(addDays(today, -off)));
      if (e && !isRestDay(e)) total += e.load;
    }
    return total;
  };
  const current = sum(0, window - 1);
  const previous = sum(window, 2 * window - 1);
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface LogTableRow {
  date: string; // yyyy-MM-dd
  weekday: string; // man, tir, ons, tor, fre, lør, søn
  durationHours: number | null; // null = ikke loggført (ikke treningstid 0)
  load: number | null; // null = ikke loggført
  pain: number; // sum smertenivåer (0 = ingen smerte)
  hasPain: boolean;
  logged: boolean; // false = dag uten registrering
}

/**
 * Rader for loggtabellen: alle datoer de siste `days` dagene (inkl. i dag),
 * nyeste først. Dager uten registrering tas med med null-verdier.
 */
export function logTableRows(entries: DayEntry[], days = 30, now: Date = new Date()): LogTableRow[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const today = startOfDay(now);
  const rows: LogTableRow[] = [];
  for (let i = 0; i < days; i++) {
    const iso = toISODate(addDays(today, -i));
    const e = byDate.get(iso);
    const pain = e ? e.pains.reduce((s, p) => s + p.level, 0) : 0;
    rows.push({
      date: iso,
      weekday: WEEKDAY_LABELS_SHORT[weekdayIndex(iso)],
      durationHours: e && e.durationMin ? e.durationMin / 60 : null,
      load: e ? e.load : null,
      pain,
      hasPain: !!e && e.pains.length > 0,
      logged: !!e
    });
  }
  return rows;
}

export { differenceInCalendarDays };
