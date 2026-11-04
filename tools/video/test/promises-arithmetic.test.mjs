// Two silent failures in the one-arrow-per-cell arithmetic, found by the TSP on
// 2026-11-04. Both are RED on the code that shipped in #88 and both describe a
// figure a viewer would call complete.
import { test } from "node:test";
import assert from "node:assert/strict";
import { audit } from "../lib/promises.mjs";

// A 4x3 warehouse: nine cells with an action, one wall, one exit and one hazard.
const WAREHOUSE = [0, 1, 2].flatMap((row) => [0, 1, 2, 3].map((col) => ({ x: 16 + col * 88, y: 40 + row * 94, w: 56, h: 50 })));
const ROLES = new Map([["104,134", "×"], ["280,40", "+1"], ["280,134", "−1"]]);
const LABELLED = WAREHOUSE.map((cell) => ({ ...cell, label: ROLES.get(`${cell.x},${cell.y}`) ?? "?" }));
const FREE = LABELLED.filter((cell) => !ROLES.has(`${cell.x},${cell.y}`));
const WALLS = [{ x: 104, y: 134 }];
const EXITS = [{ x: 280, y: 40 }];
const HAZARDS = [{ x: 280, y: 134 }];
const moves = (n) => FREE.slice(0, n).map((c) => ({ x: c.x, y: c.y, w: 56, h: 50, dir: "up" }));
const fieldBeat = (scene) => ({ title: "campo", narration: "una flecha por casilla", visual: { scene } });
const violations = (scene) => audit({ sections: [{ beats: [fieldBeat(scene)] }] }, []);

// A robot is a tile like any other: it holds the action it chooses, so it is a
// remaining cell. Dropping it from the count while still counting the arrow it
// carries makes the arithmetic fail a figure that is complete.
test("a field that draws the robot in its own tile still passes", () => {
  const boxes = LABELLED.map((cell) => (cell.x === 16 && cell.y === 40 ? { ...cell, label: "R" } : cell));
  assert.deepEqual(violations({ boxes, policy: moves(9) }), []);
});

// The lexicon promises a field can "say which of its tiles are walls, exits and
// hazards". A declaration that can only name two of the three cannot describe
// the same figure the labels already describe.
test("a declared field names its hazards as well as its walls and exits", () => {
  const scene = { boxes: LABELLED, policy: moves(9), walls: WALLS, exits: EXITS, hazards: HAZARDS };
  assert.deepEqual(violations(scene), []);
});

// The labelled figure the tests above compare against, kept as a witness that
// the fixture itself is a complete field: it must pass with no declaration.
test("the labelled fixture is a complete field", () => {
  assert.deepEqual(violations({ boxes: LABELLED, policy: moves(9) }), []);
});

// The lexicon is closed, and the note's own narration says "una acción por
// casilla": the phrase names the arrows a viewer points at, and the gate reads
// only "casilla". An unknown drawing key is surfaced; an unknown spoken term is
// not, and the asymmetry lets a half-drawn field through. The first assertion is
// the control: the same field IS refused when the phrase is "flecha", so the
// probe can fail and this is not a blind check.
const speak = (narration, scene) => audit({ sections: [{ beats: [{ title: "campo", narration, visual: { scene } }] }] }, []);

test("a spoken claim about one action per cell is read, not ignored", { skip: "waiting on the content decision: the phrase is also how a beat DEFINES the policy, over three boxes, so reading it as a claim about a drawn field rejects a legitimate sentence" }, () => {
  const half = { boxes: LABELLED, policy: moves(3) };
  assert.notDeepEqual(speak("una flecha por casilla", half), [], "control: three of nine arrows must be refused");
  assert.notDeepEqual(speak("una acción por casilla", half), [], "the same figure must be refused when the voice says acción");
});
