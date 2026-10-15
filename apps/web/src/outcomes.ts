import type { ApplicationRecord } from '@ntk/hunter-core';

export interface EarningRecord { id: string; applicationId: string; paidUsd: number; paidAt: string; method: string | null }
export interface PrivateNotification { id: string; title: string; body: string; read: boolean; createdAt: string; channel: string; status: string }

/** Never infer receipts from advertised rewards or application payment fields. */
export function outcomeSummary(applications: ApplicationRecord[], earnings: EarningRecord[]) {
  const valid = earnings.filter(e => Number.isFinite(e.paidUsd) && e.paidUsd > 0 && Number.isFinite(Date.parse(e.paidAt)));
  const terminal = applications.filter(a => ['paid', 'rejected', 'expired'].includes(a.state));
  const paid = applications.filter(a => a.state === 'paid').length;
  const months = new Map<string, number>();
  for (const e of valid) { const month = e.paidAt.slice(0, 7); months.set(month, (months.get(month) ?? 0) + e.paidUsd); }
  return {
    totalPaidUsd: Math.round(valid.reduce((sum, e) => sum + e.paidUsd, 0) * 100) / 100,
    completed: paid,
    inProgress: applications.filter(a => a.state === 'in_progress').length,
    // A single terminal outcome is insufficient history for a useful rate.
    successRate: terminal.length >= 3 ? Math.round(paid / terminal.length * 100) : null,
    trend: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }))
  };
}
