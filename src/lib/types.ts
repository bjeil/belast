export type ActivityType =
  | 'kamp_sonelag'
  | 'trening_sonelag'
  | 'kamp_hana'
  | 'trening_hana'
  | 'egentrening'
  | 'hviledag'
  | 'annet';

export const ACTIVITY_TYPES: ActivityType[] = [
  'kamp_sonelag',
  'trening_sonelag',
  'kamp_hana',
  'trening_hana',
  'egentrening',
  'hviledag',
  'annet'
];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  kamp_sonelag: 'Kamp – sonelag',
  trening_sonelag: 'Trening – sonelag',
  kamp_hana: 'Kamp – Hana',
  trening_hana: 'Trening – Hana',
  egentrening: 'Egentrening',
  hviledag: 'Hviledag',
  annet: 'Annet'
};

export type BodyPart = 'rygg' | 'hofte' | 'lar' | 'kne' | 'legg' | 'fot' | 'annet';

export const BODY_PARTS: BodyPart[] = ['rygg', 'hofte', 'lar', 'kne', 'legg', 'fot', 'annet'];

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  rygg: 'Rygg',
  hofte: 'Hofte',
  lar: 'Lår',
  kne: 'Kne',
  legg: 'Legg',
  fot: 'Fot',
  annet: 'Annet'
};

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

export interface Profile {
  playerName: string;
  birthYear?: number;
  team: string; // f.eks. "Sonelag" / "Hana"
}

export interface AppSettings {
  theme: 'dark' | 'light';
}

export type StatsWindow = 7 | 30 | 90 | 'all';
