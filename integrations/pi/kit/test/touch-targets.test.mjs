// #368 — the reader's mini-quiz must expose 44 × 44 targets on a finger, without moving the fine-pointer page.
// The fixture carries the real stylesheets and the markup app.js / kit.js draw: the measured boxes are
// the browser's computed rects, not numbers copied from the CSS.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, '..');
const VIEW = join(KIT, '..', 'view');

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
const browser = playwright ? await playwright.chromium.launch() : null;
after(() => browser?.close());

const CSS = {
  '/kit.css': readFileSync(join(KIT, 'kit.css'), 'utf8'),
  '/app.css': readFileSync(join(VIEW, 'app.css'), 'utf8'),
  '/book.css': readFileSync(join(VIEW, 'book.css'), 'utf8'),
};
const ORIGIN = 'http://touch.test/';
const sheet = (href) => `<link rel="stylesheet" href="${href}">`;
const option = (cls, letter) => `<label class="${cls}"><input type="radio" name="q1" value="${letter}"><strong>${letter}</strong><span>Una respuesta posible</span></label>`;
const conf = (text) => `<label><input type="radio" name="confianza" value="${text.toLowerCase()}"><span>${text}</span></label>`;

const pageHtml = (theme) => `<!doctype html><html lang="es"${theme ? ` data-theme="${theme}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${Object.keys(CSS).map(sheet).join('\n')}
</head><body><main id="app"><div class="prose">
<section class="quiz-question">
  <legend>1. ¿Qué sabes?</legend>
  ${option('option', 'A')}
  ${option('option', 'B')}
  <div class="lk-thought"><label class="lk-thought-label">Tu razonamiento</label><button class="lk-mic" type="button">🎤 Dictar</button></div>
  <details class="callout"><summary>Ver pistas</summary><p>Una pista escrita por el tutor.</p></details>
  <div class="confidence"><span>¿Qué tan seguro estás?</span>${conf('Seguro')}${conf('Dudo')}${conf('Adiviné')}</div>
  <div class="code-actions"><button type="button">Ver pistas</button><button type="button">Copiar</button></div>
  <button type="submit">Enviar al tutor</button>
</section>
<section class="runners-strip"><details><summary>Ejecutables aquí: python · ver lenguajes</summary>
  <ul class="runners-list"><li><code>docker pull python</code><button type="button" class="secondary">Copiar</button></li>
  <li><code>docker pull node</code><button type="button" class="secondary">Pedir al estudio</button></li></ul>
</details></section>
<section><h2>En esta parte</h2><div class="lk-toc"><details open><summary>En esta parte</summary><ol class="navigation"><li><a href="#p1">Parte 1</a></li><li><a href="#p2">Parte 2</a></li></ol></details></div></section>
<section><fieldset class="lk-question"><legend>2. ¿Y esto?</legend>
  ${option('lk-option', 'A')}
  ${option('lk-option', 'B')}
  <div class="lk-controls">${conf('Seguro')}${conf('Dudo')}${conf('Adiviné')}</div>
  <button type="submit">Enviar al tutor</button>
</fieldset>
<form><fieldset class="lk-question">${option('lk-option', 'C')}<button type="submit" class="lk-qq-submit">Comprobar respuesta</button></fieldset></form>
</section>
</div></main></body></html>`;

// Selector, human name and whether the element is a mini-quiz control (the tally ignores the index).
const PROBES = [
  ['.quiz-question .option', 'reader option', true],
  ['.confidence label', 'reader confidence', true],
  ['.lk-thought button.lk-mic', 'reader mic', true],
  ['.code-actions button', 'reader code action', true],
  ['.quiz-question .callout summary', 'quiz disclosure', true],
  ['.quiz-question button[type="submit"]', 'reader submit', true],
  ['.runners-strip summary', 'reader disclosure', true],
  ['.runners-list button', 'reader runner action', true],
  ['.lk-question .lk-option', 'kit option', true],
  ['.lk-controls label', 'kit confidence', true],
  ['.lk-question button[type="submit"]', 'kit submit', true],
  ['.lk-qq-submit', 'kit checkpoint submit', true],
  ['.lk-toc summary', 'index disclosure', false],
  ['.navigation a', 'index link', false],
];

const measure = (PROBES) => PROBES.flatMap(([selector, name, quiz]) =>
  [...document.querySelectorAll(selector)].map((node, index) => {
    const r = node.getBoundingClientRect();
    return {
      key: `${name}[${index}]`,
      quiz,
      selector,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      hidden: getComputedStyle(node).visibility === 'hidden' || getComputedStyle(node).display === 'none',
    };
  }));

// Native radios are inner primitives of the label that is the tap target: reported, never tallied.
const measureRadios = () => [...document.querySelectorAll('.quiz-question input[type=radio], .lk-question input[type=radio], .lk-controls input[type=radio]')]
  .map((node) => { const r = node.getBoundingClientRect(); return `${Math.round(r.width * 10) / 10}×${Math.round(r.height * 10) / 10}`; })
  .filter((size, i, all) => all.indexOf(size) === i);

async function open({ theme, coarse }) {
  const context = await browser.newContext({
    viewport: coarse ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    hasTouch: coarse,
    isMobile: coarse,
  });
  const page = await context.newPage();
  await page.route(`${ORIGIN}**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (CSS[path]) return route.fulfill({ contentType: 'text/css; charset=utf-8', body: CSS[path] });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(theme) });
  });
  await page.goto(ORIGIN);
  await page.evaluate(() => document.fonts.ready);
  const pointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  assert.equal(pointer, coarse, 'the pointer context is not the one being measured');
  const appWidth = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().width);
  return { page, context, pointer, appWidth, boxes: await page.evaluate(measure, PROBES), radios: await page.evaluate(measureRadios) };
}

const report = (label, seen) => {
  console.log(`${label} (pointer coarse=${seen.pointer}, #app ${seen.appWidth}px)`);
  for (const box of seen.boxes) console.log(`  ${box.key.padEnd(26)} ${String(box.w).padStart(6)} × ${String(box.h).padStart(6)}${box.quiz ? '' : '  [not a quiz control]'}`);
  const small = seen.boxes.filter((b) => b.quiz && !b.hidden && (b.w < 44 || b.h < 44)).map((b) => `${b.key} ${b.w}×${b.h}`);
  console.log(`  native radios inside the labels: ${JSON.stringify(seen.radios)}`);
  console.log(`  UNDER 44×44: ${JSON.stringify(small)}`);
  return small;
};

for (const theme of ['light', 'dark']) {
  test(`every mini-quiz control is 44 × 44 on a coarse pointer (${theme}, 390px)`, { skip }, async () => {
    const seen = await open({ theme, coarse: true });
    try {
      const small = report(`coarse ${theme}`, seen);
      assert.deepEqual(small, [], `quiz controls under 44×44 in ${theme}`);
    } finally {
      await seen.context.close();
    }
  });
}

test('the fine-pointer geometry is the reference it was before #368', { skip }, async () => {
  const seen = await open({ theme: 'light', coarse: false });
  try {
    report('fine light', seen);
    // Pinned from the pre-change browser run so a future change to the reading density is visible here.
    const before = {
      'reader option[0]': [600, 31.4], 'reader option[1]': [600, 31.4],
      'reader confidence[0]': [66.7, 22.4], 'reader confidence[1]': [58.1, 22.4], 'reader confidence[2]': [72.1, 22.4],
      'reader mic[0]': [88, 32.8], 'reader code action[0]': [101.5, 36.8], 'reader code action[1]': [76, 36.8],
      'quiz disclosure[0]': [579, 19.2], 'reader submit[0]': [139, 36.8], 'reader disclosure[0]': [322.3, 18],
      'reader runner action[0]': [76, 35.8], 'reader runner action[1]': [142, 35.8],
      'kit option[0]': [600, 40.6], 'kit option[1]': [600, 40.6], 'kit option[2]': [600, 40.6],
      'kit confidence[0]': [60.7, 23.4], 'kit confidence[1]': [52.1, 23.4], 'kit confidence[2]': [66.1, 23.4],
      'kit submit[0]': [139, 36.8], 'kit submit[1]': [297.3, 46.8], 'kit checkpoint submit[0]': [297.3, 46.8],
    };
    for (const box of seen.boxes.filter((b) => b.quiz)) {
      assert.deepEqual([box.w, box.h], before[box.key], `${box.key} moved under a fine pointer`);
    }
    assert.equal(seen.appWidth, 648, 'the reading measure moved');
  } finally {
    await seen.context.close();
  }
});
