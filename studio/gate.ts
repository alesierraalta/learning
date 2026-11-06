/**
 * The engine check a tutor runs after a deep turn, shared by every provider.
 *
 * Pi runs this same rule inside its own settle gate; Antigravity has no such
 * hook, so the studio runs it here. The rule itself lives in gate-rules.ts.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { gateVerdict, type GateReport } from "../integrations/pi/gate-rules.ts";

const ENGINE_TIMEOUT_MS = 120_000;

/** Enrolled is what the engine tracks: a topic folder alone is not a topic yet. */
export function enrolled(root: string, topic: string): boolean {
  return existsSync(join(root, topic, ".learning", "state.json"));
}

export type DeepCheck =
  | { ok: true; passing: boolean; fails: string[]; status: string }
  | { ok: false; passing: false; error: string };

export function checkDeep(options: { root: string; topic: string; enginePath: string; rulesPath: string }): Promise<DeepCheck> {
  return new Promise((resolve) => {
    execFile(
      options.enginePath,
      ["status", "--root", options.root, "--workspace", join(options.root, options.topic), "--rules", options.rulesPath, "--mode", "deep", "--json"],
      { cwd: join(options.root, options.topic), timeout: ENGINE_TIMEOUT_MS, encoding: "utf8" },
      (error, stdout) => {
        if (error) return resolve({ ok: false, passing: false, error: error.message });
        let report: GateReport;
        try { report = JSON.parse(stdout) as GateReport; } catch { return resolve({ ok: false, passing: false, error: "the engine printed no report" }); }
        if (!report || typeof report !== "object") return resolve({ ok: false, passing: false, error: "the engine printed no report" });
        const verdict = gateVerdict(report);
        resolve({ ok: true, passing: verdict.passing, fails: verdict.fails, status: String(report.status ?? "") });
      },
    );
  });
}
