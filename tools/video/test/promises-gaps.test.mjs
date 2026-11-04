// The gate promises that no beat may say what its own frames do not draw.
// These four cases are silent passes: the narration makes a promise and the
// gate reports nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { promisesOf, audit } from "../lib/promises.mjs";

const ids = (narration) => promisesOf(narration).map((p) => p.id);

test("a spoken term makes its promise in the plural too", () => {
  assert.deepEqual(ids("mira las flechas"), ["arrow"]);
  assert.deepEqual(ids("mira las barras"), ["bar"]);
  assert.deepEqual(ids("una flecha por casilla"), ["arrow-per-cell", "cell"]);
  assert.deepEqual(ids("mira las tablas de arriba"), ["table"]);
});

test("a term written with a decomposed accent still makes its promise", () => {
  assert.deepEqual(ids("mira los n\u00fameros"), ["numeral"]);
  assert.deepEqual(ids("mira los nu\u0301meros"), ["numeral"]);
  assert.deepEqual(ids("mira la f\u00f3rmula"), ["equation"]);
  assert.deepEqual(ids("mira la fo\u0301rmula"), ["equation"]);
});

test(
  "one arrow per cell means every cell, not three of them",
  { skip: "pending decision: does the gate require every cell, or accept a drawn field?" },
  () => {
  const cells = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 10 + i * 60, y: 10, w: 50, h: 40, label: `c${i}` }));
  const arrows = [0, 1, 2].map((i) => ({ x: 10 + i * 60, y: 10, w: 50, h: 40, dir: "up" }));
  const beat = { title: "campo parcial", narration: "una flecha por casilla", visual: { scene: { boxes: cells, policy: arrows } } };
  const found = audit({ sections: [{ beats: [beat] }] }, []);
  assert.equal(found.length, 1);
  assert.equal(found[0].promise, "arrow-per-cell");
});

test(
  "a number in the prose beside the drawing does not answer a drawn number",
  { skip: "pending decision: is the note pane a drawn label for this promise?" },
  () => {
  const beat = { title: "sin numeros dibujados", narration: "fijate en los numeros", visual: { scene: {}, text: "en el paso 2 veras que" } };
  const found = audit({ sections: [{ beats: [beat] }] }, []);
  assert.equal(found.length, 1);
  assert.equal(found[0].promise, "numeral");
});
