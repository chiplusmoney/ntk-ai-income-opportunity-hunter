import { openDB, type IDBPDatabase } from 'idb';
import type { Opportunity } from './types';

/**
 * Offline cache.
 *
 * Persistent storage contains public opportunity display data only. Private
 * applications, earnings, profile and notifications use account-scoped memory.
 * Authenticated evidence is read on demand and is never stored in this shared
 * cache. No provider secret or privileged credential belongs here.
 */

const DB_NAME = 'ntk-income-hunter';
const DB_VERSION = 3;
const OPPORTUNITIES = 'opportunities';
const EVIDENCE = 'evidence';

let handle: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  handle ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (!database.objectStoreNames.contains(OPPORTUNITIES)) {
        database.createObjectStore(OPPORTUNITIES, { keyPath: 'id' });
      }
      // v3 removes evidence summaries from the shared persistent cache.
      // Authenticated evidence belongs only in the current account's memory.
      if (database.objectStoreNames.contains(EVIDENCE)) database.deleteObjectStore(EVIDENCE);
      if (oldVersion > 0 && oldVersion < 3) {
        database.deleteObjectStore(OPPORTUNITIES);
        database.createObjectStore(OPPORTUNITIES, { keyPath: 'id' });
      }
    }
  });
  return handle;
}

/** Reset the memoised handle; used by tests and after a storage eviction. */
export function resetOfflineCache(): void {
  handle = null;
}

export async function cacheOpportunities(items: Opportunity[]): Promise<void> {
  const database = await db();
  const tx = database.transaction(OPPORTUNITIES, 'readwrite');
  await tx.store.clear();
  await Promise.all(items.map(item => tx.store.put(item)));
  await tx.done;
}

export async function getCachedOpportunities(): Promise<Opportunity[]> {
  const database = await db();
  const items = (await database.getAll(OPPORTUNITIES)) as Opportunity[];
  // Records cached before the cost status existed must never be shown as
  // confirmed free: the honest reading of an older row is "unconfirmed".
  return items
    .map(item => ({
      ...item,
      capitalStatus: item.capitalStatus ?? ('unconfirmed_no_cost_found' as const)
    }))
    .sort((a, b) => b.rankScore - a.rankScore);
}

export interface CachedEvidenceSummary {
  id: string;
  lines: { label: string; value: string; state: 'established' | 'unknown' }[];
  cachedAt: string;
}

export async function cacheEvidenceSummary(summary: CachedEvidenceSummary): Promise<void> {
  // Kept as a compatibility API; authenticated evidence is never persisted.
  void summary;
}

export async function getCachedEvidenceSummary(id: string): Promise<CachedEvidenceSummary | undefined> {
  void id;
  return undefined;
}

/** Remove every cached record. Used by settings/logout and by tests. */
export async function clearOfflineCache(): Promise<void> {
  const database = await db();
  const tx = database.transaction(OPPORTUNITIES, 'readwrite');
  await tx.store.clear();
  await tx.done;
}
