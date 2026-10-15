import {
  capitalStatusLabel,
  type CapitalStatus,
  type FirestoreEvidenceDoc,
  type PublishedOpportunity,
  type Tri
} from '@ntk/hunter-core';
import type { EvidenceSummaryItem, Opportunity } from '../types';

/**
 * Map a stored opportunity document into the UI view model.
 *
 * Rules:
 *  - Never invent a value. An absent reward reads "Amount not published in the
 *    source", not "$0".
 *  - Never collapse `'unknown'` into `false`.
 *  - Never upgrade "no cost found" into "free". The cost status is carried
 *    through as a typed field and worded only by the core's label table.
 *  - Any link-out keeps the provider attribution and the link-back flag.
 */

/** Human-readable pay line. Returns a statement, never a fabricated zero. */
export function rewardTextOf(record: PublishedOpportunity): string {
  const { rewardMin, rewardMax, currency, rewardBasis } = record;
  const symbol = currency === 'USD' ? '$' : currency ? `${currency} ` : '';

  if (rewardMin === null && rewardMax === null) {
    return 'Amount not published in the source';
  }

  const format = (value: number) => value.toLocaleString('en-US');
  const range =
    rewardMin !== null && rewardMax !== null && rewardMin !== rewardMax
      ? `${symbol}${format(rewardMin)} – ${symbol}${format(rewardMax)}`
      : `${symbol}${format((rewardMin ?? rewardMax) as number)}`;

  const basisLabel =
    rewardBasis === 'unknown' ? '' : rewardBasis === 'one-off' ? ' one-off' : ` per ${rewardBasis}`;

  const currencyNote = currency === null ? ' (currency not published)' : '';
  return `${range}${basisLabel}${currencyNote}`;
}

/** Relative freshness from an injected clock, so the mapping stays testable. */
export function relativeLabel(iso: string, now: Date): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'unknown date';
  const minutes = Math.round((now.getTime() - parsed) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'} ago`;
}

function triLabel(value: Tri, positive: string, negative: string, unknown: string): string {
  if (value === true) return positive;
  if (value === false) return negative;
  return unknown;
}

/**
 * The cost status to display for a stored record.
 *
 * A record that predates the `capitalStatus` field is treated as UNCONFIRMED,
 * never as free: an older document carries no evidence that the work is free, so
 * the honest default is the cautious one.
 */
export function capitalStatusOf(record: { capitalStatus?: CapitalStatus }): CapitalStatus {
  const status = record.capitalStatus;
  if (status === 'confirmed_free' || status === 'unconfirmed_no_cost_found' || status === 'capital_required') {
    return status;
  }
  return 'unconfirmed_no_cost_found';
}

/**
 * Evidence lines shown on the detail screen.
 * Each line states either the established value or exactly what is missing.
 */
export function evidenceSummaryOf(
  record: PublishedOpportunity,
  evidence: FirestoreEvidenceDoc | null
): EvidenceSummaryItem[] {
  const items: EvidenceSummaryItem[] = [];
  const status = capitalStatusOf(record);

  // Cost comes first: it is the product's headline promise and the claim most
  // easily overstated.
  items.push({
    label: 'Upfront cost',
    value: capitalStatusLabel(status, 'long'),
    state: status === 'confirmed_free' ? 'established' : 'unknown'
  });

  const rewardEstablished = record.rewardMin !== null || record.rewardMax !== null;
  items.push({
    label: 'Reward',
    value: rewardEstablished ? rewardTextOf(record) : 'Not published by the source',
    state: rewardEstablished ? 'established' : 'unknown',
    method: 'text-pattern'
  });

  items.push({
    label: 'Direct pay',
    value: triLabel(
      record.directPay,
      'Payment for delivered work is stated',
      'Reward is a prize or benefit, not a fee',
      'Payment route not stated'
    ),
    state: record.directPay === 'unknown' ? 'unknown' : 'established',
    method: 'structured-field'
  });

  items.push({
    label: 'Country eligibility',
    value: record.countries.length ? record.countries.join(', ') : 'Not stated by the source',
    state: record.countries.length ? 'established' : 'unknown',
    method: 'text-pattern'
  });

  items.push({
    label: 'CV requirement',
    value: triLabel(record.noCvRequired, 'No CV required', 'A CV is requested', 'Not stated by the source'),
    state: record.noCvRequired === 'unknown' ? 'unknown' : 'established',
    method: 'text-pattern'
  });

  items.push({
    label: 'Remote',
    value: triLabel(record.remote, 'Remote', 'On-site', 'Not stated by the source'),
    state: record.remote === 'unknown' ? 'unknown' : 'established',
    method: 'structured-field'
  });

  if (evidence) {
    items.push({
      label: 'Snapshot hash',
      value: evidence.contentHash ? `${evidence.contentHash.slice(0, 16)}…` : 'No snapshot hash recorded',
      state: evidence.contentHash ? 'established' : 'unknown'
    });
    items.push({
      label: 'Unconfirmed fields',
      value: `${evidence.unknownFieldCount} of ${evidence.totalAssertions} assertions are absent`,
      state: evidence.totalAssertions > 0 ? 'established' : 'unknown'
    });
  }

  return items;
}

export function mapPublishedOpportunity(
  record: PublishedOpportunity,
  options: { now: Date; evidence?: FirestoreEvidenceDoc | null }
): Opportunity {
  const evidence = options.evidence ?? null;

  return {
    id: record.id,
    title: record.title,
    provider: record.provider,
    category: record.category,
    description: record.description,
    sourceUrl: record.sourceUrl,
    sourceAttribution: record.attribution,
    requiresLinkBack: record.requiresLinkBack,

    rewardMin: record.rewardMin,
    rewardMax: record.rewardMax,
    currency: record.currency,
    rewardBasis: record.rewardBasis,
    rewardText: rewardTextOf(record),

    remote: record.remote,
    directPay: record.directPay,
    noCvRequired: record.noCvRequired,
    zeroCapital: record.zeroCapital,
    capitalStatus: capitalStatusOf(record),

    countries: record.countries,
    skills: record.skills,
    requirements: record.requirements,
    paymentMethods: record.paymentMethods,
    deadline: record.deadline,

    rankScore: record.rankScore,
    trustScore: record.trustScore,
    confidence: record.confidence,
    riskLevel: record.riskLevel,
    evidenceCount: record.evidenceCount,
    evidence: evidenceSummaryOf(record, evidence),

    discoveredAt: record.discoveredAt,
    discoveredLabel: relativeLabel(record.discoveredAt, options.now)
  };
}
