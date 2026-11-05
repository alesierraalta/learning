// The CLI is the only way a part becomes a video, so its honesty is part of the
// contract: a flag that does nothing, a failure that leaves a deliverable SRT
// behind, or a spec problem reported as a JavaScript TypeError all cost a render.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = new URL("../../..", import.meta.url).pathname;
const CLI = join(REPO, "tools/video/render.mjs");
const WORDS = "cada estado decide que hacer y el valor lo dice".split(" ");
const BEATS = 4;

function fixture({ narration = WORDS.join(" "), visual } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "video-cli-"));
  const audio = join(dir, "audio");
  mkdirSync(audio);
  const sections = [{ kicker: "Sección 1", heading: "Uno", beats: [] }];
  for (let i = 0; i < BEATS; i++) {
    const tag = `s01b${String(i).padStart(2, "0")}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "1", "-q:a", "9", join(audio, `${tag}.mp3`)]);
    writeFileSync(join(audio, `${tag}.json`), JSON.stringify(WORDS.map((w, k) => ({ t: k * 0.1, d: 0.09, w }))));
    sections[0].beats.push({
      title: `Beat ${i}`,
      narration,
      visual: visual || { scenes: [{ text: "uno", scene: { boxes: [{ x: 100, y: 100, w: 60, h: 50, label: "A" }] } }] },
    });
  }
  writeFileSync(join(dir, "note.md"), `<lk-walkthrough><script type="application/json">${JSON.stringify({
    title: "Prueba", viewBox: "0 0 360 290",
    steps: [{ title: "A", text: "uno", scene: { boxes: [] } }, { title: "B", text: "dos", scene: { boxes: [] } }],
  })}</script></lk-walkthrough>`);
  writeFileSync(join(dir, "part.json"), JSON.stringify({ part: "Parte T", title: "Prueba", topic: "t", sections }));
  return { dir, audio, note: join(dir, "note.md"), spec: join(dir, "part.json"), work: join(dir, "work") };
}

function render(f, extra) {
  const args = [CLI, "--spec", extra.spec || f.spec, "--note", f.note, "--audio", f.audio, "--work", f.work, ...(extra.args || [])];
  const run = spawnSync("node", args, { encoding: "utf8", timeout: 120_000 });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

test("a flag nobody implements is rejected instead of silently doing nothing", () => {
  const f = fixture();
  const run = render(f, { args: ["--vidoe", join(f.dir, "out.mp4")] });
  assert.notEqual(run.code, 0, "a misspelled --video must not report success");
  assert.match(run.out, /vidoe/, "the error names the flag that was not understood");
});

test("a still time that is not a real instant is rejected, and writes nothing", () => {
  for (const bad of ["nan", "-5"]) {
    const f = fixture();
    const run = render(f, { args: ["--stills", bad] });
    assert.notEqual(run.code, 0, `--stills ${bad} must fail`);
    const dir = join(f.work, "stills");
    assert.ok(!existsSync(dir) || readdirSync(dir).length === 0, `--stills ${bad} wrote a frame`);
  }
});

test("a render that cannot finish leaves no deliverable SRT behind", () => {
  const f = fixture();
  const run = render(f, { args: ["--from", "20", "--to", "5", "--video", join(f.work, "out.mp4")] });
  assert.notEqual(run.code, 0);
  assert.ok(!existsSync(join(f.work, "final.srt")), "the SRT describes the whole part, so it cannot outlive a failed render");
});

test("a slice render does not write the whole part's captions", () => {
  const f = fixture();
  const run = render(f, { args: ["--from", "2", "--to", "4", "--stills", "3"] });
  assert.equal(run.code, 0, run.out);
  const srt = readFileSync(join(f.work, "final.srt"), "utf8");
  const start = srt.split("\n")[1].split(" --> ")[0];
  const [h, m, rest] = start.split(":");
  const at = +h * 3600 + +m * 60 + +rest.replace(",", ".");
  assert.ok(at >= 2, `the first cue starts at ${start}, before the slice began`);
});

test("an out-of-range deck step is a spec error, not a TypeError", () => {
  const f = fixture({ visual: { deck: "Prueba", steps: [99] } });
  const run = render(f, { args: ["--stills", "0.2"] });
  assert.notEqual(run.code, 0);
  assert.doesNotMatch(run.out, /Cannot read properties/, "a spec problem must not surface as a JavaScript TypeError");
  assert.match(run.out, /99/, "the error names the step index");
});

test("a visual that names a deck and its own scenes is rejected, not silently resolved", () => {
  const f = fixture({ visual: { deck: "Prueba", scenes: [{ scene: { boxes: [{ x: 1, y: 1, w: 9, h: 9, label: "X" }] } }] } });
  const run = render(f, { args: ["--stills", "0.2"] });
  assert.notEqual(run.code, 0, "one of the two visuals is dropped without a word");
});

test("narration that no recording matches is rejected instead of shipping the old words", () => {
  const f = fixture({ narration: "una narración completamente distinta que nadie grabó todavía en el audio" });
  const run = render(f, { args: ["--stills", "0.2"] });
  assert.notEqual(run.code, 0, "the captions come from the recording, so a stale recording must not pass as this narration");
  assert.match(run.out, /narration|boundaries|re-synth/i);
});

test("a window that starts after the part ends is refused", () => {
  const f = fixture();
  const run = render(f, { args: ["--from", "99", "--to", "100", "--video", join(f.dir, "out.mp4")] });
  assert.notEqual(run.code, 0, "a window outside the part must not report success");
  assert.match(run.out, /ends|length|shorter|part/i, "the error says the part is shorter than the window");
});
