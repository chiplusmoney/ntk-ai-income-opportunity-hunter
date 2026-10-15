import { SOURCE_REGISTRY, isServable as isSourceServable, sourceScopeProblem } from '../registry.js';
import type { DeploymentScope, SourceDefinition } from '../../types.js';
import { DEFAULT_DEPLOYMENT_SCOPE } from '../../types.js';
import type { SourceAdapter } from './shared.js';
import { remotiveAdapter } from './remotive.js';
import { remoteOkAdapter } from './remoteok.js';
import { arbeitnowAdapter } from './arbeitnow.js';
import { githubBountiesAdapter } from './githubBounties.js';
import { devpostAdapter } from './devpost.js';
import { hnFreelancerAdapter } from './hnFreelancer.js';
import { freelancerRssAdapter } from './freelancerRss.js';

/**
 * The adapter table.
 *
 * Every adapter listed here is implemented and unit-tested against a recorded
 * payload. Whether it actually RUNS is decided by the registry: a source must
 * have `adapterImplemented` and `termsReviewed` set before `isServable` lets it
 * through, so an implemented-but-unreviewed adapter stays dormant rather than
 * silently breaching a provider's terms.
 */
export const ADAPTERS: readonly SourceAdapter[] = [
  remotiveAdapter,
  remoteOkAdapter,
  arbeitnowAdapter,
  githubBountiesAdapter,
  devpostAdapter,
  hnFreelancerAdapter,
  freelancerRssAdapter
];

export function getAdapter(sourceId: string): SourceAdapter | undefined {
  return ADAPTERS.find(a => a.sourceId === sourceId);
}

/** Adapters whose registry entry is live for this deployment scope. */
export function servableAdapters(scope: DeploymentScope = DEFAULT_DEPLOYMENT_SCOPE): SourceAdapter[] {
  return ADAPTERS.filter(adapter => {
    const source = SOURCE_REGISTRY.find(s => s.id === adapter.sourceId);
    return source ? isSourceServable(source, scope) : false;
  });
}

/**
 * Adapters present in code but deliberately switched off, with the reason for
 * the requested scope. Used by the run report so "we found nothing" can never be
 * confused with "we did not look".
 */
export function dormantAdapters(
  scope: DeploymentScope = DEFAULT_DEPLOYMENT_SCOPE
): { source: SourceDefinition; adapter: SourceAdapter; reason: string }[] {
  const out: { source: SourceDefinition; adapter: SourceAdapter; reason: string }[] = [];
  for (const adapter of ADAPTERS) {
    const source = SOURCE_REGISTRY.find(s => s.id === adapter.sourceId);
    if (!source) continue;
    const problem = sourceScopeProblem(source, scope);
    if (problem) out.push({ source, adapter, reason: problem });
  }
  return out;
}

export { remotiveAdapter, remoteOkAdapter, arbeitnowAdapter, githubBountiesAdapter, devpostAdapter, hnFreelancerAdapter, freelancerRssAdapter };
export type { SourceAdapter, AdapterContext, SourceFetchResult } from './shared.js';
export { makeCandidate, snapshotOf, emptyResult } from './shared.js';
export { parseRss } from './rss.js';
export type { RssItem, RssChannel } from './rss.js';
export { parsePrizeAmount, parseSubmissionDeadline } from './devpost.js';
export { parseBudgetClause } from './freelancerRss.js';
