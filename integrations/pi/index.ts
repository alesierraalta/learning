/**
 * Project-scoped Pi adapter for the Go learning engine.
 *
 * Transport and local activation only. The engine owns learning rules,
 * validation, recorded reviews and completion; this adapter never decides a PASS.
 * Activation happens inside the configured Learnings root only: the chat
 * enrolls a topic through the learning_stage tool (init/start) once the
 * learner chooses deep mode, or the learner uses /learning — no global prompt
 * injection, no conceptual-mode gate.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { execFile as execFileCb } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFileCb);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

/** Canonical Obsidian vault folder (S1): notes/04-RECURSOS/Learnings (plural on disk). */
export const CANONICAL_LEARNINGS_ROOT =
  "/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings";

const ENTRY_TYPE = "gentle-learning/enrollment";
const GATE_TYPE = "gentle-learning/settle-gate";
const ENGINE_TIMEOUT_MS = 120_000;
const MAX_CORRECTIONS = 2;
const PASS_STATUSES = new Set(["accepted", "completed", "waiting", "skipped"]);
const CHECK_STATUSES = new Set(["PASS", "FAIL", "SKIP"]);

export interface AdapterDeps {
  root: string;
  enginePath: string;
  rulesPath: string;
  execFile: (
    file: string,
    args: string[],
    opts: { cwd: string; timeoutMs: number },
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
}

export function defaultDeps(): Omit<AdapterDeps, "execFile"> {
  return {
    root: (process.env.LEARNING_ROOT ?? "").trim() || CANONICAL_LEARNINGS_ROOT,
    enginePath: join(REPO_ROOT, "bin", "learning"),
    rulesPath: join(REPO_ROOT, "rules", "deep.json"),
  };
}

async function defaultExecFile(
  file: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const out = await execFileP(file, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });
    return { code: 0, stdout: out.stdout, stderr: out.stderr };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (error.code === "ENOENT") {
      const spawnError = new Error(`spawn ${file} ENOENT`) as Error & { spawnEnoent?: boolean };
      spawnError.spawnEnoent = true;
      throw spawnError;
    }
    if (typeof error.code === "number") {
      return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
    throw error;
  }
}

export interface EngineReport {
  status: string;
  stage?: string;
  nextStage?: string;
  checks?: Array<{ id: string; kind?: string; status: string; reason?: string }>;
  [key: string]: unknown;
}

type ParsedReport = { ok: true; report: EngineReport } | { ok: false; detail: string };

/** Strict JSON boundary: stdout must be exactly one well-formed report object. */
export function parseReport(stdout: string): ParsedReport {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return { ok: false, detail: "stdout is not exactly one JSON object" };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, detail: "engine output is not a JSON object" };
  }
  const report = raw as Record<string, unknown>;
  if (typeof report.status !== "string") {
    return { ok: false, detail: "report has no string status" };
  }
  if (report.checks !== undefined) {
    if (!Array.isArray(report.checks)) {
      return { ok: false, detail: "report checks is not an array" };
    }
    for (const entry of report.checks) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return { ok: false, detail: "check entry is not an object" };
      }
      const check = entry as Record<string, unknown>;
      if (typeof check.id !== "string") {
        return { ok: false, detail: "check entry has no string id" };
      }
      if (typeof check.status !== "string" || !CHECK_STATUSES.has(check.status)) {
        return { ok: false, detail: `check ${String(check.id)} has an invalid status` };
      }
      if (check.reason !== undefined && typeof check.reason !== "string") {
        return { ok: false, detail: `check ${check.id} reason is not a string` };
      }
    }
  }
  return { ok: true, report: report as EngineReport };
}

export type EngineOutcome =
  | { ok: true; report: EngineReport; code: number }
  | { ok: false; reason: "binary-missing" | "operational" | "malformed"; detail: string };

export async function callEngine(
  deps: AdapterDeps,
  command: "init" | "validate" | "advance" | "status" | "review",
  target: {
    root: string;
    workspace: string;
    stage?: string;
    rule?: string;
    verdict?: string;
    reason?: string;
    reviewer?: string;
  },
): Promise<EngineOutcome> {
  if (!existsSync(deps.enginePath)) {
    return {
      ok: false,
      reason: "binary-missing",
      detail:
        `engine binary not found at ${deps.enginePath}; ` +
        "build it with: go build -o bin/learning ./cmd/learning",
    };
  }
  const argv = [
    command,
    "--root",
    target.root,
    "--workspace",
    target.workspace,
    "--rules",
    deps.rulesPath,
    "--mode",
    "deep",
  ];
  if (target.stage) {
    argv.push("--stage", target.stage);
  }
  if (command === "review") {
    argv.push("--rule", target.rule ?? "", "--verdict", target.verdict ?? "", "--reason", target.reason ?? "");
    if (target.reviewer) {
      argv.push("--reviewer", target.reviewer);
    }
  }
  argv.push("--json");

  let outcome: { code: number; stdout: string; stderr: string };
  try {
    outcome = await deps.execFile(deps.enginePath, argv, {
      cwd: target.workspace,
      timeoutMs: ENGINE_TIMEOUT_MS,
    });
  } catch (err) {
    const error = err as Error & { spawnEnoent?: boolean };
    return error.spawnEnoent
      ? { ok: false, reason: "binary-missing", detail: error.message }
      : { ok: false, reason: "operational", detail: error.message };
  }

  const parsed = parseReport(outcome.stdout);
  if (!parsed.ok) {
    return { ok: false, reason: "malformed", detail: `exit ${outcome.code}: ${parsed.detail}` };
  }
  return { ok: true, report: parsed.report, code: outcome.code };
}

function resolveContained(
  root: string,
  target: string,
): { ok: true; rootReal: string; targetReal: string } | { ok: false; reason: string } {
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return { ok: false, reason: `configured Learnings root unavailable: ${root}` };
  }
  let targetReal: string;
  try {
    targetReal = realpathSync(target);
  } catch {
    return { ok: false, reason: `workspace does not exist: ${target}` };
  }
  const rel = relative(rootReal, targetReal);
  const outside = rel === ".." || rel.startsWith(`..${sep}`);
  if (outside || isAbsolute(rel)) {
    return { ok: false, reason: `workspace escapes the Learnings root: ${targetReal} is not inside ${rootReal}` };
  }
  return { ok: true, rootReal, targetReal };
}

interface AdapterState {
  phase: "inactive" | "active" | "compromised";
  root?: string;
  workspace?: string;
  compromiseReason?: string;
  corrections: number;
}

/** A topic is one folder directly under the Learnings root. */
function safeTopic(topic: unknown): topic is string {
  return typeof topic === "string" && topic !== "" && topic !== "." && topic !== ".." && !/[\\/\0]/.test(topic);
}

const inactiveState = (): AdapterState => ({ phase: "inactive", corrections: 0 });

function failCheckIds(report: EngineReport): string[] {
  return (report.checks ?? []).filter((check) => check.status === "FAIL").map((check) => check.id);
}

function failureContent(report: EngineReport): string {
  const lines = [
    "Learning gate: engine validation failed before settle.",
    `status: ${report.status} | stage: ${report.stage ?? "-"} | next: ${report.nextStage ?? "-"}`,
  ];
  const fails = (report.checks ?? []).filter((check) => check.status === "FAIL");
  for (const check of fails.slice(0, 5)) {
    lines.push(`FAIL ${check.id}: ${check.reason ?? ""}`);
  }
  if (fails.length > 5) {
    lines.push(`+${fails.length - 5} more FAIL checks`);
  }
  lines.push(
    "The work is not complete; engine status is the authority. " +
      "Fix the listed checks, then use the learning_stage tool (validate, then advance with an explicit stage).",
  );
  return lines.join("\n");
}

function blockedContent(reason: string): string {
  return [
    `Learning gate: blocked — ${reason}`,
    "No continuation was requested; engine status is the authority and this work must not be treated as complete.",
  ].join("\n");
}

export default function learningPiExtension(pi: ExtensionAPI, overrides: Partial<AdapterDeps> = {}) {
  const deps: AdapterDeps = { ...defaultDeps(), execFile: defaultExecFile, ...overrides };
  let state: AdapterState = inactiveState();

  const engineTarget = () => ({ root: state.root!, workspace: state.workspace! });

  const enrollWorkspace = (target: string, cwd: string): { ok: true } | { ok: false; reason: string } => {
    const sessionScope = resolveContained(deps.root, cwd);
    if (!sessionScope.ok) {
      return { ok: false, reason: `session cwd is outside Learnings or unavailable — ${sessionScope.reason}` };
    }
    const contained = resolveContained(deps.root, target);
    if (!contained.ok) {
      return { ok: false, reason: contained.reason };
    }
    state = { phase: "active", root: contained.rootReal, workspace: contained.targetReal, corrections: 0 };
    pi.appendEntry(ENTRY_TYPE, {
      version: 1,
      active: true,
      root: contained.rootReal,
      workspace: contained.targetReal,
      enrolledAt: new Date().toISOString(),
    });
    return { ok: true };
  };

  const activate = (workspaceArg: string, ctx: { cwd: string; ui: { notify: (m: string, l?: string) => void } }): boolean => {
    const enrolled = enrollWorkspace(workspaceArg || ctx.cwd, ctx.cwd);
    if (!enrolled.ok) {
      ctx.ui.notify(`Learning start rejected: ${enrolled.reason}`, "warning");
    }
    return enrolled.ok;
  };

  const restore = (branch: unknown[]): void => {
    let enrollment: { type?: string; customType?: string; data?: unknown } | undefined;
    for (const entry of branch) {
      const candidate = entry as { type?: string; customType?: string } | null;
      if (candidate && candidate.type === "custom" && candidate.customType === ENTRY_TYPE) {
        enrollment = entry as { type?: string; customType?: string; data?: unknown };
      }
    }
    if (!enrollment) {
      state = inactiveState();
      return;
    }
    const data = enrollment.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object" || typeof data.active !== "boolean") {
      state = { phase: "compromised", compromiseReason: "malformed enrollment record", corrections: 0 };
      return;
    }
    if (!data.active) {
      state = inactiveState();
      return;
    }
    if (typeof data.workspace !== "string" || data.workspace === "") {
      state = { phase: "compromised", compromiseReason: "enrollment record has no workspace", corrections: 0 };
      return;
    }
    const contained = resolveContained(deps.root, data.workspace);
    if (!contained.ok) {
      state = { phase: "compromised", compromiseReason: contained.reason, corrections: 0 };
      return;
    }
    state = { phase: "active", root: contained.rootReal, workspace: contained.targetReal, corrections: 0 };
  };

  const describeOutcome = (command: string, outcome: EngineOutcome): { message: string; level: "info" | "warning" } => {
    if (!outcome.ok) {
      return { message: `Learning ${command} failed: ${outcome.reason} — ${outcome.detail}`, level: "warning" };
    }
    const fails = failCheckIds(outcome.report);
    const stage = outcome.report.stage ? ` (stage ${outcome.report.stage})` : "";
    const failSuffix = fails.length ? ` | FAIL ${fails.join(", ")}` : "";
    const healthy = PASS_STATUSES.has(outcome.report.status) && fails.length === 0;
    return {
      message: `Learning ${command}: engine status ${outcome.report.status}${stage}${failSuffix} — engine status is authority`,
      level: healthy ? "info" : "warning",
    };
  };

  pi.on("session_start", (_event, ctx) => {
    if (!resolveContained(deps.root, ctx.cwd).ok) {
      state = inactiveState();
      return;
    }
    let branch: unknown[] = [];
    try {
      branch = ctx.sessionManager.getBranch() as unknown[];
    } catch (err) {
      state = {
        phase: "compromised",
        compromiseReason: `could not read session branch: ${(err as Error).message}`,
        corrections: 0,
      };
      return;
    }
    restore(branch);
  });

  pi.on("input", () => {
    state.corrections = 0;
  });

  pi.on("agent_before_settle", async (_event, ctx) => {
    if (!resolveContained(deps.root, ctx.cwd).ok) return undefined;
    if (state.phase === "inactive") {
      return undefined;
    }
    if (state.phase === "compromised") {
      return { entries: [{ type: "custom_message", customType: GATE_TYPE, display: true, content: blockedContent(state.compromiseReason ?? "invalid enrollment") }] };
    }
    const outcome = await callEngine(deps, "status", engineTarget());
    if (!outcome.ok) {
      return {
        entries: [
          {
            type: "custom_message",
            customType: GATE_TYPE,
            display: true,
            content: blockedContent(`engine unavailable: ${outcome.reason} — ${outcome.detail}`),
          },
        ],
      };
    }
    const fails = failCheckIds(outcome.report);
    const passing = PASS_STATUSES.has(outcome.report.status) && fails.length === 0;
    // event.context.canContinue is computed before this handler adds its own
    // message, so it is false at a normal end of turn; Pi re-evaluates it after
    // the gate's custom message. Only the correction budget bounds the gate.
    // Parts without pauses: an unwritten explanation is owed by the chat, not
    // by the learner, so the turn does not end before the part exists.
    if (passing && outcome.report.nextStage === "explanation" && outcome.report.status !== "waiting") {
      if (state.corrections < MAX_CORRECTIONS) {
        state.corrections += 1;
        return {
          entries: [
            {
              type: "custom_message",
              customType: GATE_TYPE,
              display: true,
              content:
                `Learning engine: part ${outcome.report.part ?? ""} is the next stage and is not written yet. ` +
                "Write its explanation note now (run the builder in the foreground and wait for it), link it in the index, " +
                "validate and advance explanation, then present it to the learner. Do not end the turn before the part exists.",
            },
          ],
          continue: true,
        };
      }
      return undefined;
    }
    if (passing) {
      state.corrections = 0;
      return undefined;
    }
    if (state.corrections < MAX_CORRECTIONS) {
      state.corrections += 1;
      return {
        entries: [{ type: "custom_message", customType: GATE_TYPE, display: true, content: failureContent(outcome.report) }],
        continue: true,
      };
    }
    return {
      entries: [
        {
          type: "custom_message",
          customType: GATE_TYPE,
          display: true,
          content:
            failureContent(outcome.report) +
            "\nBlocked: correction budget exhausted.",
        },
      ],
    };
  });

  pi.registerCommand("learning", {
    description:
      "Deep learning sessions: /learning <start|init|stop|status> [workspace]. start/init enroll explicitly (deep mode only, both session cwd and workspace inside the Learnings root); the engine report decides completion.",
    handler: async (args, ctx) => {
      const [subcommand = "", ...rest] = args.trim().split(/\s+/);
      const workspaceArg = rest.join(" ");

      if (subcommand === "start" || subcommand === "init") {
        if (!activate(workspaceArg, ctx)) return;
        const engineCommand = subcommand === "init" ? "init" : "status";
        const outcome = await callEngine(deps, engineCommand, engineTarget());
        const { message, level } = describeOutcome(engineCommand, outcome);
        ctx.ui.notify(message, level);
        return;
      }

      if (subcommand === "stop") {
        if (state.phase === "inactive") {
          ctx.ui.notify("Learning: no active deep session.", "info");
          return;
        }
        state = inactiveState();
        pi.appendEntry(ENTRY_TYPE, { version: 1, active: false, enrolledAt: new Date().toISOString() });
        ctx.ui.notify("Learning deep session stopped.", "info");
        return;
      }

      if (subcommand === "status") {
        if (state.phase !== "active" || !resolveContained(deps.root, ctx.cwd).ok) {
          ctx.ui.notify("Learning: no active deep session (use /learning start).", "warning");
          return;
        }
        const outcome = await callEngine(deps, "status", engineTarget());
        const { message, level } = describeOutcome("status", outcome);
        ctx.ui.notify(message, level);
        return;
      }

      ctx.ui.notify("Usage: /learning <start|init|stop|status> [workspace]", "warning");
    },
  });

  const adapterError = (reason: string, detail: string) => {
    const payload = { source: "adapter", status: "error", reason, detail };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      details: payload,
      structuredContent: payload as Record<string, unknown>,
      isError: true,
    };
  };

  pi.registerTool({
    name: "learning_stage",
    label: "Learning engine stage",
    description:
      "Transport one stage operation (init, start, validate, advance, status, review) to the Go learning engine via its CLI and return the single-JSON report. " +
      "init enrolls a new topic (creates its folder under the Learnings root and records a new run); start resumes an existing topic; both take topic = the folder name and activate the deep session, so the learner never types a command. The other actions require an active deep session. validate lists pendingReviews (rules whose recorded review is missing or stale); the chat (possibly via subagents) evaluates the rubric on the artifact and context, then records the verdict with action review (stage, rule, verdict, reason, optional reviewer). advance needs an explicit stage and blocks while any required review is missing, stale or a gate verdict is FAIL. " +
      "The engine report is the authority on completion; a FAIL check means the work is not finished.",
    promptSnippet: "Run a learning-engine stage operation and read its JSON verdict",
    promptGuidelines: [
      "Once the learner chooses the deep (university) mode, enroll the topic yourself: init for a new topic, start to resume one; never ask the learner to type a command.",
      "Stage actions are only meaningful inside an active deep learning session; inactive sessions return an error.",
      "Never claim a stage or the topic is complete while the engine report shows FAIL, blocked or error.",
      "When validate returns pendingReviews, evaluate each rubric against the listed artifact and context (delegate to a subagent if useful) and record one review per rule before advancing.",
    ],
    // SAFETY: plain JSON Schema object; the host only reads it as a TypeBox-compatible schema.
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["init", "start", "validate", "advance", "status", "review"],
          description:
            "init: create and enroll a new topic folder, record a new run; start: enroll an existing topic and read its status; validate: check a stage without recording (returns pendingReviews); advance: validate + require recorded reviews + record; status: re-read engine state; review: record one chat verdict for one rubric.",
        },
        stage: {
          type: "string",
          description: "Engine stage name as defined in docs/protocol.md; required for advance and review.",
        },
        rule: { type: "string", description: "Rubric rule id; required for review (pendingReviews entry)." },
        verdict: {
          type: "string",
          enum: ["PASS", "FAIL"],
          description: "Recorded verdict for review: PASS or FAIL per the rubric's instruction wording.",
        },
        reason: { type: "string", description: "Non-empty evaluation reason; required for review." },
        reviewer: { type: "string", description: "Optional reviewer identity for review (defaults to chat)." },
        topic: {
          type: "string",
          description: "Topic folder name directly under the Learnings root (no path separators); required for init and start.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    } as unknown as TSchema,
    // SAFETY: open JSON Schema object, read by the host as a TypeBox-compatible schema.
    outputSchema: { type: "object", additionalProperties: true } as unknown as TSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { action: requested, topic } = params as { action?: string; topic?: unknown };
      if (requested === "init" || requested === "start") {
        if (!safeTopic(topic)) {
          return adapterError(
            "invalid-arguments",
            `${requested} requires topic: one folder name under the Learnings root, got ${JSON.stringify(topic ?? "")}`,
          );
        }
        const session = resolveContained(deps.root, ctx.cwd);
        if (!session.ok) {
          return adapterError("out-of-scope", `session cwd is outside Learnings or unavailable — ${session.reason}`);
        }
        const target = join(session.rootReal, topic);
        if (requested === "start" && !existsSync(target)) {
          return adapterError("not-found", `topic ${topic} does not exist under the Learnings root; use init for a new topic`);
        }
        if (requested === "init") {
          mkdirSync(target, { recursive: true });
        }
        const enrolled = enrollWorkspace(target, ctx.cwd);
        if (!enrolled.ok) {
          return adapterError("out-of-scope", enrolled.reason);
        }
        const enrollOutcome = await callEngine(deps, requested === "init" ? "init" : "status", engineTarget());
        if (!enrollOutcome.ok) {
          return adapterError(enrollOutcome.reason, enrollOutcome.detail);
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(enrollOutcome.report, null, 2) }],
          details: { command: requested, exitCode: enrollOutcome.code },
          // SAFETY: parseReport only admits a single JSON object, so the report is a plain record.
          structuredContent: enrollOutcome.report as unknown as Record<string, unknown>,
          isError: enrollOutcome.code !== 0,
        };
      }
      if (state.phase !== "active" || !resolveContained(deps.root, ctx.cwd).ok) {
        return adapterError(
          "inactive",
          "no active deep session; enroll the topic first with action init or start inside the Learnings root",
        );
      }
      const {
        action,
        stage,
        rule,
        verdict,
        reason,
        reviewer,
      } = params as {
        action?: string;
        stage?: string;
        rule?: string;
        verdict?: string;
        reason?: string;
        reviewer?: string;
      };
      if (action !== "validate" && action !== "advance" && action !== "status" && action !== "review") {
        return adapterError("invalid-arguments", `unknown action: ${String(action)}`);
      }
      if (action === "advance" && !stage) {
        return adapterError("invalid-arguments", "advance requires an explicit stage");
      }
      if (action === "review") {
        const missing = [
          !stage && "stage",
          !rule && "rule",
          !verdict && "verdict",
          !reason && "reason",
        ].filter(Boolean);
        if (missing.length > 0) {
          return adapterError("invalid-arguments", `review requires ${missing.join(", ")}`);
        }
      }
      const outcome = await callEngine(deps, action, { ...engineTarget(), stage, rule, verdict, reason, reviewer });
      if (!outcome.ok) {
        return adapterError(outcome.reason, outcome.detail);
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(outcome.report, null, 2) }],
        details: { command: action, exitCode: outcome.code },
        // SAFETY: parseReport only admits a single JSON object, so the report is a plain record.
        structuredContent: outcome.report as unknown as Record<string, unknown>,
        isError: outcome.code !== 0,
      };
    },
  });
}
