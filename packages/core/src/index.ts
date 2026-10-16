/**
 * @ntk/hunter-core — the deterministic domain core of the NTK AI Income
 * Opportunity Hunter.
 *
 * ## The one rule
 * Facts come from evidence. This package discovers nothing by inference: every
 * value it publishes is traceable to a snapshot of bytes it actually fetched,
 * or it is reported as `unknown`.
 *
 * ## Layers
 *  - `types`      the domain contract (tri-state facts, evidence records).
 *  - `evidence`   fetch snapshots, content hashes and assertions.
 *  - `reward`     conservative pay parsing across the real provider formats.
 *  - `sources`    the registry of real feeds and one adapter per feed.
 *  - `pipeline`   dedupe -> zero-capital -> eligibility -> risk -> score.
 *
 * ## What is NOT here
 * No AI, no network calls at import time, no clock reads. `runHunt` takes an
 * injected `fetch` and clock so a whole run can be replayed byte for byte.
 */
export * from './types.js';
export {
  htmlToText,
  excerpt,
  sha256Hex,
  createSnapshot,
  assertion,
  absentAssertion,
  mergeEvidence,
  evidenceHash,
  unknownFieldCount,
  isEstablished
} from './evidence/index.js';
export {
  parseRewardText,
  parseNumericToken,
  detectCurrency,
  isUsd,
  toHourlyEquivalent,
  rewardBasisHours
} from './reward.js';
export type { RewardParseOptions } from './reward.js';
export * from './sources/index.js';
export * from './pipeline/index.js';
export * from './persistence/index.js';
export * from './ai/index.js';
export * from './notifications/index.js';
export * from './applications/index.js';
export * from './personalization/index.js';
