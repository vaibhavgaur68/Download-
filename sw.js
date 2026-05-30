/* ─────────────────────────────────────────────────────────────────────────────
   PULSE — sw.js  (Service Worker)
   Caches the game files for offline play.
───────────────────────────────────────────────────────────────────────────── */

const CACHE  = 'pulse-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
];

/* ── INSTALL: pre-cache all core assets ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* ── ACTIVATE: delete old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── FETCH: cache-first for local assets, network-first for fonts ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network for Google Fonts (they have their own cache headers)
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Only cache valid same-origin or explicitly listed cross-origin responses
        if (
          response.ok &&
          (url.origin === self.location.origin ||
           ASSETS.includes(e.request.url))
        ) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
