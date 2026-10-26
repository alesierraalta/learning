// The example pages are the template the tutor copies: a broken walkthrough block or a missing
// scene.js would ship silently, because the page still renders everything else.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KIT = join(import.meta.dirname, "kit");
const pages = ["sql-parte-1.html", "sql-parte-2.html", "sql-parte-3.html"];

const read = (name) => readFileSync(join(KIT, "examples", name), "utf8");

for (const name of pages) {
  test(`${name}: the walkthrough is a well-formed list of steps`, () => {
    const html = read(name);
    const match = html.match(/<lk-walkthrough>\s*<script type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(match, `${name} has no lk-walkthrough block`);
    const spec = JSON.parse(match[1]);
    assert.ok(Array.isArray(spec.steps) && spec.steps.length > 0, `${name}: empty walkthrough`);
    assert.match(spec.viewBox ?? "", /^0 0 \d+ \d+$/, `${name}: missing viewBox`);
    for (const [i, step] of spec.steps.entries()) {
      assert.ok(step.title && step.text, `${name}: step ${i + 1} needs a title and a text`);
      assert.ok(step.scene && typeof step.scene === "object", `${name}: step ${i + 1} needs a scene`);
    }
  });

  test(`${name}: scene.js loads before kit.js`, () => {
    const html = read(name);
    if (!html.includes("<lk-walkthrough>")) return;
    const scene = html.indexOf('<script src="../kit/scene.js" defer></script>');
    const kit = html.indexOf('<script src="../kit/kit.js" defer></script>');
    assert.ok(scene > -1, `${name} never loads scene.js`);
    assert.ok(scene < kit, `${name} loads scene.js after kit.js`);
  });
}
