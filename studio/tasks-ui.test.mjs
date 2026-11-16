// The background tasks panel, exercised in a real browser against the fake Pi:
// reader work shows up as a task, its stream and dialogs live in the panel, and
// the main chat keeps its own turn and its own transcript.
import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL as fileUrl } from "node:url";

import { startStudio } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

const CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  "playwright",
  "/home/alesierraalta/.npm-global/lib/node_modules/playwright/index.mjs",
].filter(Boolean);

async function playwright() {
  for (const id of CANDIDATES) {
    try {
      return await import(id.startsWith("/") ? fileUrl(id).href : id);
    } catch {
      // another candidate, or a machine with no Playwright: the tests skip
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

async function pageAt(t, hash = "#/leer/redes/p1") {
  const { root, engine } = makeRoot();
  // The engine knows this topic, so the bridge's delivery belongs to its background task.
  writeFileSync(join(root, "redes", ".learning", "state.json"), "{}\n");
  const studio = await startStudio({
    root,
    piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")],
    enginePath: engine,
    skipContextCheck: true,
  });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 1280, height: 900 } }));
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  await page.goto(`${studio.url}${hash}`, { waitUntil: "networkidle" });
  return { studio, page, root };
}

/** What the hosted reader posts to the bridge: a question for this part. */
async function submitQuestion(page, text, announce) {
  const frame = await (await page.locator("iframe.sheet").elementHandle()).contentFrame();
  return frame.evaluate(async ({ question, message }) => {
    const response = await fetch(window.LEARNING_BRIDGE.submitUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "question", topic: "redes", part: "p1", text: question }),
    });
    if (!response.ok) throw new Error(`submit ${response.status}: ${await response.text()}`);
    if (message) parent.postMessage(message, "*");
  }, { question: text, message: announce });
}

const SUBMITTED = {
  type: "learning:submitted", kind: "mini-quiz", topic: "redes", part: "p1", score: "1/2",
  results: [
    { id: "q1", enunciado: "¿Qué capa enruta?", chosen: "E", chosenText: "No sé", correct: "B", correctText: "Red", ok: false },
    { id: "q2", enunciado: "¿Qué capa entrega?", chosen: "A", chosenText: "Transporte", correct: "A", correctText: "Transporte", ok: true },
  ],
};

test("a reader submission shows a working task with its transcript, dialog and badge", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await pageAt(t);
  await submitQuestion(page, "pregunta de fondo");
  await page.locator(".tasks-pill").click();

  await page.locator('.task-card[data-task="redes"]').waitFor({ timeout: 5000 });
  const card = page.locator('.task-card[data-task="redes"]');
  assert.equal(await card.locator(".task-title").innerText(), "Redes", "the library's human title, not the folder id");
  assert.match(await card.locator(".task-state").innerText(), /Trabajando|Preguntándote|Esperando turno/);
  assert.ok(["working", "asking", "waiting"].includes(await card.getAttribute("data-state")));
  await page.waitForFunction(() => document.querySelector('.task-card[data-task="redes"] .task-activity')?.textContent.trim().length > 0);
  await page.waitForFunction(() => document.querySelector('.task-card[data-task="redes"] .task-transcript')?.textContent.includes("Hola,"));
  assert.match(await card.locator(".task-transcript .activity").first().innerText(), /Escribiendo/, "tool rows are part of the task transcript");
  assert.equal(await page.locator(".thread .msg.assistant").filter({ hasText: "Hola," }).count(), 0, "task text never enters the main chat");

  await page.waitForFunction(() => document.querySelector(".tasks-pill")?.textContent.includes("te pregunta algo"), null, { timeout: 5000 });
  assert.equal(await page.locator(".thread .ask-card").count(), 0, "the task's dialog is not asked in the main chat");
  assert.equal(await card.locator(".ask-card").count(), 1);

  // The main chat is not refused or queued behind the task: its own turn starts now.
  await page.locator(".tasks-pill").click();
  await page.locator(".tutor-pill").click();
  await page.locator(".composer textarea").fill("genera una nota nueva");
  await page.locator(".composer .send").click();
  await page.waitForFunction(() => [...document.querySelectorAll(".thread .msg.user")].some((n) => n.textContent.includes("genera una nota nueva")), null, { timeout: 5000 });
  assert.equal(await card.getAttribute("data-state"), "asking", "the task is still held at its own dialog");
  assert.equal(await page.locator(".thread .notice.error").count(), 0);

  await page.locator(".tasks-pill").click();
  await card.locator(".ask-card").getByRole("button", { name: "Universitario" }).click();
  await page.waitForFunction(() => document.querySelector('.task-card[data-task="redes"]')?.dataset.state === "done", null, { timeout: 10000 });
  assert.match(await card.locator(".task-transcript").innerText(), /elegiste Universitario\./);
  assert.equal(await card.locator(".ask-card").count(), 0, "answering closes the task dialog");
});

test("aborting a task marks it failed without touching the main chat", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await pageAt(t);
  await submitQuestion(page, "trabajo que se detiene");
  await page.locator(".tasks-pill").click();
  const card = page.locator('.task-card[data-task="redes"]');
  await card.waitFor({ timeout: 5000 });
  await card.getByRole("button", { name: /Detener/ }).click();
  await page.waitForFunction(() => document.querySelector('.task-card[data-task="redes"]')?.dataset.state === "failed", null, { timeout: 10000 });
  assert.match(await card.locator(".task-state").innerText(), /Fallida|Detenida/);
  assert.equal(await page.locator(".thread").innerText().then((text) => text.includes("trabajo que se detiene")), false);
});

test("a reader result waits for its topic's task, not for the main chat", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await pageAt(t);
  await submitQuestion(page, "leyendo tus análisis", SUBMITTED);
  await page.waitForFunction(() => location.hash === "#/resultados/redes/p1", null, { timeout: 5000 });
  await page.locator(".tasks-pill").click();
  const results = page.locator(".results");
  await results.getByText("El agente está leyendo tus análisis").waitFor();

  const card = page.locator('.task-card[data-task="redes"]');
  await card.waitFor({ timeout: 5000 });
  await card.locator(".ask-card").getByRole("button", { name: "Universitario" }).waitFor({ timeout: 5000 });
  assert.equal(await results.getByText("El agente está leyendo tus análisis").count(), 1, "still waiting while the task holds a dialog");

  await card.locator(".ask-card").getByRole("button", { name: "Universitario" }).click();
  await page.locator(".tasks-pill").click();
  const next = results.getByRole("button", { name: "Ir a lo siguiente" });
  await next.waitFor({ timeout: 10000 });
  assert.equal(await results.getByText("El agente está leyendo tus análisis").count(), 0);
  await next.click();
  await page.waitForFunction(() => location.hash === "#/leer/redes/quiz", null, { timeout: 5000 });
});
