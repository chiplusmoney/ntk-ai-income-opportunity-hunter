import type { FitOpportunity, PersonalFit } from '../personalization/fit.js';
import type { OpportunityCandidate, SourceRunRecord } from '../types.js';

export function sourceQuality(run: SourceRunRecord, rows: readonly OpportunityCandidate[]) {
  const items=rows.filter(x=>x.sourceId===run.sourceId);
  const rate=(n:number)=>items.length ? Math.round(n/items.length*1000)/10 : null;
  return {
    fetched:run.itemsSeen,normalized:items.length,malformed:Math.max(0,run.itemsSeen-items.length),accepted:run.accepted,rejected:run.rejected,
    duplicates:items.filter(x=>x.dedupe?.verdict==='duplicate').length,
    published:items.filter(x=>x.visibility==='published').length,
    unknownFields:items.reduce((n,x)=>n+x.evidence.assertions.filter(a=>a.method==='absent').length,0),
    rewardKnownRate:rate(items.filter(x=>x.reward.currency && (x.reward.min!==null || x.reward.max!==null)).length),
    locationKnownRate:rate(items.filter(x=>x.countries.length>0).length),
    deadlineKnownRate:rate(items.filter(x=>x.deadline!==null).length),
    staleRate:rate(items.filter(x=>x.risk?.findings.some(f=>/stale/i.test(f.code))).length),
    verificationSurvivalRate:run.itemsSeen ? Math.round(run.accepted/run.itemsSeen*1000)/10 : null
  };
}
export function operationalSourceScore(q:ReturnType<typeof sourceQuality>,successRate:number):number|null {
  if(!q.normalized)return null;
  const malformed=q.fetched?q.malformed/q.fetched*100:0,duplicates=q.normalized?q.duplicates/q.normalized*100:0;
  return Math.round(Math.max(0,Math.min(100,successRate*0.2+(q.rewardKnownRate??0)*0.2+(q.locationKnownRate??0)*0.2+(q.deadlineKnownRate??0)*0.1+(q.verificationSurvivalRate??0)*0.3-malformed*0.2-duplicates*0.1)));
}

/** One pass over a bounded catalog, labelled as a snapshot rather than discovery totals. */
export function opportunityYield(rows: readonly FitOpportunity[], fits: ReadonlyMap<string,PersonalFit>, now: Date) {
  const category:Record<string,number>={},country:Record<string,number>={};
  const out={rows:rows.length,confirmedZero:0,unconfirmedCost:0,capitalRequired:0,rewardKnown:0,rewardUnknown:0,directIncome:0,highFit:0,blockedFit:0,unknownFit:0,expiringSoon:0,fitBands:{'0–39':0,'40–69':0,'70–100':0},category,country};
  for(const o of rows) {
    category[o.category]=(category[o.category]??0)+1;
    for(const c of o.countries.length ? o.countries : ['UNKNOWN']) country[c]=(country[c]??0)+1;
    if(o.capitalStatus==='confirmed_free') out.confirmedZero++;else if(o.capitalStatus==='capital_required')out.capitalRequired++;else out.unconfirmedCost++;
    if(o.currency && (o.rewardMin!==null || o.rewardMax!==null))out.rewardKnown++;else out.rewardUnknown++;
    if(o.directPay===true)out.directIncome++;
    const f=fits.get(o.id);if(f){out.fitBands[f.score>=70?'70–100':f.score>=40?'40–69':'0–39']++;if(f.score>=70 && f.eligible!=='blocked')out.highFit++;if(f.eligible==='blocked')out.blockedFit++;if(f.eligible==='unknown')out.unknownFit++;}
    if(o.deadline && Date.parse(o.deadline)>now.getTime() && Date.parse(o.deadline)-now.getTime()<2*86400000)out.expiringSoon++;
  }
  return out;
}
