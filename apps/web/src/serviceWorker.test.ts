/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe,it,expect,vi } from 'vitest';
const source = readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function harness() {
  const handlers = new Map<string,(event: unknown) => void>();
  const cache = { addAll:vi.fn(async (_requests: unknown[]) => {}),match:vi.fn(async () => new Response('<script src="/assets/current.js"></script>')),put:vi.fn(async () => {}) };
  const fetcher = vi.fn(async (_request: Request) => new Response('current HTML'));
  runInNewContext(source,{ Request:class extends Request { constructor(input: string | Request,init?: RequestInit) { super(typeof input === 'string' ? new URL(input,'https://hunter.example').href : input,init); } },Response,URL,fetch:fetcher,caches:{ open:async () => cache,match:async () => new Response('offline shell') },self:{ location:{ origin:'https://hunter.example' },skipWaiting:async () => {},addEventListener:(name: string,handler: (event:unknown) => void) => handlers.set(name,handler) } });
  return { handlers,cache,fetcher };
}
describe('actual service worker update boundaries',() => {
  it('revalidates navigation and seeds a new shell without stale HTTP cache',async () => {
    const h = harness(); let pending: Promise<unknown> | undefined;
    h.handlers.get('install')!({ waitUntil:(p: Promise<unknown>) => { pending=p; } }); await pending;
    expect((h.cache.addAll.mock.calls[0]![0] as Request[]).every(r => r.cache === 'reload')).toBe(true);
    const request = new Request('https://hunter.example/opportunities');Object.defineProperty(request,'mode',{ value:'navigate' });
    h.handlers.get('fetch')!({ request,respondWith:(p: Promise<unknown>) => { pending=p; } });await pending;
    expect(h.fetcher.mock.calls[0]![0].cache).toBe('no-cache');
  });
  it('never intercepts authenticated external data or private POST operations',() => {
    const h = harness();const respondWith=vi.fn();
    h.handlers.get('fetch')!({ request:new Request('https://firestore.googleapis.com/private',{ headers:{ authorization:'test-only-placeholder' } }),respondWith });
    h.handlers.get('fetch')!({ request:new Request('https://hunter.example/v1/private',{ method:'POST' }),respondWith });
    expect(respondWith).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
  });
});
