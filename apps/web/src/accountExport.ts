import type { ApplicationRecord } from '@ntk/hunter-core';
import { validateProfile } from './auth/userProfile';
import type { EarningRecord, PrivateNotification } from './outcomes';

interface ExportData {
  profile: Record<string, unknown> | null; saved: string[]; applications: ApplicationRecord[];
  earnings: EarningRecord[]; notifications: PrivateNotification[];
}

/** Deliberate field selection prevents credentials or future internal fields
 * from leaking through a spread of the Auth user or raw Firestore objects. */
export function createAccountExport(identity: { displayName: string | null; email: string | null }, data: ExportData) {
  return {
    format: 'ntk-account-data', version: 1, exportedAt: new Date().toISOString(),
    account: { displayName: identity.displayName, email: identity.email },
    profile: data.profile ? validateProfile(data.profile).profile : null,
    savedOpportunityIds: [...data.saved],
    applications: data.applications.map(a => ({
      id: a.id, opportunityId: a.opportunityId, title: a.title, provider: a.provider, category: a.category,
      riskLevel: a.riskLevel, rankScoreAtSave: a.rankScoreAtSave, state: a.state,
      history: a.history.map(h => ({ state: h.state, at: h.at })), appliedAt: a.appliedAt,
      expectedRewardUsd: a.expectedRewardUsd, expectedCurrency: a.expectedCurrency,
      payment: { paidUsd: a.payment.paidUsd, paidAt: a.payment.paidAt, method: a.payment.method },
      notes: a.notes, sourceUrl: a.sourceUrl, attribution: a.attribution, updatedAt: a.updatedAt
    })),
    earnings: data.earnings.map(e => ({ id: e.id, applicationId: e.applicationId, paidUsd: e.paidUsd, paidAt: e.paidAt, method: e.method })),
    notifications: data.notifications.map(n => ({ id: n.id, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt, channel: n.channel, status: n.status }))
  };
}
