import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { initializeApp,deleteApp } from 'firebase-admin/app';
import { getFirestore,type Firestore } from 'firebase-admin/firestore';
import { dispatchPersonalNotices } from '../src/notifications/personalized.js';
import { importOutcomeProof,recordApplicationTransition } from '../src/personal.js';
import { DEFAULT_PERSONAL_NOTIFICATION_POLICY,EMPTY_EARNING_PROFILE,createApplicationRecord } from '@ntk/hunter-core';
const enabled = process.env.FIREBASE_EMULATOR_TEST === '1';
describe.skipIf(!enabled)('M6 real Firestore server actions',() => {
  const app = initializeApp({ projectId:'demo-ntk-hunter' },'m6-personal-actions');
  const db: Firestore = getFirestore(app); const uid = 'm6-notice-alice'; const now = new Date('2026-10-16T12:00:00Z');
  beforeAll(async () => {
    await db.doc(`users/${uid}`).set({ earningProfile:{ ...EMPTY_EARNING_PROFILE,country:'NG',skills:['React'] },m6Notifications:{ ...DEFAULT_PERSONAL_NOTIFICATION_POLICY,enabled:true,rules:['confirmed-zero'],quietStart:0,quietEnd:0 } });
    await db.doc('opportunities/m6-notice-real').set({ id:'m6-notice-real',visibility:'published',title:'Recorded task',category:'Development',description:'No upfront cost',requirements:[],skills:['React'],countries:['GLOBAL'],remote:true,directPay:true,noCvRequired:'unknown',capitalStatus:'confirmed_free',paymentMethods:[],deadline:null,rewardMin:null,rewardMax:null,currency:null,rewardBasis:'unknown',rankScore:80,confidence:60,riskLevel:'low',discoveredAt:now.toISOString() });
  });
  afterAll(async () => { await db.recursiveDelete(db.doc(`users/${uid}`)); await db.recursiveDelete(db.doc(`internal/personalNotifications/users/${uid}`)); await db.doc('opportunities/m6-notice-real').delete(); await deleteApp(app); });
  it('persists one deduplicated server notice without contacting Telegram',async () => {
    const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('no live destinations allowed'));
    const first = await dispatchPersonalNotices(db,{},now); expect(first.written).toBe(1);
    const second = await dispatchPersonalNotices(db,{},now); expect(second.written).toBe(0);
    expect((await db.collection(`users/${uid}/notifications`).get()).size).toBe(1); expect(network).not.toHaveBeenCalled(); network.mockRestore();
  });
  it('keeps dedupe after deleting a notification receipt',async () => {
    const notifications = await db.collection(`users/${uid}/notifications`).get(); for (const n of notifications.docs) await n.ref.delete();
    await db.doc(`users/${uid}`).set({ m6Notifications:{ ...DEFAULT_PERSONAL_NOTIFICATION_POLICY,enabled:true,rules:['confirmed-zero'],quietStart:0,quietEnd:0 } },{ merge:true });
    expect((await dispatchPersonalNotices(db,{},new Date(now.getTime()+7*3600000))).written).toBe(0);
  });
  it('fails closed for invalid notification timezone',async () => {
    await db.doc(`users/${uid}`).set({ m6Notifications:{ enabled:true,rules:['confirmed-zero'],timezone:'invalid',quietStart:0,quietEnd:0 } },{ merge:true });
    expect((await dispatchPersonalNotices(db,{},new Date(now.getTime()+86400000))).written).toBe(0);
  });
  it('uses authenticated UID paths and preserves genuine application outcomes',async () => {
    const a = createApplicationRecord({ id:'m6-real-app',opportunityId:'m6-real-app',title:'Real recorded project',provider:'Owner source',category:'Development',riskLevel:'low',rankScore:60,sourceUrl:'https://example.com/official',attribution:'Emulator',now });
    await db.doc(`users/${uid}/applications/${a.id}`).set(a);
    await expect(recordApplicationTransition(db,'m6-bob',a.id,{ to:'applied' },now)).rejects.toThrow('no longer exists');
    await expect(importOutcomeProof(db,uid,a.id,now)).rejects.toThrow('Only a genuine');
    await recordApplicationTransition(db,uid,a.id,{ to:'preparing' },now);
    expect((await db.doc(`users/${uid}/applications/${a.id}`).get()).data()?.appliedAt).toBeNull();
    for (const to of ['applied','accepted','in_progress','submitted']) await recordApplicationTransition(db,uid,a.id,{ to },now);
    expect((await importOutcomeProof(db,uid,a.id,now)).status).toBe('imported');
    const p = (await db.doc(`users/${uid}/proofs/outcome-${a.id}`).get()).data();
    expect(p?.sourceIds).toEqual([a.id]); expect(p?.provenance).toContain('owner-declared');
    expect((await db.collection(`users/${uid}/earnings`).get()).empty).toBe(true);
  });
  it('rejects future payments at the trusted server boundary',async () => {
    await expect(recordApplicationTransition(db,uid,'m6-real-app',{ to:'paid',confirmReceived:true,payment:{ paidUsd:100,paidAt:'2099-01-01' } },now)).rejects.toThrow('future');
    expect((await db.collection(`users/${uid}/earnings`).get()).empty).toBe(true);
  });
});
