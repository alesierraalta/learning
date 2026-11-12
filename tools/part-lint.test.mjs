// El tope de una parte también se prueba: un lint que cuenta el JSON de una figura
// como prosa rechaza partes que se leen en dos minutos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'part-lint-'));

const lint = (file) => spawnSync(process.execPath, [join(TOOLS, 'part-lint.mjs'), file, '--max', '100000'], { encoding: 'utf8' });

const words = (stdout) => {
  const m = /(\d+) palabras/.exec(stdout);
  assert.ok(m, `part-lint printed no count: ${stdout}`);
  return Number(m[1]);
};

const PROSA = 'El estado es lo que hace falta saber para decidir.';

// Una historia es una figura: su JSON se mira, no se lee, así que no gasta el
// presupuesto de prosa. El motor la quita igual (`withoutPieces`/`proseStory`).
const HISTORIA = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","x":110,"y":210,"w":140,"h":56,"label":"robot","tone":"slate"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","x":110,"y":210,"w":140,"h":56,"label":"robot","tone":"slate"},{"id":"u","x":110,"y":80,"w":140,"h":56,"label":"arriba","tone":"blue"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>`;

// Una pieza también es una figura: sus tarjetas se miran.
const TARJETAS = `<lk-cards>
<script type="application/json">
{"caption":"Cada caso, con su veredicto.","cards":[{"verdict":"ok","pill":"COMPILA","title":"Uno","reason":"Todos leen a la vez."},{"verdict":"no","pill":"NO COMPILA","title":"Dos","reason":"Uno escribiría."}]}
</script>
</lk-cards>`;

test('el JSON de una historia no cuenta como prosa', () => {
  const file = join(dir, 'con-historia.md');
  writeFileSync(file, `# Parte 1\n\n${PROSA}\n\n${HISTORIA}\n`);
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(words(r.stdout), PROSA.split(/\s+/).length, r.stdout);
});

test('el JSON de una pieza no cuenta como prosa', () => {
  const file = join(dir, 'con-pieza.md');
  writeFileSync(file, `# Parte 1\n\n${PROSA}\n\n${TARJETAS}\n`);
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(words(r.stdout), PROSA.split(/\s+/).length, r.stdout);
});

// El recorrido clásico ya se descontaba: sigue descontándose.
test('el JSON de un recorrido clásico no cuenta como prosa', () => {
  const file = join(dir, 'con-clasico.md');
  writeFileSync(file, `# Parte 1\n\n${PROSA}\n\n<lk-walkthrough>\n<script type="application/json">\n{"steps":[{"title":"uno","text":"una transición larga que no es prosa de la parte","scene":{"boxes":[{"x":20,"y":20,"w":200,"h":60,"label":"caja"}]}}]}\n</script>\n</lk-walkthrough>\n`);
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(words(r.stdout), PROSA.split(/\s+/).length, r.stdout);
});
