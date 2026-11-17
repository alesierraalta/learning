// Las cuatro reglas nuevas de `scene-lint` para `sequence` (#353): un mensaje a un actor que no
// existe, un `at` que retrocede, dos mensajes que chocan en la misma fila y un actor sin rótulo.
// Una secuencia bien escrita no produce ninguno de esos hallazgos.
//
// Uso: PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs node --test tools/test/scene-lint-sequence.test.mjs
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
const skip = (await loadPlaywright()) ? false : 'Playwright no está disponible: define PLAYWRIGHT_MODULE con su index.mjs';

const ACTORS = [
  { id: 'cli', label: 'Cliente' },
  { id: 'api', label: 'API' },
  { id: 'db', label: 'Base' },
];
const OK = [
  { from: 'cli', to: 'api', label: 'petición', kind: 'blue', at: 0 },
  { from: 'api', to: 'db', label: 'consulta', kind: 'amber', at: 1 },
  { from: 'db', to: 'api', label: 'fila', kind: 'green', at: 2 },
];
const walk = (sequence) => ({
  title: 'Una petición', viewBox: '0 0 760 300',
  steps: [
    { title: 'Uno', text: 'Parte.', scene: { sequence } },
    { title: 'Dos', text: 'Sigue.', scene: { sequence } },
  ],
});
const note = (dir, name, sequence) => {
  const file = join(dir, name);
  writeFileSync(file, `# Secuencia\n\n<lk-walkthrough><script type="application/json">${JSON.stringify(walk(sequence))}</script></lk-walkthrough>\n`);
  return file;
};
function lint(file) {
  const run = spawnSync(process.execPath, [LINT, file, '--json'], { encoding: 'utf8', timeout: 170000 });
  if (!run.stdout.trim()) throw new Error(`scene-lint no devolvió hallazgos: ${run.stderr || run.error?.message}`);
  return JSON.parse(run.stdout);
}

test('scene-lint acepta una secuencia bien escrita', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'seq-lint-ok-'));
  try {
    const found = lint(note(dir, 'bien.md', { id: 'p', actors: ACTORS, messages: OK }));
    assert.deepEqual(found.filter((f) => /mensaje|secuencia|actor-sin/.test(f.kind)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scene-lint nombra al actor inexistente, el tiempo que retrocede, la colisión y la ficha vacía', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'seq-lint-bad-'));
  try {
    const bad = {
      id: 'p',
      actors: [{ id: 'cli', label: 'Cliente' }, { id: 'api', label: '' }, { id: 'db', label: 'Base' }],
      messages: [
        { from: 'cli', to: 'ghost', label: 'a nadie', at: 0 },
        { from: 'cli', to: 'api', label: 'adelante', at: 3 },
        { from: 'api', to: 'db', label: 'atrás', at: 2 },
        { from: 'cli', to: 'db', label: 'uno', at: 5 },
        { from: 'cli', to: 'db', label: 'dos', at: 5 },
      ],
    };
    const found = lint(note(dir, 'mal.md', bad));
    const kinds = found.map((f) => f.kind);
    assert.ok(kinds.includes('mensaje-sin-actor'), `falta mensaje-sin-actor: ${kinds}`);
    assert.ok(kinds.includes('mensaje-desordenado'), `falta mensaje-desordenado: ${kinds}`);
    assert.ok(kinds.includes('mensajes-encimados'), `falta mensajes-encimados: ${kinds}`);
    assert.ok(kinds.includes('actor-sin-etiqueta'), `falta actor-sin-etiqueta: ${kinds}`);
    assert.ok(found.find((f) => f.kind === 'mensaje-sin-actor').detail.includes('ghost'), 'el hallazgo no nombra al actor');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un ring que nombra la secuencia no es un foco sin pieza', { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'seq-lint-ring-'));
  try {
    const spec = walk({ id: 'pedido', actors: ACTORS, messages: OK });
    spec.steps[1].ring = 'pedido';
    const file = join(dir, 'ring.md');
    writeFileSync(file, `# Secuencia\n\n<lk-walkthrough><script type="application/json">${JSON.stringify(spec)}</script></lk-walkthrough>\n`);
    assert.deepEqual(lint(file).filter((f) => f.kind === 'foco-sin-pieza'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
