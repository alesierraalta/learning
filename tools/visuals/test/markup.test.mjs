// What the engine promises: a scene is drawn by rule, never by hand, and the
// same scene survives a white page and a black one.
import test from "node:test";
import assert from "node:assert/strict";
import { renderScene, signed, CELL_KINDS } from "../markup.mjs";
import { mix, contrast } from "../color.mjs";
import { placeLabel } from "../place.mjs";
import { THEMES } from "../theme.mjs";

const grid = (cells, extra = {}) => ({ viewBox: "0 0 360 290", grids: [{ x: 20, y: 20, cols: 3, rows: 2, w: 100, h: 90, cells, ...extra }] });
const field = (n) => Array.from({ length: n }, (_, i) => ({ c: i % 3, r: Math.floor(i / 3), kind: "policy", dir: "up" }));

test("an arrow is a path with a real head, never a keyboard glyph", () => {
  const svg = renderScene({ arrows: [{ x1: 20, y1: 20, x2: 200, y2: 20, tone: "blue", label: "va" }] }, { theme: "light", mode: "static" });
  assert.match(svg, /<path d="M20 20 L200 20"[^>]*marker-end="url\(#head-blue\)"/);
  assert.doesNotMatch(svg, /[→↑←↓]/);
});

test("no fill is layered with alpha over an unknown background", () => {
  const svg = renderScene(grid(field(6)), { theme: "light", mode: "static" });
  assert.doesNotMatch(svg, /rgba\(/);
  assert.match(svg, /#(?:[0-9a-f]{6})/);
});

test("a fill leans toward its own paper: darker on white, lighter on black", () => {
  const cell = grid([{ c: 0, r: 0, kind: "wall" }]);
  const light = renderScene(cell, { theme: "light", mode: "static" });
  const dark = renderScene(cell, { theme: "dark", mode: "static" });
  const fillOf = (svg) => svg.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i)[1];
  const lighterThanPaper = (fill, paper) => contrast(fill, paper) > 1.05;
  assert.ok(lighterThanPaper(THEMES.light.paper, fillOf(light)) || contrast(fillOf(light), THEMES.light.paper) > 1.05, "the light fill separates from its paper");
  assert.ok(contrast(fillOf(dark), THEMES.dark.paper) > 1.05, "the dark fill separates from its dark paper");
  assert.ok(contrast(fillOf(dark), THEMES.dark.paper) < contrast(THEMES.dark.ink, THEMES.dark.paper), "and stays quieter than the ink");
});

test("a grid draws every cell it declares", () => {
  assert.equal(renderScene(grid(field(6)), { mode: "static" }).match(/<rect/g).length, 6);
  assert.equal(renderScene(grid(field(12), { cols: 4, rows: 3 }), { mode: "static" }).match(/<rect/g).length, 12);
});

test("a cell kind the engine does not have is refused, with its place", () => {
  assert.throws(() => renderScene(grid([{ c: 0, r: 1, kind: "sparkle" }])), /"sparkle" at \(0,1\)/);
});

test("a policy with no direction is refused instead of drawn blank", () => {
  assert.throws(() => renderScene(grid([{ c: 1, r: 0, kind: "policy" }])), /policy with no direction at \(1,0\)/);
});

test("a tone the theme does not have is refused", () => {
  assert.throws(() => renderScene({ arrows: [{ x1: 0, y1: 0, x2: 10, y2: 0, tone: "purple" }] }), /tone the theme does not have: "purple"/);
});

test("a theme or a mode the engine does not have is refused", () => {
  assert.throws(() => renderScene({}, { theme: "sepia" }), /unknown theme "sepia"/);
  assert.throws(() => renderScene({}, { mode: "sketch" }), /unknown mode "sketch"/);
});

test("numbers read as the lesson writes them", () => {
  assert.equal(signed(0.52), "+0,52");
  assert.equal(signed(-0.4), "−0,40");
  assert.equal(signed(1), "+1,00");
  assert.throws(() => signed("ocho"), /not a number/);
});

test("a label is placed by rule, clear of the boxes it would cover", () => {
  const spot = placeLabel([{ x: 40, y: 40, w: 120, h: 60 }], { x1: 10, y1: 70, x2: 220, y2: 70, label: "recompensa" }, 17);
  const overlapsBox = spot.x < 160 && spot.x + 120 > 40 && spot.y < 100 && spot.y + 20 > 40;
  assert.ok(!overlapsBox, `the label lands on the box: ${JSON.stringify(spot)}`);
});

test("the live drawing asks the reader's theme instead of baking a colour", () => {
  const svg = renderScene(grid(field(3)), { theme: "light", mode: "vars" });
  assert.match(svg, /var\(--v-blue\)/);
  assert.match(svg, /stroke="var\(--v-line\)"/);
  assert.match(svg, /color-mix\(in srgb, var\(--v-blue\) 5%, var\(--v-paper\)\)/);
  assert.match(svg, /@media\(prefers-color-scheme:dark\)/);
  assert.match(svg, /\[data-theme="dark"\] svg/);
});

test("a curve keeps its own shape but borrows the engine's ink and head", () => {
  const svg = renderScene({ paths: [{ d: "M 10 10 C 30 40 60 40 80 10" }] }, { mode: "vars" });
  assert.match(svg, /d="M 10 10 C 30 40 60 40 80 10"/);
  assert.match(svg, /stroke="var\(--v-ink\)"/);
  assert.match(svg, /marker-end="url\(#head-ink\)"/);
  assert.throws(() => renderScene({ paths: [{}] }), /a path needs a d attribute/);
});

test("every cell kind the engine advertises is a colour it can draw", () => {
  for (const kind of CELL_KINDS) {
    const svg = renderScene(grid([{ c: 0, r: 0, kind, dir: "up", value: -0.4 }]), { mode: "static" });
    assert.ok(svg.length > 100, `${kind} draws something`);
  }
});
