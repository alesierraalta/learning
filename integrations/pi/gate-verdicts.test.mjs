import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO = join(dirname(import.meta.dirname), "..");
const EXPLAIN_CHECK = join(REPO, "tools", "explain-check.mjs");
const scratch = (prefix) => mkdtempSync(join(tmpdir(), prefix));
const storeAt = (root) => join(root, ".learning-cache", "gate-verdicts.json");

function fakeGate(root, source) {
  const gateToolPath = join(root, "fake-explain-check.mjs");
  writeFileSync(gateToolPath, source);
  return gateToolPath;
}

function cacheOptions(root, gateToolPath, extra = {}) {
  return { root, gateToolPath, gateVerdictsFile: storeAt(root), ...extra };
}

test("startup warming runs existing rich pages one at a time and leaves later warm-ups cached", async () => {
  const { warmGateVerdicts } = await import("./gate-verdicts.ts");
  const root = scratch("gate-warmup-");
  const pages = join(root, "redes", "explicaciones");
  mkdirSync(pages, { recursive: true });
  writeFileSync(join(pages, "Parte 1 - Capas.html"), "<html>primera</html>");
  writeFileSync(join(pages, "Parte 2 - TCP.html"), "<html>segunda</html>");
  writeFileSync(join(pages, "nota.md"), "no es una página rica");
  const log = join(root, "runs.log");
  const gateToolPath = fakeGate(root, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(log)}, "start\\n");`,
    "await new Promise(resolve => setTimeout(resolve, 80));",
    `appendFileSync(${JSON.stringify(log)}, "end\\n");`,
    'console.log(JSON.stringify({ serves: true }));',
    "",
  ].join("\n"));
  const options = cacheOptions(root, gateToolPath);

  await warmGateVerdicts(root, options);
  assert.equal(readFileSync(log, "utf8"), "start\nend\nstart\nend\n", "rich pages warm sequentially");
  await warmGateVerdicts(root, options);
  assert.equal(readFileSync(log, "utf8"), "start\nend\nstart\nend\n", "a later warm-up does not rerun cached verdicts");
});

test("explain-check exit codes distinguish clean, authoring-only and serving failures", () => {
  const root = scratch("gate-exit-contract-");
  const authoringOnly = join(REPO, "tools", "register", "fixtures", "bench305", "tcp-handshake-sin-senales.html");
  const clean = join(REPO, "tools", "register", "fixtures", "bench265", "clean", "tcp-handshake.html");
  const servingFailure = join(root, "serving-failure.html");
  writeFileSync(servingFailure, "<html><body>sin ruta</body></html>");
  const run = (file) => {
    const child = spawnSync(process.execPath, [EXPLAIN_CHECK, file, "--json"], { encoding: "utf8" });
    return { status: child.status, report: JSON.parse(child.stdout) };
  };

  const cleanRun = run(clean);
  assert.equal(cleanRun.status, 0);
  assert.equal(cleanRun.report.serves, true);
  assert.equal(cleanRun.report.ok, true);

  const authoringRun = run(authoringOnly);
  assert.equal(authoringRun.status, 1);
  assert.equal(authoringRun.report.ok, false);
  assert.equal(authoringRun.report.serves, true);
  assert.ok(authoringRun.report.rows.filter((row) => !row.ok).every((row) => row.authoringOnly));

  const servingRun = run(servingFailure);
  assert.equal(servingRun.status, 1);
  assert.equal(servingRun.report.serves, false);
  assert.ok(servingRun.report.rows.some((row) => !row.ok && !row.authoringOnly));
});

test("gate execution accepts only documented exits and a boolean serving verdict", async () => {
  const { getGateVerdict } = await import("./gate-verdicts.ts");
  const cases = [
    { name: "exit-zero", source: 'console.log(JSON.stringify({ serves: true }));', expected: true },
    { name: "authoring-only-exit-one", source: 'console.log(JSON.stringify({ serves: true })); process.exitCode = 1;', expected: true },
    { name: "serving-rule-exit-one", source: 'console.log(JSON.stringify({ serves: false })); process.exitCode = 1;', expected: false },
    { name: "undocumented-exit", source: 'console.log(JSON.stringify({ serves: true })); process.exitCode = 2;', expected: false },
    { name: "unparseable-json", source: 'console.log("not json");', expected: false },
    { name: "missing-serving-field", source: 'console.log(JSON.stringify({ ok: true }));', expected: false },
    { name: "non-boolean-serving-field", source: 'console.log(JSON.stringify({ serves: "true" }));', expected: false },
    { name: "signal-kill", source: 'process.stdout.write(JSON.stringify({ serves: true }) + "\\n", () => process.kill(process.pid, "SIGTERM"));', expected: false },
    { name: "timeout", source: 'process.stdout.write(JSON.stringify({ serves: true }) + "\\n"); await new Promise(resolve => setTimeout(resolve, 1000));', expected: false, gateTimeoutMs: 30 },
  ];
  for (const scenario of cases) {
    const root = scratch(`gate-${scenario.name}-`);
    const page = join(root, "part.html");
    writeFileSync(page, `<html>${scenario.name}</html>`);
    const gateToolPath = fakeGate(root, `${scenario.source}\n`);
    const result = await getGateVerdict(page, cacheOptions(root, gateToolPath, { gateTimeoutMs: scenario.gateTimeoutMs }));
    assert.equal(result, scenario.expected, scenario.name);
    if (!scenario.expected) {
      const store = storeAt(root);
      const entries = existsSync(store) ? Object.values(JSON.parse(readFileSync(store, "utf8")).verdicts) : [];
      assert.equal(entries.includes(true), false, `${scenario.name} is never persisted as a pass`);
    }
  }

  const root = scratch("gate-spawn-error-");
  const page = join(root, "part.html");
  writeFileSync(page, "<html>spawn error</html>");
  const gateToolPath = fakeGate(root, 'console.log(JSON.stringify({ serves: true }));');
  assert.equal(await getGateVerdict(page, cacheOptions(root, gateToolPath, { gateNodePath: join(root, "missing-node") })), false);
  assert.equal(existsSync(storeAt(root)), false, "a spawn error never stores a pass");
});

test("unsafe cache symlinks are ignored, logged once, and never read or written", async () => {
  const { getGateVerdict } = await import("./gate-verdicts.ts");
  const root = scratch("gate-symlink-root-");
  const outside = scratch("gate-symlink-outside-");
  const page = join(root, "part.html");
  const runs = join(root, "gate-runs.log");
  const cacheDir = join(root, ".learning-cache");
  writeFileSync(page, "<html>same bytes</html>");
  const gateToolPath = fakeGate(root, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(runs)}, "run\\n");`,
    'console.log(JSON.stringify({ serves: true }));',
    "",
  ].join("\n"));
  symlinkSync(outside, cacheDir, "dir");
  const originalWrite = process.stderr.write;
  let warnings = "";
  process.stderr.write = (chunk) => { warnings += String(chunk); return true; };
  try {
    const options = cacheOptions(root, gateToolPath);
    assert.equal(await getGateVerdict(page, options), true);
    assert.equal(await getGateVerdict(page, options), true);
  } finally {
    process.stderr.write = originalWrite;
  }
  assert.deepEqual(readdirSync(outside), [], "an outside cache directory remains untouched");
  assert.equal(readFileSync(runs, "utf8"), "run\nrun\n", "without a safe store, each request recomputes");
  assert.equal((warnings.match(/cache unavailable/g) ?? []).length, 1, "the unsafe store is reported once");

  const bootstrap = scratch("gate-symlink-bootstrap-");
  const rooted = scratch("gate-symlink-file-root-");
  const external = scratch("gate-symlink-file-outside-");
  const sharedGate = join(bootstrap, "shared-gate.mjs");
  const sharedPage = "<html>same bytes</html>";
  const bootstrapPage = join(bootstrap, "part.html");
  const rootedPage = join(rooted, "part.html");
  const sharedRuns = join(bootstrap, "runs.log");
  writeFileSync(bootstrapPage, sharedPage);
  writeFileSync(rootedPage, sharedPage);
  writeFileSync(sharedGate, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(sharedRuns)}, "run\\n");`,
    `console.log(JSON.stringify({ serves: process.argv[2] === ${JSON.stringify(bootstrapPage)} }));`,
    "",
  ].join("\n"));
  const bootstrapOptions = cacheOptions(bootstrap, sharedGate);
  assert.equal(await getGateVerdict(bootstrapPage, bootstrapOptions), true);
  const externalStore = join(external, "foreign-store.json");
  const trustedBytes = readFileSync(storeAt(bootstrap));
  writeFileSync(externalStore, trustedBytes);
  mkdirSync(join(rooted, ".learning-cache"), { recursive: true });
  symlinkSync(externalStore, storeAt(rooted));
  const rootedOptions = cacheOptions(rooted, sharedGate);
  const fileWarningsOriginal = process.stderr.write;
  let fileWarnings = "";
  process.stderr.write = (chunk) => { fileWarnings += String(chunk); return true; };
  try {
    assert.equal(await getGateVerdict(rootedPage, rootedOptions), false, "a symlinked external PASS is not trusted");
    assert.equal(await getGateVerdict(rootedPage, rootedOptions), false);
  } finally {
    process.stderr.write = fileWarningsOriginal;
  }
  assert.equal((fileWarnings.match(/cache unavailable/g) ?? []).length, 1, "the symlinked store file is reported once");
  assert.equal(readFileSync(externalStore).toString(), trustedBytes.toString(), "the external store is not overwritten");
  assert.equal(lstatSync(storeAt(rooted)).isSymbolicLink(), true, "the store symlink remains unavailable");
  assert.equal(readFileSync(sharedRuns, "utf8"), "run\nrun\nrun\n", "the unsafe PASS was bypassed and both requests recomputed");
});

test("a malformed verdict entry is ignored without losing valid cache entries", async () => {
  const { getGateVerdict } = await import("./gate-verdicts.ts");
  const root = scratch("gate-malformed-entry-");
  const firstPage = join(root, "first.html");
  const secondPage = join(root, "second.html");
  const log = join(root, "runs.log");
  const gateToolPath = fakeGate(root, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(log)}, "run\\n");`,
    'console.log(JSON.stringify({ serves: true }));',
    "",
  ].join("\n"));
  writeFileSync(firstPage, "<html>first</html>");
  writeFileSync(secondPage, "<html>second</html>");
  const options = cacheOptions(root, gateToolPath);
  assert.equal(await getGateVerdict(firstPage, options), true);
  assert.equal(await getGateVerdict(secondPage, options), true);
  const store = JSON.parse(readFileSync(storeAt(root), "utf8"));
  const [malformedKey, validKey] = Object.keys(store.verdicts);
  store.verdicts[malformedKey] = "not a boolean";
  assert.equal(typeof store.verdicts[validKey], "boolean");
  writeFileSync(storeAt(root), JSON.stringify(store));

  assert.equal(await getGateVerdict(firstPage, options), true, "the malformed entry is recomputed");
  assert.equal(await getGateVerdict(secondPage, options), true, "valid sibling entries remain hits");
  assert.equal(readFileSync(log, "utf8"), "run\nrun\nrun\n");
});
