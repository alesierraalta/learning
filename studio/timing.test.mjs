// The measurement of one page generation: the report says what each phase of the turn really
// cost and how many times the tutor was called, and the part it produced is the same bytes it
// would be without the measurement. A fake Pi writes the part, a fake engine clears the turn.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStudio as startStudioChecked } from "./server.ts";
import { stripLecciones } from "./sugerencias.ts";
import { makeRoot } from "./testdata/root.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
const startStudio = (options) => startStudioChecked({ skipContextCheck: true, ...options });

/** The part the tutor writes, byte for byte: the page under test. */
const PART = [
  "# Parte 1 — Capas",
  "",
  "Una capa esconde lo de abajo y ofrece algo arriba.",
  "",
  "## Mini-quiz",
  "",
  "1. ¿Qué es una capa?",
  "",
].join("\n");

/** The engine has not cleared the turn: the studio owes the tutor one correction. */
const FAILING_STAGE = {
  status: "waiting",
  stage: "explanation",
  nextStage: "explanation",
  part: "p1",
  checks: [{ id: "p1-explained", status: "FAIL", reason: "la explicación de la parte p1 no existe todavía" }],
};
/** The same stage once the part exists: the engine is the authority that clears the turn. */
const CLEARED_STAGE = {
  status: "accepted",
  stage: "explanation",
  nextStage: "explanation",
  part: "p1",
  checks: [{ id: "p1-explained", status: "PASS", reason: "la explicación de la parte p1 está escrita" }],
};

const open = [];
after(async () => {
  for (const studio of open) await studio.close();
  delete process.env.FAKE_PI_WRITES;
});

/** Where the studio keeps the report of each generation: its own state directory, outside the vault. */
const timingsDir = () => join(process.env.XDG_STATE_HOME, "learning-studio", "page-timings");

/** One generation: a studio whose tutor writes the part the test scripts, and a fake engine. */
async function generation(parts, engine = { status: CLEARED_STAGE }) {
  const { root, engine: enginePath, log } = makeRoot(engine);
  process.env.FAKE_PI_LOG = log;
  process.env.FAKE_PI_WRITES = JSON.stringify(
    parts.map((files) => files.map(({ name, content }) => ({ path: join(root, "redes", "explicaciones", name), content }))),
  );
  const studio = await startStudio({
    root,
    piCommand: [process.execPath, FAKE_PI],
    enginePath,
    // The part's own tools are the repo's; a measurement test is not a browser test.
    partChecks: async () => ({ kind: "clean" }),
  });
  open.push(studio);
  // The topic is enrolled in the engine, so a part of it can be asked for.
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  const prompts = () => piLog(log).filter((command) => command.type === "prompt");
  const endTurn = async () => {
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
  };
  return { studio, root, log, stream, prompts, endTurn, close: () => stream.close() };
}

/** The report files on disk, oldest name first (the name carries the generation's own start). */
const reports = () => {
  const dir = timingsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name, report: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
};

const until = async (pred, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (pred()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition not met");
};

/** The page's own view of a turn: it held it from the request, and let it go when the turn ended. */
const statesSince = (stream, mark) => stream.events.filter((event) => event.name === "state").slice(mark);
const markOf = (stream) => stream.events.filter((event) => event.name === "state").length;
/** Posts a request and waits until the turn it started is really the one the page is holding. */
async function begin(stream, send) {
  const mark = markOf(stream);
  const answer = await send();
  await until(() => statesSince(stream, mark).some((event) => event.data.busy === true));
  return { answer, mark };
}
/** The turn is over: the page says so, and only then is its report on disk. */
const settles = (stream, mark) =>
  until(() => statesSince(stream, mark).at(-1)?.data.busy === false);

const piLog = (log) =>
  existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];

function http(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const post = (studio, action, body) =>
  http(`${studio.url}${action}`, { method: "POST", headers: { origin: new URL(studio.url).origin, "content-type": "application/json" }, body: JSON.stringify(body) });

function sse(url) {
  const events = [];
  const waiters = [];
  let buffer = "";
  const req = request(url, (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buffer += chunk;
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const name = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (name) events.push({ name, data: JSON.parse(data) });
        for (const w of [...waiters]) w();
        end = buffer.indexOf("\n\n");
      }
    });
  });
  req.end();
  const next = (name, pred = () => true, timeout = 5000) =>
    new Promise((resolve, reject) => {
      const check = () => {
        const hit = events.find((e) => e.name === name && pred(e.data) && !e.taken);
        if (hit) {
          hit.taken = true;
          waiters.splice(waiters.indexOf(check), 1);
          clearTimeout(timer);
          resolve(hit.data);
        }
      };
      const timer = setTimeout(() => reject(new Error(`no ${name} event; got ${events.map((e) => e.name).join(",")}`)), timeout);
      waiters.push(check);
      check();
    });
  return { events, next, close: () => req.destroy() };
}

test("a generation writes the timing of every phase, and the page it produced is byte-identical", async () => {
  const tutor = await generation([[{ name: "Parte 1 - Capas.md", content: PART }]]);
  try {
    const before = reports().length;
    const { answer, mark } = await begin(tutor.stream, () => post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" }));
    assert.equal(answer.status, 200);
    await until(() => tutor.prompts().length === 1);
    await tutor.endTurn();
    await settles(tutor.stream, mark);

    const written = reports().slice(before);
    assert.equal(written.length, 1, `one report per generation, got ${JSON.stringify(written.map((w) => w.name))}`);
    const { report } = written[0];

    assert.equal(report.version, 1, "the report has a version, so a reader knows its shape");
    assert.equal(report.tutor, "pi", "the runtime is recorded by its own name");
    assert.match(report.startedAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/, "the generation says when it happened");
    assert.ok(report.finishedAt >= report.startedAt, "and when it ended");
    assert.equal(report.topic, "redes");

    // Every phase the code really has is timed, and says how many times it happened.
    const phases = Object.fromEntries(report.phases.map((phase) => [phase.name, phase]));
    for (const name of ["contexto", "tutor", "motor", "comprobaciones"]) {
      assert.ok(phases[name], `the report times ${name}: ${JSON.stringify(report.phases)}`);
      assert.equal(typeof phases[name].ms, "number");
      assert.ok(phases[name].ms >= 0);
      assert.equal(phases[name].times, 1, `${name} happened once`);
    }

    // The model calls are counted, with what went in and what came out of each one.
    assert.equal(report.modelCalls, 1, "one prompt, one call");
    assert.equal(report.calls.length, 1);
    assert.deepEqual(
      { n: report.calls[0].n, reason: report.calls[0].reason, ok: report.calls[0].ok },
      { n: 1, reason: "turn", ok: true },
    );
    assert.equal(report.calls[0].inputChars, tutor.prompts()[0].message.length, "the input is the prompt the tutor received");
    assert.equal(report.calls[0].outputChars, "Hola, elegiste Universitario.".length, "the output is what the tutor said");

    // The save and the references are not phases of a generation: they are named, not invented.
    assert.deepEqual(report.absent.map((phase) => phase.name).sort(), ["guardado", "referencias"]);
    for (const phase of report.absent) assert.ok(phase.reason.length > 20, `${phase.name} says why it cannot be timed`);

    // The page the generation produced: measured, and exactly what the tutor wrote.
    assert.deepEqual(report.parts, [
      { path: "redes/explicaciones/Parte 1 - Capas.md", bytes: Buffer.byteLength(PART) },
    ]);
    assert.equal(
      readFileSync(join(tutor.root, "redes", "explicaciones", "Parte 1 - Capas.md"), "utf8"),
      PART,
      "measuring did not touch the markdown the tutor wrote",
    );
    // And nothing of the measurement landed in the vault beside the page.
    assert.deepEqual(readdirSync(join(tutor.root, "redes", "explicaciones")).sort(), ["Parte 1 - Capas.md", "apps"]);
  } finally {
    tutor.close();
  }
});

test("a generation counts every model call it makes, the engine's correction included", async () => {
  const tutor = await generation(
    [[{ name: "Parte 1 - Capas.md", content: PART }], [{ name: "Parte 1 - Capas.md", content: PART }]],
    { statuses: [FAILING_STAGE, CLEARED_STAGE] },
  );
  try {
    const { answer, mark } = await begin(tutor.stream, () => post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" }));
    assert.equal(answer.status, 200);
    await until(() => tutor.prompts().length === 1);
    await tutor.endTurn();
    await until(() => tutor.prompts().length === 2);
    await tutor.endTurn();
    await settles(tutor.stream, mark);

    const { report } = reports().at(-1);
    assert.equal(report.modelCalls, 2, "the learner's prompt and the engine's correction");
    assert.deepEqual(report.calls.map((call) => call.reason), ["turn", "engine-correction"]);
    assert.deepEqual(report.calls.map((call) => call.n), [1, 2]);
    const prompts = tutor.prompts();
    assert.deepEqual(report.calls.map((call) => call.inputChars), prompts.map((command) => command.message.length));
    for (const call of report.calls) assert.ok(call.outputChars > 0, "each call says what it answered");
    // The correction is the studio's own instruction; the learner's prompt is still the learner's.
    assert.equal(stripLecciones(prompts[0].message), "Escribe la Parte 1");
    assert.match(stripLecciones(prompts[1].message), /^Learning gate: the engine has not cleared this turn\./);
    // The engine was asked once per settle; the part is measured once, by the settle that cleared it.
    const phases = Object.fromEntries(report.phases.map((phase) => [phase.name, phase]));
    assert.equal(phases.motor.times, 2, "one engine verdict per settle");
    assert.equal(phases.comprobaciones.times, 1, "the part is measured once the engine clears the turn");
  } finally {
    tutor.close();
  }
});

test("two generations of the same part leave two reports with the same shape", async () => {
  const tutor = await generation([
    [{ name: "Parte 1 - Capas.md", content: PART }],
    [{ name: "Parte 1 - Capas.md", content: PART }],
  ]);
  try {
    const before = reports().length;
    for (const turn of [1, 2]) {
      const { answer, mark } = await begin(tutor.stream, () => post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" }));
      assert.equal(answer.status, 200);
      await until(() => tutor.prompts().length === turn);
      await tutor.endTurn();
      await settles(tutor.stream, mark);
    }
    const written = reports().slice(before);
    assert.equal(written.length, 2, "each generation wrote its own report");
    const [first, second] = written.map((entry) => entry.report);
    assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort(), "the same shape, so the two compare");
    assert.equal(first.modelCalls, second.modelCalls);
    assert.deepEqual(first.parts, second.parts);
    assert.notEqual(written[0].name, written[1].name, "the report's own name tells the two generations apart");
    assert.ok(first.totalMs >= 0 && second.totalMs >= 0, "and each says how long it took");
  } finally {
    tutor.close();
  }
});

test("an Antigravity generation is measured with its own runtime and its own sizes", async () => {
  const { root, engine: enginePath, log } = makeRoot({ status: CLEARED_STAGE });
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  process.env.FAKE_AGY_TURNS = turns;
  process.env.FAKE_AGY_WRITES = JSON.stringify([
    [{ path: join(root, "redes", "explicaciones", "Parte 1 - Capas.md"), content: PART }],
  ]);
  const studio = await startStudio({
    root,
    piCommand: [process.execPath, FAKE_PI],
    agyCommand: [process.execPath, join(HERE, "testdata", "checking-agy.mjs")],
    enginePath,
    partChecks: async () => ({ kind: "clean" }),
  });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    const before = reports().length;
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    await stream.next("state");
    const { answer, mark } = await begin(stream, () => post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" }));
    assert.equal(answer.status, 200);
    await settles(stream, mark);

    const written = reports().slice(before);
    assert.equal(written.length, 1, "the other runtime leaves its own report");
    const { report } = written[0];
    assert.equal(report.tutor, "agy");
    assert.equal(report.modelCalls, 1);
    assert.ok(report.calls[0].inputChars > "Escribe la Parte 1".length, "the prompt the studio sent, lessons included");
    assert.equal(report.calls[0].outputChars, "Escribí la parte".length, "what Antigravity answered");
    assert.deepEqual(report.parts.map((part) => part.bytes), [Buffer.byteLength(PART)]);
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_WRITES;
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("a turn that wrote no part leaves no report", async () => {
  const tutor = await generation([]);
  try {
    const before = reports().length;
    const { answer, mark } = await begin(tutor.stream, () => post(tutor.studio, "prompt", { text: "Hola", tema: "redes" }));
    assert.equal(answer.status, 200);
    await until(() => tutor.prompts().length === 1);
    await tutor.endTurn();
    await settles(tutor.stream, mark);
    assert.equal(reports().length, before, "no page, nothing to time");
  } finally {
    tutor.close();
  }
});
