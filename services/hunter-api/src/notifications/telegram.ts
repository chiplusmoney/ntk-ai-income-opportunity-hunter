import type { Firestore } from 'firebase-admin/firestore';

export interface DeliveryReceipt { channel: 'telegram'; status: 'delivered' | 'unknown' | 'failed' | 'already-attempted'; at: string; providerMessageId?: number; kind: 'controlled-owner-test' }
interface Options { token: string; chatId: string; ownerUid: string; db: Firestore; fetchImpl?: typeof fetch; now?: () => Date }

/** Administrative setup probe: getMe/getUpdates do not send messages. Only
 * private chat identifiers are returned; the token and message text stay private. */
export async function inspectTelegramSetup(token: string) {
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) throw new Error('Telegram token is not configured');
  const call = async (method: string) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error('Telegram setup probe failed');
    const data = await r.json() as { ok: boolean; result: unknown };
    if (!data.ok) throw new Error('Telegram setup probe failed');
    return data.result;
  };
  const me = await call('getMe') as { username?: string };
  const updates = await call('getUpdates') as { message?: { chat?: { id: number; type: string; username?: string } } }[];
  const chats = updates.map(u => u.message?.chat).filter(c => c?.type === 'private');
  return { botUsername: me.username, privateChats: [...new Map(chats.map(c => [c!.id, { id: String(c!.id), username: c!.username ?? null }])).values()] };
}

/** Single controlled delivery, with a server-only permanent attempt ledger.
 * An ambiguous provider timeout is never retried: Telegram sendMessage has no
 * idempotency key. Deleting a user notification cannot authorize a second send.
 */
export async function sendControlledTelegramTest(options: Options): Promise<DeliveryReceipt> {
  const { token, chatId, ownerUid, db } = options;
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token) || !/^\d+$/.test(chatId) || !ownerUid || ownerUid.includes('/')) throw new Error('Telegram owner delivery is not configured');
  const at = (options.now?.() ?? new Date()).toISOString();
  const ledger = db.doc('internal/notificationDeliveries/attempts/m5b-controlled-owner-test');
  const reserved = await db.runTransaction(async tx => {
    const existing = await tx.get(ledger);
    if (existing.exists) return false;
    tx.create(ledger, { channel: 'telegram', status: 'sending', at, kind: 'controlled-owner-test', ownerUid });
    return true;
  });
  if (!reserved) return { channel: 'telegram', status: 'already-attempted', at, kind: 'controlled-owner-test' };
  let receipt: DeliveryReceipt = { channel: 'telegram', status: 'unknown', at, kind: 'controlled-owner-test' };
  try {
    const response = await (options.fetchImpl ?? fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ chat_id: chatId, text: 'NTK AI Income Opportunity Hunter — controlled delivery test. This verifies Telegram delivery only; it does not claim an earning or application outcome.', disable_web_page_preview: true })
    });
    const data = await response.json() as { ok?: boolean; result?: { message_id?: number } };
    receipt = { ...receipt, status: response.ok && data.ok && Number.isSafeInteger(data.result?.message_id) ? 'delivered' : 'failed', ...(Number.isSafeInteger(data.result?.message_id) ? { providerMessageId: data.result!.message_id } : {}) };
  } catch { /* No error URLs, request headers, token or raw provider bodies are logged. */ }
  const batch = db.batch();
  batch.set(ledger, receipt, { merge: true });
  batch.set(db.doc(`users/${ownerUid}/notifications/m5b-controlled-owner-test`), {
    ...receipt, title: 'Telegram delivery test', body: receipt.status === 'delivered' ? 'Telegram confirmed the controlled test message.' : 'Delivery was not confirmed. No automatic retry will be made.', createdAt: at, read: false
  });
  await batch.commit();
  return receipt;
}
