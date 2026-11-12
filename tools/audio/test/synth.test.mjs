// The synthesiser's speed contract: the same files, the same bytes, the same
// order in the log, but independent turns in flight at the same time.
//
// Every run here drives `synth.py` against a local fake edge-tts
// (`test/fake-edge-tts/`), so nothing touches the network or a real voice. The
// fake writes a trace of when each stream started and ended, which is the only
// honest way to say "these turns overlapped".
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { after, before, test } from "node:test";
import { tempDir, text } from "./fixtures.mjs";

const SYNTH = new URL("../synth.py", import.meta.url).pathname;
const FAKE = new URL("./fake-edge-tts", import.meta.url).pathname;
const PYTHON = process.env.PYTHON || "python3";
const DELAY = "0.25";
const TURNS = 6;

let dir;
let specPath;

/** Alternating voices, `count` distinct turns: enough to see a pool fill up. */
function spec(count = TURNS) {
  const segments = Array.from({ length: count }, (_, i) => ({
    speaker: i % 2 === 0 ? "A" : "B",
    text: text(5, `turno${i + 1}w`),
  }));
  return { part: "p1", title: "Concurrencia", topic: "rl", style: "debate", chapters: [{ title: "Uno", segments }] };
}

before(() => {
  const probe = spawnSync(PYTHON, ["--version"], { encoding: "utf8" });
  assert.equal(probe.status, 0, `synth.py needs ${PYTHON} on PATH: ${probe.error?.message || probe.stderr}`);
  dir = tempDir("audio-synth-");
  specPath = join(dir, "spec.json");
  writeFileSync(specPath, JSON.stringify(spec(), null, 1));
});

after(() => rmSync(dir, { recursive: true, force: true }));

function env(extra = {}) {
  const path = process.env.PYTHONPATH ? `${FAKE}${delimiter}${process.env.PYTHONPATH}` : FAKE;
  return { ...process.env, PYTHONPATH: path, SYNTH_FAKE_DELAY: DELAY, ...extra };
}

function synth(out, args = [], extra = {}, specFile = specPath) {
  const started = Date.now();
  const run = spawnSync(PYTHON, [SYNTH, "--spec", specFile, "--out", out, ...args], { encoding: "utf8", env: env(extra) });
  return { ...run, ms: Date.now() - started };
}

function synthAsync(out, args = [], extra = {}, specFile = specPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(PYTHON, [SYNTH, "--spec", specFile, "--out", out, ...args], { env: env(extra) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr, ms: Date.now() - started }));
  });
}

function events(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** How many streams were open at the same instant; 1 is strictly sequential. */
function peak(streams) {
  const points = [];
  const open = new Map();
  for (const stream of streams) {
    if (stream.event === "start") {
      open.set(stream.text, stream.at);
      points.push([stream.at, 1]);
    } else if (open.has(stream.text)) {
      points.push([stream.at, -1]);
      open.delete(stream.text);
    }
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let max = 0;
  for (const [, delta] of points) {
    now += delta;
    max = Math.max(max, now);
  }
  return max;
}

/** Every file in the cache, byte for byte, keyed by name. */
function cache(directory) {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory).sort().map((name) => [name, readFileSync(join(directory, name))]));
}

function assertSameCache(actual, expected, where) {
  assert.deepEqual(Object.keys(actual), Object.keys(expected), `${where}: different files`);
  for (const name of Object.keys(expected)) {
    assert.deepEqual(actual[name], expected[name], `${where}: ${name} differs byte for byte`);
  }
}

test("independent turns overlap and still produce the sequential bytes", () => {
  const serial = join(dir, "serial");
  const parallel = join(dir, "parallel");
  const serialTrace = join(dir, "serial.ndjson");
  const parallelTrace = join(dir, "parallel.ndjson");

  const one = synth(serial, ["--concurrency", "1"], { SYNTH_FAKE_TRACE: serialTrace });
  assert.equal(one.status, 0, one.stderr);
  assert.equal(peak(events(serialTrace)), 1, "--concurrency 1 must stay the sequential path");

  const four = synth(parallel, [], { SYNTH_FAKE_TRACE: parallelTrace });
  assert.equal(four.status, 0, four.stderr);
  assert.equal(peak(events(parallelTrace)), 4, "the default pool must put four turns in flight");
  assert.equal(four.stdout, one.stdout, "the log must list the same turns, in the same order");

  assertSameCache(cache(parallel), cache(serial), "parallel");
  assert.ok(four.ms * 1.5 < one.ms, `parallel ${four.ms} ms vs sequential ${one.ms} ms`);

  // A second run is served by the cache: no new stream, no rewritten file.
  const againTrace = join(dir, "again.ndjson");
  const before = cache(parallel);
  const again = synth(parallel, [], { SYNTH_FAKE_TRACE: againTrace });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(events(againTrace).filter((event) => event.event === "start").length, 0, "a cached turn must not be requested again");
  assert.match(again.stdout, new RegExp(`0 new, ${TURNS} kept, ${TURNS} total`));
  assertSameCache(cache(parallel), before, "cached");
});

test("two synthesisers on one cache never write over each other's file", () => {
  // Four turns of 8 MB each: writing one takes long enough that two processes
  // starting together always reach the same key at once, which is exactly the
  // window a shared temporary file would corrupt. Real turns are ~100 kB; the
  // payload is here to make the race certain instead of occasional.
  const pairs = join(dir, "pairs.json");
  writeFileSync(pairs, JSON.stringify(spec(4), null, 1));
  const shared = join(dir, "shared");
  const solo = join(dir, "solo");
  mkdirSync(shared, { recursive: true });
  const tracePath = join(dir, "shared.ndjson");
  const stress = { SYNTH_FAKE_DELAY: "0.1", SYNTH_FAKE_SIZE: "8000000" };

  const soloRun = synth(solo, ["--force"], stress, pairs);
  assert.equal(soloRun.status, 0, soloRun.stderr);

  return Promise.all([
    synthAsync(shared, ["--force"], { ...stress, SYNTH_FAKE_TRACE: tracePath }, pairs),
    synthAsync(shared, ["--force"], { ...stress, SYNTH_FAKE_TRACE: tracePath }, pairs),
  ]).then(([first, second]) => {
    assert.equal(first.status, 0, `first process: ${first.stderr}`);
    assert.equal(second.status, 0, `second process: ${second.stderr}`);
    const pids = new Set(events(tracePath).map((event) => event.pid));
    assert.equal(pids.size, 2, "the two processes must have run at the same time");
    assertSameCache(cache(shared), cache(solo), "shared");
    assert.deepEqual(
      readdirSync(shared).filter((name) => name.endsWith(".part")),
      [],
      "a shared run must not leave a partial file behind",
    );
  });
});

test("a turn that dies mid-stream leaves no half file and keeps the finished ones", () => {
  const out = join(dir, "broken");
  const broken = "turno3w";
  const run = synth(out, ["--concurrency", "1"], { SYNTH_FAKE_FAIL_ON: broken });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /failed [0-9a-f]{16} es-ES-\w+Neural: connection reset by peer/);
  assert.match(run.stderr, /2 new, 0 kept before the failure/);
  assert.deepEqual(readdirSync(out).filter((name) => name.endsWith(".part")), [], "no partial file may survive");
  assert.equal(readdirSync(out).filter((name) => name.endsWith(".mp3")).length, 2, "only the finished turns are cached");

  const resumed = synth(out, ["--concurrency", "1"]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, new RegExp(`4 new, 2 kept, ${TURNS} total`));
  const reference = join(dir, "reference");
  const clean = synth(reference, ["--concurrency", "1"]);
  assert.equal(clean.status, 0, clean.stderr);
  assertSameCache(cache(out), cache(reference), "resumed");
});

test("a rate limited turn is retried a bounded number of times, then reported", () => {
  const out = join(dir, "limited");
  const limited = "turno2w";
  const tracePath = join(dir, "limited.ndjson");
  const run = synth(out, ["--concurrency", "1"], { SYNTH_FAKE_RATE_LIMIT: limited, SYNTH_FAKE_TRACE: tracePath });
  assert.equal(run.status, 1, run.stdout);
  const attempts = events(tracePath).filter((event) => event.event === "limited" && event.text.includes(limited));
  assert.equal(attempts.length, 3, "one attempt plus two retries, then stop");
  assert.match(run.stderr, /rate limited on [0-9a-f]{16} es-ES-\w+Neural: retry 1\/2/);
  assert.match(run.stderr, /HTTP 429 Too Many Requests/);
  assert.match(run.stderr, /stopped instead of hammering it/);
  assert.equal(readdirSync(out).filter((name) => name.endsWith(".mp3")).length, 1, "the turn before it stays cached");

  const healed = synth(out, ["--concurrency", "1"]);
  assert.equal(healed.status, 0, healed.stderr);
  assert.match(healed.stdout, new RegExp(`5 new, 1 kept, ${TURNS} total`));
});
