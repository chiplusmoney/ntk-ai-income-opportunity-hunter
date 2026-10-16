import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, type Firestore } from 'firebase/firestore';
import { applyTransition, createApplicationRecord, type ApplicationRecord } from '@ntk/hunter-core';

const ports = vi.hoisted(() => ({ auth: { currentUser: { uid: 'ledger-alice' } as { uid: string } | null }, firestore: null as Firestore | null }));
vi.mock('../../../apps/web/src/lib/firebase', () => ports);
import { transitionApplication } from '../../../apps/web/src/repositories/userData';

const enabled = process.env.FIREBASE_EMULATOR_TEST === '1';
describe.skipIf(!enabled)('actual frontend ledger transaction against Firestore rules', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({ projectId: 'demo-ntk-hunter', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8') } });
    ports.firestore = environment.authenticatedContext('ledger-alice').firestore() as Firestore;
    vi.stubGlobal('navigator', { onLine: true });
  });
  beforeEach(() => { ports.auth.currentUser = { uid: 'ledger-alice' }; });
  afterAll(async () => { vi.unstubAllGlobals(); await environment?.cleanup(); });

  async function submitted(id: string): Promise<ApplicationRecord> {
    let record = createApplicationRecord({ id, opportunityId: id, title: 'EMULATOR ONLY ledger fixture', provider: 'Test provider', category: 'Development', riskLevel: 'low', rankScore: 70, sourceUrl: 'https://example.invalid', attribution: 'Emulator fixture', now: new Date('2026-10-15T10:00:00Z') });
    for (const to of ['applied', 'accepted', 'in_progress', 'submitted'] as const) record = applyTransition(record, { to, now: new Date('2026-10-15T10:00:00Z') }).record;
    await setDoc(doc(ports.firestore!, 'users', 'ledger-alice', 'applications', id), record);
    return record;
  }
  it('atomically persists an explicitly recorded payment and prevents duplicates', async () => {
    await submitted('payment-once');
    const request = { to: 'paid' as const, now: new Date('2026-10-15T11:00:00Z'), payment: { paidUsd: 23.45, paidAt: '2026-10-15', method: 'Emulator fixture' } };
    await transitionApplication('payment-once', request);
    const earning = await getDoc(doc(ports.firestore!, 'users', 'ledger-alice', 'earnings', 'payment-once'));
    expect(earning.data()?.paidUsd).toBe(23.45);
    expect((await getDoc(doc(ports.firestore!, 'users', 'ledger-alice', 'applications', 'payment-once'))).data()?.state).toBe('paid');
    await expect(transitionApplication('payment-once', request)).rejects.toThrow('already in state');
    expect((await getDocs(collection(ports.firestore!, 'users', 'ledger-alice', 'earnings'))).docs.filter(d => d.id === 'payment-once')).toHaveLength(1);
  });
  it('does not create earnings from an expected reward', async () => {
    const record = await submitted('expected-only');
    await setDoc(doc(ports.firestore!, 'users', 'ledger-alice', 'applications', record.id), { expectedRewardUsd: 1250 }, { merge: true });
    await expect(transitionApplication(record.id, { to: 'paid', now: new Date() })).rejects.toThrow('requires an amount');
    expect((await getDoc(doc(ports.firestore!, 'users', 'ledger-alice', 'earnings', record.id))).exists()).toBe(false);
    expect((await getDoc(doc(ports.firestore!, 'users', 'ledger-alice', 'applications', record.id))).data()?.state).toBe('submitted');
  });
  it('refuses signed-out mutations before reaching Firestore', async () => {
    ports.auth.currentUser = null;
    await expect(transitionApplication('payment-once', { to: 'paid', now: new Date() })).rejects.toThrow('Sign in');
  });
  it('refuses offline mutations without claiming a queued or persisted outcome', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(transitionApplication('payment-once', { to: 'paid', now: new Date() })).rejects.toThrow('No action has been queued');
    vi.stubGlobal('navigator', { onLine: true });
  });
});
