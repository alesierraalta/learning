// Shared fixtures: a valid spec, its cache keys and a fake recording cache.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VOICES, RATE } from "../lib/spec.mjs";
import { turnKey, turnTags } from "../lib/timeline.mjs";

/** `n` distinct words, enough to fill a turn without repeating the same line. */
export function text(n, tag = "t") {
  return Array.from({ length: n }, (_, i) => `${tag}${i + 1}`).join(" ");
}

/** Two chapters of seven alternating turns: enough words to clear the 12-minute gate. */
export function conversation(overrides = {}) {
  const one = (chapterTag, count) =>
    Array.from({ length: count }, (_, i) => ({
      speaker: i % 2 === 0 ? "A" : "B",
      text: text(130, `${chapterTag}${i + 1}w`),
    }));
  return {
    part: "p1",
    title: "Agentes que actúan",
    topic: "rl",
    style: "debate",
    minutes: 20,
    chapters: [
      { title: "Qué es un agente", segments: one("a", 8) },
      { title: "Dónde falla", segments: one("b", 8) },
    ],
    ...overrides,
  };
}

/** Four concepts, three turns each: a one-voice capsule of about six minutes. */
export function capsule(overrides = {}) {
  const concept = (tag, index) => ({
    title: `Concepto ${index}`,
    segments: [1, 2, 3].map((turn) => ({ speaker: "A", text: text(75, `${tag}${turn}`) })),
  });
  return {
    part: "b1",
    title: "Ruta crítica",
    topic: "administracion-proyectos",
    style: "formal",
    capsule: true,
    minutes: 6,
    chapters: [concept("c1", 1), concept("c2", 2), concept("c3", 3), concept("c4", 4)],
    ...overrides,
  };
}

export function tempDir(prefix = "audio-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A silent mp3 plus the boundaries json the renderer expects for that turn. */
export function record(dir, { voice, text: line, seconds = 5, words = 6 }) {
  mkdirSync(dir, { recursive: true });
  const key = turnKey(voice, line);
  const mp3 = join(dir, `${key}.mp3`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=220:duration=${seconds}`, "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", mp3]);
  const boundaries = Array.from({ length: words }, (_, i) => ({ t: i * 0.5, d: 0.5, w: `p${i + 1}` }));
  writeFileSync(join(dir, `${key}.json`), JSON.stringify({ key, voice, rate: RATE, text: line, boundaries }, null, 1));
  return key;
}

/** Records every turn of a spec with the right voice and text. */
export function recordAll(spec, dir, options = {}) {
  const keys = [];
  for (const tag of turnTags(spec)) {
    if (keys.includes(tag.key)) continue;
    keys.push(record(dir, { voice: tag.voice, text: tag.text, ...options }));
  }
  return keys;
}

export function voiceOf(speaker) {
  return VOICES[speaker === "A" ? "Alvaro" : "Elvira"];
}
