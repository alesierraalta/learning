/**
 * The agent runtime seam: the half of the studio that talks to whichever agent
 * tutors. A runtime owns its process, its framing and the translation of that
 * agent's own records into `RuntimeEvent`s.
 *
 * A runtime reports facts (text deltas, tool calls, dialogs, state); the studio
 * keeps the vocabulary (tool labels, assistant ids, the SSE contract). Pi is the
 * first runtime; another agent is another adapter behind the same handle.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { HttpError } from "../integrations/pi/bridge.ts";
import { modelParts } from "./tutor.ts";

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** Pi's interactive UI methods that are questions the learner answers. */
const DIALOG_METHODS = new Set(["select", "confirm", "input", "editor"]);

export type RuntimeEvent =
  | { type: "state"; busy: boolean; alive: boolean }
  | { type: "user"; text: string }
  | { type: "assistant_start" }
  | { type: "assistant_delta"; delta: string }
  | { type: "assistant_end"; text: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | { type: "tool_end"; id: string; name: string; args: unknown; ok: boolean }
  | { type: "dialog"; id: string; method: string; title: string; message: string; options: unknown[]; placeholder: string }
  | { type: "dialog_closed"; id: string }
  | { type: "notice"; level: string; message: string }
  | { type: "settled" }
  | { type: "failure"; message: string }; // the agent could not start or died

/** One turn of the conversation as the learner hears it, plus what it wrote. */
export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  calls: { name: string; args: unknown }[];
}

export interface RuntimeHandle {
  start(): void;
  /** Kills the agent; its shutdown handlers run before the returned promise settles. */
  stop(): void;
  readonly busy: boolean;
  readonly alive: boolean;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  newSession(): Promise<void>;
  /**
   * The conversation the learner hears. Each runtime reads its own records, so the
   * studio never learns Pi's wire shape -- nor the next agent's.
   */
  transcript(): Promise<TranscriptEntry[]>;
  models(): Promise<{ id: string; nombre: string; proveedor: string; razona: boolean }[]>;
  current(): Promise<{ modelo: string; pensamiento: string } | null>;
  apply(config: { modelo: string; pensamiento: string }): Promise<void>;
  /** A dialog answer, already built by the studio; the runtime writes it and closes the dialog. */
  respond(id: string, payload: Json): void;
}

/** The text parts of an agent message, joined. */
export function messageText(message: unknown): string {
  if (!isRecord(message)) return "";
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is Json => isRecord(c) && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");
}

/** An agent's message records, read as turns the studio can render. */
export function transcriptOf(messages: unknown): TranscriptEntry[] {
  if (!Array.isArray(messages)) return [];
  const entries: TranscriptEntry[] = [];
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const role = message.role;
    if (role !== "user" && role !== "assistant") continue;
    const calls = Array.isArray(message.content)
      ? message.content
          .filter((part): part is Json => isRecord(part) && part.type === "toolCall")
          .map((part) => ({ name: String(part.name), args: part.arguments }))
      : [];
    entries.push({ role, text: messageText(message), calls });
  }
  return entries;
}

/** A `pi --mode rpc` child, framed as JSONL, translated into runtime events. */
export function createPiRuntime(options: {
  command: string[];
  cwd: string;
  onEvent: (event: RuntimeEvent) => void;
}): RuntimeHandle {
  const emit = options.onEvent;
  let child: ChildProcessWithoutNullStreams | undefined;
  let alive = false;
  let busy = false;
  let nextId = 0;
  const waiting = new Map<string, (record: Json) => void>();
  // A tool's end event may arrive without its arguments; the row keeps the ones its start carried.
  const toolArgs = new Map<string, unknown>();
  const dialogs = new Map<string, Json>();

  const handle = (record: Json) => {
    const type = record.type;
    if (type === "response" && typeof record.id === "string" && waiting.has(record.id)) {
      waiting.get(record.id)!(record);
      waiting.delete(record.id);
      return;
    }
    switch (type) {
      case "agent_start":
        busy = true;
        emit({ type: "state", busy, alive });
        return;
      case "agent_settled":
        busy = false;
        toolArgs.clear();
        emit({ type: "state", busy, alive });
        emit({ type: "settled" });
        return;
      case "message_start": {
        const message = record.message;
        if (isRecord(message) && message.role === "user") emit({ type: "user", text: messageText(message) });
        if (isRecord(message) && message.role === "assistant") emit({ type: "assistant_start" });
        return;
      }
      case "message_update": {
        const ev = record.assistantMessageEvent;
        if (isRecord(ev) && ev.type === "text_delta" && typeof ev.delta === "string") {
          emit({ type: "assistant_delta", delta: ev.delta });
        }
        return;
      }
      case "message_end": {
        const message = record.message;
        if (isRecord(message) && message.role === "assistant") {
          const text = messageText(message);
          if (text) emit({ type: "assistant_end", text });
        }
        return;
      }
      case "tool_execution_start": {
        const id = String(record.toolCallId);
        toolArgs.set(id, record.args);
        emit({ type: "tool_start", id, name: String(record.toolName), args: record.args });
        return;
      }
      case "tool_execution_end": {
        const id = String(record.toolCallId);
        const args = record.args ?? toolArgs.get(id);
        toolArgs.delete(id);
        emit({ type: "tool_end", id, name: String(record.toolName), args, ok: !record.isError });
        return;
      }
      case "extension_ui_request": {
        const method = String(record.method);
        if (DIALOG_METHODS.has(method) && typeof record.id === "string") {
          const dialog = {
            id: record.id,
            method,
            title: record.title ?? "",
            message: record.message ?? "",
            options: Array.isArray(record.options) ? record.options : [],
            placeholder: record.placeholder ?? "",
          };
          dialogs.set(record.id, dialog);
          emit({ type: "dialog", id: record.id, method, title: dialog.title as string, message: dialog.message as string, options: dialog.options, placeholder: dialog.placeholder as string });
        } else if (method === "notify" && typeof record.message === "string") {
          emit({ type: "notice", level: (record.notifyType ?? "info") as string, message: record.message });
        }
        return;
      }
    }
  };

  const start = () => {
    // A restart replaces the agent it had: the old process stops without reporting a death.
    if (child) {
      const previous = child;
      child = undefined;
      previous.kill();
    }
    const [cmd, ...args] = options.command;
    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, GENTLE_SHELL_INTERACTIVE_HOST: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child = proc;
    alive = true;
    busy = false;
    let buffer = Buffer.alloc(0);
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      let nl: number;
      // JSONL framing: records end only at LF (never Unicode line separators).
      while ((nl = buffer.indexOf(0x0a)) >= 0) {
        const line = buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "");
        buffer = buffer.subarray(nl + 1);
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (isRecord(record)) handle(record);
        } catch {
          // Not a protocol record; Pi reserves stdout for records.
        }
      }
    });
    proc.stderr.resume();
    proc.on("exit", () => {
      if (child !== proc) return;
      alive = false;
      busy = false;
      for (const resolve of waiting.values()) resolve({ success: false, error: "Pi exited" });
      waiting.clear();
      for (const id of dialogs.keys()) emit({ type: "dialog_closed", id });
      dialogs.clear();
      emit({ type: "state", busy, alive });
      emit({ type: "failure", message: "El tutor se detuvo." });
    });
    proc.on("error", (err) => emit({ type: "failure", message: `No se pudo iniciar Pi: ${err.message}` }));
    emit({ type: "state", busy, alive });
  };

  const write = (command: Json) => {
    if (!child || !alive) throw new HttpError(503, "the tutor is not running");
    child.stdin.write(`${JSON.stringify(command)}\n`);
  };

  const call = (command: Json, timeoutMs = 30000): Promise<Json> =>
    new Promise((resolve, reject) => {
      const id = `s${++nextId}`;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new HttpError(504, `Pi did not answer ${command.type}`));
      }, timeoutMs);
      waiting.set(id, (record) => {
        clearTimeout(timer);
        resolve(record);
      });
      try {
        write({ ...command, id });
      } catch (err) {
        clearTimeout(timer);
        waiting.delete(id);
        reject(err);
      }
    });

  /** A prompt while the agent works is queued until it finishes. */
  const prompt = async (text: string) => {
    const reply = await call(busy ? { type: "prompt", message: text, streamingBehavior: "followUp" } : { type: "prompt", message: text });
    if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi rejected the prompt"));
  };

  const abort = async () => {
    await call({ type: "abort" }, 60000);
  };

  const newSession = async () => {
    const reply = await call({ type: "new_session" });
    if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi refused a new session"));
  };

  const transcript = async (): Promise<TranscriptEntry[]> => {
    if (!alive) return [];
    const reply = await call({ type: "get_messages" }, 10000);
    return transcriptOf(isRecord(reply.data) ? reply.data.messages : undefined);
  };

  const models = async (): Promise<{ id: string; nombre: string; proveedor: string; razona: boolean }[]> => {
    if (!alive) return [];
    try {
      const reply = await call({ type: "get_available_models" }, 10000);
      const list = isRecord(reply.data) && Array.isArray(reply.data.models) ? reply.data.models : [];
      return list.filter(isRecord).flatMap((model) => typeof model.provider === "string" && typeof model.id === "string"
        ? [{ id: `${model.provider}/${model.id}`, nombre: typeof model.name === "string" ? model.name : model.id, proveedor: model.provider, razona: model.reasoning === true }]
        : []);
    } catch {
      // An agent that cannot list models still tutors: the page shows what the file says.
      return [];
    }
  };

  const current = async (): Promise<{ modelo: string; pensamiento: string } | null> => {
    if (!alive) return null;
    try {
      const reply = await call({ type: "get_state" }, 10000);
      const data = isRecord(reply.data) ? reply.data : {};
      const model = isRecord(data.model) ? data.model : null;
      return {
        modelo: model && typeof model.provider === "string" && typeof model.id === "string" ? `${model.provider}/${model.id}` : "",
        pensamiento: typeof data.thinkingLevel === "string" ? data.thinkingLevel : "",
      };
    } catch { return null; }
  };

  const apply = async (config: { modelo: string; pensamiento: string }) => {
    if (config.modelo) {
      const parts = modelParts(config.modelo);
      if (!parts) throw new HttpError(400, "invalid tutor model");
      const reply = await call({ type: "set_model", provider: parts.provider, modelId: parts.modelId }, 20000);
      if (reply.success === false) throw new HttpError(409, String(reply.error ?? "the tutor refused that model"));
    }
    if (config.pensamiento) {
      const reply = await call({ type: "set_thinking_level", level: config.pensamiento }, 10000);
      if (reply.success === false) throw new HttpError(409, String(reply.error ?? "the tutor refused that thinking level"));
    }
  };

  const respond = (id: string, payload: Json) => {
    write(payload);
    dialogs.delete(id);
    emit({ type: "dialog_closed", id });
  };

  const stop = async () => {
    const proc = child;
    child = undefined;
    proc?.kill();
  };

  return {
    start,
    stop,
    get busy() { return busy; },
    get alive() { return alive; },
    prompt,
    abort,
    newSession,
    transcript,
    models,
    current,
    apply,
    respond,
  };
}
