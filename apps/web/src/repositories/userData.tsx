import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, query, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { createApplicationRecord, readProofRecord, type ApplicationRecord, type TransitionRequest, type ProofRecord } from '@ntk/hunter-core';
import { sendTransition } from './personalActions';
import { auth, firestore } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import type { EarningRecord, PrivateNotification } from '../outcomes';
import type { Opportunity } from '../types';

interface Data {
  applications: ApplicationRecord[]; earnings: EarningRecord[]; notifications: PrivateNotification[];
  saved: string[]; profile: Record<string, unknown> | null; loading: boolean; error: string | null;
  proofs: ProofRecord[];
  offline: boolean;
}
const EMPTY: Data = { applications: [], earnings: [], notifications: [], saved: [], profile: null, proofs: [], loading: false, error: null, offline:false };
const Context = createContext<Data>(EMPTY);
export const useUserData = () => useContext(Context);

/** A keyed provider is discarded on every identity change. Late callbacks cannot
 * reveal another account's records, including during sign-out or token refresh. */
export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <AccountData key={user.uid} uid={user.uid}>{children}</AccountData> : <Context.Provider value={EMPTY}>{children}</Context.Provider>;
}
function AccountData({ uid, children }: { uid: string; children: ReactNode }) {
  const [data, setData] = useState<Data>({ ...EMPTY, loading: true });
  useEffect(() => {
    if (!firestore) return;
    let active = true;
    const pending = new Set(['applications', 'earnings', 'notifications', 'saved', 'proofs', 'profile']);
    const failure = () => {
      if (!active) return;
      // Retain only already server-confirmed records in this account's RAM.
      // This enables safe drafts without claiming an offline read is fresh.
      if (!navigator.onLine && pending.size === 0) { setData(old => ({ ...old,offline:true })); return; }
      ['applications', 'earnings', 'notifications', 'saved', 'proofs', 'profile'].forEach(name => pending.add(name));
      setData({ ...EMPTY, error: 'Private data could not be loaded. Reconnect or sign in again.' });
    };
    const accept = (name: string, value: unknown) => {
      if (!active || auth?.currentUser?.uid !== uid) return;
      pending.delete(name);
      setData(old => ({ ...old, [name]: value, loading: pending.size > 0, error: pending.size === 0 ? null : old.error, offline:!navigator.onLine }));
    };
    const stops = ['applications', 'earnings', 'notifications', 'saved', 'proofs'].map(name => onSnapshot(
      query(collection(firestore!, 'users', uid, name), limit(1000)),
      { includeMetadataChanges: true },
      snap => {
        // An empty memory cache is not evidence of an empty server ledger.
        // Wait for server confirmation; offline private views fail honestly.
        if (snap.metadata.fromCache) { if (!navigator.onLine) failure(); return; }
        if (snap.size === 1000) { failure(); return; }
        accept(name, name === 'saved' ? snap.docs.map(d => d.id) : name === 'proofs' ? snap.docs.map(d => readProofRecord(d.data(),d.id)).filter(Boolean) : snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }, failure
    ));
    stops.push(onSnapshot(doc(firestore, 'users', uid), { includeMetadataChanges: true }, snap => {
      if (snap.metadata.fromCache) { if (!navigator.onLine) failure(); return; }
      accept('profile', snap.exists() ? snap.data() : null);
    }, failure));
    window.addEventListener('offline', failure);
    return () => { active = false; stops.forEach(stop => stop()); window.removeEventListener('offline', failure); };
  }, [uid]);
  return <Context.Provider value={data}>{children}</Context.Provider>;
}

function identity() {
  const uid = auth?.currentUser?.uid;
  if (!uid || !firestore) throw new Error('Sign in to save private records.');
  if (!navigator.onLine) throw new Error('Reconnect before changing private records. No action has been queued.');
  return { uid, db: firestore };
}
export async function saveOpportunity(o: Opportunity) {
  const { uid, db } = identity();
  if (o.demoSeed) throw new Error('Demo opportunities cannot become personal records.');
  const record = createApplicationRecord({ id: o.id, opportunityId: o.id, title: o.title, provider: o.provider,
    category: o.category, riskLevel: o.riskLevel, rankScore: o.rankScore, sourceUrl: o.sourceUrl, attribution: o.sourceAttribution, now: new Date() });
  await runTransaction(db, async tx => {
    const ref = doc(db, 'users', uid, 'applications', o.id);
    const existing = await tx.get(ref);
    if (auth?.currentUser?.uid !== uid) throw new Error('Your account changed. Retry in the current account.');
    if (!existing.exists()) tx.set(ref, record);
    tx.set(doc(db, 'users', uid, 'saved', o.id), { opportunityId: o.id, savedAt: record.updatedAt });
  });
}
export async function transitionApplication(id: string, request: TransitionRequest) {
  identity(); await sendTransition(id,request);
}
export async function saveProfile(profile: Record<string, unknown>) {
  const { uid, db } = identity(); await setDoc(doc(db, 'users', uid), profile, { merge: true });
}
export async function markNotificationRead(id: string) {
  const { uid, db } = identity(); await updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });
}
export async function deleteNotification(id: string) {
  const { uid, db } = identity(); await deleteDoc(doc(db, 'users', uid, 'notifications', id));
}
