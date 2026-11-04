#!/usr/bin/env node
// The promise gate as a command: a part may only say what its frames draw.
//
//   node tools/video/audit.mjs --spec parts/parte3.json --note <note.md>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { audit, formatViolation, promisesOf } from "./lib/promises.mjs";
import { extractDecks } from "./lib/note.mjs";
import { readSpec } from "./lib/spec.mjs";

const KNOWN_ARGS = new Set(["spec", "note"]);

const args = parseArgs(process.argv.slice(2));
checkArgs(args);
if (!args.spec) usage("missing --spec");
if (!args.note) usage("missing --note");

main().catch((cause) => {
  console.error(`audit failed: ${cause.message}`);
  process.exit(1);
});

async function main() {
  const spec = readSpec(resolve(args.spec));
  const decks = extractDecks(await readFile(resolve(args.note), "utf8"));
  const violations = audit(spec, decks);
  const beats = spec.sections.reduce((n, section) => n + section.beats.length, 0);
  const promises = spec.sections.reduce(
    (n, section) => n + section.beats.reduce((m, beat) => m + promisesOf(beat.narration).length, 0),
    0,
  );
  if (violations.length) {
    for (const v of violations) console.error(formatViolation(v));
    process.exit(1);
  }
  console.log(`${beats} beats, ${promises} promises, all drawn`);
}

function checkArgs(args) {
  const unknown = Object.keys(args).filter((key) => !KNOWN_ARGS.has(key));
  if (unknown.length) usage(`unknown flag ${unknown.map((key) => `--${key}`).join(", ")}`);
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
  if (problem) console.error(`audit failed: ${problem}`);
  console.error("usage: audit.mjs --spec <part.json> --note <note.md>");
  process.exit(2);
}
