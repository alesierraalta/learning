// A stand-in for `pi --mode rpc`: JSONL on stdin/stdout, scripted events, and a
// log of every command received (FAKE_PI_LOG) for the studio tests.
import { appendFileSync } from "node:fs";

const log = process.env.FAKE_PI_LOG;
const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const record = (command) => log && appendFileSync(log, `${JSON.stringify({ ...command, interactiveHost: process.env.GENTLE_SHELL_INTERACTIVE_HOST, cwd: process.cwd() })}\n`);
let pendingDialog = null;

const run = (message) => {
  out({ type: "agent_start" });
  out({ type: "message_start", message: { role: "user", content: message } });
  out({ type: "message_start", message: { role: "assistant", content: [] } });
  out({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hola, " } });
  out({ type: "tool_execution_start", toolCallId: "t1", toolName: "write", args: { path: "tema/explicaciones/Parte 1 - Algo.md" } });
  out({ type: "tool_execution_end", toolCallId: "t1", toolName: "write", isError: false });
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
          data: { messages: [{ role: "user", content: "hola" }, { role: "assistant", content: [{ type: "text", text: "¡Hola!" }] }, { role: "toolResult", content: "x" }] },
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
