// El cambio de paso mueve la figura: lo que sigue se desliza desde donde estaba, lo
// que entra sube con un fundido y lo que sale se desvanece. Con movimiento reducido
// el cambio es de golpe, y el dibujo asentado es el mismo que el estático.
//
// Uso: node --test integrations/pi/kit/test/motion.test.mjs
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

// Tres pasos. La caja «db» sigue por su id aunque cambie su rótulo; «Cliente» sale,
// «Pedido» entra, y el icono de base de datos no tiene id: se llama por su tipo.
const WALK = {
  viewBox: '0 0 900 480',
  steps: [
    { text: 'uno', scene: {
      boxes: [{ id: 'db', x: 60, y: 120, w: 220, h: 110, label: 'Base' }, { x: 420, y: 120, w: 220, h: 110, label: 'Cliente' }],
      icons: [{ kind: 'database', x: 760, y: 120, size: 64 }],
    } },
    { text: 'dos', scene: {
      boxes: [{ id: 'db', x: 400, y: 280, w: 220, h: 110, label: 'Base de datos', tone: 'green' }, { x: 60, y: 300, w: 220, h: 110, label: 'Pedido' }],
      icons: [{ kind: 'database', x: 760, y: 300, size: 64 }],
    } },
    { text: 'tres', scene: {
      boxes: [{ id: 'db', x: 60, y: 120, w: 220, h: 110, label: 'Base de datos' }, { x: 420, y: 300, w: 220, h: 110, label: 'Pedido' }],
      icons: [{ kind: 'database', x: 760, y: 120, size: 64 }],
    } },
  ],
};

// Un paso de historia: la caja «db» sigue de un paso al otro.
const STORY = {
  viewBox: '0 0 600 300',
  steps: [
    { narrator: 'Un cliente pide un dato.', stage: { scene: { boxes: [{ id: 'db', x: 40, y: 100, w: 200, h: 100, label: 'Base' }] } } },
    { narrator: 'La base responde.', stage: { scene: { boxes: [{ id: 'db', x: 340, y: 100, w: 200, h: 100, label: 'Base' }] } } },
  ],
};

// Lo que las pruebas miran en la página: el paso que se dibuja, sus piezas, lo que
// aún se mueve dentro de la figura y la geometría de todo lo dibujado.
const PROBE = `window.probe = {
  stage: () => document.querySelector('.lk-wt-stage'),
  dot: (n) => document.querySelectorAll('.lk-wt-dot')[n - 1],
  group: (n) => document.querySelector('.lk-wt-stage [data-step="' + n + '"]'),
  piece: (n, key) => [...window.probe.group(n).children].find((c) => c.dataset.pieceKey === key),
  rect: (node) => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); },
  shown: (n) => getComputedStyle(window.probe.group(n)).display !== 'none',
  motion: () => document.getAnimations().filter((a) => window.probe.stage().contains(a.effect?.target)).length,
  snapshot: () => {
    const step = [...document.querySelectorAll('.lk-wt-stage [data-step]')].find((g) => getComputedStyle(g).display !== 'none');
    return [...step.querySelectorAll('[data-piece-key], text, rect, path, circle')].map((n) => [n.tagName, n.dataset.pieceKey || '', ...window.probe.rect(n)].join(' '));
  },
};`;

async function open(spec, { reduced = false, tag = 'lk-walkthrough' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-motion-'));
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

test('una pieza se reconoce entre pasos por su id, o por su tipo y su rótulo', { skip }, async () => {
  const page = await open(WALK);
  try {
    const keys = await page.evaluate(() => [1, 2, 3].map((n) => [...window.probe.group(n).children].map((c) => c.dataset.pieceKey)));
    assert.deepEqual(keys, [
      ['box:db', 'box:Cliente', 'icon:database'],
      ['box:db', 'box:Pedido', 'icon:database'],
      ['box:db', 'box:Pedido', 'icon:database'],
    ]);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('lo que sigue se desliza desde donde estaba, en 320 ms como mucho, y cambia de tono', { skip }, async () => {
  const page = await open(WALK);
  try {
    const was = await page.evaluate(() => window.probe.rect(window.probe.piece(1, 'box:db')));
    const moving = await page.evaluate(() => {
      window.probe.dot(2).click();
      const kept = window.probe.piece(2, 'box:db');
      return {
        start: window.probe.rect(kept),
        running: document.getAnimations().filter((a) => window.probe.stage().contains(a.effect?.target)).map((a) => a.effect.getTiming()),
        tone: [...kept.querySelectorAll('rect')].some((r) => r.getAnimations().some((a) => a.effect.getKeyframes().some((k) => 'stroke' in k))),
      };
    });
    assert.deepEqual(moving.start, was, 'al empezar, la caja sigue donde estaba');
    assert.ok(moving.running.length > 0, 'el cambio de paso no anima nada');
    for (const timing of moving.running) {
      assert.ok(timing.duration <= 320, `la animación dura ${timing.duration} ms`);
      assert.match(timing.easing, /cubic-bezier\(0?\.2, ?0?\.8, ?0?\.2, ?1\)/);
    }
    assert.ok(moving.tone, 'la caja cambia de tono al pasar a su nuevo estado');
    await settled(page);
    const landed = await page.evaluate(() => window.probe.rect(window.probe.piece(2, 'box:db')));
    assert.notDeepEqual(landed, was, 'la caja termina en su sitio del paso nuevo');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('lo que entra sube 6 px con un fundido y lo que sale se desvanece hasta asentarse', { skip }, async () => {
  const page = await open(WALK);
  try {
    const moving = await page.evaluate(() => {
      window.probe.dot(2).click();
      const entering = window.probe.piece(2, 'box:Pedido');
      return {
        start: window.probe.rect(entering),
        opacity: getComputedStyle(entering).opacity,
        leaving: window.probe.shown(1) && window.probe.piece(1, 'box:Cliente').getAnimations().some((a) => a.effect.getKeyframes().some((k) => Number(k.opacity) === 0)),
      };
    });
    assert.equal(moving.opacity, '0', 'la pieza que entra empieza invisible');
    assert.ok(moving.leaving, 'lo que sale sigue dibujado y se desvanece mientras cambia el paso');
    await settled(page);
    const landed = await page.evaluate(() => window.probe.rect(window.probe.piece(2, 'box:Pedido')));
    assert.ok(Math.abs(moving.start[1] - landed[1] - 6) < 0.6, `la pieza entra ${moving.start[1] - landed[1]} px más abajo, no 6`);
    assert.equal(await page.evaluate(() => window.probe.shown(1)), false, 'al asentarse, el paso anterior deja de dibujarse');
    assert.equal(await page.evaluate(() => window.probe.motion()), 0, 'no queda ningún movimiento en curso');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('con movimiento reducido el paso cambia de golpe', { skip }, async () => {
  const page = await open(WALK, { reduced: true });
  try {
    const seen = await page.evaluate(() => {
      window.probe.dot(2).click();
      return { motion: window.probe.motion(), settled: window.probe.stage().dataset.settled, shown: [window.probe.shown(1), window.probe.shown(2)] };
    });
    assert.deepEqual(seen, { motion: 0, settled: 'true', shown: [false, true] });
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('el dibujo asentado de cada paso es el mismo que el estático', { skip }, async () => {
  const moving = await open(WALK);
  const still = await open(WALK, { reduced: true });
  try {
    const seen = [await moving.evaluate(() => window.probe.snapshot())];
    const expected = [await still.evaluate(() => window.probe.snapshot())];
    for (const n of [2, 3]) {
      const running = await moving.evaluate((k) => { window.probe.dot(k).click(); return window.probe.motion(); }, n);
      assert.ok(running > 0, `el paso ${n} no se mueve`);
      await settled(moving);
      seen.push(await moving.evaluate(() => window.probe.snapshot()));
      await still.evaluate((k) => window.probe.dot(k).click(), n);
      expected.push(await still.evaluate(() => window.probe.snapshot()));
    }
    assert.deepEqual(seen, expected);
    assert.deepEqual(moving.errors, []);
  } finally {
    await moving.close();
    await still.close();
  }
});

test('un segundo cambio durante la transición termina en el paso al que se llega', { skip }, async () => {
  const moving = await open(WALK);
  const still = await open(WALK, { reduced: true });
  try {
    await still.evaluate(() => { window.probe.dot(2).click(); window.probe.dot(3).click(); });
    const expected = await still.evaluate(() => window.probe.snapshot());
    await moving.evaluate(() => { window.probe.dot(2).click(); window.probe.dot(3).click(); });
    await settled(moving);
    const seen = await moving.evaluate(() => ({ snapshot: window.probe.snapshot(), motion: window.probe.motion(), shown: [window.probe.shown(2), window.probe.shown(3)] }));
    assert.deepEqual(seen.snapshot, expected, 'el dibujo final es el del paso al que se llegó');
    assert.equal(seen.motion, 0, 'no queda ningún movimiento del primer cambio');
    assert.deepEqual(seen.shown, [false, true]);
    assert.deepEqual(moving.errors, []);
  } finally {
    await moving.close();
    await still.close();
  }
});

test('las flechas del teclado y la pantalla completa cancelan la transición', { skip }, async () => {
  const page = await open(WALK);
  try {
    const seen = await page.evaluate(() => {
      window.probe.dot(2).click();
      document.querySelector('lk-walkthrough').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      document.dispatchEvent(new Event('fullscreenchange'));
      return { settled: window.probe.stage().dataset.settled, motion: window.probe.motion(), shown: [window.probe.shown(2), window.probe.shown(3)] };
    });
    assert.deepEqual(seen, { settled: 'true', motion: 0, shown: [false, true] });
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('una historia sigue el mismo cambio de paso y se asienta igual', { skip }, async () => {
  const page = await open(STORY, { tag: 'lk-story' });
  const still = await open(STORY, { tag: 'lk-story', reduced: true });
  try {
    const before = await page.evaluate(() => window.probe.rect(window.probe.piece(1, 'box:db')));
    const moving = await page.evaluate(() => {
      document.querySelector('button[aria-label="Paso siguiente"]').click();
      return { start: window.probe.rect(window.probe.piece(2, 'box:db')), running: window.probe.motion() };
    });
    assert.deepEqual(moving.start, before, 'la caja de la historia empieza donde estaba');
    assert.ok(moving.running > 0, 'la historia no anima el cambio de paso');
    await settled(page);
    await still.evaluate(() => document.querySelector('button[aria-label="Paso siguiente"]').click());
    assert.deepEqual(await page.evaluate(() => window.probe.snapshot()), await still.evaluate(() => window.probe.snapshot()));
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
    await still.close();
  }
});
