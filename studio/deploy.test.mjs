// The deploy's idle gate, driven end to end: a sandbox repo, a recorded
// systemctl and the studio's own state directory. No service is touched.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
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
  const runtime = join(dir, "run");
  mkdirSync(join(home, "Learnings"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(runtime, { recursive: true });

  cpSync(join(REPO, "deploy", "vps"), join(repo, "deploy", "vps"), { recursive: true });
  mkdirSync(join(repo, "studio"), { recursive: true });
  cpSync(join(REPO, "studio", "state.ts"), join(repo, "studio", "state.ts"));
  // The steps this test is not about: the build, the tutor links and the health check.
  // The health check fails while the tree holds a `bad` file, so a test can ship a commit the studio rejects.
  writeFileSync(join(repo, "deploy", "vps", "link-tutor-context.sh"), "#!/usr/bin/env bash\nexit 0\n");
  writeFileSync(join(repo, "deploy", "vps", "health.sh"), '#!/usr/bin/env bash\n[ ! -e "$LEARNING_REPO/bad" ]\n');

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
  return {
    home,
    repo,
    bin,
    calls,
    runtime,
    stateDir,
    busy: join(stateDir, "busy.json"),
    pending: join(stateDir, "deploy-pending"),
    live: join(stateDir, "live-commit"),
    autodeployState: join(home, ".local", "state", "learning-autodeploy"),
  };
}

const gitIn = (s, ...args) => execFileSync("git", ["-C", s.repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Publishes one commit to origin/main and sets the live tree back one commit, so the next deploy has work to do. */
function publishNewCommit(s, file = "CHANGE.txt") {
  writeFileSync(join(s.repo, file), `${Date.now()}\n`);
  gitIn(s, "add", file);
  gitIn(s, "-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-m", `change ${file}`);
  const next = gitIn(s, "rev-parse", "HEAD");
  gitIn(s, "push", "origin", "main");
  gitIn(s, "reset", "--hard", "HEAD~1");
  return next;
}

function deployEnv(s) {
  return {
    ...process.env,
    HOME: s.home,
    PATH: `${s.bin}:${process.env.PATH}`,
    XDG_STATE_HOME: join(s.home, ".local", "state"),
    LEARNING_REPO: s.repo,
    SYSTEMCTL: join(s.bin, "systemctl"),
  };
}

/** Runs the real update.sh the way the deploy workflow does, with a recorded restart. */
function deploy(s, env = {}) {
  return spawnSync("bash", [join(s.repo, "deploy", "vps", "update.sh")], {
    cwd: s.repo,
    encoding: "utf8",
    env: { ...deployEnv(s), LEARNING_UPDATE_REEXEC: "1", ...env },
  });
}

/** Runs the timer's deployer, awaited so a test can answer the studio it calls. */
function autodeploy(s, env = {}) {
  return new Promise((resolve) => {
    const child = spawn("bash", [join(s.repo, "deploy", "vps", "learning-autodeploy.sh")], {
      cwd: s.repo,
      env: { ...deployEnv(s), XDG_RUNTIME_DIR: s.runtime, LEARNING_AUTODEPLOY_STATE: s.autodeployState, LEARNING_AUTODEPLOY_PATH: `${s.bin}:${process.env.PATH}`, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function restarts(s) {
  return existsSync(s.calls) ? readFileSync(s.calls, "utf8").trim().split("\n").filter(Boolean) : [];
}

function markBusyFile(s, mark) {
  mkdirSync(s.stateDir, { recursive: true });
  writeFileSync(s.busy, JSON.stringify(mark));
}

/** A turn that started a while ago and has waited past the deploy's deadline, as the first deferral left it. */
function seedPending(s, commit, secondsAgo) {
  mkdirSync(s.stateDir, { recursive: true });
  writeFileSync(s.pending, `${commit} ${Math.floor(Date.now() / 1000) - secondsAgo}\n`);
}

/**
 * The studio's abort route as the deploy sees it: it records each request and,
 * like the studio's releaseTurn, clears the busy marker before it answers.
 */
async function studioAbort(s, { token = randomBytes(32).toString("hex"), status = 200 } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requests.push({ method: req.method, path: req.url, origin: req.headers.origin, type: req.headers["content-type"], body });
      rmSync(s.busy, { force: true });
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: status === 200 }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  mkdirSync(join(s.home, ".config"), { recursive: true });
  writeFileSync(join(s.home, ".config", "learning-studio.env"), `STUDIO_PORT=${port}\nSTUDIO_TOKEN=${token}\n`, { mode: 0o600 });
  return { token, port, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** A PATH node that cannot run TypeScript, like the distro's older Node on the VPS. */
function misleadingNode(s) {
  const path = join(s.bin, "node");
  writeFileSync(path, `#!/usr/bin/env bash\nexec 1 >&2\necho 'TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"' >&2\n`);
  chmodSync(path, 0o755);
  return path;
}

test("the idle reader uses the studio's own node, not an older one on PATH", () => {
  const s = sandbox();
  misleadingNode(s);
  // The studio runs on ~/.local/node/bin/node; a deploy must read the marker with it.
  const run = deploy(s, { STUDIO_NODE: process.execPath });
  assert.equal(run.status, 0, `expected the deploy to read the marker with STUDIO_NODE: ${run.stderr}`);
  assert.deepEqual(restarts(s), ["--user restart learning-studio"]);
});

test("an unreadable idle marker aborts the deploy instead of guessing", () => {
  const s = sandbox();
  misleadingNode(s);
  const run = deploy(s, { STUDIO_NODE: join(s.bin, "node") });
  assert.notEqual(run.status, 0, "a reader that cannot run must not restart the studio or report idle");
  assert.deepEqual(restarts(s), [], "never restart on an unreadable marker");
});

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

// Item 1: a deferral is not a failure. The commit stays pending and the timer retries it every minute.
test("a deferred deploy stays pending and the autodeploy retries it next minute, with no backoff", async () => {
  const s = sandbox();
  const next = publishNewCommit(s);
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: Date.now(), topic: "redes" });

  const first = await autodeploy(s);
  assert.equal(first.status, 0, `a deferral is not a failure: ${first.stderr}`);
  assert.equal(existsSync(join(s.autodeployState, "failed")), false, "a deferral records no failure, so the next minute is not held back");
  assert.match(readFileSync(s.pending, "utf8"), new RegExp(`^${next} \\d+`), "the pending commit and the time it was first seen are recorded");

  const second = await autodeploy(s);
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stderr, /retrying after/, "the retry is not held back by a backoff");
  assert.deepEqual(restarts(s), [], "a turn in flight is still never killed");

  rmSync(s.busy);
  const third = await autodeploy(s);
  assert.equal(third.status, 0, third.stderr);
  assert.deepEqual(restarts(s), ["--user restart learning-studio"], "the pending commit is deployed once the studio is idle");
  assert.equal(readFileSync(join(s.autodeployState, "deployed"), "utf8").trim(), next);
  assert.equal(existsSync(s.pending), false, "a deployed commit leaves nothing pending");
});

test("a deploy that finds another deploy running defers instead of rebuilding under it", async () => {
  const s = sandbox();
  mkdirSync(s.stateDir, { recursive: true });
  const held = join(s.stateDir, "held");
  // The other deploy holds the lock until the test ends its process group.
  const other = spawn("flock", ["-x", join(s.stateDir, "deploy.lock"), "-c", `touch ${JSON.stringify(held)}; exec sleep 30`], { stdio: "ignore", detached: true });
  try {
    const lockDeadline = Date.now() + 10_000;
    while (!existsSync(held)) {
      assert.ok(Date.now() < lockDeadline, "the other deploy never took the lock");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const run = deploy(s, { LEARNING_UPDATE_REEXEC: "0" });
    assert.equal(run.status, 3, `expected a deferral while another deploy holds the lock: ${run.stderr}`);
    assert.deepEqual(restarts(s), [], "the second deploy never restarts a studio the first one is deploying");
  } finally {
    process.kill(-other.pid, "SIGKILL");
  }
});

// Item 2: at the deadline the turn is ended through the studio's own abort route, then the commit is deployed.
test("a turn still running at the deadline is aborted through the studio's own route, then deployed", async () => {
  const s = sandbox();
  const next = publishNewCommit(s);
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: Date.now(), topic: "probabilidad" });
  seedPending(s, next, 601);
  const studio = await studioAbort(s);
  try {
    const run = await autodeploy(s);
    assert.equal(run.status, 0, `the deadline deploy finishes: ${run.stderr}`);
    assert.equal(studio.requests.length, 1, "the deploy asks the studio once");
    const [abort] = studio.requests;
    assert.equal(abort.method, "POST");
    assert.equal(abort.path, `/${studio.token}/abort`, "the route is the page's own, behind the studio's token");
    assert.equal(abort.origin, `http://127.0.0.1:${studio.port}`, "the request comes from the studio's own origin");
    assert.equal(abort.type, "application/json");
    assert.deepEqual(JSON.parse(abort.body), { cause: "update" }, "the turn is ended because the studio is being updated");
    assert.deepEqual(restarts(s), ["--user restart learning-studio"], "the studio restarts once the turn is released");
    assert.equal(readFileSync(join(s.autodeployState, "deployed"), "utf8").trim(), next);
    assert.equal(existsSync(s.pending), false, "a deployed commit leaves nothing pending");
    assert.equal(run.stdout.includes(studio.token) || run.stderr.includes(studio.token), false, "the token is never printed");
  } finally {
    await studio.close();
  }
});

test("a deadline whose abort answer fails still restarts once the studio is idle", async () => {
  const s = sandbox();
  const next = publishNewCommit(s);
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: Date.now(), topic: "probabilidad" });
  seedPending(s, next, 601);
  // The studio releases the turn before it answers, so its runtime may fail to answer after the turn is gone.
  const studio = await studioAbort(s, { status: 500 });
  try {
    const run = await autodeploy(s);
    assert.equal(run.status, 0, `the idle marker decides the restart, not the abort's answer: ${run.stderr}`);
    assert.deepEqual(restarts(s), ["--user restart learning-studio"]);
  } finally {
    await studio.close();
  }
});

test("a deadline the deploy cannot abort through the studio restarts nothing and says why", async () => {
  const s = sandbox();
  const next = publishNewCommit(s);
  markBusyFile(s, { busy: true, pid: process.pid, startedAt: Date.now(), topic: "probabilidad" });
  seedPending(s, next, 601);
  mkdirSync(join(s.home, ".config"), { recursive: true });
  // No STUDIO_TOKEN: the studio's per-run token is not known to the deploy, so it cannot end the turn.
  writeFileSync(join(s.home, ".config", "learning-studio.env"), "STUDIO_PORT=4747\n", { mode: 0o600 });
  const run = await autodeploy(s);
  assert.notEqual(run.status, 0, "without the token the deadline cannot be met, so the deploy fails");
  assert.match(run.stderr, /STUDIO_TOKEN/, "the journal names the missing setting");
  assert.deepEqual(restarts(s), [], "never restart over a turn the deploy could not end");
});

function installAutodeploy(s) {
  return spawnSync("bash", [join(s.repo, "deploy", "vps", "install-autodeploy.sh")], {
    cwd: s.repo,
    encoding: "utf8",
    env: { ...deployEnv(s), LEARNING_AUTODEPLOY_STATE: s.autodeployState },
  });
}

// The rollback target must be the commit the studio runs: the installer takes it from the autodeploy's record only when the checkout is at that commit.
test("the installer records the live commit as the rollback target when the checkout is at the deployed commit", () => {
  const s = sandbox();
  const head = gitIn(s, "rev-parse", "HEAD");
  mkdirSync(s.autodeployState, { recursive: true });
  writeFileSync(join(s.autodeployState, "deployed"), `${head}\n`);
  const run = installAutodeploy(s);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(s.live, "utf8").trim(), head);
  assert.equal(existsSync(join(s.home, ".local", "bin", "learning-autodeploy")), true, "the deployer is installed");
});

test("the installer refuses a rollback target the checkout does not run, and changes nothing", () => {
  const s = sandbox();
  mkdirSync(s.autodeployState, { recursive: true });
  writeFileSync(join(s.autodeployState, "deployed"), `${"a".repeat(40)}\n`);
  const run = installAutodeploy(s);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /write the commit the studio runs/, "the journal says a person must decide");
  assert.equal(existsSync(s.live), false, "no rollback target is recorded");
  assert.equal(existsSync(join(s.home, ".local", "bin", "learning-autodeploy")), false, "the deployer is not replaced either");
});

// Item 4: a failed health check after the restart puts the commit the studio ran back, and says so.
test("a deploy whose health check fails goes back to the commit the studio was running", () => {
  const s = sandbox();
  const previous = gitIn(s, "rev-parse", "HEAD");
  // The new commit adds a file the health check rejects.
  const next = publishNewCommit(s, "bad");
  mkdirSync(s.stateDir, { recursive: true });
  writeFileSync(s.live, `${previous}\n`);

  const run = deploy(s, { LEARNING_UPDATE_REEXEC: "0" });
  assert.equal(run.status, 1, `a failed health check fails the deploy: ${run.stderr}`);
  assert.equal(gitIn(s, "rev-parse", "HEAD"), previous, `the tree is back on the commit the studio ran, not ${next}`);
  assert.deepEqual(restarts(s), ["--user restart learning-studio", "--user restart learning-studio"], "the rollback restarts the restored commit");
  assert.equal(readFileSync(s.live, "utf8").trim(), previous, "the restored commit is the live one");
  assert.match(run.stderr, /rolled back to /, "the journal says what was rolled back");
});

test("a failed health check with no recorded live commit says there is nothing to roll back to", () => {
  const s = sandbox();
  publishNewCommit(s, "bad");
  const run = deploy(s, { LEARNING_UPDATE_REEXEC: "0" });
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /no recorded commit to roll back to/, "a missing record is reported, never guessed");
  assert.equal(restarts(s).length, 1, "nothing is restarted over a commit the deploy cannot name");
});
