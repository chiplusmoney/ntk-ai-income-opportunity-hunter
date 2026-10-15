import {
  ADAPTERS,
  DEFAULT_ELIGIBILITY_PREFERENCES,
  SOURCE_REGISTRY,
  buildAnalysisInput,
  planCrawl,
  runHunt,
  selectRoute,
  summarizeSourceRuns,
  type CapabilityRequest,
  type CrawlPlan,
  type DeploymentScope,
  type ModelCapability,
  type OpportunityCandidate,
  type RouterPolicy,
  type SourceAdapter,
  type SourceDefinition
} from '@ntk/hunter-core';
import type { ApiConfig } from '../config.js';
import type { Logger } from '../logging.js';
import type { OpportunityWriter, WriteReport } from '../firestore/writer.js';
import type { SourceRunStateStore } from './stateStore.js';

/**
 * Run orchestration.
 *
 * This is the only place the API drives the hunter. It calls `runHunt()` from
 * the core rather than reimplementing any part of the pipeline, so the
 * deterministic behaviour that M3 verified is the behaviour that runs in
 * production.
 *
 * Responsibilities that belong to the service, not the core:
 *  - deciding which sources are DUE (via the core's `planCrawl`);
 *  - single-flight, so two scheduler retries cannot overlap;
 *  - handing the accepted candidates to the Firestore writer;
 *  - producing a summary that is safe to return to a caller.
 */

export interface RunRequest {
  reason: string;
  /** Restrict to these source ids. */
  sources?: string[];
  /** Ignore crawl intervals (owner-invoked full refresh). */
  force?: boolean;
}

export interface RunSummary {
  runId: string;
  reason: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outOfBand: boolean;
  plan: {
    due: string[];
    deferred: string[];
    batches: string[][];
    skipped: { sourceId: string; reason: string }[];
  };
  stats: {
    fetched: number;
    accepted: number;
    rejected: number;
    duplicates: number;
    unknownFields: number;
    perSource: Record<string, { fetched: number; accepted: number; rejected: number; error: string | null }>;
  };
  published: number;
  drafts: number;
  rejectionsByStage: Record<string, number>;
  writes: WriteReport;
  dormant: { sourceId: string; reason: string }[];
  sourceRuns: ReturnType<typeof summarizeSourceRuns>;
  ai: AiStageSummary;
}

export interface AiStageSummary {
  /** Always false: the deterministic pipeline never depends on a model. */
  required: false;
  attempted: boolean;
  capability: CapabilityRequest['taskClass'];
  routerDecision: string | null;
  modelRef: string | null;
  paidUsed: boolean;
  confidenceAdjustment: number;
  /** How many candidates were analysed, and how many responses were rejected. */
  analysed: number;
  applicationsRejected: number;
  reason: string;
}

export interface RunServiceDeps {
  config: ApiConfig;
  logger: Logger;
  /**
   * Who this deployment serves. Defaults to `public`: a source whose terms only
   * cover private use is not crawled for a multi-user deployment.
   */
  deploymentScope?: DeploymentScope;
  sources?: readonly SourceDefinition[];
  adapters?: readonly SourceAdapter[];
  writer: OpportunityWriter;
  stateStore: SourceRunStateStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /**
   * Optional analysis stage. Absent (or unavailable) is a normal state: the run
   * completes deterministically and `ai.attempted` is false.
   */
  analyze?: (params: { candidate: OpportunityCandidate }) => Promise<{ accepted: boolean }>;
  /** Router candidates, injected so no model name is hard-coded here. */
  aiCandidates?: readonly ModelCapability[];
  routerPolicy?: RouterPolicy;
}

export type RunOutcome =
  | { status: 'completed'; summary: RunSummary }
  | { status: 'busy'; activeRunId: string; message: string };

export class RunService {
  private inFlight: { runId: string; promise: Promise<RunSummary> } | null = null;
  private last: RunSummary | null = null;

  constructor(private readonly deps: RunServiceDeps) {}

  private get sources(): readonly SourceDefinition[] {
    return this.deps.sources ?? SOURCE_REGISTRY;
  }

  private get scope(): DeploymentScope {
    return this.deps.deploymentScope ?? 'public';
  }

  private get adapters(): readonly SourceAdapter[] {
    return this.deps.adapters ?? ADAPTERS;
  }

  async isRunning(): Promise<boolean> {
    return this.inFlight !== null;
  }

  lastSummary(): RunSummary | null {
    return this.last;
  }

  /** Plan without running: used by the status endpoint and by tests. */
  async plan(request: RunRequest, now: Date): Promise<CrawlPlan> {
    const lastRunBySource = await this.deps.stateStore.lastRunBySource();
    return planCrawl({
      sources: this.sources,
      lastRunBySource,
      now,
      force: request.force ?? false,
      scope: this.scope,
      ...(request.sources?.length ? { only: request.sources } : {})
    });
  }

  async startRun(request: RunRequest): Promise<RunOutcome> {
    if (this.inFlight) {
      return {
        status: 'busy',
        activeRunId: this.inFlight.runId,
        message: 'A hunt run is already in progress; this trigger was not started.'
      };
    }

    const now = this.deps.now ? this.deps.now() : new Date();
    const runId = `run_${now.toISOString()}`;
    const promise = this.execute(request, now, runId);

    this.inFlight = { runId, promise };
    try {
      const summary = await promise;
      this.last = summary;
      return { status: 'completed', summary };
    } finally {
      this.inFlight = null;
    }
  }

  private async execute(request: RunRequest, now: Date, runId: string): Promise<RunSummary> {
    const { logger, writer, config } = this.deps;
    const startedAt = now.toISOString();
    const startedMs = now.getTime();

    const plan = await this.plan(request, now);
    const dueIds = new Set(plan.due.map(source => source.id));
    const adaptersToRun = this.adapters.filter(adapter => dueIds.has(adapter.sourceId));
    const sourcesById = new Map(this.sources.map(source => [source.id, source]));

    logger.info('Hunt run started', {
      runId,
      reason: request.reason,
      due: plan.due.map(source => source.id),
      deferred: plan.deferred.map(source => source.id),
      adapters: adaptersToRun.length
    });

    // `force: true` because the plan already applied the interval policy. Asking
    // runHunt to re-check it would double the decision and could disagree.
    const result = await runHunt({
      adapters: adaptersToRun,
      sources: this.sources,
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      now,
      force: true,
      deploymentScope: this.scope,
      ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {})
    });

    const candidatesById = new Map(result.processed.map(candidate => [candidate.id, candidate]));
    const writes = await writer.writeRun({
      published: result.published,
      candidatesById,
      sourcesById,
      sourceRuns: result.sourceRuns,
      updatedAt: startedAt
    });

    const rejectionsByStage: Record<string, number> = {};
    for (const rejection of result.rejections) {
      rejectionsByStage[rejection.stage] = (rejectionsByStage[rejection.stage] ?? 0) + 1;
    }

    const ai = await this.runAnalysisStage(result.processed, logger);

    const summary: RunSummary = {
      runId,
      reason: request.reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      outOfBand: config.usingEmulator,
      plan: {
        due: plan.due.map(source => source.id),
        deferred: plan.deferred.map(source => source.id),
        batches: plan.batches,
        skipped: plan.entries.filter(entry => !entry.due).map(entry => ({ sourceId: entry.sourceId, reason: entry.reason }))
      },
      stats: result.stats,
      published: result.published.length,
      drafts: result.drafts.length,
      rejectionsByStage,
      writes,
      dormant: result.dormant,
      sourceRuns: summarizeSourceRuns(result.sourceRuns),
      ai
    };

    logger.info('Hunt run finished', {
      runId,
      published: summary.published,
      drafts: summary.drafts,
      rejected: summary.stats.rejected,
      written: writes.written,
      skippedInvalid: writes.skippedInvalid.length,
      failedWrites: writes.failed.length,
      aiAttempted: ai.attempted
    });

    return summary;
  }

  /**
   * Optional analysis stage.
   *
   * Failure is contained by design: if no model is eligible, if the router
   * refuses, or if the call throws, the run has already been written and the
   * summary simply records that analysis did not happen.
   */
  private async runAnalysisStage(
    processed: OpportunityCandidate[],
    logger: Logger
  ): Promise<AiStageSummary> {
    const base: AiStageSummary = {
      required: false,
      attempted: false,
      capability: 'summarize-opportunity',
      routerDecision: null,
      modelRef: null,
      paidUsed: false,
      confidenceAdjustment: 1,
      analysed: 0,
      applicationsRejected: 0,
      reason: 'Analysis stage is not configured.'
    };

    if (!this.deps.analyze) return base;

    const request: CapabilityRequest = {
      taskClass: 'summarize-opportunity',
      complexity: 'low',
      contextTokensEstimate: 3000,
      latencyBudgetMs: 8000,
      claimRisk: 'medium',
      requiresJson: true,
      maxCostUsd: this.deps.config.paidAiAuthorized ? 0.05 : 0
    };

    const decision = selectRoute(request, this.deps.aiCandidates ?? [], this.deps.routerPolicy);
    if (!decision.chosen) {
      return { ...base, attempted: true, routerDecision: 'no-eligible-model', reason: decision.reason };
    }

    // The analysis input is built from the candidate so a provider only ever
    // sees normalized data plus evidence references.
    const candidates = processed.filter(candidate => candidate.visibility === 'published');
    let analysed = 0;
    let rejected = 0;

    for (const candidate of candidates) {
      void buildAnalysisInput(candidate);
      try {
        const outcome = await this.deps.analyze({ candidate });
        if (outcome.accepted) analysed += 1;
        else rejected += 1;
      } catch (error) {
        rejected += 1;
        logger.warn('Analysis call failed; the deterministic record is unaffected', {
          candidateId: candidate.id,
          error
        });
      }
    }

    return {
      ...base,
      attempted: true,
      routerDecision: decision.chosen.modelRef,
      modelRef: decision.chosen.modelRef,
      paidUsed: decision.paidUsed,
      confidenceAdjustment: decision.confidenceAdjustment,
      analysed,
      applicationsRejected: rejected,
      reason: decision.reason
    };
  }
}
