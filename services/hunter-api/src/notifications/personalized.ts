import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_PERSONAL_NOTIFICATION_POLICY, earningProfileFromLegacy, noticeAllowed, personalFit, personalizedNotices,
  readProofRecord, type ApplicationRecord, type FitOpportunity, type LearningState, type PersonalNotificationPolicy, type ProofRecord } from '@ntk/hunter-core';

/** Bounded free-tier pass: opt-in only, <=10 users, <=100 recent catalog rows, <=1 notice/user/pass.
 * The durable server-only attempt record survives deleting an in-app notification. Telegram never retries an ambiguous send. */
export async function dispatchPersonalNotices(db: Firestore, env: NodeJS.ProcessEnv, now = new Date()) {
  const users = await db.collection('users').where('m6Notifications.enabled','==',true).limit(10).get();
  if (users.empty) return { users: 0, written: 0 };
  const catalog = await db.collection('opportunities').where('visibility','==','published').orderBy('discoveredAt','desc').limit(100).get();
  const rows = catalog.docs.map(d => ({ ...d.data(), id: d.id })).filter(o => {
    const r = o as Record<string,unknown>;
    return typeof r.title === 'string' && typeof r.description === 'string' && typeof r.category === 'string'
      && ['skills','requirements','countries','paymentMethods'].every(k => Array.isArray(r[k]) && (r[k] as unknown[]).every(s => typeof s === 'string'));
  }) as FitOpportunity[];
  let written = 0;
  for (const user of users.docs) {
    const raw = user.data();
    const candidate = raw.m6Notifications as Partial<PersonalNotificationPolicy>;
    // Malformed preference records fail closed, including an invalid timezone.
    if (!candidate || candidate.enabled !== true || !Array.isArray(candidate.rules) || !Number.isInteger(candidate.quietStart) || !Number.isInteger(candidate.quietEnd) || candidate.quietStart! < 0 || candidate.quietStart! > 23 || candidate.quietEnd! < 0 || candidate.quietEnd! > 23 || typeof candidate.timezone !== 'string') continue;
    const policy: PersonalNotificationPolicy = { ...DEFAULT_PERSONAL_NOTIFICATION_POLICY, ...candidate, cooldownHours: Math.max(6,Number(candidate.cooldownHours) || 6), telegram: candidate.telegram === true };
    const [apps, proofDocs] = await Promise.all([user.ref.collection('applications').limit(500).get(),user.ref.collection('proofs').limit(100).get()]);
    if (apps.size === 500 || proofDocs.size === 100) continue;
    const applications = apps.docs.map(d => ({ ...d.data(), id: d.id })) as ApplicationRecord[];
    const proofs = proofDocs.docs.map(d => readProofRecord(d.data(),d.id)).filter((p): p is ProofRecord => p !== null);
    const p = earningProfileFromLegacy(raw);
    const learning: LearningState = { enabled: raw.recommendationLearning?.enabled === true, resetAt: raw.recommendationLearning?.resetAt ?? null };
    const fits = new Map(rows.map(o => [o.id,personalFit(o,p,proofs,applications,learning,now)]));
    const notices = personalizedNotices(rows,fits,applications,policy,now);
    for (const notice of notices) {
      const hash = createHash('sha256').update(notice.key).digest('hex').slice(0,32);
      const ledger = db.doc(`internal/personalNotifications/users/${user.id}`);
      const attempt = ledger.collection('attempts').doc(hash);
      const notification = user.ref.collection('notifications').doc(`m6-${hash}`);
      const reserved = await db.runTransaction(async tx => {
        const [state, previous] = await Promise.all([tx.get(ledger),tx.get(attempt)]);
        const data = state.data(); const day = now.toISOString().slice(0,10);
        if (!noticeAllowed({ key: notice.key, existingKeys: previous.exists ? [notice.key] : [], lastSentAt: data?.lastSentAt ?? null, sentToday: data?.day === day ? data.count : 0, policy, now })) return false;
        tx.set(ledger,{ day, count: data?.day === day ? data.count+1 : 1, lastSentAt: now.toISOString() });
        tx.create(attempt,{ rule: notice.rule, reservedAt: now.toISOString(), channel: 'in-app', telegramAttempted: policy.telegram && user.id === env.NOTIFICATION_OWNER_UID });
        tx.create(notification,{ title: notice.title, body: notice.body, opportunityId: notice.opportunityId, read: false, createdAt: now.toISOString(), channel: 'in-app', status: 'delivered' });
        return true;
      });
      if (!reserved) continue;
      written++;
      if (policy.telegram && user.id === env.NOTIFICATION_OWNER_UID && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_OWNER_CHAT_ID) {
        let delivered = false;
        try {
          const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_OWNER_CHAT_ID, text: `${notice.title}\n${notice.body}`, disable_web_page_preview: true }), signal: AbortSignal.timeout(8000) });
          const b = await r.json() as { ok?: boolean }; delivered = r.ok && b.ok === true;
        } catch { /* attempt stays consumed: avoid duplicate deliveries after an ambiguous timeout */ }
        await attempt.update({ telegramStatus: delivered ? 'delivered' : 'failed-or-unknown' });
      }
      break;
    }
  }
  return { users: users.size, written };
}
