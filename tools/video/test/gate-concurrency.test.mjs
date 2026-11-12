// S5, the authority of the gates: a gate that aborts the delivery still aborts it,
// and it stops holding the render while it decides. The craft gate draws its own
// instants — one sample per second for the hole rule, every state a beat paints —
// and takes none of them from the frame loop, so what it needs from a render is the
// plan and nothing else, and the two can run at the same time.
//
// What must not change is the verdict. A part nobody can read produces no film, no
// captions and no report, whether the gate spoke before the frames or after them;
// and the gate the renderer runs is the gate anyone can run themselves, on the same
// plan, with the same counts.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copiedEngine } from "./fixtures/engine.mjs";

const REPO = new URL("../../..", import.meta.url).pathname;
const CLI = join(REPO, "tools/video/render.mjs");
const GATE = join(REPO, "tools/video/legibility.mjs");
const WORDS = "cada estado decide que hacer y el valor lo dice".split(" ");
const SPEECH = 0.4;
// LEAD 0.15 + SPEECH + TAIL 0.35, from lib/timeline.mjs.
const BEAT = Number((0.15 + SPEECH + 0.35).toFixed(3));
const BEATS = 2;
// The whole part: two beats, two segments, and a capture long enough for the gate
// to be seen running beside it.
const TOTAL = Number((BEAT * BEATS).toFixed(3));

// Two beats, one state each, so every render here is two segments and a couple of
// seconds of Chromium. `unreadable` adds the label the gate refuses: pale ink at
// 1.15:1 on the paper, under the 4.5:1 a line the viewer must read needs.
function part({ unreadable = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "video-gate-"));
  const audio = join(dir, "audio");
  mkdirSync(audio);
  const sections = [{ kicker: "Sección 1", heading: "Uno", beats: [] }];
  for (let i = 0; i < BEATS; i++) {
    const tag = `s01b0${i}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(SPEECH), "-q:a", "9", join(audio, `${tag}.mp3`)]);
    writeFileSync(join(audio, `${tag}.json`), JSON.stringify(WORDS.map((w, k) => ({ t: k * 0.04, d: 0.03, w }))));
    const scene = { boxes: [{ x: 60, y: 60, w: 70, h: 40, label: `b${i}` }] };
    if (unreadable) scene.labels = [{ x: 180, y: 145, text: "apenas visible", color: "#efefef", size: 13 }];
    sections[0].beats.push({ title: `Beat ${i}`, narration: WORDS.join(" "), visual: { anchors: ["cada"], scenes: [{ text: "uno", scene }] } });
  }
  writeFileSync(join(dir, "note.md"), "");
  const spec = join(dir, "part.json");
  writeFileSync(spec, JSON.stringify({ part: "Parte T", title: "Gate", topic: "t", sections }));
  return { dir, audio, note: join(dir, "note.md"), spec };
}

function render(f, { work, args = [], cli = CLI }) {
  const run = spawnSync("node", [cli, "--spec", f.spec, "--note", f.note, "--audio", f.audio, "--work", work, ...args], { encoding: "utf8", timeout: 180_000 });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

function report(work) {
  const file = join(work, "timings.json");
  assert.ok(existsSync(file), `a render that finished left no report: ${readdirSync(work).join(", ")}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function frameHashes(file) {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"], { encoding: "utf8", timeout: 120_000 });
  assert.equal(run.status, 0, `framemd5 could not read ${file}:\n${run.stderr}`);
  return run.stdout.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split(",").pop().trim());
}

// A gate that watches the render from the inside. A segment is published in the
// cache only when its frames are done, so counting the published entries is
// watching the capture work from the process that is supposed to be waiting for
// it. Once the window is captured the gate stays alive a little longer, so the
// question "did the render publish before the verdict?" has a stable answer.
//
// Two deadlines, because a loaded machine is not a missing capture: if nothing at
// all appears in the work directory the render never started capturing (this is the
// shape of the defect), and if something appeared the gate simply waits for the
// window to be finished, however long the CPU takes.
const STUB = `
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const work = dirname(process.argv[process.argv.indexOf("--plan") + 1]);
const cache = join(work, "cache");
const started = Date.now();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const listing = () => { try { return readdirSync(cache); } catch { return []; } };
let entries = 0;
let sawWork = false;
while (Date.now() - started < 30000) {
  const files = listing();
  entries = files.filter((f) => f.endsWith(".mp4")).length;
  if (entries >= 2) break;
  sawWork = sawWork || files.length > 0;
  if (!sawWork && Date.now() - started > 6000) break;
  await sleep(25);
}
const seenAt = Date.now() - started;
if (entries > 0) await sleep(1200);
writeFileSync(join(work, "gate-seen.json"), JSON.stringify({ entries, seenAt, ms: Date.now() - started }));
console.log("stub gate: " + entries + " segment(s) published after " + seenAt + " ms");
`;

test("the craft gate decides while the frames are captured, not before them", () => {
  const root = copiedEngine({ stub: STUB });
  const f = part();
  const work = join(f.dir, "work");
  const run = render(f, { work, cli: join(root, "tools/video/render.mjs"), args: ["--from", "0", "--to", String(TOTAL), "--video", join(work, "out.mp4"), "--craft"] });
  assert.equal(run.code, 0, run.out);

  const seen = JSON.parse(readFileSync(join(work, "gate-seen.json"), "utf8"));
  assert.ok(
    seen.entries >= 2,
    `the gate spent ${seen.ms} ms beside the render and saw ${seen.entries} segment(s) published: it had already decided before the capture started, so the capture still waited for it`,
  );

  const stages = report(work).stages;
  const gate = stages.find((s) => s.stage === "legibility");
  assert.ok(gate, `the run paid for a gate and the report does not place it: ${stages.map((s) => s.stage).join(", ")}`);
  assert.equal(gate.overlaps, "capture", `the report does not say the gate ran beside the capture: ${JSON.stringify(gate)}`);
  assert.ok(gate.overlap_ms > 0, `the gate and the capture do not overlap: ${JSON.stringify(gate)} against ${JSON.stringify(stages.find((s) => s.stage === "capture"))}`);
  // The other half of the contract: overlapping is not a licence to publish early.
  // The gate outlives the capture here, so the join has to wait for it.
  const mux = stages.find((s) => s.stage === "mux");
  assert.ok(
    mux.at >= gate.at + gate.ms,
    `the film was joined at ${mux.at} ms and the gate did not speak until ${Math.round(gate.at + gate.ms)} ms: the render published before it had a verdict`,
  );
});

// The witness: the verdict is still the verdict. A part nobody can read produces no
// film, and the numbers the renderer reports are the numbers the gate prints when a
// human runs it on the same plan — the renderer did not become a second gate.
test("a part nobody can read is still refused, with the gate's own verdict", () => {
  const f = part({ unreadable: true });
  const work = join(f.dir, "work");
  const run = render(f, { work, args: ["--from", "0", "--to", String(TOTAL), "--video", join(work, "out.mp4"), "--craft"] });
  assert.notEqual(run.code, 0, `a frame nobody can read was rendered anyway:\n${run.out}`);
  assert.match(run.out, /contrast is/, "the gate says what it measured");
  assert.match(run.out, /the craft gate refused this part/, "the render says who refused it");

  const said = /summary: (\d+) errors · (\d+) warnings · (\d+) waived/.exec(run.out);
  assert.ok(said, `the render did not report the gate's counts:\n${run.out}`);
  assert.ok(Number(said[1]) > 0, `the part was refused over ${said[1]} errors, so this test proves nothing about a refusal`);
  const alone = spawnSync("node", [GATE, "--plan", join(work, "plan.json")], { encoding: "utf8", timeout: 120_000 });
  assert.equal(alone.status, 1, `the gate on its own exited ${alone.status}, not 1:\n${alone.stdout}${alone.stderr}`);
  assert.match(
    alone.stdout,
    new RegExp(`summary: ${said[1]} errors · ${said[2]} warnings · ${said[3]} waived`),
    `the renderer and the gate disagree on the same plan:\n${alone.stdout}`,
  );

  assert.ok(!existsSync(join(work, "out.mp4")), "a part the gate refused left a film behind");
  assert.ok(!existsSync(join(work, "final.srt")), "a part the gate refused left captions behind");
  assert.ok(!existsSync(join(work, "timings.json")), "a part the gate refused left a report that reads like a finished render");
});

// The hard case the concurrency creates: the frames were already drawn when the
// verdict arrived. The film still is not written — and the render says how much
// work it is walking away from, instead of pretending nothing happened.
test("a refusal that arrives after the capture leaves no film, and counts what it cost", () => {
  const f = part({ unreadable: true });
  const work = join(f.dir, "work");
  const run = render(f, { work, args: ["--from", "0", "--to", String(TOTAL), "--video", join(work, "out.mp4"), "--craft"] });
  assert.notEqual(run.code, 0);

  const kept = existsSync(join(work, "cache")) ? readdirSync(join(work, "cache")) : [];
  assert.ok(kept.length > 0, "nothing had been captured before the verdict, so nothing about a late refusal was tested here");

  const wasted = /the craft gate refused this part \(exit (\d+)\); (\d+) frame\(s\) had already been captured/.exec(run.out);
  assert.ok(wasted, `a refusal that arrived after the capture does not say how much it cost:\n${run.out}`);
  assert.ok(Number(wasted[2]) > 0, `the refusal reports ${wasted[2]} frames captured, which is not a measurement`);
  assert.ok(!existsSync(join(work, "out.mp4")), "a refused part that had already been captured left a film behind");
  assert.ok(!existsSync(join(work, "final.srt")), "a refused part that had already been captured left captions behind");
});

// S4, quality: the gate runs beside the capture, not inside it. Nothing about the
// frame loop moves — the film a `--craft` render writes is the film the same render
// writes without it, frame for frame.
test("a clean film drawn beside the gate is the same film drawn without it", () => {
  const f = part();
  const plain = join(f.dir, "plain");
  const gated = join(f.dir, "gated");
  const window = ["--from", "0", "--to", "1", "--crf", "0"];
  const without = render(f, { work: plain, args: [...window, "--video", join(plain, "out.mp4")] });
  assert.equal(without.code, 0, without.out);
  const with_ = render(f, { work: gated, args: [...window, "--video", join(gated, "out.mp4"), "--craft"] });
  assert.equal(with_.code, 0, with_.out);
  assert.ok(report(gated).stages.some((s) => s.stage === "legibility"), `the --craft render has no gate in its report: ${report(gated).stages.map((s) => s.stage).join(", ")}`);
  assert.deepEqual(
    frameHashes(join(gated, "out.mp4")),
    frameHashes(join(plain, "out.mp4")),
    "the film rendered beside the gate is not the film rendered without it, so the gate is drawing into the frames it audits",
  );
});

// One path has no capture to hide the gate behind: `--single-pass` streams every
// frame into the film's own encoder, so there is no join to hold back and the
// verdict has to come first. It still must not deadlock, and the report says the
// gate did not run beside a capture it never had.
test("a one-pass film runs the gate before its own encoder, and says so", () => {
  const f = part();
  const work = join(f.dir, "one");
  const run = render(f, { work, args: ["--from", "0", "--to", "0.7", "--single-pass", "--video", join(work, "out.mp4"), "--craft"] });
  assert.equal(run.code, 0, run.out);
  const gate = report(work).stages.find((s) => s.stage === "legibility");
  assert.ok(gate, `the --craft run has no gate in its report: ${report(work).stages.map((s) => s.stage).join(", ")}`);
  assert.equal(gate.overlaps, null, `a one-pass film has nothing to run the gate beside, yet the report claims ${JSON.stringify(gate.overlaps)}`);
  assert.equal(gate.exit, 0, `the gate exited ${gate.exit} and the film was written anyway`);
});
