// El benchmark también se prueba: si cuenta mal, la tasa miente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'explain-bench-'));
const parts = join(dir, 'explicaciones');
mkdirSync(parts);

const CUMPLE = `# Parte

## Ruta

1. Uno
2. Dos
3. Tres

## 1. Algo

Texto corto.

## 2. Otra cosa

Más texto.

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","x":110,"y":210,"w":140,"h":56,"label":"robot","tone":"slate"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","x":110,"y":210,"w":140,"h":56,"label":"robot","tone":"slate"},{"id":"u","x":110,"y":80,"w":140,"h":56,"label":"arriba","tone":"blue"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"u","x":110,"y":80,"w":140,"h":56,"label":"arriba","tone":"blue"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>
Cómo leerlo: avanza y mira la casilla que cambia.

<lk-quiz>{"id":"q1"}</lk-quiz>
`;
writeFileSync(join(parts, 'buena.md'), CUMPLE);
writeFileSync(join(parts, 'mala.md'), CUMPLE.replace(/## Ruta[\s\S]*?(?=## 1\.)/, ''));

const run = (args) => spawnSync(process.execPath, [join(TOOLS, 'explain-bench.mjs'), ...args], { encoding: 'utf8' });

test('mide la tasa a la primera y nombra la regla que falla', () => {
  const r = run([parts, '--json']);
  assert.equal(r.status, 0, 'un benchmark no es una puerta: siempre sale 0');
  const out = JSON.parse(r.stdout);
  assert.equal(out.total, 2);
  assert.equal(out.passed, 1);
  assert.equal(out.rate, 50);
  assert.equal(out.rules.ruta, 1);
  const mala = out.results.find((x) => !x.ok);
  assert.equal(mala.first, 'ruta', 'dice cuál es el primer fallo');
});

test('deja una línea por corrida cuando se lo piden', () => {
  const ledger = join(dir, 'registro.jsonl');
  run([parts, '--record', ledger]);
  run([parts, '--record', ledger]);
  const lines = readFileSync(ledger, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2, 'una línea por corrida, para comparar');
  const last = JSON.parse(lines.at(-1));
  assert.equal(last.total, 2);
  assert.equal(last.passed, 1);
});
