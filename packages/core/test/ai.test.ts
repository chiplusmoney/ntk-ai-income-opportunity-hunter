import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTER_POLICY, selectRoute } from '../src/ai/index.js';
import { reducesConfidence } from '../src/ai/router.js';
import { buildPoolRequest, poolCandidates } from '../src/ai/freeLlmApi.js';
import { applyAnalysis, buildAnalysisInput, validateAnalysis, MAX_RANK_ADJUSTMENT } from '../src/ai/analysis.js';
import { selectRoute as _unusedSelectRoute } from '../src/ai/router.js';
import { runHunt } from '../src/pipeline/run.js';
import { SOURCE_REGISTRY } from '../src/sources/registry.js';
import { candidate, FIXED_NOW, fixture, fixtureFetch } from './helpers.js';
import type { CapabilityRequest, ModelCapability, RouterPolicy } from '../src/ai/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const aiDir = join(here, '..', 'src', 'ai');

const request = (overrides: Partial<CapabilityRequest> = {}): CapabilityRequest => ({
  taskClass: 'summarize-opportunity',
  complexity: 'low',
  contextTokensEstimate: 2000,
  latencyBudgetMs: 8000,
  claimRisk: 'low',
  requiresJson: true,
  maxCostUsd: 0,
  ...overrides
});

const model = (overrides: Partial<ModelCapability> = {}): ModelCapability => ({
  service: 'flagship-router',
  modelRef: 'small-free-json',
  tier: 'free',
  qualityTier: 1,
  supportsJson: true,
  maxContextTokens: 32_000,
  avgLatencyMs: 1200,
  costPer1kTokensUsd: 0,
  capabilities: ['summarize-opportunity'],
  ...overrides
});

describe('free-first routing', () => {
  it('picks the least capable sufficient free model before a stronger one', () => {
    const weak = model({ modelRef: 'small', qualityTier: 1 });
    const strong = model({ modelRef: 'large', qualityTier: 3 });
    const decision = selectRoute(request(), [strong, weak]);
    expect(decision.chosen?.modelRef).toBe('small');
    expect(decision.paidUsed).toBe(false);
    expect(decision.confidenceAdjustment).toBe(1);
  });

  it('never selects a paid model while a free one meets the threshold', () => {
    const free = model({ modelRef: 'free-ok' });
    const paid = model({ modelRef: 'paid-strong', tier: 'paid', qualityTier: 3, costPer1kTokensUsd: 0.5 });
    const decision = selectRoute(request({ maxCostUsd: 1 }), [paid, free], {
      ...DEFAULT_ROUTER_POLICY,
      paidAllowed: true,
      maxCostUsd: 1
    });
    expect(decision.paidUsed).toBe(false);
    expect(decision.chosen?.modelRef).toBe('free-ok');
  });

  it('uses a paid model only when free models cannot meet the threshold', () => {
    const weakFree = model({ modelRef: 'weak-free', qualityTier: 1 });
    const paid = model({ modelRef: 'paid-strong', tier: 'paid', qualityTier: 3, costPer1kTokensUsd: 0.5 });
    const policy: RouterPolicy = { ...DEFAULT_ROUTER_POLICY, paidAllowed: true, minQualityTier: 3, maxCostUsd: 1 };
    const decision = selectRoute(request({ maxCostUsd: 1 }), [weakFree, paid], policy);
    expect(decision.paidUsed).toBe(true);
    expect(decision.chosen?.modelRef).toBe('paid-strong');
  });

  it('refuses a paid model when paid use is not authorised', () => {
    const paid = model({ modelRef: 'paid-strong', tier: 'paid', qualityTier: 3, costPer1kTokensUsd: 0.5 });
    const policy: RouterPolicy = { ...DEFAULT_ROUTER_POLICY, paidAllowed: false, minQualityTier: 3 };
    const decision = selectRoute(request(), [paid], policy);
    // The paid model is eligible in every other respect, so this pins the
    // authorisation gate specifically: no model may be used, paid or otherwise.
    expect(decision.paidUsed).toBe(false);
    expect(decision.chosen).toBeNull();
    expect(decision.reason).toMatch(/paid use is not authorised/i);
  });

  it('reduces confidence explicitly when falling back to a weaker free model', () => {
    const weakFree = model({ modelRef: 'weak-free', qualityTier: 1 });
    const policy: RouterPolicy = { ...DEFAULT_ROUTER_POLICY, minQualityTier: 3 };
    const decision = selectRoute(request(), [weakFree], policy);
    expect(decision.chosen?.modelRef).toBe('weak-free');
    expect(reducesConfidence(decision)).toBe(true);
    expect(decision.confidenceAdjustment).toBeLessThan(1);
    expect(decision.reason).toMatch(/lowering confidence/i);
  });

  it('honours the caller cost ceiling of zero', () => {
    const paid = model({ modelRef: 'paid-cheap', tier: 'paid', qualityTier: 3, costPer1kTokensUsd: 0.01 });
    const policy: RouterPolicy = { ...DEFAULT_ROUTER_POLICY, paidAllowed: true, minQualityTier: 3, maxCostUsd: 0 };
    const decision = selectRoute(request({ maxCostUsd: 0 }), [paid], policy);
    expect(decision.paidUsed).toBe(false);
  });

  it('excludes models that cannot meet the context size', () => {
    const small = model({ modelRef: 'tiny-context', maxContextTokens: 500 });
    const decision = selectRoute(request({ contextTokensEstimate: 10_000 }), [small]);
    expect(decision.chosen).toBeNull();
    expect(decision.reason).toMatch(/No eligible model/i);
  });

  it('excludes models that cannot return JSON when JSON is required', () => {
    const noJson = model({ modelRef: 'prose-only', supportsJson: false });
    expect(selectRoute(request({ requiresJson: true }), [noJson]).chosen).toBeNull();
    expect(selectRoute(request({ requiresJson: false }), [noJson]).chosen?.modelRef).toBe('prose-only');
  });

  it('excludes models whose capability list lacks the task', () => {
    const wrongTask = model({ modelRef: 'tagging-only', capabilities: ['tagging'] });
    expect(selectRoute(request(), [wrongTask]).chosen).toBeNull();
  });

  it('requires deterministic evidence first for high-risk claims', () => {
    const decision = selectRoute(request({ claimRisk: 'high' }), [model()]);
    expect(decision.deterministicFirst).toBe(true);
    expect(selectRoute(request({ claimRisk: 'low' }), [model()]).deterministicFirst).toBe(false);
  });

  it('offers a fallback chain', () => {
    const decision = selectRoute(request(), [
      model({ modelRef: 'a', qualityTier: 1 }),
      model({ modelRef: 'b', qualityTier: 2 }),
      model({ modelRef: 'c', qualityTier: 3 })
    ]);
    expect(decision.chosen?.modelRef).toBe('a');
    expect(decision.fallbackChain.map(m => m.modelRef)).toEqual(['b', 'c']);
  });

  it('is deterministic', () => {
    const candidates = [model({ modelRef: 'x' }), model({ modelRef: 'y', qualityTier: 2 })];
    expect(JSON.stringify(selectRoute(request(), candidates))).toBe(
      JSON.stringify(selectRoute(request(), candidates))
    );
  });
});

describe('provider pool adapter', () => {
  const snapshot = {
    service: 'freellmapi',
    capturedAt: FIXED_NOW.toISOString(),
    entries: [
      {
        ref: 'pool-free-fast',
        serves: ['summarize-opportunity' as const],
        tier: 'free' as const,
        qualityTier: 1 as const,
        supportsJson: true,
        maxContextTokens: 16_000,
        avgLatencyMs: 900,
        costPer1kTokensUsd: 0,
        healthy: true
      },
      {
        ref: 'pool-unhealthy',
        serves: ['summarize-opportunity' as const],
        tier: 'free' as const,
        qualityTier: 3 as const,
        supportsJson: true,
        maxContextTokens: 128_000,
        avgLatencyMs: 5000,
        costPer1kTokensUsd: 0,
        healthy: false
      },
      {
        ref: 'pool-rate-limited',
        serves: ['summarize-opportunity' as const],
        tier: 'free' as const,
        qualityTier: 2 as const,
        supportsJson: true,
        maxContextTokens: 32_000,
        avgLatencyMs: 1500,
        costPer1kTokensUsd: 0,
        healthy: true,
        rateLimitedUntil: new Date(FIXED_NOW.getTime() + 3_600_000).toISOString()
      }
    ]
  };

  it('drops unhealthy entries', () => {
    expect(poolCandidates(snapshot, FIXED_NOW).map(c => c.modelRef)).not.toContain('pool-unhealthy');
  });

  it('drops entries that are still rate-limited', () => {
    expect(poolCandidates(snapshot, FIXED_NOW).map(c => c.modelRef)).not.toContain('pool-rate-limited');
  });

  it('re-admits an entry once its rate limit has passed', () => {
    const later = new Date(FIXED_NOW.getTime() + 7_200_000);
    expect(poolCandidates(snapshot, later).map(c => c.modelRef)).toContain('pool-rate-limited');
  });

  it('produces candidates the router can use', () => {
    const decision = selectRoute(request(), poolCandidates(snapshot, FIXED_NOW));
    expect(decision.chosen?.service).toBe('freellmapi');
  });

  it('strips non-serialisable input from the outbound request', () => {
    const built = buildPoolRequest({
      modelRef: 'pool-free-fast',
      request: { taskClass: 'summarize-opportunity', requiresJson: true },
      input: { a: 1, b: undefined, c: () => 'nope', d: { e: null } },
      requestId: 'run-1'
    });
    expect(built.input).toEqual({ a: 1, d: { e: null } });
    expect(JSON.stringify(built)).not.toMatch(/undefined|function/);
  });

  it('sends a task class and a model reference, but never a model name from the app', () => {
    const built = buildPoolRequest({
      modelRef: 'pool-free-fast',
      request: { taskClass: 'tagging', requiresJson: false },
      input: {},
      requestId: 'run-2'
    });
    expect(built.taskClass).toBe('tagging');
    expect(built.modelRef).toBe('pool-free-fast');
  });
});

describe('architectural boundary: router and pool stay separate', () => {
  it('does not import each other', () => {
    const router = readFileSync(join(aiDir, 'router.ts'), 'utf8');
    const pool = readFileSync(join(aiDir, 'freeLlmApi.ts'), 'utf8');
    expect(router).not.toMatch(/freeLlmApi/);
    expect(pool).not.toMatch(/from '\.\/router/);
    expect(pool).not.toMatch(/selectRoute/);
  });

  it('keeps the capability types shared rather than duplicated', () => {
    const capability = readFileSync(join(aiDir, 'capability.ts'), 'utf8');
    expect(capability).not.toMatch(/freeLlmApi|router\.js/);
  });
});

describe('AI analysis safety', () => {
  const base = candidate();
  const modelMeta = {
    service: 'flagship-router',
    modelRef: 'small-free-json',
    routerRef: 'route-1',
    latencyMs: 900,
    costUsd: 0,
    confidenceAdjustment: 1,
    tier: 'free' as const
  };

  it('sends only normalized data and evidence references to the model', () => {
    const input = buildAnalysisInput(base);
    expect(input.evidence).toHaveLength(1);
    expect(input.evidence[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(input)).not.toMatch(/privateKey|seedPhrase|apiKey/i);
  });

  it('names the fields the pipeline could not establish', () => {
    const withUnknowns = candidate({
      evidence: {
        snapshots: base.evidence.snapshots,
        assertions: [
          { field: 'reward.min', value: null, method: 'absent', snapshotIndex: null, confidence: 0 },
          { field: 'deadline', value: null, method: 'absent', snapshotIndex: null, confidence: 0 }
        ]
      }
    });
    const input = buildAnalysisInput(withUnknowns);
    expect(input.opportunity.unknownFields).toEqual(['reward.min', 'deadline']);
  });

  it('accepts a legitimate summary and guidance', () => {
    const result = applyAnalysis({
      candidate: base,
      payload: { summary: 'A short remote contract.', guidance: ['Ask for the milestone list.'] },
      model: modelMeta
    });
    expect(result.accepted).toBe(true);
    expect(result.applied?.summary).toBe('A short remote contract.');
    expect(result.model?.modelRef).toBe('small-free-json');
    expect(result.evidenceRefs[0]).toMatch(/^0:[0-9a-f]{16}$/);
  });

  it('rejects an invented reward', () => {
    const result = applyAnalysis({
      candidate: base,
      payload: { claims: [{ field: 'reward.min', value: 9999 }] },
      model: modelMeta
    });
    expect(result.accepted).toBe(false);
    expect(result.violations.join(' ')).toMatch(/owned by captured evidence/i);
    expect(result.applied).toBeNull();
  });

  it('rejects an invented deadline', () => {
    const result = applyAnalysis({
      candidate: base,
      payload: { claims: [{ field: 'deadline', value: '2026-12-01' }] },
      model: modelMeta
    });
    expect(result.accepted).toBe(false);
  });

  it('rejects a claim that an opportunity is free', () => {
    const result = applyAnalysis({
      candidate: base,
      payload: { claims: [{ field: 'notes', value: 'This is free to join, no cost at all.' }] },
      model: modelMeta
    });
    expect(result.accepted).toBe(false);
    expect(result.violations.join(' ')).toMatch(/only evidence may do/i);
  });

  it('cannot clear a deterministic scam block', () => {
    const blocked = candidate({
      risk: { level: 'critical', trustScore: 0, findings: [], blocked: true }
    });
    const result = applyAnalysis({
      candidate: blocked,
      payload: { summary: 'Looks fine to me.', claims: [{ field: 'blocked', value: false }] },
      model: modelMeta
    });
    expect(result.accepted).toBe(false);
    expect(result.deterministicBlockPreserved).toBe(true);
  });

  it('clamps a rank adjustment instead of letting AI re-rank freely', () => {
    const beyond = applyAnalysis({
      candidate: base,
      payload: { rankAdjustment: 40 },
      model: modelMeta
    });
    expect(beyond.accepted).toBe(true);
    expect(beyond.warnings.join(' ')).toMatch(/clamped/i);
    // base rank + the capped adjustment, never base + 40.
    const baseRank = base.scores?.rankScore ?? 0;
    expect(beyond.applied?.adjustedRankScore).toBeLessThanOrEqual(baseRank + MAX_RANK_ADJUSTMENT);
  });

  it('keeps the adjusted rank inside 0..100', () => {
    const withScores = candidate({
      scores: { rankScore: 98, trustScore: 90, confidence: 80, components: [] }
    });
    const result = applyAnalysis({ candidate: withScores, payload: { rankAdjustment: 10 }, model: modelMeta });
    expect(result.applied?.adjustedRankScore).toBeLessThanOrEqual(100);
  });

  it('rejects a non-object response', () => {
    expect(validateAnalysis('just prose', { input: buildAnalysisInput(base) }).ok).toBe(false);
    expect(validateAnalysis(['a'], { input: buildAnalysisInput(base) }).ok).toBe(false);
    expect(validateAnalysis(null, { input: buildAnalysisInput(base) }).ok).toBe(false);
  });

  it('rejects malformed field types', () => {
    const validation = validateAnalysis(
      { summary: 42, guidance: 'not-an-array' },
      { input: buildAnalysisInput(base) }
    );
    expect(validation.ok).toBe(false);
    expect(validation.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores a claim that contradicts established evidence', () => {
    const withEvidence = candidate({
      evidence: {
        snapshots: base.evidence.snapshots,
        assertions: [
          { field: 'notes', value: 'established value', method: 'structured-field', snapshotIndex: 0, confidence: 1 }
        ]
      }
    });
    const result = applyAnalysis({
      candidate: withEvidence,
      payload: { claims: [{ field: 'notes', value: 'model guess' }] },
      model: modelMeta
    });
    expect(result.accepted).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/evidence already establishes/i);
    expect(result.applied?.summary).toBeUndefined();
  });

  it('records model metadata for audit', () => {
    const result = applyAnalysis({ candidate: base, payload: { summary: 'ok' }, model: modelMeta });
    expect(result.model?.tier).toBe('free');
    expect(result.model?.costUsd).toBe(0);
    expect(result.model?.routerRef).toBe('route-1');
  });
});

describe('the hunter survives with no AI available', () => {
  const fixtures: Record<string, string> = {
    'remotive.com/api/remote-jobs': fixture('remotive.json'),
    'remoteok.com/api': fixture('remoteok.json'),
    'arbeitnow.com/api/job-board-api': fixture('arbeitnow.json'),
    'api.github.com/search/issues': fixture('github-bounties.json'),
    'hn.algolia.com': fixture('hn-freelancer.json')
  };

  it('publishes verified opportunities when every model is down', async () => {
    const { fetchImpl } = fixtureFetch(fixtures);
    // No router, no pool, no model: the deterministic path must still work.
    const decision = selectRoute(request(), []);
    expect(decision.chosen).toBeNull();

    const result = await runHunt({ sources: SOURCE_REGISTRY, fetchImpl, now: FIXED_NOW, force: true });
    expect(result.published.length).toBeGreaterThan(0);
    for (const record of result.published) {
      expect(record.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('does not require any AI module on the critical path', () => {
    const runSource = readFileSync(join(here, '..', 'src', 'pipeline', 'run.ts'), 'utf8');
    expect(runSource).not.toMatch(/from '\.\.\/ai/);
  });
});

void _unusedSelectRoute;
