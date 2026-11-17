// La pieza `sequence` (#353): quién habla con quién, en qué orden y con qué categoría.
// Es estado del escenario: la misma clave sigue al paso siguiente, el cambio destella, el
// anillo la nombra, sus flechas fluyen y se dibujan, y sus datos van con `facts` y `summary`.
//
// Cada prueba monta su propia página con el kit copiado: no supone un servidor, un contenedor
// ni un módulo instalado en un sitio concreto. Si no hay navegador, lo dice y se salta.
//
// Uso: PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs node --test integrations/pi/kit/test/sequence.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
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
const skip = playwright ? false : 'Playwright no está disponible: define PLAYWRIGHT_MODULE con su index.mjs';
const browser = playwright ? await playwright.chromium.launch() : null;
after(() => browser?.close());

const ACTORS = [
  { id: 'cli', label: 'Cliente', sub: 'navegador' },
  { id: 'api', label: 'API', sub: 'servicio' },
  { id: 'db', label: 'Base', sub: 'datos' },
];
const MESSAGES = [
  { from: 'cli', to: 'api', label: 'GET /pedido', kind: 'blue', at: 0 },
  { from: 'api', to: 'db', label: 'SELECT', kind: 'amber', at: 1 },
  { from: 'db', to: 'api', label: 'fila', kind: 'green', at: 2 },
  { from: 'api', to: 'cli', label: '200 OK', kind: 'green', at: 3 },
];
const sequence = (over = {}) => ({
  id: 'pedido', actors: ACTORS, messages: MESSAGES,
  phases: [{ label: 'Petición', at: 0, tone: 'blue' }, { label: 'Respuesta', at: 2, tone: 'green' }],
  notes: [{ at: 1, text: 'La API valida la sesión.' }],
  ...over,
});

const walkSpec = (over = {}) => ({
  title: 'Una petición',
  viewBox: '0 0 760 400',
  steps: [
    { title: 'Petición', text: 'El cliente pide.', scene: { sequence: sequence() }, facts: [['categoría', 'petición']] },
    { title: 'Respuesta', text: 'La API responde.', ring: 'pedido', scene: { sequence: sequence({
      messages: [...MESSAGES, { from: 'api', to: 'cli', label: '403 sin sesión', kind: 'red', at: 4, flow: true }],
    }) }, facts: [['categoría', 'respuesta']] },
  ],
  ...over,
});
const storySpec = (over = {}) => ({
  kind: 'derivation', title: 'Una petición', viewBox: '0 0 760 400',
  steps: [
    { title: 'Petición', narrator: 'El cliente pide.', stage: { scene: { sequence: sequence() } } },
    { title: 'Respuesta', narrator: 'La API responde.', stage: { scene: { sequence: sequence() } } },
    { title: 'Fin', narrator: 'Todo volvió.', stage: { scene: { sequence: sequence() } } },
  ],
  ...over,
});

async function open(spec, { tag = 'lk-walkthrough', viewport = { width: 1200, height: 900 } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-sequence-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  // El manifiesto del kit carga estas cuatro piezas en cada página: sin `dictate.js` el
  // elemento no se define y la prueba esperaría un SVG que nunca llega.
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js', 'question.js', 'code-field.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body><main style="max-width:1100px;margin:0 auto"><${tag}><script type="application/json">${JSON.stringify(spec)}</script></${tag}></main></body></html>`);
  const page = await browser.newPage({ viewport, reducedMotion: 'no-preference' });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(pathToFileURL(join(dir, 'p.html')).href, { timeout: 20000 });
  await page.waitForSelector(`${tag} [data-sequence]`, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.lk-wt-stage')?.dataset.settled === 'true', null, { timeout: 3000 });
  return page;
}
const dot = (page, n) => page.locator('.lk-wt-dot').nth(n - 1).click();
const settled = (page) => page.waitForFunction(() => document.querySelector('.lk-wt-stage')?.dataset.settled === 'true', null, { timeout: 3000 });

test('una secuencia dibuja sus actores, sus mensajes en orden de tiempo y una leyenda por categoría', { skip }, async () => {
  const page = await open(walkSpec({ summary: { title: 'Fin', metrics: [['mensajes', '4']] } }));
  try {
    const seen = await page.evaluate(() => {
      const g = document.querySelector('[data-step="1"] [data-sequence]');
      const arrows = [...g.querySelectorAll('[data-arrow][data-sequence-at]')];
      const colorOf = (a) => {
        const id = a.querySelector('path[marker-end]').getAttribute('marker-end').match(/#([^)]+)/)[1];
        return document.querySelector(`marker[id="${id}"] path`).getAttribute('fill');
      };
      return {
        lifelines: [...g.querySelectorAll('[data-sequence-lifeline]')].map((n) => n.dataset.sequenceLifeline),
        actors: [...g.querySelectorAll('[data-sequence-actor]')].map((n) => n.textContent.trim()),
        phases: [...g.querySelectorAll('[data-sequence-phase-label]')].map((n) => n.textContent.trim()),
        at: arrows.map((a) => a.dataset.sequenceAt),
        ys: arrows.map((a) => Number(a.getAttribute('data-arrow').split(',')[1])),
        colors: arrows.map(colorOf),
        labels: arrows.map((a) => a.querySelector('text').textContent.trim()),
        legend: [...g.querySelectorAll('[data-sequence-legend] text')].map((n) => n.textContent.trim()),
        notes: [...g.querySelectorAll('[data-sequence-note]')].map((n) => n.textContent.trim()),
      };
    });
    assert.deepEqual(seen.lifelines, ['cli', 'api', 'db']);
    assert.ok(seen.actors.some((a) => a.includes('Cliente')) && seen.actors.some((a) => a.includes('Base')));
    assert.deepEqual(seen.phases, ['Petición', 'Respuesta']);
    assert.deepEqual(seen.at, ['0', '1', '2', '3'], 'el orden de tiempo no se conservó');
    assert.deepEqual(seen.ys, [...seen.ys].sort((a, b) => a - b), 'las flechas no bajan con el tiempo');
    assert.deepEqual(seen.colors, ['#004276', '#8A6B3F', '#21594F', '#21594F'], 'cada categoría no conserva su tono');
    assert.deepEqual(seen.labels, ['GET /pedido', 'SELECT', 'fila', '200 OK']);
    assert.ok(seen.legend.some((s) => /petición/i.test(s)), 'falta la leyenda de la categoría azul');
    assert.ok(seen.notes.some((s) => /valida la sesión/.test(s)), 'la nota no se dibujó');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('la secuencia es estado: misma clave, destello al cambiar y anillo con su id', { skip }, async () => {
  const page = await open(walkSpec());
  try {
    const before = await page.evaluate(() => document.querySelector('[data-step="1"] [data-sequence]').closest('[data-piece-key]').dataset.pieceKey);
    const during = await page.evaluate(() => {
      document.querySelectorAll('.lk-wt-dot')[1].click();
      const g = document.querySelector('[data-step="2"] [data-piece-key]');
      return { key: g?.dataset.pieceKey, flash: Boolean(g?.querySelector('[data-flash]')), ring: Boolean(document.querySelector('[data-step="2"] [data-focus-ring]')) };
    });
    assert.equal(during.key, before, 'la secuencia cambió de clave entre pasos');
    assert.equal(during.flash, true, 'un mensaje que cambia no destella');
    assert.equal(during.ring, true, 'el ring no nombra la secuencia');
    await settled(page);
    const after = await page.evaluate(() => ({
      flash: Boolean(document.querySelector('[data-step="2"] [data-flash]')),
      count: document.querySelectorAll('.lk-wt-facts:not(:empty) table.lk-facts').length,
    }));
    assert.equal(after.flash, false, 'el destello no se apaga al asentarse');
    assert.equal(after.count, 1, 'los facts del paso no están con su texto');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('una flecha nueva de la secuencia se dibuja y fluye sin tratarla aparte', { skip }, async () => {
  const page = await open(walkSpec());
  try {
    const start = await page.evaluate(() => {
      document.querySelectorAll('.lk-wt-dot')[1].click();
      // La punta se quita mientras se dibuja: la flecha nueva se busca por su trazo.
      const path = document.querySelector('[data-step="2"] [data-sequence-kind="red"] path');
      const draw = path.getAnimations().find((a) => !('animationName' in a) && a.effect.getKeyframes().some((k) => 'strokeDashoffset' in k));
      return { pathLength: path.getAttribute('pathLength'), head: path.getAttribute('marker-end'), duration: draw?.effect.getTiming().duration ?? null };
    });
    assert.equal(start.pathLength, '1', 'la flecha nueva no se mide para dibujarse');
    assert.equal(start.head, null, 'la punta aparece antes del trazo');
    assert.equal(start.duration, 400, 'el dibujo de la flecha nueva no dura 400 ms');
    await settled(page);
    const end = await page.evaluate(() => {
      const path = document.querySelector('[data-step="2"] [data-sequence-kind="red"] path');
      return { drawn: path.classList.contains('lk-draw'), flowing: path.classList.contains('lk-flow'), head: path.getAttribute('marker-end') };
    });
    assert.equal(end.drawn, false, 'el dibujo no se deshace al asentarse');
    assert.equal(end.flowing, true, 'flow: true no hace fluir el mensaje');
    assert.ok(end.head, 'la punta no vuelve al asentarse');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('la tarjeta de cierre sigue siendo el último hueco del recorrido con una secuencia', { skip }, async () => {
  const page = await open(walkSpec({ summary: { title: 'Seis mensajes', metrics: [['mensajes', '4']] } }));
  try {
    await dot(page, 2);
    await settled(page);
    await dot(page, 3);
    await page.waitForFunction(() => document.querySelector('.lk-wt-count')?.textContent === 'Resumen', null, { timeout: 3000 });
    const seen = await page.evaluate(() => ({
      title: document.querySelector('lk-walkthrough > .lk-summary:not([hidden]) .lk-summary-title')?.textContent,
      captionHidden: document.querySelector('.lk-wt-caption')?.hidden,
      figure: Boolean(document.querySelector('[data-step="2"] [data-sequence]')),
    }));
    assert.equal(seen.title, 'Seis mensajes');
    assert.equal(seen.captionHidden, true);
    assert.equal(seen.figure, true, 'la figura del resumen desapareció');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('a 390 px la secuencia se desliza dentro de su marco sin encoger la letra', { skip }, async () => {
  for (const tag of ['lk-walkthrough', 'lk-story']) {
    const page = await open(tag === 'lk-story' ? storySpec() : walkSpec(), { tag, viewport: { width: 390, height: 844 } });
    try {
      const seen = await page.evaluate(() => {
        const stage = document.querySelector('.lk-wt-stage');
        const text = document.querySelector('[data-sequence] [data-arrow] text');
        const size = text.getAttribute('font-size');
        stage.scrollLeft = 80;
        return {
          framed: stage.classList.contains('lk-has-sequence'),
          scrollable: stage.scrollWidth - stage.clientWidth,
          moved: stage.scrollLeft,
          size, after: text.getAttribute('font-size'),
          pageSpill: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert.equal(seen.framed, true, `${tag}: el escenario no sabe que lleva una secuencia`);
      assert.ok(seen.scrollable > 20, `${tag}: la secuencia no cabe en su marco y no se puede deslizar (${seen.scrollable} px)`);
      assert.ok(seen.moved > 0, `${tag}: el marco no se deslizó`);
      assert.equal(seen.after, seen.size, `${tag}: deslizar cambió el tamaño de la letra`);
      assert.ok(seen.pageSpill <= 1, `${tag}: la página entera se desliza horizontalmente`);
      assert.deepEqual(page.errors, []);
    } finally {
      await page.close();
    }
  }
});
