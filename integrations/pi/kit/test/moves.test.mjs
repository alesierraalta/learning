// Un movimiento declarado tiene que dibujarse (#286).
//
// La quinta corrida del banco dejó cuatro de cinco partes escribiendo el
// movimiento como `{"actor":"c10","toX":240,"toY":120}`: el kit leía solo
// `from`/`to`, emitía `data-move-from="undefined"` y no dibujaba ningún trazo.
// El DOM tenía 0 de 4 movimientos dibujados —y peor: 4 de 4 declarados y
// ninguno contado— mientras todas las puertas pasaban. Bayes, que escribe la
// forma que el kit lee, dibujaba 4 de 4.
//
// Los casos se miden sobre las notas reales (`test/fixtures/bench286/`, copiadas
// tal cual del banco): 0 trazos antes, el número declarado después, y un
// movimiento que no se puede dibujar se declara en el dibujo
// (`data-move-undrawn`) para que `scene-lint` lo rechace en vez de callarse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(KIT, 'test', 'fixtures', 'bench286');

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    attempts.push(async () => createRequire(`${root}/`)('playwright'));
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
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se puede medir el movimiento';

// Cada `<lk-story>` de una nota, con su JSON parseado: el movimiento declarado se
// cuenta en el JSON, no en el dibujo, porque el defecto es justamente que los dos
// números no coinciden.
function storiesOf(name) {
  const src = readFileSync(join(BENCH, `${name}.md`), 'utf8');
  return [...src.matchAll(/<lk-story>[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>[\s\S]*?<\/lk-story>/g)]
    .map((m) => JSON.parse(m[1]));
}

const sceneOf = (step) => (step.stage && step.stage.scene) || step.stage || {};
const declaredMoves = (spec) => (spec.steps || []).flatMap((step, i) => (sceneOf(step).moves || []).map((mv) => ({ ...mv, step: i + 1 })));

function page(specs) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-moves-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  const body = specs.map((spec) => `<lk-story><script type="application/json">${JSON.stringify(spec)}</script></lk-story>`).join('\n');
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css"><script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
</head><body><main style="max-width:700px;margin:0 auto">${body}</main></body></html>`);
  return `file://${join(dir, 'p.html')}`;
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

// Lo que el navegador dibujó de cada movimiento: su forma declarada, su trazo y,
// si no se dibujó, la razón que el kit dejó escrita en el grupo.
const drawn = (view) => view.evaluate(() => {
  const rows = [];
  for (const step of document.querySelectorAll('lk-story [data-step]')) {
    for (const m of step.querySelectorAll('[data-move], [data-move-from]')) {
      const path = m.querySelector('[data-move-path]');
      const d = path ? path.getAttribute('d') : null;
      const point = m.dataset.moveToPoint || '';
      const len = d ? path.getTotalLength() : 0;
      const at = (t) => { const p = path.getPointAtLength(t); return { x: p.x, y: p.y }; };
      rows.push({
        step: Number(step.dataset.step),
        from: m.dataset.moveFrom || '',
        to: m.dataset.moveTo || '',
        point,
        declaredPoint: point ? point.split(',').map(Number) : null,
        undrawn: m.dataset.moveUndrawn ?? null,
        d,
        len,
        start: d ? at(0) : null,
        end: d ? at(len) : null,
        verb: m.querySelector('[data-move-label]')?.textContent || '',
      });
    }
  }
  return rows;
});

// El centro dibujado de un actor: la figura que el navegador midió, nunca la
// coordenada escrita en el JSON.
const centres = (view) => view.evaluate(() => {
  const out = {};
  for (const step of document.querySelectorAll('lk-story [data-step]')) {
    for (const actor of step.querySelectorAll('[data-actor]')) {
      const figure = actor.querySelector('[data-figure]') || actor;
      const b = figure.getBBox();
      out[`${step.dataset.step}|${actor.dataset.actor}`] = { x: b.x + b.width / 2, y: b.y + b.height / 2, right: b.x + b.width, left: b.x, bottom: b.y + b.height, top: b.y };
    }
  }
  return out;
});

// ---------------------------------------------------------------- notas reales

// El defecto que abrió el issue: cuatro notas declaran un movimiento con
// `actor`/`toX`/`toY`, el kit no lo lee y lo descarta en silencio. El rojo es
// exacto: 0 de 4 movimientos dibujados y 0 de 4 declarados como no dibujables.
test('las notas del banco declaran sus movimientos: ninguno se descarta en silencio', { skip: SKIP }, async () => {
  const broken = ['git-branching', 'tcp-handshake', 'rust-borrowing', 'css-flexbox'];
  const specs = broken.flatMap((name) => storiesOf(name));
  const declared = specs.flatMap(declaredMoves);
  assert.equal(declared.length, 4, 'las cuatro notas declaran un movimiento cada una');
  const { browser, view, errors } = await open(page(specs));
  try {
    assert.deepEqual(errors, []);
    const moves = await drawn(view);
    assert.equal(moves.length, declared.length, 'cada movimiento declarado tiene su grupo en el dibujo');
    const silent = moves.filter((mv) => !mv.d && !mv.undrawn);
    assert.deepEqual(silent, [], 'hay movimientos que ni se dibujan ni se declaran: el kit los descarta en silencio');
    // Las cuatro notas apuntan al mismo sitio del que sale el actor
    // (`toX`/`toY` copia su `x`/`y`): una longitud cero no se dibuja y se declara.
    for (const mv of moves) {
      assert.equal(mv.undrawn, 'cero', `el movimiento ${mv.from} → ${mv.point} no se declara como de longitud cero: ${JSON.stringify(mv)}`);
      assert.equal(mv.d, null, 'un movimiento de longitud cero no dibuja un trazo falso');
    }
  } finally {
    await browser.close();
  }
});

// La misma nota, con el destino en el otro actor: la forma que escribe el tutor se
// dibuja, y se dibuja una vez por movimiento, desde la figura del actor hasta el
// punto declarado. Este es el verde del issue.
test('la forma {actor,toX,toY} dibuja un trazo por movimiento, del actor al punto', { skip: SKIP }, async () => {
  const broken = ['git-branching', 'tcp-handshake', 'rust-borrowing', 'css-flexbox'];
  const specs = broken.map((name) => {
    const spec = storiesOf(name)[0];
    for (const step of spec.steps) {
      const scene = sceneOf(step);
      for (const mv of scene.moves || []) {
        // El destino real de la nota: el otro actor de su escena. Solo se mueve el
        // punto; la forma `{actor,toX,toY}` queda igual que la escribió el tutor.
        const other = (scene.actors || []).find((a) => a.id !== mv.actor);
        mv.toX = other.x;
        mv.toY = other.y;
      }
    }
    return spec;
  });
  const declared = specs.flatMap(declaredMoves);
  const { browser, view, errors } = await open(page(specs));
  try {
    assert.deepEqual(errors, []);
    const moves = await drawn(view);
    assert.equal(moves.length, declared.length);
    assert.equal(moves.filter((mv) => mv.undrawn).length, 0, 'un destino real no se declara como no dibujable');
    const centre = await centres(view);
    for (const [i, mv] of moves.entries()) {
      const want = declared[i];
      assert.ok(mv.d, `el movimiento ${mv.from} → ${mv.point} no se dibujó`);
      const from = centre[`${want.step}|${want.actor}`];
      assert.ok(from, `falta el actor ${want.actor} en el paso ${want.step}`);
      // El trazo se apoya en la figura del actor, como la forma canónica: sale del
      // borde que mira al punto, nunca de dentro de la figura. El destino es el
      // punto que el autor declaró.
      const gapFrom = Math.hypot(Math.max(from.left - mv.start.x, 0, mv.start.x - from.right), Math.max(from.top - mv.start.y, 0, mv.start.y - from.bottom));
      const endGap = Math.hypot(mv.end.x - mv.declaredPoint[0], mv.end.y - mv.declaredPoint[1]);
      assert.ok(gapFrom <= 2, `el trazo no sale de la figura de «${want.actor}»: queda a ${gapFrom.toFixed(1)}u`);
      assert.ok(endGap <= 2, `el trazo no termina en el punto declarado (${mv.declaredPoint}): ${endGap.toFixed(1)}u`);
      assert.match(mv.d, /^M /, 'el movimiento se dibuja con un trazo, no con una caja');
    }
  } finally {
    await browser.close();
  }
});

// Bayes escribe la forma canónica y dibuja 4 de 4: la que ya funcionaba no se toca.
test('la forma canónica {from,to} sigue dibujando 4 de 4 en Bayes', { skip: SKIP }, async () => {
  const specs = storiesOf('bayes-theorem');
  const declared = specs.flatMap(declaredMoves);
  assert.equal(declared.length, 4, 'Bayes declara cuatro movimientos');
  const { browser, view, errors } = await open(page(specs));
  try {
    assert.deepEqual(errors, []);
    const moves = await drawn(view);
    assert.equal(moves.length, 4);
    for (const [i, mv] of moves.entries()) {
      const want = declared[i];
      assert.equal(mv.from, want.from);
      assert.equal(mv.to, want.to);
      assert.equal(mv.undrawn, null, `el movimiento canónico ${want.from} → ${want.to} se declaró no dibujable`);
      assert.ok(mv.d, `el movimiento canónico ${want.from} → ${want.to} no se dibujó`);
      assert.ok(mv.len > 12, `el trazo de ${want.from} → ${want.to} mide ${mv.len.toFixed(0)}u`);
      assert.equal(mv.verb, want.verb || '', 'el verbo del movimiento se dibuja con su trazo');
    }
  } finally {
    await browser.close();
  }
});

// ------------------------------------------------- las dos formas, un significado

// La forma canónica nombra las dos piezas; las dos formas dicen lo mismo: sale del
// origen y llega al destino. Se mide en el navegador, con las mismas cajas.
test('las dos formas significan lo mismo: sale del actor y llega a su destino', { skip: SKIP }, async () => {
  const actors = [
    { id: 'cli', icon: 'robot', x: 80, y: 150, size: 56, tone: 'blue', tag: 'cliente' },
    { id: 'srv', icon: 'server', x: 250, y: 150, size: 56, tone: 'slate', tag: 'servidor' },
  ];
  const spec = (move) => ({
    kind: 'derivation',
    title: 'Las dos formas',
    viewBox: '0 0 360 250',
    steps: [
      { title: 'Una', equation: { size: 20, atoms: [{ t: 'SYN', id: 'a' }] }, focus: ['a'], narrator: 'El cliente saluda.', stage: { scene: { actors, moves: [move] } } },
      { title: 'Dos', equation: { size: 20, atoms: [{ t: 'ACK', id: 'b' }] }, focus: ['b'], narrator: 'El servidor contesta.', stage: { scene: { actors } } },
    ],
  });
  const canonical = spec({ from: 'cli', to: 'srv', verb: 'SYN', tone: 'blue' });
  const point = spec({ actor: 'cli', toX: 250, toY: 150, verb: 'SYN', tone: 'blue' });
  const { browser, view, errors } = await open(page([canonical, point]));
  try {
    assert.deepEqual(errors, []);
    const rows = await drawn(view);
    const [a, b] = rows;
    assert.ok(a.d && b.d, 'una de las dos formas no se dibujó');
    // Las dos salen del cliente y las dos llegan al servidor: la canónica apoya el
    // trazo en el borde de cada figura, la del tutor arranca en el centro y termina
    // en el punto declarado, que cae dentro del servidor.
    const centre = await centres(view);
    const cli = centre['1|cli'], srv = centre['1|srv'];
    const gapTo = (p, b) => Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom));
    assert.ok(gapTo(a.start, cli) <= 2, 'la forma canónica no sale de la figura del cliente');
    assert.ok(gapTo(a.end, srv) <= 2, 'la forma canónica no llega a la figura del servidor');
    assert.ok(gapTo(b.start, cli) <= 2, 'la forma del tutor no sale de la figura del actor');
    assert.ok(Math.hypot(b.end.x - 250, b.end.y - 150) <= 2, 'la forma del tutor no termina en el punto declarado');
    assert.equal(a.verb, 'SYN');
    assert.equal(b.verb, 'SYN');
  } finally {
    await browser.close();
  }
});
