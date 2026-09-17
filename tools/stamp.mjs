// Versionsstempel setzen.
//
// Die Version wird nicht von Hand gepflegt, sondern aus dem Inhalt der
// ausgelieferten Dateien abgeleitet. Wer eine Datei ändert und das Stempeln
// vergisst, bekommt es vom Test gesagt – genau das ist schon passiert, und
// die App aktualisierte sich daraufhin nicht.
//
//   node tools/stamp.mjs        setzt den Stempel
//   node tools/stamp.mjs --check  meldet nur, ob er noch passt

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Diese drei tragen den Stempel selbst und dürfen deshalb nicht in seine
// Berechnung eingehen – sonst ließe er sich nie erreichen.
const CARRIERS = ['version.json', 'js/version.js', 'sw.js'];

function walk(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((entry) => {
    const rel = `${dir}/${entry}`;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

export function servedFiles() {
  return [
    'index.html',
    'manifest.webmanifest',
    ...walk('css'),
    ...walk('js'),
  ]
    .map((f) => f.replace(/^\.\//, ''))
    .filter((f) => !CARRIERS.includes(f))
    .filter((f) => /\.(html|css|js|webmanifest)$/.test(f))
    .sort();
}

/** Inhalt von sw.js ohne die Versionszeile – sonst beißt sich der Stempel. */
function swWithoutVersion() {
  return readFileSync(join(ROOT, 'sw.js'), 'utf8').replace(/const VERSION = '[^']*';/, '');
}

export function computeStamp() {
  const hash = createHash('sha256');
  servedFiles().forEach((f) => {
    hash.update(f);
    hash.update(readFileSync(join(ROOT, f)));
  });
  hash.update(swWithoutVersion());
  const digest = hash.digest('hex').slice(0, 8);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  return { digest, date };
}

export function currentVersion() {
  return JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).version;
}

export function stampMatches() {
  const version = currentVersion();
  const { digest } = computeStamp();
  return version.endsWith(`-${digest}`);
}

function write(version) {
  writeFileSync(join(ROOT, 'version.json'), `${JSON.stringify({ version }, null, 2)}\n`);

  const versionJs = readFileSync(join(ROOT, 'js/version.js'), 'utf8')
    .replace(/export const VERSION = '[^']*';/, `export const VERSION = '${version}';`);
  writeFileSync(join(ROOT, 'js/version.js'), versionJs);

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8')
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
  writeFileSync(join(ROOT, 'sw.js'), sw);
}

// Nur ausführen, wenn die Datei direkt aufgerufen wurde. Beim Importieren
// aus den Tests darf hier nichts geschrieben werden.
const calledDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!calledDirectly) {
  // als Modul geladen – nichts tun
} else if (process.argv.includes('--check')) {
  if (stampMatches()) {
    console.log(`✓ Versionsstempel passt: ${currentVersion()}`);
  } else {
    const { digest } = computeStamp();
    console.error(`✗ Versionsstempel veraltet.\n  eingetragen: ${currentVersion()}\n  erwartet:    …-${digest}\n  Beheben mit: npm run stamp`);
    process.exit(1);
  }
} else {
  const { digest, date } = computeStamp();
  const version = `${date}-${digest}`;
  write(version);
  console.log(`Versionsstempel gesetzt: ${version} (${servedFiles().length} Dateien)`);
}
