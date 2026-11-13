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
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const KIT = resolve(import.meta.dirname, '..');

async function loadPlaywright() {
  // El mismo orden que el resto del kit: el módulo que indique el entorno, el del
  // proyecto y el global. En la máquina de pruebas el navegador llega por
  // `PLAYWRIGHT_MODULE`; sin mirarlo, estas pruebas se saltaban y el recorrido
  // clásico quedaba sin medir.
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    attempts.push(async () => createRequire(root + '/')('playwright'));
  } catch {}
  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      if (mod?.chromium || mod?.default?.chromium) return mod.chromium ? mod : mod.default;
    } catch {}
  }
  return null;
}

const playwright = await loadPlaywright();

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

// La letra de una etiqueta de flecha no puede ser más grande que la letra de la
// figura: ni más que los rótulos sueltos (la leyenda de la escena) ni más que las
// cajas. La parte real que el alumno rechazó dibujaba «ORA-02291» a 22 sobre cajas
// de 13 y rótulos de 12: la etiqueta se leía como un título y tapaba la flecha
// que etiquetaba (#237).
test('una etiqueta de flecha nunca es más grande que la letra de la figura', { skip: playwright ? false : 'playwright is not installed' }, async () => {
  const note = readFileSync(join(import.meta.dirname, '../../../../internal/engine/testdata/sql-parte-1.md'), 'utf8');
  const deck = note.match(/<lk-walkthrough[\s\S]*?<\/lk-walkthrough>/)[0];
  const dir = mkdtempSync(join(tmpdir(), 'kit-wt-edge-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body><main style="max-width:760px">${deck}</main></body></html>`);

  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(pathToFileURL(join(dir, 'p.html')).href);
    await page.waitForSelector('lk-walkthrough svg', { timeout: 15000 });
    await page.waitForTimeout(400);
    const measured = await page.evaluate(() => {
      const svg = document.querySelector('lk-walkthrough svg');
      const size = (t) => Number(t.getAttribute('font-size'));
      return {
        boxes: [...svg.querySelectorAll('[data-box] text')].map(size),
        captions: [...svg.querySelectorAll('[data-label] text')].map(size),
        edges: [...svg.querySelectorAll('[data-arrow] text')].map((t) => ({ text: t.textContent, size: size(t) })),
      };
    });
    assert.ok(measured.edges.length > 0, 'la parte perdió sus etiquetas de flecha');
    const cap = Math.min(...measured.boxes, ...measured.captions);
    for (const edge of measured.edges) {
      assert.ok(edge.size <= cap, `la etiqueta «${edge.text}» se dibuja a ${edge.size} y la letra de la figura a ${cap}`);
    }
  } finally {
    await browser.close();
  }
});
