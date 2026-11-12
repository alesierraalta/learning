// El recorrido de una fórmula y el de un ejercicio: el mismo mueble, medido en
// el navegador.
//
// Nació de dos defectos reales: el término que se mueve tiene que empezar y
// terminar en las cajas medidas de sus dos posiciones (no en una coordenada
// escrita a mano), y un icono declarado tiene que dibujar tinta dentro del
// lienzo (el robot del ejemplo se declaraba a 8 unidades con 56 de ancho y el
// `viewBox` lo cortaba por la mitad).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se puede medir el recorrido';

function page(spec) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-story-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css"><script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
</head><body><main style="max-width:700px;margin:0 auto"><lk-story><script type="application/json">${JSON.stringify(spec)}</script></lk-story></main></body></html>`);
  return 'file://' + join(dir, 'p.html');
}

async function open(url) {
  const browser = await PLAYWRIGHT.chromium.launch();
  const view = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [];
  view.on('pageerror', (error) => errors.push(String(error.message)));
  await view.goto(url);
  await view.waitForSelector('lk-story svg');
  await view.waitForTimeout(300);
  return { browser, view, errors };
}

const FORMULA = {
  kind: 'formula',
  title: 'La densidad',
  viewBox: '0 0 360 250',
  formula: { size: 18, atoms: [{ t: 'f', id: 'f' }, { t: '(', id: 'open' }, { t: 'x', id: 'x' }, { t: ')', id: 'close' }] },
  steps: [
    { title: 'La fórmula entera', focus: [], narrator: 'Es la densidad «f» en el punto «x».', stage: { scene: { labels: [{ x: 180, y: 120, text: 'la campana', size: 15 }] } } },
    { title: 'f: la densidad', focus: ['f'], say: { what: 'la densidad', use: 'la altura de la curva', value: 'f(184 ms)' }, narrator: '«f» es la densidad.', stage: { scene: { labels: [{ x: 180, y: 120, text: 'la altura', size: 15 }] } } },
    { title: 'x: el punto', focus: ['x'], narrator: '«x» es el punto.', stage: { scene: { labels: [{ x: 180, y: 120, text: 'la latencia', size: 15 }] } } },
    { title: 'Con el ejemplo', focus: [], narrator: 'Con «x = 184», «f(184) = 0,000 65».', stage: { scene: { labels: [{ x: 180, y: 120, text: 'el resultado', size: 15 }] } } },
  ],
};

test('la fórmula se recorre: cabecera, foco por id, narrador y reproductor', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open(page(FORMULA));
  try {
    assert.deepEqual(errors, []);
    const controls = await view.evaluate(() => ({
      segments: document.querySelectorAll('.lk-story-seg').length,
      count: document.querySelector('.lk-story-count').textContent,
      prevDisabled: document.querySelector('[aria-label="Paso anterior"]').disabled,
      play: document.querySelector('[aria-label="Reproducir los pasos"]').textContent,
      focus: [...document.querySelectorAll('.lk-token[data-focus="1"]')].map((t) => t.dataset.atom),
      narrator: document.querySelector('.lk-story-narrator').textContent,
      chips: [...document.querySelectorAll('.lk-story-narrator .lk-chip')].map((c) => c.textContent),
    }));
    assert.equal(controls.segments, 4, 'la barra segmentada tiene un segmento por paso');
    assert.equal(controls.count, '1 / 4', 'el contador dice el paso actual');
    assert.equal(controls.prevDisabled, true, 'el primer paso no tiene anterior');
    assert.match(controls.play, /Reproducir/);
    assert.deepEqual(controls.focus, [], 'el paso 1 muestra la fórmula entera, sin foco');
    assert.match(controls.narrator, /Es la densidad f en el punto x/);
    assert.deepEqual(controls.chips, ['f', 'x'], 'las fichas en línea son los símbolos del narrador');
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.waitForTimeout(80);
    const second = await view.evaluate(() => ({
      count: document.querySelector('.lk-story-count').textContent,
      focus: [...document.querySelectorAll('.lk-token[data-focus="1"]')].map((t) => t.dataset.atom),
      say: document.querySelector('.lk-story-say')?.textContent || '',
      filled: [...document.querySelectorAll('.lk-story-seg')].map((s) => s.dataset.filled),
    }));
    assert.equal(second.count, '2 / 4');
    assert.deepEqual(second.focus, ['f'], 'el paso 2 resalta el átomo f por su id');
    assert.match(second.say, /Qué es/);
    assert.match(second.say, /Para qué se usa/);
    assert.match(second.say, /En el ejemplo/);
    assert.deepEqual(second.filled, ['true', 'true', 'false', 'false'], 'la barra se llena hasta el paso actual');
    // Reproducir arranca y se puede pausar: el botón lo dice.
    await view.getByRole('button', { name: 'Reproducir los pasos' }).click();
    await view.waitForTimeout(80);
    assert.match(await view.locator('[aria-label="Reproducir los pasos"]').textContent(), /Pausa/);
    await view.getByRole('button', { name: 'Reproducir los pasos' }).click();
    await view.waitForTimeout(80);
    assert.match(await view.locator('[aria-label="Reproducir los pasos"]').textContent(), /Reproducir/);
  } finally {
    await browser.close();
  }
});

const DERIVATION = {
  kind: 'derivation',
  title: 'Resolver x + 2 = 3',
  viewBox: '0 0 360 250',
  steps: [
    { title: 'La ecuación', equation: { size: 22, atoms: [{ t: 'x', id: 'x' }, { t: ' + ', id: 'plus' }, { t: '2', id: 'two' }, { t: ' = ', id: 'eq' }, { t: '3', id: 'three' }] }, focus: ['two'], narrator: 'Tengo «x + 2 = 3».', stage: { scene: { actors: [{ id: 'x', x: 20, y: 150, w: 44, h: 40, label: 'x', tone: 'blue', tag: 'incógnita' }, { id: 'two', x: 140, y: 150, w: 44, h: 40, label: '2', tone: 'amber', tag: 'el 2' }] } } },
    { title: 'El 2 pasa al otro lado', equation: { size: 22, atoms: [{ t: 'x', id: 'x' }, { t: ' = ', id: 'eq' }, { t: '3', id: 'three' }, { t: ' − ', id: 'minus' }, { t: '2', id: 'two' }] }, focus: ['minus', 'two'], narrator: 'El «2» pasa restando.', stage: { scene: { actors: [{ id: 'two-old', x: 140, y: 40, w: 44, h: 40, label: '2', tone: 'slate', state: 'faded', tag: 'estaba sumando' }, { id: 'x', x: 20, y: 160, w: 44, h: 40, label: 'x', tone: 'blue' }, { id: 'two', x: 230, y: 160, w: 44, h: 40, label: '2', tone: 'amber' }], moves: [{ from: 'two-old', to: 'two', verb: 'pasa restando', tone: 'amber' }] } } },
    { title: 'La cuenta', equation: { size: 22, atoms: [{ t: 'x', id: 'x' }, { t: ' = ', id: 'eq' }, { t: '1', id: 'one' }] }, focus: ['one'], narrator: '«x = 1».', stage: { scene: { actors: [{ id: 'x', x: 40, y: 170, w: 44, h: 40, label: 'x', tone: 'blue' }, { id: 'one', x: 160, y: 170, w: 44, h: 40, label: '1', tone: 'green' }], marks: [{ kind: 'ok', actor: 'one' }] } } },
  ],
};

test('el ejercicio se deriva: la flecha empieza y termina en las cajas medidas del término', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open(page(DERIVATION));
  try {
    assert.deepEqual(errors, []);
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.waitForTimeout(80);
    const seen = await view.evaluate(() => {
      const step = [...document.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const move = step.querySelector('[data-move-from]');
      const path = move.querySelector('[data-move-path]');
      const from = step.querySelector('[data-actor="two-old"]').getBoundingClientRect();
      const to = step.querySelector('[data-actor="two"]').getBoundingClientRect();
      const m = path.getScreenCTM();
      const at = (len) => { const p = path.getPointAtLength(len); return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }; };
      const gap = (p, b) => Math.hypot(Math.max(b.x - p.x, 0, p.x - b.right), Math.max(b.y - p.y, 0, p.y - b.bottom));
      return {
        start: gap(at(0), from),
        end: gap(at(path.getTotalLength()), to),
        verb: move.querySelector('[data-move-label]').textContent,
        dashed: path.getAttribute('stroke-dasharray'),
        faded: step.querySelector('[data-actor="two-old"]').dataset.faded,
        tag: step.querySelector('[data-tag-to="two-old"]')?.textContent,
        mark: step.querySelector('[data-mark-kind="ok"]')?.textContent,
      };
    });
    assert.ok(seen.start <= 3, `la flecha no empieza en la caja del 2 anterior: ${seen.start.toFixed(1)} px`);
    assert.ok(seen.end <= 3, `la flecha no termina en la caja del 2 nuevo: ${seen.end.toFixed(1)} px`);
    assert.equal(seen.verb, 'pasa restando');
    assert.match(seen.dashed, /6 5/, 'la flecha del movimiento es discontinua');
    assert.equal(seen.faded, '1', 'el 2 que ya no vale se dibuja en gris');
    assert.match(seen.tag, /estaba sumando/);
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.waitForTimeout(80);
    const last = await view.evaluate(() => ({
      mark: document.querySelector('[data-mark-kind="ok"]')?.textContent,
      count: document.querySelector('.lk-story-count').textContent,
    }));
    assert.match(last.mark, /✓/, 'el último paso marca la respuesta');
    assert.equal(last.count, '3 / 3');
  } finally {
    await browser.close();
  }
});

test('un icono declarado dibuja tinta dentro del lienzo', { skip: SKIP }, async () => {
  const spec = {
    kind: 'formula', title: 'La petición', viewBox: '0 0 360 200',
    formula: { size: 18, atoms: [{ t: 'f', id: 'f' }] },
    steps: [
      { title: 'La petición', focus: [], narrator: 'La petición llega al servidor.', stage: { scene: { icons: [{ kind: 'doc', id: 'peticion', x: 8, y: 80, size: 56, tone: 'blue' }], labels: [{ x: 300, y: 180, text: 'el servidor', size: 15 }] } } },
      { title: 'El servidor', focus: ['f'], narrator: 'El servidor responde.', stage: { scene: { icons: [{ kind: 'gear', id: 'servidor', x: 352, y: 80, size: 56, tone: 'green' }], labels: [{ x: 60, y: 180, text: 'la petición', size: 15 }] } } },
      { title: 'La respuesta', focus: [], narrator: 'La respuesta vuelve.', stage: { scene: { labels: [{ x: 180, y: 120, text: 'la respuesta', size: 15 }] } } },
    ],
  };
  const { browser, view, errors } = await open(page(spec));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const vb = svg.viewBox.baseVal;
      return [...svg.querySelectorAll('[data-icon]')].map((g) => {
        const b = g.getBBox();
        const inked = [...g.querySelectorAll('circle, path, rect')].some((el) => {
          const fill = el.getAttribute('fill');
          const stroke = el.getAttribute('stroke');
          return (fill && fill !== '#ffffff' && fill !== 'none') || (stroke && stroke !== '#ffffff' && stroke !== 'none');
        });
        return { kind: g.dataset.icon, w: b.width, h: b.height, inside: b.x >= vb.x - 1 && b.y >= vb.y - 1 && b.x + b.width <= vb.x + vb.width + 1 && b.y + b.height <= vb.y + vb.height + 1, inked };
      });
    });
    assert.equal(seen.length, 2, 'los dos iconos declarados se dibujan');
    for (const icon of seen) {
      assert.ok(icon.w > 10 && icon.h > 10, `el icono ${icon.kind} no dibuja tinta`);
      assert.equal(icon.inside, true, `el icono ${icon.kind} queda fuera del lienzo`);
      assert.equal(icon.inked, true, `el icono ${icon.kind} no tiene tinta`);
    }
  } finally {
    await browser.close();
  }
});

// El resultado se enmarca UNA vez: la caja del actor ya tiene su borde, y la marca de
// «correcto» lo engrosa en vez de dibujar un segundo marco por fuera. El ✓ se queda
// dentro del lienzo aunque el actor llegue casi al borde derecho: en la fórmula
// gaussiana el ✓ se dibujaba a 10 unidades del borde de un actor de 346 y el SVG lo
// recortaba, y solo se veía una astilla.
test('el resultado lleva un solo marco y su ✓ queda dentro del lienzo', { skip: SKIP }, async () => {
  const spec = {
    kind: 'formula', title: 'El resultado', viewBox: '0 0 360 250',
    formula: { size: 18, atoms: [{ t: 'f', id: 'f' }] },
    steps: [
      { title: 'Uno', focus: [], narrator: 'Uno.', stage: { scene: { labels: [{ x: 180, y: 120, text: 'uno', size: 15 }] } } },
      { title: 'Dos', focus: ['f'], narrator: 'Dos.', stage: { scene: { labels: [{ x: 180, y: 120, text: 'dos', size: 15 }] } } },
      { title: 'El resultado', focus: [], narrator: 'El resultado.', stage: { scene: { actors: [{ id: 'value', x: 214, y: 50, w: 132, h: 30, label: 'f(184) ≈ 0,000 65', size: 14, tone: 'green', tag: 'el resultado' }], marks: [{ kind: 'ok', actor: 'value' }] } } },
    ],
  };
  const { browser, view, errors } = await open(page(spec));
  try {
    assert.deepEqual(errors, []);
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.waitForTimeout(100);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const vb = svg.viewBox.baseVal;
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const actor = step.querySelector('[data-actor="value"]');
      const own = actor.querySelector('rect').getBBox();
      // Every rect that wraps the actor's box is a frame: the actor's own and nothing else.
      const frames = [...step.querySelectorAll('rect')].filter((r) => {
        const b = r.getBBox();
        return b.x <= own.x + 0.5 && b.y <= own.y + 0.5 && b.x + b.width >= own.x + own.width - 0.5 && b.y + b.height >= own.y + own.height - 0.5;
      }).length;
      const check = step.querySelector('[data-mark-kind="ok"] text');
      const c = check.getBBox();
      return {
        frames, text: check.textContent,
        air: Math.min(c.x - vb.x, c.y - vb.y, vb.x + vb.width - (c.x + c.width), vb.y + vb.height - (c.y + c.height)),
        weight: Number(actor.querySelector('rect').getAttribute('stroke-width')),
        overlapsActor: !(c.x + c.width <= own.x || c.x >= own.x + own.width || c.y + c.height <= own.y || c.y >= own.y + own.height),
      };
    });
    assert.equal(seen.frames, 1, `el resultado tiene ${seen.frames} marcos: se dibuja uno solo`);
    assert.equal(seen.text, '✓');
    assert.ok(seen.air >= 12, `el ✓ queda a ${seen.air.toFixed(1)}u del borde del lienzo (mínimo 12)`);
    assert.equal(seen.overlapsActor, false, 'el ✓ no se encima sobre el texto del resultado');
    assert.ok(seen.weight >= 3, `el marco único se engrosa: ${seen.weight}`);
  } finally {
    await browser.close();
  }
});
