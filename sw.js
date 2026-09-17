// Offline-Betrieb.
//
// Wichtig ist die Reihenfolge: zuerst Netz, dann Cache. Andersherum – so lief
// die erste Fassung – bleibt eine einmal installierte App für immer auf dem
// Stand ihrer Installation stehen, weil jede Anfrage aus dem Cache beantwortet
// wird und das Netz nie gefragt wird. Der Cache ist hier nur die Rückfallebene
// für den Fall, dass gerade keine Verbindung besteht.

const VERSION = '2026.09.17-99e0e0d3';
const CACHE = `primr-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.json',
  './css/app.css',
  './icons/icon.svg',
  './js/main.js',
  './js/version.js',
  './js/core/util.js',
  './js/core/shift.js',
  './js/core/sleep.js',
  './js/core/timeline.js',
  './js/core/zones.js',
  './js/core/readiness.js',
  './js/core/library.js',
  './js/core/plan.js',
  './js/core/race.js',
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

// Bewusst ohne skipWaiting: Der neue Worker wartet, bis die App ihn holt.
// Die Seite entscheidet, wann übernommen wird – beim Start sofort und still,
// während der Nutzung erst auf Zuruf. Ein Neuladen mitten in einer Eingabe
// wäre sonst die Regel.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Die App darf den wartenden Worker übernehmen lassen, wenn der Nutzer
// "Aktualisieren" tippt.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'version') {
    event.source.postMessage({ type: 'version', version: VERSION });
  }
});

/**
 * Netz mit Zeitlimit – ohne das hängt ein schlechtes Netz die App auf.
 *
 * cache: 'reload' ist hier entscheidend. Unter dem Service Worker liegt noch
 * der HTTP-Cache des Browsers; ein gewöhnliches fetch() wird auch von dort
 * bedient und liefert dann wieder die alte Datei aus. Der Cache dieses
 * Workers ist die einzige Zwischenspeicherung, die wir wollen – die Ebene
 * darunter wird bewusst übergangen.
 */
function fromNetwork(request) {
  const fresh = new Request(request.url, {
    cache: 'reload',
    credentials: 'same-origin',
    redirect: 'follow',
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(fresh).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fromNetwork(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request)
        .then((hit) => hit || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
