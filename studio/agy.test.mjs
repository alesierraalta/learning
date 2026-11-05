import assert from "node:assert/strict";
import test from "node:test";

import { agyArgs, agyModels, toolOk } from "./agy.ts";

test("the Antigravity command carries the model, the effort and the conversation", () => {
  assert.deepEqual(agyArgs({ modelo: "gemini-3.8-flash-low", pensamiento: "high" }, "explica", "conv-1"), [
    "-p",
    "explica",
    "--output-format",
    "stream-json",
    "--mode",
    "accept-edits",
    "--model",
    "gemini-3.8-flash-low",
    "--effort",
    "high",
    "--conversation",
    "conv-1",
  ]);
  assert.deepEqual(
    agyArgs({ modelo: "", pensamiento: "minimal" }, "explica", null),
    ["-p", "explica", "--output-format", "stream-json", "--mode", "accept-edits"],
    "a model agy cannot name and an effort it does not have are not passed",
  );
  assert.deepEqual(agyArgs({ modelo: "no es un id", pensamiento: "" }, "explica", null).slice(6), [], "only what agy accepts is written");
});

test("the model list is what agy printed, cleaned", () => {
  const listed = agyModels("\u001b[32mgemini-3.8-flash-high\u001b[0m\r\ngemini-3.8-flash-high\nclaude-sonnet-4-6\n\nno es un modelo\n");
  assert.deepEqual(listed.map((m) => m.id), ["gemini-3.8-flash-high", "claude-sonnet-4-6"]);
  assert.equal(listed[0].proveedor, "antigravity");
});

test("a command that failed is the one agy says failed", () => {
  assert.equal(toolOk("Command exited with code 0.\n\nCommand output:\nhola"), true);
  assert.equal(toolOk("Command exited with code 1.  No output from the command."), false);
  assert.equal(toolOk(""), true, "a tool that reports nothing is not a failure");
  assert.equal(toolOk(undefined), true);
});
