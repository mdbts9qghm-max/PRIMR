// Prüft die Auslieferung: Version, Cache-Liste und Cache-Strategie.
// Genau hier lag der Fehler, wegen dem eine installierte App nie wieder
// aktualisiert wurde – diese Tests halten ihn fest.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../js/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failures.push(`${name}\n    ${err.message.split('\n')[0]}`);
  }
}

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const abs = join(root, dir, entry);
    const rel = relative(root, abs).split('\\').join('/');
    return statSync(abs).isDirectory() ? walk(rel) : [rel];
  });
}

test('sw.js, js/version.js und version.json nennen dieselbe Version', () => {
  const match = sw.match(/const VERSION = '([^']+)'/);
  assert.ok(match, 'sw.js enthält keine Versionsangabe');
  assert.equal(match[1], VERSION);
  const published = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));
  assert.equal(published.version, VERSION, 'version.json weicht ab – die App würde endlos aktualisieren wollen');
});

test('Der wartende Worker übernimmt nicht von selbst', () => {
  // skipWaiting im install-Ereignis lädt die Seite mitten in einer Eingabe
  // neu. Wann übernommen wird, entscheidet die App.
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!install.includes('skipWaiting'), 'install ruft skipWaiting auf');
  assert.ok(sw.includes("event.data === 'skip-waiting'"), 'kein Weg, den Worker übernehmen zu lassen');
});

test('Beim Start wird die Version am Cache vorbei geprüft', () => {
  const main = readFileSync(join(root, 'js/main.js'), 'utf8');
  assert.match(main, /fetch\('\.\/version\.json',\s*\{\s*cache:\s*'no-store'\s*\}\)/);
  assert.match(main, /QUIET_UPDATE_MS/, 'kein stilles Fenster beim Start');
  assert.match(main, /sessionStorage\.setItem\(RELOAD_GUARD/, 'keine Bremse gegen wiederholtes Neuladen');
});

test('Der Cache-Name enthält die Version', () => {
  assert.match(sw, /const CACHE = `primr-\$\{VERSION\}`/);
});

test('Jede ausgelieferte Datei steht in der Cache-Liste', () => {
  const files = [...walk('js'), ...walk('css')].filter((f) => f.endsWith('.js') || f.endsWith('.css'));
  const missing = files.filter((f) => !sw.includes(`./${f}`));
  assert.deepEqual(missing, [], `nicht im Service Worker gelistet: ${missing.join(', ')}`);
});

test('Die Cache-Liste enthält keine Datei, die es nicht gibt', () => {
  const listed = [...sw.matchAll(/'\.\/([^']+\.(?:js|css))'/g)].map((m) => m[1]);
  const ghosts = listed.filter((f) => {
    try { return !statSync(join(root, f)).isFile(); } catch { return true; }
  });
  assert.deepEqual(ghosts, [], `gelistet, aber nicht vorhanden: ${ghosts.join(', ')}`);
});

test('Der Service Worker fragt zuerst das Netz, nicht den Cache', () => {
  const handler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  const network = handler.indexOf('fromNetwork');
  const cache = handler.indexOf('caches.match');
  assert.ok(network > -1, 'kein Netzabruf im fetch-Handler');
  assert.ok(cache > -1, 'kein Cache-Rückfall im fetch-Handler');
  assert.ok(network < cache, 'der Cache wird vor dem Netz gefragt – dann bleibt die App auf ihrem Stand stehen');
});

test('Der Netzabruf umgeht den HTTP-Cache des Browsers', () => {
  // Ohne cache: 'reload' liefert die Ebene unter dem Service Worker wieder
  // die alte Datei aus – der Netz-zuerst-Ansatz liefe dann ins Leere.
  assert.match(sw, /cache:\s*'reload'/);
});

test('Ein wartender Worker kann übernehmen', () => {
  assert.match(sw, /skip-waiting/);
  assert.match(sw, /skipWaiting\(\)/);
});

test('Alte Caches werden beim Aktivieren entfernt', () => {
  assert.match(sw, /caches\.delete/);
});

test('Die Registrierung umgeht den Browser-Cache für sw.js', () => {
  const main = readFileSync(join(root, 'js/main.js'), 'utf8');
  assert.match(main, /updateViaCache:\s*'none'/);
  assert.match(main, /controllerchange/);
});

test('Die erste Übernahme löst kein Neuladen aus', () => {
  // clients.claim() beim ersten Start ist kein Update. Ohne diese Bremse
  // wird jeder neue Nutzer einmal grundlos neu geladen.
  const main = readFileSync(join(root, 'js/main.js'), 'utf8');
  assert.match(main, /hadController/);
  assert.match(main, /if \(!hadController\) return;/);
  assert.match(main, /function reloadOnce/, 'kein Schutz gegen mehrfaches Neuladen');
});

test('Messwerte werden nicht an zwei Stellen aufgezählt', () => {
  // Eine fest verdrahtete Liste im Speicher-Code hat dazu geführt, dass neue
  // Marker im Formular standen, aber beim Speichern verworfen wurden.
  const main = readFileSync(join(root, 'js/main.js'), 'utf8');
  const saveMarker = main.slice(main.indexOf('function saveMarker'), main.indexOf('function saveSettings'));
  assert.ok(saveMarker.includes('MARKERS.forEach'), 'saveMarker geht nicht über die Marker-Definition');
  assert.ok(!/\['vo2max'/.test(saveMarker), 'saveMarker enthält wieder eine eigene Feldliste');
});

if (failures.length) {
  console.error(`\n${failures.length} von ${passed + failures.length} Auslieferungs-Tests fehlgeschlagen:\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`✓ ${passed} Auslieferungs-Tests bestanden`);
