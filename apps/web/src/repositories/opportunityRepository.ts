import type { FirestoreEvidenceDoc, PublishedOpportunity } from '@ntk/hunter-core';
import type { Opportunity } from '../types';

/**
 * Read paths for published opportunities.
 *
 * The gateway is an interface so the repository logic can be tested without
 * Firebase, and so a future server-side API can be swapped in with no UI change.
 */

export interface OpportunityGateway {
  /** Published, zero-capital opportunities, best rank first. */
  listPublished(max: number): Promise<PublishedOpportunity[]>;
  /** Evidence document for one opportunity, or null when none is stored. */
  getEvidence(opportunityId: string): Promise<FirestoreEvidenceDoc | null>;
}

export interface OpportunityCache {
  read(): Promise<Opportunity[]>;
  write(items: Opportunity[]): Promise<void>;
}

/**
 * The exact query the Firestore gateway issues.
 *
 * Exported so a test can assert it still matches `firestore.indexes.json`:
 * a composite index on (visibility ASC, zeroCapital ASC, rankScore DESC) is
 * required for this shape, and a mismatch fails only at runtime in production.
 *
 * Results are additionally capped by `limit(max)` at the call site.
 */
export const PUBLISHED_QUERY = {
  collection: 'opportunities',
  // Every filter is on a field the writer always sets, so no document is
  // silently excluded because of a missing field.
  filters: [
    { field: 'visibility', op: '==', value: 'published' },
    { field: 'zeroCapital', op: '==', value: true }
  ],
  orderBy: { field: 'rankScore', direction: 'desc' }
} as const;

export interface ListResult {
  items: Opportunity[];
  /** Where the data came from, so the UI can be honest about freshness. */
  source: 'live' | 'cache' | 'empty';
  /** Populated when the live read failed and the cache was used instead. */
  error: string | null;
}

export interface RepositoryPorts {
  gateway: OpportunityGateway | null;
  cache: OpportunityCache;
  map: (record: PublishedOpportunity, evidence: FirestoreEvidenceDoc | null) => Opportunity;
  now: () => Date;
  isOnline: () => boolean;
}

/**
 * Offline-first repository.
 *
 * Behaviour, in order:
 *  1. No gateway or offline  -> serve the cache.
 *  2. Live read succeeds     -> refresh the cache and serve the live data.
 *  3. Live read fails        -> serve the cache and report the error.
 *
 * It never returns demo or partial data dressed up as live results.
 */
export class HybridOpportunityRepository {
  constructor(private readonly ports: RepositoryPorts) {}

  async listBest(max = 50): Promise<ListResult> {
    const { gateway, cache, map, isOnline } = this.ports;

    if (!gateway || !isOnline()) {
      const cached = await this.safeCacheRead();
      return { items: cached, source: cached.length ? 'cache' : 'empty', error: null };
    }

    try {
      const records = await gateway.listPublished(max);
      if (records.length === 0) {
        // An empty live result is a real answer; do not paper over it with cache.
        return { items: [], source: 'live', error: null };
      }

      const items: Opportunity[] = [];
      for (const record of records) {
        const evidence = await this.safeEvidence(gateway, record.id);
        items.push(map(record, evidence));
      }

      await this.safeCacheWrite(items);
      return { items, source: 'live', error: null };
    } catch (error) {
      const cached = await this.safeCacheRead();
      return {
        items: cached,
        source: cached.length ? 'cache' : 'empty',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async safeCacheRead(): Promise<Opportunity[]> {
    try {
      return await this.ports.cache.read();
    } catch {
      return [];
    }
  }

  private async safeCacheWrite(items: Opportunity[]): Promise<void> {
    try {
      await this.ports.cache.write(items);
    } catch {
      // A cache write failure must never break a successful live read.
    }
  }

  private async safeEvidence(gateway: OpportunityGateway, id: string): Promise<FirestoreEvidenceDoc | null> {
    try {
      return await gateway.getEvidence(id);
    } catch {
      return null;
    }
  }
}
