// Question text in the studio (#332): the diagnosis the learner answers draws its fenced PL/SQL as a code block,
// and the results the studio reads back draw the same code, not one run-on line. The diagnosis is the reader frame;
// the results are the studio's own list, fed by the frame the way a graded submission reaches it.
import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

import { startStudio as startStudioChecked } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

const startStudio = (options) => startStudioChecked({ skipContextCheck: true, ...options });

// PLAYWRIGHT_MODULE names a module; else the package resolves here or from the global install. Without any, the tests skip.
async function playwright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import("playwright"));
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    attempts.push(async () => createRequire(root + "/")("playwright"));
  } catch {
    // no npm: only the module names above are tried
  }
  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      if (mod?.chromium || mod?.default?.chromium) return mod.chromium ? mod : mod.default;
    } catch {
      // try the next way to load Playwright
    }
  }
  return null;
}

const browser = await playwright();
const open = [];
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
});
after(async () => {
  for (const studio of open.splice(0)) await studio.close();
});

const PLSQL = "CREATE OR REPLACE PACKAGE PA_Reportes AS\n  PROCEDURE mostrar_cliente(p_id NUMBER);\nEND PA_Reportes;";
const STEM = `¿Qué imprime el bloque?\n\`\`\`plsql\n${PLSQL}\n\`\`\``;
const diagnosis = {
  questions: [{
    id: "d2", type: "topic", level: 1, subtema: "redes-capas", nivel: "básico", round: 1,
    enunciado: STEM,
    pieza: { tipo: "codigo", lenguaje: "plsql", contenido: PLSQL },
    options: { A: "Lista los clientes.", B: "Falla al compilar.", C: "No imprime nada.", D: "Entra en bucle.", E: "No sé" },
    answer: "A",
  }],
};

async function openStudio(t, root, engine, log) {
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine, offlineCacheDir: join(root, "..", `${root.split("/").pop()}-cdn`) });
  open.push(studio);
  const page = await browser.chromium.launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  return { studio, page };
}

test("the diagnosis draws the fenced PL/SQL of its question as a code block", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  writeFileSync(join(root, "redes", "quiz.json"), JSON.stringify(diagnosis));
  const { studio, page } = await openStudio(t, root, engine, log);
  await page.goto(`${studio.url}#/leer/redes/quiz`, { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator("iframe.sheet");
  const stem = frame.locator("fieldset.quiz-question legend pre > code.language-plsql").first();
  await stem.waitFor({ timeout: 15000 });
  assert.equal(await stem.textContent(), PLSQL, "the block keeps every line of the statement");
  assert.equal(await frame.locator("fieldset.quiz-question legend").first().locator("span.lk-tok-kw").count() > 0, true, "its keywords are highlighted");
  assert.equal(await frame.locator("fieldset.quiz-question pre > code.language-plsql").count() >= 2, true, "the stem and the pieza are both code blocks");
});

test("the results list draws a question's code as a code block, not as one run-on line", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  writeFileSync(join(root, "redes", "quiz.json"), JSON.stringify(diagnosis));
  const { studio, page } = await openStudio(t, root, engine, log);
  await page.goto(`${studio.url}#/leer/redes/quiz`, { waitUntil: "domcontentloaded" });
  const frame = await (await page.waitForSelector("iframe.sheet")).contentFrame();
  await frame.locator("fieldset.quiz-question legend").first().waitFor({ timeout: 15000 });
  // The frame posts as the reader does: to the studio's own origin, from the frame's window.
  await frame.evaluate(({ results, origin }) => window.parent.postMessage({ type: "learning:submitted", kind: "mini-quiz", topic: "redes", part: "quiz", score: "0/1", results }, origin), {
    origin: new URL(studio.url).origin,
    results: [{ id: "d2", enunciado: STEM, chosen: "B", chosenText: "Falla al compilar.", correct: "A", correctText: "Lista los clientes.", ok: false }],
  });
  await page.waitForFunction(() => location.hash === "#/resultados/redes/quiz", null, { timeout: 5000 });
  const code = page.locator(".results-list li.miss p.question pre > code.language-plsql");
  await code.waitFor({ timeout: 5000 });
  assert.equal(await code.textContent(), PLSQL, "the results keep the statement's lines");
});
