// A write-part prompt carries a compact, factual brief: the tutor must not have to
// discover the topic layout with ls/find/reads before it can write the note (T2b).
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { partBrief, partBriefAsync, MAX_PART_BRIEF_BYTES, PART_BRIEF_MARK, PART_MATERIAL_TIMEOUT_MS } from "./brief.ts";
import { cerrarIndice, configurarIndice, esperarIndice, indicePath, indizarFuente } from "./indice.ts";
import { ruleSheet } from "../tools/part-check.mjs";
import { vectorDe } from "./testdata/fake-embed.mjs";

// The write-part brief ranks a course's chunks synchronously: no embedder is needed or started.
configurarIndice({ embedCommand: null });
import { startStudio } from "./server.ts";
import { stripLecciones } from "./sugerencias.ts";
import { makeRoot } from "./testdata/root.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const FREQUENT_FILE = join(REPO, "tools", "part-check-frequent.json");
const FREQUENT_HEADING = "Most frequent first-draft findings";
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
const FAKE_AGY = join(HERE, "testdata", "fake-agy.mjs");
const FAKE_EMBED = join(HERE, "testdata", "fake-embed.mjs");
const PARTS = [
  { id: "p1", title: "Capas", slug: "Capas", subtema: "1.1" },
  { id: "p2", title: "TCP", slug: "TCP", subtema: "1.2.1" },
  { id: "p3", title: "Enrutamiento", slug: "Enrutamiento", subtema: "1.3" },
];
const WRITE_TEXT = "Escribe la Parte 2 «TCP» de Redes (carpeta redes): con sus visuales, sus ejemplos y su mini-quiz.";

/** The on-disk course contract, as `studio/plan-brief.test.mjs` builds it. */
function curso(raiz, nombre, temas = []) {
  const id = randomBytes(16).toString("hex");
  mkdirSync(join(raiz, ".materias", id), { recursive: true });
  writeFileSync(join(raiz, ".materias", id, "materia.json"), `${JSON.stringify({
    id, nombre, creada: new Date().toISOString(), temas, fuentes: [],
  })}\n`);
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
  assert.match(prompt, /RULE SHEET/, "the generated rule sheet travels with the brief");
  for (const id of ["ruta", "termino-sin-explicar", "letra-diminuta", "spill"]) {
    assert.match(prompt, new RegExp(`\\b${id}\\b`), `${id} is already known before writing`);
  }
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

test("the part number decides the destination when two parts share a title", () => {
  const parts = [
    { id: "p1", title: "Igual", slug: "Uno" },
    { id: "p2", title: "Igual", slug: "Dos" },
  ];
  const { root } = makeRoot({ parts });
  const brief = partBrief(root, "Escribe la Parte 2 «Igual» de Redes (carpeta redes): con sus visuales.");
  const destination = brief.split("\n").find((line) => line.startsWith("Destino: "));
  assert.equal(
    destination,
    `Destino: ${join(root, "redes", "explicaciones", "Parte 2 - Dos.md")}`,
    `the numbered part is the target even when its title is repeated: ${destination}`,
  );
});

test("the rule sheet is complete and stays within the brief's stated bound", () => {
  const { root } = makeRoot();
  const brief = partBrief(root, WRITE_TEXT);
  assert.ok(brief.includes(PART_BRIEF_MARK));
  for (const row of ruleSheet()) assert.match(brief, new RegExp(`\\b${row.id}\\b`), `${row.id} is in the sheet`);
  const size = Buffer.byteLength(brief, "utf8");
  assert.ok(size <= MAX_PART_BRIEF_BYTES, `brief is ${size} bytes, bound is ${MAX_PART_BRIEF_BYTES}`);
  assert.ok(MAX_PART_BRIEF_BYTES <= 12 * 1024, `the bound is ${MAX_PART_BRIEF_BYTES}, above ~12 KB`);
});

test("the brief's rule sheet leads with the frequent first-draft findings and stays bounded", () => {
  const frequentIds = JSON.parse(readFileSync(FREQUENT_FILE, "utf8"));
  const { root } = makeRoot();
  const brief = partBrief(root, WRITE_TEXT);
  const heading = brief.indexOf(FREQUENT_HEADING);
  assert.ok(heading >= 0, "the frequent heading travels with the brief");
  const positions = frequentIds.map((id) => {
    const at = brief.indexOf(`\n${id} |`, heading);
    assert.ok(at > heading, `${id} is under the heading in the brief`);
    return at;
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "the brief keeps the checked-in order");
  const size = Buffer.byteLength(brief, "utf8");
  assert.ok(size <= MAX_PART_BRIEF_BYTES, `brief is ${size} bytes, bound is ${MAX_PART_BRIEF_BYTES}`);
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

// Rule 1 (#374/T4): the part is written from its course's relevant slices, never from the plan entry alone.
test("a part written for a course topic carries the slices relevant to that part", () => {
  const { root } = makeRoot();
  const id = curso(root, "Redes", ["redes"]);
  fuente(root, id, "tcp.txt", "documento", "TCP usa puertos, segmentos y una ventana deslizante para no perder datos.");
  const brief = partBrief(root, WRITE_TEXT);
  assert.match(brief, /tcp\.txt \(documento, (?:párrafo|líneas|página) [^)]+\)/, `the source, its type and its location: ${brief}`);
  assert.ok(brief.includes("ventana deslizante"), "the slice itself travels, not just its name");
});

// Rule 2 (#374/T4): the material section is part of the same 12 KiB brief and reports what it left out.
test("the part brief stays bounded and says how many slices it left out", () => {
  const { root } = makeRoot();
  const id = curso(root, "Redes", ["redes"]);
  const largo = Array.from({ length: 500 }, () => "tcp").join(" ");
  for (let indice = 0; indice < 8; indice += 1) fuente(root, id, `tcp-${indice}.txt`, "documento", `${largo} fuente ${indice}.`);
  const brief = partBrief(root, WRITE_TEXT);
  assert.ok(Buffer.byteLength(brief, "utf8") <= MAX_PART_BRIEF_BYTES, `bounded: ${Buffer.byteLength(brief, "utf8")}`);
  assert.match(brief, /\d+ fragmentos relevantes sin mostrar/, "silence is the one thing it may not do");
});

// Rule 3 (#374/T4): a source whose subject does not match the part must not leak into it.
test("material that does not belong to the part stays out", () => {
  const { root } = makeRoot();
  const id = curso(root, "Redes", ["redes"]);
  fuente(root, id, "tcp.txt", "documento", "TCP usa puertos, segmentos y una ventana deslizante para no perder datos.");
  fuente(root, id, "reposteria.txt", "documento", "Receta de pan casero: 1 kg de harina, 2 huevos y levadura fresca.");
  const brief = partBrief(root, WRITE_TEXT);
  assert.ok(brief.includes("tcp.txt"), "the slice that belongs to the part is there");
  assert.ok(!brief.includes("reposteria.txt"), `the decoy source stays out: ${brief}`);
});

// Rule 4 (#374/T4): every example or claim taken from the material is traced back for the learner.
test("the brief tells the part to cite the source and location of what it takes", () => {
  const { root } = makeRoot();
  const id = curso(root, "Redes", ["redes"]);
  fuente(root, id, "tcp.txt", "documento", "TCP usa puertos, segmentos y una ventana deslizante para no perder datos.");
  const brief = partBrief(root, WRITE_TEXT);
  assert.match(brief, /cita[^\n]*fuente[^\n]*ubicaci[^\n]*/i, `the citation order is asked for: ${brief}`);
});

// Rule 5 (#374/T4): nothing already delivered changes without a course or without indexed material.
test("a topic without a course or a course without indexed material keeps today's brief", () => {
  const { root } = makeRoot();
  const sinCurso = partBrief(root, WRITE_TEXT);
  const id = curso(root, "Redes", ["redes"]);
  assert.equal(partBrief(root, WRITE_TEXT), sinCurso, "an empty course adds no line and changes no byte");
  fuente(root, id, "tcp.txt", "documento", "TCP usa puertos, segmentos y una ventana deslizante para no perder datos.");
  assert.notEqual(partBrief(root, WRITE_TEXT), sinCurso, "indexed material is the only thing that changes it");
});

// Rule 6 (#374/T4): material that cannot be read is a stderr line, never a broken brief or turn.
test("a broken index degrades to today's brief and logs to stderr", () => {
  const { root } = makeRoot();
  const sinMaterial = partBrief(root, WRITE_TEXT);
  curso(root, "Redes", ["redes"]);
  writeFileSync(indicePath(root), "esto no es una base de datos\n", "utf8");
  const escrito = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => { escrito.push(String(chunk)); return true; };
  let brief;
  try {
    brief = partBrief(root, WRITE_TEXT);
  } finally {
    process.stderr.write = original;
  }
  assert.equal(brief, sinMaterial, "a broken index leaves the brief exactly as it was");
  assert.ok(escrito.some((linea) => /material/i.test(linea) && /redes/.test(linea)), `the failure is logged: ${escrito.join("")}`);
});

// ---- #422: the awaited half of the brief -----------------------------------

/** The embedder the index tests use: deterministic vectors, no model, no network. */
const conEmbedder = () => configurarIndice({ embedCommand: [process.execPath, FAKE_EMBED] });
const sinEmbedder = () => configurarIndice({ embedCommand: null });
/**
 * The deterministic fake hashes tokens, so two different tokens that hash to the same vector are
 * "the same subject" to it while sharing no word at all: exactly the slice the keyword half cannot
 * find. The first test re-derives the collision, so the fixture cannot rot silently.
 */
const COLISION = "ajd9q";

/** Captures what the studio writes to stderr while `work` runs: a learner never sees those lines. */
async function conStderr(work) {
  const lineas = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => { lineas.push(String(chunk)); return true; };
  try {
    const valor = await work();
    return { valor, lineas };
  } finally {
    process.stderr.write = original;
  }
}

// Rule 1 (#422): the part brief uses `/buscar`'s hybrid rank when the embedder is available, so a
// slice that shares no keyword with the part but is the same subject still reaches the note.
test("with the embedder, the part gets the slice only the semantic half finds", async () => {
  assert.deepEqual(vectorDe(COLISION), vectorDe("tcp"), "the fake reads the fixture token as the part's subject");
  conEmbedder();
  try {
    const { root } = makeRoot();
    const id = curso(root, "Redes", ["redes"]);
    fuente(root, id, "protocolo.txt", "documento", `${COLISION} ${COLISION} ${COLISION}.`);
    await esperarIndice();
    assert.ok(!partBrief(root, WRITE_TEXT).includes("protocolo.txt"), "the keyword half alone never finds it");
    const brief = await partBriefAsync(root, WRITE_TEXT);
    assert.match(brief, /protocolo\.txt \(documento, [^)]+\)/, `the slice only the embedder ranks reaches the part: ${brief}`);
  } finally {
    await cerrarIndice();
    sinEmbedder();
  }
});

// Rule 2 (#422): the awaited path degrades to exactly today's keyword brief when the embedder is gone.
test("without the embedder the awaited brief is today's keyword brief, byte for byte", async () => {
  conEmbedder();
  try {
    const { root } = makeRoot();
    const id = curso(root, "Redes", ["redes"]);
    fuente(root, id, "tcp.txt", "documento", "TCP usa puertos, segmentos y una ventana deslizante para no perder datos.");
    await esperarIndice();
    sinEmbedder();
    const hoy = partBrief(root, WRITE_TEXT);
    assert.ok(hoy.includes("tcp.txt"), "the vectors are on disk, so only the missing embedder can explain the brief");
    const esperado = await partBriefAsync(root, WRITE_TEXT);
    assert.equal(esperado, hoy, "the awaited path degrades to exactly today's brief");
  } finally {
    await cerrarIndice();
    sinEmbedder();
  }
});

// Rule 3 (#422): the model may hang; the part must not. At the bound the keyword brief is delivered
// and the delay is the studio's log, never a line the learner reads.
test("a hanging embedder never delays the brief past the bound", async () => {
  conEmbedder();
  try {
    const { root } = makeRoot();
    const id = curso(root, "Redes", ["redes"]);
    fuente(root, id, "tcp.txt", "documento", "TCP usa puertos, segmentos y una ventana deslizante para no perder datos.");
    await esperarIndice();
    const keyword = partBrief(root, WRITE_TEXT);
    // A fresh child that receives the query and never answers it.
    process.env.FAKE_EMBED_DELAY_MS = String(10 * PART_MATERIAL_TIMEOUT_MS);
    conEmbedder();
    const comienzo = Date.now();
    let resultado;
    try {
      resultado = await conStderr(() => partBriefAsync(root, WRITE_TEXT));
    } finally {
      delete process.env.FAKE_EMBED_DELAY_MS;
    }
    const gastado = Date.now() - comienzo;
    assert.ok(gastado >= PART_MATERIAL_TIMEOUT_MS - 25, `the embedder really was awaited: ${gastado} ms`);
    assert.ok(gastado < PART_MATERIAL_TIMEOUT_MS + 750, `never past the bound: ${gastado} ms`);
    assert.equal(resultado.valor, keyword, "at the bound the learner's part carries today's keyword brief");
    assert.ok(!/embedder/i.test(resultado.valor), "the delay is not part of the prompt");
    assert.ok(
      resultado.lineas.some((linea) => /embedder/i.test(linea) && /TCP/.test(linea)),
      `the delay is logged to stderr: ${resultado.lineas.join("")}`,
    );
  } finally {
    await cerrarIndice();
    sinEmbedder();
  }
});

// Rule 4 (#422): the awaited brief keeps every bound and every instruction of the synchronous one.
test("the awaited brief stays inside the byte bound, counts the leftovers and keeps the citation order", async () => {
  conEmbedder();
  try {
    const { root } = makeRoot();
    const id = curso(root, "Redes", ["redes"]);
    const largo = Array.from({ length: 500 }, () => "tcp").join(" ");
    for (let indice = 0; indice < 8; indice += 1) fuente(root, id, `tcp-${indice}.txt`, "documento", `${largo} fuente ${indice}.`);
    await esperarIndice();
    const brief = await partBriefAsync(root, WRITE_TEXT);
    assert.ok(Buffer.byteLength(brief, "utf8") <= MAX_PART_BRIEF_BYTES, `bounded: ${Buffer.byteLength(brief, "utf8")}`);
    assert.match(brief, /\d+ fragmentos relevantes sin mostrar/, "silence is the one thing it may not do");
    assert.ok(
      brief.includes("cita el nombre de la fuente y la ubicación de todo ejemplo o afirmación que tomes de aquí"),
      "the citation instruction is unchanged",
    );
  } finally {
    await cerrarIndice();
    sinEmbedder();
  }
});

// Rule 5 (#422): nothing already delivered changes, and nothing is started, without a course or
// without indexed material. The injected command does not exist, so any start would log to stderr.
test("a topic without a course or a course with no material keeps today's brief and starts no embedder", async () => {
  configurarIndice({ embedCommand: [join(HERE, "testdata", "no-such-embed.mjs")] });
  const { root } = makeRoot();
  const sinCurso = partBrief(root, WRITE_TEXT);
  const inicio = Date.now();
  let fueraDeCurso;
  let cursoVacio;
  let escrito;
  try {
    const traza = await conStderr(async () => {
      fueraDeCurso = await partBriefAsync(root, WRITE_TEXT);
      curso(root, "Redes", ["redes"]);
      cursoVacio = await partBriefAsync(root, WRITE_TEXT);
    });
    escrito = traza.lineas;
  } finally {
    sinEmbedder();
  }
  assert.equal(fueraDeCurso, sinCurso, "a topic outside every course is untouched");
  assert.equal(cursoVacio, sinCurso, "a course with no indexed material adds no byte");
  assert.equal(escrito.length, 0, `no embedder is started: ${escrito.join("")}`);
  assert.ok(Date.now() - inicio < 1000, "and nothing is waited for");
});

test.after(async () => { await cerrarIndice(); });
