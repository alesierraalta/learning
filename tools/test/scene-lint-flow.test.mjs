// El `flow` de una flecha o de un movimiento (#300) es un booleano: scene-lint lo dice
// (`flujo-no-booleano`) si no lo es. Y el trazo que fluye no cambia lo que el lint mide: la misma
// flecha con `flow` y sin él da los mismos hallazgos.
//
// Uso: node --test tools/test/scene-lint-flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const LINT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scene-lint.mjs');

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

const skip = (await loadPlaywright()) ? false : 'playwright is not installed';

const BOXES = [
  { x: 60, y: 120, w: 200, h: 110, label: 'Origen' },
  { x: 560, y: 120, w: 200, h: 110, label: 'Destino' },
];
const LONG = { x1: 270, y1: 175, x2: 550, y2: 175, label: 'envía' };
// Diez unidades de trazo: más corta que el mínimo legible, así que el lint tiene algo que medir.
const SHORT = { x1: 270, y1: 175, x2: 280, y2: 175, label: 'envía' };
const walk = (arrow) => ({
  title: 'Recorrido',
  viewBox: '0 0 900 320',
  steps: [
    { title: 'Uno', text: 'Dos cajas.', scene: { boxes: BOXES } },
    { title: 'Dos', text: 'Una flecha.', scene: { boxes: BOXES, arrows: [arrow] } },
  ],
});
const ACTORS = [
  { id: 'cli', x: 60, y: 90, w: 130, h: 60, label: 'Cliente', tone: 'blue' },
  { id: 'srv', x: 300, y: 90, w: 130, h: 60, label: 'Servidor', tone: 'green' },
];
const story = (move) => ({
  kind: 'derivation',
  title: 'Un saludo',
  viewBox: '0 0 480 220',
  steps: [
    { title: 'Uno', narrator: 'El cliente está listo.', stage: { scene: { actors: ACTORS } } },
    { title: 'Dos', narrator: 'El cliente abre la conexión.', stage: { scene: { actors: ACTORS, moves: [move] } } },
    { title: 'Tres', narrator: 'Listo.', stage: { scene: { actors: ACTORS, marks: [{ kind: 'ok', actors: ['srv'] }] } } },
  ],
});
const block = (tag, spec) => `<lk-${tag}>\n<script type="application/json">${JSON.stringify(spec)}</script>\n</lk-${tag}>`;
const note = (...blocks) => `# Flujo\n\n${blocks.join('\n\n')}\n`;

const cache = new Map();
// Corre scene-lint sobre una nota y devuelve sus hallazgos en JSON, salga como salga.
function lint(key, text) {
  if (!cache.has(key)) {
    const dir = mkdtempSync(join(tmpdir(), 'flujo-lint-'));
    const file = join(dir, 'nota.md');
    writeFileSync(file, text);
    const run = spawnSync(process.execPath, [LINT, file, '--json'], { encoding: 'utf8', timeout: 170000 });
    rmSync(dir, { recursive: true, force: true });
    if (run.error || !run.stdout.trim()) throw new Error(`scene-lint no devolvió hallazgos: ${run.stderr || run.error?.message}`);
    cache.set(key, JSON.parse(run.stdout));
  }
  return cache.get(key);
}

test('scene-lint rechaza un flow que no es booleano, en una flecha y en un movimiento', { skip }, () => {
  const bad = lint('bad', note(
    block('walkthrough', walk({ ...LONG, flow: 'sí' })),
    block('story', story({ from: 'cli', to: 'srv', verb: 'abre', flow: 1 })),
  ));
  const found = bad.filter((f) => f.kind === 'flujo-no-booleano');
  assert.deepEqual(found.map((f) => [f.block, f.text]), [[1, '"sí"'], [2, '1']]);
});

test('un flow booleano no es un hallazgo', { skip }, () => {
  const ok = lint('ok', note(
    block('walkthrough', walk({ ...LONG, flow: true })),
    block('story', story({ from: 'cli', to: 'srv', verb: 'abre', flow: false })),
  ));
  assert.deepEqual(ok.filter((f) => f.kind === 'flujo-no-booleano'), []);
});

test('el trazo que fluye no cambia lo que scene-lint encuentra: la misma flecha con y sin flow da los mismos hallazgos', { skip }, () => {
  const plain = lint('plain', note(block('walkthrough', walk(SHORT))));
  const flowing = lint('flow', note(block('walkthrough', walk({ ...SHORT, flow: true }))));
  assert.ok(plain.length > 0, 'la flecha corta no produce ningún hallazgo que medir');
  assert.deepEqual(flowing, plain);
});
