// Learning studio server tests: a real server on 127.0.0.1 with a fake Pi RPC
// child (testdata/fake-pi.mjs) and a temporary Learnings root.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startStudio } from "./server.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_PI = join(HERE, "testdata", "fake-pi.mjs");
const open = [];
after(async () => {
  for (const studio of open) await studio.close();
});

function makeRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "studio-")));
  const topic = join(root, "redes");
  mkdirSync(join(topic, "explicaciones", "apps"), { recursive: true });
  mkdirSync(join(topic, ".learning"));
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "Redes", parts: [{ id: "p1", title: "Capas", slug: "Capas" }, { id: "p2", title: "TCP", slug: "TCP" }] }));
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Capas.md"), "# Parte 1 — Capas\n");
  writeFileSync(join(topic, "explicaciones", "apps", "p1.html"), "<html><head></head><body>app</body></html>");
  writeFileSync(join(topic, "quiz.json"), JSON.stringify({ questions: [] }));
  mkdirSync(join(root, "rapidos"));
  writeFileSync(join(root, "rapidos", "hash.md"), "---\ntipo: rapido\n---\n# Qué es un hash\n");
  const engine = join(root, "fake-engine.sh");
  writeFileSync(engine, '#!/bin/sh\necho \'{"status":"waiting","stage":"diagnosis","nextStage":"diagnosis"}\'\n');
  chmodSync(engine, 0o755);
  return { root, engine, log: join(root, "pi.log") };
}

async function setup() {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine });
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
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const name = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (name) events.push({ name, data: JSON.parse(data) });
        for (const w of [...waiters]) w();
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

test("the shell page is token-gated, loopback-only and allows framing only the hosted bridge", async () => {
  const { studio, received } = await setup();
  const page = await http(studio.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /<main id="studio"><\/main>/);
  const data = JSON.parse(page.body.match(/id="studio-data">(.*?)<\/script>/)[1]);
  assert.equal(data.base, new URL(studio.url).pathname);
  const csp = page.headers["content-security-policy"];
  assert.match(csp, /frame-src http:\/\/127\.0\.0\.1:\d+(;|$)/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net(;|$)/);
  assert.equal((await http(`${new URL(studio.url).origin}/${"0".repeat(64)}/`)).status, 404);
  assert.equal((await http(studio.url, { headers: { host: "evil.example" } })).status, 403);
  await until(() => received().length > 0 || true);
  assert.equal((await http(`${studio.url}studio.js`)).status, 200);
  assert.equal((await http(`${studio.url}tutorial.js`)).status, 200);
  assert.match(page.body, /<script src="\/[0-9a-f]{64}\/tutorial\.js"><\/script>\n<script src="\/[0-9a-f]{64}\/studio\.js">/);
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
  const first = received().find((c) => c.type === "get_messages");
  assert.equal(first.interactiveHost, "1");
  assert.equal(first.cwd, root);
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
  assert.deepEqual(await stream.next("tool", (t) => t.phase === "start"), { phase: "start", id: "t1", name: "write", label: "Escribiendo Parte 1 - Algo.md", ok: true });
  assert.equal((await stream.next("tool", (t) => t.phase === "end")).ok, true);
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
  assert.deepEqual(received().find((c) => c.type === "extension_ui_response"), {
    type: "extension_ui_response", id: "d1", value: "Rápido con quiz", interactiveHost: "1", cwd: received()[0].cwd,
  });
  assert.deepEqual(await stream.next("dialog_closed"), { id: "d1" });
  const end = await stream.next("assistant_end");
  assert.equal(end.text, "Hola, elegiste Rápido con quiz.");
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
  assert.deepEqual(topic.parts.map((p) => [p.id, p.written, p.hasApp]), [["p1", true, true], ["p2", false, false]]);

  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  assert.match(view.url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\/redes\/p1$/);
  assert.equal(view.appUrl, `${view.url}/app`);
  const page = await http(view.url);
  assert.match(page.headers["content-security-policy"], new RegExp(`frame-ancestors 'self' ${new URL(studio.url).origin}`));
  assert.equal((await http(`${studio.url}api/view?topic=redes&part=p2`)).status, 404);
  const quick = JSON.parse((await http(`${studio.url}api/view?quick=hash`)).body);
  assert.match(quick.url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\/rapidos\/hash$/);
  assert.equal((await http(quick.url)).status, 200);
  assert.equal((await http(`${studio.url}api/view?quick=nope`)).status, 404);
  assert.equal((await http(`${studio.url}api/view?quick=..`)).status, 404);
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
