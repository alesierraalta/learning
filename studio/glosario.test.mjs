// The preliminary glossary is one short call outside the tutor's loop, cached next
// to the studio state and never inside the vault.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGlosario, glosarioArgs, parseGlosario } from "./glosario.ts";
import { makeRoot } from "./testdata/root.mjs";

const HERE = join(process.cwd(), "studio");
const FAKE = join(HERE, "testdata", "fake-glosario.mjs");
const config = { version: 1, agente: "agy", modelo: "gemini-3.8-flash-high", pensamiento: "" };
const filesBelow = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
};

test("the short call is one-shot, no-tools and uses the fastest model of the runtime", () => {
  const agy = glosarioArgs({ agente: "agy", prompt: "da un glosario", model: "gemini-3.8-flash-low" });
  assert.deepEqual(agy.slice(0, 2), ["-p", "da un glosario"]);
  assert.ok(agy.includes("--model") && agy[agy.indexOf("--model") + 1] === "gemini-3.8-flash-low");
  assert.ok(agy.includes("--output-format"));
  const pi = glosarioArgs({ agente: "pi", prompt: "da un glosario", model: "proveedor/modelo-flash" });
  assert.ok(pi.includes("--no-tools"), "Pi must not get a tool loop");
  assert.ok(pi.includes("--model") && pi[pi.indexOf("--model") + 1] === "proveedor/modelo-flash");
  assert.ok(pi.includes("--no-session") && pi.includes("--no-extensions"));
});

test("a malformed or short answer is not a glossary", () => {
  assert.throws(() => parseGlosario("no es JSON"), /glosario/);
  assert.throws(() => parseGlosario('{"terminos":[{"termino":"uno"}]}'), /glosario/);
  const parsed = parseGlosario(`\`\`\`json\n${JSON.stringify({
    terminos: Array.from({ length: 9 }, (_, i) => ({ termino: `t${i}`, definicion: `d${i}`, ejemplo: `e${i}` })),
    preguntas: [{ enunciado: "¿Qué?", opciones: { A: "sí", B: "no", C: "quizá" }, respuesta: "B" }],
  })}\n\`\`\``);
  assert.equal(parsed.terminos.length, 8, "bounded to at most eight terms");
  assert.deepEqual(parsed.preguntas[0].opciones, { A: "sí", B: "no", C: "quizá" });
  assert.equal(parsed.preguntas[0].respuesta, "B");
});

test("a generated glossary is cached per topic and part outside the vault", async () => {
  const { root } = makeRoot();
  const stateDir = mkdtempSync(join(tmpdir(), "glosario-state-"));
  const log = join(stateDir, "argv.log");
  process.env.FAKE_GLOSARIO_ARGV = log;
  const before = filesBelow(root);
  const first = createGlosario({ root, stateDir, config, command: [process.execPath, FAKE], timeoutMs: 5000, catalogTimeoutMs: 5000 });
  first.start("redes", "p1", { topicTitle: "Redes", partTitle: "Capas", subtemas: ["1.1"] });
  assert.equal(first.view("redes", "p1").estado, "generando", "the waiting section is never blocked by the call");
  await first.whenSettled("redes", "p1");
  const view = first.view("redes", "p1");
  assert.equal(view.estado, "listo");
  assert.equal(view.preliminar, true);
  assert.equal(view.terminos.length, 6);
  assert.equal(first.questions("redes", "p1")[0].enunciado, "¿Qué significa T1?");
  assert.deepEqual(filesBelow(root), before, "nothing is written inside the vault");
  const cached = filesBelow(stateDir).filter((path) => path.endsWith(".json"));
  assert.equal(cached.length, 1, `one cache file next to the state: ${cached.join(",")}`);

  const second = createGlosario({ root, stateDir, config, command: [process.execPath, FAKE], timeoutMs: 5000 });
  assert.equal(second.view("redes", "p1").estado, "listo");
  assert.equal(second.questions("redes", "p1").length, 1);
  await second.whenSettled("redes", "p1");
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 2, "the catalogue and the short call, once: no regeneration on a cache hit");
  delete process.env.FAKE_GLOSARIO_ARGV;
});

test("a timeout becomes no-disponible, never an error page and never a vault write", async () => {
  const { root } = makeRoot();
  const stateDir = mkdtempSync(join(tmpdir(), "glosario-timeout-"));
  const before = filesBelow(root);
  process.env.FAKE_GLOSARIO_DELAY_MS = "400";
  process.env.FAKE_GLOSARIO_REPLY = "not JSON";
  const g = createGlosario({ root, stateDir, config, command: [process.execPath, FAKE], timeoutMs: 60, catalogTimeoutMs: 2000 });
  g.start("redes", "p2", { topicTitle: "Redes", partTitle: "TCP", subtemas: [] });
  assert.equal(g.view("redes", "p2").estado, "generando");
  await g.whenSettled("redes", "p2");
  assert.equal(g.view("redes", "p2").estado, "no-disponible");
  assert.deepEqual(g.view("redes", "p2").terminos, []);
  assert.deepEqual(g.questions("redes", "p2"), []);
  assert.deepEqual(filesBelow(root), before);
  assert.equal(filesBelow(stateDir).filter((path) => path.endsWith(".json")).length, 0, "a failed call is not cached");
  delete process.env.FAKE_GLOSARIO_DELAY_MS;
  delete process.env.FAKE_GLOSARIO_REPLY;
});

test("the glossary does not take the topic writer lock", () => {
  const { root } = makeRoot();
  const stateDir = mkdtempSync(join(tmpdir(), "glosario-lock-"));
  const g = createGlosario({ root, stateDir, config, command: [process.execPath, FAKE], timeoutMs: 5000 });
  // A cached topic is served with no process and no lock at all.
  mkdirSync(join(stateDir, "espera-glosario"), { recursive: true });
  writeFileSync(join(stateDir, "espera-glosario", "redes__p1.json"), JSON.stringify({
    version: 1, topic: "redes", part: "p1", actualizado: new Date().toISOString(),
    terminos: Array.from({ length: 5 }, (_, i) => ({ termino: `Capa ${i}`, definicion: "Nivel", ejemplo: "Red" })), preguntas: [],
  }));
  assert.equal(g.view("redes", "p1").estado, "listo");
  assert.equal(readdirSync(join(stateDir, "espera-glosario")).length, 1);
});
