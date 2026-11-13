// El árbol de frecuencias (#261): cada grupo es una persona, cada rama lleva su cuenta y su
// porcentaje, y las hojas que cuentan se destacan. Estos casos comprueban en el navegador lo
// que un `assert` sobre el JSON no ve: que cada rama cae junto a su trazo, que ningún rótulo
// se encima de otro, que el texto cabe en su persona y que se lee en el teléfono.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { measurePiece } from '../piece-measure.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se pueden medir las piezas';
const THEMES = ['light', 'dark', 'black'];

function pageFor(tag, spec) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-tree-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css"><script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
</head><body><main style="max-width:700px;margin:0 auto"><${tag}><script type="application/json">${JSON.stringify(spec)}</script></${tag}></main></body></html>`);
  return 'file://' + join(dir, 'p.html');
}

async function open(tag, spec, { width = 1000, theme = 'light', ready = '.lk-p' } = {}) {
  const browser = await PLAYWRIGHT.chromium.launch();
  const view = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  view.on('pageerror', (error) => errors.push(String(error.message)));
  try {
    await view.goto(pageFor(tag, spec));
    await view.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await view.waitForSelector(ready, { timeout: 5000 });
    await view.evaluate(() => document.fonts.ready);
    await view.waitForTimeout(150);
  } catch (error) { await browser.close(); throw error; }
  return { browser, view, errors };
}

// Mil personas: diez enfermos y novecientos noventa sanos; de los enfermos, nueve dan
// positivo; de los sanos, noventa y nueve (falsos positivos). Seis ramas, siete grupos.
const TREE = {
  title: 'De mil personas',
  nodes: [
    { id: 'todas', lines: ['1000 personas'], kind: 'user', tone: 'slate' },
    { id: 'enf', lines: ['enfermos'], kind: 'user', tone: 'blue' },
    { id: 'san', lines: ['sanos'], kind: 'user', tone: 'slate' },
    { id: 'enf-pos', lines: ['positivos'], kind: 'user', tone: 'amber', highlight: true },
    { id: 'enf-neg', lines: ['negativos'], kind: 'user', tone: 'slate' },
    { id: 'san-pos', lines: ['positivos', '(falsos)'], kind: 'user', tone: 'amber', highlight: true },
    { id: 'san-neg', lines: ['negativos'], kind: 'user', tone: 'slate' },
  ],
  links: [
    { from: 'todas', to: 'enf', count: 10, rate: '1 %' },
    { from: 'todas', to: 'san', count: 990, rate: '99 %' },
    { from: 'enf', to: 'enf-pos', count: 9, rate: '90 %' },
    { from: 'enf', to: 'enf-neg', count: 1, rate: '10 %' },
    { from: 'san', to: 'san-pos', count: 99, rate: '10 %' },
    { from: 'san', to: 'san-neg', count: 891, rate: '90 %' },
  ],
};

test('the frequency tree draws every group as a person, every branch with its count and rate, and the positive leaves highlighted', { skip: SKIP }, async () => {
  const { browser, view, errors } = await open('lk-tree', TREE);
  try {
    const seen = await view.evaluate(() => ({
      nodes: [...document.querySelectorAll('.lk-tnode')].map((n) => ({
        id: n.dataset.node,
        highlight: n.dataset.highlight,
        person: Boolean(n.querySelector('circle')) && Boolean(n.querySelector('path')),
      })),
      branches: [...document.querySelectorAll('.lk-tbranch')].map((b) => [b.querySelector('.lk-tcount')?.textContent, b.querySelector('.lk-trate')?.textContent]),
      links: document.querySelectorAll('path[data-from][data-to]').length,
    }));
    assert.deepEqual(errors, []);
    assert.equal(seen.nodes.length, 7, 'one node per group');
    assert.ok(seen.nodes.every((n) => n.person), 'every group is a person character, drawn');
    assert.deepEqual(seen.nodes.filter((n) => n.highlight === '1').map((n) => n.id), ['enf-pos', 'san-pos'], 'the two positive leaves are the highlighted ones');
    assert.equal(seen.links, 6, 'one drawn branch per split');
    assert.deepEqual(seen.branches, [['10', '1 %'], ['990', '99 %'], ['9', '90 %'], ['1', '10 %'], ['99', '10 %'], ['891', '90 %']]);
  } finally { await browser.close(); }
});

test('the frequency tree passes the piece measure in every theme, at desktop and phone width', { skip: SKIP }, async () => {
  for (const theme of THEMES) for (const width of [1000, 390]) {
    const { browser, view } = await open('lk-tree', TREE, { width, theme });
    try {
      const { problems } = await view.locator('lk-tree').evaluate(measurePiece);
      assert.deepEqual(problems, [], `${theme} ${width}px`);
    } finally { await browser.close(); }
  }
});

test('a branch label moved off its branch is a finding', { skip: SKIP }, async () => {
  const { browser, view } = await open('lk-tree', TREE);
  try {
    await view.evaluate(() => { document.querySelector('.lk-tbranch').setAttribute('transform', 'translate(0 60)'); });
    const { problems } = await view.locator('lk-tree').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'label-off-branch'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

test('a group name that does not fit its person is a finding', { skip: SKIP }, async () => {
  const wide = structuredClone(TREE);
  wide.nodes[3].lines = ['positivosfalsosnegativosmuylargos'];
  const { browser, view } = await open('lk-tree', wide);
  try {
    const { problems } = await view.locator('lk-tree').evaluate(measurePiece);
    assert.ok(problems.some((p) => p.kind === 'node-text-overflow'), JSON.stringify(problems));
  } finally { await browser.close(); }
});

test('a group with three branches is refused in words, not drawn wrong', { skip: SKIP }, async () => {
  const three = structuredClone(TREE);
  three.nodes.push({ id: 'otros', lines: ['otros'], kind: 'user' });
  three.links.push({ from: 'todas', to: 'otros', count: 0, rate: '0 %' });
  const { browser, view } = await open('lk-tree', three, { ready: '[role=alert]' });
  try {
    assert.match(await view.locator('[role=alert]').textContent(), /dos ramas/);
  } finally { await browser.close(); }
});
