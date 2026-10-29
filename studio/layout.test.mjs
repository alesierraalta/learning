// Layout tests in a real browser: the studio is a living page, and defects such
// as a sticky card covered by its own actions only exist once CSS, DOM and
// scrolling compose. Geometry is asserted, not eyeballed.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
      return await import(id.startsWith("/") ? pathToFileURL(id).href : id);
    } catch {
      // try the next candidate: a machine without Playwright skips these tests
    }
  }
  return null;
}

const browser = await playwright();
const open = [];
after(async () => {
  for (const studio of open) await studio.close();
});

async function topicPage(page, studio, width, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

const geometry = (page) =>
  page.evaluate(() => {
    const card = document.querySelector("article.continue");
    const actions = document.querySelector(".side-actions");
    const sticky = card?.closest(".aside-sticky");
    if (!card || !actions || !sticky) return null;
    const a = card.getBoundingClientRect();
    const b = actions.getBoundingClientRect();
    return {
      overlap: Math.round(Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))),
      position: getComputedStyle(sticky).position,
      cardAlpha: getComputedStyle(card).backgroundColor.replace(/[\d.]+\)$/, (n) => n),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

test("topic column keeps the card above its actions while scrolling", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());

  await topicPage(page, studio, 1280);
  const first = await geometry(page);
  assert.ok(first, "the topic page renders the continue card");
  assert.equal(first.position, "sticky", "the card and its actions stick as one block");

  for (const y of [0, 200, 400, 600]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
    const seen = await geometry(page);
    assert.equal(seen.overlap, 0, `actions cover the card at scroll ${y}`);
    assert.equal(seen.cardAlpha, "rgb(250, 251, 251)", "the card stays opaque while pinned");
  }
});

test("topic page does not overflow a phone viewport", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());

  await topicPage(page, studio, 660);
  const seen = await geometry(page);
  assert.ok(seen, "the topic page renders the continue card");
  assert.equal(seen.position, "static", "on a narrow screen nothing is pinned");
  assert.ok(seen.pageOverflow <= 0, `page scrolls sideways by ${seen.pageOverflow}px`);
});

// The bridge serves the part from another port, so the sheet is a cross-origin
// frame: without delegation the browser refuses the microphone and dictation
// fails with "not-allowed" before asking the learner.
test("the reading sheet may use the microphone for dictation", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());

  await page.goto(`${studio.url}#/leer/redes/p1`, { waitUntil: "networkidle" });
  const sheet = await page.waitForSelector("iframe.sheet[src]");
  const frame = await sheet.contentFrame();
  await frame.waitForLoadState("load");
  assert.notEqual(new URL(frame.url()).origin, new URL(studio.url).origin, "the sheet is served cross-origin");
  assert.equal(await frame.evaluate(() => document.featurePolicy.allowsFeature("microphone")), true);
  // Demos inside the sheet ask for fullscreen; every frame up the chain must delegate it.
  assert.equal(await frame.evaluate(() => document.featurePolicy.allowsFeature("fullscreen")), true);
});

test("a topic that still owes parts says so instead of looking finished", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());

  await topicPage(page, studio, 1280);
  const banner = await page.locator(".empty", { hasText: "faltan" }).first().textContent();
  assert.match(banner, /El plan tiene 2 partes y 1 escrita: faltan 1 \(p2\)/);
  assert.equal(await page.locator(".empty button", { hasText: "Pedir las que faltan" }).count(), 1);

  const written = await page.locator("li.part-row", { hasText: "Capas" }).first().textContent();
  assert.match(written, /sin mini-quiz/, "a written part still says what it owes");
});

// Deleting is a promise kept: the note leaves the library only after the learner
// confirms it by name, and what leaves stays in the vault's trash.
test("deleting a note asks first, names it, and refreshes the library", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());

  await page.addInitScript(() => {
    try {
      localStorage.setItem("estudio.tutorial", "visto");
    } catch {
      /* private mode */
    }
  });
  await topicPage(page, studio, 1280);
  const remove = page.getByRole("button", { name: "Borrar el tema" });
  await remove.click();
  const dialog = page.getByRole("dialog");
  assert.match(await dialog.innerText(), /¿Mover «Redes» a la papelera\?/, "the dialog names the topic it will move");

  await page.getByRole("button", { name: "Cancelar" }).click();
  assert.equal(await dialog.count(), 0, "cancelling closes the dialog");
  assert.ok(existsSync(join(root, "redes")), "cancelling leaves the topic in place");

  await remove.click();
  await page.getByRole("button", { name: "Mover a la papelera" }).click();
  await page.getByText("«Redes» está en la papelera").waitFor({ timeout: 5000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Redes"), null, { timeout: 5000 });
  assert.equal(existsSync(join(root, "redes")), false, "the topic left the vault");
  const trash = readdirSync(join(root, ".papelera"));
  assert.equal(trash.length, 1, "it waits in the trash");
  assert.equal(existsSync(join(root, ".papelera", trash[0], "redes", "plan.json")), true, "with its plan intact");
});

// The editor closes the loop the vault used to close in Obsidian: one note is
// created, listed first, read with its deck, edited and read again — all at
// phone width, against the real server and a temporary root.
const scene = (label = "Memoria") => ({
  boxes: [{ x: 20, y: 40, w: 280, h: 60, label }],
  arrows: [{ x1: 160, y1: 110, x2: 160, y2: 170, label: "sigue" }],
});
const steps = (label) => [1, 2, 3].map((n) => ({ title: `Paso ${n}`, text: `Texto del paso ${n}`, scene: scene(label) }));
const noteBody = (heading, bodySteps) =>
  [
    `# ${heading}`,
    "",
    `<lk-walkthrough class="lk-wt-compact" title="${heading}"><script type="application/json">${JSON.stringify({ viewBox: "0 0 320 400", title: heading, steps: bodySteps })}</script></lk-walkthrough>`,
    "",
  ].join("\n");

async function phonePage(t) {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => {
    try {
      localStorage.setItem("estudio.tutorial", "visto");
    } catch {
      /* private mode */
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  return { root, page };
}

const editorBody = (page) => page.getByLabel(/Texto \(Markdown/);

async function readerFrame(page) {
  const frame = await (await page.waitForSelector(".reader iframe.sheet[src]")).contentFrame();
  await frame.waitForLoadState("load");
  return frame;
}

test("a quick note is created, listed first and edited through the reader", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, page } = await phonePage(t);
  const heading = "Nota con diapositivas";

  await page.getByRole("button", { name: "Nueva nota" }).click();
  await page.getByLabel("Título").fill(heading);
  await editorBody(page).fill(noteBody(heading, steps()));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 0), "the editor does not scroll sideways on a phone");

  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForFunction(() => location.hash.startsWith("#/rapido/"), null, { timeout: 10000 });
  const created = await readerFrame(page);
  assert.match(created.url(), /rapidos\/nota-con-diapositivas/, "the saved note opens in the real reader");
  await created.locator("lk-walkthrough svg").first().waitFor({ timeout: 15000 });
  assert.equal(readFileSync(join(root, "rapidos", "nota-con-diapositivas.md"), "utf8"), noteBody(heading, steps()));

  await page.locator("a.brand").click();
  await page.waitForFunction(() => location.hash === "#/");
  const first = page.locator(".quick-card").first();
  assert.match(await first.innerText(), /Nota con diapositivas/, "the new note is at the top of the library");
  await first.locator(".quick-open").click();
  await page.waitForFunction(() => location.hash === "#/rapido/nota-con-diapositivas");
  const reopened = await readerFrame(page);
  await reopened.locator("lk-walkthrough svg").first().waitFor({ timeout: 15000 });

  await page.locator("a.brand").click();
  await page.waitForFunction(() => location.hash === "#/");
  await page.locator(".quick-card").first().getByRole("button", { name: "Editar" }).click();
  await page.waitForFunction(() => location.hash.startsWith("#/editar/"));
  assert.match(await editorBody(page).inputValue(), /lk-walkthrough/, "the editor holds the Markdown with its deck");
  const preview = await page.waitForSelector(".editor-preview iframe.sheet[src]");
  assert.match(await preview.getAttribute("src"), /rapidos\/nota-con-diapositivas/, "the preview is the real reader page");

  const changed = `${noteBody(heading, steps()).trimEnd()}\n\nUn párrafo añadido desde el estudio.\n`;
  await editorBody(page).fill(changed);
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForFunction(() => location.hash === "#/rapido/nota-con-diapositivas", null, { timeout: 10000 });
  const edited = await readerFrame(page);
  await edited.getByText("Un párrafo añadido desde el estudio.").waitFor({ timeout: 15000 });
  await edited.locator("lk-walkthrough svg").first().waitFor({ timeout: 15000 });
  assert.equal(readFileSync(join(root, "rapidos", "nota-con-diapositivas.md"), "utf8"), changed);
});

test("a deck whose word does not fit is refused and the typed text stays", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, page } = await phonePage(t);
  const refused = noteBody("Nota rota", steps("sin corrección, la primera palabra no aparece"));

  await page.getByRole("button", { name: "Nueva nota" }).click();
  await page.getByLabel("Título").fill("Nota rota");
  await editorBody(page).fill(refused);
  await page.getByRole("button", { name: "Guardar" }).click();

  const problems = page.locator(".editor-problems");
  await problems.waitFor({ state: "visible", timeout: 10000 });
  assert.match(await problems.innerText(), /needs \d+px but has 280px at size 26/, "the server's problem is shown");
  assert.equal(await editorBody(page).inputValue(), refused, "the typed text stays");
  assert.equal(await page.getByLabel("Título").inputValue(), "Nota rota");
  assert.match(await page.evaluate(() => location.hash), /^#\/editar/, "the editor stays open");
  assert.equal(existsSync(join(root, "rapidos", "nota-rota.md")), false, "nothing was stored");
});
