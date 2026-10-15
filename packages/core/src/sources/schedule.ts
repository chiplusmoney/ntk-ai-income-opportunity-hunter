import type { DeploymentScope, SourceDefinition, SourceRunRecord } from '../types.js';
import { DEFAULT_DEPLOYMENT_SCOPE } from '../types.js';
import { isDueForCrawl, sourceScopeProblem } from './registry.js';

/**
 * Crawl planning.
 *
 * This is the reusable half of the Cloudflare → Render flow: given the registry
 * and the last run time per source, decide what is actually due, in what order,
 * and in what batches. It lives here (not in the worker) for three reasons:
 *
 *  1. It is pure — no secrets, no network, no clock reads — so it is testable and
 *     can run in the worker, in the Hunter API and in CI unchanged.
 *  2. It cannot be bypassed by a caller: the Hunter API plans through this
 *     function, so a 30-minute heartbeat can never become a 30-minute crawl of a
 *     feed that asked for four requests a day.
 *  3. The worker's own entry file only has to pass the plan through; all the
 *     decisions are covered by tests here.
 */

export interface CrawlPlanEntry {
  sourceId: string;
  due: boolean;
  lastRunAt: string | null;
  minIntervalMinutes: number;
  /** ISO time this source may next be crawled, or null when it is due now. */
  nextDueAt: string | null;
  /** Minutes since the last run, or null when it has never run. */
  minutesSinceLastRun: number | null;
  /** Why this source is or is not due, in plain language. */
  reason: string;
}

export interface CrawlPlan {
  now: string;
  /** Due sources, stalest first, capped by `maxSourcesPerRun`. */
  due: SourceDefinition[];
  /** Due sources that did not fit in this run's cap. */
  deferred: SourceDefinition[];
  /** Due work grouped into bounded batches. */
  batches: string[][];
  entries: CrawlPlanEntry[];
}

export interface PlanCrawlParams {
  sources: readonly SourceDefinition[];
  /** Last successful (or attempted) run per source id, ISO or null. */
  lastRunBySource: Record<string, string | null>;
  now: Date;
  /** How many sources to trigger per batch. Defaults to 3. */
  batchSize?: number;
  /** Maximum sources to attempt in one run, to bound a cold-started request. */
  maxSourcesPerRun?: number;
  /** Ignore intervals (owner-invoked full refresh). */
  force?: boolean;
  /** Restrict the plan to these source ids. */
  only?: string[];
  /**
   * Who this deployment serves. Defaults to `public`, the stricter reading: a
   * source only runs for a multi-user deployment when its terms were verified
   * for that audience.
   */
  scope?: DeploymentScope;
}

/**
 * Sources a run can actually serve: implemented, reviewed, switched on, and
 * permitted for this deployment scope. A dormant source is never "due"; it is
 * not servable at all.
 */
function servabilityProblem(source: SourceDefinition, scope: DeploymentScope): string | null {
  return sourceScopeProblem(source, scope);
}

function minutesBetween(fromIso: string, now: Date): number | null {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return null;
  return (now.getTime() - from) / 60_000;
}

export function planCrawl(params: PlanCrawlParams): CrawlPlan {
  const { sources, lastRunBySource, now } = params;
  const batchSize = Math.max(1, params.batchSize ?? 3);
  const maxSourcesPerRun = Math.max(1, params.maxSourcesPerRun ?? 6);
  const force = params.force ?? false;
  const scope = params.scope ?? DEFAULT_DEPLOYMENT_SCOPE;

  const considered = sources.filter(source => (params.only?.length ? params.only.includes(source.id) : true));

  const entries: CrawlPlanEntry[] = [];
  const dueWithAge: { source: SourceDefinition; ageMinutes: number }[] = [];

  for (const source of considered) {
    const lastRunAt = lastRunBySource[source.id] ?? null;
    const problem = servabilityProblem(source, scope);

    if (problem) {
      entries.push({
        sourceId: source.id,
        due: false,
        lastRunAt,
        minIntervalMinutes: source.minIntervalMinutes,
        nextDueAt: null,
        minutesSinceLastRun: lastRunAt ? minutesBetween(lastRunAt, now) : null,
        reason: problem
      });
      continue;
    }

    const due = force || isDueForCrawl(source, lastRunAt, now);
    const since = lastRunAt ? minutesBetween(lastRunAt, now) : null;

    entries.push({
      sourceId: source.id,
      due,
      lastRunAt,
      minIntervalMinutes: source.minIntervalMinutes,
      nextDueAt: due
        ? null
        : lastRunAt
          ? new Date(Date.parse(lastRunAt) + source.minIntervalMinutes * 60_000).toISOString()
          : null,
      minutesSinceLastRun: since,
      reason: due
        ? lastRunAt
          ? `Due: ${Math.floor(since ?? 0)} min since the last run, interval is ${source.minIntervalMinutes} min.`
          : 'Due: never crawled.'
        : `Skipped: only ${Math.floor(since ?? 0)} min since the last run, interval is ${source.minIntervalMinutes} min.`
    });

    if (due) dueWithAge.push({ source, ageMinutes: since ?? Number.POSITIVE_INFINITY });
  }

  // Stalest first, so a capped or interrupted run still refreshes the feeds that
  // have waited longest. Never-run sources (Infinity) sort to the front, ties by id.
  dueWithAge.sort((a, b) => b.ageMinutes - a.ageMinutes || a.source.id.localeCompare(b.source.id));

  const due = dueWithAge.slice(0, maxSourcesPerRun).map(item => item.source);
  const deferred = dueWithAge.slice(maxSourcesPerRun).map(item => item.source);

  const batches: string[][] = [];
  for (let index = 0; index < due.length; index += batchSize) {
    batches.push(due.slice(index, index + batchSize).map(source => source.id));
  }

  return { now: now.toISOString(), due, deferred, batches, entries };
}

/**
 * Backoff for scheduler retries.
 *
 * Deterministic and capped so a Render cold start or a 503 is retried without
 * hammering: attempt 1 waits `baseMs`, then doubles up to `capMs`. Retrying is
 * safe because every write is idempotent (deterministic document ids), so a
 * re-run updates the same documents instead of duplicating them.
 */
export function backoffDelayMs(attempt: number, baseMs = 1000, capMs = 30_000): number {
  if (!Number.isFinite(attempt) || attempt < 1) return baseMs;
  const raw = baseMs * 2 ** (Math.floor(attempt) - 1);
  return Math.min(raw, capMs);
}

/** True when a retry should be attempted for this attempt number. */
export function shouldRetry(attempt: number, maxAttempts = 3): boolean {
  return attempt < maxAttempts;
}

/**
 * Summarise a set of run records for a status endpoint.
 * Deliberately excludes anything sensitive: no headers, no secrets, no URLs
 * beyond the source id.
 */
export interface SourceRunSummary {
  sourceId: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  ok: boolean | null;
  itemsSeen: number;
  accepted: number;
  rejected: number;
  skippedForInterval: boolean;
  error: string | null;
}

export function summarizeSourceRuns(runs: SourceRunRecord[]): SourceRunSummary[] {
  const bySource = new Map<string, SourceRunRecord>();

  for (const run of runs) {
    const current = bySource.get(run.sourceId);
    if (!current || Date.parse(run.startedAt) > Date.parse(current.startedAt)) {
      bySource.set(run.sourceId, run);
    }
  }

  return [...bySource.values()]
    .map(run => ({
      sourceId: run.sourceId,
      lastStartedAt: run.startedAt,
      lastFinishedAt: run.finishedAt,
      ok: run.ok,
      itemsSeen: run.itemsSeen,
      accepted: run.accepted,
      rejected: run.rejected,
      skippedForInterval: run.skippedForInterval,
      error: run.error
    }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
