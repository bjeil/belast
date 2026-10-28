/**
 * Aktivitetstyper og kroppsdeler lagres som fritekst-nøkler (string) i loggen.
 * Etikettene og hvilke valg som finnes styres av brukerens kategorier
 * (se lib/categories.ts og tabellen `categories` i Supabase).
 */

export type ActivityType = string;
export type BodyPart = string;

/** Nøkkel for innebygd systemkategori: hviledag (kan ikke fjernes). */
export const REST_DAY = 'hviledag';
export const REST_DAY_LABEL = 'Hviledag';

export type CategoryKind = 'activity' | 'body_part';

export interface Category {
  id?: number; // lokal Dexie-id (auto)
  userId?: string; // settes ved synk
  kind: CategoryKind;
  key: string; // stabil nøkkel brukt i loggen, f.eks. "kamp_akademi"
  label: string; // visningsnavn, f.eks. "Kamp – akademi"
  sortOrder: number;
  active: boolean; // false = "utdatert"/fjernet — beholdes for historikk
  dirty?: boolean; // lokal endring ikke ennå pushet til skyen
  updatedAt: string; // ISO — sist-skrevet-vinner ved synk
}

export interface PainEntry {
  bodyPart: BodyPart;
  level: number; // 1-10
  note?: string;
}

export interface DayEntry {
  id: string; // yyyy-MM-dd, én post per dag
  date: string;
  activities: ActivityType[];
  load: number; // 1-10, opplevd belastning (sRPE)
  durationMin?: number;
  pains: PainEntry[];
  note?: string;
  updatedAt: string; // ISO-tidsstempel
}

export interface AppSettings {
  theme: 'dark' | 'light';
}

export type StatsWindow = 7 | 30 | 90 | 'all';

/** Én planlagt trening i en ukeplan (dag + økt). */
export interface PlannedSession {
  activity: ActivityType; // kategorinøkkel, f.eks. "kamp_akademi"
  load: number; // 1-10, planlagt belastning
  durationMin: number; // planlagt tid i minutter
  note?: string; // fritekst, vises i liten skrift i ukeplanen
}

/** Én dag i ukeplanen (mandag–søndag, 0 = mandag). */
export interface PlannedDay {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  sessions: PlannedSession[];
}

/** En ukeplan (alltid mandag–søndag). Favoritter sorteres øverst i listen. */
export interface WeekPlan {
  id: string; // uuid
  name: string;
  favorite: boolean;
  days: PlannedDay[]; // alltid 7 dager, sortert 0..6
  updatedAt: string; // ISO — sist-skrevet-vinner ved synk
  dirty?: boolean; // lokal endring ikke ennå pushet til skyen
}
