// #392: the tutor writes formulas inline in prose (`\(S_t\)`, `\(R_{t+1}\)`,
// `\[ … \]`, `$$ … $$`) and the reader showed them as raw TeX: KaTeX only ran
// inside `<lk-math>`. This gate builds the real part page (view/app.css + kit.css,
// the same asset order as the bridge) with the RL note's prose, a code span and a
// SQL block that keep `\(x\)` literal, a Mermaid fence and a money sentence, and
// checks the three papers the learner uses at 960 px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from './reader-fit.test.mjs';

const THEMES = ['light', 'dark', 'black'];
const WIDTH = 960;

// The prose of /tmp/realnote/rl-p1.md, trimmed to the sentences that carry a
// formula, plus the four ways a formula can reach the reader: inline `\(…\)`,
// display `\[…\]`, display `$$…$$`, and the same text inside code, which is code.
const NOTE = [
  '# Parte 1 — Aprendizaje por refuerzo', '',
  'El **estado \\(S_t\\)** describe la situación actual.', '',
  'La recompensa \\(R_{t+1}\\) califica el resultado inmediato.', '',
  'Dos fórmulas en la misma frase: de \\(a\\) a \\(b\\).', '',
  'La suma de recompensas descontadas:', '',
  '\\[ G_t = R_{t+1} + \\gamma R_{t+2} + \\cdots \\]', '',
  'Y su valor esperado:', '',
  '$$ V^\\pi(s) = \\mathbb{E}_\\pi [ G_t \\mid S_t = s ] $$', '',
  'La variable `\\(x\\)` de un código en línea sigue literal.', '',
  '```sql',
  '-- esto es código: \\(x\\) sigue literal',
  'SELECT * FROM estados;',
  '```', '',
  '```mermaid',
  'flowchart LR',
  '  A["S_t"] --> B["R_{t+1}"]',
  '```', '',
  'El café cuesta $5 y $10 el doble.', '',
].join('\n');

/** What the reader actually painted, measured in the page. */
function measure() {
  const prose = document.querySelector('.prose');
  // The prose text without the places a formula is allowed to be code or a formula.
  const clone = prose.cloneNode(true);
  clone.querySelectorAll('code, pre, script, style, textarea, .katex, .katex-display, lk-math').forEach((node) => node.remove());
  clone.querySelectorAll('*').forEach((node) => {
    if (node.tagName.startsWith('LK-')) node.remove();
  });
  const inlineMath = [...prose.querySelectorAll('.katex')];
  const color = (node) => getComputedStyle(node).color;
  return {
    katex: inlineMath.length,
    display: prose.querySelectorAll('.math-display .katex').length,
    proseText: clone.textContent.replace(/\s+/g, ' ').trim(),
    inlineCode: [...prose.querySelectorAll(':not(pre) > code')].map((code) => code.textContent),
    blockCode: [...prose.querySelectorAll('pre > code')].map((code) => code.textContent),
    mermaid: prose.querySelectorAll('.mermaid svg').length,
    rawMermaid: prose.querySelectorAll('pre.mermaid, code.language-mermaid').length,
    // KaTeX paints the ink of the words it sits in, not a color of its own.
    ink: inlineMath.map((node) => ({ formula: color(node), prose: color(node.parentElement) })),
  };
}

test('prose formulas render with KaTeX in every paper at 960 px', async (t) => {
  for (const theme of THEMES) {
    const at = `${theme}/${WIDTH}`;
    const page = await open(theme, WIDTH, NOTE);
    t.after(() => page.close());
    await page.waitForFunction(() => document.querySelectorAll('.prose .katex').length >= 6, null, { timeout: 20000 });
    const m = await page.evaluate(measure);

    assert.equal(page.errors.length, 0, `${at}: page errors: ${page.errors.join(', ')}`);

    // The two inline formulas and the two display formulas are drawn.
    assert.ok(m.katex >= 6, `${at}: expected 6 formulas, found ${m.katex}`);
    assert.ok(m.display >= 2, `${at}: expected 2 display formulas, found ${m.display}`);

    // No delimiter reaches the learner as prose text.
    for (const raw of ['\\(', '\\)', '\\[', '\\]', '$$']) {
      assert.ok(!m.proseText.includes(raw), `${at}: raw TeX «${raw}» is still prose: ${m.proseText}`);
    }
    assert.match(m.proseText, /El estado describe la situación actual\./, `${at}: the sentence lost its math or its words`);
    assert.match(m.proseText, /La recompensa califica el resultado inmediato\./, `${at}: the reward sentence broke`);

    // Code is code: the delimiters stay exactly as the note wrote them.
    assert.ok(m.inlineCode.some((code) => code.includes('\\(x\\)')), `${at}: the inline code lost its literal \\(x\\): ${m.inlineCode.join(' | ')}`);
    assert.ok(m.blockCode.some((code) => code.includes('\\(x\\)')), `${at}: the SQL block lost its literal \\(x\\): ${m.blockCode.join(' | ')}`);

    // Mermaid still replaces its fence with a drawing.
    assert.equal(m.mermaid, 1, `${at}: the Mermaid fence did not render`);
    assert.equal(m.rawMermaid, 0, `${at}: the Mermaid fence is still raw`);

    // A single dollar is money, not math.
    assert.match(m.proseText, /cuesta \$5 y \$10 el doble\./, `${at}: the money sentence changed`);

    // KaTeX inherits the reader's ink: same color as the prose around it.
    for (const ink of m.ink) assert.equal(ink.formula, ink.prose, `${at}: the formula paints ${ink.formula} where its prose paints ${ink.prose}`);
  }
});
