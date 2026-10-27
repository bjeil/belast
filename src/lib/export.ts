import type { DayEntry, Profile } from './types';
import { ACTIVITY_LABELS, BODY_PART_LABELS } from './types';
import { formatDayLong } from './dates';

export interface BackupFile {
  format: 'viking-treningsdagbok-backup';
  version: 1;
  exportedAt: string;
  profile: Profile;
  entries: DayEntry[];
}

export function buildBackup(profile: Profile, entries: DayEntry[]): BackupFile {
  return {
    format: 'viking-treningsdagbok-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    entries
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

export function exportBackup(profile: Profile, entries: DayEntry[]): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(buildBackup(profile, entries), `viking-treningsdagbok-backup-${date}.json`);
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text);
  if (parsed?.format !== 'viking-treningsdagbok-backup' || parsed?.version !== 1) {
    throw new Error('Ugyldig backup-fil');
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error('Backup-filen mangler registreringer');
  }
  return parsed as BackupFile;
}

export function exportCsv(entries: DayEntry[]): void {
  const header = [
    'Dato',
    'Ukesdag',
    'Aktiviteter',
    'Belastning (1-10)',
    'Varighet (min)',
    'Smerte - kroppsdel',
    'Smerte - nivå (1-10)',
    'Smerte - kommentar',
    'Kommentar'
  ];
  const escape = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const rows: string[] = [header.map(escape).join(';')];

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    const activities = e.activities.map((a) => ACTIVITY_LABELS[a]).join(', ');
    const weekday = formatDayLong(e.date).split(' ')[0];
    if (e.pains.length === 0) {
      rows.push(
        [
          e.date,
          weekday,
          activities,
          String(e.load),
          e.durationMin ? String(e.durationMin) : '',
          '',
          '',
          '',
          e.note ?? ''
        ]
          .map((v) => escape(String(v)))
          .join(';')
      );
    } else {
      for (const p of e.pains) {
        rows.push(
          [
            e.date,
            weekday,
            activities,
            String(e.load),
            e.durationMin ? String(e.durationMin) : '',
            BODY_PART_LABELS[p.bodyPart],
            String(p.level),
            p.note ?? '',
            e.note ?? ''
          ]
            .map((v) => escape(String(v)))
            .join(';')
        );
      }
    }
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `viking-treningsdagbok-${date}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
