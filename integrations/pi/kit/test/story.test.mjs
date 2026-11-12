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

// ── Actors with state and props (#217) ──────────────────────────────────────
// A concept is an actor with a name tag. Its state shows by colour and mark —
// active (coloured), faded (no longer valid, grey), invalid (struck through, ✗) —
// and props carry meaning: a value in a small chest, an eye that reads, a pencil
// that writes. Every piece is anchored by id and placed from the boxes the browser
// drew, never from a coordinate the tutor guessed.
const one = (scene, viewBox = '0 0 360 250') => ({
  kind: 'formula', title: 'Actores', viewBox,
  formula: { size: 18, atoms: [{ t: 'a', id: 'a' }] },
  steps: [{ title: 'Uno', focus: [], narrator: 'Uno.', stage: { scene } }],
});

const ROBOTS = [
  { id: 's1', icon: 'robot', x: 70, y: 150, size: 56, tone: 'blue', tag: 's1' },
  { id: 's2', icon: 'robot', x: 180, y: 150, size: 56, tone: 'green', state: 'faded', tag: 's2' },
  { id: 's3', icon: 'robot', x: 290, y: 150, size: 56, tone: 'amber', state: 'invalid', tag: 's3' },
];

test('un actor es activo, apagado o inválido: el estado se ve por color y marca', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open(page(one({ actors: ROBOTS })));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const vb = svg.viewBox.baseVal;
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      return ['s1', 's2', 's3'].map((id) => {
        const actor = step.querySelector(`[data-actor="${id}"]`);
        const body = actor.querySelector('circle');
        const strike = actor.querySelector('[data-strike]');
        const mark = step.querySelector(`[data-state-mark="${id}"]`);
        const a = actor.getBBox();
        const m = mark?.getBBox();
        return {
          id, state: actor.dataset.state, stroke: (body.getAttribute('stroke') || '').toLowerCase(),
          strike: strike ? strike.getBBox().width : 0,
          mark: mark?.textContent.trim() ?? null,
          markAir: m ? Math.min(m.x - vb.x, m.y - vb.y, vb.x + vb.width - (m.x + m.width), vb.y + vb.height - (m.y + m.height)) : null,
          markOnActor: m ? !(m.x + m.width <= a.x || m.x >= a.x + a.width || m.y + m.height <= a.y || m.y >= a.y + a.height) : null,
          tagTone: step.querySelector(`[data-tag-to="${id}"]`)?.dataset.tagTone,
        };
      });
    });
    const [active, faded, invalid] = seen;
    assert.equal(active.state, 'active');
    assert.equal(faded.state, 'faded');
    assert.equal(invalid.state, 'invalid');
    assert.equal(active.stroke, '#004276', 'el actor activo lleva el color de su tono');
    assert.equal(faded.stroke, '#5a7481', 'el actor apagado se dibuja en gris');
    assert.equal(invalid.stroke, '#5a7481', 'el actor inválido también va en gris');
    assert.equal(active.strike, 0, 'el actor activo no se tacha');
    assert.equal(faded.strike, 0, 'el actor apagado no se tacha: ya no vale, no es un error');
    assert.ok(invalid.strike >= 56, `el actor inválido se tacha de lado a lado: ${invalid.strike}`);
    assert.equal(active.mark, null);
    assert.equal(faded.mark, null);
    assert.equal(invalid.mark, '✗', 'el actor inválido lleva su ✗');
    assert.ok(invalid.markAir >= 12, `el ✗ queda a ${invalid.markAir}u del borde del lienzo`);
    assert.equal(invalid.markOnActor, false, 'el ✗ no se encima sobre el actor');
    assert.equal(active.tagTone, 'blue');
    assert.equal(faded.tagTone, 'slate', 'el nombre de un actor apagado también va en gris');
    assert.equal(invalid.tagTone, 'slate');
  } finally {
    await browser.close();
  }
});

test('un valor, una lectura y una escritura se anclan a su actor y caben en el lienzo', { skip: SKIP }, async () => {
  const scene = {
    actors: [{ id: 's1', icon: 'robot', x: 180, y: 140, size: 56, tone: 'blue', tag: 's1' }],
    props: [
      { id: 'valor', kind: 'value', on: 's1', side: 'right', label: '"hola"', tone: 'green' },
      { id: 'leer', kind: 'read', on: 's1', side: 'left', tone: 'blue' },
      { id: 'escribir', kind: 'write', on: 's1', side: 'below', label: 'mut', tone: 'amber' },
    ],
  };
  const { browser, view, errors } = await open(page(one(scene)));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const vb = svg.viewBox.baseVal;
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const box = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const air = (b) => Math.min(b.x - vb.x, b.y - vb.y, vb.x + vb.width - (b.x + b.w), vb.y + vb.height - (b.y + b.h));
      const touch = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
      const gap = (a, b) => Math.hypot(Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w)), Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h)));
      const actor = box(step.querySelector('[data-actor="s1"]'));
      const tag = step.querySelector('[data-tag-to="s1"]');
      const props = [...step.querySelectorAll('[data-prop-id]')].map((g) => ({
        id: g.dataset.propId, kind: g.dataset.propKind, b: box(g),
        ink: g.querySelectorAll('path, rect, circle').length,
        label: g.querySelector('text')?.textContent ?? null,
        anchored: gap(box(g), actor),
        onActor: touch(box(g), actor),
        onTag: touch(box(g), box(tag)),
      }));
      return {
        actor, props: props.map((p) => ({ ...p, air: air(p.b), clash: props.filter((o) => o.id !== p.id && touch(o.b, p.b)).map((o) => o.id) })),
      };
    });
    assert.deepEqual(seen.props.map((p) => p.id), ['valor', 'leer', 'escribir']);
    assert.deepEqual(seen.props.map((p) => p.kind), ['value', 'read', 'write']);
    for (const p of seen.props) {
      assert.ok(p.ink >= 2, `la pieza ${p.id} no dibuja tinta`);
      assert.ok(p.air >= 12, `la pieza ${p.id} queda a ${p.air.toFixed(1)}u del borde del lienzo (mínimo 12)`);
      assert.ok(p.anchored <= 40, `la pieza ${p.id} queda a ${p.anchored.toFixed(0)}u de su actor`);
      assert.equal(p.onActor, false, `la pieza ${p.id} se encima sobre su actor`);
      assert.equal(p.onTag, false, `la pieza ${p.id} se encima sobre el nombre del actor`);
      assert.deepEqual(p.clash, [], `la pieza ${p.id} se encima sobre ${p.clash}`);
    }
    assert.equal(seen.props[0].label, '"hola"', 'el valor muestra su etiqueta');
    assert.ok(seen.props[0].b.x > seen.actor.x + seen.actor.w, 'el valor va a la derecha del actor, como se declaró');
    assert.ok(seen.props[1].b.x + seen.props[1].b.w < seen.actor.x, 'la lectura va a la izquierda');
    assert.ok(seen.props[2].b.y > seen.actor.y + seen.actor.h, 'la escritura va debajo');
  } finally {
    await browser.close();
  }
});

test('una pieza sin lugar en su lado se pone en otro, nunca fuera del lienzo ni sobre otra', { skip: SKIP }, async () => {
  const scene = {
    actors: [{ id: 's1', icon: 'robot', x: 44, y: 130, size: 56, tone: 'blue', tag: 's1' }],
    props: [{ id: 'valor', kind: 'value', on: 's1', side: 'left', label: '"hola"', tone: 'green' }],
  };
  const { browser, view, errors } = await open(page(one(scene)));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const vb = svg.viewBox.baseVal;
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const b = step.querySelector('[data-prop-id="valor"]').getBBox();
      const a = step.querySelector('[data-actor="s1"]').getBBox();
      return {
        air: Math.min(b.x - vb.x, b.y - vb.y, vb.x + vb.width - (b.x + b.width), vb.y + vb.height - (b.y + b.height)),
        onActor: !(b.x + b.width <= a.x || a.x + a.width <= b.x || b.y + b.height <= a.y || a.y + a.height <= b.y),
      };
    });
    assert.ok(seen.air >= 12, `la pieza quedó a ${seen.air.toFixed(1)}u del borde: se dibujó donde no cabe`);
    assert.equal(seen.onActor, false, 'la pieza que no cabe a la izquierda cayó sobre su actor');
  } finally {
    await browser.close();
  }
});

test('un ✓ o un ✗ entre dos actores cae en el hueco que los separa', { skip: SKIP }, async () => {
  const scene = {
    actors: [
      { id: 'a', icon: 'robot', x: 60, y: 150, size: 56, tone: 'blue', tag: 'a' },
      { id: 'b', icon: 'robot', x: 300, y: 150, size: 56, tone: 'green', tag: 'b' },
    ],
    marks: [{ kind: 'no', between: ['a', 'b'] }],
  };
  const { browser, view, errors } = await open(page(one(scene)));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const a = step.querySelector('[data-actor="a"]').getBBox();
      const b = step.querySelector('[data-actor="b"]').getBBox();
      const glyph = step.querySelector('[data-mark-kind="no"] text');
      const g = glyph.getBBox();
      return { a: a.x + a.width, b: b.x, gx: g.x, gr: g.x + g.width, text: glyph.textContent, fill: glyph.getAttribute('fill') };
    });
    assert.equal(seen.text, '✗');
    assert.ok(seen.gx >= seen.a && seen.gr <= seen.b, `el ✗ no cae entre los dos actores: ${seen.a}–${seen.b} y el ✗ en ${seen.gx.toFixed(0)}–${seen.gr.toFixed(0)}`);
    assert.equal(seen.fill.toLowerCase(), '#cc405c', 'el ✗ es del color del error');
  } finally {
    await browser.close();
  }
});

test('la flecha de un movimiento puede salir de una pieza, no solo de un actor', { skip: SKIP }, async () => {
  const scene = {
    actors: [
      { id: 's1', icon: 'robot', x: 60, y: 150, size: 56, tone: 'blue', tag: 's1' },
      { id: 's2', icon: 'robot', x: 300, y: 150, size: 56, tone: 'green', tag: 's2' },
    ],
    props: [{ id: 'valor', kind: 'value', on: 's1', side: 'right', label: '"hola"', tone: 'green' }],
    moves: [{ from: 'valor', to: 's2', verb: 'se mueve', tone: 'amber' }],
  };
  const { browser, view, errors } = await open(page(one(scene)));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const step = [...document.querySelectorAll('lk-story [data-step]')].find((g) => g.style.display !== 'none');
      const path = step.querySelector('[data-move-path]');
      const start = path.getPointAtLength(0);
      const b = step.querySelector('[data-prop-id="valor"]').getBBox();
      const end = path.getPointAtLength(path.getTotalLength());
      const near = path.getPointAtLength(path.getTotalLength() - 6);
      return { d: path.getAttribute('d'), rise: Math.abs(end.y - near.y), run: Math.abs(end.x - near.x), gap: Math.hypot(Math.max(b.x - start.x, 0, start.x - (b.x + b.width)), Math.max(b.y - start.y, 0, start.y - (b.y + b.height))) };
    });
    assert.ok(seen.d && seen.d.startsWith('M'), 'la flecha no se dibujó: no encontró la pieza de la que sale');
    assert.ok(seen.gap <= 3, `la flecha empieza a ${seen.gap.toFixed(1)}u de la pieza`);
    // Dos piezas una al lado de la otra se unen en horizontal: la punta entra de lado,
    // no cae ni sube sobre el actor.
    assert.ok(seen.rise < seen.run * 0.2, `la punta de una flecha lateral entra torcida: sube ${seen.rise.toFixed(1)} por ${seen.run.toFixed(1)}`);
  } finally {
    await browser.close();
  }
});

test('una pieza que nombra un actor que no existe se declara, no se dibuja al aire', { skip: SKIP }, async () => {
  const scene = {
    actors: [{ id: 's1', icon: 'robot', x: 180, y: 140, size: 56, tone: 'blue' }],
    props: [{ id: 'valor', kind: 'value', on: 'nadie', label: '"hola"' }],
  };
  const { browser, view, errors } = await open(page(one(scene)));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const step = [...document.querySelectorAll('lk-story [data-step]')].find((g) => g.style.display !== 'none');
      const prop = step.querySelector('[data-prop-id="valor"]');
      return { missing: prop.dataset.propMissing, ink: prop.querySelectorAll('path, rect, circle, text').length };
    });
    assert.equal(seen.missing, 'nadie', 'la pieza declara el actor que no encontró');
    assert.equal(seen.ink, 0, 'la pieza sin actor no dibuja nada');
  } finally {
    await browser.close();
  }
});

// A value that is freed is not a chest that went grey: it is drawn dashed and keeps
// its word («liberado»), and the ✓ that approves it sits on that value, never in the
// air between two actors (the reviewer could not tell what the ✓ approved).
test('un valor liberado se dibuja punteado y gris, y su ✓ queda pegado a él', { skip: SKIP }, async () => {
  const scene = {
    paths: [{ d: 'M 44 204 L 316 204', tone: 'slate', width: 2, arrow: false }],
    actors: [
      { id: 's1', icon: 'robot', x: 80, y: 150, size: 56, tone: 'blue', state: 'invalid', tag: 's1' },
      { id: 's2', icon: 'robot', x: 280, y: 150, size: 56, tone: 'amber', state: 'faded', tag: 's2' },
    ],
    props: [{ id: 'valor', kind: 'value', on: 's2', side: 'left', label: 'liberado', tone: 'green', state: 'freed' }],
    marks: [{ kind: 'ok', actor: 'valor' }],
  };
  const { browser, view, errors } = await open(page(one(scene, '0 60 360 190')));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const vb = svg.viewBox.baseVal;
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const prop = step.querySelector('[data-prop-id="valor"]');
      const chest = prop.querySelector('rect');
      const chestBox = chest.getBBox();
      const b = prop.getBBox();
      const glyph = step.querySelector('[data-mark-kind="ok"] text');
      const g = glyph.getBBox();
      const touch = (a, c) => !(a.x + a.width <= c.x || c.x + c.width <= a.x || a.y + a.height <= c.y || c.y + c.height <= a.y);
      const gap = Math.hypot(Math.max(b.x - (g.x + g.width), 0, g.x - (b.x + b.width)), Math.max(b.y - (g.y + g.height), 0, g.y - (b.y + b.height)));
      return {
        under: g.y >= chestBox.y + chestBox.height - 1 && Math.abs((g.x + g.width / 2) - (chestBox.x + chestBox.width / 2)) <= 6,
        onStroke: [...step.querySelectorAll('[data-path]')].some((n) => touch(g, n.getBBox())),
        state: prop.dataset.propState,
        dash: chest.getAttribute('stroke-dasharray'),
        stroke: (chest.getAttribute('stroke') || '').toLowerCase(),
        weight: Number(chest.getAttribute('stroke-width')),
        label: prop.querySelector('text')?.textContent,
        gap, onPiece: [...step.querySelectorAll('[data-actor], [data-prop-id]')].some((n) => touch(g, n.getBBox())),
        air: Math.min(g.x - vb.x, g.y - vb.y, vb.x + vb.width - (g.x + g.width), vb.y + vb.height - (g.y + g.height)),
        corner: step.querySelectorAll('[data-state-mark] text').length,
      };
    });
    assert.equal(seen.state, 'freed');
    assert.ok(seen.dash, 'el valor liberado se dibuja punteado');
    assert.equal(seen.stroke, '#5a7481', 'el valor liberado va en gris');
    assert.ok(seen.weight < 3, `el ✓ no engrosa el marco del valor: ${seen.weight}`);
    assert.equal(seen.label, 'liberado', 'el valor liberado conserva su palabra');
    assert.ok(seen.gap <= 16, `el ✓ queda a ${seen.gap.toFixed(0)}u del valor que aprueba`);
    assert.equal(seen.onPiece, false, 'el ✓ no se encima sobre una pieza');
    assert.ok(seen.under, 'el ✓ queda justo debajo del cofre, centrado en él');
    assert.equal(seen.onStroke, false, 'el ✓ no se dibuja encima de un trazo de la escena');
    assert.ok(seen.air >= 12, `el ✓ queda a ${seen.air.toFixed(0)}u del borde`);
    assert.equal(seen.corner, 1, 'el actor inválido conserva su ✗; el ✓ no es otra marca de esquina');
  } finally {
    await browser.close();
  }
});

// ── Actor characters (#245) ─────────────────────────────────────────────────
// Un actor es un personaje con su nombre, no un rectángulo con una etiqueta. Los
// personajes son dibujos propios del kit —cilindro de base de datos, fila, sesión,
// candado, usuario, servidor, proceso, archivo, paquete y el robot—, legibles a
// 14 px y con el mismo trazo fino que el robot.
const PERSONAJES = ['database', 'row', 'session', 'lock', 'user', 'server', 'process', 'file', 'packet', 'robot'];

test('cada personaje se dibuja con `kind` y lleva su nombre, sin texto dentro', { skip: SKIP }, async () => {
  for (const kind of PERSONAJES) {
    const scene = { actors: [{ id: 'p', kind, x: 180, y: 140, size: 64, tone: 'blue', tag: kind }] };
    const { browser, view, errors } = await open(page(one(scene)));
    try {
      assert.deepEqual(errors, [], `${kind}: la escena no dibuja`);
      const seen = await view.evaluate(() => {
        const svg = document.querySelector('lk-story svg');
        const vb = svg.viewBox.baseVal;
        const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
        const actor = step.querySelector('[data-actor="p"]');
        const b = actor.getBBox();
        const tag = step.querySelector('[data-tag-to="p"]');
        return {
          ink: actor.querySelectorAll('path, rect, circle, ellipse').length,
          texts: [...actor.querySelectorAll('text')].map((t) => t.textContent.trim()).filter(Boolean),
          air: Math.min(b.x - vb.x, b.y - vb.y, vb.x + vb.width - (b.x + b.width), vb.y + vb.height - (b.y + b.height)),
          tag: tag?.dataset.tagText ?? null,
        };
      });
      assert.ok(seen.ink >= 2, `${kind}: el personaje dibuja al menos dos formas (fueron ${seen.ink})`);
      assert.deepEqual(seen.texts, [], `${kind}: un personaje no escribe su nombre dentro del dibujo`);
      assert.ok(seen.air >= 4, `${kind}: el personaje queda a ${seen.air.toFixed(1)}u del borde del lienzo`);
      assert.equal(seen.tag, kind, `${kind}: el nombre va en su ficha con punta`);
    } finally {
      await browser.close();
    }
  }
});

// El estado de un actor se ve: bloqueado lleva marco a trazos y su candado, en
// espera lleva marco a trazos y se apaga, y ninguno de los dos se tacha.
test('un actor bloqueado o en espera se distingue del activo y del inválido', { skip: SKIP }, async () => {
  const scene = {
    actors: [
      { id: 'libre', kind: 'row', x: 60, y: 150, size: 56, tone: 'blue', tag: 'libre' },
      { id: 'bloqueado', kind: 'row', x: 180, y: 150, size: 56, tone: 'blue', state: 'locked', tag: 'bloqueado' },
      { id: 'espera', kind: 'row', x: 300, y: 150, size: 56, tone: 'amber', state: 'waiting', tag: 'espera' },
    ],
  };
  const { browser, view, errors } = await open(page(one(scene, '0 0 360 250')));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      return ['libre', 'bloqueado', 'espera'].map((id) => {
        const actor = step.querySelector(`[data-actor="${id}"]`);
        const body = actor.querySelector('rect');
        return {
          id,
          state: actor.dataset.state,
          stroke: (body.getAttribute('stroke') || '').toLowerCase(),
          frame: actor.querySelector('[data-frame]')?.dataset.frame ?? null,
          lock: Boolean(actor.querySelector('[data-lock]')),
          strike: Boolean(actor.querySelector('[data-strike]')),
          tagTone: step.querySelector(`[data-tag-to="${id}"]`)?.dataset.tagTone,
        };
      });
    });
    const [free, locked, waiting] = seen;
    assert.equal(free.state, 'active');
    assert.equal(free.frame, null, 'el actor activo no lleva marco a trazos');
    assert.equal(free.lock, false);
    assert.equal(locked.state, 'locked');
    assert.equal(locked.stroke, '#004276', 'el actor bloqueado conserva el color de su tono');
    assert.equal(locked.frame, 'locked', 'el actor bloqueado lleva marco a trazos');
    assert.equal(locked.lock, true, 'el actor bloqueado lleva su candado');
    assert.equal(locked.strike, false, 'un bloqueo no es un error: no se tacha');
    assert.equal(locked.tagTone, 'blue', 'el nombre del bloqueado conserva su tono');
    assert.equal(waiting.state, 'waiting');
    assert.equal(waiting.stroke, '#5a7481', 'el actor en espera se apaga');
    assert.equal(waiting.frame, 'waiting', 'el actor en espera lleva marco a trazos');
    assert.equal(waiting.lock, false);
    assert.equal(waiting.strike, false, 'esperar no es un error: no se tacha');
    assert.equal(waiting.tagTone, 'slate', 'el nombre del que espera va en gris');
  } finally {
    await browser.close();
  }
});

// ── One row, one baseline; one mark, one owner (#245) ───────────────────────
// Un actor bloqueado dibuja marco a trazos y candado, y esas dos piezas agrandaban
// su caja medida: su ficha subía ~30 unidades y su cofre bajaba ~22, así que la
// fila se veía torcida y los nombres quedaban a distinta altura. La fila se tiende
// desde el marco más grande —el del estado incluido—, no desde cada actor.
const ROW_SCENE = {
  actors: [
    { id: 'c10', kind: 'row', x: 90, y: 120, size: 64, tone: 'blue', state: 'locked', tag: 'Cuenta 10' },
    { id: 'c20', kind: 'row', x: 270, y: 120, size: 64, tone: 'amber', tag: 'Cuenta 20' },
  ],
  props: [
    { id: 'saldo10', kind: 'value', on: 'c10', side: 'below', label: '800', tone: 'blue' },
    { id: 'saldo20', kind: 'value', on: 'c20', side: 'below', label: '1500', tone: 'amber' },
  ],
};

test('los actores de una fila comparten línea base aunque uno esté bloqueado', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open(page(one(ROW_SCENE, '0 0 360 260')));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const centre = (el) => { const b = el.getBBox(); return { x: +(b.x + b.width / 2).toFixed(1), y: +(b.y + b.height / 2).toFixed(1), top: +b.y.toFixed(1) }; };
      const figures = [...step.querySelectorAll('[data-actor]')].map((a) => ({ id: a.dataset.actor, ...centre(a.querySelector('[data-figure]') || a) }));
      const tags = [...step.querySelectorAll('[data-tag-to]')].map((t) => ({ id: t.dataset.tagTo, ...centre(t) }));
      const props = [...step.querySelectorAll('[data-prop-id]')].map((p) => ({ id: p.dataset.propId, top: +p.getBBox().y.toFixed(1) }));
      return { figures, tags, props };
    });
    const spread = (list, key) => Math.max(...list.map((x) => x[key])) - Math.min(...list.map((x) => x[key]));
    assert.equal(seen.figures.length, 2);
    assert.ok(spread(seen.figures, 'y') <= 1, `los personajes de la fila no comparten centro: ${JSON.stringify(seen.figures)}`);
    assert.ok(spread(seen.tags, 'y') <= 1, `las fichas de la fila quedan a distinta altura: ${JSON.stringify(seen.tags)}`);
    assert.ok(spread(seen.props, 'top') <= 1, `los cofres de la fila quedan a distinta altura: ${JSON.stringify(seen.props)}`);
  } finally {
    await browser.close();
  }
});

// Una marca con nombre se pega a su dueño: debajo de su columna, o a su lado si
// abajo no cabe. Centrada en el hueco entre dos actores no aprueba a ninguno.
test('una marca con nombre se pega a su dueño, no al hueco', { skip: SKIP }, async () => {
  // Las dos filas bloqueadas: los dos cofres caen a la misma altura y el hueco
  // entre ellos es el único sitio que le queda a una marca que se centre mal.
  const scene = {
    ...ROW_SCENE,
    actors: ROW_SCENE.actors.map((a) => ({ ...a, state: 'locked' })),
    marks: [{ kind: 'ok', actor: 'saldo20', label: 'acreditado' }],
  };
  const { browser, view, errors } = await open(page(one(scene, '0 0 360 260')));
  try {
    assert.deepEqual(errors, []);
    const seen = await view.evaluate(() => {
      const svg = document.querySelector('lk-story svg');
      const step = [...svg.querySelectorAll('[data-step]')].find((g) => g.style.display !== 'none');
      const centre = (el) => { const b = el.getBBox(); return +(b.x + b.width / 2).toFixed(1); };
      const mark = step.querySelector('[data-mark-kind]');
      return {
        mark: centre(mark),
        owner: centre(step.querySelector('[data-prop-id="saldo20"]')),
        other: centre(step.querySelector('[data-prop-id="saldo10"]')),
      };
    });
    assert.ok(Math.abs(seen.mark - seen.owner) <= 6, `la marca queda a ${Math.abs(seen.mark - seen.owner).toFixed(0)}u de su dueño (${seen.mark} vs ${seen.owner})`);
    assert.ok(Math.abs(seen.mark - seen.owner) < Math.abs(seen.mark - seen.other), 'la marca está más cerca del actor que no aprueba');
  } finally {
    await browser.close();
  }
});
