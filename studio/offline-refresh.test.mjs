// A kept part follows the last version read online (#323, Design B). A part the device keeps is saved again in the
// background each time it is opened with a connection: the read never waits for that save, and a save that fails is
// not shown. These are browser tests: a machine without Playwright skips them, as the layout tests do.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { startStudio as startStudioChecked } from "./server.ts";
import { makeRoot } from "./testdata/root.mjs";

/** The tests read the page, not the links a machine happens to have: the context check is off, as in layout.test.mjs. */
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
      // the next candidate: a machine without Playwright skips these tests
    }
  }
  return null;
}

const browser = await playwright();
const open = [];
afterEach(async () => {
  for (const studio of open.splice(0)) await studio.close();
});

const NOTE_A = "# Parte 1 — Capas\n\nRevisión A del tutor: cada capa añade su cabecera.\n";
const NOTE_B = "# Parte 1 — Capas\n\nRevisión B del tutor: cada capa añade su cabecera, y el enlace comprueba el marco.\n";

/**
 * A studio whose topic's part 1 is `note`, in a browser that already holds the worker in control, as the learner's
 * device does after its first visit. `copy` is the address the saved copy of that part is kept under.
 */
async function learnerStudio(t, note) {
  const { root, engine, log } = makeRoot();
  const file = join(root, "redes", "explicaciones", "Parte 1 - Capas.md");
  writeFileSync(file, note);
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine, offlineCacheDir: mkdtempSync(join(tmpdir(), "offline-cdn-")) });
  open.push(studio);
  const instance = await (browser.chromium ?? browser.default).launch();
  t.after(() => instance.close());
  const context = await instance.newContext({ viewport: { width: 1500, height: 900 } });
  await context.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  const page = await context.newPage();
  await page.goto(studio.url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  return { page, studio, file, copy: `${new URL(studio.url).origin}/api/offline?topic=redes&part=p1` };
}

/** The learner opens part 1 in the reader, which is the frame the studio sets from the live page. */
const openPart = (page, studio) => page.goto(`${studio.url}#/leer/redes/p1`, { waitUntil: "load" });

/** The copy the device keeps for the part: what the worker answers with no connection, or null. */
const keptCopy = (page, key) =>
  page.evaluate(async (url) => {
    const hit = await (await caches.open("learning-studio")).match(url);
    return hit ? hit.text() : null;
  }, key);

/** Waits, up to `ms`, for the kept copy to carry `marker`, and returns the copy it last read. */
async function copyCarrying(page, key, marker, ms = 15_000) {
  const until = Date.now() + ms;
  let copy = await keptCopy(page, key);
  while (!copy?.includes(marker) && Date.now() < until) {
    await page.waitForTimeout(250);
    copy = await keptCopy(page, key);
  }
  return copy ?? "";
}

test("a kept part is saved again when it is opened with a connection", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio, file, copy } = await learnerStudio(t, NOTE_A);
  await openPart(page, studio);
  assert.match(await copyCarrying(page, copy, "Revisión A"), /Revisión A/, "the first open keeps the part");
  // The tutor writes a new version, and the learner opens the part again with a connection.
  writeFileSync(file, NOTE_B);
  await page.reload({ waitUntil: "load" });
  const kept = await copyCarrying(page, copy, "Revisión B");
  assert.match(kept, /Revisión B/, "the kept copy still holds the version read before the change");
  assert.doesNotMatch(kept, /Revisión A/, "and no version the learner no longer sees stays in it");
});

test("saving a kept part again neither holds the read nor shows an error", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio, copy } = await learnerStudio(t, NOTE_A);
  await openPart(page, studio);
  assert.match(await copyCarrying(page, copy, "Revisión A"), /Revisión A/, "the first open keeps the part");
  // The save of the next open never answers: the read must not wait for it, and the learner must see nothing.
  await page.evaluate(() => {
    const fetchNow = window.fetch.bind(window);
    window.fetch = (input, init) => (String(typeof input === "string" ? input : input.url).includes("/api/offline") ? new Promise(() => {}) : fetchNow(input, init));
  });
  await page.goto(`${studio.url}#/`, { waitUntil: "load" });
  await openPart(page, studio);
  await page.waitForFunction(() => document.querySelector("iframe.sheet")?.getAttribute("src")?.includes("/redes/p1"), null, { timeout: 15000 });
  assert.equal(await page.locator("p.empty:visible").count(), 0, "the read shows no error");
  assert.equal(await page.locator(".toast:visible").count(), 0, "a save that never answers says nothing");
  assert.match(await keptCopy(page, copy), /Revisión A/, "and the copy it did not replace stays");
});
