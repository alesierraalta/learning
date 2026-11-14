// Los datos de un paso y la tarjeta de cierre (#301): una tabla clave-valor junto al texto del paso,
// que se apila bajo él por debajo de 640 px, y un resumen de cierre que llega después del último paso.
//
// Las pruebas cargan las hojas del lector (app.css y book.css) porque el texto del recorrido se
// dibuja con ellas: lo que se mide es lo que el alumno ve.
//
// Uso: node --test integrations/pi/kit/test/facts.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = join(KIT, '..', 'view');

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
const skip = playwright ? false : 'playwright is not installed';
const browser = playwright ? await playwright.chromium.launch() : null;
after(() => browser?.close());

// Tres pasos con datos y una tarjeta de cierre. La figura es la misma en todos: estas pruebas miran
// la tabla, la tarjeta y el recorrido, no la geometría de la escena (eso lo miden las de #298-#300).
const BOXES = [
  { x: 60, y: 120, w: 200, h: 110, label: 'Cuenta 10' },
  { x: 560, y: 120, w: 200, h: 110, label: 'Cuenta 20' },
];
const STEPS = [
  { title: 'Antes', text: 'La cuenta 10 tiene 1000.', facts: [['saldo', '1000'], ['moneda', 'EUR']] },
  { title: 'El débito', text: 'Se restan 200 de la cuenta 10.', facts: [['saldo', '800'], ['cambio', '-200']] },
  { title: 'El commit', text: 'El saldo 800 se graba en disco.' },
];
const SUMMARY = { title: 'Resultado', text: 'La cuenta 10 queda en 800.', metrics: [['saldo final', '800'], ['filas tocadas', '1']] };
const walk = (extra = {}) => ({
  title: 'Débito',
  viewBox: '0 0 900 320',
  steps: STEPS.map((s) => ({ ...s, scene: { boxes: BOXES } })),
  ...extra,
});

// Una historia de tres pasos con datos en los dos primeros.
const ACTORS = [
  { id: 'cli', x: 60, y: 90, w: 130, h: 60, label: 'Cliente', tone: 'blue' },
  { id: 'srv', x: 300, y: 90, w: 130, h: 60, label: 'Servidor', tone: 'green' },
];
const story = (extra = {}) => ({
  kind: 'derivation',
  title: 'Un saludo',
  viewBox: '0 0 480 220',
  steps: [
    { title: 'Uno', narrator: 'El cliente está listo.', facts: [['puerto', '443'], ['protocolo', 'TLS']], stage: { scene: { actors: ACTORS } } },
    { title: 'Dos', narrator: 'El cliente abre la conexión.', facts: [['paquetes', '3']], stage: { scene: { actors: ACTORS, moves: [{ from: 'cli', to: 'srv', verb: 'abre' }] } } },
    { title: 'Tres', narrator: 'Listo.', stage: { scene: { actors: ACTORS, marks: [{ kind: 'ok', actors: ['srv'] }] } } },
  ],
  ...extra,
});

// Abre la página con las hojas del lector. `wide` pone la clase del modo ancho del lector.
async function open(spec, { tag = 'lk-walkthrough', width = 1000, height = 800, wide = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-facts-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  for (const sheet of ['app.css', 'book.css']) cpSync(join(VIEW, sheet), join(dir, sheet));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><link rel="stylesheet" href="./app.css"><link rel="stylesheet" href="./book.css">
<script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body${wide ? ' class="wide"' : ''}><main id="app"><div class="prose"><${tag}><script type="application/json">${JSON.stringify(spec)}</script></${tag}></div></main></body></html>`);
  const page = await browser.newPage({ viewport: { width, height } });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(pathToFileURL(join(dir, 'p.html')).href);
  await page.waitForSelector(`${tag} .lk-wt-stage svg, ${tag} .lk-story-stage`, { timeout: 15000 });
  await page.waitForTimeout(300);
  return page;
}

test('un paso con facts dibuja una tabla clave-valor junto a su texto, con el valor en mono y en cifras tabulares', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }));
  try {
    const seen = await page.evaluate(() => {
      const table = document.querySelector('.lk-wt-facts table.lk-facts');
      if (!table) return null;
      const value = table.querySelector('td');
      const cs = getComputedStyle(value);
      return {
        rows: [...table.querySelectorAll('tbody tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]),
        mono: /mono|consol|courier/i.test(cs.fontFamily),
        tabular: cs.fontVariantNumeric.includes('tabular-nums'),
      };
    });
    assert.ok(seen, 'el paso 1 no dibuja su tabla de datos');
    assert.deepEqual(seen.rows, [['saldo', '1000'], ['moneda', 'EUR']]);
    assert.equal(seen.mono, true, 'el valor no va en mono');
    assert.equal(seen.tabular, true, 'el valor no usa cifras tabulares');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('la tabla va junto al texto en modo normal y ancho, y se apila bajo él por debajo de 640 px', { skip }, async () => {
  for (const [label, width, wide, beside] of [['1000 px', 1000, false, true], ['1500 px en modo ancho', 1500, true, true], ['390 px', 390, false, false]]) {
    const page = await open(walk({ summary: SUMMARY }), { width, wide });
    try {
      const box = await page.evaluate(() => {
        const words = document.querySelector('.lk-wt-words')?.getBoundingClientRect();
        const table = document.querySelector('.lk-wt-facts table.lk-facts')?.getBoundingClientRect();
        return words && table ? { words: [words.left, words.top, words.right, words.bottom], table: [table.left, table.top, table.right, table.bottom] } : null;
      });
      assert.ok(box, `${label}: no hay texto del paso y tabla que comparar`);
      const [wl, , wr, wb] = box.words;
      const [tl, tt] = box.table;
      if (beside) assert.ok(tl >= wr - 1 && tt < wb, `${label}: la tabla no va junto al texto (${JSON.stringify(box)})`);
      else assert.ok(tt >= wb - 1 && Math.abs(tl - wl) < 2, `${label}: la tabla no se apila bajo el texto (${JSON.stringify(box)})`);
      assert.deepEqual(page.errors, []);
    } finally {
      await page.close();
    }
  }
});

test('un paso sin facts no dibuja tabla, y el texto del paso y la figura son los mismos que sin datos', { skip }, async () => {
  const withFacts = await open(walk({ summary: SUMMARY }));
  const without = await open({ ...walk(), steps: STEPS.map((s) => ({ title: s.title, text: s.text, scene: { boxes: BOXES } })) });
  try {
    await withFacts.getByRole('button', { name: 'Siguiente ▶' }).click();
    await withFacts.getByRole('button', { name: 'Siguiente ▶' }).click();
    await without.getByRole('button', { name: 'Siguiente ▶' }).click();
    await without.getByRole('button', { name: 'Siguiente ▶' }).click();
    const geometry = (page) => page.evaluate(() => [...document.querySelectorAll('.lk-wt-stage svg *')].map((n) => {
      const r = n.getBoundingClientRect();
      return `${n.tagName} ${Math.round(r.x)} ${Math.round(r.y)} ${Math.round(r.width)} ${Math.round(r.height)}`;
    }).join('|'));
    assert.equal(await withFacts.evaluate(() => document.querySelectorAll('.lk-wt-facts table').length), 0, 'el paso 3 sin datos dibuja una tabla');
    assert.equal(await geometry(withFacts), await geometry(without), 'los datos cambian la geometría de la figura');
    assert.equal(await withFacts.locator('.lk-wt-caption strong').textContent(), await without.locator('.lk-wt-caption strong').textContent());
    assert.deepEqual(withFacts.errors, []);
  } finally {
    await withFacts.close();
    await without.close();
  }
});

test('una fila mal formada no se dibuja y las demás sí: una clave vacía, una sola celda o un valor que no es texto', { skip }, async () => {
  const messy = walk({ steps: [{ title: 'Uno', text: 'Filas mezcladas.', facts: [['a', '1'], ['solo-clave'], ['', 'vacio'], ['b', '2'], [3, 4], ['c', ['x']]], scene: { boxes: BOXES } }] });
  const page = await open(messy);
  try {
    const shownRows = await page.evaluate(() => [...document.querySelectorAll('.lk-wt-facts table.lk-facts tbody tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]));
    assert.deepEqual(shownRows, [['a', '1'], ['b', '2'], ['3', '4']], `las filas que se dibujan: ${JSON.stringify(shownRows)}`);
  } finally {
    await page.close();
  }
});

test('una tarjeta de cierre llega después del último paso con título, texto y métricas, y la figura queda en el último paso', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }));
  try {
    await page.getByRole('button', { name: 'Siguiente ▶' }).click();
    await page.getByRole('button', { name: 'Siguiente ▶' }).click();
    await page.getByRole('button', { name: 'Siguiente ▶' }).click();
    const seen = await page.evaluate(() => {
      const card = document.querySelector('.lk-summary');
      const shownCard = Boolean(card) && card.getClientRects().length > 0;
      const caption = document.querySelector('.lk-wt-caption');
      return {
        shownCard,
        captionShown: caption.getClientRects().length > 0,
        title: card?.querySelector('.lk-summary-title')?.textContent,
        text: card?.querySelector('.lk-summary-text')?.textContent,
        metrics: card ? [...card.querySelectorAll('table.lk-facts tbody tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]) : null,
        counter: document.querySelector('.lk-wt-count').textContent,
        lastStepDrawn: getComputedStyle(document.querySelector('.lk-wt-stage [data-step="3"]')).display !== 'none',
      };
    });
    assert.equal(seen.shownCard, true, 'la tarjeta de cierre no aparece después del último paso');
    assert.equal(seen.captionShown, false, 'el texto del paso sigue debajo de la tarjeta');
    assert.equal(seen.title, 'Resultado');
    assert.equal(seen.text, 'La cuenta 10 queda en 800.');
    assert.deepEqual(seen.metrics, [['saldo final', '800'], ['filas tocadas', '1']]);
    assert.equal(seen.counter, 'Resumen', 'el contador no dice Resumen en la tarjeta');
    assert.equal(seen.lastStepDrawn, true, 'la figura no se queda en el último paso');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('«Ir al final» lleva a la tarjeta de cierre, y el contador de los pasos sigue contando solo los suyos', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }));
  try {
    const before = await page.locator('.lk-wt-count').textContent();
    await page.getByRole('button', { name: 'Ir al final' }).click();
    const shownCard = await page.evaluate(() => document.querySelector('.lk-summary')?.getClientRects().length > 0);
    assert.equal(shownCard, true, '«Ir al final» no lleva a la tarjeta de cierre');
    assert.equal(await page.locator('.lk-wt-count').textContent(), 'Resumen');
    assert.equal(before, 'Paso 1 de 3', 'el contador de un paso no cuenta solo los pasos');
    await page.getByRole('button', { name: 'Anterior' }).click();
    assert.equal(await page.locator('.lk-wt-count').textContent(), 'Paso 3 de 3', 'Anterior no vuelve al último paso');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('el punto de la tarjeta de cierre lleva a ella, y los puntos de los pasos siguen siendo tres', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }));
  try {
    const dots = await page.evaluate(() => ({
      steps: document.querySelectorAll('.lk-wt-dot:not([data-summary])').length,
      summary: document.querySelectorAll('.lk-wt-dot[data-summary]').length,
    }));
    assert.deepEqual(dots, { steps: 3, summary: 1 });
    await page.locator('.lk-wt-dot[data-summary]').click();
    const seen = await page.evaluate(() => ({
      card: document.querySelector('.lk-summary').getClientRects().length > 0,
      current: document.querySelector('.lk-wt-dot[data-summary]').getAttribute('aria-current'),
    }));
    assert.deepEqual(seen, { card: true, current: 'true' });
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('las flechas del teclado llegan a la tarjeta de cierre y vuelven al último paso', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }));
  try {
    await page.locator('lk-walkthrough').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.querySelector('.lk-summary').getClientRects().length > 0), true, 'la flecha derecha no llega a la tarjeta');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.lk-wt-count').textContent(), 'Paso 3 de 3', 'la flecha izquierda no vuelve al último paso');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('una tabla con datos sin espacios se queda dentro de la pantalla del teléfono', { skip }, async () => {
  const long = 'SELECT_saldo_de_la_cuenta_del_cliente_principal_2026_con_todas_sus_filas_y_columnas';
  const page = await open(walk({
    summary: { title: 'Cierre', metrics: [['consulta', long]] },
    steps: [{ title: 'Uno', text: 'Un valor largo.', facts: [['consulta', long]], scene: { boxes: BOXES } }, STEPS[1], STEPS[2]],
  }), { width: 390 });
  try {
    const fit = await page.evaluate(() => {
      const table = document.querySelector('.lk-wt-facts table.lk-facts');
      if (!table) return null;
      const r = table.getBoundingClientRect();
      return { shown: r.width > 0, right: r.right, width: window.innerWidth, scroll: table.scrollWidth, client: table.clientWidth };
    });
    assert.ok(fit?.shown, 'el paso 1 no dibuja su tabla, o no es visible');
    assert.ok(fit.right <= fit.width, `la tabla se sale de la pantalla: ${JSON.stringify(fit)}`);
    assert.ok(fit.scroll <= fit.client + 1, `la tabla tiene desbordamiento horizontal: ${JSON.stringify(fit)}`);
    await page.getByRole('button', { name: 'Ir al final' }).click();
    const card = await page.evaluate(() => {
      const table = document.querySelector('.lk-summary table.lk-facts');
      const r = table.getBoundingClientRect();
      return { shown: r.width > 0, right: r.right, width: window.innerWidth, scroll: table.scrollWidth, client: table.clientWidth };
    });
    assert.ok(card.shown && card.right <= card.width && card.scroll <= card.client + 1, `la tarjeta de cierre se sale de la pantalla o no es visible: ${JSON.stringify(card)}`);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('la tabla y la tarjeta siguen el tema oscuro: texto claro sobre papel oscuro', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }));
  try {
    const luminance = (color) => {
      const [r, g, b] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      return (r + g + b) / 3;
    };
    const readTable = () => page.evaluate(() => {
      const td = document.querySelector('.lk-wt-facts td');
      return { cell: getComputedStyle(td).color, head: getComputedStyle(document.querySelector('.lk-wt-facts th')).color };
    });
    const light = await readTable();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const dark = await readTable();
    assert.ok(luminance(light.cell) < 120, `en el tema claro el valor no es oscuro: ${light.cell}`);
    assert.ok(luminance(dark.cell) > 180, `en el tema oscuro el valor no es claro: ${dark.cell}`);
    assert.ok(luminance(dark.head) > 100, `en el tema oscuro la clave no se lee: ${dark.head}`);
    await page.getByRole('button', { name: 'Ir al final' }).click();
    const card = await page.evaluate(() => getComputedStyle(document.querySelector('.lk-summary-text')).color);
    assert.ok(luminance(card) > 180, `en el tema oscuro el texto de la tarjeta no es claro: ${card}`);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('en pantalla completa la tabla y la tarjeta de cierre caben en la pantalla', { skip }, async () => {
  const page = await open(walk({ summary: SUMMARY }), { width: 1280, height: 720 });
  try {
    await page.getByRole('button', { name: 'Pantalla completa' }).click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('lk-walkthrough'));
    await page.waitForTimeout(250);
    // Un elemento oculto mide cero y cabe en cualquier sitio: por eso se comprueba que mide algo.
    const inside = () => page.evaluate(() => {
      const table = document.querySelector('.lk-wt-facts table.lk-facts').getBoundingClientRect();
      return { shown: table.width > 0, right: table.right <= innerWidth, bottom: table.bottom <= innerHeight, left: table.left >= 0 };
    });
    assert.deepEqual(await inside(), { shown: true, right: true, bottom: true, left: true }, 'la tabla del paso se sale de la pantalla completa');
    await page.getByRole('button', { name: 'Ir al final' }).click();
    const card = await page.evaluate(() => {
      const r = document.querySelector('.lk-summary').getBoundingClientRect();
      return { shown: r.width > 0, right: r.right <= innerWidth, bottom: r.bottom <= innerHeight, left: r.left >= 0 };
    });
    assert.deepEqual(card, { shown: true, right: true, bottom: true, left: true }, 'la tarjeta de cierre se sale de la pantalla completa');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('una historia pone sus datos junto a la narración y los apila bajo ella por debajo de 640 px', { skip }, async () => {
  for (const [label, width, beside] of [['1000 px', 1000, true], ['390 px', 390, false]]) {
    const page = await open(story(), { tag: 'lk-story', width });
    try {
      const box = await page.evaluate(() => {
        const narrator = document.querySelector('.lk-story-narrator').getBoundingClientRect();
        const table = document.querySelector('.lk-story-facts table.lk-facts')?.getBoundingClientRect();
        return table ? { narrator: [narrator.left, narrator.top, narrator.right, narrator.bottom], table: [table.left, table.top] } : null;
      });
      assert.ok(box, `${label}: el paso 1 de la historia no dibuja sus datos`);
      const [, , nr, nb] = box.narrator;
      if (beside) assert.ok(box.table[0] >= nr - 1 && box.table[1] < nb, `${label}: los datos no van junto a la narración (${JSON.stringify(box)})`);
      else assert.ok(box.table[1] >= nb - 1, `${label}: los datos no se apilan bajo la narración (${JSON.stringify(box)})`);
      assert.deepEqual(page.errors, []);
    } finally {
      await page.close();
    }
  }
});

test('una historia cierra con su tarjeta: la barra queda llena, el contador dice Resumen y el reproductor vuelve a empezar', { skip }, async () => {
  const page = await open(story({ summary: { title: 'Lo que pasó', text: 'El servidor respondió.', metrics: [['paquetes', '3']] } }), { tag: 'lk-story' });
  try {
    const next = page.getByRole('button', { name: 'Paso siguiente' });
    await next.click();
    await next.click();
    await next.click();
    const seen = await page.evaluate(() => {
      const card = document.querySelector('.lk-story .lk-summary');
      return {
        card: Boolean(card) && card.getClientRects().length > 0,
        band: document.querySelector('.lk-story-band').getClientRects().length > 0,
        counter: document.querySelector('.lk-story-count').textContent,
        filled: [...document.querySelectorAll('.lk-story-seg')].map((s) => s.dataset.filled),
        valuenow: document.querySelector('.lk-story-progress').getAttribute('aria-valuenow'),
        title: card?.querySelector('.lk-summary-title')?.textContent,
        play: document.querySelector('.lk-story-player button[aria-label="Reproducir los pasos"]').textContent,
      };
    });
    assert.equal(seen.card, true, 'la historia no cierra con su tarjeta');
    assert.equal(seen.band, false, 'la narración sigue debajo de la tarjeta');
    assert.equal(seen.counter, 'Resumen');
    assert.deepEqual(seen.filled, ['true', 'true', 'true'], 'la barra no queda llena en la tarjeta');
    assert.equal(seen.valuenow, '3');
    assert.equal(seen.title, 'Lo que pasó');
    assert.equal(seen.play, '↺ Repetir', 'el reproductor no vuelve a empezar desde la tarjeta');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

// Esta prueba se añadió después de la implementación, para cubrir pantalla completa y tema oscuro en la
// historia: no hubo fase roja para ella, y lo que mide ya estaba dibujado.
test('una historia a pantalla completa y en tema oscuro deja sus datos y su tarjeta dentro de la pantalla y legibles', { skip }, async () => {
  const page = await open(story({ summary: { title: 'Lo que pasó', text: 'El servidor respondió.', metrics: [['paquetes', '3'], ['puerto', '443']] } }), { tag: 'lk-story', width: 1280, height: 720 });
  try {
    await page.evaluate(() => document.querySelector('lk-story').requestFullscreen());
    await page.waitForFunction(() => document.fullscreenElement?.tagName === 'LK-STORY');
    await page.waitForTimeout(250);
    const inside = (selector) => page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { shown: r.width > 0, right: r.right <= innerWidth, bottom: r.bottom <= innerHeight, left: r.left >= 0 };
    }, selector);
    assert.deepEqual(await inside('.lk-story-facts table.lk-facts'), { shown: true, right: true, bottom: true, left: true }, 'los datos del paso se salen de la pantalla completa');
    const next = page.getByRole('button', { name: 'Paso siguiente' });
    await next.click();
    await next.click();
    await next.click();
    assert.deepEqual(await inside('.lk-story > .lk-summary'), { shown: true, right: true, bottom: true, left: true }, 'la tarjeta de cierre se sale de la pantalla completa');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const luminance = (color) => {
      const [r, g, b] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      return (r + g + b) / 3;
    };
    const colors = await page.evaluate(() => [getComputedStyle(document.querySelector('.lk-summary-text')).color, getComputedStyle(document.querySelector('.lk-summary-metrics td')).color]);
    assert.ok(colors.every((color) => luminance(color) > 180), `en tema oscuro el texto de la tarjeta no es claro: ${colors}`);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});
