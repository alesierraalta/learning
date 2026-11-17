// La geometría asentada de una secuencia la miden las mismas puertas que la de cualquier otra
// pieza (#353): `scene-gate` en el lienzo, `deck-gate` y `page-gate` en la página del lector,
// incluido el teléfono de 390 px donde la secuencia se desliza dentro de su marco.
//
// Uso: PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs node --test tools/test/sequence-gates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXAMPLE = join(ROOT, 'integrations', 'pi', 'kit', 'examples', 'secuencia-peticion.md');

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

const gates = [
  ['scene-gate.mjs', 'geometría de la escena'],
  ['deck-gate.mjs', 'recorrido a 390 px'],
  ['page-gate.mjs', 'página del lector en las cuatro tintas'],
];
for (const [gate, what] of gates) {
  test(`${gate} aprueba la secuencia del ejemplo: ${what}`, { skip }, () => {
    const run = spawnSync(process.execPath, [join(ROOT, 'tools', gate), EXAMPLE], { encoding: 'utf8', timeout: 240000 });
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    assert.equal(run.status, 0, `${gate} falló (${run.status}): ${output.slice(-3000)}`);
    assert.doesNotMatch(output, /FAILED|problema\(s\)|hallazgo/i, output.slice(-2000));
  });
}

test('el ejemplo de la secuencia trae actores, mensajes con tiempo, fases, leyenda y cierre', () => {
  const src = readFileSync(EXAMPLE, 'utf8');
  const json = /<lk-story>[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/.exec(src)?.[1];
  assert.ok(json, 'el ejemplo no trae el JSON de la historia');
  const spec = JSON.parse(json);
  const seq = spec.steps.at(-1).stage.scene.sequence;
  assert.deepEqual(seq.actors.map((a) => a.id), ['cli', 'api', 'db']);
  assert.deepEqual(seq.messages.map((m) => m.at), [0, 1, 2, 3]);
  assert.deepEqual(seq.messages.map((m) => m.kind), ['blue', 'amber', 'green', 'green']);
  assert.equal(seq.phases.length, 2);
  assert.ok(seq.legend.blue && seq.legend.green);
  assert.ok(spec.summary?.title, 'falta la tarjeta de cierre');
});
