// Las fórmulas con varios renglones y los `<lk-math>` sueltos (#324, ítems 1 y 2). Dentro de una fórmula de display,
// cada renglón (cada `\\`, o cada línea de `aligned`, `align`, `array` o `gathered`) es un renglón: dos o más renglones
// de cuenta son un cálculo. Dos o más `<lk-math>` sueltos en su línea, en renglones seguidos, que sustituyen y operan,
// son una serie de fórmulas, como las de display. Un `<lk-math>` dentro de una frase, con un punto detrás o citado en
// código no es una fórmula suelta, y un `<lk-math>` solo es una fórmula.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'calculo-lineas-'));
let seq = 0;

// La fila de `calculo-en-texto` en el JSON de explain-check, para una nota de Markdown o una página HTML.
const fila = (body, extension = 'md') => {
  const file = join(dir, `nota-${++seq}.${extension}`);
  writeFileSync(file, body);
  const rep = JSON.parse(spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file, '--json'], { encoding: 'utf8' }).stdout);
  const row = rep.rows.find((r) => r.rule === 'calculo-en-texto');
  assert.ok(row, 'no hay fila calculo-en-texto: la regla no está en el registro de explain-check');
  return row;
};

describe('dentro de una fórmula de display con varios renglones (#324, ítem 1)', () => {
  test('un aligned con tres renglones de cuenta falla, con las líneas de la fórmula', () => {
    const row = fila(String.raw`\[
\begin{aligned}
V(0,2)&=-0{,}04+0{,}9\cdot0{,}6206\\
&=-0{,}04+0{,}55854\\
&=+0{,}51854\approx+0{,}5185
\end{aligned}
\]
`);
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /^líneas 1–7 · cuenta de 3 renglones$/);
  });

  test('un align cuyos renglones empiezan por = toma el lado izquierdo de la línea de arriba', () => {
    const row = fila(String.raw`$$\begin{align} a &= 2+3 \\ &= 5 \end{align}$$`);
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /cuenta de 2 renglones$/);
  });

  test('un array con su columna {rcl} cuenta sus renglones, sin leer la columna como un número', () => {
    const row = fila(String.raw`\[ \begin{array}{rcl} a &=& 2+3 \\ &=& 5 \end{array} \]`);
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /cuenta de 2 renglones$/);
  });

  test('un gathered con dos cuentas, sin &, cuenta sus renglones', () => {
    assert.equal(fila(String.raw`\[ \begin{gathered} 2+3=5 \\ 5+5=10 \end{gathered} \]`).ok, false);
  });

  test('\\nonumber y \\label no son parte de la cuenta', () => {
    assert.equal(fila(String.raw`\[ \begin{align} a &= 2+3 \nonumber \\ &= 5 \label{eq:5} \end{align} \]`).ok, false);
  });

  test('un renglón de cuenta y otro simbólico no son un cálculo', () => {
    assert.equal(fila(String.raw`\[ \begin{aligned} z &= \frac{x-\mu}{\sigma} \\ z &= \frac{184-120}{32} \end{aligned} \]`).ok, true);
  });

  test('varios renglones simbólicos no son un cálculo', () => {
    assert.equal(fila(String.raw`\[ \begin{aligned} V(s) &= \sum_{s'} P(s'\mid s)\,r \\ &= R(s) \end{aligned} \]`).ok, true);
  });

  test('dos renglones de resultado sin operación no son un cálculo', () => {
    assert.equal(fila(String.raw`\[ \begin{aligned} x &= 5 \\ y &= 6 \end{aligned} \]`).ok, true);
  });

  test('un aligned con un solo renglón de cuenta sigue siendo una fórmula', () => {
    assert.equal(fila(String.raw`\[ \begin{aligned} V(0,2) &= -0{,}04+0{,}9\cdot0{,}6206 \end{aligned} \]`).ok, true);
  });

  test('en una página, las entidades (&amp;) de un aligned se leen como el signo que son', () => {
    const row = fila('<p>Comprobación:</p>\n<lk-math display>\\begin{aligned}a&amp;=2+3\\\\&amp;=5\\end{aligned}</lk-math>\n', 'html');
    assert.equal(row.ok, false, row.detail);
  });
});

describe('los <lk-math> sueltos en su línea (#324, ítem 2)', () => {
  test('dos <lk-math> sueltos en renglones seguidos, que sustituyen y operan, son un cálculo', () => {
    const row = fila('<lk-math>2 + 3 = 5</lk-math>\n<lk-math>5 + 5 = 10</lk-math>\n');
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /^líneas 1–2 · cuenta de 2 renglones$/);
  });

  test('un renglón en blanco entre dos <lk-math> sueltos no los separa', () => {
    assert.equal(fila('<lk-math>2 + 3 = 5</lk-math>\n\n<lk-math>5 + 5 = 10</lk-math>\n').ok, false);
  });

  test('un <lk-math> suelto es una fórmula: pasa', () => {
    assert.equal(fila('<lk-math>2 + 3 = 5</lk-math>\n').ok, true);
  });

  test('dos <lk-math> dentro de una frase no son una serie', () => {
    assert.equal(fila('Así, <lk-math>2 + 3 = 5</lk-math> y <lk-math>5 + 5 = 10</lk-math> dan 15.\n').ok, true);
  });

  test('un <lk-math> suelto, una frase y otro <lk-math> suelto no son una serie', () => {
    assert.equal(fila('<lk-math>2 + 3 = 5</lk-math>\n\nDespués:\n\n<lk-math>5 + 5 = 10</lk-math>\n').ok, true);
  });

  test('los <lk-math> sueltos de una lista también son renglones de cuenta', () => {
    assert.equal(fila('- <lk-math>2 + 3 = 5</lk-math>\n- <lk-math>5 + 5 = 10</lk-math>\n').ok, false);
  });

  test('dos <lk-math> sueltos simbólicos no son un cálculo', () => {
    assert.equal(fila('<lk-math>z = \\frac{x-\\mu}{\\sigma}</lk-math>\n<lk-math>f(x) = 2x + 1</lk-math>\n').ok, true);
  });

  test('dos <lk-math> sueltos sin operación (dos resultados) no son un cálculo', () => {
    assert.equal(fila('<lk-math>G = 9</lk-math>\n<lk-math>G = 9.0</lk-math>\n').ok, true);
  });

  test('un <lk-math> dentro de una cerca de texto es texto, no fórmula', () => {
    assert.equal(fila('```text\n<lk-math>2 + 3 = 5</lk-math>\n<lk-math>5 + 5 = 10</lk-math>\n```\n').ok, true);
  });

  test('un <lk-math> con punto final es prosa, no fórmula suelta', () => {
    assert.equal(fila('<lk-math>2 + 3 = 5</lk-math>.\n<lk-math>5 + 5 = 10</lk-math>.\n').ok, true);
  });

  test('un <lk-math> citado en código de línea es texto', () => {
    assert.equal(fila('`<lk-math>2 + 3 = 5</lk-math>`\n`<lk-math>5 + 5 = 10</lk-math>`\n').ok, true);
  });

  test('un <lk-math> suelto de varios renglones (\\\\) cuenta como una fórmula con renglones', () => {
    assert.equal(fila('<lk-math>\\begin{aligned}a&=2+3\\\\&=5\\end{aligned}</lk-math>\n').ok, false);
  });

  test('un <lk-math> suelto y una fórmula de display seguidos son una serie', () => {
    assert.equal(fila('$$2 + 3 = 5$$\n<lk-math>5 + 5 = 10</lk-math>\n').ok, false);
  });

  test('en una página, dos <lk-math> sueltos en párrafos seguidos son una serie', () => {
    const row = fila('<p><lk-math>2 + 3 = 5</lk-math></p>\n<p><lk-math>5 + 5 = 10</lk-math></p>\n', 'html');
    assert.equal(row.ok, false, row.detail);
  });
});

describe('el producto y los espacios dentro de una fórmula (#324)', () => {
  test('un producto con \\cdot pegado a su cifra es una operación', () => {
    assert.equal(fila(String.raw`\[ G = 0{,}9\cdot10 \]` + '\n\n' + String.raw`\[ G = 9 \]` + '\n').ok, false);
  });

  test('un espacio sin separación (NBSP) dentro de una fórmula cuenta como espacio', () => {
    assert.equal(fila('$$2\u00a0+\u00a03 = 5$$\n$$5 + 5 = 10$$\n').ok, false);
  });
});
