import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { extract, source } = createRequire(import.meta.url)("./view/math.js");

test("a display formula is lifted out of the markdown before marked sees it", () => {
  const { text, blocks } = extract("Antes\n\n$$h_t = \\tanh(W \\cdot x_t)$$\n\ndespués");
  assert.deepEqual(blocks, [{ display: true, tex: "h_t = \\tanh(W \\cdot x_t)" }]);
  assert.equal(text.includes("$$"), false);
  assert.equal(text.includes("LKMATHD0LKEND"), true);
  assert.equal(text.includes("antes") === false, true);
});

test("an inline formula keeps its place in the paragraph", () => {
  const { text, blocks } = extract("El estado $h_t$ crece");
  assert.deepEqual(blocks, [{ display: false, tex: "h_t" }]);
  assert.equal(text.replace("LKMATHS0LKEND", "h_t"), "El estado h_t crece");
});

test("an escaped dollar is not a formula", () => {
  const { text, blocks } = extract("Cuesta \\$5 y nada más");
  assert.deepEqual(blocks, []);
  assert.equal(text, "Cuesta \\$5 y nada más");
});

test("prices are not formulas: a closing dollar after a space does not count", () => {
  const { text, blocks } = extract("Cuesta $5 y $10, o $20");
  assert.deepEqual(blocks, []);
  assert.equal(text, "Cuesta $5 y $10, o $20");
});

test("an unterminated formula is left as written", () => {
  const { text, blocks } = extract("Aquí $$\nx + 1");
  assert.deepEqual(blocks, []);
  assert.equal(text, "Aquí $$\nx + 1");
});

test("two display formulas are numbered in order", () => {
  const { text, blocks } = extract("$$a$$ texto $$b$$");
  assert.deepEqual(blocks, [
    { display: true, tex: "a" },
    { display: true, tex: "b" },
  ]);
  assert.equal(text, "LKMATHD0LKEND texto LKMATHD1LKEND");
});

test("the source of a formula can be restored when the renderer is missing", () => {
  assert.equal(source({ display: true, tex: "a+b" }), "$$a+b$$");
  assert.equal(source({ display: false, tex: "a" }), "$a$");
});
