// Prüft den Aktualisierungspfad im echten Browser. Drei Fälle, die keine
// statische Prüfung sieht und die alle schon einmal falsch waren:
//
//   1. Eine geänderte Datei muss nach dem Neuladen ankommen.
//      (Scheiterte am HTTP-Cache unterhalb des Service Workers.)
//   2. App schließen und öffnen muss die neue Fassung zeigen – ohne dass
//      jemand einen Knopf drückt.
//   3. Widerspricht version.json den ausgelieferten Dateien, darf sich die
//      App nicht im Kreis neu laden.
//
// Voraussetzungen (deshalb nicht Teil von `npm test`):
//   npm start                      in einem zweiten Terminal
//   npm install playwright         einmalig
//   node test/update-path.mjs
//
// Ein vorhandener Browser lässt sich über PRIMR_CHROMIUM=<pfad> vorgeben.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const URL_APP = 'http://localhost:8080/index.html';
const TOUCHED = ['version.json', 'js/version.js', 'sw.js', 'js/views/today.js'];
const backup = Object.fromEntries(TOUCHED.map((f) => [f, readFileSync(ROOT + f, 'utf8')]));
const errors = [];
const restore = () => Object.entries(backup).forEach(([f, c]) => writeFileSync(ROOT + f, c));

/** Eine neue Fassung ausliefern: Version überall hoch, sichtbarer Text anders. */
function deploy(version) {
  writeFileSync(`${ROOT}version.json`, `${JSON.stringify({ version }, null, 2)}\n`);
  writeFileSync(`${ROOT}js/version.js`, backup['js/version.js'].replace(/'[\d.]+'/, `'${version}'`));
  writeFileSync(`${ROOT}sw.js`, backup['sw.js'].replace(/const VERSION = '[\d.]+'/, `const VERSION = '${version}'`));
  writeFileSync(`${ROOT}js/views/today.js`, backup['js/views/today.js'].replace(
    '<div class="section-label">${esc(longDate(ctx.date))}</div>',
    '<div class="section-label">NEU ${esc(longDate(ctx.date))}</div>',
  ));
}

async function onboard(page) {
  await page.click('.sheet [data-action="open-shift-editor"]');
  await page.waitForTimeout(250);
  await page.click('.sheet [data-action="set-today-position"][data-index="3"]');
  await page.waitForTimeout(400);
  await closeSheets(page);
}

async function closeSheets(page) {
  for (let i = 0; i < 4; i += 1) {
    const btn = await page.$('.sheet [data-action="close-sheet"]');
    if (!btn) return;
    await btn.click();
    await page.waitForTimeout(200);
  }
}

// PRIMR_CHROMIUM erlaubt einen bereits vorhandenen Browser statt eines
// eigenen Downloads – praktisch in Umgebungen ohne `playwright install`.
const browser = await chromium.launch(
  process.env.PRIMR_CHROMIUM ? { executablePath: process.env.PRIMR_CHROMIUM } : {},
);

try {
  /* 1 — Änderung kommt nach dem Neuladen an */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(URL_APP, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    await onboard(page);

    deploy('2099.01.01');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await closeSheets(page);

    const text = await page.textContent('.section-label');
    if (!text.startsWith('NEU')) errors.push('1: Die Änderung kam nicht an');
    else console.log('1. Änderung kommt nach dem Neuladen an');
    await ctx.close();
    restore();
  }

  /* 2 — Schließen und Öffnen zeigt die neue Fassung ohne Knopf */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(URL_APP, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    await onboard(page);
    await page.close();

    deploy('2099.02.02');

    const reopened = await ctx.newPage();
    await reopened.goto(URL_APP, { waitUntil: 'networkidle' });
    await reopened.waitForTimeout(3500);
    await closeSheets(reopened);

    const bar = await reopened.$('#update-bar');
    const text = await reopened.textContent('.section-label');
    if (bar) errors.push('2: Es wird ein Knopf verlangt, statt still zu aktualisieren');
    if (!text.startsWith('NEU')) errors.push('2: Nach dem Öffnen läuft noch die alte Fassung');
    if (!bar && text.startsWith('NEU')) console.log('2. Schließen und Öffnen zeigt die neue Fassung ohne Zutun');
    await ctx.close();
    restore();
  }

  /* 3 — Widersprüchliche Versionsangabe führt zu keiner Schleife */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let navigations = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
    await page.goto(URL_APP, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
    navigations = 0;

    // Nur die Versionsangabe hochziehen, die Dateien bleiben alt.
    writeFileSync(`${ROOT}version.json`, `${JSON.stringify({ version: '2099.12.31' }, null, 2)}\n`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(6000);

    if (navigations > 3) errors.push(`3: Die App lädt sich im Kreis (${navigations} Navigationen)`);
    if (!(await page.$('.app, .sheet'))) errors.push('3: Die App ist nicht mehr bedienbar');
    if (navigations <= 3) console.log(`3. Bremse hält: ${navigations} Navigationen, App bleibt bedienbar`);
    await ctx.close();
    restore();
  }
} finally {
  restore();
  await browser.close();
}

if (errors.length) {
  console.error(`\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nAktualisierungspfad funktioniert.');
