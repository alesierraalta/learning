// One command for every per-part gate (#372/T2a). These tests use stub gates that print the
// very lines the real tools print, so the differential check below compares rule ids with the
// studio's own reader of those outputs, not with a second copy of the gate logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { findingsOf, PART_TOOLS } from '../studio/checks.ts';
import { REGLAS } from './explain-check/reglas.mjs';
import { REGLAS_DE_REGISTRO } from './register/hallazgos.mjs';
import { HINTS } from './explain-check/hints.mjs';
import { ruleSheet, ruleSheetText } from './part-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'part-check.mjs');
const FREQUENT_FILE = join(HERE, 'part-check-frequent.json');
const frequentIds = () => JSON.parse(readFileSync(FREQUENT_FILE, 'utf8'));
const FREQUENT_HEADING = 'Most frequent first-draft findings';
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

test('the rule sheet covers exactly the rules part-check can report, generated from their own metadata', () => {
  const sheet = ruleSheet();
  const expected = new Set([...REGLAS.map((rule) => rule.id), ...REGLAS_DE_REGISTRO, ...Object.keys(HINTS)]);
  const ids = sheet.map((row) => row.id);
  assert.deepEqual([...new Set(ids)].sort(), [...expected].sort(), 'no rule is missing and no stale id survives');
  assert.equal(ids.length, expected.size, 'no rule is listed twice');
  for (const row of sheet) {
    assert.ok(row.requirement && row.hint, `${row.id} needs a requirement and a fix hint`);
    assert.equal(row.hint, HINTS[row.id], `${row.id}'s fix comes from the rule's own hint`);
    assert.equal(row.requirement.split('\n').length, 1, `${row.id}'s requirement is one line`);
    assert.equal(row.hint.split('\n').length, 1, `${row.id}'s hint is one line`);
  }
  const all = run(['--rules']);
  assert.equal(all.status, 0, all.stdout + all.stderr);
  for (const id of expected) assert.match(all.stdout, new RegExp(`\\b${id}\\b`), `${id} appears in --rules`);
});

test('the frequent first-draft ids are a small checked-in list and every id is in the rule sheet', () => {
  const ids = frequentIds();
  assert.ok(Array.isArray(ids) && ids.length > 0 && ids.length <= 10, `expected a small list, got ${JSON.stringify(ids)}`);
  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0), 'every entry is a rule id');
  assert.equal(new Set(ids).size, ids.length, 'no id is listed twice');
  const sheetIds = ruleSheet().map((row) => row.id);
  for (const id of ids) assert.ok(sheetIds.includes(id), `${id} is not a rule the sheet can report`);
});

test('the rule sheet puts the frequent first-draft findings first, under their own heading', () => {
  const ids = frequentIds();
  const rows = ruleSheet();
  assert.deepEqual(rows.slice(0, ids.length).map((row) => row.id), ids, 'the checked-in order is the sheet order');
  for (const text of [ruleSheetText(), ruleSheetText({ compact: true })]) {
    const heading = text.indexOf(FREQUENT_HEADING);
    assert.ok(heading >= 0, `missing heading in ${text.slice(0, 80)}`);
    const positions = ids.map((id) => {
      const at = text.indexOf(`\n${id} |`, heading);
      assert.ok(at > heading, `${id} is not under the frequent heading`);
      return at;
    });
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'the frequent rows keep the checked-in order');
    const firstOther = rows.find((row) => !ids.includes(row.id)).id;
    assert.ok(text.indexOf(`\n${firstOther} |`) > positions.at(-1), 'the other rules come after the frequent ones');
  }
  const cli = run(['--rules']);
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, new RegExp(FREQUENT_HEADING));
});

test('the register finding names the unexplained term and the line where it first appears', () => {
  const note = file('registro.md', CLEAN);
  const toolsDir = tools(false);
  writeFileSync(join(toolsDir, 'register', 'measure.mjs'), `console.log(${JSON.stringify(JSON.stringify({
    words: 120,
    unexplained: [{ term: 'buffer', line: 4, sentence: 'El buffer guarda los cambios.' }],
  }))});\n`);
  const json = run([note, '--json'], toolsDir);
  assert.equal(json.status, 0, json.stdout + json.stderr);
  const report = JSON.parse(json.stdout);
  const found = report.register.findings;
  assert.equal(found.length, 1, 'one finding per unexplained term');
  assert.equal(found[0].rule, 'termino-sin-explicar');
  assert.match(found[0].where, /línea 4/);
  assert.match(found[0].message, /buffer/);
  assert.equal(found[0].hint, HINTS['termino-sin-explicar']);
  assert.match(run([note], toolsDir).stdout, /buffer[^\n]*línea 4|línea 4[^\n]*buffer/, 'the plain report names it too');
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
