import { useState, type FormEvent, type ReactNode } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { ALLOWED_TRANSITIONS, progressIndex, type ApplicationRecord, type ApplicationState } from '@ntk/hunter-core';
import { auth } from './lib/firebase';
import { useAuth } from './auth/AuthProvider';
import { deleteNotification, markNotificationRead, saveProfile, transitionApplication, useUserData } from './repositories/userData';
import { outcomeSummary } from './outcomes';
import { DEFAULT_PROFILE, validateProfile } from './auth/userProfile';

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
  return children;
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
export function Earnings() {
  const { applications, earnings } = useUserData(); const s = outcomeSummary(applications, earnings);
  return <PrivateGate><section className="page"><h1>Earnings &amp; outcomes</h1><p>Only recorded receipts from your private earnings ledger are included. All amounts are USD.</p>
    <div className="stats-grid">{[[`$${s.totalPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Total earned'], [s.completed, 'Completed'], [s.inProgress, 'In progress'], [s.successRate === null ? '—' : `${s.successRate}%`, 'Success rate']].map(([n, label]) => <div className="stat" key={label}><b>{n}</b><span>{label}</span></div>)}</div>
    <p className="muted">Success rate requires at least three recorded terminal outcomes (paid, rejected or expired).</p>
    <div className="chart-card"><h2>Income trend</h2>{!s.trend.length ? <p>No income recorded yet. Your trend will appear after an actual payment is recorded.</p> : <div className="income-trend">{s.trend.map(t => <div key={t.month}><span>{t.month}</span><meter aria-label={`${t.month} income in USD`} min={0} max={Math.max(...s.trend.map(x => x.amount))} value={t.amount} /><b>${t.amount.toFixed(2)}</b></div>)}</div>}</div>
  </section></PrivateGate>;
}

export function Profile() {
  return <PrivateGate><ProfileForm /></PrivateGate>;
}
function ProfileForm() {
  const { user, logout } = useAuth(); const { profile } = useUserData();
  const initial = validateProfile(profile ?? DEFAULT_PROFILE).profile;
  const [country, setCountry] = useState(initial.primaryCountry); const [skills, setSkills] = useState(initial.skills.join(', '));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const checked = validateProfile({ ...initial, primaryCountry: country, skills: skills.split(',') });
      if (!checked.ok) throw new Error(checked.problems.join('. '));
      await saveProfile({ ...checked.profile, updatedAt: new Date().toISOString() }); setMessage('Profile saved to your account.');
    } catch (err) { setMessage(errorMessage(err)); } finally { setBusy(false); }
  }
  return <section className="page"><h1>Profile &amp; preferences</h1><p>Signed in as {user?.email}</p><button className="secondary" onClick={() => void logout()}>Sign out</button>
    <form className="profile-card account-form" onSubmit={submit}><label>Primary country<select value={country} onChange={e => setCountry(e.target.value as typeof country)}>{['NG', 'GB', 'CA', 'US', 'OTHER'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Skills (separate with commas)<input value={skills} maxLength={2000} onChange={e => setSkills(e.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button><p role="status">{message}</p>
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
