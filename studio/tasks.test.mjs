// Background topic tasks: the public HTTP/SSE contract, against both runtime fakes.
// A task owns its own process and its own turn; the main chat keeps its own one-turn rule.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStudio } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
const FAKE_AGY = join(HERE, "testdata", "fake-agy.mjs");
const open = [];
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
  delete process.env.FAKE_AGY_TURNS;
  delete process.env.FAKE_AGY_DELAY_MS;
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (pred, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (pred()) return;
    await delay(25);
  }
  throw new Error("condition not met");
};
const untilAsync = async (pred, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await pred()) return;
    await delay(25);
  }
  throw new Error("condition not met");
};
/** A leaked ticket shows up as a topic that never leaves the queue: bound the wait. */
const bounded = (promise, ms, message) => {
  void promise.catch(() => {});
  return Promise.race([promise, delay(ms).then(() => { throw new Error(message); })]);
};

function http(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const get = (studio, path) => http(`${studio.url}${path}`);
const post = (studio, path, payload) => http(`${studio.url}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: new URL(studio.url).origin },
  body: JSON.stringify(payload),
});
const json = (response) => JSON.parse(response.body);
const piLog = (log) => existsSync(log)
  ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];
const agyTurns = (file) => existsSync(file)
  ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
  : [];

/** Collects an SSE stream; `next(name, pred)` waits for a frame and records every one. */
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
  const next = (name, pred = () => true, timeout = 5000) => new Promise((resolve, reject) => {
    const check = () => {
      const hit = events.find((e) => e.name === name && pred(e.data) && !e.taken);
      if (!hit) return;
      hit.taken = true;
      waiters.splice(waiters.indexOf(check), 1);
      clearTimeout(timer);
      resolve(hit.data);
    };
    const timer = setTimeout(() => reject(new Error(`no ${name} event; got ${events.map((e) => e.name).join(",")}`)), timeout);
    waiters.push(check);
    check();
  });
  return { events, next, close: () => req.destroy() };
}

/** A read that survives the 404 of a not-yet-implemented route during a RED run. */
const tasksOf = async (studio) => {
  const res = await get(studio, "api/tareas");
  assert.equal(res.status, 200, res.body);
  return json(res).tareas;
};
const taskOf = async (studio, topic) => (await tasksOf(studio)).find((t) => t.topic === topic);
const taskStream = (studio, topic) => sse(`${studio.url}api/tareas/eventos?task=${encodeURIComponent(topic)}`);

async function newStudio(runtime, options = {}) {
  const { root, engine, log } = makeRoot(options.root);
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  process.env.FAKE_PI_LOG = log;
  const turns = join(root, "agy-turns.log");
  if (runtime === "agy") {
    process.env.FAKE_AGY_TURNS = turns;
    process.env.FAKE_AGY_DELAY_MS = String(options.agyDelay ?? 2000);
  }
  const studioConfig = {
    root,
    piCommand: [process.execPath, FAKE_PI],
    enginePath: engine,
    agyCommand: [process.execPath, FAKE_AGY],
    skipContextCheck: true,
    ...options.studio,
  };
  const studio = await startStudio(studioConfig);
  open.push(studio);
  if (runtime === "agy") {
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
  }
  return { studio, studioConfig, root, log, turns, stateDir: process.env.XDG_STATE_HOME };
}

/** A second enrolled topic: another task, another process, another conversation. */
function addTopic(root, topic) {
  const dir = join(root, topic);
  mkdirSync(join(dir, ".learning"), { recursive: true });
  mkdirSync(join(dir, "explicaciones"), { recursive: true });
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ topic, parts: [{ id: "p1", title: "Parte 1", slug: "Parte-1" }] }));
  writeFileSync(join(dir, ".learning", "state.json"), "{}\n");
  writeFileSync(join(dir, "explicaciones", "Parte 1 - Parte-1.md"), `# ${topic}\n`);
}

function miniQuiz(root, topic = "redes") {
  mkdirSync(join(root, topic, "mini-quiz"), { recursive: true });
  writeFileSync(join(root, topic, "mini-quiz", "p1.json"), JSON.stringify({
    questions: [{ id: "q1", enunciado: "¿Sí?", options: { A: "a", B: "b", C: "c", D: "d", E: "No sé" }, answer: "B" }],
  }));
}

async function bridgeFor(studio, topic = "redes") {
  const view = json(await get(studio, `api/view?topic=${topic}&part=p1`));
  return { base: view.url.replace(new RegExp(`${topic}/p1$`), ""), origin: new URL(view.url).origin };
}
const submitPage = (bridge, payload) => http(`${bridge.base}submit`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: bridge.origin },
  body: JSON.stringify(payload),
});
const question = (topic, text, part = "p1") => ({ kind: "question", topic, part, text });

/** Pi holds a turn at a dialog; Antigravity holds it for the fake's configured delay. */
async function settleTask(runtime, studio, stream, topic) {
  if (runtime === "pi") {
    const dialog = await stream.next("dialog", (d) => d.task === topic);
    const answered = await post(studio, "api/tareas/dialogo", { task: topic, id: dialog.id, value: "Universitario" });
    assert.equal(answered.status, 200, answered.body);
  }
  await untilAsync(async () => ["done", "failed"].includes((await taskOf(studio, topic))?.state), 8000);
}

for (const runtime of ["pi", "agy"]) {
  test(`S1: a topic task and a main-chat prompt work at once — ${runtime}`, async () => {
    const { studio, log, turns } = await newStudio(runtime);
    const stream = taskStream(studio, "redes");
    try {
      const bridge = await bridgeFor(studio);
      const page = submitPage(bridge, question("redes", "pregunta de fondo"));
      await untilAsync(async () => (await taskOf(studio, "redes"))?.state !== undefined);

      const main = await post(studio, "prompt", { text: "genera una nota nueva" });
      assert.equal(main.status, 200, main.body, "the main chat is not refused or queued behind a task");
      const whileMainRan = (await taskOf(studio, "redes")).state;

      if (runtime === "pi") {
        await until(() => piLog(log).some((c) => c.type === "prompt" && /genera una nota nueva/.test(c.message ?? "")));
        await until(() => piLog(log).some((c) => c.type === "prompt" && c.sessionId === "tarea-redes"));
        assert.ok(piLog(log).some((c) => c.type === "prompt" && c.sessionId === "tarea-redes"), "the task reached its own Pi session");
      } else {
        await until(() => agyTurns(turns).some((argv) => argv.join(" ").includes("genera una nota nueva")));
        const file = join(process.env.XDG_STATE_HOME, "learning-studio", "tareas.json");
        await until(() => existsSync(file));
        const stored = JSON.parse(readFileSync(file, "utf8"));
        assert.ok(stored.conversaciones.redes, "the task reached its own Antigravity conversation");
      }
      assert.notEqual(whileMainRan, "done", "the task was still running when the main prompt began");

      await settleTask(runtime, studio, stream, "redes");
      assert.equal((await page).status, 200);
      const user = await stream.next("user", (d) => d.task === "redes" && /pregunta de fondo/.test(d.text));
      assert.equal(user.task, "redes", "task frames carry the topic");
    } finally { stream.close(); }
  });

  test(`S3: reader work stays in its topic's task process and is reused — ${runtime}`, async () => {
    const { studio, log, turns, stateDir } = await newStudio(runtime);
    const stream = taskStream(studio, "redes");
    try {
      const bridge = await bridgeFor(studio);
      for (const text of ["primera pregunta", "segunda pregunta"]) {
        const page = submitPage(bridge, question("redes", text));
        await untilAsync(async () => (await taskOf(studio, "redes"))?.state !== undefined);
        await settleTask(runtime, studio, stream, "redes");
        assert.equal((await page).status, 200);
      }
      if (runtime === "pi") {
        const taskPrompts = piLog(log).filter((c) => c.type === "prompt" && c.sessionId === "tarea-redes");
        assert.equal(taskPrompts.length, 2, "both submissions went to the same task session");
        const pids = new Set(taskPrompts.map((c) => c.pid));
        assert.equal(pids.size, 1, "one process per task");
        const mainPids = piLog(log).filter((c) => c.sessionId === null).map((c) => c.pid);
        assert.ok(!pids.has(mainPids[0]), "the main chat runs in a different process");
      } else {
        const stored = JSON.parse(readFileSync(join(stateDir, "learning-studio", "tareas.json"), "utf8"));
        const id = stored.conversaciones.redes;
        assert.ok(id, "the topic's Antigravity conversation is persisted outside the vault");
        const resumed = agyTurns(turns).filter((argv) => argv.includes(`--conversation`) && argv.includes(id));
        assert.ok(resumed.length >= 1, "the second submission resumes that conversation");
        assert.notEqual(id, "test-conversation", "a task does not share the main chat's conversation");
      }
    } finally { stream.close(); }
  });

  test(`S5: one writer per topic queues, other topics and the main chat run — ${runtime}`, async () => {
    const { studio, root, log, turns } = await newStudio(runtime);
    addTopic(root, "otra");
    miniQuiz(root);
    const redes = taskStream(studio, "redes");
    const otra = taskStream(studio, "otra");
    try {
      const bridge = await bridgeFor(studio);
      const bridgeOtra = await bridgeFor(studio, "otra");
      const first = submitPage(bridge, question("redes", "primera de redes"));
      await untilAsync(async () => (await taskOf(studio, "redes"))?.state !== undefined);
      const answerFile = join(root, "redes", "mini-quiz", "p1.answers.json");

      const queued = submitPage(bridge, {
        kind: "mini-quiz", topic: "redes", part: "p1", answers: { q1: "B" }, reasoning: { q1: { razonamiento: "pienso", confianza: "seguro" } },
      });
      let queuedDone = false;
      void queued.then(() => { queuedDone = true; });
      await untilAsync(async () => (await taskOf(studio, "redes"))?.queued >= 1);
      assert.equal(existsSync(answerFile), false, "a queued submission writes no answer file before it owns the topic");

      assert.equal((await submitPage(bridgeOtra, question("otra", "trabajo paralelo"))).status, 200);
      await untilAsync(async () => (await taskOf(studio, "otra"))?.state !== undefined);
      assert.notEqual((await taskOf(studio, "otra")).topic, undefined);

      let mainDone = false;
      const main = post(studio, "prompt", { text: "nota desde el chat", tema: "redes" }).then((res) => { mainDone = true; return res; });
      await delay(120);
      assert.equal(mainDone, false, "a main prompt for a busy topic waits instead of starting another writer");

      if (runtime === "pi") {
        const dialog = await redes.next("dialog", (d) => d.task === "redes");
        assert.equal((await post(studio, "api/tareas/dialogo", { task: "redes", id: dialog.id, value: "Universitario" })).status, 200);
      }
      assert.equal((await queued).status, 200, "the queued submission ran after the lock was free");
      assert.ok(existsSync(answerFile), "the queued submission wrote its answer file when it owned the lock");
      assert.equal(queuedDone, true);
      if (runtime === "pi") {
        const nextDialog = await redes.next("dialog", (d) => d.task === "redes", 3000).catch(() => null);
        if (nextDialog) await post(studio, "api/tareas/dialogo", { task: "redes", id: nextDialog.id, value: "Universitario" });
      }
      assert.equal((await main).status, 200);
      if (runtime === "agy") {
        await until(() => agyTurns(turns).some((argv) => argv.join(" ").includes("nota desde el chat")));
      }

      const prompts = runtime === "pi"
        ? piLog(log).filter((c) => c.type === "prompt").map((c) => String(c.message ?? ""))
        : agyTurns(turns).map((argv) => argv.join(" "));
      const at = (needle) => prompts.findIndex((text) => text.includes(needle));
      assert.ok(at("mini-quiz") < at("nota desde el chat"), `the queued page submission ran before the main prompt: mini=${at("mini-quiz")} main=${at("nota desde el chat")}`);
      assert.equal(await first, await first);
      assert.equal((await first).status, 200);
      await settleTask(runtime, studio, otra, "otra").catch(() => undefined);
    } finally { redes.close(); otra.close(); }
  });

  test(`S5: a topic whose turn cannot start stays usable — ${runtime}`, async () => {
    // A drifted context is refused before holdTurn, with the bridge ticket already detached.
    const { studio, studioConfig } = await newStudio(runtime, {
      studio: { skipContextCheck: false, contextHome: mkdtempSync(join(tmpdir(), "studio-drift-")) },
    });
    const bridge = await bridgeFor(studio);
    const stream = taskStream(studio, "redes");
    try {
      const refused = await submitPage(bridge, question("redes", "no puede empezar"));
      assert.equal(refused.status, 409, refused.body);
      studioConfig.skipContextCheck = true;

      const next = submitPage(bridge, question("redes", "sí puede empezar"));
      void next.catch(() => {});
      await bounded(
        untilAsync(async () => ["working", "asking"].includes((await taskOf(studio, "redes"))?.state), 3000),
        3500, "the topic stayed locked after a turn that never started",
      );
      await settleTask(runtime, studio, stream, "redes");
      assert.equal((await next).status, 200, "the next submission ran and settled");
      assert.equal((await taskOf(studio, "redes")).state, "done");
    } finally { stream.close(); }
  });

  test(`S4: three topic tasks work at the same time — ${runtime}`, async () => {
    const { studio, root } = await newStudio(runtime);
    addTopic(root, "otra");
    addTopic(root, "tercera");
    const streams = ["redes", "otra", "tercera"].map((topic) => taskStream(studio, topic));
    try {
      for (const topic of ["redes", "otra", "tercera"]) {
        const bridge = await bridgeFor(studio, topic);
        assert.equal((await submitPage(bridge, question(topic, `pregunta de ${topic}`))).status, 200);
      }
      for (const topic of ["redes", "otra", "tercera"]) {
        await untilAsync(async () => (await taskOf(studio, topic))?.state !== undefined, 3000);
      }
      const working = await tasksOf(studio);
      assert.equal(working.length, 3);
      assert.deepEqual(working.map((t) => t.topic).sort(), ["otra", "redes", "tercera"]);
      assert.ok(working.every((t) => ["working", "asking", "waiting"].includes(t.state)), JSON.stringify(working));
      for (const [index, topic] of ["redes", "otra", "tercera"].entries()) {
        await settleTask(runtime, studio, streams[index], topic);
      }
    } finally { for (const stream of streams) stream.close(); }
  });
}

test("S5: a Pi prompt refused inside startTurn leaves the topic usable", async () => {
  process.env.FAKE_PI_REJECT = "[Vista HTML · redes · p1 · pregunta";
  try {
    const { studio } = await newStudio("pi");
    const bridge = await bridgeFor(studio);
    const stream = taskStream(studio, "redes");
    try {
      const refused = await submitPage(bridge, question("redes", "el modelo no responde"));
      assert.equal(refused.status, 409, refused.body);
      // The same process can deliver a different kind of submission: its prompt does not match.
      const next = submitPage(bridge, { kind: "video", topic: "redes", part: "p1" });
      void next.catch(() => {});
      await bounded(
        untilAsync(async () => ["working", "asking"].includes((await taskOf(studio, "redes"))?.state), 3000),
        3500, "the topic stayed locked after a refused prompt",
      );
      await settleTask("pi", studio, stream, "redes");
      assert.equal((await next).status, 200, "the next submission ran and settled");
      assert.equal((await taskOf(studio, "redes")).state, "done");
    } finally { stream.close(); }
  } finally { delete process.env.FAKE_PI_REJECT; }
});

test("S5: an Antigravity prompt refused inside startTurn leaves the topic usable", async () => {
  const { studio, studioConfig } = await newStudio("agy", { studio: { agyCommand: [] } });
  const bridge = await bridgeFor(studio);
  const stream = taskStream(studio, "redes");
  try {
    const refused = await submitPage(bridge, question("redes", "sin ejecutable"));
    assert.equal(refused.status, 409, refused.body);
    // A tutor change replaces the task's runtime, so the next turn uses the restored command.
    studioConfig.agyCommand = [process.execPath, FAKE_AGY];
    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    const next = submitPage(bridge, question("redes", "ya funciona"));
    void next.catch(() => {});
    await bounded(
      untilAsync(async () => ["working", "asking"].includes((await taskOf(studio, "redes"))?.state), 3000),
      3500, "the topic stayed locked after a refused prompt",
    );
    await settleTask("agy", studio, stream, "redes");
    assert.equal((await next).status, 200, "the next submission ran and settled");
    assert.equal((await taskOf(studio, "redes")).state, "done");
  } finally { stream.close(); }
});

test("task states, dialogs, transcript and abort are readable through the task API", async () => {
  const { studio } = await newStudio("pi");
  assert.deepEqual(await tasksOf(studio), [], "no task exists before the first submission");
  const stream = taskStream(studio, "redes");
  try {
    assert.equal((await get(studio, "api/tareas/historial?task=no-existe")).status, 404);

    const bridge = await bridgeFor(studio);
    const page = submitPage(bridge, question("redes", "pregunta con diálogo"));
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "asking");
    const task = await taskOf(studio, "redes");
    assert.match(task.activity, /Pregunt|diálogo/i, "the task says what it is doing");
    const dialog = await stream.next("dialog", (d) => d.task === "redes");
    assert.equal((await post(studio, "api/tareas/dialogo", { task: "redes", id: dialog.id, value: "Universitario" })).status, 200);
    assert.equal((await page).status, 200);
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "done");
    const closed = await stream.next("dialog_closed", (d) => d.task === "redes");
    assert.equal(closed.id, dialog.id);

    const history = json(await get(studio, "api/tareas/historial?task=redes"));
    assert.equal(history.task, "redes");
    assert.ok(history.messages.some((m) => m.role === "user" && /pregunta con diálogo/.test(m.text)));
    assert.ok(history.messages.some((m) => m.role === "assistant"));
    assert.equal((await post(studio, "api/tareas/dialogo", { task: "redes", id: dialog.id, value: "otra" })).status, 404);

    const second = submitPage(bridge, question("redes", "otra pregunta"));
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "asking");
    assert.equal((await post(studio, "api/tareas/abortar", { task: "redes" })).status, 200);
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "failed");
    assert.equal((await second).status, 200);
    assert.equal((await post(studio, "api/tareas/abortar", { task: "no-existe" })).status, 404);
  } finally { stream.close(); }
});

test("L5: a tutor change finishes a running task and applies to its next turn", async () => {
  const { studio, log, turns } = await newStudio("pi");
  process.env.FAKE_AGY_TURNS = turns;
  process.env.FAKE_AGY_DELAY_MS = "50";
  const stream = taskStream(studio, "redes");
  try {
    const bridge = await bridgeFor(studio);
    const first = submitPage(bridge, question("redes", "antes del cambio"));
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "asking");
    const dialog = await stream.next("dialog", (d) => d.task === "redes");
    assert.equal((await post(studio, "api/tareas/dialogo", { task: "redes", id: dialog.id, value: "Universitario" })).status, 200);
    assert.equal((await first).status, 200);
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "done");
    assert.equal(piLog(log).filter((c) => c.type === "prompt" && c.sessionId === "tarea-redes").length, 1);

    assert.equal((await post(studio, "api/tutor", { version: 1, agente: "agy", modelo: "", pensamiento: "" })).status, 200);
    const second = submitPage(bridge, question("redes", "después del cambio"));
    await untilAsync(async () => (await taskOf(studio, "redes"))?.state === "done", 8000);
    assert.equal((await second).status, 200);
    // The task kept its thread but moved to the new runtime; no new Pi task process was started.
    assert.equal(piLog(log).filter((c) => c.type === "prompt" && c.sessionId === "tarea-redes").length, 1);
    assert.ok(agyTurns(turns).some((argv) => argv.join(" ").includes("después del cambio")));
    await until(() => existsSync(join(process.env.XDG_STATE_HOME, "learning-studio", "tareas.json")));
    const stored = JSON.parse(readFileSync(join(process.env.XDG_STATE_HOME, "learning-studio", "tareas.json"), "utf8"));
    assert.ok(stored.conversaciones.redes, "the new runtime keeps the topic's own conversation");
  } finally { stream.close(); }
});
