// The audio spec: one part, one style. A new note needs a spec file, never an
// engine change. The narration is the recording: every turn's text is exactly
// what the voice says, so a changed line is a new take, not a caption over an
// old one.
import { readFileSync } from "node:fs";

export const STYLES = ["debate", "entrevista", "charla", "formal"];

// The vault only has three Spanish (Spain) voices; one podcast keeps one accent,
// so a two-host style is Alvaro + Elvira and nothing else.
export const VOICES = {
  Alvaro: "es-ES-AlvaroNeural",
  Elvira: "es-ES-ElviraNeural",
};

export const RATE = "-4%";
// Measured on delivered audio: 2 893 words of Alvaro + Elvira at -4% rendered
// 1 132.8 s, of which 1 092.9 s is speech — 159 words a minute, not 145. The
// estimate is a budget, so it is calibrated once here instead of per spec.
export const WORDS_PER_MINUTE = 158;
export const TARGET_MINUTES = 20;
// Below 12 minutes it is a fragment, not a podcast; above 28 it is a lecture.
export const MINUTE_WINDOW = [12, 28];

const DEFAULT_VOICES = {
  debate: { A: "Alvaro", B: "Elvira" },
  entrevista: { A: "Elvira", B: "Alvaro" },
  charla: { A: "Alvaro", B: "Elvira" },
  formal: { A: "Alvaro" },
};

/** Speaker letter -> { name, voice }. An explicit `voices` map overrides the style. */
export function resolveVoices(spec) {
  const declared = spec.voices || DEFAULT_VOICES[spec.style] || {};
  return Object.fromEntries(
    Object.entries(declared).map(([speaker, name]) => [speaker, { name, voice: VOICES[name] || name }]),
  );
}

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

const words = (text) => String(text ?? "").trim().split(/\s+/).filter(Boolean).length;

export function validate(spec) {
  const problems = [];
  for (const key of ["part", "title", "topic"]) {
    if (!spec[key]) problems.push(`missing "${key}"`);
  }
  if (!STYLES.includes(spec.style)) problems.push(`style must be one of ${STYLES.join(", ")}`);
  const minutes = spec.minutes ?? TARGET_MINUTES;
  if (!Number.isInteger(minutes) || minutes < 8 || minutes > 35) {
    problems.push("minutes must be an integer between 8 and 35");
  }
  if (!spec.chapters || !Array.isArray(spec.chapters) || !spec.chapters.length) {
    problems.push("missing chapters");
    return problems;
  }
  const voices = resolveVoices(spec);
  const speakers = Object.keys(voices).sort();
  for (const [speaker, entry] of Object.entries(voices)) {
    if (!entry.voice) problems.push(`speaker ${speaker} names no voice`);
  }
  if (spec.style === "formal" && speakers.length !== 1) {
    problems.push("formal is one voice explaining: declare exactly one speaker");
  }
  if (spec.style !== "formal" && speakers.length < 2) {
    problems.push(`${spec.style} is a conversation: declare two speakers`);
  }
  if (spec.style !== "formal" && speakers.length === 2 && voices.A.voice === voices.B.voice) {
    problems.push(`${spec.style} needs two different voices: A and B both use ${voices.A.voice}`);
  }
  let total = 0;
  const used = new Set();
  // The speaker rule is about the audio, not the structure: a chapter mark is a
  // pause, so the voice that closes one chapter may not open the next.
  let previous = null;
  spec.chapters.forEach((chapter, ci) => {
    const where = `chapter ${ci}`;
    if (!chapter || !chapter.title) {
      problems.push(`${where} has no title`);
      return;
    }
    if (!Array.isArray(chapter.segments) || !chapter.segments.length) {
      problems.push(`${where} has no segments`);
      return;
    }
    const chapterSpeakers = new Set();
    chapter.segments.forEach((segment, si) => {
      const at = `${where} "${chapter.title}" segment ${si}`;
      if (!segment || typeof segment.speaker !== "string") {
        problems.push(`${at} has no speaker`);
        return;
      }
      if (!voices[segment.speaker]) problems.push(`${at} uses undeclared speaker "${segment.speaker}"`);
      const count = words(segment.text);
      total += count;
      if (count < 6) problems.push(`${at} is too short to be a turn`);
      if (count > 130) problems.push(`${at} is ${count} words; split it into turns`);
      used.add(segment.speaker);
      chapterSpeakers.add(segment.speaker);
      if (spec.style !== "formal" && previous === segment.speaker) {
        problems.push(`${at} repeats speaker "${segment.speaker}": merge the turn or answer it`);
      }
      previous = segment.speaker;
    });
    if (speakers.length > 1 && chapterSpeakers.size < 2) {
      problems.push(`${where} "${chapter.title}" has one voice: a conversation needs both`);
    }
  });
  if (spec.style === "formal" && used.size > 1) {
    problems.push("formal is one voice: segments use more than one speaker");
  }
  // The floor is its own rule: one more problem must not hide it.
  if (total < 200) {
    problems.push(`only ${total} words: a part's audio is not a summary`);
  }
  return problems;
}

export { words };
