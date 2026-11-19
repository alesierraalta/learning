// #356: the studio's icons are Lucide's own 24x24 stroke data. These tests read the map in the
// page itself: a hand-drawn path or a changed key has to fail here, not on the learner's screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, "ui", "studio.js");
const source = readFileSync(STUDIO, "utf8");
const block = source.match(/const ICONS = \{([\s\S]*?)\n  \};/);
assert.ok(block, `could not extract the ICONS map from ${STUDIO}`);
const entries = [...block[1].matchAll(/^\s*([a-z]+):\s*'([^']*)'\s*,?\s*$/gm)];
assert.ok(entries.length > 0, `could not read the entries of the ICONS map in ${STUDIO}`);
const icons = Object.fromEntries(entries.map(([, key, markup]) => [key, markup]));

const KEYS = [
  "back", "next", "book", "play", "app", "chat", "pencil", "refresh", "send", "check", "x", "more",
  "stop", "fresh", "restart", "quiz", "doc", "deck", "spark", "map", "fit", "settings", "upload", "link",
  "moon", "sun",
];

// Lucide's sparkles, the closest official icon to the old eight-ray burst without a centre.
const SPARKLES =
  '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />' +
  '<path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />';

test("every icon key is still present with non-empty markup", () => {
  assert.deepEqual(Object.keys(icons).sort(), [...KEYS].sort());
  for (const key of KEYS) {
    assert.ok(Object.hasOwn(icons, key), `${key} is missing from the ICONS map`);
    assert.equal(typeof icons[key], "string", `${key} is not a string`);
    assert.ok(icons[key].length > 0, `${key} is empty`);
  }
});

test("the icons are stroke primitives that inherit currentColor", () => {
  for (const [key, markup] of Object.entries(icons)) {
    const tags = markup.match(/<[^>]*>/g) ?? [];
    assert.ok(tags.length > 0, `${key} has no SVG primitives`);
    assert.equal(markup.replace(/<[^>]*>/g, "").trim(), "", `${key} has markup outside its primitives`);
    for (const tag of tags) {
      assert.match(tag, /^<(path|circle|rect|line|polyline|polygon)\b/, `${key} uses a non-stroke primitive: ${tag}`);
      const fill = tag.match(/\sfill\s*=\s*["']([^"']*)["']/);
      if (fill) assert.equal(fill[1], "none", `${key} must not paint a fill: ${tag}`);
    }
    assert.ok(!markup.includes("#"), `${key} has a colour literal`);
  }
});

// Lucide's link and upload (lucide-static v1.74.0), used by the Materias UI.
const LINK =
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />' +
  '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />';
const UPLOAD =
  '<path d="M12 3v12" /><path d="m17 8-5-5-5 5" />' +
  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />';

test("spark is Lucide's sparkles", () => {
  assert.equal(icons.spark, SPARKLES);
});

test("link is Lucide's link", () => {
  assert.equal(icons.link, LINK);
});

test("upload is Lucide's upload", () => {
  assert.equal(icons.upload, UPLOAD);
});
