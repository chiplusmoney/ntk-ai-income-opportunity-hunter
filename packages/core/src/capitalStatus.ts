import type { CapitalStatus } from './types.js';

/**
 * The single place that decides how a cost status is worded.
 *
 * Rule: never turn "we found no cost" into "$0". Those are different claims and
 * only one of them is supported by evidence, so they get different sentences
 * everywhere they appear — UI, notifications, API payloads.
 */
export const CAPITAL_STATUS_LABELS: Record<CapitalStatus, { short: string; long: string }> = {
  confirmed_free: {
    short: 'Confirmed $0 upfront',
    long: 'The source states that no up-front payment is required.'
  },
  unconfirmed_no_cost_found: {
    short: 'No upfront cost found — verify before proceeding',
    long: 'No up-front cost was found in this posting, but the source does not state that it is free. Treat this as unconfirmed.'
  },
  capital_required: {
    short: 'Upfront payment required',
    long: 'The source states a payment the applicant must make. Excluded by the default zero-capital policy.'
  }
};

export function capitalStatusLabel(status: CapitalStatus, style: 'short' | 'long' = 'short'): string {
  return CAPITAL_STATUS_LABELS[status][style];
}

/** True only for the status the default policy excludes. */
export function isCapitalRequired(status: CapitalStatus): boolean {
  return status === 'capital_required';
}
