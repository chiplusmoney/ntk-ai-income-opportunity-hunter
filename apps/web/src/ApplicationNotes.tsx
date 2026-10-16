import { useState, type FormEvent } from 'react';
import type { ApplicationRecord } from '@ntk/hunter-core';
import { useUserData } from './repositories/userData';
import { saveApplicationMetadata } from './repositories/personalActions';

export function ApplicationNotes({ record }: { record: ApplicationRecord }) {
  const { proofs = [] } = useUserData();
  const [notes,setNotes] = useState(record.notes); const [next,setNext] = useState(record.nextAction ?? '');
  const [follow,setFollow] = useState(record.followUpDate ?? ''); const [reason,setReason] = useState(record.outcomeReason ?? '');
  const [attached,setAttached] = useState(record.attachedProof ?? []); const [base,setBase] = useState(record.updatedAt);
  const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { const result = await saveApplicationMetadata(record.id,{ notes,nextAction:next,followUpDate:follow || null,outcomeReason:reason,attachedProof:attached,baseUpdatedAt:base }); setMessage(result.message); setBase(result.updatedAt); }
    catch(e) { setMessage(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }
  return <details><summary>Preparation, notes &amp; follow-up</summary><form onSubmit={submit} className="account-form"><label>Application notes<textarea maxLength={6000} value={notes} onChange={e => setNotes(e.target.value)} /></label><label>Next action<input maxLength={1000} value={next} onChange={e => setNext(e.target.value)} /></label><label>Follow-up date<input type="date" value={follow} onChange={e => setFollow(e.target.value)} /></label><label>Outcome reason (only what actually happened)<textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label><fieldset><legend>Real proof to attach (up to 10)</legend>{proofs.map(p => <label className="check-label" key={p.id}><input type="checkbox" checked={attached.includes(p.id)} disabled={!attached.includes(p.id) && attached.length >= 10} onChange={e => setAttached(e.target.checked ? [...attached,p.id] : attached.filter(id => id !== p.id))} />{p.title} · {p.status}</label>)}{!proofs.length && <p>No proof recorded yet.</p>}</fieldset><button className="primary" disabled={busy}>Save preparation notes</button><button type="button" className="secondary" onClick={() => { setNotes(record.notes); setNext(record.nextAction ?? ''); setFollow(record.followUpDate ?? ''); setReason(record.outcomeReason ?? ''); setAttached(record.attachedProof ?? []); setBase(record.updatedAt); setMessage('Latest saved application loaded.'); }}>Reload saved notes</button><p role="status">{message}</p></form></details>;
}
