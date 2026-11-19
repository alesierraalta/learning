// One figure contract for every tutor runtime: the same constant reaches Pi and Antigravity,
// and an already-instructed prompt is not told the same thing twice.
import { test } from "node:test";
import assert from "node:assert/strict";

import { VISUAL_CONTRACT_PROMPT, withVisualContract } from "./contract.ts";

test("the shared figure contract names the current guide, Mermaid and the five step elements", () => {
  assert.match(VISUAL_CONTRACT_PROMPT, /skills\/explicacion-interactiva\/SKILL\.md/);
  assert.match(VISUAL_CONTRACT_PROMPT, /references\/visuales\.md/);
  assert.match(VISUAL_CONTRACT_PROMPT, /Mermaid primero/);
  for (const element of ["lk-stage", "lk-codestep", "lk-tablestep", "lk-guided", "lk-lanes"]) {
    assert.match(VISUAL_CONTRACT_PROMPT, new RegExp(`<${element}>`));
  }
  assert.match(VISUAL_CONTRACT_PROMPT, /audit-note\.mjs --note "<nota>"/);
});

test("the shared contract is added once, even when the prompt already carries it", () => {
  const once = withVisualContract("Escribe la parte 1");
  assert.equal(once.split(VISUAL_CONTRACT_PROMPT).length - 1, 1);
  assert.equal(withVisualContract(once), once, "no duplicate instructions on a correction or a regeneration");
});
