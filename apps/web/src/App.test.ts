import { describe, expect, it } from 'vitest';
import indexes from '../../../firestore.indexes.json';
import { allRowsAreMarkedDemo, demoSeedOpportunities, opportunities } from './data';
import { PUBLISHED_QUERY } from './repositories/opportunityRepository';
import { evidenceSummaryOf, mapPublishedOpportunity, relativeLabel, rewardTextOf } from './repositories/mapPublishedOpportunity';
import type { FirestoreEvidenceDoc, PublishedOpportunity } from '@ntk/hunter-core';

/**
 * The seed contract that matters: bundled rows must never be mistakable for
 * real captured opportunities.
 */
describe('bundled demo data', () => {
  it('is explicitly marked as demo on every row', () => {
    expect(demoSeedOpportunities.length).toBeGreaterThan(0);
    expect(allRowsAreMarkedDemo()).toBe(true);
  });

  it('keeps the backwards-compatible alias pointing at the demo rows', () => {
    expect(opportunities).toBe(demoSeedOpportunities);
  });

  it('never uses a real provider domain for a placeholder link', () => {
    for (const row of demoSeedOpportunities) {
      expect(new URL(row.sourceUrl).hostname, row.id).toBe('example.invalid');
    }
  });

  it('carries at least one evidence line per row, marked honestly', () => {
    for (const row of demoSeedOpportunities) {
      expect(row.evidence.length, row.id).toBeGreaterThan(0);
      for (const line of row.evidence) {
        expect(['established', 'unknown']).toContain(line.state);
      }
    }
  });

  it('never claims a confirmed $0 in demo rows, because they carry no cost evidence', () => {
    for (const row of demoSeedOpportunities) {
      expect(row.capitalStatus, row.id).toBe('unconfirmed_no_cost_found');
    }
  });

  it('never claims a verified upstream snapshot in demo rows', () => {
    for (const row of demoSeedOpportunities) {
      // A demo row cannot point at a real snapshot hash.
      expect(row.evidence.some(e => e.label === 'Snapshot hash')).toBe(false);
    }
  });
});

const record = (overrides: Partial<PublishedOpportunity> = {}): PublishedOpportunity => ({
  id: 'remotive:1',
  sourceId: 'remotive',
  sourceItemId: '1',
  visibility: 'published',
  title: 'Remote Frontend Developer',
  provider: 'Acme Ltd',
  category: 'Development',
  description: 'Build a responsive marketing site.',
  sourceUrl: 'https://remotive.com/remote-jobs/1',
  discoveredAt: '2026-10-14T11:00:00.000Z',
  publishedAt: '2026-10-13T09:00:00.000Z',
  deadline: null,
  rewardMin: 2000,
  rewardMax: 4000,
  currency: 'USD',
  rewardBasis: 'one-off',
  remote: true,
  directPay: true,
  noCvRequired: 'unknown',
  zeroCapital: true,
  countries: ['GLOBAL'],
  skills: ['React'],
  requirements: [],
  paymentMethods: ['Bank transfer'],
  rankScore: 78,
  trustScore: 92,
  confidence: 71,
  riskLevel: 'low',
  evidenceCount: 9,
  evidenceHash: 'a'.repeat(64),
  fingerprint: 'acme::remote frontend developer',
  attribution: 'Remotive',
  requiresLinkBack: true,
  capitalStatus: 'unconfirmed_no_cost_found',
  ...overrides
});

const evidence: FirestoreEvidenceDoc = {
  id: 'remotive:1',
  opportunityId: 'remotive:1',
  sourceId: 'remotive',
  sourceItemId: '1',
  sourceUrl: 'https://remotive.com/remote-jobs/1',
  attribution: 'Remotive',
  requiresLinkBack: true,
  fetchedAt: '2026-10-14T12:00:00.000Z',
  httpStatus: 200,
  bytes: 189000,
  contentHash: 'b'.repeat(64),
  evidenceHash: 'a'.repeat(64),
  excerpt: 'excerpt',
  assertions: [],
  totalAssertions: 12,
  unknownFieldCount: 5,
  dedupeVerdict: 'unique',
  dedupeReason: '',
  capitalStatus: 'unconfirmed_no_cost_found',
  upfrontCostUsd: null,
  riskLevel: 'low',
  riskFindings: [],
  scoreComponents: [],
  pipelineTrace: [],
  generatedAt: '2026-10-14T12:00:00.000Z'
};

describe('rewardTextOf', () => {
  it('states that the amount is unpublished instead of showing zero', () => {
    expect(rewardTextOf(record({ rewardMin: null, rewardMax: null, currency: null }))).toBe(
      'Amount not published in the source'
    );
  });

  it('formats a published range with its basis', () => {
    expect(rewardTextOf(record())).toBe('$2,000 – $4,000 one-off');
  });

  it('flags a missing currency rather than assuming USD', () => {
    expect(rewardTextOf(record({ currency: null, rewardMin: 40, rewardMax: 48 }))).toContain('currency not published');
  });

  it('states the period when the source gave one', () => {
    expect(rewardTextOf(record({ rewardMin: 50, rewardMax: 75, rewardBasis: 'hour' }))).toBe('$50 – $75 per hour');
  });

  it('does not print a range when minimum and maximum are equal', () => {
    expect(rewardTextOf(record({ rewardMin: 500, rewardMax: 500 }))).toBe('$500 one-off');
  });
});

describe('relativeLabel', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');

  it('describes recent and older stamps', () => {
    expect(relativeLabel('2026-10-14T11:48:00.000Z', now)).toBe('12 min ago');
    expect(relativeLabel('2026-10-14T10:00:00.000Z', now)).toBe('2 hr ago');
    expect(relativeLabel('2026-10-10T12:00:00.000Z', now)).toBe('4 days ago');
  });

  it('says so instead of guessing when the stamp is unreadable', () => {
    expect(relativeLabel('not a date', now)).toBe('unknown date');
  });
});

describe('mapPublishedOpportunity', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');

  it('preserves unknown as unknown', () => {
    const mapped = mapPublishedOpportunity(record(), { now });
    expect(mapped.noCvRequired).toBe('unknown');
    expect(mapped.remote).toBe(true);
  });

  it('carries the cost status through instead of collapsing it', () => {
    expect(mapPublishedOpportunity(record({ capitalStatus: 'confirmed_free' }), { now }).capitalStatus).toBe(
      'confirmed_free'
    );
    expect(
      mapPublishedOpportunity(record({ capitalStatus: 'unconfirmed_no_cost_found' }), { now }).capitalStatus
    ).toBe('unconfirmed_no_cost_found');
  });

  it('treats a record with no cost status as unconfirmed, never as free', () => {
    const legacy = record();
    delete (legacy as { capitalStatus?: unknown }).capitalStatus;
    expect(mapPublishedOpportunity(legacy, { now }).capitalStatus).toBe('unconfirmed_no_cost_found');
  });

  it('words the two non-capital states differently', () => {
    const confirmed = mapPublishedOpportunity(record({ capitalStatus: 'confirmed_free' }), { now });
    const unconfirmed = mapPublishedOpportunity(record({ capitalStatus: 'unconfirmed_no_cost_found' }), { now });

    const confirmedLine = confirmed.evidence.find(line => line.label === 'Upfront cost');
    const unconfirmedLine = unconfirmed.evidence.find(line => line.label === 'Upfront cost');

    expect(confirmedLine?.value).toMatch(/source states/i);
    expect(confirmedLine?.state).toBe('established');
    expect(unconfirmedLine?.value).toMatch(/not state that it is free/i);
    expect(unconfirmedLine?.state).toBe('unknown');
    expect(confirmedLine?.value).not.toBe(unconfirmedLine?.value);
  });

  it('puts the cost claim first in the evidence list', () => {
    const mapped = mapPublishedOpportunity(record(), { now, evidence });
    expect(mapped.evidence[0]?.label).toBe('Upfront cost');
  });

  it('carries attribution and the link-back requirement', () => {
    const mapped = mapPublishedOpportunity(record(), { now });
    expect(mapped.sourceAttribution).toBe('Remotive');
    expect(mapped.requiresLinkBack).toBe(true);
  });

  it('does not mark a live record as demo', () => {
    expect(mapPublishedOpportunity(record(), { now }).demoSeed).toBeUndefined();
  });

  it('builds evidence lines that name the missing fields', () => {
    const mapped = mapPublishedOpportunity(record({ countries: [] }), { now, evidence });
    const country = mapped.evidence.find(e => e.label === 'Country eligibility');
    expect(country?.state).toBe('unknown');
    expect(country?.value).toMatch(/not stated/i);
    const unconfirmed = mapped.evidence.find(e => e.label === 'Unconfirmed fields');
    expect(unconfirmed?.value).toBe('5 of 12 assertions are absent');
  });

  it('works without an evidence document', () => {
    const lines = evidenceSummaryOf(record(), null);
    expect(lines.some(l => l.label === 'Snapshot hash')).toBe(false);
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe('published query contract', () => {
  it('filters only on fields every published document sets', () => {
    const fields = PUBLISHED_QUERY.filters.map(f => f.field);
    expect(fields).toEqual(['visibility', 'zeroCapital']);
    // A filter on a field the writer leaves unset would silently drop records.
    expect(fields).not.toContain('matchScore');
  });

  it('orders by rankScore, which is the field the index is declared on', () => {
    expect(PUBLISHED_QUERY.orderBy.field).toBe('rankScore');
    expect(PUBLISHED_QUERY.orderBy.direction).toBe('desc');
  });

  it('targets the opportunities collection', () => {
    expect(PUBLISHED_QUERY.collection).toBe('opportunities');
  });

  it('has a matching composite index declared in firestore.indexes.json', () => {
    // Without this index the live query fails at runtime in production, which no
    // unit test would otherwise catch.
    const fields = PUBLISHED_QUERY.filters.map(f => f.field);
    const index = indexes.indexes.find(
      candidate =>
        candidate.collectionGroup === PUBLISHED_QUERY.collection &&
        fields.every(field => candidate.fields.some(f => f.fieldPath === field)) &&
        candidate.fields.some(f => f.fieldPath === PUBLISHED_QUERY.orderBy.field)
    );
    expect(index, `no index covers ${fields.join(', ')} ordered by ${PUBLISHED_QUERY.orderBy.field}`).toBeDefined();
  });
});
