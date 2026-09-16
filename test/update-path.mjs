// Prüft den Aktualisierungspfad im echten Browser: Datei auf dem Server
// ändern, neu laden, und die Änderung muss ankommen.
//
// Zwei Fehler hat dieser Test gefunden, die keine statische Prüfung sieht:
// der HTTP-Cache unter dem Service Worker, und ein überflüssiger Reload beim
// ersten clients.claim(), der sich mit dem Laden der Module überschneidet.
//
// Voraussetzungen (deshalb nicht Teil von `npm test`):
//   npm start                      in einem zweiten Terminal
//   npm install playwright         einmalig
//   node test/update-path.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../js/views/today.js', import.meta.url);
const original = readFileSync(FILE, 'utf8');
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });

  // Warten, bis der Service Worker die Seite kontrolliert.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  console.log('1. Service Worker aktiv und kontrolliert die Seite');

  // Onboarding durchlaufen, damit der Heute-Tab sichtbar ist.
  await page.click('.sheet [data-action="open-shift-editor"]');
  await page.waitForTimeout(200);
  await page.click('.sheet [data-action="set-today-position"][data-index="3"]');
  await page.waitForTimeout(300);
  await page.click('.sheet [data-action="close-sheet"]');
  await page.waitForTimeout(300);

  const before = await page.textContent('.section-label');
  console.log(`2. Vor der Änderung steht dort: "${before}"`);

  // Eine sichtbare Zeichenkette ändern – wie bei einem echten Deploy.
  writeFileSync(FILE, original.replace('<div class="section-label">${esc(longDate(ctx.date))}</div>',
    '<div class="section-label">AKTUALISIERT ${esc(longDate(ctx.date))}</div>'));
  console.log('3. Datei auf dem Server geändert');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const sheet = await page.$('.sheet [data-action="close-sheet"]');
  if (sheet) { await sheet.click(); await page.waitForTimeout(300); }

  const after = await page.textContent('.section-label');
  console.log(`4. Nach dem Neuladen steht dort: "${after}"`);

  if (!after.startsWith('AKTUALISIERT')) {
    errors.push('Die Änderung kam nicht an – die App hängt weiter im Cache.');
  } else {
    console.log('5. Die Änderung ist angekommen.');
  }
} finally {
  writeFileSync(FILE, original);
  await browser.close();
}

if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }
console.log('\nUpdate-Pfad funktioniert.');
