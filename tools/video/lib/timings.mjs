// Where a render spent its wall clock. A speed claim is worth nothing without
// the numbers it was measured against, so every stage is timed while it runs and
// the report is written beside the output it describes: the next render of the
// same part is compared with that file, not with a memory of it.
import { writeFile } from "node:fs/promises";

// Microseconds are noise in a report a human reads; keep three decimals so a
// stage that only costs a fraction of a millisecond still is not reported as 0.
const round = (ms) => Math.round(ms * 1000) / 1000;

export function createTimings() {
  const startedAt = new Date();
  // The clock starts when the renderer is imported: total_ms is the whole run,
  // not the sum of the stages the report happens to name.
  const origin = performance.now();
  const stages = [];
  return {
    // Opens a stage and returns the function that closes it. Stages are reported
    // in the order they ran, which is the order the pipeline runs them.
    time(name) {
      const opened = performance.now();
      return (extra = {}) => stages.push({ stage: name, ms: round(performance.now() - opened), ...extra });
    },
    // A stage that measured itself (a child process, a capture loop whose rate is
    // part of the number): the duration and the fields come from the caller.
    observe(name, ms, extra = {}) {
      stages.push({ stage: name, ms: round(Math.max(0, ms)), ...extra });
    },
    // What was rendered, with which numbers, and what each stage cost.
    report(meta) {
      return {
        ...meta,
        started_at: startedAt.toISOString(),
        total_ms: round(performance.now() - origin),
        stages: [...stages],
      };
    },
  };
}

export async function writeReport(file, report) {
  await writeFile(file, `${JSON.stringify(report, null, 1)}\n`);
  return file;
}
