// Plan brief tests (#407): the turn that writes the route must see the whole course
// material in document order, and a brief that cannot fit everything must say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { configurarIndice, indizarFuente, materialOrdenado, cerrarIndice } from "./indice.ts";
import { MAX_PLAN_BRIEF_BYTES, PLAN_BRIEF_MARK, planBrief } from "./brief.ts";

configurarIndice({ embedCommand: null });

const vault = () => mkdtempSync(join(tmpdir(), "plan-brief-"));

/** The on-disk course contract: `.materias/<id>/materia.json` plus one `.txt` per source. */
function curso(raiz, nombre, temas = []) {
  const id = randomBytes(16).toString("hex");
  mkdirSync(join(raiz, ".materias", id), { recursive: true });
  writeFileSync(join(raiz, ".materias", id, "materia.json"), JSON.stringify({
    id, nombre, creada: new Date().toISOString(), temas, fuentes: [],
  }) + "\n");
  return id;
}

function fuente(raiz, id, nombre, tipo, texto) {
  const sourceId = randomBytes(16).toString("hex");
  const cursoDir = join(raiz, ".materias", id);
  mkdirSync(join(cursoDir, "fuentes", sourceId), { recursive: true });
  const archivo = `fuentes/${sourceId}/${nombre}`;
  writeFileSync(join(cursoDir, `${archivo}.txt`), texto, "utf8");
  const declarada = { id: sourceId, tipo, nombre, archivo, bytes: Buffer.byteLength(texto), subida: new Date().toISOString(), texto: `${archivo}.txt` };
  indizarFuente(raiz, id, declarada);
  return declarada;
}

const bytes = (texto) => Buffer.byteLength(texto, "utf8");

test("materialOrdenado enumerates every source of a course beyond the upload cap", () => {
  const raiz = vault();
  const id = curso(raiz, "Redes");
  const nombres = Array.from({ length: 7 }, (_, indice) => `tema-${indice + 1}.txt`);
  for (const nombre of nombres) fuente(raiz, id, nombre, "documento", `Contenido propio de ${nombre} sobre enrutamiento.`);
  const trozos = materialOrdenado(raiz, id);
  assert.ok(trozos.length >= nombres.length, `every source reaches the planner: ${trozos.length}`);
  assert.deepEqual([...new Set(trozos.map((trozo) => trozo.nombre))].sort(), [...nombres].sort());
  assert.deepEqual(materialOrdenado(raiz, id), trozos, "the order is stable across calls");
});

test("materialOrdenado leads with the exam, then keeps document order", () => {
  const raiz = vault();
  const id = curso(raiz, "Cálculo");
  fuente(raiz, id, "apunte-a.txt", "documento", "Derivadas y sus reglas básicas.");
  fuente(raiz, id, "parcial.txt", "examen", "Examen: derive e integre las funciones del capítulo.");
  fuente(raiz, id, "clase.txt", "transcripcion", "Profesor: repasamos la regla de la cadena.");
  const trozos = materialOrdenado(raiz, id);
  assert.equal(trozos[0].tipo, "examen", "the exam weights the order, so it leads the brief");
  assert.deepEqual([...new Set(trozos.map((trozo) => trozo.tipo))].sort(), ["documento", "examen", "transcripcion"]);
});

test("planBrief carries the material of the topic's course", () => {
  const raiz = vault();
  const id = curso(raiz, "Bases de datos", ["normalizacion"]);
  fuente(raiz, id, "unidad-1.txt", "documento", "Primera forma normal y dependencias funcionales.");
  fuente(raiz, id, "final.txt", "examen", "Final: normalice el esquema y justifique cada forma.");
  const brief = planBrief(raiz, "normalizacion");
  assert.ok(brief.includes(PLAN_BRIEF_MARK), brief.slice(0, 120));
  assert.ok(brief.includes("unidad-1.txt"), "the document is named");
  assert.ok(brief.includes("final.txt"), "the exam is named");
  assert.match(brief, /párrafo|líneas|página/, "each chunk keeps its location");
  assert.ok(bytes(brief) <= MAX_PLAN_BRIEF_BYTES, `bounded: ${bytes(brief)}`);
});

test("a brief that cannot fit everything says how much it left out", () => {
  const raiz = vault();
  const id = curso(raiz, "Historia", ["guerra-fria"]);
  const largo = Array.from({ length: 900 }, (_, indice) => `palabra${indice}`).join(" ");
  for (let indice = 0; indice < 6; indice += 1) fuente(raiz, id, `tomo-${indice}.txt`, "documento", `${largo} tomo ${indice}.`);
  const brief = planBrief(raiz, "guerra-fria");
  assert.ok(bytes(brief) <= MAX_PLAN_BRIEF_BYTES, `bounded: ${bytes(brief)}`);
  assert.match(brief, /\d+ fragmentos sin mostrar/, "silence is the one thing it may not do");
  assert.ok(materialOrdenado(raiz, id).length > 6, "the material really exceeds the budget");
});

test("no course, no material or a written plan means no brief", () => {
  const raiz = vault();
  curso(raiz, "Sin temas", []);
  assert.equal(planBrief(raiz, "huerfano"), "", "a topic outside every course gets no brief");
  const vacia = curso(raiz, "Vacía", ["vacia"]);
  assert.equal(planBrief(raiz, "vacia"), "", "a course with no indexed material adds nothing");

  fuente(raiz, vacia, "apunte.txt", "documento", "Contenido suficiente para el índice.");
  assert.notEqual(planBrief(raiz, "vacia"), "");
  mkdirSync(join(raiz, "vacia"), { recursive: true });
  writeFileSync(join(raiz, "vacia", "plan.json"), JSON.stringify({ parts: [{ id: "p1", title: "Uno", slug: "uno" }] }));
  assert.equal(planBrief(raiz, "vacia"), "", "the route is already written: nothing left to derive");
});

test.after(async () => { await cerrarIndice(); });
