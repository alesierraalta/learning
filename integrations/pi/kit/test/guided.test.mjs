// Gate for <lk-guided>: the approved formula / worked-example / numbers figure,
// mounted from an inline JSON script with no module, build step or dependency.
//
// Uso: node --test integrations/pi/kit/test/guided.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = pathToFileURL(join(KIT, 'examples', 'lk-guided.html')).href;
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(theme ? `${EXAMPLE}?theme=${theme}` : EXAMPLE);
  await page.waitForSelector('lk-guided[data-ready="true"]', { timeout: 15000 });
  return page;
}
const next = (page) => page.getByRole('button', { name: 'Paso siguiente' }).click();

const inspect = () => {
  const host = document.querySelector('lk-guided');
  const focus = [...host.querySelectorAll('.lk-gd-step:not([hidden]) .lk-gd-focus')].map((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, tone: node.dataset.focus };
  });
  const nested = focus.some((a, i) => focus.some((b, j) => i !== j
    && a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h));
  return {
    step: Number(host.dataset.step),
    counter: host.querySelector('.lk-gd-count').textContent.trim(),
    caption: host.querySelector('.lk-gd-caption').textContent.trim(),
    label: host.querySelector('.lk-gd-step-label').textContent.trim(),
    focus, nested,
    visiblePanels: [...host.querySelectorAll('.lk-gd-step')].filter((p) => !p.hidden).length,
    forbidden: host.querySelectorAll('input, range, select, textarea, [title], [tabindex="0"][data-slider]').length,
    overflow: [...host.querySelectorAll('.lk-gd-step:not([hidden]) .lk-gd-token, .lk-gd-step:not([hidden]) .lk-gd-card-value, .lk-gd-step:not([hidden]) .lk-gd-num-value')]
      .filter((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2)
      .map((node) => node.textContent),
    text: host.textContent,
    paper: getComputedStyle(host).getPropertyValue('--lk-gd-paper').trim(),
    font: getComputedStyle(host.querySelector('.lk-gd-question')).fontFamily,
    theme: document.documentElement.dataset.theme,
  };
};

test('every step shows one idea, one caption and one or two lead-the-eye outlines', { skip }, async () => {
  const page = await open();
  try {
    for (let step = 1; step <= 8; step += 1) {
      if (step > 1) await next(page);
      const seen = await page.evaluate(inspect);
      assert.equal(seen.step, step, `step ${step} dataset`);
      assert.equal(seen.counter, `${step}/8`, `step ${step} counter`);
      assert.equal(seen.visiblePanels, 1, `step ${step}: expected one visible panel`);
      assert.ok(seen.focus.length >= 1 && seen.focus.length <= 2, `step ${step}: ${seen.focus.length} focus outlines`);
      assert.equal(seen.nested, false, `step ${step}: nested focus outlines`);
      assert.ok(seen.caption.length > 0 && seen.label.length > 0, `step ${step}: plain caption and label`);
      assert.ok(seen.focus.every((f) => ['blue', 'green', 'red'].includes(f.tone)), `step ${step}: focus tones`);
      assert.ok(!/Narrador/i.test(seen.text), `step ${step}: the Narrador label came back`);
      assert.equal(seen.forbidden, 0, `step ${step}: knobs or hover-only content`);
      assert.deepEqual(seen.overflow, [], `step ${step}: text escaping its box`);
      assert.match(seen.font, /Atkinson Hyperlegible/, 'Atkinson for prose');
      assert.deepEqual(page.errors, []);
    }
  } finally { await page.close(); }
});

test('every formula symbol gets its own explained step before the numbers', { skip }, async () => {
  const page = await open();
  try {
    const seen = await page.evaluate(() => {
      const host = document.querySelector('lk-guided');
      const spec = JSON.parse(host.querySelector('script[type="application/json"]').textContent);
      const first = spec.steps[0].blocks.find((b) => b.kind === 'formula');
      const focused = new Map();
      for (const step of spec.steps) {
        const formula = step.blocks.find((b) => b.kind === 'formula');
        if (!formula || formula.focus === undefined) continue;
        const token = formula.tokens[formula.focus];
        if (!focused.has(token.text)) focused.set(token.text, step.caption || '');
      }
      return {
        symbols: first.tokens.map((t) => t.text).filter((t) => t !== '('),
        focused: [...focused],
        exampleBeforeNumbers: spec.steps.findIndex((s) => s.caption && /Sustituimos/.test(s.title))
          > spec.steps.findIndex((s) => /exponente/i.test(s.caption || '')),
      };
    });
    for (const symbol of seen.symbols) {
      const caption = seen.focused.find(([text]) => text === symbol)
        || seen.focused.find(([text]) => text.includes(symbol) || symbol.includes(text));
      assert.ok(caption, `no step focuses formula symbol ${symbol}`);
      assert.ok(caption[1].includes(symbol) || symbol.includes(caption[1]),
        `the caption never names ${symbol}: ${caption[1]}`);
    }
    assert.equal(seen.exampleBeforeNumbers, true, 'the worked example must follow the explanation');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('previous, dots and play all move the same step, and keyboard arrows work', { skip }, async () => {
  const page = await open();
  try {
    await next(page);
    await next(page);
    assert.equal((await page.evaluate(inspect)).step, 3);
    await page.getByRole('button', { name: 'Paso anterior' }).click();
    assert.equal((await page.evaluate(inspect)).step, 2);
    await page.getByRole('button', { name: 'Ir al paso 8' }).click();
    assert.equal((await page.evaluate(inspect)).step, 8);
    assert.equal(await page.getByRole('button', { name: 'Paso siguiente' }).isDisabled(), true);
    await page.locator('lk-guided').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal((await page.evaluate(inspect)).step, 7);
    const play = page.getByRole('button', { name: 'Reproducir pasos' });
    await play.click();
    assert.equal(await page.getByRole('button', { name: 'Pausar pasos' }).count(), 1);
    await page.getByRole('button', { name: 'Reproducir pasos' }).click();
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

test('worked examples and numbers before/after use the same grammar and stay quiet', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = {
        form: 'example', kicker: 'PRUEBA · EJEMPLO', question: '¿Qué cambia?',
        steps: [
          {
            title: 'Elegimos el signo', label: '1 · Signo', caption: 'El signo va con la recompensa.',
            blocks: [
              { kind: 'formula', tokens: [{ text: 'G = +10 + (−1)' }], focus: 0, tone: 'green' },
              { kind: 'cards', cards: [
                { label: 'Correcto', value: '+ (−1)', note: 'suma' },
                { label: 'Descartado', value: '− (−1) → +1', wrong: true },
              ], focus: 0, tone: 'green' },
            ],
          },
          {
            title: 'Los totales', label: '2 · Totales', caption: 'Los cuatro precios ya están redondeados.',
            blocks: [
              { kind: 'numbers', values: [
                { label: 'Pan', old: '2,35', value: '2,50' },
                { label: 'Leche', old: '1,29', value: '1,50' },
                { label: 'Café', old: '3,80', value: '4,00' },
                { label: 'Huevos', old: '2,99', value: '3,00' },
              ], focusList: [0, 1, 2, 3], tone: 'green' },
              { kind: 'rows', headings: ['Momento', 'Aporta'], rows: [
                { label: 'Ahora', cells: ['+10'] }, { label: 'Paso 1', cells: ['−0,9'] },
              ], focus: 1, tone: 'red' },
            ],
          },
        ],
      };
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const extra = document.createElement('lk-guided');
      extra.id = 'extra';
      extra.append(script);
      document.querySelector('main').append(extra);
    });
    await page.waitForSelector('#extra[data-ready="true"]');
    for (let step = 1; step <= 2; step += 1) {
      if (step > 1) await page.locator('#extra').getByRole('button', { name: 'Paso siguiente' }).click();
      const seen = await page.evaluate(() => {
        const host = document.querySelector('#extra');
        return {
          focus: host.querySelectorAll('.lk-gd-step:not([hidden]) .lk-gd-focus').length,
          wrong: [...host.querySelectorAll('.lk-gd-wrong .lk-gd-card-value')].map((n) => n.textContent),
          marked: host.querySelectorAll('.lk-gd-marked').length,
          caption: host.querySelector('.lk-gd-caption').textContent.trim(),
        };
      });
      assert.ok(seen.focus >= 1 && seen.focus <= 2, `extra step ${step}: ${seen.focus} focus outlines`);
      assert.ok(seen.caption.length > 0, `extra step ${step}: no caption`);
      if (step === 1) assert.deepEqual(seen.wrong, ['− (−1) → +1'], 'the discarded value must be marked red');
      if (step === 2) assert.equal(seen.marked, 3, 'several changed numbers share one outline');
    }
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('an invalid spec shows its path inside the element, without a page error', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify({
        form: 'formula', kicker: 'PRUEBA', question: '¿Qué pasa?',
        steps: [{ title: 'Paso', label: '1 · Paso', caption: 'Captión', blocks: [
          { kind: 'formula', tokens: [{ text: 'x' }], focus: 4 },
        ] }],
      });
      const bad = document.createElement('lk-guided');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-guided[data-ready="error"]');
    const error = page.locator('lk-guided[data-ready="error"] .lk-gd-error');
    assert.match(await error.textContent(), /steps\[0\]\.blocks\[0\]\.focus/);
    assert.match(await error.textContent(), /focus index out of range/);
    assert.equal(await error.getAttribute('role'), 'alert');
    assert.equal(await page.locator('lk-guided[data-ready="error"] .lk-gd-stage').count(), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
