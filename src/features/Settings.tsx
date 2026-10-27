import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../lib/types';
import {
  clearAllEntries,
  getAllEntries,
  getProfile,
  getSettings,
  saveProfile,
  saveSettings,
  saveEntry
} from '../lib/db';
import { exportBackup, exportCsv, parseBackup } from '../lib/export';
import { Card, CardTitle } from '../components/ui';

interface SettingsProps {
  onProfileChanged: () => void;
  onThemeChanged: () => void;
}

export default function Settings({ onProfileChanged, onThemeChanged }: SettingsProps) {
  const [profile, setProfile] = useState<Profile>({ playerName: '', birthYear: undefined, team: '' });
  const [msg, setMsg] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [entryCount, setEntryCount] = useState(0);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setProfile(await getProfile());
    setEntryCount((await getAllEntries()).length);
    setTheme((await getSettings()).theme);
  };

  useEffect(() => {
    refresh();
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  const save = async () => {
    await saveProfile(profile);
    onProfileChanged();
    flash('Profil lagret ✔');
  };

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    await saveSettings({ theme: next });
    onThemeChanged();
  };

  const doExportBackup = async () => {
    const entries = await getAllEntries();
    exportBackup(await getProfile(), entries);
    flash('Backup lastet ned ✔');
  };

  const doExportCsv = async () => {
    const entries = await getAllEntries();
    exportCsv(entries);
    flash('CSV lastet ned ✔');
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
      if (backup.profile) {
        await saveProfile(backup.profile);
        onProfileChanged();
      }
      await refresh();
      flash(`Importert ${backup.entries.length} dager ✔`);
    } catch {
      flash('Kunne ikke lese backup-filen. Sjekk at det er riktig fil.');
    }
  };

  const wipe = async () => {
    await clearAllEntries();
    await refresh();
    setConfirmWipe(false);
    flash('Alle registreringer er slettet');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Spillerprofil</CardTitle>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-viking-white/60">
              Navn
            </label>
            <input
              type="text"
              value={profile.playerName}
              onChange={(e) => setProfile({ ...profile, playerName: e.target.value })}
              placeholder="Fornavn"
              className="w-full rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-2.5 text-viking-white outline-none focus:border-viking-gold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-viking-white/60">
                Fødselsår
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={2000}
                max={2030}
                value={profile.birthYear ?? ''}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    birthYear: e.target.value === '' ? undefined : Number(e.target.value)
                  })
                }
                className="w-full rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-2.5 text-viking-white outline-none focus:border-viking-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-viking-white/60">
                Lag
              </label>
              <input
                type="text"
                value={profile.team}
                onChange={(e) => setProfile({ ...profile, team: e.target.value })}
                placeholder="F.eks. G13 sonelag"
                className="w-full rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-2.5 text-viking-white outline-none focus:border-viking-gold"
              />
            </div>
          </div>
          <button onClick={save} className="btn-primary">
            Lagre profil
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle>Utseende</CardTitle>
        <button onClick={toggleTheme} className="btn-ghost w-full">
          {theme === 'dark' ? '☀️ Bytt til lyst tema' : '🌙 Bytt til mørkt tema'}
        </button>
      </Card>

      <Card>
        <CardTitle>Data og sikkerhetskopi</CardTitle>
        <p className="mb-3 text-sm text-viking-white/65">
          Alle data ligger kun lokalt i denne nettleseren ({entryCount} dager registrert).
          Last ned en backup jevnlig – spesielt før du bytter telefon.
        </p>
        <div className="space-y-2">
          <button onClick={doExportBackup} className="btn-primary w-full">
            ⬇️ Last ned backup (JSON)
          </button>
          <button onClick={doExportCsv} className="btn-ghost w-full">
            ⬇️ Eksporter til CSV (Excel)
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
        <p className="mt-3 text-xs text-viking-white/50">
          CSV-filen kan deles med trener, fysioterapeut eller åpnes i Excel/Numbers/Google Sheets.
          JSON-backup brukes for å gjenopprette data på denne eller en annen enhet.
        </p>
      </Card>

      <Card>
        <CardTitle className="text-[#E05A66]">Faresone</CardTitle>
        {confirmWipe ? (
          <div className="space-y-2">
            <p className="text-sm text-viking-white/75">
              Dette sletter <strong>alle</strong> registrerte dager permanent. Ta backup først!
            </p>
            <div className="flex gap-2">
              <button
                onClick={wipe}
                className="btn-ghost flex-1 border-[#E05A66]/60 text-[#E05A66]"
              >
                Ja, slett alt
              </button>
              <button onClick={() => setConfirmWipe(false)} className="btn-ghost flex-1">
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmWipe(true)}
            className="btn-ghost w-full border-[#E05A66]/40 text-[#E05A66]"
          >
            🗑️ Slett alle data
          </button>
        )}
      </Card>

      {msg && (
        <p className="pb-2 text-center text-sm font-medium text-viking-gold">{msg}</p>
      )}
    </div>
  );
}
