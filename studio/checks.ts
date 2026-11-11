/**
 * The scene and explanation checks the studio runs itself, at the end of a turn that wrote a part.
 *
 * The engine reads the part's structure; it cannot see how the figure is drawn. These four tools
 * can: `scene-gate` measures the canvas (type size, pieces on the edge, empty bands), `scene-lint`
 * measures how the pieces of a scene live together, `deck-gate` measures the ink inside a deck's
 * boxes, and `explain-check` measures the whole standard. A part the learner is about to read is
 * measured before the turn is offered as done.
 *
 * They run with the studio's own Node (`process.execPath`, never `node` from `PATH`): one of them
 * imports a `.ts` module, and the distro's Node 22 cannot load it. That difference already broke a
 * deploy, so it is a rule here, not a preference.
 */
import { execFile } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

/** The four tools, in the order the tutor's own skill runs them. */
export const PART_TOOLS = ["scene-gate.mjs", "scene-lint.mjs", "deck-gate.mjs", "explain-check.mjs"] as const;
export type PartTool = (typeof PART_TOOLS)[number];

/** What one tool said about one note: its own words, kept whole for the tutor's correction. */
export interface ToolFindings {
  file: string;
  tool: PartTool;
  /** The tool's own output, exactly as it printed it. */
  output: string;
  /** The finding lines inside that output, in the tool's own words. */
  findings: string[];
}

/** What the tools found in the notes a turn wrote, in their own words. */
export interface PartReport {
  tools: ToolFindings[];
  /** How many findings, all tools together. */
  count: number;
  /** The first finding, as the tool printed it: what the learner hears about. */
  first: string;
}

export type PartChecks =
  /** Every tool passed, or there was nothing to measure. */
  | { kind: "clean" }
  /** At least one tool named something to fix. */
  | ({ kind: "findings" } & PartReport)
  /**
   * A tool could not measure at all (missing, crashed, timed out, or it failed without naming a
   * finding). This is the studio's own problem, never the tutor's: it goes to the log.
   */
  | { kind: "crashed"; failures: string[] };

export interface PartCheckOptions {
  /** Where the tools live; the repo's `tools/` unless a test says otherwise. */
  toolsDir?: string;
  /** How long one tool may take before it counts as a crash. A browser launch is not instant. */
  timeoutMs?: number;
}

/** One tool's run, as the process reported it. */
type Run = { code: number; stdout: string; stderr: string; error?: string };

const runTool = (tool: PartTool, file: string, options: PartCheckOptions): Promise<Run> =>
  new Promise((resolve) => {
    const toolsDir = options.toolsDir ?? join(REPO, "tools");
    execFile(
      process.execPath,
      [join(toolsDir, tool), file],
      { cwd: REPO, timeout: options.timeoutMs ?? 180_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        const failure = error as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        if (!failure) return resolve({ code: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
        const code = typeof failure.code === "number" ? failure.code : -1;
        let reason = "";
        if (failure.killed) reason = "agotó el tiempo";
        else if (typeof failure.code === "string") reason = failure.code;
        return resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), error: reason });
      },
    );
  });

/**
 * The finding lines of one tool, read in the tool's own vocabulary. A tool that fails without
 * naming anything is not a finding: it is a check that could not run.
 */
export function findingsOf(tool: PartTool, output: string): string[] {
  if (tool === "deck-gate.mjs") {
    // A single note is answered as one JSON report, followed by its own GATE line.
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const report = JSON.parse(output.slice(start, end + 1)) as { bad?: Array<Record<string, unknown>> };
        return (report.bad ?? [])
          .map((item) => [item.kind, item.text].filter((part) => typeof part === "string" && part !== "").join(": "))
          .filter(Boolean);
      } catch {
        // Not the report: fall through to the tool's own lines.
      }
    }
    return output.split("\n").filter((line) => /^ {2}\{/.test(line)).map((line) => line.trim());
  }
  const lines = output.split("\n");
  if (tool === "scene-lint.mjs" || tool === "scene-gate.mjs") {
    // `<nota>: bloque N — <título>` / `<nota>: escena N — <título>` then one
    // `  <kind>: <texto>` per finding: the two geometry tools speak the same way.
    return lines.filter((line) => /^ {2}[a-z][a-z-]*:/.test(line)).map((line) => line.trim());
  }
  // explain-check prints one row per rule: `FALLA <regla> <detalle>`.
  return lines.filter((line) => /^FALLA\s/.test(line)).map((line) => line.trim());
}

/** The first line of a tool's own error, for the log: never a stack trace. */
const errorLine = (run: Run): string => {
  const text = [run.stderr, run.stdout].join("\n");
  const line = text.split("\n").find((candidate) => /error|Error|no está disponible|no such file/.test(candidate));
  return (line ?? run.error ?? "").trim();
};

/**
 * Measure the notes a turn wrote. One tool that cannot run does not hide the others: every tool is
 * asked, the findings are collected, and a tool that could not measure is reported apart.
 */
export async function runPartChecks(files: string[], options: PartCheckOptions = {}): Promise<PartChecks> {
  const tools: ToolFindings[] = [];
  const failures: string[] = [];
  for (const file of files) {
    for (const tool of PART_TOOLS) {
      const run = await runTool(tool, file, options);
      const findings = run.code === 0 ? [] : findingsOf(tool, run.stdout);
      if (findings.length) {
        tools.push({ file, tool, output: run.stdout.trim(), findings });
        continue;
      }
      // A tool that exits cleanly measured the note; one that fails without naming a finding did not.
      if (run.code === 0) continue;
      const detail = errorLine(run);
      failures.push(`${tool} no pudo medir ${basename(file)} (salida ${run.code})${detail ? `: ${detail}` : ""}`);
    }
  }
  if (tools.length) {
    const count = tools.reduce((total, found) => total + found.findings.length, 0);
    return { kind: "findings", tools, count, first: tools[0].findings[0] };
  }
  if (failures.length) return { kind: "crashed", failures };
  return { kind: "clean" };
}
