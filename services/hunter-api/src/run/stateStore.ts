import type { Firestore } from 'firebase-admin/firestore';

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
 * Read the most recent run documents back from Firestore.
 *
 * A bounded query (most recent N documents, ordered descending) is enough: the
 * only question asked is "when did this source last run", and the newest
 * document per source is always in the window as long as the window is larger
 * than the number of sources.
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
    const snapshot = await this.db
      .collection('internalSourceRuns')
      .orderBy('startedAt', 'desc')
      .limit(this.windowSize)
      .get();

    const latest: Record<string, string | null> = {};
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
