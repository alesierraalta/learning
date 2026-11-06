// A stand-in for `agy`: the `models` catalogue, and one scripted turn otherwise.
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
if (process.env.FAKE_AGY_ARGV) appendFileSync(process.env.FAKE_AGY_ARGV, `${args.join(" ")}\n`);
if (args[0] === "models") {
  process.stdout.write("gemini-3.8-flash-high\nclaude-sonnet-4-6\n");
  process.exit(0);
}
process.stdout.write(`${JSON.stringify({ event: "init", conversation_id: "test-conversation" })}\n`);
process.stdout.write(`${JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "Respuesta de Antigravity" } })}\n`);
