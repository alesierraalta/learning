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
      const v = beat.visual || {};
      if (!v.deck && !v.scenes && !v.scene) problems.push(`${where} has no visual (deck, scene or scenes)`);
      if (v.deck && (v.scenes || v.scene)) problems.push(`${where} names both a deck and its own scenes; keep one visual`);
      if (v.steps !== undefined && (!Array.isArray(v.steps) || v.steps.some((step) => !Number.isInteger(step) || step < 0))) {
        problems.push(`${where} deck steps must be non-negative integers`);
      }
      if (v.deck && v.steps && !v.steps.length) problems.push(`${where} picks no deck steps`);
    });
  });
  return problems;
}
