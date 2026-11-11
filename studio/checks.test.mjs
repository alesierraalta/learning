// The studio measures a part itself before a turn is offered as done: these are the checks' own
// tests. They run the repo's real tools on real notes, because the point of the feature is that the
// learner's part was measured — a fake measurement would prove nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findingsOf, runPartChecks } from "./checks.ts";

/** `scene-lint` opens a browser; without one there is nothing to measure and nothing to prove. */
const browser = await (async () => {
  for (const id of [process.env.PLAYWRIGHT_MODULE, "playwright"].filter(Boolean)) {
    try {
      await import(id);
      return true;
    } catch {
      // Try the next entry point.
    }
  }
  return false;
})();
const needsBrowser = browser ? false : "playwright not installed";

const dir = mkdtempSync(join(tmpdir(), "part-checks-"));

/** A part whose arrow runs over the words it is supposed to point past: `trazo-sobre-texto`. */
const BROKEN = `# Parte 1 — Capas

## Ruta

1. Qué es una capa.
2. Cómo se encapsula.
3. Por qué importa.

## 1. La capa

Una capa hace una cosa y la esconde del resto.

El ejemplo sigue: el robot aspira la sala.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 230","title":"La flecha sobre el texto","scene":{"boxes":[
{"x":8,"y":64,"w":196,"h":110,"label":"A","tone":"blue"},
{"x":556,"y":64,"w":196,"h":110,"label":"B","tone":"green"}],
"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"tone":"blue","width":3}],
"labels":[{"x":380,"y":128,"text":"encima","size":26}]}}
</script>
</lk-scene>

## Mini-quiz

1. ¿Qué hace una capa?
`;

/** The same part with its words beside the arrow: the three tools pass it. */
const CLEAN = BROKEN.replace(
  '"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"tone":"blue","width":3}],\n"labels":[{"x":380,"y":128,"text":"encima","size":26}]',
  '"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"label":"acción","tone":"blue","width":3,"labelAt":0.5}]',
);

function note(name, body) {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

test("a part whose arrow crosses its own text is a finding, in the tool's words", { skip: needsBrowser }, async () => {
  const file = note("rota.md", BROKEN);
  const checked = await runPartChecks([file]);
  assert.equal(checked.kind, "findings", JSON.stringify(checked));
  assert.equal(checked.first, "trazo-sobre-texto: encima", "the first finding is the tool's own line");
  const scene = checked.tools.find((found) => found.tool === "scene-lint.mjs");
  assert.ok(scene, "scene-lint is what measured the figure");
  assert.match(scene.output, /bloque 1 — La flecha sobre el texto/, "its output is kept whole for the tutor");
  assert.ok(checked.count >= 2, `scene-lint and explain-check both name it: ${checked.count}`);
  assert.ok(
    checked.tools.some((found) => found.tool === "explain-check.mjs"),
    "the standard is measured too, not only the figure",
  );
});

test("a part that passes the three tools is clean", { skip: needsBrowser }, async () => {
  const checked = await runPartChecks([note("limpia.md", CLEAN)]);
  assert.deepEqual(checked, { kind: "clean" });
});

test("a tool that cannot run is a check failure, not a finding for the tutor", async () => {
  // No tools at all: the studio's own Node cannot start them, which is nobody's part.
  const empty = mkdtempSync(join(tmpdir(), "no-tools-"));
  const checked = await runPartChecks([note("sin-herramientas.md", BROKEN)], { toolsDir: empty });
  assert.equal(checked.kind, "crashed", JSON.stringify(checked));
  assert.equal(checked.failures.length, 3, "every tool reports its own failure");
  assert.match(checked.failures[0], /scene-lint\.mjs no pudo medir sin-herramientas\.md/);
});

test("a tool that fails without naming a finding is a failure, not an empty finding", async () => {
  // A tool that throws: exit 1 with a stack trace and no finding line. Reading that as "findings"
  // would send the tutor to fix a part the tool never measured.
  const broken = mkdtempSync(join(tmpdir(), "throwing-tools-"));
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, "scene-lint.mjs"), "throw new Error('boom');\n");
  writeFileSync(join(broken, "deck-gate.mjs"), "process.exit(0);\n");
  writeFileSync(join(broken, "explain-check.mjs"), "process.exit(0);\n");
  const checked = await runPartChecks([note("lanza.md", BROKEN)], { toolsDir: broken });
  assert.equal(checked.kind, "crashed", JSON.stringify(checked));
  assert.equal(checked.failures.length, 1);
  assert.match(checked.failures[0], /scene-lint\.mjs no pudo medir lanza\.md/);
  assert.match(checked.failures[0], /boom/, "the reason is kept for the log");
});

test("the deck gate's own report is read as findings", () => {
  const output = `${JSON.stringify({ decks: 1, problems: 1, bad: [{ note: "x.md", deck: 1, step: 2, kind: "text-over-arrow", over: 0, text: "encima" }] }, null, 1)}\nGATE FAILED\n`;
  assert.deepEqual(findingsOf("deck-gate.mjs", output), ["text-over-arrow: encima"]);
});
