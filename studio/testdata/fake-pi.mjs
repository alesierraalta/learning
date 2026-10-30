// A stand-in for `pi --mode rpc`: JSONL on stdin/stdout, scripted events, and a
// log of every command received (FAKE_PI_LOG) for the studio tests.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const log = process.env.FAKE_PI_LOG;
const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const record = (command) => log && appendFileSync(log, `${JSON.stringify({ ...command, interactiveHost: process.env.GENTLE_SHELL_INTERACTIVE_HOST, cwd: process.cwd() })}\n`);
let pendingDialog = null;
// The writes the scripted turn makes; a test points them at notes of its own root.
// FAKE_PI_WRITES is a JSON list of {path, isError?, content?}: with content the file
// is really written, as the tutor would, before the tool reports it.
const scriptedWrites = () => {
  if (!process.env.FAKE_PI_WRITES) return [{ path: "tema/explicaciones/Parte 1 - Algo.md" }];
  try {
    return JSON.parse(process.env.FAKE_PI_WRITES);
  } catch (error) {
    // A malformed script is a broken test: stop loudly instead of scripting nothing.
    process.stderr.write(`FAKE_PI_WRITES is not JSON: ${error.message}\n`);
    process.exit(2);
  }
};
const writes = scriptedWrites();

const run = (message) => {
  out({ type: "agent_start" });
  out({ type: "message_start", message: { role: "user", content: message } });
  out({ type: "message_start", message: { role: "assistant", content: [] } });
  out({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hola, " } });
  writes.forEach(({ path, isError = false, content }, i) => {
    out({ type: "tool_execution_start", toolCallId: `t${i + 1}`, toolName: "write", args: { path } });
    if (content !== undefined && !isError) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    out({ type: "tool_execution_end", toolCallId: `t${i + 1}`, toolName: "write", isError });
  });
  out({ type: "extension_ui_request", id: "set-status", method: "setStatus", statusKey: "x", statusText: "y" });
  out({ type: "extension_ui_request", id: "n1", method: "notify", message: "Aviso del tutor", notifyType: "info" });
  pendingDialog = "d1";
  out({ type: "extension_ui_request", id: "d1", method: "select", title: "¿Cómo quieres aprender?", options: ["Universitario", "Rápido con quiz"] });
};

const finish = (answer) => {
  out({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: `elegiste ${answer}.` } });
  out({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: `Hola, elegiste ${answer}.` }] } });
  out({ type: "agent_end" });
  out({ type: "agent_settled" });
};

let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let command;
    try {
      command = JSON.parse(line);
    } catch {
      continue;
    }
    record(command);
    switch (command.type) {
      case "get_messages":
        out({
          id: command.id, type: "response", command: "get_messages", success: true,
          data: { messages: [{ role: "user", content: "hola" }, { role: "assistant", content: [{ type: "text", text: "¡Hola!" }] }, { role: "toolResult", content: "x" }, { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "write", arguments: { path: "tema/explicaciones/Parte 1 - Algo.md" } }] }] },
        });
        break;
      case "prompt":
        out({ id: command.id, type: "response", command: "prompt", success: true, data: { disposition: command.streamingBehavior ? "queued" : "started" } });
        if (command.message === "crash") process.exit(3);
        if (!command.streamingBehavior) run(command.message);
        break;
      case "extension_ui_response":
        if (command.id === pendingDialog) {
          pendingDialog = null;
          finish(command.value ?? (command.cancelled ? "nada" : String(command.confirmed)));
        }
        break;
      case "abort":
      case "new_session":
        out({ id: command.id, type: "response", command: command.type, success: true, data: {} });
        break;
    }
  }
});
