import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HttpError } from "../integrations/pi/bridge.ts";
import type { TutorConfig } from "./tutor.ts";

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

export function createAgy(options: { command: string[]; cwd: string; config: TutorConfig; onRecord: (record: Json) => void; onError: (message: string) => void }) {
  let proc: ChildProcessWithoutNullStreams | undefined;
  let conversation: string | undefined;
  let stopped = false;
  return {
    prompt(text: string) {
      if (stopped) throw new HttpError(503, "the tutor is not running");
      if (proc) throw new HttpError(409, "Antigravity is busy");
      const args = ["-p", text, "--output-format", "stream-json", "--mode", "accept-edits"];
      if (options.config.modelo) args.push("--model", options.config.modelo);
      if (["low", "medium", "high", "xhigh", "max"].includes(options.config.pensamiento)) args.push("--effort", options.config.pensamiento);
      if (conversation) args.push("--conversation", conversation);
      const [command, ...base] = options.command;
      const current = spawn(command, [...base, ...args], { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
      proc = current;
      let buffer = "";
      let answer = "";
      let started = false;
      let result = false;
      options.onRecord({ type: "agent_start" });
      options.onRecord({ type: "message_start", message: { role: "user", content: text } });
      const consume = (line: string) => {
        let record: unknown;
        try { record = JSON.parse(line); } catch { return; }
        if (!object(record)) return;
        if (record.event === "init" && typeof record.conversation_id === "string") conversation = record.conversation_id;
        if (record.event === "step_update" && object(record.step_update) && typeof record.step_update.text_delta === "string") {
          const delta = record.step_update.text_delta;
          if (!started) { options.onRecord({ type: "message_start", message: { role: "assistant" } }); started = true; }
          answer += delta;
          options.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
        }
        if (record.event === "result" && object(record.result)) {
          result = true;
          if (typeof record.result.conversation_id === "string") conversation = record.result.conversation_id;
          if (record.result.status && record.result.status !== "SUCCESS") options.onError(`Antigravity terminó con estado ${record.result.status}`);
          if (!answer && typeof record.result.response === "string") answer = record.result.response;
        }
      };
      current.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      });
      current.stderr.resume();
      current.on("error", error => options.onError(`No se pudo iniciar Antigravity: ${error.message}`));
      current.on("close", code => {
        if (proc !== current) return;
        if (buffer.trim()) consume(buffer);
        proc = undefined;
        if (!stopped && code !== 0 && !result) options.onError(`Antigravity terminó con código ${code}`);
        if (!stopped && answer) {
          if (!started) options.onRecord({ type: "message_start", message: { role: "assistant" } });
          options.onRecord({ type: "message_end", message: { role: "assistant", content: answer } });
        }
        options.onRecord({ type: "agent_settled" });
      });
    },
    abort() { proc?.kill(); },
    stop() { stopped = true; proc?.kill(); },
  };
}
