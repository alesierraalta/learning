#!/usr/bin/env node
// Renders a lesson part: plan the timeline, draw every frame on a headless
// Chromium stage, and encode with ffmpeg. One command, no manual steps.
//
//   node tools/video/render.mjs --spec parts/parte3.json --note <note.md> \
//        --audio <dir> --work <dir> [--stills 12.5,90] [--video out.mp4]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { loadAudio } from "./lib/audio.mjs";
import { loadPlaywright, openStage } from "./lib/browser.mjs";
import { extractDecks } from "./lib/note.mjs";
import { audit, formatViolation } from "./lib/promises.mjs";
import { readSpec } from "./lib/spec.mjs";
import { buildTimeline } from "./lib/timeline.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../..");

const KNOWN_ARGS = new Set(["spec", "note", "audio", "work", "stills", "video", "from", "to", "fps", "preset", "crf", "remote", "craft"]);

const args = parseArgs(process.argv.slice(2));
checkArgs(args);
if (!args.spec || !args.note || !args.audio) usage();

main().catch((cause) => {
  console.error(`render failed: ${cause.message}`);
  process.exit(1);
});

async function main() {
  const spec = readSpec(resolve(args.spec));
  const decks = extractDecks(await readFile(resolve(args.note), "utf8"));
  // Every flag, every slice: a part that says what it does not draw never
  // becomes a frame, let alone a file.
  const violations = audit(spec, decks);
  if (violations.length) throw new Error(violations.map(formatViolation).join("\n"));
  const beats = loadAudio(spec, { dir: resolve(args.audio), remote: args.remote });
  const plan = buildTimeline(spec, beats, decks);
  plan.title = spec.title;
  plan.part = spec.part;
  plan.fps = Number(args.fps || 30);

  const work = resolve(args.work || join(HERE, ".cache/render"));
  const from = Number(args.from || 0);
  // The length is only known after planning, so the window is checked here: a
  // slice past the end used to render an empty part and call it success.
  if (from >= plan.total) {
    throw new Error(`--from ${args.from} is past the end of the part (${fmt(plan.total)}); there is no window to render`);
  }
  const to = Math.min(Number(args.to || plan.total), plan.total);
  await mkdir(work, { recursive: true });
  await writeFile(join(work, "plan.json"), JSON.stringify(plan, null, 1));
  const captions = sliceCues(plan.cues, from, to);
  // The craft gate measures the same plan the frames will follow, so a part
  // nobody can read never becomes a file.
  if (args.craft) {
    const gate = spawnSync(process.execPath, [join(HERE, "legibility.mjs"), "--plan", join(work, "plan.json")], { stdio: "inherit" });
    if (gate.status !== 0) throw new Error(`the craft gate refused this part (exit ${gate.status})`);
  }
  console.log(`${plan.part} · ${plan.beats.length} beats · ${captions.length} cues · ${fmt(plan.total)}`);

  const playwright = await loadPlaywright([ROOT]);
  const stage = await openStage(playwright, plan, { root: ROOT });
  try {
    if (args.stills) {
      await stills(stage.page, join(work, "stills"));
    }
    if (args.video) {
      await video(stage.page, plan, beats, resolve(args.video));
    }
  } finally {
    await stage.close();
  }
  // The SRT is a deliverable, so it is written only once the work it describes
  // succeeded: a failed render must not leave captions that look finished.
  await writeFile(join(work, "final.srt"), srt(captions));
}

async function stills(page, dir) {
  await mkdir(dir, { recursive: true });
  for (const value of args.stills.split(",")) {
    const t = Number(value.trim());
    await page.evaluate((at) => window.__frame(at), t);
    const file = join(dir, `t${t.toFixed(2).padStart(7, "0")}.png`);
    await page.screenshot({ path: file });
    console.log(`still ${file}`);
  }
}

async function video(page, plan, beats, out) {
  const fps = plan.fps;
  const from = Number(args.from || 0);
  const to = Number(args.to || plan.total);
  const total = Math.round((to - from) * fps);
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    ...audioInputs(plan, beats, from, to),
    "-filter_complex", audioFilter(plan, beats, from, to, fps),
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", args.preset || "medium", "-crf", String(args.crf || 20),
    "-pix_fmt", "yuv420p", "-r", String(fps), "-fps_mode", "cfr",
    "-c:a", "aac", "-b:a", "192k", "-t", String((to - from).toFixed(3)),
    "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = once(ff, "close");

  const started = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((at) => window.__frame(at), from + i / fps);
    const frame = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(frame)) await once(ff.stdin, "drain");
    if (i % 300 === 0) {
      const rate = i / ((Date.now() - started) / 1000);
      console.log(`frame ${i}/${total} · ${rate.toFixed(1)} fps · eta ${fmt((total - i) / Math.max(rate, 0.1))}`);
    }
  }
  ff.stdin.end();
  const [code] = await done;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  console.log(`video ${out}`);
}

function audioInputs(plan, beats, from, to) {
  const inputs = [];
  for (const beat of plan.beats) {
    if (beat.end < from || beat.start > to) continue;
    inputs.push("-i", beats.get(beat.tag).mp3);
  }
  return inputs;
}

// Each beat is delayed to its absolute offset and mixed; the plan owns the
// timing, so silence around the speech comes from the same numbers as the
// drawing.
function audioFilter(plan, beats, from, to, fps) {
  const used = plan.beats.filter((b) => !(b.end < from || b.start > to));
  const labels = [];
  const parts = used.map((beat, i) => {
    const delay = Math.max(0, Math.round((beat.start - from) * 1000));
    labels.push(`[a${i}]`);
    return `[${i + 1}:a]adelay=${delay}|${delay},apad[a${i}]`;
  });
  parts.push(`${labels.join("")}amix=inputs=${used.length}:normalize=0:duration=longest[a]`);
  return parts.join(";");
}

// A slice keeps the part's absolute clock: the captions stay on the same
// instants as the speech they transcribe, never on the whole part.
function sliceCues(cues, from, to) {
  return cues
    .filter(([start]) => start >= from && start < to)
    .map(([start, end, text]) => [start, Math.min(end, to), text]);
}

function srt(cues) {
  const clock = (s) => {
    const ms = Math.round(s * 1000);
    const p = (n, w = 2) => String(n).padStart(w, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return cues.map(([start, end, text], i) => `${i + 1}\n${clock(start)} --> ${clock(end)}\n${text}\n`).join("\n");
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function checkArgs(args) {
  const unknown = Object.keys(args).filter((key) => !KNOWN_ARGS.has(key));
  if (unknown.length) usage(`unknown flag ${unknown.map((key) => `--${key}`).join(", ")}`);
  if (args.video === undefined && args.stills === undefined) {
    usage("nothing to render: pass --video <file> or --stills <instants>");
  }
  if (args.stills !== undefined) {
    const values = String(args.stills).split(",");
    const bad = values.find((value) => !Number.isFinite(Number(value.trim())) || Number(value.trim()) < 0);
    if (bad !== undefined) usage(`--stills ${bad.trim()} is not a real instant`);
  }
  for (const key of ["from", "to"]) {
    const value = args[key];
    if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) usage(`--${key} ${value} is not a real instant`);
  }
  if (args.from !== undefined && args.to !== undefined && Number(args.from) >= Number(args.to)) {
    usage(`--from ${args.from} cannot be at or after --to ${args.to}`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function usage(problem) {
  if (problem) console.error(`render failed: ${problem}`);
  console.error("usage: render.mjs --spec <part.json> --note <note.md> --audio <dir> [--work <dir>] [--stills 1,2] [--video out.mp4]");
  process.exit(2);
}
