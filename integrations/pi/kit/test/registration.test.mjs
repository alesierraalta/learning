// T9: the five new figures must arrive where the learner reads. A part page
// built by the bridge carries their assets; marked + DOMPurify keep their JSON
// children; the kit draws them; a wide page gives each one the screen's width.
// The Mermaid theme is loaded before app.js and takes its paper from the kit.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = join(KIT, '..', 'view');
const ROOT = join(KIT, '..', '..', '..');
const EXAMPLES = {
  'lk-stage': 'lk-stage-robot.html',
  'lk-codestep': 'lk-codestep.html',
  'lk-tablestep': 'lk-tablestep.html',
  'lk-guided': 'lk-guided.html',
  'lk-lanes': 'lk-lanes.html',
};
const TAGS = Object.keys(EXAMPLES);

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    attempts.push(async () => createRequire(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/')('playwright'));
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
const skip = playwright ? false : 'playwright no está instalado';
const LOCAL_CHROMIUM = '/home/ale/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = playwright ? await playwright.chromium.launch(existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {}) : null;
after(() => browser?.close());

const specOf = (tag) => {
  const html = readFileSync(join(KIT, 'examples', EXAMPLES[tag]), 'utf8');
  return /<script type="application\/json">([\s\S]*?)<\/script>/i.exec(html)?.[1];
};
const block = (tag) => `<${tag}><script type="application/json">${specOf(tag)}</script></${tag}>`;

function partPage(theme = 'light') {
  const dir = mkdtempSync(join(tmpdir(), 'lk-registration-'));
  const file = join(dir, 'part.html');
  const markdown = [
    '# Parte 1 — Figuras', '',
    'Cinco figuras nuevas en la página del lector.', '',
    ...TAGS.map((tag) => block(tag)), '',
    '```mermaid', 'graph LR; A[Idea] --> B[Resultado];', '```', '',
    '<lk-scene><script type="application/json">{"viewBox":"0 0 200 100","scene":{"boxes":[{"x":10,"y":10,"w":80,"h":60,"label":"Antes"}]}}</script></lk-scene>', '',
  ].join('\n');
  const view = (path) => pathToFileURL(join(VIEW, path)).href;
  const kit = (path) => pathToFileURL(join(KIT, path)).href;
  // The reader escapes '<' for the same reason: a JSON payload holds </script>.
  const data = JSON.stringify({ kind: 'part', topic: 'tema', part: 'p1', title: 'Figuras', markdown, submitUrl: '/submit', home: '/', topicBase: '/' }).replace(/</g, '\\u003c');
  writeFileSync(file, `<!doctype html><html lang="es" data-theme="${theme}"><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js"></script>
<script>window.mermaid={initialize(c){window.__lkMermaidConfig=c;},run({nodes}){window.__lkMermaidNodes=nodes.map(n=>n.className);return Promise.resolve();}};</script>
<link rel="stylesheet" href="${kit('kit.css')}"><link rel="stylesheet" href="${kit('stage.css')}">
<link rel="stylesheet" href="${kit('codestep.css')}"><link rel="stylesheet" href="${kit('tablestep.css')}">
<link rel="stylesheet" href="${kit('guided.css')}"><link rel="stylesheet" href="${kit('lanes.css')}">
<link rel="stylesheet" href="${view('app.css')}"><link rel="stylesheet" href="${view('book.css')}">
<script src="${kit('theme.js')}"></script><script src="${kit('mermaid-theme.js')}"></script></head>
<body class="wide"><main id="app"></main>
<script type="application/json" id="view-data">${data}</script>
<script src="${kit('dictate.js')}"></script><script src="${pathToFileURL(join(ROOT, 'tools', 'visuals', 'draw.js')).href}"></script>
<script src="${kit('scene.js')}"></script><script src="${kit('stage.js')}"></script>
<script src="${kit('codestep.js')}"></script><script src="${kit('tablestep.js')}"></script>
<script src="${kit('guided.js')}"></script><script src="${kit('lanes.js')}"></script>
<script src="${kit('question.js')}"></script><script src="${kit('code-field.js')}"></script>
<script src="${kit('kit.js')}"></script><script src="${view('app.js')}"></script>
</body></html>`);
  return `${pathToFileURL(file).href}?theme=${theme}`;
}

async function open(theme = 'light') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  page.on('console', (message) => { if (message.type() === 'error') console.error('page:', message.text()); });
  await page.goto(partPage(theme), { waitUntil: 'load' });
  await page.waitForSelector('.prose', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

test('the kit manifest and the bridge page ship all five figures', () => {
  const manifest = JSON.parse(readFileSync(join(KIT, 'manifest.json'), 'utf8'));
  for (const tag of TAGS) {
    const name = tag.slice(3);
    assert.ok(manifest.head.includes(`${name}.css`), `${name}.css missing from the manifest`);
    assert.ok(manifest.head.includes(`${name}.js`), `${name}.js missing from the manifest`);
  }
  const bridge = readFileSync(join(ROOT, 'integrations', 'pi', 'bridge.ts'), 'utf8');
  for (const asset of ['codestep.css', 'tablestep.css', 'guided.css', 'lanes.css', 'codestep.js', 'tablestep.js', 'guided.js', 'lanes.js', 'mermaid-theme.js']) {
    assert.match(bridge, new RegExp(asset), `the reader's page never loads ${asset}`);
  }
  const css = readFileSync(join(KIT, 'kit.css'), 'utf8');
  assert.doesNotMatch(css, /data-theme[^\n]*pre\.mermaid[^\n]*background:\s*#fff/i, 'night Mermaid still gets a white paper');
});

test('a part page mounts all five figures, keeps their JSON and still draws the old ones', { skip }, async t => {
  const page = await open();
  t.after(() => page.close());
  for (const tag of TAGS) {
    await page.waitForSelector(`${tag}[data-ready="true"]`, { timeout: 10000 });
    const payload = await page.locator(`${tag} script[type="application/json"]`).textContent();
    assert.ok(payload?.includes('"'), `DOMPurify stripped the JSON child of ${tag}`);
    const drawn = await page.locator(`${tag} svg, ${tag} > div`).count();
    assert.ok(drawn > 0, `${tag} has no drawing`);
    const width = await page.locator(tag).first().evaluate((node) => node.getBoundingClientRect().width);
    assert.ok(width >= 1200, `${tag} still sits in the text column: ${width}px`);
    const centre = await page.locator(tag).first().evaluate((node) => {
      const r = node.getBoundingClientRect();
      return Math.abs((r.left + r.right) / 2 - window.innerWidth / 2);
    });
    assert.ok(centre < 3, `${tag} is not centred: off by ${centre}px`);
  }
  assert.equal(await page.locator('lk-scene svg').count() > 0, true, 'the old scene still renders');
  assert.equal(await page.locator('.mermaid').count(), 1, 'the Mermaid fence still becomes a figure');
  assert.deepEqual(page.errors, []);
});

test('Mermaid is initialized by the kit theme, with neutral black as the night paper', { skip }, async t => {
  const page = await open('black');
  t.after(() => page.close());
  const config = await page.evaluate(() => window.__lkMermaidConfig);
  assert.ok(config, 'app.js never called LkMermaidTheme.initialize()');
  assert.equal(config.theme, 'base');
  assert.equal(config.securityLevel, 'strict');
  assert.equal(config.themeVariables.background, '#000000', 'the night paper must be neutral black, not navy');
  assert.equal(config.themeVariables.textColor, '#E3EBEF', 'night text reads on the dark paper');
  assert.equal(config.themeVariables.primaryTextColor, '#E3EBEF');
  assert.match(config.themeCSS, /messageText/);
  assert.deepEqual(page.errors, []);
});
