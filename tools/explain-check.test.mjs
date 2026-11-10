// La puerta que revisa una explicación también se prueba: una que acepta todo no
// sirve de nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'explain-check-'));
const run = (file) => spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file], { encoding: 'utf8' });

const CUMPLE = `# Parte 1

## Ruta

1. Qué es el estado
2. Qué es la acción
3. Cómo se combinan

## 1. El estado

El estado es lo que hace falta saber para decidir.

## 2. La acción

La acción es lo que el agente puede hacer.

<lk-quiz>{"id":"q1"}</lk-quiz>
`;

test('acepta una parte que cumple el estándar', () => {
  const f = join(dir, 'cumple.md');
  writeFileSync(f, CUMPLE);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cumple el estándar/);
});

test('rechaza una parte sin ruta', () => {
  const f = join(dir, 'sin-ruta.md');
  writeFileSync(f, CUMPLE.replace(/## Ruta[\s\S]*?(?=## 1\.)/, ''));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA ruta/);
});

test('rechaza una parte que cierra con resumen', () => {
  const f = join(dir, 'resumen.md');
  writeFileSync(f, `${CUMPLE}\n## Resumen para guardar\n\nTodo lo dicho, otra vez.\n`);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA sin-resumen/);
});

test('rechaza una parte que pasa del tope de prosa', () => {
  const f = join(dir, 'larga.md');
  writeFileSync(f, `${CUMPLE}\n${'palabra '.repeat(500)}\n`);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA tamaño/);
});

test('rechaza una parte sin mini-quiz', () => {
  const f = join(dir, 'sin-quiz.md');
  writeFileSync(f, CUMPLE.replace('<lk-quiz>{"id":"q1"}</lk-quiz>', ''));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA mini-quiz/);
});

// Una lista es una idea por línea: tres viñetas cortas, cada una con su punto,
// no son un párrafo de tres frases. Una viñeta con tres frases dentro sí lo es.
test('una lista de viñetas cortas no es un párrafo muro', () => {
  const f = join(dir, 'lista-corta.md');
  writeFileSync(f, CUMPLE.replace('1. Qué es el estado\n2. Qué es la acción\n3. Cómo se combinan',
    '1. Qué es el estado.\n2. Qué es la acción.\n3. Cómo se combinan.'));
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+parrafos/);
});

test('una viñeta con tres frases es un párrafo muro', () => {
  const f = join(dir, 'vineta-muro.md');
  writeFileSync(f, CUMPLE.replace('1. Qué es el estado', '- El estado es lo que hace falta saber. Cambia en cada paso. Sin él no se decide.'));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA parrafos/);
});
