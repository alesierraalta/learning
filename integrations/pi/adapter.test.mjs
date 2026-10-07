// Adapter contract tests: fake ExtensionAPI + CLI stub, no real provider.
// These verify the adapter's transport/activation/settle behavior only; engine
// correctness is owned by `go test ./...` in this repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { execFile as execFileCb } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import extension, { defaultDeps } from "./index.ts";

const execFileP = promisify(execFileCb);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const ENGINE_BIN = join(REPO_ROOT, "bin", "learning");
const RULES_PATH = join(REPO_ROOT, "rules", "deep.json");
const ENTRY_TYPE = "gentle-learning/enrollment";

function makeHost({ cwd, branch = [] } = {}) {
  const handlers = new Map();
  const tools = new Map();
  const commands = new Map();
  const entries = [];
  const notifications = [];
  const api = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
    appendEntry(customType, data) {
      entries.push({ type: "custom", customType, data });
    },
  };
  const ctx = {
    cwd,
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
    sessionManager: {
      getBranch: () => [...branch, ...entries],
    },
  };
  return { api, ctx, handlers, tools, commands, entries, notifications };
}

function makeEngine(script) {
  const calls = [];
  const execFile = async (file, args, opts) => {
    const call = { file, args, opts };
    calls.push(call);
    return script(call);
  };
  return { calls, execFile };
}

function tempEnv() {
  const base = mkdtempSync(join(tmpdir(), "learning-pi-"));
  const root = join(base, "Learnings");
  const topic = join(root, "demo-topic");
  mkdirSync(topic, { recursive: true });
  const engine = join(base, "engine-stub");
  writeFileSync(engine, "");
  return { base, root, topic, engine };
}

const reportJson = (status, checks = [], extra = {}) =>
  JSON.stringify({ status, stage: "quiz", checks, nextStage: "feedback", ...extra });

const passCheck = { id: "quiz-count", kind: "deterministic", status: "PASS", reason: "5 questions" };
const failCheck = {
  id: "plan-updated",
  kind: "deterministic",
  status: "FAIL",
  reason: "plan not changed after feedback",
};

function enrollmentEntry(root, workspace) {
  return {
    type: "custom",
    id: "e1",
    parentId: null,
    timestamp: "2024-01-01T00:00:00.000Z",
    customType: ENTRY_TYPE,
    data: { version: 1, active: true, root, workspace, enrolledAt: "2024-01-01T00:00:00.000Z" },
  };
}

function install(env, script, { enrolled = true, ...overrides } = {}) {
  const branch = enrolled ? [enrollmentEntry(env.root, env.topic)] : [];
  const host = makeHost({ cwd: env.topic, branch });
  const engine = makeEngine(script);
  extension(host.api, {
    root: env.root,
    enginePath: env.engine,
    execFile: engine.execFile,
    ...overrides,
  });
  return { host, engine };
}

async function enroll(host) {
  await host.handlers.get("session_start")[0]({ type: "session_start" }, host.ctx);
}

const settleEvent = (canContinue) => ({
  type: "agent_before_settle",
  entries: [],
  continue: false,
  outcome: "completed",
  context: { canContinue, entries: [], contextEntries: [], llmMessages: [], pendingMessages: [] },
});

async function settle(host, canContinue = true) {
  const handler = host.handlers.get("agent_before_settle")?.[0];
  assert.ok(handler, "agent_before_settle handler registered");
  return handler(settleEvent(canContinue), host.ctx);
}

const executeTool = (host, params) => {
  const tool = host.tools.get("learning_stage");
  assert.ok(tool, "learning_stage tool registered");
  return tool.execute("call-1", params, undefined, undefined, host.ctx);
};

const runCommand = (host, args) => {
  const command = host.commands.get("learning");
  assert.ok(command, "/learning command registered");
  return command.handler(args, host.ctx);
};

test("stage tool builds exact execFile argv and returns the CLI JSON report", async () => {
  const env = tempEnv();
  const report = { status: "accepted", stage: "quiz", checks: [passCheck], nextStage: "feedback" };
  const { host, engine } = install(env, async () => ({ code: 0, stdout: JSON.stringify(report), stderr: "" }));
  await enroll(host);

  const result = await executeTool(host, { action: "validate", stage: "quiz" });

  assert.equal(engine.calls.length, 1);
  const { file, args, opts } = engine.calls[0];
  assert.equal(file, env.engine, "fixed engine executable path, no PATH lookup");
  assert.deepEqual(args, [
    "validate",
    "--root",
    realpathSync(env.root),
    "--workspace",
    realpathSync(env.topic),
    "--rules",
    RULES_PATH,
    "--mode",
    "deep",
    "--stage",
    "quiz",
    "--json",
  ]);
  assert.equal(opts.cwd, env.topic, "engine runs inside the workspace");
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, report);
  assert.match(result.content[0].text, /"status": "accepted"/);
});

test("stage tool surfaces engine rejection (exit 1) as isError with the report intact", async () => {
  const env = tempEnv();
  const { host } = install(env, async () => ({
    code: 1,
    stdout: reportJson("blocked", [failCheck]),
    stderr: "",
  }));
  await enroll(host);

  const result = await executeTool(host, { action: "advance", stage: "quiz" });

  assert.equal(result.isError, true, "failed mandatory validation is an error result");
  assert.equal(result.structuredContent.status, "blocked");
  assert.equal(result.structuredContent.checks[0].status, "FAIL");
});

test("stage tool rejects malformed engine output with a machine-readable adapter error", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: "not json at all\n", stderr: "" }));
  await enroll(host);

  const result = await executeTool(host, { action: "status" });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.source, "adapter");
  assert.equal(result.structuredContent.reason, "malformed");
  assert.equal(engine.calls.length, 1, "engine was invoked; its output is what failed");
});

test("stage tool reports a missing engine binary and never falls back", async () => {
  const env = tempEnv();
  assert.equal(defaultDeps().enginePath, ENGINE_BIN, "default binary path is fixed to the repository");
  assert.equal(defaultDeps().rulesPath, RULES_PATH, "default rules path is fixed to the repository");
  const missingEngine = join(env.base, "no-such-engine");
  const host = makeHost({ cwd: env.topic, branch: [enrollmentEntry(env.root, env.topic)] });
  const engine = makeEngine(async () => ({ code: 0, stdout: "{}", stderr: "" }));
  extension(host.api, { root: env.root, enginePath: missingEngine, execFile: engine.execFile });
  await enroll(host);

  const result = await executeTool(host, { action: "validate", stage: "quiz" });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.reason, "binary-missing");
  assert.ok(result.structuredContent.detail.includes(missingEngine), "names the configured binary path");
  assert.match(result.structuredContent.detail, /go build -o bin\/learning/);
  assert.equal(engine.calls.length, 0, "no execution attempt without the fixed binary");
});

test("stage tool refuses advance without an explicit stage before touching the engine", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
  await enroll(host);

  const result = await executeTool(host, { action: "advance" });

  assert.equal(result.isError, true);
  assert.match(result.structuredContent.detail, /explicit stage/i);
  assert.equal(engine.calls.length, 0, "advance never fires without an explicit stage");
});

test("stage tool review action builds exact argv with stage, rule, verdict and reason", async () => {
  const env = tempEnv();
  const report = { status: "accepted", stage: "explanation", checks: [passCheck] };
  const { host, engine } = install(env, async () => ({ code: 0, stdout: JSON.stringify(report), stderr: "" }));
  await enroll(host);

  const result = await executeTool(host, {
    action: "review",
    stage: "explanation",
    rule: "explanation-adapted",
    verdict: "PASS",
    reason: "the explanation addresses the diagnosed consensus-difficulty",
  });

  assert.equal(engine.calls.length, 1);
  assert.deepEqual(engine.calls[0].args, [
    "review",
    "--root",
    realpathSync(env.root),
    "--workspace",
    realpathSync(env.topic),
    "--rules",
    RULES_PATH,
    "--mode",
    "deep",
    "--stage",
    "explanation",
    "--rule",
    "explanation-adapted",
    "--verdict",
    "PASS",
    "--reason",
    "the explanation addresses the diagnosed consensus-difficulty",
    "--json",
  ]);
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, report);
});

test("stage tool review passes an explicit reviewer through to the CLI", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
  await enroll(host);

  await executeTool(host, {
    action: "review",
    stage: "explanation",
    rule: "explanation-adapted",
    verdict: "FAIL",
    reason: "the example does not reference the diagnosed error",
    reviewer: "subagent-adaptation",
  });

  const args = engine.calls[0].args;
  const reviewerAt = args.indexOf("--reviewer");
  assert.ok(reviewerAt > 0, "--reviewer flag present when given");
  assert.equal(args[reviewerAt + 1], "subagent-adaptation");
});

test("stage tool review refuses incomplete arguments before touching the engine", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
  await enroll(host);

  const cases = [
    { action: "review", rule: "explanation-adapted", verdict: "PASS", reason: "ok reason" },
    { action: "review", stage: "explanation", verdict: "PASS", reason: "ok reason" },
    { action: "review", stage: "explanation", rule: "explanation-adapted", reason: "ok reason" },
    { action: "review", stage: "explanation", rule: "explanation-adapted", verdict: "PASS" },
  ];
  for (const params of cases) {
    const result = await executeTool(host, params);
    assert.equal(result.isError, true, JSON.stringify(params));
    assert.equal(result.structuredContent.source, "adapter");
    assert.equal(result.structuredContent.reason, "invalid-arguments");
    assert.match(result.structuredContent.detail, /review requires/i);
  }
  assert.equal(engine.calls.length, 0, "no engine call with an incomplete review");
});

test("stage tool without an active deep session reports inactive and skips the engine", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }), { enrolled: false });

  const result = await executeTool(host, { action: "validate", stage: "quiz" });

  assert.equal(result.isError, true);
  assert.match(result.structuredContent.detail, /no active deep/i);
  assert.equal(engine.calls.length, 0, "conceptual mode never reaches the engine");
});

test("settle gate is absent without enrollment and no global prompt handlers exist", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }), { enrolled: false });

  const result = await settle(host, true);

  assert.equal(result, undefined, "no gate without explicit deep enrollment");
  assert.equal(engine.calls.length, 0, "no engine call without enrollment");
  for (const event of ["before_agent_start", "context", "context_with_system"]) {
    assert.equal(host.handlers.has(event), false, `no ${event} handler: no global prompt injection`);
  }
});

test("settle requests bounded correction on failure, status command only", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({
    code: 1,
    stdout: reportJson("blocked", [failCheck]),
    stderr: "",
  }));
  await enroll(host);

  const r1 = await settle(host, true);
  const r2 = await settle(host, true);
  const r3 = await settle(host, true);
  const r4 = await settle(host, true);

  assert.equal(r1.continue, true, "first failure requests one correction");
  assert.equal(r2.continue, true);
  assert.notEqual(r3.continue, true, "continuation is bounded, no infinite retry");
  assert.notEqual(r4.continue, true);
  assert.equal(r1.entries.length, 1);
  assert.equal(r1.entries[0].type, "custom_message");
  assert.equal(r1.entries[0].display, true, "blocked state stays visible in the transcript");
  assert.match(r1.entries[0].content, /plan-updated/);
  assert.match(r3.entries[0].content, /not complete|blocked/i);
  assert.ok(
    engine.calls.every((call) => call.args[0] === "status"),
    "settle rechecks state via status only; advance is never called here",
  );
  assert.equal(engine.calls.length, 4);
});

test("settle treats a waiting status as a legitimate pause, not a gate", async () => {
  const env = tempEnv();
  const { host } = install(env, async () => ({
    code: 0,
    stdout: reportJson("waiting", [{ id: "own-words", kind: "deterministic", status: "SKIP", reason: "awaiting learner" }]),
    stderr: "",
  }));
  await enroll(host);

  const result = await settle(host, true);

  assert.equal(result, undefined, "waiting for user input neither blocks nor completes");
});

test("settle gates on a FAIL check even when the status reads completed", async () => {
  const env = tempEnv();
  const { host } = install(env, async () => ({
    code: 0,
    stdout: reportJson("completed", [failCheck]),
    stderr: "",
  }));
  await enroll(host);

  const result = await settle(host, true);

  assert.equal(result.continue, true, "a FAIL check always blocks the settle");
  assert.match(result.entries[0].content, /plan-updated/);
});

test("settle fails closed on malformed engine output without requesting continuation", async () => {
  const env = tempEnv();
  const { host, engine } = install(env, async () => ({ code: 0, stdout: "<html>oops</html>", stderr: "" }));
  await enroll(host);

  const result = await settle(host, true);

  assert.equal(engine.calls.length, 1);
  assert.notEqual(result.continue, true, "unavailable engine output never continues");
  assert.equal(result.entries.length, 1, "explicit blocked status is left behind");
  assert.match(result.entries[0].content, /blocked/i);
});

test("enrollment round trip: start persists, reload rebuilds active, stop persists off", async () => {
  const env = tempEnv();
  const rootReal = realpathSync(env.root);
  const topicReal = realpathSync(env.topic);

  // Session A: /learning start persists enrollment and asks the engine for status.
  const a = makeHost({ cwd: env.topic });
  const engineA = makeEngine(async () => ({ code: 0, stdout: reportJson("accepted", [passCheck]), stderr: "" }));
  extension(a.api, { root: env.root, enginePath: env.engine, execFile: engineA.execFile });
  await runCommand(a, "start");
  assert.equal(a.entries.length, 1, "start appends exactly one enrollment record");
  assert.equal(a.entries[0].customType, ENTRY_TYPE);
  assert.equal(a.entries[0].data.active, true);
  assert.deepEqual(engineA.calls[0].args, [
    "status",
    "--root",
    rootReal,
    "--workspace",
    topicReal,
    "--rules",
    RULES_PATH,
    "--mode",
    "deep",
    "--json",
  ]);

  // Session B (reload): branch entries rebuild the active session instead of dropping it.
  const b = makeHost({ cwd: env.topic, branch: a.entries });
  const engineB = makeEngine(async () => ({ code: 1, stdout: reportJson("blocked", [failCheck]), stderr: "" }));
  extension(b.api, { root: env.root, enginePath: env.engine, execFile: engineB.execFile });
  await enroll(b);
  const gateB = await settle(b, true);
  assert.equal(gateB.continue, true, "reloaded session is still a live deep session");

  await runCommand(b, "stop");
  assert.equal(b.entries.at(-1).data.active, false, "stop persists deactivation");

  // Session C: deactivation survives reload and the gate stays silent.
  const c = makeHost({ cwd: env.topic, branch: b.entries });
  const engineC = makeEngine(async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
  extension(c.api, { root: env.root, enginePath: env.engine, execFile: engineC.execFile });
  await enroll(c);
  const gateC = await settle(c, true);
  assert.equal(gateC, undefined);
  assert.equal(engineC.calls.length, 0, "stopped session never reaches the engine");
});

test("reload detects a workspace escape and blocks without calling the engine", async () => {
  const env = tempEnv();
  const outside = join(env.base, "outside");
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, join(env.root, "escaped"), "dir");

  const escaped = enrollmentEntry(env.root, join(env.root, "escaped"));
  const host = makeHost({ cwd: env.topic, branch: [escaped] });
  const engine = makeEngine(async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
  extension(host.api, { root: env.root, enginePath: env.engine, execFile: engine.execFile });
  await enroll(host);

  const result = await settle(host, true);
  assert.notEqual(result.continue, true);
  assert.equal(result.entries.length, 1, "compromised enrollment is visible, not silently dropped");
  assert.equal(engine.calls.length, 0, "engine is not invoked with an escaped workspace");

  // Malformed persisted enrollment fails closed the same way.
  const malformedHost = makeHost({ cwd: env.topic, branch: [{ type: "custom", customType: ENTRY_TYPE, data: { version: 1, active: true } }] });
  const malformedEngine = makeEngine(async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
  extension(malformedHost.api, { root: env.root, enginePath: env.engine, execFile: malformedEngine.execFile });
  await enroll(malformedHost);
  const malformedResult = await settle(malformedHost, true);
  assert.notEqual(malformedResult.continue, true);
  assert.equal(malformedEngine.calls.length, 0);
});

test("command start rejects a symlinked workspace outside the Learnings root", async () => {
  const env = tempEnv();
  const outside = join(env.base, "outside");
  mkdirSync(outside, { recursive: true });
  const link = join(env.root, "link");
  symlinkSync(outside, link, "dir");

  const { host, engine } = install(env, async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }), { enrolled: false });

  await runCommand(host, `start ${link}`);

  assert.equal(host.entries.length, 0, "no enrollment record for an escaped workspace");
  assert.equal(host.notifications.at(-1).level, "warning");
  assert.equal(engine.calls.length, 0, "engine not called before activation is accepted");
  const gate = await settle(host, true);
  assert.equal(gate, undefined, "rejected activation leaves conceptual mode untouched");
});

test("sessions outside Learnings cannot enroll or restore an in-root topic", async () => {
  for (const action of ["start", "init", "restore"]) {
    const env = tempEnv();
    const outside = join(env.base, "unrelated-project");
    mkdirSync(outside);
    const branch = action === "restore" ? [enrollmentEntry(env.root, env.topic)] : [];
    const host = makeHost({ cwd: outside, branch });
    const engine = makeEngine(async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" }));
    extension(host.api, { root: env.root, enginePath: env.engine, execFile: engine.execFile });
    await enroll(host);
    if (action !== "restore") await runCommand(host, `${action} ${env.topic}`);
    assert.equal(host.entries.length, 0, `${action}: no enrollment outside scoped cwd`);
    assert.equal(await settle(host), undefined, `${action}: no educational gate outside Learnings`);
    const result = await executeTool(host, { action: "status" });
    assert.equal(result.isError, true, `${action}: out-of-scope tool is inactive`);
    assert.equal(engine.calls.length, 0, `${action}: no engine calls outside Learnings`);
  }
});

test("correction budget resets when the user sends a new input", async () => {
  const env = tempEnv();
  const { host } = install(env, async () => ({ code: 1, stdout: reportJson("blocked", [failCheck]), stderr: "" }));
  await enroll(host);

  await settle(host, true);
  await settle(host, true);
  const blocked = await settle(host, true);
  assert.notEqual(blocked.continue, true, "budget exhausted within one user input");

  const inputHandler = host.handlers.get("input")?.[0];
  assert.ok(inputHandler, "input handler registered");
  await inputHandler({ type: "input", text: "fixed the plan" }, host.ctx);

  const afterInput = await settle(host, true);
  assert.equal(afterInput.continue, true, "a new user input restores the correction budget");
});

test(
  "live CLI seam: real engine binary emits exactly one machine-readable status report",
  {
    skip: existsSync(ENGINE_BIN) ? false : "engine binary bin/learning not built yet (engine task in progress)",
  },
  async (t) => {
    const env = tempEnv();
    const args = [
      "status",
      "--root",
      realpathSync(env.root),
      "--workspace",
      realpathSync(env.topic),
      "--rules",
      RULES_PATH,
      "--mode",
      "deep",
      "--json",
    ];
    let code = 0;
    let stdout = "";
    try {
      const out = await execFileP(ENGINE_BIN, args, { cwd: env.topic, timeout: 15_000, encoding: "utf8" });
      stdout = out.stdout;
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "EACCES") {
        t.skip(`engine binary not executable (${err.code})`);
        return;
      }
      if (typeof err.code === "number") {
        code = err.code;
        stdout = err.stdout ?? "";
      } else {
        t.fail(`engine did not complete normally: ${err.message}`);
        return;
      }
    }
    assert.ok([0, 1, 2].includes(code), `exit code ${code} is one of 0/1/2`);
    let report;
    try {
      report = JSON.parse(stdout);
    } catch {
      assert.fail(`stdout is not exactly one JSON object: ${JSON.stringify(stdout.slice(0, 200))}`);
    }
    assert.equal(typeof report, "object");
    assert.notEqual(report, null);
    assert.equal(typeof report.status, "string", "report carries a string status");
    if (report.checks !== undefined) {
      assert.ok(Array.isArray(report.checks));
      for (const check of report.checks) {
        assert.equal(typeof check.id, "string");
        assert.ok(["PASS", "FAIL", "SKIP"].includes(check.status));
      }
    }
  },
);

// Organic enrollment: the chat enrolls through the tool, the learner never
// types a command. init creates the topic folder inside the Learnings root and
// records a new run; start resumes an existing topic.
const okEngine = async () => ({ code: 0, stdout: reportJson("accepted"), stderr: "" });

function installAtRoot(env, script = okEngine) {
  const host = makeHost({ cwd: env.root });
  const engine = makeEngine(script);
  extension(host.api, { root: env.root, enginePath: env.engine, execFile: engine.execFile });
  return { host, engine };
}

test("stage tool init creates the topic, records a new run and activates the session", async () => {
  const env = tempEnv();
  const { host, engine } = installAtRoot(env);
  await enroll(host);

  const result = await executeTool(host, { action: "init", topic: "nuevo-tema" });

  const created = join(env.root, "nuevo-tema");
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.ok(existsSync(created), "topic folder created inside the Learnings root");
  assert.equal(engine.calls.length, 1);
  assert.deepEqual(engine.calls[0].args.slice(0, 5), ["init", "--root", realpathSync(env.root), "--workspace", realpathSync(created)]);
  const enrollment = host.entries.at(-1);
  assert.equal(enrollment.customType, ENTRY_TYPE);
  assert.equal(enrollment.data.active, true);
  assert.equal(enrollment.data.workspace, realpathSync(created));

  await executeTool(host, { action: "validate", stage: "preparation" });
  assert.equal(engine.calls.length, 2, "session is active after init");
  assert.equal(engine.calls[1].args[0], "validate");
});

test("stage tool start resumes an existing topic with a status read", async () => {
  const env = tempEnv();
  const { host, engine } = installAtRoot(env);
  await enroll(host);

  const result = await executeTool(host, { action: "start", topic: "demo-topic" });

  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(engine.calls.length, 1);
  assert.deepEqual(engine.calls[0].args.slice(0, 5), ["status", "--root", realpathSync(env.root), "--workspace", realpathSync(env.topic)]);
  assert.equal(host.entries.at(-1).data.workspace, realpathSync(env.topic));
});

test("stage tool start refuses a topic that does not exist and creates nothing", async () => {
  const env = tempEnv();
  const { host, engine } = installAtRoot(env);
  await enroll(host);

  const result = await executeTool(host, { action: "start", topic: "no-existe" });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.reason, "not-found");
  assert.match(result.structuredContent.detail, /no-existe/);
  assert.equal(existsSync(join(env.root, "no-existe")), false);
  assert.equal(engine.calls.length, 0);
  assert.equal(host.entries.length, 0);
});

test("stage tool enrollment rejects unsafe topic names before touching disk or engine", async () => {
  for (const topic of ["", ".", "..", "../fuera", "a/b", "a\\b"]) {
    const env = tempEnv();
    const { host, engine } = installAtRoot(env);
    await enroll(host);

    const result = await executeTool(host, { action: "init", topic });

    assert.equal(result.isError, true, `topic ${JSON.stringify(topic)} rejected`);
    assert.equal(result.structuredContent.reason, "invalid-arguments");
    assert.equal(existsSync(join(env.base, "fuera")), false);
    assert.equal(engine.calls.length, 0);
    assert.equal(host.entries.length, 0);
  }
});

test("stage tool enrollment is refused outside the Learnings root", async () => {
  const env = tempEnv();
  const outside = join(env.base, "unrelated-project");
  mkdirSync(outside);
  const host = makeHost({ cwd: outside });
  const engine = makeEngine(okEngine);
  extension(host.api, { root: env.root, enginePath: env.engine, execFile: engine.execFile });
  await enroll(host);

  const result = await executeTool(host, { action: "init", topic: "nuevo-tema" });

  assert.equal(result.isError, true);
  assert.equal(existsSync(join(env.root, "nuevo-tema")), false);
  assert.equal(engine.calls.length, 0);
  assert.equal(host.entries.length, 0);
});
