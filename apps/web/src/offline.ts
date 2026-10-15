import { openDB, type IDBPDatabase } from 'idb';
import type { Opportunity } from './types';

/**
 * Offline cache.
 *
 * The offline contract (V1_PRODUCT_SPEC.md) is explicit: cache user-visible
 * opportunity data, evidence summaries, saved state and guides — never provider
 * secrets, private keys or privileged credentials.
 *
 * Only these two stores exist, and both hold display data only:
 *   - `opportunities`: the UI view model, keyed by opportunity id.
 *   - `evidence`: the bounded evidence summary shown on the detail screen.
 */

const DB_NAME = 'ntk-income-hunter';
const DB_VERSION = 2;
const OPPORTUNITIES = 'opportunities';
const EVIDENCE = 'evidence';

let handle: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  handle ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (!database.objectStoreNames.contains(OPPORTUNITIES)) {
        database.createObjectStore(OPPORTUNITIES, { keyPath: 'id' });
      }
      // v2 adds the evidence summary store.
      if (oldVersion < 2 && !database.objectStoreNames.contains(EVIDENCE)) {
        database.createObjectStore(EVIDENCE, { keyPath: 'id' });
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
  if (!items.length) return;
  const database = await db();
  const tx = database.transaction(OPPORTUNITIES, 'readwrite');
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
  const database = await db();
  await database.put(EVIDENCE, summary);
}

export async function getCachedEvidenceSummary(id: string): Promise<CachedEvidenceSummary | undefined> {
  const database = await db();
  return (await database.get(EVIDENCE, id)) as CachedEvidenceSummary | undefined;
}

/** Remove every cached record. Used by settings/logout and by tests. */
export async function clearOfflineCache(): Promise<void> {
  const database = await db();
  const tx = database.transaction([OPPORTUNITIES, EVIDENCE], 'readwrite');
  await Promise.all([tx.objectStore(OPPORTUNITIES).clear(), tx.objectStore(EVIDENCE).clear()]);
  await tx.done;
}
