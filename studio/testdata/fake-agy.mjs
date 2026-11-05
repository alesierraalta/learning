#!/usr/bin/env node
// A stand-in for `agy --print --output-format stream-json`, so the studio's
// Antigravity runtime can be tested without quota and without a network.
//
// It answers one prompt per process, in the shapes measured from agy 1.4.12:
// `init` only on a fresh conversation, `step_update` for tools and response
// text, then `result` with the conversation id and the full response.
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
// The studio asks for the version once, to know whether this agent can be offered.
if (args.includes("--version")) {
  process.stdout.write("1.4.12\n");
  process.exit(0);
}
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : "";
};
const prompt = flag("-p");
const resumed = flag("--conversation");
const conversation = resumed || "conv-fake-1";

// The studio must be able to prove which conversation it resumed and which
// model it asked for; one JSON line per invocation.
if (process.env.FAKE_AGY_LOG) {
  appendFileSync(process.env.FAKE_AGY_LOG, `${JSON.stringify({ args, prompt })}\n`);
}

const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const step = (value) => out({ event: "step_update", step_update: { conversation_id: conversation, ...value } });

if (!resumed) out({ event: "init", conversation_id: conversation, init: { model: flag("--model") || "gemini-3.8-flash-low", cwd: process.cwd(), tools: ["run_command"] } });

// A turn that never ends, so a test can prove what stopping it means.
if (prompt.includes("tarda")) {
  await new Promise((resolve) => setTimeout(resolve, 30000));
  process.exit(0);
}

if (prompt.includes("falla")) {
  step({ step_index: 1, state: "DONE", step_type: "agent_response", duration_seconds: 0.1, usage: { input_tokens: 1, output_tokens: 1 } });
  out({ event: "result", result: { conversation_id: conversation, status: "ERROR", response: "", num_turns: 1 } });
  process.exitCode = 1;
} else {
  step({ step_index: 1, state: "ACTIVE", step_type: "agent_response", text_delta: "Hola" });
  step({ step_index: 2, state: "ACTIVE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "echo hola" } } });
  step({ step_index: 2, state: "DONE", step_type: "tool", duration_seconds: 0.2, tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "echo hola" }, output: "Command exited with code 0.\n\nCommand output:\nhola\r\n" } });
  step({ step_index: 3, state: "ACTIVE", step_type: "agent_response", text_delta: " desde agy." });
  step({ step_index: 3, state: "DONE", step_type: "agent_response", duration_seconds: 0.3, usage: { input_tokens: 10, output_tokens: 4 } });
  out({ event: "result", result: { conversation_id: conversation, status: "SUCCESS", response: "Hola desde agy.", num_turns: resumed ? 2 : 1, usage: { input_tokens: 10, output_tokens: 4 } } });
}
