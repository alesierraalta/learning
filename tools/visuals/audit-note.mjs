#!/usr/bin/env node
// A note draws through the engine or it does not draw. This gate reads a note
// and refuses the two things that took the diagrams away from us: an SVG
// written by hand, and a scene that spells meaning as pixels or characters.
import { readFileSync } from "node:fs";
import { CELL_KINDS } from "./markup.mjs";

export const FIGURE = /<lk-figure>\s*<script type="application\/json">([\s\S]*?)<\/script>/g;
export const SCENE_KEYS = ["title", "aria", "viewBox", "grids", "sheets", "panels", "dashed", "bars", "boxes", "arrows", "paths", "labels"];
const GLYPHS = /[→↑←↓]/;
const CELL_DIRS = ["up", "down", "left", "right"];

// A note may talk about markup in a code span. Blank those out, keeping every
// other character in place, so a line number still points at the real line.
const withoutCode = (text) =>
  text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (span) => " ".repeat(span.length));

export function auditNote(markdown, where = "note") {
  const violations = [];
  const text = withoutCode(String(markdown ?? ""));

  // An element in prose ("an <svg> element") is not a drawing; an element with
  // attributes is. That is the line this gate draws.
  const raw = [...text.matchAll(/<svg\s+[a-zA-Z-]+\s*=/g)];
  for (const hit of raw) violations.push(`${where}:${lineOf(text, hit.index)} hand-written <svg>: a note draws through tools/visuals, so the figure keeps its meaning and follows the reader's theme`);

  const fills = [...text.matchAll(/rgba\([^)]*\)/gi)];
  for (const hit of fills) violations.push(`${where}:${lineOf(text, hit.index)} ${hit[0]} layers a colour over an unknown background: name a tone and let the theme mix it against its own paper`);

  let figures = 0;
  for (const match of text.matchAll(FIGURE)) {
    figures += 1;
    const at = lineOf(text, match.index);
    let scene;
    try {
      scene = JSON.parse(match[1]);
    } catch (error) {
      violations.push(`${where}:${at} figure ${figures} is not valid JSON: ${error.message}`);
      continue;
    }
    for (const key of Object.keys(scene)) {
      if (!SCENE_KEYS.includes(key)) violations.push(`${where}:${at} figure ${figures} names "${key}", which the engine cannot draw (it draws: ${SCENE_KEYS.join(", ")})`);
    }
    for (const grid of scene.grids ?? []) {
      for (const cell of grid.cells ?? []) {
        if (cell.label && GLYPHS.test(cell.label)) violations.push(`${where}:${at} figure ${figures} spells its meaning as the character "${cell.label}": use kind "policy" with a direction (${CELL_DIRS.join(", ")})`);
        if (cell.kind && !CELL_KINDS.includes(cell.kind)) violations.push(`${where}:${at} figure ${figures} has a cell kind the engine does not have: "${cell.kind}"`);
      }
    }
    for (const label of scene.labels ?? []) {
      if (GLYPHS.test(String(label.text ?? ""))) violations.push(`${where}:${at} figure ${figures} spells its meaning as the character "${label.text}": draw an arrow instead`);
    }
  }

  return { figures, violations };
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--note");
  if (at === -1 || !args[at + 1]) {
    console.error("usage: node tools/visuals/audit-note.mjs --note <path>");
    process.exit(2);
  }
  const note = args[at + 1];
  const result = auditNote(readFileSync(note, "utf8"), note);
  for (const violation of result.violations) console.error(violation);
  if (result.violations.length) {
    console.error(`${result.violations.length} violation(s) in ${note}`);
    process.exit(1);
  }
  console.log(`${note}: ${result.figures} figure(s), all drawn by the engine`);
}
