/**
 * The Antigravity runtime: `agy` in print mode, one process per turn.
 *
 * agy has no resident session, so the conversation is kept by the agent, not by
 * the studio: the first turn creates one and every later turn names it with
 * `--conversation`. What that costs is stated where it hurts: `current()` is
 * null, because agy reports no state and the settings are not a report.
 *
 * Stream facts this adapter relies on, measured against agy 1.4.12:
 *   - `init` carries the conversation id on a fresh conversation only.
 *   - Live text arrives as `step_update` with `step_type:"agent_response"` and a
 *     `text_delta`; a resumed turn replays old steps as DONE records with no
 *     delta, and those must not reach the learner twice.
 *   - A tool step is ACTIVE (with `tool_info.parameters`) then DONE (with
 *     `tool_info.output`); a command that failed says `Command exited with code N`.
 *   - `result` closes the turn with the full `response` and its `status`.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";

import { HttpError } from "../integrations/pi/bridge.ts";

import type { RuntimeEvent, RuntimeHandle, TranscriptEntry } from "./runtime.ts";

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** The effort levels agy accepts; anything else (off, minimal) is left unwritten. */
export const AGY_EFORT = ["low", "medium", "high", "xhigh", "max"];
const EFORT = new Set(AGY_EFORT);
/** An agy model id, as `agy models` prints it. */
const MODELO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * The command for one turn. `--mode accept-edits` is what lets the tutor write
 * the explanation it was asked for; without it the agent proposes and stops.
 */
export function agyArgs(
  config: { modelo: string; pensamiento: string },
  prompt: string,
  conversation: string | null,
): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--mode",
    "accept-edits",
    ...(MODELO.test(config.modelo) ? ["--model", config.modelo] : []),
    ...(EFORT.has(config.pensamiento) ? ["--effort", config.pensamiento] : []),
    ...(conversation ? ["--conversation", conversation] : []),
  ];
}

/** `agy models` printed one model per line; the listing is the only catalogue there is. */
export function agyModels(output: string): { id: string; nombre: string; proveedor: string; razona: boolean }[] {
  const seen = new Set<string>();
  const models: { id: string; nombre: string; proveedor: string; razona: boolean }[] = [];
  for (const line of String(output ?? "").replace(ANSI, "").split("\n")) {
    const id = line.trim();
    // `razona` is Pi's fact about a model; agy has none to report per model.
    if (!MODELO.test(id) || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, nombre: id, proveedor: "antigravity", razona: true });
  }
  return models;
}

/** A command that failed says so in its own output; nothing else is a failure. */
export function toolOk(output: unknown): boolean {
  return !/Command exited with code [1-9]/.test(String(output ?? ""));
}

export function createAgyRuntime(options: {
  command?: string[];
  cwd: string;
  config: { modelo: string; pensamiento: string };
  /** What the learner already read, carried across a restart of the studio. */
  transcript?: TranscriptEntry[];
  onEvent: (event: RuntimeEvent) => void;
}): RuntimeHandle {
  const emit = options.onEvent;
  const [command, ...base] = options.command ?? ["agy"];
  let config = { ...options.config };
  let child: ChildProcess | undefined;
  let conversation: string | null = null;
  let busy = false;
  let stopped = false;
  const turns: TranscriptEntry[] = [...(options.transcript ?? [])];
  let current: Turn | undefined;

  /** One turn in flight: what agy said, what it wrote, and whether it ended. */
  interface Turn {
    text: string;
    started: boolean;
    calls: { name: string; args: unknown }[];
    tools: Map<number, { name: string; args: unknown }>;
    aborted: boolean;
    ended: boolean;
  }

  const settle = () => {
    current = undefined;
    busy = false;
    child = undefined;
    emit({ type: "state", busy, alive: !stopped });
    emit({ type: "settled" });
  };

  /** Ends the turn once: the learner sees the text, the studio sees it in history. */
  const finish = (turn: Turn, response: string | null, failure: string | null) => {
    if (turn.ended) return;
    turn.ended = true;
    const text = turn.text || response || "";
    if (text) {
      turns.push({ role: "assistant", text, calls: [...turn.calls] });
      if (!turn.started) emit({ type: "assistant_start" });
      emit({ type: "assistant_end", text });
    }
    if (failure && !text) emit({ type: "failure", message: failure });
    settle();
  };

  const step = (turn: Turn, record: Json) => {
    const index = typeof record.step_index === "number" ? record.step_index : -1;
    const state = String(record.state ?? "");
    const info = isRecord(record.tool_info) ? record.tool_info : {};
    // Only a delta is live text; the DONE copies are the replay of earlier turns.
    if (typeof record.text_delta === "string" && record.text_delta) {
      if (!turn.started) {
        turn.started = true;
        emit({ type: "assistant_start" });
      }
      turn.text += record.text_delta;
      emit({ type: "assistant_delta", delta: record.text_delta });
    }
    if (record.step_type !== "tool" || index < 0) return;
    if (state === "ACTIVE") {
      const name = String(info.name ?? "tool");
      const args = info.parameters;
      turn.tools.set(index, { name, args });
      turn.calls.push({ name, args });
      emit({ type: "tool_start", id: `agy-${index}`, name, args });
      return;
    }
    // A DONE record with no ACTIVE of this process is a replayed tool: it is not news.
    const open = turn.tools.get(index);
    if (state !== "DONE" || open === undefined) return;
    turn.tools.delete(index);
    emit({ type: "tool_end", id: `agy-${index}`, name: open.name, args: open.args, ok: toolOk(info.output) });
  };

  const record = (turn: Turn, line: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(parsed)) return;
    if (parsed.event === "init" && typeof parsed.conversation_id === "string") {
      conversation = parsed.conversation_id;
      return;
    }
    if (parsed.event === "step_update" && isRecord(parsed.step_update)) return step(turn, parsed.step_update);
    if (parsed.event !== "result") return;
    const result = isRecord(parsed.result) ? parsed.result : {};
    if (typeof result.conversation_id === "string") conversation = result.conversation_id;
    const status = String(result.status ?? "");
    const answer = typeof result.response === "string" ? result.response : null;
    if (status !== "SUCCESS" && status !== "") {
      return finish(turn, answer, `Antigravity terminó con estado ${status}`);
    }
    finish(turn, answer, null);
  };

  const prompt = async (text: string) => {
    if (stopped) throw new HttpError(503, "the tutor is not running");
    // agy answers one turn per process; there is no follow-up queue to join.
    if (busy) throw new HttpError(409, "the tutor is still answering the previous message");
    const turn: Turn = { text: "", started: false, calls: [], tools: new Map(), aborted: false, ended: false };
    current = turn;
    turns.push({ role: "user", text, calls: [] });
    // The turn is the learner's message too: the studio shows it before the answer.
    emit({ type: "user", text });
    busy = true;
    emit({ type: "state", busy, alive: true });
    const proc = spawn(command, [...base, ...agyArgs(config, text, conversation)], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = proc;
    let buffered = "";
    let complaint = "";
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) record(turn, line);
    });
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      complaint += chunk;
    });
    proc.on("error", (err) => finish(turn, null, err.message));
    proc.on("close", (code) => {
      if (buffered.trim()) record(turn, buffered);
      // A turn that was stopped is what the learner saw, not a failure.
      if (turn.aborted || turn.ended) return finish(turn, null, null);
      finish(turn, null, code === 0 ? null : `Antigravity salió con código ${code}${complaint ? `: ${complaint.trim().split("\n")[0]}` : ""}`);
    });
  };

  const abort = async () => {
    const running = child;
    if (!running) return;
    // A stop the learner asked for must not reach the chat as the agent failing.
    if (current) current.aborted = true;
    running.kill("SIGTERM");
    // The close handler ends the turn; abort only asks for it.
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      running.once("close", done);
      running.once("error", done);
      setTimeout(done, 5000).unref?.();
    });
  };

  const newSession = async () => {
    if (busy) throw new HttpError(409, "the tutor is still answering");
    conversation = null;
    turns.length = 0;
  };

  const models = async () =>
    new Promise<{ id: string; nombre: string; proveedor: string; razona: boolean }[]>((resolve) => {
      execFile(command, ["models"], { cwd: options.cwd, timeout: 10000 }, (err, stdout) => resolve(err ? [] : agyModels(stdout)));
    });

  return {
    start() {
      stopped = false;
      emit({ type: "state", busy, alive: true });
    },
    async stop() {
      stopped = true;
      // A turn cut short by a restart is not the agent failing either.
      if (current) current.aborted = true;
      child?.kill("SIGTERM");
      child = undefined;
    },
    get busy() {
      return busy;
    },
    get alive() {
      return !stopped;
    },
    prompt,
    abort,
    newSession,
    async transcript() {
      return turns.map((turn) => ({ ...turn, calls: [...turn.calls] }));
    },
    models,
    // agy has no `get_state`: reporting the settings as the agent's own answer
    // would be invented. The studio shows the settings instead.
    async current() {
      return null;
    },
    async apply(next) {
      // Nothing live to poke: the next turn is a new process.
      config = { ...next };
    },
    respond() {
      // Print mode asks no dialogs; the studio's dialog path never opens for it.
      throw new HttpError(400, "Antigravity does not ask dialogs");
    },
  };
}
