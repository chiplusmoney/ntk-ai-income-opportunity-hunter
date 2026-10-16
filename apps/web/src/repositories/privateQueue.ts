/** Private drafts are account-scoped RAM only. No background service worker or persistent private cache.
 * Reconnect runs explicit conflict-checked actions. Sign-out/reload discards drafts. Payments/proof verification cannot be queued. */
export type SafeAction = { id: string; uid: string; kind: 'earning-profile' | 'application-notes' | 'save'; payload: unknown; queuedAt: string; error: string | null };
let actions: SafeAction[] = [];
const subscribers = new Set<() => void>();
function emit() { for (const fn of subscribers) fn(); }
export function queuePrivateAction(action: Omit<SafeAction,'queuedAt' | 'error'>) {
  actions = [...actions.filter(a => !(a.uid === action.uid && a.id === action.id)),{ ...action, queuedAt: new Date().toISOString(), error: null }]; emit();
}
export function pendingPrivateActions(uid: string) { return actions.filter(a => a.uid === uid); }
export function clearPrivateActions(uid?: string) { actions = uid ? actions.filter(a => a.uid !== uid) : []; emit(); }
export function removePrivateAction(uid: string,id: string) { actions = actions.filter(a => !(a.uid === uid && a.id === id)); emit(); }
export function subscribePrivateActions(fn: () => void) { subscribers.add(fn); return () => { subscribers.delete(fn); }; }
export async function flushPrivateActions(uid: string, currentUid: () => string | undefined, execute: (action: SafeAction) => Promise<void>) {
  for (const action of pendingPrivateActions(uid)) {
    if (currentUid() !== uid) return;
    try { await execute(action); removePrivateAction(uid,action.id); }
    catch (e) { actions = actions.map(a => a === action ? { ...a, error: e instanceof Error ? e.message : 'Reconnect failed. Draft preserved.' } : a); emit(); }
  }
}
