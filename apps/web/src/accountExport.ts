import { earningProfileFromLegacy, DEFAULT_PERSONAL_NOTIFICATION_POLICY, type PersonalNotificationPolicy, type ApplicationRecord, type ProofRecord } from '@ntk/hunter-core';
import { validateProfile } from './auth/userProfile';
import type { EarningRecord, PrivateNotification } from './outcomes';

interface ExportData {
  profile: Record<string, unknown> | null; saved: string[]; applications: ApplicationRecord[];
  earnings: EarningRecord[]; notifications: PrivateNotification[];
  proofs?: ProofRecord[];
}

/** Deliberate field selection prevents credentials or future internal fields
 * from leaking through a spread of the Auth user or raw Firestore objects. */
export function createAccountExport(identity: { displayName: string | null; email: string | null }, data: ExportData) {
  const policy = (data.profile?.m6Notifications ?? DEFAULT_PERSONAL_NOTIFICATION_POLICY) as PersonalNotificationPolicy;
  return {
    format: 'ntk-account-data', version: 2, exportedAt: new Date().toISOString(),
    account: { displayName: identity.displayName, email: identity.email },
    profile: data.profile ? validateProfile(data.profile).profile : null,
    earningProfile: data.profile ? earningProfileFromLegacy(data.profile) : null,
    notificationPolicy: { enabled:policy.enabled === true,rules:Array.isArray(policy.rules) ? policy.rules.filter(x => typeof x === 'string') : [],timezone:policy.timezone,quietStart:policy.quietStart,quietEnd:policy.quietEnd,cooldownHours:policy.cooldownHours,telegram:policy.telegram === true },
    recommendationLearning: data.profile?.recommendationLearning ? {
      enabled: (data.profile.recommendationLearning as { enabled?: boolean }).enabled === true,
      resetAt: (data.profile.recommendationLearning as { resetAt?: string }).resetAt ?? null
    } : null,
    proofs: (data.proofs ?? []).map(p => ({ id:p.id,title:p.title,kind:p.kind,description:p.description,skills:[...p.skills],url:p.url,provenance:p.provenance,status:p.status,sourceIds:[...p.sourceIds],createdAt:p.createdAt,updatedAt:p.updatedAt })),
    savedOpportunityIds: [...data.saved],
    applications: data.applications.map(a => ({
      id: a.id, opportunityId: a.opportunityId, title: a.title, provider: a.provider, category: a.category,
      riskLevel: a.riskLevel, rankScoreAtSave: a.rankScoreAtSave, state: a.state,
      history: a.history.map(h => ({ state: h.state, at: h.at })), appliedAt: a.appliedAt,
      expectedRewardUsd: a.expectedRewardUsd, expectedCurrency: a.expectedCurrency,
      payment: { paidUsd: a.payment.paidUsd, paidAt: a.payment.paidAt, method: a.payment.method },
      notes: a.notes, sourceUrl: a.sourceUrl, attribution: a.attribution, updatedAt: a.updatedAt,
      nextAction:a.nextAction ?? '',followUpDate:a.followUpDate ?? null,attachedProof:a.attachedProof ?? [],outcomeReason:a.outcomeReason ?? ''
    })),
    earnings: data.earnings.map(e => ({ id: e.id, applicationId: e.applicationId, paidUsd: e.paidUsd, paidAt: e.paidAt, method: e.method })),
    notifications: data.notifications.map(n => ({ id: n.id, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt, channel: n.channel, status: n.status }))
  };
}
