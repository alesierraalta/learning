// Narration audio and its word boundaries. edge-tts is the voice; the cache is
// per beat, so a visual-only re-render never re-synthesises anything.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beatTag } from "./timeline.mjs";

const canon = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

// edge-tts tokenises for its own convenience: it merges "+1 entero" into one
// boundary and splits "−0,04" into four, so its boundaries are aligned back to
// the words the narration actually has. A different text still fails: the
// letters and digits have to match exactly, in order.
export function alignWords(narration, words) {
  const spoken = String(narration).trim().split(/\s+/).filter(Boolean);
  if (!Array.isArray(words)) {
    throw new Error(`the audio's word boundaries are not a list of timings; re-synthesise the narration`);
  }
  const chars = [];
  for (const word of words) {
    const t = Number(word.t);
    const d = Number(word.d);
    if (!Number.isFinite(t) || t < 0 || !Number.isFinite(d) || d < 0) {
      throw new Error(
        `a recorded word boundary has no usable timing (offset ${JSON.stringify(word.t)}, duration ${JSON.stringify(word.d)}); re-synthesise the narration`,
      );
    }
    for (const ch of canon(word.w)) chars.push({ ch, t, d });
  }
  const heard = chars.map((c) => c.ch).join("");
  const written = spoken.map(canon).join("");
  if (heard !== written) {
    throw new Error(
      `narration does not match the audio's word boundaries (${written.length} letters and digits written, ${heard.length} recorded); re-synthesise the narration`,
    );
  }
  const aligned = [];
  let at = 0;
  for (const word of spoken) {
    const length = canon(word).length;
    if (!length) {
      // A token with no letters or digits ("=", "−") has no span of its own; it
      // keeps its place so the narration and the audio stay word for word.
      const here = chars[at] || chars[chars.length - 1];
      aligned.push({ t: here ? here.t : 0, d: 0.001, w: word });
      continue;
    }
    const first = chars[at];
    const last = chars[at + length - 1];
    aligned.push({ t: first.t, d: Number((last.t + last.d - first.t).toFixed(3)), w: word });
    at += length;
  }
  return aligned;
}

export function loadAudio(spec, { dir, remote }) {
  mkdirSync(dir, { recursive: true });
  const beats = new Map();
  spec.sections.forEach((section, si) => {
    section.beats.forEach((beat, bi) => {
      const tag = beatTag(si, bi);
      const mp3 = join(dir, `${tag}.mp3`);
      const words = join(dir, `${tag}.json`);
      if ((!existsSync(mp3) || !existsSync(words)) && remote) {
        execFileSync("scp", ["-q", `${remote}/${tag}.mp3`, `${remote}/${tag}.json`, dir], { stdio: "inherit" });
      }
      if (!existsSync(mp3) || !existsSync(words)) {
        throw new Error(`missing narration for ${tag} in ${dir}; render on the VPS or pass --remote synchub:<dir>`);
      }
      const boundaries = JSON.parse(readFileSync(words, "utf8"));
      beats.set(tag, {
        mp3,
        dur: duration(mp3),
        words: alignWords(beat.narration, boundaries),
      });
    });
  });
  return beats;
}

function duration(path) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" });
  return Number(out.trim());
}
