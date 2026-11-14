// El `focus` de un paso (#299) nombra una pieza con id de ese mismo paso. Si no nombra ninguna,
// scene-lint lo dice (`foco-sin-pieza`); y el anillo que dibuja el kit no es un dibujo del autor:
// con o sin anillo, el lint encuentra lo mismo.
//
// Uso: node --test tools/test/scene-lint-focus.test.mjs
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

// Dos bloques: un recorrido cuyo paso 2 enfoca «nada», que no es ninguna pieza, y una historia
// cuyo paso 2 enfoca «srv», que sí es un actor de ese paso. `storyFocus` la deja sin foco si se pide.
const note = (storyFocus) => {
  const walk = {
    title: 'Recorrido',
    viewBox: '0 0 900 300',
    steps: [
      { title: 'Uno', text: 'Dos cajas.', scene: { boxes: [{ id: 'db', x: 60, y: 80, w: 220, h: 110, label: 'Base' }, { x: 420, y: 80, w: 220, h: 110, label: 'Cliente' }] } },
      { title: 'Dos', text: 'Se enfoca una pieza que no existe.', focus: 'nada', scene: { boxes: [{ id: 'db', x: 60, y: 80, w: 220, h: 110, label: 'Base de datos' }, { x: 420, y: 80, w: 220, h: 110, label: 'Cliente' }] } },
    ],
  };
  const actors = (tone) => [
    { id: 'cli', x: 60, y: 90, w: 130, h: 60, label: 'Cliente', tone: 'blue' },
    { id: 'srv', x: 300, y: 90, w: 130, h: 60, label: 'Servidor', tone },
  ];
  const story = {
    kind: 'derivation',
    title: 'Un saludo',
    viewBox: '0 0 480 220',
    steps: [
      { title: 'Uno', narrator: 'El cliente abre.', stage: { scene: { actors: actors('green'), moves: [{ from: 'cli', to: 'srv', verb: 'abre' }] } } },
      { title: 'Dos', narrator: 'El servidor responde.', ...(storyFocus ? { focus: storyFocus } : {}), stage: { scene: { actors: actors('amber'), moves: [{ from: 'srv', to: 'cli', verb: 'responde' }] } } },
      { title: 'Tres', narrator: 'Listo.', stage: { scene: { actors: actors('green'), marks: [{ kind: 'ok', actors: ['cli'] }] } } },
    ],
  };
  return `# Foco\n\n<lk-walkthrough><script type="application/json">${JSON.stringify(walk)}</script></lk-walkthrough>\n\n<lk-story><script type="application/json">${JSON.stringify(story)}</script></lk-story>\n`;
};

const cache = new Map();
// Corre scene-lint sobre una nota y devuelve sus hallazgos en JSON, salga como salga.
function lint(key, text) {
  if (!cache.has(key)) {
    const dir = mkdtempSync(join(tmpdir(), 'foco-lint-'));
    const file = join(dir, 'nota.md');
    writeFileSync(file, text);
    const run = spawnSync(process.execPath, [LINT, file, '--json'], { encoding: 'utf8', timeout: 170000 });
    rmSync(dir, { recursive: true, force: true });
    if (run.error || !run.stdout.trim()) throw new Error(`scene-lint no devolvió hallazgos: ${run.stderr || run.error?.message}`);
    cache.set(key, JSON.parse(run.stdout));
  }
  return cache.get(key);
}

test('scene-lint refuse un focus que no nombra ninguna pieza de su paso', { skip }, () => {
  const misses = lint('focus', note('srv')).filter((f) => f.kind === 'foco-sin-pieza');
  assert.deepEqual(misses.map((f) => [f.block, f.text]), [[1, 'nada']]);
});

test('el anillo que dibuja el kit no cambia lo que scene-lint encuentra', { skip }, () => {
  const plain = lint('plain', note(undefined));
  const ringed = lint('focus', note('srv'));
  assert.deepEqual(ringed, plain);
});
