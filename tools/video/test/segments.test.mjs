// Editing one scene must cost that scene and nothing else. The film is cut on
// frame boundaries where the drawing changes (one segment per beat), each piece
// is encoded on its own, and the pieces are joined with `stream copy`; the cache
// decides which pieces a render has to make. Two things are therefore claims
// that must be shown and not assumed:
//
//   1. after editing one scene, the render captures and encodes only that beat's
//      segment, and the film it writes is the film a cold render of the same spec
//      writes — frame for frame, not "close enough";
//   2. a change to the code that draws a frame (src/page/stage.js, the kit's
//      scene.js) invalidates every segment. Without that, the first experiment
//      with the drawing would be served frames from the code before it and the
//      film would look fine.
//
// The identity comparison runs at `--crf 0` so a frame that disagrees is a frame
// that was drawn differently or assembled wrongly, never a frame the encoder
// reconstructed differently from its neighbour's picture. The quality of the
// lossy encode is measured in `quality.test.mjs`, against the single-pass film.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copiedEngine } from "./fixtures/engine.mjs";

const REPO = new URL("../../..", import.meta.url).pathname;
const CLI = join(REPO, "tools/video/render.mjs");
const WORDS = "cada estado decide que hacer y el valor lo dice".split(" ");
const SPEECH = 0.4; // seconds of narration per beat
// LEAD 0.15 + SPEECH + TAIL 0.35, from lib/timeline.mjs: the beat length is the
// same for every beat, so a beat is exactly one segment and moving a scene
// between two beats does not move the picture.
const BEAT = Number((0.15 + SPEECH + 0.35).toFixed(3));
const BEATS = 3;

// Three beats: long enough that the film is cut in three segments, short enough
// that a test can render it four times.
function part() {
  const dir = mkdtempSync(join(tmpdir(), "video-segments-"));
  const audio = join(dir, "audio");
  mkdirSync(audio);
  const sections = [{ kicker: "Sección 1", heading: "Uno", beats: [] }];
  for (let i = 0; i < BEATS; i++) {
    const tag = `s01b0${i}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(SPEECH), "-q:a", "9", join(audio, `${tag}.mp3`)]);
    writeFileSync(join(audio, `${tag}.json`), JSON.stringify(WORDS.map((w, k) => ({ t: k * 0.04, d: 0.03, w }))));
    sections[0].beats.push({
      title: `Beat ${i}`,
      narration: WORDS.join(" "),
      visual: {
        anchors: ["cada", "el valor"],
        scenes: [
          { text: "uno", scene: { boxes: [{ x: 60 + i * 24, y: 60, w: 70, h: 40, label: `b${i}` }] } },
          { text: "dos", scene: { boxes: [{ x: 60 + i * 24, y: 60, w: 70, h: 40, label: `b${i}` }, { x: 60, y: 150, w: 70, h: 40, label: "más" }] } },
        ],
      },
    });
  }
  writeFileSync(join(dir, "note.md"), "");
  const spec = join(dir, "part.json");
  writeFileSync(spec, JSON.stringify({ part: "Parte T", title: "Segmentos", topic: "t", sections }));
  return { dir, audio, note: join(dir, "note.md"), spec, total: Number((BEAT * BEATS).toFixed(3)) };
}

function render(f, { work, spec = f.spec, args = [], cli = CLI } = {}) {
  const run = spawnSync("node", [cli, "--spec", spec, "--note", f.note, "--audio", f.audio, "--work", work, ...args], { encoding: "utf8", timeout: 180_000 });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

// The pictures a film actually carries, in the order it plays them: the encoder's
// own view of every frame, not a description of it.
function frameHashes(file) {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"], { encoding: "utf8", timeout: 120_000 });
  assert.equal(run.status, 0, `framemd5 could not read ${file}:\n${run.stderr}`);
  return run.stdout.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(",").pop().trim());
}

function report(work) {
  return JSON.parse(readFileSync(join(work, "timings.json"), "utf8"));
}

// How many segments the render had to make and how many it served from disk.
function segments(work, label = "") {
  const found = report(work).stages.find((s) => s.stage === "segments");
  assert.ok(found, `${label}no render says how many segments it captured: ${JSON.stringify(report(work).stages.map((s) => s.stage))}`);
  return found;
}

test("editing one scene re-encodes one segment, and the film is the cold film", () => {
  const f = part();
  const work = join(f.dir, "work");
  const out = join(work, "out.mp4");
  const window = ["--from", "0", "--to", String(f.total), "--crf", "0", "--video", out];

  const cold = render(f, { work, args: window });
  assert.equal(cold.code, 0, cold.out);
  const first = segments(work);
  assert.equal(first.segments, BEATS, `a ${BEATS}-beat window was cut in ${first.segments} segment(s), so a beat is not a segment`);
  assert.deepEqual([first.hits, first.misses], [0, BEATS], `a cache nobody has filled yet cannot be a hit: ${JSON.stringify(first)}`);
  assert.equal(first.frames, Math.round(f.total * 30), "the segments together cover every frame of the window");
  const filmCold = frameHashes(out);
  assert.equal(filmCold.length, Math.round(f.total * 30), `the film carries ${filmCold.length} frames, not ${Math.round(f.total * 30)}`);

  // The same command again: nothing changed, so nothing is captured.
  const warm = render(f, { work, args: window });
  assert.equal(warm.code, 0, warm.out);
  const second = segments(work);
  assert.deepEqual([second.hits, second.misses], [BEATS, 0], `a render of an unchanged part still captured ${second.misses} segment(s)`);
  assert.deepEqual(frameHashes(out), filmCold, "a warm render is a different film from the cold render of the same spec");

  // One scene, one label: the second beat's drawing changes and nothing else.
  const spec = JSON.parse(readFileSync(f.spec, "utf8"));
  for (const scene of spec.sections[0].beats[1].visual.scenes) scene.scene.boxes[0].label = "otro";
  const edited = join(f.dir, "edited.json");
  writeFileSync(edited, JSON.stringify(spec));

  const after = render(f, { work, spec: edited, args: window });
  assert.equal(after.code, 0, after.out);
  const third = segments(work);
  assert.deepEqual([third.hits, third.misses], [BEATS - 1, 1], `editing one beat re-encoded ${third.misses} segments, not one`);

  // The film a warm cache writes must be the film a cold render of the same spec
  // writes: the cache is a speed-up, not a second renderer.
  const coldDir = join(f.dir, "cold");
  const coldAnyway = render(f, { work: coldDir, spec: edited, args: ["--from", "0", "--to", String(f.total), "--crf", "0", "--video", join(coldDir, "out.mp4")] });
  assert.equal(coldAnyway.code, 0, coldAnyway.out);
  assert.deepEqual(segments(coldDir).misses, BEATS, "the cold render is the reference, so it captures everything");
  assert.deepEqual(frameHashes(out), frameHashes(join(coldDir, "out.mp4")), "the film assembled from cached segments is not the film a render from scratch writes");
});

// A stream copy puts the pieces back together, so the film assembled from the
// segments has to be the one-pass film frame for frame — nothing dropped at a cut,
// nothing repeated, nothing reordered. Encoded lossless, so a frame that disagrees
// is a frame that was assembled wrongly.
test("the cut changes neither the frames nor their order", () => {
  const f = part();
  const window = ["--from", "0.4", "--to", "1.4", "--crf", "0", "--video"];
  const cut = join(f.dir, "cut");
  const whole = join(f.dir, "whole");
  const segmented = render(f, { work: cut, args: [...window, join(cut, "out.mp4")] });
  assert.equal(segmented.code, 0, segmented.out);
  assert.equal(segments(cut).segments, 2, "a window from 0.4 s to 1.4 s of 0.9 s beats is two segments");
  const onePass = render(f, { work: whole, args: [...window, join(whole, "out.mp4"), "--single-pass"] });
  assert.equal(onePass.code, 0, onePass.out);
  const joined = frameHashes(join(cut, "out.mp4"));
  assert.equal(joined.length, 30, `a 1 s window at 30 fps is 30 frames, got ${joined.length}`);
  assert.ok(new Set(joined).size > 1, "every frame of the window is the same picture, so this test could not see a reorder");
  assert.deepEqual(joined, frameHashes(join(whole, "out.mp4")), "the concatenated film is not the one-pass film frame by frame: the cut dropped, repeated or reordered a frame");
});

// A change to the code that draws a frame invalidates every cached segment. The
// engine runs from a copy, so the test can change the drawing without touching the
// repository it is running in.
test("a change to the code that draws a frame invalidates every cached segment", () => {
  const root = copiedEngine();
  const f = part();
  const work = join(root, "work");
  const cli = join(root, "tools/video/render.mjs");
  const args = ["--from", "0", "--to", "0.5", "--crf", "0", "--video", join(work, "out.mp4")];

  const cold = render(f, { work, args, cli });
  assert.equal(cold.code, 0, cold.out);
  assert.deepEqual(segments(work, "cold: ").misses, 1, "the first render of a window inside one beat makes one segment");
  const film = frameHashes(join(work, "out.mp4"));
  const drawing = report(work).cache?.drawing;
  assert.match(String(drawing), /^[0-9a-f]{64}$/, `the report does not name the drawing it filmed: ${JSON.stringify(report(work).cache)}`);

  // Same source, same spec: the segment is served from disk.
  const again = render(f, { work, args, cli });
  assert.equal(again.code, 0, again.out);
  assert.deepEqual(segments(work, "warm: ").hits, 1, "an unchanged drawing did not hit the cache");

  // A comment draws nothing, and it is still a change to the file that draws the
  // frame: the cache has no way to know it does not matter, and a cache that
  // guessed would serve the code before the change.
  appendFileSync(join(root, "tools/video/src/page/stage.js"), "\n// a change to the drawing, even one that moves no pixel\n");
  const after = render(f, { work, args, cli });
  assert.equal(after.code, 0, after.out);
  const changed = segments(work, "after the drawing changed: ");
  assert.deepEqual([changed.hits, changed.misses], [0, 1], "the drawing changed under the cache and it served the old frames");
  assert.notEqual(report(work).cache.drawing, drawing, "the report says the drawing is the same one, so the new source never reached the key");
  assert.deepEqual(frameHashes(join(work, "out.mp4")), film, "a comment that draws nothing produced a different film, so the invalidation caught more than the code");
});

// An interrupted render must not leave an entry a later render would serve: the
// entry is written under a temporary name and only a rename publishes it. A
// process killed outright can leave a `.part` behind — that is why the temporary
// exists and why nothing reads it — but a render that fails and reports it has no
// reason to leave anything at all.
test("a render that dies while encoding leaves no half segment to serve", () => {
  const f = part();
  const work = join(f.dir, "work");
  const run = render(f, { work, args: ["--from", "0", "--to", "0.5", "--preset", "nosuchpreset", "--video", join(work, "out.mp4")] });
  assert.notEqual(run.code, 0, `the encoder refused to start, yet the render exited ${run.code}:\n${run.out}`);
  const dir = join(work, "cache");
  const left = existsSync(dir) ? readdirSync(dir) : [];
  assert.deepEqual(left, [], `a failed render left ${left.length} file(s) in the cache: ${left.join(", ")} — an entry that was published half-written would be served by the next render`);
  assert.ok(!existsSync(join(work, "final.srt")), "no deliverable outlives a render that failed");

  // And the part still renders once the encoder is real again.
  const ok = render(f, { work, args: ["--from", "0", "--to", "0.5", "--video", join(work, "out.mp4")] });
  assert.equal(ok.code, 0, ok.out);
  assert.deepEqual(segments(work, "after the failure: ").misses, 1, "the retry after a failed render had to fill the cache, which the failed run should not have filled");
});
