import type { Category, DayEntry } from './types';
import { categoryLabel } from './categories';
import { formatDayLong } from './dates';

export interface BackupFile {
  format: 'belast-backup';
  version: 2;
  exportedAt: string;
  categories?: Category[]; // brukerens kategorier (etiketter)
  entries: DayEntry[];
}

export function buildBackup(entries: DayEntry[], categories: Category[] = []): BackupFile {
  return {
    format: 'belast-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    categories,
    entries
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

export function exportBackup(entries: DayEntry[], categories: Category[] = []): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(buildBackup(entries, categories), `belast-backup-${date}.json`);
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text);
  if (parsed?.format !== 'belast-backup' || (parsed?.version !== 1 && parsed?.version !== 2)) {
    throw new Error('Ugyldig backup-fil');
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error('Backup-filen mangler registreringer');
  }
  return parsed as BackupFile;
}

/** Etikett for aktivitet (med fallback for ukjente nøkler). */
function activityLabel(categories: Category[], key: string): string {
  return categoryLabel(categories, 'activity', key).label;
}

function bodyPartLabel(categories: Category[], key: string): string {
  return categoryLabel(categories, 'body_part', key).label;
}

export function exportCsv(entries: DayEntry[], categories: Category[] = []): void {
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
    const activities = e.activities.map((a) => activityLabel(categories, a)).join(', ');
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
            bodyPartLabel(categories, p.bodyPart),
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
  triggerDownload(blob, `belast-${date}.csv`);
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
