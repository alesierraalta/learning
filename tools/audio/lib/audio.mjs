// Recorded turns and their word boundaries. Synthesis is a separate step
// (`synth.py`, edge-tts on the VPS); the renderer only consumes the cache, so a
// text change can never be captioned over an older take.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { turnTags } from "./timeline.mjs";

/** Reads every turn the spec needs. Missing or stale recordings are a hard stop. */
export function loadTurns(spec, { dir, remote }) {
  mkdirSync(dir, { recursive: true });
  const turns = new Map();
  const missing = [];
  const stale = [];
  for (const tag of turnTags(spec)) {
    if (turns.has(tag.key)) continue;
    const mp3 = join(dir, `${tag.key}.mp3`);
    const meta = join(dir, `${tag.key}.json`);
    if ((!existsSync(mp3) || !existsSync(meta)) && remote) {
      try {
        execFileSync("scp", ["-q", `${remote}/${tag.key}.mp3`, `${remote}/${tag.key}.json`, dir], { stdio: "ignore" });
      } catch {
        // A failed fetch leaves the turn missing; the report below says which one.
      }
    }
    if (!existsSync(mp3) || !existsSync(meta)) {
      missing.push(`${tag.key} (${tag.voice})`);
      continue;
    }
    let written;
    try {
      written = JSON.parse(readFileSync(meta, "utf8"));
    } catch {
      stale.push(`${tag.key}: unreadable ${tag.key}.json`);
      continue;
    }
    if (written.text !== tag.text) {
      stale.push(`${tag.key}: the recording says other words (re-synthesise this turn)`);
      continue;
    }
    turns.set(tag.key, {
      mp3,
      dur: duration(mp3),
      words: (written.boundaries || []).map((b) => ({ t: Number(b.t), d: Number(b.d), w: String(b.w) })),
    });
  }
  if (missing.length) {
    throw new Error(
      `missing ${missing.length} recording(s) in ${dir}: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}\n` +
        `  synthesise them first: python3 tools/audio/synth.py --spec <spec> --out ${dir} (on the VPS)`,
    );
  }
  if (stale.length) throw new Error(`stale recordings in ${dir}:\n  - ${stale.join("\n  - ")}`);
  return turns;
}

function duration(path) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], { encoding: "utf8" });
  const value = Number(out.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${path} has no measurable duration`);
  return value;
}
