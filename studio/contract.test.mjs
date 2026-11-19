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

// T2a–T2f used to live in Antigravity's preamble; the contract is now the one message Pi and
// Antigravity inherit from the studio (#361), so the same assertions belong here.
test("the shared contract sends one part-check command and forbids reading gate or kit source", () => {
  assert.match(VISUAL_CONTRACT_PROMPT, /node <repo>\/tools\/part-check\.mjs <nota>/);
  assert.match(VISUAL_CONTRACT_PROMPT, /--json/);
  assert.match(VISUAL_CONTRACT_PROMPT, /no leas el código de las puertas ni del kit/i);
  assert.match(VISUAL_CONTRACT_PROMPT, /cada hallazgo trae la regla, el elemento y la corrección/);
});

test("the shared contract writes the whole part before checking, from the brief's rule sheet", () => {
  const at = (pattern) => {
    const match = pattern.exec(VISUAL_CONTRACT_PROMPT);
    assert.ok(match, `missing in the shared contract: ${pattern}`);
    return match.index;
  };
  const brief = at(/lee primero la ficha de la parte que el estudio pone al principio del prompt/);
  const write = at(/escribe la parte entera de una sola vez/);
  const check = at(/corre `node <repo>\/tools\/part-check\.mjs <nota>` una sola vez/);
  const fix = at(/corrige solo lo que sus hallazgos nombren/);
  const edit = at(/edit_file`\/`replace`/);
  const spans = at(/exactamente las líneas o bloques que nombra cada hallazgo/);
  const noRewrite = at(/nunca reescribas la nota entera/);
  const structural = at(/reescritura completa solo se permite si part-check da un hallazgo estructural que abarque toda la nota/i);
  const again = at(/vuelve a correr part-check/);
  assert.ok(brief < write && write < check && check < fix && fix < edit && edit < spans && spans < noRewrite && noRewrite < structural && structural < again, "brief → write → check → targeted edits → re-check");
  assert.match(VISUAL_CONTRACT_PROMPT, /no leas reglas de `tools\/explain-check\/rules\//i);
  assert.match(VISUAL_CONTRACT_PROMPT, /ni el registro `tools\/register\/measure\.mjs`/i);
  assert.match(VISUAL_CONTRACT_PROMPT, /no sondee el registro con `node -e`/i);
});
