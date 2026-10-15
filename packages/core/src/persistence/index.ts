/**
 * Persistence contract.
 *
 * The mapping from verified pipeline output to the Firestore documents the
 * Hunter API writes and the client reads. No Firebase SDK is imported here.
 */
export {
  COLLECTIONS,
  toFirestoreOpportunityDoc,
  toFirestoreEvidenceDoc,
  toFirestoreRunDoc,
  runDocId,
  validateFirestoreDocument,
  FIRESTORE_SAFE_DOCUMENT_BYTES
} from './firestoreDocuments.js';
export type {
  FirestoreEvidenceDoc,
  FirestoreEvidenceAssertion,
  FirestoreRunDoc,
  DocumentValidationResult
} from './firestoreDocuments.js';
