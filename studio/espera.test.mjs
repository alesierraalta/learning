// The waiting section reads only what the studio already reads from the vault:
// plan.json, the diagnosis, and the earlier parts' mini-quizzes and answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildEspera, writePartTarget } from "./espera.ts";
import { makeRoot } from "./testdata/root.mjs";

const question = (id, enunciado, answer, options = { A: "uno", B: "dos", C: "tres" }) => ({ id, enunciado, options, answer });
const quizFile = (questions) => JSON.stringify({ questions });

function seededRoot(parts = ["p1", "p2", "p3"]) {
  const { root, engine } = makeRoot({ parts: parts.map((id, i) => ({ id, title: `Parte ${i + 1}`, slug: `Parte-${i + 1}`, subtema: `${i + 1}.1` })) });
  writeFileSync(join(root, "redes", "quiz.json"), quizFile([
    question("d1", "¿Qué es una capa?", "A"),
    question("d2", "¿Qué encapsula?", "B"),
    question("d3", "¿Quién define la regla?", "C"),
  ]));
  mkdirSync(join(root, "redes", "mini-quiz"), { recursive: true });
  for (const [part, questions, answers] of [
    ["p1", [question("q1", "P1 uno", "A"), question("q2", "P1 dos", "B"), question("q3", "P1 tres", "C")], { q1: "C", q2: "B", q3: "A" }],
    ["p2", [question("q4", "P2 uno", "B"), question("q5", "P2 dos", "A"), question("q6", "P2 tres", "C")], { q4: "A", q5: "A", q6: "B" }],
  ]) {
    writeFileSync(join(root, "redes", "mini-quiz", `${part}.json`), quizFile(questions));
    writeFileSync(join(root, "redes", "mini-quiz", `${part}.answers.json`), JSON.stringify({ answers, razonamientos: {} }));
  }
  return { root, engine };
}

test("Part 1 shows the diagnosis ungraded and never a review of earlier parts", () => {
  const { root } = seededRoot();
  const doc = buildEspera(root, "redes", "p1");
  assert.deepEqual(doc.part, { id: "p1", number: 1, title: "Parte 1" });
  assert.deepEqual(doc.mapa.dependeDe, []);
  assert.deepEqual(doc.mapa.subtemas, ["1.1", "2.1", "3.1"]);
  assert.equal(doc.preguntas.tipo, "antes");
  assert.equal(doc.preguntas.items.length, 3);
  assert.deepEqual(doc.preguntas.items.map((item) => item.origen), ["diagnostico", "diagnostico", "diagnostico"]);
  for (const item of doc.preguntas.items) {
    assert.deepEqual(Object.keys(item.opciones), ["A", "B", "C"]);
    assert.ok(!Object.hasOwn(item, "respuesta"), "the key is withheld before the part exists");
    assert.ok(!Object.hasOwn(item, "explicacion"));
  }
  assert.deepEqual(doc.glosario, { estado: "no-disponible", terminos: [], preliminar: true });
  assert.equal(doc.profesor, null);
});

test("answers are revealed only when the part is written and the reader asks for them", () => {
  const { root } = seededRoot();
  const hidden = buildEspera(root, "redes", "p1", { revelar: true });
  assert.ok(hidden.preguntas.items.every((item) => !Object.hasOwn(item, "respuesta")));
  writeFileSync(join(root, "redes", "explicaciones", "Parte 1 - Parte-1.md"), "# Parte 1\n");
  const shown = buildEspera(root, "redes", "p1", { revelar: true });
  assert.deepEqual(shown.preguntas.items.map((item) => item.respuesta), ["A", "B", "C"]);
  assert.equal(shown.preguntas.items[0].explicacion, undefined);
});

test("Part 3 reviews answered mini-quizzes, wrong answers first, at most five", () => {
  const { root } = seededRoot(["p1", "p2", "p3", "p4"]);
  for (const n of [1, 2]) writeFileSync(join(root, "redes", "explicaciones", `Parte ${n} - Parte-${n}.md`), "# escrita\n");
  const doc = buildEspera(root, "redes", "p3");
  assert.equal(doc.preguntas.tipo, "repaso");
  assert.deepEqual(doc.preguntas.items.map((item) => item.id), ["q1", "q3", "q4", "q6", "q2"]);
  assert.deepEqual(doc.preguntas.items.map((item) => item.respuesta), ["A", "C", "B", "C", "B"]);
  assert.deepEqual(doc.preguntas.items.map((item) => item.origen), [
    "mini-quiz/p1", "mini-quiz/p1", "mini-quiz/p2", "mini-quiz/p2", "mini-quiz/p1",
  ]);
  assert.deepEqual(doc.mapa.dependeDe, [
    { number: 1, title: "Parte 1", written: true },
    { number: 2, title: "Parte 2", written: true },
  ]);
});

test("a part with no applicable questions shows no quiz at all", () => {
  const { root } = makeRoot({ parts: [{ id: "p1", title: "Única", slug: "Unica", subtema: "1.1" }] });
  const doc = buildEspera(root, "redes", "p1");
  assert.equal(doc.preguntas, null);
  assert.deepEqual(doc.mapa.aprende, ["Única"]);
  assert.deepEqual(doc.mapa.subtemas, ["1.1"]);
});

test("the waiting section takes the preliminary glossary from the short call", () => {
  const { root } = seededRoot();
  const glosario = {
    estado: "listo",
    terminos: [{ termino: "Capa", definicion: "Nivel", ejemplo: "Red" }],
    preliminar: true,
  };
  const questions = [{ enunciado: "¿Qué es una capa?", opciones: { A: "uno", B: "dos" }, respuesta: "A" }];
  const doc = buildEspera(root, "redes", "p1", { glosario, preguntasGlosario: questions });
  assert.deepEqual(doc.glosario, glosario);
  assert.equal(doc.preguntas.items.length, 3, "the diagnosis wins when it exists");
  const withoutDiagnosis = makeRoot();
  const other = buildEspera(withoutDiagnosis.root, "redes", "p1", { glosario, preguntasGlosario: questions });
  assert.equal(other.preguntas.tipo, "antes");
  assert.equal(other.preguntas.items[0].origen, "glosario");
  assert.ok(!Object.hasOwn(other.preguntas.items[0], "respuesta"));
});

test("a write-part turn names the topic and part the waiting section belongs to", () => {
  const { root } = seededRoot();
  assert.deepEqual(writePartTarget(root, "redes", "Escribe la Parte 1 «Capas» de Redes (carpeta redes)"), { topic: "redes", part: "p1", number: 1 });
  assert.deepEqual(writePartTarget(root, "redes", "Escribe la Parte 3"), { topic: "redes", part: "p3", number: 3 });
  assert.deepEqual(writePartTarget(root, null, "[Vista HTML · redes · p2 · TCP]\nRehaz la Parte 2"), { topic: "redes", part: "p2", number: 2 });
  assert.equal(writePartTarget(root, "redes", "Hola, ¿qué es una capa?"), null);
});
