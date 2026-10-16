import type { OpportunityCategory, RiskLevel } from '../types.js';

/**
 * Application and outcome lifecycle.
 *
 * `Discovered → Verified → Recommended → Saved → Applied → Accepted →
 * InProgress → Submitted → Paid | Rejected | Expired`
 *
 * The first three states are produced by the pipeline; the rest are the user's
 * own record of what happened. Two rules are enforced here:
 *
 *  1. **Only real transitions.** A state machine, not a free-text status, so a
 *     document cannot claim an application was paid when it was never applied.
 *  2. **No invented earnings.** A payment is recorded only with an amount and a
 *     date the user supplied; nothing is estimated, and an unrecorded payment
 *     stays `null` rather than `0`.
 */

export const APPLICATION_STATES = [
  'discovered',
  'verified',
  'recommended',
  'saved',
  'preparing',
  'applied',
  'accepted',
  'in_progress',
  'submitted',
  'paid',
  'rejected',
  'expired',
  'withdrawn'
] as const;

export type ApplicationState = (typeof APPLICATION_STATES)[number];

/** Legal next states, keyed by current state. */
export const ALLOWED_TRANSITIONS: Record<ApplicationState, ApplicationState[]> = {
  discovered: ['verified', 'expired'],
  verified: ['recommended', 'expired'],
  recommended: ['saved', 'expired'],
  saved: ['preparing', 'applied', 'rejected', 'expired', 'withdrawn'],
  preparing: ['applied', 'rejected', 'expired', 'withdrawn'],
  applied: ['accepted', 'rejected', 'expired', 'withdrawn'],
  accepted: ['in_progress', 'rejected', 'withdrawn'],
  in_progress: ['submitted', 'rejected', 'withdrawn'],
  submitted: ['paid', 'rejected', 'withdrawn'],
  // Terminal states: recorded history is not rewritten.
  paid: [],
  rejected: [],
  expired: [],
  withdrawn: []
};

export function isTerminal(state: ApplicationState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

export function canTransition(from: ApplicationState, to: ApplicationState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface PaymentRecord {
  /** Amount actually received, in USD. Null when nothing has been received yet. */
  paidUsd: number | null;
  /** ISO date the payment arrived. Null while unpaid. */
  paidAt: string | null;
  /** How it was received, as the user recorded it. Never inferred. */
  method: string | null;
}

export interface ApplicationRecord {
  id: string;
  opportunityId: string;
  title: string;
  provider: string;
  category: OpportunityCategory;
  riskLevel: RiskLevel;
  /** Rank at the time it was saved, kept so a later rescore does not rewrite history. */
  rankScoreAtSave: number;
  state: ApplicationState;
  /** ISO timestamp of each transition, newest last. */
  history: { state: ApplicationState; at: string }[];
  appliedAt: string | null;
  /** What the user expects to be paid. Null when unknown. */
  expectedRewardUsd: number | null;
  /** Currency of the expected reward, as the user entered it. */
  expectedCurrency: string | null;
  payment: PaymentRecord;
  notes: string;
  sourceUrl: string;
  attribution: string;
  updatedAt: string;
  nextAction?: string;
  followUpDate?: string | null;
  attachedProof?: string[];
  outcomeReason?: string;
}

export const EMPTY_PAYMENT: PaymentRecord = { paidUsd: null, paidAt: null, method: null };

export interface TransitionRequest {
  to: ApplicationState;
  now: Date;
  /** Notes appended by this transition, if any. */
  note?: string;
  /** Payment details, required when moving to `paid`. */
  payment?: { paidUsd: number; paidAt: string; method?: string | null };
  /** Expected reward, optionally recorded at any transition. */
  expectedRewardUsd?: number | null;
  expectedCurrency?: string | null;
}

export interface TransitionResult {
  ok: boolean;
  record: ApplicationRecord;
  problems: string[];
}

/**
 * Apply a transition, or explain why it cannot be applied.
 * The record is returned unchanged when the transition is refused.
 */
export function applyTransition(record: ApplicationRecord, request: TransitionRequest): TransitionResult {
  const problems: string[] = [];

  if (record.state === request.to) {
    return { ok: false, record, problems: [`already in state "${record.state}"`] };
  }
  if (!canTransition(record.state, request.to)) {
    return {
      ok: false,
      record,
      problems: [`"${record.state}" cannot move directly to "${request.to}"`]
    };
  }

  const at = request.now.toISOString();
  let payment = record.payment;
  let appliedAt = record.appliedAt;

  if (request.to === 'applied') {
    appliedAt = at;
  }

  if (request.to === 'paid') {
    const supplied = request.payment;

    // A payment is only ever what the user recorded: never estimated, never
    // defaulted. Each refusal is explicit about what is missing.
    if (!supplied) {
      return {
        ok: false,
        record,
        problems: ['recording a payment requires an amount and a date provided by the user']
      };
    }
    if (typeof supplied.paidUsd !== 'number' || !Number.isFinite(supplied.paidUsd) || supplied.paidUsd <= 0) {
      return { ok: false, record, problems: ['the recorded payment amount must be a positive number'] };
    }
    if (typeof supplied.paidAt !== 'string' || !supplied.paidAt || !Number.isFinite(Date.parse(supplied.paidAt))) {
      return { ok: false, record, problems: ['recording a payment requires a valid payment date'] };
    }
    if (Date.parse(supplied.paidAt) > request.now.getTime()) return { ok: false, record, problems: ['payment date cannot be in the future'] };
    if (supplied.method != null && (typeof supplied.method !== 'string' || supplied.method.length > 100)) return { ok:false,record,problems:['payment method must be short text'] };

    payment = {
      paidUsd: supplied.paidUsd,
      paidAt: supplied.paidAt,
      method: supplied.method ?? null
    };
  }

  if (isTerminal(request.to) && request.to !== 'paid' && payment.paidUsd !== null) {
    // A paid application that is later marked rejected would rewrite received
    // money out of the record; refuse rather than contradict the user's ledger.
    problems.push(`cannot mark an application "${request.to}" after a payment was recorded`);
    return { ok: false, record, problems };
  }

  const expectedRewardUsd =
    request.expectedRewardUsd !== undefined ? request.expectedRewardUsd : record.expectedRewardUsd;
  const expectedCurrency =
    request.expectedCurrency !== undefined ? request.expectedCurrency : record.expectedCurrency;

  if (expectedRewardUsd !== null && (!Number.isFinite(expectedRewardUsd) || expectedRewardUsd < 0)) {
    return { ok: false, record, problems: ['expected reward must be a non-negative number or null'] };
  }

  const notes = request.note ? (record.notes ? `${record.notes}\n${request.note}` : request.note) : record.notes;

  return {
    ok: true,
    problems: [],
    record: {
      ...record,
      state: request.to,
      history: [...record.history, { state: request.to, at }],
      appliedAt,
      payment,
      expectedRewardUsd,
      expectedCurrency,
      notes,
      updatedAt: at
    }
  };
}

/** Create the initial record for a discovery-stage candidate. */
export function createApplicationRecord(params: {
  id: string;
  opportunityId: string;
  title: string;
  provider: string;
  category: OpportunityCategory;
  riskLevel: RiskLevel;
  rankScore: number;
  sourceUrl: string;
  attribution: string;
  now: Date;
}): ApplicationRecord {
  const at = params.now.toISOString();
  return {
    id: params.id,
    opportunityId: params.opportunityId,
    title: params.title,
    provider: params.provider,
    category: params.category,
    riskLevel: params.riskLevel,
    rankScoreAtSave: params.rankScore,
    state: 'saved',
    history: [{ state: 'saved', at }],
    appliedAt: null,
    expectedRewardUsd: null,
    expectedCurrency: null,
    payment: { ...EMPTY_PAYMENT },
    notes: '',
    sourceUrl: params.sourceUrl,
    attribution: params.attribution,
    updatedAt: at
  };
}

export interface EarningsSummary {
  /** Applications that reached `paid`. */
  paidCount: number;
  /** Sum of recorded payments. Zero only when nothing has been recorded. */
  totalPaidUsd: number;
  /** Applications with a recorded payment amount, used to state coverage. */
  withPaymentRecorded: number;
  /** Expected totals, kept separate from actuals on purpose. */
  totalExpectedUsd: number;
  /** True when at least one paid application has a recorded amount. */
  hasRecordedIncome: boolean;
}

/**
 * Summarise recorded outcomes.
 *
 * Deliberately does NOT project future earnings or annualise anything: the
 * numbers are what the user recorded, and `hasRecordedIncome` lets the UI say
 * "no income recorded yet" instead of showing a misleading 0.
 */
export function summariseEarnings(records: ApplicationRecord[]): EarningsSummary {
  const paid = records.filter(record => record.state === 'paid');
  const withPayment = records.filter(record => record.payment.paidUsd !== null);
  const totalPaidUsd = withPayment.reduce((sum, record) => sum + (record.payment.paidUsd ?? 0), 0);
  const totalExpectedUsd = records.reduce((sum, record) => sum + (record.expectedRewardUsd ?? 0), 0);

  return {
    paidCount: paid.length,
    totalPaidUsd: Math.round(totalPaidUsd * 100) / 100,
    withPaymentRecorded: withPayment.length,
    totalExpectedUsd: Math.round(totalExpectedUsd * 100) / 100,
    hasRecordedIncome: withPayment.length > 0
  };
}

/** State of a saved record for the tracker UI, in the order the pipeline produces. */
export function progressIndex(state: ApplicationState): number {
  const order: ApplicationState[] = ['saved', 'applied', 'accepted', 'in_progress', 'submitted', 'paid'];
  const index = order.indexOf(state);
  if (index >= 0) return index;
  // rejected and expired are off-track states, reported at their own step.
  return state === 'rejected' || state === 'expired' ? 1 : 0;
}
