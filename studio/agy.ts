import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { HttpError } from "../integrations/pi/bridge.ts";
import type { TutorConfig } from "./tutor.ts";
import { AGY_LEVELS } from "./tutor.ts";

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

/**
 * `agy models` prints `<id>\t<label>` per model after a progress line; that listing is the only
 * catalogue there is. A line without a tab counts only when it is a bare id.
 */
export function parseAgyModels(output: string): string[] {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const line of output.split("\n")) {
    const id = line.split("\t")[0].trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }
  return models;
}

/**
 * What Pi learns from its learning_view tool, Antigravity gets with every turn: the vault's
 * AGENTS.md alone would send the learner to answer in the chat, where the engine never reads it.
 */
const STUDIO_CONTRACT = [
  "[Learnings studio]",
  "The learner works in the Learnings studio. Quizzes are answered on the studio page, never in this chat: after writing a diagnosis round, tell the learner to press «Responder el diagnóstico»; after a mini-quiz, «Ir a Parte N» (the part's own page). Never ask for answers in a typed format such as d1-B or seguro/dudo/adivine.",
  "A message starting with [Vista HTML · ...] is the learner's own submission; the answers file it names is already written.",
  "Si la persona pide aprender algo sin decir el modo (rápido o universitario), no elijas por ella: responde en una sola línea que la lleve a «Aprender algo nuevo» para elegir el modo y no crees nada.",
  "Reply in neutral Spanish with tú, never voseo (escribe, responde, mira; never escribí, respondé, mirá, acá).",
].join("\n");

/** agy's file tools under the names the studio offers notes and topics from. */
const FILE_TOOLS: Record<string, string> = {
  write_to_file: "write",
  write_file: "write",
  replace_file_content: "edit",
  multi_replace_file_content: "edit",
};

/** One agy tool step as the studio's tool record: file tools carry the path they touched. */
function toolCall(step: Json): { toolName: string; args: Json } {
  const name = String(step.tool_name);
  const info = object(step.tool_info) && object(step.tool_info.parameters) ? step.tool_info.parameters : {};
  const path = [info.Path, info.TargetFile, info.AbsolutePath].find((value) => typeof value === "string");
  return FILE_TOOLS[name] ? { toolName: FILE_TOOLS[name], args: { path } } : { toolName: name, args: info };
}

export function createAgy(options: {
  command: string[];
  cwd: string;
  config: TutorConfig;
  onRecord: (record: Json) => void;
  onError: (message: string) => void;
  /** The id Antigravity assigned to this conversation, so the studio can record it on the chat. */
  onConversation?: (id: string) => void;
}) {
  let proc: ChildProcessWithoutNullStreams | undefined;
  let conversation: string | undefined;
  let stopped = false;
  /** The learner stopped this turn: it ends silently, because it was not asked to finish. */
  let aborted = false;
  /** A turn that names a new conversation is reported once, not on every later record. */
  const remember = (id: string) => {
    if (id === conversation) return;
    conversation = id;
    options.onConversation?.(id);
  };
  return {
    /** The conversation this runtime is in; the studio stores it on the chat it belongs to. */
    conversation() { return conversation; },
    /** Point the next turn at a chat's own conversation, or start a fresh one with no id. */
    open(id?: string) { conversation = id; },
    prompt(text: string) {
      if (stopped) throw new HttpError(503, "the tutor is not running");
      if (proc) throw new HttpError(409, "Antigravity is busy");
      aborted = false;
      const args = ["-p", `${text}\n\n${STUDIO_CONTRACT}`, "--output-format", "stream-json", "--mode", "accept-edits"];
      if (options.config.modelo) args.push("--model", options.config.modelo);
      const effort = options.config.pensamiento;
      if (effort) {
        // Only a level the CLI applies is worth forwarding; the rest is refused, never dropped.
        if (!AGY_LEVELS.includes(effort)) throw new HttpError(400, `Antigravity does not accept the thinking level "${effort}"`);
        args.push("--effort", effort);
      }
      if (conversation) args.push("--conversation", conversation);
      const [command, ...base] = options.command;
      const current = spawn(command, [...base, ...args], { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"] });
      proc = current;
      let buffer = "";
      let answer = "";
      let started = false;
      let result = false;
      /** A process that never started has no exit code: its failure is reported once, here. */
      let spawnFailed = false;
      /** Steps whose start was reported, so each step starts and ends once. */
      const running = new Set<string>();
      options.onRecord({ type: "agent_start" });
      options.onRecord({ type: "message_start", message: { role: "user", content: text } });
      const consume = (line: string) => {
        let record: unknown;
        try { record = JSON.parse(line); } catch { return; }
        if (!object(record)) return;
        if (record.event === "init" && typeof record.conversation_id === "string") remember(record.conversation_id);
        if (record.event === "step_update" && object(record.step_update) && typeof record.step_update.text_delta === "string") {
          const delta = record.step_update.text_delta;
          if (!started) { options.onRecord({ type: "message_start", message: { role: "assistant" } }); started = true; }
          answer += delta;
          options.onRecord({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
        }
        if (record.event === "step_update" && object(record.step_update) && record.step_update.step_type === "tool") {
          const step = record.step_update;
          const toolCallId = `agy-${String(step.step_index)}`;
          if (step.state === "ACTIVE") {
            if (!running.has(toolCallId)) options.onRecord({ type: "tool_execution_start", toolCallId, ...toolCall(step) });
            running.add(toolCallId);
          } else if (running.delete(toolCallId)) {
            options.onRecord({ type: "tool_execution_end", toolCallId, ...toolCall(step), isError: step.state !== "DONE" });
          }
        }
        if (record.event === "result" && object(record.result)) {
          result = true;
          if (typeof record.result.conversation_id === "string") remember(record.result.conversation_id);
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
      current.on("error", (error: NodeJS.ErrnoException) => {
        spawnFailed = true;
        options.onError(
          error.code === "ENOENT"
            ? `No se pudo iniciar Antigravity: no se encontró el ejecutable "${command}". Instálalo o añade su carpeta al PATH del estudio (por ejemplo ~/.local/bin).`
            : `No se pudo iniciar Antigravity: ${error.message}`,
        );
      });
      current.on("close", code => {
        if (proc !== current) return;
        if (buffer.trim()) consume(buffer);
        proc = undefined;
        // Node closes a failed spawn with code -2; that is the same failure, already reported.
        // A turn that produced no text is reported too: silence would look like a dead chat.
        if (!stopped && !aborted && !spawnFailed && !answer) {
          options.onError(
            !result && code !== 0
              ? `Antigravity terminó con código ${code}`
              : "Antigravity terminó sin responder; vuelve a intentarlo.",
          );
        }
        if (!stopped && answer) {
          if (!started) options.onRecord({ type: "message_start", message: { role: "assistant" } });
          options.onRecord({ type: "message_end", message: { role: "assistant", content: answer } });
        }
        options.onRecord({ type: "agent_settled" });
      });
    },
    abort() { aborted = true; proc?.kill(); },
    stop() { stopped = true; proc?.kill(); },
  };
}
