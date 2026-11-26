// A render is a window: `--from` says where the film starts, and every frame is
// drawn at `from + k/fps`. The picture at an instant must therefore be a picture
// this window actually draws — a state that is leaving is repainted at the last
// frame of *this* window's grid where it was still current, never at an instant
// borrowed from a grid anchored somewhere else. With `--from 0.71` at 30 fps the
// two grids are 0.3 of a frame apart, so a freeze anchored at 0 shows a picture
// this film never asked for (measured on the drawing loop it replaced: 8 of 27
// frames, worst channel delta 57/255, all inside the 0.28 s cross-fade).
//
// What that means for two windows: the picture at an instant is a function of the
// instant *and of where the window puts its frames*. Two windows that share
// frames draw a shared instant identically, which is the identity tested below.
// Two windows on different grids cannot share an instant at all — window 0 draws
// {k/30} and window 0.71 draws {0.71 + k/30}, and 0.71 × 30 = 21.3 is not a whole
// number — so there is no instant at which their films can be compared frame for
// frame, and a freeze anchored at 0 is exactly what made a sliced render stop
// matching the loop it replaced.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { densePart } from "./fixtures/dense.mjs";

const REPO = new URL("../../..", import.meta.url).pathname;
const FPS = 30;

// The drawings of one window: boot the stage on a plan whose `origin` is where
// this window starts, draw the instants, and report what the stage says it
// repainted the leaving state at, plus the picture at that instant.
function draw(f, groups) {
  const plan = join(f.dir, "plan", "plan.json");
  const stills = spawnSync("node", [
    join(REPO, "tools/video/render.mjs"), "--spec", f.spec, "--note", f.note, "--audio", f.audio,
    "--work", join(f.dir, "plan"), "--stills", "0.7",
  ], { encoding: "utf8", timeout: 120_000 });
  assert.equal(stills.status, 0, `${stills.stdout}${stills.stderr}`);
  const shots = mkdtempSync(join(tmpdir(), "video-window-"));
  const moduleUrl = new URL("../lib/browser.mjs", import.meta.url).href;
  const script = [
    `const { loadPlaywright, openStage } = await import(${JSON.stringify(moduleUrl)});`,
    `const { readFileSync, writeFileSync } = await import("node:fs");`,
    `const { join } = await import("node:path");`,
    `const plan = JSON.parse(readFileSync(${JSON.stringify(plan)}, "utf8"));`,
    `const groups = ${JSON.stringify(groups)};`,
    `const pw = await loadPlaywright([${JSON.stringify(REPO)}]);`,
    `const root = ${JSON.stringify(resolve(REPO))};`,
    `for (const group of groups) {`,
    `  const stage = await openStage(pw, { ...plan, origin: group.origin }, { root, pages: 1 });`,
    `  try {`,
    `    for (const at of group.instants) {`,
    `      await stage.page.evaluate((t) => window.__frame(t), at);`,
    `      await stage.page.evaluate(() => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d))));`,
    `      const frozen = await stage.page.evaluate(() => (typeof window.__frozen === "function" ? window.__frozen() : "no-hook"));`,
    `      if (group.shots) {`,
    `        const png = await stage.page.screenshot({ type: "png" });`,
    `        writeFileSync(join(${JSON.stringify(shots)}, group.name + "-" + at.toFixed(4) + ".png"), png);`,
    `      }`,
    `      console.log("frozen:" + group.name + ":" + at.toFixed(4) + ":" + frozen);`,
    `    }`,
    `  } finally {`,
    `    await stage.close();`,
    `  }`,
    `}`,
  ].join("\n");
  const run = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 180_000 });
  assert.equal(run.status, 0, `the stage could not draw the windows:\n${run.stdout}${run.stderr}`);
  const out = new Map();
  for (const line of run.stdout.split("\n")) {
    const found = /^frozen:(.+):([\d.]+):(.*)$/.exec(line.trim());
    if (!found) continue;
    out.set(`${found[1]}@${Number(found[2]).toFixed(4)}`, found[3] === "null" ? null : found[3] === "no-hook" ? "no-hook" : Number(found[3]));
  }
  const shot = (name, at) => createHash("sha1").update(readFileSync(join(shots, `${name}-${at.toFixed(4)}.png`))).digest("hex").slice(0, 12);
  return { out, shot };
}

const windowFrames = (origin, count) => Array.from({ length: count }, (_, k) => Number((origin + k / FPS).toFixed(4)));

test("the state that leaves is repainted at a frame this window draws", () => {
  const f = densePart();
  // A window whose start is not on the 30 fps grid: 0.71 × 30 = 21.3 frames.
  const origin = 0.71;
  const instants = windowFrames(origin, 28);
  const { out } = draw(f, [{ name: "w", origin, instants }]);
  const plan = JSON.parse(readFileSync(join(f.dir, "plan", "plan.json"), "utf8"));
  const changeOf = (t) => {
    const beat = plan.beats.find((b) => t < b.end) || plan.beats[plan.beats.length - 1];
    const states = beat.states.filter((s) => s.t <= t + 1e-9);
    return states.length > 1 ? states[states.length - 1].t : null;
  };
  let checked = 0;
  for (const at of instants) {
    const frozen = out.get(`w@${at.toFixed(4)}`);
    const change = changeOf(at);
    if (change === null) continue;
    assert.notEqual(frozen, "no-hook", "the stage does not say at which instant it repainted the state that is leaving, so the window's anchor cannot be checked");
    if (frozen === null) continue;
    checked++;
    const frames = (frozen - origin) * FPS;
    assert.ok(
      Math.abs(frames - Math.round(frames)) < 1e-6,
      `at ${at.toFixed(3)} s the state that is leaving was repainted at ${frozen.toFixed(4)} s, which is ${frames.toFixed(2)} frames from where this window starts (${origin} s); this window draws ${origin} + k/${FPS}, so the cross-fade carries a picture the render never asked for`,
    );
    assert.ok(frozen <= change + 1e-9, `at ${at.toFixed(3)} s the leaving state was repainted at ${frozen.toFixed(4)} s, after the ${change.toFixed(3)} s it changed at`);
    assert.ok(
      change - frozen < 1 / FPS + 1e-6,
      `at ${at.toFixed(3)} s the leaving state was repainted at ${frozen.toFixed(4)} s, ${((change - frozen) * FPS).toFixed(2)} frames before the ${change.toFixed(3)} s it changed at, so the cross-fade is a frame behind this window`,
    );
  }
  assert.ok(checked > 4, `only ${checked} instants carried a state that was leaving, so this window did not exercise the cross-fade`);
});

// Two windows that draw the same instant draw the *same bytes*, which is a
// stronger claim than it looks: the layer that is leaving is part of the
// document even while its group is fully transparent, and Chrome rasterizes the
// figure around it (measured: moving the attributes of a group at opacity 0
// moves 6 615 pixels of the picture the viewer sees). Identical pixels across
// windows therefore mean the whole drawing — including the state nobody can see
// — was frozen at the same instant, which is true only when both windows put
// their frames on the same instants.
test("an instant drawn in two overlapping windows is the same picture", () => {
  const f = densePart();
  const instants = [1.3, 1.36, 1.42, 1.5, 1.6];
  // 0.71 and 1.21 start half a second apart, which is 15 frames: same grid, so
  // the same instant is a frame of both windows.
  const offGrid = draw(f, [
    { name: "a", origin: 0.71, instants, shots: true },
    { name: "b", origin: 1.21, instants, shots: true },
  ]);
  // 0.7 and 1.2 are on the part's grid, and overlap the windows above.
  const onGrid = draw(f, [
    { name: "c", origin: 0.7, instants, shots: true },
    { name: "d", origin: 1.2, instants, shots: true },
  ]);
  for (const [pair, label] of [[offGrid, "0.71 s and 1.21 s"], [onGrid, "0.7 s and 1.2 s"]]) {
    const [first, second] = pair === offGrid ? ["a", "b"] : ["c", "d"];
    for (const at of instants) {
      assert.equal(
        pair.shot(second, at),
        pair.shot(first, at),
        `${at.toFixed(2)} s is a different picture in a window that starts at ${label}: the drawing depends on where the film begins`,
      );
    }
  }
});

