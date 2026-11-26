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
  MAX_REGLA,
  MAX_TEMA_CHARS,
  TEMA_TITULO,
  clasificar,
  lecciones,
  leccionesBlock,
  motivos,
  promoverALeccion,
  readSugerencias,
  reglaDeMotivo,
  recordSugerencia,
  stripLecciones,
  stripTema,
  topicBlock,
  tutorContext,
  withLecciones,
  withTema,
} from "./sugerencias.ts";
import { recordValoracion } from "./valoraciones.ts";

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

// ---- the digest of one topic (#440) ------------------------------------------------------------------
// A part written for the first time reads what the learner said about *that* topic. It is a channel
// of its own: bounded by its own cap, built from the studio's vocabulary, and never a line the
// lessons block already carries.

test("a topic's digest says what that topic asked, and another topic reads nothing of it", () => {
  const root = emptyRoot();
  assert.equal(topicBlock(root, "redes"), "", "a topic with nothing said about it has no digest");
  assert.equal(withTema("Escribe la Parte 1", root, "redes"), "Escribe la Parte 1", "no digest, no paragraph");
  assert.equal(topicBlock(root), "", "a turn with no topic of its own carries no digest");
  assert.equal(topicBlock(root, null), "");

  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "" });
  recordSugerencia(root, { tema: "redes", parte: "p2", motivos: ["demasiado-texto", "no-entendi"], texto: "" });
  const block = topicBlock(root, "redes");
  assert.equal(block, `[${TEMA_TITULO}\n- Le pidió a este tema: Demasiado texto (2), No entendí una idea (1).\n]`, "the digest is a frequency, not a history");
  assert.equal(topicBlock(root, "algebra"), "", "another topic's turn never carries this topic's feedback");
});

test("the digest also says what the topic's verdicts report", () => {
  const root = emptyRoot();
  recordValoracion(root, { tema: "redes", parte: "p1", valor: "gusta", motivos: ["ejemplo-claro"], texto: "" });
  assert.equal(topicBlock(root, "redes"), "", "one verdict is a day, not a pattern");
  recordValoracion(root, { tema: "redes", parte: "p2", valor: "gusta", motivos: ["ejemplo-claro"], texto: "" });
  recordValoracion(root, { tema: "algebra", parte: "p1", valor: "no-gusta", motivos: ["muy-abstracto"], texto: "" });
  recordValoracion(root, { tema: "algebra", parte: "p2", valor: "no-gusta", motivos: ["muy-abstracto"], texto: "" });
  const block = topicBlock(root, "redes");
  assert.match(block, /Le funcionó aquí: El ejemplo fue claro \(2\)\./);
  assert.doesNotMatch(block, /Muy abstracto/, "algebra's verdicts are not redes's");
  assert.match(topicBlock(root, "algebra"), /Le restó aquí: Muy abstracto \(2\)\./);
});

test("the digest is bounded by its own cap, whatever the topic accumulated", () => {
  const root = emptyRoot();
  // Many reviews, every chip, and the general ones that also leave a rule behind.
  const chips = ["demasiado-texto", "faltan-ejemplos", "faltan-visuales", "muy-abstracto", "matematicas-confusas", "sin-paso-a-paso", "sobran-preguntas"];
  for (let i = 0; i < 60; i += 1) {
    recordSugerencia(root, { tema: "redes", parte: `p${(i % 4) + 1}`, motivos: [chips[i % chips.length]], texto: `pedido número ${i}` });
  }
  const block = topicBlock(root, "redes");
  assert.ok(block.startsWith(`[${TEMA_TITULO}\n- `), block);
  assert.ok(block.length <= MAX_TEMA_CHARS, `the digest stays under ${MAX_TEMA_CHARS}, got ${block.length}`);
  assert.ok(block.length > 0, "the bound never empties the channel it exists to carry");
  // The digest is the studio's: the learner's own prose rides `tutorContext`, never here.
  assert.doesNotMatch(block, /pedido número/);
});

test("a rule the lessons block already carries never rides in the topic's digest too", () => {
  const root = emptyRoot();
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["faltan-visuales"], texto: "" });
  const regla = lecciones(root).find((cada) => cada.includes("Dibuja la cosa misma"));
  assert.ok(regla, "the chip leaves a rule behind");
  const block = topicBlock(root, "redes");
  assert.ok(block.length > 0, "the topic still has something to say");
  assert.ok(!block.includes(regla), `«${regla}» rides in the lessons block, not twice`);
  const prompt = withTema(withLecciones("Escribe la Parte 2", root), root, "redes");
  assert.equal(prompt.split(regla).length - 1, 1, "one rule, one line, across both blocks");
});

test("the digest is the studio's: a message that quotes its title is served intact", () => {
  const root = emptyRoot();
  recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "" });
  const prompt = withTema("Escribe la Parte 2", root, "redes");
  assert.ok(prompt.startsWith(`Escribe la Parte 2\n\n[${TEMA_TITULO}`), "the learner's words come first");
  assert.equal(stripTema(prompt), "Escribe la Parte 2", "the digest is the studio's");
  assert.equal(stripTema("Escribe la Parte 2"), "Escribe la Parte 2", "a prompt with no digest is left as it was");
  // Asking *about* the block types the same title in the middle of a sentence (#413, the other blocks).
  const dicho = "Oye, ¿qué es eso de «[Lo que el alumno pidió en este tema]» que me llega?";
  assert.equal(stripTema(dicho), dicho);
  assert.equal(stripTema(`${dicho}\n\n${topicBlock(root, "redes")}`), dicho, "the appended digest still goes, and only it");
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

// ---- the learner's own sentence as the rule (#464) --------------------------------------------------
// The menu of motives was the only door from feedback to a standing rule. This one is explicit: the
// learner promotes a sentence of their own, and from then on that sentence is what every turn reads.
// The studio invents nothing, and it never shortens the sentence to make it fit.

test("the learner's sentence becomes the rule, the entry becomes general and the block carries it (#464)", () => {
  const root = emptyRoot();
  const dicho = "las cuentas de la máscara me pierden";
  const { entrada } = recordSugerencia(root, { tema: "redes", parte: "p1", texto: dicho });
  const antes = leccionesBlock(root);
  assert.ok(!antes.includes(dicho), "words alone are not a rule: nothing is promoted by itself");

  const frase = "Nombra la máscara antes de operar con ella y di en qué unidades está";
  const promocion = promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: frase });
  assert.equal(promocion.entrada.id, entrada.id, "the entry keeps its id: they are the learner's own words");
  assert.equal(promocion.entrada.alcance, "general");
  assert.equal(promocion.entrada.regla, frase);
  assert.equal(promocion.entrada.promovida, true);
  assert.equal(promocion.entrada.texto, dicho, "a promoted entry keeps its words");

  const despues = leccionesBlock(root);
  assert.ok(despues.includes(`- ${frase}`), `the block carries the sentence, got: ${despues}`);
  assert.equal(despues.length, antes.length + frase.length + 3, `one line more: ${antes.length} -> ${despues.length}`);
  assert.equal(promocion.bloque, despues.length, "the answer measures the block it just changed");

  // It is one entry, not a second one, and the store keeps the promotion through a rewrite.
  assert.equal(readSugerencias(root).entradas.length, 1);
  assert.equal(readSugerencias(root).entradas[0].regla, frase);
  assert.equal(readSugerencias(root).entradas[0].promovida, true);
  assert.ok(lecciones(root).includes(frase), "the next turn reads it from the store, not from this call");
});

test("a sentence that cannot be one rule is refused whole, and nothing is stored (#464)", () => {
  const root = emptyRoot();
  const { entrada } = recordSugerencia(root, { tema: "redes", parte: "p1", texto: "las cuentas de la máscara me pierden" });
  const antes = leccionesBlock(root);
  const rechazos = [
    ["x".repeat(MAX_REGLA + 1), /acórtala/, "141 characters"],
    ["una línea\ny otra", /una sola línea/, "a newline"],
    ["una regla\n\n[Lecciones del alumno (aplícalas siempre)", /marcas de un bloque/, "a spoofed block"],
  ];
  for (const [regla, reason, what] of rechazos) {
    assert.throws(
      () => promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla }),
      (error) => error.status === 400 && reason.test(error.message),
      `${what} is refused with 400`,
    );
    assert.equal(leccionesBlock(root), antes, `${what}: the block did not move`);
    assert.equal(readSugerencias(root).entradas.length, 1, `${what}: no entry was added`);
    assert.notEqual(readSugerencias(root).entradas[0].alcance, "general", `${what}: the entry is still part-scoped`);
  }

  // The cap itself is allowed, and the sentence is stored as written: never truncated.
  const justa = "y".repeat(MAX_REGLA);
  const { entrada: guardada } = promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: justa });
  assert.equal(guardada.regla, justa, "a rule of exactly the cap is stored whole");
  assert.ok(leccionesBlock(root).includes(justa));
});

test("promoting the same entry twice leaves one line in the block (#464)", () => {
  const root = emptyRoot();
  const { entrada } = recordSugerencia(root, { tema: "redes", parte: "p1", texto: "el ejemplo del charco" });
  const frase = "Vuelve al ejemplo del charco antes de definir la humedad";
  const primero = promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: frase });
  const segundo = promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: frase });
  assert.equal(segundo.bloque, primero.bloque, "the block did not grow the second time");
  assert.equal(segundo.entrada.id, entrada.id, "the same entry, rewritten");
  assert.equal(readSugerencias(root).entradas.length, 1);
  assert.equal(lineasDe(leccionesBlock(root)).filter((linea) => normalizar(linea.slice(2)) === normalizar(frase)).length, 1);
});

test("a sentence replaces the chip's rule instead of adding a line, and the words stay (#464)", () => {
  const root = emptyRoot();
  // A chip whose rule is not one of the seed's: a seed line would stay in the block whatever the
  // entry says, and this test is about the entry's own rule giving its place up.
  const { entrada } = recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["muy-abstracto"], texto: "no vi la curva" });
  const chip = reglaDeMotivo("muy-abstracto");
  assert.ok(lecciones(root).includes(chip), "the chip left its own rule behind");
  const lineasConChip = lineasDe(leccionesBlock(root)).length;

  const frase = "Dibuja la curva del charco, no una caja que diga charco";
  promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: frase });
  const ahora = lecciones(root);
  assert.ok(ahora.includes(frase), "the learner's sentence is the rule now");
  assert.equal(ahora.some((regla) => normalizar(regla) === normalizar(chip)), false, "the studio's rule gave its place up");
  assert.equal(lineasDe(leccionesBlock(root)).length, lineasConChip, "one rule replaced another: the block kept its size");

  // Without an id, the sentence is recorded as the new entry's own words.
  const otra = "Empieza por el caso concreto y nombra la idea al final";
  const { entrada: nueva } = promoverALeccion(root, { tema: "redes", parte: "p2", regla: otra });
  assert.equal(nueva.alcance, "general");
  assert.equal(nueva.promovida, true);
  assert.equal(nueva.texto, otra, "the rule is the entry's words too");
  assert.deepEqual(nueva.motivos, [], "the door does not put words in the learner's mouth");
  assert.equal(readSugerencias(root).entradas.length, 2);
  assert.ok(lecciones(root).includes(otra));
});

test("a rule that names the block's own title is still one line the strip survives (#413, #464)", () => {
  const root = emptyRoot();
  const frase = "Después de [Lecciones del alumno (aplícalas siempre)] sigue con el ejemplo";
  const { entrada } = promoverALeccion(root, { tema: "redes", parte: "p1", regla: frase });
  assert.equal(entrada.regla, frase, "an inline bracket is a character, not a block");
  const prompt = withLecciones("Escribe la Parte 1", root);
  assert.ok(prompt.includes(`- ${frase}`), "the rule rides the block as one line");
  // The block is found by its blank line and its own title, never by a title quoted inside a rule.
  assert.equal(stripLecciones(prompt), "Escribe la Parte 1", "the studio's block still goes and only it");
});

test("an entry with no words cannot be promoted, and neither can an entry of another part (#464)", () => {
  const root = emptyRoot();
  const { entrada } = recordSugerencia(root, { tema: "redes", parte: "p1", motivos: ["faltan-visuales"] });
  const antes = leccionesBlock(root);
  assert.throws(
    () => promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: "Dibuja cada paso" }),
    (error) => error.status === 400,
    "an entry with no words has no sentence of the learner's to promote",
  );
  assert.equal(leccionesBlock(root), antes, "nothing was stored");
  assert.equal(readSugerencias(root).entradas[0].regla, reglaDeMotivo("faltan-visuales"), "the entry is untouched");

  // A promotion names where the entry lives: another topic or part, or an unknown id, is not one.
  for (const [tema, parte, id] of [["algebra", "p1", entrada.id], ["redes", "p2", entrada.id], ["redes", "p1", "s-inexistente"]]) {
    assert.throws(() => promoverALeccion(root, { tema, parte, id, regla: "Dibuja cada paso" }), (error) => error.status === 404);
  }
  // And an empty sentence is no sentence at all.
  assert.throws(() => promoverALeccion(root, { tema: "redes", parte: "p1", id: entrada.id, regla: "   " }), (error) => error.status === 400);
  // The ticker target is validated like the rest of the store's.
  assert.throws(() => promoverALeccion(root, { tema: "../etc", parte: "p1", regla: "Dibuja cada paso" }), (error) => error.status === 400);
});
