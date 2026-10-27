// Study-view bridge tests: a real HTTP server on 127.0.0.1 against a temporary
// Learnings root, driven through the public learning_view tool and HTTP routes.
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { request, createServer as httpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { countVisuals, registerBridge, listTopics } from "./bridge.ts";
import { exerciseFile, listExercises, readSubmissions, saveSubmission } from "./codevault.ts";
import { loadRunners } from "./coderun.ts";

const TOPIC = "sql-demo";

let playwright;
for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/home/alesierraalta/.npm-global/lib/node_modules/playwright/index.mjs'].filter(Boolean)) {
  try { playwright = await import(id); break; } catch {}
}
test('app pages inline shared reasoning and private bridge config', async () => {
  for (const configured of [false, true]) {
    const { view } = await setup(configured ? { transcriber: { url: 'http://127.0.0.1:1', token: 'app-private-token' } } : {});
    const result = await view({ topic: TOPIC, part: 'p1' });
    const response = await http(result.structuredContent.appUrl);
    assert.equal(response.status, 200);
    assert.match(response.body, /window\.learningThoughtField\s*=/);
    assert.match(response.body, /window\.learningDictate\s*=/);
    const config = JSON.parse(response.body.match(/window\.LEARNING_BRIDGE = (.*?);<\/script>/)[1]);
    assert.equal('transcribeUrl' in config, configured);
    assert.doesNotMatch(response.body, /app-private-token/);
  }
});

test('app dictation honors kitDir and escapes script terminators', async () => {
  const kitDir = realpathSync(mkdtempSync(join(tmpdir(), 'app-kit-')));
  writeFileSync(join(kitDir, 'dictate.js'), 'window.customDictation = "</ScRiPt><p>not markup</p>";');
  const { view } = await setup({ kitDir });
  const result = await view({ topic: TOPIC, part: 'p1' });
  const response = await http(result.structuredContent.appUrl);
  assert.ok(response.body.includes('window.customDictation = "<\\/script><p>not markup</p>";'));
  assert.doesNotMatch(response.body, /<\/ScRiPt>/);
});

test('app reasoning renders and records under its inline-only CSP', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view, topic } = await setup({ transcriber: { url: 'http://127.0.0.1:1', token: 'app-private-token' } });
  writeFileSync(join(topic, 'explicaciones', 'apps', 'p1.html'), '<!doctype html><html><head></head><body><script>document.body.append(window.learningThoughtField("q1", 0, window.LEARNING_BRIDGE));</script></body></html>');
  const browser = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const violations = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordViolation', value => violations.push(value));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.recordViolation(event.violatedDirective)));
  await page.route('**/api/transcribe', route => route.fulfill({ json: { text: 'Pensé en la clave' } }));
  const result = await view({ topic: TOPIC, part: 'p1' });
  await page.goto(result.structuredContent.appUrl);
  const field = page.getByLabel('Cómo lo pensé (opcional)');
  await field.waitFor();
  await page.getByRole('button', { name: /Dictar el razonamiento/ }).click();
  const stop = page.locator('.lk-mic');
  await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Detener');
  await page.waitForTimeout(300);
  await stop.click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Pensé en la clave');
  assert.equal(await field.inputValue(), 'Pensé en la clave');
  assert.deepEqual(violations, []);
  assert.deepEqual(errors, []);
});

test('plain part and diagnosis share optional dictable reasoning', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view, topic } = await setup({ transcriber: { url: 'http://127.0.0.1:1', token: 'never-in-page' } });
  const browser = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/api/transcribe', route => route.fulfill({ json: { text: 'Mi razonamiento dictado' } }));
  for (const part of ['p1', 'quiz']) {
    const result = await view({ topic: TOPIC, part });
    await page.goto(result.structuredContent.url);
    assert.equal(await page.getByText('¿Qué entendiste que te pide la pregunta?').count(), 0);
    assert.equal(await page.getByText('¿Por qué llegaste a esa opción?').count(), 0);
    const fields = page.locator('fieldset.quiz-question').filter({ has: page.locator('input[type=radio]:not(:disabled)') });
    assert.ok(await fields.count() > 0);
    assert.equal(await fields.locator('textarea').count(), await fields.count());
    const mic = fields.first().getByRole('button', { name: /Dictar/ });
    await mic.click();
    await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Detener');
    await page.waitForTimeout(300);
    await mic.click();
    await page.waitForFunction(() => document.querySelector('fieldset textarea')?.value === 'Mi razonamiento dictado');
    assert.equal(await fields.first().getByLabel('Cómo lo pensé (opcional)').inputValue(), 'Mi razonamiento dictado');
    if (part === 'p1') {
      for (const field of await fields.all()) {
        await field.locator('input[type=radio]').first().check();
      }
      await page.getByRole('button', { name: 'Enviar al tutor' }).click();
      await page.getByText('Indica en cada pregunta qué tan seguro estás: seguro, dudo o adiviné.').waitFor();
      for (const field of await fields.all()) await field.locator('.confidence input').first().check();
      const sent = page.waitForRequest(request => request.url().endsWith('/submit'));
      const received = page.waitForResponse(response => response.url().endsWith('/submit'));
      await page.getByRole('button', { name: 'Enviar al tutor' }).click();
      const payload = (await sent).postDataJSON();
      assert.equal((await received).status(), 200);
      const reasoning = Object.values(payload.reasoning);
      assert.deepEqual(reasoning[0], { razonamiento: 'Mi razonamiento dictado', confianza: 'seguro' });
      assert.ok(reasoning.slice(1).every(value => value.razonamiento === '' && value.confianza === 'seguro'));
      const stored = JSON.parse(readFileSync(join(topic, 'mini-quiz', 'p1.answers.json'), 'utf8'));
      assert.deepEqual(stored.razonamientos, Object.fromEntries(Object.entries(payload.reasoning).filter(([, value]) => value.razonamiento)));
      assert.equal(Object.keys(stored.answers).length, reasoning.length);
    }
  }
  const asset = await http(base(await view({ topic: TOPIC, part: 'p1' })) + 'kit/dictate.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers['content-type'], /javascript/);
});

test("dictation uploads audio privately, rejects invalid input and deletes failed jobs", async (t) => {
  const seen = []; let failed = false; let polls = 0;
  const fake = httpServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks) });
    if (req.method === "DELETE") { res.writeHead(204); return res.end(); }
    res.setHeader("content-type", "application/json");
    res.end(req.method === "PUT" ? JSON.stringify({ id: "job1" }) : req.url.endsWith("/txt") ? "hola mundo" : JSON.stringify({ status: failed ? "failed" : ["queued", "running", "done"][Math.min(polls++, 2)] }));
  });
  await new Promise(resolve => fake.listen(0, "127.0.0.1", resolve));
  t.after(() => { fake.closeAllConnections(); fake.close(); });
  const { view } = await setup({ transcriber: { url: `http://127.0.0.1:${fake.address().port}`, token: "private-transcriber-token" } });
  const result = await view({ topic: TOPIC, part: "p1" });
  const endpoint = base(result) + "api/transcribe";
  const headers = { origin: new URL(endpoint).origin, "content-type": "audio/webm" };
  const audio = Buffer.from([0, 1, 2, 255]);
  const response = await http(endpoint, { method: "POST", headers, body: audio });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { text: "hola mundo" });
  assert.equal(seen[0].auth, "Bearer private-transcriber-token");
  assert.equal(seen[0].url, "/api/jobs?filename=dictado.webm&diarize=false", "dictation is one voice: no speaker labels");
  assert.deepEqual(seen[0].body, audio);
  assert.equal(seen.at(-1).method, "DELETE");
  const count = seen.length;
  for (const [extra, body, status] of [[{ origin: "https://evil.example" }, audio, 403], [{ "content-type": "text/plain" }, audio, 415], [{}, "", 400], [{}, Buffer.alloc(15 * 1024 * 1024 + 1), 413]]) {
    assert.equal((await http(endpoint, { method: "POST", headers: { ...headers, ...extra }, body })).status, status);
    assert.equal(seen.length, count);
  }
  failed = true;
  assert.equal((await http(endpoint, { method: "POST", headers, body: audio })).status, 502);
  assert.equal(seen.at(-1).method, "DELETE");
  const page = await http(result.structuredContent.url);
  assert.doesNotMatch(page.body, /private-transcriber-token/);
  assert.match(page.body, /transcribeUrl/);
  const diagnosis = await view({ topic: TOPIC, part: 'quiz' });
  assert.equal(diagnosis.isError, false);
  const html = (await http(diagnosis.structuredContent.url)).body;
  assert.match(html, /transcribeUrl/);
  assert.doesNotMatch(html, /private-transcriber-token/);
  const plain = await setup();
  const other = await plain.view({ topic: TOPIC, part: "p1" });
  assert.equal((await http(base(other) + "api/transcribe", { method: "POST", headers, body: audio })).status, 404);
  assert.doesNotMatch((await http(other.structuredContent.url)).body, /transcribeUrl/);
});

test("public bridge origins preserve loopback access and constrain proxy requests", async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const publicOrigin = "https://box.tail0.ts.net:8446";
  const publicEmbedder = "https://box.tail0.ts.net:8445";
  const { view } = await setup({ port, publicOrigin, publicEmbedder });
  const result = await view({ topic: TOPIC, part: "p1" });
  const url = result.structuredContent.url;
  assert.match(url, /^https:\/\/box\.tail0\.ts\.net:8446\/[a-f0-9]{64}\//);
  const local = url.replace(publicOrigin, `http://127.0.0.1:${port}`);
  for (const host of [`127.0.0.1:${port}`, "box.tail0.ts.net:8446"]) {
    const page = await http(local, { headers: { host } });
    assert.equal(page.status, 200);
    assert.ok(page.headers["content-security-policy"].includes(publicEmbedder));
  }
  const app = await http(result.structuredContent.appUrl.replace(publicOrigin, `http://127.0.0.1:${port}`));
  assert.equal(app.status, 200);
  assert.match(app.headers["content-security-policy"], /frame-ancestors https:\/\/box\.tail0\.ts\.net:8445(;|$)/);
  assert.equal((await http(local, { headers: { host: "evil.example:80" } })).status, 403);
  const endpoint = `http://127.0.0.1:${port}${new URL(result.structuredContent.base).pathname}submit`;
  for (const [origin, rejected] of [[publicOrigin, false], ["https://evil.example", true]]) {
    const response = await http(endpoint, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status === 403, rejected);
  }
});

test("a second public bridge origin is authorized while the first stays canonical", async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const canonical = "https://learnings.infra.local:8446";
  const fallback = "https://10.154.59.151:8446";
  const { view } = await setup({ port, publicOrigin: `${canonical},${fallback}`, publicEmbedder: "https://learnings.infra.local,https://10.154.59.151:8445" });
  const result = await view({ topic: TOPIC, part: "p1" });
  const url = result.structuredContent.url;
  assert.match(url, /^https:\/\/learnings\.infra\.local:8446\/[a-f0-9]{64}\//);
  const local = url.replace(canonical, `http://127.0.0.1:${port}`);
  for (const host of ["learnings.infra.local:8446", "10.154.59.151:8446"]) {
    const page = await http(local, { headers: { host } });
    assert.equal(page.status, 200, host);
    assert.ok(page.headers["content-security-policy"].includes("https://learnings.infra.local"), host);
    assert.ok(page.headers["content-security-policy"].includes("https://10.154.59.151:8445"), host);
  }
  const endpoint = `http://127.0.0.1:${port}${new URL(result.structuredContent.base).pathname}submit`;
  for (const [origin, rejected] of [[canonical, false], [fallback, false], ["https://evil.example", true]]) {
    const response = await http(endpoint, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status === 403, rejected, origin);
  }
});

test("public bridge options reject non-bare HTTPS origins at registration", () => {
  for (const option of ["publicOrigin", "publicEmbedder"]) {
    for (const value of ["http://box.ts.net", "https://a.ts.net; script-src *", "*", "https://a.ts.net/path"]) {
      assert.throws(() => registerBridge(makeHost().api, { root: makeRoot().root, [option]: value }), new RegExp(option));
    }
  }
});

test("code vault lists malformed exercises and exclusively appends submission history", () => {
  const { root, topic } = makeRoot();
  const dir = codeFixture(topic);
  mkdirSync(join(topic, "codigo", "broken"));
  writeFileSync(join(topic, "codigo", "broken", "ejercicio.json"), "{}");
  const record = { lenguaje: "python", codigo: "print(1)", compilacion: { ok: true, salida: "" }, resultados: [], aprobados: 1, total: 2 };
  const first = saveSubmission(dir, record);
  const original = readFileSync(first, "utf8");
  saveSubmission(dir, { ...record, codigo: "print(2)", aprobados: 2 });
  assert.equal(readFileSync(first, "utf8"), original);
  const history = readSubmissions(dir);
  assert.equal(history.lastCode, "print(2)");
  assert.deepEqual(history.submissions.map(({ numero, aprobados, total }) => ({ numero, aprobados, total })), [{ numero: 1, aprobados: 1, total: 2 }, { numero: 2, aprobados: 2, total: 2 }]);
  assert.ok(history.submissions.every((s) => !Number.isNaN(Date.parse(s.fecha))));
  const exercises = listExercises(topic, loadRunners());
  assert.deepEqual(exercises.map((e) => e.id), ["broken", "eco"]);
  assert.match(exercises[0].error, /titulo/);
  assert.equal(exercises[1].mejor, "2/2");
  assert.equal(exercises[1].entregas, 2);
  assert.equal(listTopics(root)[0].exercises[1].mejor, "2/2");
  assert.equal(exerciseFile(topic, "eco"), join(dir, "ejercicio.json"));
  assert.throws(() => exerciseFile(topic, "../eco"));
});

function codeFixture(topic) {
  const dir = join(topic, "codigo", "eco");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ejercicio.json"), JSON.stringify({ titulo: "Eco", enunciado: "Repite la entrada", lenguaje: "python", plantilla: "print(input())", parte: "p1", tests: [
    { nombre: "visible", entrada: "hola", salida: "hola" },
    { nombre: "secreto", entrada: "HIDDEN_INPUT_97", salida: "HIDDEN_EXPECTED_98", oculto: true },
  ] }));
  return dir;
}

test("code pages, code-only topics and learning_view never expose hidden data", async () => {
  const { topic, root, view, host } = await setup();
  codeFixture(topic);
  const codeOnly = join(root, "solo-codigo");
  codeFixture(codeOnly);
  const result = await view({ topic: TOPIC, part: "codigo/eco" });
  assert.equal(result.isError, false);
  const response = await http(result.structuredContent.url);
  assert.equal(response.status, 200);
  assert.match(response.body, /"kind":"code"/);
  assert.doesNotMatch(response.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
  const leak = await http(result.structuredContent.base + TOPIC + "/file/codigo/eco/ejercicio.json");
  assert.equal(leak.status, 404);
  assert.doesNotMatch(leak.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
  for (const name of [TOPIC, "solo-codigo"]) {
    const page = await http((await view({ topic: name })).structuredContent.url);
    assert.equal(page.status, 200);
    assert.match(page.body, /"exercises":\[/);
    assert.match(page.body, /Eco/);
  }
  assert.equal((await view({ topic: TOPIC, part: "codigo/.." })).isError, true);
  assert.equal(existsSync(join(topic, "codigo", "eco", "entregas")), false);
  assert.deepEqual(host.sent, []);
});

test("code HTTP runs, free input, submissions and rejected requests", async (t) => {
  if (spawnSync("docker", ["image", "inspect", "python:3.12-alpine"]).status !== 0) return t.skip("python:3.12-alpine is not installed");
  const { topic, view, host } = await setup();
  const dir = codeFixture(topic);
  const { base } = (await view({ topic: TOPIC })).structuredContent;
  const post = (path, body, origin = new URL(base).origin) => http(base + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = { topic: TOPIC, exercise: "eco", code: "print(input())" };
  for (const [path, body, origin, status] of [
    ["submit", { ...payload, kind: "code" }, "http://foreign.invalid", 403],
    ["submit", { ...payload, kind: "code", extra: true }, undefined, 400],
    ["api/code/run", { ...payload, extra: true }, undefined, 400],
    ["submit", { ...payload, kind: "code", exercise: "../eco" }, undefined, 422],
  ]) {
    const response = await post(path, body, origin);
    assert.equal(response.status, status);
    assert.equal(typeof JSON.parse(response.body).error, "string");
    assert.equal(existsSync(join(dir, "entregas")), false);
    assert.deepEqual(host.sent, []);
  }
  const visible = await post("api/code/run", payload);
  assert.equal(visible.status, 200);
  assert.equal(JSON.parse(visible.body).resultados.length, 1);
  assert.equal(JSON.parse(visible.body).aprobados, 1);
  const free = await post("api/code/run", { ...payload, input: "libre" });
  assert.equal(free.status, 200);
  assert.equal(JSON.parse(free.body).resultados[0].estado, "ejecutado");
  assert.equal(JSON.parse(free.body).resultados[0].obtenido.trim(), "libre");
  assert.equal(existsSync(join(dir, "entregas")), false);
  assert.deepEqual(host.sent, []);
  for (const n of [1, 2]) {
    const response = await post("submit", { ...payload, kind: "code", note: "Mi enfoque" });
    assert.equal(response.status, 200);
    const data = JSON.parse(response.body);
    assert.equal(data.score, "1/2");
    assert.equal(data.saved, `codigo/eco/entregas/00${n}.json`);
    assert.doesNotMatch(response.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
    const record = JSON.parse(readFileSync(join(dir, "entregas", `00${n}.json`), "utf8"));
    assert.equal(record.numero, n);
    assert.equal(record.codigo, payload.code);
    assert.equal(record.nota, "Mi enfoque");
    assert.equal(record.resultados[1].esperado, "HIDDEN_EXPECTED_98");
    assert.equal(host.sent.length, n);
    assert.match(host.sent[n - 1].content, /\[Vista HTML · sql-demo · código eco\]/);
    assert.match(host.sent[n - 1].content, /1\/2/);
    assert.ok(host.sent[n - 1].content.includes("```python\nprint(input())\n```"));
    assert.ok(host.sent[n - 1].content.includes(data.saved));
    assert.ok(host.sent[n - 1].content.includes("HIDDEN_EXPECTED_98"));
    assert.ok(host.sent[n - 1].content.includes('"""\nMi enfoque\n"""'));
    assert.equal(host.sent[n - 1].options.deliverAs, "followUp");
  }
  const page = await http((await view({ topic: TOPIC, part: "codigo/eco" })).structuredContent.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /"lastCode":"print\(input\(\)\)"/);
  assert.doesNotMatch(page.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
});
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

async function setup(options = {}) {
  const { root, topic } = makeRoot();
  const host = makeHost();
  registerBridge(host.api, { root, ...options });
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
  Object.fromEntries(ids.map((id) => [id, { razonamiento: `pienso ${id}`, confianza: "seguro" }]));

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
  mkdirSync(join(kitDir, "fonts"));
  writeFileSync(join(kitDir, "fonts", "atkinson-400.woff2"), "wOF2");
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
  const video = await http(new URL(config.video, url).href, { method: "HEAD" });
  assert.equal(video.status, 200);
  const kit = await http(`${result.structuredContent.base}kit/kit.js`);
  assert.equal(kit.status, 200);
  assert.match(kit.headers["content-type"], /^text\/javascript/);
  assert.equal((await http(`${result.structuredContent.base}kit/nope.js`)).status, 404);
  assert.equal((await http(`${result.structuredContent.base}kit/..%2Fbridge.ts`)).status, 404);
  const font = await http(`${result.structuredContent.base}kit/fonts/atkinson-400.woff2`);
  assert.equal(font.status, 200);
  assert.match(font.headers["content-type"], /^font\/woff2/);
  assert.equal((await http(`${result.structuredContent.base}kit/fonts/..%2Fkit.css`)).status, 404);

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

test("a quick note is served with the view design, its embeds and no quiz", async () => {
  const { view, root, shutdown } = await setup();
  mkdirSync(join(root, "rapidos", "adjuntos"), { recursive: true });
  writeFileSync(join(root, "rapidos", "hash.md"), "---\ntipo: rapido\n---\n# Qué es un hash\n\n> [!video] Video\n> ![[hash.mp4]]\n");
  writeFileSync(join(root, "rapidos", "adjuntos", "hash.mp4"), "0123");
  const url = base(await view({}));
  const page = await http(`${url}rapidos/hash`);
  assert.equal(page.status, 200);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.kind, "part");
  assert.equal(data.quiz, null);
  assert.match(data.markdown, /^# Qué es un hash/);
  assert.match(data.markdown, /<video controls preload="metadata" src="file\/adjuntos\/hash\.mp4">/);
  assert.equal((await http(`${url}rapidos/file/adjuntos/hash.mp4`)).status, 200);
  assert.equal((await http(`${url}rapidos/nope`)).status, 404);
  assert.equal((await http(`${url}rapidos/..%2Fsecret`)).status, 404);
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
      q2: { razonamiento: "Pide qué error da Oracle. Pensé que C porque...\nlo vi en clase", confianza: "adivine" },
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
      q2: { razonamiento: "Pide qué error da Oracle. Pensé que C porque...\nlo vi en clase", confianza: "adivine" },
    },
  });
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.sent[0].options, { deliverAs: "followUp" });
  const text = host.sent[0].content;
  assert.match(text, /^\[Vista HTML · sql-demo · p1 · mini-quiz\]/);
  assert.match(text, /mini-quiz\/p1\.answers\.json/);
  assert.match(text, /- q1: B ✔\n  Pensamiento: pienso q1\n  Confianza: seguro\n/);
  assert.match(text, /- q2: C ✘ \(correcta: B\)\n  Pensamiento: Pide qué error da Oracle\. Pensé que C porque\.\.\.\n    lo vi en clase\n  Confianza: adiviné/);
  assert.match(text, /Vuelco con mis palabras:\n"""\nUna clave identifica una fila\.\n"""/);
  assert.match(text, /Ejercicios:\n"""\nSELECT \* FROM t;\n"""/);
  await shutdown();
});

test("reasoning written by the old two-prompt form still submits and is normalized", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({ topic: TOPIC, part: "p1" }));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: {
      q1: { entendi: "primer", porque: "segundo", confianza: "dudo" },
      q2: { entendi: "otra", porque: "razón", confianza: "seguro" },
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8")).razonamientos, {
    q1: { razonamiento: "primer\n\nsegundo", confianza: "dudo" },
    q2: { razonamiento: "otra\n\nrazón", confianza: "seguro" },
  });
  assert.match(host.sent[0].content, /Pensamiento: primer\n    \n    segundo/);
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
    { id: "q2", chosen: "A", correct: "B", ok: false, razonamiento: "pienso q2", confianza: "seguro" },
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
    { codigo: "1.1", estado: "claro", pregunta: "q1", evidencia: "pienso q1" },
    { codigo: "1.2", estado: "laguna", pregunta: "q2", evidencia: "pienso q2" },
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
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: "solo texto" } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1", "q2"), q2: { razonamiento: "y", confianza: "seguro", extra: "z" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { razonamiento: "y", confianza: "mucho" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { razonamiento: "y", confianza: "constructor" } } }), 400],
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

test("a quiz is answered without writing a thought, and the message quotes no empty reasoning", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" } });
  assert.equal(res.status, 200, res.body);
  const graded = JSON.parse(res.body);
  assert.equal(graded.score, "2/2");
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.deepEqual(saved.razonamientos, {});
  const said = host.sent.map((m) => m.content).join("\n");
  assert.match(said, /Respuestas y razonamientos guardados/);
  assert.ok(!said.includes("Pensamiento:"), said);
  await shutdown();
});

test("a thought with no text is saved as no thought, even when a confidence was picked", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: { q1: { razonamiento: "   ", confianza: "seguro" }, q2: { confianza: "dudo" } },
  });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.deepEqual(saved.razonamientos, {});
  const said = host.sent.map((m) => m.content).join("\n");
  assert.ok(!said.includes("Pensamiento:"), said);
  await shutdown();
});

test("reasoning null means the learner wrote nothing", async () => {
  const { view, topic, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: null });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.deepEqual(saved.razonamientos, {});
  await shutdown();
});

test("a thought keeps its unicode and line breaks, and the chat quotes it verbatim", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const first = "Primero descarto la clave foránea 🔑";
  const second = "porque el empleado puede no tener jefe";
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: { q1: { razonamiento: `${first}\n${second}`, confianza: "seguro" } },
  });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.equal(saved.razonamientos.q1.razonamiento, `${first}\n${second}`);
  assert.equal(saved.razonamientos.q1.confianza, "seguro");
  const said = host.sent.map((m) => m.content).join("\n");
  assert.ok(said.includes(first) && said.includes(second), said);
  assert.ok(said.indexOf(first) < said.indexOf(second), said);
  await shutdown();
});

test("a mixed answers file keeps old and new thoughts side by side", async () => {
  const { view, topic, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: { q1: { entendi: "a", porque: "b" }, q2: { razonamiento: "nuevo" } },
  });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.equal(saved.razonamientos.q2.razonamiento, "nuevo");
  assert.match(saved.razonamientos.q1.razonamiento, /a[\s\S]*b/);
  await shutdown();
});

test("the index degrades one broken topic instead of failing the gallery", () => {
  const { root } = makeRoot();
  const bomba = join(root, "bomba");
  mkdirSync(bomba, { recursive: true });
  writeFileSync(join(bomba, "plan.json"), JSON.stringify({ topic: "Bomba", parts: [{ id: "p1", slug: "p1", title: "P1" }] }));
  // `explicaciones` is a FILE: partNote's readdirSync explodes on it.
  writeFileSync(join(bomba, "explicaciones"), "not a directory");
  const rows = listTopics(root);
  const bomb = rows.find((r) => r.id === "bomba");
  assert.ok(bomb);
  assert.equal(bomb.title, "Bomba");
  assert.deepEqual(bomb.parts, []);
  assert.deepEqual(bomb.exercises, []);
  assert.ok(rows.find((r) => r.id === TOPIC).parts.length > 0);
});

test("visuals count fenced figures and inline elements, never code samples", () => {
  assert.equal(countVisuals("```python\nprint(1)\n```\n"), 0);
  assert.equal(countVisuals("```mermaid\ngraph TD; A-->B;\n```\n"), 1);
  assert.equal(countVisuals("<figure><svg viewBox='0 0 1 1'></svg></figure>"), 2);
  assert.equal(countVisuals("```text\n<svg>\n```\n"), 0, "a sample is not a figure");
  assert.equal(countVisuals("```js\nconst a = 1;\n```\n\n```mermaid\ngraph TD;\n```\n"), 1);
});

test("a topic reports what it still owes: missing parts, promised visuals and missing quiz", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gaps-")));
  const topic = join(root, "tema");
  mkdirSync(join(topic, "explicaciones"), { recursive: true });
  mkdirSync(join(topic, "mini-quiz"), { recursive: true });
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "Tema",
      parts: [
        { id: "p1", title: "Uno", slug: "Uno", visualsPlanned: true },
        { id: "p2", title: "Dos", slug: "Dos", visualsPlanned: true },
        { id: "p3", title: "Tres", slug: "Tres" },
      ],
    }),
  );
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Uno.md"), "# Uno\n\nSolo texto, ninguna figura.\n");
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Dos.md"), "# Dos\n\n```mermaid\ngraph TD; A-->B;\n```\n");
  writeFileSync(join(topic, "mini-quiz", "p2.json"), JSON.stringify({ questions: [] }));

  const [summary] = listTopics(root);
  assert.deepEqual(summary.gaps, { missing: ["p3"], noVisuals: ["p1"], noQuiz: ["p1"] });
  assert.deepEqual(summary.parts.map((p) => p.visuals), [0, 1, 0]);
});

test('wide reading mode is opt-in, spreads the prose and survives a reload', { skip: !playwright && 'playwright not installed' }, async (t) => {
  const { view, topic } = await setup();
  const sections = Array.from(
    { length: 24 },
    (_, i) =>
      `## Sección ${i + 1}\n\nUn párrafo de prueba con suficiente texto como para que el reparto en dos columnas se observe en una pantalla ancha, sin depender de una figura.\n`,
  ).join('\n');
  writeFileSync(join(topic, 'explicaciones', 'Parte 1 - Claves.md'), `# Parte 1 — Claves\n\n${sections}`);
  const result = await view({ topic: TOPIC, part: 'p1' });

  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const measure = () =>
    page.evaluate(() => {
      const prose = document.querySelector('.prose');
      const toggle = document.querySelector('.reading-toggle');
      const box = document.querySelector('#app').getBoundingClientRect();
      return {
        columns: getComputedStyle(prose).columnCount,
        width: Math.round(box.width),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        pressed: toggle?.getAttribute('aria-pressed') ?? null,
        label: toggle?.textContent ?? '',
      };
    });

  await page.goto(result.structuredContent.url);
  const narrow = await measure();
  assert.equal(narrow.columns, 'auto', 'the default reader is a single narrow flow');
  assert.ok(narrow.width <= 800, `the default reader stays narrow (${narrow.width}px)`);
  assert.equal(narrow.pressed, 'false', 'the wide mode is off by default');
  assert.match(narrow.label, /modo ancho/i, 'the reader offers the toggle');
  assert.equal(narrow.overflow, 0, 'the default reader never overflows horizontally');

  await page.getByRole('button', { name: /modo ancho/i }).click();
  const wide = await measure();
  assert.equal(wide.columns, '2', 'the wide mode splits the prose into two columns');
  assert.ok(wide.width > 1200, `the wide mode uses the horizontal space (${wide.width}px)`);
  assert.equal(wide.pressed, 'true', 'the toggle reports the mode as on');
  assert.equal(wide.overflow, 0, 'the wide mode never overflows horizontally');

  await page.reload();
  assert.equal((await measure()).columns, '2', 'the chosen mode survives a reload');

  await page.setViewportSize({ width: 900, height: 900 });
  assert.equal((await measure()).columns, 'auto', 'a narrow screen keeps one column even in wide mode');
});

test('every reader page declares the shared icon and serves it under the token', async () => {
  const { view } = await setup();
  const result = await view({ topic: TOPIC, part: 'p1' });
  const url = new URL(result.structuredContent.url);
  const page = await http(url.href);
  assert.equal(page.status, 200);
  const icon = page.body.match(/<link rel="icon" href="([^"]+)" type="image\/svg\+xml">/);
  assert.ok(icon, 'the page declares an svg icon');
  const svg = await http(new URL(icon[1], url).href);
  assert.equal(svg.status, 200);
  assert.match(svg.headers['content-type'], /^image\/svg\+xml/);
  assert.match(svg.body, /^<svg /);
  assert.equal((await http(new URL('/favicon.svg', url).href)).status, 404, 'the icon stays behind the token');
});
