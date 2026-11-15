// El paso que cambia destaca lo que cambió, y su `ring` rodea una pieza con un anillo.
//
// Un cambio de texto o de tono destella una vez, unos 600 ms, sin que el autor lo escriba. El
// `ring` de un paso dibuja un anillo que pulsa alrededor de su pieza hasta que cambia el paso. Ni
// uno ni otro mueven lo asentado: el anillo se marca `data-focus-ring` y los gates lo quitan al
// medir, y el destello se quita al asentarse. Con movimiento reducido no hay destello y el anillo
// es un contorno fijo.
//
// Uso: node --test integrations/pi/kit/test/focus.test.mjs
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
const skip = playwright ? false : 'playwright is not installed';
const browser = playwright ? await playwright.chromium.launch() : null;
after(() => browser?.close());

// Tres pasos. La caja «db» sigue por su id mientras cambia de rótulo y de tono; el icono de base de
// datos se llama «disk» y solo se mueve. FOCUS enfoca «db» en el paso 2.
const WALK = {
  viewBox: '0 0 900 480',
  steps: [
    { text: 'uno', scene: {
      boxes: [{ id: 'db', x: 60, y: 120, w: 220, h: 110, label: 'Base' }, { x: 420, y: 120, w: 220, h: 110, label: 'Cliente' }],
      icons: [{ id: 'disk', kind: 'database', x: 760, y: 120, size: 64 }],
    } },
    { text: 'dos', scene: {
      boxes: [{ id: 'db', x: 400, y: 280, w: 220, h: 110, label: 'Base de datos', tone: 'green' }, { x: 60, y: 300, w: 220, h: 110, label: 'Pedido' }],
      icons: [{ id: 'disk', kind: 'database', x: 760, y: 300, size: 64 }],
    } },
    { text: 'tres', scene: {
      boxes: [{ id: 'db', x: 60, y: 120, w: 220, h: 110, label: 'Base de datos' }, { x: 420, y: 300, w: 220, h: 110, label: 'Pedido' }],
      icons: [{ id: 'disk', kind: 'database', x: 760, y: 120, size: 64 }],
    } },
  ],
};
const FOCUS = { ...WALK, steps: WALK.steps.map((s, i) => (i === 1 ? { ...s, ring: 'db' } : s)) };

// Un paso de historia: «Servidor» se enfoca por texto en el paso 2, y en el 3 la fórmula sigue
// resaltando un token con la lista de siempre.
const actors = (tone) => [
  { id: 'cli', x: 60, y: 90, w: 130, h: 60, label: 'Cliente', tone: 'blue' },
  { id: 'srv', x: 300, y: 90, w: 130, h: 60, label: 'Servidor', tone },
];
const atoms = [{ t: 'Cliente', id: 'c' }, { t: ' → ', id: 'go' }, { t: 'Servidor', id: 's' }];
const STORY = {
  kind: 'derivation',
  title: 'Un saludo',
  viewBox: '0 0 480 220',
  steps: [
    { title: 'Uno', narrator: 'El cliente abre.', equation: { atoms }, stage: { scene: { actors: actors('green'), moves: [{ from: 'cli', to: 'srv', verb: 'abre' }] } } },
    { title: 'Dos', narrator: 'El servidor responde.', ring: 'srv', equation: { atoms }, stage: { scene: { actors: actors('amber'), moves: [{ from: 'srv', to: 'cli', verb: 'responde' }] } } },
    { title: 'Tres', narrator: 'Listo.', focus: ['s'], equation: { atoms }, stage: { scene: { actors: actors('green'), marks: [{ kind: 'ok', actors: ['cli'] }] } } },
  ],
};

// Lo que las pruebas miran en la página: el paso que se dibuja, su anillo y sus piezas, los
// destellos, y la geometría de lo dibujado sin el anillo (que los gates no miden).
const PROBE = `window.probe = {
  stage: () => document.querySelector('.lk-wt-stage'),
  dot: (n) => document.querySelectorAll('.lk-wt-dot')[n - 1],
  group: (n) => document.querySelector('.lk-wt-stage [data-step="' + n + '"]'),
  ring: (n) => window.probe.group(n).querySelector(':scope > [data-focus-ring]'),
  piece: (n, id) => [...window.probe.group(n).children].find((c) => c.dataset.pieceId === id),
  box: (node) => { const b = node.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; },
  screen: (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
  flashes: () => [...document.querySelectorAll('[data-flash]')],
  snapshot: () => {
    const step = [...document.querySelectorAll('.lk-wt-stage [data-step]')].find((g) => getComputedStyle(g).display !== 'none');
    return [...step.querySelectorAll('[data-piece-key], text, rect, path, circle')]
      .filter((n) => !n.hasAttribute('data-focus-ring') && !n.hasAttribute('data-flash') && !n.closest('[data-flash]'))
      .map((n) => { const r = n.getBoundingClientRect(); return [n.tagName, n.dataset.pieceKey || '', ...[r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10)].join(' '); });
  },
};`;

async function open(spec, { reduced = false, tag = 'lk-walkthrough' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-focus-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body><main style="max-width:900px"><${tag}><script type="application/json">${JSON.stringify(spec)}</script></${tag}></main></body></html>`);
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(pathToFileURL(join(dir, 'p.html')).href);
  await page.waitForSelector(`${tag} .lk-wt-stage svg`, { timeout: 15000 });
  await page.addScriptTag({ content: PROBE });
  await page.waitForTimeout(300);
  return page;
}

const settled = (page) => page.waitForFunction(() => window.probe.stage().dataset.settled === 'true', null, { timeout: 2000 });
// Un rectángulo rodea a otro con un margen de aire: el anillo queda fuera de la pieza.
const encloses = (outer, inner, margin) => outer.x <= inner.x - margin && outer.y <= inner.y - margin
  && outer.x + outer.w >= inner.x + inner.w + margin && outer.y + outer.h >= inner.y + inner.h + margin;

test('un paso con ring tiene un anillo, y solo ese paso lo tiene', { skip }, async () => {
  const page = await open(FOCUS);
  try {
    const rings = await page.evaluate(() => [1, 2, 3].map((n) => window.probe.group(n).querySelectorAll(':scope > [data-focus-ring]').length));
    assert.deepEqual(rings, [0, 1, 0]);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('el anillo queda fuera de su pieza y dentro del lienzo', { skip }, async () => {
  const page = await open(FOCUS);
  try {
    await page.evaluate(() => window.probe.dot(2).click());
    await settled(page);
    const seen = await page.evaluate(() => {
      const ring = window.probe.ring(2), piece = window.probe.piece(2, 'db');
      const vb = window.probe.stage().querySelector('svg').viewBox.baseVal;
      return ring && piece ? { ring: window.probe.box(ring), piece: window.probe.box(piece), room: { x: vb.x, y: vb.y, w: vb.width, h: vb.height } } : null;
    });
    assert.ok(seen, 'el paso 2 no tiene anillo ni la pieza «db»');
    assert.ok(encloses(seen.ring, seen.piece, 3), `el anillo ${JSON.stringify(seen.ring)} no rodea la pieza ${JSON.stringify(seen.piece)}`);
    assert.ok(seen.ring.x >= seen.room.x && seen.ring.y >= seen.room.y
      && seen.ring.x + seen.ring.w <= seen.room.x + seen.room.w && seen.ring.y + seen.ring.h <= seen.room.y + seen.room.h, 'el anillo se sale del lienzo');
  } finally {
    await page.close();
  }
});

test('el anillo no mueve la geometría asentada: los gates la miden igual con y sin él', { skip }, async () => {
  const focused = await open(FOCUS);
  const plain = await open(WALK);
  try {
    for (const page of [focused, plain]) {
      await page.evaluate(() => window.probe.dot(2).click());
      await settled(page);
    }
    assert.ok(await focused.evaluate(() => !!window.probe.ring(2)), 'el paso 2 no tiene anillo');
    assert.deepEqual(await focused.evaluate(() => window.probe.snapshot()), await plain.evaluate(() => window.probe.snapshot()));
    assert.deepEqual(focused.errors, []);
  } finally {
    await focused.close();
    await plain.close();
  }
});

test('el anillo pulsa; con movimiento reducido es un contorno fijo', { skip }, async () => {
  const page = await open(FOCUS);
  const still = await open(FOCUS, { reduced: true });
  try {
    for (const p of [page, still]) {
      await p.evaluate(() => window.probe.dot(2).click());
      await settled(p);
    }
    const look = (p) => p.evaluate(() => {
      const ring = window.probe.ring(2);
      if (!ring) return null;
      const style = getComputedStyle(ring);
      return { animation: style.animationName, opacity: style.opacity };
    });
    assert.equal((await look(page))?.animation, 'pulse', 'el anillo no pulsa');
    assert.deepEqual(await look(still), { animation: 'none', opacity: '1' }, 'con movimiento reducido el anillo no queda fijo');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
    await still.close();
  }
});

// El `focus` de un paso es la lista de símbolos de su fórmula: un texto en `focus` ya no dibuja anillo (#305).
test('un focus de texto ya no dibuja anillo: el anillo es la clave ring', { skip }, async () => {
  const page = await open({ ...WALK, steps: WALK.steps.map((s, i) => (i === 1 ? { ...s, focus: 'db' } : s)) });
  try {
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-focus-ring]').length), 0);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('un ring que no nombra ninguna pieza no dibuja anillo ni rompe el paso', { skip }, async () => {
  const page = await open({ ...WALK, steps: WALK.steps.map((s, i) => (i === 1 ? { ...s, ring: 'nada' } : s)) });
  try {
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-focus-ring]').length), 0);
    await page.evaluate(() => window.probe.dot(3).click());
    await settled(page);
    assert.equal(await page.evaluate(() => window.probe.stage().dataset.settled), 'true');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('el anillo cambia de color en el tema oscuro', { skip }, async () => {
  const page = await open(FOCUS);
  try {
    await page.evaluate(() => window.probe.dot(2).click());
    await settled(page);
    const stroke = () => page.evaluate(() => {
      const ring = window.probe.ring(2);
      return ring ? getComputedStyle(ring).stroke : null;
    });
    const light = await stroke();
    assert.ok(light, 'no hay anillo en el tema claro');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const dark = await stroke();
    assert.notEqual(dark, light, `el anillo sigue en ${light} con el tema oscuro`);
  } finally {
    await page.close();
  }
});

test('en modo ancho el anillo sigue a su pieza en pantalla', { skip }, async () => {
  const page = await open(FOCUS);
  try {
    await page.evaluate(() => { window.probe.dot(2).click(); document.body.classList.add('wide'); });
    await settled(page);
    await page.waitForTimeout(150);
    const seen = await page.evaluate(() => {
      const ring = window.probe.ring(2), piece = window.probe.piece(2, 'db');
      return ring && piece ? { ring: window.probe.screen(ring), piece: window.probe.screen(piece) } : null;
    });
    assert.ok(seen, 'en modo ancho no hay anillo ni pieza «db»');
    assert.ok(encloses(seen.ring, seen.piece, 2), `en modo ancho el anillo ${JSON.stringify(seen.ring)} no rodea la pieza ${JSON.stringify(seen.piece)}`);
  } finally {
    await page.close();
  }
});

test('en pantalla completa el anillo sigue a su pieza', { skip }, async () => {
  const page = await open(FOCUS);
  try {
    await page.evaluate(() => window.probe.dot(2).click());
    await settled(page);
    await page.getByRole('button', { name: 'Pantalla completa' }).click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('lk-walkthrough'));
    await page.waitForTimeout(250);
    const seen = await page.evaluate(() => {
      const ring = window.probe.ring(2), piece = window.probe.piece(2, 'db');
      return ring && piece ? { ring: window.probe.screen(ring), piece: window.probe.screen(piece) } : null;
    });
    assert.ok(seen, 'en pantalla completa no hay anillo ni pieza «db»');
    assert.ok(encloses(seen.ring, seen.piece, 2), `en pantalla completa el anillo no rodea la pieza`);
  } finally {
    await page.close();
  }
});

test('una pieza que se queda y cambia de texto o de tono destella una vez, unos 600 ms', { skip }, async () => {
  const page = await open(WALK);
  try {
    const moving = await page.evaluate(() => {
      window.probe.dot(2).click();
      return window.probe.flashes().map((f) => ({ piece: f.parentElement.dataset.pieceKey, ms: f.getAnimations().map((a) => a.effect.getTiming().duration) }));
    });
    assert.deepEqual(moving.map((m) => m.piece), ['box:db'], 'destella las piezas que cambiaron, y solo esas');
    assert.deepEqual(moving[0].ms, [600]);
    await settled(page);
    assert.equal(await page.evaluate(() => window.probe.flashes().length), 0, 'tras asentarse queda un destello');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('con movimiento reducido no hay destello y el anillo es un contorno fijo', { skip }, async () => {
  const page = await open(FOCUS, { reduced: true });
  try {
    const seen = await page.evaluate(() => {
      window.probe.dot(2).click();
      return { flashes: window.probe.flashes().length, ring: !!window.probe.ring(2), settled: window.probe.stage().dataset.settled };
    });
    assert.deepEqual(seen, { flashes: 0, ring: true, settled: 'true' });
  } finally {
    await page.close();
  }
});

test('una historia enfoca una pieza con un texto y sus fichas de fórmula siguen con una lista', { skip }, async () => {
  const page = await open(STORY, { tag: 'lk-story' });
  try {
    const next = () => page.evaluate(() => document.querySelector('button[aria-label="Paso siguiente"]').click());
    await next();
    await settled(page);
    assert.ok(await page.evaluate(() => !!window.probe.ring(2)), 'la historia no enfoca la pieza «srv» del paso 2');
    await next();
    await settled(page);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.lk-token-focus')].map((t) => t.textContent)), ['Servidor']);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});
