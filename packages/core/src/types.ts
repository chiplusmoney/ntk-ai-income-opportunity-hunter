/**
 * Hunter domain types.
 *
 * Core rule: facts come from evidence, never from inference.
 * Any field the pipeline could not establish from a captured source record is
 * `unknown` / `null` — never a guess, never an AI-completed value.
 */

/** A three-valued fact. `unknown` must never be silently coerced to false. */
export type Tri = true | false | 'unknown';

export type OpportunityCategory =
  | 'Development'
  | 'AI Training'
  | 'Design'
  | 'Testing'
  | 'Research'
  | 'Writing'
  | 'Web3'
  | 'Bounty'
  | 'Grant'
  | 'Microtask'
  | 'Competition'
  | 'Other';

/** Product priority order (V1 spec §Priority order). Lower rank = served first. */
export interface CategoryPolicy {
  category: OpportunityCategory;
  /** 1 = highest product priority. */
  priority: number;
  /** Competitions are hidden by default in V1. */
  hiddenByDefault: boolean;
}

export type SourceKind = 'jobs-api' | 'bounty-api' | 'rss' | 'hackathon-api' | 'manual';

export type SourceAccess = 'public-api' | 'public-rss' | 'manual-only';

/**
 * Who the deployment serves.
 *
 * A source can be fine to read for one person and NOT fine to redistribute to
 * the public, so the two are separate questions in the registry rather than one
 * boolean. The default everywhere is `public`, because that is the stricter
 * reading: a source only serves a multi-user deployment when its terms were
 * verified for that audience.
 */
export type DeploymentScope = 'personal' | 'public';

/** Scope used unless a caller explicitly narrows it. */
export const DEFAULT_DEPLOYMENT_SCOPE: DeploymentScope = 'public';

/**
 * Where the `permittedUse` statement came from.
 *
 * This matters: a term we read verbatim out of the provider's own response is
 * much stronger evidence than a term we assumed. Anything not actually read is
 * recorded as `unverified` and the source stays switched off.
 */
export type TermsSource =
  /** Provider embeds its API terms in the response body itself. */
  | 'api-payload-legal-notice'
  /** Provider publishes terms in feed/response metadata. */
  | 'api-response-metadata'
  /** Terms read from the provider's own published documentation page. */
  | 'provider-documentation'
  /** Only measured behaviour (e.g. live rate-limit headers); no terms text read. */
  | 'live-probe-only'
  /** Nothing verified yet. Forces `enabled: false`. */
  | 'unverified';

/**
 * A registry entry describing a real, licensed-to-read upstream feed.
 *
 * Every entry here was probed with a live HTTP request before being written
 * down; `verifiedAt` and `termsSource` record how much of it we actually saw.
 * A source is only `enabled` when an adapter exists AND its terms were read.
 */
export interface SourceDefinition {
  id: string;
  name: string;
  kind: SourceKind;
  access: SourceAccess;
  homepage: string;
  /** Endpoint queried by the adapter. */
  endpoint: string;
  /** Attribution string that must accompany any republished item. */
  attribution: string;
  /** Statement of what we may do with the data, limited to what we verified. */
  permittedUse: string;
  /** Provenance of `permittedUse`. */
  termsSource: TermsSource;
  /** True only when the provider's terms were actually read, not inferred. */
  termsReviewed: boolean;
  /** ISO date of the last live probe that confirmed this entry. */
  verifiedAt: string | null;
  /** Link-back required by the provider terms. */
  requiresLinkBack: boolean;
  /**
   * Minimum minutes between crawls of this endpoint.
   * Set from the provider's own stated request guidance where it gives any
   * (Remotive asks for a maximum of ~4 requests/day), otherwise a polite floor.
   */
  minIntervalMinutes: number;
  /** True when a working adapter exists under `src/sources/adapters`. */
  adapterImplemented: boolean;
  enabled: boolean;
  /**
   * Whether the verified terms also cover displaying this source's items to
   * multiple users. Separate from `enabled`, which is only about the read.
   */
  publicDeploymentAllowed: boolean;
  /**
   * Present when `publicDeploymentAllowed` is false: the exact condition that
   * would lift the restriction. Required so "off" is never a dead end.
   */
  publicDeploymentGate?: string;
  /** Why the source is off. Present whenever `enabled` is false. */
  disabledReason?: string;
  /** Baseline reliability used by the trust model, 0..100. */
  reliability: number;
  /** Whether the feed is expected to carry direct-pay work. */
  directPayExpected: Tri;
  /** Markets this feed is strongest in; used only for display context, not eligibility. */
  marketHints: string[];
  notes?: string;
}

/** Outcome of one adapter run against one source. */
export interface SourceFetchResult {
  sourceId: string;
  ok: boolean;
  httpStatus: number;
  error: string | null;
  /** Bytes actually received, retained for the run record. */
  bytes: number;
  candidates: OpportunityCandidate[];
  /** Items seen in the payload before any per-item parsing. */
  itemsSeen: number;
  /** Items that could not be parsed at all, with the reason. */
  skipped: { reason: string; ref: string }[];
  fetchedAt: string;
}

/** Raw bytes we actually pulled, retained so any claim can be re-derived. */
export interface EvidenceSnapshot {
  sourceId: string;
  sourceUrl: string;
  fetchedAt: string;
  /** SHA-256 of the fetched payload, hex. */
  contentHash: string;
  /** Size of the fetched payload in bytes. */
  bytes: number;
  httpStatus: number;
  /** Verbatim excerpt actually used for extraction (bounded, never invented). */
  excerpt: string;
}

/** One extracted claim, always traceable to a snapshot. */
export interface EvidenceAssertion {
  /** Field path on the candidate this assertion supports, e.g. `reward.min`. */
  field: string;
  value: string | number | boolean | null;
  /** How the value was obtained. */
  method: 'structured-field' | 'text-pattern' | 'absent';
  /** Snapshot index this came from, or null when the field was simply absent. */
  snapshotIndex: number | null;
  /** Verbatim text the value was read from, when available. */
  text?: string;
  confidence: number;
}

export interface NormalizedReward {
  min: number | null;
  max: number | null;
  currency: string | null;
  /** How often the amount is paid. */
  basis: 'one-off' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'unknown';
  /** Verbatim reward text from the source, retained for audit. */
  raw: string | null;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFinding {
  code: string;
  level: RiskLevel;
  /** Points removed by this finding from the trust score. */
  penalty: number;
  message: string;
  /** Text or field that triggered the finding. */
  evidence: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  /** 0..100, higher = safer. */
  trustScore: number;
  findings: RiskFinding[];
  /** Hard-blocking findings; a candidate with any of these is never published. */
  blocked: boolean;
}

export interface EligibilityCheck {
  id: string;
  label: string;
  /** Tri-state: `unknown` never blocks, it records missing evidence. */
  passed: Tri;
  detail: string;
  /**
   * True when this check can make a candidate ineligible.
   * Only a positively FAILED blocking check rejects; `unknown` never does.
   */
  blocking: boolean;
}

export interface EligibilityAssessment {
  eligible: boolean;
  /** True when some checks are unknown, whether or not the candidate is eligible. */
  needsMoreEvidence: boolean;
  checks: EligibilityCheck[];
  /** Reasons a user-facing "why this is shown / hidden" summary. */
  reasons: string[];
  /** Ids of the blocking checks that actually failed. */
  blockingCheckIds: string[];
  /** True when a blocking check failed (as opposed to a soft preference miss). */
  ineligible: boolean;
}

export interface ZeroCapitalAssessment {
  /** True when nothing in the posting requires the applicant to pay. */
  zeroCapital: boolean;
  /**
   * Durable, public-facing cost status. This is the field the UI and the
   * published contract must use, because "no cost mentioned" is not the same
   * claim as "the source says it is free".
   *
   *  - `confirmed_free`             the source states no up-front payment is required
   *  - `unconfirmed_no_cost_found`  nothing about cost was found either way
   *  - `capital_required`           a payment from the applicant is stated
   */
  status: CapitalStatus;
  /**
   * Amount of money the applicant must put up.
   * `0` ONLY when the source positively states no payment is required;
   * `null` when the posting simply never mentions cost (unconfirmed, not free).
   */
  upfrontCostUsd: number | null;
  /** True only when the source positively states there is no up-front payment. */
  costConfirmed: boolean;
  signals: string[];
  evidence: string[];
}

/**
 * The only three cost states the product may show a user.
 * Capital-required opportunities stay excluded by the default zero-capital
 * policy, so `capital_required` never reaches a published record.
 */
export type CapitalStatus = 'confirmed_free' | 'unconfirmed_no_cost_found' | 'capital_required';

export interface DeterministicScores {
  /** 0..100 product-fit score, deterministic and reproducible. */
  rankScore: number;
  trustScore: number;
  confidence: number;
  components: ScoreComponent[];
}

export interface ScoreComponent {
  key: string;
  raw: number;
  weight: number;
  /** Contribution after weighting. */
  weighted: number;
  note: string;
}

export type DedupeVerdict = 'unique' | 'duplicate' | 'possible-duplicate';
export type CanonicalPreference = 'richer' | 'equivalent' | 'first-seen';

export interface DedupeResult {
  verdict: DedupeVerdict;
  /** Fingerprint used for exact matching. */
  fingerprint: string;
  /** Simpler key used for near matching. */
  normalizedKey: string;
  /** Id of the record this candidate matched, when any. */
  matchedId: string | null;
  /** 0..1 similarity against `matchedId`. */
  similarity: number;
  reason: string;
}

export type Visibility = 'draft' | 'published' | 'rejected' | 'withheld';

/**
 * A candidate as it moves through the pipeline. Fields stay null until a
 * source actually established them.
 */
export interface OpportunityCandidate {
  id: string;
  sourceId: string;
  /** Stable per-source identity; used to detect the same posting re-crawled. */
  sourceItemId: string;
  title: string;
  provider: string;
  category: OpportunityCategory;
  description: string;
  sourceUrl: string;
  discoveredAt: string;
  publishedAt: string | null;

  reward: NormalizedReward;

  remote: Tri;
  directPay: Tri;
  noCvRequired: Tri;
  /** Derived, not scraped: see zero-capital filtering. */
  noCapitalRequired: Tri;

  /** ISO-3166 alpha-2 codes, or ['GLOBAL'] when the source states worldwide. */
  countries: string[];
  /** Free-text eligibility exactly as the source stated it. */
  eligibilityText: string | null;

  skills: string[];
  requirements: string[];
  paymentMethods: string[];
  deadline: string | null;

  /** True when the product categorises this as a competition-type listing. */
  competition: boolean;

  evidence: {
    snapshots: EvidenceSnapshot[];
    assertions: EvidenceAssertion[];
  };

  /** Populated by the pipeline stages. */
  zeroCapital: ZeroCapitalAssessment | null;
  eligibility: EligibilityAssessment | null;
  risk: RiskAssessment | null;
  scores: DeterministicScores | null;
  dedupe: DedupeResult | null;
  visibility: Visibility;
  /** Human-readable pipeline trace, newest last. */
  trace: string[];
}

/** Public, Firestore-shaped record produced from an accepted candidate. */
export interface PublishedOpportunity {
  id: string;
  sourceId: string;
  sourceItemId: string;
  visibility: 'published';
  title: string;
  provider: string;
  category: OpportunityCategory;
  description: string;
  sourceUrl: string;
  discoveredAt: string;
  publishedAt: string | null;
  deadline: string | null;

  rewardMin: number | null;
  rewardMax: number | null;
  currency: string | null;
  rewardBasis: NormalizedReward['basis'];

  remote: Tri;
  directPay: Tri;
  noCvRequired: Tri;
  /**
   * Default-policy filter flag: true for every published record, because a
   * capital-required candidate is never published. Kept alongside
   * `capitalStatus` so the common query stays a single indexed equality filter.
   */
  zeroCapital: true;
  /** The durable cost claim shown to the user. Never collapse these. */
  capitalStatus: Exclude<CapitalStatus, 'capital_required'>;

  countries: string[];
  skills: string[];
  requirements: string[];
  paymentMethods: string[];

  rankScore: number;
  trustScore: number;
  confidence: number;
  riskLevel: RiskLevel;

  evidenceCount: number;
  evidenceHash: string;
  fingerprint: string;
  attribution: string;
  requiresLinkBack: boolean;
}

export interface PipelineStats {
  fetched: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  unknownFields: number;
  perSource: Record<string, { fetched: number; accepted: number; rejected: number; error: string | null }>;
  startedAt: string;
  finishedAt: string;
}

/** Why a candidate never reached `published`. */
export interface RejectionRecord {
  candidateId: string;
  sourceId: string;
  /** Pipeline stage that stopped it. */
  stage: 'dedupe' | 'zero-capital' | 'eligibility' | 'risk';
  reasons: string[];
  /** Findings that triggered the stop, when the stage produced any. */
  findingCodes: string[];
}

/** One scheduled crawl of one source, as recorded for audit. */
export interface SourceRunRecord {
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  httpStatus: number;
  bytes: number;
  itemsSeen: number;
  accepted: number;
  rejected: number;
  error: string | null;
  /** True when the run was skipped because the source interval had not elapsed. */
  skippedForInterval: boolean;
}
