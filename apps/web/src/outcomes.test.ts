import { describe, expect, it } from 'vitest';
import { createApplicationRecord, type ApplicationRecord } from '@ntk/hunter-core';
import { outcomeSummary } from './outcomes';
const application = (state: ApplicationRecord['state'] = 'saved'): ApplicationRecord => ({ ...createApplicationRecord({ id: 'real', opportunityId: 'real', title: 'Real opportunity', provider: 'Provider', category: 'Development', riskLevel: 'low', rankScore: 70, sourceUrl: 'https://example.invalid', attribution: 'Test', now: new Date() }), state });
describe('persisted personal outcomes only', () => {
  it('starts with honest zeros, no history and no success percentage', () => {
    expect(outcomeSummary([], [])).toEqual({ totalPaidUsd: 0, completed: 0, inProgress: 0, successRate: null, trend: [] });
  });
  it('cannot turn an expected reward or an application payment into earnings', () => {
    const a = { ...application('paid'), expectedRewardUsd: 100000, payment: { paidUsd: 200, paidAt: '2026-10-15', method: 'Test' } };
    expect(outcomeSummary([a], []).totalPaidUsd).toBe(0);
    expect(outcomeSummary([a], []).trend).toEqual([]);
  });
  it('calculates money and months exclusively from actual earnings documents', () => {
    const s = outcomeSummary([application('in_progress')], [{ id: '1', applicationId: 'real', paidUsd: 12.34, paidAt: '2026-10-15', method: null }, { id: '2', applicationId: 'real', paidUsd: 0.01, paidAt: '2026-10-14', method: null }]);
    expect(s.totalPaidUsd).toBe(12.35); expect(s.inProgress).toBe(1); expect(s.trend[0].amount).toBe(12.35);
  });
  it('rejects invalid payment figures and dates in historical data', () => {
    expect(outcomeSummary([], [{ id: '1', applicationId: 'real', paidUsd: NaN, paidAt: '2026-10-15', method: null }, { id: '2', applicationId: 'real', paidUsd: 200, paidAt: 'invalid', method: null }]).totalPaidUsd).toBe(0);
  });
  it('requires three real terminal outcomes and counts only actual in-progress records', () => {
    expect(outcomeSummary([application('paid'), application('rejected')], []).successRate).toBe(null);
    const s = outcomeSummary([application('paid'), application('rejected'), application('expired'), application('applied')], []);
    expect(s.successRate).toBe(33); expect(s.inProgress).toBe(0);
  });
});
