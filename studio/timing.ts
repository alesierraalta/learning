/**
 * The page timing report, with the inside of every model call made visible.
 *
 * `studio/runtime.ts` still owns the generation's clocks and its existing fields. This wrapper adds
 * the tool executions a call made and the model time left between them, without changing what the
 * studio measures or sends: a tool event is only observed, never produced here.
 */
import {
  createPageTiming as createBasePageTiming,
  type CallReason,
  type PageTimingReport as PageTimingReportV1,
  type TutorRuntime,
} from "./runtime.ts";

/** One tool the tutor ran inside a model call. All times are relative to the call's own start. */
export interface ToolTiming {
  name: string;
  /** When the tool started, in ms after the call began. */
  startMs: number;
  /** How long the tool took, in ms. */
  ms: number;
  /** False when the runtime reported an error. */
  ok: boolean;
  /** True only when the name or the shell command identifiably names the learning engine. */
  engine: boolean;
}

/** A model call with the tools it ran and the model time that is not inside any of them. */
export interface CallTiming {
  n: number;
  reason: CallReason;
  inputChars: number;
  outputChars: number;
  ms: number;
  ok: boolean;
  tools: ToolTiming[];
  /** Time before the first tool, between tools and after the last one, with no tool running. */
  modelMs: number;
}

/** Version 2 keeps every version-1 field and adds the tool breakdown and its aggregates. */
export interface PageTimingReport extends Omit<PageTimingReportV1, "version" | "calls"> {
  version: 2;
  calls: CallTiming[];
  toolCount: number;
  toolMs: number;
  modelGapMs: number;
  engineRoundTrips: number;
}

/** The tools the bridge registers for the engine, by their exact names. */
const ENGINE_TOOLS = new Set(["learning_stage", "learning_view"]);
/** Shell tools whose command arguments may name the engine executable. */
const SHELL_TOOLS = new Set(["bash", "sh", "shell", "exec", "exec_command", "run_command", "execute_command", "terminal", "cmd"]);
/** The argument that carries the command, across Pi's and Antigravity's tool shapes (case-insensitive). */
const COMMAND_ARGS = new Set(["command", "cmd", "commandline", "command_line"]);
/**
 * An engine invocation at the start of a command (or of a command after a shell separator), with an
 * optional sudo/env prefix. A mention of "learning" in other words or in another argument's text is
 * not an invocation: a round-trip is counted from what the tool name and command actually say.
 */
const ENGINE_COMMAND = new RegExp(
  String.raw`(?:^|[;&|]{1,2}\s*|\$\(\s*|\x60\s*)(?:(?:sudo|env(?:\s+[A-Za-z_][\w.-]*=[^\s;&|]+)*)\s+)?(?:(?:\.?[/\\])?(?:[\w.~-]+[/\\])*bin[/\\]|\.?[/\\]?)learning(?=$|[\s;&|)])`,
);

/**
 * Time covered by tool executions, counting an overlap once and clipping to the call. Two tools
 * running together cost the call the longer span, not the sum of their durations; the rest of the
 * call is model time with no tool running.
 */
function toolUnionMs(tools: ToolTiming[], callMs: number): number {
  const spans = tools
    .map((tool) => [Math.max(0, tool.startMs), Math.max(0, Math.min(tool.startMs + tool.ms, callMs))] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let covered = 0;
  let end = 0;
  for (const [start, stop] of spans) {
    if (stop <= end) continue;
    covered += stop - Math.max(start, end);
    end = stop;
  }
  return covered;
}

/** Count an engine round-trip only for a named engine tool or an explicit shell invocation. */
export function isEngineTool(name: string, args: unknown): boolean {
  const tool = name.toLowerCase();
  if (ENGINE_TOOLS.has(tool)) return true;
  if (!SHELL_TOOLS.has(tool) || args === null || typeof args !== "object" || Array.isArray(args)) return false;
  const fields = args as Record<string, unknown>;
  return Object.entries(fields).some(([key, value]) =>
    COMMAND_ARGS.has(key.toLowerCase()) && typeof value === "string" && ENGINE_COMMAND.test(value));
}

export function createPageTiming(start: {
  runtime: TutorRuntime;
  model: string;
  topic: string | null;
  /** Read once per mark; a test drives them instead of waiting. */
  now?: () => number;
}) {
  const base = createBasePageTiming(start);
  const now = start.now ?? Date.now;
  type OpenTool = { name: string; at: number; call: number; callAt: number; engine: boolean };
  /** Raw tool records, kept per call so a correction never borrows the first call's events. */
  const byCall: ToolTiming[][] = [];
  let openTools = new Map<string, OpenTool>();
  let callAt = 0;
  let active = -1;

  const finishOne = (id: string, ok: boolean, at: number) => {
    const tool = openTools.get(id);
    if (!tool) return;
    openTools.delete(id);
    const record = byCall[tool.call] ?? (byCall[tool.call] = []);
    record.push({
      name: tool.name,
      startMs: Math.max(0, Math.min(tool.at - tool.callAt, Math.max(0, at - tool.callAt))),
      ms: Math.max(0, at - tool.at),
      ok,
      engine: tool.engine,
    });
  };
  const finish = (ok: boolean, at: number) => {
    for (const id of [...openTools.keys()]) finishOne(id, ok, at);
  };

  return {
    /** The phase and call clocks are the ones #242 wrote, unchanged. */
    async measure<T>(name: string, work: () => T | Promise<T>): Promise<T> {
      return base.measure(name, work);
    },
    startCall(reason: CallReason, inputChars: number) {
      // A prompt that replaces an unanswered one closes its tools at the point it was interrupted.
      finish(false, now());
      base.startCall(reason, inputChars);
      callAt = now();
      active = byCall.length;
      byCall.push([]);
      openTools = new Map();
    },
    addOutput(chars: number) {
      base.addOutput(chars);
    },
    endCall(ok: boolean) {
      finish(ok, now());
      base.endCall(ok);
      active = -1;
    },
    /** A runtime's tool has begun: remember where in this call it began. */
    startTool(id: string | number, name: string, args?: unknown) {
      if (active < 0) return;
      const key = String(id);
      const at = now();
      if (openTools.has(key)) finishOne(key, false, at);
      openTools.set(key, { name, at, call: active, callAt, engine: isEngineTool(name, args) });
    },
    /** The same tool ended; an absent start cannot invent a duration. */
    endTool(id: string | number, ok: boolean) {
      finishOne(String(id), ok, now());
    },
    /** The same report as before, plus the tool breakdown; every old field keeps its meaning. */
    report(parts: Array<{ path: string; bytes: number }>): PageTimingReport {
      finish(false, now());
      const baseReport = base.report(parts);
      const calls: CallTiming[] = baseReport.calls.map((call, index) => {
        const tools = (byCall[index] ?? []).map((tool) => ({ ...tool }));
        const covered = toolUnionMs(tools, call.ms);
        // The gap is the complement of the covered time, so the two always add back up to the call.
        return { ...call, tools, modelMs: Math.max(0, call.ms - covered) };
      });
      const toolCount = calls.reduce((total, call) => total + call.tools.length, 0);
      const toolMs = calls.reduce((total, call) => total + toolUnionMs(call.tools, call.ms), 0);
      const modelGapMs = calls.reduce((total, call) => total + call.modelMs, 0);
      const engineRoundTrips = calls.reduce((total, call) => total + call.tools.filter((tool) => tool.engine).length, 0);
      return { ...baseReport, version: 2, calls, toolCount, toolMs, modelGapMs, engineRoundTrips };
    },
  };
}

export type PageTiming = ReturnType<typeof createPageTiming>;
