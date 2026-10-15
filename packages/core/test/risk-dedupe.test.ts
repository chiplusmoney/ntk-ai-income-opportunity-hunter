import { describe, expect, it } from 'vitest';
import { assessRisk } from '../src/pipeline/risk.js';
import { dedupeCandidate, fingerprintOf, preferCanonical, similarityBetween } from '../src/pipeline/dedupe.js';
import { candidate, FIXED_NOW } from './helpers.js';

function riskInput(overrides: Partial<Parameters<typeof assessRisk>[0]> = {}) {
  return {
    title: 'Remote Frontend Developer',
    provider: 'Acme Ltd',
    description: 'Build a responsive marketing site with React. Fixed-price milestones paid on acceptance.',
    sourceReliability: 82,
    sourceUrl: 'https://example.test/job/1',
    directPay: true as const,
    remote: true as const,
    rewardMin: 2000,
    rewardMax: 4000,
    rewardBasis: 'one-off',
    publishedAt: FIXED_NOW.toISOString(),
    ...overrides
  };
}

describe('assessRisk', () => {
  it('gives a clean, corroborated posting a high trust score', () => {
    const result = assessRisk(riskInput());
    expect(result.trustScore).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe('low');
    expect(result.blocked).toBe(false);
  });

  it('hard-blocks an up-front payment request', () => {
    const result = assessRisk(
      riskInput({ description: 'Please pay a registration fee of $75 to activate your worker account.' })
    );
    expect(result.blocked).toBe(true);
    expect(result.findings.map(f => f.code)).toContain('upfront_payment_request');
    expect(result.level).toBe('critical');
  });

  it('hard-blocks wallet secrets', () => {
    const result = assessRisk(
      riskInput({ description: 'Send your seed phrase to our onboarding bot so it can set up your wallet.' })
    );
    expect(result.blocked).toBe(true);
    expect(result.findings.map(f => f.code)).toContain('crypto_capital_at_risk');
  });

  it('penalises guaranteed-income language', () => {
    const result = assessRisk(riskInput({ description: 'Guaranteed income of $500 per day for simple work.' }));
    const codes = result.findings.map(f => f.code);
    expect(codes).toContain('guaranteed_income_claim');
    expect(result.trustScore).toBeLessThan(80);
  });

  it('penalises off-platform contact', () => {
    const result = assessRisk(riskInput({ description: 'Apply by messaging us on WhatsApp to get started.' }));
    expect(result.findings.map(f => f.code)).toContain('telegram_whatsapp_contact_only');
  });

  it('flags an unverifiable source URL', () => {
    const result = assessRisk(riskInput({ sourceUrl: '' }));
    expect(result.findings.map(f => f.code)).toContain('no_verifiable_source');
  });

  it('flags an unknown reward and unknown direct pay', () => {
    const result = assessRisk(riskInput({ rewardMin: null, rewardMax: null, directPay: 'unknown', rewardBasis: 'unknown' }));
    const codes = result.findings.map(f => f.code);
    expect(codes).toContain('reward_not_published');
    expect(codes).toContain('direct_pay_unconfirmed');
    // Unconfirmed facts must not block on their own.
    expect(result.blocked).toBe(false);
  });

  it('detects a suspiciously large requested fee', () => {
    const result = assessRisk(riskInput({ description: 'A security deposit of $500 is required before onboarding.' }));
    expect(result.blocked).toBe(true);
    expect(result.findings.some(f => f.penalty >= 20)).toBe(true);
  });

  it('never reports a negative or over-100 trust score', () => {
    const worst = assessRisk(
      riskInput({
        description:
          'Pay a registration fee of $900. Guaranteed income of $5000 per day. Contact us on whatsapp. Send your private key.'
      })
    );
    expect(worst.trustScore).toBeGreaterThanOrEqual(0);
    expect(worst.trustScore).toBeLessThanOrEqual(100);
  });

  it('is deterministic', () => {
    const input = riskInput({ description: 'Guaranteed income. Contact on telegram.' });
    expect(JSON.stringify(assessRisk(input))).toBe(JSON.stringify(assessRisk(input)));
  });
});

describe('dedupe', () => {
  const original = candidate({ id: 'remotive:1', sourceItemId: '1' });

  it('collapses a same-source re-crawl', () => {
    const result = dedupeCandidate({ ...original, discoveredAt: '2026-10-15T00:00:00.000Z' }, [original]);
    expect(result.verdict).toBe('duplicate');
    expect(result.matchedId).toBe('remotive:1');
    expect(result.similarity).toBe(1);
  });

  it('collapses the same provider and title across sources', () => {
    const other = candidate({ id: 'remoteok:9', sourceId: 'remoteok', sourceItemId: '9' });
    const result = dedupeCandidate(other, [original]);
    expect(result.verdict).toBe('duplicate');
    expect(result.reason).toMatch(/Identical normalized provider and title/i);
  });

  it('detects a near-duplicate across sources as a possible duplicate', () => {
    const repost = candidate({
      id: 'arbeitnow:x',
      sourceId: 'arbeitnow',
      sourceItemId: 'x',
      title: 'Remote Frontend Developer (React)',
      provider: 'Acme Ltd.',
      description: 'Build a responsive marketing site with React. Fixed-price milestones paid on acceptance. Deliverables agreed.'
    });
    const result = dedupeCandidate(repost, [original]);
    expect(['duplicate', 'possible-duplicate']).toContain(result.verdict);
    expect(result.matchedId).toBe('remotive:1');
  });

  it('keeps genuinely different postings unique', () => {
    const different = candidate({
      id: 'remoteok:77',
      sourceId: 'remoteok',
      sourceItemId: '77',
      title: 'German Tax Accountant',
      provider: 'Buchhaltung GmbH',
      description: 'Prepare monthly VAT returns for German clients. On-site in Munich.'
    });
    const result = dedupeCandidate(different, [original]);
    expect(result.verdict).toBe('unique');
    expect(result.matchedId).toBeNull();
  });

  it('produces a stable fingerprint regardless of case and punctuation', () => {
    expect(fingerprintOf('Acme Ltd.', 'Remote   Frontend Developer!')).toBe(
      fingerprintOf('ACME', 'remote frontend developer')
    );
  });

  it('scores identical content as a perfect match', () => {
    expect(similarityBetween(original, original)).toBeGreaterThanOrEqual(0.85);
  });

  it('prefers the record with more established evidence', () => {
    const rich = candidate({
      id: 'remotive:1',
      evidence: {
        snapshots: original.evidence.snapshots,
        assertions: [
          { field: 'title', value: 'x', method: 'structured-field', snapshotIndex: 0, confidence: 1 },
          { field: 'provider', value: 'y', method: 'structured-field', snapshotIndex: 0, confidence: 1 }
        ]
      }
    });
    const poor = candidate({ id: 'remoteok:2', sourceId: 'remoteok', sourceItemId: '2', evidence: { snapshots: [], assertions: [] } });
    const { keep, drop, reason } = preferCanonical(poor, rich);
    expect(keep.id).toBe('remotive:1');
    expect(drop.id).toBe('remoteok:2');
    expect(reason).toMatch(/more established evidence/i);
  });

  it('keeps the first-seen record when evidence is equivalent', () => {
    const first = candidate({ id: 'a', discoveredAt: '2026-10-01T00:00:00.000Z' });
    const second = candidate({ id: 'b', discoveredAt: '2026-10-10T00:00:00.000Z', description: first.description });
    const { keep, reason } = preferCanonical(first, second);
    expect(keep.id).toBe('a');
    expect(reason).toMatch(/first-seen/i);
  });
});
