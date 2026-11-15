// El tope de recorridos de una parte (#324). Una historia de derivación es un cálculo, no un recorrido: no cuenta para
// el tope, porque una parte trae su historia de fórmula y una derivación por cada cuenta. Un `<lk-walkthrough>` y una
// historia de fórmula sí cuentan, y una parte admite uno solo. Una historia cuyo JSON no se lee, o que no cierra, cuenta:
// no se sabe que sea de derivación. La derivación sigue siendo figura (scene-lint la mide) y su JSON no es prosa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'recorrido-derivacion-'));
let seq = 0;

const informe = (file) => JSON.parse(spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file, '--json'], { encoding: 'utf8' }).stdout);
const fila = (rep, rule) => {
  const row = rep.rows.find((r) => r.rule === rule);
  assert.ok(row, `no hay fila ${rule}`);
  return row;
};
const nota = (body) => {
  const file = join(dir, `parte-${++seq}.md`);
  writeFileSync(file, `# Una parte\n\nLa cuenta se explica paso a paso.\n\n${body}\n`);
  return file;
};
const palabras = (detail) => Number(detail.match(/^(\d+) palabra/)[1]);

const ESCENA = { actors: [{ id: 'a', x: 60, y: 120, w: 84, h: 50, label: 'a', tone: 'slate' }] };
// Una historia de tres pasos de `kind` (formula o derivation): lo que el tope cuenta es que abre y cierra y su tipo.
const historia = (kind, narrador = 'Paso.') => `<lk-story>\n<script type="application/json">\n${JSON.stringify({
  kind,
  title: 'Historia',
  viewBox: '0 0 360 230',
  summary: { title: 'Lo que queda', metrics: [['Pasos', '3']] },
  steps: [1, 2, 3].map((i) => ({ title: `Paso ${i}`, narrator: narrador, equation: { atoms: [{ t: 'x', id: 'x' }] }, focus: ['x'], facts: [['x', 'el valor']], ring: 'a', stage: { scene: ESCENA } })),
})}\n</script>\n</lk-story>`;
const CLASICO = `<lk-walkthrough>\n<script type="application/json">\n{"viewBox":"0 0 360 300","steps":[{"title":"Uno","text":"Una caja.","scene":{"boxes":[{"x":60,"y":120,"w":200,"h":110,"label":"Cuenta 10"}]}}]}\n</script>\n</lk-walkthrough>`;
const ILEGIBLE = '<lk-story>\n<script type="application/json">\n{no es json}\n</script>\n</lk-story>';
const SIN_CIERRE = '<lk-story>\n<script type="application/json">\n{"kind":"derivation","steps":[]}\n</script>';

test('una historia de fórmula y dos de derivación pasan el tope de recorridos', () => {
  const rep = informe(nota(`${historia('formula')}\n\n${historia('derivation')}\n\n${historia('derivation')}`));
  assert.equal(fila(rep, 'recorrido').ok, true, fila(rep, 'recorrido').detail);
});

test('un recorrido clásico y una derivación pasan el tope', () => {
  const rep = informe(nota(`${CLASICO}\n\n${historia('derivation')}`));
  assert.equal(fila(rep, 'recorrido').ok, true, fila(rep, 'recorrido').detail);
});

test('una derivación sola pasa el tope', () => {
  assert.equal(fila(informe(nota(historia('derivation'))), 'recorrido').ok, true);
});

test('dos recorridos que no son de derivación fallan el tope: una parte admite uno', () => {
  assert.equal(fila(informe(nota(`${CLASICO}\n\n${CLASICO}`)), 'recorrido').ok, false);
});

test('un recorrido clásico y una historia de fórmula fallan el tope', () => {
  assert.equal(fila(informe(nota(`${CLASICO}\n\n${historia('formula')}`)), 'recorrido').ok, false);
});

test('una historia cuyo JSON no se lee cuenta como recorrido: no se sabe que sea de derivación', () => {
  assert.equal(fila(informe(nota(`${historia('formula')}\n\n${ILEGIBLE}`)), 'recorrido').ok, false);
});

test('una derivación sin su cierre cuenta como recorrido', () => {
  assert.equal(fila(informe(nota(`${historia('formula')}\n\n${SIN_CIERRE}`)), 'recorrido').ok, false);
});

test('una derivación sigue siendo figura: la parte la mide con scene-lint, sin escena', () => {
  const figuras = fila(informe(nota(historia('derivation'))), 'figuras');
  assert.notEqual(figuras.detail, 'sin figuras', 'la derivación dejó de contar como figura');
});

test('la prosa no cuenta el JSON de una derivación: el tamaño es el mismo con la historia y sin ella', () => {
  const sin = palabras(fila(informe(nota('Imagina un valor.')), 'tamaño').detail);
  const con = palabras(fila(informe(nota(`Imagina un valor.\n\n${historia('derivation', 'palabra '.repeat(200))}`)), 'tamaño').detail);
  assert.equal(con, sin, `la historia suma ${con - sin} palabra(s) de prosa`);
});
