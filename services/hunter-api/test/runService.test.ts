import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SOURCE_REGISTRY, type SourceAdapter, type SourceFetchResult } from '@ntk/hunter-core';
import { MemoryDocumentStore } from '../src/firestore/firestoreStore.js';
import { FirestoreOpportunityWriter } from '../src/firestore/writer.js';
import { MemoryRunStateStore } from '../src/run/stateStore.js';
import { RunService, type RunServiceDeps } from '../src/run/runService.js';
import { silentLogger } from '../src/logging.js';
import { loadConfig } from '../src/config.js';

/**
 * The provider payloads are the SAME recorded fixtures the core adapter tests
 * use, read from the core test directory. Nothing here is a hand-written mock of
 * a provider: the adapters parse real recorded shapes and the writer stores the
 * result.
 */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'core', 'test', 'fixtures');
const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');

const NOW = new Date('2026-10-14T12:00:00.000Z');

const FIXTURES: Record<string, string> = {
  'remotive.com/api/remote-jobs': fixture('remotive.json'),
  'remoteok.com/api': fixture('remoteok.json'),
  'arbeitnow.com/api/job-board-api': fixture('arbeitnow.json'),
  'api.github.com/search/issues': fixture('github-bounties.json'),
  'hn.algolia.com': fixture('hn-freelancer.json')
};

function fixtureFetch(map: Record<string, string> = FIXTURES): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const key = Object.keys(map).find(candidate => url.includes(candidate));
    if (!key) return new Response('not found', { status: 404, statusText: 'Not Found' });
    return new Response(map[key] as string, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

function service(overrides: Partial<RunServiceDeps> = {}) {
  const store = new MemoryDocumentStore();
  const stateStore = new MemoryRunStateStore();
  const runService = new RunService({
    // Note: RunService never reads the scheduler credential — it is consumed by
    // the auth middleware — so the tests do not fabricate one.
    config: loadConfig({ FIREBASE_PROJECT_ID: 'demo' }),
    logger: silentLogger,
    sources: SOURCE_REGISTRY,
    writer: new FirestoreOpportunityWriter(store),
    stateStore,
    fetchImpl: fixtureFetch(),
    now: () => NOW,
    ...overrides
  });
  return { runService, store, stateStore };
}

describe('run orchestration', () => {
  it('completes a run against recorded provider payloads and writes documents', async () => {
    const { runService, store } = service();
    const outcome = await runService.startRun({ reason: 'test' });

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;

    expect(outcome.summary.published).toBeGreaterThan(0);
    expect(outcome.summary.writes.written).toBeGreaterThan(0);
    expect(store.documentsIn('opportunities').length).toBe(outcome.summary.published);
    expect(store.documentsIn('opportunityEvidence').length).toBe(outcome.summary.published);
  });

  it('writes one audit document per source that ran', async () => {
    const { runService, store } = service();
    const outcome = await runService.startRun({ reason: 'test' });
    if (outcome.status !== 'completed') return;

    const runDocs = store.documentsIn('internalSourceRuns');
    expect(runDocs.length).toBeGreaterThan(0);
    const writtenIds = runDocs.map(document => document.id).sort();
    const expectedIds = outcome.summary.sourceRuns
      .map(run => `${run.sourceId}_${(run.lastStartedAt ?? '').replace(/[:.]/g, '-')}`)
      .sort();
    expect(writtenIds).toEqual(expectedIds);
  });

  it('reports the per-source summary without leaking anything sensitive', async () => {
    const { runService } = service();
    const outcome = await runService.startRun({ reason: 'test' });
    if (outcome.status !== 'completed') return;

    const serialised = JSON.stringify(outcome.summary);
    expect(serialised).not.toMatch(/secret|bearer|authorization|api[-_]?key/i);
    for (const run of outcome.summary.sourceRuns) {
      expect(Object.keys(run).sort()).toEqual(
        ['accepted', 'error', 'itemsSeen', 'lastFinishedAt', 'lastStartedAt', 'ok', 'rejected', 'skippedForInterval', 'sourceId'].sort()
      );
    }
  });

  it('skips a source whose crawl interval has not elapsed', async () => {
    const stateStore = new MemoryRunStateStore({ remotive: new Date(NOW.getTime() - 5 * 60_000).toISOString() });
    const { runService } = service({ stateStore });
    const outcome = await runService.startRun({ reason: 'heartbeat' });
    if (outcome.status !== 'completed') return;

    expect(outcome.summary.plan.skipped.some(entry => entry.sourceId === 'remotive')).toBe(true);
    expect(outcome.summary.plan.due).not.toContain('remotive');
    // The other sources still ran: one skipped feed must not stall the hunt.
    expect(outcome.summary.plan.due.length).toBeGreaterThan(0);
  });

  it('runs a source when force is set', async () => {
    const stateStore = new MemoryRunStateStore({ remotive: new Date(NOW.getTime() - 5 * 60_000).toISOString() });
    const { runService } = service({ stateStore });
    const outcome = await runService.startRun({ reason: 'manual', force: true });
    if (outcome.status !== 'completed') return;
    expect(outcome.summary.plan.due).toContain('remotive');
  });

  it('restricts a run to the requested sources', async () => {
    const { runService } = service();
    const outcome = await runService.startRun({ reason: 'manual', sources: ['remotive'], force: true });
    if (outcome.status !== 'completed') return;
    expect(outcome.summary.plan.due).toEqual(['remotive']);
    expect(outcome.summary.stats.perSource.remotive).toBeDefined();
    expect(outcome.summary.stats.perSource.remoteok).toBeUndefined();
  });

  it('is idempotent across two runs: the same documents, refreshed', async () => {
    const { runService, store } = service();
    const first = await runService.startRun({ reason: 'first', force: true });
    if (first.status !== 'completed') return;
    const idsAfterFirst = store.documentsIn('opportunities').map(document => document.id).sort();

    const second = await runService.startRun({ reason: 'second', force: true });
    if (second.status !== 'completed') return;

    const idsAfterSecond = store.documentsIn('opportunities').map(document => document.id).sort();
    expect(second.summary.published).toBe(first.summary.published);
    // Same document set: the second crawl refreshed records, it did not duplicate.
    expect(idsAfterSecond).toEqual(idsAfterFirst);
    expect(new Set(idsAfterSecond).size).toBe(idsAfterSecond.length);
    expect(store.documentsIn('opportunities').length).toBe(second.summary.published);
    expect(store.documentsIn('opportunityEvidence').length).toBe(second.summary.published);
    // One audit document per source: the clock is fixed, so both runs derive the
    // same deterministic run ids and the second write replaces the first.
    expect(store.documentsIn('internalSourceRuns').length).toBe(second.summary.sourceRuns.length);
  });

  it('refuses a second run while one is in flight', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    const slowAdapter: SourceAdapter = {
      sourceId: 'remotive',
      description: 'slow',
      run: async (): Promise<SourceFetchResult> => {
        await gate;
        return {
          sourceId: 'remotive',
          ok: true,
          httpStatus: 200,
          error: null,
          bytes: 1,
          candidates: [],
          itemsSeen: 0,
          skipped: [],
          fetchedAt: NOW.toISOString()
        };
      }
    };

    const { runService } = service({ adapters: [slowAdapter] });
    const first = runService.startRun({ reason: 'first', force: true });
    const second = await runService.startRun({ reason: 'second', force: true });

    expect(second.status).toBe('busy');
    if (second.status === 'busy') expect(second.activeRunId).toMatch(/^run_/);

    release?.();
    await first;
  });

  it('completes when one source fails, and reports which one', async () => {
    const failing: SourceAdapter = {
      sourceId: 'remoteok',
      description: 'always fails',
      run: async () => ({
        sourceId: 'remoteok',
        ok: false,
        httpStatus: 503,
        error: 'HTTP 503 Service Unavailable',
        bytes: 0,
        candidates: [],
        itemsSeen: 0,
        skipped: [],
        fetchedAt: NOW.toISOString()
      })
    };

    // The failing adapter replaces the real remoteok adapter; remoteok stays in
    // the registry, because a source the registry does not know cannot be
    // scheduled at all.
    const realAdapters = (await import('@ntk/hunter-core')).ADAPTERS;
    const { runService, store } = service({
      adapters: [failing, ...realAdapters.filter(adapter => adapter.sourceId !== 'remoteok')]
    });

    const outcome = await runService.startRun({ reason: 'partial', force: true });
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;

    const remoteokRun = outcome.summary.sourceRuns.find(run => run.sourceId === 'remoteok');
    expect(remoteokRun?.ok).toBe(false);
    expect(remoteokRun?.error).toContain('503');
    // The healthy sources still published and were still written.
    expect(outcome.summary.published).toBeGreaterThan(0);
    expect(store.documentsIn('opportunities').length).toBeGreaterThan(0);
  });

  it('completes when every source fails', async () => {
    const failing: SourceAdapter = {
      sourceId: 'remotive',
      description: 'fails',
      run: async () => ({
        sourceId: 'remotive',
        ok: false,
        httpStatus: 500,
        error: 'HTTP 500 Internal Server Error',
        bytes: 0,
        candidates: [],
        itemsSeen: 0,
        skipped: [],
        fetchedAt: NOW.toISOString()
      })
    };
    const { runService } = service({ adapters: [failing], sources: SOURCE_REGISTRY.filter(s => s.id === 'remotive') });
    const outcome = await runService.startRun({ reason: 'all-fail', force: true });
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;
    expect(outcome.summary.published).toBe(0);
    expect(outcome.summary.writes.written).toBeGreaterThan(0); // the audit document still lands
  });
});

describe('AI is optional', () => {
  it('records that no analysis was attempted when the stage is not configured', async () => {
    const { runService } = service();
    const outcome = await runService.startRun({ reason: 'no-ai', force: true });
    if (outcome.status !== 'completed') return;
    expect(outcome.summary.ai.attempted).toBe(false);
    expect(outcome.summary.ai.required).toBe(false);
    expect(outcome.summary.published).toBeGreaterThan(0);
  });

  it('records a router refusal without failing the run', async () => {
    const { runService } = service({ analyze: async () => ({ accepted: true }), aiCandidates: [] });
    const outcome = await runService.startRun({ reason: 'no-model', force: true });
    if (outcome.status !== 'completed') return;
    expect(outcome.summary.ai.attempted).toBe(true);
    expect(outcome.summary.ai.routerDecision).toBe('no-eligible-model');
    expect(outcome.summary.published).toBeGreaterThan(0);
  });

  it('survives an analysis call that throws', async () => {
    const candidates = [
      {
        service: 'flagship-router',
        modelRef: 'free-small',
        tier: 'free' as const,
        qualityTier: 1 as const,
        supportsJson: true,
        maxContextTokens: 32_000,
        avgLatencyMs: 900,
        costPer1kTokensUsd: 0,
        capabilities: ['summarize-opportunity' as const]
      }
    ];
    const { runService } = service({
      analyze: async () => {
        throw new Error('provider unavailable');
      },
      aiCandidates: candidates
    });

    const outcome = await runService.startRun({ reason: 'ai-down', force: true });
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;

    expect(outcome.summary.ai.attempted).toBe(true);
    expect(outcome.summary.ai.applicationsRejected).toBeGreaterThan(0);
    expect(outcome.summary.published).toBeGreaterThan(0);
    expect(outcome.summary.writes.written).toBeGreaterThan(0);
  });

  it('does not authorise paid models by default', async () => {
    const paid = [
      {
        service: 'flagship-router',
        modelRef: 'paid-strong',
        tier: 'paid' as const,
        qualityTier: 3 as const,
        supportsJson: true,
        maxContextTokens: 200_000,
        avgLatencyMs: 2000,
        costPer1kTokensUsd: 1,
        capabilities: ['summarize-opportunity' as const]
      }
    ];
    const { runService } = service({ analyze: async () => ({ accepted: true }), aiCandidates: paid });
    const outcome = await runService.startRun({ reason: 'paid-check', force: true });
    if (outcome.status !== 'completed') return;
    expect(outcome.summary.ai.paidUsed).toBe(false);
    expect(outcome.summary.ai.attempted).toBe(true);
  });
});
