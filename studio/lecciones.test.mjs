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
  motivos,
  reglaDeMotivo,
  recordSugerencia,
  stripLecciones,
  tutorContext,
  withLecciones,
} from "./sugerencias.ts";

const emptyRoot = () => realpathSync(mkdtempSync(join(tmpdir(), "lecciones-")));
const seed = () => JSON.parse(readFileSync(join(import.meta.dirname, "lecciones-base.json"), "utf8")).lecciones.map((l) => l.regla);

test("every chip the page offers is a lesson for every part (#454)", () => {
  for (const motivo of motivos) {
    const clasificado = clasificar([motivo.id]);
    assert.equal(clasificado.alcance, "general", `${motivo.id} is about every explanation`);
    assert.equal(typeof clasificado.regla, "string");
    assert.ok(clasificado.regla.length > 0 && clasificado.regla.length <= 140, `a rule is one line, got ${clasificado.regla.length}`);
    assert.match(clasificado.regla, /^[A-ZÁÉÍÓÚÑ]/, "a rule is written as an instruction");
  }
  // A review that picks several chips still leaves one rule: the first one it names.
  assert.equal(clasificar(["muy-abstracto", "no-entendi"]).regla, reglaDeMotivo("muy-abstracto"));
  // No chip names a single passage any more: what the learner says about one part rides the topic
  // channel instead (#443), and a legacy entry without a rule still stays with its part.
  assert.equal(motivos.some((motivo) => clasificar([motivo.id]).alcance === "parte"), false);
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

test("a general lesson recorded on one topic reaches every topic (#454)", () => {
  const root = emptyRoot();
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["muy-abstracto"], texto: "", origen: "sugerencia" });
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["no-entendi"], texto: "no entendí el ejemplo del charco", origen: "sugerencia" });

  const block = leccionesBlock(root);
  assert.match(block, new RegExp(`^\\[${LECCIONES_TITULO.replace(/[()]/g, "\\$&")}\\n- `));
  assert.match(block, /Baja a tierra antes de definir/, "the learner's lesson is in the block");
  assert.doesNotMatch(block, /charco/, "the learner's words are not a standing rule");
  // The same block, whatever topic the turn teaches: the lessons are the learner's, not the topic's.
  assert.equal(leccionesBlock(root), leccionesBlock(root));
  // And the part keeps its own words for its own regeneration.
  assert.match(tutorContext(root, "redes"), /charco/);
  assert.doesNotMatch(tutorContext(root, "algebra"), /charco/);
});

test("a review whose rule duplicates the seed adds nothing (#454)", () => {
  const root = emptyRoot();
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["faltan-visuales"], texto: "", origen: "sugerencia" });
  assert.equal(leccionesBlock(root), leccionesBlock(emptyRoot()), "the seed already says it");
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

// #454: the page offers eight motives; before this, three of them could become a lesson and the
// other five classified as "this part only". A learner saying «muy abstracto» taught nothing.
const normalizar = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
const lineasDe = (bloque) => bloque.split("\n").filter((l) => l.startsWith("- "));

test("every motive the page offers names a rule, and no two rules say the same (#454)", () => {
  const reglas = motivos.map((motivo) => reglaDeMotivo(motivo.id));
  assert.deepEqual(reglas.filter((r) => r === null), [], "a chip with no rule teaches nothing");
  for (const regla of reglas) assert.ok(regla.length <= 140, `a rule is one line: ${regla.length} chars`);
  const normalizadas = reglas.map(normalizar);
  assert.equal(new Set(normalizadas).size, normalizadas.length, "two motives cannot teach the same line");
  // The three the seed came from stay verbatim: they are provenance, and the dedupe keeps them out.
  const semilla = seed().map(normalizar);
  const colapsan = normalizadas.filter((r) => semilla.includes(r)).length;
  assert.equal(colapsan, 3, "exactly the three seed-derived rules collapse into the seed");
});

test("a motive that used to be part-only now grows the block (#454)", () => {
  const root = mkdtempSync(join(tmpdir(), "voc-"));
  const antes = lineasDe(leccionesBlock(root));
  const regla = reglaDeMotivo("muy-abstracto");
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["muy-abstracto"], texto: "", origen: "sugerencia" });
  const despues = lineasDe(leccionesBlock(root));
  assert.equal(despues.length, antes.length + 1, "the learner's lesson enters the block");
  assert.ok(despues.some((l) => normalizar(l.slice(2)) === normalizar(regla)), "and the line is the rule it teaches");
});

test("a motive the seed already says still collapses instead of repeating it (#454)", () => {
  const root = mkdtempSync(join(tmpdir(), "voc2-"));
  const antes = lineasDe(leccionesBlock(root));
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["faltan-visuales"], texto: "", origen: "sugerencia" });
  assert.equal(lineasDe(leccionesBlock(root)).length, antes.length, "the seed already says it; the block does not grow");
});

test("with every lesson live the block stays inside its own budget (#454)", () => {
  const root = mkdtempSync(join(tmpdir(), "voc3-"));
  motivos.forEach((motivo, index) => {
    recordSugerencia(root, { tema: `t${index}`, parte: "p1", motivos: [motivo.id], texto: "", origen: "sugerencia" });
  });
  const bloque = leccionesBlock(root);
  const lineas = lineasDe(bloque);
  assert.ok(lineas.length <= MAX_LECCIONES, `${lineas.length} rules ride, cap ${MAX_LECCIONES}`);
  for (const linea of lineas) assert.ok(linea.length <= 142, `one rule is one line: ${linea.length} chars`);
  assert.ok(bloque.length <= 1600, `the block stays small with everything live: ${bloque.length} chars`);
});
