// Primitivas de dibujo: lo que el autor declara tiene que aparecer en el SVG.
//
// Cada caso nació de una figura real que falló: un icono que no se dibujaba porque
// la función no estaba exportada, un callout que señalaba al aire porque la
// coordenada se puso a ojo, y una fórmula que se salía del lienzo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  const attempts = [() => import('playwright')];
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

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se puede medir el dibujo';

async function render(scene) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-primitives-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  cpSync(KIT, join(dir, 'kit'), { recursive: true });
  writeFileSync(join(dir, 'page.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css">
<script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
</head><body><main style="max-width:720px;margin:0 auto">
<lk-scene><script type="application/json">${JSON.stringify(scene)}</script></lk-scene>
</main></body></html>`);
  const browser = await PLAYWRIGHT.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.goto(pathToFileURL(join(dir, 'page.html')).href);
  await page.waitForSelector('lk-scene svg', { timeout: 15000 });
  const data = await page.evaluate(() => {
    const svg = document.querySelector('lk-scene svg');
    return {
      circles: svg.querySelectorAll('circle').length,
      rects: svg.querySelectorAll('rect').length,
      paths: svg.querySelectorAll('path').length,
      // El trazo de cada camino, para comprobar que la curva declarada llega al SVG
      // y no solo los marcadores de `defs`.
      ds: [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean),
      markers: [...svg.querySelectorAll('path[marker-end]')].length,
      texts: [...svg.querySelectorAll('text')].map((t) => t.textContent.trim()),
      atoms: [...svg.querySelectorAll('[data-atom]')].map((t) => ({ i: t.dataset.atom, s: t.textContent, size: t.getAttribute('font-size') })),
    };
  });
  await browser.close();
  return data;
}

test('cada icono dibuja el objeto, no un rótulo', { skip: SKIP }, async () => {
  const shapes = {};
  for (const kind of ['robot', 'house', 'doc', 'person', 'coin', 'gear']) {
    const d = await render({ viewBox: '0 0 760 240', scene: { icons: [{ kind, x: 200, y: 120, size: 90 }] } });
    shapes[kind] = d.circles + d.rects + d.paths;
    assert.equal(d.texts.length, 0, `${kind}: un icono no escribe texto`);
  }
  for (const [kind, n] of Object.entries(shapes)) assert.ok(n >= 2, `${kind}: dibuja al menos dos formas (fueron ${n})`);
  assert.notEqual(new Set(Object.values(shapes)).size, 1, 'no todos los iconos son la misma forma');
});

test('un callout numera y traza la guía al objeto que señala', { skip: SKIP }, async () => {
  const d = await render({ viewBox: '0 0 760 240', scene: {
    icons: [{ kind: 'house', x: 400, y: 130, size: 90 }],
    callouts: [{ n: 1, x: 380, y: 40, to: [400, 96] }],
  } });
  assert.ok(d.texts.includes('1'), 'el número del callout se dibuja');
  assert.ok(d.paths >= 1, 'la guía se dibuja como trazo');
});

test('una fórmula deja un átomo por símbolo, en orden', { skip: SKIP }, async () => {
  const d = await render({ viewBox: '0 0 760 240', scene: {
    formula: { x: 380, y: 120, size: 64, atoms: [{ t: 'V' }, { t: '(' }, { t: 's' }, { t: ')' }] },
  } });
  assert.equal(d.atoms.length, 4, 'cuatro símbolos, cuatro átomos');
  assert.deepEqual(d.atoms.map((a) => a.s), ['V', '(', 's', ')']);
  assert.deepEqual(d.atoms.map((a) => a.i), ['0', '1', '2', '3']);
});

test('un subíndice se dibuja más chico que el símbolo', { skip: SKIP }, async () => {
  const d = await render({ viewBox: '0 0 760 240', scene: {
    formula: { x: 380, y: 120, size: 64, atoms: [{ t: 's' }, { t: 't', sub: true }] },
  } });
  const [base, sub] = d.atoms;
  assert.ok(Number(sub.size) < Number(base.size), 'el subíndice no compite con el símbolo');
});

// Una distribución o una función es su curva, no una caja que la nombra: la escena
// declara `paths`/`curves` y el trazo tiene que llegar al SVG con su `d`.
test('una escena dibuja su curva: el trazo declarado llega al SVG', { skip: SKIP }, async () => {
  const bell = 'M 48 214 C 51.7 213.9 62.7 214.2 70 213.6 C 77.3 213 84.7 213.5 92 210.6';
  const d = await render({ viewBox: '0 0 760 240', scene: {
    paths: [{ d: bell, tone: 'blue', width: 4, arrow: false }],
    curves: [{ x1: 60, y1: 220, x2: 700, y2: 220, tone: 'slate', width: 3, arrow: false, bend: 0.4 }],
  } });
  assert.ok(d.ds.includes(bell), 'el `d` declarado en `paths` se dibuja tal cual');
  assert.ok(d.ds.some((x) => x.startsWith('M 60 220 C')), 'la curva sale de sus dos extremos');
  assert.equal(d.texts.length, 0, 'una curva no escribe texto: dibuja');
});

// Una curva sin `arrow: false` lleva punta, como en el video; con `arrow: false` no.
test('la punta de una curva se declara, no se adivina', { skip: SKIP }, async () => {
  const withHead = await render({ viewBox: '0 0 760 240', scene: { paths: [{ d: 'M 60 200 L 700 200', tone: 'blue' }] } });
  const without = await render({ viewBox: '0 0 760 240', scene: { paths: [{ d: 'M 60 200 L 700 200', tone: 'blue', arrow: false }] } });
  assert.equal(withHead.markers, 1, 'por defecto la curva lleva punta');
  assert.equal(without.markers, 0, 'con arrow: false no lleva punta');
});

test('las barras dibujan pista, relleno y el valor que se declara', { skip: SKIP }, async () => {
  const d = await render({ viewBox: '0 0 760 260', scene: {
    bars: [{ x: 60, y: 60, rows: [
      { label: 'K2', value: 47.4, max: 50, display: '47,4 %', tone: 'slate' },
      { label: 'K5', value: 11.6, max: 50, display: '11,6 %', tone: 'green' },
    ] }],
  } });
  assert.equal(d.rects, 4, 'dos filas: pista y relleno por fila');
  assert.ok(d.texts.includes('K2') && d.texts.includes('K5'), 'las etiquetas se dibujan');
  assert.ok(d.texts.includes('47,4 %'), 'se respeta el valor declarado, con su coma');
});

test('una cifra grande lleva su nombre debajo', { skip: SKIP }, async () => {
  const d = await render({ viewBox: '0 0 760 240', scene: {
    stats: [{ x: 380, y: 120, value: '6,22', label: 'V(s) después de un paso' }],
  } });
  assert.ok(d.texts.includes('6,22'));
  assert.ok(d.texts.some((t) => t.includes('después de un paso')));
});
