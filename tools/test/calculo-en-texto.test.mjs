// El cálculo escrito como texto (#324). Dos renglones de `<expr> = <expr>` que sustituyen números y llevan una
// operación son una cuenta, y la parte la dibuja como historia de derivación. Una línea sola, un valor dentro de
// una frase, una fórmula sin números, una lista de datos y el código de un lenguaje de programación no son cuentas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = join(REPO, 'tools');
const dir = mkdtempSync(join(tmpdir(), 'calculo-en-texto-'));
let seq = 0;

// La fila de la regla en el JSON de explain-check, para una nota de Markdown o una página HTML.
const informe = (file) => JSON.parse(spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file, '--json'], { encoding: 'utf8' }).stdout);
const fila = (body, extension = 'md') => {
  const file = join(dir, `nota-${++seq}.${extension}`);
  writeFileSync(file, body);
  const row = informe(file).rows.find((r) => r.rule === 'calculo-en-texto');
  assert.ok(row, 'no hay fila calculo-en-texto: la regla no está en el registro de explain-check');
  return row;
};

// La historia de derivación de la cuenta de z: una ecuación por paso, el token que cambia en `focus` y el resumen.
const DERIVACION = `<lk-story>
<script type="application/json">
{"summary":{"title":"z = 2","text":"Dos desviaciones típicas por encima del centro.","metrics":[["Resultado","z = 2"]]},"kind":"derivation","title":"La distancia al centro","viewBox":"0 0 360 250","steps":[
 {"title":"La fórmula","facts":[["z","la distancia al centro, en desviaciones"],["x","el valor que miras"]],"equation":{"size":22,"atoms":[{"t":"z","id":"z"},{"t":" = ","id":"eq"},{"t":"(x − μ) / σ","id":"frac"}]},"focus":["frac"],"narrator":"«z» es la distancia al centro.","stage":{"scene":{"actors":[{"id":"a","x":60,"y":120,"w":120,"h":50,"label":"x − μ","tone":"blue"}]}}},
 {"title":"Con los números","equation":{"size":22,"atoms":[{"t":"z","id":"z"},{"t":" = ","id":"eq"},{"t":"(184 − 120) / 32","id":"frac"}]},"focus":["frac"],"narrator":"Ahora «184» menos «120», entre «32».","stage":{"scene":{"actors":[{"id":"a","x":60,"y":120,"w":120,"h":50,"label":"184 − 120","tone":"blue"}]}}},
 {"title":"El resultado","facts":[["z","la distancia al centro"]],"equation":{"size":22,"atoms":[{"t":"z","id":"z"},{"t":" = ","id":"eq"},{"t":"2","id":"two"}]},"focus":["two"],"narrator":"«64 / 32 = 2».","stage":{"scene":{"actors":[{"id":"b","x":60,"y":120,"w":120,"h":50,"label":"2","tone":"green"}],"marks":[{"kind":"ok","actor":"b"}]}}}
]}
</script>
</lk-story>`;

const ZSCORE = '```text\nz = (x - μ) / σ\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2\n```';

test('un cálculo de cuatro renglones en un bloque de texto falla, con las líneas de la cuenta', () => {
  const row = fila(`Para x = 184 ms, la distancia al centro:\n\n${ZSCORE}\n`);
  assert.equal(row.ok, false, row.detail);
  assert.equal(row.authoringOnly, true, 'es una regla de autoría (#305)');
  assert.equal(row.items.length, 1, 'un cálculo es un hallazgo');
  assert.match(row.items[0].linea, /^líneas 5–7 · cuenta de 3 renglones/);
});

test('el mismo cálculo en renglones seguidos, sin bloque, también falla', () => {
  const row = fila('Para x = 184 ms, la distancia al centro:\n\nz = (x - μ) / σ\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2\n');
  assert.equal(row.ok, false, row.detail);
});

test('dos renglones con una operación y su resultado son un cálculo', () => {
  assert.equal(fila('z = 64 / 32\nz = 2\n').ok, false);
});

test('una línea sola con el resultado no es un cálculo', () => {
  assert.equal(fila('z = 2\n').ok, true);
});

test('un valor dentro de una frase no es un cálculo', () => {
  assert.equal(fila('Para x = 184 ms, la distancia al centro: z = 2, y listo.\n').ok, true);
});

test('una lista de datos sin operación no es un cálculo', () => {
  assert.equal(fila('```text\nμ = 120\nσ = 32\n```\n').ok, true);
});

test('una fórmula sin números no es un cálculo', () => {
  assert.equal(fila('z = (x - μ) / σ\nf(x) = 2x + 1\n').ok, true);
});

test('el código de un lenguaje de programación es código, no un cálculo', () => {
  assert.equal(fila('```python\nz = (184 - 120) / 32\nz2 = 64 / 32\n```\n').ok, true);
});

test('una llamada a función no es aritmética, ni en una cerca sin lenguaje', () => {
  assert.equal(fila('```\nx = foo(1)\ny = bar(2)\n```\n').ok, true);
});

test('una cuenta cortada por una frase no es consecutiva', () => {
  assert.equal(fila('z = 64 / 32\n\nEntonces, la respuesta es esta:\n\nz = 2\n').ok, true);
});

test('una línea en blanco entre dos renglones de cuenta no los separa', () => {
  assert.equal(fila('z = 64 / 32\n\nz = 2\n').ok, false);
});

test('las viñetas con la cuenta también cuentan', () => {
  assert.equal(fila('- z = 64 / 32\n- z = 2\n').ok, false);
});

test('una historia de derivación con su resumen pasa', () => {
  assert.equal(fila(`Para x = 184 ms, la distancia al centro:\n\n${DERIVACION}\n`).ok, true);
});

test('en una página, el cálculo en <pre><code> falla; la misma cuenta como historia pasa', () => {
  const falla = fila('<p>Para x = 184 ms, la distancia al centro:</p>\n<pre><code>z = (x - μ) / σ\nz = (184 - 120) / 32\nz = 64 / 32\nz = 2</code></pre>\n', 'html');
  assert.equal(falla.ok, false, falla.detail);
  const pasa = fila(`<p>Para x = 184 ms, la distancia al centro:</p>\n${DERIVACION}\n`, 'html');
  assert.equal(pasa.ok, true, pasa.detail);
});

test('los ejemplos del kit y el ejemplo trabajado de la skill pasan la regla', () => {
  const examples = join(REPO, 'integrations', 'pi', 'kit', 'examples');
  const files = [
    ...readdirSync(examples).filter((f) => /\.(md|html?)$/.test(f)).map((f) => join(examples, f)),
    join(REPO, 'skills', 'explicacion-interactiva', 'references', 'ejemplo-aprobado.md'),
    join(REPO, 'skills', 'explicacion-interactiva', 'references', 'visuales.md'),
  ];
  for (const file of files) {
    const row = informe(file).rows.find((r) => r.rule === 'calculo-en-texto');
    assert.ok(row, `${relative(REPO, file)}: no hay fila calculo-en-texto`);
    assert.equal(row.ok, true, `${relative(REPO, file)}: ${row.detail}`);
  }
});
