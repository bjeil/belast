import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { ACTIVITY_TYPES, type ActivityType, type BodyPart, type DayEntry } from './types';
import { entriesInWindow, toISODate, windowDays, parseDay } from './dates';

export interface WindowStats {
  days: number; // antall dager i vinduet
  activeDays: number; // dager med registrert økt (ikke hviledag/ingen)
  totalSessions: number; // sum alle aktiviteter (multi-select teller flere)
  byType: Record<ActivityType, number>;
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
  const byType = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t, 0])) as Record<ActivityType, number>;
  const painByBodyPart = Object.fromEntries(
    ['rygg', 'hofte', 'lar', 'kne', 'legg', 'fot', 'annet'].map((p) => [
      p,
      { count: 0, totalLevel: 0, maxLevel: 0 }
    ])
  ) as Record<BodyPart, { count: number; totalLevel: number; maxLevel: number }>;
  return {
    days,
    activeDays: 0,
    totalSessions: 0,
    byType,
    totalLoad: 0,
    avgLoad: 0,
    maxLoad: 0,
    totalDurationMin: 0,
    totalPain: 0,
    avgPainPerDay: 0,
    daysWithPain: 0,
    highPainDays: 0,
    painByBodyPart,
    avgPainPerActiveDay: 0
  };
}

const isRestDay = (e: DayEntry): boolean =>
  e.activities.length === 0 || (e.activities.length === 1 && e.activities[0] === 'hviledag');

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
      for (const a of e.activities) stats.byType[a]++;
      stats.totalSessions += e.activities.length;
    }
    const dayPain = e.pains.reduce((s, p) => s + p.level, 0);
    stats.totalPain += dayPain;
    if (e.pains.length > 0) {
      stats.daysWithPain++;
      if (e.pains.some((p) => p.level >= 6)) stats.highPainDays++;
    }
    for (const p of e.pains) {
      const agg = stats.painByBodyPart[p.bodyPart];
      agg.count++;
      agg.totalLevel += p.level;
      agg.maxLevel = Math.max(agg.maxLevel, p.level);
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

/** Daglig serie for trendlinje: dato + belastning (0 på hviledager/ikke registrert). */
export function dailyLoadSeries(
  entries: DayEntry[],
  days: number,
  now: Date = new Date()
): { date: string; load: number; pain: number }[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const today = startOfDay(now);
  const series: { date: string; load: number; pain: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = toISODate(addDays(today, -i));
    const e = byDate.get(iso);
    series.push({
      date: iso,
      load: e && !isRestDay(e) ? e.load : 0,
      pain: e ? e.pains.reduce((s, p) => s + p.level, 0) : 0
    });
  }
  return series;
}

/** Ukentlig oppsummering (for søylediagram): uke-start + total belastning. */
export function weeklyLoadSeries(
  entries: DayEntry[],
  weeks: number,
  now: Date = new Date()
): { weekStart: string; totalLoad: number; sessions: number }[] {
  const today = startOfDay(now);
  const start = addDays(today, -((weeks - 1) * 7));
  const firstMonday = addDays(start, -((start.getDay() + 6) % 7));
  const buckets = new Map<string, { totalLoad: number; sessions: number }>();
  for (let i = 0; i < weeks; i++) {
    buckets.set(toISODate(addDays(firstMonday, i * 7)), { totalLoad: 0, sessions: 0 });
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
    }
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => ({ weekStart, ...v }));
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

export { differenceInCalendarDays };
