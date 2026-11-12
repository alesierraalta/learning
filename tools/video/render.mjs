#!/usr/bin/env node
// Renders a lesson part: plan the timeline, draw every frame on a headless
// Chromium stage, and encode with ffmpeg. One command, no manual steps.
//
//   node tools/video/render.mjs --spec parts/parte3.json --note <note.md> \
//        --audio <dir> --work <dir> [--stills 12.5,90] [--video out.mp4]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { loadAudio } from "./lib/audio.mjs";
import { VIEWPORT, loadPlaywright, openStage } from "./lib/browser.mjs";
import { extractDecks } from "./lib/note.mjs";
import { audit, formatViolation } from "./lib/promises.mjs";
import { readSpec } from "./lib/spec.mjs";
import { buildTimeline } from "./lib/timeline.mjs";
import { createTimings, writeReport } from "./lib/timings.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../..");

const KNOWN_ARGS = new Set(["spec", "note", "audio", "work", "stills", "video", "from", "to", "fps", "preset", "crf", "remote", "craft", "workers"]);

// Capture is Chromium drawing and encoding a PNG per frame, so it scales with
// cores but not with every core: past a few pages they contend for the same CPU
// and each one costs its own renderer process. Four is the ceiling that came out
// of measuring a window at 1, 2, 3, 4, 6 and 8 pages; half the cores is the
// default, and `--workers 1` is the sequential loop that is the base case.
const MAX_WORKERS = 4;

const args = parseArgs(process.argv.slice(2));
checkArgs(args);
if (!args.spec || !args.note || !args.audio) usage();
// The clock opens with the process, so the report's total is the run itself.
const timings = createTimings();

main().catch((cause) => {
  console.error(`render failed: ${cause.message}`);
  process.exit(1);
});

async function main() {
  const spec = readSpec(resolve(args.spec));
  const decks = extractDecks(await readFile(resolve(args.note), "utf8"));
  // Every flag, every slice: a part that says what it does not draw never
  // becomes a frame, let alone a file.
  const stopAudit = timings.time("promises");
  const violations = audit(spec, decks);
  stopAudit();
  if (violations.length) throw new Error(violations.map(formatViolation).join("\n"));
  const stopAudio = timings.time("audio");
  const beats = loadAudio(spec, { dir: resolve(args.audio), remote: args.remote });
  stopAudio();
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
    const stopCraft = timings.time("legibility");
    const gate = spawnSync(process.execPath, [join(HERE, "legibility.mjs"), "--plan", join(work, "plan.json")], { stdio: "inherit" });
    stopCraft();
    if (gate.status !== 0) throw new Error(`the craft gate refused this part (exit ${gate.status})`);
  }
  console.log(`${plan.part} · ${plan.beats.length} beats · ${captions.length} cues · ${fmt(plan.total)}`);

  const playwright = await loadPlaywright([ROOT]);
  // Only a video has a frame loop to spread; stills draw instants one at a time.
  const pages = args.video ? workers() : 1;
  const stage = await openStage(playwright, plan, { root: ROOT, pages });
  try {
    if (args.stills) {
      const stopStills = timings.time("stills");
      const written = await stills(stage.page, join(work, "stills"));
      stopStills({ frames: written });
    }
    if (args.video) {
      await video(stage.pages, plan, beats, resolve(args.video));
    }
  } finally {
    await stage.close();
  }
  // The SRT is a deliverable, so it is written only once the work it describes
  // succeeded: a failed render must not leave captions that look finished.
  await writeFile(join(work, "final.srt"), srt(captions));
  // The numbers travel with the output they describe. A report of a run that
  // never finished would be a claim nobody can check, so it lands here, last.
  const meta = {
    part: plan.part,
    spec: specPath(args.spec),
    fps: plan.fps,
    resolution: `${VIEWPORT.width}x${VIEWPORT.height}`,
    encoder: { codec: "libx264", preset: args.preset || "medium", crf: Number(args.crf || 20) },
  };
  // A window is what a video covers; a stills run draws instants, not a span.
  if (args.video) meta.window = { from, to };
  await writeReport(join(work, "timings.json"), timings.report(meta));
}

async function stills(page, dir) {
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const value of args.stills.split(",")) {
    const t = Number(value.trim());
    await page.evaluate((at) => window.__frame(at), t);
    const file = join(dir, `t${t.toFixed(2).padStart(7, "0")}.png`);
    await page.screenshot({ path: file });
    console.log(`still ${file}`);
    written++;
  }
  return written;
}

async function video(pages, plan, beats, out) {
  const fps = plan.fps;
  const from = Number(args.from || 0);
  const to = Number(args.to || plan.total);
  const total = Math.round((to - from) * fps);
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    ...audioInputs(plan, beats, from, to),
    "-filter_complex", audioFilter(plan, from, to),
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-preset", args.preset || "medium", "-crf", String(args.crf || 20),
    "-pix_fmt", "yuv420p", "-r", String(fps), "-fps_mode", "cfr",
    "-c:a", "aac", "-b:a", "192k", "-t", String((to - from).toFixed(3)),
    "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = once(ff, "close");
  const pipe = watchPipe(ff.stdin);
  // An encoder that decides to exit while frames are still going in will never
  // read the rest: the pipe is declared broken here, so the capture stops
  // waiting for a `drain` that is never coming.
  let finished = false;
  ff.once("exit", (code) => {
    if (!finished) breakPipe(pipe, new Error(code === 0 ? "ffmpeg stopped before the last frame went in" : `ffmpeg exited ${code}`));
  });
  // ffmpeg encodes while the frames are still being written to its stdin, so
  // this stage covers the capture below as well; the report says so.
  const stopEncode = timings.time("encode");

  const started = Date.now();
  const captureOpened = performance.now();
  let failure = null;
  try {
    await captureFrames(pages, { from, fps, total, ff, pipe, started });
  } catch (cause) {
    // A worker that fails takes the whole render with it: the encoder is fed an
    // order it can no longer complete, so it is stopped instead of left to write
    // a film with a hole in it.
    failure = cause;
    ff.kill("SIGKILL");
  }
  // The effective rate is the whole capture, not the console's running estimate.
  const capturedMs = Math.max(performance.now() - captureOpened, 0.001);
  timings.observe("capture", capturedMs, {
    frames: total,
    fps: Math.round((total / (capturedMs / 1000)) * 10) / 10,
    workers: pages.length,
  });
  if (failure) {
    // A pipe nobody will finish is a child process nothing can close.
    ff.stdin.destroy();
  } else {
    finished = true;
    ff.stdin.end();
  }
  const [code] = await done;
  stopEncode({ overlaps: "capture" });
  if (failure) throw failure;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  console.log(`video ${out}`);
}

// Frames leave the stage from several pages at once, so they come back in
// whatever order they finish; ffmpeg only takes one order. A captured frame
// waits in `holding` until every frame before it has gone through stdin, which
// is what makes the wide render the same video as the sequential one, frame i at
// instant t_i. `budget` bounds how far the pages may run ahead of that head, so
// what waits in memory is a handful of PNGs and never the whole part.
async function captureFrames(pages, { from, fps, total, ff, pipe, started }) {
  const budget = createBudget(pages.length * 2);
  const holding = new Map();
  let cursor = 0;
  let next = 0;
  let stopped = null;
  let flushing = Promise.resolve();

  const flush = () => {
    flushing = flushing.then(async () => {
      while (!pipe.cause && holding.has(cursor)) {
        const image = holding.get(cursor);
        holding.delete(cursor);
        cursor++;
        if (!ff.stdin.write(image)) await drained(ff.stdin, pipe);
        budget.give();
        if (cursor % 300 === 0) {
          const rate = cursor / ((Date.now() - started) / 1000);
          console.log(`frame ${cursor}/${total} · ${rate.toFixed(1)} fps · eta ${fmt((total - cursor) / Math.max(rate, 0.1))}`);
        }
      }
      if (pipe.cause) throw pipe.cause;
    });
    return flushing;
  };

  const shoot = async (page) => {
    for (;;) {
      if (stopped) return;
      await budget.take();
      if (stopped) {
        budget.give();
        return;
      }
      const index = next++;
      if (index >= total) {
        budget.give();
        return;
      }
      await page.evaluate((at) => window.__frame(at), from + index / fps);
      holding.set(index, await page.screenshot({ type: "png" }));
      await flush();
    }
  };

  try {
    await Promise.all(pages.map((page) => shoot(page)));
    await flushing;
  } catch (cause) {
    // The pages are woken first: a worker waiting for its turn must not wait for
    // a frame the failed render will never write.
    stopped = stopped || cause;
    budget.wake();
    throw cause;
  }
}

// A lease on the pipe: a page may not start a frame it has no room for, so the
// pages never run further ahead of the encoder than the budget allows.
function createBudget(limit) {
  let free = limit;
  const waiting = [];
  return {
    async take() {
      if (free > 0) {
        free--;
        return;
      }
      await new Promise((wake) => waiting.push(wake));
    },
    give() {
      const wake = waiting.shift();
      if (wake) wake();
      else free++;
    },
    // Nobody will hand the lease back on a render that has stopped, so the
    // waiters are woken to see that for themselves.
    wake() {
      for (const wake of waiting.splice(0)) wake();
    },
  };
}

// ffmpeg can die while frames are still being written to it: an encoder flag it
// refuses, a full disk, a crash. Without this the write would keep waiting for a
// `drain` a dead pipe never emits, and a failed render would look like a hung one.
function watchPipe(stdin) {
  const pipe = { cause: null, waiting: [] };
  stdin.on("error", (cause) => breakPipe(pipe, cause));
  return pipe;
}

function breakPipe(pipe, cause) {
  pipe.cause ||= cause;
  for (const wake of pipe.waiting.splice(0)) wake();
}

async function drained(stdin, pipe) {
  if (pipe.cause) throw pipe.cause;
  await new Promise((wake) => {
    pipe.waiting.push(wake);
    stdin.once("drain", wake);
    // The pipe may have died between the write and this listener.
    if (pipe.cause) wake();
  });
  if (pipe.cause) throw pipe.cause;
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
function audioFilter(plan, from, to) {
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

// The spec travels with the report so a later render of the same part can be
// compared with this one: named from the repo when it lives there, absolute
// otherwise, so two reports from two checkouts still read the same line.
function specPath(file) {
  const absolute = resolve(file);
  const inRepo = relative(ROOT, absolute);
  return inRepo.startsWith("..") ? absolute : inRepo;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

// How many pages capture when nobody says. Half the cores (the encoder wants the
// rest), never one — the point of the wide capture is that it is not sequential —
// and never past the ceiling measurement put on it.
function workers() {
  if (args.workers !== undefined) return Number(args.workers);
  return Math.min(MAX_WORKERS, Math.max(2, Math.floor(availableParallelism() / 2)));
}

function checkArgs(args) {
  const unknown = Object.keys(args).filter((key) => !KNOWN_ARGS.has(key));
  if (unknown.length) usage(`unknown flag ${unknown.map((key) => `--${key}`).join(", ")}`);
  if (args.video === undefined && args.stills === undefined) {
    usage("nothing to render: pass --video <file> or --stills <instants>");
  }
  checkWorkers(args);
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

function checkWorkers(args) {
  if (args.workers === undefined) return;
  const value = Number(args.workers);
  if (args.workers === true || !Number.isInteger(value) || value < 1) {
    usage(`--workers ${args.workers === true ? "needs a number of pages" : args.workers} is not how many pages can capture`);
  }
  // Stills draw instants, not a window: a concurrency that changes nothing is a
  // flag that lies about what the run did.
  if (args.video === undefined) usage("--workers only applies to a video: stills are drawn one instant at a time");
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
  console.error("usage: render.mjs --spec <part.json> --note <note.md> --audio <dir> [--work <dir>] [--stills 1,2] [--video out.mp4] [--workers N]");
  process.exit(2);
}
