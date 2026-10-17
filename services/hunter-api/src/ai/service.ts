/**
 * M8 AI service — orchestration between Hunter's authoritative records and the Core adapter.
 *
 * Responsibilities:
 *  - load the opportunity / profile / proof records server-side (never trust the client for facts),
 *  - build the grounded input and hash it for cache identity,
 *  - serve from Firestore cache when nothing relevant changed,
 *  - call the Core, validate strictly, and store the result with safe provenance,
 *  - degrade gracefully when the Core is down: never throw away deterministic data, never 500.
 */

import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { CoreClient } from './coreClient.js';
import {
  buildMessages,
  extractJsonObject,
  validatePayload,
  MAX_TOKENS,
  PROMPT_VERSION,
  type Capability,
  type CapabilityPayload,
  type OpportunityFacts,
  type ProfileFacts
} from './capabilities.js';

export interface AiLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const NOOP_LOGGER: AiLogger = { info() {}, warn() {}, error() {} };

export interface AiMeta {
  capability: Capability;
  opportunityId: string | null;
  cached: boolean;
  model: string | null;
  provider: string | null;
  promptVersion: string;
  latencyMs: number;
  generatedAt: string;
  inputHash: string;
  attempts: number;
}

export interface AiSuccess {
  ok: true;
  payload: CapabilityPayload;
  meta: AiMeta;
}

export interface AiFailure {
  ok: false;
  /** HTTP status the route should return. */
  status: number;
  /** Stable code for the client; AI_SERVICE_TEMPORARILY_UNAVAILABLE mirrors the Core. */
  code: string;
  message: string;
  retryable: boolean;
  meta: Pick<AiMeta, 'capability' | 'opportunityId' | 'cached' | 'promptVersion' | 'latencyMs' | 'generatedAt' | 'inputHash'> | null;
  problems?: string[];
}

export type AiOutcome = AiSuccess | AiFailure;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()))].slice(0, max);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Only fields the product already exposes to the owner are sent to the model. */
export function profileFactsFrom(docData: unknown): ProfileFacts | null {
  const data = asRecord(docData);
  const profile = asRecord(data.earningProfile ?? data.profile);
  if (Object.keys(profile).length === 0) return null;

  const skills = stringList(profile.skills);
  const country = typeof profile.country === 'string' ? profile.country : '';
  const hours = numberOrNull(profile.hoursPerWeek);
  const level = typeof profile.skillLevel === 'string' ? profile.skillLevel : null;
  const experience = typeof profile.experience === 'string' ? profile.experience : null;
  const categories = stringList(profile.categories, 8);
  const languages = stringList(profile.languages, 8);
  const remoteOnly = boolOrNull(profile.remoteOnly);

  const notes = [
    level ? `skill level: ${level}` : '',
    experience ? `experience: ${experience}` : '',
    languages.length ? `languages: ${languages.join(', ')}` : '',
    categories.length ? `preferred categories: ${categories.join(', ')}` : '',
    remoteOnly === null ? '' : `remote only: ${remoteOnly ? 'yes' : 'no'}`
  ]
    .filter(Boolean)
    .join('; ');

  return {
    skills,
    countries: country ? [country] : [],
    availability: hours === null ? null : `${hours} hours per week`,
    notes: notes || null
  };
}

export function opportunityFactsFrom(id: string, data: Record<string, unknown>): OpportunityFacts {
  const evidenceRaw = Array.isArray(data.evidence) ? data.evidence : [];
  const evidence = evidenceRaw
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .slice(0, 12)
    .map((row) => ({
      label: typeof row.label === 'string' ? row.label.slice(0, 120) : 'evidence',
      state: typeof row.state === 'string' ? row.state : 'unknown',
      value: typeof row.value === 'string' ? row.value.slice(0, 300) : ''
    }));

  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Untitled opportunity',
    provider: typeof data.provider === 'string' ? data.provider : 'unknown provider',
    category: typeof data.category === 'string' ? data.category : 'uncategorised',
    description: typeof data.description === 'string' ? data.description : '',
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : '',
    requirements: stringList(data.requirements, 20),
    skills: stringList(data.skills, 20),
    rewardMin: numberOrNull(data.rewardMin),
    rewardMax: numberOrNull(data.rewardMax),
    currency: typeof data.currency === 'string' ? data.currency : null,
    rewardBasis: typeof data.rewardBasis === 'string' ? data.rewardBasis : 'unknown',
    countries: stringList(data.countries, 12),
    deadline: typeof data.deadline === 'string' ? data.deadline : null,
    remote: boolOrNull(data.remote),
    noCvRequired: boolOrNull(data.noCvRequired),
    capitalStatus: typeof data.capitalStatus === 'string' ? data.capitalStatus : 'unknown',
    riskLevel: typeof data.riskLevel === 'string' ? data.riskLevel : 'unknown',
    rankScore: numberOrNull(data.rankScore) ?? 0,
    confidence: numberOrNull(data.confidence) ?? 0,
    evidence
  };
}

export interface AiServiceOptions {
  db: Firestore;
  core: CoreClient;
  logger?: AiLogger;
  now?: () => Date;
  /** Max simultaneous Core calls per user (quota protection). */
  perUserConcurrency?: number;
  cacheTtlMs?: number;
}

export class AiService {
  private readonly db: Firestore;
  private readonly core: CoreClient;
  private readonly logger: AiLogger;
  private readonly now: () => Date;
  private readonly perUserConcurrency: number;
  private readonly cacheTtlMs: number;
  private readonly inFlight = new Map<string, number>();

  constructor(options: AiServiceOptions) {
    this.db = options.db;
    this.core = options.core;
    this.logger = options.logger ?? NOOP_LOGGER;
    this.now = options.now ?? (() => new Date());
    this.perUserConcurrency = Math.max(1, options.perUserConcurrency ?? 2);
    this.cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  }

  get configured(): boolean {
    return this.core.configured;
  }

  async status(): Promise<{ state: 'available' | 'degraded' | 'temporarily-unavailable'; detail: string; checkedAt: string }> {
    if (!this.core.configured) {
      return { state: 'temporarily-unavailable', detail: 'not configured', checkedAt: this.now().toISOString() };
    }
    const probe = await this.core.probe();
    return {
      state: probe.available ? 'available' : 'temporarily-unavailable',
      detail: probe.available ? `reachable in ${probe.latencyMs} ms` : probe.detail,
      checkedAt: this.now().toISOString()
    };
  }

  private async loadOpportunity(id: string): Promise<OpportunityFacts | null> {
    const snap = await this.db.collection('opportunities').doc(id).get();
    if (!snap.exists) return null;
    return opportunityFactsFrom(id, asRecord(snap.data()));
  }

  private async loadProfile(uid: string): Promise<ProfileFacts | null> {
    const snap = await this.db.doc(`users/${uid}`).get();
    return snap.exists ? profileFactsFrom(snap.data()) : null;
  }

  private async loadProofs(uid: string): Promise<{ title: string; description: string; skills: string[]; provenance: string }[]> {
    const snap = await this.db.collection(`users/${uid}/proofs`).limit(12).get();
    return snap.docs.map((doc) => {
      const data = asRecord(doc.data());
      return {
        title: typeof data.title === 'string' ? data.title : 'Proof',
        description: typeof data.description === 'string' ? data.description : '',
        skills: stringList(data.skills, 12),
        provenance: typeof data.provenance === 'string' ? data.provenance : ''
      };
    });
  }

  private async readCache(uid: string, key: string): Promise<{ payload: CapabilityPayload; meta: AiMeta } | null> {
    const snap = await this.db.doc(`users/${uid}/aiResults/${key}`).get();
    if (!snap.exists) return null;
    const data = asRecord(snap.data());
    const expiresAt = typeof data.expiresAt === 'string' ? Date.parse(data.expiresAt) : 0;
    if (!expiresAt || expiresAt < this.now().getTime()) return null;
    const payload = data.payload as CapabilityPayload | undefined;
    if (!payload) return null;
    return {
      payload,
      meta: {
        capability: data.capability as Capability,
        opportunityId: (data.opportunityId as string | null) ?? null,
        cached: true,
        model: (data.model as string | null) ?? null,
        provider: (data.provider as string | null) ?? null,
        promptVersion: (data.promptVersion as string) ?? PROMPT_VERSION,
        latencyMs: 0,
        generatedAt: (data.createdAt as string) ?? this.now().toISOString(),
        inputHash: (data.inputHash as string) ?? '',
        attempts: 0
      }
    };
  }

  private async writeCache(uid: string, key: string, payload: CapabilityPayload, meta: AiMeta): Promise<void> {
    const createdAt = this.now();
    await this.db.doc(`users/${uid}/aiResults/${key}`).set({
      capability: meta.capability,
      opportunityId: meta.opportunityId,
      payload,
      model: meta.model,
      provider: meta.provider,
      promptVersion: meta.promptVersion,
      inputHash: meta.inputHash,
      latencyMs: meta.latencyMs,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.cacheTtlMs).toISOString()
    });
  }

  private acquire(uid: string): boolean {
    const current = this.inFlight.get(uid) ?? 0;
    if (current >= this.perUserConcurrency) return false;
    this.inFlight.set(uid, current + 1);
    return true;
  }

  private release(uid: string): void {
    const current = this.inFlight.get(uid) ?? 1;
    if (current <= 1) this.inFlight.delete(uid);
    else this.inFlight.set(uid, current - 1);
  }

  async run(input: {
    uid: string;
    capability: Capability;
    opportunityId?: string;
    purpose?: string;
    forceRefresh?: boolean;
  }): Promise<AiOutcome> {
    const { uid, capability } = input;
    const startedAt = this.now();

    if (!this.core.configured) {
      return {
        ok: false,
        status: 503,
        code: 'AI_SERVICE_TEMPORARILY_UNAVAILABLE',
        message: 'AI assistance is not configured. Deterministic Hunter data is unaffected.',
        retryable: true,
        meta: null
      };
    }

    if (!this.acquire(uid)) {
      return {
        ok: false,
        status: 429,
        code: 'AI_BUSY',
        message: 'Another AI request is in progress. Try again in a moment.',
        retryable: true,
        meta: null
      };
    }

    try {
      const opportunity = capability === 'proof' ? null : await this.loadOpportunity(input.opportunityId ?? '');
      if (capability !== 'proof' && !opportunity) {
        return {
          ok: false,
          status: 404,
          code: 'OPPORTUNITY_NOT_FOUND',
          message: 'That opportunity is no longer available.',
          retryable: false,
          meta: null
        };
      }

      const profile = capability === 'proof' ? null : await this.loadProfile(uid);
      const proofRecords = capability === 'proof' ? await this.loadProofs(uid) : undefined;
      if (capability === 'proof' && (!proofRecords || proofRecords.length === 0)) {
        return {
          ok: false,
          status: 409,
          code: 'NO_PROOF_RECORDS',
          message: 'Add at least one genuine proof record before asking for a summary.',
          retryable: false,
          meta: null
        };
      }

      const inputHash = sha256({
        promptVersion: PROMPT_VERSION,
        capability,
        opportunity: opportunity ? { ...opportunity, description: opportunity.description.slice(0, 6000) } : null,
        profile,
        proofRecords,
        purpose: input.purpose ?? null
      });

      const key = sha256(`${capability}:${input.opportunityId ?? 'proof'}:${inputHash}`);

      if (!input.forceRefresh) {
        const cached = await this.readCache(uid, key);
        if (cached) {
          return { ok: true, payload: cached.payload, meta: { ...cached.meta, capability, opportunityId: input.opportunityId ?? null } };
        }
      }

      const messages = buildMessages(capability, opportunity!, profile, {
        ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(proofRecords ? { proofRecords } : {})
      });

      const result = await this.core.completeJson({
        messages,
        maxTokens: MAX_TOKENS[capability],
        label: `${capability}:${input.opportunityId ?? 'proof'}`
      });

      const generatedAt = this.now().toISOString();

      if (!result.ok) {
        this.logger.warn('AI Core call failed', {
          capability,
          reason: result.reason,
          status: result.status,
          attempts: result.attempts,
          latencyMs: result.latencyMs,
          detail: result.detail
        });
        const unavailable = result.reason === 'unavailable' || result.reason === 'timeout' || result.reason === 'not-configured';
        return {
          ok: false,
          status: unavailable ? 503 : 502,
          code: unavailable ? 'AI_SERVICE_TEMPORARILY_UNAVAILABLE' : 'AI_UPSTREAM_ERROR',
          message: unavailable
            ? 'AI assistance is temporarily unavailable. Verified data and scoring are unaffected.'
            : 'AI assistance could not complete this request. Verified data is unaffected.',
          retryable: true,
          meta: {
            capability,
            opportunityId: input.opportunityId ?? null,
            cached: false,
            promptVersion: PROMPT_VERSION,
            latencyMs: result.latencyMs,
            generatedAt,
            inputHash
          }
        };
      }

      const parsed = extractJsonObject(result.content);
      const validated = validatePayload(capability, parsed);
      if (!validated.ok || !validated.value) {
        this.logger.warn('AI response failed validation', { capability, problems: validated.problems.slice(0, 5) });
        return {
          ok: false,
          status: 502,
          code: 'AI_RESPONSE_INVALID',
          message: 'AI assistance returned an unusable response. Nothing was saved.',
          retryable: true,
          problems: validated.problems.slice(0, 5),
          meta: {
            capability,
            opportunityId: input.opportunityId ?? null,
            cached: false,
            promptVersion: PROMPT_VERSION,
            latencyMs: result.latencyMs,
            generatedAt,
            inputHash
          }
        };
      }

      const meta: AiMeta = {
        capability,
        opportunityId: input.opportunityId ?? null,
        cached: false,
        model: result.model,
        provider: result.provider,
        promptVersion: PROMPT_VERSION,
        latencyMs: result.latencyMs,
        generatedAt,
        inputHash,
        attempts: result.attempts
      };

      await this.writeCache(uid, key, validated.value, meta).catch((error) => {
        this.logger.warn('AI cache write failed', { capability, error: (error as Error)?.message });
      });

      this.logger.info('AI call served', {
        capability,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        totalMs: this.now().getTime() - startedAt.getTime()
      });

      return { ok: true, payload: validated.value, meta };
    } finally {
      this.release(uid);
    }
  }
}
