// What the gate refuses, and what it must leave alone.
import test from "node:test";
import assert from "node:assert/strict";
import { auditNote } from "../audit-note.mjs";

const figure = (scene) => `<lk-figure>\n<script type="application/json">${JSON.stringify(scene)}</script>\n</lk-figure>`;

test("a hand-written SVG is refused, wherever it starts", () => {
  const note = "# Parte\n\n<figure><svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg></figure>\n";
  const { violations } = auditNote(note, "parte.md");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^parte\.md:3 hand-written <svg>/);
});

test("a release note that talks about svg is not a drawing", () => {
  const note = "The note used to hold an <svg> element.\n\n" + figure({ viewBox: "0 0 360 290", arrows: [{ x1: 10, y1: 10, x2: 80, y2: 10 }] });
  assert.deepEqual(auditNote(note).violations, []);
});

test("a fill layered over an unknown background is refused", () => {
  const { violations } = auditNote("x\n<style>.a{fill:rgba(15,46,61,.06)}</style>\n");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /rgba\(15,46,61,\.06\)/);
});

test("meaning spelled as a character is refused, and the fix is named", () => {
  const note = figure({ viewBox: "0 0 360 290", grids: [{ cols: 3, rows: 1, w: 40, h: 40, cells: [{ c: 0, r: 0, label: "→" }] }] });
  const { violations } = auditNote(note);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /character "→".*kind "policy" with a direction/);
});

test("a key the engine cannot draw is named", () => {
  const note = figure({ viewBox: "0 0 360 290", arrow: [{ x1: 0, y1: 0, x2: 9, y2: 9 }] });
  assert.match(auditNote(note).violations[0], /names "arrow", which the engine cannot draw/);
});

test("a figure that is not JSON is refused with the parser's reason", () => {
  const note = "<lk-figure>\n<script type=\"application/json\">{oops}</script>\n</lk-figure>";
  assert.match(auditNote(note).violations[0], /figure 1 is not valid JSON/);
});

test("a note drawn through the engine passes and its figures are counted", () => {
  const note = ["# Parte", figure({ viewBox: "0 0 360 290", arrows: [{ x1: 10, y1: 10, x2: 80, y2: 10, label: "va" }] }), figure({ viewBox: "0 0 360 290", labels: [{ x: 4, y: 20, text: "Política" }] })].join("\n\n");
  const result = auditNote(note, "parte.md");
  assert.deepEqual(result.violations, []);
  assert.equal(result.figures, 2);
});

// The renderer refuses an entry it cannot read. The gate must name it before
// the note ships instead of passing a figure that would fail in the reader.
test("a figure whose entries the engine cannot draw is refused", () => {
  const scenes = [
    { grids: [{}] },
    { arrows: [{}] },
    { paths: [{}] },
    { boxes: [{}] },
    { labels: [{}] },
    { bars: { bars: [{}] } },
  ];
  for (const scene of scenes) {
    const { violations } = auditNote(figure({ viewBox: "0 0 360 290", ...scene }));
    assert.equal(violations.length, 1, JSON.stringify(scene));
    assert.match(violations[0], /figure 1 /, JSON.stringify(scene));
  }
});

// A well-typed scene that paints nothing is a blank box, not a figure.
test("a figure that would draw a blank box is refused", () => {
  const scenes = [
    { grids: [{ cols: 2, rows: 1, w: 40, h: 40, cells: [] }] },
    { bars: {} },
  ];
  for (const scene of scenes) {
    const { violations } = auditNote(figure({ viewBox: "0 0 360 290", ...scene }));
    assert.equal(violations.length, 1, JSON.stringify(scene));
    assert.match(violations[0], /draws nothing/, JSON.stringify(scene));
  }
});

// A semantic field the renderer refuses must fail closed in the gate too.
test("a figure with a tone, anchor, width or viewBox the engine cannot draw is refused", () => {
  const scenes = [
    { labels: [{ x: 1, y: 1, text: "a", tone: "purple" }] },
    { labels: [{ x: 1, y: 1, text: "a", anchor: "middle-ish" }] },
    { arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1, width: "wide" }] },
    { viewBox: "0 0 360", arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1 }] },
  ];
  for (const scene of scenes) {
    const { violations } = auditNote(figure({ viewBox: "0 0 360 290", ...scene }));
    assert.equal(violations.length, 1, JSON.stringify(scene));
    assert.match(violations[0], /tone|anchor|width|viewBox/, JSON.stringify(scene));
  }
  // Valid prior behavior still passes and counts.
  const valid = auditNote(figure({ viewBox: "0 0 360 290", labels: [{ x: 1, y: 1, text: "a", tone: "blue", anchor: "middle" }], arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1, width: 2 }] }));
  assert.deepEqual(valid.violations, []);
  assert.equal(valid.figures, 1);
});

// The engine draws a value cell from its own text, so the gate accepts it.
test("a value cell with its own text passes the gate", () => {
  const scene = { viewBox: "0 0 360 290", grids: [{ x: 1, y: 1, cols: 1, rows: 1, w: 40, h: 40, cells: [{ c: 0, r: 0, kind: "value", text: "V(s)" }] }] };
  const result = auditNote(figure(scene));
  assert.deepEqual(result.violations, []);
  assert.equal(result.figures, 1);
});
