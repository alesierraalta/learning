// The studio measures a part itself before a turn is offered as done: these are the checks' own
// tests. They run the repo's real tools on real notes, because the point of the feature is that the
// learner's part was measured — a fake measurement would prove nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
2. Cómo esconde sus detalles.
3. Por qué importa.

## 1. La capa

Imagina un robot que aspira la sala.

**Capa**: es un grupo de funciones que hace una cosa y la esconde del resto.

Antes, el robot tenía que saber cada detalle. Ahora solo usa la capa.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 210","title":"La flecha sobre el texto","scene":{"boxes":[
{"x":20,"y":20,"w":196,"h":170,"label":"A","tone":"blue"},
{"x":556,"y":20,"w":184,"h":170,"label":"B","tone":"green"}],
"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"tone":"blue","width":3}],
"labels":[{"x":380,"y":128,"text":"encima","size":26}],
"icons":[{"kind":"gear","x":380,"y":40,"size":48,"tone":"slate"}]}}
</script>
</lk-scene>

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>
Cómo leerlo: avanza y mira la casilla que cambia.

## Mini-quiz

1. ¿Qué hace una capa?
`;

/** The same part with its words beside the arrow: the three tools pass it. */
const CLEAN = BROKEN.replace(
  '"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"tone":"blue","width":3}],\n"labels":[{"x":380,"y":128,"text":"encima","size":26}]',
  '"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"label":"acción","tone":"blue","width":3,"labelAt":0.5}]',
);

/** A part whose box sits on the canvas edge: `al-borde`, in scene-gate's words. */
const AT_THE_EDGE = BROKEN.replace(
  '"boxes":[\n{"x":20,"y":20,"w":196,"h":170,"label":"A","tone":"blue"},',
  '"boxes":[\n{"x":0,"y":20,"w":208,"h":170,"label":"A","tone":"blue"},',
).replace('"title":"La flecha sobre el texto"', '"title":"La caja en el borde"');

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

test("a part that passes the four tools is clean", { skip: needsBrowser }, async () => {
  const checked = await runPartChecks([note("limpia.md", CLEAN)]);
  assert.deepEqual(checked, { kind: "clean" }, "the canvas gate has nothing to say about a figure with air");
});

// The studio measured the ink inside the boxes but never the canvas: a piece on the
// viewBox edge was clipped in the reader and the turn was offered as done.
test("a piece on the viewBox edge reaches the tutor as an al-borde finding", { skip: needsBrowser }, async () => {
  const checked = await runPartChecks([note("al-borde.md", AT_THE_EDGE)]);
  assert.equal(checked.kind, "findings", JSON.stringify(checked));
  const gate = checked.tools.find((found) => found.tool === "scene-gate.mjs");
  assert.ok(gate, "scene-gate is what measured the canvas");
  assert.match(gate.findings[0], /^al-borde: rect \(a 0u del borde/, "the finding is the tool's own line");
  assert.match(gate.output, /escena 1/, "its output is kept whole for the tutor");
  assert.match(gate.output, /1 problema\(s\) en 2 escena\(s\)/, "the tool's own summary travels with it");
  assert.equal(checked.first, gate.findings[0], "the learner hears the canvas finding first");
});

// A piece that runs off the canvas at phone width: scene-gate measures it at 390 px too, and the
// studio must hand that line back to the tutor, not read the note as clean.
const OFF_THE_CANVAS = `# Parte 1 — Conjuntos

## Ruta

1. Qué es una unión.

## 1. Los conjuntos

Dos conjuntos se cruzan.

<lk-venn>
<script type="application/json">
${JSON.stringify({ title: "Un rótulo que no cabe", sets: [{ id: "a", label: "VIDEOJUEGOS_Y_DESARROLLADORES_CON_NOMBRE_MUY_LARGO", note: "games" }, { id: "b", label: "B" }], fill: ["a+b"], op: "INNER JOIN", says: "Solo coincidencias" })}
</script>
</lk-venn>

Cómo leerlo: mira el rótulo.

## Mini-quiz

1. ¿Qué es un conjunto?
`;

test("a piece off the canvas at phone width reaches the tutor as scene-gate's own finding", { skip: needsBrowser }, async () => {
  const checked = await runPartChecks([note("fuera-del-lienzo.md", OFF_THE_CANVAS)]);
  assert.equal(checked.kind, "findings", JSON.stringify(checked));
  const gate = checked.tools.find((found) => found.tool === "scene-gate.mjs");
  assert.ok(gate, "scene-gate is what measured the piece");
  assert.ok(gate.findings.some((line) => /^off-canvas: /.test(line)), gate.findings.join(" | "));
  assert.match(gate.output, /390px/, "the phone width is named in the tool's own words");
});

test("scene-gate's off-canvas line is the finding the tutor hears, whatever the tool prints around it", async () => {
  // A fake scene-gate with the line the real tool prints for a piece off the canvas: the studio
  // keeps that line as its finding, in the tool's own words, and the summary travels with it.
  const fake = mkdtempSync(join(tmpdir(), "offcanvas-tools-"));
  const lines = [
    "/tmp/parte.md: pieza s0 — Buffer de sesión frente a tablas en disco",
    "  off-canvas: lk-p lk-tables (la pieza desborda en horizontal: 365 > 354 · 390px)",
    "  off-canvas: buffer_sesion (RAM) (x 12–175 fuera de 18–372 · 390px)",
    "2 problema(s) en 1 escena(s)",
  ];
  writeFileSync(join(fake, "scene-gate.mjs"), `console.log(${JSON.stringify(lines.join("\n"))});\nprocess.exit(1);\n`);
  for (const tool of ["scene-lint.mjs", "deck-gate.mjs", "explain-check.mjs"]) writeFileSync(join(fake, tool), "process.exit(0);\n");
  const checked = await runPartChecks([note("fuera.md", CLEAN)], { toolsDir: fake });
  assert.equal(checked.kind, "findings", JSON.stringify(checked));
  const gate = checked.tools.find((found) => found.tool === "scene-gate.mjs");
  assert.deepEqual(gate.findings, [
    "off-canvas: lk-p lk-tables (la pieza desborda en horizontal: 365 > 354 · 390px)",
    "off-canvas: buffer_sesion (RAM) (x 12–175 fuera de 18–372 · 390px)",
  ]);
  assert.equal(checked.first, gate.findings[0], "the learner hears the off-canvas line first");
  assert.match(gate.output, /2 problema\(s\) en 1 escena\(s\)/, "the tool's summary travels with its findings");
});

test("a tool that cannot run is a check failure, not a finding for the tutor", async () => {
  // No tools at all: the studio's own Node cannot start them, which is nobody's part.
  const empty = mkdtempSync(join(tmpdir(), "no-tools-"));
  const checked = await runPartChecks([note("sin-herramientas.md", BROKEN)], { toolsDir: empty });
  assert.equal(checked.kind, "crashed", JSON.stringify(checked));
  assert.equal(checked.failures.length, 4, "every tool reports its own failure");
  assert.ok(
    checked.failures.some((failure) => /scene-lint\.mjs no pudo medir sin-herramientas\.md/.test(failure)),
    checked.failures.join(" | "),
  );
});

test("a tool that fails without naming a finding is a failure, not an empty finding", async () => {
  // A tool that throws: exit 1 with a stack trace and no finding line. Reading that as "findings"
  // would send the tutor to fix a part the tool never measured.
  const broken = mkdtempSync(join(tmpdir(), "throwing-tools-"));
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, "scene-gate.mjs"), "process.exit(0);\n");
  writeFileSync(join(broken, "scene-lint.mjs"), "throw new Error('boom');\n");
  writeFileSync(join(broken, "deck-gate.mjs"), "process.exit(0);\n");
  writeFileSync(join(broken, "explain-check.mjs"), "process.exit(0);\n");
  const checked = await runPartChecks([note("lanza.md", BROKEN)], { toolsDir: broken });
  assert.equal(checked.kind, "crashed", JSON.stringify(checked));
  assert.equal(checked.failures.length, 1);
  assert.match(checked.failures[0], /scene-lint\.mjs no pudo medir lanza\.md/);
  assert.match(checked.failures[0], /boom/, "the reason is kept for the log");
});

test("a deck gate without a browser is a check failure, never a clean pass", async () => {
  // The VPS prints this when Playwright cannot be found. Reading it as "no findings"
  // would offer a part nobody measured as done; it belongs to the studio's log.
  const noBrowser = mkdtempSync(join(tmpdir(), "no-browser-tools-"));
  writeFileSync(join(noBrowser, "scene-gate.mjs"), "process.exit(0);\n");
  writeFileSync(join(noBrowser, "scene-lint.mjs"), "process.exit(0);\n");
  writeFileSync(
    join(noBrowser, "deck-gate.mjs"),
    "console.log('playwright is not installed: set PLAYWRIGHT_MODULE to its entry point, or install it globally (npm root -g)');\nprocess.exit(2);\n",
  );
  writeFileSync(join(noBrowser, "explain-check.mjs"), "process.exit(0);\n");
  const checked = await runPartChecks([note("sin-navegador.md", BROKEN)], { toolsDir: noBrowser });
  assert.equal(checked.kind, "crashed", JSON.stringify(checked));
  assert.equal(checked.failures.length, 1);
  assert.match(checked.failures[0], /deck-gate\.mjs no pudo medir sin-navegador\.md \(salida 2\)/);
});

test("the deck gate's own report is read as findings", () => {
  const output = `${JSON.stringify({ decks: 1, problems: 1, bad: [{ note: "x.md", deck: 1, step: 2, kind: "text-over-arrow", over: 0, text: "encima" }] }, null, 1)}\nGATE FAILED\n`;
  assert.deepEqual(findingsOf("deck-gate.mjs", output), ["text-over-arrow: encima"]);
});

// The clean part is the studio's own proof that a note passes the measure. Its prose must pass the
// register rules too, and this one runs without a browser: the rules are plain text measures.
test("the clean part's prose passes the register rules of explain-check", () => {
  const file = note("limpia-registro.md", CLEAN);
  const tool = join(dirname(fileURLToPath(import.meta.url)), "..", "tools", "explain-check.mjs");
  const r = spawnSync(process.execPath, [tool, file, "--json"], { encoding: "utf8", env: { ...process.env, STUDIO_DB: "" } });
  const rows = Object.fromEntries(JSON.parse(r.stdout).rows.map((row) => [row.rule, row]));
  for (const rule of ["termino-sin-explicar", "frases-largas", "sin-negritas", "sin-escena-antes", "sin-contraste", "cuentas-sin-pasos"]) {
    assert.equal(rows[rule].ok, true, `${rule}: ${rows[rule].detail}`);
  }
});
