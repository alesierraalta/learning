// A write-part prompt carries a compact, factual brief: the tutor must not have to
// discover the topic layout with ls/find/reads before it can write the note (T2b).
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { partBrief, MAX_PART_BRIEF_BYTES, PART_BRIEF_MARK } from "./brief.ts";
import { startStudio } from "./server.ts";
import { stripLecciones } from "./sugerencias.ts";
import { makeRoot } from "./testdata/root.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
const FAKE_AGY = join(HERE, "testdata", "fake-agy.mjs");
const PARTS = [
  { id: "p1", title: "Capas", slug: "Capas", subtema: "1.1" },
  { id: "p2", title: "TCP", slug: "TCP", subtema: "1.2.1" },
  { id: "p3", title: "Enrutamiento", slug: "Enrutamiento", subtema: "1.3" },
];
const WRITE_TEXT = "Escribe la Parte 2 «TCP» de Redes (carpeta redes): con sus visuales, sus ejemplos y su mini-quiz.";
const open = [];
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
});

function http(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const post = (studio, path, payload) =>
  http(`${studio.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(studio.url).origin },
    body: JSON.stringify(payload),
  });

async function until(pred, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!pred() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(pred(), "the fake runtime did not receive the prompt in time");
}

async function tutor({ runtime = "pi", parts = PARTS } = {}) {
  const { root, engine, log } = makeRoot({ parts });
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.jsonl");
  process.env.FAKE_AGY_TURNS = turns;
  writeFileSync(join(root, "tutor.json"), `${JSON.stringify({ version: 1, agente: runtime, modelo: "", pensamiento: "" })}\n`);
  writeFileSync(join(root, "redes", ".learning", "state.json"), `${JSON.stringify({ method: "pareto" })}\n`);
  writeFileSync(join(root, "redes", "registro.jsonl"), '{"run":1}\n');
  const studio = await startStudio({
    root,
    enginePath: engine,
    skipContextCheck: true,
    piCommand: [process.execPath, FAKE_PI],
    agyCommand: [process.execPath, FAKE_AGY],
  });
  open.push(studio);
  const received = () => {
    if (runtime === "agy") {
      return existsSync(turns) ? readFileSync(turns, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)[1]) : [];
    }
    return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((c) => c.type === "prompt").map((c) => c.message) : [];
  };
  return { studio, root, received };
}

function assertBrief(prompt, root) {
  const target = join(root, "redes", "explicaciones", "Parte 2 - TCP.md");
  assert.ok(prompt.startsWith(WRITE_TEXT), "the learner's prompt is kept, not replaced");
  assert.ok(prompt.includes(PART_BRIEF_MARK), "the brief was added");
  assert.ok(prompt.includes(`Destino: ${target}`), `the exact target path is in the brief: ${prompt}`);
  assert.ok(prompt.includes(`node ${join(REPO, "tools", "part-check.mjs")} ${target}`), `one check command: ${prompt}`);
  assert.ok(prompt.includes("1. Capas"), "sibling title and number are in the brief");
  assert.ok(prompt.includes(join(root, "redes", "explicaciones", "Parte 1 - Capas.md")), "sibling path is in the brief");
  assert.ok(prompt.includes("3. Enrutamiento"), "all siblings are listed");
  assert.ok(prompt.includes("pareto"), "the chosen method is pre-loaded");
  assert.ok(prompt.includes("1.2.1"), "the plan entry is pre-loaded as stored");
  assert.ok(prompt.includes(join(root, "redes", ".learning", "state.json")));
  assert.ok(prompt.includes(join(root, "tutor.json")));
  assert.ok(prompt.includes(join(root, "redes", "registro.jsonl")));
}

for (const runtime of ["pi", "agy"]) {
  test(`a write-part prompt reaches ${runtime} with the factual brief`, async () => {
    const { studio, root, received } = await tutor({ runtime });
    assert.equal((await post(studio, "prompt", { text: WRITE_TEXT, tema: "redes" })).status, 200);
    await until(() => received().length > 0);
    assertBrief(received()[0], root);
  });
}

test("a prompt that does not ask for a part is unchanged", async () => {
  const { studio, received } = await tutor();
  assert.equal((await post(studio, "prompt", { text: "Hola, ¿qué tal?", tema: "redes" })).status, 200);
  await until(() => received().length > 0);
  assert.equal(stripLecciones(received()[0]), "Hola, ¿qué tal?", "no brief on a general turn");
});

test("a part chat question is not a write-part prompt", async () => {
  const { studio, received } = await tutor();
  const text = "[Vista HTML · redes · p2 · pregunta]\n¿Por qué TCP usa puertos?";
  assert.equal((await post(studio, "prompt", { text, tema: "redes" })).status, 200);
  await until(() => received().length > 0);
  assert.ok(received()[0].startsWith(text));
  assert.ok(!received()[0].includes(PART_BRIEF_MARK), "a question in the part chat is unchanged");
});

test("a part chat that asks to write its part gets the brief", async () => {
  const { studio, root, received } = await tutor();
  const text = "[Vista HTML · redes · p2 · pregunta]\nEscribe la Parte 2 sobre TCP, por favor.";
  assert.equal((await post(studio, "prompt", { text, tema: "redes" })).status, 200);
  await until(() => received().length > 0);
  assert.ok(received()[0].includes(PART_BRIEF_MARK));
  assert.ok(received()[0].includes(join(root, "redes", "explicaciones", "Parte 2 - TCP.md")));
});

test("a 20-part topic keeps the brief under the byte bound", async () => {
  const parts = Array.from({ length: 20 }, (_, index) => ({
    id: `p${index + 1}`,
    title: `Parte con un título suficientemente largo número ${index + 1} para probar el tamaño`,
    slug: `parte-numero-${index + 1}`,
    subtema: `1.${index + 1}`,
  }));
  const { root } = makeRoot({ parts: parts.slice(0, 2) });
  const { root: bigRoot } = makeRoot({ parts });
  const brief = partBrief(bigRoot, `Escribe la Parte 20 «${parts[19].title}» de Redes (carpeta redes): con sus visuales.`);
  assert.ok(brief.includes(PART_BRIEF_MARK));
  assert.ok(Buffer.byteLength(brief, "utf8") < MAX_PART_BRIEF_BYTES, `brief is ${Buffer.byteLength(brief, "utf8")} bytes`);
  assert.ok(brief.includes(`20. ${parts[19].title.slice(0, 20)}`), "every sibling is still represented");
  assert.ok(brief.includes(join(bigRoot, "redes", "explicaciones", "Parte 20 - parte-numero-20.md")));
  assert.equal(partBrief(root, "Hola"), "", "no brief for a general prompt");
});
