import { supabase } from './supabase';
import { getUserId } from './auth';
import {
  db,
  getAllEntries,
  getDirtySyncMeta,
  markSynced,
  hardDeleteEntry,
  addConflict,
  getSyncMeta,
  kvGet,
  kvSet
} from './db';
import {
  getDirtyCategories,
  markCategorySynced,
  getCategoryRow,
  saveCategoryRow,
  saveCategoryRowFromCloud
} from './categories';
import {
  getDirtyPlans,
  getPlan,
  getPlanTombstones,
  markPlanSynced,
  markPlanTombstoneSynced,
  savePlan,
  savePlanFromCloud,
  removePlanLocally
} from './plans';
import {
  entryToRow,
  rowToEntry,
  sameDayContent,
  categoryToRow,
  rowToCategory,
  sameCategoryContent,
  planToRow,
  rowToPlan,
  samePlanContent,
  type DayEntryRow,
  type CategoryRow,
  type WeekPlanRow
} from './supabaseTypes';
import { migrateLegacyActivityKeys } from './migrations';
import type { Category, DayEntry, WeekPlan } from './types';

/**
 * Synkronisering mellom lokal IndexedDB og Supabase.
 *
 * Modell: lokal-first. Appen skriver alltid lokalt først (fungerer offline).
 * Synk kjører i bakgrunnen: push (dirty → sky), pull (sky → lokal),
 * og realtime-abonnement for endringer fra andre enheter.
 *
 * Konfliktregel: sist-skrevet-vinner (updated_at). Taperen arkiveres
 * i conflicts-tabellen og kan inspiseres/gjenopprettes manuelt.
 *
 * Kategorier synkroniseres på samme måte (egen tabell), med samme regel.
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

/** Øvre grense for én synk-runde — hindrer at appen henger i «Synkroniserer…». */
const SYNC_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} tidsavbrutt etter ${ms / 1000} s`)), ms)
    )
  ]);
}

class SyncManager {
  private state: SyncState = { status: 'idle', lastSyncAt: null, lastError: null, pendingPush: 0 };
  private listeners = new Set<Listener>();
  private syncing = false;
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
  private onlineHandler = () => void this.sync();

  async init(): Promise<void> {
    this.state.lastSyncAt = await kvGet<string | null>(LAST_SYNC_KEY, null);
    this.state.pendingPush = await this.countPending();
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

  private async countPending(): Promise<number> {
    const days = (await getDirtySyncMeta()).length;
    const cats = (await getDirtyCategories()).length;
    const plans = (await getDirtyPlans()).length + (await getPlanTombstones()).length;
    return days + cats + plans;
  }

  /** Kjører én-gangs migrering av gamle aktivitetsnøkler (sonelag → akademi). */
  async runMigrations(): Promise<void> {
    const changed = await migrateLegacyActivityKeys(getAllEntries, async (entry) => {
      await db.days.put({ ...entry, id: entry.date });
      await db.syncMeta.put({ date: entry.date, syncedAt: '', dirty: true, deleted: false });
    });
    if (changed > 0) {
      this.setState({ pendingPush: await this.countPending() });
    }
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
      // Watchdog: synken skal aldri kunne henge appen i «Synkroniserer…»-modus
      await withTimeout(
        (async () => {
          await this.push(userId);
          await this.pull(userId);
          // Kategorisynk er «best effort» — skal aldri ta ned dag-synken
          try {
            await this.pushCategories(userId);
            await this.pullCategories(userId);
          } catch (e) {
            console.warn('[belast] Kategorisynk feilet (ikke kritisk):', e);
          }
          // Plansynk er «best effort» på samme måte
          try {
            await this.pushPlans(userId);
            await this.pullPlans(userId);
          } catch (e) {
            console.warn('[belast] Plansynk feilet (ikke kritisk):', e);
          }
        })(),
        SYNC_TIMEOUT_MS,
        'Synkronisering'
      );
      await kvSet(LAST_SYNC_KEY, new Date().toISOString());
      this.setState({
        status: 'idle',
        lastSyncAt: new Date().toISOString(),
        pendingPush: await this.countPending()
      });
    } catch (e) {
      this.setState({
        status: 'error',
        lastError: e instanceof Error ? e.message : 'Ukjent synkfeil',
        pendingPush: await this.countPending()
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
          sleep_score: null,
          nutrition_score: null,
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

  /** Push dirty kategorier til skyen. */
  private async pushCategories(userId: string): Promise<void> {
    const dirty = await getDirtyCategories();
    for (const cat of dirty) {
      const row = categoryToRow(cat, userId);
      const { error } = await supabase
        .from('categories')
        .upsert(row, { onConflict: 'user_id,kind,key' });
      if (error) throw new Error(`Push kategori feilet (${cat.kind}/${cat.key}): ${error.message}`);
      await markCategorySynced(cat.kind, cat.key);
    }
  }

  /** Pull kategorier fra skyen (sist-skrevet-vinner per (kind,key)). */
  private async pullCategories(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(`Pull kategorier feilet: ${error.message}`);
    if (!data) return;

    for (const raw of data as CategoryRow[]) {
      const cloudCat = rowToCategory(raw);
      const local = await getCategoryRow(raw.kind, raw.key);
      if (!local) {
        await saveCategoryRowFromCloud(cloudCat);
        continue;
      }
      if (local.dirty && new Date(local.updatedAt) > new Date(raw.updated_at)) {
        continue; // lokal endring vinner, pushes neste runde
      }
      if (new Date(raw.updated_at) >= new Date(local.updatedAt) && !sameCategoryContent(local, cloudCat)) {
        await saveCategoryRowFromCloud(cloudCat);
      }
    }
  }

  /** Push dirty planer + tombstones (sletting) til skyen. */
  private async pushPlans(userId: string): Promise<void> {
    for (const tomb of await getPlanTombstones()) {
      const { error } = await supabase.from('week_plans').upsert(
        {
          id: tomb.id,
          user_id: userId,
          name: '',
          favorite: false,
          days: [],
          updated_at: new Date().toISOString(),
          deleted: true
        },
        { onConflict: 'id' }
      );
      if (error) throw new Error(`Push sletting av plan feilet (${tomb.id}): ${error.message}`);
      await markPlanTombstoneSynced(tomb.id);
    }
    for (const plan of await getDirtyPlans()) {
      const { error } = await supabase
        .from('week_plans')
        .upsert(planToRow(plan, userId), { onConflict: 'id' });
      if (error) throw new Error(`Push plan feilet (${plan.id}): ${error.message}`);
      await markPlanSynced(plan.id);
    }
  }

  /** Pull planer fra skyen (sist-skrevet-vinner per id). */
  private async pullPlans(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('week_plans')
      .select('*')
      .eq('user_id', userId);
    if (error) throw new Error(`Pull planer feilet: ${error.message}`);
    if (!data) return;

    const tombstoneIds = new Set((await getPlanTombstones()).map((t) => t.id));

    for (const raw of data as WeekPlanRow[]) {
      const local = await getPlan(raw.id);

      if (raw.deleted) {
        // Sletting i skyen → slett lokalt uten tombstone (med mindre lokal er dirty og nyere)
        if (local && local.dirty && new Date(local.updatedAt) > new Date(raw.updated_at)) {
          continue; // lokal endring vinner, vil pushes tilbake
        }
        if (local) await removePlanLocally(raw.id);
        continue;
      }

      const cloudPlan = rowToPlan(raw);
      if (!local) {
        await savePlanFromCloud(cloudPlan);
        continue;
      }
      if (tombstoneIds.has(raw.id)) continue; // lokal sletting venter på push
      if (local.dirty && new Date(local.updatedAt) > new Date(raw.updated_at)) {
        continue; // lokal endring vinner, pushes neste runde
      }
      if (new Date(raw.updated_at) >= new Date(local.updatedAt) && !samePlanContent(local, cloudPlan)) {
        await savePlanFromCloud(cloudPlan);
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
    await this.pullCategories(userId);
    await this.pullPlans(userId);
    this.setState({ pendingPush: await this.countPending() });
    return { imported, skipped };
  }

  /** Slett ALLE data i skyen for innlogget bruker (GDPR). */
  async deleteAllCloudData(): Promise<void> {
    const { error } = await supabase.rpc('delete_all_my_data');
    if (error) throw new Error(`Sletting i sky feilet: ${error.message}`);
  }

  /** Eksporter alle rader fra skyen (for backup/deling). */
  async exportCloudData(): Promise<{ entries: DayEntry[]; categories: Category[]; plans: WeekPlan[] }> {
    const userId = await getUserId();
    if (!userId) throw new Error('Ikke logget inn');
    const { data, error } = await supabase
      .from('day_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted', false)
      .order('date', { ascending: true });
    if (error) throw new Error(`Eksport feilet: ${error.message}`);
    const { data: catData, error: catError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId);
    if (catError) throw new Error(`Eksport kategorier feilet: ${catError.message}`);
    const { data: planData, error: planError } = await supabase
      .from('week_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted', false);
    if (planError) throw new Error(`Eksport planer feilet: ${planError.message}`);
    return {
      entries: ((data ?? []) as DayEntryRow[]).map((r) => rowToEntry({ ...r, pains: r.pains ?? [] })),
      categories: ((catData ?? []) as CategoryRow[]).map(rowToCategory),
      plans: ((planData ?? []) as WeekPlanRow[]).map(rowToPlan)
    };
  }

  /** Realtime: når en annen enhet endrer data, hent ned umiddelbart. */
  private subscribeRealtime(): void {
    this.realtimeChannel = supabase
      .channel('belast-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'day_entries' },
        () => {
          void this.sync();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => {
          void this.sync();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'week_plans' },
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
