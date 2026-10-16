import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { earningProfileFromLegacy, personalFit, type EarningProfile, type PersonalFit, type LearningState } from '@ntk/hunter-core';
import { useUserData, saveOpportunity } from './repositories/userData';
import { useAuth } from './auth/AuthProvider';
import { flushPrivateActions, pendingPrivateActions, removePrivateAction, subscribePrivateActions, type SafeAction } from './repositories/privateQueue';
import { saveApplicationMetadata, saveEarningProfile, type ApplicationMetadata } from './repositories/personalActions';
import type { Opportunity } from './types';
import { auth } from './lib/firebase';

interface PersonalContext { profile: EarningProfile; fits: Map<string, PersonalFit>; learning: LearningState; now: Date; items: Opportunity[] }
const Context = createContext<PersonalContext | null>(null);
export function usePersonalization() { const value = useContext(Context); if (!value) throw new Error('Personalization context missing'); return value; }
export function PersonalizationProvider({ items, children }: { items: Opportunity[]; children: ReactNode }) {
  const data = useUserData(); const { user } = useAuth();
  const [minute,setMinute] = useState(() => Math.floor(Date.now()/60000));
  useEffect(() => { const timer = window.setInterval(() => setMinute(Math.floor(Date.now()/60000)),60000); return () => clearInterval(timer); },[]);
  const profile = useMemo(() => earningProfileFromLegacy(data.profile),[data.profile]);
  const raw = data.profile?.recommendationLearning as Partial<LearningState> | undefined;
  const learning = useMemo(() => ({ enabled: raw?.enabled === true, resetAt: typeof raw?.resetAt === 'string' ? raw.resetAt : null }),[raw?.enabled,raw?.resetAt]);
  const now = useMemo(() => new Date(minute*60000),[minute]);
  const fits = useMemo(() => new Map(items.map(o => [o.id,personalFit(o,profile,data.proofs,data.applications,learning,now)])),[items,profile,data.proofs,data.applications,learning,now]);
  return <Context.Provider value={{ profile,fits,learning,now,items }}><PrivateDraftBar key={user?.uid ?? 'anonymous'} />{children}</Context.Provider>;
}
function PrivateDraftBar() {
  const { user } = useAuth(); const [,refresh] = useState(0); const [busy,setBusy] = useState(false);
  useEffect(() => subscribePrivateActions(() => refresh(n => n+1)),[]);
  const actions = user ? pendingPrivateActions(user.uid) : [];
  async function sync() {
    if (!user || busy || !navigator.onLine) return;
    setBusy(true);
    try { await flushPrivateActions(user.uid,() => auth?.currentUser?.uid,async (a: SafeAction) => {
      if (a.kind === 'earning-profile') { const p = a.payload as { profile: EarningProfile; baseUpdatedAt: string | null }; await saveEarningProfile(p.profile,p.baseUpdatedAt,false); }
      else if (a.kind === 'application-notes') { const p = a.payload as { applicationId: string; data: ApplicationMetadata }; await saveApplicationMetadata(p.applicationId,p.data,false); }
      else await saveOpportunity(a.payload as Opportunity);
    }); } finally { setBusy(false); }
  }
  useEffect(() => { const reconnect = () => { void sync(); }; window.addEventListener('online',reconnect); return () => window.removeEventListener('online',reconnect); },[user?.uid,busy]);
  if (!user || !actions.length) return null;
  return <aside className="draft-banner" aria-label="Private drafts"><b>{actions.length} pending private draft(s)</b><span>Kept in this tab only. Sign-out or reload discards drafts. Payments and outcomes are never queued.</span><button className="secondary" disabled={busy || !navigator.onLine} onClick={() => void sync()}>Sync drafts</button>{actions.map(a => <div key={a.id}><span>{a.kind}{a.error ? `: ${a.error}` : ''}</span><button onClick={() => removePrivateAction(user.uid,a.id)}>Discard draft</button></div>)}</aside>;
}
export function FitExplanation({ fit, confidence }: { fit: PersonalFit; confidence: number }) {
  return <section className="profile-card fit-explanation"><h2>Why this matches me</h2><p><strong>{fit.score}/100 Personal Fit</strong> · Eligibility: {fit.eligible} · Source evidence confidence: {confidence}%</p><p>Compatibility score, not a chance of acceptance or a guarantee of income. Global evidence rank remains separate.</p>
    <h3>Matches</h3><ul>{fit.reasons.map(r => <li key={r}>{r}</li>)}</ul><p>Matched skills: {fit.matchedSkills.join(', ') || 'None established'}</p><p>Missing listed skills: {fit.missingSkills.join(', ') || 'None listed, or not structured'}</p>
    <p>CV: {fit.path.cv} · Portfolio: {fit.path.portfolio}</p><p>Application friction: {fit.friction}</p><h3>Proof requested</h3><p>{fit.requiredProof.join('; ') || 'No structured document request confirmed; check the official source.'}</p>
    <h3>Important unknowns</h3><ul>{fit.unknowns.map(r => <li key={r}>{r}</li>)}</ul>{fit.risks.length > 0 && <><h3>Risks and conflicts</h3><ul>{fit.risks.map(r => <li key={r}>{r}</li>)}</ul></>}
    <p><b>Next action:</b> {fit.nextAction}</p><details><summary>Score breakdown and learning</summary>{fit.components.map(c => <p key={c.key}>{c.key}: {c.points.toFixed(1)} / {c.maximum}</p>)}{fit.learning.reasons.map(r => <p key={r}>{r}</p>)}<Link to="/settings#learning">Manage or reset recommendation learning</Link></details>
  </section>;
}
