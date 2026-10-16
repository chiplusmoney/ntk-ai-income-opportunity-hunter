import { evidenceHash, unknownFieldCount } from '../evidence/index.js';
import { isServable as isSourceServable, isDueForCrawl, sourceScopeProblem } from '../sources/registry.js';
import { servableAdapters, dormantAdapters, type SourceAdapter } from '../sources/adapters/index.js';
import { assessEligibility, DEFAULT_ELIGIBILITY_PREFERENCES, type EligibilityPreferences } from './eligibility.js';
import { assessRisk } from './risk.js';
import { assessZeroCapital } from './zeroCapital.js';
import { dedupeCandidate, preferCanonical, ListingIndex } from './dedupe.js';
import { scoreCandidate, DEFAULT_WEIGHTS, type ScoringWeights } from './scoring.js';
import type {
  CapitalStatus,
  DeploymentScope,
  OpportunityCandidate,
  PublishedOpportunity,
  PipelineStats,
  RejectionRecord,
  SourceDefinition,
  SourceRunRecord,
  Tri
} from '../types.js';
import { DEFAULT_DEPLOYMENT_SCOPE } from '../types.js';

/**
 * Hunter pipeline orchestrator.
 *
 * `Discover -> Fetch -> Normalize -> Deduplicate -> Evidence Capture ->
 *  Eligibility -> Risk/Trust Rules -> Base Score -> AI Analysis -> Final Rank`
 *
 * This module owns everything up to and including the deterministic base score.
 * AI analysis is deliberately NOT here: the pipeline's job is to produce facts
 * and a reproducible ranking, and the AI stage may only receive what this
 * function already established.
 *
 * Everything time-dependent is injected (`now`), so the same input always
 * produces the same output. `tests/pipeline.test.ts` asserts that.
 */

export interface HuntRunInput {
  /** Adapters to run. Defaults to the servable ones from the registry. */
  adapters?: SourceAdapter[];
  /** Records already stored, used for deduplication. */
  existing?: OpportunityCandidate[];
  prefs?: EligibilityPreferences;
  weights?: ScoringWeights;
  userSkills?: string[];
  history?: Record<string, number>;
  /** Required: the clock, so runs are reproducible. */
  now: Date;
  /** Last successful crawl per source id, for interval enforcement. */
  lastRunBySource?: Record<string, string | null>;
  /** When true, ignore crawl intervals and run every adapter. */
  force?: boolean;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** Registry entries, injectable for tests. */
  sources?: readonly SourceDefinition[];
  /**
   * Who this run serves. Defaults to `public`, so a source whose terms do not
   * cover multi-user display is not crawled unless the caller narrows the scope
   * deliberately.
   */
  deploymentScope?: DeploymentScope;
}

export interface HuntRunResult {
  published: PublishedOpportunity[];
  /** Candidates that cleared every gate but are still awaiting something. */
  drafts: OpportunityCandidate[];
  /**
   * Every candidate this run processed, published or not, in stage order.
   * The persistence layer needs these to build the evidence documents, and an
   * audit needs them to explain a rejection without re-running the pipeline.
   */
  processed: OpportunityCandidate[];
  rejections: RejectionRecord[];
  sourceRuns: SourceRunRecord[];
  /** Adapters that exist but are switched off, with the registry reason. */
  dormant: { sourceId: string; reason: string }[];
  stats: PipelineStats;
}

/** Decide visibility for a processed candidate. */
function visibilityFor(params: {
  zeroCapital: boolean;
  eligibility: { eligible: boolean; needsMoreEvidence: boolean };
  risk: { blocked: boolean; level: string };
  dedupeVerdict: string;
}): { visibility: OpportunityCandidate['visibility']; reason: string } {
  if (params.dedupeVerdict === 'duplicate') {
    return { visibility: 'rejected', reason: 'Duplicate of an existing record.' };
  }
  if (params.risk.blocked) {
    return { visibility: 'withheld', reason: 'Risk rules blocked publication pending review.' };
  }
  if (!params.zeroCapital) {
    return { visibility: 'rejected', reason: 'Requires up-front capital.' };
  }
  if (!params.eligibility.eligible) {
    return { visibility: 'rejected', reason: 'Fails a gating eligibility check.' };
  }
  if (params.dedupeVerdict === 'possible-duplicate') {
    return { visibility: 'draft', reason: 'Possible duplicate; held for review.' };
  }
  return { visibility: 'published', reason: 'Passed all gates on captured evidence.' };
}

export interface ProcessedCandidate {
  candidate: OpportunityCandidate;
  rejection: RejectionRecord | null;
}

/**
 * Run one candidate through every deterministic stage.
 * Pure with respect to its inputs: the same candidate, source and clock always
 * produce the same assessment.
 */
export function processCandidate(params: {
  candidate: OpportunityCandidate;
  source: SourceDefinition;
  existing: OpportunityCandidate[];
  prefs: EligibilityPreferences;
  weights: ScoringWeights;
  userSkills: string[];
  history: Record<string, number>;
  now: Date;
}): ProcessedCandidate {
  const { candidate, source, existing, prefs, weights, userSkills, history, now } = params;

  const text = [candidate.title, candidate.description, candidate.eligibilityText ?? ''].join(' ');

  // 1. Deduplicate before spending any further work on the record.
  const dedupe = dedupeCandidate(candidate, existing, {});

  // 2. Zero-capital filtering. Sets the tri-state the eligibility engine reads.
  const zeroCapital = assessZeroCapital({
    description: candidate.description,
    additionalText: text,
    assertions: candidate.evidence.assertions
  });
  // The tri-state mirrors the public cost status exactly, so the UI never has to
  // re-derive it: confirmed free -> true, unconfirmed -> unknown, cost -> false.
  const noCapitalRequired: Tri =
    zeroCapital.status === 'capital_required'
      ? false
      : zeroCapital.status === 'confirmed_free'
        ? true
        : 'unknown';

  const staged: OpportunityCandidate = {
    ...candidate,
    noCapitalRequired,
    dedupe,
    zeroCapital,
    trace: [
      ...candidate.trace,
      `dedupe:${dedupe.verdict}`,
      `zero-capital:${zeroCapital.status}`
    ]
  };

  // 3. Eligibility on the evidence we actually captured.
  const eligibility = assessEligibility(staged, prefs, staged.evidence.assertions, now);

  // 4. Risk / trust rules. A blocked candidate never reaches any model.
  const risk = assessRisk({
    title: staged.title,
    provider: staged.provider,
    description: staged.description,
    additionalText: staged.eligibilityText ?? '',
    sourceReliability: source.reliability,
    sourceUrl: staged.sourceUrl,
    directPay: staged.directPay,
    remote: staged.remote,
    rewardMin: staged.reward.min,
    rewardMax: staged.reward.max,
    rewardBasis: staged.reward.basis,
    publishedAt: staged.publishedAt,
    assertions: staged.evidence.assertions
  });

  // 5. Deterministic score.
  const scores = scoreCandidate(
    { candidate: staged, source, zeroCapital, eligibility, risk, userSkills, history, now },
    weights
  );

  const decision = visibilityFor({
    zeroCapital: zeroCapital.zeroCapital,
    eligibility,
    risk,
    dedupeVerdict: dedupe.verdict
  });

  const processed: OpportunityCandidate = {
    ...staged,
    eligibility,
    risk,
    scores,
    visibility: decision.visibility,
    trace: [
      ...staged.trace,
      `eligibility:${eligibility.eligible ? 'pass' : 'fail'}`,
      `risk:${risk.level}${risk.blocked ? '-blocked' : ''}`,
      `rank:${scores.rankScore}`,
      `visibility:${decision.visibility}`
    ]
  };

  if (decision.visibility === 'published' || decision.visibility === 'draft') return { candidate: processed, rejection: null };

  const stage: RejectionRecord['stage'] =
    dedupe.verdict === 'duplicate'
      ? 'dedupe'
      : risk.blocked
        ? 'risk'
        : !zeroCapital.zeroCapital
          ? 'zero-capital'
          : 'eligibility';

  return {
    candidate: processed,
    rejection: {
      candidateId: processed.id,
      sourceId: processed.sourceId,
      stage,
      reasons: [decision.reason, ...eligibility.reasons].slice(0, 6),
      findingCodes: risk.findings.filter(f => f.level !== 'low').map(f => f.code)
    }
  };
}

/** Project a candidate into the Firestore-shaped public record. */
export async function toPublished(candidate: OpportunityCandidate, source: SourceDefinition): Promise<PublishedOpportunity> {
  const snapshot = candidate.evidence.snapshots[0];
  const hash = snapshot ? await evidenceHash(snapshot) : '';

  const status: CapitalStatus = candidate.zeroCapital?.status ?? 'unconfirmed_no_cost_found';
  // Publishing a capital-required record would assert a $0 claim the evidence
  // does not support. Fail loudly instead of downgrading it silently.
  if (status === 'capital_required') {
    throw new Error(`Refusing to publish ${candidate.id}: the source states an up-front cost.`);
  }

  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    sourceItemId: candidate.sourceItemId,
    visibility: 'published',
    title: candidate.title,
    provider: candidate.provider,
    category: candidate.category,
    description: candidate.description,
    sourceUrl: candidate.sourceUrl,
    discoveredAt: candidate.discoveredAt,
    publishedAt: candidate.publishedAt,
    deadline: candidate.deadline,
    rewardMin: candidate.reward.min,
    rewardMax: candidate.reward.max,
    currency: candidate.reward.currency,
    rewardBasis: candidate.reward.basis,
    remote: candidate.remote,
    directPay: candidate.directPay,
    noCvRequired: candidate.noCvRequired,
    zeroCapital: true,
    capitalStatus: status,
    countries: candidate.countries,
    skills: candidate.skills,
    requirements: candidate.requirements,
    paymentMethods: candidate.paymentMethods,
    rankScore: candidate.scores?.rankScore ?? 0,
    trustScore: candidate.scores?.trustScore ?? 0,
    confidence: candidate.scores?.confidence ?? 0,
    riskLevel: candidate.risk?.level ?? 'high',
    evidenceCount: candidate.evidence.assertions.filter(a => a.method !== 'absent').length,
    evidenceHash: hash,
    fingerprint: candidate.dedupe?.fingerprint ?? '',
    attribution: source.attribution,
    requiresLinkBack: source.requiresLinkBack
  };
}

export async function runHunt(input: HuntRunInput): Promise<HuntRunResult> {
  const startedAt = input.now.toISOString();
  const prefs = input.prefs ?? DEFAULT_ELIGIBILITY_PREFERENCES;
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const userSkills = input.userSkills ?? [];
  const history = input.history ?? {};
  const sources = input.sources ?? [];
  const adapters = input.adapters ?? servableAdapters(input.deploymentScope ?? DEFAULT_DEPLOYMENT_SCOPE);
  const scope = input.deploymentScope ?? DEFAULT_DEPLOYMENT_SCOPE;
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as typeof fetch);

  const published: PublishedOpportunity[] = [];
  const drafts: OpportunityCandidate[] = [];
  const processed: OpportunityCandidate[] = [];
  const rejections: RejectionRecord[] = [];
  const sourceRuns: SourceRunRecord[] = [];
  const accepted: OpportunityCandidate[] = [...(input.existing ?? [])];
  const identityIndex = new ListingIndex(accepted);

  let fetched = 0;
  let unknownFields = 0;
  const perSource: PipelineStats['perSource'] = {};

  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available; pass fetchImpl.');
  }

  for (const adapter of adapters) {
    const source = sources.find(s => s.id === adapter.sourceId);
    if (!source) {
      sourceRuns.push({
        sourceId: adapter.sourceId,
        startedAt,
        finishedAt: input.now.toISOString(),
        ok: false,
        httpStatus: 0,
        bytes: 0,
        itemsSeen: 0,
        accepted: 0,
        rejected: 0,
        error: 'Adapter has no registry entry; refusing to run it.',
        skippedForInterval: false
      });
      continue;
    }

    if (!isSourceServable(source, scope) && input.adapters) {
      // An explicitly injected adapter still has to belong to a servable source
      // for this scope.
      sourceRuns.push({
        sourceId: source.id,
        startedAt,
        finishedAt: input.now.toISOString(),
        ok: false,
        httpStatus: 0,
        bytes: 0,
        itemsSeen: 0,
        accepted: 0,
        rejected: 0,
        error:
          sourceScopeProblem(source, scope) ?? source.disabledReason ?? 'Source is not servable',
        skippedForInterval: false
      });
      continue;
    }

    const lastRun = input.lastRunBySource?.[source.id] ?? null;
    if (!input.force && !isDueForCrawl(source, lastRun, input.now)) {
      sourceRuns.push({
        sourceId: source.id,
        startedAt,
        finishedAt: input.now.toISOString(),
        ok: true,
        httpStatus: 0,
        bytes: 0,
        itemsSeen: 0,
        accepted: 0,
        rejected: 0,
        error: null,
        skippedForInterval: true
      });
      perSource[source.id] = { fetched: 0, accepted: 0, rejected: 0, error: null };
      continue;
    }

    const result = await adapter.run({
      fetchImpl,
      now: () => input.now,
      userAgent: input.userAgent,
      timeoutMs: input.timeoutMs
    });

    let sourceAccepted = 0;
    let sourceRejected = 0;
    fetched += result.itemsSeen;

    for (const candidate of result.candidates) {
      unknownFields += unknownFieldCount(candidate.evidence.assertions);
      const { candidate: processedCandidate, rejection } = processCandidate({
        candidate,
        source,
        existing: identityIndex.neighbors(candidate),
        prefs,
        weights,
        userSkills,
        history,
        now: input.now
      });
      processed.push(processedCandidate);

      if (rejection) {
        rejections.push(rejection);
        sourceRejected += 1;
        continue;
      }

      if (processedCandidate.visibility === 'published') {
        published.push(await toPublished(processedCandidate, source));
      } else {
        drafts.push(processedCandidate);
      }
      accepted.push(processedCandidate);
      identityIndex.add(processedCandidate);
      sourceAccepted += 1;
    }

    perSource[source.id] = {
      fetched: result.itemsSeen,
      accepted: sourceAccepted,
      rejected: sourceRejected,
      error: result.error
    };

    sourceRuns.push({
      sourceId: source.id,
      startedAt,
      finishedAt: input.now.toISOString(),
      ok: result.ok,
      httpStatus: result.httpStatus,
      bytes: result.bytes,
      itemsSeen: result.itemsSeen,
      accepted: sourceAccepted,
      rejected: sourceRejected,
      error: result.error,
      skippedForInterval: false
    });
  }

  published.sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));

  return {
    published,
    drafts,
    processed,
    rejections,
    sourceRuns,
    dormant: dormantAdapters(scope).map(({ source, reason }) => ({
      sourceId: source.id,
      reason
    })),
    stats: {
      fetched,
      accepted: published.length + drafts.length,
      rejected: rejections.length,
      duplicates: rejections.filter(r => r.stage === 'dedupe').length,
      unknownFields,
      perSource,
      startedAt,
      finishedAt: input.now.toISOString()
    }
  };
}

/**
 * Collapse duplicates that appeared inside one run (two sources reposting the
 * same job). Keeps the richer record and returns both lists.
 */
export function collapseDuplicates(candidates: OpportunityCandidate[]): {
  kept: OpportunityCandidate[];
  dropped: { dropped: OpportunityCandidate; keptId: string; reason: string }[];
} {
  const kept: OpportunityCandidate[] = [];
  const dropped: { dropped: OpportunityCandidate; keptId: string; reason: string }[] = [];

  for (const candidate of candidates) {
    const clash = kept.find(
      k =>
        (k.dedupe?.fingerprint && k.dedupe.fingerprint === candidate.dedupe?.fingerprint) ||
        k.sourceItemId === candidate.sourceItemId
    );
    if (!clash) {
      kept.push(candidate);
      continue;
    }
    const { keep, drop, reason } = preferCanonical(clash, candidate);
    if (keep === candidate) {
      const index = kept.indexOf(clash);
      kept[index] = candidate;
    }
    dropped.push({ dropped: drop, keptId: keep.id, reason });
  }

  return { kept, dropped };
}
