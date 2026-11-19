// Gate for <lk-codestep>: the approved code stepper, mounted from an inline JSON
// script with no module, build step or runtime dependency.
//
// Uso: node --test integrations/pi/kit/test/codestep.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = pathToFileURL(join(KIT, 'examples', 'lk-codestep.html')).href;
const LOCAL_CHROMIUM = '/home/ale/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    attempts.push(async () => createRequire(root + '/')('playwright'));
  } catch {}
  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      if (mod?.chromium || mod?.default?.chromium) return mod.chromium ? mod : mod.default;
    } catch {}
  }
  return null;
}
const playwright = await loadPlaywright();
const skip = playwright ? false : 'playwright is not installed';
const launchOptions = existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {};
const browser = playwright ? await playwright.chromium.launch(launchOptions) : null;
after(() => browser?.close());

async function open(theme) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(theme ? `${EXAMPLE}?theme=${theme}` : EXAMPLE);
  await page.waitForSelector('lk-codestep[data-ready="true"]', { timeout: 15000 });
  return page;
}
const next = (page) => page.getByRole('button', { name: 'Paso siguiente' }).click();

const inspect = () => {
  const host = document.querySelector('lk-codestep');
  const spec = JSON.parse(host.querySelector('script[type="application/json"]').textContent);
  const lines = [...host.querySelectorAll('.lk-cs-lines > .lk-cs-code-line')];
  const active = lines.filter((line) => line.classList.contains('is-active')).map((line) => Number(line.dataset.line));
  const focus = [...host.querySelectorAll('[data-focus]')].map((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cls: node.className };
  });
  const nested = focus.some((a, i) => focus.some((b, j) => i !== j
    && a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h));
  return {
    specLines: spec.code.length, window: spec.window || 12,
    totalSteps: spec.steps.length, counter: host.querySelector('.lk-cs-count').textContent.trim(),
    active, visible: lines.map((line) => Number(line.dataset.line)),
    folds: host.querySelectorAll('.lk-cs-fold').length, focus, nested,
    caption: host.querySelector('.lk-cs-caption')?.textContent.trim() || '',
    expectedCaption: (spec.steps[Number(host.dataset.step) - 1].narrator || []).join(' '),
    text: host.textContent,
    columns: getComputedStyle(host).gridTemplateColumns.split(' ').length,
    paper: getComputedStyle(host).getPropertyValue('--lk-cs-paper').trim(),
    theme: document.documentElement.dataset.theme,
  };
};

test('each step shows a short window with its active line, one caption and quiet focus marks', { skip }, async () => {
  const page = await open();
  try {
    for (let step = 1; step <= 3; step += 1) {
      if (step > 1) await next(page);
      const seen = await page.evaluate(inspect);
      assert.equal(seen.counter, `${step}/${seen.totalSteps}`, `step ${step} counter`);
      assert.ok(seen.visible.length <= seen.window, `step ${step}: ${seen.visible.length} lines visible, window is ${seen.window}`);
      assert.ok(seen.specLines > seen.window, 'the example must really fold lines');
      assert.ok(seen.active.length > 0, `step ${step}: no active line`);
      for (const line of seen.active) assert.ok(seen.visible.includes(line), `step ${step}: active line ${line} is outside the window`);
      assert.ok(seen.focus.length >= 1 && seen.focus.length <= 2, `step ${step}: ${seen.focus.length} focus outlines`);
      assert.equal(seen.nested, false, `step ${step}: nested focus outlines`);
      assert.ok(seen.caption.length > 0, `step ${step}: no explanation caption`);
      assert.ok(!/Narrador/i.test(seen.text), `step ${step}: the Narrador label came back`);
      assert.deepEqual(page.errors, []);
    }
  } finally { await page.close(); }
});

test('a fold expands the hidden source and the figure uses two columns when wide', { skip }, async () => {
  const page = await open();
  try {
    const before = await page.evaluate(inspect);
    assert.ok(before.folds > 0, 'the source outside the window must be folded');
    assert.equal(before.columns, 2, 'code and state must sit beside each other at 1280 px');
    const linesBefore = before.visible.length;
    await page.locator('.lk-cs-fold').first().click();
    const after = await page.evaluate(inspect);
    assert.ok(after.visible.length > linesBefore, `fold did not expand: ${linesBefore} → ${after.visible.length}`);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('dark theme paints the element with its own tokens', { skip }, async () => {
  const page = await open('dark');
  try {
    const seen = await page.evaluate(inspect);
    assert.equal(seen.theme, 'dark');
    assert.equal(seen.paper, '#0E1A20');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('an unknown state widget fails at its own path', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = JSON.parse(document.querySelector('lk-codestep script[type="application/json"]').textContent);
      spec.steps[1].state.heap = ['a'];
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const bad = document.createElement('lk-codestep');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-codestep[data-ready="error"]');
    const message = await page.locator('lk-codestep[data-ready="error"] .lk-cs-error').textContent();
    assert.match(message, /steps\[1\]\.state\.heap/);
    assert.match(message, /unknown widget/);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('an invalid spec shows its path inside the element, without a page error', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = JSON.parse(document.querySelector('lk-codestep script[type="application/json"]').textContent);
      spec.steps[0].line = 99;
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const bad = document.createElement('lk-codestep');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-codestep[data-ready="error"]');
    const error = page.locator('lk-codestep[data-ready="error"] .lk-cs-error');
    assert.match(await error.textContent(), /steps\[0\](\.line)?/);
    assert.equal(await page.locator('lk-codestep[data-ready="error"] .lk-cs-lines').count(), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
