// Narration audio and its word boundaries. edge-tts is the voice; the cache is
// per beat, so a visual-only re-render never re-synthesises anything.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beatTag } from "./timeline.mjs";

export function loadAudio(spec, { dir, remote }) {
  mkdirSync(dir, { recursive: true });
  const beats = new Map();
  spec.sections.forEach((section, si) => {
    section.beats.forEach((_, bi) => {
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
        words: boundaries.map((b) => ({ t: Number(b.t), d: Number(b.d), w: String(b.w) })),
      });
    });
  });
  return beats;
}

function duration(path) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" });
  return Number(out.trim());
}
