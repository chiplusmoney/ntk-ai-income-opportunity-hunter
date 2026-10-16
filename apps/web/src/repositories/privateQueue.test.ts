import { beforeEach,describe,it,expect } from 'vitest';
import { clearPrivateActions,queuePrivateAction,pendingPrivateActions,flushPrivateActions } from './privateQueue';
beforeEach(() => clearPrivateActions());
const queue = (uid = 'alice') => queuePrivateAction({ uid,id:'notes:1',kind:'application-notes',payload:{ notes:'Real note',baseUpdatedAt:'old' } });
describe('private session draft queue',() => {
  it('is UID-isolated',() => { queue(); expect(pendingPrivateActions('bob')).toEqual([]); });
  it('coalesces edits to the same draft instead of duplicating actions',() => { queue(); queue(); expect(pendingPrivateActions('alice')).toHaveLength(1); });
  it('removes only successfully persisted drafts',async () => { queue(); await flushPrivateActions('alice',() => 'alice',async () => {}); expect(pendingPrivateActions('alice')).toEqual([]); });
  it('preserves a conflict for owner review',async () => { queue(); await flushPrivateActions('alice',() => 'alice',async () => { throw Error('Record changed'); }); expect(pendingPrivateActions('alice')[0]?.error).toContain('changed'); });
  it('refuses to replay a previous UID after an account switch',async () => { queue(); let ran = false; await flushPrivateActions('alice',() => 'bob',async () => { ran = true; }); expect(ran).toBe(false); });
  it('discards all drafts on sign-out',() => { queue(); queue('bob'); clearPrivateActions(); expect(pendingPrivateActions('alice')).toEqual([]); expect(pendingPrivateActions('bob')).toEqual([]); });
  it('does not delete a different account draft during a scoped clear',() => { queue(); queue('bob'); clearPrivateActions('alice'); expect(pendingPrivateActions('bob')).toHaveLength(1); });
});
