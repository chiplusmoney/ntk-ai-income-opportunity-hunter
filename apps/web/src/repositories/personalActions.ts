import { deleteDoc, doc, runTransaction, setDoc } from 'firebase/firestore';
import { validateDeclaredProof, validateEarningProfile, type EarningProfile, type TransitionRequest } from '@ntk/hunter-core';
import { auth, firestore } from '../lib/firebase';
import { queuePrivateAction } from './privateQueue';

export function accountIdentity(online = true) {
  const uid = auth?.currentUser?.uid;
  if (!uid || !firestore) throw new Error('Sign in to save private records.');
  if (online && !navigator.onLine) throw new Error('Reconnect before changing private records. No action has been queued.');
  return { uid, db: firestore };
}
export async function personalApi(path: string,body: unknown) {
  const { uid } = accountIdentity();
  const token = await auth!.currentUser!.getIdToken();
  if (auth?.currentUser?.uid !== uid) throw new Error('Your account changed. Retry in the current account.');
  const response = await fetch(`https://ntk-hunter-api.onrender.com/v1/${path}`,{ method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Private action unavailable');
  if (auth?.currentUser?.uid !== uid) throw new Error('Your account changed. Reload your current records.');
  return data;
}
export async function readSourceOperations() {
  const {uid}=accountIdentity();const token=await auth!.currentUser!.getIdToken();
  if(auth?.currentUser?.uid!==uid)throw new Error('Your account changed');
  const response=await fetch('https://ntk-hunter-api.onrender.com/v1/operations',{headers:{authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  if(auth?.currentUser?.uid!==uid)throw new Error('Your account changed');
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Source operations unavailable');return data;
}
export async function saveEarningProfile(profile: EarningProfile,baseUpdatedAt: string | null, queue = true) {
  const { uid, db } = accountIdentity(false);
  const checked = validateEarningProfile(profile); if (!checked.ok) throw new Error(checked.problems.join('. '));
  if (!navigator.onLine) {
    if (!queue) throw new Error('Reconnect to save this draft');
    queuePrivateAction({ uid, id: 'earning-profile', kind: 'earning-profile', payload: { profile: checked.value, baseUpdatedAt } });
    return { message:'Draft queued in this tab. Reconnect to sync; sign-out or reload discards it.',updatedAt:baseUpdatedAt };
  }
  const updatedAt = new Date().toISOString();
  await runTransaction(db,async tx => {
    const ref = doc(db,'users',uid); const old = await tx.get(ref);
    if (auth?.currentUser?.uid !== uid) throw new Error('Your account changed');
    if ((old.data()?.earningProfileUpdatedAt ?? null) !== baseUpdatedAt) throw new Error('Your profile changed on another device. Reload it and review this draft.');
    tx.set(ref,{ earningProfile: checked.value, earningProfileUpdatedAt: updatedAt },{ merge: true });
  });
  return { message:'Earning profile saved to your private account.',updatedAt };
}
export interface ApplicationMetadata { notes: string; nextAction: string; followUpDate: string | null; outcomeReason: string; attachedProof: string[]; baseUpdatedAt: string }
export async function saveApplicationMetadata(id: string,data: ApplicationMetadata,queue = true) {
  const { uid } = accountIdentity(false);
  if (!navigator.onLine) {
    if (!queue) throw new Error('Reconnect to save these notes');
    queuePrivateAction({ uid, id: `notes:${id}`, kind: 'application-notes', payload: { applicationId: id, data } });
    return { message:'Notes queued in this tab. Reconnect to sync; sign-out or reload discards them.',updatedAt:data.baseUpdatedAt };
  }
  const result = await personalApi(`applications/${encodeURIComponent(id)}/metadata`,data); return { message:'Application preparation saved.',updatedAt:result.updatedAt as string };
}
export async function sendTransition(id: string,request: TransitionRequest) {
  accountIdentity();
  await personalApi(`applications/${encodeURIComponent(id)}/transition`,{ to: request.to, note: request.note, payment: request.payment, ...(request.to === 'paid' ? { confirmReceived: true } : {}) });
}
export async function saveDeclaredProof(input: unknown,id?: string,createdAt?: string) {
  const { uid, db } = accountIdentity();
  const checked = validateDeclaredProof(input,new Date()); if (!checked.ok) throw new Error(checked.problems.join('. '));
  const proofId = id ?? crypto.randomUUID();
  await setDoc(doc(db,'users',uid,'proofs',proofId),{ ...checked.value, id: proofId, createdAt: createdAt ?? checked.value.createdAt });
  return proofId;
}
export async function removeProof(id: string) { const { uid, db } = accountIdentity(); await deleteDoc(doc(db,'users',uid,'proofs',id)); }
export async function resetLearning(enabled = true) {
  const { uid, db } = accountIdentity();
  await setDoc(doc(db,'users',uid),{ recommendationLearning: { enabled, resetAt: new Date().toISOString() } },{ merge: true });
}
