// Las fórmulas de display seguidas (#324, decisión 4). Dos o más fórmulas `$$…$$`, `\[…\]` o `<lk-math display>` en
// serie, separadas solo por blancos, que sustituyen números y llevan una operación son un cálculo escrito como
// fórmulas: se dibujan como historia de derivación. Una fórmula sola, aunque lleve sus valores en una línea, no lo
// es; tampoco una serie de fórmulas simbólicas, dos resultados sin operación, fórmulas separadas por prosa o por una
// etiqueta, ni el markup de display dentro de una cerca de texto.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'calculo-formulas-'));
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

const cerca = '`'.repeat(3);

describe('las fórmulas de display seguidas (#324, decisión 4)', () => {
  test('dos fórmulas de display seguidas, con la cuenta y su resultado, son un cálculo', () => {
    const row = fila(String.raw`\[
G=0+0.9(1)+0.9^2(10)
\]

\[
G=9
\]
`);
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /^líneas 1–7 · cuenta de 2 renglones$/);
  });

  test('lo mismo con $$…$$ o con <lk-math display>: cualquier forma de display cuenta', () => {
    assert.equal(fila('$$V=6+0.1(10-6)$$\n\n$$V=6.4$$\n').ok, false);
    assert.equal(fila('<lk-math display>z = 64 / 32</lk-math>\n<lk-math display>z = 2</lk-math>\n').ok, false);
  });

  test('una fórmula partida en renglones se mide entera, con su fracción', () => {
    const row = fila(String.raw`\[
V(Pasillo)
=
\frac{10+4+7+11}{4}
\]

\[
V(Pasillo)=8
\]
`);
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /^líneas 1–9 · cuenta de 2 renglones$/);
  });

  test('los números con su unidad cuentan igual que en el texto, en cualquier forma de display', () => {
    assert.equal(fila(String.raw`\[ 184\,\text{ms} - 120\,\text{ms} = 64\,\text{ms} \]

$$\frac{64}{32} = 2$$
`).ok, false);
  });

  test('una fórmula con símbolos griegos y sus números sustituidos cuenta como cuenta', () => {
    assert.equal(fila(String.raw`\[ \mu+2\sigma = 120+2\cdot 32 \]

\[ \mu+2\sigma = 184 \]
`).ok, false);
  });

  test('una fórmula simbólica seguida de dos cuentas: la fórmula no cuenta, las cuentas sí', () => {
    const row = fila(String.raw`\[
z = \frac{x-\mu}{\sigma}
\]

\[
z = \frac{184-120}{32}
\]

\[
z = 2
\]
`);
    assert.equal(row.ok, false, row.detail);
    assert.match(row.items[0].linea, /^líneas 5–11 · cuenta de 2 renglones$/);
  });

  test('una fórmula de display sola, con sus valores en una línea, pasa', () => {
    assert.equal(fila(String.raw`$$f(184) = \frac{1}{32\sqrt{2\pi}}\,e^{-\frac{(184-120)^2}{2\cdot 32^2}} \approx 0{,}00065$$
`).ok, true);
    assert.equal(fila('<lk-math display>z = 64 / 32</lk-math>\n').ok, true);
  });

  test('la fórmula general y su valor, en otra fórmula de display, pasan: el valor no sustituye números', () => {
    const general = String.raw`$$f(x) = \frac{1}{\sigma\sqrt{2\pi}}\,e^{-\frac{(x-\mu)^2}{2\sigma^2}}$$`;
    const valor = String.raw`$$f(184) = \frac{1}{32\sqrt{2\pi}}\,e^{-\frac{(184-120)^2}{2\cdot 32^2}}$$`;
    assert.equal(fila(`${general}\n\n${valor}\n`).ok, true);
  });

  test('dos resultados sin operación no son un cálculo', () => {
    assert.equal(fila(String.raw`\[
G=9
\]

\[
G=9.0
\]
`).ok, true);
  });

  test('dos fórmulas separadas por prosa no son una serie', () => {
    assert.equal(fila(String.raw`\[
G=0+0.9(1)+0.9^2(10)
\]

Después:

\[
G=9
\]
`).ok, true);
  });

  test('una etiqueta entre dos cuentas las separa, como en el texto', () => {
    assert.equal(fila(String.raw`\[
V=6+0.1(10-6)
\]

Error:

\[
V=6.4
\]
`).ok, true);
  });

  test('una cadena de igualdades en una sola fórmula es una fórmula, no una serie', () => {
    assert.equal(fila(String.raw`\[ x + 2 = 3 \;\Longrightarrow\; x = 3 - 2 \;\Longrightarrow\; x = 1 \]
`).ok, true);
  });

  test('una fórmula de display y un renglón de texto no forman una serie', () => {
    assert.equal(fila('$$z = 64 / 32$$\nz = 2\n').ok, true);
  });

  test('el markup de display dentro de una cerca de texto es texto, no fórmulas', () => {
    assert.equal(fila(String.raw`${cerca}text
\[ G=0+0.9(1) \]

\[ G=9 \]
${cerca}
`).ok, true);
  });

  test('fórmulas simbólicas seguidas no son cuentas', () => {
    assert.equal(fila(String.raw`$$z = \frac{x-\mu}{\sigma}$$

$$f(x) = \frac{1}{\sigma\sqrt{2\pi}}$$
`).ok, true);
  });
});
