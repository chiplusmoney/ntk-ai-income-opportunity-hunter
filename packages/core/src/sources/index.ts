/**
 * Source layer: the registry of real feeds plus the adapters that read them.
 */
export {
  SOURCE_REGISTRY,
  CATEGORY_POLICY,
  categoryPriority,
  isHiddenByDefault,
  getSource,
  isServable,
  sourceScopeProblem,
  enabledSources,
  disabledSources,
  isDueForCrawl
} from './registry.js';

export { DEFAULT_USER_AGENT, DEFAULT_TIMEOUT_MS, getText, parseJson } from './http.js';
export type { HttpContext, HttpResult } from './http.js';

export {
  planLiveProbes,
  assertProbeAllowed,
  isProbeAllowed,
  hostOf,
  describePlan,
  ProbeNotAllowedError
} from './probePlan.js';
export type { LiveProbePlan } from './probePlan.js';

export { inferCategory, isCompetitiveText } from './category.js';
export type { CategoryGuess } from './category.js';

export {
  planCrawl,
  backoffDelayMs,
  shouldRetry,
  summarizeSourceRuns
} from './schedule.js';
export type { CrawlPlan, CrawlPlanEntry, PlanCrawlParams, SourceRunSummary } from './schedule.js';

export {
  ADAPTERS,
  getAdapter,
  servableAdapters,
  dormantAdapters,
  remotiveAdapter,
  remoteOkAdapter,
  arbeitnowAdapter,
  githubBountiesAdapter,
  devpostAdapter,
  hnFreelancerAdapter,
  freelancerRssAdapter,
  jobicyAdapter,
  weWorkRemotelyAdapter,
  makeCandidate,
  snapshotOf,
  emptyResult,
  parseRss,
  parsePrizeAmount,
  parseSubmissionDeadline,
  parseBudgetClause
} from './adapters/index.js';
export type { SourceAdapter, AdapterContext, RssItem, RssChannel } from './adapters/index.js';
export type { CandidateSpec, EstablishedField } from './adapters/shared.js';
export * from './qualification.js';
export * from './intelligence.js';
