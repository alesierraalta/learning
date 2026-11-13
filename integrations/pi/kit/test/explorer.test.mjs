// #228 el explorador de un escenario: un mapa del sistema cuyo foco sigue a los
// pasos. Estos casos comprueban lo que un `assert` sobre el JSON no puede ver: que
// el paso activo enfoque a sus actores, que lo que viaja se lea en la franja vacía
// del mapa sin tapar una palabra, que el registro se llene al avanzar y se vacíe al
// reiniciar, y que la medida del lector (la misma que corren `scene-gate` y
// `scene-lint`) rechace las cuatro cosas que el explorador promete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { measurePiece } from '../piece-measure.mjs';
import { measurePieces } from '../piece-gate.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = ['light', 'dark', 'black'];

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
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se puede dibujar el explorador';

// El ejemplo aprobado: es el que se mira antes de publicar.
const EXAMPLE = readFileSync(join(KIT, 'examples', 'abrir-una-pagina.md'), 'utf8');
const EXAMPLE_BLOCK = /<lk-explorer[\s\S]*?<\/lk-explorer>/.exec(EXAMPLE)[0];

// Un escenario mínimo, para las pruebas de la medida: dos actores y dos pasos.
const SMALL = {
  title: 'Dos sistemas',
  rows: [['a', 'b']],
  actors: [
    { id: 'a', name: 'Emisor', detail: '10.0.0.1', kind: 'person', tone: 'blue' },
    { id: 'b', name: 'Receptor', detail: '10.0.0.2', kind: 'doc', tone: 'green' },
  ],
  links: [{ from: 'a', to: 'b' }],
  views: ['map', 'sequence'],
  steps: [
    { title: 'El saludo', subtitle: 'pregunta si está', focus: ['a', 'b'], travels: { from: 'a', to: 'b', label: 'HOLA', kind: 'query' }, details: { text: 'El emisor saluda.', rows: [['QUIÉN', 'emisor']] }, log: { from: 'a', to: 'b', kind: 'query', info: 'Hola' } },
    { title: 'La respuesta', subtitle: 'contesta que sí', focus: ['b', 'a'], travels: { from: 'b', to: 'a', label: 'SÍ', kind: 'answer' }, details: { text: 'El receptor contesta.', rows: [['QUIÉN', 'receptor']] }, log: { from: 'b', to: 'a', kind: 'answer', info: 'Sí' } },
  ],
};

function pageFor(block, { wrap = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-explorer-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css"><script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
<style>/* La regla del lector que se filtraba a las piezas (view/app.css): el texto de una
   pieza no se justifica aunque viva dentro de la prosa. */
.prose p { text-align: justify; hyphens: auto; }</style>
</head><body><main style="max-width:700px;margin:0 auto">${wrap ? `<div class="prose">${block}</div>` : block}</main></body></html>`);
  return 'file://' + join(dir, 'p.html');
}

async function open(block, { width = 1000, theme = 'light', ready = '.lk-p' } = {}) {
  const browser = await PLAYWRIGHT.chromium.launch();
  const view = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  view.on('pageerror', (error) => errors.push(String(error.message)));
  try {
    await view.goto(pageFor(block));
    await view.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await view.waitForSelector(ready, { timeout: 5000 });
    await view.evaluate(() => document.fonts.ready);
    await view.waitForTimeout(150);
  } catch (error) { await browser.close(); throw error; }
  return { browser, view, errors };
}

const blockOf = (spec) => `<lk-explorer><script type="application/json">${JSON.stringify(spec)}</script></lk-explorer>`;
const step = (view, n) => view.getByRole('button', { name: 'Paso siguiente' }).click({ clickCount: 1 }).then(() => view.waitForTimeout(60)).then(() => n);

test('el explorador dibuja a cada actor una vez, con su nombre y el detalle que lo identifica', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open(EXAMPLE_BLOCK);
  try {
    const seen = await view.evaluate(() => [...document.querySelectorAll('.lk-xactor')].map((card) => ({
      id: card.dataset.actor,
      name: card.querySelector('.lk-xname')?.textContent,
      detail: card.querySelector('.lk-xdetail')?.textContent,
      icon: Boolean(card.querySelector('.lk-xicon svg, .lk-xicon path, .lk-xicon circle')),
      anchor: card.getAttribute('data-anchor'),
    })));
    assert.deepEqual(errors, []);
    assert.deepEqual(seen.map((a) => a.name), ['Cliente', 'Router', 'DNS', 'Servidor web']);
    assert.deepEqual(seen.map((a) => a.detail), ['192.168.1.10', 'une tu red con internet', '8.8.8.8', '93.184.216.34']);
    assert.ok(seen.every((a) => a.icon), 'un actor sin icono es una caja con su nombre');
    assert.deepEqual(seen.map((a) => a.anchor), seen.map((a) => a.id), 'cada actor es el ancla que nombran los enlaces');
    // Los enlaces del mapa salen del borde de un actor y llegan al borde del otro.
    const links = await view.evaluate(() => [...document.querySelectorAll('.lk-xlink')].map((path) => {
      const len = path.getTotalLength();
      const a = path.getPointAtLength(0), z = path.getPointAtLength(len);
      return { from: path.dataset.from, to: path.dataset.to, len, a, z };
    }));
    assert.equal(links.length, 3, 'el mapa dibuja sus tres enlaces');
    assert.ok(links.every((l) => l.len > 4), 'un enlace sin trazo no une nada');
  } finally { await browser.close(); }
});

test('la lista de pasos mueve el mapa: el paso activo enfoca a sus actores y muestra qué viaja', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK);
  try {
    const read = () => view.evaluate(() => ({
      focused: [...document.querySelectorAll('.lk-xactor[data-focus="1"]')].map((c) => c.dataset.actor),
      dimmed: [...document.querySelectorAll('.lk-xactor[data-focus="0"]')].map((c) => c.dataset.actor),
      travel: document.querySelector('.lk-xtravel').textContent,
      current: [...document.querySelectorAll('.lk-xstep')].findIndex((b) => b.getAttribute('aria-current') === 'true') + 1,
      count: document.querySelector('.lk-xpos').textContent,
      details: document.querySelector('.lk-xtitle')?.textContent,
      rows: [...document.querySelectorAll('.lk-xrow')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]),
      log: [...document.querySelectorAll('.lk-xlogrow')].filter((r) => !r.hidden).map((r) => [r.querySelector('.lk-xln').textContent, r.querySelector('.lk-xfrom').textContent, r.querySelector('.lk-xto').textContent, r.querySelector('.lk-xkind').textContent]),
    }));
    const first = await read();
    assert.deepEqual(first.focused, ['client', 'dns'], 'el paso 1 enfoca al cliente y al DNS');
    assert.deepEqual(first.dimmed, ['router', 'web'], 'los que no hablan en el paso se atenúan');
    void 0;
    assert.equal(first.travel, 'www.example.com', 'el mapa dice qué viaja');
    assert.equal(first.count, '1 / 8');
    assert.equal(first.details, 'La consulta');
    assert.deepEqual(first.rows, [['CONSULTA', 'www.example.com'], ['TIPO', 'A (IPv4)'], ['PUERTO', '53']]);
    assert.deepEqual(first.log, [['1', 'Cliente', 'DNS', 'query']], 'el registro arranca con el paso 1');
    await view.getByRole('button', { name: 'Paso siguiente' }).click();
    await view.waitForTimeout(80);
    const second = await read();
    assert.deepEqual([...second.focused].sort(), ['client', 'dns'], 'el paso 2 enfoca al DNS y al cliente');
    assert.deepEqual([...second.dimmed].sort(), ['router', 'web']);
    assert.equal(second.travel, '93.184.216.34');
    assert.equal(second.current, 2);
    assert.deepEqual(second.log, [['1', 'Cliente', 'DNS', 'query'], ['2', 'DNS', 'Cliente', 'answer']], 'el registro se llena al avanzar');
    // El paso se puede elegir en la lista.
    await view.locator('.lk-xstep').nth(5).click();
    await view.waitForTimeout(80);
    const sixth = await read();
    assert.equal(sixth.current, 6);
    assert.equal(sixth.travel, 'GET /');
    assert.equal(sixth.log.length, 6);
  } finally { await browser.close(); }
});

test('el registro se vacía al reiniciar y el reproductor avanza solo', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK);
  try {
    const visible = () => view.evaluate(() => [...document.querySelectorAll('.lk-xlogrow')].filter((r) => !r.hidden).length);
    for (let i = 0; i < 3; i++) { await view.getByRole('button', { name: 'Paso siguiente' }).click(); }
    await view.waitForTimeout(80);
    assert.equal(await visible(), 4);
    await view.getByRole('button', { name: 'Reiniciar los pasos' }).click();
    await view.waitForTimeout(80);
    assert.equal(await visible(), 1, 'reiniciar deja el registro en el primer paso');
    assert.equal(await view.locator('.lk-xpos').textContent(), '1 / 8');
    // Reproducir avanza solo y se puede pausar.
    await view.getByRole('button', { name: 'Reproducir los pasos' }).click();
    await view.waitForTimeout(4600);
    const after = await view.locator('.lk-xpos').textContent();
    assert.notEqual(after, '1 / 8', 'el reproductor no avanzó');
    await view.getByRole('button', { name: 'Reproducir los pasos' }).click();
    await view.waitForTimeout(4400);
    assert.equal(await view.locator('.lk-xpos').textContent(), after, 'pausar no detuvo el reproductor');
  } finally { await browser.close(); }
});

test('la segunda vista dibuja una vida por actor y una flecha por paso', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK);
  try {
    await view.getByRole('button', { name: 'Ver la secuencia' }).click();
    await view.waitForTimeout(200);
    const seen = await view.evaluate(() => {
      const rows = document.querySelector('.lk-xseqrows').getBoundingClientRect();
      return {
        mapHidden: document.querySelector('.lk-xmap').hidden,
        seqHidden: document.querySelector('.lk-xseq').hidden,
        names: [...document.querySelectorAll('.lk-xseqname')].map((n) => n.textContent),
        lives: [...document.querySelectorAll('.lk-xlife')].map((n) => Math.round(n.getBoundingClientRect().left - rows.left)),
        arrows: [...document.querySelectorAll('.lk-xseqarrow')].map((p) => [p.dataset.seq, p.getAttribute('d')]),
        msgs: [...document.querySelectorAll('.lk-xseqmsg')].map((n) => n.textContent),
        active: [...document.querySelectorAll('.lk-xseqrow')].findIndex((r) => r.dataset.state === 'current') + 1,
      };
    });
    assert.equal(seen.mapHidden, true, 'la secuencia reemplaza al mapa');
    assert.equal(seen.seqHidden, false);
    assert.deepEqual(seen.names, ['Cliente', 'Router', 'DNS', 'Servidor web']);
    assert.equal(new Set(seen.lives).size, 4, 'cada actor tiene su vida en una columna');
    assert.equal(seen.arrows.length, 8, 'una flecha por paso');
    assert.ok(seen.arrows.every(([, d]) => d && d.length > 8), 'una flecha sin trazo no une dos vidas');
    assert.deepEqual(seen.msgs, ['www.example.com', '93.184.216.34', 'SYN', 'SYN-ACK', 'ACK', 'GET /', '200 OK', 'HTML + CSS']);
    assert.equal(seen.active, 1);
    await view.getByRole('button', { name: 'Ver la secuencia' }).click();
    await view.waitForTimeout(120);
    assert.equal(await view.evaluate(() => document.querySelector('.lk-xmap').hidden), false, 'se vuelve al mapa');
  } finally { await browser.close(); }
});

test('el explorador pasa la medida en los tres papeles y en los dos anchos, paso a paso', { skip: SKIP }, async () => {
  for (const theme of THEMES) for (const width of [1440, 390]) {
    const { browser, view } = await open(EXAMPLE_BLOCK, { width, theme });
    try {
      const steps = await view.locator('.lk-xstep').count();
      for (let s = 0; s < steps; s++) {
        if (s) { await view.getByRole('button', { name: 'Paso siguiente' }).click(); await view.waitForTimeout(60); }
        const { problems } = await view.locator('lk-explorer').evaluate(measurePiece);
        assert.deepEqual(problems, [], `${theme} · ${width}px · paso ${s + 1}`);
      }
      await view.getByRole('button', { name: 'Ver la secuencia' }).click();
      await view.waitForTimeout(150);
      const { problems } = await view.locator('lk-explorer').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${theme} · ${width}px · secuencia`);
    } finally { await browser.close(); }
  }
});

// ── la medida tiene que rechazar lo que el explorador promete ────────────────
// Una puerta que acepta todo deja pasar la etiqueta encima del nombre del actor,
// el registro desbordado y el actor enfocado fuera del mapa.

test('una etiqueta de lo que viaja encima de una palabra es un hallazgo', { skip: SKIP }, async () => {
  const { browser, view } = await open(blockOf(SMALL));
  try {
    await view.evaluate(() => {
      const chip = document.querySelector('.lk-xtravel');
      const name = document.querySelector('.lk-xactor[data-actor="b"] .lk-xname');
      const map = document.querySelector('.lk-xmap').getBoundingClientRect();
      const r = name.getBoundingClientRect();
      chip.style.left = `${r.left - map.left}px`;
      chip.style.top = `${r.top - map.top}px`;
    });
    const { problems } = await view.locator('lk-explorer').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'travel-over-text'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

test('una fila del registro que no cabe en su ancho es un hallazgo', { skip: SKIP }, async () => {
  const { browser, view } = await open(blockOf(SMALL));
  try {
    await view.evaluate(() => {
      const row = document.querySelector('.lk-xlogrow');
      row.style.display = 'block';
      row.style.whiteSpace = 'nowrap';
      row.querySelector('.lk-xinfo').textContent = 'una información larguísima que no cabe de ninguna manera en esta fila ni en la de al lado';
      for (const span of row.querySelectorAll('span')) span.style.overflowWrap = 'normal';
    });
    const { problems } = await view.locator('lk-explorer').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'log-overflow'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

test('un actor enfocado que se sale de su mapa es un hallazgo', { skip: SKIP }, async () => {
  const { browser, view } = await open(blockOf(SMALL));
  try {
    await view.evaluate(() => { document.querySelector('.lk-xactor[data-focus="1"]').style.transform = 'translateX(-260px)'; });
    const { problems } = await view.locator('lk-explorer').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'focused-out-of-view'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

test('un enlace que no llega a su actor es un hallazgo', { skip: SKIP }, async () => {
  const { browser, view } = await open(blockOf(SMALL));
  try {
    await view.evaluate(() => { document.querySelector('.lk-xactor[data-actor="b"]').removeAttribute('data-anchor'); });
    const { problems } = await view.locator('lk-explorer').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'connector-miss'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

test('un escenario mal escrito se declara en vez de dibujarse a medias', { skip: SKIP }, async () => {
  const cases = [
    [{ ...SMALL, actors: [SMALL.actors[0]] }, 'dos actores'],
    [{ ...SMALL, steps: [{ ...SMALL.steps[0], focus: ['fantasma'] }] }, 'fantasma'],
    [{ ...SMALL, steps: [{ ...SMALL.steps[0], travels: { from: 'a', to: 'nadie', label: 'X' } }] }, 'nadie'],
    [{ ...SMALL, rows: [['a']] }, 'no coloca'],
  ];
  for (const [spec, expected] of cases) {
    const { browser, view } = await open(blockOf(spec), { ready: 'lk-explorer [role="alert"]' });
    try {
      const alert = await view.locator('lk-explorer [role="alert"]').textContent();
      assert.match(alert, new RegExp(expected), `«${expected}»: ${alert}`);
    } finally { await browser.close(); }
  }
});

// ── #228 segunda tanda: personajes, registro opcional, columnas y tres tintas ──

async function openGate(block) {
  const browser = await PLAYWRIGHT.chromium.launch();
  const view = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await view.goto(pageFor(block.replace('<lk-explorer>', '<lk-explorer id="s0">'), { wrap: false }));
    await view.waitForSelector('.lk-p', { timeout: 5000 });
    await view.evaluate(() => document.fonts.ready);
  } catch (error) { await browser.close(); throw error; }
  return { browser, view };
}

test('un actor se dibuja con su personaje (kind), el de scene.icon; sin kind es una caja con su nombre', { skip: SKIP }, async () => {
  const spec = { ...SMALL, actors: [{ ...SMALL.actors[0], kind: 'house' }, { id: 'b', name: 'Receptor', detail: '10.0.0.2', tone: 'green' }] };
  const { browser, view, errors } = await open(blockOf(spec));
  try {
    const drawn = await view.evaluate(() => ({
      rects: document.querySelector('.lk-xactor[data-actor="a"] .lk-xicon')?.querySelectorAll('rect').length ?? -1,
      plain: document.querySelector('.lk-xactor[data-actor="b"] .lk-xicon') !== null,
      name: document.querySelector('.lk-xactor[data-actor="b"] .lk-xname')?.textContent,
    }));
    assert.deepEqual(errors, []);
    assert.equal(drawn.rects, 2, 'la casa de scene.icon tiene dos rectángulos: el cuerpo y la puerta');
    assert.equal(drawn.plain, false, 'un actor sin kind no lleva personaje');
    assert.equal(drawn.name, 'Receptor');
  } finally { await browser.close(); }
});

test('un personaje que el kit no dibuja se declara en el mapa, no se dibuja a medias', { skip: SKIP }, async () => {
  const spec = { ...SMALL, actors: [{ ...SMALL.actors[0], kind: 'nave' }, SMALL.actors[1]] };
  const { browser, view } = await open(blockOf(spec), { ready: 'lk-explorer [role="alert"]' });
  try {
    const alert = await view.locator('lk-explorer [role="alert"]').textContent();
    assert.match(alert, /«nave»/, alert);
  } finally { await browser.close(); }
});

test('el registro es opcional: "log": false lo quita, y un recorrido sin filas de registro no lo dibuja', { skip: SKIP }, async () => {
  const noRows = { ...SMALL, steps: SMALL.steps.map(({ log: _log, ...s }) => s) };
  for (const spec of [{ ...SMALL, log: false }, noRows]) {
    const { browser, view, errors } = await open(blockOf(spec));
    try {
      assert.deepEqual(errors, []);
      assert.equal(await view.locator('.lk-xlog').count(), 0, `${spec.log === false ? '"log": false' : 'sin filas de registro'} sigue dibujando el registro`);
      assert.equal(await view.locator('.lk-xpos').textContent(), '1 / 2', 'sin registro, los controles siguen');
    } finally { await browser.close(); }
  }
});

test('la columna ancha pone lista, mapa y panel en fila con el registro debajo; el teléfono apila mapa, panel, lista plegada y registro', { skip: SKIP }, async () => {
  const at = (view, sel) => view.locator(sel).first().evaluate((n) => { const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  {
    const { browser, view } = await open(EXAMPLE_BLOCK, { width: 1100 });
    try {
      const [list, map, details, log, grid] = await Promise.all(['.lk-xlist', '.lk-xmap', '.lk-xdetails', '.lk-xlog', '.lk-xgrid'].map((s) => at(view, s)));
      assert.ok(list.r <= map.l + 1 && map.r <= details.l + 1, 'en la columna ancha, la lista va a la izquierda del mapa y el panel a su derecha');
      assert.ok(log.t >= grid.b - 1, 'el registro va debajo de la fila');
      assert.equal(await view.locator('.lk-xlist').evaluate((n) => n.open), true, 'la lista va abierta en la columna ancha');
    } finally { await browser.close(); }
  }
  {
    const { browser, view } = await open(EXAMPLE_BLOCK, { width: 390 });
    try {
      const [list, map, details, log] = await Promise.all(['.lk-xlist', '.lk-xmap', '.lk-xdetails', '.lk-xlog'].map((s) => at(view, s)));
      assert.ok(map.b <= details.t + 1 && details.b <= list.t + 1 && list.b <= log.t + 1, 'en el teléfono: mapa, panel, lista y registro, en ese orden');
      assert.equal(await view.locator('.lk-xlist').evaluate((n) => n.open), false, 'en el teléfono la lista se pliega');
      assert.equal(await view.locator('.lk-xlogbody').evaluate((n) => getComputedStyle(n).overflowY), 'auto', 'el registro se desplaza en vez de crecer');
    } finally { await browser.close(); }
  }
});

test('el medidor de piezas mira el explorador en las tres tintas, no solo en la clara', { skip: SKIP }, async () => {
  const { browser, view } = await openGate(blockOf(SMALL));
  try {
    await view.addStyleTag({ content: 'html[data-theme="dark"] .lk-xactor { background:#fff !important; }' });
    const pieces = await measurePieces(view, { scope: 'all' });
    const found = pieces.flatMap((p) => p.problems).filter((p) => p.kind === 'white-island');
    assert.ok(found.some((p) => /dark/.test(p.detail)), `la tinta oscura no se midió: ${JSON.stringify(found)}`);
  } finally { await browser.close(); }
});

test('con prefers-reduced-motion el trazo del viaje no avanza y el foco no se desliza', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK);
  try {
    const motion = () => view.evaluate(() => ({
      flow: getComputedStyle(document.querySelector('.lk-xflow')).animationName,
      card: getComputedStyle(document.querySelector('.lk-xactor')).transitionDuration,
    }));
    const normal = await motion();
    assert.equal(normal.flow, 'lk-xflow', 'sin preferencia, el trazo del viaje avanza');
    await view.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await motion();
    assert.equal(reduced.flow, 'none', 'con reducción de movimiento el trazo se queda quieto');
    assert.equal(reduced.card, '0s', 'y el foco cambia sin transición');
  } finally { await browser.close(); }
});

// ── #228 segunda tanda: el mapa llena su panel, el registro es una tabla, los subtítulos
// se leen y ningún trazo toca el borde del panel. Cada prueba mide lo que el lector ve.
const eachStep = async (view, fn) => {
  for (let s = 0; s < 8; s++) {
    if (s) { await view.getByRole('button', { name: 'Paso siguiente' }).click(); await view.waitForTimeout(60); }
    await fn(s);
  }
};

test('en el ancho amplio los actores cubren al menos el 60 % del panel del mapa, y van centrados', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK, { width: 1000 });
  try {
    const m = await view.evaluate(() => {
      const g = document.querySelector('.lk-xgrid').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.lk-xactor')].map((c) => c.getBoundingClientRect());
      const top = Math.min(...cards.map((r) => r.top)), bottom = Math.max(...cards.map((r) => r.bottom));
      return { panel: g.height, group: bottom - top, drift: Math.abs((top + bottom) / 2 - (g.top + g.bottom) / 2) };
    });
    assert.ok(m.group >= 0.6 * m.panel, `los actores cubren ${Math.round((100 * m.group) / m.panel)} % del panel`);
    assert.ok(m.drift <= 0.15 * m.panel, `el grupo se corre ${Math.round(m.drift)} px del centro`);
  } finally { await browser.close(); }
});

test('el registro es una tabla en el ancho amplio: cada columna cae bajo su título y cada fila ocupa una línea', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK, { width: 1000 });
  try {
    await view.locator('.lk-xstep').nth(7).click();   // el último paso muestra todas las filas
    await view.waitForTimeout(80);
    const t = await view.evaluate(() => {
      const box = (n) => { const b = n.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width }; };
      const heads = [...document.querySelectorAll('.lk-xloghead > span')].map(box);
      const rows = [...document.querySelectorAll('.lk-xlogrow')].filter((r) => !r.hidden).map((r) => {
        const cs = getComputedStyle(r);
        return {
          cells: [...r.children].map(box),
          lines: Math.round((r.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)),
        };
      });
      return { heads, rows };
    });
    assert.equal(t.heads.length, 5, 'el registro tiene cinco cabeceras');
    assert.ok(Math.max(...t.heads.map((h) => h.top)) - Math.min(...t.heads.map((h) => h.top)) <= 1, 'las cabeceras no comparten línea');
    assert.equal(t.rows.length, 8, 'las ocho filas');
    for (const r of t.rows) {
      assert.equal(r.cells.length, 5);
      r.cells.forEach((c, i) => {
        assert.ok(Math.abs(c.left - t.heads[i].left) <= 1, `la celda ${i + 1} no cae bajo su cabecera (${Math.round(c.left - t.heads[i].left)} px)`);
        assert.ok(Math.abs(c.top - r.cells[0].top) <= 1, 'una celda cae bajo la fila');
      });
      assert.equal(r.lines, 1, 'una fila ocupa más de una línea sin que su información se parta');
      assert.ok(r.cells[0].width < r.cells[1].width && r.cells[4].width > r.cells[1].width, 'el número es la columna más estrecha y la información la más ancha');
    }
  } finally { await browser.close(); }
});

test('en el teléfono ninguna cabecera queda sola en otra línea: la columna de información no tiene título', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK, { width: 390 });
  try {
    const heads = await view.evaluate(() => [...document.querySelectorAll('.lk-xloghead > span')]
      .filter((h) => getComputedStyle(h).display !== 'none')
      .map((h) => ({ text: h.textContent, top: h.getBoundingClientRect().top })));
    assert.deepEqual(heads.map((h) => h.text), ['Nº', 'Origen', 'Destino', 'Tipo']);
    assert.ok(Math.max(...heads.map((h) => h.top)) - Math.min(...heads.map((h) => h.top)) <= 1, 'una cabecera cae en otra línea');
  } finally { await browser.close(); }
});

test('los subtítulos de los pasos van en caja baja, con espaciado normal y no bajan del mínimo de lectura', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK, { width: 1000 });
  try {
    const subs = await view.evaluate(() => [...document.querySelectorAll('.lk-xssub')].map((s) => {
      const cs = getComputedStyle(s);
      return { text: s.textContent, transform: cs.textTransform, spacing: cs.letterSpacing, size: parseFloat(cs.fontSize) };
    }));
    assert.equal(subs.length, 8, 'un subtítulo por paso');
    assert.equal(subs[0].text, 'pregunta por el nombre');
    for (const s of subs) {
      assert.equal(s.transform, 'none', `«${s.text}» va en ${s.transform}`);
      assert.ok(s.spacing === 'normal' || parseFloat(s.spacing) === 0, `«${s.text}» lleva espaciado ${s.spacing}`);
      assert.ok(s.size >= 13, `«${s.text}» mide ${s.size} px`);
    }
  } finally { await browser.close(); }
});

test('ningún trazo del explorador queda al borde de su panel: 20 px en el teléfono y 8 px en el resto, en cada paso', { skip: SKIP }, async () => {
  for (const [width, min] of [[390, 20], [1000, 8]]) {
    const { browser, view } = await open(EXAMPLE_BLOCK, { width });
    try {
      await eachStep(view, async (s) => {
        const worst = await view.evaluate(() => {
          let w = { gap: Infinity, path: '' };
          for (const panel of document.querySelectorAll('.lk-xmap')) {
            if (panel.closest('[hidden]')) continue;
            const P = panel.getBoundingClientRect();
            for (const path of panel.querySelectorAll('path.lk-xlink, path.lk-xflow')) {
              if (!path.getAttribute('d') || !path.getTotalLength()) continue;
              const m = path.getScreenCTM(), total = path.getTotalLength();
              for (let len = 0; len <= total; len += 2) {
                const p = path.getPointAtLength(len);
                const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
                const gap = Math.min(x - P.left, P.right - x, y - P.top, P.bottom - y);
                if (gap < w.gap) w = { gap, path: `${path.dataset.from || 'viaje'}→${path.dataset.to || '·'}` };
              }
            }
          }
          return w;
        });
        assert.ok(worst.gap >= min, `${width}px · paso ${s + 1}: ${worst.path} queda a ${Math.round(worst.gap)} px del borde (mínimo ${min})`);
      });
    } finally { await browser.close(); }
  }
});

// Las rectas de un enlace en el teléfono son H y V: el cruce se cuenta entre enlaces distintos.
const segmentsOf = (d) => {
  const t = d.trim().split(/[\s,]+/);
  const pts = [];
  let x = 0, y = 0;
  for (let i = 0; i < t.length;) {
    const c = t[i++];
    if (c === 'M' || c === 'L') { x = +t[i++]; y = +t[i++]; pts.push([x, y]); }
    else if (c === 'H') { x = +t[i++]; pts.push([x, y]); }
    else if (c === 'V') { y = +t[i++]; pts.push([x, y]); }
    else throw new Error(`trazo no reconocido: ${c}`);
  }
  return pts.slice(1).map((q, k) => ({ x1: pts[k][0], y1: pts[k][1], x2: q[0], y2: q[1] }));
};
const meets = (s, t) => Math.max(Math.min(s.x1, s.x2), Math.min(t.x1, t.x2)) <= Math.min(Math.max(s.x1, s.x2), Math.max(t.x1, t.x2)) + 0.5
  && Math.max(Math.min(s.y1, s.y2), Math.min(t.y1, t.y2)) <= Math.min(Math.max(s.y1, s.y2), Math.max(t.y1, t.y2)) + 0.5;

test('en el teléfono los enlaces no se cruzan ni se pisan', { skip: SKIP }, async () => {
  const { browser, view } = await open(EXAMPLE_BLOCK, { width: 390 });
  try {
    const ds = await view.evaluate(() => [...document.querySelectorAll('.lk-xlink')].map((p) => p.getAttribute('d')));
    assert.equal(ds.length, 3, 'los tres enlaces del ejemplo');
    const paths = ds.map(segmentsOf);
    let crossings = 0;
    for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) for (const s of paths[i]) for (const t of paths[j]) if (meets(s, t)) crossings++;
    assert.equal(crossings, 0, `${crossings} cruce(s) entre enlaces`);
  } finally { await browser.close(); }
});

// `step` se usa en el caso del reproductor: deja el recorrido en el paso n.
void step;
