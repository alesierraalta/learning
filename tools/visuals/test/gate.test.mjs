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
