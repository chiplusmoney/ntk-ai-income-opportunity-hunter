import { COLLECTIONS, validateFirestoreDocument, type DocumentValidationResult } from '@ntk/hunter-core';

/**
 * Document store port.
 *
 * The writer never talks to Firestore directly: it stages documents into a
 * store and commits them. That keeps the write logic identical between the
 * emulator, a unit test's in-memory store and production, and it makes the
 * "validate before writing" rule impossible to skip.
 */

export interface StagedDocument {
  collection: string;
  id: string;
  /** Path-safe document id (no slashes that would create sub-collections). */
  data: Record<string, unknown>;
}

export interface CommitResult {
  written: number;
  /** Documents the store refused, with a reason. Never silently dropped. */
  failed: { collection: string; id: string; error: string }[];
  /** Number of store round trips used. */
  batches: number;
}

export interface DocumentStore {
  /**
   * Validate and stage one document.
   * Returns the validation outcome so the caller can count and report it.
   */
  stage(document: StagedDocument): DocumentValidationResult;
  /** How many documents are staged and not yet committed. */
  stagedCount(): number;
  /** Write everything staged so far, then clear the staging area. */
  commit(): Promise<CommitResult>;
}

/** Firestore rejects a document id containing a slash; check before staging. */
export function isPathSafeId(id: string): boolean {
  return id.length > 0 && id.length <= 1500 && !id.includes('/') && !id.includes('..');
}

/** Firestore batch limit is 500 writes; leave headroom for retries. */
export const MAX_WRITES_PER_BATCH = 400;

/**
 * Split staged documents into commit-sized chunks, preserving order.
 * Runs are committed in chunks so one bad chunk cannot roll back work that was
 * already accepted — the caller reports per-chunk outcomes instead.
 */
export function chunkDocuments<T>(documents: T[], size = MAX_WRITES_PER_BATCH): T[][] {
  if (size <= 0) return [documents];
  const chunks: T[][] = [];
  for (let index = 0; index < documents.length; index += size) {
    chunks.push(documents.slice(index, index + size));
  }
  return chunks;
}
