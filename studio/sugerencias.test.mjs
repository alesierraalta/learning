// Los chips de una sugerencia mueven los dos ejes del registro, un paso, sin pasar del tope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { motivos, recordSugerencia } from "./sugerencias.ts";
import { readPreferences, savePreferences } from "./preferences.ts";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "sugerencias-"));
  process.env.STUDIO_DB = join(dir, "learning.db");
  return dir;
}

const ajustes = Object.fromEntries(motivos.map((m) => [m.id, m.ajustes]));
const nivel = (root, id) => readPreferences(root).aspectos.find((a) => a.id === id).nivel;

test("the chips name the register: «no entendí» raises tecnicidad; «demasiado texto» and «sin paso a paso» raise sencillez", () => {
  assert.equal(ajustes["no-entendi"].tecnicidad, 1);
  assert.equal(ajustes["demasiado-texto"].sencillez, 1, "§7 dice «bajar»: más sencillez es el nivel alto, así que sube");
  assert.equal(ajustes["sin-paso-a-paso"].sencillez, 1);
});

test("a chip moves the learner's register one step and never past the top", () => {
  const root = fresh();
  recordSugerencia(root, { tema: "rust-borrowing", parte: "p1", motivos: ["no-entendi"], texto: "" });
  assert.equal(nivel(root, "tecnicidad"), "más", "ya está arriba: no pasa del tope");
});

test("a learner who lowered tecnicidad to «medio» gets it back to «más» with «no entendí»", () => {
  const root = fresh();
  const prefs = readPreferences(root);
  prefs.aspectos.find((a) => a.id === "tecnicidad").nivel = "medio";
  savePreferences(root, prefs);
  recordSugerencia(root, { tema: "rust-borrowing", parte: "p1", motivos: ["no-entendi"], texto: "" });
  assert.equal(nivel(root, "tecnicidad"), "más");
});

test("«demasiado texto» moves sencillez one step toward «más» from «medio»", () => {
  const root = fresh();
  const prefs = readPreferences(root);
  prefs.aspectos.find((a) => a.id === "sencillez").nivel = "medio";
  savePreferences(root, prefs);
  recordSugerencia(root, { tema: "rust-borrowing", parte: "p1", motivos: ["demasiado-texto"], texto: "" });
  assert.equal(nivel(root, "sencillez"), "más");
});
