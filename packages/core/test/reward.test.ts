import { describe, expect, it } from 'vitest';
import {
  detectCurrency,
  isUsd,
  parseNumericToken,
  parseRewardText,
  rewardBasisHours,
  toHourlyEquivalent
} from '../src/reward.js';

/**
 * The strings in this file are REAL values observed in the live feeds on
 * 2026-10-14 (Remotive `salary`, Freelancer `Budget:` clauses, Devpost
 * `prize_amount`, Remote OK `salary_min`/`salary_max`).
 */
describe('parseNumericToken', () => {
  it('reads thousands separators', () => {
    expect(parseNumericToken('1,000')).toBe(1000);
    expect(parseNumericToken('138,000')).toBe(138000);
  });

  it('reads the k suffix', () => {
    expect(parseNumericToken('35k')).toBe(35000);
    expect(parseNumericToken('200k')).toBe(200000);
  });

  it('treats a single digit after a comma before "k" as a decimal comma', () => {
    // Remotive really publishes "$35,3k- $52k" meaning 35.3 thousand.
    expect(parseNumericToken('35,3k')).toBe(35300);
  });

  it('handles both separators together', () => {
    expect(parseNumericToken('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(parseNumericToken('1,234.56')).toBeCloseTo(1234.56, 2);
  });

  it('returns null for anything that is not a number', () => {
    expect(parseNumericToken('OTE')).toBeNull();
    expect(parseNumericToken('')).toBeNull();
    expect(parseNumericToken('competitive')).toBeNull();
  });
});

describe('detectCurrency', () => {
  it('detects symbols and codes', () => {
    expect(detectCurrency('$90 - $150 /hour')).toBe('USD');
    expect(detectCurrency('€100 - €1000 EUR')).toBe('EUR');
    expect(detectCurrency('₹ 100,000')).toBe('INR');
    expect(detectCurrency('£400 per week')).toBe('GBP');
  });

  it('returns null when no currency is stated', () => {
    expect(detectCurrency('35k - 52k')).toBeNull();
  });
});

describe('parseRewardText', () => {
  it('keeps an empty salary unknown instead of zero', () => {
    const reward = parseRewardText('');
    expect(reward.min).toBeNull();
    expect(reward.max).toBeNull();
    expect(reward.raw).toBeNull();
    expect(reward.basis).toBe('unknown');
  });

  it('reads a remotive range with the European decimal comma', () => {
    const reward = parseRewardText('$35,3k- $52k');
    expect(reward.min).toBe(35300);
    expect(reward.max).toBe(52000);
    expect(reward.currency).toBe('USD');
    // No period was stated, so the basis must stay unknown.
    expect(reward.basis).toBe('unknown');
  });

  it('reads hourly pay and keeps the stated basis', () => {
    const reward = parseRewardText('$50-$75 /hour');
    expect(reward.min).toBe(50);
    expect(reward.max).toBe(75);
    expect(reward.basis).toBe('hour');
    expect(toHourlyEquivalent(reward)).toBe(50);
  });

  it('ignores a qualifier prefix but still reads the numbers', () => {
    const reward = parseRewardText('OTE $25k - $35k');
    expect(reward.min).toBe(25000);
    expect(reward.max).toBe(35000);
  });

  it('reads a freelancer budget clause', () => {
    const reward = parseRewardText('€100 - €1000 EUR');
    expect(reward.min).toBe(100);
    expect(reward.max).toBe(1000);
    expect(reward.currency).toBe('EUR');
  });

  it('does not read an unrelated number as pay', () => {
    // "2-3 years" carries no currency marker.
    const reward = parseRewardText('2-3 years of experience required');
    expect(reward.min).toBeNull();
    expect(reward.max).toBeNull();
    expect(reward.currency).toBeNull();
  });

  it('always retains the verbatim source text', () => {
    expect(parseRewardText('$170k - $200k').raw).toBe('$170k - $200k');
  });
});

describe('currency handling', () => {
  it('never converts a non-USD amount', () => {
    expect(toHourlyEquivalent(parseRewardText('€50 /hour'))).toBeNull();
    expect(isUsd('EUR')).toBe(false);
    expect(isUsd(null)).toBe(true);
  });

  it('converts only stated periods', () => {
    expect(toHourlyEquivalent(parseRewardText('$200 per day'))).toBe(25);
    expect(toHourlyEquivalent(parseRewardText('$200k /year'))).toBe(100);
    expect(toHourlyEquivalent(parseRewardText('$5000 per month'))).toBeCloseTo(31.25, 2);
  });

  it('does not convert a one-off amount into an hourly rate', () => {
    expect(toHourlyEquivalent(parseRewardText('$2000'))).toBeNull();
    expect(rewardBasisHours('one-off')).toBeNull();
    expect(rewardBasisHours('hour')).toBe(1);
  });
});
