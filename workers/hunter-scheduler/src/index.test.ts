import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
const env: Env = { HUNTER_API_URL: 'https://api.example.invalid', HUNTER_SHARED_SECRET: 'test-only-scheduler-credential', DEFAULT_REGION_PRIORITY: 'NG,GLOBAL' };
afterEach(() => vi.unstubAllGlobals());
describe('production scheduler surface (no HTTP trigger)', () => {
  it('does not retry an authentication failure', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Denied', { status: 401 })); vi.stubGlobal('fetch', fetch);
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({} as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await expect(pending).rejects.toThrow('Hunter API returned 401');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([undefined, 'wrong', 'test-only-scheduler-credential'])('rejects /run regardless of credential %s', async credential => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(new Request('https://scheduler.example.invalid/run', { method: 'POST', headers: credential ? { authorization: `Bearer ${credential}` } : {} }), env);
    expect(response.status).toBe(404); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps health public and free of configuration', async () => {
    const response = await worker.fetch(new Request('https://scheduler.example.invalid/health'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'hunter-scheduler' });
  });
  it('runs internal cron without an HTTP credential and forwards the server credential', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed' })); vi.stubGlobal('fetch', fetch);
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({} as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await pending;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${env.HUNTER_API_URL}/internal/hunt`);
    expect(fetch.mock.calls[0][1].headers['x-ntk-hunter-secret']).toBe(env.HUNTER_SHARED_SECRET);
    expect(JSON.parse(fetch.mock.calls[0][1].body).reason).toBe('cron-30m');
  });
});
