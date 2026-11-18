// #368 — measure what the real scripts build, never a hand-made look-alike.
// The reader part is served by the bridge (app.js draws the quiz and the markdown callout);
// the kit page is served by kit.js itself. Every probed selector is printed, including misses.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerBridge } from '../../bridge.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, '..');
const TOPIC = 'sql-demo';

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

const contextFor = (coarse) => browser.newContext({
  viewport: coarse ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  hasTouch: coarse,
  isMobile: coarse,
});

// The bridge's own host shape: only the tool registry and the shutdown handlers are needed here.
function host() {
  const handlers = new Map();
  const tools = new Map();
  return {
    handlers,
    tools,
    api: {
      on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); return () => {}; },
      registerTool(tool) { tools.set(tool.name, tool); },
      sendUserMessage() {},
    },
  };
}

function makeRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'quiz-touch-368-')));
  const topic = join(root, TOPIC);
  mkdirSync(join(topic, 'explicaciones'), { recursive: true });
  mkdirSync(join(topic, 'mini-quiz'), { recursive: true });
  writeFileSync(join(topic, 'plan.json'), JSON.stringify({
    topic: 'SQL demo',
    parts: [{ id: 'p1', title: 'Claves', slug: 'Claves' }],
  }));
  // The callout is authored as a collapsible quote: app.js turns it into `.callout details > summary`.
  writeFileSync(join(topic, 'explicaciones', 'Parte 1 - Claves.md'), [
    '---',
    'tipo: explicacion',
    '---',
    '# Parte 1 — Claves',
    '',
    '> [!tip]+ Ver pistas',
    '> Una pista escrita para esta pregunta.',
    '',
    'Una **clave** identifica la fila.',
    '',
  ].join('\n'));
  writeFileSync(join(topic, 'mini-quiz', 'p1.json'), JSON.stringify({
    questions: [{
      id: 'q1',
      enunciado: 'Pregunta uno',
      options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'No sé' },
      answer: 'B',
    }],
  }));
  return { root, topic };
}

async function openReader(t, { theme, coarse }) {
  const { root } = makeRoot();
  const hostBridge = host();
  registerBridge(hostBridge.api, {
    root,
    gateVerdictsFile: join(root, '.learning-cache', 'gate-verdicts.json'),
    env: { HOME: root, XDG_CONFIG_HOME: join(root, '.config') },
  });
  const result = await hostBridge.tools.get('learning_view').execute(
    'call', { topic: TOPIC, part: 'p1' }, undefined, undefined, { cwd: root },
  );
  const context = await contextFor(coarse);
  t.after(async () => {
    await context.close();
    for (const handler of hostBridge.handlers.get('session_shutdown') ?? []) await handler({}, {});
  });
  const page = await context.newPage();
  await page.goto(`${result.structuredContent.url}?theme=${theme}`);
  // Wait for the two structures the real scripts emit, not for a fixture we authored.
  await page.waitForSelector('form:has(> fieldset.quiz-question) > button[type="submit"]');
  await page.waitForSelector('.prose details.callout > summary');
  await page.evaluate(() => document.fonts.ready);
  const pointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  assert.equal(pointer, coarse, 'the reader pointer context is not the one being measured');
  const appWidth = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().width);
  return { page, appWidth, boxes: await page.evaluate(measure, READER_PROBES) };
}

async function openKit(t, { coarse }) {
  const origin = 'http://kit.test/';
  const css = readFileSync(join(KIT, 'kit.css'), 'utf8');
  const script = (name) => readFileSync(join(KIT, name), 'utf8');
  const context = await contextFor(coarse);
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route(`${origin}**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/kit.css') return route.fulfill({ contentType: 'text/css; charset=utf-8', body: css });
    if (path === '/kit.js' || path === '/dictate.js') {
      return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: script(path.slice(1)) });
    }
    if (path === '/quiz') {
      return route.fulfill({ json: { questions: [{ id: 'q1', enunciado: 'Pregunta uno', options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'No sé' } }] } });
    }
    if (path === '/submit') return route.fulfill({ json: { results: [], score: '0/0' } });
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/kit.css"></head><body><main><lk-quiz></lk-quiz></main>'
        + '<script>window.LEARNING_BRIDGE={quizUrl:"/quiz",submitUrl:"/submit",topic:"sql-demo",part:"p1"}</script>'
        + '<script src="/dictate.js"></script><script src="/kit.js"></script></body></html>',
    });
  });
  await page.goto(origin);
  await page.waitForSelector('lk-quiz form > button[type="submit"]');
  await page.evaluate(() => document.fonts.ready);
  const pointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  assert.equal(pointer, coarse, 'the kit pointer context is not the one being measured');
  return { page, boxes: await page.evaluate(measure, KIT_PROBES) };
}

// The three selectors the previous fixture hid. These are the exact nodes the real scripts append.
const READER_PROBES = [
  ['form:has(> fieldset.quiz-question) > button[type="submit"]', 'reader submit', true],
  ['.prose details.callout > summary', 'callout disclosure', true],
  ['fieldset.quiz-question label.option', 'reader option', true],
  ['fieldset.quiz-question .confidence label', 'reader confidence', true],
];
const KIT_PROBES = [
  ['lk-quiz form > button[type="submit"]', 'kit submit', true],
  ['lk-quiz fieldset.lk-question label.lk-option', 'kit option', true],
  ['lk-quiz .lk-controls label', 'kit confidence', true],
];
const MISSED = ['reader submit[0]', 'callout disclosure[0]', 'kit submit[0]'];

const measure = (probes) => probes.flatMap(([selector, name, quiz]) => {
  const nodes = [...document.querySelectorAll(selector)];
  if (!nodes.length) return [{ key: `${name}[0]`, selector, quiz, missing: true }];
  return nodes.map((node, index) => {
    const r = node.getBoundingClientRect();
    const computed = getComputedStyle(node);
    return {
      key: `${name}[${index}]`,
      selector,
      quiz,
      missing: false,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      minHeight: computed.minHeight,
      height: computed.height,
    };
  });
});

const report = (label, seen) => {
  console.log(`${label} (pointer coarse=${seen.coarse}, #app ${seen.appWidth}px)`);
  for (const box of seen.boxes) {
    console.log(box.missing
      ? `  ${box.key.padEnd(26)} MISSING ${box.selector}`
      : `  ${box.key.padEnd(26)} ${String(box.w).padStart(6)} × ${String(box.h).padStart(6)}  min-height:${box.minHeight} height:${box.height}${box.quiz ? '' : '  [not a quiz control]'}`);
  }
  const missing = seen.boxes.filter((b) => b.missing).map((b) => `${b.key} (${b.selector})`);
  const small = seen.boxes.filter((b) => !b.missing && b.quiz && (b.w < 44 || b.h < 44)).map((b) => `${b.key} ${b.w}×${b.h}`);
  console.log(`  MISSING: ${JSON.stringify(missing)}`);
  console.log(`  UNDER 44×44: ${JSON.stringify(small)}`);
  return { missing, small };
};

async function scenario(t, { theme, coarse }) {
  const reader = await openReader(t, { theme, coarse });
  const kit = await openKit(t, { coarse });
  const seen = { coarse, appWidth: reader.appWidth, boxes: [...reader.boxes, ...kit.boxes] };
  const { missing, small } = report(`${coarse ? 'coarse' : 'fine'} ${theme}`, seen);
  assert.deepEqual(missing, [], 'a probed control was not rendered by the real scripts');
  // The three controls the old fixture masked: require both the declared floor and the real rect.
  if (coarse) {
    const failures = [];
    for (const key of MISSED) {
      const box = seen.boxes.find((b) => b.key === key);
      if (!box || box.missing) { failures.push(`${key} is missing from the real DOM`); continue; }
      if (parseFloat(box.minHeight) < 44) failures.push(`${key} min-height ${box.minHeight}`);
      if (box.h < 44) failures.push(`${key} height ${box.h}`);
    }
    assert.deepEqual(failures, [], `the three previously missed controls in ${theme}`);
    assert.deepEqual(small, [], `quiz controls under 44×44 in ${theme}`);
  }
  return seen;
}

for (const theme of ['light', 'dark']) {
  test(`real DOM quiz controls are 44 × 44 at 390px coarse (${theme})`, { skip }, async (t) => {
    await scenario(t, { theme, coarse: true });
  });
}

test('real DOM fine-pointer geometry stays where origin/main left it', { skip }, async (t) => {
  const seen = await scenario(t, { theme: 'light', coarse: false });
  assert.equal(seen.appWidth, 648, 'the reading measure moved');
  // Pinned from the real-DOM run against the current (unfixed) CSS: coarse rules never apply here.
  const before = {
    'reader submit[0]': [139, 36.8],
    'callout disclosure[0]': [579, 19.2],
    'reader option[0]': [600, 31.4], 'reader option[1]': [600, 31.4], 'reader option[2]': [600, 31.4],
    'reader option[3]': [600, 31.4], 'reader option[4]': [600, 31.4],
    'reader confidence[0]': [66.7, 22.4], 'reader confidence[1]': [58.1, 22.4], 'reader confidence[2]': [72.1, 22.4],
    'kit submit[0]': [139, 36.8],
    'kit option[0]': [652, 40.6], 'kit option[1]': [652, 40.6], 'kit option[2]': [652, 40.6],
    'kit option[3]': [652, 40.6], 'kit option[4]': [652, 40.6],
    'kit confidence[0]': [60.7, 23.4], 'kit confidence[1]': [52.1, 23.4], 'kit confidence[2]': [66.1, 23.4],
  };
  for (const box of seen.boxes.filter((b) => b.quiz)) {
    if (before[box.key]) assert.deepEqual([box.w, box.h], before[box.key], `${box.key} moved under a fine pointer`);
  }
});
