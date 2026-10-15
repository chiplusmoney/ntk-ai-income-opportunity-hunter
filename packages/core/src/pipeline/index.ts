/**
 * Deterministic pipeline stages, in the order the hunter runs them.
 *
 * Nothing in this folder may read a clock, the network or a model. Time comes
 * in as an argument; facts come from evidence.
 */
export { assessZeroCapital, extractAmount } from './zeroCapital.js';
export type { CostSignal } from './zeroCapital.js';
export { CAPITAL_STATUS_LABELS, capitalStatusLabel, isCapitalRequired } from '../capitalStatus.js';
export {
  assessEligibility,
  normalizeCountries,
  DEFAULT_ELIGIBILITY_PREFERENCES
} from './eligibility.js';
export type { EligibilityPreferences, EligibilityCandidate } from './eligibility.js';
export { assessRisk, RISK_RULES } from './risk.js';
export type { RiskInput } from './risk.js';
export { dedupeCandidate, fingerprintOf, normalizedKeyOf, normalizeProvider, normalizeText, preferCanonical, similarityBetween, tokenize } from './dedupe.js';
export type { DedupeOptions } from './dedupe.js';
export {
  scoreCandidate,
  confidenceOf,
  componentKeys,
  DEFAULT_WEIGHTS
} from './scoring.js';
export type { ScoreInput, ScoringWeights, ScoringResult } from './scoring.js';
export { runHunt, processCandidate, toPublished, collapseDuplicates } from './run.js';
export type { HuntRunInput, HuntRunResult, ProcessedCandidate } from './run.js';
