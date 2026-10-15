import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthState { user: User | null; loading: boolean; error: string | null; logout: () => Promise<void> }
const Context = createContext<AuthState>({ user: null, loading: true, error: null, logout: async () => {} });
export const useAuth = () => useContext(Context);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!auth) { setLoading(false); setError('Authentication is not configured.'); return; }
    return onAuthStateChanged(auth, next => { setUser(next); setLoading(false); setError(null); }, () => {
      setUser(null); setLoading(false); setError('Could not restore your session. Please sign in again.');
    });
  }, []);
  async function logout() {
    if (!auth) return;
    // Mask private state before the asynchronous sign-out completes.
    setUser(null); setLoading(true);
    try { await signOut(auth); } catch { setError('Sign out failed. Try again.'); setUser(auth.currentUser); }
    finally { setLoading(false); }
  }
  return <Context.Provider value={{ user, loading, error, logout }}>{children}</Context.Provider>;
}
