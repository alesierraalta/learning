// Gate for <lk-tablestep>: the approved table transform, mounted from an inline
// JSON script with no module, build step or runtime dependency.
//
// Uso: node --test integrations/pi/kit/test/tablestep.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = pathToFileURL(join(KIT, 'examples', 'lk-tablestep.html')).href;
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
  await page.waitForSelector('lk-tablestep[data-ready="true"]', { timeout: 15000 });
  return page;
}
const next = (page) => page.getByRole('button', { name: 'Paso siguiente' }).click();

const inspect = () => {
  const host = document.querySelector('lk-tablestep');
  const spec = JSON.parse(host.querySelector('script[type="application/json"]').textContent);
  const badge = host.querySelector('.lk-ts-rowbadge')?.textContent.trim() || '';
  const count = Number(/«(\d+) filas»/.exec(badge)?.[1] ?? -1);
  const resultRows = [...host.querySelectorAll('tr[data-result-row="true"]')]
    .filter((row) => row.dataset.dim !== 'true');
  const headers = [...host.querySelectorAll('th[data-header-focus]')].map((th) => th.dataset.headerFocus);
  const blocks = [...host.querySelectorAll('.lk-ts-focus-block')].map((block) => ({
    cols: block.dataset.cols, rows: block.dataset.rows, focus: block.dataset.focus,
  }));
  return {
    step: Number(host.dataset.step), steps: spec.steps.length, op: spec.steps[Number(host.dataset.step) - 1].op,
    counter: host.querySelector('.lk-ts-count').textContent.trim(), badge, count,
    resultRows: resultRows.length, headers, blocks,
    connectors: host.querySelectorAll('.lk-ts-connector').length,
    caption: host.querySelector('.lk-ts-caption')?.textContent.trim() || '',
    text: host.textContent,
    paper: getComputedStyle(host).getPropertyValue('--lk-ts-paper').trim(),
    theme: document.documentElement.dataset.theme,
  };
};

test('each operation reports a result count that matches the rows it draws', { skip }, async () => {
  const page = await open();
  try {
    for (let step = 1; step <= 3; step += 1) {
      if (step > 1) await next(page);
      const seen = await page.evaluate(inspect);
      assert.equal(seen.step, step);
      assert.equal(seen.counter, `${step}/${seen.steps}`, `step ${step} counter`);
      assert.ok(seen.count >= 0, `step ${step}: no readable «N filas» badge: ${seen.badge}`);
      assert.equal(seen.resultRows, seen.count, `step ${step}: badge says ${seen.count}, table draws ${seen.resultRows} live rows`);
      assert.ok(seen.caption.length > 0, `step ${step}: no explanation caption`);
      assert.ok(!/Narrador/i.test(seen.text), `step ${step}: the Narrador label came back`);
      assert.deepEqual(page.errors, []);
    }
  } finally { await page.close(); }
});

test('a join outlines both key headers and draws one connector per match', { skip }, async () => {
  const page = await open();
  try {
    await next(page);
    const seen = await page.evaluate(inspect);
    assert.equal(seen.op, 'join');
    assert.ok(seen.headers.includes('socio_id'), `FK header not focused: ${seen.headers}`);
    assert.ok(seen.headers.includes('id'), `key header not focused: ${seen.headers}`);
    assert.ok(seen.blocks.some((block) => block.cols === 'socio_id'), 'no focus outline on the FK header');
    assert.ok(seen.blocks.some((block) => block.cols === 'id'), 'no focus outline on the key header');
    assert.equal(seen.connectors, seen.count, 'one curve per matched pair');
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

test('an unknown operation fails at its own path', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = JSON.parse(document.querySelector('lk-tablestep script[type="application/json"]').textContent);
      spec.steps[2].op = 'pivot';
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const bad = document.createElement('lk-tablestep');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-tablestep[data-ready="error"]');
    const message = await page.locator('lk-tablestep[data-ready="error"] .lk-ts-error').textContent();
    assert.match(message, /spec\.steps\[2\]\.op/);
    assert.match(message, /unknown operation/);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('an invalid spec shows its path inside the element, without a page error', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = JSON.parse(document.querySelector('lk-tablestep script[type="application/json"]').textContent);
      spec.steps[1].on.key = 'portada';
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const bad = document.createElement('lk-tablestep');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-tablestep[data-ready="error"]');
    const error = page.locator('lk-tablestep[data-ready="error"] .lk-ts-error');
    assert.match(await error.textContent(), /spec\.steps\[1\]\.on\.key/);
    assert.equal(await page.locator('lk-tablestep[data-ready="error"] .lk-ts-result').count(), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
