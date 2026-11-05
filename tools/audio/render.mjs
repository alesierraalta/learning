#!/usr/bin/env node
// Renders an audio spec: load the recorded turns, plan the timeline, assemble
// one m4a with chapters and its srt transcript. One command, no manual steps.
//
//   node tools/audio/render.mjs --spec parts/parte1-debate.json \
//        --audio ~/.cache/learning-audio/parte1-debate --out out/parte1.m4a
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { loadTurns } from "./lib/audio.mjs";
import { MINUTE_WINDOW, readSpec, resolveVoices } from "./lib/spec.mjs";
import { buildTimeline, estimate } from "./lib/timeline.mjs";

const KNOWN_ARGS = new Set(["spec", "audio", "out", "srt", "work", "remote", "dry-run", "date"]);
const SAMPLE_RATE = 48000;
// One-pass loudnorm cannot hold the peak it is given: it normalises loudness and
// reports the true peak it saw. The limiter is what makes the ceiling true, and
// probe() measures the result instead of trusting the filter chain.
// The limiter sits below the documented ceiling because AAC overshoots what it
// is given: -3 dBFS before encoding measures around -2 dBFS after it.
const LOUDNESS = "loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.708:level=false";

/** A wrong invocation is a usage error, never a stack trace. */
class UsageError extends Error {}

main().catch((cause) => {
  if (cause instanceof UsageError) {
    console.error(`render: ${cause.message}`);
    usage();
  }
  console.error(`render failed: ${cause.message}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  checkArgs(args);
  if (!args.spec) throw new UsageError("missing --spec");
  if (!args["dry-run"] && !args.audio) throw new UsageError("missing --audio");
  if (!args["dry-run"] && !args.out) throw new UsageError("missing --out");
  const spec = readSpec(resolve(args.spec));
  const planned = estimate(spec);
  const voices = resolveVoices(spec);
  const rosters = Object.entries(voices).map(([speaker, entry]) => `${speaker}=${entry.name}`).join(" ");

  console.log(`${spec.part} · ${spec.title} · ${spec.style} (${rosters})`);
  console.log(`estimate ${planned.minutes} min · ${planned.words} words · ${planned.turns} turns · ${planned.chapters} chapters`);
  const [low, high] = MINUTE_WINDOW;
  if (planned.minutes < low || planned.minutes > high) {
    throw new Error(
      `the estimate is ${planned.minutes} min; a part's audio must land between ${low} and ${high} minutes (target ${planned.target})`,
    );
  }
  if (Math.abs(planned.minutes - planned.target) > 2) {
    console.warn(`warning: the estimate is ${planned.minutes} min against a ${planned.target}-minute target`);
  }
  if (args["dry-run"]) {
    for (const chapter of spec.chapters) {
      const count = chapter.segments.reduce((sum, segment) => sum + segment.text.trim().split(/\s+/).length, 0);
      console.log(`  ${chapter.title} · ${chapter.segments.length} turns · ${count} words`);
    }
    return;
  }

  const turns = loadTurns(spec, { dir: resolve(args.audio), remote: args.remote });
  const timeline = buildTimeline(spec, turns);
  const out = resolve(args.out);
  const srt = resolve(args.srt || out.replace(/\.m4a$/, "") + ".srt");
  const work = resolve(args.work || join(dirname(out), `.${basename(out, ".m4a")}-work`));
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(work, { recursive: true });

  writeFileSync(srt, timeline.srt);
  assemble({ spec, timeline, turns, work, out, date: args.date });

  const probed = probe(out);
  const drift = Math.abs(probed.duration - timeline.duration);
  if (drift > 2) throw new Error(`the file lasts ${probed.duration.toFixed(2)} s against a planned ${timeline.duration} s`);
  if (probed.codec !== "aac" || probed.sampleRate !== SAMPLE_RATE || probed.channels !== 1) {
    throw new Error(`unexpected stream ${probed.codec} ${probed.sampleRate} Hz ${probed.channels} ch`);
  }
  // The level is a promise, so the file is measured, not the filter chain that
  // made it: a limiter that misses by a fraction of a dB is still missing.
  if (probed.peak > -1.4) throw new Error(`true peak ${probed.peak} dBFS exceeds the -1.5 dBFS ceiling`);
  if (Math.abs(probed.lufs + 16) > 0.7) throw new Error(`loudness ${probed.lufs} LUFS left the -16 LUFS target`);
  const report = {
    part: spec.part,
    title: spec.title,
    topic: spec.topic,
    style: spec.style,
    voices: Object.fromEntries(Object.entries(voices).map(([speaker, entry]) => [speaker, entry.name])),
    minutes: { target: planned.target, estimated: planned.minutes, actual: Math.round(probed.duration / 60 * 10) / 10 },
    words: planned.words,
    turns: planned.turns,
    chapters: timeline.chapters,
    cues: timeline.cues.length,
    duration: probed.duration,
    level: { lufs: probed.lufs, peak: probed.peak },
    bytes: statSync(out).size,
    files: { audio: out, srt },
  };
  writeFileSync(join(work, "report.json"), JSON.stringify(report, null, 1));
  console.log(`wrote ${out} · ${report.minutes.actual} min · ${report.cues} cues · ${report.bytes} bytes`);
  console.log(`wrote ${srt}`);
}

function assemble({ spec, timeline, turns, work, out, date }) {
  const pieces = join(work, "pieces");
  mkdirSync(pieces, { recursive: true });
  const list = [];
  for (const event of timeline.events) {
    if (event.kind === "silence") {
      const file = join(work, `silence-${Math.round(event.dur * 1000)}.wav`);
      if (!existsSync(file)) silent(file, event.dur);
      list.push(file);
      continue;
    }
    const recording = turns.get(event.key);
    if (!recording) throw new Error(`no recording loaded for turn ${event.key}`);
    const wav = join(pieces, `${event.key}.wav`);
    // The key is the hash of voice and text, so a wav made from the same key is
    // the same audio: only a missing or older piece is rebuilt.
    if (!existsSync(wav) || statSync(recording.mp3).mtimeMs > statSync(wav).mtimeMs) {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", recording.mp3, "-ar", String(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", wav]);
    }
    list.push(wav);
  }
  const concat = join(work, "concat.txt");
  writeFileSync(concat, list.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const meta = join(work, "meta.txt");
  writeFileSync(meta, metadata(spec, timeline, date));
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", concat,
    "-i", meta,
    "-map", "0:a:0", "-map_metadata", "1", "-map_chapters", "1",
    "-af", LOUDNESS, "-ar", String(SAMPLE_RATE), "-ac", "1",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    out,
  ], { stdio: "inherit" });
}

function silent(file, dur) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`, "-t", String(dur), "-c:a", "pcm_s16le", file]);
}

function metadata(spec, timeline, given) {
  const date = given || new Date().toISOString().slice(0, 10);
  const escape = (value) => String(value).replace(/([=;#\\\n])/g, "\\$1");
  const lines = [
    ";FFMETADATA1",
    `title=${escape(`${spec.part} - ${spec.title}`)}`,
    "artist=Learnings",
    `album=${escape(spec.topic)}`,
    "genre=Podcast",
    `date=${date}`,
    `comment=${escape(`Audio ${spec.style} de ${spec.part}`)}`,
  ];
  for (const chapter of timeline.chapters) {
    lines.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${Math.round(chapter.start * 1000)}`, `END=${Math.round(chapter.end * 1000)}`, `title=${escape(chapter.title)}`);
  }
  return lines.join("\n") + "\n";
}

function probe(file) {
  const raw = execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  let data;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`ffprobe returned unreadable output for ${file}: ${cause.message}`, { cause });
  }
  const audio = (data.streams || []).find((stream) => stream.codec_type === "audio");
  if (!audio) throw new Error(`${file} has no audio stream`);
  const measured = measure(file);
  return {
    codec: audio.codec_name,
    sampleRate: Number(audio.sample_rate),
    channels: Number(audio.channels),
    duration: Number(data.format?.duration ?? audio.duration),
    lufs: measured.lufs,
    peak: measured.peak,
  };
}

/** Integrated loudness and true peak, as ffmpeg's own meter reports them. */
function measure(file) {
  // The meter writes its summary to stderr, so stdout alone would read as silence.
  // An 18-minute episode logs a line per frame: the default 1 MB buffer kills
  // the meter mid-file and reads as a failure.
  const run = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`ffmpeg could not measure ${file}: ${run.stderr}`);
  const text = `${run.stdout}\n${run.stderr}`;
  // Per-frame lines also print `I:`; only the summary holds the programme values.
  const summary = text.slice(text.lastIndexOf("Summary:"));
  const lufs = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(summary);
  const peak = /True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(summary);
  if (!lufs || !peak) throw new Error(`ffmpeg measured nothing for ${file}`);
  return { lufs: Number(lufs[1]), peak: Number(peak[1]) };
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new UsageError(`unexpected argument "${token}"`);
    const [name, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) {
      parsed[name] = inline;
      continue;
    }
    if (name === "dry-run") {
      parsed[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`--${name} needs a value`);
    parsed[name] = value;
    i += 1;
  }
  return parsed;
}

function checkArgs(parsed) {
  for (const name of Object.keys(parsed)) {
    if (!KNOWN_ARGS.has(name)) throw new UsageError(`unknown argument --${name}; known: ${[...KNOWN_ARGS].join(", ")}`);
  }
}

function usage() {
  console.error(`usage: node tools/audio/render.mjs --spec <json> [--audio <dir> --out <file.m4a>]
  --spec     the part's audio spec
  --audio    directory with <key>.mp3 and <key>.json per turn (synth.py output)
  --out      destination m4a
  --srt      transcript path (default: beside --out)
  --work     scratch directory (default: .<name>-work beside --out)
  --remote   host:dir to fetch missing recordings from, e.g. synchub:~/.cache/learning-audio/parte1
  --date     metadata date (default: today)
  --dry-run  print the estimate and chapter plan without rendering`);
  process.exit(2);
}
