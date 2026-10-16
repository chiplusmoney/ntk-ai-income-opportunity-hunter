import type { ApplicationRecord } from '../applications/lifecycle.js';
import type { FitOpportunity, PersonalFit } from './fit.js';

export const PERSONAL_NOTIFICATION_RULES = ['strong-fit', 'confirmed-zero', 'direct-paid', 'no-cv-portfolio', 'deadline', 'follow-up', 'status-reminder', 'next-action', 'payment-follow-up'] as const;
export interface PersonalNotificationPolicy {
  enabled: boolean; rules: string[]; timezone: string; quietStart: number; quietEnd: number;
  cooldownHours: number; telegram: boolean;
  mode?: 'instant'|'digest'; minimumFit?:number; categories?:string[]; countries?:string[];
  maxPerDay?:number; digestHour?:number; digestSize?:number; inApp?:boolean;
}
export const DEFAULT_PERSONAL_NOTIFICATION_POLICY: PersonalNotificationPolicy = { enabled: false, rules: ['follow-up', 'deadline'], timezone: 'Africa/Lagos', quietStart: 21, quietEnd: 8, cooldownHours: 6, telegram: false };
export interface PersonalNotice { key: string; rule: string; title: string; body: string; opportunityId: string }
export function inQuietHours(policy: PersonalNotificationPolicy, now: Date): boolean {
  if(![policy.quietStart,policy.quietEnd].every(n=>Number.isInteger(n)&&n>=0&&n<=23))return true;
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: policy.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
    return policy.quietStart === policy.quietEnd ? false : policy.quietStart < policy.quietEnd ? hour >= policy.quietStart && hour < policy.quietEnd : hour >= policy.quietStart || hour < policy.quietEnd;
  } catch { return true; }
}
export function personalizedNotices(rows: readonly FitOpportunity[], fits: ReadonlyMap<string, PersonalFit>, applications: readonly (ApplicationRecord & { followUpDate?: string | null })[], policy: PersonalNotificationPolicy, now: Date): PersonalNotice[] {
  if (!policy.enabled || inQuietHours(policy,now)) return [];
  const out: PersonalNotice[] = [];
  const day = localNotificationTime(policy.timezone,now).day;
  const add = (rule: string, id: string, title: string, body: string, epoch = '') => { if (policy.rules.includes(rule)) out.push({ key: `${rule}:${id}:${epoch || 'once'}`, rule, title, body, opportunityId: id }); };
  for (const a of applications) {
    if (a.followUpDate && a.followUpDate <= day && !['paid','rejected','expired','withdrawn'].includes(a.state)) add('follow-up',a.id,'Follow-up due',`${a.title}: review your recorded next action.`,a.followUpDate);
    if(a.followUpDate && a.followUpDate<=day && a.nextAction && !['paid','rejected','expired','withdrawn'].includes(a.state))add('next-action',a.id,'Next action due',`${a.title}: ${a.nextAction.slice(0,200)}`,`${a.followUpDate}:${a.updatedAt}`);
    if (a.state === 'submitted' && Date.parse(a.updatedAt) < now.getTime() - 7*86400000) add('payment-follow-up',a.id,'Payment follow-up',`${a.title}: check payment terms and follow up; no payment is assumed.`,a.updatedAt);
    if (['preparing','applied','accepted','in_progress'].includes(a.state) && Date.parse(a.updatedAt) < now.getTime() - 7*86400000) add('status-reminder',a.id,'Application reminder',`${a.title}: review your real status.`,a.updatedAt);
  }
  for (const o of rows) {
    const f = fits.get(o.id); if (!f || f.eligible === 'blocked') continue;
    if (applications.some(a => a.opportunityId === o.id) && o.deadline && Date.parse(o.deadline) > now.getTime() && Date.parse(o.deadline) - now.getTime() < 2*86400000) add('deadline',o.id,'Saved deadline approaching',`${o.title}: check the official deadline.`,o.deadline);
    if(f.score<(policy.minimumFit??0))continue;
    if(policy.categories?.length && !policy.categories.includes(o.category))continue;
    if(policy.countries?.length && !o.countries.some(c=>policy.countries!.includes(c)||c==='GLOBAL'))continue;
    if (f.score >= Math.max(70,policy.minimumFit??0) && f.eligible === 'confirmed') add('strong-fit',o.id,'Strong personal fit',`${o.title}: personal fit ${f.score}/100; review unknowns.`);
    if (o.capitalStatus === 'confirmed_free') add('confirmed-zero',o.id,'Confirmed $0 upfront',`${o.title}: source states no upfront cost; reward is separate.`);
    if (o.directPay === true && f.score >= 50) add('direct-paid',o.id,'Direct paid opportunity',`${o.title}: payment for work is stated; no earnings assumed.`);
    if(f.path.cv==='confirmed-not-required' && f.path.portfolio==='confirmed-not-required')add('no-cv-portfolio',o.id,'No CV / portfolio required',`${o.title}: both requirements explicitly waived by the source; check other eligibility.`);
  }
  return [...new Map(out.map(n => [n.key,n])).values()];
}
export function noticeAllowed(params: { key: string; existingKeys: readonly string[]; lastSentAt: string | null; sentToday: number; policy: PersonalNotificationPolicy; now: Date }): boolean {
  return params.policy.enabled && !inQuietHours(params.policy,params.now) && !params.existingKeys.includes(params.key) && params.sentToday < Math.min(3,params.policy.maxPerDay??3) && (!params.lastSentAt || params.now.getTime() - Date.parse(params.lastSentAt) >= Math.max(6,params.policy.cooldownHours)*3600000);
}

export function readNotificationPolicy(value: unknown): PersonalNotificationPolicy|null {
  if(!value || typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(typeof v.enabled!=='boolean' || typeof v.telegram!=='boolean' || typeof v.timezone!=='string' || !Array.isArray(v.rules) || !v.rules.every(x=>typeof x==='string' && (PERSONAL_NOTIFICATION_RULES as readonly string[]).includes(x)) || ![v.quietStart,v.quietEnd].every(x=>typeof x==='number' && Number.isInteger(x)&&x>=0&&x<=23) || typeof v.cooldownHours!=='number' || !Number.isFinite(v.cooldownHours) || v.cooldownHours<6 || v.cooldownHours>168)return null;
  try {new Intl.DateTimeFormat('en',{timeZone:v.timezone}).format();}catch{return null;}
  const integer=(key:string,min:number,max:number)=>v[key]===undefined || typeof v[key]==='number' && Number.isInteger(v[key]) && (v[key] as number)>=min && (v[key] as number)<=max;
  if(!integer('minimumFit',0,100)||!integer('maxPerDay',1,3)||!integer('digestHour',0,23)||!integer('digestSize',1,10)||v.mode!==undefined&&!['instant','digest'].includes(String(v.mode))||v.inApp!==undefined&&typeof v.inApp!=='boolean')return null;
  for(const k of ['categories','countries'])if(v[k]!==undefined&&(!Array.isArray(v[k])||(v[k] as unknown[]).length>20||!(v[k] as unknown[]).every(x=>typeof x==='string'&&x.length<=60)))return null;
  return {...DEFAULT_PERSONAL_NOTIFICATION_POLICY,mode:'instant',minimumFit:0,categories:[],countries:[],maxPerDay:3,digestHour:9,digestSize:5,inApp:true,...v} as unknown as PersonalNotificationPolicy;
}

export function localNotificationTime(timezone:string,now:Date):{day:string;hour:number} {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const part=(k:string)=>parts.find(p=>p.type===k)?.value??'';
  return {day:`${part('year')}-${part('month')}-${part('day')}`,hour:Number(part('hour'))};
}

export function digestNotices(notices:readonly PersonalNotice[],size=5):PersonalNotice[] {
  return [...new Map(notices.map(n=>[n.opportunityId,n])).values()].slice(0,Math.max(1,Math.min(10,size)));
}
