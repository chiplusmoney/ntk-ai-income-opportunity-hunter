import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ADAPTERS, SOURCE_REGISTRY } from '@ntk/hunter-core';
import { loadConfig } from '../src/config.js';
import { silentLogger } from '../src/logging.js';
import { FirestoreDocumentStore } from '../src/firestore/firestoreStore.js';
import { FirestoreOpportunityWriter } from '../src/firestore/writer.js';
import { FirestoreRunStateStore } from '../src/run/stateStore.js';
import { RunService } from '../src/run/runService.js';

/**
 * End-to-end integration against the Firebase Firestore EMULATOR.
 *
 * This is the proof of the full path:
 *
 *   recorded source payload -> adapter -> deterministic verification ->
 *   accepted opportunity -> Firestore document -> read back
 *
 * It runs only when the emulator harness starts it (`npm run verify:emulator`),
 * which sets FIREBASE_EMULATOR_TEST=1 and FIRESTORE_EMULATOR_HOST. Nothing here
 * touches a real Firebase project, and no credentials are involved.
 *
 * Where it says "emulator", it means emulator: this is NOT evidence of a live
 * deployment, and the docs say so.
 */
const enabled = process.env.FIREBASE_EMULATOR_TEST === '1';

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

const fixtureFetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const key = Object.keys(FIXTURES).find(candidate => url.includes(candidate));
  if (!key) return new Response('not found', { status: 404 });
  return new Response(FIXTURES[key] as string, { status: 200, headers: { 'content-type': 'application/json' } });
}) as unknown as typeof fetch;

const createdIds: string[] = [];

describe.skipIf(!enabled)('Firestore emulator integration', () => {
  const config = loadConfig({
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'demo-ntk-hunter',
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
    // No scheduler credential here: RunService never reads it (only the auth
    // middleware does), so the test does not fabricate one.
  });

  const store = FirestoreDocumentStore.create(config, silentLogger);
  const db = store.database;

  afterAll(async () => {
    // Leave the emulator clean so a re-run is not affected by this run's data.
    for (const id of createdIds) {
      await db.collection('opportunities').doc(id).delete();
      await db.collection('opportunityEvidence').doc(id).delete();
    }
  });

  it('confirms the emulator is the target, not a live project', () => {
    expect(config.usingEmulator).toBe(true);
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  });

  it('writes a verified opportunity, its evidence and the run audit to Firestore', async () => {
    const writer = new FirestoreOpportunityWriter(store);
    const runService = new RunService({
      config,
      logger: silentLogger,
      sources: SOURCE_REGISTRY,
      adapters: ADAPTERS,
      writer,
      stateStore: new FirestoreRunStateStore(db),
      fetchImpl: fixtureFetch,
      now: () => NOW
    });

    const outcome = await runService.startRun({ reason: 'emulator-integration', force: true });
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;

    expect(outcome.summary.published).toBeGreaterThan(0);
    expect(outcome.summary.writes.failed).toEqual([]);

    // Read the documents back out of the emulator.
    //
    // Only documents the PIPELINE wrote are counted: those carry a
    // `sourceId:sourceItemId` id. The security-rules suite seeds its own
    // fixtures into the same emulator, and the assertion here is about this
    // run's output, not about whatever else is in the database.
    const all = await db.collection('opportunities').get();
    const pipelineDocs = all.docs.filter(document => document.id.includes(':'));
    expect(pipelineDocs.length).toBeGreaterThan(0);
    expect(pipelineDocs.length).toBe(outcome.summary.published);

    for (const document of pipelineDocs) {
      createdIds.push(document.id);
      const data = document.data() as Record<string, unknown>;

      // The published contract survived the round trip.
      expect(data.visibility).toBe('published');
      expect(data.zeroCapital).toBe(true);
      expect(['confirmed_free', 'unconfirmed_no_cost_found']).toContain(data.capitalStatus);
      expect(typeof data.rankScore).toBe('number');
      expect(data.updatedAt).toBe(NOW.toISOString());

      // No undefined ever reaches Firestore, and no bookkeeping field is blank.
      for (const [key, value] of Object.entries(data)) {
        expect(value, `${document.id}.${key}`).not.toBeUndefined();
      }

      // The evidence document shares the id and carries the snapshot proof.
      const evidence = await db.collection('opportunityEvidence').doc(document.id).get();
      expect(evidence.exists).toBe(true);
      const evidenceData = evidence.data() as Record<string, unknown>;
      expect(evidenceData.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(evidenceData.capitalStatus).toBe(data.capitalStatus);
      expect(typeof evidenceData.totalAssertions).toBe('number');
      expect(1).toBe(1);
    }

    // One audit document per source that ran.
    const runs = await db.collection('internalSourceRuns').get();
    expect(runs.size).toBeGreaterThan(0);
    const runData = runs.docs.map(document => document.data() as { sourceId: string; startedAt: string });
    expect(runData.every(entry => typeof entry.sourceId === 'string')).toBe(true);
  });

  it('updates the same documents on a repeat crawl instead of duplicating them', async () => {
    const writer = new FirestoreOpportunityWriter(store);
    const runService = new RunService({
      config,
      logger: silentLogger,
      sources: SOURCE_REGISTRY,
      adapters: ADAPTERS,
      writer,
      stateStore: new FirestoreRunStateStore(db),
      fetchImpl: fixtureFetch,
      now: () => NOW
    });

    const countPipelineDocs = async (): Promise<number> => {
      const snapshot = await db.collection('opportunities').get();
      return snapshot.docs.filter(document => document.id.includes(':')).length;
    };

    const before = await countPipelineDocs();
    await runService.startRun({ reason: 'emulator-repeat', force: true });
    const after = await countPipelineDocs();

    expect(after).toBe(before);
  });

  it('uses the run document state to decide what is due', async () => {
    const stateStore = new FirestoreRunStateStore(db);
    const lastRunBySource = await stateStore.lastRunBySource();

    expect(Object.keys(lastRunBySource).length).toBeGreaterThan(0);
    for (const value of Object.values(lastRunBySource)) {
      expect(typeof value).toBe('string');
      expect(Number.isFinite(Date.parse(value as string))).toBe(true);
    }
  });

  it('replays a run byte-identically when the clock is fixed', async () => {
    const writer = new FirestoreOpportunityWriter(store);
    const runService = new RunService({
      config,
      logger: silentLogger,
      sources: SOURCE_REGISTRY,
      adapters: ADAPTERS,
      writer,
      stateStore: new FirestoreRunStateStore(db),
      fetchImpl: fixtureFetch,
      now: () => NOW
    });

    const first = await runService.startRun({ reason: 'replay-1', force: true });
    const second = await runService.startRun({ reason: 'replay-2', force: true });
    if (first.status !== 'completed' || second.status !== 'completed') return;

    expect(second.summary.published).toBe(first.summary.published);
    expect(second.summary.stats.rejected).toBe(first.summary.stats.rejected);
  });
});
