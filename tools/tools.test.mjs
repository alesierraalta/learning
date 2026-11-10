// Las puertas de calidad también se prueban: una herramienta que nunca falla no es
// una puerta. Cada caso usa un fixture mínimo, no una nota real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'quality-tools-'));

function run(tool, args) {
  return spawnSync(process.execPath, [join(TOOLS, tool), ...args], { encoding: 'utf8' });
}

function part(words, name) {
  const file = join(dir, name);
  writeFileSync(file, `# Parte\n\n${'palabra '.repeat(words)}\n`);
  return file;
}

test('part-lint deja pasar una parte corta', () => {
  const r = run('part-lint.mjs', [part(100, 'corta.md')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok/);
});

test('part-lint rechaza una parte que pasa del tope', () => {
  const r = run('part-lint.mjs', [part(500, 'larga.md')]);
  assert.equal(r.status, 1, 'una parte por encima del tope no se entrega');
  assert.match(r.stdout, /PASA|^PASA/m);
});

test('part-lint no cuenta código, tablas ni figuras como prosa', () => {
  const file = join(dir, 'mixta.md');
  writeFileSync(file, [
    '# Parte', '', 'palabra '.repeat(440), '',
    '```js', 'palabra '.repeat(200), '```', '',
    '| a | b |', '|---|---|', '| x | y |', '',
    '<lk-scene><script type="application/json">{}</script></lk-scene>', '',
  ].join('\n'));
  const r = run('part-lint.mjs', [file]);
  assert.equal(r.status, 0, `lo que no se lee como prosa no cuenta: ${r.stdout}`);
});

test('part-lint acepta otro tope por argumento', () => {
  const r = run('part-lint.mjs', [part(120, 'media.md'), '--max', '100']);
  assert.equal(r.status, 1);
});

test('scene-lint deja pasar una escena donde todo convive', () => {
  const file = join(dir, 'limpia.md');
  writeFileSync(file, '```\n<lk-scene>\n<script type="application/json">\n' + JSON.stringify({
    viewBox: '0 0 760 240',
    scene: {
      boxes: [{ x: 40, y: 60, w: 200, h: 100, label: 'AGENTE', sub: 'robot', tone: 'blue', rx: 0, size: 20 }],
      arrows: [{ x1: 244, y1: 110, x2: 564, y2: 110, tone: 'slate', width: 2 }],
      icons: [{ kind: 'house', x: 600, y: 120, size: 90 }],
    },
  }) + '\n</script>\n</lk-scene>\n```\n');
  const r = run('scene-lint.mjs', [file]);
  if (/playwright no está disponible/.test(r.stderr + r.stdout)) return; // sin navegador no se mide
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('scene-lint rechaza una caja que se sale del lienzo', () => {
  const file = join(dir, 'rota.md');
  writeFileSync(file, '```\n<lk-scene>\n<script type="application/json">\n' + JSON.stringify({
    viewBox: '0 0 760 200',
    scene: { boxes: [{ x: 40, y: 150, w: 200, h: 120, label: 'DORMITORIO', tone: 'blue', rx: 0, size: 20 }] },
  }) + '\n</script>\n</lk-scene>\n```\n');
  const r = run('scene-lint.mjs', [file]);
  if (/playwright no está disponible/.test(r.stderr + r.stdout)) return;
  assert.equal(r.status, 1, 'una caja cortada se ve sin base: la puerta la rechaza');
  assert.match(r.stdout, /fuera-del-lienzo/);
});

test('explain-check rechaza una frase de más de 18 palabras', () => {
  const file = join(dir, 'frase-larga.md');
  writeFileSync(file, [
    '# Parte', '', '## Ruta', '', '1. Uno', '2. Dos', '3. Tres', '',
    '## 1. Algo', '',
    'Esta frase tiene muchísimas palabras porque nunca se decide a terminar y sigue y sigue sin punto hasta el final de la línea entera.', '',
    '<lk-quiz>{"id":"q"}</lk-quiz>',
  ].join('\n'));
  const r = run('explain-check.mjs', [file]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA frases/);
});

test('explain-check rechaza un párrafo de tres frases', () => {
  const file = join(dir, 'muro.md');
  writeFileSync(file, [
    '# Parte', '', '## Ruta', '', '1. Uno', '2. Dos', '3. Tres', '',
    '## 1. Algo', '',
    'Una. Dos. Tres.', '',
    '<lk-quiz>{"id":"q"}</lk-quiz>',
  ].join('\n'));
  const r = run('explain-check.mjs', [file]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA parrafos/);
});

test('scene-lint rechaza una flecha que termina en el vacío', () => {
  const file = join(dir, 'al-aire.md');
  writeFileSync(file, '<lk-scene>\n<script type="application/json">\n' + JSON.stringify({
    viewBox: '0 0 760 260',
    scene: {
      boxes: [{ x: 300, y: 80, w: 160, h: 96, label: 'un paso', tone: 'ink', rx: 0, size: 20 }],
      arrows: [{ x1: 294, y1: 128, x2: 60, y2: 128, tone: 'amber', width: 2 }],
    },
  }) + '\n</script>\n</lk-scene>\n');
  const r = run('scene-lint.mjs', [file]);
  if (/playwright no está disponible/.test(r.stderr + r.stdout)) return;
  assert.equal(r.status, 1);
  assert.match(r.stdout, /flecha-al-aire/);
});

test('explain-check mide también la prosa dentro de una cita', () => {
  const file = join(dir, 'cita-muro.md');
  writeFileSync(file, [
    '# Parte', '', '## Ruta', '', '1. Uno', '2. Dos', '3. Tres', '',
    '## 1. Algo', '',
    '> Esta cita esconde un párrafo enorme que no se corta nunca y sigue y sigue acumulando palabras sin pausa hasta aburrir. Y además tiene una segunda frase larguísima. Y una tercera, para rematar el muro.', '',
    '<lk-quiz>{"id":"q"}</lk-quiz>',
  ].join('\n'));
  const r = run('explain-check.mjs', [file]);
  assert.equal(r.status, 1, 'una cita con tres frases también es un muro');
  assert.match(r.stdout, /FALLA (frases|parrafos)/);
});
