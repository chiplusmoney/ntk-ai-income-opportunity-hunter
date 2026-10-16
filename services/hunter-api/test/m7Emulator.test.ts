import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore,type Firestore } from 'firebase-admin/firestore';
import { SOURCE_REGISTRY,makeCandidate,processCandidate,toPublished,DEFAULT_WEIGHTS,DEFAULT_ELIGIBILITY_PREFERENCES,DEFAULT_PERSONAL_NOTIFICATION_POLICY,EMPTY_EARNING_PROFILE,type OpportunityCandidate,type SourceRunRecord } from '@ntk/hunter-core';
import { PersistentRunGuard } from '../src/run/guard.js';
import { IntelligenceWriter } from '../src/firestore/intelligenceWriter.js';
import { FirestoreOpportunityWriter } from '../src/firestore/writer.js';
import { FirestoreDocumentStore } from '../src/firestore/firestoreStore.js';
import { loadConfig } from '../src/config.js';
import { silentLogger } from '../src/logging.js';
import { dispatchPersonalNotices } from '../src/notifications/personalized.js';
import { readOperations } from '../src/operations.js';
import express from 'express';
import { createPersonalRouter } from '../src/personal.js';
const enabled=process.env.FIREBASE_EMULATOR_TEST==='1';
const now=new Date('2026-10-16T12:00:00Z');const sources=new Map(SOURCE_REGISTRY.map(s=>[s.id,s]));
const uid='m7-owner';
const policy={...DEFAULT_PERSONAL_NOTIFICATION_POLICY,enabled:true,rules:['confirmed-zero'],quietStart:0,quietEnd:0,mode:'instant',inApp:true};
async function specimen(sourceId='jobicy',itemId='m7-job',rich=false):Promise<OpportunityCandidate> {
  const c=makeCandidate({source:sources.get(sourceId)!,sourceItemId:itemId,title:'Documentation engineer',provider:'M7 Example employer',category:'Writing',description:'Write clear documentation and maintain the product guides with the engineering team. A paid remote contract with no upfront payment required.',sourceUrl:`https://${sourceId==='jobicy'?'jobicy.com':'weworkremotely.com'}/jobs/${itemId}`,discoveredAt:now.toISOString(),publishedAt:now.toISOString(),reward:{min:null,max:null,currency:null,basis:'unknown',raw:null},remote:true,directPay:true,noCvRequired:'unknown',countries:['GLOBAL'],eligibilityText:'Worldwide',skills:[],requirements:[],paymentMethods:[],deadline:null,competition:false,snapshots:[{sourceId,sourceUrl:sources.get(sourceId)!.endpoint,fetchedAt:now.toISOString(),contentHash:'a'.repeat(64),bytes:100,httpStatus:200,excerpt:'Synthetic emulator listing; never a production record.'}],established:[{field:'title',value:'Documentation engineer',method:'structured-field',snapshotIndex:0,confidence:1},{field:'remote',value:true,method:'structured-field',snapshotIndex:0,confidence:1},...(rich?[{field:'provider',value:'M7 Example employer',method:'structured-field' as const,snapshotIndex:0,confidence:1},{field:'countries',value:'GLOBAL',method:'structured-field' as const,snapshotIndex:0,confidence:1}]:[])],unknownFields:['deadline','reward.min']});
  return processCandidate({candidate:c,source:sources.get(sourceId)!,existing:[],prefs:DEFAULT_ELIGIBILITY_PREFERENCES,weights:DEFAULT_WEIGHTS,userSkills:[],history:{},now}).candidate;
}
describe.skipIf(!enabled)('M7 production-boundary Firestore behavior',()=>{
  const app=initializeApp({projectId:'demo-ntk-hunter'},'m7-emulator');const db:Firestore=getFirestore(app);
  let writer:IntelligenceWriter;
  beforeAll(()=>{const store=FirestoreDocumentStore.create(loadConfig({FIREBASE_PROJECT_ID:'demo-ntk-hunter',FIRESTORE_EMULATOR_HOST:process.env.FIRESTORE_EMULATOR_HOST}),silentLogger);writer=new IntelligenceWriter(db,new FirestoreOpportunityWriter(store));});
  beforeEach(async()=>{await db.doc('internal/notificationCursor').set({lastUser:null});await db.recursiveDelete(db.doc(`users/${uid}`));await db.recursiveDelete(db.doc(`internal/personalNotifications/users/${uid}`));});
  afterAll(async()=>{await db.recursiveDelete(db.doc(`users/${uid}`));await db.recursiveDelete(db.doc(`internal/personalNotifications/users/${uid}`));for(const c of ['dedupe','sourceHealth','yield','intelligence','ingestionQueue','sourceSchedule'])await db.recursiveDelete(db.doc(`internal/${c}`));await db.doc('internal/schedulerLease').delete();const records=(await db.collection('opportunities').get()).docs.filter(d=>d.id.includes('m7-'));for(let i=0;i<records.length;i+=200){const batch=db.batch();for(const d of records.slice(i,i+200)){batch.delete(d.ref);batch.delete(db.collection('opportunityEvidence').doc(d.id));}await batch.commit();}await deleteApp(app);});
  async function write(cs:OpportunityCandidate[],at=now.toISOString()){
    const sourceRuns:SourceRunRecord[]=[...new Set(cs.map(c=>c.sourceId))].map(sourceId=>({sourceId,startedAt:at,finishedAt:at,ok:true,httpStatus:200,bytes:100,itemsSeen:cs.filter(c=>c.sourceId===sourceId).length,accepted:cs.filter(c=>c.sourceId===sourceId).length,rejected:0,error:null,skippedForInterval:false}));
    return writer.writeRun({published:await Promise.all(cs.map(c=>toPublished(c,sources.get(c.sourceId)!))),candidatesById:new Map(cs.map(c=>[c.id,c])),sourcesById:sources,sourceRuns,updatedAt:at});
  }
  async function enable(patch={}){await db.doc(`users/${uid}`).set({earningProfile:{...EMPTY_EARNING_PROFILE,country:'NG'},m6Notifications:{...policy,...patch}});}
  it('allows only one persistent scheduler lease across instances',async()=>{const a=new PersistentRunGuard(db),b=new PersistentRunGuard(db);expect(await a.acquire(now)).toBe(true);expect(await b.acquire(now)).toBe(false);await a.release();expect(await b.acquire(now)).toBe(true);await b.release();});
  it('reserves source intervals before network and survives a restart',async()=>{const s=sources.get('jobicy')!;const a=new PersistentRunGuard(db);expect(await a.reserve([s],now)).toEqual(['jobicy']);const b=new PersistentRunGuard(db);expect(await b.reserve([s],new Date(now.getTime()+359*60000))).toEqual([]);expect(await b.reserve([s],new Date(now.getTime()+360*60000))).toEqual(['jobicy']);});
  it('keeps richer evidence and secondary provenance across sources/runs without changing the canonical ID',async()=>{
    const a=await specimen(),b=await specimen('weworkremotely','m7-copy',true);expect((await write([a,b])).ok).toBe(true);
    const canonical=await db.collection('opportunities').doc(a.id).get();expect(canonical.data()?.sourceId).toBe('weworkremotely');expect(canonical.data()?.provenance).toHaveLength(2);expect((await db.collection('opportunities').doc(b.id).get()).exists).toBe(false);
    const e=await db.collection('opportunityEvidence').doc(a.id).get();expect(e.data()?.sourceId).toBe('weworkremotely');
    await write([a],new Date(now.getTime()+3600000).toISOString());expect((await db.collection('opportunities').doc(a.id).get()).data()?.sourceId).toBe('weworkremotely');expect((await db.collection('opportunityEvidence').doc(a.id).get()).data()?.sourceId).toBe('weworkremotely');
    expect((await db.collection('opportunities').doc(a.id).get()).data()?.discoveredAt).toBe(now.toISOString());
  });
  it('records real source health and new/known daily yield without receipts',async()=>{const c=await specimen('jobicy','m7-independent');await write([{...c,title:'Distinct engineer'}],new Date(now.getTime()+7200000).toISOString());const ops=await readOperations(db,now);expect(ops.sources.find(s=>s.id==='jobicy')?.health?.fetched).toBe(1);expect(ops.sources.find(s=>s.id==='devpost')?.enabled).toBe(false);expect(ops.days[0]?.new).toBeGreaterThan(0);expect((await db.collection(`users/${uid}/earnings`).get()).empty).toBe(true);});
  it('resumes deferred records without making another provider fetch',async()=>{
    const c=await specimen('jobicy','m7-queued');await db.collection('internal/ingestionQueue/records').doc(c.id).set({candidate:c,queuedAt:now.toISOString()});const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('no source fetch while resuming'));
    const r=await writer.writeRun({published:[],candidatesById:new Map(),sourcesById:sources,sourceRuns:[],updatedAt:new Date(now.getTime()+10800000).toISOString()});expect(r.ok).toBe(true);expect((await db.collection('opportunities').doc(c.id).get()).exists).toBe(true);expect((await db.collection('internal/ingestionQueue/records').doc(c.id).get()).exists).toBe(false);expect(network).not.toHaveBeenCalled();network.mockRestore();
  });
  it('creates an in-app delivery, and deletion does not permit repeat delivery',async()=>{await enable();const f=vi.fn(async()=>new Response('{"ok":true}'));expect((await dispatchPersonalNotices(db,{},now,f)).written).toBe(1);const notices=await db.collection(`users/${uid}/notifications`).get();expect(notices.size).toBe(1);await notices.docs[0]!.ref.delete();await db.doc('internal/notificationCursor').set({lastUser:null});expect((await dispatchPersonalNotices(db,{},new Date(now.getTime()+7*3600000),f)).written).toBeLessThanOrEqual(1);expect(f).not.toHaveBeenCalled();const attempts=await db.collection(`internal/personalNotifications/users/${uid}/attempts`).get();expect(new Set(attempts.docs.map(d=>d.id)).size).toBe(attempts.size);});
  it('never sends or creates a notice without opt-in',async()=>{await enable({enabled:false});const f=vi.fn();expect((await dispatchPersonalNotices(db,{},now,f)).written).toBe(0);expect(f).not.toHaveBeenCalled();});
  it('honors quiet hours without consuming a send',async()=>{await enable({quietStart:0,quietEnd:23});const f=vi.fn();expect((await dispatchPersonalNotices(db,{},now,f)).written).toBe(0);expect((await db.collection(`internal/personalNotifications/users/${uid}/attempts`).get()).empty).toBe(true);});
  it('limits a digest to selected size and one delivery per local day',async()=>{await enable({mode:'digest',digestHour:9,digestSize:1});expect((await dispatchPersonalNotices(db,{},now)).written).toBe(1);const d=(await db.collection(`users/${uid}/notifications`).get()).docs[0]!.data();expect(d.mode).toBe('digest');expect(d.items).toHaveLength(1);await db.doc('internal/notificationCursor').set({lastUser:null});expect((await dispatchPersonalNotices(db,{},new Date(now.getTime()+7*3600000))).written).toBe(0);});
  it('does not retry an ambiguous Telegram attempt and never leaks it to a different destination',async()=>{await enable({telegram:true});const f=vi.fn(async()=>{throw Error('ambiguous timeout');});const env={NOTIFICATION_OWNER_UID:uid,TELEGRAM_BOT_TOKEN:'test-only-not-a-real-telegram-token',TELEGRAM_OWNER_CHAT_ID:'test-only-chat'};expect((await dispatchPersonalNotices(db,env,now,f)).written).toBe(1);expect(f).toHaveBeenCalledTimes(1);const call=f.mock.calls[0] as unknown[];expect(String(call[0])).toContain('api.telegram.org');await db.doc('internal/notificationCursor').set({lastUser:null});await dispatchPersonalNotices(db,env,now,f);expect(f).toHaveBeenCalledTimes(1);const ledgers=await db.collection(`internal/personalNotifications/users/${uid}/attempts`).get();expect(ledgers.docs[0]?.data()?.telegramStatus).toBe('failed-or-unknown');});
  it('restricts Telegram to the configured owner while retaining the in-app channel',async()=>{await enable({telegram:true});const f=vi.fn();expect((await dispatchPersonalNotices(db,{NOTIFICATION_OWNER_UID:'different-owner',TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_OWNER_CHAT_ID:'test-only'},now,f)).written).toBe(1);expect(f).not.toHaveBeenCalled();});
  it('authenticates operations and refuses another UID before returning source data',async()=>{
    const app=express();app.use('/v1',createPersonalRouter(db,async(token)=>({uid:token==='test-owner'?uid:'different'}) as never,uid));
    const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw Error('No HTTP listener');const base=`http://127.0.0.1:${address.port}/v1/operations`;
    try{expect((await fetch(base)).status).toBe(401);expect((await fetch(base,{headers:{authorization:'Bearer test-other'}})).status).toBe(403);const r=await fetch(base,{headers:{authorization:'Bearer test-owner'}});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect((await r.json() as {sources:unknown[]}).sources).toHaveLength(9);}finally{await new Promise<void>(r=>server.close(()=>r()));}
  });
  it('caps published writes and resumes the deferred 201st record',async()=>{
    const base=await specimen('jobicy','m7-cap-base');
    const rows=Array.from({length:201},(_,i)=>({...base,id:`jobicy:m7-cap-${i}`,sourceItemId:`m7-cap-${i}`,title:`Distinct synthetic contract ${i}`,provider:`Synthetic employer ${i}`,sourceUrl:`https://jobicy.com/jobs/m7-cap-${i}`}));
    await write(rows,new Date(now.getTime()+24*3600000).toISOString());
    const queued=await db.collection('internal/ingestionQueue/records').get();expect(queued.size).toBe(1);
    await writer.writeRun({published:[],candidatesById:new Map(),sourcesById:sources,sourceRuns:[],updatedAt:new Date(now.getTime()+25*3600000).toISOString()});
    expect((await db.collection('internal/ingestionQueue/records').get()).empty).toBe(true);
    const docs=await db.getAll(...rows.map(r=>db.collection('opportunities').doc(r.id)));expect(docs.filter(d=>d.exists)).toHaveLength(201);
  },60000);

});
