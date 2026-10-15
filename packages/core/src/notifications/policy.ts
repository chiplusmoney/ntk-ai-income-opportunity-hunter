import type { OpportunityCategory, RiskLevel } from '../types.js';

/**
 * Notification policy.
 *
 * Two rules shape everything here:
 *
 *  1. **Urgency decides the cadence.** Something that will still be there
 *     tomorrow does not deserve a push at 3am. High-value, direct-pay and
 *     deadline-driven items go out immediately; everything else waits for a
 *     digest.
 *  2. **A notification is not an evidence document.** Payloads carry an
 *     identifier, a title, a score and a link — never a credential, never a raw
 *     source payload, never an unbounded evidence excerpt. The recipient opens
 *     the app to see the evidence, which is where the audit trail lives.
 *
 * Nothing here sends anything: it decides *what would be sent*, and each
 * channel adapter below turns that decision into a provider-specific request.
 */

export type NotificationChannel = 'push' | 'telegram' | 'email';

export type NotificationKind =
  | 'high-value-opportunity'
  | 'urgent-deadline'
  | 'strong-direct-pay'
  | 'application-status-change'
  | 'digest';

export type NotificationUrgency = 'immediate' | 'digest';

export interface NotificationCandidate {
  opportunityId: string;
  title: string;
  provider: string;
  category: OpportunityCategory;
  rankScore: number;
  trustScore: number;
  riskLevel: RiskLevel;
  directPay: boolean | 'unknown';
  /** ISO deadline, or null when the source published none. */
  deadline: string | null;
  /** Canonical link back to the source record. */
  sourceUrl: string;
  attribution: string;
  /** Cost claim, carried through so a notification cannot overstate it. */
  capitalStatus: 'confirmed_free' | 'unconfirmed_no_cost_found' | 'capital_required';
}

export interface NotificationPreferences {
  push: boolean;
  telegram: boolean;
  email: boolean;
}

export interface NotificationThresholds {
  /** Rank score at or above which an opportunity is "very high scoring". */
  highValueRank: number;
  /** Minimum trust required before anything is pushed immediately. */
  minTrustForImmediate: number;
  /** A deadline within this many hours is urgent. */
  urgentDeadlineHours: number;
}

export const DEFAULT_THRESHOLDS: NotificationThresholds = {
  highValueRank: 80,
  minTrustForImmediate: 60,
  urgentDeadlineHours: 48
};

export interface NotificationDecision {
  kind: NotificationKind;
  urgency: NotificationUrgency;
  /** Why this cadence was chosen, in plain language, for the audit trail. */
  reason: string;
  channels: NotificationChannel[];
}

/** Channels the user has switched on, in priority order. */
export function enabledChannels(preferences: NotificationPreferences): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (preferences.push) channels.push('push');
  if (preferences.telegram) channels.push('telegram');
  if (preferences.email) channels.push('email');
  return channels;
}

function hoursUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const parsed = Date.parse(deadline);
  if (!Number.isFinite(parsed)) return null;
  return (parsed - now.getTime()) / 3_600_000;
}

/**
 * Decide whether a candidate is pushed now, held for a digest, or dropped.
 *
 * Returns `null` when nothing should be sent — which is the correct answer for
 * most candidates, and the reason the user is not buried in alerts.
 */
export function decideNotification(params: {
  candidate: NotificationCandidate;
  preferences: NotificationPreferences;
  now: Date;
  thresholds?: NotificationThresholds;
}): NotificationDecision | null {
  const { candidate, preferences, now } = params;
  const thresholds = params.thresholds ?? DEFAULT_THRESHOLDS;
  const channels = enabledChannels(preferences);

  if (channels.length === 0) return null;

  // A capital-required record must never be pushed as an opportunity, and a
  // withheld/critical record must never be pushed at all.
  if (candidate.capitalStatus === 'capital_required') return null;
  if (candidate.riskLevel === 'critical') return null;

  // An expired deadline is disqualifying whatever else is true of the record:
  // pushing a closed opportunity helps nobody. Checked before the score checks
  // so a high score cannot smuggle it through.
  const deadlineHours = hoursUntil(candidate.deadline, now);
  if (deadlineHours !== null && deadlineHours <= 0) {
    return null;
  }

  if (candidate.trustScore < 25) {
    // Effectively blocked by the risk engine; nothing to notify about.
    return null;
  }

  const trustworthy = candidate.trustScore >= thresholds.minTrustForImmediate;

  if (candidate.rankScore >= thresholds.highValueRank && trustworthy) {
    return {
      kind: 'high-value-opportunity',
      urgency: 'immediate',
      reason: `Rank ${candidate.rankScore} is at or above the high-value threshold (${thresholds.highValueRank}) and trust ${candidate.trustScore} meets the immediate minimum.`,
      channels
    };
  }

  if (deadlineHours !== null && deadlineHours <= thresholds.urgentDeadlineHours) {
    return {
      kind: 'urgent-deadline',
      urgency: 'immediate',
      reason: `Deadline is ${deadlineHours.toFixed(1)} hours away, inside the ${thresholds.urgentDeadlineHours}-hour urgent window.`,
      channels
    };
  }

  if (candidate.directPay === true && candidate.rankScore >= thresholds.highValueRank - 10 && trustworthy) {
    return {
      kind: 'strong-direct-pay',
      urgency: 'immediate',
      reason: 'Direct payment is stated and the score is close to the high-value band.',
      channels
    };
  }

  return {
    kind: 'digest',
    urgency: 'digest',
    reason: 'Useful but not urgent: held for the next digest instead of interrupting the user.',
    channels
  };
}

/** Application lifecycle states that are worth telling the user about. */
export const NOTIFIABLE_APPLICATION_STATES = ['accepted', 'rejected', 'paid', 'expired'] as const;
export type NotifiableApplicationState = (typeof NOTIFIABLE_APPLICATION_STATES)[number];

export function applicationStatusNotification(params: {
  applicationId: string;
  opportunityTitle: string;
  from: string;
  to: string;
  preferences: NotificationPreferences;
}): NotificationDecision | null {
  const channels = enabledChannels(params.preferences);
  if (channels.length === 0) return null;
  if (params.from === params.to) return null;
  if (!(NOTIFIABLE_APPLICATION_STATES as readonly string[]).includes(params.to)) return null;

  return {
    kind: 'application-status-change',
    urgency: 'immediate',
    reason: `Application moved to "${params.to}".`,
    channels
  };
}
