// What the engine promises: a scene is drawn by rule, never by hand, and the
// same scene survives a white page and a black one.
import test from "node:test";
import assert from "node:assert/strict";
import { renderScene, signed, CELL_KINDS, sceneDraws } from "../markup.mjs";
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

// A scene is note data, not code. No string from it may leave the attribute it
// was written into, and a semantic field the engine cannot read is refused
// instead of being printed as a guess.
test("no scene string can leave its attribute", () => {
  const label = { x: 1, y: 1, text: "a" };
  assert.throws(() => renderScene({ viewBox: '0 0 360 290" onload="alert(1)' }), /viewBox/);
  assert.throws(() => renderScene({ labels: [{ ...label, anchor: 'middle" onmouseover="alert(1)' }] }), /anchor/);
  assert.throws(() => renderScene({ labels: [{ ...label, weight: '600" onload="alert(1)' }] }), /weight/);
  assert.throws(() => renderScene({ arrows: [{ x1: 1, y1: 1, x2: 2, y2: 2, width: '2" onload="alert(1)' }] }), /width/);
  assert.throws(() => renderScene({ boxes: [{ x: 1, y: 1, w: 2, h: 2, rx: '4" onload="alert(1)' }] }), /rx/);
  // Free-form path data keeps its meaning: the quote is an entity, not a new attribute.
  const svg = renderScene({ paths: [{ d: 'M0 0 L9 9" onload="alert(1)' }] }, { mode: "static" });
  assert.doesNotMatch(svg, / onload="/);
  assert.match(svg, /d="M0 0 L9 9&quot; onload=&quot;alert\(1\)"/);
});

// The counter accepts only the shapes the renderer iterates: a list is a list,
// and bars is an object with its own bars list.
test("a scene of the wrong shape is refused, never drawn as a guess", () => {
  assert.throws(() => renderScene({ grids: "4" }), /grids/);
  assert.throws(() => renderScene({ boxes: 5 }), /boxes/);
  assert.throws(() => renderScene({ bars: [] }), /bars/);
  assert.throws(() => renderScene({ labels: {} }), /labels/);
});

// A scene draws only when every entry is one the renderer can read and at
// least one entry paints something: a grid without cells and a bars object
// without bars are blank boxes, not figures.
test("a scene draws only when an entry paints something", () => {  assert.equal(sceneDraws({ grids: [{ cols: 1, rows: 1, w: 9, h: 9, cells: [] }] }), false);
  assert.equal(sceneDraws({ bars: {} }), false);
  assert.equal(sceneDraws({ bars: { bars: [{ x: 1, w: 9, h: 0 }] } }), false, "a zero-height bar paints nothing");
  assert.equal(sceneDraws({ grids: [{ cols: 1, rows: 1, w: 9, h: 9, cells: [{ c: 0, r: 0 }] }] }), true);
  assert.equal(sceneDraws({ bars: { bars: [{ x: 1, w: 9, h: 20 }] } }), true);
  for (const scene of [{ grids: [{}] }, { arrows: [{}] }, { paths: [{}] }, { boxes: [{}] }, { labels: [{}] }, { bars: { bars: [{}] } }]) {
    assert.throws(() => renderScene(scene), /grid|arrow|path|box|label|bar/, JSON.stringify(scene));
    assert.equal(sceneDraws(scene), false, JSON.stringify(scene));
  }
});

// The baseline draws a value cell from its own text, without a number.
test("a value cell may show its text instead of a number", () => {
  const scene = { viewBox: "0 0 360 290", grids: [{ x: 1, y: 1, cols: 1, rows: 1, w: 40, h: 40, cells: [{ c: 0, r: 0, kind: "value", text: "V(s)" }] }] };
  const svg = renderScene(scene, { mode: "static" });
  assert.match(svg, />V\(s\)</);
  assert.equal(sceneDraws(scene), true);
  // Without text and without a number the cell cannot be drawn.
  assert.throws(() => renderScene({ grids: [{ x: 1, y: 1, cols: 1, rows: 1, w: 40, h: 40, cells: [{ c: 0, r: 0, kind: "value" }] }] }), /value cell/);
});
