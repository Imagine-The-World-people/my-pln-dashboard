/* Kompass Service Worker — cache-first for static assets */
/* Cache version: bump this string on every deploy to force cache refresh on all devices */
const CACHE = 'kompass-v20260519-1';
const STATIC = [
  '/',
  '/index.html',
  '/style.css',
  '/responsive.css',
  '/script.js',
  '/supabase-config.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for Supabase API calls (By-pass Cache match if fetch fails to avoid throwing undefined)
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), { 
        headers: { 'Content-Type': 'application/json' } 
      }))
    );
    return;
  }
  // Network-first for static assets — always get fresh code, fall back to cache offline
  e.respondWith(
    fetch(e.request).then(res => {
      // Only cache HTTP/HTTPS responses to avoid caching browser extensions or unsupported protocols
      if (res.ok && e.request.method === 'GET' && e.request.url.startsWith('http')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
