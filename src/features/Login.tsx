import { useState } from 'react';
import { login } from '../lib/auth';

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await login(username, password);
    setBusy(false);
    if (ok) {
      onSuccess();
    } else {
      setError('Feil brukernavn eller passord.');
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-viking-blue ring-4 ring-viking-gold">
            <span className="font-display text-3xl text-viking-gold">V</span>
          </div>
          <h1 className="font-display text-2xl uppercase tracking-widest text-viking-white">
            Belast
          </h1>
          <p className="mt-2 text-sm text-viking-gold">Viking FK · Power &amp; Love</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="username" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-viking-white/60">
              Brukernavn
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-3 text-viking-white outline-none focus:border-viking-gold"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-viking-white/60">
              Passord
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-viking-blue-deep px-4 py-3 text-viking-white outline-none focus:border-viking-gold"
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-viking-red/30 px-3 py-2 text-sm text-[#ffb3ba]">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Logger inn …' : 'Logg inn'}
          </button>
          <p className="text-center text-xs text-viking-white/45">
            Data lagres kun lokalt på denne enheten.
          </p>
        </form>
      </div>
    </div>
  );
}
