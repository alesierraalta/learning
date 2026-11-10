import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { recordSugerencia, readSugerencias } from "./sugerencias.ts";
import { readPreferences, savePreferences } from "./preferences.ts";
import { readGlobalTelemetry, readTopicTelemetry, recordQuizTelemetry } from "../integrations/pi/telemetry.ts";

const fresh = () => mkdtempSync(join(tmpdir(), "studio-store-"));
const count = (file) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare("SELECT count(*) AS n FROM documentos").get().n; } finally { db.close(); }
};

/** A separate Node process: what a restart of the studio sees, not this process's cache. */
function inAnotherProcess(root, expression, env = {}) {
  const code = `
    const { readSugerencias } = await import(${JSON.stringify(new URL("./sugerencias.ts", import.meta.url).href)});
    const { readPreferences } = await import(${JSON.stringify(new URL("./preferences.ts", import.meta.url).href)});
    const t = await import(${JSON.stringify(new URL("../integrations/pi/telemetry.ts", import.meta.url).href)});
    const root = ${JSON.stringify(root)};
    process.stdout.write(JSON.stringify(${expression}));`;
  const out = spawnSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", code], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
}

test("learner data lives in learning.db and survives a restart", () => {
  const root = fresh();
  const preferences = readPreferences(root);
  preferences.aspectos[0].nivel = "más";
  savePreferences(root, preferences);
  recordSugerencia(root, { tema: "algebra", parte: "p1", motivos: [], texto: "más claridad" });
  recordQuizTelemetry(root, { tema: "algebra", pregunta: "¿cuánto?", ok: true });
  assert.equal(count(join(root, "learning.db")), 4, "preferencias, sugerencias, telemetria and telemetria/algebra");
  for (const file of ["preferencias.json", "sugerencias.json", "telemetria.json", join("algebra", "telemetria.json")]) {
    assert.throws(() => readFileSync(join(root, file)), { code: "ENOENT" }, `${file} is not written any more`);
  }
  const after = inAnotherProcess(root, "{ nivel: readPreferences(root).aspectos[0].nivel, texto: readSugerencias(root).entradas[0].texto, total: t.readGlobalTelemetry(root).estadisticas_globales.total_quizzes, tema: t.readTopicTelemetry(root, 'algebra').quizzes.length }");
  assert.deepEqual(after, { nivel: "más", texto: "más claridad", total: 1, tema: 1 });
});

test("the first open imports the old JSON files once, keeping them byte-identical", () => {
  const root = fresh();
  const seed = fresh();
  const preferences = readPreferences(seed);
  preferences.aspectos[1].nivel = "menos";
  const files = {
    "preferencias.json": JSON.stringify(preferences),
    "sugerencias.json": JSON.stringify({
      version: 1,
      actualizado: "2026-11-06T03:24:00.000Z",
      entradas: [
        { id: "s-1", tema: "rl", parte: "p3", motivos: ["faltan-visuales", "inventado"], texto: "faltan diagramas", origen: "sugerencia", timestamp: "2026-11-03T23:18:00.000Z" },
        { id: 7, tema: "rl" },
      ],
    }),
    "telemetria.json": JSON.stringify({ ...readGlobalTelemetry(seed), ultima_actualizacion: "2026-11-06T03:33:00.000Z" }),
    [join("rl", "telemetria.json")]: JSON.stringify({ ...readTopicTelemetry(seed, "rl"), quizzes: [{ id: "q1", pregunta: "¿Q?", ok: false }] }),
  };
  mkdirSync(join(root, "rl"));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(root, file), text);

  assert.equal(readPreferences(root).aspectos[1].nivel, "menos");
  const imported = readSugerencias(root);
  assert.deepEqual(imported.entradas.map((e) => [e.id, e.motivos]), [["s-1", ["faltan-visuales"]]], "invalid entries and unknown motives are dropped as before");
  assert.equal(readGlobalTelemetry(root).ultima_actualizacion, "2026-11-06T03:33:00.000Z");
  assert.equal(readTopicTelemetry(root, "rl").quizzes[0].id, "q1");
  for (const [file, text] of Object.entries(files)) assert.equal(readFileSync(join(root, file), "utf8"), text, `${file} is left as it was`);

  // Edited after the import: a restart imports nothing again.
  writeFileSync(join(root, "sugerencias.json"), JSON.stringify({ version: 1, actualizado: "", entradas: [] }));
  const again = inAnotherProcess(root, "readSugerencias(root).entradas.map((e) => e.id)");
  assert.deepEqual(again, ["s-1"]);
});

test("STUDIO_DB chooses where the database lives", () => {
  const root = fresh();
  const elsewhere = join(fresh(), "datos.db");
  inAnotherProcess(root, "(t.recordQuizTelemetry(root, { pregunta: '¿x?', ok: true }), 1)", { STUDIO_DB: elsewhere });
  assert.equal(count(elsewhere), 1);
  assert.throws(() => readFileSync(join(root, "learning.db")), { code: "ENOENT" });
});
