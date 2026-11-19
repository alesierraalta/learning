// #386: a fenced code block is a code container, not indented prose. The
// learner read the three ```sql blocks of the PL/SQL note as body text because
// app.css drew every `pre` with no surface, no border and no padding. This gate
// builds the real part page (view/app.css + kit.css, the same asset order as the
// bridge) with the note's three blocks, an inline `code` and a Mermaid fence, and
// measures the container in the three papers the learner uses at 960 px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from './reader-fit.test.mjs';

const THEMES = ['light', 'dark', 'black'];
const WIDTH = 960;

// The three ```sql blocks of /tmp/realnote/plsql-p1.md, trimmed to their lines,
// plus the inline `PA_Ventas` and the sequence diagram that closes the note.
const NOTE = [
  '# Parte 1 — Paquetes PL/SQL', '',
  'En nuestro ejemplo, `PA_Ventas` reúne las ventas.', '',
  '```sql',
  '-- ESPECIFICACIÓN (Lo visible para cualquier sesión)',
  'CREATE OR REPLACE PACKAGE PA_Ventas AS',
  '  FUNCTION orden_existe(p_orden_id NUMBER) RETURN BOOLEAN;',
  '  PROCEDURE dar_alta_item(p_orden_id NUMBER, p_prod_id NUMBER, p_cantidad NUMBER);',
  'END PA_Ventas;',
  '```', '',
  'Cualquier sesión externa solo invoca lo publicado.', '',
  '```sql',
  '-- Desde otra sesión conectada a la base de datos:',
  'BEGIN',
  '  IF PA_Ventas.orden_existe(101) THEN',
  '    PA_Ventas.dar_alta_item(101, 77, 2);',
  '  END IF;',
  'END;',
  '```', '',
  'Una función privada es invisible fuera.', '',
  '```sql',
  'CREATE OR REPLACE PACKAGE BODY PA_Ventas AS',
  '  FUNCTION orden_existe(p_orden_id NUMBER) RETURN BOOLEAN IS',
  '    v_total NUMBER;',
  '  BEGIN',
  '    SELECT COUNT(*) INTO v_total FROM ordenes WHERE id = p_orden_id;',
  '    RETURN v_total > 0;',
  '  END orden_existe;',
  'END PA_Ventas;',
  '```', '',
  '```mermaid',
  'sequenceDiagram',
  '  autonumber',
  '  actor Sesion as Sesión Externa',
  '  participant Spec as PA_Ventas (SPEC)',
  '  Sesion->>Spec: orden_existe(101)',
  '  Spec-->>Sesion: verdadero',
  '```', '',
].join('\n');

/** Everything the gate measures, read from the page that actually painted. */
function measure() {
  const page = getComputedStyle(document.documentElement);
  const paper = page.backgroundColor;
  const box = (node) => {
    const s = getComputedStyle(node);
    const px = (v) => parseFloat(v) || 0;
    return {
      background: s.backgroundColor,
      borderTop: { width: px(s.borderTopWidth), style: s.borderTopStyle, color: s.borderTopColor },
      borderRight: { width: px(s.borderRightWidth), style: s.borderRightStyle, color: s.borderRightColor },
      borderBottom: { width: px(s.borderBottomWidth), style: s.borderBottomStyle, color: s.borderBottomColor },
      borderLeft: { width: px(s.borderLeftWidth), style: s.borderLeftStyle, color: s.borderLeftColor },
      radius: px(s.borderTopLeftRadius),
      padding: { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) },
      overflowX: s.overflowX,
      fontFamily: s.fontFamily,
      fontSize: px(s.fontSize),
      label: getComputedStyle(node, '::before').content,
    };
  };
  return {
    paper,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    blocks: [...document.querySelectorAll('.prose pre > code')].map((code) => box(code.parentElement)),
    inline: [...document.querySelectorAll('.prose :not(pre) > code')].map((code) => box(code)),
    mermaid: {
      figures: document.querySelectorAll('.prose .mermaid').length,
      pre: document.querySelectorAll('.prose pre.mermaid').length,
      codeContainer: [...document.querySelectorAll('.prose .mermaid')]
        .filter((node) => getComputedStyle(node).borderTopWidth !== '0px').length,
    },
  };
}

test('every fenced code block of a part is a code container at 960 px', async (t) => {
  for (const theme of THEMES) {
    const at = `${theme}/${WIDTH}`;
    const page = await open(theme, WIDTH, NOTE);
    t.after(() => page.close());
    const m = await page.evaluate(measure);

    assert.equal(page.errors.length, 0, `${at}: page errors: ${page.errors.join(', ')}`);
    assert.equal(m.blocks.length, 3, `${at}: expected the note's three SQL blocks, found ${m.blocks.length}`);
    assert.ok(m.overflow <= 1, `${at}: horizontal overflow of ${m.overflow}px`);

    for (const [index, block] of m.blocks.entries()) {
      const who = `${at} bloque ${index + 1}`;
      // A surface tinted from the paper: never transparent, never the page itself.
      assert.notEqual(block.background, 'rgba(0, 0, 0, 0)', `${who}: the code container has no background`);
      assert.notEqual(block.background, 'transparent', `${who}: the code container has no background`);
      assert.notEqual(block.background, m.paper, `${who}: the code container is the page, not a surface`);
      // A full hairline, not a left accent stripe: all four sides visible.
      for (const side of ['borderTop', 'borderRight', 'borderBottom', 'borderLeft']) {
        assert.ok(block[side].width >= 1, `${who}: ${side} is ${block[side].width}px`);
        assert.ok(['solid', 'dashed', 'dotted'].includes(block[side].style), `${who}: ${side} is ${block[side].style}`);
        assert.notEqual(block[side].color, 'rgba(0, 0, 0, 0)', `${who}: ${side} is transparent`);
      }
      assert.ok(block.radius >= 6, `${who}: radius is ${block.radius}px`);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        assert.ok(block.padding[side] >= 12, `${who}: padding-${side} is ${block.padding[side]}px`);
      }
      assert.ok(['auto', 'scroll'].includes(block.overflowX), `${who}: a long line is clipped, overflow-x is ${block.overflowX}`);
      assert.match(block.fontFamily, /mono/i, `${who}: the code container is not in the mono face`);
      assert.ok(block.fontSize >= 13, `${who}: code prints at ${block.fontSize}px`);
      // The fence's language is named at the top of the container.
      assert.match(block.label.toLowerCase(), /sql/, `${who}: the language label is «${block.label}»`);
    }

    // Inline code stays inline: it is a word in the sentence, not a box.
    assert.ok(m.inline.length >= 1, `${at}: the inline code word is missing`);
    for (const [index, inline] of m.inline.entries()) {
      const who = `${at} inline ${index + 1}`;
      assert.ok(['rgba(0, 0, 0, 0)', 'transparent'].includes(inline.background), `${who}: inline code paints a background`);
      for (const side of ['borderTop', 'borderRight', 'borderBottom', 'borderLeft']) {
        assert.equal(inline[side].width, 0, `${who}: inline code has a ${side} border`);
      }
      assert.deepEqual(inline.padding, { top: 0, right: 0, bottom: 0, left: 0 }, `${who}: inline code has padding`);
    }

    // Mermaid is a figure, not a code block: no `pre`, no code container.
    assert.ok(m.mermaid.figures >= 1, `${at}: the Mermaid diagram is missing`);
    assert.equal(m.mermaid.pre, 0, `${at}: Mermaid still renders inside a pre`);
    assert.equal(m.mermaid.codeContainer, 0, `${at}: Mermaid is drawn as a code container`);
  }
});
