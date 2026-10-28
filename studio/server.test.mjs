// Learning studio server tests: a real server on 127.0.0.1 with a fake Pi RPC
// child (testdata/fake-pi.mjs) and a temporary Learnings root.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { request, createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { entryUrl, noteFromMessages, noteFromPath, startStudio } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

test('configured studio bridge reaches the transcriber from its framed origin', async t => {
  let uploads = 0;
  const fake = createServer(async (req, res) => {
    for await (const _chunk of req) {}
    if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
    if (req.method === 'PUT') uploads++;
    assert.equal(req.headers.authorization, 'Bearer studio-transcriber-secret');
    res.end(req.method === 'PUT' ? JSON.stringify({ id: 'studio-job' }) : req.url.endsWith('/txt') ? 'desde estudio' : JSON.stringify({ status: 'done' }));
  });
  await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
  t.after(() => { fake.closeAllConnections(); fake.close(); });
  const { studio } = await setup({ transcriberUrl: `http://127.0.0.1:${fake.address().port}`, transcriberToken: 'studio-transcriber-secret' });
  const view = JSON.parse((await http(`${studio.url}api/view?topic=redes&part=p1`)).body);
  const endpoint = view.url.replace(/redes\/p1$/, '') + 'api/transcribe';
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
  const studio = await startStudio({ root, piCommand: [process.execPath, FAKE_PI], enginePath: engine, ...options });
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
  assert.match(page.headers["content-security-policy"], /frame-src https:\/\/box\.tail0\.ts\.net:8446(;|$)/);
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

test("a second public studio origin is authorized while the first stays canonical", async () => {
  const canonical = "https://learnings.infra.local";
  const fallback = "https://10.154.59.151:8445";
  const bridgeCanonical = "https://learnings.infra.local:8446";
  const bridgeFallback = "https://10.154.59.151:8446";
  const { studio, received } = await setup({ publicOrigin: `${canonical},${fallback}`, bridgePublicOrigin: `${bridgeCanonical},${bridgeFallback}`, bridgePort: 0 });
  for (const host of ["learnings.infra.local", "10.154.59.151:8445"]) {
    const page = await http(studio.url, { headers: { host } });
    assert.equal(page.status, 200, host);
    assert.match(page.headers["content-security-policy"], /frame-src https:\/\/learnings\.infra\.local:8446(;|$)/);
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
  const token = "0123456789abcdef".repeat(4);
  const first = await setup({ token });
  assert.equal(first.studio.url, `http://127.0.0.1:${first.studio.port}/${token}/`);
  assert.equal((await http(`${first.studio.url}api/library`)).status, 200);
  await first.studio.close();
  const second = await setup({ token });
  assert.equal((await http(`${second.studio.url}api/library`)).status, 200, "the same token still opens the studio");
  assert.equal((await http(`http://127.0.0.1:${second.studio.port}/${token.slice(1)}/api/library`)).status, 404);
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

test("a part note path resolves to the topic and part the reader routes on", () => {
  assert.deepEqual(noteFromPath("/home/ale/Learnings/redes/explicaciones/Parte 3 - Capas.md"), { topic: "redes", index: 3 });
  assert.deepEqual(noteFromPath("redes/explicaciones/Parte 1 - Algo.md"), { topic: "redes", index: 1 });
  assert.deepEqual(noteFromPath("C:\\Users\\ismar\\Learnings\\redes\\explicaciones\\Parte 12 - Redes.md"), { topic: "redes", index: 12 });
  assert.equal(noteFromPath("/home/ale/Learnings/redes/explicaciones/mis-palabras.md"), null, "only part notes are routable");
  assert.equal(noteFromPath("/home/ale/Learnings/redes/explicaciones/Parte 4 - Falsa.txt"), null);
  assert.equal(noteFromPath("/home/ale/Learnings/redes/plan.json"), null);
  assert.equal(noteFromPath("explicaciones/Parte 1 - Sin tema.md"), null, "a note without its topic folder has no route");
  assert.equal(noteFromPath(undefined), null);
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
  assert.deepEqual(await stream.next("tool", (t) => t.phase === "start"), { phase: "start", id: "t1", name: "write", label: "Escribiendo Parte 1 - Algo.md", ok: true, note: { topic: "tema", index: 1 } });
  assert.deepEqual(await stream.next("tool", (t) => t.phase === "end"), { phase: "end", id: "t1", name: "write", label: "Escribiendo Parte 1 - Algo.md", ok: true, note: { topic: "tema", index: 1 } }, "the end keeps the arguments its start carried");
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
  // What the topic still owes travels with the library, so no view can call it finished.
  assert.deepEqual(topic.gaps, { missing: ["p2"], noVisuals: [], noQuiz: ["p1"] });
  assert.deepEqual(topic.parts.map((p) => p.visuals), [0, 0]);

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
