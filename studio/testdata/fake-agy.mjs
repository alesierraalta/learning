// A stand-in for `agy`: the `models` catalogue, and one scripted turn otherwise.
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
if (process.env.FAKE_AGY_ARGV) appendFileSync(process.env.FAKE_AGY_ARGV, `${args.join(" ")}\n`);
if (args[0] === "models") {
  // agy 1.5.2's real listing: a progress line, then `<id>\t<label>` per model.
  process.stdout.write("Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n");
  process.exit(0);
}
process.stdout.write(`${JSON.stringify({ event: "init", conversation_id: "test-conversation" })}\n`);
process.stdout.write(`${JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "Respuesta de Antigravity" } })}\n`);
