// The arrowhead is the one piece of the stage that is geometry, not layout:
// buildLayer turns a line's `marker-end` into a polygon whose apex sits on the
// path's end point, rotated to the path's direction. If the base is placed in
// front of the apex the triangle points backwards, and every arrow in every
// part silently reads the opposite way — which is exactly what shipped: the
// viewer asked for an up arrow and never saw one.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const STAGE = new URL("../src/page/stage.js", import.meta.url);
const source = readFileSync(STAGE, "utf8");

const pointsOf = (markup) =>
  markup
    .match(/setAttribute\("points", "([^"]+)"\)/)[1]
    .split(" ")
    .map((pair) => pair.split(",").map(Number));

const rotate = ([x, y], degrees) => {
  const rad = (degrees * Math.PI) / 180;
  return [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
};

// A head belongs to a path that ends travelling in `dir`: the apex must be the
// point furthest along that direction, or the arrow says the opposite.
const apexLeads = (dir) => {
  const [dx, dy] = dir;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const along = pointsOf(source).map(([x, y]) => {
    const [rx, ry] = rotate([x, y], angle);
    return rx * dx + ry * dy;
  });
  return along[0] === Math.max(...along) && along[0] > Math.min(...along);
};

test("the arrowhead points the way its line travels", () => {
  assert.ok(apexLeads([1, 0]), "a rightward line must not end in a left-pointing head");
  assert.ok(apexLeads([0, -1]), "an upward line must end in an up-pointing head");
  assert.ok(apexLeads([-1, 0]));
  assert.ok(apexLeads([0, 1]));
  assert.ok(apexLeads([Math.SQRT1_2, -Math.SQRT1_2]));
});
