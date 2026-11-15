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
import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { execFile as execFileCb } from "node:child_process";
import { constants as fsConstants, copyFileSync, existsSync, lstatSync, mkdirSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { registerBridge } from "./bridge.ts";
import { MAX_CORRECTIONS, PASS_STATUSES, failCheckIds } from "./gate-rules.ts";
import { resolveContained, safeTopic } from "./paths.ts";

const execFileP = promisify(execFileCb);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const ENTRY_TYPE = "gentle-learning/enrollment";
const GATE_TYPE = "gentle-learning/settle-gate";
const ENGINE_TIMEOUT_MS = 120_000;
const MAX_UPLOADED_PDF_PAGE_IMAGES = 20;
const CHECK_STATUSES = new Set(["PASS", "FAIL", "SKIP"]);
/** Topic files only an enrolled run may hold: the plan and the diagnosis. */
const ENROLLED_FILES = new Set(["plan.json", "quiz.json"]);
/**
 * What the studio's page answers for the tutor: the study mode is asked there, before the turn
 * exists, and it travels in the prompt. Inside the studio this rule rides along with Pi's own
 * instructions, so the tutor never asks the mode nor picks it alone.
 *
 * A concept question is not a request for a new topic: it is answered in the chat, in the same
 * shape the parts use. Only asking to study a whole new topic points at the page's entry.
 */
const STUDIO_MODE_RULE = [
  "Learnings studio: the learner chooses the study mode (rápido or universitario) in the page's «Aprender algo nuevo» entry, and the prompt of the turn carries that choice.",
  "A concept question in the chat («¿qué es la varianza?», «¿qué significa varianza finita?») is answered right there: one line of definition, the topic's running example when the chat is about a part or a topic, and one visual when it helps (a small lk-scene or an annotated formula). Answer it without creating files and without running commands.",
  "«Aprender algo nuevo» is offered only when the learner asks to study a whole new topic («quiero aprender X», «enséñame un tema nuevo»): then answer in one line pointing to that entry and create nothing.",
  "Never choose the mode yourself and never ask for it.",
].join(" ");

export interface AdapterDeps {
  root: string;
  enginePath: string;
  rulesPath: string;
  /**
   * Who owns the settle rule. `extension` is a standalone Pi session, where this adapter asks the
   * engine and asks Pi to continue. `studio` is a Pi session the studio drives, where corrections
   * belong to the studio: a failing stage is not re-prompted here, while the stage pushes stay the
   * tutor's, reading the one engine report this mode still asks for.
   */
  settleGate: "extension" | "studio";
  execFile: (
    file: string,
    args: string[],
    opts: { cwd: string; timeoutMs: number },
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
}

export function defaultDeps(): Omit<AdapterDeps, "execFile"> {
  return {
    root: (process.env.LEARNING_ROOT ?? "").trim(),
    enginePath: join(REPO_ROOT, "bin", "learning"),
    rulesPath: join(REPO_ROOT, "rules", "deep.json"),
    // The studio starts its Pi child with this flag; a terminal session never sets it.
    settleGate: process.env.LEARNING_SETTLE_GATE === "studio" ? "studio" : "extension",
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

type SourceCopy = { from: string; name: string };
type SourceValidation =
  | { ok: true; copies: SourceCopy[]; examSource?: string }
  | { ok: false; detail: string };

function validateUploadedSources(root: string, rawSources: unknown, rawExamSource: unknown): SourceValidation {
  if (rawExamSource !== undefined && (typeof rawExamSource !== "string" || rawExamSource.trim() === "")) {
    return { ok: false, detail: "examSource must be a non-empty path" };
  }
  const sources = rawSources === undefined ? [] : rawSources;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 5) {
    if (rawSources !== undefined) return { ok: false, detail: "sources must contain 1 to 5 absolute uploaded file paths" };
    if (rawExamSource !== undefined) return { ok: false, detail: "examSource must be one of sources" };
    return { ok: true, copies: [] };
  }
  if (rawExamSource !== undefined && !sources.includes(rawExamSource)) {
    return { ok: false, detail: "examSource must be one of sources" };
  }
  if (sources.some((source) => typeof source !== "string" || !isAbsolute(source))) {
    return { ok: false, detail: "sources entries must be absolute paths" };
  }

  const rootContained = resolveContained(root, root);
  if (!rootContained.ok) return { ok: false, detail: rootContained.reason };
  const uploadedPath = join(rootContained.rootReal, ".subidas");
  const uploadedRoot = resolveContained(root, uploadedPath);
  if (!uploadedRoot.ok || uploadedRoot.targetReal !== uploadedPath) {
    return { ok: false, detail: `source is not an uploaded file under .subidas: ${String(sources[0])}` };
  }
  try {
    if (!statSync(uploadedRoot.targetReal).isDirectory()) {
      return { ok: false, detail: `source is not an uploaded file under .subidas: ${String(sources[0])}` };
    }
  } catch {
    return { ok: false, detail: `source is not an uploaded file under .subidas: ${String(sources[0])}` };
  }

  const copies: SourceCopy[] = [];
  const names = new Set<string>();
  let examName: string | undefined;
  const resolveUploadFile = (path: string): { from: string; name: string } | null => {
    const contained = resolveContained(root, path);
    if (!contained.ok) return null;
    const rel = relative(uploadedRoot.targetReal, contained.targetReal);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    try {
      if (!statSync(contained.targetReal).isFile()) return null;
    } catch {
      return null;
    }
    return { from: contained.targetReal, name: basename(path) };
  };
  const addCopy = (copy: SourceCopy): boolean => {
    const key = copy.name.toLowerCase();
    if (names.has(key)) return false;
    names.add(key);
    copies.push(copy);
    return true;
  };

  for (const source of sources as string[]) {
    const file = resolveUploadFile(source);
    if (!file) return { ok: false, detail: `source is not an uploaded file under .subidas: ${source}` };
    if (!addCopy(file)) return { ok: false, detail: `sources contain duplicate filenames: ${file.name}` };
    if (source === rawExamSource) examName = file.name;
    if (extname(file.name).toLowerCase() === ".pdf") {
      const textPath = `${source}.txt`;
      const textFile = resolveUploadFile(textPath);
      if (!textFile) return { ok: false, detail: `PDF source is missing its extracted .txt sibling: ${source}` };
      if (!addCopy(textFile)) return { ok: false, detail: `sources contain duplicate filenames: ${textFile.name}` };
      const pageNumbers: number[] = [];
      for (let page = 1; page <= MAX_UPLOADED_PDF_PAGE_IMAGES; page++) {
        const pagePath = `${source}.p${page}.png`;
        try {
          lstatSync(pagePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          return { ok: false, detail: `PDF source page image is unavailable: ${pagePath}` };
        }
        const pageFile = resolveUploadFile(pagePath);
        if (!pageFile) return { ok: false, detail: `PDF source page image is not an uploaded file: ${pagePath}` };
        if (!addCopy(pageFile)) return { ok: false, detail: `sources contain duplicate filenames: ${pageFile.name}` };
        pageNumbers.push(page);
      }
      if (pageNumbers.some((page, index) => page !== index + 1)) {
        return { ok: false, detail: `PDF source has non-contiguous page images: ${source}` };
      }
    }
  }
  return { ok: true, copies, ...(examName ? { examSource: `fuentes/${examName}` } : {}) };
}

function rollbackInitSources(workspace: string, fuentesPath: string, createdFuentes: boolean, createdTopic: boolean, copied: string[]): void {
  for (const path of copied) {
    try { unlinkSync(path); } catch { /* best-effort rollback of files copied by this init */ }
  }
  if (createdFuentes) {
    try { rmdirSync(fuentesPath); } catch { /* preserve any unrelated files */ }
  }
  if (createdTopic) {
    try { rmdirSync(workspace); } catch { /* preserve any engine or concurrent output */ }
  }
}

export type EngineOutcome =
  | { ok: true; report: EngineReport; code: number }
  | { ok: false; reason: "binary-missing" | "operational" | "malformed"; detail: string };

export async function callEngine(
  deps: AdapterDeps,
  command: "init" | "validate" | "advance" | "status" | "review" | "method",
  target: {
    root: string;
    workspace: string;
    scope?: string;
    exam?: string;
    practice?: string;
    examSource?: string;
    method?: string;
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
  if (target.scope) {
    argv.push("--scope", target.scope);
  }
  if (target.exam !== undefined) {
    argv.push("--exam", target.exam);
  }
  if (target.practice !== undefined) {
    argv.push("--practice", target.practice);
  }
  if (target.examSource !== undefined) {
    argv.push("--exam-source", target.examSource);
  }
  if (target.stage) {
    argv.push("--stage", target.stage);
  }
  if (command === "method") {
    argv.push("--method", target.method ?? "");
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

interface AdapterState {
  phase: "inactive" | "active" | "compromised";
  root?: string;
  workspace?: string;
  compromiseReason?: string;
  corrections: number;
  /** The stage the settle gate last pushed the chat into; its budget resets on a new stage. */
  pushedStage?: string;
}

const inactiveState = (): AdapterState => ({ phase: "inactive", corrections: 0 });

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
  registerBridge(pi, { root: deps.root });

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

  // T2: inside the studio the mode belongs to the page, so its rule travels with Pi's instructions.
  // A terminal session keeps its own instructions untouched.
  pi.on("before_agent_start", (event) => {
    if (deps.settleGate !== "studio") return undefined;
    return { systemPrompt: `${event.systemPrompt}\n\n${STUDIO_MODE_RULE}` };
  });

  // S1: a topic exists for the engine only once it is enrolled. Its plan and diagnosis written
  // around the engine would leave it untracked ("sin seguimiento del motor"), so they are refused.
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
    const path = (event.input as { path?: unknown }).path;
    if (typeof path !== "string") return undefined;
    const inRoot = relative(resolve(deps.root), resolve(ctx.cwd, path));
    if (inRoot === "" || inRoot.startsWith("..") || isAbsolute(inRoot)) return undefined;
    const [topic, file, ...rest] = inRoot.split(/[\\/]+/);
    if (rest.length > 0 || !ENROLLED_FILES.has(file ?? "") || topic === "rapidos" || !safeTopic(topic)) return undefined;
    if (existsSync(join(deps.root, topic, ".learning", "state.json"))) return undefined;
    return {
      block: true,
      reason:
        `Topic ${topic} is not enrolled in the learning engine. Enroll it first with learning_stage action init (topic=${topic}), ` +
        `then write ${file}: the engine tracks the plan and the diagnosis of enrolled topics only.`,
    };
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
    // S3: inside the studio a failing stage belongs to the studio gate, for every runtime, so this
    // adapter ends the turn instead of correcting it. Only that branch is surrendered: the report
    // read above is what drives the stage pushes, and they stay the tutor's until the page owns them.
    if (!passing && deps.settleGate === "studio") return undefined;
    // The strict flow chains method → planning → part 1 without a learner prompt. The push
    // budget belongs to the stage it pushes, so each stage stays bounded and the chain goes on.
    const push = (stage: string) => {
      if (state.pushedStage !== stage) {
        state.pushedStage = stage;
        state.corrections = 0;
      }
      if (state.corrections >= MAX_CORRECTIONS) return false;
      state.corrections += 1;
      return true;
    };
    if (passing && outcome.report.nextStage === "method" && outcome.report.status !== "waiting") {
      // The studio's page asks the method now, for every runtime: the adapter must not ask it twice.
      if (deps.settleGate === "studio") return undefined;
      if (!push("method")) return undefined;
      return {
        entries: [{
          type: "custom_message",
          customType: GATE_TYPE,
          display: true,
          content: "Learning engine: ask the learner which explanation method they want: pareto (80/20) or preferencias. Record their choice in the engine before planning or writing part 1.",
        }],
        continue: true,
      };
    }
    // event.context.canContinue is computed before this handler adds its own
    // message, so it is false at a normal end of turn; Pi re-evaluates it after
    // the gate's custom message. Only the correction budget bounds the gate.
    // Parts without pauses: an unwritten explanation is owed by the chat, not
    // by the learner, so the turn does not end before the part exists.
    if (passing && outcome.report.nextStage === "remedial") {
      const failed = outcome.report.part ?? "";
      if (!push(`remedial:${failed}`)) return undefined;
      return {
        entries: [{
          type: "custom_message",
          customType: GATE_TYPE,
          display: true,
          content:
            `Learning engine: part ${failed} failed. Read the learner's quiz answers, reasoning and own words, work out why they failed and what they did understand, ` +
            `then add a remedial part right after it in plan.json with "remedia" (the planned part it remedies) and "analisis" (that diagnosis). ` +
            "Write its explanation for exactly that gap and a mini-quiz with new questions (never one asked before), validate and advance, then present it.",
        }],
        continue: true,
      };
    }
    const method = typeof outcome.report.method === "string" ? outcome.report.method : "";
    if (passing && method && outcome.report.nextStage === "planning" && outcome.report.status !== "waiting") {
      if (!push("planning")) return undefined;
      return {
        entries: [{
          type: "custom_message",
          customType: GATE_TYPE,
          display: true,
          content:
            `Learning engine: the learner chose the ${method} method. Plan the route now with that method (planificador.md and plan.json), ` +
            "validate and advance planning, then continue to part 1. The plan is yours: never show it or list future parts to the learner.",
        }],
        continue: true,
      };
    }
    if (passing && outcome.report.nextStage === "explanation" && outcome.report.status !== "waiting") {
      if (push(`explanation:${outcome.report.part ?? ""}`)) {
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
      structuredContent: payload,
      isError: true,
    };
  };

  pi.registerTool({
    name: "learning_stage",
    label: "Learning engine stage",
    description:
      "Transport one stage operation (init, start, validate, advance, status, review, method) to the Go learning engine via its CLI and return the single-JSON report. " +
      "init enrolls a new topic (creates its folder under the Learnings root and records a new run); start resumes an existing topic; both take topic = the folder name and activate the deep session, so the learner never types a command. init also records the teaching scope: complete (the whole topic) or pareto (only the vital slice that yields most of the results). For exam runs, init accepts exam format oral, written or practical (exam=oral|written|practical), implies Pareto scope, and accepts practice only with practical; exam and practice are init-only, and exam cannot be combined with scope=complete. For real-exam uploads, init accepts 1–5 absolute sources under .subidas and an examSource selected from them; the adapter stages the files under topic/fuentes before engine init. The other actions require an active deep session; they read the scope from state and reject a scope argument. validate lists pendingReviews (rules whose recorded review is missing or stale); the chat (possibly via subagents) evaluates the rubric on the artifact and context, then records the verdict with action review (stage, rule, verdict, reason, optional reviewer). advance needs an explicit stage and blocks while any required review is missing, stale or a gate verdict is FAIL. " +
      "The engine report is the authority on completion; a FAIL check means the work is not finished.",
    promptSnippet: "Run a learning-engine stage operation and read its JSON verdict",
    promptGuidelines: [
      "Once the learner chooses the deep (university) or exam mode, enroll the topic yourself: init for a new topic, start to resume one; never ask the learner to type a command.",
      "If the learner chose to learn with the Pareto rule, pass scope=pareto on init; otherwise omit it (complete). For exam mode, ask whether the format is oral, written or practical and pass it as exam on init; for practical, ask the kind of practice and pass it as practice. Exam implies Pareto: never combine exam with scope=complete. For uploaded documents, pass all original absolute paths in sources; for a real exam also pass its main file as examSource. The adapter stages them in topic/fuentes before engine init. Never change the scope of a running topic.",
      "After diagnosis, ask whether the learner wants pareto or preferencias and record their answer with action method before planning.",
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
          enum: ["init", "start", "validate", "advance", "status", "review", "method"],
          description:
            "init: create and enroll a new topic folder, record a new run; start: enroll an existing topic and read its status; validate: check a stage without recording (returns pendingReviews); advance: validate + require recorded reviews + record; status: re-read engine state; review: record one chat verdict for one rubric; method: record the learner's explanation method after diagnosis.",
        },
        method: { type: "string", enum: ["pareto", "preferencias"], description: "method action: the learner's choice after diagnosis." },
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
        scope: {
          type: "string",
          enum: ["complete", "pareto"],
          description:
            "init only: complete teaches the whole topic; pareto teaches only the vital slice that yields most of the results and requires the plan to declare what it drops. Omit for complete; later actions read it from state.",
        },
        exam: {
          type: "string",
          enum: ["oral", "written", "practical"],
          description:
            "init only: exam format; implies Pareto scope and cannot be combined with scope=complete.",
        },
        practice: {
          type: "string",
          description:
            "init only: kind of practical exam; accepted only with exam=practical.",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 5,
          description: "init only: 1–5 absolute uploaded file paths under <root>/.subidas; PDFs include their extracted .txt sibling when staged.",
        },
        examSource: {
          type: "string",
          description: "init only, with exam: one of sources, selected as the real exam file to bind into state.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    } as unknown as TSchema,
    // SAFETY: open JSON Schema object, read by the host as a TypeBox-compatible schema.
    outputSchema: { type: "object", additionalProperties: true } as unknown as TSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { action: requested, topic, scope, method, exam, practice, sources, examSource } = params as {
        action?: string;
        topic?: unknown;
        scope?: unknown;
        method?: unknown;
        exam?: unknown;
        practice?: unknown;
        sources?: unknown;
        examSource?: unknown;
      };
      if (requested === "method" && method !== "pareto" && method !== "preferencias") {
        return adapterError("invalid-arguments", "method must be pareto or preferencias");
      }
      if (requested !== "method" && method !== undefined) {
        return adapterError("invalid-arguments", "method is only accepted by the method action");
      }
      if (requested !== "init" && (exam !== undefined || practice !== undefined)) {
        return adapterError("invalid-arguments", "exam and practice are only accepted by init");
      }
      if (requested !== "init" && (sources !== undefined || examSource !== undefined)) {
        return adapterError("invalid-arguments", "sources and examSource are only accepted by init");
      }
      if (requested === "init" && examSource !== undefined && exam === undefined) {
        return adapterError("invalid-arguments", "examSource requires exam");
      }
      if (requested === "init" && exam !== undefined && exam !== "oral" && exam !== "written" && exam !== "practical") {
        return adapterError(
          "invalid-arguments",
          `exam must be oral, written, or practical, got ${JSON.stringify(exam)}`,
        );
      }
      if (practice !== undefined && exam !== "practical") {
        return adapterError("invalid-arguments", "practice requires exam=practical");
      }
      if (practice !== undefined && (typeof practice !== "string" || practice.trim() === "")) {
        return adapterError("invalid-arguments", "--practice requires a non-empty kind");
      }
      const sourceValidation = requested === "init"
        ? validateUploadedSources(deps.root, sources, examSource)
        : { ok: true as const, copies: [] as SourceCopy[] };
      if (!sourceValidation.ok) {
        return adapterError("invalid-arguments", sourceValidation.detail);
      }
      if (scope !== undefined) {
        if (requested !== "init") {
          return adapterError(
            "invalid-arguments",
            `scope is only accepted by init; ${requested} reads it from state`,
          );
        }
        if (scope !== "complete" && scope !== "pareto") {
          return adapterError(
            "invalid-arguments",
            `scope must be complete or pareto, got ${JSON.stringify(scope)}`,
          );
        }
      }
      if (requested === "init" && exam !== undefined && scope === "complete") {
        return adapterError("invalid-arguments", "exam cannot be combined with scope=complete");
      }
      if (requested === "start") {
        if (!safeTopic(topic)) {
          return adapterError(
            "invalid-arguments",
            `start requires topic: one folder name under the Learnings root, got ${JSON.stringify(topic ?? "")}`,
          );
        }
        const session = resolveContained(deps.root, ctx.cwd);
        if (!session.ok) {
          return adapterError("out-of-scope", `session cwd is outside Learnings or unavailable — ${session.reason}`);
        }
        const target = join(session.rootReal, topic);
        if (!existsSync(target)) {
          return adapterError("not-found", `topic ${topic} does not exist under the Learnings root; use init for a new topic`);
        }
        const enrolled = enrollWorkspace(target, ctx.cwd);
        if (!enrolled.ok) return adapterError("out-of-scope", enrolled.reason);
        const outcome = await callEngine(deps, "status", engineTarget());
        if (!outcome.ok) return adapterError(outcome.reason, outcome.detail);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(outcome.report, null, 2) }],
          details: { command: "start", exitCode: outcome.code },
          // SAFETY: parseReport only admits a single JSON object, so the report is a plain record.
          structuredContent: outcome.report as unknown as AgentToolResult["structuredContent"],
          isError: outcome.code !== 0,
        };
      }
      if (requested === "init") {
        if (!safeTopic(topic)) {
          return adapterError(
            "invalid-arguments",
            `init requires topic: one folder name under the Learnings root, got ${JSON.stringify(topic ?? "")}`,
          );
        }
        const session = resolveContained(deps.root, ctx.cwd);
        if (!session.ok) {
          return adapterError("out-of-scope", `session cwd is outside Learnings or unavailable — ${session.reason}`);
        }
        const target = join(session.rootReal, topic);
        const targetExisted = existsSync(target);
        let workspace = target;
        if (targetExisted) {
          try {
            const info = lstatSync(target);
            if (!info.isDirectory() && !info.isSymbolicLink()) {
              return adapterError("out-of-scope", `topic is not a directory: ${target}`);
            }
          } catch (error) {
            return adapterError("operational", `cannot inspect topic ${topic}: ${(error as Error).message}`);
          }
          const contained = resolveContained(deps.root, target);
          if (!contained.ok) return adapterError("out-of-scope", contained.reason);
          if (!statSync(contained.targetReal).isDirectory()) {
            return adapterError("out-of-scope", `topic is not a directory: ${target}`);
          }
          workspace = contained.targetReal;
        }

        let fuentesPath = join(workspace, "fuentes");
        const fuentesExisted = sourceValidation.copies.length > 0 && existsSync(fuentesPath);
        if (fuentesExisted) {
          try {
            const info = lstatSync(fuentesPath);
            const contained = resolveContained(deps.root, fuentesPath);
            if (info.isSymbolicLink() || !info.isDirectory() || !contained.ok || contained.targetReal !== fuentesPath) {
              return adapterError("out-of-scope", `topic fuentes path is not a directory inside the topic: ${fuentesPath}`);
            }
          } catch (error) {
            return adapterError("operational", `cannot inspect topic fuentes: ${(error as Error).message}`);
          }
        }
        for (const copy of sourceValidation.copies) {
          if (existsSync(join(fuentesPath, copy.name))) {
            return adapterError("invalid-arguments", `topic fuentes already contains ${copy.name}`);
          }
        }

        const copied: string[] = [];
        let createdTopic = false;
        let createdFuentes = false;
        const rollback = () => rollbackInitSources(workspace, fuentesPath, createdFuentes, createdTopic, copied);
        try {
          if (!targetExisted) {
            mkdirSync(target, { recursive: true });
            createdTopic = true;
            const contained = resolveContained(deps.root, target);
            if (!contained.ok) throw new Error(contained.reason);
            workspace = contained.targetReal;
            fuentesPath = join(workspace, "fuentes");
          }
          if (sourceValidation.copies.length > 0) {
            if (!fuentesExisted) {
              mkdirSync(fuentesPath);
              createdFuentes = true;
            }
            for (const copy of sourceValidation.copies) {
              const destination = join(fuentesPath, copy.name);
              copyFileSync(copy.from, destination, fsConstants.COPYFILE_EXCL);
              copied.push(destination);
            }
          }
        } catch (error) {
          rollback();
          return adapterError("operational", `could not stage uploaded sources: ${(error as Error).message}`);
        }

        const outcome = await callEngine(deps, "init", {
          root: session.rootReal,
          workspace,
          ...(scope !== undefined ? { scope: scope as string } : {}),
          ...(exam !== undefined ? { exam: exam as string } : {}),
          ...(practice !== undefined ? { practice: practice as string } : {}),
          ...(sourceValidation.examSource !== undefined ? { examSource: sourceValidation.examSource } : {}),
        });
        if (!outcome.ok) {
          rollback();
          return adapterError(outcome.reason, outcome.detail);
        }
        if (outcome.code !== 0) rollback();
        else {
          const enrolled = enrollWorkspace(workspace, ctx.cwd);
          if (!enrolled.ok) {
            rollback();
            return adapterError("out-of-scope", enrolled.reason);
          }
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(outcome.report, null, 2) }],
          details: { command: "init", exitCode: outcome.code },
          // SAFETY: parseReport only admits a single JSON object, so the report is a plain record.
          structuredContent: outcome.report as unknown as AgentToolResult["structuredContent"],
          isError: outcome.code !== 0,
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
      if (action !== "validate" && action !== "advance" && action !== "status" && action !== "review" && action !== "method") {
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
      const outcome = await callEngine(deps, action, { ...engineTarget(), stage, rule, verdict, reason, reviewer, ...(action === "method" ? { method: method as string } : {}) });
      if (!outcome.ok) {
        return adapterError(outcome.reason, outcome.detail);
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(outcome.report, null, 2) }],
        details: { command: action, exitCode: outcome.code },
        // SAFETY: parseReport only admits a single JSON object, so the report is a plain record.
        structuredContent: outcome.report as unknown as AgentToolResult["structuredContent"],
        isError: outcome.code !== 0,
      };
    },
  });
}
