import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { capsule, conversation, recordAll, tempDir, text } from "./fixtures.mjs";
import { turnTags } from "../lib/timeline.mjs";

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

test("a capsule dry run uses its own window and warning", () => {
  const inside = join(dir, "capsule.json");
  writeFileSync(inside, JSON.stringify(capsule()));
  const run = render("--spec", inside, "--out", join(dir, "capsule.m4a"), "--dry-run");
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /estimate 5\.839 min · 900 words · 12 turns · 4 chapters/);
  assert.match(run.stdout, /Concepto 1 · 3 turns · 225 words/);

  const warned = join(dir, "capsule-target8.json");
  writeFileSync(warned, JSON.stringify(capsule({ minutes: 8 })));
  const drift = render("--spec", warned, "--out", join(dir, "capsule8.m4a"), "--dry-run");
  assert.equal(drift.status, 0, drift.stderr);
  assert.match(drift.stderr, /warning: the capsule estimate is [\d.]+ min against a 8-minute target/);
});

test("a capsule outside its render window names the capsule", () => {
  const short = capsule({
    chapters: [
      { title: "Solo", segments: Array.from({ length: 4 }, (_, i) => ({ speaker: "A", text: text(60, `short${i}`) })) },
    ],
  });
  const path = join(dir, "capsule-short.json");
  writeFileSync(path, JSON.stringify(short));
  const run = render("--spec", path, "--out", join(dir, "capsule-short.m4a"), "--dry-run");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /a capsule must land between 4 and 9 minutes/);
  assert.doesNotMatch(run.stderr, /a part's audio/);
});

test("a capsule estimated outside its 5 to 8 minutes is told so", () => {
  // 720 words: about 4.7 minutes, inside the render window but short of what a capsule promises.
  const brief = capsule({
    chapters: capsule().chapters.map((chapter, c) => ({
      ...chapter,
      segments: chapter.segments.map((segment, s) => ({ ...segment, text: text(60, `brief${c}x${s}w`) })),
    })),
  });
  const path = join(dir, "capsule-brief.json");
  writeFileSync(path, JSON.stringify(brief));
  const run = render("--spec", path, "--out", join(dir, "capsule-brief.m4a"), "--dry-run");
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /estimate 4\.\d+ min/);
  assert.match(run.stderr, /warning: .*capsule/);

  const inside = join(dir, "capsule-inside.json");
  writeFileSync(inside, JSON.stringify(capsule()));
  const quiet = render("--spec", inside, "--out", join(dir, "capsule-inside.m4a"), "--dry-run");
  assert.doesNotMatch(quiet.stderr, /warning/);
});

test("a rendered capsule that lasts outside its 5 to 8 minutes is told so", () => {
  // The estimate is about six minutes, but these recordings last five seconds a turn.
  const spoken = capsule();
  const path = join(dir, "capsule-real.json");
  const takes = join(dir, "capsule-audio");
  writeFileSync(path, JSON.stringify(spoken));
  recordAll(spoken, takes, { seconds: 5, words: 6 });
  const run = render("--spec", path, "--audio", takes, "--out", join(dir, "capsule-real.m4a"));
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /wrote .*capsule-real\.m4a · 1(\.\d)? min/);
  assert.match(run.stderr, /warning: .*capsule/);
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

// Characterization: a part spec keeps the pre-capsule rules.
test("a part keeps its 12-28 window and rejects a 7-minute target", () => {
  const outside = join(dir, "part-window.json");
  writeFileSync(outside, JSON.stringify(capsule({ capsule: false, minutes: 20 })));
  const windowRun = render("--spec", outside, "--out", join(dir, "part-window.m4a"), "--dry-run");
  assert.equal(windowRun.status, 1);
  assert.match(windowRun.stderr, /a part's audio must land between 12 and 28 minutes/);

  const target = join(dir, "part-target.json");
  writeFileSync(target, JSON.stringify(conversation({ minutes: 7 })));
  const targetRun = render("--spec", target, "--out", join(dir, "part-target.m4a"), "--dry-run");
  assert.equal(targetRun.status, 1);
  assert.match(targetRun.stderr, /minutes must be an integer between 8 and 35/);
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
  // The ceiling is measured on the encoded file, not inherited from the filter.
  assert.ok(report.level.peak <= -1.4, `true peak ${report.level.peak} dBFS`);
  assert.ok(Math.abs(report.level.lufs + 16) <= 0.7, `loudness ${report.level.lufs} LUFS`);
  assert.deepEqual(report.voices, { A: "Alvaro", B: "Elvira" });
  assert.ok(Math.abs(report.duration - Number(streams.format.duration)) < 0.5);
  // 14 takes of 5 s plus the planned silence, and the encode keeps the plan.
  assert.ok(Math.abs(report.duration - 89.4) < 2, `rendered ${report.duration} s`);

  const transcript = readFileSync(srt, "utf8");
  assert.match(transcript, /^1\n00:00:00,600 --> /);
  assert.equal(transcript.trimEnd().split(/\n\n+/).length, report.cues);
});

test("a rendered capsule just under five minutes is told it is outside", () => {
  // Twelve takes of 24.1 s plus the planned gaps last 297.8 s: 4.963 min, which the one-decimal report prints as 5.
  const spoken = capsule();
  const path = join(dir, "capsule-actual.json");
  const takes = join(dir, "capsule-actual-audio");
  writeFileSync(path, JSON.stringify(spoken));
  mkdirSync(takes, { recursive: true });
  const sample = join(takes, "sample.mp3");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=24.1", "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", sample]);
  for (const tag of turnTags(spoken)) {
    const { key, voice, text: line } = tag;
    copyFileSync(sample, join(takes, `${key}.mp3`));
    writeFileSync(join(takes, `${key}.json`), JSON.stringify({ key, voice, rate: "-4%", text: line, boundaries: [{ t: 0, d: 24.1, w: "uno" }] }));
  }
  const out = join(dir, "capsule-actual.m4a");
  const run = render("--spec", path, "--audio", takes, "--out", out, "--work", join(dir, "capsule-actual-work"));
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(readFileSync(join(dir, "capsule-actual-work", "report.json"), "utf8"));
  assert.ok(report.duration < 300, `the rendered capsule lasts ${report.duration} s`);
  assert.match(run.stderr, /warning: .*capsule/, "a capsule that lasts under five minutes is told so");
});
