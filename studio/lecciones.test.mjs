// The learner's reviews are two different things, and the studio must not confuse them: a review
// of one passage belongs to that part's regeneration, while a lesson about how explanations are
// made anywhere belongs to every turn of every topic. These tests drive the classification, the
// block a turn carries (bounded, deduplicated, seeded from the repo's own file) and the strip that
// keeps the block out of the learner's own message.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LECCIONES_TITULO,
  MAX_LECCIONES,
  clasificar,
  lecciones,
  leccionesBlock,
  recordSugerencia,
  stripLecciones,
  tutorContext,
  withLecciones,
} from "./sugerencias.ts";

const emptyRoot = () => realpathSync(mkdtempSync(join(tmpdir(), "lecciones-")));
const seed = () => JSON.parse(readFileSync(join(import.meta.dirname, "lecciones-base.json"), "utf8")).lecciones.map((l) => l.regla);

test("a chip that names how to explain is a lesson for every part; the rest name this passage", () => {
  const general = clasificar(["faltan-visuales"]);
  assert.equal(general.alcance, "general");
  assert.equal(typeof general.regla, "string");
  assert.ok(general.regla.length > 0 && general.regla.length <= 140, `a rule is one line, got ${general.regla.length}`);
  assert.match(general.regla, /^[A-ZÁÉÍÓÚÑ]/, "a rule is written as an instruction");

  for (const motivos of [["faltan-ejemplos"], ["sin-paso-a-paso"]]) {
    assert.equal(clasificar(motivos).alcance, "general", `${motivos[0]} is about every explanation`);
  }
  // A review that picks three general chips still leaves one rule: the first one it names.
  assert.equal(clasificar(["faltan-visuales", "faltan-ejemplos", "sin-paso-a-paso"]).regla, general.regla);
  // «No entendí una idea» and «Matemáticas confusas» are about one passage: they stay with the part.
  assert.deepEqual(clasificar(["no-entendi"]), { alcance: "parte" });
  assert.deepEqual(clasificar(["matematicas-confusas", "sobran-preguntas"]), { alcance: "parte" });
  assert.deepEqual(clasificar([]), { alcance: "parte" }, "words alone never become a rule the studio invents");
});

test("the repo's seed is the general lessons of the first topic, already classified", () => {
  const reglas = seed();
  assert.ok(reglas.length >= 5, `a seed worth carrying, got ${reglas.length}`);
  assert.ok(reglas.length <= MAX_LECCIONES, `the seed fits the block, got ${reglas.length}`);
  assert.equal(new Set(reglas.map((r) => r.toLowerCase())).size, reglas.length, "the seed says each rule once");
  for (const regla of reglas) {
    assert.ok(regla.length <= 140, `«${regla}» is ${regla.length} characters`);
    assert.doesNotMatch(regla, /[.!?]\s*$/, "a rule is an instruction, not a sentence with a full stop");
  }
  // The seed is what a turn on an empty store receives: nothing recorded, the lessons still apply.
  assert.deepEqual(lecciones(emptyRoot()), reglas);
});

test("a general lesson recorded on one topic reaches every topic, and a part-specific one does not", () => {
  const root = emptyRoot();
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["faltan-visuales"], texto: "", origen: "sugerencia" });
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["no-entendi"], texto: "no entendí el ejemplo del charco", origen: "sugerencia" });

  const block = leccionesBlock(root);
  assert.match(block, new RegExp(`^\\[${LECCIONES_TITULO.replace(/[()]/g, "\\$&")}\\n- `));
  assert.match(block, /Dibuja la cosa misma/, "the general lesson is in the block");
  assert.doesNotMatch(block, /charco/, "a part-specific review is never a standing rule");
  // The same block, whatever topic the turn teaches: the lessons are the learner's, not the topic's.
  assert.equal(leccionesBlock(root), leccionesBlock(emptyRoot()), "a general lesson that duplicates the seed adds nothing");
  // And the part keeps its own review for its own regeneration.
  assert.match(tutorContext(root, "redes"), /charco/);
  assert.doesNotMatch(tutorContext(root, "algebra"), /charco/);
});

test("the block is bounded and says each rule once", () => {
  const root = emptyRoot();
  // More general reviews than the block may carry, each one its own rule.
  for (let i = 0; i < MAX_LECCIONES + 4; i += 1) {
    recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["faltan-visuales"], texto: `lección ${i}`, origen: "sugerencia" });
  }
  const reglas = lecciones(root);
  assert.ok(reglas.length <= MAX_LECCIONES, `at most ${MAX_LECCIONES} rules, got ${reglas.length}`);
  assert.equal(new Set(reglas.map((r) => r.toLowerCase())).size, reglas.length, "no rule is repeated");
  const block = leccionesBlock(root);
  assert.ok(block.length <= 1200 + LECCIONES_TITULO.length + 8, `the block stays short, got ${block.length}`);
  assert.ok(reglas.every((r) => block.includes(r)));
});

test("a turn carries the block after the learner's words, and the chat never shows it as theirs", () => {
  const root = emptyRoot();
  const prompt = withLecciones("Escribe la Parte 1", root);
  assert.ok(prompt.startsWith("Escribe la Parte 1\n\n["), "the learner's words come first");
  assert.match(prompt, /Lecciones del alumno \(aplícalas siempre\)/);
  assert.equal(stripLecciones(prompt), "Escribe la Parte 1", "the block is the studio's");
  // A prompt with no block is left exactly as it was.
  assert.equal(stripLecciones("Escribe la Parte 1"), "Escribe la Parte 1");
  assert.equal(stripLecciones("[Vista HTML · redes · p1 · quiz]\n\n[Parte en curso: Parte 1 «Capas» de Redes.]"), "[Vista HTML · redes · p1 · quiz]\n\n[Parte en curso: Parte 1 «Capas» de Redes.]");
});

test("every rule the block carries is enforced by a check or a section of the skill", () => {
  // The mapping document is the proof; this test keeps the two from drifting apart silently.
  const mapa = readFileSync(join(import.meta.dirname, "..", "odd", "reviews", "mapa-sugerencias.md"), "utf8");
  for (const regla of lecciones(emptyRoot())) {
    assert.ok(mapa.includes(regla), `«${regla}» is not in odd/reviews/mapa-sugerencias.md`);
  }
});
