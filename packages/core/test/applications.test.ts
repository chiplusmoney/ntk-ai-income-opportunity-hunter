import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  APPLICATION_STATES,
  applyTransition,
  canTransition,
  createApplicationRecord,
  isTerminal,
  progressIndex,
  summariseEarnings
} from '../src/applications/index.js';
import type { ApplicationRecord, ApplicationState } from '../src/applications/index.js';

const NOW = new Date('2026-10-15T06:00:00.000Z');
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function record(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    ...createApplicationRecord({
      id: 'app-1',
      opportunityId: 'remotive:1',
      title: 'Remote Frontend Developer',
      provider: 'Acme Ltd',
      category: 'Development',
      riskLevel: 'low',
      rankScore: 81,
      sourceUrl: 'https://remotive.com/remote-jobs/1',
      attribution: 'Remotive',
      now: NOW
    }),
    ...overrides
  };
}

describe('lifecycle definition', () => {
  it('covers the documented states in order', () => {
    expect(APPLICATION_STATES).toEqual([
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
    ]);
  });

  it('marks only paid, rejected and expired as terminal', () => {
    expect(isTerminal('paid')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('expired')).toBe(true);
    expect(isTerminal('submitted')).toBe(false);
  });

  it('describes every state, with no dangling target', () => {
    for (const state of APPLICATION_STATES) {
      expect(ALLOWED_TRANSITIONS[state], state).toBeDefined();
      for (const target of ALLOWED_TRANSITIONS[state]) {
        expect(APPLICATION_STATES).toContain(target);
      }
    }
  });
});

describe('transitions', () => {
  it('records a legal transition with a timestamp', () => {
    const result = applyTransition(record(), { to: 'applied', now: later(1) });
    expect(result.ok).toBe(true);
    expect(result.record.state).toBe('applied');
    expect(result.record.appliedAt).toBe(later(1).toISOString());
    expect(result.record.history.map(h => h.state)).toEqual(['saved', 'applied']);
  });

  it('refuses a transition that skips a step', () => {
    const result = applyTransition(record(), { to: 'paid', now: later(2) });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/cannot move directly/i);
    expect(result.record.state).toBe('saved');
  });

  it('refuses a no-op transition', () => {
    const result = applyTransition(record(), { to: 'saved', now: later(1) });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/already in state/i);
  });

  it('refuses to rewrite a terminal state', () => {
    const rejected = record({ state: 'rejected', history: [{ state: 'rejected', at: NOW.toISOString() }] });
    const result = applyTransition(rejected, { to: 'applied', now: later(1) });
    expect(result.ok).toBe(false);
  });

  it('walks the full happy path', () => {
    let current = record();
    const path: ApplicationState[] = ['applied', 'accepted', 'in_progress', 'submitted'];
    for (const [index, state] of path.entries()) {
      const result = applyTransition(current, { to: state, now: later(index + 1) });
      expect(result.ok, `to ${state}: ${result.problems.join('; ')}`).toBe(true);
      current = result.record;
    }
    const paid = applyTransition(current, {
      to: 'paid',
      now: later(10),
      payment: { paidUsd: 250, paidAt: later(10).toISOString(), method: 'Wise' }
    });
    expect(paid.ok).toBe(true);
    expect(paid.record.payment.paidUsd).toBe(250);
    expect(paid.record.payment.method).toBe('Wise');
  });

  it('appends notes without discarding earlier ones', () => {
    const first = applyTransition(record(), { to: 'applied', now: later(1), note: 'Sent with portfolio.' });
    const second = applyTransition(first.record, { to: 'accepted', now: later(2), note: 'Client replied.' });
    expect(second.record.notes).toBe('Sent with portfolio.\nClient replied.');
  });

  it('records an expected reward without touching the payment record', () => {
    const result = applyTransition(record(), {
      to: 'applied',
      now: later(1),
      expectedRewardUsd: 400,
      expectedCurrency: 'USD'
    });
    expect(result.record.expectedRewardUsd).toBe(400);
    expect(result.record.expectedCurrency).toBe('USD');
    expect(result.record.payment.paidUsd).toBeNull();
  });

  it('rejects a negative expected reward', () => {
    const result = applyTransition(record(), { to: 'applied', now: later(1), expectedRewardUsd: -5 });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/non-negative/i);
  });
});

describe('payments are never invented', () => {
  function atSubmitted(): ApplicationRecord {
    let current = record();
    for (const [index, state] of (['applied', 'accepted', 'in_progress', 'submitted'] as ApplicationState[]).entries()) {
      current = applyTransition(current, { to: state, now: later(index + 1) }).record;
    }
    return current;
  }

  it('refuses to record a payment without an amount', () => {
    const result = applyTransition(atSubmitted(), { to: 'paid', now: later(10) });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/requires an amount and a date/i);
    expect(result.record.payment.paidUsd).toBeNull();
    expect(result.record.state).toBe('submitted');
  });

  it('refuses a zero or negative amount', () => {
    expect(applyTransition(atSubmitted(), { to: 'paid', now: later(10), payment: { paidUsd: 0, paidAt: later(10).toISOString() } }).ok).toBe(false);
    expect(applyTransition(atSubmitted(), { to: 'paid', now: later(10), payment: { paidUsd: -20, paidAt: later(10).toISOString() } }).ok).toBe(false);
  });

  it('refuses a payment without a valid date', () => {
    const result = applyTransition(atSubmitted(), {
      to: 'paid',
      now: later(10),
      payment: { paidUsd: 100, paidAt: 'not-a-date' }
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/valid payment date/i);
  });

  it('refuses to mark a paid application rejected afterwards', () => {
    const paid = applyTransition(atSubmitted(), {
      to: 'paid',
      now: later(10),
      payment: { paidUsd: 300, paidAt: later(10).toISOString() }
    });
    expect(paid.ok).toBe(true);
    const contradiction = applyTransition(paid.record, { to: 'rejected', now: later(11) });
    expect(contradiction.ok).toBe(false);
  });
});

describe('earnings summary', () => {
  it('reports no recorded income instead of a misleading zero', () => {
    const summary = summariseEarnings([record(), record({ id: 'app-2' })]);
    expect(summary.totalPaidUsd).toBe(0);
    expect(summary.hasRecordedIncome).toBe(false);
    expect(summary.withPaymentRecorded).toBe(0);
  });

  it('sums only recorded payments', () => {
    const summary = summariseEarnings([
      record({ id: 'a', state: 'paid', payment: { paidUsd: 100, paidAt: NOW.toISOString(), method: 'Wise' } }),
      record({ id: 'b', state: 'paid', payment: { paidUsd: 250.5, paidAt: NOW.toISOString(), method: 'PayPal' } }),
      record({ id: 'c', state: 'applied', expectedRewardUsd: 900 })
    ]);
    expect(summary.totalPaidUsd).toBe(350.5);
    expect(summary.paidCount).toBe(2);
    expect(summary.hasRecordedIncome).toBe(true);
    // Expectations stay separate from actuals.
    expect(summary.totalExpectedUsd).toBe(900);
  });

  it('counts a paid application with no amount as unpaid, without inventing one', () => {
    const summary = summariseEarnings([record({ id: 'a', state: 'paid' })]);
    expect(summary.paidCount).toBe(1);
    expect(summary.withPaymentRecorded).toBe(0);
    expect(summary.totalPaidUsd).toBe(0);
  });

  it('handles an empty ledger', () => {
    expect(summariseEarnings([])).toEqual({
      paidCount: 0,
      totalPaidUsd: 0,
      withPaymentRecorded: 0,
      totalExpectedUsd: 0,
      hasRecordedIncome: false
    });
  });
});

describe('tracker progress', () => {
  it('maps states to their step', () => {
    expect(progressIndex('saved')).toBe(0);
    expect(progressIndex('applied')).toBe(1);
    expect(progressIndex('paid')).toBe(5);
  });

  it('reports off-track states at the applied step', () => {
    expect(progressIndex('rejected')).toBe(1);
    expect(progressIndex('expired')).toBe(1);
  });
});

describe('record creation', () => {
  it('starts at saved with an empty ledger and a history entry', () => {
    const created = createApplicationRecord({
      id: 'app-9',
      opportunityId: 'remotive:9',
      title: 'Test',
      provider: 'Acme',
      category: 'Development',
      riskLevel: 'low',
      rankScore: 70,
      sourceUrl: 'https://example.test/9',
      attribution: 'Remotive',
      now: NOW
    });
    expect(created.state).toBe('saved');
    expect(created.payment).toEqual({ paidUsd: null, paidAt: null, method: null });
    expect(created.history).toHaveLength(1);
    expect(canTransition(created.state, 'applied')).toBe(true);
    expect(canTransition(created.state, 'paid')).toBe(false);
  });
});
