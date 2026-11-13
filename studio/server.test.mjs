// Learning studio server tests: a real server on 127.0.0.1 with a fake Pi RPC
// child (testdata/fake-pi.mjs) and a temporary Learnings root.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { request, createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { entryUrl, noteFromMessages, noteFromPath, startStudio as startStudioChecked, studioLinks, topicFromPath } from "./server.ts";
import { runPartChecks } from "./checks.ts";
import { stripLecciones } from "./sugerencias.ts";
import extension from "../integrations/pi/index.ts";
import { MAX_CORRECTIONS } from "../integrations/pi/gate-rules.ts";
import { makeRoot } from "./testdata/root.mjs";
import { stored, writeDoc } from "./testdata/stored.mjs";

test('configured studio bridge reaches the transcriber from its framed origin', async t => {
  let uploads = 0;
  const fake = createServer(async (req, res) => {
    for await (const _chunk of req) {}
    if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
    if (req.method === 'PUT') uploads++;
    assert.equal(req.headers.authorization, 'Bearer studio-transcriber-secret');
    let answer = JSON.stringify({ status: 'done' });
    if (req.method === 'PUT') answer = JSON.stringify({ id: 'studio-job' });
    else if (req.url.endsWith('/txt')) answer = 'desde estudio';
    res.end(answer);
  });
  await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => { fake.closeAllConnections(); fake.close(); });
  const { studio } = await setup({ transcriberUrl: `http://127.0.0.1:${fake.address().port}`, transcriberToken: 'studio-transcriber-secret' });
  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  const endpoint = `${view.url.replace(/redes\/p1$/, '')}api/transcribe`;
  const response = await http(endpoint, { method: 'POST', headers: { origin: new URL(view.url).origin, 'content-type': 'audio/webm' }, body: 'audio' });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { text: 'desde estudio' });
  assert.equal(uploads, 1);
});

test('transcriber settings must be paired', async () => {
  for (const options of [{ transcriberUrl: 'http://127.0.0.1:8765' }, { transcriberToken: 'secret' }]) {
    await assert.rejects(() => startStudio(options), /transcriberUrl and transcriberToken/);
  }
});

const HERE = dirname(fileURLToPath(import.meta.url));
/** What the learner wrote, out of the prompt the tutor received: the standing lessons are the studio's. */
const said = (prompt) => stripLecciones(prompt);
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
/**
 * `scene-lint` opens a real browser: the tests that measure a part with the repo's tools need one,
 * and a machine without Playwright skips them instead of pretending the part was measured.
 */
const browser = await (async () => {
  for (const id of [process.env.PLAYWRIGHT_MODULE, "playwright", "/home/alesierraalta/.npm-global/lib/node_modules/playwright/index.mjs"].filter(Boolean)) {
    try {
      return await import(id.startsWith("/") ? pathToFileURL(id).href : id);
    } catch {
      // Try the next entry point.
    }
  }
  return null;
})();
/**
 * Every studio here starts with the tutor context check off: the links a machine
 * happens to have outside the repo must not decide these tests. The drift tests
 * call `startStudioChecked` with the check on.
 */
const startStudio = (options) => startStudioChecked({ skipContextCheck: true, ...options });
const open = [];
after(async () => {
  for (const studio of open) await studio.close();
});

async function setup(options = {}) {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  // Every test owns its conversation index, and it lives outside the vault like the real one:
  // a shared file would leak chats between tests, and an in-vault one would hide export leaks.
  const chatsFile = join(mkdtempSync(join(tmpdir(), "chats-")), "chats.json");
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, chatsFile, ...options });
  open.push(studio);
  const received = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { studio, root, received };
}

function http(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("an Antigravity turn that ends with nothing says so", async () => {
  const { studio } = await setup({ agyCommand: [process.execPath, join(HERE, "testdata", "silent-agy.mjs")] });
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Hola" })).status, 200);
    const error = await stream.next("error");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const errors = stream.events.filter((event) => event.name === "error");
    assert.equal(errors.length, 1, `one error, got ${JSON.stringify(errors.map((event) => event.data))}`);
    assert.match(error.message, /sin responder/);
    const states = stream.events.filter((event) => event.name === "state");
    assert.equal(states.at(-1).data.busy, false, "the turn still settles");
  } finally { stream.close(); }
});

test("a missing Antigravity binary is one actionable error, not a fake exit code", async () => {
  const { studio } = await setup({ agyCommand: ["agy-not-installed-anywhere"] });
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Hola" })).status, 200);
    const error = await stream.next("error");
    // A failed spawn is reported once: waiting a beat proves no exit-code error follows it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const errors = stream.events.filter((event) => event.name === "error");
    assert.equal(errors.length, 1, `one error, got ${JSON.stringify(errors.map((event) => event.data))}`);
    assert.match(error.message, /agy-not-installed-anywhere/);
    assert.match(error.message, /PATH/);
    assert.doesNotMatch(error.message, /código -2/);
    const states = stream.events.filter((event) => event.name === "state");
    assert.equal(states.at(-1).data.busy, false, "a tutor that never started is not left busy");
  } finally { stream.close(); }
});

test("the Antigravity model catalogue is offered and the chosen model reaches the runtime", async () => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const argv = join(root, "agy-argv.log");
  process.env.FAKE_AGY_ARGV = argv;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  // With Pi saved, the unqualified catalogue is Pi's, never Antigravity's.
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/tutor/modelos`)).body), { modelos: PI_MODELS });
  assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/tutor/modelos`)).body).modelos, ["gemini-3.8-flash-high", "claude-sonnet-4-6"]);
  const saved = await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "claude-sonnet-4-6", pensamiento: "" });
  assert.equal(saved.status, 200, saved.body);
  assert.equal(JSON.parse(saved.body).modelo, "claude-sonnet-4-6");
  assert.equal((await post(studio, "prompt", { text: "Hola" })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.match(readFileSync(argv, "utf8"), /--model claude-sonnet-4-6/);
});

const PI_MODELS = ["claude-bridge/claude-fable-5", "claude-bridge/claude-sonnet-4-6", "opencode-go/glm-5.3", "opencode-go/gpt-6-luna"];

test("the model catalogue follows the provider selected in the page, not the saved one", async () => {
  const { studio } = await setup({ agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  const models = async (query) => JSON.parse((await http(`${studio.url}api/tutor/modelos${query}`)).body).modelos;
  assert.deepEqual(await models("?agente=pi"), PI_MODELS);
  assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
  assert.deepEqual(await models("?agente=pi"), PI_MODELS);
  assert.deepEqual(await models("?agente=agy"), ["gemini-3.8-flash-high", "claude-sonnet-4-6"]);
  assert.deepEqual(await models(""), ["gemini-3.8-flash-high", "claude-sonnet-4-6"]);
  assert.equal((await http(`${studio.url}api/tutor/modelos?agente=gemini`)).status, 400);
});

test("the selected Antigravity tutor answers a conversation", async () => {
  const { studio, root } = await setup({ agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  const argv = join(root, "agy-argv.log");
  process.env.FAKE_AGY_ARGV = argv;
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    const selected = await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" });
    assert.equal(selected.status, 200, selected.body);
    const response = await post(studio, "prompt", { text: "Hola" });
    assert.equal(response.status, 200, response.body);
    const answer = await stream.next("assistant_end", data => data.text === "Respuesta de Antigravity");
    assert.equal(answer.text, "Respuesta de Antigravity");
    await stream.next("state", data => data.busy === true);
    await stream.next("state", data => data.busy === false);
    const reopened = sse(`${studio.url}events`);
    try {
      const history = await reopened.next("history");
      assert.deepEqual(history.messages.map(message => message.text), ["Hola", "Respuesta de Antigravity"]);
    } finally { reopened.close(); }
    // Antigravity has no learning_view tool: the studio's own contract travels with the turn,
    // after the learner's text, so answers go through the page and the tutor speaks neutral Spanish.
    const sent = readFileSync(argv, "utf8");
    assert.match(sent, /^-p Hola\n/);
    assert.match(sent, /«Responder el diagnóstico»/);
    assert.match(sent, /«Ir a Parte N»/);
    assert.match(sent, /voseo/);
  } finally { stream.close(); }
});

test("an Antigravity write or edit reaches the chat as the note and topic it touched", async () => {
  const { studio } = await setup({ agyCommand: [process.execPath, join(HERE, "testdata", "writing-agy.mjs")] });
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1" })).status, 200);
    await stream.next("assistant_end");
    await stream.next("state", data => data.busy === false);
    const ends = stream.events.filter(event => event.name === "tool" && event.data.phase === "end").map(event => event.data);
    assert.deepEqual(ends.map(({ name, ok, note, topic }) => ({ name, ok, note, topic })), [
      { name: "write", ok: true, note: { topic: "redes", index: 1 }, topic: "redes" },
      { name: "edit", ok: true, note: { topic: "redes", diagnosis: true }, topic: "redes" },
    ]);
    assert.equal(stream.events.filter(event => event.name === "tool" && event.data.phase === "start").length, 2, "one start per step");
  } finally { stream.close(); }
});

test("an Antigravity diagnosis write reaches the chat as a note and topic", async () => {
  const { studio } = await setup({ agyCommand: [process.execPath, join(HERE, "testdata", "diagnosis-agy.mjs")] });
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Escribe el diagnóstico" })).status, 200);
    await stream.next("assistant_end");
    await stream.next("state", data => data.busy === false);
    const end = stream.events.find(event => event.name === "tool" && event.data.phase === "end").data;
    assert.deepEqual({ note: end.note, topic: end.topic }, { note: { topic: "redes", diagnosis: true }, topic: "redes" });
  } finally { stream.close(); }
});

test("a deep turn is refused for a topic the engine does not track, and reached for one it does", async () => {
  const { studio, root, received } = await setup();
  // A topic the learner can see but never enrolled: no .learning/state.json to track it.
  mkdirSync(join(root, "sin-inscribir"), { recursive: true });
  writeFileSync(join(root, "sin-inscribir", "plan.json"), JSON.stringify({ topic: "Sin inscribir", parts: [] }));
  const refused = await post(studio, "prompt", { text: "Hola", tema: "sin-inscribir" });
  assert.equal(refused.status, 400, refused.body);
  assert.match(JSON.parse(refused.body).error, /no está inscrito en el motor de aprendizaje/);
  assert.equal(received().length, 0, "a refused deep turn never reaches the tutor");
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const accepted = await post(studio, "prompt", { text: "Hola", tema: "redes" });
  assert.equal(accepted.status, 200, accepted.body);
  assert.equal(received().filter((command) => command.type === "prompt").length, 1);
});

test("Antigravity's deep turn goes through the engine gate and a failed gate blocks the next one", async () => {
  const { root, engine, log } = makeRoot({ status: { status: "failed", stage: "explanation", nextStage: "explanation", checks: [{ id: "p1", status: "FAIL" }] } });
  const calls = join(root, "engine-calls.log");
  const counting = join(root, "counting-engine.sh");
  writeFileSync(counting, `#!/bin/sh\necho "$@" >> ${JSON.stringify(calls)}\nexec ${JSON.stringify(engine)} "$@"\n`);
  chmodSync(counting, 0o755);
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: counting, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Hola", tema: "redes" })).status, 200);
    const gate = await stream.next("gate");
    assert.equal(gate.tema, "redes");
    assert.equal(gate.passing, false);
    assert.deepEqual(gate.fails, ["p1"]);
    // The turn, and the two corrections the studio owes the failing stage: one settle, one ask.
    const told = await stream.next("error");
    assert.match(told.message, /no pudo terminar/);
    assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 3, "the engine is asked once per settle, not once per provider");
    await until(() => settleIdle(stream));
    const blocked = await post(studio, "prompt", { text: "Otra vez", tema: "redes" });
    assert.equal(blocked.status, 409, blocked.body);
    // The engine is asked again before the refusal, so a topic that passes is released.
    writeFileSync(engine, `#!/bin/sh\necho '{"status":"waiting","stage":"diagnosis","nextStage":"diagnosis"}'\n`);
    const sigo = await post(studio, "prompt", { text: "Sigo", tema: "redes" });
    assert.equal(sigo.status, 200, sigo.body);
    // Two passing verdicts follow: the re-check before the turn, then its settle gate.
    await stream.next("gate", (data) => data.passing === true);
    await stream.next("gate", (data) => data.passing === true);
    // A general question is outside the gate: it is never refused for a failed deep turn.
    const general = await post(studio, "prompt", { text: "¿Y un hash?" });
    assert.equal(general.status, 200, general.body);
  } finally { stream.close(); }
});

// ---- the settle gate every runtime passes through (S3) ---------------------

/** The stage the fake engine reports while the tutor still owes the part. */
const FAILING_STAGE = {
  status: "blocked",
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

/** The commands the fake Pi received, as the studio sent them. */
const piLog = (log) =>
  existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];

/** The turns the fake Antigravity ran, one argv per turn (FAKE_AGY_TURNS). */
const agyTurns = (file) =>
  existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];

/** How many times the fake engine has been asked; counted before it answers (makeRoot delayMs). */
const engineCalls = (root) => (existsSync(join(root, ".engine-calls")) ? readFileSync(join(root, ".engine-calls"), "utf8").trim() : "0");

/** What the page last knew about the tutor: false once the turn really ended. */
const settleIdle = (stream) => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false;

/**
 * The Pi adapter's own settle decision, driven the way Pi drives it, for one gate mode:
 * whether it asks Pi to continue, and how many engine calls it spent to decide.
 */
async function piSettle(settleGate) {
  const base = mkdtempSync(join(tmpdir(), "pi-gate-"));
  const root = join(base, "Learnings");
  const topic = join(root, "redes");
  mkdirSync(topic, { recursive: true });
  const enginePath = join(base, "engine-stub");
  writeFileSync(enginePath, "");
  const engineCalls = [];
  const handlers = new Map();
  const api = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    registerTool() {},
    registerCommand() {},
    appendEntry() {},
  };
  const ctx = {
    cwd: topic,
    ui: { notify() {} },
    sessionManager: {
      getBranch: () => [{
        type: "custom",
        customType: "gentle-learning/enrollment",
        data: { version: 1, active: true, root, workspace: topic, enrolledAt: "2026-01-01T00:00:00.000Z" },
      }],
    },
  };
  extension(api, {
    root,
    enginePath,
    settleGate,
    execFile: async () => {
      engineCalls.push(enginePath);
      return { code: 1, stdout: JSON.stringify(FAILING_STAGE), stderr: "" };
    },
  });
  await handlers.get("session_start")[0]({ type: "session_start" }, ctx);
  const settle = await handlers.get("agent_before_settle")[0](
    {
      type: "agent_before_settle",
      entries: [],
      continue: false,
      outcome: "completed",
      context: { canContinue: false, entries: [], contextEntries: [], llmMessages: [], pendingMessages: [] },
    },
    ctx,
  );
  return { continue: settle?.continue === true, engineCalls: engineCalls.length };
}

// ---- T3: one conformance scenario, run unchanged against each tutor -----------------

/** The hosted view of a topic part: the page's origin and the base its submissions go to. */
async function bridgeFor(studio, topic = "redes") {
  const view = JSON.parse((await http(`${studio.url}api/view?topic=${topic}&part=p1`)).body);
  return { base: view.url.replace(new RegExp(`${topic}/p1$`), ""), origin: new URL(view.url).origin };
}

/** One tutor, one studio, and the two primitive steps the scenario needs from it. */
async function conformanceTutor(runtime, engineOptions) {
  const { root, engine, log } = makeRoot(engineOptions);
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  if (runtime === "agy") {
    process.env.FAKE_AGY_TURNS = turns;
    // A slow Antigravity turn keeps the window the scenario acts in (the Pi fake waits on its dialog).
    process.env.FAKE_AGY_DELAY_MS = "300";
  }
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  if (runtime === "agy") {
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    await stream.next("state");
  }
  // How many turns the tutor was asked to run, whatever the runtime.
  const turnsSoFar = () => (runtime === "agy" ? agyTurns(turns).length : piLog(log).filter((command) => command.type === "prompt").length);
  // What the tutor read in its last turn.
  const turnText = () => (runtime === "agy" ? agyTurns(turns).at(-1).join(" ") : piLog(log).filter((command) => command.type === "prompt").at(-1).message);
  // A Pi turn ends when its dialog is answered; an Antigravity turn ends by itself.
  const endTurn = async () => {
    if (runtime !== "pi") return;
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
  };
  const close = () => {
    stream.close();
    if (runtime === "agy") {
      delete process.env.FAKE_AGY_TURNS;
      delete process.env.FAKE_AGY_DELAY_MS;
    }
  };
  return { runtime, studio, root, stream, turnsSoFar, turnText, endTurn, close };
}

for (const runtime of ["pi", "agy"]) {
  test(`the studio gates the same way whoever tutors: ${runtime}`, async () => {
    // A stage that fails once and then clears: one correction, then the turn is released.
    const tutor = await conformanceTutor(runtime, { statuses: [FAILING_STAGE, CLEARED_STAGE] });
    try {
      assert.equal((await post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
      await tutor.stream.next("state", (data) => data.busy === true);
      assert.equal(tutor.stream.events.filter((event) => event.name === "state").at(-1)?.data.busy, true, "the turn is held while it runs");
      // A submission from the page while the turn is held is refused, in Spanish.
      const bridge = await bridgeFor(tutor.studio);
      const refused = await http(`${bridge.base}submit`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: bridge.origin },
        body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: "¿Qué es una capa?" }),
      });
      assert.equal(refused.status, 409, refused.body);
      assert.match(JSON.parse(refused.body).error, /El tutor está trabajando/);
      await until(() => tutor.turnsSoFar() === 1);
      await tutor.endTurn();
      // Exactly one correction, and it carries the engine's own reason.
      await until(() => tutor.turnsSoFar() === 2);
      assert.equal(tutor.turnsSoFar(), 2, "one correction for one failing settle");
      assert.match(tutor.turnText(), /FAIL p1-explained: la explicación de la parte p1 no existe todavía/);
      await tutor.endTurn();
      // The engine clears it: the turn is released and nothing else is asked.
      assert.equal((await tutor.stream.next("gate", (data) => data.passing === true)).tema, "redes");
      await until(() => tutor.stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
      assert.equal(tutor.turnsSoFar(), 2, "a cleared stage asks for nothing else");
      // The correction was never the learner's own message.
      const again = sse(`${tutor.studio.url}events`);
      try {
        const history = await again.next("history");
        assert.deepEqual(history.messages.filter((message) => message.role === "user" && /^Learning gate:/.test(message.text)), [], "the gate prompt is not served as the learner's");
      } finally { again.close(); }
    } finally { tutor.close(); }

    // A stage that never clears: the same budget, and the learner told in Spanish.
    const stuck = await conformanceTutor(runtime, { status: FAILING_STAGE });
    try {
      assert.equal((await post(stuck.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
      for (let round = 0; round < 1 + MAX_CORRECTIONS; round += 1) {
        await until(() => stuck.turnsSoFar() === round + 1);
        // Every turn ends its own way: the last one is the settle that spends the budget.
        await stuck.endTurn();
      }
      const told = await stuck.stream.next("error");
      assert.match(told.message, /no pudo terminar/);
      assert.match(told.message, /p1-explained: la explicación de la parte p1 no existe todavía/);
      assert.equal(stuck.turnsSoFar(), 1 + MAX_CORRECTIONS, "the turn and its corrections, and no more");
      await until(() => stuck.stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    } finally { stuck.close(); }
  });
}

// ---- #202: the studio measures the part a turn wrote, for both tutors -------------

/** A part whose arrow runs over its own words: `scene-lint` reports `trazo-sobre-texto`. */
const BROKEN_PART = `# Parte 1 — Capas

## Ruta

1. Qué es una capa.
2. Cómo esconde sus detalles.
3. Por qué importa.

## 1. La capa

Imagina un robot que aspira la sala.

**Capa**: es un grupo de funciones que hace una cosa y la esconde del resto.

Antes, el robot tenía que saber cada detalle. Ahora solo usa la capa.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 210","title":"La flecha sobre el texto","scene":{"boxes":[
{"x":20,"y":20,"w":196,"h":170,"label":"A","tone":"blue"},
{"x":556,"y":20,"w":184,"h":170,"label":"B","tone":"green"}],
"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"tone":"blue","width":3}],
"labels":[{"x":380,"y":128,"text":"encima","size":26}],
"icons":[{"kind":"gear","x":380,"y":40,"size":48,"tone":"slate"}]}}
</script>
</lk-scene>

<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>
Cómo leerlo: avanza y mira la casilla que cambia.

## Mini-quiz

1. ¿Qué hace una capa?
`;
/** The same part with its words beside the arrow: the studio's three tools pass it. */
const CLEAN_PART = BROKEN_PART.replace(
  '"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"tone":"blue","width":3}],\n"labels":[{"x":380,"y":128,"text":"encima","size":26}]',
  '"arrows":[{"x1":208,"y1":119,"x2":552,"y2":119,"label":"acción","tone":"blue","width":3,"labelAt":0.5}]',
);

/**
 * One tutor whose turns write the parts a test scripts, so the studio's own checks have something
 * to measure. `parts` is one script per turn: a correction writes what the previous turn was told
 * to fix. `partChecks` replaces the studio's measurement when a test needs the verdict, not the tools.
 */
async function checkingTutor(runtime, { parts, engine = { status: CLEARED_STAGE }, partChecks } = {}) {
  const { root, engine: enginePath, log } = makeRoot(engine);
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  const script = parts.map((files) => files.map(({ name, content }) => ({ path: join(root, "redes", "explicaciones", name), content })));
  if (runtime === "pi") process.env.FAKE_PI_WRITES = JSON.stringify(script);
  else {
    process.env.FAKE_AGY_TURNS = turns;
    process.env.FAKE_AGY_WRITES = JSON.stringify(script);
  }
  const studio = await startStudio({
    root,
    piCommand: [process.execPath, FAKE_PI],
    enginePath,
    agyCommand: [process.execPath, join(HERE, "testdata", "checking-agy.mjs")],
    ...(partChecks ? { partChecks } : {}),
  });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  if (runtime === "agy") {
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    await stream.next("state");
  }
  const turnsSoFar = () => (runtime === "agy" ? agyTurns(turns).length : piLog(log).filter((command) => command.type === "prompt").length);
  const turnText = () => (runtime === "agy" ? agyTurns(turns).at(-1).join(" ") : piLog(log).filter((command) => command.type === "prompt").at(-1).message);
  const endTurn = async () => {
    if (runtime !== "pi") return;
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
  };
  const close = () => {
    stream.close();
    delete process.env.FAKE_PI_WRITES;
    delete process.env.FAKE_AGY_TURNS;
    delete process.env.FAKE_AGY_WRITES;
  };
  return { runtime, studio, root, stream, turnsSoFar, turnText, endTurn, close };
}

/** The studio's own measurement, with a note of what it was asked to measure. */
const measuring = (measured) => async (files) => {
  measured.push(...files);
  return runPartChecks(files);
};

for (const runtime of ["pi", "agy"]) {
  test(`a part with a scene-lint finding asks for exactly one correction: ${runtime}`, { skip: browser ? false : "playwright not installed" }, async () => {
    // The first turn writes the broken part; the correction writes the fixed one, so the second
    // settle is clean and the budget is never reached.
    const measured = [];
    const tutor = await checkingTutor(runtime, {
      parts: [[{ name: "Parte 1 - Capas.md", content: BROKEN_PART }], [{ name: "Parte 1 - Capas.md", content: CLEAN_PART }]],
      partChecks: measuring(measured),
    });
    try {
      assert.equal((await post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
      await until(() => tutor.turnsSoFar() === 1);
      await tutor.endTurn();
      await until(() => tutor.turnsSoFar() === 2, 30000);
      // The correction's own settle measures the part again: what matters is which note was measured.
      assert.deepEqual(
        [...new Set(measured)],
        [join(tutor.root, "redes", "explicaciones", "Parte 1 - Capas.md")],
        "the studio measured the part the turn wrote",
      );
      assert.equal(tutor.turnsSoFar(), 2, "one correction for one measured part");
      assert.match(tutor.turnText(), /trazo-sobre-texto: encima/, "the tutor reads the finding in the tool's own words");
      assert.match(tutor.turnText(), /tools\/scene-lint\.mjs/, "and which tool said it");
      await tutor.endTurn();
      await until(() => settleIdle(tutor.stream), 30000);
      assert.equal(tutor.turnsSoFar(), 2, "a part the tools pass asks for nothing else");
      assert.equal(tutor.stream.events.filter((event) => event.name === "error").length, 0, "a part that passes says nothing to the learner");
    } finally { tutor.close(); }
  });

  test(`a part that passes the checks asks for no correction: ${runtime}`, { skip: browser ? false : "playwright not installed" }, async () => {
    const measured = [];
    const tutor = await checkingTutor(runtime, {
      parts: [[{ name: "Parte 1 - Capas.md", content: CLEAN_PART }]],
      partChecks: measuring(measured),
    });
    try {
      assert.equal((await post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
      await until(() => tutor.turnsSoFar() === 1);
      await tutor.endTurn();
      await until(() => settleIdle(tutor.stream), 30000);
      assert.equal(measured.length, 1, "the part was measured, not skipped");
      assert.equal(tutor.turnsSoFar(), 1, "nothing to correct");
      assert.equal(tutor.stream.events.filter((event) => event.name === "error").length, 0);
    } finally { tutor.close(); }
  });

  test(`a spent budget tells the learner the part still has visual problems: ${runtime}`, async () => {
    // The tools keep finding the same thing: the tutor gets the whole budget and then the learner
    // is told, in Spanish, instead of the part passing silently.
    const finding = {
      kind: "findings",
      tools: [{ file: join("redes", "explicaciones", "Parte 1 - Capas.md"), tool: "scene-lint.mjs", output: "Parte 1 - Capas.md: bloque 1 — La flecha sobre el texto\n  trazo-sobre-texto: encima", findings: ["trazo-sobre-texto: encima"] }],
      count: 1,
      first: "trazo-sobre-texto: encima",
    };
    const tutor = await checkingTutor(runtime, {
      parts: [[{ name: "Parte 1 - Capas.md", content: BROKEN_PART }]],
      partChecks: async () => finding,
    });
    try {
      assert.equal((await post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
      for (let round = 0; round < 1 + MAX_CORRECTIONS; round += 1) {
        await until(() => tutor.turnsSoFar() === round + 1);
        await tutor.endTurn();
      }
      const told = await tutor.stream.next("error", () => true, 10000);
      assert.equal(
        told.message,
        "La parte todavía tiene problemas visuales: 1 hallazgo. El primero: trazo-sobre-texto: encima. Se agotaron las 2 correcciones.",
      );
      assert.equal(tutor.turnsSoFar(), 1 + MAX_CORRECTIONS, "the turn and its corrections, and no more");
      await until(() => settleIdle(tutor.stream));
    } finally { tutor.close(); }
  });

  test(`a check that cannot run is logged, never sent to the tutor: ${runtime}`, async () => {
    const tutor = await checkingTutor(runtime, {
      parts: [[{ name: "Parte 1 - Capas.md", content: BROKEN_PART }]],
      partChecks: async () => ({ kind: "crashed", failures: ["scene-lint.mjs no pudo medir Parte 1 - Capas.md (salida 2)"] }),
    });
    const logged = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      logged.push(String(chunk));
      return write(chunk, ...rest);
    };
    try {
      assert.equal((await post(tutor.studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
      await until(() => tutor.turnsSoFar() === 1);
      await tutor.endTurn();
      await until(() => settleIdle(tutor.stream), 30000);
      assert.equal(tutor.turnsSoFar(), 1, "a tool that could not measure asks the tutor for nothing");
      assert.equal(tutor.stream.events.filter((event) => event.name === "error").length, 0, "and tells the learner nothing");
      assert.ok(
        logged.some((line) => line.includes("estudio: comprobación fallida · scene-lint.mjs no pudo medir")),
        `the studio's log keeps the failure: ${logged.join("")}`,
      );
    } finally {
      process.stderr.write = write;
      tutor.close();
    }
  });

  test(`a turn that wrote no part runs no checks: ${runtime}`, async () => {
    let calls = 0;
    const tutor = await checkingTutor(runtime, {
      parts: [[{ name: "quiz.md", content: "# Diagnóstico\n" }]],
      partChecks: async () => {
        calls += 1;
        return { kind: "clean" };
      },
    });
    try {
      assert.equal((await post(tutor.studio, "prompt", { text: "Escribe el diagnóstico", tema: "redes" })).status, 200);
      await until(() => tutor.turnsSoFar() === 1);
      await tutor.endTurn();
      await until(() => settleIdle(tutor.stream));
      assert.equal(calls, 0, "a diagnosis is not a part: nothing to measure");
      assert.equal(tutor.turnsSoFar(), 1);
    } finally { tutor.close(); }
  });
}

test("an Antigravity turn is asked again until the engine clears the failing stage", async () => {
  const { root, engine, log } = makeRoot({ statuses: [FAILING_STAGE, CLEARED_STAGE] });
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  process.env.FAKE_AGY_TURNS = turns;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    await until(() => agyTurns(turns).length === 2);
    const [first, followUp] = agyTurns(turns);
    assert.doesNotMatch(first.join(" "), /--conversation/, "the first turn opens the conversation");
    assert.match(followUp.join(" "), /--conversation test-conversation/, "the correction continues the same conversation, not a fresh one");
    assert.match(followUp.join(" "), /FAIL p1-explained: la explicación de la parte p1 no existe todavía/, "the tutor is told the engine's own reason");
    const gate = await stream.next("gate", (data) => data.passing === true);
    assert.equal(gate.tema, "redes");
    await until(() => settleIdle(stream));
    assert.equal(agyTurns(turns).length, 2, "a stage the engine cleared asks for nothing else");
    assert.equal(stream.events.filter((event) => event.name === "error").length, 0, "a cleared turn says nothing about a failure");
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("a Pi turn is asked again until the engine clears the failing stage", async () => {
  const { root, engine, log } = makeRoot({ statuses: [FAILING_STAGE, CLEARED_STAGE] });
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const prompts = () => piLog(log).filter((command) => command.type === "prompt");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    // A fake turn ends when its dialog is answered, and the end of the turn is what the gate reads.
    const first = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: first.id, value: "Universitario" })).status, 200);
    await until(() => prompts().length === 2);
    const [learner, followUp] = prompts();
    assert.equal(said(learner.message), "Escribe la Parte 1");
    assert.match(followUp.message, /FAIL p1-explained: la explicación de la parte p1 no existe todavía/, "the tutor is told the engine's own reason");
    assert.equal(followUp.streamingBehavior, undefined, "the correction is its own turn, not a message queued behind the one that ended");
    const second = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: second.id, value: "Universitario" })).status, 200);
    assert.equal((await stream.next("gate", (data) => data.passing === true)).tema, "redes");
    await until(() => settleIdle(stream));
    assert.equal(prompts().length, 2, "a stage the engine cleared asks for nothing else");
  } finally { stream.close(); }
});

test("a tutor that never satisfies the engine stops after the corrections Pi allows, and the learner is told", async () => {
  const { root, engine, log } = makeRoot({ status: FAILING_STAGE });
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  process.env.FAKE_AGY_TURNS = turns;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const told = await stream.next("error");
    assert.match(told.message, /no pudo terminar/, "the learner is told the tutor could not finish");
    assert.match(told.message, /p1-explained: la explicación de la parte p1 no existe todavía/, "and what the engine still wants");
    assert.equal(agyTurns(turns).length, 1 + MAX_CORRECTIONS, "one turn plus the corrections Pi allows, and no more");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(agyTurns(turns).length, 3, "a spent budget is not a new turn");
    await until(() => settleIdle(stream));
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("a turn the engine leaves waiting for the learner is not gated", async () => {
  // The default report waits for the learner's diagnosis: nobody owes the chat a correction.
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  process.env.FAKE_AGY_TURNS = turns;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Prepara el diagnóstico", tema: "redes" })).status, 200);
    assert.equal((await stream.next("gate")).passing, true, "waiting on the learner is not a failure");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(agyTurns(turns).length, 1, "the tutor is not asked again while the learner owes the answers");
    assert.equal(stream.events.filter((event) => event.name === "error").length, 0);
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("inside the studio the Pi extension leaves the failing stage to the studio gate", async () => {
  const { root, engine, log } = makeRoot({ status: FAILING_STAGE });
  process.env.FAKE_PI_LOG = log;
  const mode = join(root, "pi-gate.log");
  process.env.FAKE_PI_GATE = mode;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const prompts = () => piLog(log).filter((command) => command.type === "prompt");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    assert.equal(readFileSync(mode, "utf8").trim(), "studio", "the studio's Pi child is told the studio owns the gate");
    for (const _ of [0, 1, 2]) {
      const dialog = await stream.next("dialog");
      assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    }
    await stream.next("error");
    // One correction per settle: the studio's, never one more from the adapter.
    assert.equal(prompts().length, 1 + MAX_CORRECTIONS, "one follow-up per settle, so the same stage is never asked twice");
  } finally {
    stream.close();
    delete process.env.FAKE_PI_GATE;
  }
  // And with that flag the adapter surrenders only a failing stage: the studio owns corrections,
  // while the stage pushes stay the tutor's until the page owns them.
  const standalone = await piSettle("extension");
  assert.equal(standalone.continue, true, "a standalone Pi session still gates its own settle");
  assert.equal(standalone.engineCalls, 1, "it asks the engine once to decide");
  const studioDriven = await piSettle("studio");
  assert.equal(studioDriven.continue, false, "inside the studio the adapter does not re-prompt the failing stage the studio gates");
  assert.equal(studioDriven.engineCalls, 1, "it still asks once: that report is what drives the stage pushes");
});

/** A studio with Pi as the tutor and a root whose fake engine answers what the test needs. */
async function piStudio(options = {}) {
  const { root, engine, log } = makeRoot(options.root ?? {});
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, ...options.studio });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const prompts = () => piLog(log).filter((command) => command.type === "prompt");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  return { studio, root, engine, log, prompts, stream };
}

/** A studio with Antigravity as the tutor; every turn it runs is one line of the turn log. */
async function agyStudio(options = {}) {
  const { root, engine, log } = makeRoot(options.root ?? {});
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  process.env.FAKE_AGY_TURNS = turns;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
  // The tutor switch emits its own state: a test waiting for the next idle must not read that one.
  await stream.next("state");
  return { studio, root, engine, log, turns, stream };
}

test("a submission from the hosted view is gated like any other deep turn", async () => {
  const { studio, prompts, stream } = await piStudio({ root: { statuses: [FAILING_STAGE, CLEARED_STAGE] } });
  try {
    // The learner answers from the topic page: the bridge delivers the prompt, not the composer.
    const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
    const bridgeBase = view.url.replace(/redes\/p1$/, "");
    const res = await http(`${bridgeBase}submit`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(view.url).origin },
      body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: "¿Qué es una capa?" }),
    });
    assert.equal(res.status, 200, res.body);
    await until(() => prompts().length === 1);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => prompts().length === 2);
    assert.match(prompts()[1].message, /FAIL p1-explained: la explicación de la parte p1 no existe todavía/, "the turn the page started is gated too");
  } finally { stream.close(); }
});

test("a regeneration is gated like any other deep turn", async () => {
  const { studio, prompts, stream } = await piStudio({ root: { statuses: [FAILING_STAGE, CLEARED_STAGE] } });
  try {
    const answer = await post(studio, "api/regenerar", { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "más corto, por favor" });
    assert.equal(answer.status, 200, answer.body);
    await until(() => prompts().length === 1);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => prompts().length === 2);
    assert.match(prompts()[1].message, /FAIL p1-explained: la explicación de la parte p1 no existe todavía/, "a failed regeneration is not a silent end");
  } finally { stream.close(); }
});

test("a refused prompt does not restore the correction budget", async () => {
  process.env.FAKE_AGY_DELAY_MS = "400";
  const { studio, turns, stream } = await agyStudio({ root: { status: FAILING_STAGE } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    // The first correction is running: a prompt the runtime refuses must not refill the budget.
    await until(() => agyTurns(turns).length === 2);
    const refused = await post(studio, "prompt", { text: "otra cosa" });
    assert.equal(refused.status, 409, refused.body);
    const told = await stream.next("error");
    assert.match(told.message, /no pudo terminar/);
    assert.equal(agyTurns(turns).length, 1 + MAX_CORRECTIONS, "the budget the engine allows, not one more");
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
    delete process.env.FAKE_AGY_DELAY_MS;
  }
});

test("a message during a correction is refused and the correction keeps its own gate", async () => {
  const { studio, prompts, stream } = await piStudio({ root: { status: FAILING_STAGE } });
  const decided = () => stream.events.filter((event) => event.name === "gate" && event.data.tema === "redes" && event.data.passing === false);
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const first = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: first.id, value: "Universitario" })).status, 200);
    await until(() => prompts().length === 2);
    // The learner changes the subject while the correction runs: refused, never queued behind it.
    const refused = await post(studio, "prompt", { text: "¿Y un hash?" });
    assert.equal(refused.status, 409, refused.body);
    assert.match(JSON.parse(refused.body).error, /El tutor está trabajando/);
    assert.equal(prompts().length, 2, "the message never became a turn of its own");
    // The correction's own settle is still decided against the engine.
    const second = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: second.id, value: "Universitario" })).status, 200);
    await until(() => decided().length === 2);
    assert.equal(decided().length, 2, "the correction's own stage is decided, not the message that came after it");
  } finally { stream.close(); }
});

test("a chat switch is refused while the turn is active and works once it is released", async () => {
  const { studio, root, turns, stream } = await agyStudio({ root: { statuses: [FAILING_STAGE, CLEARED_STAGE], delayMs: 400 } });
  try {
    const general = JSON.parse((await http(`${studio.url}api/chats`)).body).activo;
    const created = JSON.parse((await post(studio, "api/chats", { nombre: "otra" })).body).activo;
    assert.equal((await post(studio, "api/chats/abrir", { id: general })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    // The gate is deciding: the studio is still inside its turn, so the switch is refused.
    await until(() => engineCalls(root) === "1");
    const refused = await post(studio, "api/chats/abrir", { id: created });
    assert.equal(refused.status, 409, refused.body);
    assert.match(JSON.parse(refused.body).error, /El tutor está trabajando/);
    await until(() => agyTurns(turns).length === 2);
    assert.match(agyTurns(turns)[1].join(" "), /--conversation test-conversation/, "the correction stays in the chat that was talking");
    // The engine cleared it and the turn is released: the switch is accepted now.
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    assert.equal((await post(studio, "api/chats/abrir", { id: created })).status, 200);
  } finally { stream.close(); }
});

test("an aborted Antigravity turn is not gated", async () => {
  process.env.FAKE_AGY_DELAY_MS = "400";
  const { studio, turns, stream } = await agyStudio({ root: { status: FAILING_STAGE } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    await until(() => agyTurns(turns).length === 1);
    assert.equal((await post(studio, "abort")).status, 200);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(agyTurns(turns).length, 1, "an aborted turn is not asked again");
    assert.equal(stream.events.filter((event) => event.name === "error").length, 0, "and stopping the tutor is not a failure");
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
    delete process.env.FAKE_AGY_DELAY_MS;
  }
});

test("an aborted Pi turn is not gated", async () => {
  const { studio, prompts, stream } = await piStudio({ root: { status: FAILING_STAGE } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    assert.equal((await post(studio, "abort")).status, 200);
    await stream.next("state", (data) => data.busy === false);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(prompts().length, 1, "the turn the learner stopped is not asked again");
  } finally { stream.close(); }
});

test("the tutor's correction is neither echoed nor served as the learner's own message", async () => {
  process.env.FAKE_PI_HISTORY = "1";
  const { studio, prompts, stream } = await piStudio({ root: { statuses: [FAILING_STAGE, CLEARED_STAGE] } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => prompts().length === 2);
    const correction = prompts()[1].message;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(stream.events.some((event) => event.name === "user" && event.data.text === correction), false, "the instruction is not echoed as the learner's words");
    const again = sse(`${studio.url}events`);
    try {
      const history = await again.next("history");
      assert.deepEqual(history.messages.filter((m) => m.role === "user").map((m) => m.text), ["Escribe la Parte 1"], "nor kept as something the learner typed");
    } finally { again.close(); }
  } finally {
    stream.close();
    delete process.env.FAKE_PI_HISTORY;
  }
});

test("the correction is not part of the Antigravity transcript", async () => {
  const { studio, turns, stream } = await agyStudio({ root: { statuses: [FAILING_STAGE, CLEARED_STAGE] } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    await until(() => agyTurns(turns).length === 2);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const again = sse(`${studio.url}events`);
    try {
      const history = await again.next("history");
      assert.deepEqual(history.messages.filter((m) => m.role === "user").map((m) => m.text), ["Escribe la Parte 1"], "the transcript holds the learner's words, not the gate's");
    } finally { again.close(); }
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("a correction the runtime refuses is told in Spanish, not in the runtime's words", async () => {
  process.env.FAKE_PI_REJECT = "Learning gate:";
  const { studio, stream } = await piStudio({ root: { status: FAILING_STAGE } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    const told = await stream.next("error");
    assert.match(told.message, /no pudo/, "the learner is told what happened");
    assert.doesNotMatch(told.message, /Red interna|Pi rejected/, "never in the runtime's own words");
    // A correction the runtime refused ends the turn instead of leaving it held.
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    assert.equal((await post(studio, "prompt", { text: "Otra vez" })).status, 200, "the studio is free again");
  } finally {
    stream.close();
    delete process.env.FAKE_PI_REJECT;
  }
});

// ---- T2: the learner's questions are asked by the page, never by the tutor -------

/** The mode line the studio writes into an «Aprender algo nuevo» prompt. */
const MODE_LINE = {
  rapido: "[Modo de estudio: rápido — ya decidido en el estudio. No preguntes si prefiere rápido o universitario y no abras un diálogo para elegirlo.]",
  universitario: "[Modo de estudio: universitario — ya decidido en el estudio. No preguntes si prefiere rápido o universitario y no abras un diálogo para elegirlo.]",
};
const EXAM_MODE_LINE = {
  oral: '[Modo de estudio: examen — ya decidido en el estudio, con formato oral (exam: "oral"). No preguntes el modo ni el formato: pásalos a learning_stage init como exam.]',
  written: '[Modo de estudio: examen — ya decidido en el estudio, con formato escrito (exam: "written"). No preguntes el modo ni el formato: pásalos a learning_stage init como exam.]',
  practical: (practice) => `[Modo de estudio: examen — ya decidido en el estudio, con formato práctico (exam: "practical"), con tipo de práctica ${JSON.stringify(practice)} (practice: ${JSON.stringify(practice)}). No preguntes el modo ni el formato: pásalos a learning_stage init como exam y practice.]`,
};
/** What the engine reports when the method is recorded and planning is next. */
const METHOD_RECORDED = { status: "accepted", stage: "method", nextStage: "planning", method: "pareto", checks: [{ id: "method-chosen", status: "PASS", reason: "the learner chose pareto" }] };

/** The arguments the engine was called with, one line per call. */
const engineArgs = (log) => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : []);

for (const { formato, practica, expected } of [
  { formato: "oral", expected: EXAM_MODE_LINE.oral },
  { formato: "written", expected: EXAM_MODE_LINE.written },
  { formato: "practical", practica: "Laboratorios", expected: EXAM_MODE_LINE.practical("Laboratorios") },
]) {
  test(`exam mode carries the chosen ${formato} format to the tutor`, async () => {
    const { studio, prompts, stream } = await piStudio();
    try {
      const response = await post(studio, "api/aprender", {
        text: "redes neuronales",
        modo: "examen",
        examen: { formato, ...(practica ? { practica } : {}) },
      });
      assert.equal(response.status, 200, response.body);
      await until(() => prompts().length === 1);
      const message = prompts()[0].message;
      assert.ok(message.includes(expected), `the selected format reaches learning_stage init: ${message}`);
      assert.match(message, /No preguntes el modo ni el formato/);
    } finally { stream.close(); }
  });
}

async function assertExamRefusal(body, expectedMessage) {
  const { studio, prompts, stream } = await piStudio();
  try {
    const response = await post(studio, "api/aprender", body);
    assert.equal(response.status, 400, response.body);
    assert.match(JSON.parse(response.body).error, expectedMessage);
    assert.equal(prompts().length, 0, "a refused request starts no tutor turn");
    assert.equal(stream.events.some((event) => event.name === "state" && event.data.busy), false, "the refusal never marks a turn busy");
  } finally { stream.close(); }
}

test("exam mode refuses a missing format before starting a turn", async () => {
  await assertExamRefusal({ text: "redes neuronales", modo: "examen" }, /formato.*examen/i);
});

test("exam mode refuses an invalid format before starting a turn", async () => {
  await assertExamRefusal({ text: "redes neuronales", modo: "examen", examen: { formato: "screen" } }, /formato.*examen/i);
});

test("practical exam mode refuses a blank practice kind before starting a turn", async () => {
  await assertExamRefusal({ text: "redes neuronales", modo: "examen", examen: { formato: "practical", practica: "  " } }, /tipo de práctica/i);
});

test("oral exam mode refuses a practice kind before starting a turn", async () => {
  await assertExamRefusal({ text: "redes neuronales", modo: "examen", examen: { formato: "oral", practica: "Laboratorios" } }, /solo.*práctica.*práctico/i);
});

test("quick mode refuses exam fields before starting a turn", async () => {
  await assertExamRefusal({ text: "redes neuronales", modo: "rapido", examen: { formato: "written" } }, /solo.*modo examen/i);
});

test("a request from «Aprender algo nuevo» carries the mode to each tutor", async () => {
  const pi = await piStudio();
  try {
    const asked = await post(pi.studio, "api/aprender", { text: "redes neuronales", modo: "universitario" });
    assert.equal(asked.status, 200, asked.body);
    await until(() => pi.prompts().length === 1);
    const message = pi.prompts()[0].message;
    assert.match(message, /^Quiero aprender redes neuronales\./, "the request is the learner's own words");
    assert.ok(message.includes(MODE_LINE.universitario), `the mode travels in the prompt: ${message}`);
  } finally { pi.stream.close(); }

  const agy = await agyStudio();
  try {
    const asked = await post(agy.studio, "api/aprender", { text: "qué es un hash", modo: "rapido" });
    assert.equal(asked.status, 200, asked.body);
    await until(() => agyTurns(agy.turns).length === 1);
    const sent = agyTurns(agy.turns)[0].join(" ");
    assert.ok(sent.includes(MODE_LINE.rapido), `the mode travels in the Antigravity prompt: ${sent}`);
  } finally {
    agy.stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("«Aprender algo nuevo» refuses a request with no mode and sends nothing", async () => {
  const { studio, prompts, stream } = await piStudio();
  try {
    for (const body of [{ text: "algo" }, { text: "algo", modo: "" }, { text: "algo", modo: "medio" }, { text: "algo", modo: "Universitario" }, { text: "  ", modo: "rapido" }]) {
      const res = await post(studio, "api/aprender", body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.body}`);
      assert.equal(JSON.parse(res.body).error, body.text.trim() ? "elige rápido, universitario o examen antes de enviar" : "escribe qué quieres aprender");
    }
    assert.equal(prompts().length, 0, "nothing reached the tutor");
  } finally { stream.close(); }
});

test("a 150000-character multi-line learning source reaches Pi intact", async () => {
  const { studio, prompts, stream } = await piStudio();
  const source = `${"x".repeat(999)}\n`.repeat(149) + "x".repeat(1000);
  try {
    assert.equal(source.length, 150000);
    const response = await post(studio, "api/aprender", { text: source, modo: "examen", examen: { formato: "written" } });
    assert.equal(response.status, 200, response.body);
    await until(() => prompts().length === 1);
    assert.ok(prompts()[0].message.startsWith(`Quiero aprender ${source}.\n\n${EXAM_MODE_LINE.written}`), "all source characters and line breaks reach the tutor prompt");
  } finally { stream.close(); }
});

test("an over-limit learning source gets its own refusal before starting a turn", async () => {
  const { studio, prompts, stream } = await piStudio();
  try {
    const response = await post(studio, "api/aprender", { text: "x".repeat(200001), modo: "examen", examen: { formato: "written" } });
    assert.equal(response.status, 400, response.body);
    assert.equal(JSON.parse(response.body).error, "El texto es demasiado largo: como mucho 200000 caracteres.");
    assert.equal(prompts().length, 0, "the refusal starts no tutor turn");
  } finally { stream.close(); }
});

test("the learning source body limit does not change the other routes' 64 KiB cap", async () => {
  const { studio, prompts, stream } = await piStudio();
  try {
    const body = JSON.stringify({ version: 1, aspectos: [], padding: "x".repeat(64 * 1024) });
    assert.ok(Buffer.byteLength(body) > 64 * 1024);
    const response = await post(studio, "api/preferences", body);
    assert.equal(response.status, 413, response.body);
    assert.equal(prompts().length, 0, "the preference request starts no tutor turn");
  } finally { stream.close(); }
});

test("the studio tells every tutor never to choose the mode by itself", async () => {
  const agy = await agyStudio();
  try {
    assert.equal((await post(agy.studio, "prompt", { text: "Quiero aprender algo" })).status, 200);
    await until(() => agyTurns(agy.turns).length === 1);
    const sent = agyTurns(agy.turns)[0].join(" ");
    assert.ok(sent.includes("No elijas por ella el modo"), `Antigravity reads the rule: ${sent}`);
    assert.ok(sent.includes("«Aprender algo nuevo»"), "and where to send the learner");
  } finally {
    agy.stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

// #199: a concept question is answered in the chat; only a whole new topic points at the entry.
test("Antigravity's contract answers a concept question and redirects only a new topic", async () => {
  const agy = await agyStudio();
  try {
    assert.equal((await post(agy.studio, "prompt", { text: "¿qué es la varianza?" })).status, 200);
    await until(() => agyTurns(agy.turns).length === 1);
    const sent = agyTurns(agy.turns)[0].join(" ");
    assert.ok(sent.includes("Una pregunta de concepto en el chat"), `the case is named: ${sent}`);
    assert.ok(sent.includes("«¿qué es la varianza?»"), "with the learner's own words");
    assert.ok(sent.includes("una línea de definición"), "the answer is a definition");
    assert.ok(sent.includes("sin crear archivos y sin correr comandos"), "answering creates nothing");
    assert.ok(sent.includes("solo cuando la persona pide estudiar un tema nuevo entero"), "the entry has one case");
    assert.ok(sent.includes("«quiero aprender X»"));
    // The rule #199 removed: a concept question was answered with a pointer to the entry.
    assert.ok(!sent.includes("Si la persona pide aprender algo sin decir el modo"), "a concept question is not a new topic");
  } finally {
    agy.stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

// #199: the answer uses the part's own example, so a part chat names its part.
test("a part chat's prompt names its part", async () => {
  const { studio, received } = await setup();
  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  const bridgeBase = view.url.replace(/redes\/p1$/, "");
  const res = await http(`${bridgeBase}submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(view.url).origin },
    body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: "¿qué es una capa?" }),
  });
  assert.equal(res.status, 200, res.body);
  await until(() => received().some((command) => command.type === "prompt"));
  const message = received().find((command) => command.type === "prompt").message;
  assert.match(message, /^\[Vista HTML · redes · p1 · pregunta\]/, "the learner's submission is unchanged at its head");
  assert.match(message, /\[Parte en curso: Parte 1 «Capas» de Redes\./, `the part is named: ${message}`);
  assert.match(message, /el ejemplo que esta parte ya viene usando/);
});

/** What the real engine answers for a topic folder with no run (verified with `go run ./cmd/learning status`). */
const UNINITIALIZED = {
  status: "blocked",
  stage: "preparation",
  nextStage: "preparation",
  checks: [{ id: "state-initialized", status: "FAIL", reason: "run not initialized: execute init before validate, advance or status" }],
};

/** A studio with Pi as the tutor that reports the writes the fake turn makes. */
async function creatingStudio(writes, options = {}) {
  const { root, engine, log } = makeRoot({ status: UNINITIALIZED, ...(options.root ?? {}) });
  const calls = join(root, "engine-args.log");
  const counting = join(root, "counting-engine.sh");
  writeFileSync(counting, `#!/bin/sh\necho "$@" >> ${JSON.stringify(calls)}\nexec ${JSON.stringify(engine)} "$@"\n`);
  chmodSync(counting, 0o755);
  process.env.FAKE_PI_LOG = log;
  process.env.FAKE_PI_WRITES = JSON.stringify(writes(root));
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: counting });
  open.push(studio);
  const prompts = () => piLog(log).filter((command) => command.type === "prompt");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  return { studio, root, log, prompts, stream, asked: () => engineArgs(calls) };
}

test("a Universitario turn binds the topic its own writes create, and the engine gates it", async () => {
  const created = await creatingStudio((root) => [{ path: join(root, "nuevo", "plan.json") }]);
  const { studio, root, prompts, stream, asked } = created;
  try {
    assert.equal((await post(studio, "api/aprender", { text: "aprendizaje por refuerzo", modo: "universitario" })).status, 200);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    // The turn settles: the studio asks the engine about the folder the tutor just wrote into.
    await until(() => asked().some((line) => line.startsWith("status ") && line.includes(`--workspace ${join(root, "nuevo")}`)));
    await until(() => prompts().length === 2);
    const correction = prompts()[1].message;
    assert.match(correction, /FAIL state-initialized: run not initialized: execute init before validate, advance or status/, "the correction carries the engine's own words");
    // The same bounded budget as any other failing stage, then the learner is told.
    for (const _ of [0, 1, 2]) {
      const next = await stream.next("dialog").catch(() => null);
      if (next) await post(studio, "dialog", { id: next.id, value: "Universitario" });
    }
    const told = await stream.next("error");
    assert.match(told.message, /no pudo terminar/);
    assert.equal(prompts().length, 1 + MAX_CORRECTIONS, "the turn and its corrections, and no more");
  } finally {
    stream.close();
    delete process.env.FAKE_PI_WRITES;
  }
});

test("an Examen turn binds and gates the new topic it creates", async () => {
  const created = await creatingStudio((root) => [{ path: join(root, "nuevo", "plan.json") }]);
  const { studio, root, prompts, stream, asked } = created;
  try {
    const response = await post(studio, "api/aprender", { text: "aprendizaje por refuerzo", modo: "examen", examen: { formato: "written" } });
    assert.equal(response.status, 200, response.body);
    await until(() => prompts().length === 1);
    assert.ok(prompts()[0].message.includes(EXAM_MODE_LINE.written), `the tutor receives exam mode guidance: ${prompts()[0].message}`);

    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => asked().some((line) => line.startsWith("status ") && line.includes(`--workspace ${join(root, "nuevo")}`)));
    await until(() => prompts().length === 2);
    assert.match(prompts()[1].message, /FAIL state-initialized: run not initialized/, "the exam topic is gated by the engine after its first write");
    assert.equal((await post(studio, "abort", {})).status, 200, "the test releases its held correction");
  } finally {
    stream.close();
    delete process.env.FAKE_PI_WRITES;
  }
});

test("a Universitario turn that creates no topic says so and ends", async () => {
  const { studio, prompts, stream } = await creatingStudio(() => []);
  try {
    assert.equal((await post(studio, "api/aprender", { text: "algo nuevo", modo: "universitario" })).status, 200);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    const notice = await stream.next("notice", (data) => /no creó ningún tema/.test(data.message));
    assert.equal(notice.message, "El tutor no creó ningún tema todavía.");
    assert.equal(prompts().length, 1, "nothing to correct: no follow-up turn");
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    assert.equal((await post(studio, "prompt", { text: "hola" })).status, 200, "the turn is released");
  } finally {
    stream.close();
    delete process.env.FAKE_PI_WRITES;
  }
});

test("a Rápido turn stays a quick note: no topic, no gate", async () => {
  const { studio, prompts, stream, asked } = await creatingStudio((folder) => [{ path: join(folder, "rapidos", "refuerzo.md") }]);
  try {
    assert.equal((await post(studio, "api/aprender", { text: "aprendizaje por refuerzo", modo: "rapido" })).status, 200);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    assert.equal(asked().filter((line) => line.startsWith("status ")).length, 0, "the engine is never asked about a quick note");
    assert.equal(prompts().length, 1, "no correction for a quick note");
    assert.equal(stream.events.some((event) => event.name === "notice" && /no creó ningún tema/.test(event.data.message)), false, "a note was written: nothing is owed");
  } finally {
    stream.close();
    delete process.env.FAKE_PI_WRITES;
  }
});

test("choosing the method records it with the engine and starts one deep turn", async () => {
  const { root, engine, log } = makeRoot({ statuses: [METHOD_RECORDED, { status: "accepted", stage: "planning", nextStage: "planning", checks: [{ id: "plan", status: "PASS", reason: "plan written" }] }] });
  const calls = join(root, "engine-args.log");
  const counting = join(root, "counting-engine.sh");
  writeFileSync(counting, `#!/bin/sh\necho "$@" >> ${JSON.stringify(calls)}\nexec ${JSON.stringify(engine)} "$@"\n`);
  chmodSync(counting, 0o755);
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: counting });
  open.push(studio);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const prompts = () => piLog(log).filter((command) => command.type === "prompt");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    const chosen = await post(studio, "api/metodo", { tema: "redes", metodo: "pareto" });
    assert.equal(chosen.status, 200, chosen.body);
    const method = engineArgs(calls).find((line) => line.startsWith("method "));
    assert.ok(method, `the engine's own method command was used: ${engineArgs(calls).join(" | ")}`);
    assert.match(method, /--method pareto/);
    assert.ok(method.includes(`--workspace ${join(root, "redes")}`), "for the topic the learner is on");
    await until(() => prompts().length === 1);
    assert.match(prompts()[0].message, /pareto/, "the tutor is told to plan with the chosen method");
    assert.equal(prompts().length, 1, "exactly one deep turn");
  } finally { stream.close(); }
});

test("the method choice refuses what the engine does not know, and refuses while a turn is held", async () => {
  const { studio, root, prompts, stream } = await piStudio({ root: { statuses: [METHOD_RECORDED] } });
  try {
    for (const body of [{ tema: "redes", metodo: "rapido" }, { tema: "redes" }, { tema: "redes", metodo: "Pareto" }]) {
      assert.equal((await post(studio, "api/metodo", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await post(studio, "api/metodo", { tema: "no-existe", metodo: "pareto" })).status, 404, "a topic the studio does not have");
    assert.equal(engineCalls(root), "0", "the engine was not asked for a refused choice");
    // A held turn refuses the choice like any other turn start.
    assert.equal((await post(studio, "prompt", { text: "primero", tema: "redes" })).status, 200);
    await stream.next("dialog");
    const refused = await post(studio, "api/metodo", { tema: "redes", metodo: "pareto" });
    assert.equal(refused.status, 409, refused.body);
    assert.match(JSON.parse(refused.body).error, /El tutor está trabajando/);
    assert.equal(engineCalls(root), "0", "a refused choice never reaches the engine");
    assert.equal(prompts().length, 1);
  } finally { stream.close(); }
});

test("a submission from the page cannot start a turn while the studio gates the last one", async () => {
  const { studio, root, turns, stream } = await agyStudio({ root: { statuses: [FAILING_STAGE, CLEARED_STAGE], delayMs: 700 } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    // The turn settled and the studio is asking the engine: the turn is still the studio's.
    await until(() => engineCalls(root) === "1");
    const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
    const res = await http(`${view.url.replace(/redes\/p1$/, "")}submit`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(view.url).origin },
      body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: "¿Qué es una capa?" }),
    });
    assert.equal(res.status, 409, res.body);
    assert.match(JSON.parse(res.body).error, /El tutor está trabajando/);
    // The correction still runs, in the same conversation, and the engine clears it.
    await until(() => agyTurns(turns).length === 2);
    assert.match(agyTurns(turns)[1].join(" "), /--conversation test-conversation/);
    assert.equal((await stream.next("gate", (data) => data.passing === true)).tema, "redes");
    assert.equal(agyTurns(turns).length, 2, "the refused submission never ran a turn");
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("a regeneration while a turn is active is refused and leaves the part untouched", async () => {
  const { studio, root, prompts, stream } = await piStudio();
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const dialog = await stream.next("dialog");
    const part = join(root, "redes", "explicaciones", "Parte 1 - Capas.md");
    const before = readFileSync(part, "utf8");
    const refused = await post(studio, "api/regenerar", { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "más corto, por favor" });
    assert.equal(refused.status, 409, refused.body);
    assert.match(JSON.parse(refused.body).error, /El tutor está trabajando/);
    assert.equal(readFileSync(part, "utf8"), before, "the part was not moved: nothing is backed up for a refused turn");
    assert.equal(existsSync(join(root, "papelera")), false, "and nothing was stored as a regeneration");
    assert.equal(prompts().length, 1, "no second turn started");
    // The running turn is untouched: its dialog still answers.
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
  } finally { stream.close(); }
});

test("an engine that cannot report releases the turn", async () => {
  const { studio, engine, prompts, stream } = await piStudio();
  try {
    writeFileSync(engine, "#!/bin/sh\necho 'esto no es un informe'\n");
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    assert.match((await stream.next("notice", (data) => /El motor no pudo revisar/.test(data.message))).message, /El motor no pudo revisar/);
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    // Nothing stayed latched: the studio accepts the next turn (the broken engine still blocks the
    // topic it could not read, so the new turn is the general chat).
    assert.equal((await post(studio, "prompt", { text: "Otra vez" })).status, 200);
    assert.equal(prompts().length, 2);
  } finally { stream.close(); }
});

test("a dead runtime releases the turn", async () => {
  const { studio, stream } = await piStudio();
  try {
    assert.equal((await post(studio, "prompt", { text: "crash", tema: "redes" })).status, 200);
    await stream.next("state", (data) => data.alive === false);
    // `tema` is the topic the last turn taught: the page offers its next step when it ends.
    assert.deepEqual(stream.events.filter((event) => event.name === "state").at(-1)?.data, { busy: false, alive: false, tema: "redes" });
    // The turn the dead runtime could not finish is gone: these routes need an idle studio.
    assert.equal((await post(studio, "api/tema", { tema: "redes" })).status, 200);
    assert.equal((await post(studio, "restart", {})).status, 200);
    assert.equal((await post(studio, "prompt", { text: "hola", tema: "redes" })).status, 200);
  } finally { stream.close(); }
});

/**
 * A studio whose fake engine sleeps only on its first answer and records every answer as it lands,
 * so a test can let a stale settle finish while a later turn is the one in flight.
 */
async function staleEngineStudio() {
  const studio = await agyStudio();
  const calls = join(studio.root, ".engine-calls");
  const answers = join(studio.root, "engine-answers.log");
  const script = [
    "#!/bin/sh",
    `calls=${JSON.stringify(calls)}`,
    `answers=${JSON.stringify(answers)}`,
    'n=$(cat "$calls" 2>/dev/null || echo 0)',
    "n=$((n+1))",
    'echo $n > "$calls"',
    // The first turn's engine answer arrives late; every answer is recorded before it is printed.
    'if [ "$n" = "1" ]; then sleep 1; fi',
    'echo $n >> "$answers"',
    `if [ "$n" = "1" ]; then echo '${JSON.stringify(FAILING_STAGE)}'; else echo '${JSON.stringify(CLEARED_STAGE)}'; fi`,
  ].join("\n") + "\n";
  writeFileSync(studio.engine, script);
  chmodSync(studio.engine, 0o755);
  const answered = () => (existsSync(answers) ? readFileSync(answers, "utf8").trim().split("\n").filter(Boolean).length : 0);
  return { ...studio, answered };
}

/** A second turn is held and answering, while the first turn's engine answer is still on its way. */
async function expectStaleSettleKeepsTheLiveTurn(open, studio, root, turns, stream, answered) {
  assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
  await until(() => agyTurns(turns).length === 1);
  await until(() => engineCalls(root) === "1");
  assert.equal((await post(studio, open)).status, 200);
  assert.equal((await post(studio, "prompt", { text: "Otra vez", tema: "redes" })).status, 200);
  await until(() => agyTurns(turns).length === 2);
  // The first turn's engine answer lands now: it belongs to a turn that is already gone.
  await until(() => answered() === 1);
  assert.equal(stream.events.filter((event) => event.name === "state").at(-1)?.data.busy, true, "the live turn is still held");
  const third = await post(studio, "prompt", { text: "Tercera", tema: "redes" });
  assert.equal(third.status, 409, third.body);
  assert.match(JSON.parse(third.body).error, /El tutor está trabajando/);
  // The live turn's own settle is the one that releases it.
  await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
  assert.equal(agyTurns(turns).length, 2);
}

test("a stale settle cannot release the turn the learner started after an abort", async () => {
  process.env.FAKE_AGY_DELAY_MS = "1200";
  const { studio, root, turns, stream, answered } = await staleEngineStudio();
  try {
    await expectStaleSettleKeepsTheLiveTurn("abort", studio, root, turns, stream, answered);
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
    delete process.env.FAKE_AGY_DELAY_MS;
  }
});

test("a stale settle cannot release the turn the learner started after a restart", async () => {
  process.env.FAKE_AGY_DELAY_MS = "1200";
  const { studio, root, turns, stream, answered } = await staleEngineStudio();
  try {
    await expectStaleSettleKeepsTheLiveTurn("restart", studio, root, turns, stream, answered);
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
    delete process.env.FAKE_AGY_DELAY_MS;
  }
});

test("an abort ends the turn without gating it and works while it is active", async () => {
  process.env.FAKE_AGY_DELAY_MS = "500";
  const { studio, turns, stream } = await agyStudio();
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    await until(() => agyTurns(turns).length === 1);
    assert.equal((await post(studio, "abort")).status, 200);
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    assert.equal(stream.events.filter((event) => event.name === "gate").length, 0, "an aborted turn is not gated");
    assert.equal(agyTurns(turns).length, 1, "and it is not corrected");
    // The studio is free: the next turn is accepted.
    assert.equal((await post(studio, "prompt", { text: "Otra vez", tema: "redes" })).status, 200);
    await until(() => agyTurns(turns).length === 2);
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
    delete process.env.FAKE_AGY_DELAY_MS;
  }
});

// T3: every refusal the learner can actually hit speaks Spanish; the runtime's own words stay in
// the studio log. A refusal written as an English sentence is a defect, not a nuance.
test("the refusals the learner can hit are Spanish", async () => {
  const english = /^(the|a|an|no|not|could|open|pi|engine|unknown|invalid)\b/i;
  const expectSpanish = (message, expected) => {
    assert.equal(message, expected);
    assert.doesNotMatch(message, english, `not an English sentence: ${message}`);
  };

  // 503: the tutor is switched off for this studio.
  const off = await setup({ agentDisabled: true });
  const disabled = await post(off.studio, "prompt", { text: "hola" });
  assert.equal(disabled.status, 503);
  expectSpanish(JSON.parse(disabled.body).error, "El tutor está desactivado.");

  // 503: the tutor process died and nobody restarted it.
  const dead = await piStudio();
  try {
    assert.equal((await post(dead.studio, "prompt", { text: "crash" })).status, 200);
    await dead.stream.next("state", (data) => data.alive === false);
    const stopped = await post(dead.studio, "prompt", { text: "hola" });
    assert.equal(stopped.status, 503);
    expectSpanish(JSON.parse(stopped.body).error, "El tutor no está en marcha.");
  } finally { dead.stream.close(); }

  // 409: a turn is held, from the composer and from the hosted view.
  const busy = await piStudio();
  try {
    assert.equal((await post(busy.studio, "prompt", { text: "primero", tema: "redes" })).status, 200);
    await busy.stream.next("dialog");
    const held = await post(busy.studio, "prompt", { text: "segundo" });
    assert.equal(held.status, 409);
    expectSpanish(JSON.parse(held.body).error, "El tutor está trabajando; espera a que termine.");
    const view = JSON.parse((await http(`${busy.studio.url}api/view?topic=redes&part=p1`)).body);
    const fromPage = await http(`${view.url.replace(/redes\/p1$/, "")}submit`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(view.url).origin },
      body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: "¿Qué es una capa?" }),
    });
    assert.equal(fromPage.status, 409, fromPage.body);
    expectSpanish(JSON.parse(fromPage.body).error, "El tutor está trabajando; espera a que termine.");
  } finally { busy.stream.close(); }
});

test("a refused prompt leaves the running turn alone, and restart recovers a busy tutor", async () => {
  const { root, engine, log } = makeRoot({ status: { status: "failed", stage: "explanation", nextStage: "explanation", checks: [{ id: "p1", status: "FAIL" }] } });
  // A tutor whose turn never settles on its own: only a restart gets the studio back.
  const slow = join(root, "slow-agy.sh");
  writeFileSync(slow, `#!/bin/sh\necho '{"type":"init","conversation_id":"c1"}'\nsleep 5\n`);
  chmodSync(slow, 0o755);
  mkdirSync(join(root, "hash", ".learning"), { recursive: true });
  writeFileSync(join(root, "hash", "plan.json"), JSON.stringify({ topic: "Hash", parts: [] }));
  writeFileSync(join(root, "hash", ".learning", "state.json"), "{}\n");
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: ["/bin/sh", slow] });
  open.push(studio);
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Hola", tema: "redes" })).status, 200);
    await stream.next("state", (data) => data.busy === true);
    // A refused turn must not repoint the gate of the turn already running.
    assert.equal((await post(studio, "prompt", { text: "Otra", tema: "hash" })).status, 409);
    assert.equal(JSON.parse((await http(`${studio.url}api/tema`)).body).tema, "redes");
    assert.equal((await post(studio, "restart", {})).status, 200);
    // The restarted tutor accepts a turn again, which the wedged one could not.
    assert.equal((await post(studio, "prompt", { text: "Hola de nuevo", tema: "redes" })).status, 200);
  } finally { stream.close(); }
});

test("tutor settings default to Pi and persist the selected Antigravity provider", async () => {
  const { studio } = await setup();
  const initial = await http(`${studio.url}api/tutor`);
  assert.equal(initial.status, 200);
  assert.equal(JSON.parse(initial.body).agente, "pi");
  const settings = { version: 1, agente: "agy", modelo: "", pensamiento: "" };
  const saved = await post(studio, "api/tutor", settings);
  assert.equal(saved.status, 200, saved.body);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/tutor`)).body), settings);
  // Antigravity cannot apply "minimal": that level is refused, never silently dropped.
  const unsupported = await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "minimal" });
  assert.equal(unsupported.status, 400);
  assert.match(JSON.parse(unsupported.body).error, /Antigravity does not accept the thinking level/);
  const low = await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "low" });
  assert.equal(low.status, 200, low.body);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/tutor`)).body), { version: 1, agente: "agy", modelo: "", pensamiento: "low" });
  // Pi keeps the levels Antigravity lacks.
  assert.equal((await post(studio, "api/tutor", { version: 1, agente: "pi", modelo: "", pensamiento: "minimal" })).status, 200);
});

test("preferences API seeds, saves, and rejects invalid changes without modifying the stored preferences", async () => {
  const { studio, root } = await setup();
  const initial = await http(`${studio.url}api/preferences`);
  assert.equal(initial.status, 200);
  const data = JSON.parse(initial.body);
  assert.equal(data.version, 1);
  assert.ok(data.aspectos.length > 0);
  assert.equal(data.aspectos.find((a) => a.id === "texto").nivel, "menos");
  assert.equal(stored(root, "preferencias"), undefined);
  data.aspectos[0].nivel = "medio";
  const saved = await post(studio, "api/preferences", data);
  assert.equal(saved.status, 200, saved.body);
  assert.deepEqual(JSON.parse(saved.body), data);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/preferences`)).body), data);
  const before = stored(root, "preferencias");
  assert.deepEqual(JSON.parse(before), data);
  for (const bad of [
    { ...data, extra: true },
    { ...data, version: 2 },
    { ...data, aspectos: [data.aspectos[0], ...data.aspectos.slice(0, -1)] },
    { ...data, aspectos: data.aspectos.map((a, i) => i ? a : { ...a, nivel: "mucho" }) },
    { ...data, aspectos: data.aspectos.map((a, i) => i ? a : { ...a, id: "desconocido" }) },
    { ...data, aspectos: data.aspectos.map((a, i) => i ? a : { ...a, extra: true }) },
    { ...data, aspectos: data.aspectos.slice(1) },
  ]) {
    const response = await post(studio, "api/preferences", bad);
    assert.equal(response.status, 400, response.body);
    assert.ok(JSON.parse(response.body).error);
    assert.equal(stored(root, "preferencias"), before);
  }
});

test("telemetry API reads, records quiz entries, and serves global and topic telemetry", async () => {
  const { studio, root } = await setup();
  const initial = await http(`${studio.url}api/telemetry`);
  assert.equal(initial.status, 200);
  const data = JSON.parse(initial.body);
  assert.equal(data.version, 1);
  assert.equal(data.estadisticas_globales.total_quizzes, 0);
  assert.ok(data.perfil_alumno.tendencias.matematicas);
  assert.equal(stored(root, "telemetria"), undefined);

  const entry = {
    punto: "1. Por qué existe",
    tema: "sql-demo",
    categoria: "matematicas",
    pregunta: "¿Por qué el índice reduce operaciones?",
    respuesta_alumno: "B",
    respuesta_correcta: "B",
    ok: true,
    por_que: "Comprensión sólida de reducción logarítmica",
  };
  const recorded = await post(studio, "api/telemetry", { entry });
  assert.equal(recorded.status, 200, recorded.body);
  const res = JSON.parse(recorded.body);
  assert.ok(res.ok);
  assert.equal(res.global.estadisticas_globales.total_quizzes, 1);
  assert.equal(res.global.estadisticas_globales.total_aciertos, 1);
  assert.equal(JSON.parse(stored(root, "telemetria")).estadisticas_globales.total_quizzes, 1);
  assert.equal(JSON.parse(stored(root, "telemetria/sql-demo")).quizzes.length, 1);

  // Query by topic
  const byTopic = await http(`${studio.url}api/telemetry?topic=sql-demo`);
  assert.equal(byTopic.status, 200);
  const topicData = JSON.parse(byTopic.body);
  assert.ok(topicData.global);
  assert.ok(topicData.topic);
  assert.equal(topicData.topic.quizzes.length, 1);
  assert.equal(topicData.topic.resumen.aciertos, 1);

  // Rejection of invalid global telemetry update
  const bad = await post(studio, "api/telemetry", { version: 99 });
  assert.equal(bad.status, 400);
});

const post = (studio, path, payload, headers = {}) =>
  http(`${studio.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(studio.url).origin, ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

/** Collects Server-Sent Events; `next(name, pred)` waits for a matching one. */
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

const until = async (pred, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("condition not met");
};

/** `until` for a condition that has to be read over HTTP; the waits a fixed sleep cannot bound. */
const untilAsync = async (pred, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("condition not met");
};

test("the shell page is token-gated, loopback-only and frames only the hosted bridge and its own saved parts", async () => {
  const { studio, received } = await setup();
  const page = await http(studio.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /<main id="studio"><\/main>/);
  const data = JSON.parse(page.body.match(/id="studio-data">(.*?)<\/script>/)[1]);
  assert.equal(data.base, new URL(studio.url).pathname);
  const csp = page.headers["content-security-policy"];
  // The bridge, and the studio itself for a part saved on the device: nothing else may be framed.
  assert.match(csp, /frame-src http:\/\/127\.0\.0\.1:\d+ 'self'(;|$)/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net(;|$)/);
  assert.equal((await http(`${new URL(studio.url).origin}/${"0".repeat(64)}/`)).status, 404);
  const entry = await http(`${new URL(studio.url).origin}/`);
  assert.equal(entry.status, 302, "the bare origin is a stable entry point");
  assert.equal(entry.headers.location, new URL(studio.url).pathname);
  assert.equal((await http(`${new URL(studio.url).origin}/`, { headers: { host: "evil.example" } })).status, 403);
  assert.equal((await http(`${new URL(studio.url).origin}/`, { method: "POST" })).status, 404);
  assert.equal((await http(studio.url, { headers: { host: "evil.example" } })).status, 403);
  await until(() => received().length > 0 || true);
  assert.equal((await http(`${studio.url}studio.js`)).status, 200);
  assert.equal((await http(`${studio.url}tutorial.js`)).status, 200);
  assert.match(page.body, /<script src="\/[0-9a-f]{64}\/tutorial\.js"><\/script>\n<script src="\/[0-9a-f]{64}\/studio\.js">/);
  const icon = page.body.match(/<link rel="icon" href="(\/[0-9a-f]{64}\/favicon\.svg)" type="image\/svg\+xml">/);
  assert.ok(icon, "the shell declares the shared icon");
  const svg = await http(new URL(icon[1], studio.url).href);
  assert.equal(svg.status, 200, "the shell's icon is served under the token");
  assert.match(svg.headers["content-type"], /^image\/svg\+xml/);
  assert.match(svg.body, /^<svg /);
});

test("public studio origins route views and authorize only the configured proxy", async () => {
  const publicOrigin = "https://box.tail0.ts.net:8445";
  const bridgePublicOrigin = "https://box.tail0.ts.net:8446";
  const { studio, received } = await setup({ publicOrigin, bridgePublicOrigin, bridgePort: 0 });
  const page = await http(studio.url, { headers: { host: "box.tail0.ts.net:8445" } });
  assert.equal(page.status, 200);
  assert.match(page.headers["content-security-policy"], /frame-src https:\/\/box\.tail0\.ts\.net:8446 'self'(;|$)/);
  const view = await http(`${studio.url}api/view?topic=redes&part=p1`);
  assert.equal(view.status, 200, view.body);
  assert.ok(JSON.parse(view.body).url.startsWith(`${bridgePublicOrigin}/`));
  assert.equal((await http(studio.url, { headers: { host: "evil.example" } })).status, 403);
  const before = received().filter((c) => c.type === "prompt").length;
  assert.equal((await post(studio, "prompt", { text: "forbidden" }, { origin: "http://evil.example" })).status, 403);
  assert.equal(received().filter((c) => c.type === "prompt").length, before);
  assert.equal((await post(studio, "prompt", { text: "public prompt" }, { origin: publicOrigin })).status, 200);
  assert.ok(received().some((c) => c.type === "prompt" && said(c.message) === "public prompt"));
  await assert.rejects(() => startStudio({ root: makeRoot().root, port: studio.port, publicOrigin, bridgePublicOrigin }), /EADDRINUSE/);
});

test("a draft reaches the reader over loopback and comes back with the public url", async () => {
  // A published studio reaches its reader through a TLS proxy with a certificate this
  // machine does not trust. The draft must still be drawn, so the server-to-server call
  // uses loopback; the browser still gets a public url, because the frame loads it.
  const publicOrigin = "https://box.tail0.ts.net:8445";
  const bridgePublicOrigin = "https://box.tail0.ts.net:8446";
  const { studio } = await setup({ publicOrigin, bridgePublicOrigin, bridgePort: 0 });
  const answer = await post(studio, "api/draft", { title: "Público", body: "# Público\n\nhola.\n" }, { origin: publicOrigin });
  assert.equal(answer.status, 200, answer.body);
  assert.match(JSON.parse(answer.body).url, /^https:\/\/box\.tail0\.ts\.net:8446\/[0-9a-f]{64}\/borrador\/[0-9a-f]{32}$/);
});

test("a second public studio origin is authorized while the first stays canonical", async () => {
  const canonical = "https://learnings.infra.local";
  const fallback = "https://10.154.59.151:8445";
  const bridgeCanonical = "https://learnings.infra.local:8446";
  const bridgeFallback = "https://10.154.59.151:8446";
  const { studio, received } = await setup({ publicOrigin: `${canonical},${fallback}`, bridgePublicOrigin: `${bridgeCanonical},${bridgeFallback}`, bridgePort: 0 });
  for (const host of ["learnings.infra.local", "10.154.59.151:8445"]) {
    const page = await http(studio.url, { headers: { host } });
    assert.equal(page.status, 200, host);
    assert.match(page.headers["content-security-policy"], /frame-src https:\/\/learnings\.infra\.local:8446 'self'(;|$)/);
    assert.match(page.headers["content-security-policy"], /frame-ancestors 'none'/);
  }
  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  assert.ok(view.url.startsWith(`${bridgeCanonical}/`), "the first bridge origin stays canonical");
  // Both origins are authorized. One turn at a time, so the second is proven by authorization
  // (a refusal, never a 403) while the first is proven by the turn it really started.
  assert.equal((await post(studio, "prompt", { text: `desde ${canonical}` }, { origin: canonical })).status, 200);
  const second = await post(studio, "prompt", { text: `desde ${fallback}` }, { origin: fallback });
  assert.equal(second.status, 409, second.body);
  assert.match(JSON.parse(second.body).error, /El tutor está trabajando/);
  assert.ok(received().some((c) => c.type === "prompt" && said(c.message) === `desde ${canonical}`));
  assert.equal((await post(studio, "prompt", { text: "forbidden" }, { origin: "https://evil.example" })).status, 403);
});

test("the entry URL a person opens is the first configured origin", () => {
  assert.equal(entryUrl(undefined, 4747), "http://127.0.0.1:4747/");
  assert.equal(entryUrl("https://learnings.infra.local,https://10.154.59.151:8445", 4747), "https://learnings.infra.local/");
});

test("public studio origins must be configured together", async () => {
  for (const options of [{ publicOrigin: "https://box.ts.net" }, { bridgePublicOrigin: "https://box.ts.net" }]) {
    await assert.rejects(() => startStudio({ root: makeRoot().root, ...options }), /publicOrigin.*bridgePublicOrigin|bridgePublicOrigin.*publicOrigin/);
  }
});

test("a configured studio token survives a restart so open tabs keep working", async () => {
  const token = randomBytes(32).toString("hex");
  const first = await setup({ token });
  assert.equal(first.studio.url, `http://127.0.0.1:${first.studio.port}/${token}/`);
  assert.equal((await http(`${first.studio.url}api/library`)).status, 200);
  await first.studio.close();
  const second = await setup({ token });
  assert.equal((await http(`${second.studio.url}api/library`)).status, 200, "the same token still opens the studio");
  assert.equal((await http(`http://127.0.0.1:${second.studio.port}/${token.slice(1)}/api/library`)).status, 404);
});

test("a configured studio token keeps the reader's URLs across a restart, so an open quiz can still dictate and submit", async () => {
  const token = randomBytes(32).toString("hex");
  const readerBase = async (studio) => JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body).url.replace(/redes\/p1$/, "");
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const bridgePort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const first = await setup({ token, bridgePort });
  const before = await readerBase(first.studio);
  await first.studio.close();
  const second = await setup({ token, bridgePort });
  assert.equal(await readerBase(second.studio), before, "the reader keeps its whole URL");
  assert.doesNotMatch(new URL(before).pathname, new RegExp(token), "the reader token is not the studio token");
  assert.equal((await http(`${before}redes/p1`)).status, 200, "the URL an open tab still holds keeps working");
});

test("a weak studio token is refused", async () => {
  await assert.rejects(() => startStudio({ root: makeRoot().root, token: "short" }), /64 lowercase hex/);
});

test("a taken port falls back to a free one", async () => {
  const { root, engine } = makeRoot();
  const first = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, port: 0 });
  open.push(first);
  const second = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, port: first.port });
  open.push(second);
  assert.notEqual(second.port, first.port);
  assert.equal((await http(second.url)).status, 200);
});

test("Pi runs in the Learnings folder as an interactive RPC host and the history reaches a new client", async () => {
  const { studio, root, received } = await setup();
  const stream = sse(`${studio.url}events`);
  const history = await stream.next("history");
  assert.deepEqual(history.messages, [
    { role: "user", text: "hola" },
    { role: "assistant", text: "¡Hola!" },
  ]);
  assert.deepEqual(await stream.next("state"), { busy: false, alive: true, tema: null });
  assert.deepEqual(history.note, { topic: "tema", index: 1 }, "the reloaded tab still knows the note the tutor wrote");
  const first = received().find((c) => c.type === "get_messages");
  assert.equal(first.interactiveHost, "1");
  assert.equal(first.cwd, root);
  stream.close();
});

test("a path inside a topic folder names that topic, whatever file it is", () => {
  const root = "/home/ale/Learnings";
  assert.equal(topicFromPath("/home/ale/Learnings/redes/diagnostico-conceptos.json", root), "redes");
  assert.equal(topicFromPath("/home/ale/Learnings/redes/explicaciones/Parte 1 - Capas.md", root), "redes");
  assert.equal(topicFromPath("/home/ale/Learnings/rapidos/hash.md", root), null, "quick notes belong to no topic");
  assert.equal(topicFromPath("/home/ale/Learnings/.atl/skill-registry.md", root), null, "hidden folders are not topics");
  assert.equal(topicFromPath("/home/ale/Learnings/notas.md", root), null, "a file at the root is in no topic");
  assert.equal(topicFromPath("/home/ale/otra/redes/plan.json", root), null, "outside the Learnings root");
  assert.equal(topicFromPath("tema/explicaciones/Parte 1 - Algo.md"), "tema", "without a root the first folder is the topic");
  assert.equal(topicFromPath(undefined, root), null);
});

test("a part note path resolves to the topic and part the reader routes on", () => {
  assert.deepEqual(noteFromPath("/home/ale/Learnings/redes/quiz.md"), { topic: "redes", diagnosis: true });
  assert.deepEqual(noteFromPath("/home/ale/Learnings/redes/quiz.md", "/home/ale/Learnings"), { topic: "redes", diagnosis: true });
  assert.equal(noteFromPath("/home/ale/Learnings/redes/sub/quiz.md", "/home/ale/Learnings"), null);
  assert.equal(noteFromPath("redes/explicaciones/quiz.md"), null, "a quiz nested in a topic's folders is not the diagnosis");
  assert.equal(noteFromPath("/home/ale/Learnings/redes/quiz.json", "/home/ale/Learnings"), null);
  assert.deepEqual(noteFromPath("/home/ale/Learnings/redes/explicaciones/Parte 3 - Capas.md"), { topic: "redes", index: 3 });
  assert.deepEqual(noteFromPath("redes/explicaciones/Parte 1 - Algo.md"), { topic: "redes", index: 1 });
  assert.deepEqual(noteFromPath("C:\\Users\\ismar\\Learnings\\redes\\explicaciones\\Parte 12 - Redes.md"), { topic: "redes", index: 12 });
  assert.equal(noteFromPath("/home/ale/Learnings/redes/explicaciones/mis-palabras.md"), null, "only part notes are routable");
  assert.equal(noteFromPath("/home/ale/Learnings/redes/explicaciones/Parte 4 - Falsa.txt"), null);
  assert.equal(noteFromPath("/home/ale/Learnings/redes/plan.json"), null);
  assert.equal(noteFromPath("explicaciones/Parte 1 - Sin tema.md"), null, "a note without its topic folder has no route");
  assert.equal(noteFromPath(undefined), null);
  assert.deepEqual(noteFromPath("/home/ale/Learnings/redes/explicaciones/Parte 2 - TCP.html"), { topic: "redes", index: 2 }, "the rich page of a part opens that part");
  assert.equal(noteFromPath("/home/ale/Learnings/redes/explicaciones/apps/p1.html"), null, "only part notes and pages are routable");
});

test("a quick note path resolves to the quick note the reader opens", () => {
  assert.deepEqual(noteFromPath("/home/ale/Learnings/rapidos/quiz.md", "/home/ale/Learnings"), { quick: "quiz" });
  assert.deepEqual(noteFromPath("/home/ale/Learnings/rapidos/hash.md"), { quick: "hash" });
  assert.deepEqual(noteFromPath("C:\\Users\\ismar\\Learnings\\rapidos\\que-es-dns.md"), { quick: "que-es-dns" });
  assert.equal(noteFromPath("/home/ale/Learnings/rapidos/notas.txt"), null);
  assert.equal(noteFromPath("/home/ale/Learnings/rapidos/con espacio.md"), null, "only ids the reader routes on");
});

test("the conversation remembers the last part note the tutor wrote", () => {
  const call = (name, path) => ({ role: "assistant", content: [{ type: "toolCall", id: "t", name, arguments: { path } }] });
  assert.deepEqual(noteFromMessages([call("write", "redes/quiz.md")]), { topic: "redes", diagnosis: true });
  assert.deepEqual(noteFromMessages([call("write", "redes/explicaciones/Parte 1 - Capas.md")]), { topic: "redes", index: 1 });
  assert.deepEqual(
    noteFromMessages([call("write", "redes/explicaciones/Parte 1 - Capas.md"), call("edit", "redes/explicaciones/Parte 3 - TCP.md")]),
    { topic: "redes", index: 3 },
    "the latest note wins",
  );
  assert.equal(noteFromMessages([call("bash", "redes/explicaciones/Parte 1 - Capas.md")]), null, "only writes and edits carry a note");
  assert.equal(noteFromMessages([{ role: "user", content: "hola" }]), null);
  assert.equal(noteFromMessages([call("write", "redes/explicaciones/mis-palabras.md")]), null);
  assert.equal(noteFromMessages(undefined), null);
});

// The chat is the learner's. The harness warns the operator through the same
// channel (RDD status, review mode); a warning about the agent's plumbing in the
// middle of a lesson is noise, so it stays in the studio's log.
test("the chat hides the harness's own notices and keeps the tutor's", async (t) => {
  process.env.FAKE_PI_NOTICES = JSON.stringify([
    "Gentle AI: receipt-driven-development status is unavailable: native status could not be read. The parent prompt keeps the last known status.",
    "Aviso del tutor",
  ]);
  t.after(() => {
    delete process.env.FAKE_PI_NOTICES;
  });
  const { studio } = await setup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await post(studio, "prompt", { text: "hola" });
  assert.deepEqual(await stream.next("notice"), { level: "info", message: "Aviso del tutor" }, "the tutor's notice is the first one the learner sees");
  await stream.next("dialog");
  assert.equal(stream.events.filter((e) => e.name === "notice").length, 1, "the harness notice never reaches the chat");
  stream.close();
});

test("a prompt streams text, tool activity and a dialog whose answer goes back to Pi", async () => {
  const { studio, received } = await setup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  const res = await post(studio, "prompt", { text: "Quiero aprender redes." });
  assert.equal(res.status, 200, res.body);
  assert.equal(said(received().find((c) => c.type === "prompt").message), "Quiero aprender redes.");
  assert.deepEqual(await stream.next("user"), { text: "Quiero aprender redes." });
  // A turn that teaches no topic says so: the page offers no next step for it.
  assert.deepEqual(await stream.next("state", (s) => s.busy), { busy: true, alive: true, tema: null });
  const delta = await stream.next("assistant_delta");
  assert.equal(delta.delta, "Hola, ");
  // A tool row belongs to the conversation that produced it.
  const chat = JSON.parse((await http(`${studio.url}api/chats`)).body).activo;
  assert.deepEqual(await stream.next("tool", (t) => t.phase === "start"), { phase: "start", chat, id: "t1", name: "write", label: "Escribiendo Parte 1 - Algo.md", ok: true, note: { topic: "tema", index: 1 }, topic: "tema" });
  assert.deepEqual(await stream.next("tool", (t) => t.phase === "end"), { phase: "end", chat, id: "t1", name: "write", label: "Escribiendo Parte 1 - Algo.md", ok: true, note: { topic: "tema", index: 1 }, topic: "tema" }, "the end keeps the arguments its start carried");
  assert.deepEqual(await stream.next("notice"), { level: "info", message: "Aviso del tutor" });
  const dialog = await stream.next("dialog");
  assert.deepEqual(dialog, { id: "d1", method: "select", title: "¿Cómo quieres aprender?", message: "", options: ["Universitario", "Rápido con quiz"], placeholder: "" });
  assert.equal(stream.events.filter((e) => e.name === "dialog").length, 1, "fire-and-forget UI requests are not dialogs");

  const late = sse(`${studio.url}events`);
  assert.equal((await late.next("dialog")).id, "d1", "an open dialog is replayed to a new client");
  late.close();

  assert.equal((await post(studio, "dialog", { id: "nope", value: "x" })).status, 404);
  assert.equal((await post(studio, "dialog", { id: "d1" })).status, 400);
  const answer = await post(studio, "dialog", { id: "d1", value: "Rápido con quiz" });
  assert.equal(answer.status, 200, answer.body);
  assert.deepEqual(await stream.next("dialog_closed"), { id: "d1" });
  const end = await stream.next("assistant_end");
  assert.equal(end.text, "Hola, elegiste Rápido con quiz.");
  // A dialog answer gets no RPC response, so the 200 only means it was written to
  // Pi; Pi has recorded it once it answers with the rest of the message.
  assert.deepEqual(received().find((c) => c.type === "extension_ui_response"), {
    type: "extension_ui_response", id: "d1", value: "Rápido con quiz", interactiveHost: "1", cwd: received()[0].cwd,
  });
  assert.equal(end.id, delta.id);
  assert.deepEqual(await stream.next("state", (s) => !s.busy), { busy: false, alive: true, tema: null });
  await stream.next("library_changed");

  // The turn is over, so a new one is accepted: nothing stays latched behind a settled turn.
  const next = await post(studio, "prompt", { text: "otra cosa" });
  assert.equal(next.status, 200, next.body);
  stream.close();
});

// One turn at a time, studio-wide: a second prompt is refused, never queued behind the first, and
// nothing stays latched once the turn is decided.
test("a prompt while a turn is active is refused, never queued, and the latch is gone after it", async () => {
  const { studio, prompts, stream } = await piStudio();
  try {
    assert.equal((await post(studio, "prompt", { text: "primero", tema: "redes" })).status, 200);
    const dialog = await stream.next("dialog");
    const second = await post(studio, "prompt", { text: "después" });
    assert.equal(second.status, 409, second.body);
    assert.match(JSON.parse(second.body).error, /El tutor está trabajando/);
    assert.equal(prompts().length, 1, "nothing was queued behind the running turn");
    assert.equal(prompts()[0].streamingBehavior, undefined, "the studio never asks Pi for a follow-up");

    // The turn ends when its dialog is answered; the routes that need an idle studio work again.
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    assert.equal((await post(studio, "api/tema", { tema: "redes" })).status, 200);
    const created = await post(studio, "api/chats", { nombre: "otra" });
    assert.equal(created.status, 200, created.body);
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "pi", modelo: "", pensamiento: "" })).status, 200);
  } finally { stream.close(); }
});

test("POSTs refuse foreign origins, non-JSON, empty or oversize prompts, and reach Pi with nothing", async () => {
  const { studio, received } = await setup();
  const before = received().length;
  const cases = [
    [await post(studio, "prompt", { text: "x" }, { origin: "http://evil.example" }), 403],
    [await post(studio, "prompt", { text: "x" }, { origin: "null" }), 403],
    [await post(studio, "prompt", { text: "x" }, { "content-type": "text/plain" }), 415],
    [await post(studio, "prompt", "{nope"), 400],
    [await post(studio, "prompt", { text: "   " }), 400],
    [await post(studio, "prompt", { text: "x".repeat(20001) }), 400],
    [await post(studio, "prompt", "x".repeat(70 * 1024)), 413],
    [await post(studio, "unknown", {}), 404],
  ];
  for (const [res, status] of cases) assert.equal(res.status, status, res.body);
  assert.equal(received().filter((c) => c.type === "prompt").length, 0);
  assert.ok(received().length >= before);
});

// C2: the learner's explanation method travels with the library once the engine records it.
test("the library carries the explanation method the engine recorded", async () => {
  const { root, engine, log } = makeRoot({ status: { status: "accepted", stage: "planning", nextStage: "planning", method: "pareto" } });
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine });
  open.push(studio);
  const [topic] = JSON.parse((await http(`${studio.url}api/library`)).body).topics;
  assert.equal(topic.method, "pareto");
  const { studio: plain } = await setup();
  const [before] = JSON.parse((await http(`${plain.url}api/library`)).body).topics;
  assert.equal(before.method, "", "no method before the learner chooses one");
});

test("the library lists topics with engine status, parts and quick notes; api/view returns framable bridge URLs", async () => {
  const { studio } = await setup();
  const library = JSON.parse((await http(`${studio.url}api/library`)).body);
  assert.deepEqual(library.quick, [{ id: "hash", title: "Qué es un hash" }]);
  assert.equal(library.topics.length, 1);
  const [topic] = library.topics;
  assert.equal(topic.id, "redes");
  assert.equal(topic.title, "Redes");
  assert.equal(topic.status, "waiting");
  assert.equal(topic.stage, "diagnosis");
  assert.equal(topic.hasDiagnosis, true);
  assert.deepEqual(topic.parts.map((p) => [p.id, p.written]), [["p1", true], ["p2", false]]);
  // What the topic still owes travels with the library, so no view can call it finished.
  assert.deepEqual(topic.gaps, { missing: ["p2"], noVisuals: [], noQuiz: ["p1"] });
  assert.deepEqual(topic.parts.map((p) => p.visuals), [0, 0]);

  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  assert.match(view.url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\/redes\/p1$/);
  const page = await http(view.url);
  assert.match(page.headers["content-security-policy"], new RegExp(`frame-ancestors 'self' ${new URL(studio.url).origin}`));
  assert.equal((await http(`${studio.url}api/view?topic=redes&part=p2`)).status, 404);
  const quick = JSON.parse((await http(`${studio.url}api/view?quick=hash`)).body);
  assert.match(quick.url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\/rapidos\/hash$/);
  assert.equal((await http(quick.url)).status, 200);
  assert.equal((await http(`${studio.url}api/view?quick=nope`)).status, 404);
  assert.equal((await http(`${studio.url}api/view?quick=..`)).status, 404);
});

test("the library lists the most recently used quick note first", async () => {
  const { studio, root } = await setup();
  const dir = join(root, "rapidos");
  // Same vault, three notes touched at different times: the order the learner
  // sees must follow the last use, not the order the directory happens to give.
  for (const [id, hoursAgo] of [["hash", 30], ["vector", 5], ["arbol", 0.5]]) {
    const file = join(dir, `${id}.md`);
    if (id !== "hash") writeFileSync(file, `# ${id}\n\nUna nota breve.\n`);
    const when = new Date(Date.now() - hoursAgo * 3600_000);
    utimesSync(file, when, when);
  }
  const library = JSON.parse((await http(`${studio.url}api/library`)).body);
  assert.deepEqual(library.quick.map((q) => q.id), ["arbol", "vector", "hash"]);
});

test("a submission from the hosted view becomes a prompt of the same Pi session", async () => {
  const { studio, received } = await setup();
  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  const bridgeBase = view.url.replace(/redes\/p1$/, "");
  const res = await http(`${bridgeBase}submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(view.url).origin },
    body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: "¿Qué es una capa?" }),
  });
  assert.equal(res.status, 200, res.body);
  await until(() => received().some((c) => c.type === "prompt"));
  assert.match(received().find((c) => c.type === "prompt").message, /^\[Vista HTML · redes · p1 · pregunta\]/);
});

test("if Pi stops the studio reports it and restart brings it back", async () => {
  const { studio, received } = await setup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await post(studio, "prompt", { text: "crash" });
  assert.deepEqual(await stream.next("state", (s) => !s.alive), { busy: false, alive: false, tema: null });
  assert.equal((await stream.next("error")).message, "El tutor se detuvo.");
  assert.equal((await post(studio, "prompt", { text: "hola" })).status, 503);
  assert.equal((await post(studio, "restart", {})).status, 200);
  assert.deepEqual(await stream.next("state", (s) => s.alive), { busy: false, alive: true, tema: null });
  assert.equal((await post(studio, "new-session", {})).status, 200);
  assert.ok(received().some((c) => c.type === "new_session"));
  stream.close();
});

test("deleting a note moves it to the vault trash, drops it from the plan and refreshes the library", async () => {
  const { studio, root } = await setup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");

  // A quick note: it leaves the library and waits in .papelera with its manifest.
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/library`)).body).quick.map((q) => q.id), ["hash"]);
  const quick = await post(studio, "delete", { kind: "quick", quick: "hash" });
  assert.equal(quick.status, 200, quick.body);
  const result = JSON.parse(quick.body);
  assert.deepEqual(result.moved, [join("rapidos", "hash.md")]);
  assert.equal(existsSync(join(root, "rapidos", "hash.md")), false);
  const manifest = JSON.parse(readFileSync(join(root, result.trash, "papelera.json"), "utf8"));
  assert.equal(manifest.kind, "quick");
  assert.equal(manifest.quick, "hash");
  await stream.next("library_changed");
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/library`)).body).quick, []);

  // A part: its files leave and the plan stops listing it.
  const part = await post(studio, "delete", { kind: "part", topic: "redes", part: "p1" });
  assert.equal(part.status, 200, part.body);
  assert.equal(existsSync(join(root, "redes", "explicaciones", "Parte 1 - Capas.md")), false);
  assert.equal(existsSync(join(root, "redes", "explicaciones", "apps", "p1.html")), false);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "redes", "plan.json"), "utf8")).parts.map((p) => p.id), ["p2"]);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/library`)).body).topics[0].parts.map((p) => p.id), ["p2"]);

  // A whole topic.
  const topic = await post(studio, "delete", { kind: "topic", topic: "redes" });
  assert.equal(topic.status, 200, topic.body);
  assert.equal(existsSync(join(root, "redes")), false);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/library`)).body).topics, []);
  stream.close();
});

test("the delete route refuses foreign origins, weak bodies and paths outside the vault", async () => {
  const { studio, root } = await setup();
  assert.equal((await post(studio, "delete", { kind: "quick", quick: "hash" }, { origin: "http://evil.test" })).status, 403);
  assert.equal((await http(`${studio.url}delete`, { method: "POST", headers: { origin: new URL(studio.url).origin }, body: "kind=quick" })).status, 415);
  for (const body of [{}, { kind: "folder", topic: "redes" }, { kind: "topic", topic: ".." }, { kind: "topic", topic: ".papelera" }, { kind: "part", topic: "redes", part: "../p1" }]) {
    const response = await post(studio, "delete", body);
    assert.equal(response.status, 400, `${JSON.stringify(body)} → ${response.status} ${response.body}`);
  }
  assert.equal((await post(studio, "delete", { kind: "topic", topic: "no-existe" })).status, 404);
  // Nothing moved and the refusals left no trash folder behind.
  assert.equal(existsSync(join(root, "rapidos", "hash.md")), true);
  assert.equal(existsSync(join(root, "redes", "explicaciones", "Parte 1 - Capas.md")), true);
  assert.equal(existsSync(join(root, ".papelera")), false);
});

test('the studio draws a draft without writing it', async () => {
  const { studio, root } = await setup();
  const body = [
    '# Borrador vivo',
    '',
    'Un párrafo que todavía no se guardó.',
    '',
    '<lk-walkthrough class="lk-wt-compact" title="El borrador se dibuja"><script type="application/json">{"viewBox":"0 0 320 240","title":"El borrador se dibuja","steps":[{"title":"Paso uno","text":"Texto","scene":{"boxes":[{"x":20,"y":40,"w":280,"h":60,"label":"El borrador"}],"arrows":[{"x1":160,"y1":100,"x2":160,"y2":160,"label":"sigue"}]}},{"title":"Paso dos","text":"Más","scene":{"boxes":[{"x":20,"y":40,"w":280,"h":60,"label":"El borrador"}],"arrows":[{"x1":160,"y1":100,"x2":160,"y2":160,"label":"sigue"}]}},{"title":"Paso tres","text":"Fin","scene":{"boxes":[{"x":20,"y":40,"w":280,"h":60,"label":"El borrador"}],"arrows":[{"x1":160,"y1":100,"x2":160,"y2":160,"label":"sigue"}]}}]}</script></lk-walkthrough>',
    '',
  ].join('\n');

  const draft = await post(studio, 'api/draft', { title: 'Borrador vivo', body });
  assert.equal(draft.status, 200, draft.body);
  const { url } = JSON.parse(draft.body);
  assert.match(url, /\/borrador\/[0-9a-f]{32}$/);

  // The same reader draws it: the deck and the heading travel inside the page.
  const drawn = await http(url);
  assert.equal(drawn.status, 200);
  assert.match(drawn.body, /Borrador vivo/);
  assert.match(drawn.body, /lk-walkthrough/);

  // Nothing reached the vault, and the note is not in the library.
  assert.equal(existsSync(join(root, 'rapidos', 'borrador-vivo.md')), false);
  assert.equal(JSON.parse((await http(`${studio.url}api/library`)).body).quick.some((note) => note.id === 'borrador-vivo'), false);

  // A foreign page and an oversized draft are refused.
  assert.equal((await post(studio, 'api/draft', { body }, { origin: 'http://evil.test' })).status, 403);
  assert.equal((await post(studio, 'api/draft', { body: 'x'.repeat(70_000) })).status, 413);
});

test('a note saved from the studio reads back with its rev and lands first', async () => {
  const { studio, root } = await setup();
  const body = '# Nota nueva\n\nUn párrafo escrito desde el estudio.\n';
  const saved = await post(studio, 'save-note', { title: 'Nota nueva', body });
  assert.equal(saved.status, 200);
  const answer = JSON.parse(saved.body);
  assert.equal(answer.ok, true);
  assert.equal(answer.id, 'nota-nueva');
  assert.equal(answer.created, true);
  assert.match(answer.rev, /^[0-9a-f]{64}$/);

  const read = await http(`${studio.url}api/note?quick=nota-nueva`);
  assert.equal(read.status, 200);
  assert.deepEqual(JSON.parse(read.body), { id: 'nota-nueva', title: 'Nota nueva', body, rev: answer.rev });
  assert.equal(readFileSync(join(root, 'rapidos', 'nota-nueva.md'), 'utf8'), body);

  const library = JSON.parse((await http(`${studio.url}api/library`)).body);
  assert.equal(library.quick[0].id, 'nota-nueva');
});

test('an update with the current rev replaces the note', async () => {
  const { studio } = await setup();
  const first = JSON.parse((await post(studio, 'save-note', { title: 'Cambiante', body: '# Cambiante\n\nuno\n' })).body);
  const second = await post(studio, 'save-note', { quick: 'cambiante', body: '# Cambiante\n\ndos\n', rev: first.rev });
  assert.equal(second.status, 200);
  const answer = JSON.parse(second.body);
  assert.equal(answer.created, false);
  assert.notEqual(answer.rev, first.rev);
  assert.equal(JSON.parse((await http(`${studio.url}api/note?quick=cambiante`)).body).body, '# Cambiante\n\ndos\n');
});

test('a save over a note that changed underneath is refused with the current rev', async () => {
  const { studio, root } = await setup();
  const first = JSON.parse((await post(studio, 'save-note', { title: 'Peleada', body: '# Peleada\n\nuno\n' })).body);
  const other = '# Peleada\n\nescrito por otro editor\n';
  writeFileSync(join(root, 'rapidos', 'peleada.md'), other);
  const refused = await post(studio, 'save-note', { quick: 'peleada', body: '# Peleada\n\nmío\n', rev: first.rev });
  assert.equal(refused.status, 409);
  const answer = JSON.parse(refused.body);
  assert.match(answer.rev, /^[0-9a-f]{64}$/);
  assert.notEqual(answer.rev, first.rev);
  // The other editor's bytes survive, and the library still lists the note once.
  assert.equal(readFileSync(join(root, 'rapidos', 'peleada.md'), 'utf8'), other);
  const library = JSON.parse((await http(`${studio.url}api/library`)).body);
  assert.equal(library.quick.filter((note) => note.id === 'peleada').length, 1);
});

test('a note with a deck whose word does not fit is refused and nothing is stored', async () => {
  const { studio, root } = await setup();
  const body = [
    '# Rota',
    '',
    '<lk-walkthrough class="lk-wt-compact" title="Rota">',
    '<script type="application/json">',
    JSON.stringify({
      viewBox: '0 0 320 400',
      title: 'Rota',
      steps: [{ title: 'Uno', text: 'Texto', scene: { boxes: [{ x: 20, y: 40, w: 280, h: 60, label: 'sin corrección, la primera palabra no aparece', size: 26 }], arrows: [{ x1: 160, y1: 100, x2: 160, y2: 160, label: 'sigue' }] } }],
    }),
    '</script>',
    '</lk-walkthrough>',
    '',
  ].join('\n');
  const refused = await post(studio, 'save-note', { title: 'Rota', body });
  assert.equal(refused.status, 400);
  const answer = JSON.parse(refused.body);
  assert.ok(answer.problems.length > 0);
  assert.ok(answer.problems.some((p) => /does not fit|needs \d+px/.test(p.text)));
  assert.equal(existsSync(join(root, 'rapidos', 'rota.md')), false);
  const library = JSON.parse((await http(`${studio.url}api/library`)).body);
  assert.equal(library.quick.some((note) => note.id === 'rota'), false);
});

test('the save route refuses ids that escape rapidos and foreign origins', async () => {
  const { studio, root } = await setup();
  for (const quick of ['../escape', 'a/b', '..', '.hidden']) {
    const refused = await post(studio, 'save-note', { quick, body: '# Escape\n\nx\n', rev: '0'.repeat(64) });
    assert.ok(refused.status === 400 || refused.status === 404, `expected a refusal for ${JSON.stringify(quick)}, got ${refused.status}`);
    assert.equal(existsSync(join(root, '..', 'escape.md')), false);
  }
  const foreign = await post(studio, 'save-note', { title: 'Intrusa', body: '# Intrusa\n\nx\n' }, { origin: 'http://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(existsSync(join(root, 'rapidos', 'intrusa.md')), false);
  const missing = await http(`${studio.url}api/note?quick=nope`);
  assert.equal(missing.status, 404);
});

test("opening a topic is remembered outside the vault and reported by the library", async () => {
  const openedFile = join(mkdtempSync(join(tmpdir(), "opened-")), "state", "opened.json");
  const { studio, root } = await setup({ openedFile });
  const before = JSON.parse((await http(`${studio.url}api/library`)).body);
  assert.equal(before.topics.find((t) => t.id === "redes").opened, 0, "never opened");
  const ok = await post(studio, "opened", { topic: "redes" });
  assert.equal(ok.status, 200);
  const after = JSON.parse((await http(`${studio.url}api/library`)).body);
  const opened = after.topics.find((t) => t.id === "redes").opened;
  assert.ok(opened > 0 && opened <= Date.now(), "the open time is reported");
  assert.deepEqual(JSON.parse(readFileSync(openedFile, "utf8")), { redes: opened });
  const unknown = await post(studio, "opened", { topic: "no-existe" });
  assert.equal(unknown.status, 404);
  const malformed = await post(studio, "opened", { topic: 3 });
  assert.equal(malformed.status, 400);
  assert.deepEqual(JSON.parse(readFileSync(openedFile, "utf8")), { redes: opened }, "a refused open stores nothing");
  assert.equal(existsSync(join(root, "opened.json")), false, "nothing is written in the vault");
  // A restarted studio keeps the order.
  open.splice(open.indexOf(studio), 1);
  await studio.close();
  const again = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: join(root, "fake-engine.sh"), openedFile });
  open.push(again);
  const kept = JSON.parse((await http(`${again.url}api/library`)).body);
  assert.equal(kept.topics.find((t) => t.id === "redes").opened, opened);
});

test("the panorama reaches the browser as one picture: plan, route and map", async () => {
  const { studio, root } = await setup();
  const topic = join(root, "redes");
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "Redes",
      parts: [
        { id: "p1", title: "Capas", slug: "Capas", subtema: "1.1", examplesPlanned: true, visualsPlanned: true },
        { id: "p2", title: "TCP", slug: "TCP", subtema: "1.2.1a", examplesPlanned: true, visualsPlanned: false },
      ],
    }),
  );
  writeFileSync(
    join(topic, "planificador.md"),
    ["---", "tema: Redes", "fecha: 2026-10-30", "diagnostico_puntaje: 2/5", "---", "", "# Ruta de redes", "", "## Resultado", "", "- **Puntaje global**: **2/5**.", "", "## Tabla de plan", "", "| Subtema | Qué sabes | Profundidad | Por qué |", "|---|---|---|---|", "| `1.1` | 1/1 | Desde su base | Falló d1 |", "| `1.2.1` | ⚪ No evaluado | Completo | No evaluado |", ""].join("\n"),
  );
  writeFileSync(
    join(topic, "mapa.mmd"),
    ["flowchart TD", '  subgraph M1 ["1.1 Capas"]', '    N1["1.1.1 Qué es una capa<br/>⚪ no evaluado"]:::neu --> N2["1.1.2 Encapsulado<br/>evaluado en d1"]:::neu', "  end", '  subgraph M2 ["1.2.1 Transporte"]', '    N1 --> N3["1.2.1.1 TCP frente a UDP<br/>⚪ no evaluado"]:::neu', "  end", "  classDef neu fill:#eceef1,stroke:#8b95a7,color:#3d4451;", ""].join("\n"),
  );

  const answer = await http(`${studio.url}api/panorama?topic=redes`);
  assert.equal(answer.status, 200);
  const panorama = JSON.parse(answer.body);
  assert.deepEqual(panorama.sources, { plan: true, planJson: true, map: true });
  assert.equal(panorama.topic.title, "Redes");
  assert.equal(panorama.plan.score, "2/5");
  assert.deepEqual(
    panorama.route.map((part) => [part.number, part.subtema, part.written, part.depth]),
    [
      [1, "1.1", true, "Desde su base"],
      [2, "1.2.1a", false, "Completo"],
    ],
  );
  const map = panorama.map.layout;
  assert.equal(map.nodes.length, 3);
  assert.equal(map.groups.length, 2);
  assert.equal(map.nodes.find((node) => node.id === "N3").part.id, "p2", "a concept points at the part the tutor wrote for its branch");
  assert.equal(map.nodes.find((node) => node.id === "N2").part.id, "p1");
  assert.equal((await http(`${studio.url}api/panorama?topic=nope`)).status, 404);
  assert.equal((await http(`${studio.url}api/panorama?topic=../etc`)).status, 404, "a topic id never leaves the root");
});

// A part saved for reading with no connection is one file: it names nothing of the
// bridge, reaches nothing, and runs in an origin of its own (docs/studio.md).
test("a written part is served as one isolated file that reads with no connection", async () => {
  const { studio, root } = await setup({ offlineCacheDir: mkdtempSync(join(tmpdir(), "offline-cdn-")) });
  writeFileSync(join(root, "redes", "explicaciones", "Parte 1 - Capas.md"), "# Parte 1 — Capas\n\nUna red en capas. Una fórmula: $a^2 + b^2$\n");
  const answer = await http(`${studio.url}api/offline?topic=redes&part=p1`);
  assert.equal(answer.status, 200, answer.body);
  const csp = answer.headers["content-security-policy"];
  assert.match(csp, /sandbox allow-scripts(;|$)/, "the copy runs in an opaque origin");
  assert.doesNotMatch(csp, /allow-same-origin/, "it never shares the studio's origin");
  assert.match(csp, /connect-src 'none'/, "and may fetch nothing");
  const bridge = new URL(JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body).url);
  const token = bridge.pathname.split("/")[1];
  assert.equal(answer.body.includes(token), false, "the bridge's run token never reaches the device");
  assert.equal(answer.body.includes(studio.url.split("/")[3]), false, "nor the studio's");
  assert.match(answer.body, /"offline":true/);
  assert.match(answer.body, /Una red en capas/);

  assert.equal((await http(`${studio.url}api/offline?topic=redes&part=p2`)).status, 404, "a part not written yet has nothing to save");
  assert.equal((await http(`${studio.url}api/offline?topic=../etc&part=p1`)).status, 404, "a topic never leaves the vault");
  assert.equal((await http(`${studio.url.replace(/[0-9a-f]{64}\/$/, `${"0".repeat(64)}/`)}api/offline?topic=redes&part=p1`)).status, 404, "the route needs the studio's token");
});

test("the shell paints the remembered theme before the studio script runs", async () => {
  const { studio } = await setup();
  const shell = await http(studio.url);
  assert.equal(shell.status, 200);
  const boot = shell.body.indexOf("/kit/theme.js");
  assert.ok(boot > 0, "the shell loads the theme bootstrap");
  assert.ok(boot < shell.body.indexOf("/studio.js"), "and it runs before the studio paints");
  assert.equal((await http(`${studio.url}kit/theme.js`)).status, 200, "the bootstrap is served under the studio's token");
});

test("a suggestion is stored, moves one preference level and never stacks", async () => {
  const { studio, root } = await setup();
  const first = await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["faltan-ejemplos"], texto: "El ejemplo del TCP no me cuadró" });
  assert.equal(first.status, 200, first.body);
  const saved = JSON.parse(stored(root, "sugerencias"));
  assert.equal(saved.version, 1);
  assert.equal(saved.entradas.length, 1);
  assert.equal(saved.entradas[0].origen, "sugerencia");
  assert.deepEqual(saved.entradas[0].motivos, ["faltan-ejemplos"]);

  const preferences = JSON.parse((await http(`${studio.url}api/preferences`)).body);
  assert.equal(preferences.aspectos.find((a) => a.id === "ejemplos").nivel, "más", "the chip moved the aspect up one level");

  // Asking for the same thing again keeps the aspect where the learner put it.
  await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["faltan-ejemplos"] });
  const again = JSON.parse((await http(`${studio.url}api/preferences`)).body);
  assert.equal(again.aspectos.find((a) => a.id === "ejemplos").nivel, "más");

  const listed = await http(`${studio.url}api/sugerencias?tema=redes&parte=p1`);
  assert.equal(listed.status, 200);
  const view = JSON.parse(listed.body);
  assert.equal(view.entradas.length, 2);
  assert.ok(view.motivos.some((m) => m.id === "faltan-ejemplos"), "the catalogue travels with the answers");
  assert.ok(view.directrices.some((line) => line.includes("El ejemplo del TCP no me cuadró")));
});

test("a suggestion needs a reason or words, and cannot replace the store it cannot read", async () => {
  const { studio, root } = await setup();
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1" })).status, 400, "an empty suggestion asks for nothing");
  assert.equal((await post(studio, "api/sugerencias", { tema: "../etc", parte: "p1", texto: "x" })).status, 400, "a topic never leaves the vault");
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["no-existe"], texto: "x" })).status, 400);
  assert.equal(stored(root, "sugerencias"), undefined, "a rejected suggestion writes nothing");

  // A store that cannot be parsed is kept aside, never replaced unseen.
  writeDoc(root, "sugerencias", "{ esto no es json");
  const seen = await http(`${studio.url}api/sugerencias`);
  assert.equal(seen.status, 200);
  assert.deepEqual(JSON.parse(seen.body).entradas, []);
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", texto: "sigue aquí" })).status, 200);
  const kept = readdirSync(root).filter((name) => name.startsWith("sugerencias.corrupta-"));
  assert.equal(kept.length, 1, "the unreadable store is kept aside");
  assert.equal(readFileSync(join(root, kept[0]), "utf8"), "{ esto no es json");
});

test("regenerating backs the part up, keeps its video and the plan, and asks for it again", async () => {
  const { studio, root, received } = await setup();
  const topic = join(root, "redes");
  const page = join(topic, "explicaciones", "Parte 1 - Capas.html");
  const quiz = join(topic, "mini-quiz", "p1.json");
  const video = join(topic, "explicaciones", "adjuntos", "Parte 1 - Capas.mp4");
  mkdirSync(dirname(quiz), { recursive: true });
  mkdirSync(dirname(video), { recursive: true });
  writeFileSync(page, "<html><body>la versión vieja</body></html>");
  writeFileSync(quiz, JSON.stringify({ questions: [] }));
  writeFileSync(video, "video");
  const plan = readFileSync(join(topic, "plan.json"), "utf8");

  const answer = await post(studio, "api/regenerar", { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "más corto, por favor" });
  assert.equal(answer.status, 200, answer.body);
  const result = JSON.parse(answer.body);
  assert.match(result.prompt, /Regenera Parte 1 «Capas» de Redes/);
  assert.match(result.prompt, /Demasiado texto/, "the reason reaches the tutor in the learner's words");
  assert.match(result.prompt, /más corto, por favor/);
  assert.match(result.prompt, /Conserva el video y los adjuntos/);

  assert.equal(existsSync(page), false, "the old page left the topic");
  assert.equal(existsSync(quiz), false);
  assert.equal(existsSync(video), true, "the video stays: regeneration keeps it");
  assert.equal(readFileSync(join(topic, "plan.json"), "utf8"), plan, "the plan is untouched");

  const trash = join(root, result.trash);
  // Vault-relative paths, exactly as a deletion keeps them.
  assert.ok(existsSync(join(trash, "redes", "explicaciones", "Parte 1 - Capas.html")));
  assert.ok(existsSync(join(trash, "redes", "explicaciones", "Parte 1 - Capas.md")));
  assert.ok(existsSync(join(trash, "redes", "mini-quiz", "p1.json")));
  const manifest = JSON.parse(readFileSync(join(trash, "papelera.json"), "utf8"));
  assert.equal(manifest.kind, "regeneracion");
  assert.equal(manifest.moved.length, 3);
  const sent = received().find((line) => line.type === "prompt").message;
  assert.ok(sent.startsWith(result.prompt), "the tutor receives exactly that prompt");
  assert.match(sent, /Lecciones del alumno \(aplícalas siempre\)/, "and the standing lessons after it");
});

// ---- the learner's lessons reach every turn of every topic -----------------

/** A second, enrolled topic: a lesson recorded on one topic has to reach a turn on this one. */
function secondTopic(root) {
  const topic = join(root, "algebra");
  mkdirSync(join(topic, ".learning"), { recursive: true });
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "Álgebra", parts: [{ id: "p1", title: "Ecuaciones", slug: "Ecuaciones" }] }));
  writeFileSync(join(topic, ".learning", "state.json"), "{}\n");
  return topic;
}

/** The rule a «Faltan visuales» review leaves behind, as the studio's own block writes it. */
const LECCION_VISUALES = "Dibuja la cosa misma, no una caja con su nombre: la curva, el icono, el estado que cambia";

for (const runtime of ["pi", "agy"]) {
  test(`a general lesson recorded on one topic reaches a turn on another: ${runtime}`, async () => {
    const tutor = runtime === "agy" ? await agyStudio({ root: { status: CLEARED_STAGE } }) : await piStudio({ root: { status: CLEARED_STAGE } });
    const { studio, root, stream } = tutor;
    try {
      secondTopic(root);
      // One lesson about how explanations are made, and one about a single passage of one part.
      assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["faltan-visuales"] })).status, 200);
      assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["no-entendi"], texto: "no entendí el ejemplo del charco" })).status, 200);

      assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "algebra" })).status, 200);
      const turnText = () => (runtime === "agy" ? agyTurns(tutor.turns).at(-1).join(" ") : tutor.prompts().at(-1).message);
      await until(() => (runtime === "agy" ? agyTurns(tutor.turns).length === 1 : tutor.prompts().length === 1));
      const sent = turnText();
      // Antigravity's turn is the whole argv, so only Pi's prompt starts with the learner's words.
      const start = runtime === "agy" ? "" : "^";
      assert.match(sent, new RegExp(`${start}Escribe la Parte 1\\n\\n\\[Lecciones del alumno \\(aplícalas siempre\\)\\n- `), "the lessons follow the learner's words");
      assert.ok(sent.includes(LECCION_VISUALES), "the lesson of another topic reaches this turn");
      assert.doesNotMatch(sent, /charco/, "a part-specific review stays with its part");

      if (runtime === "pi") {
        // The block is the studio's: the chat serves the learner's own words, never the rules.
        const said = await stream.next("user");
        assert.equal(said.text, "Escribe la Parte 1");
        const dialog = await stream.next("dialog");
        assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
      }
      await until(() => stream.events.filter((event) => event.name === "state").at(-1)?.data.busy === false);
    } finally {
      stream.close();
      if (runtime === "agy") delete process.env.FAKE_AGY_TURNS;
    }
  });
}

test("the regenerate prompt still carries the part-specific reviews of that part", async () => {
  const { studio, received } = await setup();
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["no-entendi"], texto: "no entendí el ejemplo del charco" })).status, 200);
  const answer = await post(studio, "api/regenerar", { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "más corto" });
  assert.equal(answer.status, 200, answer.body);
  const { prompt } = JSON.parse(answer.body);
  assert.match(prompt, /charco/, "the part's own review reaches its regeneration");
  // And the turn that regeneration starts carries the standing lessons too.
  const sent = received().find((line) => line.type === "prompt").message;
  assert.ok(sent.startsWith(prompt));
  assert.match(sent, /Lecciones del alumno \(aplícalas siempre\)/);
  assert.ok(sent.includes(LECCION_VISUALES), "the seed lessons apply with an empty store");
});

test("the context a writing prompt carries has preferences, weak categories and the learner's words", async () => {
  const { studio } = await setup();
  await post(studio, "api/telemetry", {
    entry: { punto: "1. Capas", tema: "redes", categoria: "matematicas", pregunta: "¿Cuántas subredes?", respuesta_alumno: "A", respuesta_correcta: "B", ok: false, por_que: "Confunde la máscara" },
  });
  await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["matematicas-confusas"], texto: "Las cuentas de la máscara me pierden" });

  const answer = await http(`${studio.url}api/contexto?tema=redes`);
  assert.equal(answer.status, 200);
  const { texto } = JSON.parse(answer.body);
  assert.match(texto, /Preferencias:/);
  assert.match(texto, /matematicas=/);
  assert.match(texto, /dónde más falla|Donde más falla/i);
  assert.match(texto, /matematicas/);
  assert.match(texto, /Las cuentas de la máscara me pierden/);
});

test("the studio dictates through its own proxy and refuses when no transcriber is configured", async () => {
  const { studio } = await setup();
  const answer = await http(`${studio.url}api/transcribe`, { method: "POST", headers: { origin: new URL(studio.url).origin, "content-type": "audio/webm" }, body: "audio" });
  assert.equal(answer.status, 503);
  assert.match(answer.body, /no está configurada/i);
});

test("a store with no suggestions is not a broken store", async () => {
  const { studio, root } = await setup();
  writeDoc(root, "sugerencias", JSON.stringify({ version: 1, actualizado: "", entradas: [] }));

  const response = await http(`${studio.url}api/sugerencias`, {
    method: "POST",
    headers: { origin: new URL(studio.url).origin, "content-type": "application/json" },
    body: JSON.stringify({ tema: "redes", parte: "p1", texto: "una idea" }),
  });
  assert.equal(response.status, 200, response.body);
  assert.deepEqual(
    readdirSync(root).filter((name) => name.startsWith("sugerencias.corrupta-")),
    [],
    "a store that parses with no entries was kept aside as corrupt",
  );
  assert.equal(JSON.parse(stored(root, "sugerencias")).entradas.length, 1);
});

test("an entry the store cannot read is never thrown away", async () => {
  const { studio, root } = await setup();
  const good = { id: "s-1", tema: "redes", parte: "p1", motivos: [], texto: "buena", origen: "sugerencia", timestamp: "2026-01-01T00:00:00Z" };
  const unreadable = { id: 7, texto: "no la entiendo" };
  writeDoc(root, "sugerencias", JSON.stringify({ version: 1, actualizado: "", entradas: [good, unreadable] }));

  const response = await http(`${studio.url}api/sugerencias`, {
    method: "POST",
    headers: { origin: new URL(studio.url).origin, "content-type": "application/json" },
    body: JSON.stringify({ tema: "redes", parte: "p1", texto: "otra idea" }),
  });
  assert.equal(response.status, 200, response.body);

  // Keeping the good entries and dropping the odd one is fine; destroying the learner's
  // words without leaving them somewhere is not.
  const preserved =
    readdirSync(root).some((name) => name.startsWith("sugerencias.corrupta-") && readFileSync(join(root, name), "utf8").includes("no la entiendo")) ||
    JSON.parse(stored(root, "sugerencias")).entradas.some((e) => e.texto === "no la entiendo");
  assert.ok(preserved, "the unreadable entry vanished without a copy");
});

test("recording a suggestion never half-succeeds", async () => {
  const { studio, root } = await setup();
  writeDoc(root, "preferencias", "{ roto");

  const response = await http(`${studio.url}api/sugerencias`, {
    method: "POST",
    headers: { origin: new URL(studio.url).origin, "content-type": "application/json" },
    body: JSON.stringify({ tema: "redes", parte: "p1", motivos: ["faltan-ejemplos"], texto: "mas ejemplos de capas" }),
  });
  const kept = stored(root, "sugerencias");
  const count = kept === undefined ? 0 : JSON.parse(kept).entradas.length;

  // Either the whole request failed (nothing stored) or it succeeded (exactly one entry):
  // a stored entry behind an error makes the learner retry and write it twice.
  if (response.status === 200) assert.equal(count, 1, "the studio said yes but the entry is not there");
  else assert.equal(count, 0, `the studio answered ${response.status} after storing the entry`);
});

test("a regeneration that is refused never moves the part", async () => {
  const { studio, root, received } = await setup();
  const planFile = join(root, "redes", "plan.json");
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  // A plan title big enough that its own prompt cannot be sent.
  plan.parts[0].title = "T".repeat(40000);
  writeFileSync(planFile, JSON.stringify(plan));
  const page = join(root, "redes", "explicaciones", "Parte 1 - Capas.html");
  writeFileSync(page, "<p>la version buena</p>");

  const response = await http(`${studio.url}api/regenerar`, {
    method: "POST",
    headers: { origin: new URL(studio.url).origin, "content-type": "application/json" },
    body: JSON.stringify({ tema: "redes", parte: "p1", motivos: ["demasiado-texto"] }),
  });

  assert.ok(response.status >= 400, `the studio accepted a prompt it cannot send (${response.status})`);
  assert.equal(existsSync(page), true, "a refused regeneration took the part out of the library");
  assert.equal(existsSync(join(root, ".papelera")), false, "a refused regeneration left a backup behind");
  assert.equal(received().some((line) => line.type === "prompt"), false, "the tutor was asked to rewrite a part that failed");
});


test("disabled tutor cannot start or restart, while the reader remains available", async () => {
  const { studio, root, received } = await setup({ agentDisabled: true });
  const page = await http(`${studio.url}api/view?topic=redes&part=p1`);
  assert.equal(page.status, 200, page.body);
  const prompt = await post(studio, "prompt", { text: "Hello" });
  assert.equal(prompt.status, 503);
  assert.equal(JSON.parse(prompt.body).error, "El tutor está desactivado.");
  const restart = await post(studio, "restart", {});
  assert.equal(restart.status, 503);
  assert.equal(JSON.parse(restart.body).error, "El tutor está desactivado.");
  const part = join(root, "redes", "explicaciones", "Parte 1 - Capas.md");
  const before = readFileSync(part, "utf8");
  const regenerate = await post(studio, "api/regenerar", { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "shorter" });
  assert.equal(regenerate.status, 503);
  assert.equal(JSON.parse(regenerate.body).error, "El tutor está desactivado.");
  assert.equal(readFileSync(part, "utf8"), before);
  assert.deepEqual(received(), []);
});
// ---- conversations ---------------------------------------------------------

test("the conversation the studio already had becomes the first chat", async () => {
  const { studio } = await setup();
  const chats = JSON.parse((await http(`${studio.url}api/chats`)).body);
  assert.equal(chats.version, 1);
  assert.equal(chats.chats.length, 1);
  assert.equal(chats.chats[0].nombre, "Chat general");
  assert.equal(chats.activo, chats.chats[0].id);
  assert.match(chats.chats[0].piSession, /fake-session-0\.jsonl$/);
  assert.deepEqual(chats.chats[0].contexto, { tokens: 60000, ventana: 200000, porcentaje: 30 });
});

test("a new chat starts its own session and the list keeps both", async () => {
  const { studio, received } = await setup();
  const before = JSON.parse((await http(`${studio.url}api/chats`)).body);

  const created = await post(studio, "api/chats", { nombre: "  dudas de MDP  " });
  assert.equal(created.status, 200, created.body);
  const after = JSON.parse(created.body);

  assert.deepEqual(after.chats.map((c) => c.nombre), ["Chat general", "dudas de MDP"]);
  const chat = after.chats.find((c) => c.id === after.activo);
  assert.equal(chat.ambito, null, "a chat the learner names is not bound to a part");
  assert.notEqual(chat.piSession, before.chats[0].piSession, "a new chat is a new session file");
  assert.ok(received().some((c) => c.type === "new_session"));
});

test("opening a chat switches Pi to its session and reloads the thread", async () => {
  const { studio, received } = await setup();
  const general = JSON.parse((await http(`${studio.url}api/chats`)).body).chats[0];
  await post(studio, "api/chats", { nombre: "otra" });

  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  const opened = await post(studio, "api/chats/abrir", { id: general.id });
  assert.equal(opened.status, 200, opened.body);
  assert.equal(JSON.parse(opened.body).activo, general.id);
  assert.equal(received().find((c) => c.type === "switch_session").sessionPath, general.piSession);
  assert.ok(await stream.next("history"), "the browser is handed the thread it just opened");
  stream.close();
});

test("renaming a chat updates the list and Pi's own name", async () => {
  const { studio, received } = await setup();
  const chats = JSON.parse((await http(`${studio.url}api/chats`)).body);

  const renamed = await post(studio, "api/chats/renombrar", { id: chats.activo, nombre: "repaso examen" });
  assert.equal(renamed.status, 200, renamed.body);
  assert.equal(JSON.parse(renamed.body).chats[0].nombre, "repaso examen");
  assert.equal(received().find((c) => c.type === "set_session_name").name, "repaso examen");

  const refused = await post(studio, "api/chats/renombrar", { id: chats.activo, nombre: "   " });
  assert.equal(refused.status, 400);
  assert.equal((await post(studio, "api/chats/renombrar", { id: "nope", nombre: "x" })).status, 404);
});

test("the active chat cannot be deleted, and another one can", async () => {
  const { studio } = await setup();
  const general = JSON.parse((await http(`${studio.url}api/chats`)).body).chats[0];
  await post(studio, "api/chats", { nombre: "otra" });
  const active = JSON.parse((await http(`${studio.url}api/chats`)).body).activo;

  assert.equal((await post(studio, "api/chats/borrar", { id: active })).status, 409);

  const removed = await post(studio, "api/chats/borrar", { id: general.id });
  assert.equal(removed.status, 200, removed.body);
  assert.deepEqual(JSON.parse(removed.body).chats.map((c) => c.nombre), ["otra"]);
});

test("deleting a chat removes Pi's session file, and nothing outside Pi's store", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-sessions-"));
  process.env.FAKE_PI_SESSION_DIR = dir;
  process.env.PI_CODING_AGENT_SESSION_DIR = dir;
  try {
    const { studio } = await setup();
    const general = JSON.parse((await http(`${studio.url}api/chats`)).body).chats[0];
    assert.ok(existsSync(general.piSession), "the fake Pi created the session file");

    await post(studio, "api/chats", { nombre: "otra" });
    assert.equal((await post(studio, "api/chats/borrar", { id: general.id })).status, 200);
    assert.equal(existsSync(general.piSession), false);
  } finally {
    delete process.env.FAKE_PI_SESSION_DIR;
    delete process.env.PI_CODING_AGENT_SESSION_DIR;
  }
});

test("a chat cannot be opened while the tutor is busy", async () => {
  const { studio } = await setup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await post(studio, "prompt", { text: "hola" });
  await stream.next("state", (s) => s.busy);

  const refused = await post(studio, "api/chats/abrir", { ambito: "parte:redes/p2" });
  assert.equal(refused.status, 409);
  assert.match(JSON.parse(refused.body).error, /El tutor está trabajando/);
  stream.close();
});

test("opening a part creates its chat once and comes back to it", async () => {
  const { studio } = await setup();
  const first = await post(studio, "api/chats/abrir", { ambito: "parte:redes/p2", nombre: "Parte 2 · TCP" });
  assert.equal(first.status, 200, first.body);
  const anchored = JSON.parse(first.body).chats.find((c) => c.ambito === "parte:redes/p2");
  assert.equal(anchored.nombre, "Parte 2 · TCP");

  await post(studio, "api/chats", { nombre: "otra" });
  const again = JSON.parse((await post(studio, "api/chats/abrir", { ambito: "parte:redes/p2" })).body);
  assert.equal(again.activo, anchored.id, "the same part comes back to the same chat");
  assert.equal(again.chats.filter((c) => c.ambito === "parte:redes/p2").length, 1);

  assert.equal((await post(studio, "api/chats/abrir", { ambito: "../escape" })).status, 400);
});

test("Antigravity records its conversation on the chat, and a new chat starts without one", async () => {
  const argv = join(mkdtempSync(join(tmpdir(), "agy-argv-")), "argv.log");
  process.env.FAKE_AGY_ARGV = argv;
  try {
    const { studio } = await setup({ agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")] });
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);

    // Each turn is one `-p ...` argv, and the prompt itself spans lines.
    const turns = () => (existsSync(argv) ? readFileSync(argv, "utf8").split(/\n(?=-p )/).filter((turn) => turn.trim()) : []);

    // Every turn is retried until the studio accepts it: it refuses a prompt while it is deciding
    // what the last turn owes the engine, which is a window no fixed sleep can bound.
    await untilAsync(async () => (await post(studio, "prompt", { text: "hola" })).status === 200);
    await untilAsync(async () => {
      const chats = JSON.parse((await http(`${studio.url}api/chats`)).body);
      return chats.chats.find((c) => c.id === chats.activo).agyConversation === "test-conversation";
    });
    const chats = JSON.parse((await http(`${studio.url}api/chats`)).body);
    assert.equal(chats.chats.find((c) => c.id === chats.activo).agyConversation, "test-conversation");

    // The same chat continues its own conversation.
    await untilAsync(async () => (await post(studio, "prompt", { text: "sigo" })).status === 200);
    await until(() => turns().length === 2);
    assert.equal(turns().length, 2);
    assert.ok(turns()[1].includes("--conversation test-conversation"), "the next turn continues the chat's conversation");

    // A new chat is a new conversation, not a silent carry-over. The studio refuses a switch and a
    // new turn while the tutor is still working, so both are retried until it accepts them.
    await untilAsync(async () => (await post(studio, "api/chats", { nombre: "otra" })).status === 200);
    await untilAsync(async () => (await post(studio, "prompt", { text: "otra vez" })).status === 200);
    await until(() => turns().length === 3);
    assert.equal(turns().length, 3);
    assert.ok(!turns()[2].includes("--conversation"), "a new chat starts its own conversation");
  } finally {
    delete process.env.FAKE_AGY_ARGV;
  }
});

test("exporting a chat answers with the file, and only for the chat that is open", async () => {
  const { studio, root } = await setup();
  const general = JSON.parse((await http(`${studio.url}api/chats`)).body).chats[0];

  const exported = await post(studio, "api/chats/exportar", { id: general.id });
  assert.equal(exported.status, 200, exported.body);
  const path = JSON.parse(exported.body).path;
  assert.match(path, /exports\/Chat-general-[\w-]+\.html$/);
  assert.ok(existsSync(path), "the export was really written");
  // Pi writes into its working directory, which is the vault: the studio names it outside.
  assert.equal(path.startsWith(root), false, "an export never lands in the vault");

  await post(studio, "api/chats", { nombre: "otra" });
  const refused = await post(studio, "api/chats/exportar", { id: general.id });
  assert.equal(refused.status, 409);
  assert.match(JSON.parse(refused.body).error, /Abre la conversación/);
});

test('the studio refuses to start without a data root', async () => {
  await assert.rejects(() => startStudio({}), /LEARNING_ROOT is not set/);
});

test("the feedback summary groups every suggestion by topic, part and reason", async () => {
  const { studio } = await setup();
  const empty = await http(`${studio.url}api/sugerencias/resumen`);
  assert.equal(empty.status, 200);
  assert.deepEqual(JSON.parse(empty.body), { total: 0, motivos: [], temas: [] });

  await post(studio, "api/sugerencias", { tema: "redes", parte: "p2", motivos: ["faltan-visuales"], texto: "más diagramas" });
  await post(studio, "api/sugerencias", { tema: "redes", parte: "p10", motivos: ["faltan-visuales", "sin-paso-a-paso"], texto: "" });
  await post(studio, "api/sugerencias", { tema: "algebra", parte: "p1", motivos: [], texto: "la fórmula sin leyenda" });
  await post(studio, "api/sugerencias", { tema: "redes", parte: "p2", motivos: ["faltan-ejemplos"], texto: "otro ejemplo" });

  const answer = await http(`${studio.url}api/sugerencias/resumen`);
  assert.equal(answer.status, 200);
  const resumen = JSON.parse(answer.body);
  assert.equal(resumen.total, 4);
  assert.deepEqual(resumen.motivos, [
    { id: "faltan-visuales", texto: "Faltan visuales", n: 2 },
    { id: "faltan-ejemplos", texto: "Faltan ejemplos", n: 1 },
    { id: "sin-paso-a-paso", texto: "Sin paso a paso", n: 1 },
  ]);
  assert.deepEqual(resumen.temas.map((t) => [t.tema, t.total, t.partes.map((p) => [p.parte, p.total])]), [
    ["algebra", 1, [["p1", 1]]],
    ["redes", 3, [["p2", 2], ["p10", 1]]],
  ]);
  const p2 = resumen.temas[1].partes[0];
  assert.deepEqual(p2.motivos, [
    { id: "faltan-ejemplos", texto: "Faltan ejemplos", n: 1 },
    { id: "faltan-visuales", texto: "Faltan visuales", n: 1 },
  ]);
  assert.deepEqual(p2.entradas.map((e) => e.texto), ["otro ejemplo", "más diagramas"], "newest first");
  assert.deepEqual(Object.keys(p2.entradas[0]).sort(), ["id", "motivos", "origen", "texto", "timestamp"]);
});

/** A home whose tutor context is the repo's own, as `deploy/vps/link-tutor-context.sh` leaves it. */
function linkedHome() {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const repo = join(HERE, "..");
  for (const runtime of [".claude", ".agents"]) {
    mkdirSync(join(home, runtime, "skills"), { recursive: true });
    symlinkSync(join(repo, "skills", "explicacion-interactiva"), join(home, runtime, "skills", "explicacion-interactiva"), "dir");
  }
  return { home, repo };
}

/** The drift the live VPS had: the link the deploy owns points at another standard. */
function drift(home, runtime) {
  const decoy = join(home, "skills-registry", "explicacion-interactiva");
  mkdirSync(decoy, { recursive: true });
  const link = join(home, runtime, "skills", "explicacion-interactiva");
  rmSync(link);
  symlinkSync(decoy, link, "dir");
  return link;
}

test("a drifted tutor context refuses the Pi turn and names the path to fix", async () => {
  const { home, repo } = linkedHome();
  const { studio, root, received } = await setup({ contextHome: home, skipContextCheck: false });
  symlinkSync(join(repo, "deploy", "vps", "learnings", "AGENTS.md"), join(root, "AGENTS.md"));
  const prompts = () => received().filter((command) => command.type === "prompt");
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    const aligned = await post(studio, "prompt", { text: "Hola" });
    assert.equal(aligned.status, 200, aligned.body);
    assert.equal(prompts().length, 1, "the aligned turn reached Pi");
    // One turn at a time: the aligned turn ends before the next one can meet the drift check.
    assert.equal((await post(studio, "abort", {})).status, 200);
    await stream.next("state", (s) => s.busy === false);

    const link = drift(home, ".claude");
    const refused = await post(studio, "prompt", { text: "Otra" });
    assert.equal(refused.status, 409, refused.body);
    const message = JSON.parse(refused.body).error;
    assert.match(message, new RegExp(`${link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(message, /deploy\/vps\/update\.sh/);
    assert.equal((await stream.next("error")).message, message, "the chat says the same thing");
    assert.equal(prompts().length, 1, "the refused turn never reached Pi");
  } finally { stream.close(); }
});

test("a drifted tutor context refuses the Antigravity turn and starts nothing", async () => {
  const { home, repo } = linkedHome();
  const { studio, root } = await setup({
    agyCommand: [process.execPath, join(HERE, "testdata", "fake-agy.mjs")],
    contextHome: home,
    skipContextCheck: false,
  });
  symlinkSync(join(repo, "deploy", "vps", "learnings", "AGENTS.md"), join(root, "AGENTS.md"));
  const argv = join(root, "agy-argv.log");
  process.env.FAKE_AGY_ARGV = argv;
  // One `-p` line per turn; the prompt itself carries newlines, so only its first line counts.
  const turns = () => (existsSync(argv) ? readFileSync(argv, "utf8").split("\n").filter((line) => line.startsWith("-p ")) : []);
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Hola" })).status, 200);
    await stream.next("assistant_end");
    assert.equal(turns().length, 1, "the aligned turn reached Antigravity");

    const link = drift(home, ".agents");
    const refused = await post(studio, "prompt", { text: "Otra" });
    assert.equal(refused.status, 409, refused.body);
    assert.match(JSON.parse(refused.body).error, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match((await stream.next("error")).message, /deploy\/vps\/update\.sh/);
    assert.equal(turns().length, 1, "the refused turn never started Antigravity");
  } finally { stream.close(); }
});

// ---- the turn boundary: the idle marker and the conversation copy ------------
/**
 * A studio whose state directory the test owns: the idle marker a deploy reads
 * and the conversation copy a restart comes back to live next to `opened.json`.
 */
async function stateSetup(options = {}) {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const stateDir = mkdtempSync(join(tmpdir(), "studio-state-"));
  const studio = await startStudio({
    root,
    piCommand: [process.execPath, FAKE_PI],
    enginePath: engine,
    openedFile: join(stateDir, "opened.json"),
    ...options,
  });
  open.push(studio);
  return { studio, root, engine, stateDir, busy: join(stateDir, "busy.json"), snapshot: join(stateDir, "conversacion.json") };
}

test("a held turn is readable as busy and the conversation is written as it happens", async () => {
  const { studio, busy, snapshot } = await stateSetup();
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "prompt", { text: "Responde el diagnóstico" })).status, 200);
    await stream.next("user");

    const mark = JSON.parse(readFileSync(busy, "utf8"));
    assert.equal(mark.busy, true, "a deploy can read the turn without a token");
    assert.equal(mark.pid, process.pid, "the marker names the process that holds it");
    const held = JSON.parse(readFileSync(snapshot, "utf8"));
    assert.deepEqual(held.messages.slice(-1), [{ role: "user", text: "Responde el diagnóstico" }], "the learner's message is on disk while the turn runs");
    assert.ok(held.messages.length >= 3, "the copy keeps the thread the runtime served at boot");
    assert.ok(held.interrupted, "a turn in flight is marked, so a process that dies leaves it marked");

    assert.equal((await post(studio, "dialog", { id: "d1", value: "Universitario" })).status, 200);
    await stream.next("state", (s) => s.busy === false);
    assert.equal(existsSync(busy), false, "a finished turn leaves no marker");
    const ended = JSON.parse(readFileSync(snapshot, "utf8"));
    assert.deepEqual(ended.messages.slice(-2).map((m) => m.role), ["user", "assistant"], "the answer is on disk too");
    assert.equal(ended.interrupted, null, "a turn that ended is not interrupted");
  } finally { stream.close(); }
});

test("a turn a restart interrupted comes back with its topic and the resume action", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "studio-state-"));
  const chatId = "abc123abc123";
  writeFileSync(join(stateDir, "chats.json"), JSON.stringify({
    version: 1,
    activo: chatId,
    chats: [{ id: chatId, nombre: "Chat general", ambito: null, piSession: null, agyConversation: null, creado: 1, usado: 1, contexto: null }],
  }));
  writeFileSync(join(stateDir, "conversacion.json"), JSON.stringify({
    version: 1,
    chat: chatId,
    messages: [{ role: "user", text: "Responde el diagnóstico" }],
    interrupted: { topic: "redes", at: 1 },
  }));
  // The runtime lost its session: its history is empty and the studio's copy is all there is.
  process.env.FAKE_PI_HISTORY = "1";
  const { studio } = await stateSetup({ openedFile: join(stateDir, "opened.json") });
  delete process.env.FAKE_PI_HISTORY;
  const stream = sse(`${studio.url}events`);
  try {
    const history = await stream.next("history");
    assert.deepEqual(history.interrupted, { topic: "redes", title: "Redes" }, "the chat says the turn was interrupted");
    assert.deepEqual(history.messages, [{ role: "user", text: "Responde el diagnóstico" }], "the conversation is not lost with the runtime session");
  } finally { stream.close(); }
});

test("closing the studio, as SIGTERM does, writes the conversation and the turn it held", async () => {
  const { studio, snapshot } = await stateSetup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1" })).status, 200);
  await stream.next("user");
  // The CLI's SIGTERM handler is `studio.close()`: the process goes away mid-turn.
  await studio.close();
  stream.close();
  const doc = JSON.parse(readFileSync(snapshot, "utf8"));
  assert.deepEqual(doc.messages.slice(-1), [{ role: "user", text: "Escribe la Parte 1" }], "the turn reached the copy before the process went away");
  assert.ok(doc.interrupted, "the turn it was holding is marked as interrupted");
});

// #254: a deploy ends the turn it is waiting on through the studio's own abort, and the first page after the
// restart names the interrupted topic once: a later page, or a later restart, does not repeat it.
test("a deploy's abort leaves one update notice for the first page after the restart, and never repeats it", async () => {
  const { studio, root, engine, stateDir, busy, snapshot } = await stateSetup();
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await stream.next("state");
  assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
  await stream.next("user");
  assert.equal(existsSync(busy), true, "the turn is held while the deploy asks for it to end");

  assert.equal((await post(studio, "abort", { cause: "update" })).status, 200);
  await stream.next("state", (s) => s.busy === false);
  stream.close();
  assert.equal(JSON.parse(readFileSync(snapshot, "utf8")).interrupted?.cause, "update", "the abort is written as an update notice");
  await studio.close();

  // The restart: the process that wrote the copy is gone, so the new studio comes back to it.
  const copy = JSON.parse(readFileSync(snapshot, "utf8"));
  writeFileSync(snapshot, JSON.stringify({ ...copy, pid: 2 ** 22 + 12345 }));
  const restarted = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, openedFile: join(stateDir, "opened.json") });
  open.push(restarted);
  const first = sse(`${restarted.url}events`);
  try {
    const shown = await first.next("history");
    assert.deepEqual(shown.interrupted, { topic: "redes", title: "Redes", cause: "update" }, "the first page after the restart says the studio was updated and names the topic");
  } finally { first.close(); }
  const later = sse(`${restarted.url}events`);
  try {
    assert.equal((await later.next("history")).interrupted, null, "a later page does not repeat the notice");
  } finally { later.close(); }
});

// #254: the learner's page draws the update notice from the first history it is sent, and a reload finds it spent.
test("the first page after an update restart draws the update notice once", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), "studio-state-"));
  const chatId = "abc123abc123";
  writeFileSync(join(stateDir, "chats.json"), JSON.stringify({
    version: 1,
    activo: chatId,
    chats: [{ id: chatId, nombre: "Chat general", ambito: null, piSession: null, agyConversation: null, creado: 1, usado: 1, contexto: null }],
  }));
  writeFileSync(join(stateDir, "conversacion.json"), JSON.stringify({
    version: 1,
    chat: chatId,
    messages: [{ role: "user", text: "Responde el diagnóstico" }],
    interrupted: { topic: "redes", at: 1, cause: "update" },
  }));
  // The runtime lost its session, so the studio's copy of the thread is what the page shows.
  process.env.FAKE_PI_HISTORY = "1";
  const { studio } = await stateSetup({ openedFile: join(stateDir, "opened.json") });
  delete process.env.FAKE_PI_HISTORY;

  const instance = await (browser.chromium ?? browser.default).launch();
  t.after(() => instance.close());
  const page = await instance.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  // The learner reads the thread in the chat drawer, so the notice is read there too.
  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  await page.locator(".tutor-pill").click();
  const card = page.locator(".next-cta.interrupted");
  await card.waitFor({ timeout: 20000 });
  assert.equal(await card.count(), 1, "the notice is drawn once");
  assert.match(await card.locator("p").innerText(), /Actualizamos el estudio.*Redes.*vuelve a enviarla/, "the notice says the studio was updated and names the topic");

  // A reload is a new page; the first one already spent the notice. The user message is drawn by the same
  // history handler as the card, so once it shows, the card is final.
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".tutor-pill").click();
  await page.locator(".msg.user").first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".next-cta.interrupted").count(), 0, "a later page does not draw the notice again");
});

// #248: the method is the learner's question on the topic page, and the engine cannot tell who
// called its method command (the page and the tutor run the same CLI). The studio keeps the page's
// own choices, so a turn that recorded one itself is refused instead of taught.
const TUTOR_CHOSE_METHOD = { status: "accepted", stage: "planning", nextStage: "planning", method: "pareto", checks: [{ id: "plan", status: "PASS", reason: "plan written" }] };

test("a turn that records the method itself is refused, because the method is the page's question", async () => {
  const { studio, stream } = await agyStudio({ root: { statuses: [TUTOR_CHOSE_METHOD] } });
  try {
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1", tema: "redes" })).status, 200);
    const error = await stream.next("error", (data) => /método/.test(data.message));
    assert.match(error.message, /el método se elige en la página del tema/);
    assert.match(error.message, /pareto/, "the learner is told which method the tutor picked");
    await until(() => settleIdle(stream));
    assert.equal(stream.events.some((event) => event.name === "notice" && /método/.test(event.data.message)), false, "the refusal is an error, not a passing notice");
  } finally {
    stream.close();
    delete process.env.FAKE_AGY_TURNS;
  }
});

test("the method the page recorded is the learner's, so the same report is not refused", async () => {
  const { studio, stream } = await piStudio({ root: { statuses: [METHOD_RECORDED, METHOD_RECORDED] } });
  try {
    assert.equal((await post(studio, "api/metodo", { tema: "redes", metodo: "pareto" })).status, 200);
    // The turn the page started runs to its end: the fake tutor asks its own question first.
    const dialog = await stream.next("dialog");
    assert.equal((await post(studio, "dialog", { id: dialog.id, value: "Universitario" })).status, 200);
    await until(() => settleIdle(stream));
    assert.equal(stream.events.some((event) => event.name === "error" && /método/.test(event.data.message)), false);
  } finally { stream.close(); }
});

test("a file:// link in a reply becomes the studio's own part route, and any other one loses the URL", async () => {
  const { root } = makeRoot();
  const part = pathToFileURL(join(root, "redes", "explicaciones", "Parte 1 - Capas.md")).href;
  assert.equal(studioLinks(`Ya está: [Parte 1](${part})`, root), "Ya está: [Parte 1](#/leer/redes/p1)");
  assert.equal(studioLinks(`Ya está: ${part}`, root), "Ya está: #/leer/redes/p1", "a bare URL is the same route");
  assert.equal(studioLinks(`[El diagnóstico](${pathToFileURL(join(root, "redes", "quiz.md")).href})`, root), "[El diagnóstico](#/leer/redes/quiz)");
  // A part the plan does not have, and a file that is not a note: the words stay, the URL goes.
  const missing = pathToFileURL(join(root, "redes", "explicaciones", "Parte 9 - Nada.md")).href;
  assert.equal(studioLinks(`Mira [la Parte 9](${missing})`, root), "Mira la Parte 9");
  assert.equal(studioLinks(`Mira ${pathToFileURL(join(root, "redes", "plan.json")).href}`, root), "Mira plan.json");
  // A reply with no filesystem link is left byte for byte.
  const clean = "Hola [x](#/leer/redes/p1) y `file://` en un ejemplo";
  assert.equal(studioLinks(clean, root), clean);
});

test("an Antigravity reply carrying a file:// link reaches the chat as the studio's part route", async () => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const dir = mkdtempSync(join(tmpdir(), "agy-file-link-"));
  const fake = join(dir, "agy.mjs");
  writeFileSync(fake, [
    'import { pathToFileURL } from "node:url";',
    'const url = pathToFileURL(process.cwd() + "/redes/explicaciones/Parte 1 - Capas.md").href;',
    'const out = (record) => process.stdout.write(`${JSON.stringify(record)}\\n`);',
    'out({ event: "init", conversation_id: "file-link" });',
    'out({ event: "result", result: { status: "SUCCESS", response: `Ya está escrita: [Parte 1](${url})` } });',
  ].join("\n"));
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, agyCommand: [process.execPath, fake] });
  open.push(studio);
  const stream = sse(`${studio.url}events`);
  try {
    await stream.next("history");
    await stream.next("state");
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    assert.equal((await post(studio, "prompt", { text: "Escribe la Parte 1" })).status, 200);
    const answer = await stream.next("assistant_end");
    assert.match(answer.text, /\(#\/leer\/redes\/p1\)/, `the reply carries the studio's route: ${answer.text}`);
    assert.doesNotMatch(answer.text, /file:/, "no filesystem URL survives into the chat");
  } finally { stream.close(); }
});
