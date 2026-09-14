// Offline-Betrieb: App-Dateien werden beim ersten Start abgelegt und
// danach zuerst aus dem Cache bedient. Daten liegen ohnehin lokal.

const CACHE = 'primr-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './js/main.js',
  './js/core/util.js',
  './js/core/shift.js',
  './js/core/sleep.js',
  './js/core/zones.js',
  './js/core/readiness.js',
  './js/core/library.js',
  './js/core/plan.js',
  './js/core/tasks.js',
  './js/core/store.js',
  './js/core/context.js',
  './js/ui/dom.js',
  './js/ui/charts.js',
  './js/ui/components.js',
  './js/views/today.js',
  './js/views/training.js',
  './js/views/tasks.js',
  './js/views/sleep.js',
  './js/views/stats.js',
  './js/views/sheets.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
