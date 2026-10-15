import { categoryPriority } from '../sources/registry.js';
import { toHourlyEquivalent, rewardBasisHours } from '../reward.js';
import type {
  DeterministicScores,
  EligibilityAssessment,
  OpportunityCandidate,
  RiskAssessment,
  ScoreComponent,
  SourceDefinition,
  ZeroCapitalAssessment
} from '../types.js';

/**
 * Deterministic scoring.
 *
 * Rules that make this reproducible:
 *  - No clocks, randomness, network or AI. `now` is passed in.
 *  - Every component returns 0..100, is multiplied by a fixed weight and the
 *    weights sum to exactly 1, so the unpenalised maximum is 100.
 *  - Rounding happens once, at the end.
 *  - Every component carries a `note` explaining the value, so a score can be
 *    explained without re-running the pipeline.
 *
 * The reward comparison uses documented, fixed assumptions (see
 * `reward.ts#toHourlyEquivalent`) purely to compare postings against each
 * other. It is a product judgement, not a claim about the posting.
 *
 * Currencies other than USD are scored on a lower, capped band rather than
 * converted, because no FX rate is available from evidence.
 */

export interface ScoringWeights {
  sourceReliability: number;
  directPayCertainty: number;
  eligibilityConfidence: number;
  zeroCapital: number;
  rewardValue: number;
  skillMatch: number;
  competitionLevel: number;
  freshness: number;
  effort: number;
  history: number;
  /** Share of the trust deficit subtracted from the final rank score. */
  riskPenalty: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  sourceReliability: 0.14,
  directPayCertainty: 0.12,
  eligibilityConfidence: 0.12,
  zeroCapital: 0.16,
  rewardValue: 0.16,
  skillMatch: 0.1,
  competitionLevel: 0.06,
  freshness: 0.06,
  effort: 0.04,
  history: 0.04,
  riskPenalty: 0.15
};

export interface ScoreInput {
  candidate: OpportunityCandidate;
  source: SourceDefinition;
  zeroCapital: ZeroCapitalAssessment;
  eligibility: EligibilityAssessment;
  risk: RiskAssessment;
  /** Skills the user selected, lower-cased for comparison. */
  userSkills?: string[];
  /**
   * Historic success rate per source id or category, 0..1.
   * Absent means "no history yet" and scores neutral.
   */
  history?: Record<string, number>;
  now: Date;
}

/** Clamp to an integer 0..100. */
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function component(key: string, raw: number, weight: number, note: string): ScoreComponent {
  return {
    key,
    raw: Math.round(clampScore(raw) * 100) / 100,
    weight,
    weighted: Math.round(clampScore(raw) * weight * 10000) / 10000,
    note
  };
}

/** Hourly-equivalent bands used to compare pay across postings. */
const HOURLY_BANDS: { min: number; score: number; label: string }[] = [
  { min: 60, score: 100, label: '≥ $60/h equivalent' },
  { min: 40, score: 92, label: '$40-60/h equivalent' },
  { min: 25, score: 82, label: '$25-40/h equivalent' },
  { min: 15, score: 70, label: '$15-25/h equivalent' },
  { min: 8, score: 56, label: '$8-15/h equivalent' },
  { min: 3, score: 40, label: '$3-8/h equivalent' },
  { min: 0, score: 25, label: 'below $3/h equivalent' }
];

function rewardComponent(candidate: OpportunityCandidate, weight: number): ScoreComponent {
  const reward = candidate.reward;
  const hasAmount = reward.min !== null || reward.max !== null;

  if (!hasAmount) {
    return component('rewardValue', 30, weight, 'No reward published in the source; value unscored.');
  }

  const hourly = toHourlyEquivalent(reward);
  const currency = reward.currency;

  // A one-off or period-less amount cannot be compared per hour. It is scored on
  // a capped band and explicitly labelled as not normalised.
  if (hourly === null) {
    if (currency !== null && currency !== 'USD') {
      return component(
        'rewardValue',
        35,
        weight,
        `Reward published in ${currency}; no FX rate in evidence so it is not converted.`
      );
    }
    const hours = rewardBasisHours(reward.basis);
    if (hours === null) {
      const amount = reward.min ?? reward.max ?? 0;
      // A large one-off sum still has value, but it is capped below hourly work.
      const score = amount >= 1000 ? 60 : amount >= 500 ? 52 : amount >= 100 ? 44 : 34;
      return component(
        'rewardValue',
        score,
        weight,
        `One-off amount of ${amount} ${currency ?? ''} with no stated period; scored on a capped band, not as an hourly rate.`
      );
    }
  }

  const perHour = hourly ?? 0;
  const band = HOURLY_BANDS.find(b => perHour >= b.min) ?? HOURLY_BANDS[HOURLY_BANDS.length - 1];
  return component(
    'rewardValue',
    band?.score ?? 25,
    weight,
    `${band?.label ?? 'unbanded'} (stated ${reward.min ?? '?'}-${reward.max ?? '?'} ${currency ?? ''} ${reward.basis}).`
  );
}

function directPayComponent(candidate: OpportunityCandidate, weight: number): ScoreComponent {
  if (candidate.directPay === true) {
    return component('directPayCertainty', 100, weight, 'Source states payment for delivered work.');
  }
  if (candidate.directPay === false) {
    return component('directPayCertainty', 0, weight, 'Reward is a prize or a non-payment benefit, not a fee.');
  }
  return component('directPayCertainty', 45, weight, 'Payment route not stated; treated as unconfirmed, not as absent.');
}

function eligibilityComponent(
  candidate: OpportunityCandidate,
  eligibility: EligibilityAssessment,
  weight: number
): ScoreComponent {
  const unknownChecks = eligibility.checks.filter(c => c.passed === 'unknown').length;
  const totalChecks = eligibility.checks.length || 1;

  if (!eligibility.eligible) {
    return component('eligibilityConfidence', 0, weight, `Fails gating checks: ${eligibility.reasons.join(' ') || 'see checks'}.`);
  }
  if (eligibility.needsMoreEvidence) {
    const coverage = 1 - unknownChecks / totalChecks;
    return component(
      'eligibilityConfidence',
      55 + coverage * 15,
      weight,
      `Eligible, but ${unknownChecks}/${totalChecks} checks could not be confirmed from evidence.`
    );
  }
  return component('eligibilityConfidence', 100, weight, 'All gating checks passed on captured evidence.');
}

function zeroCapitalComponent(zero: ZeroCapitalAssessment, weight: number): ScoreComponent {
  if (!zero.zeroCapital) {
    return component('zeroCapital', 0, weight, `Requires up-front money: ${zero.evidence[0] ?? 'cost signal found'}.`);
  }
  if (zero.upfrontCostUsd === 0) {
    return component('zeroCapital', 100, weight, 'Source states no up-front payment is required.');
  }
  return component(
    'zeroCapital',
    70,
    weight,
    'No cost language found, but the source never positively states $0 up front.'
  );
}

function skillComponent(candidate: OpportunityCandidate, userSkills: string[], weight: number): ScoreComponent {
  if (!userSkills.length || !candidate.skills.length) {
    return component('skillMatch', 50, weight, 'No skill comparison possible; scored neutral.');
  }
  const wanted = new Set(userSkills.map(s => s.trim().toLowerCase()).filter(Boolean));
  const have = candidate.skills.map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!have.length) return component('skillMatch', 50, weight, 'Posting lists no skills; scored neutral.');

  const overlap = have.filter(s => wanted.has(s)).length;
  if (overlap === 0) {
    return component('skillMatch', 35, weight, 'None of your selected skills appear in the listing.');
  }
  const ratio = overlap / Math.max(1, Math.min(have.length, 6));
  return component(
    'skillMatch',
    60 + ratio * 40,
    weight,
    `${overlap} of your skills matched (${have.filter(s => wanted.has(s)).slice(0, 5).join(', ')}).`
  );
}

function competitionComponent(candidate: OpportunityCandidate, weight: number): ScoreComponent {
  if (candidate.competition) {
    return component('competitionLevel', 25, weight, 'Competitive listing: reward depends on winning.');
  }
  const priority = categoryPriority(candidate.category);
  return component(
    'competitionLevel',
    70 + (10 - Math.min(priority, 10)) * 3,
    weight,
    `Direct award, no competition. Category priority ${priority}.`
  );
}

function freshnessComponent(candidate: OpportunityCandidate, now: Date, weight: number): ScoreComponent {
  const reference = candidate.publishedAt ?? candidate.discoveredAt;
  const parsed = Date.parse(reference);
  if (!Number.isFinite(parsed)) {
    return component('freshness', 50, weight, 'No usable timestamp; scored neutral.');
  }
  const ageDays = (now.getTime() - parsed) / 86_400_000;
  if (ageDays <= 2) return component('freshness', 100, weight, `Published ${ageDays.toFixed(1)} day(s) ago.`);
  if (ageDays <= 7) return component('freshness', 88, weight, `Published ${ageDays.toFixed(1)} days ago.`);
  if (ageDays <= 30) return component('freshness', 72, weight, `Published ${ageDays.toFixed(1)} days ago.`);
  if (ageDays <= 90) return component('freshness', 50, weight, `Published ${ageDays.toFixed(1)} days ago.`);
  return component('freshness', 25, weight, `Published ${ageDays.toFixed(1)} days ago; may be closed.`);
}

function effortComponent(candidate: OpportunityCandidate, weight: number): ScoreComponent {
  const words = candidate.description.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    return component('effort', 50, weight, 'No description captured; effort unknown.');
  }
  // A concise, specific brief is a better use of time than an unbounded one.
  if (words <= 400) return component('effort', 80, weight, `Brief is bounded (${words} words).`);
  if (words <= 1200) return component('effort', 62, weight, `Description is ${words} words.`);
  return component('effort', 45, weight, `Description is very long (${words} words); scope likely large.`);
}

function historyComponent(candidate: OpportunityCandidate, history: Record<string, number>, weight: number): ScoreComponent {
  const bySource = history[candidate.sourceId];
  const byCategory = history[candidate.category];
  if (bySource === undefined && byCategory === undefined) {
    return component('history', 50, weight, 'No outcome history yet for this source or category.');
  }
  const parts = [bySource, byCategory].filter((v): v is number => typeof v === 'number');
  const average = parts.reduce((a, b) => a + b, 0) / parts.length;
  return component(
    'history',
    Math.max(0, Math.min(1, average)) * 100,
    weight,
    `Historic success rate ${(average * 100).toFixed(0)}% for ${bySource !== undefined ? candidate.sourceId : candidate.category}.`
  );
}

export interface ScoringResult extends DeterministicScores {
  /** Score before the risk deduction, for audit. */
  preRiskRankScore: number;
  weights: ScoringWeights;
}

export function scoreCandidate(input: ScoreInput, weights: ScoringWeights = DEFAULT_WEIGHTS): ScoringResult {
  const { candidate, source, zeroCapital, eligibility, risk, now } = input;
  const userSkills = input.userSkills ?? [];
  const history = input.history ?? {};

  const components: ScoreComponent[] = [
    component(
      'sourceReliability',
      source.reliability,
      weights.sourceReliability,
      `${source.name} reliability baseline ${source.reliability}/100 (editorial, not measured).`
    ),
    directPayComponent(candidate, weights.directPayCertainty),
    eligibilityComponent(candidate, eligibility, weights.eligibilityConfidence),
    zeroCapitalComponent(zeroCapital, weights.zeroCapital),
    rewardComponent(candidate, weights.rewardValue),
    skillComponent(candidate, userSkills, weights.skillMatch),
    competitionComponent(candidate, weights.competitionLevel),
    freshnessComponent(candidate, now, weights.freshness),
    effortComponent(candidate, weights.effort),
    historyComponent(candidate, history, weights.history)
  ];

  const weightedSum = components.reduce((sum, c) => sum + c.weighted, 0);
  const preRiskRankScore = clampScore(weightedSum);

  // Risk is a deduction on the final rank, and trust is reported separately so
  // the UI can show "good pay, poor trust" instead of hiding it.
  const riskDeduction = (100 - risk.trustScore) * weights.riskPenalty;
  const rankScore = clampScore(preRiskRankScore - riskDeduction);

  return {
    rankScore: Math.round(rankScore),
    trustScore: Math.round(risk.trustScore),
    confidence: Math.round(confidenceOf(candidate, source)),
    components,
    preRiskRankScore: Math.round(preRiskRankScore),
    weights
  };
}

/**
 * Confidence: how much of this record was actually established.
 * Deliberately independent of the reward size — a big number with no evidence
 * must not look more trustworthy than a small one with evidence.
 */
export function confidenceOf(candidate: OpportunityCandidate, source: SourceDefinition): number {
  const assertions = candidate.evidence.assertions;
  const established = assertions.filter(a => a.method !== 'absent' && a.value !== null).length;
  const coverage = assertions.length === 0 ? 0 : established / assertions.length;

  const snapshotFactor = candidate.evidence.snapshots.length > 0 ? 1 : 0;
  const hasSnapshotHash = candidate.evidence.snapshots.some(s => /^[0-9a-f]{64}$/.test(s.contentHash)) ? 1 : 0;

  const value = 100 * (0.55 * coverage + 0.3 * (source.reliability / 100) + 0.1 * snapshotFactor + 0.05 * hasSnapshotHash);
  return clampScore(value);
}

/** Score components in a stable order for diffing two runs. */
export function componentKeys(): string[] {
  return [
    'sourceReliability',
    'directPayCertainty',
    'eligibilityConfidence',
    'zeroCapital',
    'rewardValue',
    'skillMatch',
    'competitionLevel',
    'freshness',
    'effort',
    'history'
  ];
}
