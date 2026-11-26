// The capture path is where a frame becomes the film, so its first act is the
// one that matters most: the opening frame of a page. A fresh page can answer
// the first capture request with the surface from *before* the drawing, and the
// film then opens on a picture nobody drew — every frame after it is encoded
// against that picture. These tests pin the two things that make the opener
// deterministic: the capture is not handed back until two captures paced by a
// painted frame agree, and a page that cannot prove it painted fails the render
// instead of being filmed anyway (a silent fallback is the defect, not the fix).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { frameGrabber } from "../lib/browser.mjs";
import { densePart } from "./fixtures/dense.mjs";

const REPO = new URL("../../..", import.meta.url).pathname;

// The capture path speaks to a page through two things only: a CDP session that
// answers `Page.captureScreenshot`, and `page.evaluate` for the proof that the
// page painted. Standing in for both makes the opener rule testable without the
// one-in-fifteen timing that made it a defect.
function stubStage(frames, { painted = () => true } = {}) {
  const sent = [];
  let shots = 0;
  const session = {
    async send(method) {
      sent.push(method);
      const picture = frames[Math.min(shots, frames.length - 1)];
      shots++;
      return { data: Buffer.from(picture).toString("base64") };
    },
  };
  const page = {
    context: () => ({ newCDPSession: async () => session }),
    evaluate: async () => painted(shots),
  };
  return { page, sent, shots: () => shots };
}

const picture = (buffer) => buffer.toString();

test("the first capture of a page is not the surface from before the drawing", async () => {
  // What a fresh page does: the first request is answered from the surface that
  // is already on its way out, the next ones carry the drawing.
  const stage = stubStage(["before-the-drawing", "drawn", "drawn"]);
  const capture = await frameGrabber(stage.page);
  const first = await capture();
  assert.equal(
    picture(first),
    "drawn",
    "the opening frame of the page came back as the surface from before the drawing, so the film opens on a picture nobody drew",
  );
  assert.ok(stage.shots() >= 2, `the opener was accepted after ${stage.shots()} capture(s), so nothing verified it was the drawing`);
});

test("a page that cannot prove it painted fails the capture instead of returning a frame", async () => {
  const stage = stubStage(["stale", "stale"], { painted: () => false });
  const capture = await frameGrabber(stage.page, { openMs: 20 });
  await assert.rejects(
    capture(),
    /paint|painted/i,
    "a page that never proved it painted was captured anyway: the film carries a frame nobody drew",
  );
});

test("a first frame that never settles fails instead of filming the surface it started on", async () => {
  const stage = stubStage(["one", "two", "three", "four", "five", "six", "seven", "eight"], { painted: () => true });
  const capture = await frameGrabber(stage.page, { attempts: 4 });
  await assert.rejects(
    capture(),
    /settle|settled/i,
    "four captures paced by a painted frame all disagreed and one of them was still handed to the encoder",
  );
});

test("every capture after the opener is a single request, because by then it follows the drawing", async () => {
  const stage = stubStage(["before-the-drawing", "drawn", "drawn", "later", "later"]);
  const capture = await frameGrabber(stage.page);
  assert.equal(picture(await capture()), "drawn");
  const after = stage.shots();
  assert.equal(picture(await capture()), "later");
  assert.equal(stage.shots() - after, 1, "a frame in the middle of the film paid for a verification only the opener needs");
});

// The opener race is a timing between the drawing and the compositor, so it is
// rare (measured: 4 stale openers in 60 fresh pages) and cannot be summoned on
// purpose. A real browser is still the only place that can show the capture
// returning what the stage drew, so each fresh page is checked against the
// surface it settles on.
test("a fresh page's first capture is the frame the page drew", async () => {
  const f = densePart();
  const stills = spawnSync("node", [
    join(REPO, "tools/video/render.mjs"), "--spec", f.spec, "--note", f.note, "--audio", f.audio,
    "--work", join(f.dir, "plan"), "--stills", "0.7",
  ], { encoding: "utf8", timeout: 120_000 });
  assert.equal(stills.status, 0, `${stills.stdout}${stills.stderr}`);
  const planPath = join(f.dir, "plan", "plan.json");
  const shots = mkdtempSync(join(tmpdir(), "video-opener-"));
  const moduleUrl = new URL("../lib/browser.mjs", import.meta.url).href;
  const PAGES = 12;
  const script = [
    `const { loadPlaywright, openStage, frameGrabber } = await import(${JSON.stringify(moduleUrl)});`,
    `const { readFileSync, writeFileSync } = await import("node:fs");`,
    `const pw = await loadPlaywright([${JSON.stringify(REPO)}]);`,
    `const plan = JSON.parse(readFileSync(${JSON.stringify(planPath)}, "utf8"));`,
    `const root = ${JSON.stringify(resolve(REPO))};`,
    `const stale = [];`,
    `for (let i = 0; i < ${PAGES}; i++) {`,
    `  const stage = await openStage(pw, plan, { root, pages: 1 });`,
    `  try {`,
    `    const session = await stage.page.context().newCDPSession(stage.page);`,
    `    await stage.page.evaluate(() => window.__frame(1.3));`,
    `    const first = await (await frameGrabber(stage.page))();`,
    `    // What the page settles on: the proof, then two captures that agree.`,
    `    const shoot = async () => (await session.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true })).data;`,
    `    await stage.page.evaluate(() => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d))));`,
    `    await shoot();`,
    `    const settled = Buffer.from(await shoot(), "base64");`,
    `    if (!first.equals(settled)) {`,
    `      stale.push(i);`,
    `      writeFileSync(${JSON.stringify(join(shots, "stale"))} + "-" + i + "-first.png", first);`,
    `      writeFileSync(${JSON.stringify(join(shots, "stale"))} + "-" + i + "-settled.png", Buffer.from(settled));`,
    `    }`,
    `  } finally { await stage.close(); }`,
    `}`,
    `console.log("stale:" + stale.length + "/" + ${PAGES} + ":" + stale.join(","));`,
  ].join("\n");
  const run = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 180_000 });
  assert.equal(run.status, 0, `the opener probe could not run:\n${run.stdout}${run.stderr}`);
  const reported = /stale:(\d+)\/(\d+):([\d,]*)/.exec(run.stdout);
  assert.ok(reported, `the probe did not report what it saw:\n${run.stdout}${run.stderr}`);
  const [stale, pages] = [Number(reported[1]), Number(reported[2])];
  const fingerprint = (file) => createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 12);
  const kept = reported[3]
    .split(",")
    .filter(Boolean)
    .map((i) => `page ${i}: ${fingerprint(join(shots, `stale-${i}-first.png`))} instead of ${fingerprint(join(shots, `stale-${i}-settled.png`))}`);
  assert.equal(stale, 0, `the first capture of ${stale} of ${pages} fresh pages was not the frame the page drew (${kept.join("; ")}), so the film opens on a picture nobody drew`);
});
