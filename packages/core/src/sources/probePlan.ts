import type { DeploymentScope, SourceDefinition } from '../types.js';
import { DEFAULT_DEPLOYMENT_SCOPE } from '../types.js';
import { isServable, sourceScopeProblem } from './registry.js';

/**
 * Live-probe planning.
 *
 * Why this exists: the live verification suite makes *real outbound requests*,
 * and that is only acceptable for a source whose terms actually permit reading
 * it. Two failure modes are possible, and both are compliance defects rather
 * than test failures:
 *
 *  1. Probing a source whose terms PROHIBIT automated access. "The endpoint
 *     answers" is not permission, and a test suite is not exempt from the terms
 *     the product claims to respect.
 *  2. Probing a source whose permitted use does not extend to this deployment's
 *     audience (a personal-scope source in a public deployment).
 *
 * So the plan is derived from the registry, not from a hand-maintained list that
 * can drift: whatever `isServable(source, scope)` allows may be contacted, and
 * everything else is verified from its RECORDED FIXTURE instead — which still
 * proves the adapter parses the real payload shape, without touching the
 * provider.
 *
 * `assertProbeAllowed` turns the plan into an enforced guard: the live suite
 * wraps `fetch` with it, so a future edit that reintroduces a prohibited request
 * fails loudly instead of quietly violating someone's terms.
 */

export interface LiveProbePlan {
  scope: DeploymentScope;
  /** Sources whose endpoints may be contacted for this scope. */
  probe: SourceDefinition[];
  /**
   * Sources that must NOT be contacted, each with the reason taken from the
   * registry (prohibited, unread terms, or out of scope for this audience).
   */
  offlineOnly: { source: SourceDefinition; reason: string }[];
  /** Hosts the live suite must never fetch for this plan. */
  forbiddenHosts: string[];
  /** Hosts the live suite may fetch. */
  allowedHosts: string[];
}

/** Hostname of a URL, or '' when it cannot be parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function planLiveProbes(params: {
  sources: readonly SourceDefinition[];
  scope?: DeploymentScope;
}): LiveProbePlan {
  const scope = params.scope ?? DEFAULT_DEPLOYMENT_SCOPE;
  const probe: SourceDefinition[] = [];
  const offlineOnly: { source: SourceDefinition; reason: string }[] = [];
  const forbidden = new Set<string>();
  const allowed = new Set<string>();

  for (const source of params.sources) {
    const problem = sourceScopeProblem(source, scope);

    if (problem === null) {
      probe.push(source);
      const endpointHost = hostOf(source.endpoint);
      if (endpointHost) allowed.add(endpointHost);
      continue;
    }

    offlineOnly.push({ source, reason: problem });

    // Both the endpoint and the homepage are off limits. For a prohibited
    // source the homepage matters as much as the API: fetching it would be the
    // "scrape the Site" conduct the terms forbid, not merely an API call.
    for (const url of [source.endpoint, source.homepage]) {
      const host = hostOf(url);
      if (host) forbidden.add(host);
    }
  }

  // A host that is allowed for one source must not be blocked because another
  // source happens to share it.
  for (const host of allowed) forbidden.delete(host);

  return {
    scope,
    probe: [...probe].sort((a, b) => a.id.localeCompare(b.id)),
    offlineOnly: offlineOnly.sort((a, b) => a.source.id.localeCompare(b.source.id)),
    forbiddenHosts: [...forbidden].sort(),
    allowedHosts: [...allowed].sort()
  };
}

/** Raised when something tries to contact a source the plan forbids. */
export class ProbeNotAllowedError extends Error {
  constructor(url: string, plan: LiveProbePlan) {
    super(
      `Refusing to contact ${url}: this deployment scope (${plan.scope}) does not permit reading that source. ` +
        `Forbidden hosts for this plan: ${plan.forbiddenHosts.join(', ') || '(none)'}. ` +
        'Prohibited sources are verified from their recorded fixtures instead.'
    );
    this.name = 'ProbeNotAllowedError';
  }
}

/**
 * Guard for the live suite. Throws when a URL's host is not on the allowed list.
 * Any URL whose host the plan does not explicitly permit is refused, so an
 * unlisted host fails closed rather than slipping through.
 */
export function assertProbeAllowed(url: string, plan: LiveProbePlan): void {
  const host = hostOf(url);
  if (!host || !plan.allowedHosts.includes(host)) {
    throw new ProbeNotAllowedError(url, plan);
  }
}

/** True when the URL may be contacted under this plan. */
export function isProbeAllowed(url: string, plan: LiveProbePlan): boolean {
  const host = hostOf(url);
  return Boolean(host) && plan.allowedHosts.includes(host);
}

/** One-line-per-source summary, printed by the live suite and the harness. */
export function describePlan(plan: LiveProbePlan): string[] {
  const lines = [`scope: ${plan.scope}`];
  for (const source of plan.probe) {
    lines.push(`  PROBE    ${source.id} (${source.endpoint})`);
  }
  for (const { source, reason } of plan.offlineOnly) {
    lines.push(`  OFFLINE  ${source.id} — ${reason}`);
  }
  if (plan.forbiddenHosts.length) {
    lines.push(`  never contacted: ${plan.forbiddenHosts.join(', ')}`);
  }
  return lines;
}
