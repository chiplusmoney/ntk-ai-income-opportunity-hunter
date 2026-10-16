import { NotificationControls } from './NotificationSettings';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { earningProfileFromLegacy, profileCompletion, validateEarningProfile, outcomeLearning,
  type EarningProfile } from '@ntk/hunter-core';
import { useAuth } from './auth/AuthProvider';
import { PrivateGate, SignIn } from './AccountPages';
import { useUserData } from './repositories/userData';
import { resetLearning, saveEarningProfile } from './repositories/personalActions';

const LABELS: Partial<Record<keyof EarningProfile,string>> = { country:'Country (two-letter code, e.g. NG)', timezone:'Timezone (e.g. Africa/Lagos)', languages:'Languages', skills:'Skills you actually have', skillLevel:'Skill level', experience:'Experience level', categories:'Preferred work categories', industries:'Industries', hoursPerWeek:'Available hours per week', duration:'Preferred work duration', remoteOnly:'Remote only', minimumReward:'Minimum advertised reward', rewardBasis:'Reward payment period', currencies:'Preferred currencies (e.g. USD, NGN)', paymentMethods:'Supported payment methods', devices:'Available devices', connectivity:'Connectivity constraints', cv:'CV / resume availability', portfolio:'Portfolio availability', github:'GitHub URL', linkedin:'LinkedIn URL', portfolioUrl:'Portfolio URL', certifications:'Certifications', education:'Education', willingToLearn:'Willing to learn', opportunityTypes:'Opportunity types', excludedCategories:'Categories to exclude', competitionTolerance:'Competition tolerance', deadlineDays:'Preferred minimum days before deadline', targetMonthlyIncome:'Monthly income target (planning only)', shortTermTarget:'Short-term target (planning only)' };
const OPTIONS: Partial<Record<keyof EarningProfile,string[]>> = { skillLevel:['unknown','beginner','intermediate','advanced'], experience:['unknown','none','junior','mid','senior'], duration:['any','task','short-term','ongoing'], cv:['unknown','none','available'], portfolio:['unknown','none','available'], competitionTolerance:['unknown','avoid','open'], rewardBasis:['unknown','one-off','hour','day','week','month','year'] };
const GROUPS: [string,(keyof EarningProfile)[]][] = [
  ['Start here',['country','timezone','skills','experience','cv','portfolio']],
  ['Work and availability',['languages','skillLevel','categories','industries','hoursPerWeek','duration','remoteOnly','opportunityTypes','excludedCategories','competitionTolerance','deadlineDays']],
  ['Payment and targets',['currencies','minimumReward','rewardBasis','paymentMethods','targetMonthlyIncome','shortTermTarget']],
  ['Equipment and genuine evidence',['devices','connectivity','github','linkedin','portfolioUrl','certifications','education','willingToLearn']]
];
export function EarningProfileSettings() {
  const { user } = useAuth(); const data = useUserData();
  if (!user) return <section className="page"><SignIn /></section>;
  if (data.loading) return <section className="page">Loading earning profile…</section>;
  if (data.error) return <PrivateGate><span /></PrivateGate>;
  return <ProfileForm key={user.uid} />;
}
function ProfileForm() {
  const { profile,applications } = useUserData();
  const [value,setValue] = useState(() => earningProfileFromLegacy(profile));
  const [base,setBase] = useState(typeof profile?.earningProfileUpdatedAt === 'string' ? profile.earningProfileUpdatedAt : null);
  const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  const completion = profileCompletion(value);
  function field(k: keyof EarningProfile) {
    const v = value[k]; const set = (next: unknown) => setValue(old => ({ ...old,[k]:next }));
    return <label key={k}>{LABELS[k]}{typeof v === 'boolean' ? <input type="checkbox" checked={v} onChange={e => set(e.target.checked)} /> : OPTIONS[k] ? <select value={String(v)} onChange={e => set(e.target.value)}>{OPTIONS[k]!.map(x => <option key={x} value={x}>{x === 'unknown' ? 'Not answered / unknown' : x}</option>)}</select> : Array.isArray(v) ? <input value={v.join(', ')} maxLength={4000} placeholder="Separate entries with commas" onChange={e => set(e.target.value.split(',').map(x => x.trimStart()))} /> : typeof v === 'number' || v === null ? <input type="number" min={0} max={k === 'hoursPerWeek' ? 168 : k === 'deadlineDays' ? 365 : 1e9} value={v ?? ''} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} /> : <input value={String(v)} maxLength={2000} onChange={e => set(e.target.value)} />}</label>;
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { const c = validateEarningProfile(value); if (!c.ok) throw new Error(c.problems.join('. ')); setValue(c.value); const result = await saveEarningProfile(c.value,base); setMessage(result.message); setBase(result.updatedAt); }
    catch(e) { setMessage(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }
  return <section className="page"><h1>Earning profile &amp; preferences</h1><p>Start with a few facts. Every field is optional. Your qualifications, documents and targets are never guessed.</p>
    <div className="profile-card"><h2>{completion.answered} / {completion.total} matching basics answered</h2><progress max={completion.total} value={completion.answered} aria-label="Earning profile completion" /><p>Next: {completion.next.slice(0,3).join(', ') || 'Review your proof and application preferences'}</p><button className="secondary" onClick={() => { setValue(p => ({ ...p,cv:'none',portfolio:'none' })); setMessage('No CV and no portfolio selected. Save your profile to use this path.'); }}>Start Without CV or Portfolio</button><p>Unknown listing requirements stay unknown. <Link to="/opportunities?view=No%20CV%20%2F%20portfolio%20path">Browse confirmed no-document listings</Link> or <Link to="/proof">build proof from real work</Link>.</p></div>
    <form onSubmit={submit} className="profile-card account-form">{GROUPS.map(([name,keys],i) => <details key={name} open={i === 0}><summary>{name}</summary><div className="m6-form-grid">{keys.map(field)}</div></details>)}<p>Reward targets use the first preferred currency. Minimum reward comparisons require the same currency and payment period. Other optional preferences remain visible context when sources lack matching facts.</p><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save earning profile'}</button><p role="status">{message}</p><button type="button" className="secondary" onClick={() => { setValue(earningProfileFromLegacy(profile)); setBase(typeof profile?.earningProfileUpdatedAt === 'string' ? profile.earningProfileUpdatedAt : null); setMessage('Latest server profile loaded. Review before saving.'); }}>Reload saved profile</button></form>
    <PrivateGate><LearningControls applications={applications} /><NotificationControls /></PrivateGate>
  </section>;
}
function LearningControls({ applications }: { applications: ReturnType<typeof useUserData>['applications'] }) {
  const { profile } = useUserData(); const state = profile?.recommendationLearning as { enabled?: boolean; resetAt?: string } | undefined;
  const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  async function change(enabled: boolean) { setBusy(true); try { await resetLearning(enabled); setMessage(enabled ? 'Learning reset. Only outcomes recorded from now on can influence fit.' : 'Recommendation learning disabled. All learned adjustments removed.'); } catch(e) { setMessage(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); } }
  const categories = [...new Set(applications.map(a => a.category))];
  return <section id="learning" className="profile-card"><h2>Recommendation learning</h2><p>{state?.enabled ? 'Enabled' : 'Disabled'} · Max ±6 points, from your recorded outcomes only. Eligibility blocks always win.</p>{categories.map(c => <p key={c}>{outcomeLearning(c,applications,{ enabled:state?.enabled === true,resetAt:state?.resetAt ?? null }).reasons.join('; ')}</p>)}<button className="secondary" disabled={busy} onClick={() => void change(true)}>Reset recommendation learning</button><button className="secondary" disabled={busy} onClick={() => void change(false)}>Disable learning</button><p role="status">{message}</p></section>;
}
