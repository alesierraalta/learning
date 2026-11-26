// The tutor reference is the contract the tutor reads, so the learner's choice of two voices for the
// capsule (S14: «utilicemos esas dos voces») must survive in it, section by section.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("M2 la referencia del tutor pide una cápsula a dos voces, nunca un narrador único", () => {
  const reference = readFileSync(join(import.meta.dirname, "..", "..", "skills", "explicacion-interactiva", "references", "modo-audio.md"), "utf8");
  const section = reference.slice(reference.indexOf("## Cápsulas"), reference.indexOf("## Cómo escribir"));
  assert.match(section, /diálogo entre dos voces/, "la cápsula se pide como diálogo");
  assert.match(section, /"style": "charla"/, "el estilo del diálogo es charla");
  assert.match(section, /"A": "Alex"/, "la primera voz es la que eligió la persona");
  assert.match(section, /"B": "Dora"/, "la segunda voz es la que eligió la persona");
  assert.match(section, /nunca un narrador único/, "una sola voz no es una cápsula de este modo");
});
