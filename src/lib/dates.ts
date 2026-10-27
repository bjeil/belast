import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek
} from 'date-fns';
import { nb } from 'date-fns/locale';

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(startOfDay(now));
}

export function parseDay(iso: string): Date {
  return startOfDay(parseISO(iso));
}

export function formatDayShort(iso: string): string {
  return format(parseDay(iso), 'd. MMM', { locale: nb });
}

export function formatDayLong(iso: string): string {
  return format(parseDay(iso), "EEEE d. MMMM yyyy", { locale: nb });
}

export function formatWeekdayShort(iso: string): string {
  return format(parseDay(iso), 'EEEEEE', { locale: nb });
}

/** Antall dager i et statistikkvindu, 'all' = alle dager fra første til i dag. */
export function windowDays(window: 7 | 30 | 90 | 'all', entries: { date: string }[], now: Date = new Date()): string[] {
  if (window === 'all') {
    if (entries.length === 0) return [todayISO(now)];
    const sorted = entries.map((e) => e.date).sort();
    const first = parseDay(sorted[0]);
    const last = startOfDay(now);
    const days: string[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) days.push(toISODate(d));
    return days;
  }
  const start = startOfDay(addDays(now, -(window - 1)));
  const days: string[] = [];
  for (let i = 0; i < window; i++) days.push(toISODate(addDays(start, i)));
  return days;
}

/** Filtrer poster til et gitt vindu (inkludert). Returnerer kun eksisterende poster. */
export function entriesInWindow(
  entries: { date: string }[],
  window: 7 | 30 | 90 | 'all',
  now: Date = new Date()
): { date: string }[] {
  const days = new Set(windowDays(window, entries, now));
  return entries.filter((e) => days.has(e.date));
}

/** Nåværende registreringsstreak: antall sammenhengende dager med post bakover fra i dag. */
export function currentStreak(entries: { date: string }[], now: Date = new Date()): number {
  const set = new Set(entries.map((e) => e.date));
  let streak = 0;
  let cursor = startOfDay(now);
  while (set.has(toISODate(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Lengste streak noensinne. */
export function longestStreak(entries: { date: string }[]): number {
  const set = new Set(entries.map((e) => e.date));
  let best = 0;
  let current = 0;
  let cursor: Date | null = null;
  const all = Array.from(set).sort();
  for (const iso of all) {
    if (cursor && differenceInCalendarDays(parseDay(iso), cursor) === 1) {
      current++;
    } else {
      current = 1;
    }
    cursor = parseDay(iso);
    best = Math.max(best, current);
  }
  return best;
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  return isSameDay(parseDay(iso), startOfDay(now));
}

export function isFuture(iso: string, now: Date = new Date()): boolean {
  return parseDay(iso) > startOfDay(now);
}

export function weekStartISO(iso: string): string {
  return toISODate(startOfWeek(parseDay(iso), { weekStartsOn: 1 }));
}

export const WEEKDAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
