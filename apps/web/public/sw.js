const CACHE = 'ntk-income-hunter-m6-v2';
const SHELL = ['/', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Deployment changes HTML before its hashed assets. Never seed a new shell
    // from a still-fresh browser HTTP cache left by the previous deployment.
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
    const index = await cache.match('/');
    const html = await index.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"#?]+)"/g)].map(match => match[1]);
    await cache.addAll([...new Set(assets)]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('ntk-income-hunter-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Only public same-origin application assets belong in Cache Storage.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = request.mode === 'navigate';
  const asset = /^\/assets\/|^\/icons\//.test(url.pathname) || SHELL.includes(url.pathname);
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(navigation ? new Request(request, { cache: 'no-cache' }) : request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(navigation ? '/' : request, response.clone());
      }
      return response;
    } catch {
      return await caches.match(navigation ? '/' : request) || new Response('Offline asset unavailable', { status: 503 });
    }
  })());
});
