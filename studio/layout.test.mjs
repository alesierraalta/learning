// Layout tests in a real browser: the studio is a living page, and defects such
// as a sticky card covered by its own actions only exist once CSS, DOM and
// scrolling compose. Geometry is asserted, not eyeballed.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

/** The prompts the fake Pi received, waiting for the first send to land. */
async function sentPrompts(log) {
  for (let i = 0; i < 50; i++) {
    const lines = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
    const prompts = lines.map((line) => JSON.parse(line)).filter((c) => c.type === "prompt").map((c) => c.message);
    if (prompts.length) return prompts;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

test("panorama verdict colors and detail link follow recorded evidence (S12-S14)", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine } = makeRoot();
  writeFileSync(join(root, "redes", "diagnostico-conceptos.json"), JSON.stringify({ conceptos: [
    { codigo: "1.1.1", estado: "claro", evidencia: "Explicó las capas" },
    { codigo: "1.1.2", estado: "dudoso", evidencia: "Parcial" },
    { codigo: "1.2.1.1", estado: "laguna", evidencia: "Falta" },
  ] }));
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 390, height: 844 } }));
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem('estudio.tutorial', 'visto'));
  await page.goto(`${studio.url}#/panorama/redes/mapa`, { waitUntil: "networkidle" });
  await page.locator('[data-node="N1_1_1"]').click();
  assert.match(await page.locator('.pano-detail').innerText(), /Explicó las capas/);
  for (const [id, fill] of [['N1_1_1', '#d4edda'], ['N1_1_2', '#fff3cd'], ['N1_2_1_1', '#f8d7da'], ['N1_9_1', '#dbeafe']]) {
    assert.match(await page.locator(`[data-node="${id}"] rect`).getAttribute('style'), new RegExp(fill));
  }
  await page.getByRole('button', { name: 'Leer esta parte' }).click();
  assert.match(page.url(), /#\/leer\/redes\/p1/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});

test("panorama navigation and routes hide unreached parts (S9, S15)", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine } = makeRoot();
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem('estudio.tutorial', 'visto'));
  await page.goto(`${studio.url}#/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Panorama del tema' }).first().click();
  await page.getByRole('button', { name: 'Volver' }).click();
  assert.ok(page.url().endsWith('#/'));
  await topicPage(page, studio, 1280);
  assert.equal(await page.locator('.route').getByText('TCP', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Panorama del tema' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/panorama/'));
  await page.locator('.route').getByText('TCP', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.route').getByText('TCP', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Volver' }).click();
  assert.ok(page.url().endsWith('#/tema/redes'));
});

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

// The flow lists only written parts, including when the engine does not track the topic.
test("the topic route hides unwritten parts and their requests", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await topicPage(page, studio, 1280);
  assert.equal(await page.locator("li.part-row", { hasText: "TCP" }).count(), 0);
  assert.equal(await page.locator("li.part-row").getByRole("button", { name: "Escribir esta parte" }).count(), 0);

  // The same rule holds without engine tracking.
  rmSync(join(root, "redes", ".learning"), { recursive: true });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("li.part-row", { hasText: "TCP" }).count(), 0, "unwritten parts remain hidden without engine tracking");
  assert.equal((await page.locator("article.continue .actions button").first().textContent()).trim(), "Escribir la Parte 2", "and it is the card's next step too");
});

// After the diagnosis the engine can sit on an explanation stage whose part has no
// file yet: the card must ask for that part, not send the learner back to itself.
test("the next step asks the tutor to write the part the engine names", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot({ status: { status: "waiting", stage: "explanation", nextStage: "explanation", part: "p2" } });
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await topicPage(page, studio, 1280);
  const card = page.locator("article.continue");
  assert.match(await card.innerText(), /La Parte 2 todavía no está escrita/);
  const cta = card.locator(".actions button").first();
  assert.notEqual((await cta.innerText()).trim(), "Ver el tema", "the card offers the action, not the page it is on");
  await cta.click();
  assert.match((await sentPrompts(log))[0], /Parte 2/);
});

// The engine may not name a part at all; the first one missing is still the one owed.
test("the next step asks for the first missing part when the engine names none", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot({ status: { status: "waiting", stage: "explanation", nextStage: "explanation" } });
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await topicPage(page, studio, 1280);
  const card = page.locator("article.continue");
  await card.locator(".actions button").first().click();
  assert.match((await sentPrompts(log))[0], /Parte 2/, "the missing part, not a vague follow-up");
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

// On a phone the chrome above a part must leave the screen to the reading: the
// title stays whole, every control is a touch target with a name, and the sheet
// starts high.
test("the reader bar stays compact and readable on a phone", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 360, height: 760 } }));
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await page.goto(`${studio.url}#/leer/redes/p1`, { waitUntil: "networkidle" });
  await page.waitForSelector("iframe.sheet[src]");
  const seen = await page.evaluate(() => {
    const title = document.querySelector(".reader-bar .title");
    const controls = [...document.querySelectorAll(".reader-bar button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { name: b.getAttribute("aria-label") || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    });
    return {
      clipped: title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1,
      controls,
      sheetTop: Math.round(document.querySelector("iframe.sheet").getBoundingClientRect().top),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert.equal(seen.clipped, false, "the part title is cut");
  for (const c of seen.controls) {
    assert.ok(c.name, `a reader control has no name: ${JSON.stringify(c)}`);
    assert.ok(c.w >= 32 && c.h >= 32, `undersized control: ${JSON.stringify(c)}`);
    assert.ok(c.right <= 360, `control off screen: ${JSON.stringify(c)}`);
  }
  assert.deepEqual(seen.controls.map((c) => c.name), ["Volver", "Explicación", "App interactiva", "Preguntar", "Borrar"]);
  assert.ok(seen.sheetTop <= 150, `the sheet starts at ${seen.sheetTop}px`);
  assert.ok(seen.pageOverflow <= 0, `page scrolls sideways by ${seen.pageOverflow}px`);
});

test("the home ask field and section headings fit a phone", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 360, height: 760 } }));
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".ask-big input");
  const seen = await page.evaluate(() => {
    const form = document.querySelector(".ask-big");
    const input = form.querySelector("input");
    const lines = (node) => { const r = document.createRange(); r.selectNodeContents(node); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
    return {
      inputShare: input.getBoundingClientRect().width / form.clientWidth,
      wrapped: [...document.querySelectorAll(".section-title h2")].filter((h2) => lines(h2) > 1).map((h2) => h2.textContent),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert.ok(seen.inputShare >= 0.85, `the ask field gets ${Math.round(seen.inputShare * 100)}% of its form`);
  assert.deepEqual(seen.wrapped, [], "section titles break into several lines");
  assert.ok(seen.pageOverflow <= 0, `page scrolls sideways by ${seen.pageOverflow}px`);
});

// The tutorial slides are a 1920-wide canvas: on a phone they shrink to a few
// pixels of text, so each step also reads as a caption and every control stays
// a real touch target outside the scaled slide.
test("the tutorial reads and works on a phone", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 360, height: 760 } }));
  t.after(() => page.context().browser().close());

  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  const deck = page.locator(".deck");
  await deck.waitFor();
  const controls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".deck button")]
        .filter((b) => !b.closest(".deck-slide") && b.getBoundingClientRect().width > 0)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { name: b.getAttribute("aria-label") || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), font: parseFloat(getComputedStyle(b).fontSize), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
        }),
    );
  const caption = page.locator(".deck-caption");
  const first = (await caption.textContent()).trim();
  assert.ok(first.length > 0, "the first step has no caption");
  assert.ok(parseFloat(await caption.evaluate((n) => getComputedStyle(n).fontSize)) >= 14, "the caption is too small to read");
  for (const c of await controls()) {
    assert.ok(c.w >= 32 && c.h >= 32 && c.inside, `undersized or off-screen tutorial control: ${JSON.stringify(c)}`);
  }
  await page.locator(".deck-controls .btn.primary").click();
  assert.notEqual((await caption.textContent()).trim(), first, "the caption does not follow the steps");

  // The last slide ends with its two choices: they must be usable, not a scaled drawing.
  await page.locator(".deck-dots button").last().click();
  for (let i = 0; i < 10 && (await page.locator(".deck-controls .btn.primary").textContent()) !== "Terminar"; i++) await page.locator(".deck-controls .btn.primary").click();
  const finale = (await controls()).filter((c) => c.name === "Empezar un tema" || c.name === "Ver mis temas");
  assert.equal(finale.length, 2, JSON.stringify(await controls()));
  for (const c of finale) assert.ok(c.h >= 32 && c.font >= 12 && c.inside, JSON.stringify(c));
});

test("top bar and tutor controls are touch targets on a phone", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 360, height: 760 } }));
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  await page.click(".tutor-pill");
  await page.waitForTimeout(400);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll(".topbar a, .topbar button, .drawer button, .drawer a")]
      .filter((n) => n.getBoundingClientRect().width > 0 && getComputedStyle(n).visibility !== "hidden")
      .map((n) => { const r = n.getBoundingClientRect(); return { name: n.getAttribute("aria-label") || n.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((c) => c.w < 32 || c.h < 32),
  );
  assert.deepEqual(small, [], "controls under 32px");
});

// TSP pins for the responsive milestone: the tutorial's two final choices and its
// words must survive the phone being turned, and a phone held sideways is still a
// phone; the reader bar keeps a long one-word title whole at 320 px.
async function tutorialAtEnd(t, width, height) {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width, height } }));
  t.after(() => page.context().browser().close());
  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".deck");
  await page.locator(".deck-dots button").last().click();
  for (let i = 0; i < 10 && (await page.locator(".deck-controls .btn.primary").textContent()) !== "Terminar"; i++) await page.locator(".deck-controls .btn.primary").click();
  return page;
}
const finaleChoices = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".deck button")]
      .filter((b) => /^(Empezar un tema|Ver mis temas)$/.test(b.textContent.trim()))
      .map((b) => {
        const r = b.getBoundingClientRect();
        const scale = b.offsetHeight ? r.height / b.offsetHeight : 0;
        return { name: b.textContent.trim(), h: Math.round(r.height), font: Math.round(parseFloat(getComputedStyle(b).fontSize) * scale), inside: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
      }),
  );

test("the tutorial's final choices survive turning the phone", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const page = await tutorialAtEnd(t, 360, 760);
  await page.setViewportSize({ width: 760, height: 360 });
  await page.waitForTimeout(300);
  const choices = await finaleChoices(page);
  assert.equal(choices.length, 2, JSON.stringify(choices));
  for (const c of choices) assert.ok(c.inside && c.h >= 32 && c.font >= 12, `unusable after turning: ${JSON.stringify(c)}`);
});

test("a phone held sideways gets a readable, usable tutorial", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const page = await tutorialAtEnd(t, 844, 390);
  const choices = await finaleChoices(page);
  assert.equal(choices.length, 2, JSON.stringify(choices));
  for (const c of choices) assert.ok(c.inside && c.h >= 32 && c.font >= 12, `unusable sideways: ${JSON.stringify(c)}`);
  const caption = await page.locator(".deck-caption").evaluate((n) => ({ text: n.textContent.trim(), visible: n.getBoundingClientRect().height > 0, font: parseFloat(getComputedStyle(n).fontSize) }));
  assert.ok(caption.visible && caption.text && caption.font >= 14, `the step's words are not readable sideways: ${JSON.stringify(caption)}`);
});

test("the reader bar keeps a long one-word title whole at 320 px", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  const topic = join(root, "redes");
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "Redes", parts: [{ id: "p1", title: "Capas", slug: "Capas" }, { id: "p2", title: "Retropropagación", slug: "Retro" }, { id: "p3", title: "TCP", slug: "TCP" }] }));
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Retro.md"), "# Parte 2\n");
  writeFileSync(join(topic, "explicaciones", "Parte 3 - TCP.md"), "# Parte 3\n");
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage({ viewport: { width: 320, height: 700 } }));
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  await page.goto(`${studio.url}#/leer/redes/p2`, { waitUntil: "networkidle" });
  await page.waitForSelector(".reader-bar .title");
  const seen = await page.evaluate(() => {
    const title = document.querySelector(".reader-bar .title");
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = [...range.getClientRects()];
    const right = Math.max(...text.map((r) => r.right));
    const covered = [...document.querySelectorAll(".reader-bar button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return text.some((x) => x.left < r.right && x.right > r.left && x.top < r.bottom && x.bottom > r.top);
    }).map((b) => b.getAttribute("aria-label") || b.textContent.trim());
    return { clipped: title.scrollWidth > title.clientWidth + 1, right: Math.round(right), covered };
  });
  assert.deepEqual(seen.covered, [], `the title runs under the reader controls: ${JSON.stringify(seen)}`);
  assert.equal(seen.clipped, false, `the title overflows its box: ${JSON.stringify(seen)}`);
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

test("the preview draws the draft before it is saved", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, page } = await phonePage(t);
  const heading = "Borrador dibujado";
  const typed = noteBody(heading, steps("El borrador"));

  await page.getByRole("button", { name: "Nueva nota" }).click();
  await page.getByLabel("Título").fill(heading);
  await editorBody(page).fill(typed);

  const frameElement = await page.waitForSelector(".editor-preview iframe.sheet[src]", { timeout: 15000 });
  assert.match(await frameElement.getAttribute("src"), /\/borrador\/[0-9a-f]{32}$/, "the frame points at a draft, not at a saved note");
  const frame = await frameElement.contentFrame();
  await frame.waitForLoadState("load");
  await frame.locator("lk-walkthrough svg").first().waitFor({ timeout: 15000 });
  // The deck title is styled in caps, so compare without case.
  assert.match(await frame.locator(".lk-title").first().innerText(), /borrador dibujado/i, "the draft is drawn by the real reader");

  // The draft never touched the vault and the textarea keeps exactly what was typed.
  assert.equal(existsSync(join(root, "rapidos", "borrador-dibujado.md")), false, "nothing was written");
  assert.equal(await editorBody(page).inputValue(), typed);
  assert.equal(await page.getByLabel("Título").inputValue(), heading);
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

// After the tutor builds an explanation, its reply ends with the way to the note it wrote.
// `writes(root)` scripts the turn's writes (see FAKE_PI_WRITES in testdata/fake-pi.mjs).
async function tutorTurn(t, writes) {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  process.env.FAKE_PI_WRITES = JSON.stringify(writes(root));
  t.after(() => delete process.env.FAKE_PI_WRITES);
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  await page.locator(".tutor-pill").click();
  await page.getByLabel("Mensaje para el tutor").fill("Explícame algo.");
  await page.getByLabel("Mensaje para el tutor").press("Enter");
  await page.locator(".ask-card").getByRole("button", { name: "Universitario" }).click();
  // The turn is over once the tutor is idle again and the library it changed is loaded.
  await page.waitForFunction(() => /Listo/.test(document.querySelector(".drawer-head h2")?.textContent ?? ""), null, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  return { root, page, studio };
}

async function offersAndOpens(t, written, hash) {
  const { page } = await tutorTurn(t, (root) => [{ path: join(root, written) }]);

  const offer = page.locator(".thread .note-cta");
  await offer.waitFor({ timeout: 10000 });
  assert.equal(await offer.count(), 1, "one offer per turn");
  assert.ok(
    await page.evaluate(() => document.querySelector(".thread")?.lastElementChild?.matches(".note-cta")),
    "the offer closes the turn, under the tutor's reply",
  );
  await offer.getByRole("button", { name: "Ir a la nota" }).click();
  await page.waitForFunction((expected) => location.hash === expected, hash, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.body.classList.contains("drawer-open")), false, "the note is not hidden behind the tutor");
}

test("the chat offers the part the tutor just wrote and opens it", { skip: browser ? false : "playwright not installed" }, (t) =>
  offersAndOpens(t, "redes/explicaciones/Parte 1 - Capas.html", "#/leer/redes/p1"));

test("the chat offers the quick note the tutor just wrote and opens it", { skip: browser ? false : "playwright not installed" }, (t) =>
  offersAndOpens(t, "rapidos/hash.md", "#/rapido/hash"));

// The main flow: the first part of a topic that did not exist when the turn began.
test("the chat offers the first part of a topic the tutor just created", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio } = await tutorTurn(t, (root) => [
    { path: join(root, "nuevo", "plan.json"), content: JSON.stringify({ topic: "Nuevo", parts: [{ id: "p1", title: "Intro", slug: "Intro" }] }) },
    { path: join(root, "nuevo", "explicaciones", "Parte 1 - Intro.md"), content: "# Parte 1 — Intro\n" },
  ]);
  const library = await (await fetch(`${studio.url}api/library`)).json();
  assert.ok(library.topics.some((topic) => topic.id === "nuevo"), "the library lists the new topic once the turn is over");
  const offer = page.locator(".thread .note-cta");
  assert.equal(await offer.count(), 1, "the new topic's part is offered");
  await offer.getByRole("button", { name: "Ir a la nota" }).click();
  await page.waitForFunction(() => location.hash === "#/leer/nuevo/p1", null, { timeout: 5000 });
});

test("a turn with several notes offers the last one written", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await tutorTurn(t, (root) => [{ path: join(root, "redes", "explicaciones", "Parte 1 - Capas.md") }, { path: join(root, "rapidos", "hash.md") }]);
  const offer = page.locator(".thread .note-cta");
  assert.equal(await offer.count(), 1, "one offer per turn");
  await offer.getByRole("button", { name: "Ir a la nota" }).click();
  await page.waitForFunction(() => location.hash === "#/rapido/hash", null, { timeout: 5000 });
});

async function offersNothing(t, writes) {
  const { page } = await tutorTurn(t, writes);
  assert.equal(await page.locator(".thread .note-cta").count(), 0, "no way to a note that is not there");
}

test("the chat offers no note for a write that failed", { skip: browser ? false : "playwright not installed" }, (t) =>
  offersNothing(t, (root) => [{ path: join(root, "rapidos", "hash.md"), isError: true }]));

test("the chat offers no note for a path the reader cannot open", { skip: browser ? false : "playwright not installed" }, (t) =>
  offersNothing(t, (root) => [{ path: join(root, "redes", "explicaciones", "rapidos", "hash.md") }]));

// The learner never has to guess what the tutor's reply means: a turn that worked on a topic
// ends with that topic's next step as a button (the fake engine has «redes» waiting at the diagnosis).
test("a turn that worked on a topic ends with its next step as a button", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await tutorTurn(t, (root) => [{ path: join(root, "redes", "diagnostico-conceptos.json"), content: "{}" }]);
  const next = page.locator(".thread .next-cta");
  await next.waitFor({ timeout: 10000 });
  assert.equal(await next.count(), 1, "one next step per turn");
  assert.match(await next.innerText(), /Responde el diagnóstico inicial/);
  assert.equal(await page.locator(".thread .note-cta").count(), 0, "no note was written");
  await next.getByRole("button", { name: "Responder el diagnóstico" }).click();
  await page.waitForFunction(() => location.hash === "#/leer/redes/quiz", null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.body.classList.contains("drawer-open")), false, "the next step is not hidden behind the tutor");
});

test("a turn that touched no topic offers no next step", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await tutorTurn(t, (root) => [{ path: join(root, "rapidos", "hash.md") }]);
  await page.locator(".thread .note-cta").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".thread .next-cta").count(), 0);
});

// A plain studio page for the flows below: the fake Pi runs one turn per prompt.
async function studioPage(t, prepare = () => {}) {
  const { root, engine, log } = makeRoot();
  prepare(root);
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine, openedFile: join(root, "..", `${root.split("/").pop()}-opened.json`) });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  return { root, studio, page };
}

test("tool activity never carries the way to a note: only the end of the turn does", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page } = await tutorTurn(t, (root) => [{ path: join(root, "redes", "explicaciones", "Parte 1 - Capas.md") }]);
  await page.locator(".thread .note-cta").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".thread .activity").count() > 0, true, "the write is shown as activity");
  assert.equal(await page.locator(".thread .activity button").count(), 0, "no button inside an activity row");
});

test("a quick note the library does not list yet opens as a quick note, never as topic undefined", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, studio, page } = await studioPage(t);
  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  writeFileSync(join(root, "rapidos", "nueva.md"), "# Nueva\n");
  const views = [];
  page.on("request", (request) => { if (request.url().includes("api/view")) views.push(request.url()); });
  await page.evaluate(() => { location.hash = "#/rapido/nueva"; });
  await page.waitForFunction(() => document.querySelector("iframe.sheet")?.getAttribute("src"), null, { timeout: 5000 });
  assert.ok(views.some((url) => url.endsWith("api/view?quick=nueva")), views.join("\n"));
  assert.equal(views.some((url) => url.includes("topic=")), false, views.join("\n"));
});

test("topics are listed by the last time they were opened", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await studioPage(t, (root) => {
    mkdirSync(join(root, "algebra", ".learning"), { recursive: true });
    writeFileSync(join(root, "algebra", "plan.json"), JSON.stringify({ topic: "Álgebra", parts: [{ id: "p1", title: "Grupos", slug: "Grupos" }] }));
  });
  const titles = () => page.locator(".cards .card h3").allTextContents();
  await page.goto(`${studio.url}#/`, { waitUntil: "networkidle" });
  assert.deepEqual((await titles()).slice(0, 2), ["Álgebra", "Redes"], "never opened: the usual order");
  await page.evaluate(() => { location.hash = "#/tema/redes"; });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForLoadState("networkidle");
  assert.deepEqual((await titles()).slice(0, 2), ["Redes", "Álgebra"], "the topic just opened comes first");
  await page.reload({ waitUntil: "networkidle" });
  assert.deepEqual((await titles()).slice(0, 2), ["Redes", "Álgebra"], "the order survives a reload");
});

const SUBMITTED = {
  type: "learning:submitted", kind: "mini-quiz", topic: "redes", part: "p1", score: "1/2",
  results: [
    { id: "q1", enunciado: "¿Qué capa enruta?", chosen: "E", chosenText: "No sé", correct: "B", correctText: "Red", ok: false },
    { id: "q2", enunciado: "¿Qué capa entrega?", chosen: "A", chosenText: "Transporte", correct: "A", correctText: "Transporte", ok: true },
  ],
};

test("a submitted quiz opens its results while the tutor reads them, then offers the next step", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await studioPage(t);
  await page.goto(`${studio.url}#/leer/redes/p1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("iframe.sheet")?.getAttribute("src"), null, { timeout: 5000 });
  // Only the reading frame may announce a submission.
  await page.evaluate((message) => postMessage(message, "*"), SUBMITTED);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), "#/leer/redes/p1", "a message from elsewhere is ignored");
  const frame = await (await page.locator("iframe.sheet").elementHandle()).contentFrame();
  await frame.evaluate((message) => parent.postMessage(message, "*"), SUBMITTED);
  await page.waitForFunction(() => location.hash === "#/resultados/redes/p1", null, { timeout: 5000 });
  const results = page.locator(".results");
  await results.getByText("1/2").first().waitFor();
  await results.getByText("¿Qué capa enruta?").waitFor();
  await results.getByText("No sé").first().waitFor();
  await results.getByText("El agente está leyendo tus análisis").waitFor();
  assert.equal(await results.getByRole("button", { name: "Ir a lo siguiente" }).count(), 0);
  // The bridge sends the submission to the tutor as a prompt; here the page sends it.
  await page.evaluate(async () => {
    const response = await fetch("prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "[Vista HTML · redes · p1] respuestas" }) });
    if (!response.ok) throw new Error(`prompt ${response.status}`);
  });
  await page.locator(".ask-card").getByRole("button", { name: "Universitario" }).waitFor({ timeout: 5000 });
  assert.equal(await results.getByText("El agente está leyendo tus análisis").count(), 1, "still reading while the tutor works");
  await page.locator(".ask-card").getByRole("button", { name: "Universitario" }).click();
  const next = results.getByRole("button", { name: "Ir a lo siguiente" });
  await next.waitFor({ timeout: 10000 });
  assert.equal(await results.getByText("El agente está leyendo tus análisis").count(), 0);
  await next.click();
  // The fake engine waits for the diagnosis: that is the topic's next step.
  await page.waitForFunction(() => location.hash === "#/leer/redes/quiz", null, { timeout: 5000 });
});

test("results without a submission go back to the topic", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { studio, page } = await studioPage(t);
  await page.goto(`${studio.url}#/resultados/redes/p1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => location.hash === "#/tema/redes", null, { timeout: 5000 });
});

// The panorama is the wide surface for the whole topic: the plan the tutor wrote
// and the map of concepts, each readable on its own, both openable.
test("the panorama shows the plan as a route the learner can walk", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await page.goto(`${studio.url}#/panorama/redes`, { waitUntil: "networkidle" });
  await page.waitForSelector(".pano-head", { timeout: 5000 });

  const chips = await page.locator(".pano-chips").textContent();
  assert.match(chips, /1 de 2 partes escritas/, "the chips count what is written");
  assert.match(chips, /3\/5/, "the diagnosis score comes from the plan's own header");
  assert.match(chips, /4 conceptos en el mapa/, "and the map is part of the same picture");

  const route = page.locator("ol.route li.part-row");
  assert.equal(await route.count(), 2, "one row per part of the route");
  assert.match(await route.first().innerText(), /Capas/);
  assert.match(await route.first().innerText(), /1\.1/, "the row names the subtema the plan assigned");
  assert.equal(await route.first().getByRole("button", { name: "Leer" }).count(), 1, "a written part opens");
  assert.match(await route.nth(1).innerText(), /TCP/);
  assert.equal(await route.nth(1).getByRole("button", { name: "Escribir esta parte" }).count(), 1, "an unwritten part is a request");

  const titles = await page.locator("details.pano-section > summary .title").allInnerTexts();
  assert.deepEqual(titles, ["Resultado", "Ruta"], "the prose sections stay, the map section does not");
  assert.match(await page.locator("details.pano-section").first().innerText(), /Puntaje 3\/5/, "the first section is open with its own words");
  const ruta = page.locator("details.pano-section").last();
  await ruta.locator("summary").click();
  assert.match(await ruta.innerText(), /Primero las capas, después el transporte/, "a closed section opens when the learner asks");
  await page.locator(".pano-tabs").getByRole("tab", { name: "Mapa de dependencias" }).click();
  await page.waitForFunction(() => location.hash === "#/panorama/redes/mapa", null, { timeout: 5000 });

  // Without a map the panorama asks for one instead of showing an empty frame.
  rmSync(join(root, "redes", "mapa.mmd"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".pano-ask", { timeout: 5000 });
  await page.locator(".pano-ask").getByRole("button", { name: "Pedir el mapa de dependencias" }).click();
  const sent = await sentPrompts(log);
  assert.match(sent[0], /mapa\.mmd/, "the missing piece is one request away");
});

// A concept is not a label: opening it says what it needs, what it unlocks and
// which part of the route explains it, even when no part covers it yet.
test("the panorama map opens a concept and reaches the part that explains it", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { root, engine, log } = makeRoot();
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const page = await (browser.chromium ?? browser.default).launch().then((b) => b.newPage());
  t.after(() => page.context().browser().close());
  await page.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));

  await page.goto(`${studio.url}#/panorama/redes/mapa`, { waitUntil: "networkidle" });
  await page.waitForSelector("svg.pano-svg", { timeout: 5000 });
  assert.equal(await page.locator("g.pano-node").count(), 4, "every concept the map declares is drawn");
  assert.equal(await page.locator("g.pano-frame").count(), 2, "each subtema keeps its own frame");

  const columns = await page.evaluate(() => [...document.querySelectorAll("g.pano-frame")].map((frame) => Math.round(frame.getBoundingClientRect().left)));
  assert.ok(columns[1] > columns[0] + 100, "the subtemas sit side by side, not stacked in one column");

  await page.locator('[data-node="N1_2_1_1"]').click();
  const detail = page.locator(".pano-detail");
  assert.match(await detail.innerText(), /Concepto 1\.2\.1\.1/);
  assert.match(await detail.innerText(), /Puerto/);
  assert.equal(await detail.getByRole("button", { name: /1\.1\.2/ }).count(), 1, "what the concept needs is a link to it");
  assert.match(await detail.innerText(), /Parte 2 · TCP/, "the part that explains it is named");
  await detail.getByRole("button", { name: "Escribir esta parte" }).click();
  const sent = await sentPrompts(log);
  assert.match(sent[0], /Parte 2/);
  assert.match(sent[0], /TCP/);

  await page.locator('[data-node="N1_9_1"]').click();
  assert.match(await page.locator(".pano-detail").innerText(), /no tiene una parte para el subtema 1\.9\.1/, "a concept outside the route says so");
  assert.equal(await page.locator(".pano-detail").getByRole("button", { name: "Pedir la parte de 1.9.1" }).count(), 1, "and the learner can ask for it");
});

// ---------- iPad ----------
// An iPad is neither a phone nor a desktop: upright it is 744–1024 px wide, sideways
// 1133–1366 px, it has no hover and a finger is the pointer. The open tutor takes 440 px
// out of that, so a layout has to answer to the room it is given, not to the screen.
async function ipadPage(t, width, height, prepare = () => {}) {
  const { root, engine, log } = makeRoot();
  prepare(root);
  process.env.FAKE_PI_LOG = log;
  const studio = await startStudio({ root, piCommand: [process.execPath, join(import.meta.dirname, "testdata", "fake-pi.mjs")], enginePath: engine });
  open.push(studio);
  const context = await (browser.chromium ?? browser.default).launch().then((b) => b.newContext({ viewport: { width, height }, hasTouch: true }));
  t.after(() => context.browser().close());
  await context.addInitScript(() => localStorage.setItem("estudio.tutorial", "visto"));
  const page = await context.newPage();
  return { page, studio, log, root };
}

const tracks = (page, selector) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(" ").length, selector);

test("an iPad held sideways with the tutor open gives the topic one readable column", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio } = await ipadPage(t, 1180, 820);
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await page.locator(".tutor-pill").click();
  await page.waitForTimeout(400);
  assert.equal(await tracks(page, ".topic-head"), 1, "beside the tutor the route and its card stack instead of squeezing side by side");
  const title = await page.locator(".topic-head h1").boundingBox();
  assert.ok(title.width >= 560, `the title keeps a line long enough to read: ${Math.round(title.width)}px`);

  await page.goto(`${studio.url}#/panorama/redes`, { waitUntil: "networkidle" });
  await page.waitForSelector(".pano-body");
  assert.equal(await tracks(page, ".pano-body"), 1, "the panorama stacks too");
  const row = await page.locator("ol.route li.part-row h3").first().boundingBox();
  assert.ok(row.width >= 360, `a route row is not one word per line: ${Math.round(row.width)}px`);
});

test("an iPad held sideways with the tutor closed keeps the two columns", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio } = await ipadPage(t, 1180, 820);
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  assert.equal(await tracks(page, ".topic-head"), 2, "with the whole screen the card sits beside the route");
});

test("on an upright iPad the open tutor dims the page and a tap outside closes it", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio } = await ipadPage(t, 820, 1180);
  await page.goto(`${studio.url}#/tema/redes`, { waitUntil: "networkidle" });
  await page.locator(".tutor-pill").click();
  await page.waitForTimeout(400);
  const scrim = page.locator(".scrim");
  assert.equal(await scrim.isVisible(), true, "the page behind the tutor is dimmed, not cut mid-word");
  await page.mouse.click(120, 700);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.body.classList.contains("drawer-open")), false, "a tap on the page closes the tutor");
  assert.equal(await scrim.isVisible(), false);
});

test("every control on an iPad is a finger-sized target", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio } = await ipadPage(t, 820, 1180);
  const small = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".topbar a, .topbar button, .stage button, .stage a, .stage summary, .drawer button")]
        .filter((n) => !n.closest("svg") && n.getBoundingClientRect().width > 0 && getComputedStyle(n).visibility !== "hidden")
        .map((n) => { const r = n.getBoundingClientRect(); return { name: (n.getAttribute("aria-label") || n.textContent).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter((c) => c.h < 44 || c.w < 44),
    );
  for (const hash of ["#/", "#/tema/redes", "#/panorama/redes", "#/panorama/redes/mapa"]) {
    await page.goto(`${studio.url}${hash}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    assert.deepEqual(await small(), [], `targets under 44px on ${hash}`);
  }
  await page.locator(".tutor-pill").click();
  await page.waitForTimeout(400);
  assert.deepEqual(await small(), [], "targets under 44px in the tutor");

  await page.goto(`${studio.url}#/panorama/redes`, { waitUntil: "networkidle" });
  const home = page.locator(".crumbs a").first();
  assert.equal((await home.textContent()).trim(), "Inicio");
  assert.equal(await home.evaluate((a) => a.scrollWidth <= a.clientWidth), true, "the way home is never cut to «I…»");
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll(".crumbs a")].filter((a) => {
      const range = document.createRange();
      range.setStart(a.firstChild, 0);
      range.setEnd(a.firstChild, 1);
      return range.getBoundingClientRect().left < a.getBoundingClientRect().left - 1;
    }).map((a) => a.textContent),
  );
  assert.deepEqual(clipped, [], "a long topic ends in «…», it never loses its first letters");
});

// A real map has five or six subtemas side by side; fitted whole into an upright
// iPad its words shrink to a few pixels. It opens at a readable size instead, and
// two fingers zoom it like any picture.
const WIDE_MAP = [
  "flowchart TB",
  ...[1, 2, 3, 4, 5, 6].flatMap((g) => [
    `  subgraph M${g} ["1.${g} Subtema ${g}"]`,
    `    N${g}_1["1.${g}.1 Primer concepto del subtema ${g}<br/>⚪ no evaluado"]:::neu --> N${g}_2["1.${g}.2 Segundo concepto<br/>⚪ no evaluado"]:::neu`,
    "  end",
  ]),
  "  classDef neu fill:#eceef1,stroke:#8b95a7,color:#3d4451;",
  "",
].join("\n");

test("on an upright iPad the map opens readable and two fingers zoom it", { skip: browser ? false : "playwright not installed" }, async (t) => {
  const { page, studio } = await ipadPage(t, 820, 1180, (root) => writeFileSync(join(root, "redes", "mapa.mmd"), WIDE_MAP));
  await page.goto(`${studio.url}#/panorama/redes/mapa`, { waitUntil: "networkidle" });
  await page.waitForSelector("g.pano-node");
  await page.waitForTimeout(300);
  const letters = () => page.evaluate(() => document.querySelector("text.pano-node-title").getBoundingClientRect().height);
  const first = await letters();
  assert.ok(first >= 12, `a concept's words are readable when the map opens: ${first.toFixed(1)}px`);

  const scale = () => page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector(".pano-cam").getAttribute("transform"))[1]));
  const before = await scale();
  await page.evaluate(() => {
    const canvas = document.querySelector(".pano-canvas");
    const box = canvas.getBoundingClientRect();
    const at = (id, x, y, type) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: box.left + x, clientY: box.top + y, bubbles: true, button: 0, buttons: 1 }));
    at(1, 300, 250, "pointerdown");
    at(2, 400, 250, "pointerdown");
    at(1, 250, 250, "pointermove");
    at(2, 450, 250, "pointermove");
    at(1, 250, 250, "pointerup");
    at(2, 450, 250, "pointerup");
  });
  const after = await scale();
  assert.ok(after > before * 1.5, `spreading two fingers zooms in: ${before.toFixed(2)} → ${after.toFixed(2)}`);
  await page.locator(".pano-controls").getByRole("button", { name: "Ajustar a la ventana" }).click();
  assert.ok((await scale()) < before, "«Ajustar a la ventana» still shows the whole map");
});
