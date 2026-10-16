import type { Firestore } from 'firebase-admin/firestore';
import { SOURCE_REGISTRY, SOURCE_CANDIDATES, qualificationFor, sourceScopeProblem } from '@ntk/hunter-core';

/** Owner authorization belongs to the ID-token router. Internal data is never public Firestore state. */
export async function readOperations(db:Firestore,now=new Date()) {
  const [sources,days,notifications]=await Promise.all([
    db.getAll(...SOURCE_REGISTRY.map(s=>db.doc(`internal/sourceHealth/sources/${s.id}`))),
    db.collection('internal/yield/days').orderBy('day','desc').limit(7).get(),
    db.doc('internal/notificationCursor').get()
  ]);
  const statuses=new Map(sources.map(d=>[d.id,d.data()]));
  // Migration-safe legacy readback: a source not yet due in M7 still has a real
  // M6 crawl history. Missing M7 quality fields stay explicitly unmeasured.
  const missing=SOURCE_REGISTRY.filter(s=>s.enabled&&s.publicDeploymentAllowed&&!statuses.get(s.id));
  if(missing.length){
    const legacy=await db.collection('internalSourceRuns').orderBy('startedAt','desc').limit(200).get();
    for(const source of missing){const runs=legacy.docs.map(d=>d.data()).filter(r=>r.sourceId===source.id&&!r.skippedForInterval);const last=runs[0];if(!last)continue;
      statuses.set(source.id,{sourceId:source.id,lastCrawl:last.startedAt,lastSuccess:runs.find(r=>r.ok)?.finishedAt??null,ok:last.ok,httpStatus:last.httpStatus,error:last.error??null,fetched:last.itemsSeen,accepted:last.accepted,rejected:last.rejected,duplicates:null,unknownFields:null,writes:null,new:null,known:null,published:null,rewardKnownRate:null,locationKnownRate:null,deadlineKnownRate:null,attempts:null,successes:null,operationalScore:null,measurementScope:'Legacy production run; M7 quality fields pending the next due crawl'});
    }
  }
  return {at:now.toISOString(),scope:'public',sources:SOURCE_REGISTRY.map(s=>{
    const health=statuses.get(s.id)??null;
    return {id:s.id,name:s.name,endpoint:s.endpoint,adapterImplemented:s.adapterImplemented,enabled:!sourceScopeProblem(s,'public'),disabledReason:sourceScopeProblem(s,'public'),minIntervalMinutes:s.minIntervalMinutes,attribution:s.attribution,linkBack:s.requiresLinkBack,qualification:qualificationFor(s),health:health?{...health,nextDueAt:new Date(Date.parse(String(health.lastCrawl))+s.minIntervalMinutes*60000).toISOString(),rateLimitState:now.getTime()-Date.parse(String(health.lastCrawl))<s.minIntervalMinutes*60000?'waiting-for-interval':'due'}:null};}),days:days.docs.map(d=>d.data()),candidates:SOURCE_CANDIDATES,notifications:notifications.exists?{at:notifications.data()?.at,users:notifications.data()?.users??0,written:notifications.data()?.written??0,skipped:notifications.data()?.skipped??0}:null,
    bounds:{sourcesPerRun:6,publishedPerRun:200,catalogPerNotificationPass:100,savedRowsPerUser:50,usersPerPass:2,applicationsPerUser:50,proofsPerUser:20,alertsPerUserDay:3,maxTelegramSendAttempts:1},cost:'Existing free resources; no paid AI or subscriptions'};
}
