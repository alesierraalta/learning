// #338: a demo's frame takes the height its demo reports in a saved part and in the studio's reading sheet, as in the
// live reader. A real browser: the frame height is what the learner sees, so it is read, not inferred.
import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { startStudio as startStudioChecked } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

/**
 * These tests read the page, not the tutor's instructions: the context check is
 * off so the links a machine happens to have cannot decide a height assertion.
 */
const startStudio = (options) => startStudioChecked({ skipContextCheck: true, ...options });

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
const chromium = browser && (browser.chromium ?? browser.default.chromium);
const open = [];
// A studio is this file's handle: `afterEach` belongs to the test that opened it, so it always runs (#231).
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
});
after(async () => {
  for (const studio of open.splice(0)) await studio.close();
});

const demoPage = (body) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${body}</body></html>`;
// Two demos of the part: one taller than the 900 px cap, one shorter than the 420 px default.
function writeDemos(root) {
  const demos = join(root, "redes", "explicaciones", "demos");
  mkdirSync(demos, { recursive: true });
  writeFileSync(join(demos, "p1-alto.html"), demoPage('<div style="height:1200px"></div>'));
  writeFileSync(join(demos, "p1-corto.html"), demoPage('<div style="height:400px"></div>'));
}
// The frame's height in the document that holds it, as the learner's screen shows it.
const waitForFrame = (scope, title, height) =>
  scope.waitForFunction(([t, h]) => document.querySelector(`iframe[title="${t}"]`)?.clientHeight === h, [title, height], { timeout: 6000 });

test("a saved part frames each demo to the height the demo reports", { skip: chromium ? false : "playwright not installed" }, async (t) => {
  const { root, engine } = makeRoot();
  writeDemos(root);
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine, offlineCacheDir: join(root, ".cdn") });
  open.push(studio);
  const browserInstance = await chromium.launch();
  t.after(() => browserInstance.close());
  const page = await browserInstance.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${studio.url}api/offline?topic=redes&part=p1`, { waitUntil: "load" });
  await waitForFrame(page, "p1-alto.html", 900);
  await waitForFrame(page, "p1-corto.html", 400);
  assert.equal(await page.locator('iframe[title="p1-alto.html"]').evaluate((el) => el.clientHeight), 900, "a 1200 px demo gets the cap");
  assert.equal(await page.locator('iframe[title="p1-corto.html"]').evaluate((el) => el.clientHeight), 400, "a 400 px demo gets 400 px");
});

test("the studio's reading sheet frames each demo to the height the demo reports", { skip: chromium ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  writeDemos(root);
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const browserInstance = await chromium.launch();
  t.after(() => browserInstance.close());
  const page = await browserInstance.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${studio.url}#/leer/redes/p1`, { waitUntil: "networkidle" });
  const sheet = await page.waitForSelector("iframe.sheet[src]");
  // The sheet is the bridge's reader, served from another origin: its demos are nested one frame deeper.
  const reader = await sheet.contentFrame();
  await reader.waitForLoadState("load");
  await waitForFrame(reader, "p1-alto.html", 900);
  await waitForFrame(reader, "p1-corto.html", 400);
});
