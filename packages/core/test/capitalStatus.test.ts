import { describe, expect, it } from 'vitest';
import { assessZeroCapital } from '../src/pipeline/zeroCapital.js';
import { CAPITAL_STATUS_LABELS, capitalStatusLabel, isCapitalRequired } from '../src/capitalStatus.js';
import { processCandidate, toPublished } from '../src/pipeline/run.js';
import { DEFAULT_WEIGHTS } from '../src/pipeline/scoring.js';
import { DEFAULT_ELIGIBILITY_PREFERENCES } from '../src/pipeline/eligibility.js';
import { SOURCE_REGISTRY } from '../src/sources/registry.js';
import { candidate, FIXED_NOW } from './helpers.js';
import type { CapitalStatus } from '../src/types.js';

/**
 * The product must never show "$0 capital" merely because no cost was found.
 * These tests pin that distinction at every layer it could leak through.
 */
const descriptions: Record<CapitalStatus, string> = {
  confirmed_free: 'This programme is free to join and we provide all equipment.',
  unconfirmed_no_cost_found: 'Build a responsive landing page with React and deliver the source code.',
  capital_required: 'A registration fee of $75 is required before you can begin work.'
};

describe('capital status derivation', () => {
  it('reports confirmed_free only when the source says so', () => {
    const result = assessZeroCapital({ description: descriptions.confirmed_free });
    expect(result.status).toBe('confirmed_free');
    expect(result.upfrontCostUsd).toBe(0);
  });

  it('reports unconfirmed_no_cost_found when the posting is silent', () => {
    const result = assessZeroCapital({ description: descriptions.unconfirmed_no_cost_found });
    expect(result.status).toBe('unconfirmed_no_cost_found');
    // The crucial part: silence must not become a $0 claim.
    expect(result.upfrontCostUsd).toBeNull();
    expect(result.costConfirmed).toBe(false);
  });

  it('reports capital_required when a payment is stated', () => {
    const result = assessZeroCapital({ description: descriptions.capital_required });
    expect(result.status).toBe('capital_required');
    expect(result.zeroCapital).toBe(false);
  });

  it('keeps zeroCapital true for both non-capital statuses', () => {
    expect(assessZeroCapital({ description: descriptions.confirmed_free }).zeroCapital).toBe(true);
    expect(assessZeroCapital({ description: descriptions.unconfirmed_no_cost_found }).zeroCapital).toBe(true);
  });
});

describe('capital status wording', () => {
  it('never words the unconfirmed state as a $0 guarantee', () => {
    const unconfirmed = CAPITAL_STATUS_LABELS.unconfirmed_no_cost_found;
    expect(unconfirmed.short).toMatch(/verify before proceeding/i);
    expect(unconfirmed.short).not.toMatch(/^\$0/);
    expect(unconfirmed.long).toMatch(/does not state that it is free/i);
  });

  it('words the confirmed state as a source claim', () => {
    expect(CAPITAL_STATUS_LABELS.confirmed_free.short).toBe('Confirmed $0 upfront');
    expect(CAPITAL_STATUS_LABELS.confirmed_free.long).toMatch(/source states/i);
  });

  it('has a label for every status', () => {
    for (const status of ['confirmed_free', 'unconfirmed_no_cost_found', 'capital_required'] as CapitalStatus[]) {
      expect(capitalStatusLabel(status).length).toBeGreaterThan(0);
      expect(capitalStatusLabel(status, 'long').length).toBeGreaterThan(0);
    }
  });

  it('flags only the capital-required status for exclusion', () => {
    expect(isCapitalRequired('capital_required')).toBe(true);
    expect(isCapitalRequired('confirmed_free')).toBe(false);
    expect(isCapitalRequired('unconfirmed_no_cost_found')).toBe(false);
  });
});

describe('capital status through the pipeline', () => {
  const source = SOURCE_REGISTRY.find(s => s.id === 'remotive')!;

  function run(description: string) {
    return processCandidate({
      candidate: candidate({ description }),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
  }

  it('maps each status onto the eligibility tri-state without upgrading it', () => {
    expect(run(descriptions.confirmed_free).candidate.noCapitalRequired).toBe(true);
    expect(run(descriptions.unconfirmed_no_cost_found).candidate.noCapitalRequired).toBe('unknown');
    expect(run(descriptions.capital_required).candidate.noCapitalRequired).toBe(false);
  });

  it('publishes the status on the record so the UI never re-derives it', async () => {
    const { candidate: processed } = run(descriptions.unconfirmed_no_cost_found);
    const record = await toPublished(processed, source);
    expect(record.capitalStatus).toBe('unconfirmed_no_cost_found');
    expect(record.zeroCapital).toBe(true);
  });

  it('carries confirmed_free through to the published record', async () => {
    const { candidate: processed } = run(descriptions.confirmed_free);
    const record = await toPublished(processed, source);
    expect(record.capitalStatus).toBe('confirmed_free');
  });

  it('refuses to publish a capital-required candidate rather than downgrading it', async () => {
    const { candidate: processed, rejection } = run(descriptions.capital_required);
    expect(rejection).not.toBeNull();
    await expect(toPublished(processed, source)).rejects.toThrow(/up-front cost/i);
  });

  it('records the status in the pipeline trace', () => {
    const { candidate: processed } = run(descriptions.unconfirmed_no_cost_found);
    expect(processed.trace.join(' ')).toContain('zero-capital:unconfirmed_no_cost_found');
  });

  it('explains the unconfirmed state to the user in the eligibility reasons', () => {
    const { candidate: processed } = run(descriptions.unconfirmed_no_cost_found);
    expect(processed.eligibility?.reasons.join(' ')).toMatch(/not a confirmed \$0/i);
  });
});
