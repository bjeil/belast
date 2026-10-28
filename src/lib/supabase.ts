import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase-klient. Anon-nøkkelen er offentlig BY DESIGN — sikkerheten ligger i
 * Row Level Security (RLS), som kun slipper inn autentiserte brukere med egne rader.
 */

const SUPABASE_URL = 'https://afhwprvvkmsdqhlhppkj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FSiz0YPwRVRQdqhQkfrsMw_ET6lO6u1';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
});

/** Intern e-post som brukes bak brukernavnet "cbl" (må aldri vises i UI). */
export const INTERNAL_EMAIL = 'cbl@belast.app';
export const AUTH_USERNAME = 'cbl';

export function usernameToEmail(username: string): string {
  return username.trim().toLowerCase() === AUTH_USERNAME ? INTERNAL_EMAIL : `${username.trim().toLowerCase()}@belast.app`;
}
