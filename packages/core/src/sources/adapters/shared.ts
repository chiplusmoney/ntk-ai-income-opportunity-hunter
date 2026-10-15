import { absentAssertion, assertion, createSnapshot, excerpt } from '../../evidence/index.js';
import type {
  EvidenceAssertion,
  EvidenceSnapshot,
  NormalizedReward,
  OpportunityCandidate,
  OpportunityCategory,
  SourceDefinition,
  SourceFetchResult,
  Tri
} from '../../types.js';

/** Re-exported for adapter authors; the contract itself lives in `types.ts`. */
export type { SourceFetchResult } from '../../types.js';

/**
 * Shared adapter plumbing.
 *
 * Every adapter must be:
 *  - injectable (no global fetch) so it can be tested against a recorded fixture;
 *  - conservative (a field the source did not publish is left `unknown`, never guessed);
 *  - traceable (each established field carries the verbatim text it came from).
 */

export interface AdapterContext {
  fetchImpl: typeof fetch;
  /** Injected clock so runs are reproducible in tests. */
  now: () => Date;
  userAgent?: string;
  timeoutMs?: number;
}

export interface SourceAdapter {
  sourceId: string;
  /** Human-readable description of what the adapter reads. */
  description: string;
  /** Query the feed and normalize it. Never throws: failures land in `error`. */
  run(ctx: AdapterContext): Promise<SourceFetchResult>;
}

export function emptyReward(): NormalizedReward {
  return { min: null, max: null, currency: null, basis: 'unknown', raw: null };
}

export function emptyResult(sourceId: string, fetchedAt: string, error: string | null): SourceFetchResult {
  return {
    sourceId,
    ok: false,
    httpStatus: 0,
    error,
    bytes: 0,
    candidates: [],
    itemsSeen: 0,
    skipped: [],
    fetchedAt
  };
}

/** A field the source actually established. */
export interface EstablishedField {
  field: string;
  value: string | number | boolean;
  snapshotIndex: number;
  method: EvidenceAssertion['method'];
  confidence: number;
  text?: string;
}

export interface CandidateSpec {
  source: SourceDefinition;
  sourceItemId: string;
  title: string;
  provider: string | null;
  category: OpportunityCategory;
  /** Plain text, already stripped of HTML by the adapter. */
  description: string;
  sourceUrl: string;
  discoveredAt: string;
  publishedAt: string | null;
  reward: NormalizedReward;
  remote: Tri;
  directPay: Tri;
  noCvRequired: Tri;
  countries: string[];
  eligibilityText: string | null;
  skills: string[];
  requirements: string[];
  paymentMethods: string[];
  deadline: string | null;
  competition: boolean;
  snapshots: EvidenceSnapshot[];
  established: EstablishedField[];
  /** Fields the adapter looked for but the source did not publish. */
  unknownFields: string[];
}

/**
 * Assemble a candidate with evidence attached.
 *
 * `unknownFields` are emitted as `absent` assertions so downstream stages can
 * count what is missing instead of treating silence as a negative answer.
 */
export function makeCandidate(spec: CandidateSpec): OpportunityCandidate {
  const assertions: EvidenceAssertion[] = [
    ...spec.established.map(f =>
      assertion(f.field, f.value, f.snapshotIndex, f.method, f.confidence, f.text)
    ),
    ...spec.unknownFields.map(f => absentAssertion(f))
  ];

  return {
    id: `${spec.source.id}:${spec.sourceItemId}`,
    sourceId: spec.source.id,
    sourceItemId: spec.sourceItemId,
    title: spec.title,
    provider: spec.provider ?? '',
    category: spec.category,
    description: spec.description,
    sourceUrl: spec.sourceUrl,
    discoveredAt: spec.discoveredAt,
    publishedAt: spec.publishedAt,
    reward: spec.reward,
    remote: spec.remote,
    directPay: spec.directPay,
    noCvRequired: spec.noCvRequired,
    // Filled by the zero-capital stage; never asserted by the adapter.
    noCapitalRequired: 'unknown',
    countries: spec.countries,
    eligibilityText: spec.eligibilityText,
    skills: spec.skills,
    requirements: spec.requirements,
    paymentMethods: spec.paymentMethods,
    deadline: spec.deadline,
    competition: spec.competition,
    evidence: { snapshots: spec.snapshots, assertions },
    zeroCapital: null,
    eligibility: null,
    risk: null,
    scores: null,
    dedupe: null,
    visibility: 'draft',
    trace: [`adapter:${spec.source.id}`, `item:${spec.sourceItemId}`]
  };
}

/**
 * Build the single snapshot a JSON/RSS adapter needs for one HTTP response.
 *
 * The excerpt is a bounded head of the payload (proving what we fetched); the
 * verbatim text a value was read from travels on the assertion itself, so no
 * claim depends on an unpinned excerpt.
 */
export async function snapshotOf(params: {
  source: SourceDefinition;
  sourceUrl: string;
  fetchedAt: string;
  payload: string;
  httpStatus: number;
}): Promise<EvidenceSnapshot> {
  return createSnapshot({
    sourceId: params.source.id,
    sourceUrl: params.sourceUrl,
    fetchedAt: params.fetchedAt,
    payload: params.payload,
    httpStatus: params.httpStatus,
    excerptSource: excerpt(params.payload, 400)
  });
}

/** True when a value is usable as an established fact. */
export function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Bounded, single-line text for assertion evidence. */
export function flat(value: string, max = 200): string {
  return excerpt(value.replace(/\s+/g, ' '), max);
}

/** Parse a date string, returning an ISO string only when it is unambiguous. */
export function toIso(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Unix seconds from the feeds; milliseconds are implausible here.
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const trimmed = value.trim();
  // Some feeds emit the epoch as a numeric string rather than a number.
  if (/^\d{9,13}$/.test(trimmed)) {
    const numeric = Number.parseInt(trimmed, 10);
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Trim a list of strings, drop blanks and duplicates, preserve order. */
export function cleanList(values: (string | null | undefined)[], max = 25): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!present(value)) continue;
    const trimmed = value.trim();
    if (!out.includes(trimmed)) out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}
