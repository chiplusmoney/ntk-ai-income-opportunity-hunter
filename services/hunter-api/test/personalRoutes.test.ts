import { afterEach,describe,it,expect,vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { Firestore } from 'firebase-admin/firestore';
import { createPersonalRouter } from '../src/personal.js';
let server: Server;
afterEach(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
async function setup(verify = vi.fn(async () => ({ uid:'alice' }))) {
  const db = { runTransaction:vi.fn(async () => { throw Error('not called without authorization'); }) } as unknown as Firestore;
  const app = express(); app.use(express.json()); app.use('/v1',createPersonalRouter(db,verify as never));
  const base = await new Promise<string>(resolve => { server = app.listen(0,() => { const a=server.address(); if (a && typeof a === 'object') resolve(`http://127.0.0.1:${a.port}`); }); });
  return { base,db,verify };
}
describe('personal API trusted identity boundary',() => {
  it('keeps operations private from anonymous callers',async()=>{const {base}=await setup();expect((await fetch(`${base}/v1/operations`)).status).toBe(401);});
  it('fails closed for a valid user when no operations owner is configured',async()=>{const {base,db}=await setup();expect((await fetch(`${base}/v1/operations`,{headers:{authorization:'Bearer test-only'}})).status).toBe(403);expect(db.runTransaction).not.toHaveBeenCalled();});
  it('requires an ID token before touching private state',async () => { const { base,db } = await setup(); expect((await fetch(`${base}/v1/applications/real:1/transition`,{ method:'POST' })).status).toBe(401); expect(db.runTransaction).not.toHaveBeenCalled(); });
  it('rejects an invalid or revoked token',async () => { const { base } = await setup(vi.fn(async () => { throw Error('invalid'); })); expect((await fetch(`${base}/v1/applications/1/transition`,{ method:'POST',headers:{ authorization:'Bearer test-only-id-token' } })).status).toBe(401); });
  it('refuses an unapproved browser origin',async () => { const { base,verify } = await setup(); const r = await fetch(`${base}/v1/applications/1/transition`,{ method:'POST',headers:{ origin:'https://malicious.invalid',authorization:'Bearer test-only-id-token' } }); expect(r.status).toBe(403); expect(verify).not.toHaveBeenCalled(); });
  it('allows the production preflight without exposing credentials',async () => { const { base } = await setup(); const r = await fetch(`${base}/v1/applications/1/transition`,{ method:'OPTIONS',headers:{ origin:'https://ntk-income-opportunity-hunter.web.app' } }); expect(r.status).toBe(204); expect(r.headers.get('access-control-allow-origin')).toBe('https://ntk-income-opportunity-hunter.web.app'); expect(r.headers.get('cache-control')).toBe('no-store'); });
  it('requires explicit receipt confirmation even with a valid session',async () => { const { base,db } = await setup(); const r = await fetch(`${base}/v1/applications/1/transition`,{ method:'POST',headers:{ 'content-type':'application/json',authorization:'Bearer test-only-id-token' },body:JSON.stringify({ to:'paid',payment:{ paidUsd:100,paidAt:'2026-10-16' } }) }); expect(r.status).toBe(400); expect(db.runTransaction).not.toHaveBeenCalled(); });
  it('rejects path traversal in a supplied record id',async () => { const { base,db } = await setup(); const r = await fetch(`${base}/v1/applications/${encodeURIComponent('other/id')}/transition`,{ method:'POST',headers:{ 'content-type':'application/json',authorization:'Bearer test-only-id-token' },body:JSON.stringify({ to:'applied',uid:'bob' }) }); expect(r.status).toBe(400); expect(db.runTransaction).not.toHaveBeenCalled(); });
});
