/**
 * The settle gate every tutor passes through, whatever runtime runs the turn.
 *
 * A turn does not end while the engine reports a failing stage. The studio asks the engine's own
 * `status` when a turn settles, hands the tutor the engine's own failing-check reasons, and stops
 * after the same bounded number of corrections the Pi adapter applies by itself. What a PASS is
 * comes from gate-rules.ts, so the studio and the adapter can never disagree about that.
 */
import { MAX_CORRECTIONS, PASS_STATUSES, type GateReport } from "../integrations/pi/gate-rules.ts";
import type { PartReport } from "./checks.ts";

/** A learner reads this message in the chat; the gate writes it and the chat knows its own words. */
export const GATE_PREFIX = "Learning gate:";

/** Every prompt the studio writes itself, told apart from what the learner typed: the gate's
 * correction and the method hand-off are instructions, never the learner's words. */
const STUDIO_PREFIXES = [GATE_PREFIX, "Learning engine:"];

/** The studio's own instruction, told apart from the learner's words in the events and the thread. */
export const isStudioPrompt = (text: string): boolean => STUDIO_PREFIXES.some((prefix) => text.startsWith(prefix));

/** The study modes the page offers; the learner picks one before a new request is sent. */
export const STUDY_MODES = ["rapido", "universitario", "examen"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];
export type ExamFormat = "oral" | "written" | "practical";
export type ExamChoice = { formato: ExamFormat; practica?: string };

/**
 * The line that carries the learner's mode inside the prompt of the turn, so neither tutor asks it
 * again: the mode is decided in the page, before the turn exists.
 */
export function modeLine(mode: StudyMode, examen?: ExamChoice): string {
  if (mode === "examen") {
    if (!examen) throw new Error("exam mode needs a chosen format");
    const labels: Record<ExamFormat, string> = { oral: "oral", written: "escrito", practical: "práctico" };
    const practice = examen.formato === "practical"
      ? `, con tipo de práctica ${JSON.stringify(examen.practica)} (practice: ${JSON.stringify(examen.practica)})`
      : "";
    const initFields = examen.formato === "practical" ? "exam y practice" : "exam";
    return `[Modo de estudio: examen — ya decidido en el estudio, con formato ${labels[examen.formato]} (exam: ${JSON.stringify(examen.formato)})${practice}. No preguntes el modo ni el formato: pásalos a learning_stage init como ${initFields}.]`;
  }
  const label = mode === "rapido" ? "rápido" : "universitario";
  return `[Modo de estudio: ${label} — ya decidido en el estudio. No preguntes si prefiere rápido o universitario y no abras un diálogo para elegirlo.]`;
}

/**
 * What means "no report at all", never "a failing stage": the engine's own error report, and the
 * two answers the studio's engine call gives when nothing could be read.
 */
const NO_REPORT = new Set(["error", "desconocido", "sin inscribir"]);

/** One engine check, as far as the gate reads it. */
export interface SettleCheck {
  id?: string;
  status?: string;
  reason?: string;
}

/** What `learning status --json` prints, as far as the gate reads it. */
export interface SettleReport extends GateReport {
  status?: string;
  stage?: string;
  nextStage?: string;
  checks?: SettleCheck[];
}

export type SettleDecision =
  /** The engine cleared the turn, or the learner owes the work: the turn ends. */
  | { action: "end" }
  /** The tutor is asked for one more turn, with the engine's own words. */
  | { action: "ask"; text: string }
  /** The budget is spent: the learner is told, in the chat, instead of a silent stop. */
  | { action: "stop"; text: string }
  /** The report says nothing about the turn (engine missing, unreadable): never loop the tutor. */
  | { action: "unreadable" };

/** One check per requirement, and the failing ones are what the tutor is told to fix. */
export const failingChecks = (report: SettleReport): SettleCheck[] =>
  (report.checks ?? []).filter((check) => check.status === "FAIL");

/** A FAIL check blocks the settle even when the status reads accepted: the engine is the authority. */
export function clearsEngine(report: SettleReport): boolean {
  return PASS_STATUSES.has(String(report.status)) && failingChecks(report).length === 0;
}

/** The tutor's next instruction: the engine's own status and failing reasons, nothing invented. */
export function gatePrompt(report: SettleReport): string {
  const fails = failingChecks(report);
  const lines = [
    `${GATE_PREFIX} the engine has not cleared this turn.`,
    `status: ${report.status} | stage: ${report.stage ?? "-"} | next: ${report.nextStage ?? "-"}`,
  ];
  for (const check of fails.slice(0, 5)) lines.push(`FAIL ${check.id}: ${check.reason ?? ""}`);
  if (fails.length > 5) lines.push(`+${fails.length - 5} more FAIL checks`);
  lines.push(
    "The work is not complete and the engine is the authority: fix the listed checks, advance the stage with the engine, " +
      "and only then present the result to the learner. Do not end the turn before the engine clears it.",
  );
  return lines.join("\n");
}

/** What the learner reads when the tutor ran out of corrections, in the studio's own vocabulary. */
export function gateStop(report: SettleReport): string {
  const fails = failingChecks(report);
  const wants = fails.length
    ? fails.slice(0, 5).map((check) => `${check.id}: ${check.reason ?? ""}`).join(" · ")
    : "todavía no da la etapa por cerrada";
  return (
    `El tutor no pudo terminar: el motor no da la etapa por cerrada (estado ${report.status}, ` +
    `etapa ${report.stage || "-"}) y sigue pidiendo ${wants}. ` +
    `Se agotaron las ${MAX_CORRECTIONS} correcciones.`
  );
}

/**
 * The tutor's correction when the part it just wrote does not pass the studio's own checks. The
 * instruction carries each tool's exact output: the tutor fixes what the tool measured, not what
 * the studio paraphrased.
 */
export function partPrompt(report: PartReport): string {
  const lines = [
    `${GATE_PREFIX} la parte no pasa las comprobaciones del estándar.`,
    `El motor ya la dio por cerrada, pero las herramientas que miden la figura y la nota encuentran ${report.count} hallazgo(s):`,
  ];
  for (const found of report.tools) {
    lines.push(`--- tools/${found.tool} · ${found.file} (salida exacta) ---`);
    lines.push(found.output);
  }
  lines.push(
    "Corrige la figura y la nota hasta que las tres comprobaciones pasen (scene-lint, deck-gate, explain-check): " +
      "ninguna palabra fuera de su caja, ninguna flecha sobre el texto, ninguna punta en el aire. " +
      "No des la parte por entregada antes de que pasen.",
  );
  return lines.join("\n");
}

/**
 * What the learner reads when the corrections ran out and the part still has visual problems: the
 * count and the first finding, in the studio's own words. A silent pass is what this forbids.
 */
export function partStop(report: PartReport): string {
  const total = report.count === 1 ? "1 hallazgo" : `${report.count} hallazgos`;
  return (
    `La parte todavía tiene problemas visuales: ${total}. El primero: ${report.first}. ` +
    `Se agotaron las ${MAX_CORRECTIONS} correcciones.`
  );
}

/**
 * The rule with its own counters, one per studio. A learner's turn resets them, exactly as the Pi
 * adapter reset its correction count on every input, so each turn gets the whole budget once.
 *
 * The engine's corrections and the part's own checks spend the same budget: a turn that needed two
 * engine corrections has one left for what the tools measured, and the learner hears about it once.
 */
export function createSettleGate() {
  let corrections = 0;
  return {
    /** A learner's turn starts with the whole budget; a gate correction continues that same turn. */
    reset() {
      corrections = 0;
    },
    decide(report: SettleReport): SettleDecision {
      if (NO_REPORT.has(String(report.status))) return { action: "unreadable" };
      // A cleared stage ends the engine's part of the turn; the budget belongs to the turn, not to
      // this report, so the checks that come after it spend what is left.
      if (clearsEngine(report)) return { action: "end" };
      if (corrections >= MAX_CORRECTIONS) return { action: "stop", text: gateStop(report) };
      corrections += 1;
      return { action: "ask", text: gatePrompt(report) };
    },
    /** The same budget, spent on what the scene and explanation tools measured. */
    decideFindings(report: PartReport): SettleDecision {
      if (corrections >= MAX_CORRECTIONS) return { action: "stop", text: partStop(report) };
      corrections += 1;
      return { action: "ask", text: partPrompt(report) };
    },
  };
}
