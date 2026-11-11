// The deploy's idle gate, driven end to end: a sandbox repo, a recorded
// systemctl and the studio's own state directory. No service is touched.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/**
 * A repository the real `update.sh` can deploy: on `main`, at `origin/main`, with
 * the build, the tutor links and the health check replaced by stubs. The restart
 * is the one command the test records.
 */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "deploy-"));
  roots.push(dir);
  const home = join(dir, "home");
  const repo = join(dir, "repo");
  const bin = join(dir, "bin");
  mkdirSync(join(home, "Learnings"), { recursive: true });
  mkdirSync(bin, { recursive: true });

  cpSync(join(REPO, "deploy", "vps"), join(repo, "deploy", "vps"), { recursive: true });
  mkdirSync(join(repo, "studio"), { recursive: true });
  cpSync(join(REPO, "studio", "state.ts"), join(repo, "studio", "state.ts"));
  // The steps this test is not about: the build, the tutor links and the health check.
  writeFileSync(join(repo, "deploy", "vps", "link-tutor-context.sh"), "#!/usr/bin/env bash\nexit 0\n");
  writeFileSync(join(repo, "deploy", "vps", "health.sh"), "#!/usr/bin/env bash\nexit 0\n");

  const calls = join(dir, "systemctl.log");
  writeFileSync(join(bin, "go"), "#!/usr/bin/env bash\nmkdir -p bin\nprintf '#!/bin/sh\\n' > bin/learning\nchmod +x bin/learning\n");
  writeFileSync(join(bin, "systemctl"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(calls)}\n`);
  for (const name of ["go", "systemctl"]) chmodSync(join(bin, name), 0o755);

  const origin = join(dir, "origin.git");
  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin], { stdio: "ignore" });
  execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "add", "-A"]);
  execFileSync("git", ["-C", repo, "-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-m", "sandbox"], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "remote", "add", "origin", origin]);
  execFileSync("git", ["-C", repo, "push", "-u", "origin", "main"], { stdio: "ignore" });

  const stateDir = join(home, ".local", "state", "learning-studio");
  return { home, repo, bin, calls, stateDir, busy: join(stateDir, "busy.json") };
}

/** Runs the real update.sh the way the deploy workflow does, with a recorded restart. */
function deploy(s, env = {}) {
  return spawnSync("bash", [join(s.repo, "deploy", "vps", "update.sh")], {
    cwd: s.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: s.home,
      PATH: `${s.bin}:${process.env.PATH}`,
      XDG_STATE_HOME: join(s.home, ".local", "state"),
      LEARNING_REPO: s.repo,
      LEARNING_UPDATE_REEXEC: "1",
      SYSTEMCTL: join(s.bin, "systemctl"),
      LEARNING_DEPLOY_IDLE_WAIT: "0",
      LEARNING_DEPLOY_IDLE_POLL: "1",
      ...env,
    },
  });
}

function restarts(s) {
  return existsSync(s.calls) ? readFileSync(s.calls, "utf8").trim().split("\n").filter(Boolean) : [];
}

function markBusyFile(s, mark) {
  mkdirSync(s.stateDir, { recursive: true });
  writeFileSync(s.busy, JSON.stringify(mark));
}

test("an idle studio is restarted after the build", () => {
  const s = sandbox();
  const run = deploy(s);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(restarts(s), ["--user restart learning-studio"]);
});

test("a tutor turn in flight defers the restart and names the topic", () => {
  const s = sandbox();
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: Date.now(), topic: "probabilidad-representacion-y-sistemas-complejos" });
  const run = deploy(s);
  assert.equal(run.status, 3, `expected the defer exit code, got ${run.status}: ${run.stderr}`);
  assert.match(run.stderr, /deferring: the tutor is working on probabilidad-representacion-y-sistemas-complejos/);
  assert.deepEqual(restarts(s), [], "a turn in flight is never killed");
});

test("a stale marker from a crashed studio never blocks the deploy", () => {
  const s = sandbox();
  markBusyFile(s, { busy: true, pid: 2 ** 22 + 12345, startedAt: Date.now(), topic: "redes" });
  const run = deploy(s);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(restarts(s), ["--user restart learning-studio"]);
});

test("a marker older than the turn timeout never blocks the deploy", () => {
  const s = sandbox();
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: 1, topic: "redes" });
  const run = deploy(s, { LEARNING_TURN_TIMEOUT_MS: "1" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(restarts(s), ["--user restart learning-studio"]);
});

test("the deploy waits for a turn that ends inside the bound", async () => {
  const s = sandbox();
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: Date.now(), topic: "redes" });
  // The turn ends on its own: the marker goes away while the deploy is waiting.
  const end = spawn("bash", ["-c", `sleep 1; rm -f ${JSON.stringify(s.busy)}`], { stdio: "ignore" });
  const started = Date.now();
  const run = deploy(s, { LEARNING_DEPLOY_IDLE_WAIT: "5", LEARNING_DEPLOY_IDLE_POLL: "1" });
  await new Promise((resolve) => end.on("close", resolve));
  assert.equal(run.status, 0, run.stderr);
  assert.ok(Date.now() - started >= 1000, "the deploy waited for the turn to end");
  assert.deepEqual(restarts(s), ["--user restart learning-studio"]);
});
