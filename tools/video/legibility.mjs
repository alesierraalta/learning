#!/usr/bin/env node
// The craft gate: measures the frames a render would write and reports what a
// viewer cannot read. Contrast is an error, a type size under the floor is a
// warning, and a still long enough to be a hole is a question for the author.
//
//   node tools/video/legibility.mjs --plan .cache/parte3/plan.json
//   node tools/video/legibility.mjs --spec parts/parte3.json --note note.md --audio <dir>
//
// Exit 1 when an error is found, 0 otherwise (warnings and waivers included).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAudio } from "./lib/audio.mjs";
import { loadPlaywright, openStage } from "./lib/browser.mjs";
import { DEAD_SECONDS, assessText, composite, deadStretches, dedupe, longestSilence, summarize, typeFloor } from "./lib/legibility.mjs";
import { extractDecks } from "./lib/note.mjs";
import { buildTimeline } from "./lib/timeline.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "../..");
const PAPER = "rgb(255,255,255)"; // the stage paints white under everything
const FIGURE = { x: 0, y: 180, width: 1920, height: 780 }; // chrome excluded: it moves every frame
const KNOWN_ARGS = new Set(["plan", "spec", "note", "audio", "json", "out", "sample", "beats"]);

const args = parseArgs(process.argv.slice(2));
checkArgs(args);
main().catch((cause) => {
  console.error(`legibility failed: ${cause.message}`);
  process.exit(1);
});

async function main() {
  const plan = await loadPlan();
  const beatFilter = args.beats ? new Set(String(args.beats).split(",").map((s) => s.trim())) : null;
  const beats = plan.beats.filter((b) => !beatFilter || beatFilter.has(b.tag));
  // A filter that names nothing selects nothing, and a gate that measures
  // nothing must not report the part as clean.
  const missing = beatFilter ? [...beatFilter].filter((tag) => !plan.beats.some((b) => b.tag === tag)) : [];
  if (missing.length) usage(`no beat named ${missing.map((tag) => `"${tag}"`).join(", ")} in ${plan.part}`);
  const playwright = await loadPlaywright([ROOT]);
  const stage = await openStage(playwright, plan, { root: ROOT });
  const findings = [];
  try {
    findings.push(...(await measureText(stage.page, beats)));
    findings.push(...(await measureStills(stage.page, beats)));
    findings.push(...measureSilence(plan, beats));
  } finally {
    await stage.close();
  }
  const unique = dedupe(findings);
  const summary = summarize(unique);
  report(plan, unique, summary);
  if (args.out) {
    await mkdir(dirname(resolve(args.out)), { recursive: true });
    await writeFile(resolve(args.out), JSON.stringify({ part: plan.part, total: plan.total, findings: unique, summary }, null, 1));
  }
  process.exit(summary.error > 0 ? 1 : 0);
}

async function loadPlan() {
  if (args.plan) {
    const file = resolve(args.plan);
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (cause) {
      throw new Error(`cannot read the plan at ${file}: ${cause.message}`);
    }
  }
  if (!args.spec || !args.note || !args.audio) usage("needs --plan, or --spec with --note and --audio");
  const { readSpec } = await import("./lib/spec.mjs");
  const spec = readSpec(resolve(args.spec));
  const decks = extractDecks(await readFile(resolve(args.note), "utf8"));
  const beats = loadAudio(spec, { dir: resolve(args.audio) });
  const plan = buildTimeline(spec, beats, decks);
  plan.title = spec.title;
  plan.part = spec.part;
  plan.fps = 30;
  return plan;
}

// Every instant a state settles, plus the first second of it: text that fades
// in later must be measured after it is actually on screen.
async function measureText(page, beats) {
  const findings = [];
  for (const beat of beats) {
    const instants = new Set();
    for (const state of beat.states) {
      for (const offset of [0, 0.6, 1.5]) {
        const t = Math.min(state.t + offset, beat.end - 0.01);
        if (t >= state.t) instants.add(Number(t.toFixed(3)));
      }
    }
    for (const t of [...instants].sort((a, b) => a - b)) {
      await page.evaluate((at) => window.__frame(at), t);
      const items = await page.evaluate(collectText);
      for (const item of items) {
        const background = item.bgChain.reduce((under, paint) => composite(paint, under), PAPER);
        findings.push(
          ...assessText({
            text: item.text,
            px: item.px,
            weight: item.weight,
            color: item.color,
            background,
            texture: item.texture,
            frameHeight: 1080,
            where: `${beat.tag}@${t.toFixed(1)}s ${item.where}`,
            time: t,
          }),
        );
      }
    }
  }
  return findings;
}

// A still is measured on the drawing and the words, not on the progress bar:
// chrome that moves every frame would hide a figure that never does.
async function measureStills(page, beats) {
  const sample = Number(args.sample || 1);
  const from = Math.min(...beats.map((b) => b.start));
  const to = Math.max(...beats.map((b) => b.end));
  const samples = [];
  for (let t = from; t < to; t += sample) {
    await page.evaluate((at) => window.__frame(at), t);
    const shot = await page.screenshot({ clip: FIGURE });
    samples.push({ t: Number(t.toFixed(3)), hash: createHash("sha1").update(shot).digest("hex") });
  }
  const findings = [];
  // While the voice speaks the film is moving; a figure that holds under
  // narration is a figure, not a hole. What the gate questions is the silence.
  const speech = beats.map((b) => ({ start: b.speechStart, end: b.speechStart + b.speechDur })).filter((s) => s.end > s.start);
  for (const stretch of deadStretches(samples, DEAD_SECONDS)) {
    const beat = beats.find((b) => stretch.from >= b.start - 1e-6 && stretch.from < b.end) || beats[0];
    const silence = longestSilence(stretch, speech);
    if (!silence || silence.seconds < DEAD_SECONDS) continue;
    findings.push({
      code: "dead_stretch",
      severity: beat.hold ? "waived" : "warning",
      message: `${silence.seconds} s of silence with nothing moving${beat.hold ? " — declared as a hold" : "; a viewer reads that as a mistake"}`,
      from: silence.from,
      to: silence.to,
      seconds: silence.seconds,
      where: beat.tag,
      time: silence.from,
    });
  }
  const first = samples[0];
  if (!first || samples.length === 0) return findings;
  const empty = await page.evaluate((at) => {
    window.__frame(at);
    const fig = document.getElementById("fig");
    if (!fig) return true;
    const prims = fig.querySelectorAll("[data-prim]").length;
    const drawn = (fig.textContent || "").trim().length;
    // The header says what the film is; the poster is the drawing. An empty
    // figure is an empty thumbnail even when the title is on screen.
    return prims === 0 && drawn === 0;
  }, first.t);
  if (empty) {
    findings.push({ code: "first_frame_empty", severity: "warning", message: "the first frame shows nothing: this is the thumbnail", where: beats[0].tag, time: first.t });
  }
  return findings;
}

function measureSilence(plan, beats) {
  const spoken = beats.some((b) => Number(b.speechDur) > 0);
  const total = beats.reduce((sum, b) => sum + (b.end - b.start), 0);
  if (spoken || total <= 15) return [];
  return [{ code: "film_silent", severity: "warning", message: `${Math.round(total)} s with no narration`, where: plan.part, time: 0 }];
}

// Runs in the page: what is on screen at this instant, how big it renders, and
// what it is painted over. Colours travel raw; the arithmetic stays in Node.
function collectText() {
  const ownText = (el) => {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\s+/g, " ").trim();
  };
  const chainOf = (el) => {
    const out = [];
    for (let n = el; n; n = n.parentElement) out.push(n);
    return out;
  };
  const opacityOf = (el) => chainOf(el).reduce((o, n) => o * parseFloat(getComputedStyle(n).opacity || "1"), 1);
  // An SVG text sits on the shape drawn beside it, not on its ancestors' fill
  // (that is the text's own ink). Take the last filled shape in the primitive.
  const svgBackdrop = (el) => {
    const prim = el.closest("[data-prim]");
    if (!prim) return null;
    const box = el.getBoundingClientRect();
    let best = null;
    let bestArea = 0;
    for (const shape of prim.querySelectorAll("rect,circle,ellipse,path,polygon,polyline")) {
      // A shape with no declared fill computes to black, which is ink (a stroked
      // connector), never the paper under the words.
      const declared = shape.getAttribute("fill");
      if (!declared) continue;
      const fill = declared || getComputedStyle(shape).fill;
      if (!fill || fill === "none" || fill === "transparent") continue;
      if (/^rgba\([^)]*,\s*0\s*\)$/.test(String(fill).trim())) continue;
      // Only a shape that actually sits under the words is their background; an
      // arrowhead beside a caption is not.
      const r = shape.getBoundingClientRect();
      if (r.left > box.left + 1 || r.right < box.right - 1 || r.top > box.top + 1 || r.bottom < box.bottom - 1) continue;
      const area = r.width * r.height;
      if (area >= bestArea) {
        bestArea = area;
        best = fill;
      }
    }
    return best;
  };
  const bgChain = (el) => {
    const out = [];
    for (const n of chainOf(el).reverse()) {
      if (n instanceof SVGElement) continue; // an SVG fill is the ink, never the paper under it
      const paint = getComputedStyle(n).backgroundColor;
      if (!paint || paint === "none" || paint === "transparent") continue;
      if (/^rgba\([^)]*,\s*0\s*\)$/.test(String(paint).trim())) continue;
      out.push(paint);
    }
    if (el instanceof SVGElement) {
      const backdrop = svgBackdrop(el);
      if (backdrop) out.push(backdrop);
    }
    return out;
  };
  const describe = (el) => {
    if (el.id) return `#${el.id}`;
    const cls = (el.getAttribute("class") || "").trim().split(/\s+/)[0];
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  };
  const out = [];
  for (const el of document.querySelectorAll("#stage *")) {
    const text = ownText(el);
    if (!text) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (opacityOf(el) < 0.05) continue;
    const cs = getComputedStyle(el);
    const svg = el instanceof SVGElement;
    let px = parseFloat(cs.fontSize);
    if (svg) {
      const m = el.getScreenCTM();
      if (m) px *= Math.hypot(m.a, m.b);
    }
    out.push({
      text: text.slice(0, 120),
      px: Number(px.toFixed(1)),
      weight: parseInt(cs.fontWeight, 10) || 400,
      color: svg ? cs.fill : cs.color,
      bgChain: bgChain(el),
      texture: !!el.closest("[data-texture]"),
      where: describe(el),
    });
  }
  return out;
}

function report(plan, findings, summary) {
  const order = { error: 0, warning: 1, waived: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity] || (a.time || 0) - (b.time || 0));
  if (args.json) {
    console.log(JSON.stringify({ part: plan.part, total: plan.total, findings: sorted, summary }, null, 1));
    return;
  }
  const floor = typeFloor(1080);
  console.log(`${plan.part} · ${plan.beats.length} beats · ${fmt(plan.total)} · floor ${floor} px · AA ${4.5}:1`);
  for (const f of sorted) {
    if (f.severity === "waived" && !args.verbose) continue;
    const times = f.count > 1 ? ` ×${f.count}` : "";
    console.log(`${f.severity.padEnd(7)} ${(f.where || "").padEnd(28)} ${String((f.time ?? 0).toFixed(1)).padStart(6)}s${times.padEnd(5)} ${f.code} · ${f.message} · "${truncate(f.text || "")}"`);
  }
  console.log(`summary: ${summary.error} errors · ${summary.warning} warnings · ${summary.waived} waived`);
}

function truncate(text) {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function checkArgs(values) {
  const unknown = Object.keys(values).filter((key) => !KNOWN_ARGS.has(key));
  if (unknown.length) usage(`unknown flag ${unknown.map((key) => `--${key}`).join(", ")}`);
  if (values.sample !== undefined && !(Number(values.sample) > 0)) usage(`--sample ${values.sample} is not a duration`);
  if (values.plan && (values.spec || values.note || values.audio)) usage("--plan already carries the timeline; drop --spec");
  const trio = ["spec", "note", "audio"].filter((key) => values[key]);
  if (trio.length && trio.length !== 3) usage(`--${trio[0]} needs --spec, --note and --audio together`);
  if (!values.plan && !trio.length) usage("needs --plan, or --spec with --note and --audio");
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
  if (problem) console.error(`legibility failed: ${problem}`);
  console.error("usage: legibility.mjs --plan <plan.json> [--json] [--out file] [--sample 1] [--beats s01b00,...] [--verbose]");
  console.error("       legibility.mjs --spec <part.json> --note <note.md> --audio <dir>");
  process.exit(2);
}
