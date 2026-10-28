import { useCallback, useEffect, useState } from 'react';
import Login from './features/Login';
import Home from './features/Home';
import Log from './features/Log';
import Stats from './features/Stats';
import Settings from './features/Settings';
import { isLoggedIn, logout, onAuthChange } from './lib/auth';
import { getProfile, getSettings } from './lib/db';
import { syncManager, type SyncState } from './lib/sync';

type Tab = 'home' | 'log' | 'stats' | 'settings';

function SyncIndicator({ state }: { state: SyncState }) {
  const map: Record<SyncState['status'], { icon: string; text: string; cls: string }> = {
    idle: { icon: '☁️', text: state.pendingPush > 0 ? `Venter på synk (${state.pendingPush})` : 'Synkronisert', cls: 'text-emerald-400' },
    syncing: { icon: '🔄', text: 'Synkroniserer …', cls: 'text-viking-gold animate-pulse' },
    error: { icon: '⚠️', text: 'Synkfeil — lokal data er trygg', cls: 'text-[#E05A66]' },
    offline: { icon: '📴', text: 'Offline — endringer lagres lokalt', cls: 'text-viking-white/60' }
  };
  const s = map[state.status];
  return (
    <span className={`text-[11px] ${s.cls}`} title={state.lastError ?? s.text}>
      {s.icon} {s.text}
    </span>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [lightMode, setLightMode] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());

  const refreshProfile = useCallback(async () => {
    const p = await getProfile();
    setPlayerName(p.playerName);
  }, []);

  useEffect(() => {
    isLoggedIn().then(async (ok) => {
      setAuthed(ok);
      if (ok) {
        await syncManager.init();
        void syncManager.sync().then(bump);
      }
    });
    getSettings().then((s) => setLightMode(s.theme === 'light'));
    const unsubSync = syncManager.subscribe(setSyncState);
    const unsubAuth = onAuthChange((loggedIn) => {
      setAuthed(loggedIn);
      if (loggedIn) {
        void syncManager.sync().then(bump);
      } else {
        syncManager.destroy();
      }
    });
    const unsubSyncData = syncManager.subscribe((s) => {
      // Når en synk er ferdig (data kan ha kommet fra skyen), frisk opp visningene
      if (s.status === 'idle') bump();
    });
    return () => {
      unsubSync();
      unsubAuth();
      unsubSyncData();
    };
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', !lightMode);
    document.documentElement.classList.toggle('light', lightMode);
    document.body.classList.toggle('bg-slate-100', lightMode);
    document.body.classList.toggle('text-slate-900', lightMode);
    document.body.classList.toggle('bg-viking-blue-deep', !lightMode);
    document.body.classList.toggle('text-viking-white', !lightMode);
  }, [lightMode]);

  const bump = () => setRefreshKey((k) => k + 1);

  if (authed === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-viking-gold border-t-transparent" />
      </div>
    );
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: 'Hjem', icon: '🏠' },
    { id: 'log', label: 'Loggfør', icon: '📝' },
    { id: 'stats', label: 'Statistikk', icon: '📊' },
    { id: 'settings', label: 'Innstillinger', icon: '⚙️' }
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-28">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-viking-blue-deep/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-viking-blue ring-2 ring-viking-gold">
              <span className="font-display text-sm text-viking-gold">V</span>
            </div>
            <div>
              <h1 className="font-display text-base tracking-wide text-viking-white">
                BELAST
              </h1>
              {playerName && (
                <p className="text-xs text-viking-gold">{playerName}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SyncIndicator state={syncState} />
            <button
              onClick={async () => {
                await logout();
                setAuthed(false);
              }}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-viking-white/80 hover:bg-white/5"
            >
              Logg ut
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4">
        {tab === 'home' && <Home key={`h${refreshKey}`} onNavigate={setTab} />}
        {tab === 'log' && <Log key={`l${refreshKey}`} onSaved={bump} />}
        {tab === 'stats' && <Stats key={`s${refreshKey}`} />}
        {tab === 'settings' && (
          <Settings
            key={`set${refreshKey}`}
            onProfileChanged={refreshProfile}
            onThemeChanged={async () => {
              const s = await getSettings();
              setLightMode(s.theme === 'light');
            }}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-viking-blue-deep/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                tab === t.id ? 'text-viking-gold' : 'text-viking-white/55 hover:text-viking-white/80'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
