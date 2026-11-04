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

// A warehouse is 4 columns by 3 rows: nine cells with an action, one wall and
// two exits. The deck assembles the field one arrow at a time, so the promise
// is read on the finished figure and the assembly is not punished.
const WAREHOUSE = [0, 1, 2].flatMap((row) => [0, 1, 2, 3].map((col) => ({ x: 16 + col * 88, y: 40 + row * 94, w: 56, h: 50, label: `c${row}${col}` })));
const FREE = WAREHOUSE.filter((c) => !(c.y === 134 && c.x === 104)).filter((c) => !(c.x === 280 && (c.y === 40 || c.y === 134)));
const WALLS = [{ x: 104, y: 134 }];
const EXITS = [{ x: 280, y: 40 }, { x: 280, y: 134 }];
const field = (n, extra = {}) => ({
  boxes: WAREHOUSE,
  policy: FREE.slice(0, n).map((c) => ({ x: c.x, y: c.y, w: 56, h: 50, dir: "up" })),
  ...extra,
});
const deckBeat = (steps) => ({ title: "campo", narration: "una flecha por casilla", visual: { deck: "d", steps } });
const deck = (scenes) => [{ title: "d", steps: scenes.map((scene) => ({ scene })) }];

test("a field that assembles to every free cell passes, walls and exits declared", () => {
  const steps = [field(1), field(3), field(5), field(9, { walls: WALLS, exits: EXITS })];
  assert.deepEqual(audit({ sections: [{ beats: [deckBeat([0, 1, 2, 3])] }] }, deck(steps)), []);
});

test("the same finished field fails when it declares no walls and no exits", () => {
  const steps = [field(9)];
  const found = audit({ sections: [{ beats: [deckBeat([0])] }] }, deck(steps));
  assert.equal(found.length, 1);
  assert.equal(found[0].phrase, "una flecha por casilla");
});

test("a finished field missing a cell fails even with its walls and exits declared", () => {
  const steps = [field(5, { walls: WALLS, exits: EXITS })];
  const found = audit({ sections: [{ beats: [deckBeat([0])] }] }, deck(steps));
  assert.equal(found.length, 1);
  assert.equal(found[0].phrase, "una flecha por casilla");
});

test("a declared wall that lands on no drawn cell fails instead of shrinking the count", () => {
  const steps = [field(9, { walls: [...WALLS, { x: 900, y: 900 }], exits: EXITS })];
  const found = audit({ sections: [{ beats: [deckBeat([0])] }] }, deck(steps));
  assert.equal(found.length, 1);
  assert.equal(found[0].phrase, "una flecha por casilla");
});

test("one arrow per cell means every cell, not three of them", () => {
  const cells = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 10 + i * 60, y: 10, w: 50, h: 40, label: `c${i}` }));
  const arrows = [0, 1, 2].map((i) => ({ x: 10 + i * 60, y: 10, w: 50, h: 40, dir: "up" }));
  const beat = { title: "campo parcial", narration: "una flecha por casilla", visual: { scene: { boxes: cells, policy: arrows, walls: [], exits: [] } } };
  const found = audit({ sections: [{ beats: [beat] }] }, []);
  assert.equal(found.length, 1);
  assert.equal(found[0].phrase, "una flecha por casilla");
});

test(
  "a number in the prose beside the drawing does not answer a drawn number",
  { skip: "pending decision: is the note pane a drawn label for this promise?" },
  () => {
  const beat = { title: "sin numeros dibujados", narration: "fijate en los numeros", visual: { scene: {}, text: "en el paso 2 veras que" } };
  const found = audit({ sections: [{ beats: [beat] }] }, []);
  assert.equal(found.length, 1);
  assert.equal(found[0].phrase, "numeros");
});

// The warehouse deck says what each tile is with the label it already draws,
// so the gate can read the figure instead of asking the spec to repeat it.
const ROLES = new Map([["104,134", "×"], ["280,40", "+1"], ["280,134", "−1"]]);
const LABELLED = WAREHOUSE.map((cell) => ({ ...cell, label: ROLES.get(`${cell.x},${cell.y}`) ?? "?" }));
const moves = (n) => FREE.slice(0, n).map((c) => ({ x: c.x, y: c.y, w: 56, h: 50, dir: "up" }));
const fieldBeat = (scene) => ({ title: "campo", narration: "una flecha por casilla", visual: { scene } });

test("a field whose tiles say what they are needs no declaration in the spec", () => {
  // 12 tiles: one wall, one exit, one hazard, nine cells with an action.
  assert.deepEqual(audit({ sections: [{ beats: [fieldBeat({ boxes: LABELLED, policy: moves(9) })] }] }, []), []);
});

test("the same field with five of its nine arrows drawn fails", () => {
  const found = audit({ sections: [{ beats: [fieldBeat({ boxes: LABELLED, policy: moves(5) })] }] }, []);
  assert.equal(found.length, 1);
  assert.match(found[0].missing, /puts one arrow on every remaining cell/);
});

test("an action drawn as a glyph inside its own tile counts as the arrow", () => {
  const drawn = FREE.slice(0, 9).map((c) => ({ x: c.x, y: c.y, w: 56, h: 50, label: "↑" }));
  const boxes = LABELLED.map((cell) => drawn.find((d) => d.x === cell.x && d.y === cell.y) || cell);
  assert.deepEqual(audit({ sections: [{ beats: [fieldBeat({ boxes })] }] }, []), []);
});

test("a label the gate cannot read fails in the open instead of shrinking the count", () => {
  const boxes = LABELLED.map((cell) => (cell.x === 16 && cell.y === 40 ? { ...cell, label: "norte" } : cell));
  const found = audit({ sections: [{ beats: [fieldBeat({ boxes, policy: moves(9) })] }] }, []);
  assert.equal(found.length, 1);
  assert.match(found[0].missing, /puts one arrow on every remaining cell/);
});
