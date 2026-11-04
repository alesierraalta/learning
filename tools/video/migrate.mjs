#!/usr/bin/env node
// Convert a render_part.py spec into a first draft of an engine spec.
//
// The old pipeline described a beat with a scene *type* ("formula", "flow",
// "chain") and a handful of bullets; this engine describes it with a drawing.
// There is no honest automatic translation between the two, so this tool does
// the one thing it can do without inventing anything: it keeps every narration
// word, and turns the bullets into a single drawn state per beat. The result
// renders, and it tells the author which drawing still has to be written.
//
//   node tools/video/migrate.mjs --spec parts/parte1.json --out /tmp/parte1.draft.json
import { readFileSync, writeFileSync } from "node:fs";
import { validate } from "./lib/spec.mjs";

const USAGE = `usage: node tools/video/migrate.mjs --spec <old.json> --out <new.json> [--force]

Writes a first draft of an engine spec from a render_part.py spec:
every narration is kept word for word, and each beat's bullets become one
drawn state, so the draft renders and shows what still has to be drawn.
`;

const KNOWN = new Set(["--spec", "--out", "--force"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(key)}`);
    if (!KNOWN.has(key)) throw new Error(`${key} is not a flag this tool implements (${[...KNOWN].join(", ")})`);
    if (key === "--force") {
      args.force = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${key} needs a value`);
    args[key.slice(2)] = value;
    i += 1;
  }
  if (!args.spec) throw new Error("--spec is required");
  if (!args.out) throw new Error("--out is required");
  return args;
}

const PANEL = { x: 40, y: 24, w: 640, h: 512 };
const VIEW_BOX = "0 0 720 560";

export function draftScene(beat) {
  const bullets = (beat.bullets || []).map((line) => String(line).trim()).filter(Boolean);
  if (bullets.length === 0) {
    // A beat with no bullets still needs a drawing: say what it was meant to be.
    const kind = typeof beat.scene === "string" && beat.scene ? beat.scene : "sin dibujo";
    return { viewBox: VIEW_BOX, labels: [{ x: 360, y: 280, text: kind, size: 28, anchor: "middle" }] };
  }
  return { viewBox: VIEW_BOX, panels: [{ ...PANEL, lines: bullets, size: 24, lineH: 40 }] };
}

export function draft(spec) {
  const beats = (spec.sections || []).flatMap((s) => s.beats || []);
  if (beats.length === 0) throw new Error("this spec has no beats to convert");
  const done = beats.filter((b) => b.visual);
  if (done.length === beats.length) throw new Error("this spec is already an engine spec: every beat has a visual");
  if (done.length) throw new Error(`this spec is half converted: ${done.length} of ${beats.length} beats already have a visual`);

  return {
    part: spec.part,
    title: spec.title,
    topic: spec.topic,
    voice: spec.voice,
    rate: spec.rate,
    sections: (spec.sections || []).map((s, si) => ({
      kicker: s.kicker,
      heading: s.heading,
      beats: (s.beats || []).map((b, bi) => {
        if (typeof b.narration !== "string" || !b.narration.trim()) {
          throw new Error(`section ${si} beat ${bi} has no narration: what would the narrator say?`);
        }
        return {
          title: b.title,
          narration: b.narration,
          visual: { scene: draftScene(b) },
          migratedFrom: { scene: b.scene || null, bullets: (b.bullets || []).length },
        };
      }),
    })),
  };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  let spec;
  try {
    spec = JSON.parse(readFileSync(args.spec, "utf8"));
  } catch (error) {
    process.stderr.write(`${args.spec} is not readable JSON: ${error.message}\n`);
    process.exit(1);
  }
  let out;
  try {
    out = draft(spec);
  } catch (error) {
    process.stderr.write(`${args.spec}: ${error.message}\n`);
    process.exit(1);
  }
  const problems = validate(out);
  if (problems.length) {
    process.stderr.write(`the draft does not validate, which is a bug in this tool:\n${problems.join("\n")}\n`);
    process.exit(1);
  }
  writeFileSync(args.out, `${JSON.stringify(out, null, 2)}\n`);
  const beats = out.sections.flatMap((s) => s.beats);
  process.stdout.write(`${args.out} · ${beats.length} beats · 1 state each · ${beats.filter((b) => !(b.visual.scene.panels || []).length).length} with no bullets\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
