// La flecha que fluye y la flecha nueva (#300): el trazo con `flow: true` viaja de la cola a la
// punta con el reloj del explorador (`lk-xflow`), y una flecha que entra en el paso se dibuja sola
// en 400 ms con su punta al final.
//
// Lo asentado no cambia: la geometría y la etiqueta son las mismas con y sin `flow`. Con movimiento
// reducido la flecha es sólida y quieta, y el dibujo no ocurre.
//
// Uso: node --test integrations/pi/kit/test/flow.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
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

// Dos cajas y una flecha entre ellas. `flow` la hace fluir; sin `flow` es la referencia estática.
const BOXES = [
  { x: 60, y: 120, w: 200, h: 110, label: 'Origen' },
  { x: 560, y: 120, w: 200, h: 110, label: 'Destino' },
];
const ARROW = { x1: 270, y1: 175, x2: 550, y2: 175, label: 'envía' };
const walk = (flow) => {
  const arrow = { ...ARROW, ...(flow === undefined ? {} : { flow }) };
  return {
    viewBox: '0 0 900 320',
    steps: [
      { text: 'uno', scene: { boxes: BOXES } },
      { text: 'dos', scene: { boxes: BOXES, arrows: [arrow] } },
      { text: 'tres', scene: { boxes: BOXES, arrows: [arrow] } },
    ],
  };
};
const FLOW = walk(true);
const STATIC = walk(undefined);

// Un movimiento de historia: «cli» envía a «srv» en el paso 2, con `flow` o sin él.
const ACTORS = [
  { id: 'cli', x: 60, y: 90, w: 130, h: 60, label: 'Cliente', tone: 'blue' },
  { id: 'srv', x: 300, y: 90, w: 130, h: 60, label: 'Servidor', tone: 'green' },
];
const story = (flow) => ({
  kind: 'derivation',
  title: 'Un saludo',
  viewBox: '0 0 480 220',
  steps: [
    { title: 'Uno', narrator: 'El cliente está listo.', stage: { scene: { actors: ACTORS } } },
    { title: 'Dos', narrator: 'El cliente abre la conexión.', stage: { scene: { actors: ACTORS, moves: [{ from: 'cli', to: 'srv', verb: 'abre', ...(flow === undefined ? {} : { flow }) }] } } },
    { title: 'Tres', narrator: 'Listo.', stage: { scene: { actors: ACTORS, marks: [{ kind: 'ok', actors: ['srv'] }] } } },
  ],
});

// Lo que las pruebas miran en la página: la flecha de cada paso, su animación y la geometría que
// dibuja, con la punta y la etiqueta.
const PROBE = `window.probe = {
  stage: () => document.querySelector('.lk-wt-stage'),
  dot: (n) => document.querySelectorAll('.lk-wt-dot')[n - 1],
  next: () => document.querySelector('button[aria-label="Paso siguiente"]'),
  group: (n) => document.querySelector('.lk-wt-stage [data-step="' + n + '"]'),
  shown: (n) => getComputedStyle(window.probe.group(n)).display !== 'none',
  arrow: (n) => window.probe.group(n).querySelector('[data-arrow] > path, [data-move-path]'),
  waapi: (node) => node.getAnimations().filter((a) => !('animationName' in a)),
  drawOf: (node) => window.probe.waapi(node).find((a) => a.effect.getKeyframes().some((k) => 'strokeDashoffset' in k)) || null,
  moving: () => document.getAnimations().filter((a) => !('animationName' in a) && window.probe.stage().contains(a.effect?.target)).length,
  snapshot: (n) => [...window.probe.group(n).querySelectorAll('path, text')].map((node) => {
    const r = node.getBoundingClientRect();
    return [node.tagName, node.textContent.trim(), node.getAttribute('marker-end') ? 'head' : 'bare', ...[r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10)].join(' ');
  }),
};`;

async function open(spec, { reduced = false, tag = 'lk-walkthrough' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-flow-'));
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

test('una flecha con flow se dibuja discontinua y su trazo viaja de la cola a la punta', { skip }, async () => {
  const page = await open(FLOW);
  try {
    await page.evaluate(() => window.probe.dot(2).click());
    await settled(page);
    const seen = await page.evaluate(() => {
      const path = window.probe.arrow(2), css = getComputedStyle(path);
      const flow = path.getAnimations().find((a) => 'animationName' in a);
      // El desfase baja con el tiempo: el guion avanza hacia la punta, que es el sentido de la flecha.
      const at = (ms) => { flow.pause(); flow.currentTime = ms; return parseFloat(getComputedStyle(path).strokeDashoffset); };
      const offsets = flow ? [at(0), at(550)] : [];
      flow?.play();
      const total = path.getTotalLength();
      const tail = path.getPointAtLength(0), tip = path.getPointAtLength(total);
      return {
        flowing: path.classList.contains('lk-flow'),
        name: css.animationName,
        dash: css.strokeDasharray,
        offsets,
        tail: [tail.x, tail.y],
        tip: [tip.x, tip.y],
        marker: path.getAttribute('marker-end') !== null,
      };
    });
    assert.equal(seen.flowing, true, 'la flecha con flow no lleva la clase del flujo');
    assert.equal(seen.name, 'lk-xflow', 'la flecha no usa el reloj del explorador');
    assert.notEqual(seen.dash, 'none', 'la flecha con flow se dibuja sólida');
    assert.equal(seen.offsets.length, 2, 'la flecha con flow no tiene animación de trazo');
    assert.ok(seen.offsets[1] < seen.offsets[0], `el trazo no avanza hacia la punta: ${seen.offsets}`);
    assert.deepEqual(seen.tail.map(Math.round), [270, 175], 'el trazo no nace en la cola');
    assert.deepEqual(seen.tip.map(Math.round), [550, 175], 'el trazo no termina en la punta');
    assert.equal(seen.marker, true, 'la flecha perdió su punta');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('con movimiento reducido la flecha con flow es sólida y no se mueve', { skip }, async () => {
  const page = await open(FLOW, { reduced: true });
  try {
    await page.evaluate(() => window.probe.dot(2).click());
    await settled(page);
    const seen = await page.evaluate(() => {
      const css = getComputedStyle(window.probe.arrow(2));
      return { dash: css.strokeDasharray, name: css.animationName };
    });
    assert.deepEqual(seen, { dash: 'none', name: 'none' });
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('una flecha nueva se dibuja sola en 400 ms con la curva de la transición, y su punta aparece al llegar', { skip }, async () => {
  const page = await open(FLOW);
  try {
    const started = await page.evaluate(() => {
      window.probe.dot(2).click();
      const path = window.probe.arrow(2), draw = window.probe.drawOf(path);
      window.__draw = draw;
      const label = window.probe.group(2).querySelector('[data-arrow] text');
      return {
        pathLength: path.getAttribute('pathLength'),
        head: path.getAttribute('marker-end'),
        timing: draw ? draw.effect.getTiming() : null,
        keys: draw ? draw.effect.getKeyframes().map((k) => Number(k.strokeDashoffset)) : null,
        labelFades: label.getAnimations().some((a) => a.effect.getKeyframes().some((k) => Number(k.opacity) === 0)),
      };
    });
    assert.equal(started.pathLength, '1', 'la flecha nueva no se mide con pathLength 1');
    assert.equal(started.head, null, 'la punta aparece antes de que llegue el trazo');
    assert.ok(started.timing, 'la flecha nueva no dibuja su trazo');
    assert.equal(started.timing.duration, 400, `el trazo dura ${started.timing.duration} ms y debe durar 400`);
    assert.match(started.timing.easing, /cubic-bezier\(0?\.2, ?0?\.8, ?0?\.2, ?1\)/);
    assert.deepEqual(started.keys, [1, 0], 'el trazo no avanza de dashoffset 1 a 0');
    assert.equal(started.labelFades, true, 'la etiqueta de la flecha nueva no aparece con ella');
    // A mitad del dibujo el guion es el del dibujo y no el de la clase de flujo, y el desfase avanza.
    const mid = await page.evaluate(() => {
      window.__draw.pause();
      window.__draw.currentTime = 200;
      const css = getComputedStyle(window.probe.arrow(2));
      const seen = { dash: css.strokeDasharray, offset: parseFloat(css.strokeDashoffset) };
      window.__draw.play();
      return seen;
    });
    assert.equal(mid.dash, '1px', `durante el dibujo el guion es ${mid.dash}, no el de la flecha nueva`);
    assert.ok(mid.offset > 0 && mid.offset < 1, `el desfase no avanza con el dibujo: ${mid.offset}`);
    const landed = await page.evaluate(async () => {
      await window.__draw?.finished.catch(() => {});
      const path = window.probe.arrow(2);
      return { head: path.getAttribute('marker-end'), pathLength: path.getAttribute('pathLength') };
    });
    assert.notEqual(landed.head, null, 'la punta no aparece al llegar el trazo');
    assert.equal(landed.pathLength, null, 'al llegar el trazo queda el pathLength del dibujo');
    await settled(page);
    const asettled = await page.evaluate(() => window.probe.arrow(2).getAttribute('style'));
    assert.equal(asettled, null, `al asentarse queda el estilo del dibujo: ${asettled}`);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('una flecha que sigue en el paso siguiente no se vuelve a dibujar', { skip }, async () => {
  const page = await open(FLOW);
  try {
    await page.evaluate(() => window.probe.dot(2).click());
    await settled(page);
    const kept = await page.evaluate(() => {
      window.probe.dot(3).click();
      return window.probe.waapi(window.probe.arrow(3)).length;
    });
    assert.equal(kept, 0, 'la flecha que sigue se anima otra vez');
    await settled(page);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('la geometría asentada es la misma con flow que sin él, y la flecha asentada no deja restos del dibujo', { skip }, async () => {
  const flowing = await open(FLOW);
  const still = await open(STATIC, { reduced: true });
  try {
    await flowing.evaluate(() => window.probe.dot(2).click());
    await settled(flowing);
    await still.evaluate(() => window.probe.dot(2).click());
    await settled(still);
    assert.deepEqual(await flowing.evaluate(() => window.probe.snapshot(2)), await still.evaluate(() => window.probe.snapshot(2)));
    const left = await flowing.evaluate(() => {
      const path = window.probe.arrow(2);
      return { pathLength: path.getAttribute('pathLength'), style: path.getAttribute('style') };
    });
    assert.deepEqual(left, { pathLength: null, style: null }, 'el dibujo deja restos en la flecha asentada');
    assert.deepEqual(flowing.errors, []);
  } finally {
    await flowing.close();
    await still.close();
  }
});

test('un segundo cambio durante el dibujo deja la flecha entera y el paso al que se llega', { skip }, async () => {
  const page = await open(FLOW);
  const still = await open(FLOW, { reduced: true });
  try {
    await page.evaluate(() => { window.probe.dot(2).click(); window.probe.dot(3).click(); });
    await settled(page);
    await still.evaluate(() => window.probe.dot(3).click());
    await settled(still);
    assert.deepEqual(await page.evaluate(() => window.probe.snapshot(3)), await still.evaluate(() => window.probe.snapshot(3)));
    const left = await page.evaluate(() => {
      const path = window.probe.arrow(2);
      return { pathLength: path.getAttribute('pathLength'), style: path.getAttribute('style'), head: path.getAttribute('marker-end') !== null };
    });
    assert.deepEqual(left, { pathLength: null, style: null, head: true }, 'el paso cortado deja la flecha a medio dibujar');
    assert.equal(await page.evaluate(() => window.probe.shown(2)), false, 'el paso anterior sigue dibujado');
    assert.equal(await page.evaluate(() => window.probe.moving()), 0, 'queda un trazo en movimiento');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
    await still.close();
  }
});

test('un movimiento de historia con flow se dibuja discontinuo, y uno nuevo se dibuja solo', { skip }, async () => {
  const page = await open(story(true), { tag: 'lk-story' });
  try {
    const started = await page.evaluate(() => {
      window.probe.next().click();
      const path = window.probe.arrow(2), draw = window.probe.drawOf(path);
      window.__draw = draw;
      return { flowing: path.classList.contains('lk-flow'), head: path.getAttribute('marker-end'), timing: draw ? draw.effect.getTiming() : null };
    });
    assert.equal(started.flowing, true, 'el movimiento con flow no lleva la clase del flujo');
    assert.equal(started.head, null, 'la punta del movimiento nuevo aparece antes de llegar');
    assert.equal(started.timing?.duration, 400, 'el movimiento nuevo no se dibuja en 400 ms');
    await settled(page);
    const seen = await page.evaluate(() => {
      const path = window.probe.arrow(2), css = getComputedStyle(path);
      const flow = path.getAnimations().find((a) => 'animationName' in a);
      return { name: css.animationName, dash: css.strokeDasharray, flowAnim: Boolean(flow), tail: path.getPointAtLength(0).x, tip: path.getPointAtLength(path.getTotalLength()).x };
    });
    assert.equal(seen.name, 'lk-xflow', 'el movimiento no usa el reloj del explorador');
    assert.notEqual(seen.dash, 'none', 'el movimiento con flow se dibuja sólido');
    assert.ok(seen.tail < seen.tip, 'el movimiento no va del actor de salida al de llegada');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('con movimiento reducido el movimiento de historia con flow es sólido y quieto', { skip }, async () => {
  const page = await open(story(true), { tag: 'lk-story', reduced: true });
  try {
    await page.evaluate(() => window.probe.next().click());
    await settled(page);
    const seen = await page.evaluate(() => {
      const css = getComputedStyle(window.probe.arrow(2));
      return { dash: css.strokeDasharray, name: css.animationName };
    });
    assert.deepEqual(seen, { dash: 'none', name: 'none' });
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('el trazo que fluye reusa el único @keyframes lk-xflow del kit', () => {
  const css = readFileSync(join(KIT, 'kit.css'), 'utf8');
  assert.equal(css.match(/@keyframes\s+lk-xflow\b/g)?.length, 1, 'hay más de un @keyframes lk-xflow');
});
