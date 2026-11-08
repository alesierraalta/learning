// A stand-in for `pi --mode rpc`: JSONL on stdin/stdout, scripted events, and a
// log of every command received (FAKE_PI_LOG) for the studio tests.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.argv.includes("--list-models")) {
  // pi's real listing: noise on both streams, then the table on stdout.
  process.stderr.write('Warning: No models match pattern "openai-codex/gpt-6-luna"\n');
  process.stdout.write("[relay-timeout] bound fijado en 3600000ms\n");
  process.stdout.write([
    "provider       model                       context  max-out  thinking  images",
    "claude-bridge  claude-fable-5              1M       128K     yes       yes   ",
    "claude-bridge  claude-sonnet-4-6           200K     128K     yes       yes   ",
    "opencode-go    glm-5.3                     1M       131.1K   yes       no    ",
    "opencode-go    gpt-6-luna                  1.1M     128K     yes       yes   ",
    "",
  ].join("\n"));
  process.exit(0);
}

const log = process.env.FAKE_PI_LOG;
const out = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const record = (command) => log && appendFileSync(log, `${JSON.stringify({ ...command, interactiveHost: process.env.GENTLE_SHELL_INTERACTIVE_HOST, cwd: process.cwd() })}\n`);
let pendingDialog = null;
// Pi keeps one file per session: a new session is a new file, and a switch names one.
// FAKE_PI_SESSION_DIR lets a test own the directory the studio is allowed to delete from.
const sessionDir = process.env.FAKE_PI_SESSION_DIR ?? "/tmp";
let sessionSeq = 0;
let sessionFile = join(sessionDir, "fake-session-0.jsonl");
mkdirSync(sessionDir, { recursive: true });
writeFileSync(sessionFile, "");
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
// The notices a turn emits; the harness writes its own warnings through the same
// channel, and a test needs both in the stream to tell the chat what to keep.
const notices = () => {
  if (!process.env.FAKE_PI_NOTICES) return ["Aviso del tutor"];
  try {
    return JSON.parse(process.env.FAKE_PI_NOTICES);
  } catch (error) {
    process.stderr.write(`FAKE_PI_NOTICES is not JSON: ${error.message}\n`);
    process.exit(2);
  }
};
const spoken = notices();

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
  spoken.forEach((message, i) => out({ type: "extension_ui_request", id: `n${i + 1}`, method: "notify", message, notifyType: "info" }));
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
      case "get_session_stats":
        out({
          id: command.id, type: "response", command: "get_session_stats", success: true,
          data: {
            sessionFile,
            sessionId: `fake-${sessionSeq}`,
            userMessages: 1,
            assistantMessages: 1,
            totalMessages: 2,
            tokens: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, total: 1200 },
            cost: 0.01,
            contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 },
          },
        });
        break;
      case "switch_session":
        sessionFile = String(command.sessionPath ?? sessionFile);
        out({ id: command.id, type: "response", command: "switch_session", success: true, data: { cancelled: false } });
        break;
      case "set_session_name":
        out({ id: command.id, type: "response", command: "set_session_name", success: true, data: {} });
        break;
      case "export_html": {
        // Pi honours outputPath and answers with the path it wrote, absolute as given.
        const path = typeof command.outputPath === "string" ? command.outputPath : join(sessionDir, "export.html");
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, "<html></html>");
        out({ id: command.id, type: "response", command: "export_html", success: true, data: { path } });
        break;
      }
      case "abort":
        out({ id: command.id, type: "response", command: command.type, success: true, data: {} });
        break;
      case "new_session":
        sessionSeq += 1;
        sessionFile = join(sessionDir, `fake-session-${sessionSeq}.jsonl`);
        writeFileSync(sessionFile, "");
        out({ id: command.id, type: "response", command: "new_session", success: true, data: {} });
        break;
    }
  }
});
