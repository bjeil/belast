import { sha256Hex } from './sha256';

/**
 * Enkel lokal innlogging. Brukernavn og passord er konfigurert her i koden;
 * kun SHA-256-hash av passordet sammenlignes – aldri klartekst.
 * Økt lagres i sessionStorage (ryddes når nettleserfanen lukkes).
 */

export const AUTH_USER = 'viking';

// sha256("Viking1899")
export const AUTH_PASS_HASH = 'f02412662c4ea691b66f25b45cc84a80f8b4f335eafb3a6c1b493eb382f47f27';

const SESSION_KEY = 'viking-treningsdagbok:session';

export async function login(username: string, password: string): Promise<boolean> {
  const ok =
    username.trim().toLowerCase() === AUTH_USER &&
    (await sha256Hex(password)) === AUTH_PASS_HASH;
  if (ok) {
    sessionStorage.setItem(SESSION_KEY, '1');
  }
  return ok;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}
