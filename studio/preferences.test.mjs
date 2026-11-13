// Las preferencias guardan los dos ejes del registro: «qué tan simple» y «qué tan técnico».
// Un documento de antes de este cambio no tiene esos ejes y no se rechaza: se completa con el defecto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readPreferences, savePreferences } from "./preferences.ts";
import { writeDoc } from "../integrations/pi/store.ts";

/** A fresh learner root with its own database: the store keys one file per root. */
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "preferences-"));
  process.env.STUDIO_DB = join(dir, "learning.db");
  return dir;
}

// Los siete aspectos que existían antes del registro, con sus palabras de producto.
const ANTES = [
  { id: "texto", titulo: "Cantidad de texto", descripcion: "Explicaciones breves y directas.", nivel: "menos" },
  { id: "ejemplos", titulo: "Ejemplos concretos", descripcion: "Un ejemplo central que crece con la explicación.", nivel: "más" },
  { id: "visuales", titulo: "Diagramas y elementos visuales", descripcion: "Diagramas integrados con la explicación.", nivel: "más" },
  { id: "analogias", titulo: "Analogías", descripcion: "Modelos del mundo real con sus límites.", nivel: "más" },
  { id: "matematicas", titulo: "Profundidad matemática", descripcion: "Matemáticas breves e intuitivas.", nivel: "menos" },
  { id: "pasos", titulo: "Desarrollo paso a paso", descripcion: "Desglosar la evolución y los cálculos.", nivel: "más" },
  { id: "preguntas", titulo: "Preguntas durante la explicación", descripcion: "Comprobaciones durante la lectura; los quizzes van al final.", nivel: "menos" },
];

const nivel = (prefs, id) => prefs.aspectos.find((a) => a.id === id)?.nivel;

test("the register is two aspects of the learner's preferences, both «más» by default", () => {
  const prefs = readPreferences(fresh());
  assert.equal(nivel(prefs, "sencillez"), "más");
  assert.equal(nivel(prefs, "tecnicidad"), "más");
  assert.equal(prefs.aspectos.find((a) => a.id === "sencillez").titulo, "Qué tan simple");
  assert.equal(prefs.aspectos.find((a) => a.id === "tecnicidad").titulo, "Qué tan técnico");
});

test("a document saved before the register aspects gains them at «más» and keeps every level it had", () => {
  const root = fresh();
  const ajustado = ANTES.map((a) => (a.id === "texto" ? { ...a, nivel: "medio" } : a));
  writeDoc(root, "preferencias", JSON.stringify({ version: 1, aspectos: ajustado }));
  const prefs = readPreferences(root);
  assert.equal(prefs.aspectos.length, 9);
  assert.equal(nivel(prefs, "texto"), "medio", "el nivel que ya tenía se conserva");
  assert.equal(nivel(prefs, "sencillez"), "más");
  assert.equal(nivel(prefs, "tecnicidad"), "más");
});

test("the register levels are saved and read back", () => {
  const root = fresh();
  const prefs = readPreferences(root);
  prefs.aspectos.find((a) => a.id === "sencillez").nivel = "medio";
  savePreferences(root, prefs);
  assert.equal(nivel(readPreferences(root), "sencillez"), "medio");
});

test("the register aspects are the product's words: a file that renames one is refused", () => {
  const root = fresh();
  const prefs = readPreferences(root);
  prefs.aspectos.find((a) => a.id === "tecnicidad").titulo = "Cualquiera";
  assert.throws(() => savePreferences(root, prefs), /invalid aspect/);
});

test("saving a document without a shipped register aspect is still refused: only old files are completed", () => {
  const root = fresh();
  const prefs = readPreferences(root);
  prefs.aspectos = prefs.aspectos.filter((a) => a.id !== "sencillez");
  assert.throws(() => savePreferences(root, prefs), /invalid preferences/);
});

// The engine and the tools read the learner's levels from `niveles-alumno.json` in the Learnings root:
// the store is a database the engine cannot open, so the studio keeps that file in step with it.
test("the learner's levels are mirrored to niveles-alumno.json, where the engine and the tools read them", () => {
  const root = fresh();
  const prefs = readPreferences(root);
  prefs.aspectos.find((a) => a.id === "sencillez").nivel = "menos";
  savePreferences(root, prefs);
  const file = join(root, "niveles-alumno.json");
  assert.equal(existsSync(file), true, "the mirror exists after a save");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).aspectos.find((a) => a.id === "sencillez").nivel, "menos");
});

test("a root whose preferences were saved before the mirror existed gets it on the next read", () => {
  const root = fresh();
  writeDoc(root, "preferencias", JSON.stringify({ version: 1, aspectos: ANTES }));
  assert.equal(existsSync(join(root, "niveles-alumno.json")), false, "nothing mirrored yet");
  readPreferences(root);
  const mirror = JSON.parse(readFileSync(join(root, "niveles-alumno.json"), "utf8"));
  assert.equal(mirror.aspectos.length, 9, "the mirror is the completed document");
  assert.equal(mirror.aspectos.find((a) => a.id === "texto").nivel, "menos", "the learner's own level is kept");
});
