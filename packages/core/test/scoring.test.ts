import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, componentKeys, confidenceOf, scoreCandidate } from '../src/pipeline/scoring.js';
import { assessZeroCapital } from '../src/pipeline/zeroCapital.js';
import { assessEligibility, DEFAULT_ELIGIBILITY_PREFERENCES } from '../src/pipeline/eligibility.js';
import { assessRisk } from '../src/pipeline/risk.js';
import { candidate, FIXED_NOW, source } from './helpers.js';
import type { OpportunityCandidate } from '../src/types.js';

/** Run the real stage functions so the scorer is tested against real inputs. */
function scoreWith(overrides: Partial<OpportunityCandidate> = {}, userSkills: string[] = []) {
  const c = candidate(overrides);
  const src = source(c.sourceId);
  const zeroCapital = assessZeroCapital({ description: c.description });
  const staged = {
    ...c,
    noCapitalRequired: (!zeroCapital.zeroCapital ? false : zeroCapital.costConfirmed ? true : 'unknown') as OpportunityCandidate['noCapitalRequired']
  };
  const eligibility = assessEligibility(staged, DEFAULT_ELIGIBILITY_PREFERENCES, [], FIXED_NOW);
  const risk = assessRisk({
    title: c.title,
    provider: c.provider,
    description: c.description,
    sourceReliability: src.reliability,
    sourceUrl: c.sourceUrl,
    directPay: c.directPay,
    remote: c.remote,
    rewardMin: c.reward.min,
    rewardMax: c.reward.max,
    rewardBasis: c.reward.basis,
    publishedAt: c.publishedAt
  });
  return scoreCandidate({ candidate: staged, source: src, zeroCapital, eligibility, risk, userSkills, now: FIXED_NOW });
}

describe('scoring weights', () => {
  it('sum to exactly 1 so the unpenalised maximum is 100', () => {
    const sum = componentKeys().reduce((total, key) => total + DEFAULT_WEIGHTS[key as keyof typeof DEFAULT_WEIGHTS], 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('emits one component per documented dimension', () => {
    const result = scoreWith();
    expect(result.components.map(c => c.key)).toEqual(componentKeys());
  });

  it('keeps every component inside 0..100', () => {
    const result = scoreWith();
    for (const component of result.components) {
      expect(component.raw).toBeGreaterThanOrEqual(0);
      expect(component.raw).toBeLessThanOrEqual(100);
      expect(component.weighted).toBeCloseTo(component.raw * component.weight, 3);
    }
  });
});

describe('scoring behaviour', () => {
  it('scores a clean, well-paid remote posting highly', () => {
    const result = scoreWith({
      reward: { min: 60, max: 80, currency: 'USD', basis: 'hour', raw: '$60-$80 /hour' }
    });
    expect(result.rankScore).toBeGreaterThan(60);
    expect(result.components.find(c => c.key === 'rewardValue')?.raw).toBe(100);
  });

  it('ranks an hourly rate above an equal one-off sum', () => {
    const hourly = scoreWith({ reward: { min: 40, max: 40, currency: 'USD', basis: 'hour', raw: '$40 /hour' } });
    const oneOff = scoreWith({ reward: { min: 40, max: 40, currency: 'USD', basis: 'one-off', raw: '$40' } });
    expect(hourly.rankScore).toBeGreaterThan(oneOff.rankScore);
  });

  it('does not convert a non-USD reward and says so', () => {
    const result = scoreWith({ reward: { min: 300, max: 600, currency: 'EUR', basis: 'one-off', raw: '€300 - €600 EUR' } });
    const reward = result.components.find(c => c.key === 'rewardValue');
    expect(reward?.note).toMatch(/no FX rate/i);
    expect(reward?.raw).toBe(35);
  });

  it('penalises a missing reward rather than treating it as zero-return', () => {
    const result = scoreWith({ reward: { min: null, max: null, currency: null, basis: 'unknown', raw: null } });
    const reward = result.components.find(c => c.key === 'rewardValue');
    expect(reward?.raw).toBe(30);
    expect(reward?.note).toMatch(/unscored/i);
  });

  it('scores an unconfirmed payment route below a stated one', () => {
    const stated = scoreWith();
    const unconfirmed = scoreWith({ directPay: 'unknown' });
    expect(unconfirmed.components.find(c => c.key === 'directPayCertainty')?.raw).toBe(45);
    expect(stated.rankScore).toBeGreaterThan(unconfirmed.rankScore);
  });

  it('scores a zero-capital posting above an unconfirmed one', () => {
    const unconfirmed = scoreWith();
    const confirmed = scoreWith({
      description: 'Build a landing page. There is no fee to apply and no equipment purchase required.'
    });
    expect(confirmed.components.find(c => c.key === 'zeroCapital')?.raw).toBe(100);
    expect(unconfirmed.components.find(c => c.key === 'zeroCapital')?.raw).toBe(70);
  });

  it('matches skills when they overlap and stays neutral when they do not', () => {
    const matched = scoreWith({}, ['react', 'typescript']);
    const unmatched = scoreWith({}, ['welding']);
    expect(matched.components.find(c => c.key === 'skillMatch')?.raw).toBeGreaterThan(60);
    expect(unmatched.components.find(c => c.key === 'skillMatch')?.raw).toBe(35);
  });

  it('scores a competition below a direct award', () => {
    const direct = scoreWith();
    const competition = scoreWith({ competition: true, category: 'Competition', directPay: false, countries: [] });
    expect(competition.components.find(c => c.key === 'competitionLevel')?.raw).toBe(25);
    expect(direct.rankScore).toBeGreaterThan(competition.rankScore);
  });

  it('rewards freshness and ages old listings down', () => {
    const fresh = scoreWith({ publishedAt: FIXED_NOW.toISOString() });
    const stale = scoreWith({ publishedAt: '2026-01-01T00:00:00.000Z' });
    expect(fresh.components.find(c => c.key === 'freshness')?.raw).toBe(100);
    expect(stale.components.find(c => c.key === 'freshness')?.raw).toBe(25);
  });

  it('uses supplied outcome history without inventing one', () => {
    const c = candidate();
    const src = source(c.sourceId);
    const zeroCapital = assessZeroCapital({ description: c.description });
    const eligibility = assessEligibility(c, DEFAULT_ELIGIBILITY_PREFERENCES, [], FIXED_NOW);
    const risk = assessRisk({
      title: c.title,
      provider: c.provider,
      description: c.description,
      sourceReliability: src.reliability,
      sourceUrl: c.sourceUrl,
      directPay: c.directPay,
      remote: c.remote,
      rewardMin: c.reward.min,
      rewardMax: c.reward.max,
      rewardBasis: c.reward.basis,
      publishedAt: c.publishedAt
    });
    const noHistory = scoreCandidate({ candidate: c, source: src, zeroCapital, eligibility, risk, now: FIXED_NOW });
    const withHistory = scoreCandidate({
      candidate: c,
      source: src,
      zeroCapital,
      eligibility,
      risk,
      history: { remotive: 0.9 },
      now: FIXED_NOW
    });
    expect(noHistory.components.find(x => x.key === 'history')?.raw).toBe(50);
    expect(withHistory.components.find(x => x.key === 'history')?.raw).toBe(90);
  });

  it('subtracts risk from the rank score but reports trust separately', () => {
    const clean = scoreWith();
    const risky = scoreWith({ description: 'Guaranteed income of $500 per day. Contact us on telegram.' });
    expect(risky.trustScore).toBeLessThan(clean.trustScore);
    expect(risky.rankScore).toBeLessThan(clean.preRiskRankScore);
  });

  it('never returns a rank score outside 0..100', () => {
    const result = scoreWith({
      reward: { min: 200, max: 300, currency: 'USD', basis: 'hour', raw: '$200-$300 /hour' },
      publishedAt: FIXED_NOW.toISOString()
    });
    expect(result.rankScore).toBeLessThanOrEqual(100);
    expect(result.rankScore).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for identical input', () => {
    expect(JSON.stringify(scoreWith())).toBe(JSON.stringify(scoreWith()));
  });
});

describe('confidence', () => {
  it('is higher when more of the record is established', () => {
    const src = source('remotive');
    const sparse = candidate({
      evidence: {
        snapshots: [],
        assertions: [
          { field: 'title', value: 'x', method: 'structured-field', snapshotIndex: 0, confidence: 1 },
          { field: 'reward.min', value: null, method: 'absent', snapshotIndex: null, confidence: 0 },
          { field: 'reward.max', value: null, method: 'absent', snapshotIndex: null, confidence: 0 }
        ]
      }
    });
    const rich = candidate({
      evidence: {
        snapshots: [
          {
            sourceId: 'remotive',
            sourceUrl: 'https://example.test/1',
            fetchedAt: FIXED_NOW.toISOString(),
            contentHash: 'b'.repeat(64),
            bytes: 10,
            httpStatus: 200,
            excerpt: 'e'
          }
        ],
        assertions: [
          { field: 'title', value: 'x', method: 'structured-field', snapshotIndex: 0, confidence: 1 },
          { field: 'reward.min', value: 10, method: 'structured-field', snapshotIndex: 0, confidence: 1 },
          { field: 'reward.max', value: 20, method: 'structured-field', snapshotIndex: 0, confidence: 1 }
        ]
      }
    });
    expect(confidenceOf(rich, src)).toBeGreaterThan(confidenceOf(sparse, src));
  });

  it('stays inside 0..100 with no evidence at all', () => {
    const value = confidenceOf(candidate({ evidence: { snapshots: [], assertions: [] } }), source('remotive'));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});
