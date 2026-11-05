// The video spec: a part's narration and, per beat, which visual plays.
// One spec per part; the engine never needs a code change for a new part.
import { readFileSync } from "node:fs";

export function readSpec(path) {
  let spec;
  try {
    spec = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`${path} is not a valid spec JSON: ${cause.message}`, { cause });
  }
  const problems = validate(spec);
  if (problems.length) throw new Error(`${path}:\n  - ${problems.join("\n  - ")}`);
  return spec;
}

export function validate(spec) {
  const problems = [];
  for (const key of ["part", "title", "topic"]) {
    if (!spec[key]) problems.push(`missing "${key}"`);
  }
  if (!Array.isArray(spec.sections) || !spec.sections.length) {
    problems.push("missing sections");
    return problems;
  }
  spec.sections.forEach((section, si) => {
    if (!section.heading) problems.push(`section ${si} has no heading`);
    if (!Array.isArray(section.beats) || !section.beats.length) problems.push(`section ${si} has no beats`);
    (section.beats || []).forEach((beat, bi) => {
      const where = `section ${si} beat ${bi}`;
      if (!beat.title) problems.push(`${where} has no title`);
      if (!beat.narration || beat.narration.trim().split(/\s+/).length < 8) problems.push(`${where} narration is too short to be a beat`);
      if (beat.hold !== undefined && typeof beat.hold !== "boolean") problems.push(`${where} hold must be true or false`);
      const v = beat.visual || {};
      if (!v.deck && !v.scenes && !v.scene) problems.push(`${where} has no visual (deck, scene or scenes)`);
      if (v.deck && (v.scenes || v.scene)) problems.push(`${where} names both a deck and its own scenes; keep one visual`);
      if (v.steps !== undefined && (!Array.isArray(v.steps) || v.steps.some((step) => !Number.isInteger(step) || step < 0))) {
        problems.push(`${where} deck steps must be non-negative integers`);
      }
      if (v.deck && v.steps && !v.steps.length) problems.push(`${where} picks no deck steps`);
      problems.push(...visualCounts(where, v, beat.narration));
    });
  });
  return problems;
}

// The same folding the timeline uses to match a phrase against the recording.
const fold = (text) => String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function says(narration, phrase) {
  const spoken = fold(narration).split(" ");
  const wanted = fold(phrase).split(" ").filter(Boolean);
  if (!wanted.length) return false;
  return spoken.some((_, i) => wanted.every((word, k) => spoken[i + k] === word));
}

// The drawing may only change when the voice names what changed: a viewer
// cannot read a new figure and listen to a different sentence at once.
function visualCounts(where, v, narration) {
  const problems = [];
  if (v.deck && !Array.isArray(v.steps)) {
    problems.push(`${where} names a deck without steps; say which steps play, in order`);
    return problems;
  }
  const states = v.scenes ? v.scenes.length : v.deck ? v.steps.length : 1;
  if (states === 0) {
    problems.push(`${where} has no state to draw: give the visual at least one scene or one deck step`);
    return problems;
  }
  if (!v.anchors || !v.anchors.length) {
    if (states > 1) {
      problems.push(`${where} shows ${states} states but declares no anchors: every change of drawing must be caused by a spoken phrase`);
    }
    return problems;
  }
  if (v.anchors.length !== states) {
    problems.push(`${where} shows ${states} states but declares ${v.anchors.length} anchors`);
  }
  const timed = v.anchors.filter((anchor) => typeof anchor !== "string");
  if (timed.length) {
    problems.push(`${where} anchors must be spoken phrases, not numbers or fractions (${timed.length} of ${v.anchors.length} are not text)`);
  }
  v.anchors.filter((anchor) => typeof anchor === "string").forEach((anchor) => {
    if (!says(narration, anchor)) problems.push(`${where} anchors on "${anchor}", which the narration never says`);
  });
  return problems;
}
