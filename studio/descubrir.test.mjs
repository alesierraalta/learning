// Preference discovery: the counts live in telemetry, the aspects live in the
// preferences file, and the bridge between them is the only thing tested here.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { writeDoc } from "./testdata/stored.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultGlobalTelemetry, readGlobalTelemetry, saveGlobalTelemetry } from "../integrations/pi/telemetry.ts";
import { readPreferences, savePreferences } from "./preferences.ts";
import { candidatos, descubrir, olvidar } from "./descubrir.ts";

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function root() {
  const dir = mkdtempSync(join(tmpdir(), "descubrir-"));
  roots.push(dir);
  return dir;
}

function telemetry(dir, por_categoria) {
  return saveGlobalTelemetry(dir, {
    ...structuredClone(defaultGlobalTelemetry),
    estadisticas_globales: {
      total_quizzes: 0,
      total_aciertos: 0,
      total_fallos: 0,
      por_categoria,
    },
  });
}

test("a category with three answers and two wrong becomes an aspect", () => {
  const dir = root();
  telemetry(dir, { derivadas: { total: 3, aciertos: 1, fallos: 2 } });

  const preferences = descubrir(dir);

  assert.equal(preferences.aspectos.length, 10);
  const found = preferences.aspectos.at(-1);
  assert.equal(found.id, "derivadas");
  assert.equal(found.origen, "telemetria");
  assert.equal(found.nivel, "más");
  assert.deepEqual(found.evidencia, { respuestas: 3, aciertos: 1 });
  // The nine shipped aspects are still there, untouched.
  assert.equal(readPreferences(dir).aspectos.slice(0, 9).length, 9);
});

test("two answers, or seven in ten right, discover nothing", () => {
  const dir = root();
  telemetry(dir, {
    pocas: { total: 2, aciertos: 0, fallos: 2 },
    bien: { total: 5, aciertos: 4, fallos: 1 },
  });

  assert.deepEqual(candidatos(readGlobalTelemetry(dir)), []);
  assert.equal(descubrir(dir).aspectos.length, 9);
});

test("discovering twice does not stack, and forgetting restores the nine", () => {
  const dir = root();
  telemetry(dir, { derivadas: { total: 4, aciertos: 1, fallos: 3 } });

  descubrir(dir);
  const twice = descubrir(dir);
  assert.equal(twice.aspectos.length, 10);

  const back = olvidar(dir, "derivadas");
  assert.equal(back.aspectos.length, 9);
  assert.equal(back.aspectos.some((a) => a.id === "derivadas"), false);
  // The learner's own levels survived both moves.
  assert.equal(back.aspectos.find((a) => a.id === "texto").nivel, "menos");
});

test("a removed aspect does not come back while the counts still say so", () => {
  const dir = root();
  telemetry(dir, { derivadas: { total: 4, aciertos: 1, fallos: 3 } });
  descubrir(dir);
  const removed = olvidar(dir, "derivadas");
  assert.deepEqual(removed.rechazados, ["derivadas"]);
  // The learner said no: the same evidence must not undo that on the next run.
  assert.equal(descubrir(dir).aspectos.length, 9);
  assert.equal(readPreferences(dir).aspectos.length, 9);
});

test("a hand-edited refusal list that is not a list of ids is refused", () => {
  const dir = root();
  const base = readPreferences(dir);
  assert.throws(() => savePreferences(dir, { version: 1, aspectos: base.aspectos, rechazados: [1] }), /invalid preferences/);
  assert.throws(() => savePreferences(dir, { version: 1, aspectos: base.aspectos, rechazados: ["a", "a"] }), /invalid preferences/);
});

test("a shipped aspect cannot be forgotten", () => {
  const dir = root();
  assert.throws(() => olvidar(dir, "texto"), /a shipped aspect cannot be forgotten/);
  assert.throws(() => olvidar(dir, "nada"), /aspect not found/);
});

test("a hand-edited file with an invented origin is refused", () => {
  const dir = root();
  const base = readPreferences(dir);
  const invented = {
    version: 1,
    aspectos: [
      ...base.aspectos,
      { id: "inventado", titulo: "Inventado", descripcion: "x", nivel: "más", origen: "porque-si", evidencia: { respuestas: 3, aciertos: 1 } },
    ],
  };
  assert.throws(() => savePreferences(dir, invented), /invalid aspect/);
  // Evidence that claims more hits than answers is not evidence.
  const impossible = {
    version: 1,
    aspectos: [
      ...base.aspectos,
      { id: "imposible", titulo: "Imposible", descripcion: "x", nivel: "más", origen: "telemetria", evidencia: { respuestas: 3, aciertos: 4 } },
    ],
  };
  assert.throws(() => savePreferences(dir, impossible), /invalid aspect/);
});

test("a file that lost a shipped aspect is damage, not a preference", () => {
  const dir = root();
  const base = readPreferences(dir);
  const broken = { version: 1, aspectos: base.aspectos.slice(1) };
  assert.throws(() => savePreferences(dir, broken), /invalid preferences/);
  writeDoc(dir, "preferencias", JSON.stringify(broken));
  assert.throws(() => readPreferences(dir), /invalid preferences/);
});
