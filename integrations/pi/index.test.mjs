// The studio's contract, as Pi reads it.
//
// A concept question in the chat is answered there; only a request to study a whole new topic
// points at «Aprender algo nuevo». The rule is text, and what a model does with it is not
// unit-testable: what is pinned here is the instruction the studio hands the tutor, so a future
// edit cannot quietly turn a concept question back into a redirect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import extension from "./index.ts";

/** The system prompt Pi would run with, after the studio's own rule was added to it. */
async function studioSystemPrompt(settleGate) {
  const base = mkdtempSync(join(tmpdir(), "pi-contract-"));
  const root = join(base, "Learnings");
  const topic = join(root, "redes");
  mkdirSync(topic, { recursive: true });
  const enginePath = join(base, "engine-stub");
  writeFileSync(enginePath, "");
  const handlers = new Map();
  const api = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    registerTool() {},
    registerCommand() {},
    appendEntry() {},
  };
  const ctx = { cwd: topic, ui: { notify() {} }, sessionManager: { getBranch: () => [] } };
  extension(api, { root, enginePath, settleGate, execFile: async () => ({ code: 0, stdout: "{}", stderr: "" }) });
  const event = {
    type: "before_agent_start",
    messageType: "user",
    prompt: "¿qué es la varianza?",
    systemPrompt: "base instructions",
    systemPromptOptions: {},
  };
  const result = await handlers.get("before_agent_start")[0](event, ctx);
  return result?.systemPrompt ?? event.systemPrompt;
}

test("a concept question in the chat is answered there, not redirected", async () => {
  const prompt = await studioSystemPrompt("studio");
  assert.match(prompt, /A concept question in the chat/, "the rule names the case it is about");
  assert.match(prompt, /«¿qué es la varianza\?»/, "with the learner's own words as the example");
  assert.match(prompt, /«¿qué significa varianza finita\?»/);
  assert.match(prompt, /one line of definition/, "the answer is a definition, not a lesson");
  assert.match(prompt, /the topic's running example/, "the example the parts use");
  assert.match(prompt, /one visual when it helps/, "a small scene or an annotated formula");
  assert.match(prompt, /without creating files and without running commands/, "answering creates nothing");
});

test("«Aprender algo nuevo» is offered only for a whole new topic", async () => {
  const prompt = await studioSystemPrompt("studio");
  assert.match(prompt, /only when the learner asks to study a whole new topic/);
  assert.match(prompt, /«quiero aprender X»/);
  assert.match(prompt, /«enséñame un tema nuevo»/);
  // The rule #199 removed: a concept question was treated as a request for a new topic.
  assert.doesNotMatch(prompt, /asks to learn something in the plain chat without a mode/);
  // #180's intent stays: the tutor never picks the mode, the page does.
  assert.match(prompt, /Never choose the mode yourself/);
});

test("a terminal session keeps its own instructions untouched", async () => {
  assert.equal(await studioSystemPrompt("extension"), "base instructions");
});
