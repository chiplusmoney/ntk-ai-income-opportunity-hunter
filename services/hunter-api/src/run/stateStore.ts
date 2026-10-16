import type { Firestore } from 'firebase-admin/firestore';
import { SOURCE_REGISTRY } from '@ntk/hunter-core';

/**
 * Source run state.
 *
 * The interval policy needs to know when each source was last crawled, and that
 * memory must survive a Render cold start — otherwise every cold start would
 * look like "never crawled" and hammer a feed that asked for four requests a
 * day. The audit documents written to `internal/sourceRuns` are already the
 * record, so the state is read back from them rather than duplicated into a
 * second store that could drift.
 */

export interface SourceRunStateStore {
  /** ISO timestamp of the most recent run per source id, or null when never run. */
  lastRunBySource(): Promise<Record<string, string | null>>;
}

export class MemoryRunStateStore implements SourceRunStateStore {
  constructor(private state: Record<string, string | null> = {}) {}

  /** Record a run so a later call in the same process sees it. */
  record(sourceId: string, startedAt: string): void {
    const current = this.state[sourceId];
    if (!current || Date.parse(startedAt) > Date.parse(current)) {
      this.state[sourceId] = startedAt;
    }
  }

  async lastRunBySource(): Promise<Record<string, string | null>> {
    return { ...this.state };
  }
}

/**
 * Durable source reservations are the M7 authority. A bounded historical window
 * bootstraps M6 sources once; after all enabled sources have reservations no
 * historical scan is needed. This also avoids a high-volume source aging a
 * low-frequency source's scheduling state out of the window.
 */
export class FirestoreRunStateStore implements SourceRunStateStore {
  constructor(
    private readonly db: Firestore,
    private readonly windowSize = 200
  ) {}

  static create(db: Firestore): FirestoreRunStateStore {
    return new FirestoreRunStateStore(db);
  }

  async lastRunBySource(): Promise<Record<string, string | null>> {
    const reservations=await this.db.getAll(...SOURCE_REGISTRY.map(s=>this.db.doc(`internal/sourceSchedule/sources/${s.id}`)));
    const reserved:Record<string,string|null>={};
    for(const d of reservations)if(typeof d.data()?.lastAttemptAt==='string')reserved[d.id]=d.data()!.lastAttemptAt;
    if(SOURCE_REGISTRY.filter(s=>s.enabled&&s.publicDeploymentAllowed).every(s=>reserved[s.id]))return reserved;
    const snapshot = await this.db
      .collection('internalSourceRuns')
      .orderBy('startedAt', 'desc')
      .limit(this.windowSize)
      .get();

    const latest: Record<string, string | null> = {...reserved};
    for (const document of snapshot.docs) {
      const data = document.data() as { sourceId?: string; startedAt?: string };
      const sourceId = typeof data.sourceId === 'string' ? data.sourceId : null;
      const startedAt = typeof data.startedAt === 'string' ? data.startedAt : null;
      if (!sourceId || !startedAt) continue;
      if (!latest[sourceId] || Date.parse(startedAt) > Date.parse(latest[sourceId] as string)) {
        latest[sourceId] = startedAt;
      }
    }
    return latest;
  }
}
