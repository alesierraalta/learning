// El walkthrough se dibuja igual que antes y aguanta lo que el autor escriba.
//
// El escenario se construye con DOMParser y se importa como nodo, en vez de
// asignar innerHTML. Ese cambio toca el parser, así que el caso que importa es
// el texto raro: un `&` o un `<` sin escapar rompería un parser XML estricto y
// dejaría la escena en blanco sin decir nada.
//
// Uso: node --test integrations/pi/kit/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const KIT = resolve(import.meta.dirname, '..');

function loadPlaywright() {
  try {
    return createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright');
  } catch {
    return null;
  }
}

const playwright = loadPlaywright();

test('un paso con & y con < se dibuja como texto', { skip: playwright ? false : 'playwright is not installed' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-wt-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  const spec = {
    steps: [{ text: 'uno', scene: { boxes: [{ x: 60, y: 120, w: 220, h: 110, label: 'R&D' }, { x: 420, y: 120, w: 220, h: 110, label: 'a < b' }] } }],
  };
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body><lk-walkthrough><script type="application/json">${JSON.stringify(spec)}</script></lk-walkthrough></body></html>`);

  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message)));
    await page.goto(pathToFileURL(join(dir, 'p.html')).href);
    await page.waitForSelector('lk-walkthrough svg', { timeout: 15000 });
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => ({
      texts: [...document.querySelectorAll('lk-walkthrough svg text')].map((t) => t.textContent),
      parserError: !!document.querySelector('lk-walkthrough parsererror'),
    }));
    assert.equal(seen.parserError, false, 'un parser estricto no puede dejar la escena en blanco');
    assert.ok(seen.texts.includes('R&D'), `el ampersand se perdió: ${seen.texts.join(' | ')}`);
    assert.ok(seen.texts.includes('a < b'), `el menor-que se perdió: ${seen.texts.join(' | ')}`);
    assert.deepEqual(errors, [], 'sin errores de página');
    await page.close();
  } finally {
    await browser.close();
  }
});
