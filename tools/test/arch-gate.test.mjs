// El gate de arquitectura: qué capa puede importar a cuál.
//
// La sonda de arquitectura de `tsp` solo juzga importaciones de Go, y aquí no
// hay Go: escribe «the change touched no Go file, so no import edge was judged».
// Este gate cubre esa dimensión para el código que sí existe: el plugin de Pi,
// los comandos de `tools/` y los recursos del kit. Cada regla salió de una
// verdad medida en este repositorio, no de una arquitectura ideal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../arch-gate.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const GATE = fileURLToPath(new URL('../arch-gate.mjs', import.meta.url));

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'arch-gate-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

test('el plugin no puede importar los comandos de tools', () => {
  const root = tree({
    'integrations/pi/plugin.ts': "import { lint } from '../../tools/lint.mjs';\n",
    'tools/lint.mjs': 'export const lint = 1;\n',
  });
  try {
    const { violations } = scan({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, 'forbidden-edge');
    assert.equal(violations[0].file, 'integrations/pi/plugin.ts');
    assert.equal(violations[0].line, 1);
    assert.equal(violations[0].target, 'tools/lint.mjs');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('el comando sí puede importar el plugin: el gate de decks lo hace', () => {
  const root = tree({
    'tools/deck-gate.mjs': "import { registerBridge } from '../integrations/pi/bridge.ts';\n",
    'integrations/pi/bridge.ts': 'export function registerBridge() {}\n',
  });
  try {
    assert.deepEqual(scan({ root }).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('un recurso del kit no importa nada: se carga como script suelto', () => {
  const root = tree({
    'integrations/pi/kit/kit.js': "import fs from 'node:fs';\nimport { box } from './scene.js';\n",
    'integrations/pi/kit/scene.js': 'export function box() {}\n',
  });
  try {
    const { violations } = scan({ root });
    assert.equal(violations.length, 2);
    assert.ok(violations.every((v) => v.kind === 'kit-not-standalone'));
    assert.deepEqual(violations.map((v) => v.line), [1, 2]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('los tests del kit son de Node y no cuentan como recurso del kit', () => {
  const root = tree({
    'integrations/pi/kit/test/a.test.mjs': "import { test } from 'node:test';\n",
  });
  try {
    assert.deepEqual(scan({ root }).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('una importación relativa que no lleva a ningún archivo se reporta', () => {
  const root = tree({
    'tools/a.mjs': "import { b } from './missing.mjs';\n",
  });
  try {
    const { violations } = scan({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, 'broken-import');
    assert.equal(violations[0].line, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('un ciclo entre dos módulos se reporta una vez', () => {
  const root = tree({
    'tools/a.mjs': "import { b } from './b.mjs';\nexport const a = b;\n",
    'tools/b.mjs': "import { a } from './a.mjs';\nexport const b = a;\n",
  });
  try {
    const { violations } = scan({ root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].kind, 'cycle');
    assert.equal(violations[0].target, 'tools/a.mjs');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('este repositorio pasa su propia arquitectura', () => {
  const { violations, files } = scan({ root: REPO });
  assert.ok(files > 10, `esperaba leer el árbol real, leí ${files} archivos`);
  assert.deepEqual(violations, []);
});

test('la línea de órdenes sale 1 con hallazgos y los nombra', () => {
  const root = tree({
    'integrations/pi/plugin.ts': "import { lint } from '../../tools/lint.mjs';\n",
    'tools/lint.mjs': 'export const lint = 1;\n',
  });
  try {
    const run = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stdout, /forbidden-edge|prohibido/);
    assert.match(run.stdout, /plugin\.ts:1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
