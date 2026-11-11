/**
 * The settle gate every tutor passes through, whatever runtime runs the turn.
 *
 * A turn does not end while the engine reports a failing stage. The studio asks the engine's own
 * `status` when a turn settles, hands the tutor the engine's own failing-check reasons, and stops
 * after the same bounded number of corrections the Pi adapter applies by itself. What a PASS is
 * comes from gate-rules.ts, so the studio and the adapter can never disagree about that.
 */
import { MAX_CORRECTIONS, PASS_STATUSES, type GateReport } from "../integrations/pi/gate-rules.ts";

/** A learner reads this message in the chat; the gate writes it and the chat knows its own words. */
export const GATE_PREFIX = "Learning gate:";

/** The gate's instruction, told apart from what the learner typed, in the events and in the thread. */
export const isGatePrompt = (text: string): boolean => text.startsWith(GATE_PREFIX);

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
 * The rule with its own counters, one per studio. A learner's turn resets them, exactly as the Pi
 * adapter reset its correction count on every input, so each turn gets the whole budget once.
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
      if (clearsEngine(report)) {
        corrections = 0;
        return { action: "end" };
      }
      if (corrections >= MAX_CORRECTIONS) return { action: "stop", text: gateStop(report) };
      corrections += 1;
      return { action: "ask", text: gatePrompt(report) };
    },
  };
}
