import { getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { ApiConfig } from '../config.js';
import type { Logger } from '../logging.js';
import {
  chunkDocuments,
  type CommitResult,
  type DocumentStore,
  type StagedDocument
} from './documentStore.js';
import { validateFirestoreDocument, type DocumentValidationResult } from '@ntk/hunter-core';

/**
 * The in-memory document store.
 *
 * Used by unit tests, and by the API when Firestore is not configured: instead
 * of pretending a write succeeded, `dryRun` mode records the documents so the
 * caller can report "validated but not persisted". That distinction is the
 * whole point — a review must never read "written" when nothing was written.
 */
export class MemoryDocumentStore implements DocumentStore {
  /**
   * Keyed by `collection/id`, mirroring Firestore's set semantics: writing the
   * same id again replaces the document instead of appending a second one. A
   * test that counts documents therefore measures documents, not write calls.
   */
  private readonly documents = new Map<string, StagedDocument>();
  private pending: StagedDocument[] = [];

  constructor(
    private readonly options: { dryRun?: boolean; failOn?: (document: StagedDocument) => string | null } = {}
  ) {}

  /** Every stored document, in insertion order. */
  get stored(): StagedDocument[] {
    return [...this.documents.values()];
  }

  stage(document: StagedDocument): DocumentValidationResult {
    const validation = validateFirestoreDocument(document.data);
    if (!validation.ok) return validation;
    this.pending.push(document);
    return validation;
  }

  stagedCount(): number {
    return this.pending.length;
  }

  async commit(): Promise<CommitResult> {
    const chunks = chunkDocuments(this.pending, 400);
    const result: CommitResult = { written: 0, failed: [], batches: chunks.length };

    for (const chunk of chunks) {
      for (const document of chunk) {
        const failure = this.options.failOn?.(document) ?? null;
        if (failure) {
          result.failed.push({ collection: document.collection, id: document.id, error: failure });
          continue;
        }
        result.written += 1;
        if (!this.options.dryRun) this.documents.set(`${document.collection}/${document.id}`, document);
      }
    }

    this.pending = [];
    return result;
  }

  documentsIn(collection: string): StagedDocument[] {
    return this.stored.filter(document => document.collection === collection);
  }
}

/**
 * Firestore-backed store using the Admin SDK.
 *
 * Configuration, in order:
 *  - `FIRESTORE_EMULATOR_HOST` set (and optionally `FIREBASE_PROJECT_ID`):
 *    the Admin SDK talks to the emulator, which needs no credentials.
 *  - otherwise Application Default Credentials are used. On Render that is a
 *    service-account JSON supplied through the environment; no key is ever read
 *    from the repository.
 */
export class FirestoreDocumentStore implements DocumentStore {
  private pending: StagedDocument[] = [];

  private constructor(private readonly db: Firestore) {}

  /** The Firestore handle, so the run-state store can share one app instance. */
  get database(): Firestore {
    return this.db;
  }

  static create(config: ApiConfig, logger: Logger): FirestoreDocumentStore {
    // The emulator needs a project id but no credentials; a real deployment
    // supplies GCLOUD_PROJECT/FIREBASE_PROJECT_ID plus Application Default
    // Credentials from the platform environment.
    const projectId = config.projectId || (config.usingEmulator ? 'demo-ntk-hunter' : undefined);

    const app: App = getApps().length
      ? (getApps()[0] as App)
      : initializeApp({
          ...(projectId ? { projectId } : {}),
          ...(config.usingEmulator ? {} : { credential: applicationDefault() })
        });

    const db = getFirestore(app);
    logger.info('Firestore store initialised', {
      mode: config.usingEmulator ? 'emulator' : 'live',
      projectId: projectId ?? '(from environment)'
    });

    return new FirestoreDocumentStore(db);
  }

  stage(document: StagedDocument): DocumentValidationResult {
    const validation = validateFirestoreDocument(document.data);
    if (!validation.ok) return validation;
    this.pending.push(document);
    return validation;
  }

  stagedCount(): number {
    return this.pending.length;
  }

  async commit(): Promise<CommitResult> {
    const chunks = chunkDocuments(this.pending, 400);
    const result: CommitResult = { written: 0, failed: [], batches: chunks.length };

    for (const chunk of chunks) {
      const batch = this.db.batch();
      for (const document of chunk) {
        // `set` with a deterministic id is the idempotent primitive: a repeat
        // crawl overwrites the same document instead of appending a new one.
        batch.set(this.db.collection(document.collection).doc(document.id), document.data, { merge: false });
      }

      try {
        await batch.commit();
        result.written += chunk.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Report every document in the failed chunk, then continue with the
        // remaining chunks so a single bad chunk cannot void the whole run.
        for (const document of chunk) {
          result.failed.push({ collection: document.collection, id: document.id, error: message });
        }
      }
    }

    this.pending = [];
    return result;
  }
}
