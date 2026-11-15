import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("startup warming runs existing rich pages one at a time and leaves later warm-ups cached", async () => {
  const { warmGateVerdicts } = await import("./gate-verdicts.ts");
  const root = mkdtempSync(join(tmpdir(), "gate-warmup-"));
  const pages = join(root, "redes", "explicaciones");
  mkdirSync(pages, { recursive: true });
  writeFileSync(join(pages, "Parte 1 - Capas.html"), "<html>primera</html>");
  writeFileSync(join(pages, "Parte 2 - TCP.html"), "<html>segunda</html>");
  writeFileSync(join(pages, "nota.md"), "no es una página rica");
  const log = join(root, "runs.log");
  const gateToolPath = join(root, "fake-explain-check.mjs");
  writeFileSync(gateToolPath, [
    'import { appendFileSync } from "node:fs";',
    `appendFileSync(${JSON.stringify(log)}, "start\\n");`,
    "await new Promise(resolve => setTimeout(resolve, 80));",
    `appendFileSync(${JSON.stringify(log)}, "end\\n");`,
    'console.log(JSON.stringify({ serves: true }));',
    "",
  ].join("\n"));
  const options = { gateToolPath, gateVerdictsFile: join(root, ".learning-cache", "gate-verdicts.json") };

  await warmGateVerdicts(root, options);
  assert.equal(readFileSync(log, "utf8"), "start\nend\nstart\nend\n", "rich pages warm sequentially");
  await warmGateVerdicts(root, options);
  assert.equal(readFileSync(log, "utf8"), "start\nend\nstart\nend\n", "a later warm-up does not rerun cached verdicts");
});
