// Layout tests in a real browser: the studio is a living page, and defects such
// as a sticky card covered by its own actions only exist once CSS, DOM and
// scrolling compose. Geometry is asserted, not eyeballed.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
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
