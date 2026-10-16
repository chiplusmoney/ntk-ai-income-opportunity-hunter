import { useState } from 'react';
import { Link } from 'react-router-dom';
import { applicationChecklist, assistApplication, type AssistanceCapability, type GroundedDraft, type PersonalFit } from '@ntk/hunter-core';
import { usePersonalization } from './Personalization';
import { useUserData, saveOpportunity, transitionApplication } from './repositories/userData';
import { useAuth } from './auth/AuthProvider';
import type { Opportunity } from './types';

const CAPABILITIES: AssistanceCapability[] = ['cover-note','short-pitch','proposal','application-answers','professional-introduction','proof-summary','explanation','skill-gap','comparison','action-plan'];
export function ApplicationAssistant({ o,fit }: { o: Opportunity; fit: PersonalFit }) {
  const { user } = useAuth(); const { profile } = usePersonalization(); const { proofs,applications } = useUserData();
  const [checked,setChecked] = useState<number[]>([]); const [capability,setCapability] = useState<AssistanceCapability>('cover-note');
  const [draft,setDraft] = useState<GroundedDraft | null>(null); const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  const relevant = proofs.filter(p => fit.proofIds.includes(p.id));
  async function prepare() {
    if (!user) return; setBusy(true); setMessage('');
    try { let a = applications.find(a => a.opportunityId === o.id); if (!a) await saveOpportunity(o); if (!a || a.state === 'saved') await transitionApplication(o.id,{ to:'preparing',now:new Date() }); setMessage('Saved as Preparing. No application has been submitted.'); }
    catch(e) { setMessage(e instanceof Error ? e.message : 'Could not prepare'); } finally { setBusy(false); }
  }
  return <section className="profile-card application-assistant"><h2>Prepare my application</h2><p>Use the checklist and genuine proof. Opening the official source never marks you Applied.</p>{!user && <p><Link to="/profile">Sign in</Link> to use your private proof and track preparation.</p>}
    <h3>Application checklist</h3>{applicationChecklist(o,fit).map((c,i) => <label className="check-label" key={`${o.id}-${i}`}><input type="checkbox" checked={checked.includes(i)} onChange={e => setChecked(e.target.checked ? [...checked,i] : checked.filter(x => x !== i))} /><span><small>{c.kind}</small> {c.label}</span></label>)}
    <h3>Suggested proof to review</h3>{relevant.length ? relevant.map(p => <p key={p.id}><Link to="/proof">{p.title}</Link> · {p.status} · {p.provenance}</p>) : <p>No existing proof matches the listed skills. <Link to="/proof">Record genuine evidence</Link>; do not invent missing qualifications.</p>}
    <button className="primary" disabled={!user || busy || fit.eligible === 'blocked' || !navigator.onLine} onClick={() => void prepare()}>Save &amp; start preparing</button><p role="status">{message}</p>
    <h3>Evidence-grounded preparation draft</h3><p>FlagshipRouter is not configured. Deterministic drafting is available at $0. Source facts, user declarations and suggestions stay separate.</p><label>Draft purpose<select value={capability} onChange={e => setCapability(e.target.value as AssistanceCapability)}>{CAPABILITIES.map(c => <option key={c} value={c}>{c.replaceAll('-',' ')}</option>)}</select></label><button className="secondary" disabled={!user} onClick={() => void assistApplication(capability,o,profile,relevant).then(setDraft)}>Build grounded draft</button>
    {draft && <div className="grounded-draft"><h3>{draft.capability.replaceAll('-',' ')} · {draft.mode}</h3><p>{draft.warning}</p>{draft.facts.map(f => <p key={f.id}><b>{f.kind}</b>: {f.text}</p>)}{draft.suggestions.map(s => <p key={s}><b>Drafting suggestion</b>: {s}</p>)}<label>Your answers to unanswered questions<textarea placeholder="Write only facts you can substantiate. This text is not sent automatically." /></label></div>}
    <a href={o.sourceUrl} target="_blank" rel="noreferrer">Official application link</a>
  </section>;
}
