// edge-tts tokenises for its own convenience: it merges "+1 entero" into one
// boundary and splits "−0,04" into four. The engine needs one boundary per
// spoken word, and must still refuse audio that belongs to other words.
import test from "node:test";
import assert from "node:assert/strict";
import { alignWords } from "../lib/audio.mjs";

test("a word edge-tts merged with its neighbour keeps one boundary per spoken word", () => {
  const words = alignWords("suma +1 entero.", [
    { t: 1.0, d: 0.2, w: "suma" },
    { t: 1.2, d: 0.6, w: "+1 entero" },
  ]);
  assert.deepEqual(words.map((w) => w.w), ["suma", "+1", "entero."]);
  assert.equal(words[1].t, 1.2);
  assert.equal(words[2].t, 1.2);
});

test("a number edge-tts split into pieces is one word spanning those pieces", () => {
  const words = alignWords("Cuatro pasos de −0,04 y", [
    { t: 0.0, d: 0.3, w: "Cuatro" },
    { t: 0.3, d: 0.3, w: "pasos" },
    { t: 0.6, d: 0.2, w: "de" },
    { t: 0.8, d: 0.1, w: "−" },
    { t: 0.9, d: 0.1, w: "0" },
    { t: 1.0, d: 0.05, w: "," },
    { t: 1.05, d: 0.35, w: "04" },
    { t: 1.4, d: 0.2, w: "y" },
  ]);
  assert.deepEqual(words.map((w) => w.w), ["Cuatro", "pasos", "de", "−0,04", "y"]);
  const number = words[3];
  // The sign carries no letters or digits, so the word starts on the first one.
  assert.equal(number.t, 0.9);
  assert.equal(Number(number.d.toFixed(2)), 0.5);
});

test("audio recorded for other words is refused, not stretched", () => {
  assert.throws(
    () => alignWords("Entrar en la puerta no cobra coste", [{ t: 0, d: 1, w: "Entrar en la ventana" }]),
    /re-synthesise the narration/,
  );
});

test("a sign spoken on its own keeps its place instead of being dropped", () => {
  const words = alignWords("Q = 0,86", [
    { t: 0.0, d: 0.3, w: "Q" },
    { t: 0.3, d: 0.1, w: "=" },
    { t: 0.4, d: 0.5, w: "0,86" },
  ]);
  assert.deepEqual(words.map((w) => w.w), ["Q", "=", "0,86"]);
  assert.equal(words.length, 3);
  assert.ok(words[1].t >= 0.3 && words[1].t <= 0.4);
});

test("a boundary file with a timing the engine cannot trust is refused, not silently timed", () => {
  assert.throws(
    () => alignWords("uno", [{ t: "x", d: 1, w: "uno" }]),
    /timing/,
    "a non-numeric offset must not become NaN and flow into the timeline",
  );
  assert.throws(() => alignWords("uno", [{ t: 1, d: -0.5, w: "uno" }]), /timing/, "a word cannot end before it starts");
});
