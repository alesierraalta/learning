/**
 * What the learning engine says about a topic, in the one place both tutors read it.
 *
 * Pi's settle gate and the studio's Antigravity gate must agree: same statuses,
 * same failed checks. Only the report differs, never the rule.
 */
export const PASS_STATUSES = new Set(["accepted", "completed", "waiting", "skipped"]);

/** The shape the engine prints with `--json`; only what the gate reads. */
export interface GateReport {
  status?: string;
  checks?: { id?: string; status?: string }[];
}

export function failCheckIds(report: GateReport): string[] {
  return (report.checks ?? []).filter((check) => check.status === "FAIL").map((check) => String(check.id));
}

/** A topic passes when the engine is not waiting on a failure and no check failed. */
export function gateVerdict(report: GateReport): { passing: boolean; fails: string[] } {
  const fails = failCheckIds(report);
  return { passing: PASS_STATUSES.has(String(report.status)) && fails.length === 0, fails };
}
