// El ejemplo vivo del tope de recorridos (#324): la parte de la distancia al centro trae la historia de fórmula gaussiana
// y las dos cuentas de z como historias de derivación. Cumple el estándar entero, y el tope no cuenta las derivaciones.
// El archivo es el fixture que también lee el motor (internal/engine/testdata/zscore-parte-1.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTE = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'zscore-parte-1.md');

test('la parte de la distancia al centro cumple el estándar entero', () => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), PARTE], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cumple el estándar/);
});

test('la parte trae una historia de fórmula y dos de derivación, como la parte viva', () => {
  const kinds = [...readFileSync(PARTE, 'utf8').matchAll(/<lk-story>\n<script type="application\/json">\n([\s\S]*?)\n<\/script>/g)]
    .map((m) => JSON.parse(m[1]).kind);
  assert.deepEqual(kinds, ['formula', 'derivation', 'derivation']);
});
