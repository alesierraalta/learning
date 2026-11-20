// Gate for <lk-lanes>: the approved shared-resource timeline, mounted from an
// inline JSON script with no module, build step or runtime dependency.
//
// Uso: node --test integrations/pi/kit/test/lanes.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = pathToFileURL(join(KIT, 'examples', 'lk-lanes.html')).href;
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(theme ? `${EXAMPLE}?theme=${theme}` : EXAMPLE);
  await page.waitForSelector('lk-lanes[data-ready="true"]', { timeout: 15000 });
  return page;
}
const next = (page) => page.getByRole('button', { name: 'Paso siguiente' }).click();

const inspect = () => {
  const host = document.querySelector('lk-lanes');
  const spec = JSON.parse(host.querySelector('script[type="application/json"]').textContent);
  const figure = host.querySelector('.lk-ln-figure');
  const focus = [...figure.querySelectorAll('[data-focus]')].map((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, tone: node.dataset.focus };
  });
  const nested = focus.some((a, i) => focus.some((b, j) => i !== j
    && a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h));
  const plot = figure.querySelector('.lk-ln-plot-stack').getBoundingClientRect();
  const links = [...figure.querySelectorAll('.lk-ln-link')].map((g) => {
    const path = g.querySelector('path');
    const points = (path.getAttribute('d').match(/-?\d+\.?\d*/g) || []).map(Number);
    const coords = [];
    for (let i = 0; i < points.length; i += 2) coords.push([plot.left + points[i], plot.top + points[i + 1]]);
    const link = spec.links.find((item) => item.id === g.dataset.link);
    const target = figure.querySelector(`[data-item="${link.to}"]`);
    const tr = target.getBoundingClientRect();
    const end = coords[coords.length - 1];
    const onEdge = [
      Math.abs(end[1] - tr.top) <= 1.5 && end[0] >= tr.left - 1.5 && end[0] <= tr.right + 1.5,
      Math.abs(end[1] - tr.bottom) <= 1.5 && end[0] >= tr.left - 1.5 && end[0] <= tr.right + 1.5,
      Math.abs(end[0] - tr.left) <= 1.5 && end[1] >= tr.top - 1.5 && end[1] <= tr.bottom + 1.5,
      Math.abs(end[0] - tr.right) <= 1.5 && end[1] >= tr.top - 1.5 && end[1] <= tr.bottom + 1.5,
    ].some(Boolean);
    return { id: link.id, bends: coords.length - 2, onEdge };
  });
  const outside = [...figure.querySelectorAll('.lk-ln-lane-title, .lk-ln-lane-role')]
    .filter((label) => {
      const r = label.getBoundingClientRect();
      const parent = label.closest('.lk-ln-lane-name, .lk-ln-resource-name').getBoundingClientRect();
      return r.left < parent.left - 1 || r.right > parent.right + 1
        || r.top < parent.top - 1 || r.bottom > parent.bottom + 1;
    }).map((label) => label.textContent);
  const ghostLabels = [...figure.querySelectorAll('.lk-ln-item.is-pending .lk-ln-item-label')]
    .filter((label) => getComputedStyle(label).display !== 'none').map((label) => label.textContent);
  return {
    step: Number(figure.dataset.step),
    counter: figure.querySelector('.lk-ln-count').textContent.trim(),
    caption: figure.querySelector('.lk-ln-caption').textContent.trim(),
    focus, nested, links, outside, ghostLabels,
    unit: figure.querySelector('.lk-ln-unit')?.textContent.trim() || '',
    labels: [...figure.querySelectorAll('.lk-ln-lane-title')].map((n) => n.textContent),
    forbidden: figure.querySelectorAll('input, range, select, textarea, [title]').length,
    text: figure.textContent,
    paper: getComputedStyle(host).getPropertyValue('--lk-ln-paper').trim(),
    font: getComputedStyle(figure.querySelector('.lk-ln-question')).fontFamily,
    theme: document.documentElement.dataset.theme,
  };
};

test('every step has one or two non-nested focus outlines and a plain caption', { skip }, async () => {
  const page = await open();
  try {
    for (let step = 1; step <= 5; step += 1) {
      if (step > 1) await next(page);
      const seen = await page.evaluate(inspect);
      assert.equal(seen.step, step, `step ${step} dataset`);
      assert.equal(seen.counter, `${step}/5`, `step ${step} counter`);
      assert.ok(seen.focus.length >= 1 && seen.focus.length <= 2, `step ${step}: ${seen.focus.length} focus outlines`);
      assert.equal(seen.nested, false, `step ${step}: nested focus outlines`);
      assert.ok(seen.caption.length > 0, `step ${step}: no caption`);
      assert.ok(!/Narrador/i.test(seen.text), `step ${step}: the Narrador label came back`);
      assert.equal(seen.forbidden, 0, `step ${step}: knobs or hover-only titles`);
      assert.equal(seen.ghostLabels.length, 0, `step ${step}: ghost labels ${seen.ghostLabels.join(', ')}`);
      assert.deepEqual(seen.outside, [], `step ${step}: labels escaping their block`);
      assert.match(seen.unit, /u\./, 'the axis unit lives in the header');
      assert.match(seen.font, /Atkinson Hyperlegible/, 'Atkinson for prose');
      assert.deepEqual(page.errors, []);
    }
  } finally { await page.close(); }
});

test('every connector is straight or has one bend and ends on its target edge', { skip }, async () => {
  const page = await open();
  try {
    for (let step = 1; step <= 5; step += 1) {
      if (step > 1) await next(page);
      const seen = await page.evaluate(inspect);
      assert.ok(seen.links.length > 0, `step ${step}: no connectors drawn`);
      for (const link of seen.links) {
        assert.ok(link.bends <= 1, `step ${step}: ${link.id} has ${link.bends} bends`);
        assert.equal(link.onEdge, true, `step ${step}: ${link.id} does not end on its target edge`);
      }
      assert.deepEqual(page.errors, []);
    }
  } finally { await page.close(); }
});

test('lane labels wrap inside their block, including the shared resource', { skip }, async () => {
  const page = await open();
  try {
    const seen = await page.evaluate(inspect);
    assert.deepEqual(seen.labels, ['Fríos', 'Parrilla', 'Postres', 'Horno']);
    assert.deepEqual(seen.outside, []);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.lk-ln-resource-name .lk-ln-lane-title')).whiteSpace), 'normal');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('player and keyboard move the same step and both themes paint their own paper', { skip }, async () => {
  const page = await open();
  try {
    await next(page);
    await page.getByRole('button', { name: 'Paso anterior' }).click();
    assert.equal((await page.evaluate(inspect)).step, 1);
    await page.getByRole('button', { name: /Ir al paso 5/ }).click();
    assert.equal((await page.evaluate(inspect)).step, 5);
    await page.locator('.lk-ln-figure').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal((await page.evaluate(inspect)).step, 4);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
  const dark = await open('dark');
  try {
    const seen = await dark.evaluate(inspect);
    assert.equal(seen.theme, 'dark');
    assert.equal(seen.paper, '#0e1a20');
    assert.deepEqual(dark.errors, []);
  } finally { await dark.close(); }
});

test('an invalid spec shows its path inside the element, without a page error', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = JSON.parse(document.querySelector('lk-lanes script[type="application/json"]').textContent);
      spec.items[1].lane = 'fantasma';
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const bad = document.createElement('lk-lanes');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-lanes[data-ready="error"]');
    const error = page.locator('lk-lanes[data-ready="error"] .lk-ln-error');
    assert.match(await error.textContent(), /items\[1\]\.lane/);
    assert.match(await error.textContent(), /not a declared lane/);
    assert.equal(await error.getAttribute('role'), 'alert');
    assert.equal(await page.locator('lk-lanes[data-ready="error"] .lk-ln-figure').count(), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the axis shows each tick as its number, not [object Object]', { skip }, async () => {
  const page = await open();
  try {
    const labels = await page.evaluate(() => [...document.querySelectorAll('.lk-ln-axis-plot > *')].map((tick) => tick.textContent));
    assert.deepEqual(labels, ['0', '2', '4', '6', '8', '10', '12', '14', '15']);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
