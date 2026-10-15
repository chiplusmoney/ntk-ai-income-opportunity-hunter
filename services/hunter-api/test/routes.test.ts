import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { SOURCE_REGISTRY } from '@ntk/hunter-core';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { silentLogger } from '../src/logging.js';
import { MemoryDocumentStore } from '../src/firestore/firestoreStore.js';
import { FirestoreOpportunityWriter } from '../src/firestore/writer.js';
import { MemoryRunStateStore } from '../src/run/stateStore.js';
import { RunService } from '../src/run/runService.js';
import { SECRET_HEADER } from '../src/auth.js';

/**
 * Route-level tests over a real HTTP listener, so the status codes and the
 * exact response bodies are verified rather than inferred.
 *
 * The credential used here is a test placeholder. It is never a real secret and
 * never leaves this file.
 */
const TEST_CREDENTIAL = 'test-only-scheduler-credential-0001';

let server: Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>(resolve => server?.close(() => resolve()));
    server = null;
  }
});

function build(params: { credentialed?: boolean; firestoreReachable?: boolean } = {}) {
  const credentialed = params.credentialed ?? true;
  const config = loadConfig({
    FIREBASE_PROJECT_ID: 'demo-project',
    ...(credentialed ? { HUNTER_SHARED_SECRET: TEST_CREDENTIAL } : {})
  });

  const store = new MemoryDocumentStore({ dryRun: true });
  const stateStore = new MemoryRunStateStore();
  const runService = new RunService({
    config,
    logger: silentLogger,
    sources: SOURCE_REGISTRY,
    adapters: [],
    writer: new FirestoreOpportunityWriter(store),
    stateStore,
    now: () => new Date('2026-10-14T12:00:00.000Z')
  });

  const app = createApp({ config, logger: silentLogger, runService, stateStore, readinessProbe: async () => ({ firestore: params.firestoreReachable ?? true, detail: 'test probe' }) });
  return { app, config, store };
}

async function listen(app: ReturnType<typeof build>['app']): Promise<string> {
  return new Promise(resolve => {
    server = app.listen(0, () => {
      const address = server?.address();
      if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe('health and readiness', () => {
  it('does not call a configured but unreachable Firestore instance ready', async () => {
    const { app } = build({ firestoreReachable: false });
    const base = await listen(app);
    expect((await fetch(`${base}/ready`)).status).toBe(503);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
  it('answers health without any configuration or credential', async () => {
    const { app } = build({ credentialed: false });
    const base = await listen(app);
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('hunter-api');
  });

  it('reports readiness problems without revealing any configured value', async () => {
    const { app } = build({ credentialed: false });
    const base = await listen(app);
    const response = await fetch(`${base}/ready`);
    expect(response.status).toBe(503);

    const body = (await response.json()) as { ok: boolean; problems: { field: string }[]; checks: unknown };
    expect(body.ok).toBe(false);
    expect(body.problems.map(problem => problem.field)).toContain('HUNTER_SHARED_SECRET');
    expect(JSON.stringify(body)).not.toContain(TEST_CREDENTIAL);
  });

  it('reports ready when the credential and project are configured', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/ready`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { checks: { schedulerCredential: string; paidAiAuthorized: boolean } };
    expect(body.checks.schedulerCredential).toBe('configured');
    expect(body.checks.paidAiAuthorized).toBe(false);
  });
});

describe('authenticated trigger endpoints', () => {
  it('rejects a trigger with no credential', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, { method: 'POST' });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('missing-credential');
  });

  it('rejects a trigger with a wrong credential', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: 'not-the-right-value' }
    });
    expect(response.status).toBe(401);
  });

  it('fails closed when the server has no credential configured', async () => {
    const { app } = build({ credentialed: false });
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: TEST_CREDENTIAL }
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('server-not-configured');
  });

  it('accepts the header the deployed worker sends', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: TEST_CREDENTIAL },
      body: JSON.stringify({ reason: 'cron-30m' })
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; summary: { reason: string; published: number } };
    expect(body.status).toBe('completed');
    expect(body.summary.reason).toBe('cron-30m');
  });

  it('serves the alias path with the same contract', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/scheduler/run`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: TEST_CREDENTIAL, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'alias' })
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { summary: { reason: string } };
    expect(body.summary.reason).toBe('alias');
  });

  it('accepts a bearer token as well as the header', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_CREDENTIAL}` }
    });
    expect(response.status).toBe(200);
  });

  it('tolerates an empty or malformed body', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: TEST_CREDENTIAL, 'content-type': 'application/json' },
      body: '{}'
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { summary: { reason: string } };
    expect(body.summary.reason).toBe('unspecified');
  });

  it('never echoes the credential back', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: TEST_CREDENTIAL }
    });
    expect(await response.text()).not.toContain(TEST_CREDENTIAL);
  });
});

describe('status endpoint', () => {
  it('requires the credential', async () => {
    const { app } = build();
    const base = await listen(app);
    expect((await fetch(`${base}/internal/status`)).status).toBe(401);
  });

  it('reports no run before anything has run', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/internal/status`, { headers: { [SECRET_HEADER]: TEST_CREDENTIAL } });
    const body = (await response.json()) as { lastRun: unknown; running: boolean; lastRunBySource: object };
    expect(body.lastRun).toBeNull();
    expect(body.running).toBe(false);
    expect(body.lastRunBySource).toEqual({});
  });

  it('summarises the last run without secrets or payloads', async () => {
    const { app } = build();
    const base = await listen(app);
    await fetch(`${base}/internal/hunt`, {
      method: 'POST',
      headers: { [SECRET_HEADER]: TEST_CREDENTIAL, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'status-check' })
    });

    const response = await fetch(`${base}/internal/status`, { headers: { [SECRET_HEADER]: TEST_CREDENTIAL } });
    const text = await response.text();
    const body = JSON.parse(text) as { lastRun: { runId: string; reason: string } | null };

    expect(body.lastRun?.reason).toBe('status-check');
    expect(body.lastRun?.runId).toMatch(/^run_/);
    expect(text).not.toContain(TEST_CREDENTIAL);
    expect(text).not.toMatch(/bearer|authorization/i);
  });
});

describe('unknown routes', () => {
  it('answers 404 without leaking that a route exists elsewhere', async () => {
    const { app } = build();
    const base = await listen(app);
    const response = await fetch(`${base}/nope`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('not-found');
  });
});
