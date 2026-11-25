// #415: the block where the learner writes what they understood in their own words is the
// one that most needs dictation, so it is drawn by the same thought field as the questions.
// These tests prove both halves: the control the kit wires is there and writes that box,
// and what the box holds still reaches the tutor as `ownWords`, with the same cap and trim.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const VIEW = join(dirname(fileURLToPath(import.meta.url)), "view");
const KIT = join(VIEW, "..", "kit");

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import("playwright"));
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    attempts.push(async () => createRequire(root + "/")("playwright"));
  } catch {}
  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      if (mod?.chromium || mod?.default?.chromium) return mod.chromium ? mod : mod.default;
    } catch {}
  }
  return null;
}

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : "playwright not installed: the own-words block cannot be driven";

const ORIGIN = "http://own-words.test/";
const OPTIONS = { A: "una fila", B: "una columna", C: "un índice", D: "un esquema", E: "No sé" };
// The page a part with a mini-quiz gets from the bridge, reducible to one question.
const PART = {
  kind: "part", topic: "sql-demo", part: "p1", title: "Parte 1 — Claves", topicTitle: "SQL",
  topicBase: "/", home: "/", markdown: "# Parte 1 — Claves\n\nUna clave identifica una fila.",
  submitUrl: "/submit",
  quiz: { questions: [{ id: "q1", enunciado: "¿Qué identifica una clave?", options: OPTIONS }] },
  answered: null, demos: [], video: null, verdicts: null,
};
const GRADED = { results: [{ id: "q1", chosen: "A", correct: "A", ok: true }], score: "1/1", saved: "mini-quiz/p1.answers.json" };
// The page's markdown renderer is not what this suite is about; the recogniser is: the test
// decides what the «Dictar» control heard, so no microphone and no server are involved.
const STUBS = `
  window.marked = { Renderer: class { code() { return ""; } }, parse: (text) => text, parseInline: (text) => text };
  window.DOMPurify = { sanitize: (html) => html };
  window.SpeechRecognition = class { start() { window.__hearing = this; } stop() {} };
`;

async function open(t) {
  const browser = await PLAYWRIGHT.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const submitted = [];
  await page.route(`${ORIGIN}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/submit") {
      submitted.push(route.request().postDataJSON());
      return route.fulfill({ json: GRADED });
    }
    if (path === "/dictate.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: readFileSync(join(KIT, "dictate.js"), "utf8") });
    if (path === "/app.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: readFileSync(join(VIEW, "app.js"), "utf8") });
    const data = JSON.stringify(PART).replace(/</g, "\\u003c");
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body><main id="app"></main>'
        + `<script type="application/json" id="view-data">${data}</script>`
        + `<script>${STUBS}</script><script src="/dictate.js"></script><script src="/app.js"></script></body></html>`,
    });
  });
  await page.goto(ORIGIN);
  await page.waitForSelector("form fieldset.quiz-question");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Enviar al tutor" }) });
  return { page, submitted, form };
}

/** The own-words block: the thought field the quiz form draws outside its questions. */
const ownWordsBlock = (form) => form.locator(":scope > .lk-thought");

async function answerAll(page) {
  await page.locator('input[name="question-0"][value="A"]').check();
  await page.locator('input[name="confidence-0"][value="seguro"]').check();
}

async function send(page, form) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/submit"), { timeout: 90_000 }),
    form.getByRole("button", { name: "Enviar al tutor" }).click(),
  ]);
  assert.equal(response.status(), 200);
}

test("what the «Dictar» control hears lands in the own-words box and is sent as ownWords", { skip: SKIP }, async (t) => {
  const { page, submitted, form } = await open(t);
  const own = ownWordsBlock(form);
  assert.equal(await own.count(), 1, "the own-words block is drawn outside the questions, as a thought field");
  assert.match(await own.locator(".lk-thought-label").textContent(), /Vuelco con tus palabras/,
    "the thought field drawn for the learner is not the own-words block");
  const box = own.locator("textarea");
  assert.equal(await box.count(), 1);
  const mic = own.locator("button.lk-mic");
  assert.equal(await mic.count(), 1, "the own-words block carries no dictation button");
  assert.match(await mic.textContent(), /Dictar/, "the dictation control is not the one the kit builds");
  await mic.click();
  await page.waitForFunction(() => Boolean(window.__hearing), null, { timeout: 90_000 });
  await page.evaluate(() => window.__hearing.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Mi vuelco dictado" }, length: 1 }] }));
  assert.equal(await box.inputValue(), "Mi vuelco dictado", "the dictation did not reach the own-words box");
  await answerAll(page);
  await send(page, form);
  assert.equal(submitted[0].ownWords, "Mi vuelco dictado", "what the own-words block holds is not saved as ownWords");
});

test("what the learner types in the own-words box is still sent as ownWords", { skip: SKIP }, async (t) => {
  const { page, submitted, form } = await open(t);
  const box = ownWordsBlock(form).locator("textarea");
  assert.equal(await box.getAttribute("maxlength"), "8000", "the box lost the cap the bridge refuses to exceed");
  await box.fill("  Una clave identifica una fila.  ");
  await answerAll(page);
  await send(page, form);
  assert.equal(submitted[0].ownWords, "Una clave identifica una fila.");
});

test("a blank own-words box sends no ownWords", { skip: SKIP }, async (t) => {
  const { page, submitted, form } = await open(t);
  await answerAll(page);
  await send(page, form);
  assert.equal("ownWords" in submitted[0], false);
});
