import { useEffect, useRef, useState } from 'react';
import {
  clearAllEntries,
  getAllEntries,
  getSettings,
  saveSettings,
  getConflicts,
  clearConflicts,
  clearAllCategories,
  saveCategoryRow,
  type ConflictRow
} from '../lib/db';
import { getAllCategories, seedDefaultCategories } from '../lib/categories';
import { exportBackup, exportCsv, parseBackup } from '../lib/export';
import { syncManager, type SyncState } from '../lib/sync';
import { saveEntry } from '../lib/db';
import { Card, CardTitle } from '../components/ui';
import CategoriesEditor from './CategoriesEditor';

interface SettingsProps {
  onThemeChanged: () => void;
}

export default function Settings({ onThemeChanged }: SettingsProps) {
  const [msg, setMsg] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [entryCount, setEntryCount] = useState(0);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmCloudWipe, setConfirmCloudWipe] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setEntryCount((await getAllEntries()).length);
    setTheme((await getSettings()).theme);
    setConflicts(await getConflicts());
  };

  useEffect(() => {
    refresh();
    const unsub = syncManager.subscribe(setSyncState);
    return unsub;
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3500);
  };

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    await saveSettings({ theme: next });
    onThemeChanged();
  };

  const doExportBackup = async () => {
    const entries = await getAllEntries();
    const categories = await getAllCategories();
    exportBackup(entries, categories);
    flash('Backup lastet ned ✔');
  };

  const doExportCsv = async () => {
    const entries = await getAllEntries();
    const categories = await getAllCategories();
    exportCsv(entries, categories);
    flash('CSV lastet ned ✔');
  };

  const doExportCloud = async () => {
    setBusy(true);
    try {
      const { entries, categories } = await syncManager.exportCloudData();
      exportBackup(entries, categories);
      flash(`Eksportert ${entries.length} dager fra skyen ✔`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Eksport fra sky feilet');
    }
    setBusy(false);
  };

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      for (const entry of backup.entries) {
        await saveEntry(entry);
      }
      if (backup.categories && backup.categories.length > 0) {
        // Importer kategorier fra backup (versjon 2)
        await seedDefaultCategories();
        for (const c of backup.categories) {
          await saveCategoryRow({ ...c, dirty: true });
        }
      }
      await refresh();
      void syncManager.sync();
      flash(`Importert ${backup.entries.length} dager ✔ (synkroniseres)`);
    } catch {
      flash('Kunne ikke lese backup-filen. Sjekk at det er riktig fil.');
    }
  };

  const doFullDownload = async () => {
    setBusy(true);
    try {
      const r = await syncManager.fullDownload();
      await refresh();
      flash(`Lastet ned ${r.imported} dager fra skyen (${r.skipped} lokale endringer beholdt)`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Nedlasting feilet');
    }
    setBusy(false);
  };

  const doForceSync = async () => {
    await syncManager.sync();
    await refresh();
    flash('Synkronisering fullført ✔');
  };

  const wipeLocal = async () => {
    await clearAllEntries();
    await clearAllCategories();
    await seedDefaultCategories();
    await refresh();
    setConfirmWipe(false);
    flash('Alle lokale data er slettet');
  };

  const wipeCloud = async () => {
    setBusy(true);
    try {
      await syncManager.deleteAllCloudData();
      await clearAllEntries();
      await clearAllCategories();
      await seedDefaultCategories();
      await refresh();
      setConfirmCloudWipe(false);
      flash('Alle data slettet — lokalt og i skyen');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Sletting i sky feilet');
    }
    setBusy(false);
  };

  const lastSyncText = syncState.lastSyncAt
    ? new Date(syncState.lastSyncAt).toLocaleString('nb-NO')
    : 'Aldri';

  return (
    <div className="space-y-4">
      <CategoriesEditor />

      <Card>
        <CardTitle>Synkronisering (sky)</CardTitle>
        <div className="space-y-2 text-sm text-app-text/70">
          <p>
            Status: <strong className="text-app-gold">
              {syncState.status === 'idle' && syncState.pendingPush === 0 && 'Synkronisert ✔'}
              {syncState.status === 'syncing' && 'Synkroniserer …'}
              {syncState.status === 'error' && 'Feil — se under'}
              {syncState.status === 'offline' && 'Offline'}
              {syncState.pendingPush > 0 && ` (${syncState.pendingPush} endringer venter)`}
            </strong>
          </p>
          <p>Sist synkronisert: {lastSyncText}</p>
          {syncState.lastError && (
            <p className="text-app-pain-soft">Feil: {syncState.lastError}</p>
          )}
        </div>
        <div className="mt-3 space-y-2">
          <button onClick={doForceSync} className="btn-ghost w-full" disabled={busy}>
            🔄 Synkroniser nå
          </button>
          <button onClick={doFullDownload} className="btn-ghost w-full" disabled={busy}>
            ⬇️ Last ned alle data fra skyen
          </button>
        </div>
        <p className="mt-3 text-xs text-app-text/50">
          Appen fungerer offline. Endringer lagres lokalt først og synkroniseres automatisk
          når nettet er tilbake — også når den andre enheten gjør endringer.
        </p>
      </Card>

      {conflicts.length > 0 && (
        <Card>
          <CardTitle className="text-amber-500 dark:text-amber-400">Synkroniseringskonflikter ({conflicts.length})</CardTitle>
          <p className="mb-2 text-xs text-app-text/60">
            Samme dag ble endret på to enheter samtidig. Nyeste versjon vant;
            den andre er arkivert her.
          </p>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-lg border border-amber-400/30 bg-app-surface-deep/60 p-2 text-xs">
                <p className="font-semibold text-app-gold">{c.date}</p>
                <p className="text-app-text/60">
                  Vinner: {c.resolution === 'cloud' ? 'sky' : 'lokal'} · belastning {c.cloudEntry.load} (sky) / {c.localEntry.load} (lokal)
                </p>
              </div>
            ))}
          </div>
          <button onClick={async () => { await clearConflicts(); await refresh(); }} className="btn-ghost mt-2 w-full">
            Fjern konfliktlogg
          </button>
        </Card>
      )}

      <Card>
        <CardTitle>Utseende</CardTitle>
        <button onClick={toggleTheme} className="btn-ghost w-full">
          {theme === 'dark' ? '☀️ Bytt til lyst tema' : '🌙 Bytt til mørkt tema'}
        </button>
      </Card>

      <Card>
        <CardTitle>Data og sikkerhetskopi</CardTitle>
        <p className="mb-3 text-sm text-app-text/65">
          {entryCount} dager lokalt. Last ned backup jevnlig – spesielt før du bytter telefon.
        </p>
        <div className="space-y-2">
          <button onClick={doExportBackup} className="btn-primary w-full">
            ⬆️ Last ned backup (JSON, lokalt)
          </button>
          <button onClick={doExportCsv} className="btn-ghost w-full">
            ⬆️ Eksporter til CSV (Excel)
          </button>
          <button onClick={doExportCloud} className="btn-ghost w-full" disabled={busy}>
            ☁️ Eksporter alle data fra skyen (JSON)
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full">
            ⬆️ Importer backup (JSON)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={doImport}
          />
        </div>
        <p className="mt-3 text-xs text-app-text/50">
          CSV-filen kan deles med trener, fysioterapeut eller åpnes i Excel/Numbers/Google Sheets.
          JSON-backup brukes for å gjenopprette data på denne eller en annen enhet.
        </p>
      </Card>

      <Card>
        <CardTitle className="text-app-pain-soft">Faresone</CardTitle>
        {confirmWipe ? (
          <div className="space-y-2">
            <p className="text-sm text-app-text/75">
              Sletter <strong>lokale</strong> data på denne enheten. Data i skyen beholdes
              (lastes ned igjen ved neste synk).
            </p>
            <div className="flex gap-2">
              <button onClick={wipeLocal} className="btn-ghost flex-1 border-app-pain-soft/60 text-app-pain-soft">
                Ja, slett lokalt
              </button>
              <button onClick={() => setConfirmWipe(false)} className="btn-ghost flex-1">
                Avbryt
              </button>
            </div>
          </div>
        ) : confirmCloudWipe ? (
          <div className="space-y-2">
            <p className="text-sm text-app-text/75">
              Dette sletter <strong>alle data permanent</strong> — både lokalt på denne enheten
              OG i skyen (alle enheter). Kan ikke angres. Ta backup først!
            </p>
            <div className="flex gap-2">
              <button onClick={wipeCloud} className="btn-ghost flex-1 border-app-pain-soft/60 text-app-pain-soft" disabled={busy}>
                Ja, slett alt overalt
              </button>
              <button onClick={() => setConfirmCloudWipe(false)} className="btn-ghost flex-1">
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setConfirmWipe(true)}
              className="btn-ghost w-full border-app-pain-soft/40 text-app-pain-soft"
            >
              🗑️ Slett lokale data (denne enheten)
            </button>
            <button
              onClick={() => setConfirmCloudWipe(true)}
              className="btn-ghost w-full border-app-pain-soft/60 text-app-pain-soft"
            >
              ☁️🗑️ Slett ALLE data (lokalt + sky)
            </button>
          </div>
        )}
      </Card>

      {msg && (
        <p className="pb-2 text-center text-sm font-medium text-app-gold">{msg}</p>
      )}

      <p className="pb-2 text-center text-[10px] text-app-text/30">
        Belast · versjon {__BUILD_TIME__.slice(0, 10)}
      </p>
    </div>
  );
}
