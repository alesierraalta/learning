import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { turnKey } from "../lib/timeline.mjs";
import { tempDir } from "./fixtures.mjs";

const KOKORO = new URL("../kokoro.py", import.meta.url).pathname;
const SYNTH = new URL("../synth.py", import.meta.url).pathname;
const ROOT = new URL("../../../", import.meta.url).pathname;

const STUB = `#!/usr/bin/env python3
# Fake Kokoro interpreter: ignore the worker code and write a silent two-second wav.
import sys, wave
with wave.open(sys.argv[-1], "wb") as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(24000)
    out.writeframes(b"\\x00\\x00" * 48000)
`;

let dir;
let stub;

before(() => {
  dir = tempDir("audio-kokoro-");
  stub = join(dir, "fake-python");
  writeFileSync(stub, STUB);
  chmodSync(stub, 0o755);
});

after(() => rmSync(dir, { recursive: true, force: true }));

function specOf(overrides = {}) {
  return {
    part: "p1",
    title: "Voz libre",
    topic: "rl",
    style: "debate",
    voices: { A: "ef_dora", B: "em_alex" },
    chapters: [
      {
        title: "Apertura",
        segments: [
          { speaker: "A", text: "primera voz explica el concepto con palabras claras" },
          { speaker: "B", text: "segunda voz responde con otro ejemplo sencillo" },
        ],
      },
    ],
    ...overrides,
  };
}

function writeSpec(name, spec) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(spec));
  return path;
}

function run(script, ...args) {
  return spawnSync("python3", [script, ...args], { encoding: "utf8", cwd: ROOT });
}

function kokoro(...args) {
  return run(KOKORO, ...args);
}

function seconds(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return Number(out.trim());
}

test("T5 a dry run lists every turn and writes no cache", () => {
  const spec = writeSpec("dry.json", specOf());
  const out = join(dir, "dry-cache");
  const result = kokoro("--spec", spec, "--out", out, "--dry-run", "--python", stub);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines[0], `2 turn(s) -> ${out}`);
  for (const [voice, text] of [["ef_dora", specOf().chapters[0].segments[0].text], ["em_alex", specOf().chapters[0].segments[1].text]]) {
    const key = turnKey(voice, text);
    assert.ok(lines.includes(`  ${key} ${voice}`), result.stdout);
  }
  assert.equal(existsSync(out), false);
});

test("T5 an unknown voice is refused and names the accepted ones", () => {
  const spec = writeSpec("unknown.json", specOf({ voices: { A: "michelle", B: "em_alex" } }));
  const out = join(dir, "unknown-cache");
  const result = kokoro("--spec", spec, "--out", out, "--python", stub);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /michelle/);
  assert.match(result.stderr, /ef_dora/);
  assert.match(result.stderr, /em_alex/);
  assert.match(result.stderr, /em_santa/);
  assert.equal(existsSync(out), false);
});

test("T5 a run writes one recording and one boundaries file per turn", () => {
  const spec = specOf();
  const path = writeSpec("cache.json", spec);
  const out = join(dir, "cache");
  const result = kokoro("--spec", path, "--out", out, "--python", stub);
  assert.equal(result.status, 0, result.stderr);

  const expected = [];
  for (const segment of spec.chapters[0].segments) {
    const voice = spec.voices[segment.speaker];
    const key = turnKey(voice, segment.text);
    expected.push(`${key}.json`, `${key}.mp3`);
    const written = JSON.parse(readFileSync(join(out, `${key}.json`), "utf8"));
    assert.equal(written.key, key);
    assert.equal(written.voice, voice);
    assert.equal(written.rate, "-4%");
    assert.equal(written.text, segment.text);
    assert.match(written.boundaries_source, /estimated/);
  }
  assert.deepEqual(readdirSync(out).sort(), expected.sort());
});

test("T5 estimated boundaries rise to the measured end of each turn", () => {
  const spec = specOf();
  const path = writeSpec("boundaries.json", spec);
  const out = join(dir, "boundaries-cache");
  const result = kokoro("--spec", path, "--out", out, "--python", stub);
  assert.equal(result.status, 0, result.stderr);

  for (const segment of spec.chapters[0].segments) {
    const voice = spec.voices[segment.speaker];
    const key = turnKey(voice, segment.text);
    const written = JSON.parse(readFileSync(join(out, `${key}.json`), "utf8"));
    const words = segment.text.trim().split(/\s+/);
    assert.equal(written.boundaries.length, words.length);
    const end = Math.round(seconds(join(out, `${key}.mp3`)) * 1000) / 1000;
    let previous = -1;
    written.boundaries.forEach((boundary, index) => {
      assert.equal(boundary.w, words[index]);
      assert.ok(boundary.t > previous, `boundary ${index} does not advance`);
      assert.ok(boundary.d >= 0);
      assert.ok(boundary.t + boundary.d <= end + 0.001);
      previous = boundary.t;
    });
    const last = written.boundaries.at(-1);
    assert.equal(Math.round((last.t + last.d) * 1000) / 1000, end);
    assert.equal(written.boundaries[0].t, 0);
  }
});

test("T5 characterization: the edge synth dry run keeps its roster and keys", () => {
  // characterization: pin the existing python path, not a new promise.
  const spec = specOf({
    voices: { A: "Alvaro", B: "Elvira" },
    chapters: [
      {
        title: "Apertura",
        segments: [
          { speaker: "A", text: "primera voz explica el concepto con palabras claras" },
          { speaker: "B", text: "segunda voz responde con otro ejemplo sencillo" },
        ],
      },
    ],
  });
  const path = writeSpec("edge.json", spec);
  const out = join(dir, "edge-cache");
  const result = run(SYNTH, "--spec", path, "--out", out, "--dry-run");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 turn\(s\) ->/);
  assert.match(result.stdout, new RegExp(`  ${turnKey("es-ES-AlvaroNeural", spec.chapters[0].segments[0].text)} es-ES-AlvaroNeural`));
  assert.match(result.stdout, new RegExp(`  ${turnKey("es-ES-ElviraNeural", spec.chapters[0].segments[1].text)} es-ES-ElviraNeural`));
  assert.deepEqual(readdirSync(out), []);
});
