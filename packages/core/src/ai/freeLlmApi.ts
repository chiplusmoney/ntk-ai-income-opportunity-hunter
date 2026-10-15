import type { ModelCapability, TaskClass } from './capability.js';

/**
 * FreeLLMAPI provider pool adapter.
 *
 * IMPORTANT ARCHITECTURAL RULE (docs/AI_ROUTING_POLICY.md):
 * FlagshipRouter is the routing/control brain; FreeLLMAPI is an independent
 * provider/model pool. They must NOT be source-merged. This module therefore
 * imports only the shared capability TYPES, never the router, and the router
 * never imports this file. `test/ai.test.ts` asserts both directions.
 *
 * This adapter's only job is to describe what the pool offers in the common
 * capability language, so the router can weigh it against any other service.
 */

export interface ProviderPoolEntry {
  /** Provider/model reference owned by FreeLLMAPI. */
  ref: string;
  /** Which task classes this entry is allowed to serve. */
  serves: TaskClass[];
  tier: 'free' | 'paid';
  qualityTier: 1 | 2 | 3;
  supportsJson: boolean;
  maxContextTokens: number;
  avgLatencyMs: number;
  /** Cost per 1k tokens as the pool reports it; 0 for free entries. */
  costPer1kTokensUsd: number;
  /** Health as last reported by the pool. */
  healthy: boolean;
  /** Set when the pool is rate-limiting this entry. */
  rateLimitedUntil?: string | null;
}

export interface PoolSnapshot {
  /** Which service this snapshot came from, recorded for audit. */
  service: string;
  capturedAt: string;
  entries: ProviderPoolEntry[];
}

/**
 * Convert a pool snapshot into router candidates.
 * Unhealthy entries and entries currently rate-limited at `now` are dropped:
 * routing to them would burn a retry for nothing.
 */
export function poolCandidates(snapshot: PoolSnapshot, now: Date): ModelCapability[] {
  return snapshot.entries
    .filter(entry => entry.healthy)
    .filter(entry => {
      if (!entry.rateLimitedUntil) return true;
      const until = Date.parse(entry.rateLimitedUntil);
      return !Number.isFinite(until) || until <= now.getTime();
    })
    .map(entry => ({
      service: snapshot.service,
      modelRef: entry.ref,
      tier: entry.tier,
      qualityTier: entry.qualityTier,
      supportsJson: entry.supportsJson,
      maxContextTokens: entry.maxContextTokens,
      avgLatencyMs: entry.avgLatencyMs,
      costPer1kTokensUsd: entry.costPer1kTokensUsd,
      capabilities: entry.serves
    }));
}

/** Structured request the Hunter API sends to the pool. No model name is chosen here. */
export interface PoolCompletionRequest {
  /** Capability the router decided on; the pool resolves it to a model. */
  modelRef: string;
  taskClass: TaskClass;
  /** Normalized opportunity data plus referenced evidence only. */
  input: unknown;
  requireJson: boolean;
  maxOutputTokens: number;
  /** Correlation id so a result can be tied back to a run. */
  requestId: string;
}

export interface PoolCompletionResponse {
  ok: boolean;
  service: string;
  modelRef: string;
  /** Raw model output; the caller must validate it before use. */
  output: unknown;
  latencyMs: number;
  costUsd: number;
  error: string | null;
}

/**
 * Build the request body for the pool.
 *
 * Guard rail: the payload is serialised here and re-parsed, so nothing
 * non-serialisable (a class instance, a Firestore document reference, a
 * function) can leak into the outbound body.
 */
export function buildPoolRequest(params: {
  modelRef: string;
  request: { taskClass: TaskClass; requiresJson: boolean };
  input: unknown;
  requestId: string;
  maxOutputTokens?: number;
}): PoolCompletionRequest {
  return {
    modelRef: params.modelRef,
    taskClass: params.request.taskClass,
    input: JSON.parse(JSON.stringify(params.input ?? null)) as unknown,
    requireJson: params.request.requiresJson,
    maxOutputTokens: params.maxOutputTokens ?? 1200,
    requestId: params.requestId
  };
}
