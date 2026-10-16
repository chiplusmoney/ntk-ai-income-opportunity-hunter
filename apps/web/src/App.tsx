import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { Bell, Bookmark, Bot, BriefcaseBusiness, ChartNoAxesCombined, CircleDollarSign, CloudOff, Filter, Home, Menu, Search, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';
import { capitalStatusLabel, RECOMMENDATION_VIEWS, selectRecommendations, type RecommendationView } from '@ntk/hunter-core';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Applications, Earnings, Notifications, Profile, Settings } from './AccountPages';
import { AccountMenu } from './AccountMenu';
import { UserDataProvider, saveOpportunity, useUserData } from './repositories/userData';
import { outcomeSummary } from './outcomes';
import { getCachedOpportunities } from './offline';
import { loadOpportunities } from './loadOpportunities';
import type { Opportunity } from './types';
import './styles.css';
import { PersonalizationProvider, usePersonalization, FitExplanation } from './Personalization';
import { EarningProfileSettings } from './EarningProfile';
import { ProofBuilder } from './ProofBuilder';
import { ApplicationAssistant } from './ApplicationAssistant';
import { queuePrivateAction } from './repositories/privateQueue';

function money(o: Opportunity) {
  // The mapper already built an honest display string, including
  // "Amount not published in the source" when the reward is unknown.
  return o.rewardText;
}

function AppShell() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [live, setLive] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isDemo = items.length > 0 && items.every(row => row.demoSeed === true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    const refresh = () => { loadOpportunities().then(result => { if (!cancelled) { setItems(result.items.filter(row => !row.demoSeed)); setLive(result.source === 'live'); setLoadError(result.error); } }).catch(() => undefined); };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', off);



    let cancelled = false;
    loadOpportunities()
      .then(result => {
        if (cancelled) return;
        setLoadError(result.error);
        if (result.source === 'live' || result.items.length) {
          setItems(result.items.filter(row => !row.demoSeed));
          setLive(result.source === 'live');
        } else if (!navigator.onLine) {
          getCachedOpportunities().then(cached => {
            if (!cancelled && cached.length) setItems(cached);
          });
        }
      })
      .catch(() => setLoadError('Opportunities could not be loaded. Please reconnect and retry.'));

    return () => {
      cancelled = true;
      window.removeEventListener('online', on);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <PersonalizationProvider items={items}><div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark">N</span><div><b>NTK AI</b><small>Income Opportunity Hunter</small></div></div>
        <nav>
          <NavLink to="/" onClick={() => setMobileMenu(false)}><Home size={18}/> Dashboard</NavLink>
          <NavLink to="/opportunities" onClick={() => setMobileMenu(false)}><Search size={18}/> Opportunities</NavLink>
          <NavLink to="/applications" onClick={() => setMobileMenu(false)}><BriefcaseBusiness size={18}/> Applications</NavLink>
          <NavLink to="/proof" onClick={() => setMobileMenu(false)}><ShieldCheck size={18}/> Proof Builder</NavLink>
          <NavLink to="/earnings" onClick={() => setMobileMenu(false)}><CircleDollarSign size={18}/> Earnings</NavLink>
          <NavLink to="/ai" onClick={() => setMobileMenu(false)}><Bot size={18}/> AI Assistant</NavLink>
          <NavLink to="/offline" onClick={() => setMobileMenu(false)}><CloudOff size={18}/> Offline</NavLink>
          <NavLink to="/settings" onClick={() => setMobileMenu(false)}><SettingsIcon size={18}/> Settings</NavLink>
        </nav>
      </aside>
      <main>
        <header className="topbar">
          <button aria-label="Toggle navigation" aria-expanded={mobileMenu} className="icon-btn mobile-only" onClick={() => setMobileMenu(v => !v)}><Menu size={21}/></button>
          <div className={`connection ${online ? 'online' : 'offline'}`}>{!online ? 'Offline · cached catalog' : live ? 'Catalog synchronized' : 'Connecting to catalog…'}</div>
          <div className="top-actions"><NavLink className="icon-btn" to="/notifications" aria-label="Notifications"><Bell size={19}/></NavLink><AccountMenu /></div>
        </header>
        {loadError && <p role="alert" className="catalog-error">The live catalog could not refresh. Showing any available public cache.</p>}
        <Routes>
          <Route path="/" element={<Dashboard items={items} isDemo={isDemo}/>} />
          <Route path="/opportunities" element={<OpportunityList items={items}/>} />
          <Route path="/opportunities/:id" element={<OpportunityDetail items={items}/>} />
          <Route path="/applications" element={<Applications/>} />
          <Route path="/earnings" element={<Earnings items={items}/>} />
          <Route path="/ai" element={<AiAssistant/>} />
          <Route path="/offline" element={<Offline items={items}/>} />
          <Route path="/profile" element={<Profile/>} />
          <Route path="/settings" element={<EarningProfileSettings/>} />
          <Route path="/proof" element={<ProofBuilder/>} />
          <Route path="/notifications" element={<Notifications/>} />
        </Routes>
        <nav className="bottom-nav">
          <NavLink to="/"><Home size={18}/><span>Home</span></NavLink>
          <NavLink to="/opportunities"><Search size={18}/><span>Explore</span></NavLink>
          <NavLink to="/applications"><BriefcaseBusiness size={18}/><span>Applied</span></NavLink>
          <NavLink to="/earnings"><ChartNoAxesCombined size={18}/><span>Earnings</span></NavLink>
          <NavLink to="/settings"><SettingsIcon size={18}/><span>Settings</span></NavLink>
        </nav>
      </main>
    </div></PersonalizationProvider>
  );
}

function Dashboard({items, isDemo}:{items:Opportunity[], isDemo:boolean}) {
  const { user } = useAuth();
  const privateData = useUserData();
  const { fits, now } = usePersonalization();
  const summary = outcomeSummary(privateData.applications, privateData.earnings);
  const best = selectRecommendations(items,fits,'Best matches for you',privateData.applications,now).slice(0,3);
  // Every number below is derived from the data in hand. Nothing is padded with
  // a plausible-looking placeholder.
  const highPriority = items.filter(o=>o.rankScore>=80).length;
  const directPay = items.filter(o=>o.directPay===true).length;
  return <section className="page">
    <div className="hero"><div><span className="eyebrow">AUTONOMOUS HUNTER</span><h1>Discover your next opportunity</h1><p>Your hunter searches, verifies and ranks opportunities while you are away.</p></div><div className="hunter-pulse"><Bot size={36}/><span>{isDemo ? 'Demo rows — no live sync yet' : 'Ranked source records'}</span></div></div>
    {isDemo && <div className="trust-banner"><ShieldCheck/><div><b>Demo data</b><span>These rows are bundled placeholders for layout review. Connect the Firebase project and run the hunter to replace them with verified source records.</span></div></div>}
    <div className="stats-grid"><Stat n={`${items.length}`} label="Opportunities shown"/><Stat n={`${highPriority}`} label="High priority"/><Stat n={`${directPay}`} label="Direct pay"/><Stat n={user && !privateData.loading && !privateData.error ? `$${summary.totalPaidUsd.toFixed(2)}` : '—'} label="Recorded earnings (USD)"/></div>
    <div className="section-head"><div><h2>Best matches for you</h2><p>Personal fit uses your declared profile and proof. <NavLink to="/settings">Improve my earning profile</NavLink>.</p></div><NavLink to="/opportunities">View all</NavLink></div>
    <div className="card-grid">{best.map(o=><OpportunityCard key={o.id} o={o}/>)}</div>
    <div className="trust-banner"><ShieldCheck/><div><b>Evidence-first recommendations</b><span>AI can explain and rank evidence, but it cannot invent missing facts.</span></div></div>
  </section>
}

function Stat({n,label}:{n:string,label:string}) { return <div className="stat"><b>{n}</b><span>{label}</span></div>; }

function OpportunityCard({o}:{o:Opportunity}) {
  const { fits } = usePersonalization(); const fit = fits.get(o.id);
  return <NavLink to={`/opportunities/${o.id}`} className="op-card">
    <div className="op-top"><span className="category">{o.category}</span><span className="score">{o.rankScore}% global rank</span></div>
    {fit && <p className="personal-fit">{fit.score}/100 Personal Fit · {fit.eligible === 'blocked' ? 'Eligibility conflict' : fit.eligible === 'unknown' ? 'Eligibility unconfirmed' : 'Listed location matches'}</p>}
    <h3>{o.title}</h3><p>{o.provider} · {o.discoveredLabel}{o.demoSeed ? ' · DEMO ROW' : ''}</p><strong>{money(o)}</strong>
    <div className="tags">
      <span className={o.capitalStatus === 'confirmed_free' ? 'cost-confirmed' : 'cost-unconfirmed'}>{capitalStatusLabel(o.capitalStatus)}</span>
      {o.noCvRequired === true && <span>No CV</span>}
      {o.remote === true && <span>Remote</span>}
      {o.remote === 'unknown' && <span>Remote unknown</span>}
      <span>{o.sourceAttribution}</span>
    </div>
  </NavLink>
}

function OpportunityList({items}:{items:Opportunity[]}) {
  const [q,setQ]=useState(''); const [zero,setZero]=useState(true); const [confirmed,setConfirmed]=useState(false); const [noCv,setNoCv]=useState(false); const [trait,setTrait] = useState('');
  const [params,setParams] = useSearchParams(); const requested = params.get('view'); const view: RecommendationView = RECOMMENDATION_VIEWS.includes(requested as RecommendationView) ? requested as RecommendationView : 'Best matches for you';
  const { fits,now } = usePersonalization(); const { applications } = useUserData();
  const shown=useMemo(()=>selectRecommendations(items,fits,view,applications,now).filter(o=>(!q||`${o.title} ${o.category} ${o.provider} ${o.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()))&&(!zero||o.zeroCapital)&&(!confirmed||o.capitalStatus === 'confirmed_free')&&(!noCv||fits.get(o.id)?.path.cv === 'confirmed-not-required')&&(!trait || (trait === 'portfolio' ? fits.get(o.id)?.path.portfolio === 'confirmed-not-required' : fits.get(o.id)?.path[trait as 'beginner' | 'skillsTest' | 'directTask' | 'paidTraining' | 'bounty' | 'researchTesting' | 'quickApplication'] === true))),[items,fits,view,applications,now,q,zero,confirmed,noCv,trait]);
  return <section className="page"><div className="section-head"><div><h1>Explore opportunities</h1><p>Verified evidence, eligibility and earning fit in one place.</p></div></div>
    <div className="search-row"><div className="searchbox"><Search size={18}/><input aria-label="Search opportunities" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search skills, categories, platforms..."/></div></div>
    <div className="recommendation-controls"><label>Recommendation view<select value={view} onChange={e => setParams({ view:e.target.value })}>{RECOMMENDATION_VIEWS.map(v => <option key={v}>{v}</option>)}</select></label><label>Confirmed entry path<select value={trait} onChange={e => setTrait(e.target.value)}>{[['','Any (unknowns allowed)'],['portfolio','No portfolio required'],['beginner','Beginner friendly'],['skillsTest','Skills test accepted'],['directTask','Direct task'],['paidTraining','Paid evaluation / training'],['bounty','Bounty'],['researchTesting','Paid research / testing category'],['quickApplication','Quick application']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
    <div className="filter-chips"><button className={zero?'active':''} onClick={()=>setZero(v=>!v)}>Exclude upfront capital</button><button className={confirmed?'active':''} onClick={()=>setConfirmed(v=>!v)}>Confirmed $0 only</button><button className={noCv?'active':''} onClick={()=>setNoCv(v=>!v)}>Confirmed no CV</button></div><p>{shown.length} listings · Unknown requirements never count as confirmed. Highest verified reward is grouped by currency and payment period; values are advertised, not earned.</p>
    {!shown.length && <div className="profile-card">No current listing has the evidence needed for these filters. Broaden the view or build genuine proof while new opportunities arrive.</div>}<div className="list">{shown.map(o=><OpportunityCard key={o.id} o={o}/>)}</div></section>
}

function OpportunityDetail({items}:{items:Opportunity[]}) {
  const {id}=useParams(); const o=items.find(x=>x.id===id);
  const { user } = useAuth(); const { saved } = useUserData();
  const { fits } = usePersonalization(); const fit = o ? fits.get(o.id) : null;
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [snapshotHash, setSnapshotHash] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState('');
  useEffect(() => {
    let active = true;
    setSnapshotHash(null);
    if (!user || !id) { setSnapshotStatus('Sign in to read the evidence snapshot.'); return; }
    setSnapshotStatus('Loading authenticated evidence…');
    import('./repositories/firestoreOpportunityGateway').then(async ({ FirestoreOpportunityGateway }) => {
      const evidence = await new FirestoreOpportunityGateway().getEvidence(id);
      if (!active) return;
      setSnapshotHash(evidence?.contentHash ?? null);
      setSnapshotStatus(evidence ? `Snapshot captured ${evidence.fetchedAt}` : 'No evidence snapshot available.');
    }).catch(() => { if (active) setSnapshotStatus('Evidence could not load. Reconnect and try again.'); });
    return () => { active = false; };
  }, [user?.uid, id]);
  async function save() { if (!o) return; setBusy(true); setMessage(''); try { if (!navigator.onLine && user) { queuePrivateAction({ uid:user.uid,id:`save:${o.id}`,kind:'save',payload:o }); setMessage('Save queued in this tab; reconnect to confirm. Reload or sign-out discards the draft.'); } else { await saveOpportunity(o); setMessage('Saved to your private account.'); } } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save.'); } finally { setBusy(false); } }
  if (!o) return <section className="page"><h1>Opportunity unavailable</h1><NavLink to="/opportunities">Browse opportunities</NavLink></section>;
  return <section className="page detail-layout"><article className="detail-card">
    <div className="op-top"><span className="category">{o.category}</span><span className="score">{o.rankScore}% rank</span></div><h1>{o.title}</h1><div className="reward">{money(o)}</div><p className="muted">{o.provider} · {o.remote === true ? 'Remote' : o.remote === false ? 'On-site' : 'Remote unconfirmed'} · {o.discoveredLabel}</p>
    <div className="tags"><span className={o.capitalStatus === 'confirmed_free' ? 'cost-confirmed' : 'cost-unconfirmed'}>{capitalStatusLabel(o.capitalStatus)}</span><span>{o.noCvRequired === true ? 'No CV required' : o.noCvRequired === false ? 'CV required' : 'CV requirement unstated'}</span><span>{o.riskLevel} risk</span><span>{o.sourceAttribution}</span></div>
    <p className={(o.capitalStatus === 'confirmed_free' ? 'note-confirmed' : 'note-unconfirmed')}>{capitalStatusLabel(o.capitalStatus, 'long')}</p>
    <h2>About this opportunity</h2><p>{o.description}</p><h2>Requirements</h2><ul>{o.requirements.map(r=><li key={r}>{r}</li>)}</ul><h2>Payment</h2><p>{o.paymentMethods.join(' · ')}</p>
    {fit && <><FitExplanation fit={fit} confidence={o.confidence} /><ApplicationAssistant key={o.id} o={o} fit={fit} /></>}
    <div className="cta-row"><a href={o.sourceUrl} target="_blank" rel="noreferrer" className="primary">Visit official source</a><button disabled={busy || saved.includes(o.id)} className="secondary" onClick={() => void save()}><Bookmark size={17}/>{busy ? 'Saving…' : saved.includes(o.id) ? 'Saved to account' : 'Save to my account'}</button></div>
    {!user && <p><NavLink to="/profile">Sign in</NavLink> to save and track this opportunity. Evidence snapshots require sign-in.</p>}
    {message && <p role="status">{message}</p>}
    <div className="evidence"><b>Authenticated evidence snapshot</b><small>{snapshotStatus}</small>{snapshotHash && <small>SHA-256: {snapshotHash}</small>}</div>
    {o.demoSeed && <p className="muted"><b>Demo row.</b> This is bundled placeholder content, not a captured opportunity.</p>}
  </article><aside className="analysis-card"><ShieldCheck size={28}/><h2>Evidence verification</h2><div className="big-score">{o.confidence}%</div><p>Confidence from source evidence and rule-based checks.</p>{o.evidence.map(e=><div className="evidence" key={e.label}><span>{e.label}</span><b>{e.state === 'established' ? 'Established' : 'Unknown'}</b><small>{e.value}</small></div>)}<div className="risk-note"><b>Rule:</b> missing evidence is shown as unknown, never guessed by AI.</div></aside></section>
}

function AiAssistant(){ const { items,fits,now } = usePersonalization(); const { applications } = useUserData(); const best = selectRecommendations(items,fits,'Best matches for you',applications,now).slice(0,2); return <section className="page"><h1>Opportunity assistant</h1><p>FlagshipRouter is not configured. Evidence-grounded matching, comparison and application preparation work without AI. Paid AI is disabled.</p><div className="card-grid">{best.map(o => <div key={o.id}><OpportunityCard o={o} />{fits.get(o.id) && <FitExplanation fit={fits.get(o.id)!} confidence={o.confidence} />}</div>)}</div><p>Compare the fit reasons, missing skills and unknowns above. Open an opportunity to prepare a cover note, pitch, proposal, answers or proof summary from your genuine records.</p><NavLink to="/opportunities?view=Confirmed%20%240%20upfront">Show confirmed $0 opportunities</NavLink></section>; }

function Offline({items}:{items:Opportunity[]}) { const [cached, setCached] = useState(0); useEffect(() => { getCachedOpportunities().then(rows => setCached(rows.filter(row => !row.demoSeed).length)).catch(() => undefined); }, [items]); return <section className="page offline-page"><CloudOff size={58}/><h1>Offline access</h1><p>Previously synchronized public opportunities are available on this device.</p><div className="stats-grid"><Stat n={`${cached}`} label="Cached public opportunities"/></div><div className="trust-banner"><ShieldCheck/><div><b>Reconnect to change private records</b><span>Public listings remain available after reload. In a signed-in session, profile drafts, notes and safe saves may queue in tab memory with conflict checks. Reconnect for payments, proof changes and application outcomes. Sign-out or reload discards private drafts.</span></div></div></section>; }

export default function App(){ return <AuthProvider><UserDataProvider><BrowserRouter><AppShell/></BrowserRouter></UserDataProvider></AuthProvider>; }
