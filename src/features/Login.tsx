import { useEffect, useState } from 'react';
import { login } from '../lib/auth';
import { syncManager } from '../lib/sync';
import { kvGet, kvSet } from '../lib/db';

const CONSENT_KEY = 'belast:consent';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [accepted, setAccepted] = useState(false);

  // Sjekk samtykke ved første visning
  useEffect(() => {
    kvGet<boolean>(CONSENT_KEY, false).then((ok) => {
      setConsent(ok);
      setAccepted(ok);
    });
  }, []);

  const acceptConsent = async () => {
    await kvSet(CONSENT_KEY, true);
    setConsent(true);
    setAccepted(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await login(username, password);
    if (ok) {
      // Første gang på denne enheten: last ned fra skyen
      if (!navigator.onLine) {
        // Offline — lokal data brukes, synk skjer når nettet er tilbake
      } else {
        try {
          await syncManager.fullDownload();
        } catch {
          // Ignorer — vanlig synk vil hente data
        }
      }
      await syncManager.init();
      void syncManager.sync();
      onSuccess();
    } else {
      setError('Feil brukernavn eller passord.');
    }
    setBusy(false);
  };

  // Allerede logget inn (session fra tidligere) — vis ingenting, App håndterer
  if (consent === null) return null;

  const logo = (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-app-surface ring-4 ring-app-gold">
        <span className="font-display text-3xl text-app-gold">V</span>
      </div>
      <h1 className="font-display text-2xl uppercase tracking-widest text-app-text">
        Belast
      </h1>
      <p className="mt-2 text-sm text-app-gold">Viking FK · Power &amp; Love</p>
    </div>
  );

  if (!consent) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {logo}
          <div className="card space-y-4 p-6">
            <h2 className="font-display text-sm uppercase tracking-widest text-app-gold">
              Før du starter
            </h2>
            <p className="text-sm text-app-text/75">
              Belast lagrer treningsloggen din i skyen (Supabase) slik at du og familien
              kan oppdatere samme logg fra flere enheter. Dataene er <strong>ikke</strong>{' '}
              koblet til navn eller andre personer — kun til denne delte kontoen.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-app-text/65">
              <li>Du kan når som helst eksportere alle data (JSON/CSV)</li>
              <li>Du kan når som helst slette alle data i skyen (Innstillinger)</li>
              <li>Appen fungerer også offline — data synkroniseres når nettet er tilbake</li>
            </ul>
            <label className="flex items-start gap-3 text-sm text-app-text/80">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 accent-viking-gold"
              />
              Jeg forstår og samtykker til at treningsdata lagres i skyen for synkronisering.
            </label>
            <button
              onClick={acceptConsent}
              disabled={!accepted}
              className="btn-primary w-full"
            >
              Godta og fortsett
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {logo}
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="username" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-app-text/60">
              Brukernavn
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-app-border/20 bg-app-surface-deep px-4 py-3 text-app-text outline-none focus:border-app-gold"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-app-text/60">
              Passord
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-app-border/20 bg-app-surface-deep px-4 py-3 text-app-text outline-none focus:border-app-gold"
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-app-pain-soft/20 px-3 py-2 text-sm text-app-pain-light">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Logger inn …' : 'Logg inn'}
          </button>
          <p className="text-center text-xs text-app-text/45">
            Data lagres lokalt på enheten og synkroniseres til skyen.
          </p>
          <p className="text-center text-[10px] text-app-text/30">
            Versjon {__BUILD_TIME__.slice(0, 10)}
          </p>
        </form>
      </div>
    </div>
  );
}
