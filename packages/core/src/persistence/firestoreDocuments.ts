import type {
  EvidenceAssertion,
  OpportunityCandidate,
  PublishedOpportunity,
  SourceDefinition,
  SourceRunRecord
} from '../types.js';

/**
 * Firestore document mapping.
 *
 * Why this lives in core: the documents the Hunter API writes must be exactly
 * the documents the web client reads and the rules allow. Keeping the mapping
 * here — deterministic, dependency-free and unit-tested — means the writer,
 * the reader and `firestore.rules` cannot drift apart without a test failing.
 *
 * Nothing here talks to Firebase. The Admin SDK belongs to the server; this is
 * only the shape contract.
 */

export const COLLECTIONS = {
  opportunities: 'opportunities',
  opportunityEvidence: 'opportunityEvidence',
  /**
   * Run audit documents.
   *
   * This is a TOP-LEVEL collection on purpose. Firestore alternates
   * collection/document, so `internal/sourceRuns/{id}` is not an addressable
   * document path — the `{id}` segment would be read as a collection. The
   * explicit deny for this collection lives in firestore.rules.
   */
  internalSourceRuns: 'internalSourceRuns'
} as const;

/**
 * Firestore's own limits, used by the validator below.
 *  - field names may not contain these characters;
 *  - a document may not exceed 1 MiB;
 *  - nesting is capped at 20 levels.
 */
const FORBIDDEN_FIELD_CHARS = /[.*~\/[\]]/;
const MAX_DOCUMENT_BYTES = 1_048_576;
export const FIRESTORE_SAFE_DOCUMENT_BYTES = 900_000;
const MAX_NESTING = 20;

/** Bounded excerpt for the stored evidence document. */
const EVIDENCE_EXCERPT_LIMIT = 1200;
/** Cap on stored assertions; the count is kept separately. */
const MAX_STORED_ASSERTIONS = 120;

export interface FirestoreEvidenceAssertion {
  field: string;
  value: string | number | boolean | null;
  method: EvidenceAssertion['method'];
  snapshotIndex: number | null;
  confidence: number;
  text?: string;
}

export interface FirestoreEvidenceDoc {
  id: string;
  opportunityId: string;
  sourceId: string;
  sourceItemId: string;
  sourceUrl: string;
  attribution: string;
  requiresLinkBack: boolean;
  fetchedAt: string;
  httpStatus: number;
  bytes: number;
  contentHash: string;
  evidenceHash: string;
  excerpt: string;
  assertions: FirestoreEvidenceAssertion[];
  totalAssertions: number;
  unknownFieldCount: number;
  dedupeVerdict: string;
  dedupeReason: string;
  /** The cost claim this record was published under, for audit. */
  capitalStatus: string;
  /** Amount the applicant would have to pay, null when unconfirmed. */
  upfrontCostUsd: number | null;
  riskLevel: string;
  riskFindings: { code: string; level: string; penalty: number; message: string; evidence: string }[];
  scoreComponents: { key: string; raw: number; weight: number; weighted: number; note: string }[];
  pipelineTrace: string[];
  generatedAt: string;
}

export interface FirestoreRunDoc {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  httpStatus: number;
  bytes: number;
  itemsSeen: number;
  accepted: number;
  rejected: number;
  skippedForInterval: boolean;
  error: string | null;
}

/** Deterministic document id for a run: one document per source per run. */
export function runDocId(sourceId: string, startedAt: string): string {
  return `${sourceId}_${startedAt.replace(/[:.]/g, '-')}`;
}

export function toFirestoreOpportunityDoc(record: PublishedOpportunity): PublishedOpportunity {
  // The published record is already Firestore-shaped by design (see types.ts),
  // so this is an explicit, reviewable pass-through rather than a transform.
  return { ...record };
}

export function toFirestoreEvidenceDoc(
  candidate: OpportunityCandidate,
  record: PublishedOpportunity,
  source: SourceDefinition,
  generatedAt: string
): FirestoreEvidenceDoc {
  const snapshot = candidate.evidence.snapshots[0];
  const assertions = candidate.evidence.assertions;

  return {
    id: record.id,
    opportunityId: record.id,
    sourceId: candidate.sourceId,
    sourceItemId: candidate.sourceItemId,
    sourceUrl: candidate.sourceUrl,
    attribution: source.attribution,
    requiresLinkBack: source.requiresLinkBack,
    fetchedAt: snapshot?.fetchedAt ?? candidate.discoveredAt,
    httpStatus: snapshot?.httpStatus ?? 0,
    bytes: snapshot?.bytes ?? 0,
    contentHash: snapshot?.contentHash ?? '',
    evidenceHash: record.evidenceHash,
    excerpt: (snapshot?.excerpt ?? '').slice(0, EVIDENCE_EXCERPT_LIMIT),
    assertions: assertions.slice(0, MAX_STORED_ASSERTIONS).map(a => ({
      field: a.field,
      value: a.value,
      method: a.method,
      snapshotIndex: a.snapshotIndex,
      confidence: a.confidence,
      ...(a.text ? { text: a.text } : {})
    })),
    totalAssertions: assertions.length,
    unknownFieldCount: assertions.filter(a => a.method === 'absent').length,
    dedupeVerdict: candidate.dedupe?.verdict ?? 'unique',
    dedupeReason: candidate.dedupe?.reason ?? '',
    capitalStatus: candidate.zeroCapital?.status ?? 'unconfirmed_no_cost_found',
    upfrontCostUsd: candidate.zeroCapital?.upfrontCostUsd ?? null,
    riskLevel: candidate.risk?.level ?? 'high',
    riskFindings: (candidate.risk?.findings ?? []).map(f => ({
      code: f.code,
      level: f.level,
      penalty: f.penalty,
      message: f.message,
      evidence: f.evidence
    })),
    scoreComponents: (candidate.scores?.components ?? []).map(c => ({
      key: c.key,
      raw: c.raw,
      weight: c.weight,
      weighted: c.weighted,
      note: c.note
    })),
    pipelineTrace: candidate.trace.slice(-40),
    generatedAt
  };
}

export function toFirestoreRunDoc(run: SourceRunRecord): FirestoreRunDoc {
  return {
    id: runDocId(run.sourceId, run.startedAt),
    sourceId: run.sourceId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    ok: run.ok,
    httpStatus: run.httpStatus,
    bytes: run.bytes,
    itemsSeen: run.itemsSeen,
    accepted: run.accepted,
    rejected: run.rejected,
    skippedForInterval: run.skippedForInterval,
    error: run.error
  };
}

export interface DocumentValidationResult {
  ok: boolean
  problems: string[];
  bytes: number;
}

/**
 * Reject documents Firestore will refuse, before a write is attempted.
 *
 * Catches the three failure modes that actually bite:
 *  - a field name with `. * ~ / [ ]` in it,
 *  - an `undefined` value (Firestore rejects it; JSON.stringify hides it),
 *  - a document larger than the 1 MiB limit.
 */
export function validateFirestoreDocument(doc: unknown): DocumentValidationResult {
  const problems: string[] = [];

  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > MAX_NESTING) {
      problems.push(`${path}: exceeds the ${MAX_NESTING}-level nesting limit`);
      return;
    }
    if (value === undefined) {
      problems.push(`${path}: undefined value (Firestore rejects undefined)`);
      return;
    }
    if (value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (key.length === 0) problems.push(`${path}: empty field name`);
        else if (FORBIDDEN_FIELD_CHARS.test(key)) {
          problems.push(`${path}.${key}: field name contains a reserved character`);
        }
        walk(nested, `${path}.${key}`, depth + 1);
      }
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      problems.push(`${path}: non-finite number`);
    }
  };

  walk(doc, '$', 0);

  let bytes = 0;
  try {
    bytes = JSON.stringify(doc).length;
  } catch (error) {
    problems.push(`$: not JSON-serialisable (${String(error)})`);
  }
  if (bytes > MAX_DOCUMENT_BYTES) {
    problems.push(`$: ${bytes} bytes exceeds the ${MAX_DOCUMENT_BYTES}-byte document limit`);
  }

  return { ok: problems.length === 0, problems, bytes };
}
