import express, { type Express, type Request, type Response } from 'express';
import type { DeploymentScope } from '@ntk/hunter-core';
import { describeConfigProblems, type ApiConfig } from './config.js';
import { requireSchedulerSecret } from './auth.js';
import type { Logger } from './logging.js';
import type { RunRequest, RunService } from './run/runService.js';
import type { SourceRunStateStore } from './run/stateStore.js';

/**
 * HTTP surface.
 *
 * Endpoints:
 *   GET  /health                     liveness: the process is up. No config, no I/O.
 *   GET  /ready                      readiness: what this instance can actually do.
 *   POST /internal/hunt              authenticated scheduler trigger (the path the
 *                                    deployed Cloudflare worker already calls).
 *   POST /internal/scheduler/run     alias of the above, with the same contract.
 *   GET  /internal/status            safe run summary: counts and per-source state,
 *                                    no secrets, no URLs, no payloads.
 *
 * Everything that triggers work is behind the shared-secret check, which fails
 * closed when the secret is not configured on the server.
 */

export interface AppDeps {
  config: ApiConfig;
  logger: Logger;
  runService: RunService;
  stateStore: SourceRunStateStore;
  /** Who this deployment serves; reported by /ready and /internal/status. */
  deploymentScope?: DeploymentScope;
  /** Injected clock so responses are testable. */
  now?: () => Date;
  /** Optional analysis override for tests. */
  readinessProbe?: () => Promise<{ firestore: boolean; detail: string }>;
  sendNotificationTest?: () => Promise<unknown>;
  inspectNotificationSetup?: () => Promise<unknown>;
}

function parseRunRequest(body: unknown): RunRequest {
  const source = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const reason = typeof source.reason === 'string' && source.reason.trim() ? source.reason.trim().slice(0, 120) : 'unspecified';

  const sources = Array.isArray(source.sources)
    ? source.sources.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : undefined;

  return {
    reason,
    ...(sources && sources.length ? { sources } : {}),
    ...(source.force === true ? { force: true } : {})
  };
}

export function createApp(deps: AppDeps): Express {
  const { config, logger, runService, stateStore } = deps;
  const now = deps.now ?? (() => new Date());
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_request: Request, response: Response) => {
    response.json({ ok: true, service: 'hunter-api', time: now().toISOString() });
  });

  app.get('/ready', async (_request: Request, response: Response) => {
    const problems = describeConfigProblems(config);
    let firestore = { reachable: false, detail: 'not probed' };

    if (deps.readinessProbe) {
      try {
        const probe = await deps.readinessProbe();
        firestore = { reachable: probe.firestore, detail: probe.detail };
      } catch (error) {
        firestore = { reachable: false, detail: 'Firestore probe failed' };
      }
    }

    const ready = problems.length === 0 && firestore.reachable;
    response.status(ready ? 200 : 503).json({
      ok: ready,
      service: 'hunter-api',
      mode: config.usingEmulator ? 'emulator' : 'live',
      deploymentScope: deps.deploymentScope ?? 'public',
      checks: {
        schedulerCredential: config.schedulerSecret ? 'configured' : 'missing',
        firestore,
        aiRouting: config.flagshipRouterUrl ? 'configured' : 'not-configured',
        paidAiAuthorized: config.paidAiAuthorized
      },
      problems
    });
  });

  const trigger = async (request: Request, response: Response): Promise<void> => {
    const runRequest = parseRunRequest(request.body);

    try {
      const outcome = await runService.startRun(runRequest);
      if (outcome.status === 'busy') {
        // 409 tells the scheduler this trigger did not run, so a retry is safe
        // and will not duplicate documents (writes are idempotent anyway).
        response.status(409).json(outcome);
        return;
      }
      response.json(outcome);
    } catch (error) {
      logger.error('Hunt run failed', { error, reason: runRequest.reason });
      response.status(500).json({
        error: 'run-failed',
        // The message is redacted by the logger; here a stable string is safer.
        message: 'The hunt run failed. See the service logs for the redacted cause.'
      });
    }
  };

  app.post('/internal/hunt', requireSchedulerSecret(config, logger), trigger);
  app.post('/internal/scheduler/run', requireSchedulerSecret(config, logger), trigger);

  app.post('/internal/notifications/test', requireSchedulerSecret(config, logger), async (_request, response) => {
    if (!deps.sendNotificationTest) { response.status(503).json({ error: 'notification-not-configured' }); return; }
    try { response.json(await deps.sendNotificationTest()); }
    catch { response.status(503).json({ error: 'notification-delivery-unavailable' }); }
  });
  app.get('/internal/notifications/setup', requireSchedulerSecret(config, logger), async (_request, response) => {
    if (!deps.inspectNotificationSetup) { response.status(503).json({ error: 'notification-not-configured' }); return; }
    try { response.json(await deps.inspectNotificationSetup()); }
    catch { response.status(503).json({ error: 'notification-setup-unavailable' }); }
  });

  app.get('/internal/status', requireSchedulerSecret(config, logger), async (_request: Request, response: Response) => {
    const last = runService.lastSummary();
    let lastRunBySource: Record<string, string | null> = {};
    let stateError: string | null = null;

    try {
      lastRunBySource = await stateStore.lastRunBySource();
    } catch (error) {
      stateError = error instanceof Error ? error.message : 'state read failed';
    }

    response.json({
      service: 'hunter-api',
      mode: config.usingEmulator ? 'emulator' : 'live',
      deploymentScope: deps.deploymentScope ?? 'public',
      running: await runService.isRunning(),
      lastRun: last
        ? {
            runId: last.runId,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
            reason: last.reason,
            published: last.published,
            drafts: last.drafts,
            rejected: last.stats.rejected,
            written: last.writes.written,
            skippedInvalid: last.writes.skippedInvalid.length,
            failedWrites: last.writes.failed.length,
            aiAttempted: last.ai.attempted
          }
        : null,
      lastRunBySource,
      sourceRuns: last?.sourceRuns ?? [],
      stateError
    });
  });

  app.use((_request: Request, response: Response) => {
    response.status(404).json({ error: 'not-found' });
  });

  return app;
}
