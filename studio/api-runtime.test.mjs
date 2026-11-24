// The API tutor, driven against a fake provider: the stream is what Mistral documents (deltas that
// change shape, thinking chunks, `[DONE]`), the tools are the ones the studio already labels, and a
// turn always ends in a record the studio can settle -- never in silence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApi } from "./api-runtime.ts";

const KEY = "0a1b2c3d4e5f60718293a4b5c6d7e8f9";

/** A provider that answers from a script, one response body per request it receives. */
async function provider(responses) {
  const seen = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      seen.push({ url: request.url, auth: request.headers.authorization, body: body ? JSON.parse(body) : null });
      const next = responses[Math.min(seen.length - 1, responses.length - 1)];
      if (typeof next === "function") return next(request, response);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(next);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}/v1/`, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

const data = (payload) => `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
const delta = (value, finish = null) => data({ choices: [{ delta: value, finish_reason: finish }] });

/** A turn that names one tool call and stops. */
const toolTurn = (name, args) => delta({ tool_calls: [{ index: 0, id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, "tool_calls") + data("[DONE]");
/** A turn that answers with text. */
const textTurn = (...pieces) => pieces.map((piece) => delta({ content: piece })).join("") + data("[DONE]");

function setup(responses, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "api-tutor-"));
  const engine = join(root, "bin", "learning");
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(engine, "#!/bin/sh\necho \"{\\\"status\\\":\\\"$*\\\"}\"\n", { mode: 0o755 });
  const records = [];
  const errors = [];
  const state = { settled: 0 };
  return { root, engine, records, errors, settle: () => { state.settled += 1; }, settled: () => state.settled, extra };
}

function runtime(harness, options = {}) {
  return createApi({
    root: harness.root,
    engine: harness.engine,
    env: { MISTRAL_API_KEY: KEY },
    config: { version: 2, agente: "api", modelo: "mistral-small-2603", pensamiento: "", proveedor: "mistral", ...options.config },
    onRecord: (record) => { harness.records.push(record); if (record.type === "agent_settled") harness.settle(); },
    onError: (message) => harness.errors.push(message),
    ...options,
  });
}

const until = async (predicate, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not met");
};

const text = (harness) => harness.records.filter((r) => r.type === "message_update").map((r) => r.assistantMessageEvent.delta).join("");

test("a turn writes the note the model asked for, then answers", async () => {
  const fake = await provider([toolTurn("write", { path: "tema/parte1.md", content: "la explicación" }), textTurn("Listo: ", "escribí la parte.")]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    mkdirSync(join(h.root, "tema"), { recursive: true });
    api.prompt("escribe la parte 1");
    await until(() => h.settled() >= 1);
    assert.equal(readFileSync(join(h.root, "tema", "parte1.md"), "utf8"), "la explicación");
    assert.equal(text(h), "Listo: escribí la parte.");
    const tools = h.records.filter((r) => r.type === "tool_execution_start").map((r) => r.toolName);
    assert.deepEqual(tools, ["write"], "the tool is one the page already labels");
    assert.deepEqual(h.errors, []);
    // The tool result went back to the model, so the second request carries it.
    assert.equal(fake.seen.length, 2);
    const carrier = fake.seen[1].body.messages.find((message) => message.role === "tool");
    assert.equal(carrier.tool_call_id, "call-write");
    assert.match(carrier.content, /escrito/);
  } finally { await fake.close(); }
});

test("a path outside the vault is refused, and nothing outside it changes", async () => {
  const fake = await provider([toolTurn("write", { path: "../fuera.md", content: "no" }), textTurn("No pude.")]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("escribe fuera");
    await until(() => h.settled() >= 1);
    assert.equal(existsSync(join(h.root, "..", "fuera.md")), false);
    const end = h.records.find((r) => r.type === "tool_execution_end");
    assert.equal(end.isError, true);
    assert.match(fake.seen[1].body.messages.find((m) => m.role === "tool").content, /fuera de la carpeta|refus/i);
  } finally { await fake.close(); }
});

test("bash is the study engine and nothing else", async () => {
  const fake = await provider([
    toolTurn("bash", { command: "rm -rf /tmp/nada" }),
    toolTurn("bash", { command: "learning status --json" }),
    textTurn("hecho"),
  ]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("pregunta al motor");
    await until(() => h.settled() >= 1);
    const ends = h.records.filter((r) => r.type === "tool_execution_end");
    assert.equal(ends[0].isError, true, "a command that is not the engine is refused");
    assert.equal(ends[1].isError, false, "the engine runs");
    const results = fake.seen.slice(1).map((call) => call.body.messages.filter((m) => m.role === "tool").at(-1).content);
    assert.match(results[0], /solo.*motor|refus/i);
    assert.match(results[1], /status --json/);
  } finally { await fake.close(); }
});

test("the stream is read as Mistral sends it: event lines, thinking chunks, a broken line, [DONE]", async () => {
  const body = [
    "event: message\n" + delta({ content: "Hola" }),
    delta({ content: [{ type: "thinking", text: "pensando" }, { type: "text", text: " ¿qué " }] }),
    "data: {esto no es json\n\n",
    delta({ content: [{ type: "text", text: "tal?" }] }),
    data("[DONE]"),
  ].join("");
  const fake = await provider([body]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("hola");
    await until(() => h.settled() >= 1);
    assert.equal(text(h), "Hola ¿qué tal?");
    assert.deepEqual(h.errors, [], "a line the stream cannot parse is skipped, not fatal");
  } finally { await fake.close(); }
});

test("the effort is sent only when the model accepts it", async () => {
  // `mistral-small-2603` documents high/none; a model nobody documented has no levels at all.
  const fake = await provider([textTurn("uno"), textTurn("dos")]);
  const h = setup([]);
  try {
    const accepted = runtime(h, { base: fake.base, config: { modelo: "mistral-small-2603", pensamiento: "high" } });
    accepted.prompt("uno");
    await until(() => h.settled() >= 1);
    assert.equal(fake.seen[0].body.reasoning_effort, "high");

    const unknown = runtime(h, { base: fake.base, config: { modelo: "mistral-large-latest", pensamiento: "high" } });
    unknown.prompt("dos");
    await until(() => h.settled() >= 2);
    assert.equal("reasoning_effort" in fake.seen[1].body, false);
  } finally { await fake.close(); }
});

test("no key names the variable and never reaches the network", async () => {
  const fake = await provider([textTurn("nunca")]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base, env: {} });
  try {
    api.prompt("hola");
    await until(() => h.errors.length > 0);
    assert.match(h.errors[0], /MISTRAL_API_KEY/);
    assert.equal(fake.seen.length, 0);
    await until(() => h.settled() >= 1, 1000);
  } finally { await fake.close(); }
});

test("a refused key says so without repeating the key", async () => {
  const fake = await provider([(request, response) => { response.writeHead(401, { "content-type": "application/json" }); response.end(JSON.stringify({ message: "Unauthorized" })); }]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("hola");
    await until(() => h.errors.length > 0);
    assert.match(h.errors[0], /401/);
    assert.equal(h.errors[0].includes(KEY), false, "the key is never echoed");
    await until(() => h.settled() >= 1, 1000);
  } finally { await fake.close(); }
});

test("an aborted turn ends silently and the next prompt works", async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const fake = await provider([
    async (request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(delta({ content: "a medias" }));
      await held;
      response.end(data("[DONE]"));
    },
    textTurn("de nuevo"),
  ]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("primero");
    await until(() => text(h) === "a medias");
    api.abort();
    release();
    await until(() => h.settled() >= 1);
    assert.deepEqual(h.errors, [], "a turn the learner stopped is not a failure");
    api.prompt("segundo");
    await until(() => h.settled() >= 2);
    assert.match(text(h), /de nuevo/);
  } finally { await fake.close(); }
});

test("the first message frames the studio and the tutor answers in Spanish", async () => {
  const fake = await provider([textTurn("hola")]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("buenas");
    await until(() => h.settled() >= 1);
    const system = fake.seen[0].body.messages[0];
    assert.equal(system.role, "system");
    assert.match(system.content, /Learnings studio/);
    assert.match(system.content, /neutral Spanish/);
    assert.equal(fake.seen[0].auth, `Bearer ${KEY}`);
    assert.equal(fake.seen[0].url, "/v1/chat/completions");
  } finally { await fake.close(); }
});

test("a turn that never answers is reported, not left hanging", async () => {
  const fake = await provider([delta({ content: "" }) + data("[DONE]")]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("hola");
    await until(() => h.settled() >= 1);
    assert.equal(h.errors.length, 1);
    assert.match(h.errors[0], /sin responder|no respondió/i);
  } finally { await fake.close(); }
});

test("a busy tutor refuses a second prompt instead of interleaving two turns", async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const fake = await provider([async (request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(delta({ content: "uno" }));
    await held;
    response.end(data("[DONE]"));
  }]);
  const h = setup([]);
  const api = runtime(h, { base: fake.base });
  try {
    api.prompt("uno");
    assert.throws(() => api.prompt("dos"), /busy|ocupad/i);
    release();
    await until(() => h.settled() >= 1);
  } finally { await fake.close(); }
});
