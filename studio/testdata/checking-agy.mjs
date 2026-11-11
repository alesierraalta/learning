// An agy that writes the part a test scripts, one script per turn, and reports each step the way
// `agy --output-format stream-json` does. A correction is a second process, so the turn index comes
// from the studio's own turn log (FAKE_AGY_TURNS), which this script appends to like the plain fake.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
if (process.env.FAKE_AGY_ARGV) appendFileSync(process.env.FAKE_AGY_ARGV, `${args.join(" ")}\n`);
if (process.env.FAKE_AGY_TURNS) appendFileSync(process.env.FAKE_AGY_TURNS, `${JSON.stringify(args)}\n`);

/** FAKE_AGY_WRITES is a list of turns, each a list of {path, content}. */
const script = (() => {
  try {
    return JSON.parse(process.env.FAKE_AGY_WRITES ?? "[]");
  } catch (error) {
    process.stderr.write(`FAKE_AGY_WRITES is not JSON: ${error.message}\n`);
    process.exit(2);
  }
})();
const turn = process.env.FAKE_AGY_TURNS
  ? readFileSync(process.env.FAKE_AGY_TURNS, "utf8").trim().split("\n").filter(Boolean).length - 1
  : 0;

const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const step = (index, state, name, parameters) =>
  out({ event: "step_update", step_update: { step_index: index, state, step_type: "tool", tool_name: name, tool_info: { name, parameters } } });

out({ event: "init", conversation_id: "checking-conversation" });
const writes = script[Math.min(turn, script.length - 1)] ?? [];
writes.forEach(({ path, content }, i) => {
  if (content !== undefined) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  const parameters = { Path: path };
  step(i + 2, "ACTIVE", "write_to_file", parameters);
  step(i + 2, "DONE", "write_to_file", parameters);
});
out({ event: "result", result: { status: "SUCCESS", response: "Escribí la parte" } });
