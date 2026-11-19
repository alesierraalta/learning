// One command for every per-part gate (#372/T2a). These tests use stub gates that print the
// very lines the real tools print, so the differential check below compares rule ids with the
// studio's own reader of those outputs, not with a second copy of the gate logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { findingsOf, PART_TOOLS } from '../studio/checks.ts';
import { REGLAS } from './explain-check/reglas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'part-check.mjs');
const dir = mkdtempSync(join(tmpdir(), 'part-check-'));

const BROKEN = `# Parte 1 — Las capas

## Ruta

1. Qué es una capa.

**Capa**: esconde los detalles.

A ---> B

Imagina un robot que aspira la sala.
`;
const CLEAN = BROKEN.replace('A ---> B', 'La capa cambia de sitio.');

const file = (name, text) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

/** The five studio gates plus the three gates the skill runs outside the studio. */
function tools(broken) {
  const root = join(dir, broken ? 'tools-broken' : 'tools-clean');
  mkdirSync(join(root, 'register'), { recursive: true });
  const stub = (name, body) => writeFileSync(join(root, name), body);
  const quiet = broken ? '' : '';
  stub('scene-gate.mjs', broken ? `console.log(${JSON.stringify(`parte.md: escena 1 — La caja en el borde
  al-borde: rect (a 0u del borde)
parte.md: pieza s0 — El rotulo
  letra-diminuta: "x" (12px, por debajo del mínimo de lectura (14 px): dibújala más grande)
1 problema(s) en 2 escena(s)`)});\nprocess.exit(1);\n` : 'process.exit(0);\n');
  stub('scene-lint.mjs', broken ? `console.log(${JSON.stringify(`parte.md: bloque 1 — La flecha
  trazo-sobre-texto: encima (mueve la flecha fuera de la palabra)`)});\nprocess.exit(1);\n` : 'process.exit(0);\n');
  stub('deck-gate.mjs', broken ? `console.log(${JSON.stringify(JSON.stringify({ decks: 1, problems: 1, bad: [{ note: 'parte.md', deck: 1, step: 2, kind: 'spill', text: 'palabra' }] }))});\nconsole.log('GATE FAILED');\nprocess.exit(1);\n` : `console.log(${JSON.stringify(JSON.stringify({ decks: 0, problems: 0, bad: [] }))});\nprocess.exit(0);\n`);
  stub('explain-check.mjs', broken ? `console.log(${JSON.stringify(JSON.stringify({ file: 'parte.md', ok: false, serves: false, rows: [
    { rule: 'ruta', ok: false, detail: 'no hay ## Ruta' },
    { rule: 'ascii', ok: false, detail: '1 línea(s) dibujadas con caracteres', items: [{ linea: '«A ---> B» — dibuja la geometría' }] },
  ] }))});\nprocess.exit(1);\n` : `console.log(${JSON.stringify(JSON.stringify({ file: 'parte.md', ok: true, serves: true, rows: [] }))});\nprocess.exit(0);\n`);
  stub('page-gate.mjs', 'process.exit(0);\n');
  stub('part-lint.mjs', broken ? `console.log('PASA  520 palabras (tope 450) · parte.md');\nprocess.exit(1);\n` : `console.log('ok    120 palabras (tope 450) · parte.md');\nprocess.exit(0);\n`);
  writeFileSync(join(root, 'register', 'measure.mjs'), `console.log(${JSON.stringify(JSON.stringify({ words: 120, unexplained: 0 }))});\n`);
  void quiet;
  return root;
}

const run = (args, toolsDir, extra = {}) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8',
  timeout: 60_000,
  env: { ...process.env, PART_CHECK_TOOLS_DIR: toolsDir, ...extra },
});

test('every rule has a one-line hint at its definition', () => {
  for (const rule of REGLAS) {
    assert.ok(rule.hint, `${rule.id} needs a hint`);
    assert.equal(rule.hint.split('\n').length, 1, `${rule.id}'s hint is one line`);
  }
});

test('a note with violations from several gates reports all of them, with rule, where, message and hint', () => {
  const note = file('parte.md', BROKEN);
  const toolsDir = tools(true);
  const r = run([note], toolsDir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  for (const gate of ['scene-gate', 'scene-lint', 'deck-gate', 'explain-check', 'part-lint', 'ascii']) {
    assert.match(r.stdout, new RegExp(`\\[${gate}\\]`), `the ${gate} findings are grouped under their gate`);
  }
  const json = run([note, '--json'], toolsDir);
  assert.equal(json.status, 1, json.stdout + json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, false);
  const ids = report.findings.map((f) => f.rule);
  for (const id of ['al-borde', 'letra-diminuta', 'trazo-sobre-texto', 'spill', 'ruta', 'ascii', 'tamaño']) {
    assert.ok(ids.includes(id), `${id} is missing from ${ids.join(', ')}`);
  }
  for (const found of report.findings) {
    assert.ok(found.rule && found.where && found.message && found.hint, `incomplete finding: ${JSON.stringify(found)}`);
    assert.equal(found.hint.split('\n').length, 1, `${found.rule}'s hint is one line`);
  }
  assert.equal(report.findings.find((f) => f.rule === 'ruta').hint, REGLAS.find((r) => r.id === 'ruta').hint);
  assert.match(report.findings.find((f) => f.gate === 'ascii' && f.rule === 'ascii').where, /línea 9/);
});

test('a clean note passes every gate with exit 0', () => {
  const note = file('limpia.md', CLEAN);
  const r = run([note], tools(false));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const json = run([note, '--json'], tools(false));
  assert.equal(json.status, 0, json.stdout + json.stderr);
  const report = JSON.parse(json.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.failures, []);
  assert.ok(report.register, 'the register measurement ran on the text');
});

test('the failing rules are exactly the ones the individual gates report', () => {
  const note = file('diferencial.md', BROKEN);
  const toolsDir = tools(true);
  const report = JSON.parse(run([note, '--json'], toolsDir).stdout);
  const individual = new Set();
  for (const tool of PART_TOOLS) {
    const r = spawnSync(process.execPath, [join(toolsDir, tool), note], { encoding: 'utf8', timeout: 60_000 });
    for (const line of findingsOf(tool, r.stdout)) {
      individual.add(line.replace(/^FALLA\s+/, '').split(/[:\s]/)[0].trim());
    }
  }
  const lint = spawnSync(process.execPath, [join(toolsDir, 'part-lint.mjs'), note], { encoding: 'utf8', timeout: 60_000 });
  if (lint.status !== 0) individual.add('tamaño');
  if (/--->/.test(BROKEN)) individual.add('ascii');
  const reported = new Set(report.findings.map((f) => f.rule));
  assert.deepEqual([...reported].sort(), [...individual].sort(), 'no rule was added, dropped or renamed');
});

test('a gate that cannot run is reported apart from findings, never as a clean pass', () => {
  const note = file('crash.md', CLEAN);
  const toolsDir = tools(false);
  for (const tool of [...PART_TOOLS, 'part-lint.mjs']) {
    writeFileSync(join(toolsDir, tool), "console.error('boom');\nprocess.exit(2);\n");
  }
  const r = run([note, '--json'], toolsDir);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
  assert.equal(report.failures.length, 6, 'every gate that could not run is named');
  assert.match(r.stderr, /boom/, 'the reason is kept for the log');
});
