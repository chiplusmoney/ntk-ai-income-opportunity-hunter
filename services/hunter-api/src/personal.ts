import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { applyTransition, type ApplicationRecord, type TransitionRequest, type ProofRecord } from '@ntk/hunter-core';
import { readOperations } from './operations.js';

const ORIGINS = new Set(['https://ntk-income-opportunity-hunter.web.app', 'https://ntk-income-opportunity-hunter.firebaseapp.com', 'http://localhost:5173']);
export class PersonalActionError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Single trusted payment boundary. No external payment verification is claimed: these are owner-declared receipts. */
export async function recordApplicationTransition(db: Firestore, uid: string, id: string, body: unknown, now = new Date()) {
  if (!/^[\w:.-]{1,200}$/.test(id)) throw new PersonalActionError(400,'Invalid application ID');
  const b = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const to = b.to as TransitionRequest['to'];
  if (b.note !== undefined && (typeof b.note !== 'string' || b.note.length > 6000)) throw new PersonalActionError(400,'Invalid outcome note');
  if (to === 'paid' && b.confirmReceived !== true) throw new PersonalActionError(400,'Confirm that this payment was actually received');
  const request: TransitionRequest = { to, now, ...(typeof b.note === 'string' ? { note: b.note } : {}), ...(b.payment ? { payment: b.payment as TransitionRequest['payment'] } : {}) };
  const ref = db.doc(`users/${uid}/applications/${id}`);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const earningRef = db.doc(`users/${uid}/earnings/${id}`);
    const earning = to === 'paid' ? await tx.get(earningRef) : null;
    if (!snap.exists) throw new PersonalActionError(404,'Application no longer exists');
    const result = applyTransition(snap.data() as ApplicationRecord,request);
    if (!result.ok) throw new PersonalActionError(400,result.problems.join('. '));
    if (earning?.exists) throw new PersonalActionError(409,'A payment has already been recorded');
    tx.set(ref,result.record);
    if (to === 'paid' && request.payment) tx.create(earningRef, {
      applicationId: id, paidUsd: request.payment.paidUsd, paidAt: request.payment.paidAt,
      method: request.payment.method ?? null, recordedAt: now.toISOString(), recordedBy: uid, provenance: 'owner-declared-receipt'
    });
    return { state: result.record.state, updatedAt: result.record.updatedAt };
  });
}

/** Import only the authenticated owner's real Hunter history. Import confirms the record's origin, not external work quality. */
export async function importOutcomeProof(db: Firestore, uid: string, id: string, now = new Date()) {
  if (!/^[\w:.-]{1,200}$/.test(id)) throw new PersonalActionError(400,'Invalid application ID');
  const ref = db.doc(`users/${uid}/proofs/outcome-${id}`);
  return db.runTransaction(async tx => {
    const app = await tx.get(db.doc(`users/${uid}/applications/${id}`));
    const previous = await tx.get(ref);
    const a = app.data() as ApplicationRecord | undefined;
    if (!a || !['submitted','paid'].includes(a.state)) throw new PersonalActionError(400,'Only a genuine submitted or paid outcome can be imported');
    const p: ProofRecord = { id: ref.id, kind: 'hunter-outcome', title: a.title, description: `Owner-recorded Hunter outcome: ${a.state}. ${a.notes || ''}`.slice(0,6000), skills: [], url: a.sourceUrl,
      provenance: 'Imported from your private Hunter application history; the external outcome remains owner-declared.', status: 'imported', sourceIds: [id],
      createdAt: previous.data()?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() };
    tx.set(ref,p); return { id: p.id, status: p.status };
  });
}

export function createPersonalRouter(db: Firestore, verify = (token: string) => getAuth().verifyIdToken(token,true), ownerUid: string | undefined = undefined) {
  const router = Router();
  const rates = new Map<string,{ start: number; count: number }>();
  router.use(async (req, res, next) => {
    const origin = req.get('origin');
    if (origin && !ORIGINS.has(origin)) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    if (origin) { res.set('Access-Control-Allow-Origin',origin); res.vary('Origin'); }
    res.set('Cache-Control','no-store');
    if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Headers','Authorization, Content-Type'); res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS'); res.status(204).end(); return; }
    const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') ?? '');
    if (!match) { res.status(401).json({ error: 'Sign in to continue' }); return; }
    try {
      const identity = await verify(match[1]!);
      const now = Date.now();
      if (rates.size > 1000) for (const [id,r] of rates) if (now-r.start > 60000) rates.delete(id);
      const rate = rates.get(identity.uid);
      if (rate && now-rate.start < 60000 && rate.count >= 30) { res.status(429).json({ error: 'Please wait before trying again' }); return; }
      rates.set(identity.uid, !rate || now-rate.start >= 60000 ? { start: now, count: 1 } : { ...rate, count: rate.count+1 });
      res.locals.uid = identity.uid; next();
    } catch { res.status(401).json({ error: 'Your session expired. Sign in again' }); }
  });
  const handle = (action: (uid: string, id: string, body: unknown) => Promise<unknown>) => async (req: Request,res: Response) => {
    try { res.json(await action(res.locals.uid, String(req.params.id),req.body)); }
    catch (err) { res.status(err instanceof PersonalActionError ? err.status : 503).json({ error: err instanceof PersonalActionError ? err.message : 'Private action unavailable. Your previous record is preserved.' }); }
  };
  router.get('/operations',async (_req,res)=>{
    if(!ownerUid||res.locals.uid!==ownerUid){res.status(403).json({error:'Source operations are available to the configured owner only'});return;}
    try{res.json(await readOperations(db));}catch{res.status(503).json({error:'Source operations unavailable; no zero totals are assumed'});}
  });
  router.post('/applications/:id/transition',handle((uid,id,body) => recordApplicationTransition(db,uid,id,body)));
  router.post('/proofs/import-outcome/:id',handle((uid,id) => importOutcomeProof(db,uid,id)));
  router.post('/applications/:id/metadata',handle(async (uid,id,body) => {
    if (!/^[\w:.-]{1,200}$/.test(id)) throw new PersonalActionError(400,'Invalid application ID');
    const b = body as Record<string,unknown>;
    if (!b || typeof b.notes !== 'string' || b.notes.length > 6000 || typeof b.nextAction !== 'string' || b.nextAction.length > 1000 || typeof b.outcomeReason !== 'string' || b.outcomeReason.length > 2000 || b.followUpDate !== null && (typeof b.followUpDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.followUpDate) || !Number.isFinite(Date.parse(b.followUpDate))) || !Array.isArray(b.attachedProof) || b.attachedProof.length > 10 || !b.attachedProof.every(p => typeof p === 'string' && /^[\w:.-]{1,220}$/.test(p))) throw new PersonalActionError(400,'Invalid application notes or proof selection');
    const ref = db.doc(`users/${uid}/applications/${id}`);
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new PersonalActionError(404,'Application no longer exists');
      if (snap.data()?.updatedAt !== b.baseUpdatedAt) throw new PersonalActionError(409,'This record changed on another device. Review your draft before saving again');
      for (const proofId of b.attachedProof as string[]) if (!(await tx.get(db.doc(`users/${uid}/proofs/${proofId}`))).exists) throw new PersonalActionError(400,'Selected proof no longer exists in your account');
      const updatedAt = new Date().toISOString();
      tx.update(ref,{ notes: b.notes, nextAction: b.nextAction, outcomeReason: b.outcomeReason, followUpDate: b.followUpDate, attachedProof: b.attachedProof, updatedAt });
      return { updatedAt };
    });
  }));
  return router;
}
