import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, Download, LogIn, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { useUserData } from './repositories/userData';
import { createAccountExport } from './accountExport';

/** The provider owns the photo. An unavailable photo falls back to real initials. */
export function AccountAvatar({ large = false }: { large?: boolean }) {
  const { user } = useAuth();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = user?.photoURL?.startsWith('https://') ? user.photoURL : null;
  const initials = (user?.displayName || user?.email || '').trim().split(/\s+/).slice(0, 2).map(s => Array.from(s)[0]).join('').toUpperCase();
  return <span className={`account-avatar${large ? ' account-avatar-large' : ''}`} aria-hidden="true">
    {photo && photo !== failedPhoto ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setFailedPhoto(photo)} /> : initials || <UserRound size={large ? 28 : 20} />}
  </span>;
}

export function AccountMenu() {
  const { user, loading, error: authError, logout } = useAuth();
  const data = useUserData();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  useEffect(() => { setOpen(false); setMessage(''); }, [location.key, user?.uid]);
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const list = items(); if (!list.length) return;
    const current = list.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  }
  function download() {
    if (!user || data.loading || data.error) return;
    try {
      const contents = createAccountExport({ displayName: user.displayName, email: user.email }, data);
      const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `ntk-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Your account data was exported to a JSON file.');
    } catch { setMessage('Export could not be created. Please try again.'); }
  }
  async function signOut() { setBusy(true); try { await logout(); close(); } finally { setBusy(false); } }
  return <div className="account-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <button ref={trigger} className="account-trigger" type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'account-dropdown' : undefined} disabled={loading || busy} onClick={() => { setMessage(''); setOpen(v => !v); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <AccountAvatar /><ChevronDown size={14} />
    </button>
    {open && <div className="account-dropdown" id="account-dropdown" ref={menu} role="menu" aria-label="Account actions" onKeyDown={keyboard}>
      <div className="account-menu-identity" role="none"><strong>{user?.displayName || (user ? 'Your account' : 'Welcome')}</strong><span>{user?.email || 'Sign in to manage your account'}</span></div>
      <Link role="menuitem" to="/profile"><UserRound size={18}/>{user ? 'My profile' : 'Sign in'}{!user && <LogIn size={16}/>}</Link>
      {user && <Link role="menuitem" to="/profile#security"><ShieldCheck size={18}/>Account security</Link>}
      <Link role="menuitem" to="/settings"><Settings size={18}/>Settings &amp; preferences</Link>
      {user && <><Link role="menuitem" to="/notifications"><Bell size={18}/>Notifications</Link>
        <button type="button" role="menuitem" disabled={data.loading || !!data.error} onClick={download}><Download size={18}/>Export my data</button>
        <div className="account-menu-divider" role="separator" />
        <button type="button" role="menuitem" disabled={busy} onClick={() => void signOut()}><LogOut size={18}/>Sign out</button></>}
      {(message || authError) && <p className="account-menu-message" role="status">{message || authError}</p>}
    </div>}
  </div>;
}
