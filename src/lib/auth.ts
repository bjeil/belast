import { sha256Hex } from './sha256';

/**
 * Enkel lokal innlogging. Brukernavn og passord er konfigurert her i koden;
 * kun SHA-256-hash av passordet sammenlignes – aldri klartekst.
 * Økt lagres i sessionStorage (ryddes når nettleserfanen lukkes).
 */

export const AUTH_USER = 'belast';

// sha256("Belast2026")
export const AUTH_PASS_HASH = '91346aa7a88f13032c90d6a4775d0448f7fbbb48accbf25b815d9c3f66572e23';

const SESSION_KEY = 'belast:session';

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
