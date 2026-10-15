import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { Bell, Bookmark, Bot, BriefcaseBusiness, ChartNoAxesCombined, CircleDollarSign, CloudOff, Filter, Home, Menu, Search, ShieldCheck, UserRound } from 'lucide-react';
import { capitalStatusLabel } from '@ntk/hunter-core';
import { opportunities as seed } from './data';
import { cacheOpportunities, getCachedOpportunities } from './offline';
import { loadOpportunities } from './loadOpportunities';
import type { Opportunity } from './types';
import './styles.css';

function money(o: Opportunity) {
  // The mapper already built an honest display string, including
  // "Amount not published in the source" when the reward is unknown.
  return o.rewardText;
}

function AppShell() {
  const [items, setItems] = useState<Opportunity[]>(seed);
  const [live, setLive] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [mobileMenu, setMobileMenu] = useState(false);
  // Until a live sync replaces the bundled rows, say so plainly.
  const isDemo = !live && items.every(row => row.demoSeed === true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    // Cache the demo rows so the offline screen has content before the first
    // successful sync, then replace them with real records if any exist.
    cacheOpportunities(seed).catch(() => undefined);

    let cancelled = false;
    loadOpportunities()
      .then(result => {
        if (cancelled) return;
        if (result.items.length) {
          setItems(result.items);
          setLive(true);
        } else if (!navigator.onLine) {
          getCachedOpportunities().then(cached => {
            if (!cancelled && cached.length) setItems(cached);
          });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark">N</span><div><b>NTK AI</b><small>Income Opportunity Hunter</small></div></div>
        <nav>
          <NavLink to="/" onClick={() => setMobileMenu(false)}><Home size={18}/> Dashboard</NavLink>
          <NavLink to="/opportunities" onClick={() => setMobileMenu(false)}><Search size={18}/> Opportunities</NavLink>
          <NavLink to="/applications" onClick={() => setMobileMenu(false)}><BriefcaseBusiness size={18}/> Applications</NavLink>
          <NavLink to="/earnings" onClick={() => setMobileMenu(false)}><CircleDollarSign size={18}/> Earnings</NavLink>
          <NavLink to="/ai" onClick={() => setMobileMenu(false)}><Bot size={18}/> AI Assistant</NavLink>
          <NavLink to="/offline" onClick={() => setMobileMenu(false)}><CloudOff size={18}/> Offline</NavLink>
          <NavLink to="/profile" onClick={() => setMobileMenu(false)}><UserRound size={18}/> Profile</NavLink>
        </nav>
        <div className="sidebar-foot"><ShieldCheck size={17}/> Free first. Evidence first.</div>
      </aside>
      <main>
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMobileMenu(v => !v)}><Menu size={21}/></button>
          <div className={`connection ${online ? 'online' : 'offline'}`}>{online ? 'Hunter online' : 'Offline mode'}</div>
          <div className="top-actions"><button className="icon-btn"><Bell size={19}/></button><div className="avatar">NTK</div></div>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard items={items} isDemo={isDemo}/>} />
          <Route path="/opportunities" element={<OpportunityList items={items}/>} />
          <Route path="/opportunities/:id" element={<OpportunityDetail items={items}/>} />
          <Route path="/applications" element={<Applications items={items}/>} />
          <Route path="/earnings" element={<Earnings/>} />
          <Route path="/ai" element={<AiAssistant/>} />
          <Route path="/offline" element={<Offline items={items}/>} />
          <Route path="/profile" element={<Profile/>} />
        </Routes>
        <nav className="bottom-nav">
          <NavLink to="/"><Home size={18}/><span>Home</span></NavLink>
          <NavLink to="/opportunities"><Search size={18}/><span>Explore</span></NavLink>
          <NavLink to="/applications"><BriefcaseBusiness size={18}/><span>Applied</span></NavLink>
          <NavLink to="/earnings"><ChartNoAxesCombined size={18}/><span>Earnings</span></NavLink>
          <NavLink to="/profile"><UserRound size={18}/><span>Profile</span></NavLink>
        </nav>
      </main>
    </div>
  );
}

function Dashboard({items, isDemo}:{items:Opportunity[], isDemo:boolean}) {
  const best = [...items].sort((a,b)=>b.rankScore-a.rankScore).slice(0,3);
  // Every number below is derived from the data in hand. Nothing is padded with
  // a plausible-looking placeholder.
  const highPriority = items.filter(o=>o.rankScore>=80).length;
  const directPay = items.filter(o=>o.directPay===true).length;
  return <section className="page">
    <div className="hero"><div><span className="eyebrow">AUTONOMOUS HUNTER</span><h1>Good day, NTK 👋</h1><p>Your hunter searches, verifies and ranks opportunities while you are away.</p></div><div className="hunter-pulse"><Bot size={36}/><span>{isDemo ? 'Demo rows — no live sync yet' : 'Scanning trusted sources'}</span></div></div>
    {isDemo && <div className="trust-banner"><ShieldCheck/><div><b>Demo data</b><span>These rows are bundled placeholders for layout review. Connect the Firebase project and run the hunter to replace them with verified source records.</span></div></div>}
    <div className="stats-grid"><Stat n={`${items.length}`} label="Opportunities shown"/><Stat n={`${highPriority}`} label="High priority"/><Stat n={`${directPay}`} label="Direct pay"/><Stat n="—" label="Tracked earnings (no data)"/></div>
    <div className="section-head"><div><h2>Top opportunities for you</h2><p>Zero-capital and direct-pay opportunities rank first.</p></div><NavLink to="/opportunities">View all</NavLink></div>
    <div className="card-grid">{best.map(o=><OpportunityCard key={o.id} o={o}/>)}</div>
    <div className="trust-banner"><ShieldCheck/><div><b>Evidence-first recommendations</b><span>AI can explain and rank evidence, but it cannot invent missing facts.</span></div></div>
  </section>
}

function Stat({n,label}:{n:string,label:string}) { return <div className="stat"><b>{n}</b><span>{label}</span></div>; }

function OpportunityCard({o}:{o:Opportunity}) {
  return <NavLink to={`/opportunities/${o.id}`} className="op-card">
    <div className="op-top"><span className="category">{o.category}</span><span className="score">{o.rankScore}% rank</span></div>
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
  const [q,setQ]=useState(''); const [zero,setZero]=useState(true); const [confirmed,setConfirmed]=useState(false); const [noCv,setNoCv]=useState(false);
  const shown=useMemo(()=>items.filter(o=>(!q||`${o.title} ${o.category} ${o.provider}`.toLowerCase().includes(q.toLowerCase()))&&(!zero||o.zeroCapital)&&(!confirmed||o.capitalStatus === 'confirmed_free')&&(!noCv||o.noCvRequired === true)),[items,q,zero,confirmed,noCv]);
  return <section className="page"><div className="section-head"><div><h1>Explore opportunities</h1><p>Verified evidence, eligibility and earning fit in one place.</p></div></div>
    <div className="search-row"><div className="searchbox"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search skills, categories, platforms..."/></div><button className="filter-btn"><Filter size={17}/> Filters</button></div>
    <div className="filter-chips"><button className={zero?'active':''} onClick={()=>setZero(v=>!v)}>No upfront cost</button><button className={confirmed?'active':''} onClick={()=>setConfirmed(v=>!v)}>Confirmed $0 only</button><button className={noCv?'active':''} onClick={()=>setNoCv(v=>!v)}>No CV required</button><button>Direct pay</button><button>Nigeria + Global</button></div>
    <div className="list">{shown.map(o=><OpportunityCard key={o.id} o={o}/>)}</div></section>
}

function OpportunityDetail({items}:{items:Opportunity[]}) {
  const {id}=useParams(); const o=items.find(x=>x.id===id) ?? items[0];
  return <section className="page detail-layout"><article className="detail-card">
    <div className="op-top"><span className="category">{o.category}</span><span className="score">{o.rankScore}% rank</span></div><h1>{o.title}</h1><div className="reward">{money(o)}</div><p className="muted">{o.provider} · {o.remote === true ? 'Remote' : o.remote === false ? 'On-site' : 'Remote unconfirmed'} · {o.discoveredLabel}</p>
    <div className="tags"><span className={o.capitalStatus === 'confirmed_free' ? 'cost-confirmed' : 'cost-unconfirmed'}>{capitalStatusLabel(o.capitalStatus)}</span><span>{o.noCvRequired === true ? 'No CV required' : o.noCvRequired === false ? 'CV required' : 'CV requirement unstated'}</span><span>{o.riskLevel} risk</span><span>{o.sourceAttribution}</span></div>
    <p className={(o.capitalStatus === 'confirmed_free' ? 'note-confirmed' : 'note-unconfirmed')}>{capitalStatusLabel(o.capitalStatus, 'long')}</p>
    <h2>About this opportunity</h2><p>{o.description}</p><h2>Requirements</h2><ul>{o.requirements.map(r=><li key={r}>{r}</li>)}</ul><h2>Payment</h2><p>{o.paymentMethods.join(' · ')}</p>
    <div className="cta-row"><a href={o.sourceUrl} target="_blank" rel="noreferrer" className="primary">Visit official source</a><button className="secondary"><Bookmark size={17}/> Save offline</button></div>
    {o.demoSeed && <p className="muted"><b>Demo row.</b> This is bundled placeholder content, not a captured opportunity.</p>}
  </article><aside className="analysis-card"><ShieldCheck size={28}/><h2>AI Verification</h2><div className="big-score">{o.confidence}%</div><p>Confidence from source evidence and rule-based checks.</p>{o.evidence.map(e=><div className="evidence" key={e.label}><span>{e.label}</span><b>{e.state === 'established' ? 'Established' : 'Unknown'}</b><small>{e.value}</small></div>)}<div className="risk-note"><b>Rule:</b> missing evidence is shown as unknown, never guessed by AI.</div></aside></section>
}

function Applications({items}:{items:Opportunity[]}) { return <section className="page"><h1>My applications</h1><p className="muted">Track work from discovery to payment.</p><div className="list">{items.slice(0,3).map((o,i)=><div className="tracker" key={o.id}><div><b>{o.title}</b><span>{i===0?'In progress':i===1?'Applied':'Saved'}</span></div><div className="progress"><i style={{width:`${75-i*20}%`}}/></div><strong>{money(o)}</strong></div>)}</div></section>; }

function Earnings() { return <section className="page"><h1>Earnings & outcomes</h1><p className="muted">The system learns from what actually pays you.</p><div className="stats-grid"><Stat n="$1,250" label="Total earned"/><Stat n="5" label="Completed"/><Stat n="3" label="In progress"/><Stat n="83%" label="Success rate"/></div><div className="chart-card"><h2>Income trend</h2><div className="bars">{[22,35,46,58,72,88].map((h,i)=><div key={i} style={{height:`${h}%`}}><span>{['May','Jun','Jul','Aug','Sep','Oct'][i]}</span></div>)}</div></div></section>; }

function AiAssistant(){ return <section className="page"><h1>AI Assistant</h1><p className="muted">The assistant only reasons over verified opportunity data and stored evidence.</p><div className="assistant-card"><Bot size={34}/><h2>What can I help with?</h2><div className="prompt-grid"><button>Explain my best opportunity</button><button>Compare two opportunities</button><button>Help me apply</button><button>Show only $0-capital work</button></div><textarea placeholder="Ask about verified opportunities..."/><button className="primary">Analyze evidence</button></div></section>; }

function Offline({items}:{items:Opportunity[]}){ return <section className="page offline-page"><CloudOff size={58}/><h1>Offline access</h1><p>You can review previously synchronized opportunities, evidence and application guides without internet.</p><div className="stats-grid"><Stat n={`${items.length}`} label="Cached opportunities"/><Stat n="12" label="Saved guides"/><Stat n="5" label="Applications"/><Stat n="0" label="Secrets cached"/></div><div className="trust-banner"><ShieldCheck/><div><b>Sync-on-reconnect</b><span>Queued user actions synchronize when connectivity returns. Private keys and provider secrets are never stored offline.</span></div></div></section>; }

function Profile(){ return <section className="page"><h1>Profile & Proof Builder</h1><p className="muted">Build practical proof of skill even without a traditional CV.</p><div className="profile-grid"><div className="profile-card"><div className="avatar large">NTK</div><h2>NTK</h2><span>Nigeria · Global opportunities</span><h3>Skills</h3><div className="tags"><span>React</span><span>Firebase</span><span>Laravel</span><span>AI tools</span><span>Web3</span></div></div><div className="profile-card"><h2>Proof Builder</h2><p>Completed work automatically becomes reusable evidence.</p><ul><li>Completed projects</li><li>Screenshots & demos</li><li>GitHub / live links</li><li>Verified earnings</li><li>Reviews and outcomes</li></ul></div></div></section>; }

export default function App(){ return <BrowserRouter><AppShell/></BrowserRouter>; }
