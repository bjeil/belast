import { useCallback, useEffect, useState } from 'react';
import Login from './features/Login';
import Home from './features/Home';
import Log from './features/Log';
import Stats from './features/Stats';
import Settings from './features/Settings';
import { isLoggedIn, logout } from './lib/auth';
import { getProfile, getSettings } from './lib/db';

type Tab = 'home' | 'log' | 'stats' | 'settings';

export default function App() {
  const [authed, setAuthed] = useState<boolean>(isLoggedIn());
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [lightMode, setLightMode] = useState(false);

  const refreshProfile = useCallback(async () => {
    const p = await getProfile();
    setPlayerName(p.playerName);
  }, []);

  useEffect(() => {
    refreshProfile();
    getSettings().then((s) => setLightMode(s.theme === 'light'));
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
                TRENINGSDAGBOK
              </h1>
              {playerName && (
                <p className="text-xs text-viking-gold">{playerName}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              setAuthed(false);
            }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-viking-white/80 hover:bg-white/5"
          >
            Logg ut
          </button>
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
