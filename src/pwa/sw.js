/* Strata Lotpack service worker: keeps the app in cache so it works 100 % offline after the first visit.
   VERSION is replaced at build time by a hash of index.html, so each new version is detected;
   the page then shows "Update available – Reload" and the new version takes over on reload.
   Only the app files are cached: lotpack data stays in IndexedDB on the device. */
'use strict';
const VERSION = '__BUILD_VERSION__';
const CACHE = `strata-lotpack-${VERSION}`;
const FILES = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('strata-lotpack-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page asks the waiting version to take over when the user taps "Reload"
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// Cache first; pages fall back to the cached app (offline)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
    if (hit) return hit;
    return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
  }));
});
