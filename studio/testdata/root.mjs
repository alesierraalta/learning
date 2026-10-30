// Temporary Learnings root used by the studio tests: one topic with two parts,
// one app, one quick note, and a fake engine that reports the stage the test is about.
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The studio remembers opened topics in the user's state directory: tests never touch the real one.
process.env.XDG_STATE_HOME = realpathSync(mkdtempSync(join(tmpdir(), "studio-state-")));

/**
 * @param {{status?: Record<string, unknown>}} [options] `status` is what the fake engine
 *   answers, so a test can put the topic in the stage it studies.
 */
export function makeRoot(options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "studio-")));
  const topic = join(root, "redes");
  mkdirSync(join(topic, "explicaciones", "apps"), { recursive: true });
  mkdirSync(join(topic, ".learning"));
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "Redes", parts: [{ id: "p1", title: "Capas", slug: "Capas" }, { id: "p2", title: "TCP", slug: "TCP" }] }));
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Capas.md"), "# Parte 1 — Capas\n");
  writeFileSync(join(topic, "explicaciones", "apps", "p1.html"), "<html><head></head><body>app</body></html>");
  writeFileSync(join(topic, "quiz.json"), JSON.stringify({ questions: [] }));
  mkdirSync(join(root, "rapidos"));
  writeFileSync(join(root, "rapidos", "hash.md"), "---\ntipo: rapido\n---\n# Qué es un hash\n");
  const engine = join(root, "fake-engine.sh");
  const status = JSON.stringify(options.status ?? { status: "waiting", stage: "diagnosis", nextStage: "diagnosis" }).replace(/'/g, `'\\''`);
  writeFileSync(engine, `#!/bin/sh\necho '${status}'\n`);
  chmodSync(engine, 0o755);
  return { root, engine, log: join(root, "pi.log") };
}
