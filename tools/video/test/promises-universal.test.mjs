// A sentence that quantifies over cells claims something about every one of
// them. The gate answered that only when the quantified thing was a drawing it
// counts, and stayed silent for the rest: "cada casilla con su acción" passed
// over a field with three of nine arrows drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { audit } from "../lib/promises.mjs";

const CELLS = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ x: 16 + col * 88, y: 40 + row * 94, w: 56, h: 50 })));
const moves = (n) => CELLS.slice(0, n).map((c) => ({ x: c.x, y: c.y, w: 56, h: 50, dir: "up" }));
const beat = (narration, scene) => ({ sections: [{ beats: [{ title: "campo", narration, visual: { scene } }] }] });
const report = (narration, scene) => audit(beat(narration, scene), []);

test("a universal claim the lexicon cannot answer is named, not passed", () => {
  const found = report("cada casilla con su acción", { boxes: CELLS, policy: moves(3) });
  assert.equal(found.length, 1);
  assert.match(found[0].missing, /a claim over every cell names "acción"/);
});

test("the same figure passes when the claim is one the gate can count", () => {
  assert.deepEqual(report("una flecha por casilla", { boxes: CELLS, policy: moves(9) }), []);
});

test("a beat that defines the term says so, and is not read as a promise", () => {
  const spec = { sections: [{ beats: [{ title: "campo", narration: "La política elige una acción por casilla: en la salida, subir.", promiseExceptions: ["acción"], visual: { scene: { boxes: CELLS, policy: moves(9) } } }] }] };
  assert.deepEqual(audit(spec, []), []);
});

test("a quantifier over cells that names no countable thing is prose, not a promise", () => {
  assert.deepEqual(report("Una regla de qué hacer en cada casilla:", { boxes: CELLS, policy: moves(3) }), []);
});

test("prose with no quantifier over cells makes no such claim", () => {
  assert.deepEqual(report("el robot sube y cobra menos cuatro centésimas", { boxes: CELLS, policy: moves(3) }), []);
});
