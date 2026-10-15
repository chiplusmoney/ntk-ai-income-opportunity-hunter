import type { EvidenceAssertion, EvidenceSnapshot, OpportunityCandidate, PublishedOpportunity } from '../types.js';

/**
 * AI analysis safety.
 *
 * The deterministic hunter is the source of truth. This module does two things:
 *
 *  - `buildAnalysisInput` builds the ONLY thing a model may see: normalized
 *    opportunity data plus referenced, captured evidence. No raw HTML, no
 *    provider credentials, no unrelated records.
 *  - `applyAnalysis` validates a model response and refuses anything that would
 *    overwrite evidence. A rejected response changes nothing; the deterministic
 *    record stands and the rejection is recorded for audit.
 *
 * Fields the model may NEVER set: reward amounts, currency, deadline, country
 * eligibility, remote status, CV requirement, direct pay, and the whole capital
 * status. Those come from evidence or they stay unknown.
 */

/** Fields an AI response is forbidden from writing. */
export const EVIDENCE_OWNED_FIELDS = [
  'reward.min',
  'reward.max',
  'reward.currency',
  'reward.basis',
  'deadline',
  'countries',
  'eligibility',
  'remote',
  'directPay',
  'noCvRequired',
  'noCapitalRequired',
  'zeroCapital',
  'capitalStatus',
  'trustScore',
  'riskLevel',
  'blocked',
  'visibility'
] as const;

export interface AnalysisEvidenceRef {
  /** Which snapshot this reference points at. */
  snapshotIndex: number;
  contentHash: string;
  sourceUrl: string;
  fetchedAt: string;
  /** Bounded excerpt, already trimmed upstream. */
  excerpt: string;
}

export interface AnalysisInput {
  opportunity: {
    id: string;
    sourceId: string;
    title: string;
    provider: string;
    category: string;
    description: string;
    rewardRaw: string | null;
    rewardMin: number | null;
    rewardMax: number | null;
    currency: string | null;
    rewardBasis: string;
    countries: string[];
    remote: string;
    directPay: string;
    noCvRequired: string;
    capitalStatus: string;
    deadline: string | null;
    /** Fields the pipeline could not establish, named explicitly. */
    unknownFields: string[];
  };
  evidence: AnalysisEvidenceRef[];
  /** The verbatim claims, so a model can quote rather than invent. */
  assertions: { field: string; value: string | number | boolean | null; method: string; confidence: number }[];
}

export function buildAnalysisInput(
  candidate: OpportunityCandidate,
  record?: PublishedOpportunity
): AnalysisInput {
  const snapshots: EvidenceSnapshot[] = candidate.evidence.snapshots;
  const assertions: EvidenceAssertion[] = candidate.evidence.assertions;

  return {
    opportunity: {
      id: candidate.id,
      sourceId: candidate.sourceId,
      title: candidate.title,
      provider: candidate.provider,
      category: candidate.category,
      // Bounded: the model gets the normalized description, not the raw payload.
      description: candidate.description.slice(0, 4000),
      rewardRaw: candidate.reward.raw,
      rewardMin: candidate.reward.min,
      rewardMax: candidate.reward.max,
      currency: candidate.reward.currency,
      rewardBasis: candidate.reward.basis,
      countries: candidate.countries,
      remote: String(candidate.remote),
      directPay: String(candidate.directPay),
      noCvRequired: String(candidate.noCvRequired),
      capitalStatus: candidate.zeroCapital?.status ?? 'unconfirmed_no_cost_found',
      deadline: candidate.deadline,
      unknownFields: assertions.filter(a => a.method === 'absent').map(a => a.field)
    },
    evidence: snapshots.map((snapshot, index) => ({
      snapshotIndex: index,
      contentHash: snapshot.contentHash,
      sourceUrl: snapshot.sourceUrl,
      fetchedAt: snapshot.fetchedAt,
      excerpt: snapshot.excerpt.slice(0, 1200)
    })),
    assertions: assertions.map(a => ({
      field: a.field,
      value: a.value,
      method: a.method,
      confidence: a.confidence
    })),
    ...(record ? {} : {})
  };
}

/** What a model is allowed to return. Everything else is discarded. */
export interface AiAnalysisPayload {
  summary?: string;
  classification?: string;
  missingInformation?: string[];
  guidance?: string[];
  suspiciousPatterns?: string[];
  /**
   * Proposed change to the deterministic rank, in points.
   * Clamped to the policy bound; it can never flip visibility or trust.
   */
  rankAdjustment?: number;
  /** Optional per-field claims, which are validated against evidence. */
  claims?: { field: string; value: string | number | boolean }[];
}

export interface AnalysisValidation {
  ok: boolean;
  /** Hard violations; any of these rejects the whole response. */
  violations: string[];
  /** Non-fatal notes, e.g. a clamped rank adjustment. */
  warnings: string[];
  /** The sanitised payload that may be applied (null when rejected). */
  sanitised: AiAnalysisPayload | null;
}

export const MAX_RANK_ADJUSTMENT = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string, violations: string[], limit = 12): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    violations.push(`${field} must be an array of strings`);
    return undefined;
  }
  const out = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (out.length !== value.length) violations.push(`${field} contained non-string entries`);
  return out.slice(0, limit).map(item => item.slice(0, 600));
}

/**
 * Validate a model response against the evidence that produced it.
 *
 * Rejection is total: a response that invents a reward, asserts the offer is
 * free, or tries to clear a scam block is discarded whole, because a partially
 * trusted model answer is exactly how invented facts reach a user.
 */
export function validateAnalysis(payload: unknown, context: { input: AnalysisInput }): AnalysisValidation {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(payload)) {
    return { ok: false, violations: ['response was not a JSON object'], warnings, sanitised: null };
  }

  const sanitised: AiAnalysisPayload = {};

  if (payload.summary !== undefined) {
    if (typeof payload.summary !== 'string') violations.push('summary must be a string');
    else sanitised.summary = payload.summary.slice(0, 2000);
  }
  if (payload.classification !== undefined) {
    if (typeof payload.classification !== 'string') violations.push('classification must be a string');
    else sanitised.classification = payload.classification.slice(0, 120);
  }

  const missing = stringArray(payload.missingInformation, 'missingInformation', violations);
  if (missing) sanitised.missingInformation = missing;
  const guidance = stringArray(payload.guidance, 'guidance', violations);
  if (guidance) sanitised.guidance = guidance;
  const suspicious = stringArray(payload.suspiciousPatterns, 'suspiciousPatterns', violations);
  if (suspicious) sanitised.suspiciousPatterns = suspicious;

  if (payload.rankAdjustment !== undefined) {
    if (typeof payload.rankAdjustment !== 'number' || !Number.isFinite(payload.rankAdjustment)) {
      violations.push('rankAdjustment must be a finite number');
    } else {
      const clamped = Math.max(-MAX_RANK_ADJUSTMENT, Math.min(MAX_RANK_ADJUSTMENT, payload.rankAdjustment));
      if (clamped !== payload.rankAdjustment) {
        warnings.push(`rankAdjustment ${payload.rankAdjustment} clamped to ${clamped}`);
      }
      sanitised.rankAdjustment = clamped;
    }
  }

  if (payload.claims !== undefined) {
    if (!Array.isArray(payload.claims)) {
      violations.push('claims must be an array');
    } else {
      const kept: { field: string; value: string | number | boolean }[] = [];
      for (const claim of payload.claims) {
        if (!isPlainObject(claim) || typeof claim.field !== 'string') {
          violations.push('each claim needs a string field');
          continue;
        }
        const field = claim.field;

        if ((EVIDENCE_OWNED_FIELDS as readonly string[]).includes(field)) {
          violations.push(`claim "${field}" is owned by captured evidence and cannot be set by AI`);
          continue;
        }
        // An AI must never assert that something is free: only evidence may.
        if (/free|capital|cost/i.test(field) || /free|no cost|zero cost/i.test(String(claim.value ?? ''))) {
          violations.push(`claim "${field}" attempts to assert a cost/free status, which only evidence may do`);
          continue;
        }
        const value = claim.value;
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          violations.push(`claim "${field}" has an unsupported value type`);
          continue;
        }
        // If the field already has an established value, the model may not change it.
        const established = context.input.assertions.find(
          a => a.field === field && a.method !== 'absent' && a.value !== null
        );
        if (established) {
          warnings.push(`claim "${field}" ignored: evidence already establishes this value`);
          continue;
        }
        kept.push({ field, value: typeof value === 'string' ? value.slice(0, 500) : value });
      }
      if (kept.length) sanitised.claims = kept;
    }
  }

  const hasContent =
    sanitised.summary !== undefined ||
    sanitised.classification !== undefined ||
    (sanitised.missingInformation?.length ?? 0) > 0 ||
    (sanitised.guidance?.length ?? 0) > 0 ||
    (sanitised.suspiciousPatterns?.length ?? 0) > 0 ||
    sanitised.rankAdjustment !== undefined ||
    (sanitised.claims?.length ?? 0) > 0;

  if (!hasContent && violations.length === 0) {
    warnings.push('response contained no usable fields');
  }

  return { ok: violations.length === 0, violations, warnings, sanitised: violations.length === 0 ? sanitised : null };
}

export interface ModelMetadata {
  service: string;
  modelRef: string;
  routerRef: string;
  latencyMs: number;
  costUsd: number;
  /** Confidence multiplier the router applied because of a weaker model. */
  confidenceAdjustment: number;
  tier: 'free' | 'paid';
}

export interface AppliedAnalysis {
  accepted: boolean;
  violations: string[];
  warnings: string[];
  /** Present only when accepted. */
  applied: {
    summary?: string;
    classification?: string;
    missingInformation?: string[];
    guidance?: string[];
    suspiciousPatterns?: string[];
    /** Deterministic rank + bounded adjustment, still inside 0..100. */
    adjustedRankScore?: number;
  } | null;
  /** Audit trail: which evidence this analysis was based on. */
  evidenceRefs: string[];
  model: ModelMetadata | null;
  /** True when a deterministic block exists and AI could not clear it. */
  deterministicBlockPreserved: boolean;
}

/**
 * Validate and apply an analysis to a candidate.
 *
 * Guarantees, all asserted by tests:
 *  - a rejected response changes nothing;
 *  - the deterministic rank moves by at most `MAX_RANK_ADJUSTMENT` points;
 *  - an existing scam block is preserved no matter what the model says;
 *  - the result always carries evidence references and model metadata.
 */
export function applyAnalysis(params: {
  candidate: OpportunityCandidate;
  payload: unknown;
  model: ModelMetadata;
}): AppliedAnalysis {
  const input = buildAnalysisInput(params.candidate);
  const validation = validateAnalysis(params.payload, { input });

  const evidenceRefs = input.evidence.map(ref => `${ref.snapshotIndex}:${ref.contentHash.slice(0, 16)}`);
  const blocked = params.candidate.risk?.blocked === true;

  if (!validation.ok || !validation.sanitised) {
    return {
      accepted: false,
      violations: validation.violations,
      warnings: validation.warnings,
      applied: null,
      evidenceRefs,
      model: params.model,
      deterministicBlockPreserved: blocked
    };
  }

  const base = params.candidate.scores?.rankScore ?? 0;
  const raw = base + (validation.sanitised.rankAdjustment ?? 0);
  const adjustedRankScore = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    accepted: true,
    violations: [],
    warnings: validation.warnings,
    applied: {
      ...(validation.sanitised.summary !== undefined ? { summary: validation.sanitised.summary } : {}),
      ...(validation.sanitised.classification !== undefined
        ? { classification: validation.sanitised.classification }
        : {}),
      ...(validation.sanitised.missingInformation
        ? { missingInformation: validation.sanitised.missingInformation }
        : {}),
      ...(validation.sanitised.guidance ? { guidance: validation.sanitised.guidance } : {}),
      ...(validation.sanitised.suspiciousPatterns
        ? { suspiciousPatterns: validation.sanitised.suspiciousPatterns }
        : {}),
      ...(validation.sanitised.rankAdjustment !== undefined ? { adjustedRankScore } : {})
    },
    evidenceRefs,
    model: params.model,
    deterministicBlockPreserved: blocked
  };
}

/** True when the deterministic pipeline can proceed with no AI at all. */
export function aiIsOptional(): true {
  return true;
}
