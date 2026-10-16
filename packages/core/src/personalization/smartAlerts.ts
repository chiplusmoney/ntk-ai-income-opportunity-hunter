import { capitalStatusLabel } from '../capitalStatus.js';
import type { FitOpportunity, PersonalFit } from './fit.js';
import type { PersonalNotice } from './notifications.js';
export interface AlertDetail { reason:string;opportunityId:string;title:string;source:string;sourceUrl:string|null;category:string;personalFit:number|null;capitalStatus:string;deadline:string|null;reward:string;uncertainty:string }
export function safeAlertLink(value:unknown):string|null {
  if(typeof value!=='string'||value.length>600)return null;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function alertDetail(n:PersonalNotice,row:(FitOpportunity & {sourceUrl?:string;attribution?:string})|undefined,fit:PersonalFit|undefined):AlertDetail {
  return {reason:n.body.slice(0,400),opportunityId:n.opportunityId,title:row?.title??n.title,source:row?.attribution??'Recorded application',sourceUrl:safeAlertLink(row?.sourceUrl),category:row?.category??'Application reminder',personalFit:fit?.score??null,capitalStatus:row?.capitalStatus??'unknown',deadline:row?.deadline??null,
    reward:row?.currency&&(row.rewardMin!==null||row.rewardMax!==null)?`${row.rewardMin??row.rewardMax}${row.rewardMax!==null&&row.rewardMin!==row.rewardMax?`–${row.rewardMax}`:''} ${row.currency} / ${row.rewardBasis} (advertised)`:'Reward unknown',
    uncertainty:'Eligibility and payment are not guaranteed. Profile or source requirements may be incomplete; review the official listing.'};
}
/** Whole entries only: never truncate a URL mid-message. */
export function smartTelegramMessage(details:readonly AlertDetail[],digest=false):string {
  let text=digest?'Your opportunity digest':'Opportunity alert';
  for(const d of details){if(!safeAlertLink(d.sourceUrl))continue;const entry=`\n\n${d.title.slice(0,140)}\n${d.reason.slice(0,180)}\nPersonal Fit: ${d.personalFit??'unknown'}/100 · ${d.category.slice(0,40)}\n${d.capitalStatus==='unknown'?'Capital status unknown':capitalStatusLabel(d.capitalStatus as Parameters<typeof capitalStatusLabel>[0])}\n${d.reward}\n${d.deadline?`Deadline: ${d.deadline}\n`:''}${d.uncertainty}\nSource: ${d.source.slice(0,70)}\n${d.sourceUrl}`;if(text.length+entry.length>3800)break;text+=entry;}
  return text;
}
