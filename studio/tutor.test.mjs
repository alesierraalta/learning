// Tutor settings: adding the provider must not cost the learner the tutor they already had, and a
// file written by an older studio must keep opening instead of locking them out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readTutor, saveTutor, TUTOR_AGENTS, TUTOR_SKILL_AGENTS } from "./tutor.ts";

const root = () => mkdtempSync(join(tmpdir(), "tutor-"));

const v1 = (extra = {}) => ({ version: 1, agente: "agy", modelo: "claude-sonnet-4-6", pensamiento: "high", ...extra });
const v2 = (extra = {}) => ({ version: 2, agente: "pi", modelo: "", pensamiento: "", proveedor: "", ...extra });

test("a tutor.json written before providers existed still opens with the same tutor", () => {
  const dir = root();
  writeFileSync(join(dir, "tutor.json"), JSON.stringify(v1()));
  const config = readTutor(dir);
  assert.equal(config.agente, "agy");
  assert.equal(config.modelo, "claude-sonnet-4-6");
  assert.equal(config.pensamiento, "high");
  assert.equal(config.version, 2);
  assert.equal(config.proveedor, "", "nothing is invented: the provider is detected at runtime");
});

test("the first save rewrites a v1 file as v2 and keeps every choice", () => {
  const dir = root();
  writeFileSync(join(dir, "tutor.json"), JSON.stringify(v1()));
  saveTutor(dir, readTutor(dir));
  const onDisk = JSON.parse(readFileSync(join(dir, "tutor.json"), "utf8"));
  assert.equal(onDisk.version, 2);
  assert.equal(onDisk.agente, "agy");
  assert.equal(onDisk.modelo, "claude-sonnet-4-6");
  assert.equal(onDisk.pensamiento, "high");
});

test("a v2 file round-trips with its provider", () => {
  const dir = root();
  const wanted = v2({ agente: "api", modelo: "mistral-small-2603", pensamiento: "high", proveedor: "mistral" });
  saveTutor(dir, wanted);
  assert.deepEqual(readTutor(dir), wanted);
});

test("an old page posting the v1 shape is accepted, not a 400", () => {
  const dir = root();
  const config = saveTutor(dir, v1({ agente: "pi", modelo: "", pensamiento: "" }));
  assert.equal(config.version, 2);
  assert.equal(config.agente, "pi");
  assert.equal(config.proveedor, "");
});

test("an agent the studio does not know is rejected", () => {
  const dir = root();
  assert.throws(() => saveTutor(dir, v2({ agente: "opencode" })), /invalid tutor settings/);
});

test("a provider the studio does not know is rejected; an empty one is detected later", () => {
  const dir = root();
  assert.throws(() => saveTutor(dir, v2({ agente: "api", proveedor: "acme" })), /unknown provider/);
  assert.equal(saveTutor(dir, v2({ agente: "api", modelo: "x", proveedor: "" })).proveedor, "");
});

test("the thinking levels a runtime accepts are its own, and a refused level says why", () => {
  const dir = root();
  // Mistral documents `none` and `high`; Pi has its own ladder; Antigravity accepts neither `none` nor `off`.
  assert.equal(saveTutor(dir, v2({ agente: "api", modelo: "mistral-small-2603", pensamiento: "none", proveedor: "mistral" })).pensamiento, "none");
  assert.throws(() => saveTutor(dir, v2({ agente: "api", pensamiento: "xhigh", proveedor: "mistral" })), /Mistral/);
  assert.throws(() => saveTutor(dir, v2({ agente: "agy", pensamiento: "none" })), /Antigravity does not accept/);
  assert.equal(saveTutor(dir, v2({ agente: "pi", pensamiento: "off" })).pensamiento, "off");
});

test("the API tutor reads no skills from the vault, and the other two still do", () => {
  assert.deepEqual([...TUTOR_AGENTS], ["pi", "agy", "api"]);
  assert.deepEqual([...TUTOR_SKILL_AGENTS], ["pi", "agy"]);
  for (const agente of TUTOR_SKILL_AGENTS) assert.ok(TUTOR_AGENTS.includes(agente), `${agente} is still a tutor agent`);
});
