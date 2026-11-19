#!/usr/bin/env node
// A small reader for a directory of page-timing reports: one line per report, then the aggregate.
// It never writes, and it says when an older report has no per-tool detail to summarise.
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = process.argv[2] ?? join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "learning-studio",
  "page-timings",
);

const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
const share = (part, total) => (total > 0 ? `${((100 * part) / total).toFixed(1)}%` : "0%");

/** Name → total ms and how many executions, so both report and aggregate rank the same way. */
const tally = (tools) => {
  const byName = new Map();
  for (const tool of tools) {
    const name = String(tool.name ?? "unknown");
    const row = byName.get(name) ?? { name, ms: 0, count: 0 };
    row.ms += number(tool.ms);
    row.count += 1;
    byName.set(name, row);
  }
  return byName;
};
const top = (byName, limit = 3) => [...byName.values()]
  .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
  .slice(0, limit)
  .map((row) => `${row.name} ${fmt(row.ms)} ×${row.count}`)
  .join(", ") || "none";

let names;
try {
  names = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
} catch (error) {
  process.stderr.write(`No se pudo leer ${dir}: ${error.message}\n`);
  process.exitCode = 1;
  names = [];
}
const reports = [];
for (const name of names) {
  try {
    const report = JSON.parse(readFileSync(join(dir, name), "utf8"));
    if (!report || typeof report.totalMs !== "number" || !Array.isArray(report.phases)) continue;
    reports.push({ name, report });
  } catch (error) {
    process.stderr.write(`Se omitió ${name}: ${error.message}\n`);
  }
}

console.log(`page timings: ${dir}`);
if (reports.length === 0) {
  console.log("  no page-timing reports here yet");
} else {
  console.log("per report");
}
const totals = { ms: 0, tutorMs: 0, gapMs: 0, tools: 0, engine: 0 };
const allTools = new Map();
let legacy = 0;

for (const { name, report } of reports) {
  const calls = Array.isArray(report.calls) ? report.calls : [];
  const detailed = number(report.version) >= 2;
  const tools = detailed ? calls.flatMap((call) => (Array.isArray(call.tools) ? call.tools : [])) : [];
  const totalMs = number(report.totalMs);
  const tutorMs = calls.length
    ? calls.reduce((sum, call) => sum + number(call.ms), 0)
    : number(report.phases.find((phase) => phase.name === "tutor")?.ms);
  const gapMs = calls.reduce((sum, call) => sum + number(call.modelMs), 0);
  const engine = detailed
    ? (typeof report.engineRoundTrips === "number" ? report.engineRoundTrips : tools.filter((tool) => tool.engine === true).length)
    : null;
  const byName = tally(tools);
  totals.ms += totalMs;
  totals.tutorMs += tutorMs;
  if (detailed) {
    totals.gapMs += gapMs;
    totals.tools += tools.length;
    totals.engine += number(engine);
    for (const [toolName, row] of byName) {
      const all = allTools.get(toolName) ?? { name: toolName, ms: 0, count: 0 };
      all.ms += row.ms;
      all.count += row.count;
      allTools.set(toolName, all);
    }
  } else {
    legacy += 1;
  }
  console.log(
    `  ${name}  ${report.tutor ?? "?"}  total ${fmt(totalMs)}  tutor ${share(tutorMs, totalMs)}  ` +
    (detailed
      ? `tools ${tools.length} (${top(byName)})  model gap ${fmt(gapMs)}  engine round-trips ${engine}`
      : `tools n/a (v${report.version ?? "?"})  model gap n/a  engine round-trips n/a`),
  );
}

if (reports.length > 0) {
  console.log(`aggregate (${reports.length} report(s)${legacy ? `, ${legacy} without v2 tool detail` : ""})`);
  console.log(`  total ${fmt(totals.ms)}  tutor ${share(totals.tutorMs, totals.ms)}`);
  console.log(`  top tools: ${top(allTools)}`);
  console.log(`  tool count ${totals.tools}  model gap ${fmt(totals.gapMs)}  engine round-trips ${totals.engine}`);
}
