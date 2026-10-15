import {
  COLLECTIONS,
  toFirestoreEvidenceDoc,
  toFirestoreOpportunityDoc,
  toFirestoreRunDoc,
  type OpportunityCandidate,
  type PublishedOpportunity,
  type SourceDefinition,
  type SourceRunRecord
} from '@ntk/hunter-core';
import { isPathSafeId, type CommitResult, type DocumentStore, type StagedDocument } from './documentStore.js';

/**
 * Firestore server writer.
 *
 * Guarantees, each covered by a test:
 *
 *  1. **Validated before writing.** Every document goes through
 *     `validateFirestoreDocument` (inside `store.stage`); a document Firestore
 *     would reject — a reserved field-name character, an `undefined`, an
 *     oversized payload — is skipped and reported instead of failing the run.
 *  2. **Deterministic ids.** An opportunity is `"<sourceId>:<sourceItemId>"`, its
 *     evidence document shares that id, and a source run is
 *     `"<sourceId>_<startedAt>"`. A repeat crawl therefore UPDATES the same
 *     opportunity document rather than creating a second one.
 *  3. **Idempotent.** Writing the same run twice produces the same document set:
 *     nothing depends on a counter, on a random id, or on a clock read taken
 *     during the write (`updatedAt` is passed in).
 *  4. **Failures do not corrupt valid results.** The store commits in chunks and
 *     reports each failure; successful chunks stand and the caller learns
 *     exactly what was and was not written.
 *  5. **No secrets.** Only the validated persistence contract is written.
 */

export interface WriteReport {
  /** Documents that passed validation and were staged. */
  staged: number;
  /** Documents actually committed. */
  written: number;
  /** Per-collection counts of staged documents. */
  perCollection: Record<string, number>;
  /** Rejected before commit; the run keeps going. */
  skippedInvalid: { collection: string; id: string; problems: string[] }[];
  /** Rejected by the store during commit. */
  failed: { collection: string; id: string; error: string }[];
  /** Store round trips used. */
  batches: number;
  /** False when anything was skipped or failed. */
  ok: boolean;
}

export interface WriteRunParams {
  published: PublishedOpportunity[];
  candidatesById: Map<string, OpportunityCandidate>;
  sourcesById: Map<string, SourceDefinition>;
  sourceRuns: SourceRunRecord[];
  /** Supplied by the caller so a replayed run is byte-identical. */
  updatedAt: string;
}

export interface OpportunityWriter {
  writeRun(params: WriteRunParams): Promise<WriteReport>;
}

/**
 * Add the writer-owned bookkeeping field.
 *
 * `discoveredAt` remains the capture time taken from the adapter; `updatedAt`
 * records when this crawl refreshed the document, which is what makes a
 * re-crawl observable on the same document instead of a new one.
 */
export function withWriteMetadata(record: PublishedOpportunity, updatedAt: string): Record<string, unknown> {
  return { ...toFirestoreOpportunityDoc(record), updatedAt };
}

export class FirestoreOpportunityWriter implements OpportunityWriter {
  constructor(private readonly store: DocumentStore) {}

  async writeRun(params: WriteRunParams): Promise<WriteReport> {
    const report: WriteReport = {
      staged: 0,
      written: 0,
      perCollection: {},
      skippedInvalid: [],
      failed: [],
      batches: 0,
      ok: true
    };

    const stage = (document: StagedDocument): void => {
      if (!isPathSafeId(document.id)) {
        report.skippedInvalid.push({
          collection: document.collection,
          id: document.id,
          problems: ['document id is not path-safe']
        });
        report.ok = false;
        return;
      }

      const validation = this.store.stage(document);
      if (!validation.ok) {
        report.skippedInvalid.push({
          collection: document.collection,
          id: document.id,
          problems: validation.problems
        });
        report.ok = false;
        return;
      }

      report.staged += 1;
      report.perCollection[document.collection] = (report.perCollection[document.collection] ?? 0) + 1;
    };

    for (const record of params.published) {
      stage({
        collection: COLLECTIONS.opportunities,
        id: record.id,
        data: withWriteMetadata(record, params.updatedAt)
      });

      const candidate = params.candidatesById.get(record.id);
      const source = params.sourcesById.get(record.sourceId);

      if (candidate && source) {
        stage({
          collection: COLLECTIONS.opportunityEvidence,
          id: record.id,
          data: toFirestoreEvidenceDoc(candidate, record, source, params.updatedAt) as unknown as Record<
            string,
            unknown
          >
        });
      } else {
        // The opportunity itself is still valid and publishable; what is missing
        // is the evidence document, and that is reported rather than faked.
        report.skippedInvalid.push({
          collection: COLLECTIONS.opportunityEvidence,
          id: record.id,
          problems: [candidate ? 'source missing from registry' : 'candidate missing from the run']
        });
        report.ok = false;
      }
    }

    for (const run of params.sourceRuns) {
      const runDoc = toFirestoreRunDoc(run);
      stage({
        collection: COLLECTIONS.internalSourceRuns,
        id: runDoc.id,
        data: runDoc as unknown as Record<string, unknown>
      });
    }

    const commit: CommitResult = await this.store.commit();
    report.written = commit.written;
    report.failed = commit.failed;
    report.batches = commit.batches;
    if (commit.failed.length > 0) report.ok = false;

    return report;
  }
}

/** Count documents by collection; used by tests and the status endpoint. */
export function countByCollection(documents: StagedDocument[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const document of documents) {
    counts[document.collection] = (counts[document.collection] ?? 0) + 1;
  }
  return counts;
}
