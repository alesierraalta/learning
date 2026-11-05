// The craft gate is arithmetic before it is a browser. These tests pin the
// numbers a reader can trust: a type floor, a WCAG contrast ratio, a still that
// is a hole and not a hold.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AA_NORMAL,
  assessText,
  dedupe,
  contrastRatio,
  deadStretches,
  longestSilence,
  parseColor,
  requiredRatio,
  silenceSpans,
  summarize,
  typeFloor,
} from "../lib/legibility.mjs";

test("the floor is 2.6% of the frame's short side", () => {
  assert.equal(typeFloor(1080), 28);
  assert.equal(typeFloor(2160), 56);
  assert.equal(typeFloor(1920), 50);
});

test("contrast follows WCAG, including alpha over the paper", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  // The pair HyperFrames measured at 4.12:1 on its own paper: same arithmetic.
  assert.equal(contrastRatio("rgb(104, 122, 129)", "rgb(248, 245, 239)").toFixed(2), "4.12");
  // Our muted ink at 62% over white must composite, not be read as opaque.
  const muted = contrastRatio("rgba(15, 46, 61, 0.62)", "#ffffff");
  assert.ok(muted > 4 && muted < 5, `expected a composited mid ratio, got ${muted}`);
});

test("large text needs less contrast than body text, and bold does not buy it", () => {
  assert.equal(requiredRatio(19), 4.5);
  assert.equal(requiredRatio(23.9), 4.5);
  assert.equal(requiredRatio(24), 3);
  assert.equal(requiredRatio(38), 3);
  // WCAG would relax a 19 px bold label to 3:1; this gate keeps 4.5 because a
  // label in a 1080p film is read on a phone, not on the canvas it was drawn on.
  assert.equal(requiredRatio(19), AA_NORMAL);
});

test("reading text under the floor is a warning, texture is waived", () => {
  const reading = assessText({ text: "una decide, una paga", px: 26, weight: 400, color: "#0F2E3D", background: "#ffffff" });
  assert.deepEqual(reading.map((f) => f.code), ["text_below_floor"]);
  assert.equal(reading[0].severity, "warning");
  assert.equal(reading[0].px, 26);
  assert.equal(reading[0].floor, 28);

  const texture = assessText({ text: "PARTE 3 · FUNDAMENTOS", px: 20, weight: 700, color: "#0F2E3D", background: "#ffffff", texture: true });
  assert.equal(texture.length, 1);
  assert.equal(texture[0].severity, "waived");
  assert.equal(texture[0].code, "text_below_floor");

  assert.deepEqual(assessText({ text: "hola", px: 38, weight: 700, color: "#0F2E3D", background: "#ffffff" }), []);
});

test("muted chrome at 20px fails AA as an error, not an opinion", () => {
  const found = assessText({ text: "PARTE 3", px: 20, weight: 700, color: "rgba(15, 46, 61, 0.62)", background: "#ffffff", texture: true });
  assert.deepEqual(found.map((f) => f.code), ["contrast_aa_failure", "text_below_floor"]);
  assert.equal(found[0].severity, "error");
  assert.equal(found[0].ratio, 4.27);
  assert.equal(found[0].required, 4.5);
  // A waiver downgrades the floor, never a real contrast failure.
  assert.equal(found[1].severity, "waived");
});

test("a still only counts once it is long enough to be a hole", () => {
  const samples = [
    { t: 0, hash: "a" },
    { t: 1, hash: "b" },
    { t: 2, hash: "c" },
    { t: 3, hash: "c" },
    { t: 4, hash: "c" },
    { t: 5, hash: "d" },
  ];
  assert.deepEqual(deadStretches(samples, 3), []);
  assert.deepEqual(deadStretches(samples, 2), [{ from: 2, to: 4, seconds: 2 }]);
  const long = [
    { t: 0, hash: "a" },
    { t: 1, hash: "b" },
    { t: 2, hash: "b" },
    { t: 3, hash: "b" },
    { t: 4, hash: "b" },
    { t: 5, hash: "c" },
  ];
  assert.deepEqual(deadStretches(long, 3), [{ from: 1, to: 4, seconds: 3 }]);
});

test("a summary is what the exit code reads", () => {
  const summary = summarize([
    { severity: "error" },
    { severity: "warning" },
    { severity: "waived" },
  ]);
  assert.deepEqual(summary, { error: 1, warning: 1, waived: 1 });
});

test("the same defect is reported once, at its first instant, with its count", () => {
  const findings = [
    { code: "text_below_floor", severity: "warning", where: "s01b00@3.0s #kicker", text: "PARTE 3", time: 3 },
    { code: "text_below_floor", severity: "warning", where: "s01b00@9.5s #kicker", text: "PARTE 3", time: 9.5 },
    { code: "text_below_floor", severity: "warning", where: "s01b00@1.5s #brand", text: "Learnings", time: 1.5 },
  ];
  const unique = dedupe(findings);
  assert.equal(unique.length, 2);
  const kicker = unique.find((f) => f.where.includes("#kicker"));
  assert.equal(kicker.time, 3);
  assert.equal(kicker.count, 2);
  assert.equal(unique.find((f) => f.where.includes("#brand")).count, 1);
});

test("a ghost of a later state is a question, not an error", () => {
  const ghost = assessText({ text: "0", px: 27, color: "rgba(15,46,61,.30)", background: "rgb(255,255,255)", where: "s05b00@159.4s text" });
  const contrast = ghost.find((f) => f.code === "contrast_aa_failure");
  assert.equal(contrast.severity, "warning", "the author drew it faint on purpose; say the number, ask the question");
  assert.match(contrast.message, /ghost of a later state/);
  const solid = assessText({ text: "0", px: 27, color: "rgb(150,150,150)", background: "rgb(255,255,255)", where: "x" });
  assert.equal(solid.find((f) => f.code === "contrast_aa_failure").severity, "error", "a line the viewer must read stays an error");
});

test("an alpha given in percent is a fraction of one, not of 255", () => {
  // CSS Color 4 lets rgb()/rgba() take a percentage alpha. Read as 127.5, a
  // half-transparent grey measures 21:1 instead of 3.95:1 — a ghost passes the
  // gate as a perfectly readable line.
  assert.equal(parseColor("rgba(0, 0, 0, 50%)").a, 0.5);
  assert.equal(parseColor("rgb(0 0 0 / 50%)").a, 0.5);
  // The two spellings of the same colour must measure the same, and half a
  // black over white is a mid grey (3.98:1), never the opaque 21:1.
  const percent = contrastRatio("rgba(0, 0, 0, 50%)", "#ffffff");
  assert.equal(percent.toFixed(2), contrastRatio("rgba(0, 0, 0, 0.5)", "#ffffff").toFixed(2));
  assert.ok(percent > 3.5 && percent < 4.5, `half black over white is about 3.98:1, got ${percent}`);
});

test("a still stretch over narration is not a hole", () => {
  const speech = [{ start: 0.15, end: 13.854 }];
  const gap = longestSilence({ from: 0, to: 14.204 }, speech);
  assert.ok(gap.seconds < 1, `the lead-in and tail are under a second, got ${gap.seconds}`);
  assert.equal(silenceSpans({ from: 0, to: 14.204 }, speech).length, 2, "one before the voice, one after it");
  assert.deepEqual(silenceSpans({ from: 0, to: 14.204 }, speech), [{ from: 0, to: 0.15, seconds: 0.15 }, { from: 13.854, to: 14.204, seconds: 0.35 }]);
});

test("a still stretch with no voice for three seconds is a hole, and it names the seconds", () => {
  const gap = longestSilence({ from: 14.204, to: 22 }, [{ start: 0, end: 14.204 }]);
  assert.equal(gap.from, 14.204);
  assert.equal(gap.seconds, 7.796, "the hole is the silence, not the whole still stretch");
});

test("overlapping speech windows are one voice and never a hole", () => {
  const speech = [{ start: 2, end: 6 }, { start: 5, end: 9 }, { start: 1, end: 3 }];
  assert.equal(silenceSpans({ from: 1, to: 9 }, speech).length, 0);
  assert.equal(longestSilence({ from: 1, to: 9 }, speech), null);
});

test("part of a still stretch spoken is only the unspoken part questioned", () => {
  const gap = longestSilence({ from: 0, to: 10 }, [{ start: 2, end: 9 }]);
  assert.equal(gap.seconds, 2);
  assert.equal(gap.from, 0, "the longer unspoken half is the one that matters");
});
