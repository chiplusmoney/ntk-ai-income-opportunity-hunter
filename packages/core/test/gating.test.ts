import { describe, expect, it } from 'vitest';
import { assessZeroCapital, extractAmount, __internal } from '../src/pipeline/zeroCapital.js';
import { assessEligibility, normalizeCountries, DEFAULT_ELIGIBILITY_PREFERENCES } from '../src/pipeline/eligibility.js';
import type { EligibilityPreferences } from '../src/pipeline/eligibility.js';

describe('assessZeroCapital', () => {
  it('flags a registration fee as a blocking cost', () => {
    const result = assessZeroCapital({
      description: 'Complete the registration fee of $50 before you can start receiving tasks.'
    });
    expect(result.zeroCapital).toBe(false);
    expect(result.costConfirmed).toBe(false);
    expect(result.evidence.some(e => e.startsWith('cost(blocking)'))).toBe(true);
  });

  it('flags a requested payment even when the wording is indirect', () => {
    const result = assessZeroCapital({
      description: 'To activate your account you must pay a training fee of 100 dollars.'
    });
    expect(result.zeroCapital).toBe(false);
  });

  it('flags token purchase and staking', () => {
    const result = assessZeroCapital({
      description: 'You need to stake 500 tokens to unlock the higher paying quests.'
    });
    expect(result.zeroCapital).toBe(false);
  });

  it('does not flag a negation such as "no registration fee"', () => {
    const result = assessZeroCapital({
      description: 'There is no registration fee and no equipment purchase required to join.'
    });
    expect(result.zeroCapital).toBe(true);
    expect(result.costConfirmed).toBe(true);
  });

  it('reports an unconfirmed cost state when the posting is silent', () => {
    const result = assessZeroCapital({
      description: 'Build a landing page with React and deliver the finished source code.'
    });
    expect(result.zeroCapital).toBe(true);
    // Silence is NOT a $0 confirmation: the amount must stay unknown.
    expect(result.costConfirmed).toBe(false);
    expect(result.upfrontCostUsd).toBeNull();
  });

  it('confirms $0 only from an explicit statement', () => {
    const result = assessZeroCapital({
      description: 'This programme is free and we provide all equipment.'
    });
    expect(result.costConfirmed).toBe(true);
    expect(result.upfrontCostUsd).toBe(0);
  });

  it('records the amount when a fee is quoted', () => {
    const result = assessZeroCapital({ description: 'A refundable deposit of $250 is required.' });
    expect(result.zeroCapital).toBe(false);
    expect(result.upfrontCostUsd).toBe(250);
  });

  it('is deterministic', () => {
    const input = { description: 'Pay a sign-up fee of $20 to start.' };
    expect(JSON.stringify(assessZeroCapital(input))).toBe(JSON.stringify(assessZeroCapital(input)));
  });
});

describe('extractAmount', () => {
  it('reads symbol and code forms', () => {
    expect(extractAmount('registration fee of $50')).toBe(50);
    expect(extractAmount('deposit of 1,250 USD')).toBe(1250);
  });

  it('returns null when no amount is present', () => {
    expect(extractAmount('no fee at all')).toBeNull();
  });
});

describe('cost pattern internals', () => {
  it('never returns more than the bounded signal list', () => {
    const noisy = Array.from({ length: 40 }, (_, i) => `registration fee ${i}`).join('. ');
    expect(__internal.detectCostSignals(noisy).length).toBeLessThanOrEqual(21);
  });
});

describe('normalizeCountries', () => {
  it('maps names to ISO codes', () => {
    expect(normalizeCountries('Nigeria, United Kingdom and Canada')).toEqual(['NG', 'GB', 'CA']);
  });

  it('maps worldwide wording to GLOBAL', () => {
    expect(normalizeCountries('Worldwide')).toEqual(['GLOBAL']);
    expect(normalizeCountries('Anywhere')).toEqual(['GLOBAL']);
  });

  it('keeps region hints as region codes', () => {
    expect(normalizeCountries('Americas, Europe, Israel')).toContain('EU');
  });

  it('handles a bare country code', () => {
    expect(normalizeCountries('us')).toEqual(['US']);
  });

  it('returns nothing for a bare city', () => {
    expect(normalizeCountries('Stuttgart')).toEqual([]);
  });
});

const prefs = (overrides: Partial<EligibilityPreferences> = {}): EligibilityPreferences => ({
  ...DEFAULT_ELIGIBILITY_PREFERENCES,
  ...overrides
});

describe('assessEligibility', () => {
  const base = {
    countries: ['GLOBAL'],
    eligibilityText: 'Worldwide',
    noCapitalRequired: true as const,
    directPay: true as const,
    noCvRequired: 'unknown' as const,
    remote: true as const,
    competition: false,
    deadline: null,
    paymentMethods: [],
    category: 'Development' as const
  };

  it('is eligible when the gating checks pass', () => {
    const result = assessEligibility(base, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.eligible).toBe(true);
    expect(result.ineligible).toBe(false);
    expect(result.blockingCheckIds).toEqual([]);
  });

  it('does NOT block on an unknown CV requirement', () => {
    const result = assessEligibility(base, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    const cv = result.checks.find(c => c.id === 'noCv');
    expect(cv?.passed).toBe('unknown');
    expect(result.ineligible).toBe(false);
    // ...but it must be reported as unconfirmed.
    expect(result.needsMoreEvidence).toBe(true);
    expect(result.reasons.join(' ')).toMatch(/could not be confirmed/i);
  });

  it('blocks when a CV is positively required', () => {
    const result = assessEligibility({ ...base, noCvRequired: false }, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.ineligible).toBe(true);
    expect(result.blockingCheckIds).toContain('noCv');
  });

  it('blocks on-site work when the user needs remote', () => {
    const result = assessEligibility({ ...base, remote: false }, prefs({ remoteOnly: true }), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.ineligible).toBe(true);
    expect(result.blockingCheckIds).toContain('remote');
  });

  it('does not block on-site work when the user allows it', () => {
    const result = assessEligibility({ ...base, remote: false }, prefs({ remoteOnly: false }), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.ineligible).toBe(false);
  });

  it('blocks a country the user cannot work from', () => {
    const result = assessEligibility({ ...base, countries: ['DE'], eligibilityText: 'Germany' }, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.ineligible).toBe(true);
    expect(result.blockingCheckIds).toContain('country');
  });

  it('keeps a region-only statement unknown instead of blocked', () => {
    const result = assessEligibility({ ...base, countries: ['EU'], eligibilityText: 'Europe' }, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.ineligible).toBe(false);
    expect(result.checks.find(c => c.id === 'country')?.passed).toBe('unknown');
  });

  it('blocks competitions by default and allows them when enabled', () => {
    const blocked = assessEligibility({ ...base, competition: true }, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(blocked.ineligible).toBe(true);
    const allowed = assessEligibility(
      { ...base, competition: true },
      prefs({ competitionsEnabled: true }),
      [],
      new Date('2026-10-14T00:00:00Z')
    );
    expect(allowed.ineligible).toBe(false);
  });

  it('blocks an expired deadline', () => {
    const result = assessEligibility(
      { ...base, deadline: '2026-01-01T00:00:00.000Z' },
      prefs(),
      [],
      new Date('2026-10-14T00:00:00Z')
    );
    expect(result.ineligible).toBe(true);
    expect(result.blockingCheckIds).toContain('deadline');
  });

  it('keeps payment method and skills as non-blocking checks', () => {
    const result = assessEligibility(base, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.checks.find(c => c.id === 'paymentMethod')?.blocking).toBe(false);
    expect(result.checks.find(c => c.id === 'paymentMethod')?.passed).toBe('unknown');
    expect(result.ineligible).toBe(false);
  });

  it('marks every check with an explicit blocking flag', () => {
    const result = assessEligibility(base, prefs(), [], new Date('2026-10-14T00:00:00Z'));
    expect(result.checks.every(c => typeof c.blocking === 'boolean')).toBe(true);
  });
});
