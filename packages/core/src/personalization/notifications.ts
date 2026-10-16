import type { ApplicationRecord } from '../applications/lifecycle.js';
import type { FitOpportunity, PersonalFit } from './fit.js';

export const PERSONAL_NOTIFICATION_RULES = ['strong-fit', 'confirmed-zero', 'direct-paid', 'deadline', 'follow-up', 'status-reminder', 'payment-follow-up'] as const;
export interface PersonalNotificationPolicy {
  enabled: boolean; rules: string[]; timezone: string; quietStart: number; quietEnd: number;
  cooldownHours: number; telegram: boolean;
}
export const DEFAULT_PERSONAL_NOTIFICATION_POLICY: PersonalNotificationPolicy = { enabled: false, rules: ['follow-up', 'deadline'], timezone: 'Africa/Lagos', quietStart: 21, quietEnd: 8, cooldownHours: 6, telegram: false };
export interface PersonalNotice { key: string; rule: string; title: string; body: string; opportunityId: string }
export function inQuietHours(policy: PersonalNotificationPolicy, now: Date): boolean {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: policy.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
    return policy.quietStart === policy.quietEnd ? false : policy.quietStart < policy.quietEnd ? hour >= policy.quietStart && hour < policy.quietEnd : hour >= policy.quietStart || hour < policy.quietEnd;
  } catch { return true; }
}
export function personalizedNotices(rows: readonly FitOpportunity[], fits: ReadonlyMap<string, PersonalFit>, applications: readonly (ApplicationRecord & { followUpDate?: string | null })[], policy: PersonalNotificationPolicy, now: Date): PersonalNotice[] {
  if (!policy.enabled || inQuietHours(policy,now)) return [];
  const out: PersonalNotice[] = [];
  const day = now.toISOString().slice(0,10);
  const add = (rule: string, id: string, title: string, body: string, epoch = '') => { if (policy.rules.includes(rule)) out.push({ key: `${rule}:${id}:${epoch || 'once'}`, rule, title, body, opportunityId: id }); };
  for (const a of applications) {
    if (a.followUpDate && a.followUpDate <= day && !['paid','rejected','expired','withdrawn'].includes(a.state)) add('follow-up',a.id,'Follow-up due',`${a.title}: review your recorded next action.`,a.followUpDate);
    if (a.state === 'submitted' && Date.parse(a.updatedAt) < now.getTime() - 7*86400000) add('payment-follow-up',a.id,'Payment follow-up',`${a.title}: check payment terms and follow up; no payment is assumed.`,a.updatedAt);
    if (['preparing','applied','accepted','in_progress'].includes(a.state) && Date.parse(a.updatedAt) < now.getTime() - 7*86400000) add('status-reminder',a.id,'Application reminder',`${a.title}: review your real status.`,a.updatedAt);
  }
  for (const o of rows) {
    const f = fits.get(o.id); if (!f || f.eligible === 'blocked') continue;
    if (applications.some(a => a.opportunityId === o.id) && o.deadline && Date.parse(o.deadline) > now.getTime() && Date.parse(o.deadline) - now.getTime() < 2*86400000) add('deadline',o.id,'Saved deadline approaching',`${o.title}: check the official deadline.`,o.deadline);
    if (f.score >= 70 && f.eligible === 'confirmed') add('strong-fit',o.id,'Strong personal fit',`${o.title}: personal fit ${f.score}/100; review unknowns.`);
    if (o.capitalStatus === 'confirmed_free') add('confirmed-zero',o.id,'Confirmed $0 upfront',`${o.title}: source states no upfront cost; reward is separate.`);
    if (o.directPay === true && f.score >= 50) add('direct-paid',o.id,'Direct paid opportunity',`${o.title}: payment for work is stated; no earnings assumed.`);
  }
  return [...new Map(out.map(n => [n.key,n])).values()];
}
export function noticeAllowed(params: { key: string; existingKeys: readonly string[]; lastSentAt: string | null; sentToday: number; policy: PersonalNotificationPolicy; now: Date }): boolean {
  return params.policy.enabled && !inQuietHours(params.policy,params.now) && !params.existingKeys.includes(params.key) && params.sentToday < 3 && (!params.lastSentAt || params.now.getTime() - Date.parse(params.lastSentAt) >= Math.max(6,params.policy.cooldownHours)*3600000);
}
