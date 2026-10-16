import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
const env: Env = { HUNTER_API_URL: 'https://api.example.invalid', HUNTER_SHARED_SECRET: 'test-only-scheduler-credential', DEFAULT_REGION_PRIORITY: 'NG,GLOBAL' };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('production scheduler surface (no HTTP trigger)', () => {
  it('does not retry an authentication failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.fn().mockResolvedValue(new Response('Denied', { status: 401 })); vi.stubGlobal('fetch', fetch);
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({} as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await expect(pending).rejects.toThrow('Scheduled API execution failed');
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed' })); vi.stubGlobal('fetch', fetch);
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({} as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await pending;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${env.HUNTER_API_URL}/internal/hunt`);
    expect(fetch.mock.calls[0][1].headers['x-ntk-hunter-secret']).toBe(env.HUNTER_SHARED_SECRET);
    expect(JSON.parse(fetch.mock.calls[0][1].body).reason).toBe('cron-30m');
  });
  it('logs a selected scheduled receipt without copying provider data or credentials', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', secret: env.HUNTER_SHARED_SECRET, summary: { runId: 'run-proof', published: 4, drafts: 1, writes: { written: 10, failed: [] }, sourcePayload: 'not-for-logs' } })));
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({ scheduledTime: Date.parse('2026-10-16T02:00:00Z'), cron: '*/30 * * * *' } as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await pending;
    const receipt = JSON.parse(log.mock.calls[0][0]);
    expect(receipt).toEqual({ event: 'scheduler-run', scheduledAt: '2026-10-16T02:00:00.000Z', cron: '*/30 * * * *', outcome: 'completed', runId: 'run-proof', written: 10, failedWrites: 0, published: 4, drafts: 1 });
    expect(log.mock.calls[0][0]).not.toContain(env.HUNTER_SHARED_SECRET);
    expect(log.mock.calls[0][0]).not.toContain('not-for-logs');
  });
  it('records a busy invocation without claiming that a hunt completed or retrying', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'busy', activeRunId: 'existing-run' }, { status: 409 })); vi.stubGlobal('fetch', fetch);
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({} as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await pending;
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ outcome: 'busy', runId: 'existing-run', written: 0 });
  });
  it('rejects a malformed success body and logs only a stable failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(env.HUNTER_SHARED_SECRET)));
    let pending: Promise<unknown> | undefined;
    await worker.scheduled({} as ScheduledEvent, env, { waitUntil(p) { pending = p; } } as ExecutionContext);
    await expect(pending).rejects.toThrow('Scheduled API execution failed');
    expect(error.mock.calls[0][0]).not.toContain(env.HUNTER_SHARED_SECRET);
  });
});
