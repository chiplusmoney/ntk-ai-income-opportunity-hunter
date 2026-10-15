import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { sendControlledTelegramTest } from '../src/notifications/telegram.js';

function setup() {
  const documents = new Map<string, unknown>();
  const db = {
    doc: (path: string) => ({ path }),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) => fn({ get: async (ref: {path: string}) => ({ exists: documents.has(ref.path) }), create: (ref: {path: string}, value: unknown) => documents.set(ref.path, value) }),
    batch: () => { const writes: [string, unknown][] = []; return { set: (ref: {path: string}, value: unknown) => writes.push([ref.path, value]), commit: async () => { writes.forEach(([key, value]) => documents.set(key, value)); } }; }
  } as unknown as Firestore;
  const fetchImpl = vi.fn().mockResolvedValue(Response.json({ ok: true, result: { message_id: 123 } }));
  return { documents, fetchImpl, options: { token: `123456:${'testonly'.repeat(5)}`, chatId: '12345', ownerUid: 'owner', db, fetchImpl, now: () => new Date('2026-10-15T10:00:00Z') } };
}
describe('controlled Telegram transport', () => {
  it('dispatches once and persists only non-secret receipt fields', async () => {
    const { options, documents, fetchImpl } = setup();
    expect((await sendControlledTelegramTest(options)).status).toBe('delivered');
    expect((await sendControlledTelegramTest(options)).status).toBe('already-attempted');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(documents.has('users/owner/notifications/m5b-controlled-owner-test')).toBe(true);
    expect(JSON.stringify([...documents.values()])).not.toContain(options.token);
  });
  it('does not retry an ambiguous network failure or call it delivered', async () => {
    const { options, fetchImpl } = setup(); fetchImpl.mockRejectedValue(new Error('network timeout'));
    expect((await sendControlledTelegramTest(options)).status).toBe('unknown');
    expect((await sendControlledTelegramTest(options)).status).toBe('already-attempted');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('fails closed without a configured private destination', async () => {
    const { options, fetchImpl } = setup();
    await expect(sendControlledTelegramTest({ ...options, chatId: '' })).rejects.toThrow('not configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not equate HTTP success with provider delivery', async () => {
    const { options, fetchImpl } = setup(); fetchImpl.mockResolvedValue(Response.json({ ok: false }));
    expect((await sendControlledTelegramTest(options)).status).toBe('failed');
  });
});
