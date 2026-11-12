// The CLI is the only way a part becomes a video, so its honesty is part of the
// contract: a flag that does nothing, a failure that leaves a deliverable SRT
// behind, or a spec problem reported as a JavaScript TypeError all cost a render.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { densePart } from "./fixtures/dense.mjs";

const REPO = new URL("../../..", import.meta.url).pathname;
const CLI = join(REPO, "tools/video/render.mjs");
const LEGIBILITY = join(REPO, "tools/video/legibility.mjs");
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
  const args = [CLI, "--spec", extra.spec || f.spec, "--note", f.note, "--audio", f.audio, "--work", extra.work || f.work, ...(extra.args || [])];
  const run = spawnSync("node", args, { encoding: "utf8", timeout: 120_000 });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

// The pictures a video actually carries, in the order it plays them: the
// encoder's own view of every frame, not a description of it. The audio is left
// out; a frame here is one picture.
function frameHashes(file) {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"], { encoding: "utf8", timeout: 120_000 });
  assert.equal(run.status, 0, `framemd5 could not read ${file}:\n${run.stderr}`);
  return run.stdout.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(",").pop().trim());
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

test("a part with words nobody can read is not rendered, and leaves no SRT", () => {
  const f = fixture({ visual: { scenes: [{ text: "uno", scene: { labels: [{ x: 180, y: 145, text: "apenas visible", color: "#efefef", size: 13 }] } }] } });
  const run = render(f, { args: ["--stills", "0.2", "--craft"] });
  assert.notEqual(run.code, 0, "a frame nobody can read must stop the render");
  assert.match(run.out, /contrast is/, "the gate says what it measured");
  assert.ok(!existsSync(join(f.work, "final.srt")), "no deliverable outlives a refused gate");
});

test("the craft gate runs on a clean part and reports what it measured", () => {
  const f = fixture();
  const run = render(f, { args: ["--stills", "0.2", "--craft"] });
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /summary: 0 errors/);
});

test("the gate says what it wants and refuses a plan it cannot read", () => {
  const none = spawnSync("node", [LEGIBILITY], { encoding: "utf8" });
  assert.equal(none.status, 2, "no arguments is a usage problem, not a crash");
  assert.match(none.stderr, /needs --plan/);
  const missing = spawnSync("node", [LEGIBILITY, "--plan", join(tmpdir(), "no-such-plan.json")], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cannot read the plan at/);
});

test("a request with a broken escape is a client error, not a dead render", () => {
  const moduleUrl = new URL("../lib/browser.mjs", import.meta.url).href;
  const script = [
    `const { serve } = await import(${JSON.stringify(moduleUrl)});`,
    `const { mkdtempSync, writeFileSync } = await import("node:fs");`,
    `const { tmpdir } = await import("node:os");`,
    `const { join } = await import("node:path");`,
    `const root = mkdtempSync(join(tmpdir(), "serve-"));`,
    `writeFileSync(join(root, "ok.txt"), "fine");`,
    `const server = await serve(root);`,
    `let bad = 0;`,
    `try { bad = (await fetch(server.url + "/%zz")).status; } catch { bad = -1; }`,
    `const after = await fetch(server.url + "/ok.txt");`,
    `console.log("bad:" + bad + " after:" + after.status);`,
    `server.close();`,
  ].join("\n");
  const run = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 20_000 });
  assert.equal(run.status, 0, `the asset server died on one malformed request:\n${run.stderr}`);
  assert.match(run.stdout, /after:200/, "the server keeps serving after a malformed request");
  assert.match(run.stdout, /bad:400/, "a malformed escape is a bad request, not a crash");
});

test("a flag the gate does not implement is refused, not ignored", () => {
  // --work belongs to the renderer; the gate accepted it and did nothing.
  const run = spawnSync("node", [LEGIBILITY, "--plan", join(tmpdir(), "no-such-plan.json"), "--work", "/tmp/x"], { encoding: "utf8" });
  assert.equal(run.status, 2, `--work must be a usage error, got exit ${run.status}`);
  assert.match(run.stderr, /work/, "the error names the flag");
});

test("a beat filter that names no beat is refused instead of reporting green", () => {
  const f = fixture();
  const plan = render(f, { args: ["--stills", "0.2"] });
  assert.equal(plan.code, 0, plan.out);
  const run = spawnSync("node", [LEGIBILITY, "--plan", join(f.work, "plan.json"), "--beats", "s99b99"], { encoding: "utf8", timeout: 60_000 });
  assert.equal(run.status, 2, `a typo in --beats measured nothing and exited ${run.status}:\n${run.out}${run.stderr}`);
  assert.match(`${run.stdout}${run.stderr}`, /s99b99/, "the error names the beat nobody has");
});

test("a stage that is not where it should be says so instead of throwing a TypeError", () => {
  const moduleUrl = new URL("../lib/browser.mjs", import.meta.url).href;
  const script = [
    `const { loadPlaywright, openStage } = await import(${JSON.stringify(moduleUrl)});`,
    `const { tmpdir } = await import("node:os");`,
    `const pw = await loadPlaywright([${JSON.stringify(REPO)}]);`,
    `try { const s = await openStage(pw, { beats: [] }, { root: tmpdir() }); await s.close(); console.log("opened"); }`,
    `catch (e) { console.log("error:" + e.message.split("\\n")[0]); }`,
  ].join("\n");
  const run = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stdout, /is not a function/, `a missing stage surfaced as a TypeError: ${run.stdout}`);
  assert.match(run.stdout, /index\.html/, "the error names the page it could not load");
});

test("a render that names no output says so instead of exiting as if it had rendered", () => {
  const f = fixture();
  const run = render(f, { args: [] });
  assert.equal(run.code, 2, `nothing was asked for, yet the run exited ${run.code}:\n${run.out}`);
  assert.match(run.out, /--video/, "the message names what to pass");
});

// The poster is the frame a viewer sees before pressing play. The README says the
// gate measures it, so a first frame that draws nothing must be reported rather
// than passing as clean.
test("the poster rule fires when the first frame draws nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "video-poster-"));
  const path = join(dir, "plan.json");
  writeFileSync(path, JSON.stringify({
    part: "Parte T",
    total: 2,
    title: "Prueba",
    cues: [],
    beats: [{
      tag: "s01b00", section: 1, beat: 0,
      kicker: "Sección 1", heading: "Uno", title: "Uno",
      narration: "todavía no hay nada dibujado", deck: "", viewBox: "0 0 360 300",
      start: 0, speechStart: 0, speechDur: 0, end: 2,
      states: [{ scene: { shapes: [], boxes: [], labels: [] }, text: "", t: 0 }],
    }],
  }));
  const run = spawnSync("node", [LEGIBILITY, "--plan", path, "--json"], { encoding: "utf8", timeout: 120_000 });
  assert.match(`${run.stdout}${run.stderr}`, /first_frame_empty/, "an empty poster is reported, not passed as clean");
});

// A render that is claimed to be faster has to show where the time went. The
// numbers are persisted next to the video, so the next change is compared
// against them instead of remembered.
test("a render writes how long each stage took, beside the video it wrote", () => {
  const f = fixture();
  const out = join(f.work, "out.mp4");
  const run = render(f, { args: ["--from", "0", "--to", "0.4", "--video", out] });
  assert.equal(run.code, 0, run.out);
  assert.ok(existsSync(out), "the video is still the render's output");
  const report = JSON.parse(readFileSync(join(f.work, "timings.json"), "utf8"));
  assert.equal(report.part, "Parte T");
  assert.equal(report.fps, 30, "the report names the rate the frames were written at");
  assert.equal(report.resolution, "1920x1080", "the report names the size the frames were written at");
  assert.deepEqual(report.window, { from: 0, to: 0.4 }, "the report names the window this render covered");
  assert.ok(!Number.isNaN(Date.parse(report.started_at)), `started_at is a date, got ${report.started_at}`);
  const stage = (name) => {
    const found = report.stages.find((s) => s.stage === name);
    assert.ok(found, `no ${name} stage, only ${JSON.stringify(report.stages.map((s) => s.stage))}`);
    return found;
  };
  for (const name of ["audio", "promises", "capture", "encode"]) {
    assert.ok(stage(name).ms > 0, `${name} claims ${stage(name).ms} ms, which is not a measurement`);
  }
  const capture = stage("capture");
  assert.equal(capture.frames, 12, "capture counts the frames it wrote");
  assert.ok(capture.fps > 0, `capture reports its effective rate, got ${capture.fps}`);
  assert.ok(report.total_ms >= capture.ms, "the total covers the whole run, not just one stage of it");
  assert.ok(!report.stages.some((s) => s.stage === "legibility"), "no --craft, so no craft gate in the report");
});

// Capture is the expensive stage, so it is the one that goes wide, and each
// frame is taken by the cheapest path that still yields the same picture. Going
// wide and going cheap are only worth anything if the film is the same film: the
// frames are compared by hash, one by one and in order, against the sequential
// loop, and the capture path is compared against the screenshot it replaces.
//
// The scene is dense on purpose. A page that draws every fourth frame skips the
// instants in between, so anything the stage only sets when a state is current
// freezes at whichever frame that page happened to draw: with one box that never
// changes, the one-page film is right for the wrong reason and no comparison can
// see it. Here the window crosses two state changes while the elements before
// them are still drawing, which is the worst case for that.
//
// The window is encoded lossless (`--crf 0`) so a frame that disagrees is a frame
// that was drawn differently, not a frame the encoder reconstructed differently
// from its neighbour's picture. The opening frame is left out of the per-frame
// comparison: the first capture of a page is the one that can outrun the paint it
// asked for (a race in the capture path, reproducible without this change as two
// `--workers 1` runs that disagree), and every page opens on a different instant
// anyway. That instant is pinned instead by the test below, which draws the first
// frame of a page with the paint already committed.
test("parallel capture writes the same frames, in the same order", () => {
  const f = densePart();
  const window = ["--from", "0.7", "--to", "1.6", "--crf", "0", "--video"];
  const work = {};
  for (const [label, workers] of [["one", "1"], ["two", "2"], ["four", "4"], ["four-again", "4"]]) {
    const dir = join(f.dir, label);
    const run = render(f, { work: dir, args: [...window, join(dir, "out.mp4"), "--workers", workers] });
    assert.equal(run.code, 0, run.out);
    work[label] = dir;
  }

  const alone = frameHashes(join(work.one, "out.mp4"));
  assert.equal(alone.length, 27, `a 0.9 s window at 30 fps is 27 frames, got ${alone.length}`);
  assert.ok(new Set(alone).size > 1, `every frame in the window is the same picture, so this test could not see a reorder: ${alone[0]}`);
  for (const label of ["two", "four", "four-again"]) {
    const wide = frameHashes(join(work[label], "out.mp4"));
    // A page opens on the first frame it is handed, and that one capture is the
    // only one the capture path waits for a paint on (bounded, so it can still
    // be the surface from before the drawing). Four pages open on four instants,
    // so the first four frames are the capture path's business and are pinned by
    // the test below instead; from there the film must be the same film.
    assert.deepEqual(wide.slice(4), alone.slice(4), `frame i must carry the picture it carried at --workers 1, at the same place in the film; ${label} did not`);
  }

  const capturedWith = (dir) => JSON.parse(readFileSync(join(dir, "timings.json"), "utf8")).stages.find((s) => s.stage === "capture");
  assert.equal(capturedWith(work.one).workers, 1, "the report names the concurrency the frames were captured with");
  assert.equal(capturedWith(work.four).workers, 4);
  assert.equal(capturedWith(work.four).frames, 27, "the same window is still the same number of frames");

  // The stage's own screenshot is the reference the frames are judged against:
  // a capture path may trade PNG bytes for speed, never a pixel. Compared on the
  // decoded picture, which is what the encoder reads.
  const shots = mkdtempSync(join(tmpdir(), "video-capture-"));
  const moduleUrl = new URL("../lib/browser.mjs", import.meta.url).href;
  const script = [
    `const { loadPlaywright, openStage, frameGrabber } = await import(${JSON.stringify(moduleUrl)});`,
    `const { readFileSync, writeFileSync } = await import("node:fs");`,
    `const { join } = await import("node:path");`,
    `const plan = JSON.parse(readFileSync(${JSON.stringify(join(work.one, "plan.json"))}, "utf8"));`,
    `const dir = ${JSON.stringify(shots)};`,
    `const pw = await loadPlaywright([${JSON.stringify(REPO)}]);`,
    `const stage = await openStage(pw, plan, { root: ${JSON.stringify(resolve(REPO))}, pages: 1 });`,
    `const capture = await frameGrabber(stage.page);`,
    `try {`,
    `  for (const at of [0.95, 1.3]) {`,
    `    await stage.page.evaluate((t) => window.__frame(t), at);`,
    `    await stage.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));`,
    `    const fast = await capture();`,
    `    writeFileSync(join(dir, "fast-" + at + ".png"), fast);`,
    `    const slow = await stage.page.screenshot({ type: "png" });`,
    `    writeFileSync(join(dir, "slow-" + at + ".png"), slow);`,
    `    console.log("sizes:" + at + ":" + fast.length + ":" + slow.length);`,
    `  }`,
    `} finally {`,
    `  await stage.close();`,
    `}`,
  ].join("\n");
  const grabbed = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 120_000 });
  assert.equal(grabbed.status, 0, `the frame capture could not run:\n${grabbed.stdout}${grabbed.stderr}`);
  const sizes = [...grabbed.stdout.matchAll(/sizes:([\d.]+):(\d+):(\d+)/g)].map((m) => ({ at: m[1], fast: Number(m[2]), slow: Number(m[3]) }));
  assert.equal(sizes.length, 2, `two instants were captured, got ${sizes.length} in:\n${grabbed.stdout}`);
  const drawn = sizes.map(({ at }) => frameHashes(join(shots, `fast-${at}.png`)));
  const screenshot = sizes.map(({ at }) => frameHashes(join(shots, `slow-${at}.png`)));
  assert.notDeepEqual(drawn[0], drawn[1], "the two instants are the same picture, so this test could not see a wrong frame");
  assert.deepEqual(drawn, screenshot, "the frame that goes into the film must be the pixels the stage drew, at every instant");
  const smaller = sizes.filter(({ fast, slow }) => fast < slow);
  assert.equal(smaller.length, 0, `the fast path produced smaller PNGs than the screenshot it replaces (${JSON.stringify(smaller)}), so it is no longer trading bytes for speed: the speed claim needs a new measurement`);
});

// The same instant has to be the same picture no matter what was drawn before
// it, and no matter which page drew it. Two things outlive the frame they belong
// to: the state that is leaving, whose children are only repainted when it is
// current, and the group of the state a page shows, which was dimmed while that
// state was leaving. A page that skipped the states before the one it draws has
// neither, so it is the honest reference for both.
test("an instant is the same picture on a page that never drew what came before it", () => {
  const f = densePart();
  const plan = render(f, { args: ["--stills", "0.7"] });
  assert.equal(plan.code, 0, plan.out);
  const shots = mkdtempSync(join(tmpdir(), "video-pure-"));
  const moduleUrl = new URL("../lib/browser.mjs", import.meta.url).href;
  const script = [
    `const { loadPlaywright, openStage, frameGrabber } = await import(${JSON.stringify(moduleUrl)});`,
    `const { readFileSync, writeFileSync } = await import("node:fs");`,
    `const { join } = await import("node:path");`,
    `const plan = JSON.parse(readFileSync(${JSON.stringify(join(f.work, "plan.json"))}, "utf8"));`,
    `const dir = ${JSON.stringify(shots)};`,
    `const pw = await loadPlaywright([${JSON.stringify(REPO)}]);`,
    `const shoot = async (name, instants) => {`,
    `  const stage = await openStage(pw, plan, { root: ${JSON.stringify(resolve(REPO))}, pages: 1 });`,
    `  const capture = await frameGrabber(stage.page);`,
    `  try {`,
    `    for (const [label, at] of instants) {`,
    `      await stage.page.evaluate((t) => window.__frame(t), at);`,
    `      await stage.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));`,
    `      writeFileSync(join(dir, name + "-" + label + ".png"), await capture());`,
    `    }`,
    `  } finally {`,
    `    await stage.close();`,
    `  }`,
    `};`,
    // A page that drew the whole way there, and a page whose first drawing is the
    // cross-fade (1.1 s: the state at 0.81 s is leaving, the one at 1.25 s has
    // not arrived), then the same page drawing 0.7 s again after 1.1 s.
    `await shoot("walked", [["early", 0.7], ["fade", 1.1], ["back", 0.7]]);`,
    `await shoot("fresh", [["fade", 1.1], ["early", 0.7]]);`,
  ].join("\n");
  const drawn = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 120_000 });
  assert.equal(drawn.status, 0, `the stage could not draw the frames:\n${drawn.stdout}${drawn.stderr}`);
  const shot = (name) => frameHashes(join(shots, `${name}.png`));
  const early = shot("walked-early");
  const fade = shot("walked-fade");
  assert.notDeepEqual(early, fade, "0.7 s and 1.1 s are the same picture, so this test could not see a leftover");
  assert.deepEqual(shot("walked-back"), early, "0.7 s drawn after 1.1 s is not the picture 0.7 s drew the first time: the state it shows kept the opacity it had while leaving");
  assert.deepEqual(shot("fresh-fade"), fade, "the cross-fade is a different picture on a page that never drew the state before it: the leaving state was not painted");
  assert.deepEqual(shot("fresh-early"), early, "the first drawing of a page is not the picture the instant has");
});

test("a worker count that is not a number of pages is refused", () => {
  const f = fixture();
  for (const bad of ["0", "1.5", "dos"]) {
    const run = render(f, { args: ["--from", "0", "--to", "0.4", "--video", join(f.dir, "out.mp4"), "--workers", bad] });
    assert.notEqual(run.code, 0, `--workers ${bad} was accepted as a concurrency`);
    assert.match(run.out, /workers/, "the error names the flag it refused");
  }
});

test("--workers is refused when the run draws stills, because stills have no loop", () => {
  const f = fixture();
  const run = render(f, { args: ["--stills", "0.2", "--workers", "4"] });
  assert.notEqual(run.code, 0, "a worker count that changes nothing must not pass as if it did");
  assert.match(run.out, /workers/, "the error names the flag and where it applies");
});

// An encoder that refuses its flags exits before it reads a frame. The render
// has to fail then, not wait for a pipe nobody will drain: a hang is the one
// failure a caller cannot tell from a slow render.
test("a render fails instead of hanging when the encoder refuses to start", () => {
  const f = fixture();
  const out = join(f.dir, "out.mp4");
  const run = render(f, { args: ["--from", "0", "--to", "0.4", "--workers", "4", "--preset", "nosuchpreset", "--video", out] });
  assert.notEqual(run.code, 0, `ffmpeg never started, yet the render exited ${run.code}:\n${run.out}`);
  assert.match(run.out, /ffmpeg/, "the error says who gave up");
  assert.ok(!existsSync(join(f.work, "final.srt")), "no deliverable outlives a render that failed");
});

test("the craft gate is timed too, because it is a stage like any other", () => {
  const f = fixture();
  const run = render(f, { args: ["--stills", "0.2", "--craft"] });
  assert.equal(run.code, 0, run.out);
  const report = JSON.parse(readFileSync(join(f.work, "timings.json"), "utf8"));
  const names = report.stages.map((s) => s.stage);
  assert.ok(names.includes("legibility"), `the gate the run paid for is missing from ${names}`);
  assert.ok(names.includes("stills"), `the frames the run wrote are missing from ${names}`);
  assert.ok(names.indexOf("legibility") < names.indexOf("stills"), `the gate runs before the frames, so the report says so: ${names}`);
  assert.equal(report.stages.find((s) => s.stage === "stills").frames, 1, "the stills stage counts the frames it wrote");
  assert.ok(!("window" in report), "a stills run draws instants, so it has no window to compare");
});

test("a render the craft gate refuses leaves no timing report to compare against", () => {
  const f = fixture({ visual: { scenes: [{ text: "uno", scene: { labels: [{ x: 180, y: 145, text: "apenas visible", color: "#efefef", size: 13 }] } }] } });
  const run = render(f, { args: ["--stills", "0.2", "--craft"] });
  assert.notEqual(run.code, 0);
  assert.ok(!existsSync(join(f.work, "timings.json")), "a report of a render that never finished is a claim nobody can check");
});
