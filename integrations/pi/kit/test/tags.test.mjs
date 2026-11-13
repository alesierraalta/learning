// Las fichas de nombre y la persona del kit (#261). A 390 px dos fichas de actores vecinos quedan a
// 6 px o más en cada paso; una ficha que no cabe junto a su vecina se parte en dos líneas; y una
// persona se dibuja entera, con la cabeza y el torso juntos. Se miden en el navegador, con los píxeles
// que ve el lector.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = join(KIT, 'examples');

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
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se pueden medir las fichas';

function pageFor(tag, spec) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-tags-'));
  mkdirSync(join(dir, 'kit'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
  writeFileSync(join(dir, 'p.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css"><script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
</head><body><main style="max-width:700px;margin:0 auto"><${tag}><script type="application/json">${JSON.stringify(spec)}</script></${tag}></main></body></html>`);
  return 'file://' + join(dir, 'p.html');
}

async function open(tag, spec, { width = 390 } = {}) {
  const browser = await PLAYWRIGHT.chromium.launch();
  const view = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  view.on('pageerror', (error) => errors.push(String(error.message)));
  try {
    await view.goto(pageFor(tag, spec));
    await view.waitForSelector(`${tag} svg`, { timeout: 5000 });
    await view.evaluate(() => document.fonts.ready);
    await view.waitForTimeout(200);
  } catch (error) { await browser.close(); throw error; }
  return { browser, view, errors };
}

// La historia de un ejemplo aprobado, tal como la recibe el lector.
const storyOf = (file) => JSON.parse(/<lk-story[^>]*>\s*<script type="application\/json">([\s\S]*?)<\/script>/.exec(readFileSync(join(EXAMPLES, file), 'utf8'))[1]);

// Las fichas del paso que se ve: su caja en píxeles y el lienzo donde caen.
const shownChips = () => {
  const host = document.querySelector('lk-story, lk-scene');
  const svg = host.querySelector('svg');
  const canvas = svg.getBoundingClientRect();
  const steps = [...svg.querySelectorAll('[data-step]')];
  const shown = steps.find((g) => getComputedStyle(g).display !== 'none') ?? svg;
  return [...shown.querySelectorAll('[data-tag-to]')].filter((tag) => tag.querySelector('rect')).map((tag) => {
    const r = tag.querySelector('rect').getBoundingClientRect();
    return {
      text: tag.dataset.tagText, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      lines: tag.querySelectorAll('text').length,
      canvas: { left: canvas.left, right: canvas.right, top: canvas.top },
    };
  });
};

// Dos fichas que se pisan en vertical y quedan a menos de `min` píxeles se tocan.
function touching(chips, min = 6) {
  const bad = [];
  chips.forEach((a, i) => chips.slice(i + 1).forEach((b) => {
    const gap = Math.max(b.left - a.right, a.left - b.right);
    const level = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
    if (level && gap < min) bad.push(`«${a.text}» / «${b.text}»: ${gap.toFixed(1)} px`);
  }));
  return bad;
}

test('las fichas de dos actores vecinos quedan a 6 px o más a 390 px, en cada paso del ejemplo de Bayes', { skip: SKIP }, async () => {
  const spec = storyOf('bayes-mil-personas.md');
  const { browser, view, errors } = await open('lk-story', spec, { width: 390 });
  try {
    assert.deepEqual(errors, []);
    for (let step = 1; step <= spec.steps.length; step++) {
      if (step > 1) await view.getByRole('button', { name: 'Paso siguiente' }).click();
      await view.waitForTimeout(80);
      const chips = await view.evaluate(shownChips);
      assert.deepEqual(touching(chips), [], `paso ${step}: las fichas se tocan`);
      for (const chip of chips) {
        assert.ok(chip.left >= chip.canvas.left - 0.5 && chip.right <= chip.canvas.right + 0.5 && chip.top >= chip.canvas.top - 0.5,
          `paso ${step}: «${chip.text}» se sale del lienzo`);
      }
    }
  } finally { await browser.close(); }
});

test('una ficha que no cabe junto a su vecina se parte en dos líneas y no toca a la otra', { skip: SKIP }, async () => {
  const step = (title) => ({
    title, narrator: 'Dos cuentas.', equation: { size: 22, atoms: [{ t: 'a', id: 'a' }] }, focus: ['a'],
    stage: { scene: { actors: [
      { id: 'x', kind: 'user', x: 100, y: 168, size: 72, tone: 'blue', tag: 'Cuenta uno' },
      { id: 'y', kind: 'user', x: 200, y: 168, size: 72, tone: 'amber', tag: 'Cuenta dos' },
    ] } },
  });
  const spec = { kind: 'derivation', title: 'Dos cuentas', viewBox: '0 60 360 190', steps: [step('Paso 1'), step('Paso 2')] };
  const { browser, view, errors } = await open('lk-story', spec, { width: 390 });
  try {
    assert.deepEqual(errors, []);
    const chips = await view.evaluate(shownChips);
    assert.deepEqual(touching(chips), [], 'las dos fichas quedan separadas');
    assert.ok(chips.some((chip) => chip.lines === 2), 'una de las dos fichas se parte en dos líneas');
  } finally { await browser.close(); }
});

test('una persona se dibuja entera: la cabeza y el torso se tocan y ocupan su caja', { skip: SKIP }, async () => {
  const spec = { viewBox: '0 0 240 240', scene: { icons: [{ kind: 'user', x: 120, y: 120, size: 72 }] } };
  const { browser, view, errors } = await open('lk-scene', spec, { width: 390 });
  try {
    assert.deepEqual(errors, []);
    const figure = await view.evaluate(() => {
      const drawn = document.querySelector('[data-icon="user"]');
      const head = drawn.querySelector('circle').getBBox();
      const body = drawn.querySelector('path').getBBox();
      return { gap: body.y - (head.y + head.height), height: drawn.getBBox().height };
    });
    assert.ok(figure.gap <= 4, `la cabeza queda a ${figure.gap.toFixed(1)} unidades del torso (máximo 4)`);
    assert.ok(figure.height >= 0.85 * 72, `la persona mide ${figure.height.toFixed(1)} unidades de alto (mínimo ${(0.85 * 72).toFixed(0)})`);
  } finally { await browser.close(); }
});
