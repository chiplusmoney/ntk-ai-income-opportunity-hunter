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
  return {at:now.toISOString(),scope:'public',sources:SOURCE_REGISTRY.map(s=>{
    const health=statuses.get(s.id)??null;
    return {id:s.id,name:s.name,endpoint:s.endpoint,adapterImplemented:s.adapterImplemented,enabled:!sourceScopeProblem(s,'public'),disabledReason:sourceScopeProblem(s,'public'),minIntervalMinutes:s.minIntervalMinutes,attribution:s.attribution,linkBack:s.requiresLinkBack,qualification:qualificationFor(s),health:health?{...health,nextDueAt:new Date(Date.parse(String(health.lastCrawl))+s.minIntervalMinutes*60000).toISOString(),rateLimitState:now.getTime()-Date.parse(String(health.lastCrawl))<s.minIntervalMinutes*60000?'waiting-for-interval':'due'}:null};}),days:days.docs.map(d=>d.data()),candidates:SOURCE_CANDIDATES,notifications:notifications.exists?{at:notifications.data()?.at,users:notifications.data()?.users??0,written:notifications.data()?.written??0,skipped:notifications.data()?.skipped??0}:null,
    bounds:{sourcesPerRun:6,publishedPerRun:200,catalogPerNotificationPass:100,savedRowsPerUser:50,usersPerPass:2,applicationsPerUser:50,proofsPerUser:20,alertsPerUserDay:3,maxTelegramSendAttempts:1},cost:'Existing free resources; no paid AI or subscriptions'};
}
