// Learning studio server tests: a real server on 127.0.0.1 with a fake Pi RPC
// child (testdata/fake-pi.mjs) and a temporary Learnings root.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { request, createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { entryUrl, noteFromMessages, noteFromPath, startStudio, topicFromPath } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

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
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
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
    assert.match(sent, /«Ir al quiz»/);
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
      { name: "edit", ok: true, note: undefined, topic: "redes" },
    ]);
    assert.equal(stream.events.filter(event => event.name === "tool" && event.data.phase === "start").length, 2, "one start per step");
  } finally { stream.close(); }
});

test("a deep turn is refused for a topic the engine does not track, and reached for one it does", async () => {
  const { studio, root, received } = await setup();
  // A topic the learner can see but never enrolled: no .learning/state.json to track it.
  mkdirSync(join(root, "sin-inscribir"), { recursive: true });
  writeFileSync(join(root, "sin-inscribir", "plan.json"), JSON.stringify({ topic: "Sin inscribir", parts: [] }));
  const refused = await post(studio, "prompt", { text: "Hola", tema: "sin-inscribir" });
  assert.equal(refused.status, 400, refused.body);
  assert.match(JSON.parse(refused.body).error, /not enrolled/);
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
    assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 1, "the engine is asked once, not once per provider");
    await stream.next("state", data => data.busy === false);
    const blocked = await post(studio, "prompt", { text: "Otra vez", tema: "redes" });
    assert.equal(blocked.status, 409, blocked.body);
    // The engine is asked again before the refusal, so a topic that passes is released.
    writeFileSync(engine, `#!/bin/sh\necho '{"status":"waiting","stage":"diagnosis","nextStage":"diagnosis"}'\n`);
    assert.equal((await post(studio, "prompt", { text: "Sigo", tema: "redes" })).status, 200);
    // Two passing verdicts follow: the re-check before the turn, then its settle gate.
    await stream.next("gate", (data) => data.passing === true);
    await stream.next("gate", (data) => data.passing === true);
    // A general question is outside the gate: it is never refused for a failed deep turn.
    const general = await post(studio, "prompt", { text: "¿Y un hash?" });
    assert.equal(general.status, 200, general.body);
  } finally { stream.close(); }
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

test("preferences API seeds, saves, and rejects invalid changes without modifying the file", async () => {
  const { studio, root } = await setup();
  const file = join(root, "preferencias.json");
  const initial = await http(`${studio.url}api/preferences`);
  assert.equal(initial.status, 200);
  const data = JSON.parse(initial.body);
  assert.equal(data.version, 1);
  assert.ok(data.aspectos.length > 0);
  assert.equal(data.aspectos.find((a) => a.id === "texto").nivel, "menos");
  assert.equal(existsSync(file), false);
  data.aspectos[0].nivel = "medio";
  const saved = await post(studio, "api/preferences", data);
  assert.equal(saved.status, 200, saved.body);
  assert.deepEqual(JSON.parse(saved.body), data);
  assert.deepEqual(JSON.parse((await http(`${studio.url}api/preferences`)).body), data);
  const before = readFileSync(file, "utf8");
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
    assert.equal(readFileSync(file, "utf8"), before);
  }
});

test("telemetry API reads, records quiz entries, and serves global and topic telemetry", async () => {
  const { studio, root } = await setup();
  const file = join(root, "telemetria.json");
  const initial = await http(`${studio.url}api/telemetry`);
  assert.equal(initial.status, 200);
  const data = JSON.parse(initial.body);
  assert.equal(data.version, 1);
  assert.equal(data.estadisticas_globales.total_quizzes, 0);
  assert.ok(data.perfil_alumno.tendencias.matematicas);
  assert.equal(existsSync(file), false);

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
  assert.ok(existsSync(file));

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
  assert.ok(received().some((c) => c.type === "prompt" && c.message === "public prompt"));
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
  for (const origin of [canonical, fallback]) {
    assert.equal((await post(studio, "prompt", { text: `desde ${origin}` }, { origin })).status, 200, origin);
  }
  assert.ok(received().some((c) => c.type === "prompt" && c.message === `desde ${fallback}`));
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
  assert.deepEqual(await stream.next("state"), { busy: false, alive: true });
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
  assert.deepEqual(noteFromPath("/home/ale/Learnings/rapidos/hash.md"), { quick: "hash" });
  assert.deepEqual(noteFromPath("C:\\Users\\ismar\\Learnings\\rapidos\\que-es-dns.md"), { quick: "que-es-dns" });
  assert.equal(noteFromPath("/home/ale/Learnings/rapidos/notas.txt"), null);
  assert.equal(noteFromPath("/home/ale/Learnings/rapidos/con espacio.md"), null, "only ids the reader routes on");
});

test("the conversation remembers the last part note the tutor wrote", () => {
  const call = (name, path) => ({ role: "assistant", content: [{ type: "toolCall", id: "t", name, arguments: { path } }] });
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
  assert.equal(received().find((c) => c.type === "prompt").message, "Quiero aprender redes.");
  assert.deepEqual(await stream.next("user"), { text: "Quiero aprender redes." });
  assert.deepEqual(await stream.next("state", (s) => s.busy), { busy: true, alive: true });
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
  assert.deepEqual(await stream.next("state", (s) => !s.busy), { busy: false, alive: true });
  await stream.next("library_changed");

  const queued = await post(studio, "prompt", { text: "otra cosa" });
  assert.equal(queued.status, 200);
  stream.close();
});

test("a prompt while Pi works is queued as a follow-up", async () => {
  const { studio, received } = await setup();
  const stream = sse(`${studio.url}events`);
  await stream.next("history");
  await post(studio, "prompt", { text: "primero" });
  await stream.next("dialog");
  await post(studio, "prompt", { text: "después" });
  const prompts = received().filter((c) => c.type === "prompt");
  assert.deepEqual(prompts.map((p) => [p.message, p.streamingBehavior]), [["primero", undefined], ["después", "followUp"]]);
  stream.close();
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
  assert.deepEqual(await stream.next("state", (s) => !s.alive), { busy: false, alive: false });
  assert.equal((await stream.next("error")).message, "El tutor se detuvo.");
  assert.equal((await post(studio, "prompt", { text: "hola" })).status, 503);
  assert.equal((await post(studio, "restart", {})).status, 200);
  assert.deepEqual(await stream.next("state", (s) => s.alive), { busy: false, alive: true });
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
  const saved = JSON.parse(readFileSync(join(root, "sugerencias.json"), "utf8"));
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

test("a suggestion needs a reason or words, and cannot replace the file it cannot read", async () => {
  const { studio, root } = await setup();
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1" })).status, 400, "an empty suggestion asks for nothing");
  assert.equal((await post(studio, "api/sugerencias", { tema: "../etc", parte: "p1", texto: "x" })).status, 400, "a topic never leaves the vault");
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", motivos: ["no-existe"], texto: "x" })).status, 400);
  assert.equal(existsSync(join(root, "sugerencias.json")), false, "a rejected suggestion writes nothing");

  // A file that cannot be parsed is kept aside, never replaced unseen.
  writeFileSync(join(root, "sugerencias.json"), "{ esto no es json");
  const seen = await http(`${studio.url}api/sugerencias`);
  assert.equal(seen.status, 200);
  assert.deepEqual(JSON.parse(seen.body).entradas, []);
  assert.equal((await post(studio, "api/sugerencias", { tema: "redes", parte: "p1", texto: "sigue aquí" })).status, 200);
  const kept = readdirSync(root).filter((name) => name.startsWith("sugerencias.corrupta-"));
  assert.equal(kept.length, 1, "the unreadable file is kept aside");
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
  assert.equal(received().find((line) => line.type === "prompt").message, result.prompt, "the tutor receives exactly that prompt");
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
  writeFileSync(join(root, "sugerencias.json"), JSON.stringify({ version: 1, actualizado: "", entradas: [] }));

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
  assert.equal(JSON.parse(readFileSync(join(root, "sugerencias.json"), "utf8")).entradas.length, 1);
});

test("an entry the store cannot read is never thrown away", async () => {
  const { studio, root } = await setup();
  const good = { id: "s-1", tema: "redes", parte: "p1", motivos: [], texto: "buena", origen: "sugerencia", timestamp: "2026-01-01T00:00:00Z" };
  const unreadable = { id: 7, texto: "no la entiendo" };
  writeFileSync(join(root, "sugerencias.json"), JSON.stringify({ version: 1, actualizado: "", entradas: [good, unreadable] }));

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
    JSON.parse(readFileSync(join(root, "sugerencias.json"), "utf8")).entradas.some((e) => e.texto === "no la entiendo");
  assert.ok(preserved, "the unreadable entry vanished without a copy");
});

test("recording a suggestion never half-succeeds", async () => {
  const { studio, root } = await setup();
  writeFileSync(join(root, "preferencias.json"), "{ roto");

  const response = await http(`${studio.url}api/sugerencias`, {
    method: "POST",
    headers: { origin: new URL(studio.url).origin, "content-type": "application/json" },
    body: JSON.stringify({ tema: "redes", parte: "p1", motivos: ["faltan-ejemplos"], texto: "mas ejemplos de capas" }),
  });
  const stored = existsSync(join(root, "sugerencias.json")) ? JSON.parse(readFileSync(join(root, "sugerencias.json"), "utf8")).entradas.length : 0;

  // Either the whole request failed (nothing stored) or it succeeded (exactly one entry):
  // a stored entry behind an error makes the learner retry and write it twice.
  if (response.status === 200) assert.equal(stored, 1, "the studio said yes but the entry is not there");
  else assert.equal(stored, 0, `the studio answered ${response.status} after storing the entry`);
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
  assert.equal(JSON.parse(prompt.body).error, "the tutor is disabled");
  const restart = await post(studio, "restart", {});
  assert.equal(restart.status, 503);
  assert.equal(JSON.parse(restart.body).error, "the tutor is disabled");
  const part = join(root, "redes", "explicaciones", "Parte 1 - Capas.md");
  const before = readFileSync(part, "utf8");
  const regenerate = await post(studio, "api/regenerar", { tema: "redes", parte: "p1", motivos: ["demasiado-texto"], texto: "shorter" });
  assert.equal(regenerate.status, 503);
  assert.equal(JSON.parse(regenerate.body).error, "the tutor is disabled");
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
  assert.match(JSON.parse(refused.body).error, /busy/);
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

    await post(studio, "prompt", { text: "hola" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const chats = JSON.parse((await http(`${studio.url}api/chats`)).body);
    assert.equal(chats.chats.find((c) => c.id === chats.activo).agyConversation, "test-conversation");

    // The same chat continues its own conversation.
    await post(studio, "prompt", { text: "sigo" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Each turn is one `-p ...` argv, and the prompt itself spans lines.
    const turns = () => readFileSync(argv, "utf8").split(/\n(?=-p )/).filter((turn) => turn.trim());
    assert.equal(turns().length, 2);
    assert.ok(turns()[1].includes("--conversation test-conversation"), "the next turn continues the chat's conversation");

    // A new chat is a new conversation, not a silent carry-over.
    await post(studio, "api/chats", { nombre: "otra" });
    await post(studio, "prompt", { text: "otra vez" });
    await new Promise((resolve) => setTimeout(resolve, 300));
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
  assert.match(JSON.parse(refused.body).error, /open the chat/);
});
