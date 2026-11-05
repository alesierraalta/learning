import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { conversation, recordAll, tempDir, text } from "./fixtures.mjs";

const RENDER = new URL("../render.mjs", import.meta.url).pathname;
const ROOT = new URL("../../../", import.meta.url).pathname;

let dir;
let spec;
let specPath;
let audioDir;

before(() => {
  dir = tempDir("audio-render-");
  spec = conversation();
  specPath = join(dir, "spec.json");
  audioDir = join(dir, "audio");
  writeFileSync(specPath, JSON.stringify(spec, null, 1));
  recordAll(spec, audioDir, { seconds: 5, words: 6 });
});

after(() => rmSync(dir, { recursive: true, force: true }));

function render(...args) {
  return spawnSync(process.execPath, [RENDER, ...args], { encoding: "utf8", cwd: ROOT });
}

function probe(file, ...args) {
  return execFileSync("ffprobe", ["-v", "error", ...args, "-of", "json", file], { encoding: "utf8" });
}

test("a dry run prices the part without rendering it", () => {
  const out = join(dir, "dry.m4a");
  const run = render("--spec", specPath, "--out", out, "--dry-run");
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /p1 · Agentes que actúan · debate \(A=Alvaro B=Elvira\)/);
  assert.match(run.stdout, /estimate 13\.\d+ min · 2080 words · 16 turns · 2 chapters/);
  assert.match(run.stdout, /Qué es un agente · 8 turns · 1040 words/);
  assert.equal(existsSync(out), false);
});

test("an unknown flag is refused instead of ignored", () => {
  const run = render("--spec", specPath, "--out", join(dir, "x.m4a"), "--loudness", "-9");
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unknown argument --loudness/);
});

test("a spec outside the delivery window is refused before any work", () => {
  // Valid on its own terms (more than 200 words) but only ~7 minutes of audio.
  const short = {
    part: "p1",
    title: "Corto",
    topic: "rl",
    style: "formal",
    chapters: [
      {
        title: "Solo",
        segments: Array.from({ length: 8 }, (_, i) => ({ speaker: "A", text: text(125, `corto${i}w`) })),
      },
    ],
  };
  const path = join(dir, "short.json");
  writeFileSync(path, JSON.stringify(short));
  const run = render("--spec", path, "--out", join(dir, "short.m4a"), "--audio", audioDir);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /must land between 12 and 28 minutes/);
});

test("missing recordings name the turns and the command that makes them", () => {
  const run = render("--spec", specPath, "--audio", join(dir, "empty"), "--out", join(dir, "empty.m4a"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing 16 recording\(s\)/);
  assert.match(run.stderr, /synthesise them first: python3 tools\/audio\/synth\.py/);
});

test("a take whose words changed is stale, never captioned over", () => {
  const stale = join(dir, "stale");
  cpSync(audioDir, stale, { recursive: true });
  const victim = execFileSync("ls", [stale], { encoding: "utf8" }).split("\n").find((name) => name.endsWith(".json"));
  const meta = join(stale, victim);
  const written = JSON.parse(readFileSync(meta, "utf8"));
  writeFileSync(meta, JSON.stringify({ ...written, text: `${written.text} cambiado` }));
  const run = render("--spec", specPath, "--audio", stale, "--out", join(dir, "stale.m4a"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /stale recordings/);
  assert.match(run.stderr, /the recording says other words/);
});

test("renders one m4a with chapters, a transcript and a report", () => {
  const out = join(dir, "parte1.m4a");
  const srt = join(dir, "parte1.srt");
  const run = render("--spec", specPath, "--audio", audioDir, "--out", out, "--srt", srt, "--date", "2026-01-01");
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /wrote .*parte1\.m4a · \d+(\.\d)? min · \d+ cues/);

  const streams = JSON.parse(probe(out, "-show_streams", "-show_format"));
  const audio = streams.streams.find((stream) => stream.codec_type === "audio");
  assert.equal(audio.codec_name, "aac");
  assert.equal(audio.sample_rate, "48000");
  assert.equal(audio.channels, 1);
  assert.equal(streams.format.tags.title, "p1 - Agentes que actúan");
  assert.equal(streams.format.tags.date, "2026-01-01");

  const chapters = JSON.parse(probe(out, "-show_chapters")).chapters;
  assert.deepEqual(chapters.map((chapter) => chapter.tags.title), ["Qué es un agente", "Dónde falla"]);
  assert.ok(Number(chapters[1].start_time) > Number(chapters[0].start_time));

  const report = JSON.parse(readFileSync(join(dir, ".parte1-work", "report.json"), "utf8"));
  assert.equal(report.turns, 16);
  assert.equal(report.cues, 16);
  assert.deepEqual(report.voices, { A: "Alvaro", B: "Elvira" });
  assert.ok(Math.abs(report.duration - Number(streams.format.duration)) < 0.5);
  // 14 takes of 5 s plus the planned silence, and the encode keeps the plan.
  assert.ok(Math.abs(report.duration - 89.4) < 2, `rendered ${report.duration} s`);

  const transcript = readFileSync(srt, "utf8");
  assert.match(transcript, /^1\n00:00:00,600 --> /);
  assert.equal(transcript.trimEnd().split(/\n\n+/).length, report.cues);
});
