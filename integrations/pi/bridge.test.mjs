// Study-view bridge tests: a real HTTP server on 127.0.0.1 against a temporary
// Learnings root, driven through the public learning_view tool and HTTP routes.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerBridge } from "./bridge.ts";

const TOPIC = "sql-demo";
const openServers = [];
after(async () => {
  for (const shutdown of openServers) await shutdown();
});

function makeRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "learnings-")));
  const topic = join(root, TOPIC);
  mkdirSync(join(topic, "explicaciones", "adjuntos"), { recursive: true });
  mkdirSync(join(topic, "explicaciones", "demos"), { recursive: true });
  mkdirSync(join(topic, "mini-quiz"), { recursive: true });
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "SQL demo",
      parts: [
        { id: "p1", title: "Claves", slug: "Claves" },
        { id: "p2", title: "Joins", slug: "Joins" },
      ],
    }),
  );
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.md"),
    "---\ntipo: explicacion\n---\n# Parte 1 — Claves\n\n> [!video] Video\n> ![[Parte 1 - Claves.mp4]]\n\nUna **clave** identifica.\n",
  );
  writeFileSync(join(topic, "explicaciones", "adjuntos", "Parte 1 - Claves.mp4"), Buffer.from("0123456789"));
  writeFileSync(join(topic, "explicaciones", "demos", "p1-claves.html"), "<p>demo</p>");
  mkdirSync(join(topic, "explicaciones", "apps"), { recursive: true });
  writeFileSync(join(topic, "explicaciones", "apps", "p1.html"), "<!doctype html><html><head><title>app</title></head><body>app</body></html>");
  const question = (id, extra = {}) => ({
    id,
    enunciado: `Pregunta ${id}`,
    options: { A: "a", B: "b", C: "c", D: "d", E: "No sé" },
    answer: "B",
    ...extra,
  });
  writeFileSync(join(topic, "mini-quiz", "p1.json"), JSON.stringify({ questions: [question("q1"), question("q2")] }));
  writeFileSync(
    join(topic, "quiz.json"),
    JSON.stringify({ questions: [question("d1", { round: 1 }), question("d2", { round: 1 }), question("d3", { round: 2 })] }),
  );
  writeFileSync(join(topic, "quiz.answers.json"), JSON.stringify({ answers: { d1: "B" } }, null, 2) + "\n");
  writeFileSync(join(root, "secret.txt"), "outside topic");
  return { root, topic };
}

function makeHost() {
  const handlers = new Map();
  const tools = new Map();
  const sent = [];
  const api = {
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    sendUserMessage(content, options) {
      sent.push({ content, options });
    },
  };
  return { api, handlers, tools, sent };
}

async function setup() {
  const { root, topic } = makeRoot();
  const host = makeHost();
  registerBridge(host.api, { root });
  const view = async (params, cwd = root) => {
    const result = await host.tools.get("learning_view").execute("call", params, undefined, undefined, { cwd });
    return result;
  };
  const shutdown = async () => {
    for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
  };
  openServers.push(shutdown);
  return { root, topic, host, view, shutdown };
}

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

const base = (result) => result.structuredContent.base;
const why = (...ids) =>
  Object.fromEntries(ids.map((id) => [id, { entendi: `entendí ${id}`, porque: `porque ${id}`, confianza: "seguro" }]));

function submit(url, payload, headers = {}) {
  const origin = new URL(url).origin;
  return http(`${url}submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

test("learning_view rejects a session outside the Learnings root and starts no server", async () => {
  const { view, shutdown } = await setup();
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "elsewhere-")));
  const result = await view({}, outside);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /outside the Learnings root/);
  assert.equal(result.structuredContent.url, undefined);
  await shutdown();
});

test("learning_view returns a loopback URL with a token; index lists topics; wrong token or Host is refused", async () => {
  const { view, shutdown } = await setup();
  const result = await view({});
  assert.equal(result.isError, false);
  const url = new URL(result.structuredContent.url);
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/[0-9a-f]{64}\/$/);
  const index = await http(url.href);
  assert.equal(index.status, 200);
  assert.match(index.body, /sql-demo/);
  assert.equal(index.headers["referrer-policy"], "no-referrer");
  assert.match(index.headers["content-security-policy"], /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  const wrongToken = await http(`${url.origin}/${"0".repeat(64)}/`);
  assert.equal(wrongToken.status, 404);
  const rebinding = await http(url.href, { headers: { host: "evil.example:80" } });
  assert.equal(rebinding.status, 403);
  await shutdown();
});

test("a second learning_view call reuses the same server and token", async () => {
  const { view, shutdown } = await setup();
  const first = await view({});
  const second = await view({ topic: TOPIC, part: "p1" });
  assert.equal(base(first), base(second));
  assert.equal(second.structuredContent.url, `${base(first)}${TOPIC}/p1`);
  await shutdown();
});

test("learning_view validates topic and part against plan.json", async () => {
  const { view, shutdown } = await setup();
  const badTopic = await view({ topic: "../etc" });
  assert.equal(badTopic.isError, true);
  assert.match(badTopic.content[0].text, /topic/);
  const missingPart = await view({ topic: TOPIC, part: "p9" });
  assert.equal(missingPart.isError, true);
  assert.match(missingPart.content[0].text, /p9/);
  await shutdown();
});

test("part page embeds the note with the video wired to the file route and the quiz without answer keys", async () => {
  const { view, shutdown } = await setup();
  const url = (await view({ topic: TOPIC, part: "p1" })).structuredContent.url;
  const page = await http(url);
  assert.equal(page.status, 200);
  const data = JSON.parse(page.body.match(/<script type="application\/json" id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.kind, "part");
  assert.doesNotMatch(data.markdown, /^---/);
  assert.match(data.markdown, /<video controls preload="metadata" src="file\/explicaciones\/adjuntos\/Parte%201%20-%20Claves\.mp4">/);
  assert.deepEqual(data.quiz.questions.map((q) => q.id), ["q1", "q2"]);
  assert.equal(JSON.stringify(data.quiz).includes('"answer"'), false);
  assert.deepEqual(data.demos, ["file/explicaciones/demos/p1-claves.html"]);
  const demo = await http(new URL(data.demos[0], url).href);
  assert.equal(demo.status, 200);
  assert.equal(demo.headers["content-security-policy"], "sandbox allow-scripts");
  assert.equal(data.answered, null);
  await shutdown();
});

test("an unwritten part is not served", async () => {
  const { view, shutdown } = await setup();
  const url = (await view({ topic: TOPIC })).structuredContent.url;
  const page = await http(`${url}/p2`);
  assert.equal(page.status, 404);
  await shutdown();
});

test("file route serves topic files with Range and refuses traversal and symlinks out of the topic", async () => {
  const { view, topic, root, shutdown } = await setup();
  const url = (await view({ topic: TOPIC })).structuredContent.url;
  const video = `${url}/file/explicaciones/adjuntos/Parte%201%20-%20Claves.mp4`;
  const full = await http(video);
  assert.equal(full.status, 200);
  assert.equal(full.headers["content-type"], "video/mp4");
  assert.equal(full.headers["accept-ranges"], "bytes");
  const ranged = await http(video, { headers: { range: "bytes=2-5" } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.body, "2345");
  assert.equal(ranged.headers["content-range"], "bytes 2-5/10");
  const traversal = await http(`${url}/file/..%2Fsecret.txt`);
  assert.equal(traversal.status, 404);
  symlinkSync(join(root, "secret.txt"), join(topic, "link.txt"));
  const link = await http(`${url}/file/link.txt`);
  assert.equal(link.status, 404);
  await shutdown();
});

test("plan.json part ids or slugs with path separators are never used as paths", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({ topic: "x", parts: [{ id: "../p1", title: "t", slug: "Claves" }, { id: "p3", title: "t", slug: "../../secret" }] }),
  );
  // Without the check, "Parte 2 - ../../secret.md" resolves to explicaciones/secret.md.
  mkdirSync(join(topic, "explicaciones", "Parte 2 - .."));
  writeFileSync(join(topic, "explicaciones", "secret.md"), "secret");
  assert.equal((await view({ topic: TOPIC, part: "../p1" })).isError, true);
  assert.equal((await view({ topic: TOPIC, part: "p3" })).isError, true);
  await shutdown();
});

test("a part's interactive app is served full page with the submit channel injected", async () => {
  const { view, shutdown } = await setup();
  const result = await view({ topic: TOPIC, part: "p1" });
  const appUrl = result.structuredContent.appUrl;
  assert.equal(appUrl, `${base(result)}${TOPIC}/p1/app`);
  assert.match(result.content[0].text, /Aplicación interactiva: http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\/sql-demo\/p1\/app/);
  const page = await http(appUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /^text\/html/);
  const csp = page.headers["content-security-policy"];
  assert.match(csp, /script-src 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /https:/);
  const injected = JSON.parse(page.body.match(/<head><script>window\.LEARNING_BRIDGE = (.*?);<\/script>/)[1]);
  assert.deepEqual(injected, { submitUrl: `${new URL(base(result)).pathname}submit`, topic: TOPIC, part: "p1" });
  assert.match(page.body, /<body>app<\/body>/);
  const partPage = await http(result.structuredContent.url);
  assert.equal(JSON.parse(partPage.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]).app, `${new URL(base(result)).pathname}${TOPIC}/p1/app`);
  await shutdown();
});

test("a part without an app has no appUrl and its app route is 404", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Joins.md"), "# Parte 2 — Joins\n");
  const result = await view({ topic: TOPIC, part: "p2" });
  assert.equal(result.structuredContent.appUrl, undefined);
  assert.doesNotMatch(result.content[0].text, /Aplicación interactiva/);
  assert.equal((await http(`${base(result)}${TOPIC}/p2/app`)).status, 404);
  assert.equal((await http(`${base(result)}${TOPIC}/p9/app`)).status, 404);
  assert.equal((await http(`${base(result)}${TOPIC}/..%2Fp1/app`)).status, 404);
  const page = await http(result.structuredContent.url);
  assert.equal(JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]).app, null);
  await shutdown();
});

test("frameAncestors lets one loopback origin embed the pages and apps; anything else is refused at registration", async () => {
  const { root } = makeRoot();
  const host = makeHost();
  registerBridge(host.api, { root, frameAncestors: ["http://127.0.0.1:5555"] });
  const result = await host.tools.get("learning_view").execute("x", { topic: TOPIC, part: "p1" }, undefined, undefined, { cwd: root });
  const page = await http(result.structuredContent.url);
  assert.match(page.headers["content-security-policy"], /frame-ancestors 'self' http:\/\/127\.0\.0\.1:5555(;|$)/);
  const app = await http(result.structuredContent.appUrl);
  assert.match(app.headers["content-security-policy"], /frame-ancestors http:\/\/127\.0\.0\.1:5555(;|$)/);
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
  for (const bad of ["https://evil.example", "http://127.0.0.1:5555; script-src *", "*", "http://example.com:80"]) {
    assert.throws(() => registerBridge(makeHost().api, { root, frameAncestors: [bad] }), /frameAncestors/);
  }
});

test("a part's rich HTML page replaces the Markdown rendering, with the kit, the quiz API and the injected config", async () => {
  const { root, topic } = makeRoot();
  const kitDir = realpathSync(mkdtempSync(join(tmpdir(), "kit-")));
  writeFileSync(join(kitDir, "kit.js"), "console.log('kit');");
  writeFileSync(join(kitDir, "kit.css"), "body{}");
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.html"),
    '<!doctype html><html lang="es"><head><link rel="stylesheet" href="../kit/kit.css"></head><body><h1>Rica</h1></body></html>',
  );
  const host = makeHost();
  registerBridge(host.api, { root, kitDir, frameAncestors: ["http://127.0.0.1:5555"] });
  const result = await host.tools.get("learning_view").execute("x", { topic: TOPIC, part: "p1" }, undefined, undefined, { cwd: root });
  const url = result.structuredContent.url;
  const prefix = new URL(result.structuredContent.base).pathname;
  const page = await http(url);
  assert.equal(page.status, 200);
  const csp = page.headers["content-security-policy"];
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'self' http:\/\/127\.0\.0\.1:5555/);
  const config = JSON.parse(page.body.match(/<head><script>window\.LEARNING_BRIDGE = (.*?);<\/script>/)[1]);
  assert.deepEqual(config, {
    submitUrl: `${prefix}submit`,
    quizUrl: `${prefix}api/quiz?topic=${TOPIC}&part=p1`,
    topic: TOPIC,
    part: "p1",
    video: "file/explicaciones/adjuntos/Parte%201%20-%20Claves.mp4",
  });
  assert.match(page.body, /<h1>Rica<\/h1>/);
  const kit = await http(`${result.structuredContent.base}kit/kit.js`);
  assert.equal(kit.status, 200);
  assert.match(kit.headers["content-type"], /^text\/javascript/);
  assert.equal((await http(`${result.structuredContent.base}kit/nope.js`)).status, 404);
  assert.equal((await http(`${result.structuredContent.base}kit/..%2Fbridge.ts`)).status, 404);

  const quiz = JSON.parse((await http(`${result.structuredContent.base}api/quiz?topic=${TOPIC}&part=p1`)).body);
  assert.deepEqual(quiz.questions.map((q) => q.id), ["q1", "q2"]);
  assert.equal(JSON.stringify(quiz).includes('"answer"'), false);
  assert.equal(quiz.answered, null);
  assert.equal(quiz.verdicts, null);
  writeFileSync(join(topic, "mini-quiz", "p1.answers.json"), JSON.stringify({ answers: { q1: "B", q2: "A" }, razonamientos: why("q1", "q2") }));
  const after = JSON.parse((await http(`${result.structuredContent.base}api/quiz?topic=${TOPIC}&part=p1`)).body);
  assert.deepEqual(after.answered[1], { id: "q2", chosen: "A", correct: "B", ok: false, ...why("q2").q2 });
  assert.equal((await http(`${result.structuredContent.base}api/quiz?topic=${TOPIC}&part=p9`)).status, 404);
  assert.equal((await http(`${result.structuredContent.base}api/quiz?topic=..&part=p1`)).status, 400);
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
});

test("a video request reaches the chat as a fixed message", async () => {
  const { view, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "video", topic: TOPIC, part: "p1" });
  assert.equal(res.status, 200);
  assert.equal(
    host.sent[0].content,
    "[Vista HTML · sql-demo · p1 · video]\nLa persona pide el video de esta parte: prodúcelo con el pipeline de learnings-video (video-distill.md) y guárdalo en explicaciones/adjuntos/Parte 1 - Claves.mp4.",
  );
  assert.equal((await submit(url, { kind: "video", topic: TOPIC })).status, 400);
  assert.equal((await submit(url, { kind: "video", topic: TOPIC, part: "p1", text: "x" })).status, 400);
  assert.equal(host.sent.length, 1);
  await shutdown();
});

test("session_shutdown closes the server", async () => {
  const { view, shutdown } = await setup();
  const url = (await view({})).structuredContent.url;
  await shutdown();
  await assert.rejects(http(url), /ECONNREFUSED/);
});

test("mini-quiz submit grades, stores the answers file and sends one follow-up chat message", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({ topic: TOPIC, part: "p1" }));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "C" },
    reasoning: {
      ...why("q1"),
      q2: { entendi: "Pide qué error da Oracle", porque: "Pensé que C porque...\nlo vi en clase", confianza: "adivine" },
    },
    ownWords: "Una clave identifica una fila.",
    exercises: "SELECT * FROM t;",
  });
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.results, [
    { id: "q1", chosen: "B", correct: "B", ok: true },
    { id: "q2", chosen: "C", correct: "B", ok: false },
  ]);
  assert.equal(body.score, "1/2");
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8")), {
    answers: { q1: "B", q2: "C" },
    razonamientos: {
      ...why("q1"),
      q2: { entendi: "Pide qué error da Oracle", porque: "Pensé que C porque...\nlo vi en clase", confianza: "adivine" },
    },
  });
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.sent[0].options, { deliverAs: "followUp" });
  const text = host.sent[0].content;
  assert.match(text, /^\[Vista HTML · sql-demo · p1 · mini-quiz\]/);
  assert.match(text, /mini-quiz\/p1\.answers\.json/);
  assert.match(text, /- q1: B ✔\n  Entendí: entendí q1\n  Por qué: porque q1\n  Confianza: seguro\n/);
  assert.match(text, /- q2: C ✘ \(correcta: B\)\n  Entendí: Pide qué error da Oracle\n  Por qué: Pensé que C porque\.\.\.\n    lo vi en clase\n  Confianza: adiviné/);
  assert.match(text, /Vuelco con mis palabras:\n"""\nUna clave identifica una fila\.\n"""/);
  assert.match(text, /Ejercicios:\n"""\nSELECT \* FROM t;\n"""/);
  await shutdown();
});

test("an already answered mini-quiz is refused with 409 and leaves the file and chat unchanged", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const file = join(topic, "mini-quiz", "p1.answers.json");
  writeFileSync(file, '{"answers":{"q1":"A","q2":"A"}}');
  const res = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: why("q1", "q2") });
  assert.equal(res.status, 409);
  assert.equal(readFileSync(file, "utf8"), '{"answers":{"q1":"A","q2":"A"}}');
  assert.equal(host.sent.length, 0);
  await shutdown();
});

test("the part page reports recorded answers with their grading once the quiz is answered", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(
    join(topic, "mini-quiz", "p1.answers.json"),
    JSON.stringify({ answers: { q1: "B", q2: "A" }, razonamientos: why("q2") }),
  );
  const page = await http((await view({ topic: TOPIC, part: "p1" })).structuredContent.url);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.answered, [
    { id: "q1", chosen: "B", correct: "B", ok: true },
    { id: "q2", chosen: "A", correct: "B", ok: false, entendi: "entendí q2", porque: "porque q2", confianza: "seguro" },
  ]);
  assert.equal(data.verdicts, null);
  await shutdown();
});

test("diagnosis submit adds only new ids of the current round and keeps recorded answers", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({ topic: TOPIC, part: "quiz" }));
  const page = await http(`${url}${TOPIC}/quiz`);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.quiz.questions.map((q) => q.id), ["d1", "d2", "d3"]);
  assert.deepEqual(data.answered, [{ id: "d1", chosen: "B", correct: "B", ok: true }]);
  const res = await submit(url, { kind: "diagnosis", topic: TOPIC, answers: { d2: "E" }, reasoning: why("d2") });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "quiz.answers.json"), "utf8")), {
    answers: { d1: "B", d2: "E" },
    razonamientos: why("d2"),
  });
  assert.match(host.sent[0].content, /^\[Vista HTML · sql-demo · diagnóstico\]/);
  const again = await submit(url, { kind: "diagnosis", topic: TOPIC, answers: { d1: "A" }, reasoning: why("d1") });
  assert.equal(again.status, 409);
  const third = await submit(url, { kind: "diagnosis", topic: TOPIC, answers: { d3: "A" }, reasoning: why("d3") });
  assert.equal(third.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "quiz.answers.json"), "utf8")), {
    answers: { d1: "B", d2: "E", d3: "A" },
    razonamientos: why("d2", "d3"),
  });
  host.sent.pop();
  assert.equal(host.sent.length, 1);
  await shutdown();
});

test("part and diagnosis pages show the tutor's concept verdicts once recorded", async () => {
  const { view, topic, shutdown } = await setup();
  const verdicts = [
    { codigo: "1.1", estado: "claro", pregunta: "q1", evidencia: "entendí q1" },
    { codigo: "1.2", estado: "laguna", pregunta: "q2", evidencia: "porque q2" },
  ];
  mkdirSync(join(topic, "feedback"));
  writeFileSync(join(topic, "feedback", "p1.json"), JSON.stringify({ partId: "p1", difficultyDetected: true, conceptos: verdicts }));
  writeFileSync(join(topic, "diagnostico-conceptos.json"), JSON.stringify({ conceptos: verdicts.slice(1) }));
  const url = base(await view({}));
  const part = await http(`${url}${TOPIC}/p1`);
  assert.deepEqual(JSON.parse(part.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]).verdicts, verdicts);
  const diagnosis = await http(`${url}${TOPIC}/quiz`);
  assert.deepEqual(JSON.parse(diagnosis.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]).verdicts, verdicts.slice(1));
  await shutdown();
});

test("a question to the tutor is sent with its context and writes no file", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "question", topic: TOPIC, part: "p1", text: "¿Por qué la PK no admite NULL?", demo: "p1-claves.html" });
  assert.equal(res.status, 200);
  assert.equal(
    host.sent[0].content,
    '[Vista HTML · sql-demo · p1 · pregunta · demo p1-claves.html]\nPregunta de la persona:\n"""\n¿Por qué la PK no admite NULL?\n"""',
  );
  assert.equal(existsSync(join(topic, "mini-quiz", "p1.answers.json")), false);
  await shutdown();
});

test("submit refuses foreign origins, non-JSON, oversize, unknown fields and invalid answers without side effects", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const valid = { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: why("q1", "q2") };
  const cases = [
    [await submit(url, valid, { origin: "http://evil.example" }), 403],
    [await submit(url, valid, { origin: "null" }), 403],
    [await submit(url, valid, { "content-type": "text/plain" }), 415],
    [await submit(url, "x".repeat(70 * 1024)), 413],
    [await submit(url, "{not json"), 400],
    [await submit(url, { ...valid, extra: 1 }), 400],
    [await submit(url, { ...valid, answers: { q1: "F", q2: "B" } }), 400],
    [await submit(url, { ...valid, answers: { q1: "B" } }), 400],
    [await submit(url, { ...valid, answers: { q1: "B", q2: "B", q9: "A" } }), 400],
    [await submit(url, { ...valid, topic: "../x" }), 400],
    [await submit(url, { ...valid, part: "p2" }), 400],
    [await submit(url, { ...valid, ownWords: "x".repeat(9000) }), 400],
    [await submit(url, { ...valid, reasoning: undefined }), 400],
    [await submit(url, { ...valid, reasoning: why("q1") }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { entendi: "x", porque: "  " } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: "solo texto" } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1", "q2"), q2: { entendi: "x", porque: "y", confianza: "seguro", extra: "z" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { entendi: "x", porque: "y" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { entendi: "x", porque: "y", confianza: "mucho" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { entendi: "x", porque: "y", confianza: "constructor" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1", "q2", "q9") } }), 400],
    [await submit(url, { kind: "prompt", topic: TOPIC, text: "rm -rf" }), 400],
    [await submit(url, { kind: "question", topic: TOPIC, text: "" }), 400],
  ];
  for (const [res, status] of cases) assert.equal(res.status, status, res.body);
  assert.equal(existsSync(join(topic, "mini-quiz", "p1.answers.json")), false);
  assert.equal(host.sent.length, 0);
  const wrongToken = await http(`${new URL(url).origin}/${"0".repeat(64)}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(url).origin },
    body: JSON.stringify(valid),
  });
  assert.equal(wrongToken.status, 404);
  assert.equal(host.sent.length, 0);
  await shutdown();
});
