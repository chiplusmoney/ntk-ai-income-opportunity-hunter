import { useState, type FormEvent, type ReactNode } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { ALLOWED_TRANSITIONS, progressIndex, earningActions, earningProfileFromLegacy, personalFit, type ApplicationRecord, type ApplicationState, type PersonalFit } from '@ntk/hunter-core';
import { auth } from './lib/firebase';
import { useAuth } from './auth/AuthProvider';
import { deleteNotification, markNotificationRead, saveProfile, transitionApplication, useUserData } from './repositories/userData';
import { outcomeSummary } from './outcomes';
import { DEFAULT_PROFILE, validateProfile } from './auth/userProfile';
import { AccountAvatar } from './AccountMenu';
import { ApplicationNotes } from './ApplicationNotes';
import type { Opportunity } from './types';

function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password was not accepted. Try again.',
    'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
    'auth/weak-password': 'Choose a password with at least 12 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was closed. You can try again.',
    'auth/popup-blocked': 'Allow the Google sign-in popup, then try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/network-request-failed': 'Check your connection and try again.',
    'auth/account-exists-with-different-credential': 'Sign in using your existing account method first.'
  };
  return code ? messages[code] ?? 'Authentication failed. Please try again.' : error instanceof Error ? error.message : 'The action failed. Please try again.';
}

export function SignIn() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!auth) return;
    setBusy(true); setError('');
    try {
      if (mode === 'signup') await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function google() {
    if (!auth) return; setBusy(true); setError('');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <div className="profile-card auth-card"><h2>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h2>
    <p>Browsing is public. Your saved work, applications, earnings and notifications are private to your account.</p>
    <form onSubmit={submit} className="account-form">
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : 1} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {mode === 'signup' && <small>Use at least 12 characters.</small>}
      <button className="primary" disabled={busy || !auth}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in with email'}</button>
    </form>
    <button className="secondary" disabled={busy || !auth} onClick={google}>Continue with Google</button>
    <button className="secondary" disabled={busy} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>{mode === 'signin' ? 'Create an account' : 'Already registered? Sign in'}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

export function PrivateGate({ children }: { children: ReactNode }) {
  const { user, loading, error } = useAuth(); const data = useUserData();
  if (loading) return <section className="page" role="status">Restoring your session…</section>;
  if (!user) return <section className="page">{error && <p role="alert">{error}</p>}<SignIn /></section>;
  if (data.error) return <section className="page"><p role="alert" className="error">{data.error}</p></section>;
  if (data.loading) return <section className="page" role="status">Loading your private records…</section>;
  return <>{data.offline && <p className="draft-banner" role="status">Offline: showing the last server-confirmed records from this signed-in session. Draft notes and safe saves can wait in this tab. Payments and outcomes require reconnection.</p>}{children}</>;
}
const title = (state: string) => state.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export function Applications() {
  const { applications } = useUserData();
  return <PrivateGate><section className="page"><h1>My applications</h1><p>Only actions you record appear here. Save an opportunity to begin.</p>
    {!applications.length && <div className="profile-card">No applications yet. Explore the public opportunities and save one you want to track.</div>}
    <div className="list">{applications.map(a => <Application key={a.id} record={a} />)}</div>
  </section></PrivateGate>;
}
function Application({ record }: { record: ApplicationRecord }) {
  const [next, setNext] = useState<ApplicationState | ''>('');
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(''); const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const transitions = ALLOWED_TRANSITIONS[record.state] ?? [];
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!next) return; setBusy(true); setError('');
    try {
      if (next === 'paid' && (!date || date > new Date().toISOString().slice(0, 10))) throw new Error('Enter the date an actual payment arrived, up to today.');
      await transitionApplication(record.id, { to: next, now: new Date(), ...(next === 'paid' ? { payment: { paidUsd: Number(amount), paidAt: date, method: method.trim() || null } } : {}) });
      setNext(''); setAmount(''); setDate(''); setMethod('');
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <article className="profile-card"><h2>{record.title}</h2><p>{record.provider} · <strong>{title(record.state)}</strong></p>
    <div className="progress" aria-label={`Stage ${progressIndex(record.state) + 1}`}><i style={{ width: `${(progressIndex(record.state) + 1) / 6 * 100}%` }} /></div>
    <a href={record.sourceUrl} target="_blank" rel="noreferrer">Official source</a>
    <Link to={`/opportunities/${record.opportunityId}`}> Review fit and application checklist</Link>
    <ApplicationNotes record={record} />
    {transitions.length > 0 && <form onSubmit={submit} className="account-form">
      <label>Record a genuine action or outcome<select value={next} required onChange={e => setNext(e.target.value as ApplicationState)}><option value="">Choose next stage</option>{transitions.map(s => <option key={s} value={s}>{title(s)}</option>)}</select></label>
      {next === 'paid' && <fieldset><legend>Actual payment received (USD)</legend><p>Do not enter the advertised or expected reward.</p>
        <label>Amount received in USD<input type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Payment date<input type="date" required max={new Date().toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Payment method (optional)<input maxLength={100} value={method} onChange={e => setMethod(e.target.value)} /></label>
        <label className="check-label"><input type="checkbox" required /> I confirm this payment was actually received.</label>
      </fieldset>}
      <button className="primary" disabled={busy || !next}>{busy ? 'Saving…' : next === 'paid' ? 'Record received payment' : 'Record stage'}</button>
    </form>}
    {error && <p role="alert" className="error">{error}</p>}
  </article>;
}
export function Earnings({ items = [] }: { items?: Opportunity[] }) {
  const { applications, earnings, profile, proofs = [] } = useUserData(); const s = outcomeSummary(applications, earnings);
  const p = earningProfileFromLegacy(profile); const now = new Date();
  const fits = new Map<string,PersonalFit>(items.map(o => [o.id,personalFit(o,p,proofs,applications,{ enabled:false,resetAt:null },now)]));
  const actions = earningActions(items,fits,applications,now);
  const potential = new Map<string,{ count:number; min:number; max:number }>();
  for (const o of items) if (o.currency && (o.rewardMin !== null || o.rewardMax !== null)) { const key = `${o.currency} / ${o.rewardBasis}`; const old = potential.get(key) ?? { count:0,min:Infinity,max:0 }; potential.set(key,{ count:old.count+1,min:Math.min(old.min,o.rewardMin ?? o.rewardMax!),max:Math.max(old.max,o.rewardMax ?? o.rewardMin!) }); }
  const byCategory = new Map<string,number>(); for (const e of earnings) { const category = applications.find(a => a.id === e.applicationId)?.category ?? 'Unclassified'; byCategory.set(category,(byCategory.get(category) ?? 0)+e.paidUsd); }
  return <PrivateGate><section className="page"><h1>Earnings &amp; outcomes</h1><p>Only recorded receipts from your private earnings ledger are included. All amounts are USD.</p>
    <div className="stats-grid">{[[`$${s.totalPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total earned'], [s.completed, 'Completed'], [s.inProgress, 'In progress'], [s.successRate === null ? '—' : `${s.successRate}%`, 'Success rate']].map(([n, label]) => <div className="stat" key={label}><b>{n}</b><span>{label}</span></div>)}</div>
    <p className="muted">Success rate requires at least three recorded terminal outcomes (paid, rejected or expired).</p>
    <div className="chart-card"><h2>Income trend</h2>{!s.trend.length ? <p>No income recorded yet. Your trend will appear after an actual payment is recorded.</p> : <div className="income-trend">{s.trend.map(t => <div key={t.month}><span>{t.month}</span><meter aria-label={`${t.month} income in USD`} min={0} max={Math.max(...s.trend.map(x => x.amount))} value={t.amount} /><b>${t.amount.toFixed(2)}</b></div>)}</div>}</div>
    <div className="profile-card"><h2>Actual payments by category</h2>{[...byCategory].map(([c,n]) => <p key={c}>{c}: ${n.toFixed(2)} USD</p>)}{!earnings.length && <p>No paid categories yet.</p>}<p>Average actual payment: {earnings.length ? `$${(s.totalPaidUsd/earnings.length).toFixed(2)}` : '—'}</p></div>
    <div className="profile-card"><h2>Application pipeline</h2>{['saved','preparing','applied','accepted','in_progress','submitted'].map(state => <p key={state}>{title(state)}: {applications.filter(a => a.state === state).length}</p>)}<p>Submitted / awaiting a recorded payment: {applications.filter(a => a.state === 'submitted').length}. Submission does not confirm a payment is due.</p></div>
    <div className="profile-card"><h2>Opportunity potential — not earned</h2><p>Advertised ranges grouped by currency and payment period. Never added to actual income.</p>{[...potential].map(([key,v]) => <p key={key}>{key}: {v.min.toLocaleString()}–{v.max.toLocaleString()} across {v.count} listings</p>)}<p>Reward unknown: {items.filter(o => o.rewardMin === null && o.rewardMax === null).length}</p></div>
    <div className="profile-card"><h2>Practical next actions</h2><ul>{actions.map(a => <li key={a}>{a}</li>)}</ul>{!actions.length && <p>Complete your earning profile, save real opportunities and record genuine outcomes to get specific next actions.</p>}</div>
  </section></PrivateGate>;
}

export function Profile() {
  return <PrivateGate><AccountDetails /></PrivateGate>;
}
function AccountDetails() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false);
  const providers = [...new Set(user?.providerData.map(p => p.providerId) ?? [])];
  async function securityAction(kind: 'password' | 'verification') {
    if (!auth || !user?.email) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      if (kind === 'password') { await sendPasswordResetEmail(auth, user.email); setMessage('Check your email for the password reset link.'); }
      else { await sendEmailVerification(user); setMessage('Check your email for a verification link, then sign in again to refresh your status.'); }
    } catch (err) { setMessage(errorMessage(err)); setFailed(true); } finally { setBusy(false); }
  }
  return <section className="page account-page"><h1>My profile</h1>
    <div className="profile-card profile-identity"><AccountAvatar large /><div><h2>{user?.displayName || 'Your account'}</h2><p>{user?.email || 'No email available'}</p><span>{user?.emailVerified ? 'Email verified' : 'Email not verified'}</span></div></div>
    <section id="security" className="profile-card account-security" aria-labelledby="security-title"><h2 id="security-title">Account security</h2>
      <dl className="account-details"><div><dt>Sign-in methods</dt><dd>{providers.map(p => p === 'google.com' ? 'Google' : p === 'password' ? 'Email and password' : p).join(', ') || 'Unavailable'}</dd></div>
        <div><dt>Account created</dt><dd>{user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Unavailable'}</dd></div>
        <div><dt>Last sign-in</dt><dd>{user?.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Unavailable'}</dd></div></dl>
      {providers.includes('password') && <><p>Request an email link to change your password securely.</p><button className="secondary" disabled={busy || !user?.email} onClick={() => void securityAction('password')}>Send password reset email</button></>}
      {providers.includes('google.com') && <p>Your Google sign-in security is managed in your <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Google Account</a>.</p>}
      {!user?.emailVerified && user?.email && <button className="secondary" disabled={busy} onClick={() => void securityAction('verification')}>Send verification email</button>}
      {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'error' : ''}>{message}</p>}
    </section>
    <div className="profile-card"><h2>Your preferences and data</h2><p>Manage your country and skills in <Link to="/settings">Settings</Link>. Use “Export my data” in the avatar menu to download your private records.</p></div>
  </section>;
}

export function Settings() { return <PrivateGate><SettingsForm /></PrivateGate>; }
function SettingsForm() {
  const { profile } = useUserData();
  const initial = validateProfile(profile ?? DEFAULT_PROFILE).profile;
  const [country, setCountry] = useState(initial.primaryCountry); const [skills, setSkills] = useState(initial.skills.join(', '));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const checked = validateProfile({ ...initial, primaryCountry: country, skills: skills.split(',') });
      if (!checked.ok) throw new Error(checked.problems.join('. '));
      await saveProfile({ ...checked.profile, updatedAt: new Date().toISOString() }); setMessage('Preferences saved to your account.');
    } catch (err) { setMessage(errorMessage(err)); } finally { setBusy(false); }
  }
  return <section className="page"><h1>Settings</h1><p>Keep your country and skills up to date for opportunity matching. These preferences are saved to your account.</p>
    <form className="profile-card account-form" onSubmit={submit}><h2>Opportunity preferences</h2><label>Primary country<select value={country} onChange={e => setCountry(e.target.value as typeof country)}>{[['NG', 'Nigeria'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['US', 'United States'], ['GLOBAL', 'Worldwide'], ['OTHER', 'Other']].map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label>Skills (separate with commas)<input value={skills} maxLength={2000} onChange={e => setSkills(e.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}</button><p role="status">{message}</p>
    </form>
  </section>;
}

export function Notifications() {
  const { notifications } = useUserData(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function act(id: string, remove: boolean) { setBusy(true); setError(''); try { await (remove ? deleteNotification(id) : markNotificationRead(id)); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return <PrivateGate><section className="page"><h1>Notifications</h1>{error && <p role="alert">{error}</p>}
    {!notifications.length && <p>No notifications yet. This list contains only server-created delivery records.</p>}
    <div className="list">{notifications.map(n => <article key={n.id} className="profile-card"><h2>{n.title}</h2><p>{n.body}</p><p>{n.channel} · {n.status} · {n.createdAt}</p><p>{n.read ? 'Read' : 'Unread'}</p><button className="secondary" disabled={busy || n.read} onClick={() => void act(n.id, false)}>Mark read</button><button className="secondary" disabled={busy} onClick={() => void act(n.id, true)}>Delete notification</button></article>)}</div>
  </section></PrivateGate>;
}
