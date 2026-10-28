import { supabase } from './supabase';
import { getUserId } from './auth';
import {
  db,
  getAllEntries,
  getDirtySyncMeta,
  markSynced,
  hardDeleteEntry,
  addConflict,
  getSyncMeta
} from './db';
import { entryToRow, rowToEntry, sameDayContent, type DayEntryRow } from './supabaseTypes';
import type { DayEntry } from './types';
import { kvGet, kvSet } from './db';

/**
 * Synkronisering mellom lokal IndexedDB og Supabase.
 *
 * Modell: lokal-first. Appen skriver alltid lokalt først (fungerer offline).
 * Synk kjører i bakgrunnen: push (dirty → sky), pull (sky → lokal),
 * og realtime-abonnement for endringer fra andre enheter.
 *
 * Konfliktregel: sist-skrevet-vinner (updated_at). Taperen arkiveres
 * i conflicts-tabellen og kan inspiseres/gjenopprettes manuelt.
 */

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingPush: number;
}

type Listener = (state: SyncState) => void;

const LAST_SYNC_KEY = 'sync:lastSyncAt';

class SyncManager {
  private state: SyncState = { status: 'idle', lastSyncAt: null, lastError: null, pendingPush: 0 };
  private listeners = new Set<Listener>();
  private syncing = false;
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
  private onlineHandler = () => void this.sync();

  async init(): Promise<void> {
    this.state.lastSyncAt = await kvGet<string | null>(LAST_SYNC_KEY, null);
    this.state.pendingPush = (await getDirtySyncMeta()).length;
    window.addEventListener('online', this.onlineHandler);
    this.subscribeRealtime();
  }

  destroy(): void {
    window.removeEventListener('online', this.onlineHandler);
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  getState(): SyncState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.getState());
  }

  /** Hovedinngang: kjør full synk (push + pull). Kalles ved innlogging, nettilkobling, og etter hver lagring. */
  async sync(): Promise<void> {
    if (this.syncing) return;
    const userId = await getUserId();
    if (!userId) return;
    if (!navigator.onLine) {
      this.setState({ status: 'offline' });
      return;
    }
    this.syncing = true;
    this.setState({ status: 'syncing', lastError: null });
    try {
      await this.push(userId);
      await this.pull(userId);
      await kvSet(LAST_SYNC_KEY, new Date().toISOString());
      this.setState({
        status: 'idle',
        lastSyncAt: new Date().toISOString(),
        pendingPush: (await getDirtySyncMeta()).length
      });
    } catch (e) {
      this.setState({
        status: 'error',
        lastError: e instanceof Error ? e.message : 'Ukjent synkfeil',
        pendingPush: (await getDirtySyncMeta()).length
      });
    } finally {
      this.syncing = false;
    }
  }

  /** Push alle dirty rader til skyen (upsert + tombstones). */
  private async push(userId: string): Promise<void> {
    const dirty = await getDirtySyncMeta();
    for (const meta of dirty) {
      if (meta.deleted) {
        // Tombstone: upsert rad med deleted=true, eller hard delete i sky.
        // Vi bruker deleted-flagget slik at sletting synkroniseres til andre enheter.
        const { error } = await supabase.from('day_entries').upsert({
          user_id: userId,
          date: meta.date,
          activities: [],
          load: 1,
          duration_min: null,
          note: null,
          pains: [],
          updated_at: new Date().toISOString(),
          deleted: true
        }, { onConflict: 'user_id,date' });
        if (error) throw new Error(`Push sletting feilet (${meta.date}): ${error.message}`);
        await markSynced(meta.date, true);
        continue;
      }
      const entry = await db.days.get(meta.date);
      if (!entry) {
        await markSynced(meta.date, true);
        continue;
      }
      const row = entryToRow(entry, userId);
      const { error } = await supabase
        .from('day_entries')
        .upsert(row, { onConflict: 'user_id,date' });
      if (error) throw new Error(`Push feilet (${meta.date}): ${error.message}`);
      await markSynced(meta.date, false);
    }
  }

  /** Pull alle rader fra skyen som er nyere enn vår sist synkroniserte versjon. */
  private async pull(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('day_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    if (error) throw new Error(`Pull feilet: ${error.message}`);
    if (!data) return;

    for (const raw of data as DayEntryRow[]) {
      const cloudEntry = rowToEntry({ ...raw, pains: raw.pains ?? [] });
      const meta = await getSyncMeta(raw.date);
      const local = await db.days.get(raw.date);

      if (raw.deleted) {
        // Sletting i skyen → slett lokalt (hvis ikke lokal er dirty og nyere)
        if (local && meta?.dirty && new Date(local.updatedAt) > new Date(raw.updated_at)) {
          continue; // lokal endring vinner, vil pushes tilbake
        }
        if (local) await hardDeleteEntry(raw.date);
        continue;
      }

      if (!local) {
        // Finnes ikke lokalt → skriv fra sky
        await db.days.put(cloudEntry);
        await markSynced(raw.date, false);
        continue;
      }

      if (meta?.dirty) {
        // Lokal endring ikke synket — sammenlign tidstempler
        if (new Date(local.updatedAt) > new Date(raw.updated_at)) {
          continue; // lokal vinner, vil pushes neste runde
        }
        if (new Date(local.updatedAt) < new Date(raw.updated_at)) {
          // Sky vinner — men arkiver lokal versjon først (konflikt)
          if (!sameDayContent(local, cloudEntry)) {
            await addConflict({
              date: raw.date,
              detectedAt: new Date().toISOString(),
              localEntry: local,
              cloudEntry,
              resolution: 'cloud'
            });
          }
          await db.days.put(cloudEntry);
          await markSynced(raw.date, false);
        }
        continue;
      }

      // Ikke dirty lokalt — ta sky-versjonen hvis nyere
      if (new Date(raw.updated_at) > new Date(local.updatedAt)) {
        if (!sameDayContent(local, cloudEntry)) {
          await addConflict({
            date: raw.date,
            detectedAt: new Date().toISOString(),
            localEntry: local,
            cloudEntry,
            resolution: 'cloud'
          });
        }
        await db.days.put(cloudEntry);
        await markSynced(raw.date, false);
      }
    }
  }

  /** Full nedlasting fra skyen (første innlogging på ny enhet). Overskriver ikke dirty lokale rader. */
  async fullDownload(): Promise<{ imported: number; skipped: number }> {
    const userId = await getUserId();
    if (!userId) throw new Error('Ikke logget inn');
    const { data, error } = await supabase
      .from('day_entries')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(`Nedlasting feilet: ${error.message}`);

    let imported = 0;
    let skipped = 0;
    for (const raw of (data ?? []) as DayEntryRow[]) {
      if (raw.deleted) continue;
      const cloudEntry = rowToEntry({ ...raw, pains: raw.pains ?? [] });
      const meta = await getSyncMeta(raw.date);
      if (meta?.dirty) {
        skipped++;
        continue;
      }
      await db.days.put(cloudEntry);
      await markSynced(raw.date, false);
      imported++;
    }
    this.setState({ pendingPush: (await getDirtySyncMeta()).length });
    return { imported, skipped };
  }

  /** Slett ALLE data i skyen for innlogget bruker (GDPR). */
  async deleteAllCloudData(): Promise<void> {
    const { error } = await supabase.rpc('delete_all_my_data');
    if (error) throw new Error(`Sletting i sky feilet: ${error.message}`);
  }

  /** Eksporter alle rader fra skyen (for backup/deling). */
  async exportCloudData(): Promise<DayEntry[]> {
    const userId = await getUserId();
    if (!userId) throw new Error('Ikke logget inn');
    const { data, error } = await supabase
      .from('day_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted', false)
      .order('date', { ascending: true });
    if (error) throw new Error(`Eksport feilet: ${error.message}`);
    return ((data ?? []) as DayEntryRow[]).map((r) => rowToEntry({ ...r, pains: r.pains ?? [] }));
  }

  /** Realtime: når en annen enhet endrer data, hent ned umiddelbart. */
  private subscribeRealtime(): void {
    this.realtimeChannel = supabase
      .channel('belast-day-entries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'day_entries' },
        () => {
          void this.sync();
        }
      )
      .subscribe();
  }
}

export const syncManager = new SyncManager();

/** Hent alle lokale data (for eksport/backup) — uendret fra før. */
export async function getAllLocalEntries(): Promise<DayEntry[]> {
  return getAllEntries();
}
