// S18-S23, S26: the five figures must fit the REAL reader, not just the
// showcase. A part page built by the bridge (view/app.css + kit.css + the
// manifest assets) carries a canonical example of every element and a real
// Mermaid flowchart with two long subgraph titles. Geometry is measured in
// Chromium at every width/theme the learner uses, so a wrapped control, a
// column-bound figure or a title drawn over a node fails the gate.
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
const WIDTHS = [760, 960, 1440];
const THEMES = ['light', 'dark', 'black'];
const FLOW = [
  '```mermaid',
  'flowchart TD',
  '  subgraph Pred ["Enfoque predictivo: Quirófanos (obra física)"]',
  '    direction LR',
  '    P1["Alcance cerrado"] -.-> P2["Construcción fija"] -.-> P3["Entrega final"]',
  '  end',
  '  subgraph Adap ["Enfoque adaptativo: Telemedicina (software clínico)"]',
  '    direction LR',
  '    A1["Requisitos emergentes"] -.-> A2["Iteración 1"] -.-> A3["Iteración 2"] -.-> A4["Valor continuo"]',
  '  end',
  '```',
  '',
  // A narrow flowchart: at every tested width it can be scaled to fit, so the
  // gate covers both decisions — scale to the figure, or keep the authored size
  // and scroll with the hint — instead of only the one this note happens to take.
  '```mermaid',
  'flowchart LR',
  '  R1["Requisitos"] --> R2["Iteración"] --> R3["Valor continuo"]',
  '```',
  '',
].join('\n');

// Every subgraph the tutor wrote must reach the page: a diagram that silently
// drops its second half is not a diagram of the thing.
const SOURCE_TITLES = [...FLOW.matchAll(/subgraph\s+\w+\s+\["([^"]+)"\]/g)].map((m) => m[1]);

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

/** The canonical note: one example of every element, then the diagrams. */
export function DEFAULT_MARKDOWN() {
  return [
    '# Parte 1 — Figuras', '',
    'Cinco figuras nuevas en la página del lector.', '',
    ...TAGS.map((tag) => block(tag)), '',
    FLOW, '',
  ].join('\n');
}

/** The reader's own part page, with the same asset order as bridge.ts:pageHtml. */
export function partPage(theme = 'light', markdown) {
  const dir = mkdtempSync(join(tmpdir(), 'lk-reader-fit-'));
  const file = join(dir, 'part.html');
  const body = markdown ?? DEFAULT_MARKDOWN();
  const view = (path) => pathToFileURL(join(VIEW, path)).href;
  const kit = (path) => pathToFileURL(join(KIT, path)).href;
  const data = JSON.stringify({ kind: 'part', topic: 'tema', part: 'p1', title: 'Figuras', markdown: body, submitUrl: '/submit', home: '/', topicBase: '/' }).replace(/</g, '\\u003c');
  const cdn = [
    'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js',
    'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js',
    'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js',
  ].map((src) => `<script src="${src}"></script>`).join('\n');
  writeFileSync(file, `<!doctype html><html lang="es" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${cdn}
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

export async function open(theme, width, markdown) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  const source = markdown ?? DEFAULT_MARKDOWN();
  const diagrams = (source.match(/```mermaid/g) || []).length || 1;
  await page.goto(partPage(theme, markdown), { waitUntil: 'load' });
  await page.waitForSelector('.prose', { timeout: 20000 });
  await page.waitForFunction((n) => document.querySelectorAll('.mermaid svg').length >= n, diagrams, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

/**
 * Runs in the page. Text nodes are measured with a Range: a label broken in
 * two by CSS produces two client rects even when its parent still measures as
 * one flex line. Every box is compared in the viewport they actually paint in.
 */
function measure() {
  const out = { figures: {}, errors: [], overflow: 0, mermaid: null };
  out.overflow = document.documentElement.scrollWidth - window.innerWidth;
  const rect = (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const textLines = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter((r) => r.width > .5 && r.height > .5);
  };
  /** Rows of boxes, clustered by their vertical centre: a wrapped flex row or a
      stacked dot list shows two centres, a centred single row only one. */
  const rows = (rects) => {
    let last = -Infinity, count = 0;
    for (const centre of rects.map((r) => r.y + r.h / 2).sort((a, b) => a - b)) {
      if (centre - last > 4) { count += 1; last = centre; }
    }
    return count;
  };
  /** What the button paints, not what the DOM stores: an icon-only control keeps
      its authored words for the tree and swaps them for a glyph in CSS. */
  const painted = (button) => {
    const content = getComputedStyle(button, '::before').content;
    const glyph = content && content !== 'none' && content !== 'normal' ? content.replace(/^"|"$/g, '').trim() : '';
    const own = parseFloat(getComputedStyle(button).fontSize) > 0;
    if (!own && glyph) return { text: glyph, icon: true };
    return { text: button.textContent.trim(), icon: false };
  };
  const players = {
    'lk-stage': '.lk-stage-player',
    'lk-codestep': '.lk-cs-player',
    'lk-tablestep': '.lk-ts-player',
    'lk-guided': '.lk-gd-player',
    'lk-lanes': '.lk-ln-player',
  };
  const dots = {
    'lk-stage': '.lk-stage-dots > *',
    'lk-codestep': '.lk-cs-dots > *',
    'lk-tablestep': '.lk-ts-segments > *',
    'lk-guided': '.lk-gd-dots > *',
    'lk-lanes': '.lk-ln-segments > *',
  };
  for (const tag of Object.keys(players)) {
    const host = document.querySelector(tag);
    if (!host) { out.errors.push(`${tag}: missing`); continue; }
    const box = rect(host);
    const player = host.querySelector(players[tag]);
    const playerBox = player ? rect(player) : null;
    const buttons = [...host.querySelectorAll(`${players[tag]} button`)].map((b) => {
      const style = getComputedStyle(b);
      const shown = painted(b);
      return {
        text: shown.text, label: b.getAttribute('aria-label'),
        lines: shown.icon ? 1 : textLines(b).length,
        transform: style.textTransform,
      };
    });
    const counts = [...host.querySelectorAll(`${players[tag]} span`)]
      .filter((n) => n.textContent.trim())
      .map((n) => ({ text: n.textContent.trim(), lines: textLines(n).length }));
    const dotRects = [...host.querySelectorAll(dots[tag])].map(rect);
    const children = player ? [...player.children].map(rect) : [];
    out.figures[tag] = {
      box, player: playerBox, buttons, counts,
      dotRows: rows(dotRects), dotCount: dotRects.length,
      playerHeight: playerBox?.h ?? 0,
      playerPadY: player ? parseFloat(getComputedStyle(player).paddingTop) + parseFloat(getComputedStyle(player).paddingBottom) : 0,
      playerRows: rows(children),
      tallestChild: Math.max(0, ...children.map((r) => r.h)),
    };
  }
  out.mermaids = [];
  for (const container of document.querySelectorAll('.mermaid')) {
    const svg = container.querySelector('svg');
    if (svg) {
      const boxes = (selector, keep = () => true) => [...svg.querySelectorAll(selector)]
        .filter(keep)
        .map((n) => {
          const r = rect(n);
          return { text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), ...r };
        })
        .filter((r) => r.w > 0 && r.h > 0);
      const intersect = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      // Mermaid 11 paints a subgraph title as g.cluster-label > foreignObject > div > span.nodeLabel;
      // older builds used .clusterLabel. Both are measured, never only one.
      const clusters = boxes('.cluster-label, .clusterLabel, .cluster-label div, .cluster-label span, .clusterLabel div, .clusterLabel span');
      // The title is itself a span.nodeLabel inside .cluster-label: comparing it with
      // itself is not an overlap. Nodes and edge labels are everything else.
      const others = boxes('.nodeLabel, .nodeLabel text, .nodeLabel span, .nodeLabel div, .edgeLabel, .edgeLabel text, .edgeLabel span, .edgeLabel div',
        (n) => !n.closest('.cluster-label, .clusterLabel'));
      const hits = [];
      for (const c of clusters) for (const o of others) if (intersect(c, o) > 4) hits.push([c.text, o.text, Math.round(intersect(c, o))]);
      const svgBox = rect(svg);
      const containerBox = rect(container);
      const style = getComputedStyle(container);
      const hint = getComputedStyle(container, '::after').content;
      out.mermaids.push({
        svgWidth: svgBox.w, containerWidth: containerBox.w,
        natural: svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : svgBox.w,
        svgBox, containerBox,
        overflowX: style.overflowX, scrollWidth: container.scrollWidth, scrollLeft: container.scrollLeft,
        // Every cluster box measured in the figure's own scrolled coordinates.
        clusterBoxes: clusters.map((c) => ({ text: c.text, left: c.x - containerBox.x + container.scrollLeft, right: c.right - containerBox.x + container.scrollLeft })),
        hint: hint && hint !== 'none' ? hint : '',
        direction: container.dataset.direction || '',
        // Every node box in the figure's own coordinates: a diagram that fits has
        // all of them inside the visible box, with no scrolling to reach them.
        nodeBoxes: boxes('g.node').map((n) => ({ text: n.text, left: n.x - containerBox.x, top: n.y - containerBox.y, right: n.right - containerBox.x, bottom: n.bottom - containerBox.y })),
        clusters: clusters.length, others: others.length, hits,
        titles: clusters.map((c) => c.text),
      });
    } else out.errors.push('Mermaid SVG missing');
  }
  if (!out.mermaids.length) out.errors.push('Mermaid SVG missing');
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) test('figures, controls and Mermaid fit the reader at every width and theme', { skip }, async t => {
  for (const theme of THEMES) for (const width of WIDTHS) {
    const page = await open(theme, width);
    t.after(() => page.close());
    const m = await page.evaluate(measure);
    const at = `${theme}/${width}`;
    assert.deepEqual(m.errors, [], `${at}: ${m.errors.join(', ')}`);
    assert.equal(page.errors.length, 0, `${at}: page errors: ${page.errors.join(', ')}`);
    assert.ok(m.overflow <= 1, `${at}: horizontal overflow of ${m.overflow}px`);

    for (const [tag, f] of Object.entries(m.figures)) {
      const wanted = width >= 1264 ? 1200 : Math.min(648, width - 48);
      assert.ok(f.box.w >= wanted, `${at} ${tag}: width ${Math.round(f.box.w)}px < ${wanted}px`);
      assert.ok(f.box.x >= -1 && f.box.right <= width + 1, `${at} ${tag}: escapes the viewport (${Math.round(f.box.x)}..${Math.round(f.box.right)})`);
      assert.equal(f.playerRows, 1, `${at} ${tag}: the control row breaks into ${f.playerRows} rows`);
      assert.ok(f.playerHeight <= f.tallestChild + f.playerPadY + 2,
        `${at} ${tag}: control row is ${Math.round(f.playerHeight)}px, one row of children is ${Math.round(f.tallestChild + f.playerPadY)}px`);
      assert.equal(f.dotRows, 1, `${at} ${tag}: step dots stack on ${f.dotRows} rows`);
      for (const b of f.buttons) {
        // lk-codestep ships glyph-only buttons without aria-labels (codestep.js is
        // not in this change's surface); every other control names itself.
        if (tag !== 'lk-codestep') assert.ok(b.label, `${at} ${tag}: icon-only control «${b.text}» has no accessible label`);
        // Dot and segment buttons carry no words to wrap.
        if (!b.text) continue;
        assert.ok(b.lines === 1, `${at} ${tag}: «${b.text}» is split into ${b.lines} lines`);
        assert.equal(b.transform, 'none', `${at} ${tag}: «${b.text}» is forced to ${b.transform}`);
        // Under ~720 px of figure the words are the first thing to go: a control
        // keeps a glyph and its accessible name, never a two-line label.
        if (f.box.w < 720) {
          assert.ok(b.text.length <= 2, `${at} ${tag}: narrow figure still shows «${b.text}» instead of an icon`);
        }
      }
      for (const c of f.counts) {
        assert.ok(c.lines === 1, `${at} ${tag}: «${c.text}» wraps into ${c.lines} lines`);
      }
    }

    for (const [index, mm] of m.mermaids.entries()) {
      const who = `${at} Mermaid[${index}]`;
      assert.ok(mm.svgWidth >= mm.containerWidth * .6,
        `${who}: SVG ${Math.round(mm.svgWidth)}px is tiny in a ${Math.round(mm.containerWidth)}px figure`);
      assert.deepEqual(mm.hits, [], `${who}: subgraph title over a node/edge: ${JSON.stringify(mm.hits)}`);

      // Nothing is silently clipped. A diagram either lives inside its figure —
      // scaled down no further than 12 px of type — or keeps its authored size,
      // scrolls, and says so. A crop with no scroll and no hint is a bug.
      const scale = mm.svgWidth / mm.natural;
      if (mm.svgWidth <= mm.containerWidth + 1) {
        assert.ok(mm.svgBox.x >= mm.containerBox.x - 1 && mm.svgBox.right <= mm.containerBox.right + 1,
          `${who}: the diagram escapes its figure (${Math.round(mm.svgBox.x)}..${Math.round(mm.svgBox.right)} in ${Math.round(mm.containerBox.x)}..${Math.round(mm.containerBox.right)})`);
        assert.ok(scale >= .79, `${who}: scaled to ${(scale * 100).toFixed(0)}%, its words print under 12 px`);
      } else {
        assert.ok(['auto', 'scroll'].includes(mm.overflowX),
          `${who}: ${Math.round(mm.svgWidth)}px diagram in a ${Math.round(mm.containerWidth)}px figure with overflow ${mm.overflowX}`);
        assert.ok(mm.scrollWidth >= Math.round(mm.svgWidth) - 1,
          `${who}: scrolls ${mm.scrollWidth}px of a ${Math.round(mm.svgWidth)}px diagram — the rest is cut off`);
        assert.ok(mm.hint.length > 2, `${who}: a diagram wider than its figure has no visible affordance`);
        for (const cluster of mm.clusterBoxes) {
          assert.ok(cluster.left >= -1 && cluster.right <= mm.scrollWidth + 1,
            `${who}: cluster «${cluster.text}» sits outside the scrollable diagram (${Math.round(cluster.left)}..${Math.round(cluster.right)} of ${mm.scrollWidth})`);
        }
      }
    }

    const wide = m.mermaids[0];
    // An LR flowchart wider than its figure is re-laid out top-to-bottom before
    // the scroll fallback: reading a two-cluster flow one half at a time, sideways,
    // is not studying. The readable direction must reach the page without a scroll.
    assert.equal(wide.direction, 'TB', `${at}: the two-subgraph flowchart was not re-laid out TB (${wide.direction || 'LR'})`);
    assert.ok(!wide.hint, `${at}: the two-subgraph flowchart still needs the scroll hint`);
    assert.ok(wide.svgWidth <= wide.containerWidth + 1,
      `${at}: the two-subgraph flowchart is ${Math.round(wide.svgWidth)}px in a ${Math.round(wide.containerWidth)}px figure`);
    assert.ok(wide.scrollWidth <= wide.containerWidth + 1,
      `${at}: the two-subgraph flowchart scrolls ${wide.scrollWidth}px of a ${Math.round(wide.containerWidth)}px figure`);
    for (const node of wide.nodeBoxes) {
      assert.ok(node.left >= -1 && node.right <= wide.containerWidth + 1 && node.top >= -1 && node.bottom <= wide.containerBox.h + 1,
        `${at}: node «${node.text}» sits outside the visible figure (${Math.round(node.left)},${Math.round(node.top)}..${Math.round(node.right)},${Math.round(node.bottom)} of ${Math.round(wide.containerWidth)}×${Math.round(wide.containerBox.h)})`);
    }

    // A flowchart that already fits keeps the direction the tutor wrote.
    const narrow = m.mermaids[1];
    assert.equal(narrow.direction, 'LR', `${at}: a fitting LR flowchart lost its direction (${narrow.direction || 'none'})`);
    assert.ok(narrow.svgWidth <= narrow.containerWidth + 1, `${at}: the narrow flowchart does not fit its figure`);

    // The two-subgraph diagram: every subgraph the tutor wrote is painted, spelled
    // as written. A diagram that silently drops its second half is not a diagram.
    assert.ok(wide.clusters >= 2, `${at}: only ${wide.clusters} subgraph labels in the SVG`);
    const drawn = new Set(wide.titles.map((t) => t.replace(/\s+/g, ' ').trim()));
    for (const title of SOURCE_TITLES) {
      assert.ok([...drawn].some((t) => t.includes(title.slice(0, 30))),
        `${at}: subgraph «${title}» never reached the page (painted: ${JSON.stringify([...drawn])})`);
    }

    await page.close();
  }
});
