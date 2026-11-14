// Whole-page gate: opens a part exactly as the reader serves it and steps through
// every <lk-story> in the learner's two conditions — dark and wide, light and phone.
//
// The four existing gates measure each figure on its own, in a test page. A part can
// pass all four and still render broken where the learner reads it: the regenerated
// Gaussian Part 1 (#296) showed an empty story stage with the page painted over it,
// and nothing caught it. This gate draws the real bridge route with the real reader
// CSS, one step at a time, and checks every piece:
//
//   - visible ink inside its own stage,
//   - narrator and player visible when the step has them,
//   - no box overlapping the next block,
//   - nothing off the page,
//   - no page error.
//
// Usage: node tools/page-gate.mjs <nota.md | directorio>...
// Exit 1 on findings, 2 when nothing could be measured, 0 when every story passes.
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { registerBridge } from '../integrations/pi/bridge.ts';

// Playwright, resolved the same way as `deck-gate.mjs` and `scene-lint.mjs`: the
// module this process names, the project's own, or the global one. The studio runs
// this gate with its own Node and no PLAYWRIGHT_MODULE, and on the VPS the browser is
// installed globally: a fixed path from one machine does not exist on another, and a
// gate that cannot find its browser cannot measure anything.
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
if (!playwright) {
  console.log('playwright is not installed: set PLAYWRIGHT_MODULE to its entry point, or install it globally (npm root -g)');
  process.exit(2);
}
const { chromium } = playwright;

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
if (!args.length) {
  console.log('usage: node tools/page-gate.mjs <nota.md | directorio>...');
  process.exit(2);
}

const skipped = new Set(['node_modules', '.git', '.tgrep', '.codegraph', '.pi', '.atl']);
const notes = [];
const collect = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name)) collect(join(dir, entry.name));
      continue;
    }
    if (entry.name.endsWith('.md')) notes.push(join(dir, entry.name));
  }
};
for (const arg of args) {
  const info = statSync(arg, { throwIfNoEntry: false });
  if (!info) {
    console.log(`no such file or directory: ${arg}`);
    process.exit(2);
  }
  if (info.isDirectory()) collect(arg);
  else if (arg.endsWith('.md')) notes.push(arg);
}

/** Every `<lk-story>` in the note, with the payload the reader will draw. */
const storiesOf = (text) => {
  const found = [];
  for (const [index, match] of [...text.matchAll(/<lk-story\b[^>]*>([\s\S]*?)<\/lk-story>/g)].entries()) {
    const payload = match[1].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) {
      found.push({ index: index + 1, error: 'no tiene payload JSON' });
      continue;
    }
    try {
      found.push({ index: index + 1, spec: JSON.parse(payload[1]) });
    } catch (error) {
      found.push({ index: index + 1, error: `el payload no es JSON: ${error.message}` });
    }
  }
  return found;
};

// The two conditions the learner really reads in: the paper comes in the address as `?theme=`
// and the studio sends the wide reading mode after the page loads, exactly as it does to its
// frame. The reader serves a part as its note or as the hand-built page beside it. Both templates
// get the same real CSS and kit, and both are measured: the broken Gaussian page was a hand-built
// page, and a gate that only opened the note would have called it clean (#297).
const WITH_PAGES = process.env.PAGE_GATE_TEMPLATES !== 'note';
const CONDITIONS = [
  { name: 'negro/ancho', theme: 'black', width: 1440, height: 1000, wide: true, route: 'nota' },
  { name: 'claro/teléfono', theme: 'light', width: 390, height: 844, wide: false, route: 'nota' },
  ...(WITH_PAGES
    ? [
        { name: 'negro/ancho · página', theme: 'black', width: 1440, height: 1000, wide: true, route: 'pagina' },
        { name: 'claro/teléfono · página', theme: 'light', width: 390, height: 844, wide: false, route: 'pagina' },
      ]
    : []),
];

const targets = [];
const structural = [];
for (const note of notes) {
  let text;
  try {
    text = readFileSync(note, 'utf8');
  } catch (error) {
    console.log(`no se pudo leer ${note}: ${error.code || error.message}`);
    process.exit(2);
  }
  const stories = storiesOf(text);
  if (!stories.length) {
    console.log(`${note}: sin recorridos`);
    continue;
  }
  for (const story of stories) {
    if (story.error) structural.push({ note, story: story.index, kind: 'story-illegible', text: story.error });
  }
  const readable = stories.filter((story) => !story.error);
  if (!readable.length) continue;
  targets.push({ note, stories: readable, part: `p${targets.length + 1}` });
}

if (!targets.length) {
  for (const item of structural) {
    console.log(`${item.note}: recorrido ${item.story}`);
    console.log(`  ${item.kind}: ${item.text}`);
  }
  if (!structural.length) console.log('sin recorridos: no hay nada que medir');
  process.exit(structural.length ? 1 : 0);
}

const browser = await chromium.launch();
const root = mkdtempSync(join(tmpdir(), 'page-gate-'));
const topic = join(root, 'redes');
const parts = [];
mkdirSync(join(topic, 'explicaciones'), { recursive: true });
mkdirSync(join(topic, 'explicaciones', 'demos'), { recursive: true });
// The reader names a part through plan.json and its file name; the note is copied
// unedited, so what the browser measures is exactly what the learner would read.
for (const [index, target] of targets.entries()) {
  const slug = `Page gate ${index + 1}`;
  parts.push({ id: target.part, title: slug, slug });
  copyFileSync(target.note, join(topic, 'explicaciones', `Parte ${index + 1} - ${slug}.md`));
}
writeFileSync(join(topic, 'plan.json'), `${JSON.stringify({ topic: 'Page gate', parts }, null, 2)}\n`);

const tools = new Map();
registerBridge(
  {
    on() {
      return () => {};
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    sendUserMessage() {},
  },
  { root },
);
let base;
try {
  base = (await tools.get('learning_view').execute('call', {}, undefined, undefined, { cwd: root })).structuredContent.base;
} catch (error) {
  console.log(`el lector no pudo abrir la nota: ${String(error.message).split('\n')[0]}`);
  await browser.close();
  process.exit(2);
}

const findings = [...structural.map((item) => ({ ...item, condition: '' }))];
let measured = 0;

// The hand-built page is the other template the reader serves. It is generated from the same
// note, with the reader's own CSS and kit, so a story that only survives one template is caught.
const handFiles = new Map();
const handDocument = (html, theme, wide) => `<!doctype html>
<html lang="es" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${base}kit/kit.css">
<link rel="stylesheet" href="${base}book.css">
<script src="${base}kit/scene.js" defer></script>
<script src="${base}kit/kit.js" defer></script>
<script src="${base}book.js" defer></script>
</head>
<body${wide ? ' class="wide"' : ''}><main data-page-gate="hand">${html}</main></body>
</html>
`;
if (WITH_PAGES) {
  try {
    const sourceContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const sourcePage = await sourceContext.newPage();
    await sourcePage.goto(`${base}redes/${targets[0].part}?theme=light`, { waitUntil: 'load' });
    await sourcePage.locator('lk-story').first().waitFor({ timeout: 15000 });
    for (const target of targets) {
      const html = await sourcePage.evaluate((text) => {
        if (!globalThis.marked?.parse) throw new Error('el lector no cargó marked: no se puede abrir la plantilla de página');
        return globalThis.marked.parse(text);
      }, readFileSync(target.note, 'utf8'));
      for (const theme of ['black', 'light']) {
        const file = `page-gate-hand-${target.part}-${theme}.html`;
        writeFileSync(join(topic, 'explicaciones', 'demos', file), handDocument(html, theme, theme === 'black'));
        handFiles.set(`${target.part}:${theme}`, file);
      }
    }
    await sourceContext.close();
  } catch (error) {
    await browser.close();
    console.log(`no se pudo abrir la plantilla de página: ${String(error.message).split('\n')[0]}`);
    process.exit(2);
  }
}

try {
  for (const condition of CONDITIONS) {
    const context = await browser.newContext({
      viewport: { width: condition.width, height: condition.height },
      deviceScaleFactor: 2,
      colorScheme: condition.theme === 'black' ? 'dark' : 'light',
    });
    // The studio does not load the page wide: it loads the reader and then sends it the reading
    // mode, so the story is laid out narrow first. The gate must do the same, or it measures a
    // layout the learner never sees.
    if (condition.wide) {
      await context.addInitScript(() => {
        try {
          localStorage.removeItem('learnings.wide-reading');
        } catch {}
      });
    }
    for (const target of targets) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error.message).split('\n')[0]));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(`consola: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) pageErrors.push(`${response.status()} ${response.url()}`);
      });
      try {
        const url =
          condition.route === 'pagina'
            ? `${base}redes/file/explicaciones/demos/${handFiles.get(`${target.part}:${condition.theme}`)}`
            : `${base}redes/${target.part}?theme=${condition.theme}`;
        await page.goto(url, { waitUntil: 'load' });
        await page.locator('lk-story').first().waitFor({ timeout: 15000 });
        // Let the kit draw, fit its type and finish the font swaps that move labels.
        await page.waitForTimeout(350);
        if (condition.wide) {
          await page.evaluate(() => window.postMessage({ type: 'learning-reading-mode', mode: 'ancho' }, '*'));
          await page.waitForTimeout(250);
        }
        const decks = page.locator('lk-story');
        const count = await decks.count();
        for (let d = 0; d < count; d += 1) {
          const deck = decks.nth(d);
          const source = target.stories[d];
          const spec = source.spec;
          const steps = Array.isArray(spec.steps) ? spec.steps.length : 0;
          measured += 1;
          if (!steps) {
            findings.push({ note: target.note, condition: condition.name, story: source.index, kind: 'story-empty', text: 'el recorrido no declara pasos' });
            continue;
          }
          for (let s = 0; s < steps; s += 1) {
            if (s > 0) await deck.getByRole('button', { name: 'Paso siguiente' }).click();
            await deck
              .locator('.lk-story-count')
              .filter({ hasText: `${s + 1} / ${steps}` })
              .first()
              .waitFor({ timeout: 5000 })
              .catch(() => {});
            await deck.locator('.lk-story-stage').scrollIntoViewIfNeeded().catch(() => {});
            const step = spec.steps[s] ?? {};
            const expects = {
              narrator: Boolean(step.narrator || step.say),
              header: Boolean((spec.kind === 'derivation' ? step.equation?.atoms : spec.formula?.atoms)?.length),
              scene: Boolean(step.stage?.scene || step.stage),
            };
            const found = await deck.evaluate(
              (node, input) => {
                const out = [];
                const push = (kind, text, detail = '') => out.push({ kind, text: String(text || '').slice(0, 80), detail });
                const labelOf = (el) => {
                  const cls = String(el.className?.baseVal ?? el.className ?? '');
                  return `${el.tagName.toLowerCase()}${cls ? `.${cls.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}` : ''}`;
                };
                const visible = (el) => {
                  if (!el || !el.isConnected) return false;
                  const style = getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
                  const rect = el.getBoundingClientRect();
                  return rect.width > 0.5 || rect.height > 0.5;
                };
                const box = (el) => {
                  const r = el.getBoundingClientRect();
                  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.x, y: r.y };
                };
                const overlap = (a, b) => {
                  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                  return { x, y, area: x > 1 && y > 1 ? x * y : 0 };
                };
                const nodeRect = box(node);
                const title = node.getAttribute('title') || node.querySelector('.lk-title')?.textContent?.trim() || `recorrido ${input.story}`;
                const stage = node.querySelector('.lk-story-stage');
                const narrator = node.querySelector('.lk-story-narrator');
                const player = node.querySelector('.lk-story-player');
                const header = node.querySelector('.lk-story-head');
                const formula = node.querySelector('.lk-story-formula');
                if (!node.querySelector('.lk-story-stage, .lk-story-player')) {
                  push('story-not-drawn', title, 'el lector no dibujó el recorrido: revisa el JSON y el kit');
                  return out;
                }
                if (!player || !visible(player)) push('player-missing', title, 'el reproductor no se ve: sin anterior/siguiente el paso no existe para el lector');
                else {
                  for (const control of player.querySelectorAll('button, .lk-story-progress, .lk-story-count')) {
                    if (!visible(control)) push('player-missing', labelOf(control), 'un control del reproductor no se ve');
                  }
                  const active = player.querySelector('.lk-story-seg[aria-current="true"]');
                  if (!active) push('player-missing', title, 'la barra no marca el paso actual');
                }
                if (input.expects.header && (!header || !visible(header) || !formula || !formula.textContent.trim())) {
                  push('header-missing', title, 'el paso tiene fórmula o ecuación y su cabecera no se ve');
                }
                if (input.expects.narrator && (!narrator || !visible(narrator) || !narrator.innerText.trim())) {
                  push('narrator-missing', title, 'el paso tiene narrador y no se lee');
                }
                if (!stage || !visible(stage)) {
                  push('stage-missing', title, 'el escenario del paso no se ve');
                  return out;
                }
                const stageRect = box(stage);
                const svg = [...stage.children].find((child) => child.tagName.toLowerCase() === 'svg');
                const panel = [...stage.querySelectorAll('.lk-story-piece')].find((piece) => !piece.hidden);
                const canvas = svg && getComputedStyle(svg).display !== 'none' ? svg : panel;
                if (!canvas) {
                  push('stage-empty', title, 'el paso no dibuja nada en su escenario');
                  return out;
                }
                const current = svg
                  ? [...svg.querySelectorAll('[data-step]')].filter((group) => Number(group.dataset.step) === input.step)
                  : [panel];
                const scopes = current.length ? current : [canvas];
                const ink = [];
                for (const scope of scopes) {
                  for (const el of scope.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, image, use')) {
                    if (el.closest('defs') || el.closest('marker')) continue;
                    if (!visible(el)) continue;
                    const rect = box(el);
                    if (rect.width < 0.5 && rect.height < 0.5) continue;
                    ink.push({ el, rect });
                  }
                }
                // The whole SVG is also a piece: a stage that paints a huge empty box
                // while the ink sits outside it is the failure the learner saw.
                const canvasRect = box(canvas);
                if (canvasRect.width < 2 || canvasRect.height < 2) push('stage-empty', title, 'el escenario mide cero: la página lo tapa');
                if (!ink.length) push('stage-empty', title, 'el escenario no tiene tinta visible en este paso');
                for (const { el, rect } of ink) {
                  if (rect.left < stageRect.left - 2 || rect.right > stageRect.right + 2 || rect.top < stageRect.top - 2 || rect.bottom > stageRect.bottom + 2) {
                    push('ink-outside-stage', el.textContent?.trim() || labelOf(el), 'la tinta del paso se sale de su escenario');
                  }
                }
                // A text that leaves its own box is what makes a label unreadable.
                const rects = scopes.map((scope) => box(scope)).filter((r) => r.width >= 18 && r.height >= 12);
                for (const text of scopes.flatMap((scope) => [...scope.querySelectorAll('text')]).filter((el) => visible(el) && el.textContent.trim())) {
                  const t = box(text);
                  const inside = rects
                    .filter((r) => t.x + t.width / 2 >= r.left && t.x + t.width / 2 <= r.right && t.y + t.height / 2 >= r.top && t.y + t.height / 2 <= r.bottom)
                    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
                  if (!inside) continue;
                  const spill = Math.round(Math.max(inside.left - t.left, t.right - inside.right, inside.top - t.top, t.bottom - inside.bottom));
                  if (spill > 2) push('text-outside-box', text.textContent.trim(), `se sale ${spill}px de su caja`);
                }
                // A layer painted over the card: the SVG can have all its children and
                // still be invisible under the page. At several points of the stage, the
                // topmost element must belong to the story, never to a later block.
                const covered = new Set();
                for (let gy = 1; gy <= 3; gy += 1) {
                  for (let gx = 1; gx <= 5; gx += 1) {
                    const x = stageRect.left + (stageRect.width * gx) / 6;
                    const y = stageRect.top + (stageRect.height * gy) / 4;
                    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) continue;
                    const top = document.elementFromPoint(x, y);
                    if (top && !node.contains(top)) covered.add(labelOf(top));
                  }
                }
                for (const cover of covered) push('story-covered', title, `la página pinta encima (${cover})`);
                // Consecutive blocks of the card, and every block that follows it in the
                // reader. A later block whose box enters the story's box paints over it.
                const blocks = [...node.children].filter((child) => visible(child));
                for (let i = 0; i + 1 < blocks.length; i += 1) {
                  const hit = overlap(box(blocks[i]), box(blocks[i + 1]));
                  if (hit.area) push('box-overlap', `${labelOf(blocks[i])} / ${labelOf(blocks[i + 1])}`, `${Math.round(hit.y)}px de alto compartido`);
                }
                const later = [...(node.closest('main') ?? document).querySelectorAll('p, h1, h2, h3, table, pre, figure, ul, ol, blockquote, lk-scene, lk-story, lk-walkthrough, .quiz-question')]
                  .filter((el) => el !== node && !node.contains(el) && el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING);
                for (const el of later) {
                  if (!visible(el)) continue;
                  const hit = overlap(nodeRect, box(el));
                  if (hit.area) {
                    push('box-over-next', title, `pisa el bloque siguiente (${labelOf(el)})`);
                    break;
                  }
                }
                // Nothing off the page: the reader never gets a horizontal scrollbar,
                // and no piece is cut on either side.
                const pageWidth = document.documentElement.clientWidth;
                const boxes = [nodeRect, ...node.querySelectorAll('.lk-story-head, .lk-story-stage, .lk-story-narrator, .lk-story-player, .lk-story-piece, .lk-story-formula')]
                  .filter((el) => (el === node ? true : visible(el)))
                  .map((el) => (el === node ? nodeRect : box(el)));
                for (const rect of boxes) {
                  if (rect.left < -1 || rect.right > pageWidth + 1) {
                    push('off-page', title, `x ${Math.round(rect.left)}–${Math.round(rect.right)} fuera de 0–${pageWidth}`);
                    break;
                  }
                }
                if (document.documentElement.scrollWidth > pageWidth + 1) push('off-page', title, `la página mide ${document.documentElement.scrollWidth}px en ${pageWidth}px`);
                return out;
              },
              { step: s + 1, expects, story: source.index },
            );
            for (const item of found) {
              findings.push({
                note: target.note,
                condition: condition.name,
                story: source.index,
                step: s + 1,
                kind: item.kind,
                text: item.text,
                detail: item.detail,
              });
            }
          }
        }
      } catch (error) {
        findings.push({
          note: target.note,
          condition: condition.name,
          story: 0,
          kind: 'page-not-drawn',
          text: String(error.message).split('\n')[0],
          detail: pageErrors.join(' | ').slice(0, 240),
        });
      } finally {
        for (const message of pageErrors) findings.push({ note: target.note, condition: condition.name, story: 0, kind: 'page-error', text: message });
        await page.close().catch(() => {});
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

for (const target of targets) {
  for (const item of findings.filter((found) => found.note === target.note)) {
    console.log(`${target.note}: recorrido ${item.story}${item.step ? `, paso ${item.step}` : ''}${item.condition ? ` · ${item.condition}` : ''}`);
    console.log(`  ${item.kind}: ${item.text}${item.detail ? ` (${item.detail})` : ''}`);
  }
}
const summary = findings.length
  ? `${findings.length} problema(s) en ${measured} recorrido(s)`
  : measured
    ? `ok: ${measured} recorrido(s) sin problemas`
    : 'sin recorridos: no hay nada que medir';
console.log(summary);
console.log(findings.length ? 'GATE FAILED' : 'GATE PASSED');
process.exit(findings.length ? 1 : 0);
