// Study-view bridge tests: a real HTTP server on 127.0.0.1 against a temporary
// Learnings root, driven through the public learning_view tool and HTTP routes.
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request, createServer as httpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { backupPartForRegeneration, countVisuals, obsidianToMarkdown, registerBridge, listTopics } from "./bridge.ts";
import { stored } from "../../studio/testdata/stored.mjs";
import { exerciseFile, listExercises, readSubmissions, saveSubmission } from "./codevault.ts";
import { loadRunners } from "./coderun.ts";
import { measurePiece } from "./kit/piece-measure.mjs";

const TOPIC = "sql-demo";

let playwright;
for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/home/alesierraalta/.npm-global/lib/node_modules/playwright/index.mjs'].filter(Boolean)) {
  try { playwright = await import(id); break; } catch {}
}

test('mobile reader control does not cover walkthrough content', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({ title: 'LSTM', viewBox: '0 0 320 200', steps: [{ title: 'Preparar el primer paso', text: 'Antes de leer la palabra, la memoria y la salida anterior son cero.', scene: { boxes: [{ x: 20, y: 20, w: 280, h: 70, label: 'Memoria' }] } }] });
  writeFileSync(join(root, 'rapidos', 'lstm.md'), `# LSTM\n\n${'Texto de la explicación.\n\n'.repeat(30)}<lk-walkthrough class="lk-wt-compact"><script type="application/json">${scene}</script></lk-walkthrough>\n\n${'Más texto.\n\n'.repeat(30)}`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const url = base(await view({})) + 'rapidos/lstm';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  // Wide mode only applies from 1080 px: on a phone the toggle would do nothing.
  assert.equal(await page.locator('.reading-toggle').isVisible(), false, 'wide mode is offered on a phone');
  await page.setViewportSize({ width: 1000, height: 900 });
  assert.equal(await page.locator('.reading-toggle').isVisible(), false, 'wide mode is offered below 1080 px');
  await page.setViewportSize({ width: 390, height: 844 });
  const caption = page.locator('lk-walkthrough .lk-wt-caption').first();
  await caption.waitFor();
  await caption.evaluate(node => window.scrollBy(0, node.getBoundingClientRect().bottom - (window.innerHeight - 20)));
  const overlaps = await caption.evaluate(node => {
    const a = node.getBoundingClientRect(), b = document.querySelector('.reading-toggle').getBoundingClientRect();
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  });
  assert.equal(overlaps, false, 'reading toggle overlaps the walkthrough caption');
  await page.setViewportSize({ width: 1200, height: 900 });
  const toggle = page.locator('.reading-toggle');
  assert.equal(await toggle.evaluate(node => getComputedStyle(node).position), 'fixed');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await page.reload();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.body.classList.contains('wide')), true);
});

test('a scene written in a note reaches the reader drawn', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const spec = JSON.stringify({ viewBox: '0 0 760 230', title: 'Un paso del bucle', caption: 'La acción viaja hacia el entorno.', scene: { boxes: [{ x: 8, y: 64, w: 196, h: 110, label: 'AGENTE', tone: 'blue' }, { x: 556, y: 64, w: 196, h: 110, label: 'ENTORNO', tone: 'green' }], arrows: [{ x1: 208, y1: 100, x2: 552, y2: 100, label: 'acción', tone: 'blue' }] } });
  writeFileSync(join(root, 'rapidos', 'escena.md'), `# Escena\n\n<lk-scene>\n<script type="application/json">${spec}</script>\n</lk-scene>\n`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(base(await view({})) + 'rapidos/escena');
  await page.locator('lk-scene svg').waitFor({ timeout: 5000 });
  const labels = await page.locator('lk-scene svg text').allTextContents();
  assert.ok(labels.includes('AGENTE') && labels.includes('ENTORNO'), JSON.stringify(labels));
  assert.equal(await page.locator('lk-scene figcaption').textContent(), 'La acción viaja hacia el entorno.');
});

test('compact LSTM walkthrough fits mobile without changing default decks', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({ title: 'Prueba', viewBox: '0 0 320 200', steps: [{ title: 'Paso', text: 'Una transición', scene: { boxes: [{ x: 20, y: 20, w: 280, h: 70, label: 'Memoria' }] } }] });
  const deck = attr => `<lk-walkthrough ${attr}><script type="application/json">${scene}</script></lk-walkthrough>`;
  writeFileSync(join(root, 'rapidos', 'compact.md'), `# Prueba\n\n${deck('class="lk-wt-compact"')}\n\n${deck('')}`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base(await view({})) + 'rapidos/compact');
  const decks = page.locator('lk-walkthrough');
  await decks.first().locator('svg').waitFor();
  const widths = await decks.evaluateAll(nodes => nodes.map(node => ({ stage: node.querySelector('.lk-wt-stage').clientWidth, svg: node.querySelector('svg').getBoundingClientRect().width, hint: getComputedStyle(node.querySelector('.lk-wt-hint')).display })));
  assert.ok(widths[0].svg <= widths[0].stage + 1, JSON.stringify(widths));
  assert.equal(widths[0].hint, 'none');
  assert.ok(widths[1].svg >= 680);
  assert.notEqual(widths[1].hint, 'none');
  // Full screen is where the letters are meant to grow: the compact cap stays on the page only.
  await decks.first().getByRole('button', { name: 'Pantalla completa' }).click();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('lk-wt-compact'));
  assert.equal(await decks.first().locator('.lk-wt-stage').evaluate(node => getComputedStyle(node).maxWidth), 'none');
});

test('an arrow carries its words beside it, never on the line', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({ title: 'Flecha', viewBox: '0 0 320 260', steps: [{ title: 'Sube', text: 'Una transición', scene: { boxes: [{ x: 20, y: 20, w: 280, h: 62, label: 'Antes' }, { x: 20, y: 158, w: 280, h: 62, label: 'Después' }], arrows: [{ x1: 160, y1: 82, x2: 160, y2: 158, label: 'se guarda', labelSize: 21 }] } }] });
  writeFileSync(join(root, 'rapidos', 'flecha.md'), `# Flecha\n\n<lk-walkthrough class="lk-wt-compact"><script type="application/json">${scene}</script></lk-walkthrough>\n`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base(await view({})) + 'rapidos/flecha');
  const deck = page.locator('lk-walkthrough').first();
  await deck.locator('svg').waitFor();
  // The caption must not sit on the ink: the reader has to see which way the arrow points.
  const clear = await deck.evaluate(node => {
    const stage = node.querySelector('.lk-wt-stage');
    const caption = [...stage.querySelectorAll('text')].find(t => t.textContent.trim() === 'se guarda');
    const arrows = [...stage.querySelectorAll('path[marker-end]')];
    const c = caption.getBoundingClientRect();
    let inside = 0;
    for (const arrow of stage.querySelectorAll('path')) {
      const m = arrow.getScreenCTM();
      const total = arrow.getTotalLength();
      for (let i = 1; i < 20; i++) {
        const p = arrow.getPointAtLength(total * i / 20);
        const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
        if (x > c.x + 3 && x < c.x + c.width - 3 && y > c.y + 3 && y < c.y + c.height - 3) inside++;
      }
    }
    return { inside, head: arrows.length, drawn: stage.querySelectorAll('path').length, caption: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width) } };
  });
  // The arrow is cut where its words sit, so no ink ever crosses the caption.
  assert.equal(clear.inside, 0, `the caption sits on the arrow: ${JSON.stringify(clear)}`);
  assert.equal(clear.head, 1, `the arrow must keep one head: ${JSON.stringify(clear)}`);
  assert.ok(clear.drawn >= 2, `the shaft must be cut around the caption: ${JSON.stringify(clear)}`);
});

test('short arrow captions clear the marker and stay inside the stage', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({ title: 'Memoria', viewBox: '0 0 320 320', steps: [{ title: 'Paso', text: 'Transición', scene: { boxes: [{ x: 20, y: 10, w: 280, h: 62, label: 'Antes' }, { x: 20, y: 180, w: 280, h: 62, label: 'Después' }], arrows: [{ x1: 160, y1: 72, x2: 160, y2: 180, label: 'una leyenda larga sobre la flecha', labelSize: 28 }] } }] });
  writeFileSync(join(root, 'rapidos', 'head-regression.md'), `# Prueba\n\n<lk-walkthrough class="lk-wt-compact"><script type="application/json">${scene}</script></lk-walkthrough>`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base(await view({})) + 'rapidos/head-regression');
  const deck = page.locator('lk-walkthrough').first();
  await deck.locator('svg').waitFor();
  const result = await deck.evaluate(node => {
    const stage = node.querySelector('.lk-wt-stage'), svg = stage.querySelector('svg');
    const arrow = stage.querySelector('path[marker-end]'), m = arrow.getScreenCTM();
    const length = arrow.getTotalLength(), end = arrow.getPointAtLength(length), prev = arrow.getPointAtLength(length - 0.01);
    const dx = end.x - prev.x, dy = end.y - prev.y, mag = Math.hypot(dx, dy), ux = dx / mag, uy = dy / mag;
    const marker = stage.querySelector(`marker[id="${arrow.getAttribute('marker-end').match(/#([^)]*)/)[1]}"]`);
    const vb = marker.viewBox.baseVal, stroke = parseFloat(getComputedStyle(arrow).strokeWidth);
    const vertices = [[0, 0], [12, 6], [0, 12]].map(([x, y]) => {
      const a = (x - marker.refX.baseVal.value) * marker.markerWidth.baseVal.value / vb.width * stroke;
      const b = (y - marker.refY.baseVal.value) * marker.markerHeight.baseVal.value / vb.height * stroke;
      const px = end.x + ux * a - uy * b, py = end.y + uy * a + ux * b;
      return { x: m.a * px + m.c * py + m.e, y: m.b * px + m.d * py + m.f };
    });
    const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
    const head = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    const overlaps = [...stage.querySelectorAll('text')].map(t => {
      const b = t.getBoundingClientRect();
      return { text: t.textContent, x: Math.min(b.right, head.right) - Math.max(b.left, head.left), y: Math.min(b.bottom, head.bottom) - Math.max(b.top, head.top) };
    }).filter(hit => hit.x > 2 && hit.y > 2);
    const caption = [...stage.querySelectorAll('text')].find(t => t.textContent === 'una leyenda larga sobre la flecha').getBoundingClientRect();
    const bounds = svg.getBoundingClientRect();
    return { overlaps, inside: caption.left >= bounds.left - 1 && caption.right <= bounds.right + 1 };
  });
  assert.deepEqual(result.overlaps, [], JSON.stringify(result));
  assert.ok(result.inside, JSON.stringify(result));
});

test('deck titles leave room for the full-screen button', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({ title: 'Prueba', viewBox: '0 0 320 200', steps: [{ title: 'Paso', text: 'Una transición', scene: { boxes: [{ x: 20, y: 20, w: 280, h: 70, label: 'Memoria' }] } }] });
  const deck = title => `<lk-walkthrough class="lk-wt-compact"><script type="application/json">${scene.replace('Prueba', title)}</script></lk-walkthrough>`;
  writeFileSync(join(root, 'rapidos', 'longtitle.md'), `# Prueba\n\n${deck('El plural que hay que recordar')}\n\n${deck('LSTM')}\n`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base(await view({})) + 'rapidos/longtitle');
  const deckEl = page.locator('lk-walkthrough');
  await deckEl.first().locator('svg').waitFor();
  const measurements = await deckEl.evaluateAll(nodes => nodes.map(node => {
    const title = node.querySelector(':scope > .lk-title').getBoundingClientRect();
    const button = node.querySelector(':scope > .lk-wt-full').getBoundingClientRect();
    const style = getComputedStyle(node);
    const contentWidth = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return {
      overlaps: title.left < button.right && button.left < title.right && title.top < button.bottom && button.top < title.bottom,
      widthRatio: title.width / contentWidth,
    };
  }));
  for (const measured of measurements) {
    assert.equal(measured.overlaps, false, JSON.stringify(measured));
    assert.ok(measured.widthRatio >= 0.9, JSON.stringify(measured));
  }
});

test('a long word never leaves its walkthrough box', { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({
    title: 'Ajuste', viewBox: '0 0 320 200',
    steps: [{
      title: 'Paso', text: 'El texto se ajusta a la caja',
      scene: { boxes: [{ x: 20, y: 20, w: 280, h: 90, label: 'sin corrección, la primera palabra no aparece', sub: 'plural, ocho palabras antes del verbo' }] },
    }],
  });
  writeFileSync(join(root, 'rapidos', 'fit.md'), `# Ajuste\n\n<lk-walkthrough class="lk-wt-compact" title="Ajuste"><script type="application/json">${scene}</script></lk-walkthrough>\n`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base(await view({})) + 'rapidos/fit');
  const deck = page.locator('lk-walkthrough');
  await deck.locator('svg').waitFor();
  const measured = await deck.evaluate(node => {
    const stage = node.querySelector('.lk-wt-stage');
    const box = stage.querySelector('rect').getBBox();
    return [...stage.querySelectorAll('text')].map(text => {
      const b = text.getBBox();
      return { text: text.textContent.slice(0, 20), inside: b.x >= box.x - 1 && b.x + b.width <= box.x + box.width + 1, size: Number(text.getAttribute('font-size')), authored: 22 };
    });
  });
  assert.equal(measured.length, 2);
  for (const item of measured) assert.ok(item.inside, JSON.stringify(item));
  assert.ok(measured[0].size < measured[0].authored, JSON.stringify(measured));
});

test('the reader draws SVG fences while preserving inline figures and code samples', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view, topic } = await setup();
  const diagram = '<svg viewBox="0 0 380 260" role="img" aria-label="Estado de celda"><defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs><rect x="140" y="24" width="100" height="34" fill="none" stroke="currentColor"/><text x="190" y="46">c t-1 = 2,00</text><line x1="190" y1="58" x2="190" y2="82" stroke="currentColor" marker-end="url(#fl)"/></svg>';
  const inline = '<svg viewBox="0 0 100 50" role="img" aria-label="Figura inline"><text x="10" y="20">Inline</text></svg>';
  const unsafe = '<svg viewBox="0 0 100 50" onload="window.svgExecuted=true"><text onclick="window.svgExecuted=true">Seguro</text><foreignObject><div>outside</div></foreignObject><image href="https://evil.example/pixel"/></svg>';
  writeFileSync(join(topic, 'explicaciones', 'Parte 1 - Claves.md'), [
    '# Estado de celda', '', '```svg', diagram, '```', '', inline, '',
    '```text', diagram, '```', '', '```html', inline, '```', '',
    '```svg', unsafe, '```',
  ].join('\n'));
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = await view({ topic: TOPIC, part: 'p1' });
  const response = await page.goto(result.structuredContent.url);
  assert.equal(response.status(), 200);
  const figure = page.locator('svg[aria-label="Estado de celda"]');
  await figure.waitFor({ timeout: 10000 });
  assert.ok(await figure.evaluate(node => node.getBoundingClientRect().height > 0));
  assert.equal(await figure.locator('text').textContent(), 'c t-1 = 2,00');
  assert.equal(await figure.locator('marker').getAttribute('id'), 'fl');
  assert.equal(await figure.locator('line').getAttribute('marker-end'), 'url(#fl)');
  assert.equal(await page.locator('svg[aria-label="Figura inline"]').count(), 1);
  assert.equal(await page.locator('code.language-text').textContent(), diagram + '\n');
  assert.equal(await page.locator('code.language-html').textContent(), inline + '\n');
  assert.equal(await page.locator('code.language-svg').count(), 0);
  assert.equal(await page.locator('#app [onload], #app [onclick], #app foreignObject, #app image').count(), 0);
  assert.equal(await page.evaluate(() => window.svgExecuted), undefined);
  assert.deepEqual(errors, []);
});

// A phone reader of a part. KaTeX comes from the pinned CDN with SRI, like
// marked, so it cannot be stubbed.
async function phonePart(t, markdown) {
  const { view, topic } = await setup();
  writeFileSync(join(topic, 'explicaciones', 'Parte 1 - Claves.md'), markdown);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 360, height: 760 } });
  await page.goto((await view({ topic: TOPIC, part: 'p1' })).structuredContent.url);
  return page;
}

test('display math scrolls inside its block and never scrolls a phone reader sideways', { skip: !playwright && 'playwright not installed' }, async t => {
  const page = await phonePart(t, '# Valor\n\nAntes\n\n$$V^{\\pi}(s) = \\sum_a \\pi(a|s) \\sum_{s\',r} p(s\',r|s,a)[r + \\gamma V^{\\pi}(s\')]$$\n\ndespués\n');
  const math = page.locator('.math-display');
  await math.locator('.katex').waitFor({ timeout: 15000 });
  const measured = await math.evaluate(node => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    scrolls: node.scrollWidth > node.clientWidth,
    right: Math.round(node.getBoundingClientRect().right),
    viewport: window.innerWidth,
  }));
  assert.equal(measured.page, 0, JSON.stringify(measured));
  assert.ok(measured.scrolls, `the formula is not wider than its block: ${JSON.stringify(measured)}`);
  assert.ok(measured.right <= measured.viewport, JSON.stringify(measured));
});

test('a wide table keeps whole words on a phone and scrolls inside itself', { skip: !playwright && 'playwright not installed' }, async t => {
  const page = await phonePart(t, [
    '# Capas', '',
    '| Capa | Protocolo | Puerto | Encabezado | Responsabilidad | Dispositivo |',
    '|---|---|---|---|---|---|',
    '| Aplicación | HTTPS | 443 | Cabecera | Semántica | Navegador |',
    '| Transporte | TCP | efímero | Segmento | Fiabilidad | Kernel |', '',
  ].join('\n'));
  const table = page.locator('#app table');
  await table.waitFor({ timeout: 10000 });
  const measured = await table.evaluate(node => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    scrolls: node.scrollWidth > node.clientWidth,
    broken: [...node.querySelectorAll('th, td')].filter(cell => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return range.getClientRects().length > 1;
    }).map(cell => cell.textContent),
  }));
  assert.deepEqual(measured.broken, [], 'single-word cells must stay on one line');
  assert.ok(measured.scrolls, JSON.stringify(measured));
  assert.equal(measured.page, 0, JSON.stringify(measured));
});

test('a wide diagram keeps legible text on a phone and scrolls inside its box', { skip: !playwright && 'playwright not installed' }, async t => {
  const wide = label => `<svg viewBox="0 0 1200 400" role="img" aria-label="${label}"><rect width="1200" height="400" fill="none" stroke="currentColor"/><text x="20" y="60" font-size="28">Diagrama ancho</text></svg>`;
  const page = await phonePart(t, ['# Capas', '', '```svg', wide('Bloque'), '```', '', `Antes ${wide('En línea')} después`, ''].join('\n'));
  await page.locator('svg[aria-label="Bloque"]').waitFor({ timeout: 10000 });
  const measured = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    diagrams: [...document.querySelectorAll('#app svg[aria-label]')].map(svg => {
      const box = svg.parentElement;
      return {
        label: svg.getAttribute('aria-label'),
        text: Math.round(svg.querySelector('text').getBoundingClientRect().height),
        scrolls: box.scrollWidth > box.clientWidth && getComputedStyle(box).overflowX === 'auto',
      };
    }),
  }));
  assert.equal(measured.diagrams.length, 2, JSON.stringify(measured));
  for (const diagram of measured.diagrams) {
    assert.ok(diagram.text >= 12, `diagram text is ${diagram.text}px: ${JSON.stringify(diagram)}`);
    assert.ok(diagram.scrolls, JSON.stringify(diagram));
  }
  assert.equal(measured.page, 0, JSON.stringify(measured));
});

// TSP pins for the diagram box: a small icon inside a sentence stays in the
// sentence, and an author-sized diagram is never blown past the size it was given.
test('an inline icon inside a sentence stays on the line of its words', { skip: !playwright && 'playwright not installed' }, async t => {
  const icon = '<svg viewBox="0 0 24 24" width="16" height="16" role="img" aria-label="guardar"><circle cx="12" cy="12" r="10"/></svg>';
  const page = await phonePart(t, `# Capas\n\nPulsa ${icon} para guardar.\n`);
  await page.setViewportSize({ width: 1280, height: 900 });
  const svg = page.locator('svg[aria-label="guardar"]');
  await svg.waitFor({ timeout: 10000 });
  const seen = await svg.evaluate(node => {
    const paragraph = node.closest('p');
    const texts = [...paragraph.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    const box = n => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect(); };
    const before = box(texts[0]), after = box(texts.at(-1)), icon = node.getBoundingClientRect();
    return {
      sameLine: Math.abs(before.top - after.top) < 2,
      iconOnLine: icon.top < before.bottom && icon.bottom > before.top && icon.left > before.right - 1 && icon.right < after.left + 1,
    };
  });
  assert.ok(seen.sameLine && seen.iconOnLine, `the icon breaks its sentence: ${JSON.stringify(seen)}`);
});

test('a diagram the author sized is not enlarged on a phone', { skip: !playwright && 'playwright not installed' }, async t => {
  const page = await phonePart(t, '# Capas\n\n```svg\n<svg viewBox="0 0 1200 400" width="300" height="100" role="img" aria-label="tamaño fijo"><text x="10" y="200" font-size="120">S</text></svg>\n```\n');
  const svg = page.locator('svg[aria-label="tamaño fijo"]');
  await svg.waitFor({ timeout: 10000 });
  const width = await svg.evaluate(node => Math.round(node.getBoundingClientRect().width));
  assert.ok(width <= 300, `the 300 px diagram renders ${width} px wide`);
});

test('prose next to a long inline code keeps normal word gaps on a phone', { skip: !playwright && 'playwright not installed' }, async t => {
  const page = await phonePart(t, '# Capas\n\nTexto con `una_columna_de_nombre_muy_largo_department_id_employee_identifier` en línea.\n');
  const paragraph = page.locator('#app p', { hasText: 'Texto con' });
  await paragraph.waitFor({ timeout: 10000 });
  const gap = await paragraph.evaluate(node => {
    const text = node.firstChild;
    const word = (start, end) => { const r = document.createRange(); r.setStart(text, start); r.setEnd(text, end); return r.getBoundingClientRect(); };
    const first = word(0, 5), second = word(6, 9);
    return { sameLine: Math.abs(first.top - second.top) < 2, gap: Math.round(second.left - first.right) };
  });
  assert.ok(gap.sameLine, JSON.stringify(gap));
  assert.ok(gap.gap <= 12, `the words are stretched ${gap.gap}px apart`);
});

test('plain part and diagnosis share optional dictable reasoning', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view, topic } = await setup({ transcriber: { url: 'http://127.0.0.1:1', token: 'never-in-page' } });
  const browser = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/api/transcribe', route => route.fulfill({ json: { text: 'Mi razonamiento dictado' } }));
  for (const part of ['p1', 'quiz']) {
    const result = await view({ topic: TOPIC, part });
    await page.goto(result.structuredContent.url);
    assert.equal(await page.getByText('¿Qué entendiste que te pide la pregunta?').count(), 0);
    assert.equal(await page.getByText('¿Por qué llegaste a esa opción?').count(), 0);
    const fields = page.locator('fieldset.quiz-question').filter({ has: page.locator('input[type=radio]:not(:disabled)') });
    assert.ok(await fields.count() > 0);
    assert.equal(await fields.locator('textarea').count(), await fields.count());
    const mic = fields.first().getByRole('button', { name: /Dictar/ });
    await mic.click();
    await page.waitForFunction(() => document.querySelector('.lk-mic')?.textContent === 'Detener');
    await page.waitForTimeout(300);
    await mic.click();
    await page.waitForFunction(() => document.querySelector('fieldset textarea')?.value === 'Mi razonamiento dictado');
    assert.equal(await fields.first().getByLabel('Cómo lo pensé (opcional)').inputValue(), 'Mi razonamiento dictado');
    if (part === 'p1') {
      for (const field of await fields.all()) {
        await field.locator('input[type=radio]').first().check();
      }
      await page.getByRole('button', { name: 'Enviar al tutor' }).click();
      await page.getByText('Indica en cada pregunta qué tan seguro estás: seguro, dudo o adiviné.').waitFor();
      for (const field of await fields.all()) await field.locator('.confidence input').first().check();
      const sent = page.waitForRequest(request => request.url().endsWith('/submit'));
      const received = page.waitForResponse(response => response.url().endsWith('/submit'));
      await page.getByRole('button', { name: 'Enviar al tutor' }).click();
      const payload = (await sent).postDataJSON();
      assert.equal((await received).status(), 200);
      const reasoning = Object.values(payload.reasoning);
      assert.deepEqual(reasoning[0], { razonamiento: 'Mi razonamiento dictado', confianza: 'seguro' });
      assert.ok(reasoning.slice(1).every(value => value.razonamiento === '' && value.confianza === 'seguro'));
      const stored = JSON.parse(readFileSync(join(topic, 'mini-quiz', 'p1.answers.json'), 'utf8'));
      assert.deepEqual(stored.razonamientos, Object.fromEntries(Object.entries(payload.reasoning).filter(([, value]) => value.razonamiento)));
      assert.equal(Object.keys(stored.answers).length, reasoning.length);
    }
  }
  const asset = await http(base(await view({ topic: TOPIC, part: 'p1' })) + 'kit/dictate.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers['content-type'], /javascript/);
});

test('diagnosis iframe presents the editorial layout and retains every question control', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view } = await setup();
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const result = await view({ topic: TOPIC, part: 'quiz' });
  await page.goto(base(result));
  await page.evaluate(url => {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'width:100%;height:1800px;border:0';
    document.body.append(frame);
  }, result.structuredContent.url);
  const frame = page.frameLocator('iframe');
  const fields = frame.locator('fieldset.quiz-question');
  await fields.first().waitFor();
  assert.equal(await fields.count(), 3);
  assert.equal(await frame.getByText('Ronda 1', { exact: true }).count(), 1);
  assert.equal(await frame.getByText('Ronda 2', { exact: true }).count(), 1);
  assert.equal(await fields.nth(0).locator('input[value=B]').isChecked(), true);
  assert.equal(await fields.nth(0).locator('input[value=B]').isDisabled(), true);
  for (const field of [fields.nth(1), fields.nth(2)]) {
    assert.equal(await field.locator('input[type=radio][name^=question-]').count(), 5);
    assert.equal(await field.locator('textarea').count(), 1);
    assert.equal(await field.locator('.confidence input').count(), 3);
  }
  const heading = frame.getByRole('heading', { name: '¿Qué sabes hasta ahora?', exact: true });
  assert.equal(await heading.count(), 1, 'diagnosis shows the approved editorial heading');
  assert.equal(await heading.evaluate(node => getComputedStyle(node).fontSize), '34px');
  const fieldStyle = await fields.nth(1).evaluate(node => ({
    border: getComputedStyle(node).borderTopWidth,
    width: node.getBoundingClientRect().width,
  }));
  assert.equal(fieldStyle.border, '1px');
  assert.ok(fieldStyle.width <= 700, `diagnosis measure is ${fieldStyle.width}px`);
});

test('«No sé» needs no confidence and a framed submit notifies the studio', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view } = await setup();
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await view({ topic: TOPIC, part: 'p1' });
  // The page allows 'self' as embedder: frame it from the bridge's own index, as the studio frames it.
  await page.goto(base(result));
  await page.evaluate(url => {
    window.received = [];
    addEventListener('message', event => window.received.push(event.data));
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'width:1000px;height:2000px';
    document.body.append(frame);
  }, result.structuredContent.url);
  const frame = page.frameLocator('iframe');
  const fields = frame.locator('fieldset.quiz-question');
  await fields.first().waitFor();
  const [first, second] = [fields.nth(0), fields.nth(1)];
  await first.locator('input[value=A]').check();
  assert.equal(await first.locator('.confidence').isVisible(), true);
  await first.locator('.confidence input').first().check();
  await first.locator('input[value=E]').check();
  assert.equal(await first.locator('.confidence').isVisible(), false);
  await second.locator('input[value=B]').check();
  await frame.getByRole('button', { name: 'Enviar al tutor' }).click();
  await frame.getByText('Indica en cada pregunta qué tan seguro estás: seguro, dudo o adiviné.').waitFor();
  await second.locator('.confidence input').first().check();
  const sent = page.waitForRequest(request => request.url().endsWith('/submit'));
  await frame.getByRole('button', { name: 'Enviar al tutor' }).click();
  const payload = (await sent).postDataJSON();
  assert.deepEqual(payload.reasoning.q1, { razonamiento: '' });
  assert.deepEqual(payload.reasoning.q2, { razonamiento: '', confianza: 'seguro' });
  // The frame also reports scroll direction, so wait for the submission itself.
  await page.waitForFunction(() => window.received.some((message) => message.type === 'learning:submitted'));
  assert.deepEqual((await page.evaluate(() => window.received)).filter((message) => message.type === 'learning:submitted'), [{
    type: 'learning:submitted', kind: 'mini-quiz', topic: TOPIC, part: 'p1', score: '1/2',
    results: [
      { id: 'q1', enunciado: 'Pregunta q1', chosen: 'E', chosenText: 'No sé', correct: 'B', correctText: 'b', ok: false },
      { id: 'q2', enunciado: 'Pregunta q2', chosen: 'B', chosenText: 'b', correct: 'B', correctText: 'b', ok: true },
    ],
  }]);
});

test('rich-page quiz: «No sé» hides confidence and a framed submit notifies the studio', { skip: !playwright && 'playwright not installed' }, async t => {
  const { view, topic } = await setup();
  writeFileSync(
    join(topic, 'explicaciones', 'Parte 1 - Claves.html'),
    '<!doctype html><html lang="es"><head><link rel="stylesheet" href="../kit/kit.css"><script src="../kit/kit.js" defer></script></head><body><main><h1>Rica</h1><lk-quiz></lk-quiz></main></body></html>',
  );
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await view({ topic: TOPIC, part: 'p1' });
  // A hand-built page keeps its own design, so it gets the reading-mode assets
  // and nothing else. Without them the book mode cannot paginate a rich part.
  const served = await fetch(result.structuredContent.url).then((r) => r.text());
  assert.match(served, /book\.css/);
  assert.match(served, /book\.js/);
  await page.goto(base(result));
  await page.evaluate(url => {
    window.received = [];
    addEventListener('message', event => window.received.push(event.data));
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'width:1000px;height:2000px';
    document.body.append(frame);
  }, result.structuredContent.url);
  const frame = page.frameLocator('iframe');
  const boxes = frame.locator('fieldset.lk-question');
  await boxes.first().waitFor();
  const [first, second] = [boxes.nth(0), boxes.nth(1)];
  await first.locator('input[value=A]').check();
  await first.locator('.lk-controls input').first().check();
  assert.equal(await first.locator('.lk-controls').isVisible(), true);
  await first.locator('input[value=E]').check();
  assert.equal(await first.locator('.lk-controls').isVisible(), false);
  await first.locator('textarea').fill('ni idea');
  await second.locator('input[value=B]').check();
  const sent = page.waitForRequest(request => request.url().endsWith('/submit'));
  await frame.getByRole('button', { name: 'Enviar al tutor' }).click();
  const payload = (await sent).postDataJSON();
  assert.deepEqual(payload.reasoning.q1, { razonamiento: 'ni idea' });
  // The frame also reports scroll direction, so wait for the submission itself.
  await page.waitForFunction(() => window.received.some((message) => message.type === 'learning:submitted'));
  assert.deepEqual((await page.evaluate(() => window.received)).filter((message) => message.type === 'learning:submitted'), [{
    type: 'learning:submitted', kind: 'mini-quiz', topic: TOPIC, part: 'p1', score: '1/2',
    results: [
      { id: 'q1', enunciado: 'Pregunta q1', chosen: 'E', chosenText: 'No sé', correct: 'B', correctText: 'b', ok: false },
      { id: 'q2', enunciado: 'Pregunta q2', chosen: 'B', chosenText: 'b', correct: 'B', correctText: 'b', ok: true },
    ],
  }]);
});

test("dictation uploads audio privately, rejects invalid input and deletes failed jobs", async (t) => {
  const seen = []; let failed = false; let polls = 0;
  const fake = httpServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks) });
    if (req.method === "DELETE") { res.writeHead(204); return res.end(); }
    res.setHeader("content-type", "application/json");
    res.end(req.method === "PUT" ? JSON.stringify({ id: "job1" }) : req.url.endsWith("/txt") ? "hola mundo" : JSON.stringify({ status: failed ? "failed" : ["queued", "running", "done"][Math.min(polls++, 2)] }));
  });
  await new Promise(resolve => fake.listen(0, "127.0.0.1", resolve));
  t.after(() => { fake.closeAllConnections(); fake.close(); });
  const { view } = await setup({ transcriber: { url: `http://127.0.0.1:${fake.address().port}`, token: "private-transcriber-token" } });
  const result = await view({ topic: TOPIC, part: "p1" });
  const endpoint = base(result) + "api/transcribe";
  const headers = { origin: new URL(endpoint).origin, "content-type": "audio/webm" };
  const audio = Buffer.from([0, 1, 2, 255]);
  const response = await http(endpoint, { method: "POST", headers, body: audio });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { text: "hola mundo" });
  assert.equal(seen[0].auth, "Bearer private-transcriber-token");
  assert.equal(seen[0].url, "/api/jobs?filename=dictado.webm&diarize=false", "dictation is one voice: no speaker labels");
  assert.deepEqual(seen[0].body, audio);
  assert.equal(seen.at(-1).method, "DELETE");
  const count = seen.length;
  for (const [extra, body, status] of [[{ origin: "https://evil.example" }, audio, 403], [{ "content-type": "text/plain" }, audio, 415], [{}, "", 400], [{}, Buffer.alloc(15 * 1024 * 1024 + 1), 413]]) {
    assert.equal((await http(endpoint, { method: "POST", headers: { ...headers, ...extra }, body })).status, status);
    assert.equal(seen.length, count);
  }
  failed = true;
  assert.equal((await http(endpoint, { method: "POST", headers, body: audio })).status, 502);
  assert.equal(seen.at(-1).method, "DELETE");
  const page = await http(result.structuredContent.url);
  assert.doesNotMatch(page.body, /private-transcriber-token/);
  assert.match(page.body, /transcribeUrl/);
  const diagnosis = await view({ topic: TOPIC, part: 'quiz' });
  assert.equal(diagnosis.isError, false);
  const html = (await http(diagnosis.structuredContent.url)).body;
  assert.match(html, /transcribeUrl/);
  assert.doesNotMatch(html, /private-transcriber-token/);
  const plain = await setup();
  const other = await plain.view({ topic: TOPIC, part: "p1" });
  assert.equal((await http(base(other) + "api/transcribe", { method: "POST", headers, body: audio })).status, 404);
  assert.doesNotMatch((await http(other.structuredContent.url)).body, /transcribeUrl/);
});

test("public bridge origins preserve loopback access and constrain proxy requests", async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const publicOrigin = "https://box.tail0.ts.net:8446";
  const publicEmbedder = "https://box.tail0.ts.net:8445";
  const { view } = await setup({ port, publicOrigin, publicEmbedder });
  const result = await view({ topic: TOPIC, part: "p1" });
  const url = result.structuredContent.url;
  assert.match(url, /^https:\/\/box\.tail0\.ts\.net:8446\/[a-f0-9]{64}\//);
  const local = url.replace(publicOrigin, `http://127.0.0.1:${port}`);
  for (const host of [`127.0.0.1:${port}`, "box.tail0.ts.net:8446"]) {
    const page = await http(local, { headers: { host } });
    assert.equal(page.status, 200);
    assert.ok(page.headers["content-security-policy"].includes(publicEmbedder));
  }
  assert.equal((await http(local, { headers: { host: "evil.example:80" } })).status, 403);
  const endpoint = `http://127.0.0.1:${port}${new URL(result.structuredContent.base).pathname}submit`;
  for (const [origin, rejected] of [[publicOrigin, false], ["https://evil.example", true]]) {
    const response = await http(endpoint, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status === 403, rejected);
  }
});

test("a second public bridge origin is authorized while the first stays canonical", async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const canonical = "https://learnings.infra.local:8446";
  const fallback = "https://10.154.59.151:8446";
  const { view } = await setup({ port, publicOrigin: `${canonical},${fallback}`, publicEmbedder: "https://learnings.infra.local,https://10.154.59.151:8445" });
  const result = await view({ topic: TOPIC, part: "p1" });
  const url = result.structuredContent.url;
  assert.match(url, /^https:\/\/learnings\.infra\.local:8446\/[a-f0-9]{64}\//);
  const local = url.replace(canonical, `http://127.0.0.1:${port}`);
  for (const host of ["learnings.infra.local:8446", "10.154.59.151:8446"]) {
    const page = await http(local, { headers: { host } });
    assert.equal(page.status, 200, host);
    assert.ok(page.headers["content-security-policy"].includes("https://learnings.infra.local"), host);
    assert.ok(page.headers["content-security-policy"].includes("https://10.154.59.151:8445"), host);
  }
  const endpoint = `http://127.0.0.1:${port}${new URL(result.structuredContent.base).pathname}submit`;
  for (const [origin, rejected] of [[canonical, false], [fallback, false], ["https://evil.example", true]]) {
    const response = await http(endpoint, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status === 403, rejected, origin);
  }
});

test("public bridge options reject non-bare HTTPS origins at registration", () => {
  for (const option of ["publicOrigin", "publicEmbedder"]) {
    for (const value of ["http://box.ts.net", "https://a.ts.net; script-src *", "*", "https://a.ts.net/path"]) {
      assert.throws(() => registerBridge(makeHost().api, { root: makeRoot().root, [option]: value }), new RegExp(option));
    }
  }
});

test("code vault lists malformed exercises and exclusively appends submission history", () => {
  const { root, topic } = makeRoot();
  const dir = codeFixture(topic);
  mkdirSync(join(topic, "codigo", "broken"));
  writeFileSync(join(topic, "codigo", "broken", "ejercicio.json"), "{}");
  const record = { lenguaje: "python", codigo: "print(1)", compilacion: { ok: true, salida: "" }, resultados: [], aprobados: 1, total: 2 };
  const first = saveSubmission(dir, record);
  const original = readFileSync(first, "utf8");
  saveSubmission(dir, { ...record, codigo: "print(2)", aprobados: 2 });
  assert.equal(readFileSync(first, "utf8"), original);
  const history = readSubmissions(dir);
  assert.equal(history.lastCode, "print(2)");
  assert.deepEqual(history.submissions.map(({ numero, aprobados, total }) => ({ numero, aprobados, total })), [{ numero: 1, aprobados: 1, total: 2 }, { numero: 2, aprobados: 2, total: 2 }]);
  assert.ok(history.submissions.every((s) => !Number.isNaN(Date.parse(s.fecha))));
  const exercises = listExercises(topic, loadRunners());
  assert.deepEqual(exercises.map((e) => e.id), ["broken", "eco"]);
  assert.match(exercises[0].error, /titulo/);
  assert.equal(exercises[1].mejor, "2/2");
  assert.equal(exercises[1].entregas, 2);
  assert.equal(listTopics(root)[0].exercises[1].mejor, "2/2");
  assert.equal(exerciseFile(topic, "eco"), join(dir, "ejercicio.json"));
  assert.throws(() => exerciseFile(topic, "../eco"));
});

test("listTopics exposes exam metadata from engine state and leaves legacy topics unchanged", () => {
  const { root, topic } = makeRoot();
  const [legacy] = listTopics(root);
  assert.equal(legacy.exam, undefined);

  const state = readFileSync(new URL("../../studio/testdata/exam-state.json", import.meta.url), "utf8");
  const stateDir = join(topic, ".learning");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "state.json"), state);

  const [summary] = listTopics(root);
  assert.deepEqual(summary.exam, { format: "practical", practice: "build an app" });
  assert.deepEqual(summary.parts.map(({ id, title }) => ({ id, title })), [
    { id: "p1", title: "Claves" },
    { id: "p2", title: "Joins" },
  ]);
});

function codeFixture(topic) {
  const dir = join(topic, "codigo", "eco");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ejercicio.json"), JSON.stringify({ titulo: "Eco", enunciado: "Repite la entrada", lenguaje: "python", plantilla: "print(input())", parte: "p1", tests: [
    { nombre: "visible", entrada: "hola", salida: "hola" },
    { nombre: "secreto", entrada: "HIDDEN_INPUT_97", salida: "HIDDEN_EXPECTED_98", oculto: true },
  ] }));
  return dir;
}

test("code pages, code-only topics and learning_view never expose hidden data", async () => {
  const { topic, root, view, host } = await setup();
  codeFixture(topic);
  const codeOnly = join(root, "solo-codigo");
  codeFixture(codeOnly);
  const result = await view({ topic: TOPIC, part: "codigo/eco" });
  assert.equal(result.isError, false);
  const response = await http(result.structuredContent.url);
  assert.equal(response.status, 200);
  assert.match(response.body, /"kind":"code"/);
  assert.doesNotMatch(response.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
  const leak = await http(result.structuredContent.base + TOPIC + "/file/codigo/eco/ejercicio.json");
  assert.equal(leak.status, 404);
  assert.doesNotMatch(leak.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
  for (const name of [TOPIC, "solo-codigo"]) {
    const page = await http((await view({ topic: name })).structuredContent.url);
    assert.equal(page.status, 200);
    assert.match(page.body, /"exercises":\[/);
    assert.match(page.body, /Eco/);
  }
  assert.equal((await view({ topic: TOPIC, part: "codigo/.." })).isError, true);
  assert.equal(existsSync(join(topic, "codigo", "eco", "entregas")), false);
  assert.deepEqual(host.sent, []);
});

test("code HTTP runs, free input, submissions and rejected requests", async (t) => {
  if (spawnSync("docker", ["image", "inspect", "python:3.12-alpine"]).status !== 0) return t.skip("python:3.12-alpine is not installed");
  const { topic, view, host } = await setup();
  const dir = codeFixture(topic);
  const { base } = (await view({ topic: TOPIC })).structuredContent;
  const post = (path, body, origin = new URL(base).origin) => http(base + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = { topic: TOPIC, exercise: "eco", code: "print(input())" };
  for (const [path, body, origin, status] of [
    ["submit", { ...payload, kind: "code" }, "http://foreign.invalid", 403],
    ["submit", { ...payload, kind: "code", extra: true }, undefined, 400],
    ["api/code/run", { ...payload, extra: true }, undefined, 400],
    ["submit", { ...payload, kind: "code", exercise: "../eco" }, undefined, 422],
  ]) {
    const response = await post(path, body, origin);
    assert.equal(response.status, status);
    assert.equal(typeof JSON.parse(response.body).error, "string");
    assert.equal(existsSync(join(dir, "entregas")), false);
    assert.deepEqual(host.sent, []);
  }
  const visible = await post("api/code/run", payload);
  assert.equal(visible.status, 200);
  assert.equal(JSON.parse(visible.body).resultados.length, 1);
  assert.equal(JSON.parse(visible.body).aprobados, 1);
  const free = await post("api/code/run", { ...payload, input: "libre" });
  assert.equal(free.status, 200);
  assert.equal(JSON.parse(free.body).resultados[0].estado, "ejecutado");
  assert.equal(JSON.parse(free.body).resultados[0].obtenido.trim(), "libre");
  assert.equal(existsSync(join(dir, "entregas")), false);
  assert.deepEqual(host.sent, []);
  for (const n of [1, 2]) {
    const response = await post("submit", { ...payload, kind: "code", note: "Mi enfoque" });
    assert.equal(response.status, 200);
    const data = JSON.parse(response.body);
    assert.equal(data.score, "1/2");
    assert.equal(data.saved, `codigo/eco/entregas/00${n}.json`);
    assert.doesNotMatch(response.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
    const record = JSON.parse(readFileSync(join(dir, "entregas", `00${n}.json`), "utf8"));
    assert.equal(record.numero, n);
    assert.equal(record.codigo, payload.code);
    assert.equal(record.nota, "Mi enfoque");
    assert.equal(record.resultados[1].esperado, "HIDDEN_EXPECTED_98");
    assert.equal(host.sent.length, n);
    assert.match(host.sent[n - 1].content, /\[Vista HTML · sql-demo · código eco\]/);
    assert.match(host.sent[n - 1].content, /1\/2/);
    assert.ok(host.sent[n - 1].content.includes("```python\nprint(input())\n```"));
    assert.ok(host.sent[n - 1].content.includes(data.saved));
    assert.ok(host.sent[n - 1].content.includes("HIDDEN_EXPECTED_98"));
    assert.ok(host.sent[n - 1].content.includes('"""\nMi enfoque\n"""'));
    assert.equal(host.sent[n - 1].options.deliverAs, "followUp");
  }
  const page = await http((await view({ topic: TOPIC, part: "codigo/eco" })).structuredContent.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /"lastCode":"print\(input\(\)\)"/);
  assert.doesNotMatch(page.body, /HIDDEN_INPUT_97|HIDDEN_EXPECTED_98/);
});
const openServers = [];
after(async () => {
  for (const shutdown of openServers) await shutdown();
});

function makeRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "learnings-")));
  const topic = join(root, TOPIC);
  mkdirSync(join(topic, "explicaciones", "adjuntos"), { recursive: true });
  mkdirSync(join(topic, "explicaciones", "demos"), { recursive: true });
  mkdirSync(join(topic, "mini-quiz"), { recursive: true });
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "SQL demo",
      parts: [
        { id: "p1", title: "Claves", slug: "Claves" },
        { id: "p2", title: "Joins", slug: "Joins" },
      ],
    }),
  );
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.md"),
    "---\ntipo: explicacion\n---\n# Parte 1 — Claves\n\n> [!video] Video\n> ![[Parte 1 - Claves.mp4]]\n\nUna **clave** identifica.\n",
  );
  writeFileSync(join(topic, "explicaciones", "adjuntos", "Parte 1 - Claves.mp4"), Buffer.from("0123456789"));
  writeFileSync(join(topic, "explicaciones", "demos", "p1-claves.html"), "<p>demo</p>");
  mkdirSync(join(topic, "explicaciones", "apps"), { recursive: true });
  writeFileSync(join(topic, "explicaciones", "apps", "p1.html"), "<!doctype html><html><head><title>app</title></head><body>app</body></html>");
  const question = (id, extra = {}) => ({
    id,
    enunciado: `Pregunta ${id}`,
    options: { A: "a", B: "b", C: "c", D: "d", E: "No sé" },
    answer: "B",
    ...extra,
  });
  writeFileSync(join(topic, "mini-quiz", "p1.json"), JSON.stringify({ questions: [question("q1"), question("q2")] }));
  writeFileSync(
    join(topic, "quiz.json"),
    JSON.stringify({ questions: [question("d1", { round: 1 }), question("d2", { round: 1 }), question("d3", { round: 2 })] }),
  );
  writeFileSync(join(topic, "quiz.answers.json"), JSON.stringify({ answers: { d1: "B" } }, null, 2) + "\n");
  writeFileSync(join(root, "secret.txt"), "outside topic");
  return { root, topic };
}

function makeHost() {
  const handlers = new Map();
  const tools = new Map();
  const sent = [];
  const api = {
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    sendUserMessage(content, options) {
      sent.push({ content, options });
    },
  };
  return { api, handlers, tools, sent };
}

async function setup(options = {}) {
  const { root, topic } = makeRoot();
  const host = makeHost();
  registerBridge(host.api, { root, ...options });
  const view = async (params, cwd = root) => {
    const result = await host.tools.get("learning_view").execute("call", params, undefined, undefined, { cwd });
    return result;
  };
  const shutdown = async () => {
    for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
  };
  openServers.push(shutdown);
  return { root, topic, host, view, shutdown };
}

function http(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const base = (result) => result.structuredContent.base;
const why = (...ids) =>
  Object.fromEntries(ids.map((id) => [id, { razonamiento: `pienso ${id}`, confianza: "seguro" }]));

function submit(url, payload, headers = {}) {
  const origin = new URL(url).origin;
  return http(`${url}submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

test("learning_view rejects a session outside the Learnings root and starts no server", async () => {
  const { view, shutdown } = await setup();
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "elsewhere-")));
  const result = await view({}, outside);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /outside the Learnings root/);
  assert.equal(result.structuredContent.url, undefined);
  await shutdown();
});

test("learning_view returns a loopback URL with a token; index lists topics; wrong token or Host is refused", async () => {
  const { view, shutdown } = await setup();
  const result = await view({});
  assert.equal(result.isError, false);
  const url = new URL(result.structuredContent.url);
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/[0-9a-f]{64}\/$/);
  const index = await http(url.href);
  assert.equal(index.status, 200);
  assert.match(index.body, /sql-demo/);
  assert.equal(index.headers["referrer-policy"], "no-referrer");
  assert.match(index.headers["content-security-policy"], /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  const wrongToken = await http(`${url.origin}/${"0".repeat(64)}/`);
  assert.equal(wrongToken.status, 404);
  const rebinding = await http(url.href, { headers: { host: "evil.example:80" } });
  assert.equal(rebinding.status, 403);
  await shutdown();
});

test("a seeded bridge keeps its token across restarts; an unseeded one draws a new token each start", async () => {
  const token = async (options) => {
    const { view, shutdown } = await setup(options);
    const found = new URL(base(await view({}))).pathname.split("/")[1];
    await shutdown();
    return found;
  };
  const seed = "ab".repeat(32);
  const seeded = await token({ tokenSeed: seed });
  assert.match(seeded, /^[0-9a-f]{64}$/);
  assert.equal(await token({ tokenSeed: seed }), seeded, "same seed, same token after a restart");
  assert.notEqual(seeded, seed, "the seed itself is never the token");
  assert.notEqual(await token({ tokenSeed: "cd".repeat(32) }), seeded, "another seed, another token");
  assert.notEqual(await token({}), await token({}), "without a seed every start is new");
});

test("a second learning_view call reuses the same server and token", async () => {
  const { view, shutdown } = await setup();
  const first = await view({});
  const second = await view({ topic: TOPIC, part: "p1" });
  assert.equal(base(first), base(second));
  assert.equal(second.structuredContent.url, `${base(first)}${TOPIC}/p1`);
  await shutdown();
});

test("learning_view validates topic and part against plan.json", async () => {
  const { view, shutdown } = await setup();
  const badTopic = await view({ topic: "../etc" });
  assert.equal(badTopic.isError, true);
  assert.match(badTopic.content[0].text, /topic/);
  const missingPart = await view({ topic: TOPIC, part: "p9" });
  assert.equal(missingPart.isError, true);
  assert.match(missingPart.content[0].text, /p9/);
  await shutdown();
});

test("part page embeds the note with the video wired to the file route and the quiz without answer keys", async () => {
  const { view, shutdown } = await setup();
  const url = (await view({ topic: TOPIC, part: "p1" })).structuredContent.url;
  const page = await http(url);
  assert.equal(page.status, 200);
  const data = JSON.parse(page.body.match(/<script type="application\/json" id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.kind, "part");
  assert.doesNotMatch(data.markdown, /^---/);
  assert.match(data.markdown, /<video controls preload="metadata" src="file\/explicaciones\/adjuntos\/Parte%201%20-%20Claves\.mp4">/);
  assert.deepEqual(data.quiz.questions.map((q) => q.id), ["q1", "q2"]);
  assert.equal(JSON.stringify(data.quiz).includes('"answer"'), false);
  assert.deepEqual(data.demos, ["file/explicaciones/demos/p1-claves.html"]);
  assert.deepEqual(data.video, { src: "explicaciones/adjuntos/Parte 1 - Claves.mp4", exists: true }, "every node carries its video control");
  assert.equal(data.app, undefined, "the interactive app is gone");
  const demo = await http(new URL(data.demos[0], url).href);
  assert.equal(demo.status, 200);
  assert.equal(demo.headers["content-security-policy"], "sandbox allow-scripts");
  assert.equal(data.answered, null);
  await shutdown();
});

test("an unwritten part is not served", async () => {
  const { view, shutdown } = await setup();
  const url = (await view({ topic: TOPIC })).structuredContent.url;
  const page = await http(`${url}/p2`);
  assert.equal(page.status, 404);
  await shutdown();
});

test("file route serves topic files with Range and refuses traversal and symlinks out of the topic", async () => {
  const { view, topic, root, shutdown } = await setup();
  const url = (await view({ topic: TOPIC })).structuredContent.url;
  const video = `${url}/file/explicaciones/adjuntos/Parte%201%20-%20Claves.mp4`;
  const full = await http(video);
  assert.equal(full.status, 200);
  assert.equal(full.headers["content-type"], "video/mp4");
  assert.equal(full.headers["accept-ranges"], "bytes");
  const ranged = await http(video, { headers: { range: "bytes=2-5" } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.body, "2345");
  assert.equal(ranged.headers["content-range"], "bytes 2-5/10");
  const traversal = await http(`${url}/file/..%2Fsecret.txt`);
  assert.equal(traversal.status, 404);
  symlinkSync(join(root, "secret.txt"), join(topic, "link.txt"));
  const link = await http(`${url}/file/link.txt`);
  assert.equal(link.status, 404);
  await shutdown();
});

test("plan.json part ids or slugs with path separators are never used as paths", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({ topic: "x", parts: [{ id: "../p1", title: "t", slug: "Claves" }, { id: "p3", title: "t", slug: "../../secret" }] }),
  );
  // Without the check, "Parte 2 - ../../secret.md" resolves to explicaciones/secret.md.
  mkdirSync(join(topic, "explicaciones", "Parte 2 - .."));
  writeFileSync(join(topic, "explicaciones", "secret.md"), "secret");
  assert.equal((await view({ topic: TOPIC, part: "../p1" })).isError, true);
  assert.equal((await view({ topic: TOPIC, part: "p3" })).isError, true);
  await shutdown();
});

test("the retired app route is gone and every part payload carries its video control", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Joins.md"), "# Parte 2 — Joins\n");
  const result = await view({ topic: TOPIC, part: "p1" });
  assert.equal(result.structuredContent.appUrl, undefined);
  assert.doesNotMatch(result.content[0].text, /Aplicación interactiva/);
  assert.equal((await http(`${base(result)}${TOPIC}/p1/app`)).status, 404);
  assert.equal((await http(`${base(result)}${TOPIC}/p2/app`)).status, 404);
  assert.equal((await http(`${base(result)}${TOPIC}/..%2Fp1/app`)).status, 404);
  const page = await http(result.structuredContent.url);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.app, undefined);
  assert.deepEqual(data.video, { src: "explicaciones/adjuntos/Parte 1 - Claves.mp4", exists: true });
  const second = await view({ topic: TOPIC, part: "p2" });
  const secondData = JSON.parse((await http(second.structuredContent.url)).body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(secondData.video, { src: "explicaciones/adjuntos/Parte 2 - Joins.mp4", exists: false }, "a node without an mp4 still offers the button");
  await shutdown();
});

test("a directory named like the video is not a video", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Joins.md"), "# Parte 2 — Joins\n");
  mkdirSync(join(topic, "explicaciones", "adjuntos", "Parte 2 - Joins.mp4"), { recursive: true });
  const result = await view({ topic: TOPIC, part: "p2" });
  const data = JSON.parse((await http(result.structuredContent.url)).body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.video, { src: "explicaciones/adjuntos/Parte 2 - Joins.mp4", exists: false }, "a directory is not a file");
  await shutdown();
});

test("frameAncestors lets one loopback origin embed the pages; anything else is refused at registration", async () => {
  const { root } = makeRoot();
  const host = makeHost();
  registerBridge(host.api, { root, frameAncestors: ["http://127.0.0.1:5555"] });
  const result = await host.tools.get("learning_view").execute("x", { topic: TOPIC, part: "p1" }, undefined, undefined, { cwd: root });
  const page = await http(result.structuredContent.url);
  assert.match(page.headers["content-security-policy"], /frame-ancestors 'self' http:\/\/127\.0\.0\.1:5555(;|$)/);
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
  for (const bad of ["https://evil.example", "http://127.0.0.1:5555; script-src *", "*", "http://example.com:80"]) {
    assert.throws(() => registerBridge(makeHost().api, { root, frameAncestors: [bad] }), /frameAncestors/);
  }
});

test("a part's rich HTML page replaces the Markdown rendering, with the kit, the quiz API and the injected config", async () => {
  const { root, topic } = makeRoot();
  const kitDir = realpathSync(mkdtempSync(join(tmpdir(), "kit-")));
  writeFileSync(join(kitDir, "kit.js"), "console.log('kit');");
  writeFileSync(join(kitDir, "kit.css"), "body{}");
  mkdirSync(join(kitDir, "fonts"));
  writeFileSync(join(kitDir, "fonts", "atkinson-400.woff2"), "wOF2");
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.html"),
    '<!doctype html><html lang="es"><head><link rel="stylesheet" href="../kit/kit.css"></head><body><h1>Rica</h1></body></html>',
  );
  const host = makeHost();
  registerBridge(host.api, { root, kitDir, frameAncestors: ["http://127.0.0.1:5555"] });
  const result = await host.tools.get("learning_view").execute("x", { topic: TOPIC, part: "p1" }, undefined, undefined, { cwd: root });
  const url = result.structuredContent.url;
  const prefix = new URL(result.structuredContent.base).pathname;
  const page = await http(url);
  assert.equal(page.status, 200);
  const csp = page.headers["content-security-policy"];
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'self' http:\/\/127\.0\.0\.1:5555/);
  // The theme boots before anything paints, ahead of the config the page reads.
  assert.match(page.body, /<head><script src="[^"]*\/kit\/theme\.js"><\/script><script>window\.LEARNING_BRIDGE = /);
  const config = JSON.parse(page.body.match(/<script>window\.LEARNING_BRIDGE = (.*?);<\/script>/)[1]);
  const styleEntry = (style) => {
    const name = `Parte 1 - Claves - ${style}.m4a`;
    return { style, name, exists: false, srt: name.replace(/\.m4a$/, ".srt"), srtExists: false };
  };
  assert.deepEqual(config, {
    submitUrl: `${prefix}submit`,
    quizUrl: `${prefix}api/quiz?topic=${TOPIC}&part=p1`,
    topic: TOPIC,
    part: "p1",
    video: "file/explicaciones/adjuntos/Parte%201%20-%20Claves.mp4",
    audio: {
      base: "file/explicaciones/adjuntos/audio/",
      styles: ["debate", "entrevista", "charla", "formal"].map(styleEntry),
    },
  });
  assert.match(page.body, /<h1>Rica<\/h1>/);
  assert.match(page.body, /<lk-video><\/lk-video>/, "a rich page without the video control gets one");
  assert.match(page.body, /kit\/kit\.js/, "the injected control ships the kit assets");
  const video = await http(new URL(config.video, url).href, { method: "HEAD" });
  assert.equal(video.status, 200);
  const kit = await http(`${result.structuredContent.base}kit/kit.js`);
  assert.equal(kit.status, 200);
  assert.match(kit.headers["content-type"], /^text\/javascript/);
  assert.equal((await http(`${result.structuredContent.base}kit/nope.js`)).status, 404);
  assert.equal((await http(`${result.structuredContent.base}kit/..%2Fbridge.ts`)).status, 404);
  const font = await http(`${result.structuredContent.base}kit/fonts/atkinson-400.woff2`);
  assert.equal(font.status, 200);
  assert.match(font.headers["content-type"], /^font\/woff2/);
  // A demo page is served with `sandbox allow-scripts`, so it has the null origin and the
  // browser refuses the kit's fonts without this header: the page fell back to DejaVu.
  assert.equal(font.headers["access-control-allow-origin"], "*", "sandboxed demo pages need the font CORS header");
  assert.equal((await http(`${result.structuredContent.base}kit/fonts/..%2Fkit.css`)).status, 404);

  const quiz = JSON.parse((await http(`${result.structuredContent.base}api/quiz?topic=${TOPIC}&part=p1`)).body);
  assert.deepEqual(quiz.questions.map((q) => q.id), ["q1", "q2"]);
  assert.equal(JSON.stringify(quiz).includes('"answer"'), false);
  assert.equal(quiz.answered, null);
  assert.equal(quiz.verdicts, null);
  writeFileSync(join(topic, "mini-quiz", "p1.answers.json"), JSON.stringify({ answers: { q1: "B", q2: "A" }, razonamientos: why("q1", "q2") }));
  const after = JSON.parse((await http(`${result.structuredContent.base}api/quiz?topic=${TOPIC}&part=p1`)).body);
  assert.deepEqual(after.answered[1], { id: "q2", chosen: "A", correct: "B", ok: false, ...why("q2").q2 });
  assert.equal((await http(`${result.structuredContent.base}api/quiz?topic=${TOPIC}&part=p9`)).status, 404);
  assert.equal((await http(`${result.structuredContent.base}api/quiz?topic=..&part=p1`)).status, 400);
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
});

test("a video control or kit asset named only inside a comment is still missing", async () => {
  const { root, topic } = makeRoot();
  const kitDir = realpathSync(mkdtempSync(join(tmpdir(), "kit-")));
  writeFileSync(join(kitDir, "kit.js"), "console.log('kit');");
  writeFileSync(join(kitDir, "kit.css"), "body{}");
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.html"),
    '<!doctype html><html lang="es"><head><!-- <script src="../kit/kit.js"></script><link rel="stylesheet" href="../kit/kit.css"> --></head><body><h1>Rica</h1><!-- <lk-video></lk-video> --></body></html>',
  );
  const host = makeHost();
  registerBridge(host.api, { root, kitDir });
  const result = await host.tools.get("learning_view").execute("x", { topic: TOPIC, part: "p1" }, undefined, undefined, { cwd: root });
  const page = await http(result.structuredContent.url);
  assert.equal(page.status, 200);
  const visible = page.body.replace(/<!--[\s\S]*?-->/g, "");
  assert.match(visible, /<lk-video><\/lk-video>/, "a control only inside a comment is still missing");
  assert.match(visible, /<script[^>]+kit\/kit\.js/, "assets only named inside a comment are still missing");
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
});

test("a kit asset named only inside a page script is still missing", async () => {
  const { root, topic } = makeRoot();
  const kitDir = realpathSync(mkdtempSync(join(tmpdir(), "kit-")));
  writeFileSync(join(kitDir, "kit.js"), "console.log('kit');");
  writeFileSync(join(kitDir, "kit.css"), "body{}");
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.html"),
    '<!doctype html><html lang="es"><head></head><body><h1>Rica</h1><script>const asset = "kit.js";</script></body></html>',
  );
  const host = makeHost();
  registerBridge(host.api, { root, kitDir });
  const result = await host.tools.get("learning_view").execute("x", { topic: TOPIC, part: "p1" }, undefined, undefined, { cwd: root });
  const page = await http(result.structuredContent.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /<script[^>]+kit\/kit\.js/, "a script string is not a loaded asset");
  for (const handler of host.handlers.get("session_shutdown") ?? []) await handler({}, {});
});

// The docs promise that the part page polls the file after the request, the
// way the kit's lk-video does (a check now, then every 5 s while the page is open).
test("the part video control swaps the player in once the file exists", { skip: !playwright && "playwright not installed" }, async (t) => {
  const { topic, view } = await setup();
  const video = join(topic, "explicaciones", "adjuntos", "Parte 1 - Claves.mp4");
  rmSync(video);
  const url = (await view({ topic: TOPIC, part: "p1" })).structuredContent.url;
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);
  await page.locator(".video-block button").click();
  writeFileSync(video, Buffer.from("0123456789"));
  const player = page.locator(".video-block video");
  // The written file is a placeholder, not decodable media: the promise is the
  // swap itself, so the player only has to be attached (an errored video can
  // have zero height even though it rendered).
  await player.waitFor({ state: "attached", timeout: 33000 });
  assert.match(await player.getAttribute("src"), /file\/explicaciones\/adjuntos\/Parte%201%20-%20Claves\.mp4$/);
});

// The same promise for audio: the row that does not exist yet becomes a player
// with its download once the tutor's file lands.
test("the part audio row swaps the player in once the file exists", { skip: !playwright && "playwright not installed" }, async (t) => {
  const { topic, view } = await setup();
  const dir = join(topic, "explicaciones", "adjuntos", "audio");
  rmSync(dir, { recursive: true, force: true });
  const url = (await view({ topic: TOPIC, part: "p1" })).structuredContent.url;
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);
  const rows = page.locator(".audio-row");
  await rows.first().waitFor();
  assert.equal(await rows.count(), 4, "one row per style");
  await rows.first().locator("button").click();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Parte 1 - Claves - debate.m4a"), Buffer.from("0123456789"));
  writeFileSync(join(dir, "Parte 1 - Claves - debate.srt"), "1\n00:00:00,000 --> 00:00:01,000\nhueco\n");
  const player = rows.first().locator("audio");
  await player.waitFor({ state: "attached", timeout: 33000 });
  const src = await player.getAttribute("src");
  assert.match(src, /file\/explicaciones\/adjuntos\/audio\/Parte%201%20-%20Claves%20-%20debate\.m4a$/);
  const download = rows.first().locator("a.audio-download");
  assert.equal(await download.getAttribute("href"), src);
  assert.equal(await download.getAttribute("download"), "Parte 1 - Claves - debate.m4a");
  assert.equal(await rows.first().locator("button").count(), 0, "the request becomes the player");
  const transcript = rows.first().locator("a.audio-srt");
  assert.equal(await transcript.getAttribute("download"), "Parte 1 - Claves - debate.srt");
  assert.match(await transcript.getAttribute("href"), /Parte%201%20-%20Claves%20-%20debate\.srt$/);
});

test("a video request reaches the chat as a fixed message", async () => {
  const { view, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "video", topic: TOPIC, part: "p1" });
  assert.equal(res.status, 200, res.body);
  assert.equal(
    host.sent[0].content,
    "[Vista HTML · sql-demo · p1 · video]\nLa persona pide el video de esta parte: prodúcelo con el pipeline de learnings-video (video-distill.md) y guárdalo en explicaciones/adjuntos/Parte 1 - Claves.mp4.",
  );
  assert.equal((await submit(url, { kind: "video", topic: TOPIC })).status, 400);
  assert.equal((await submit(url, { kind: "video", topic: TOPIC, part: "p1", text: "x" })).status, 400);
  assert.equal(host.sent.length, 1);
  await shutdown();
});

test("an audio request reaches the chat with the style and the path to deliver", async () => {
  const { view, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "audio", topic: TOPIC, part: "p1", style: "debate" });
  assert.equal(res.status, 200, res.body);
  assert.equal(
    host.sent[0].content,
    "[Vista HTML · sql-demo · p1 · audio · debate]\nLa persona pide el audio de esta parte en estilo debate: escríbelo y prodúcelo con el motor de audio (skill learnings-audio), con la spec en tools/audio/specs/sql-demo-p1-debate.json y la entrega en explicaciones/adjuntos/audio/Parte 1 - Claves - debate.m4a.",
  );
  assert.equal((await submit(url, { kind: "audio", topic: TOPIC, part: "p1", style: "podcast" })).status, 400);
  assert.equal((await submit(url, { kind: "audio", topic: TOPIC, part: "p1" })).status, 400);
  assert.equal((await submit(url, { kind: "audio", topic: TOPIC, style: "debate" })).status, 400);
  assert.equal((await submit(url, { kind: "audio", topic: TOPIC, part: "p1", style: "debate", text: "x" })).status, 400);
  assert.equal(host.sent.length, 1);
  await shutdown();
});

// The page offers all four ways to hear a part before any of them exists: the
// name of each file is fixed by the bridge, never guessed by the browser.
test("every part page carries one audio entry per style and serves the file once it exists", async () => {
  const { topic, view, shutdown } = await setup();
  const part = await view({ topic: TOPIC, part: "p1" });
  const url = part.structuredContent.url;
  const read = async () => {
    const page = await http(url);
    assert.equal(page.status, 200);
    const json = /<script type="application\/json" id="view-data">([\s\S]*?)<\/script>/.exec(page.body);
    assert.ok(json, "the part payload is embedded");
    return JSON.parse(json[1]);
  };
  const before = await read();
  assert.deepEqual(before.audio, {
    base: "file/explicaciones/adjuntos/audio/",
    styles: [
      { style: "debate", name: "Parte 1 - Claves - debate.m4a", exists: false, srt: "Parte 1 - Claves - debate.srt", srtExists: false },
      { style: "entrevista", name: "Parte 1 - Claves - entrevista.m4a", exists: false, srt: "Parte 1 - Claves - entrevista.srt", srtExists: false },
      { style: "charla", name: "Parte 1 - Claves - charla.m4a", exists: false, srt: "Parte 1 - Claves - charla.srt", srtExists: false },
      { style: "formal", name: "Parte 1 - Claves - formal.m4a", exists: false, srt: "Parte 1 - Claves - formal.srt", srtExists: false },
    ],
  });
  assert.equal(before.video.exists, true, "the video still reports itself");

  const dir = join(topic, "explicaciones", "adjuntos", "audio");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Parte 1 - Claves - debate.m4a"), Buffer.from("0123456789"));
  writeFileSync(join(dir, "Parte 1 - Claves - debate.srt"), "1\n00:00:00,000 --> 00:00:01,000\nhueco\n");
  const after = await read();
  assert.equal(after.audio.styles[0].exists, true);
  assert.equal(after.audio.styles[0].srtExists, true, "the transcript is its own file");
  assert.equal(after.audio.styles[1].exists, false);
  assert.equal(after.audio.styles[1].srtExists, false);

  // The page's own directory is where its relative `file/...` URLs resolve.
  const pageDir = url.slice(0, url.lastIndexOf("/") + 1);
  const file = await http(`${pageDir}file/explicaciones/adjuntos/audio/Parte%201%20-%20Claves%20-%20debate.m4a`);
  assert.equal(file.status, 200);
  assert.match(file.headers["content-type"], /^audio\/mp4/);
  // The kit resolves its player and transcript from the payload alone, so the base
  // has to name the route itself: without `file/` every rich page 404s its audio.
  const own = await http(`${pageDir}${after.audio.base}${encodeURIComponent(after.audio.styles[0].name)}`);
  assert.equal(own.status, 200);
  assert.match(own.headers["content-type"], /^audio\/mp4/);
  const ownSrt = await http(`${pageDir}${after.audio.base}${encodeURIComponent(after.audio.styles[0].srt)}`);
  assert.equal(ownSrt.status, 200);
  assert.match(ownSrt.headers["content-type"], /^text\/plain/);
  await shutdown();
});

test("a rich page that never heard of audio gets the control anyway", async () => {
  const { topic, view, shutdown } = await setup();
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.html"),
    '<!doctype html><html lang="es"><head><title>Rica</title></head><body><h1>Rica</h1></body></html>',
  );
  const page = await http((await view({ topic: TOPIC, part: "p1" })).structuredContent.url);
  assert.equal(page.status, 200);
  assert.match(page.body, /<lk-audio><\/lk-audio>/);
  assert.match(page.body, /<lk-video><\/lk-video>/);
  assert.match(page.body, /kit\/kit\.js/);
  await shutdown();
});

test("a quick note is served with the view design, its embeds and no quiz", async () => {
  const { view, root, shutdown } = await setup();
  mkdirSync(join(root, "rapidos", "adjuntos"), { recursive: true });
  writeFileSync(join(root, "rapidos", "hash.md"), "---\ntipo: rapido\n---\n# Qué es un hash\n\n> [!video] Video\n> ![[hash.mp4]]\n");
  writeFileSync(join(root, "rapidos", "adjuntos", "hash.mp4"), "0123");
  const url = base(await view({}));
  const page = await http(`${url}rapidos/hash`);
  assert.equal(page.status, 200);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.kind, "part");
  assert.equal(data.quiz, null);
  assert.match(data.markdown, /^# Qué es un hash/);
  assert.match(data.markdown, /<video controls preload="metadata" src="file\/adjuntos\/hash\.mp4">/);
  assert.equal((await http(`${url}rapidos/file/adjuntos/hash.mp4`)).status, 200);
  assert.equal((await http(`${url}rapidos/nope`)).status, 404);
  assert.equal((await http(`${url}rapidos/..%2Fsecret`)).status, 404);
  await shutdown();
});

test("session_shutdown closes the server", async () => {
  const { view, shutdown } = await setup();
  const url = (await view({})).structuredContent.url;
  await shutdown();
  await assert.rejects(http(url), /ECONNREFUSED/);
});

test("mini-quiz submit grades, stores the answers file and sends one follow-up chat message", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({ topic: TOPIC, part: "p1" }));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "C" },
    reasoning: {
      ...why("q1"),
      q2: { razonamiento: "Pide qué error da Oracle. Pensé que C porque...\nlo vi en clase", confianza: "adivine" },
    },
    ownWords: "Una clave identifica una fila.",
    exercises: "SELECT * FROM t;",
  });
  assert.equal(res.status, 200, res.body);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.results, [
    { id: "q1", chosen: "B", correct: "B", ok: true },
    { id: "q2", chosen: "C", correct: "B", ok: false },
  ]);
  assert.equal(body.score, "1/2");
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8")), {
    answers: { q1: "B", q2: "C" },
    razonamientos: {
      ...why("q1"),
      q2: { razonamiento: "Pide qué error da Oracle. Pensé que C porque...\nlo vi en clase", confianza: "adivine" },
    },
  });
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.sent[0].options, { deliverAs: "followUp" });
  const text = host.sent[0].content;
  assert.match(text, /^\[Vista HTML · sql-demo · p1 · mini-quiz\]/);
  assert.match(text, /mini-quiz\/p1\.answers\.json/);
  assert.match(text, /- q1: B ✔\n  Pensamiento: pienso q1\n  Confianza: seguro\n/);
  assert.match(text, /- q2: C ✘ \(correcta: B\)\n  Pensamiento: Pide qué error da Oracle\. Pensé que C porque\.\.\.\n    lo vi en clase\n  Confianza: adiviné/);
  assert.match(text, /Vuelco con mis palabras:\n"""\nUna clave identifica una fila\.\n"""/);
  assert.match(text, /Ejercicios:\n"""\nSELECT \* FROM t;\n"""/);
  await shutdown();
});

test("reasoning written by the old two-prompt form still submits and is normalized", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({ topic: TOPIC, part: "p1" }));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: {
      q1: { entendi: "primer", porque: "segundo", confianza: "dudo" },
      q2: { entendi: "otra", porque: "razón", confianza: "seguro" },
    },
  });
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8")).razonamientos, {
    q1: { razonamiento: "primer\n\nsegundo", confianza: "dudo" },
    q2: { razonamiento: "otra\n\nrazón", confianza: "seguro" },
  });
  assert.match(host.sent[0].content, /Pensamiento: primer\n    \n    segundo/);
  await shutdown();
});

test("an already answered mini-quiz is refused with 409 and leaves the file and chat unchanged", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const file = join(topic, "mini-quiz", "p1.answers.json");
  writeFileSync(file, '{"answers":{"q1":"A","q2":"A"}}');
  const res = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: why("q1", "q2") });
  assert.equal(res.status, 409);
  assert.equal(readFileSync(file, "utf8"), '{"answers":{"q1":"A","q2":"A"}}');
  assert.equal(host.sent.length, 0);
  await shutdown();
});

// N3: a submission the turn lock refuses must not have run or saved anything.
test("a code submission refused by the turn lock runs nothing and leaves no file", async (t) => {
  // A real judge run, with an image that is on this machine (no digest pin needed for a test).
  if (spawnSync("docker", ["image", "inspect", "python:3.12-slim"]).status !== 0) return t.skip("python:3.12-slim is not installed");
  const runnersFile = join(mkdtempSync(join(tmpdir(), "runners-")), "runners.json");
  writeFileSync(runnersFile, JSON.stringify({ python: { image: "python:3.12-slim", file: "main.py", run: "python3 main.py" } }));
  let checks = 0;
  // The lock is free when the answer arrives and taken by the time the code has run.
  const { topic, host, view, shutdown } = await setup({ runnersFile, refuseTurn: () => (++checks >= 2 ? "El tutor está trabajando; espera a que termine." : null) });
  mkdirSync(join(topic, "codigo", "eco"), { recursive: true });
  writeFileSync(join(topic, "codigo", "eco", "ejercicio.json"), JSON.stringify({
    titulo: "Eco", enunciado: "Repite la entrada", lenguaje: "python",
    tests: [{ nombre: "eco", entrada: "hola\n", salida: "hola\n" }],
  }));
  const url = base(await view({}));
  const res = await submit(url, { kind: "code", topic: TOPIC, exercise: "eco", code: "print(input())" });
  assert.equal(res.status, 409, res.body);
  assert.match(JSON.parse(res.body).error, /El tutor está trabajando/);
  assert.equal(existsSync(join(topic, "codigo", "eco", "entregas")), false, "a refused submission leaves no file");
  assert.equal(host.sent.length, 0, "and the tutor is never asked");
  await shutdown();
});

// N4: only the refusals that saved something tell the learner to reload the page.
test("only the refusals that saved something advise a reload", async () => {
  let checks = 0;
  const { topic, view, shutdown } = await setup({ refuseTurn: () => (++checks >= 2 ? "El tutor está trabajando; espera a que termine." : null) });
  const url = base(await view({}));
  // The quiz is already answered: something is saved, so the page is worth reloading.
  writeFileSync(join(topic, "mini-quiz", "p1.answers.json"), '{"answers":{"q1":"A","q2":"A"}}');
  const answered = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: why("q1", "q2") });
  assert.equal(answered.status, 409, answered.body);
  const saved = JSON.parse(answered.body).error;
  assert.match(saved, /Ya respondiste/, "the refusal says what happened");
  assert.match(saved, /Recarga la página para ver las respuestas guardadas/);
  // The turn lock saved nothing: no reload advice.
  const locked = await submit(url, { kind: "question", topic: TOPIC, part: "p1", text: "¿Y esto?" });
  assert.equal(locked.status, 409, locked.body);
  const message = JSON.parse(locked.body).error;
  assert.match(message, /El tutor está trabajando/);
  assert.doesNotMatch(message, /Recarga la página/);
  await shutdown();
});

// N4: the page shows exactly the bridge's message. Only a submission that stored something
// advises a reload, and that advice is the bridge's, not the page's.
test('a refused submission shows the bridge message, with no reload advice', { skip: !playwright && 'playwright not installed' }, async (t) => {
  const { view } = await setup({ refuseTurn: () => 'El tutor está trabajando; espera a que termine.' });
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await view({ topic: TOPIC, part: 'p1' });
  await page.goto(base(result));
  await page.evaluate((url) => {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'width:1000px;height:2000px';
    document.body.append(frame);
  }, result.structuredContent.url);
  const frame = page.frameLocator('iframe');
  const fields = frame.locator('fieldset.quiz-question');
  await fields.first().waitFor();
  for (const field of await fields.all()) {
    await field.locator('input[type=radio]').first().check();
    if (await field.locator('.confidence').isVisible()) await field.locator('.confidence input').first().check();
  }
  await frame.getByRole('button', { name: 'Enviar al tutor' }).click();
  await frame.getByText(/El tutor está trabajando/).waitFor();
  const shown = await frame.locator('body').innerText();
  assert.doesNotMatch(shown, /Recarga la página/, 'the turn lock stored nothing: no reload advice');
});

test("the part page reports recorded answers with their grading once the quiz is answered", async () => {
  const { view, topic, shutdown } = await setup();
  writeFileSync(
    join(topic, "mini-quiz", "p1.answers.json"),
    JSON.stringify({ answers: { q1: "B", q2: "A" }, razonamientos: why("q2") }),
  );
  const page = await http((await view({ topic: TOPIC, part: "p1" })).structuredContent.url);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.answered, [
    { id: "q1", chosen: "B", correct: "B", ok: true },
    { id: "q2", chosen: "A", correct: "B", ok: false, razonamiento: "pienso q2", confianza: "seguro" },
  ]);
  assert.equal(data.verdicts, null);
  await shutdown();
});

test("diagnosis submit adds only new ids of the current round and keeps recorded answers", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({ topic: TOPIC, part: "quiz" }));
  const page = await http(`${url}${TOPIC}/quiz`);
  const data = JSON.parse(page.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.quiz.questions.map((q) => q.id), ["d1", "d2", "d3"]);
  assert.deepEqual(data.answered, [{ id: "d1", chosen: "B", correct: "B", ok: true }]);
  const res = await submit(url, { kind: "diagnosis", topic: TOPIC, answers: { d2: "E" }, reasoning: why("d2") });
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "quiz.answers.json"), "utf8")), {
    answers: { d1: "B", d2: "E" },
    razonamientos: why("d2"),
  });
  assert.match(host.sent[0].content, /^\[Vista HTML · sql-demo · diagnóstico\]/);
  const again = await submit(url, { kind: "diagnosis", topic: TOPIC, answers: { d1: "A" }, reasoning: why("d1") });
  assert.equal(again.status, 409);
  const third = await submit(url, { kind: "diagnosis", topic: TOPIC, answers: { d3: "A" }, reasoning: why("d3") });
  assert.equal(third.status, 200);
  assert.deepEqual(JSON.parse(readFileSync(join(topic, "quiz.answers.json"), "utf8")), {
    answers: { d1: "B", d2: "E", d3: "A" },
    razonamientos: why("d2", "d3"),
  });
  host.sent.pop();
  assert.equal(host.sent.length, 1);
  await shutdown();
});

test("part and diagnosis pages show the tutor's concept verdicts once recorded", async () => {
  const { view, topic, shutdown } = await setup();
  const verdicts = [
    { codigo: "1.1", estado: "claro", pregunta: "q1", evidencia: "pienso q1" },
    { codigo: "1.2", estado: "laguna", pregunta: "q2", evidencia: "pienso q2" },
  ];
  mkdirSync(join(topic, "feedback"));
  writeFileSync(join(topic, "feedback", "p1.json"), JSON.stringify({ partId: "p1", difficultyDetected: true, conceptos: verdicts }));
  writeFileSync(join(topic, "diagnostico-conceptos.json"), JSON.stringify({ conceptos: verdicts.slice(1) }));
  const url = base(await view({}));
  const part = await http(`${url}${TOPIC}/p1`);
  assert.deepEqual(JSON.parse(part.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]).verdicts, verdicts);
  const diagnosis = await http(`${url}${TOPIC}/quiz`);
  assert.deepEqual(JSON.parse(diagnosis.body.match(/id="view-data">([\s\S]*?)<\/script>/)[1]).verdicts, verdicts.slice(1));
  await shutdown();
});

test("a question to the tutor is sent with its context and writes no file", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "question", topic: TOPIC, part: "p1", text: "¿Por qué la PK no admite NULL?", demo: "p1-claves.html" });
  assert.equal(res.status, 200, res.body);
  assert.equal(
    host.sent[0].content,
    '[Vista HTML · sql-demo · p1 · pregunta · demo p1-claves.html]\nPregunta de la persona:\n"""\n¿Por qué la PK no admite NULL?\n"""',
  );
  assert.equal(existsSync(join(topic, "mini-quiz", "p1.answers.json")), false);
  await shutdown();
});

test("quick-quiz submit records telemetry and delivers notification to chat", async () => {
  const { view, root, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, {
    kind: "quick-quiz",
    topic: TOPIC,
    part: "p1",
    entry: {
      punto: "1. Por qué existe",
      pregunta: "¿Qué problema resuelve la PK?",
      respuesta_alumno: "B",
      respuesta_correcta: "B",
      ok: true,
      categoria: "conceptual",
      por_que: "Acierto: identifica unicidad",
    },
  });
  assert.equal(res.status, 200, res.body);
  assert.ok(host.sent[0].content.includes("[Vista HTML · sql-demo · p1 · quiz rápido · 1. Por qué existe]"));
  assert.ok(host.sent[0].content.includes("✔ Correcto"));
  assert.equal(JSON.parse(stored(root, "telemetria")).estadisticas_globales.total_quizzes, 1);
  assert.equal(JSON.parse(stored(root, `telemetria/${TOPIC}`)).quizzes.length, 1);
  await shutdown();
});

test("submit refuses foreign origins, non-JSON, oversize, unknown fields and invalid answers without side effects", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const valid = { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: why("q1", "q2") };
  const cases = [
    [await submit(url, valid, { origin: "http://evil.example" }), 403],
    [await submit(url, valid, { origin: "null" }), 403],
    [await submit(url, valid, { "content-type": "text/plain" }), 415],
    [await submit(url, "x".repeat(70 * 1024)), 413],
    [await submit(url, "{not json"), 400],
    [await submit(url, { ...valid, extra: 1 }), 400],
    [await submit(url, { ...valid, answers: { q1: "F", q2: "B" } }), 400],
    [await submit(url, { ...valid, answers: { q1: "B" } }), 400],
    [await submit(url, { ...valid, answers: { q1: "B", q2: "B", q9: "A" } }), 400],
    [await submit(url, { ...valid, topic: "../x" }), 400],
    [await submit(url, { ...valid, part: "p2" }), 400],
    [await submit(url, { ...valid, ownWords: "x".repeat(9000) }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: "solo texto" } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1", "q2"), q2: { razonamiento: "y", confianza: "seguro", extra: "z" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { razonamiento: "y", confianza: "mucho" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1"), q2: { razonamiento: "y", confianza: "constructor" } } }), 400],
    [await submit(url, { ...valid, reasoning: { ...why("q1", "q2", "q9") } }), 400],
    [await submit(url, { kind: "prompt", topic: TOPIC, text: "rm -rf" }), 400],
    [await submit(url, { kind: "question", topic: TOPIC, text: "" }), 400],
  ];
  for (const [res, status] of cases) assert.equal(res.status, status, res.body);
  assert.equal(existsSync(join(topic, "mini-quiz", "p1.answers.json")), false);
  assert.equal(host.sent.length, 0);
  const wrongToken = await http(`${new URL(url).origin}/${"0".repeat(64)}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(url).origin },
    body: JSON.stringify(valid),
  });
  assert.equal(wrongToken.status, 404);
  assert.equal(host.sent.length, 0);
  await shutdown();
});

test("a quiz is answered without writing a thought, and the message quotes no empty reasoning", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" } });
  assert.equal(res.status, 200, res.body);
  const graded = JSON.parse(res.body);
  assert.equal(graded.score, "2/2");
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.deepEqual(saved.razonamientos, {});
  const said = host.sent.map((m) => m.content).join("\n");
  assert.match(said, /Respuestas y razonamientos guardados/);
  assert.ok(!said.includes("Pensamiento:"), said);
  await shutdown();
});

test("a thought with no text is saved as no thought, even when a confidence was picked", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: { q1: { razonamiento: "   ", confianza: "seguro" }, q2: { confianza: "dudo" } },
  });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.deepEqual(saved.razonamientos, {});
  const said = host.sent.map((m) => m.content).join("\n");
  assert.ok(!said.includes("Pensamiento:"), said);
  await shutdown();
});

test("reasoning null means the learner wrote nothing", async () => {
  const { view, topic, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, { kind: "mini-quiz", topic: TOPIC, part: "p1", answers: { q1: "B", q2: "B" }, reasoning: null });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.deepEqual(saved.razonamientos, {});
  await shutdown();
});

test("a thought keeps its unicode and line breaks, and the chat quotes it verbatim", async () => {
  const { view, topic, host, shutdown } = await setup();
  const url = base(await view({}));
  const first = "Primero descarto la clave foránea 🔑";
  const second = "porque el empleado puede no tener jefe";
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: { q1: { razonamiento: `${first}\n${second}`, confianza: "seguro" } },
  });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.equal(saved.razonamientos.q1.razonamiento, `${first}\n${second}`);
  assert.equal(saved.razonamientos.q1.confianza, "seguro");
  const said = host.sent.map((m) => m.content).join("\n");
  assert.ok(said.includes(first) && said.includes(second), said);
  assert.ok(said.indexOf(first) < said.indexOf(second), said);
  await shutdown();
});

test("a mixed answers file keeps old and new thoughts side by side", async () => {
  const { view, topic, shutdown } = await setup();
  const url = base(await view({}));
  const res = await submit(url, {
    kind: "mini-quiz",
    topic: TOPIC,
    part: "p1",
    answers: { q1: "B", q2: "B" },
    reasoning: { q1: { entendi: "a", porque: "b" }, q2: { razonamiento: "nuevo" } },
  });
  assert.equal(res.status, 200, res.body);
  const saved = JSON.parse(readFileSync(join(topic, "mini-quiz", "p1.answers.json"), "utf8"));
  assert.equal(saved.razonamientos.q2.razonamiento, "nuevo");
  assert.match(saved.razonamientos.q1.razonamiento, /a[\s\S]*b/);
  await shutdown();
});

test("the index degrades one broken topic instead of failing the gallery", () => {
  const { root } = makeRoot();
  const bomba = join(root, "bomba");
  mkdirSync(bomba, { recursive: true });
  writeFileSync(join(bomba, "plan.json"), JSON.stringify({ topic: "Bomba", parts: [{ id: "p1", slug: "p1", title: "P1" }] }));
  // `explicaciones` is a FILE: partNote's readdirSync explodes on it.
  writeFileSync(join(bomba, "explicaciones"), "not a directory");
  const rows = listTopics(root);
  const bomb = rows.find((r) => r.id === "bomba");
  assert.ok(bomb);
  assert.equal(bomb.title, "Bomba");
  assert.deepEqual(bomb.parts, []);
  assert.deepEqual(bomb.exercises, []);
  assert.ok(rows.find((r) => r.id === TOPIC).parts.length > 0);
});

// The note stays the source: a figure written as a JSON scene is drawn by the
// visual engine in the reader, so the same note follows the paper it lands on.
test("a note figure is drawn by the visual engine, in the reader's theme", { skip: !playwright && 'playwright not installed' }, async t => {
  const { root, view } = await setup();
  mkdirSync(join(root, 'rapidos'), { recursive: true });
  const scene = JSON.stringify({
    title: 'El almacén',
    aria: 'Una rejilla con el robot en la esquina y la salida al otro lado',
    viewBox: '0 0 360 290',
    grids: [{ x: 16, y: 40, cols: 4, rows: 3, w: 82, h: 82, cells: [{ c: 0, r: 0, kind: 'robot' }, { c: 3, r: 0, kind: 'exit', label: '+1' }] }],
    arrows: [{ x1: 20, y1: 260, x2: 320, y2: 260, tone: 'blue', label: 'el robot sigue su política' }],
  });
  writeFileSync(join(root, 'rapidos', 'figura.md'), `# Figura\n\n<lk-figure>\n<script type="application/json">${scene}</script>\n</lk-figure>\n\nCómo leerlo: entra por la casilla del robot y mira la salida.\n`);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(base(await view({})) + 'rapidos/figura');
  const figure = page.locator('lk-figure');
  await figure.locator('svg').waitFor();
  // The drawing names tones; the page paper decides their colour.
  const ink = () => figure.evaluate(node => getComputedStyle(node.querySelector('svg')).getPropertyValue('--v-ink').trim());
  assert.equal(await ink(), '#0F2E3D', 'the light paper comes from the engine tokens');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  assert.equal(await ink(), '#F1EFE8', 'the dark paper swaps the same tokens');
  // Fills are mixed against the paper, never layered with alpha over an assumed white page.
  assert.equal(await figure.locator('svg [fill*="rgba("]').count(), 0);
  assert.equal(await figure.locator('svg [stroke*="rgba("]').count(), 0, 'nothing is layered with alpha');
});

test("visuals count fenced figures and inline elements, never code samples", () => {
  assert.equal(countVisuals("```python\nprint(1)\n```\n"), 0);
  assert.equal(countVisuals("```mermaid\ngraph TD; A-->B;\n```\n"), 1);
  assert.equal(countVisuals("<figure><svg viewBox='0 0 1 1'></svg></figure>"), 2);
  assert.equal(countVisuals("```text\n<svg>\n```\n"), 0, "a sample is not a figure");
  assert.equal(countVisuals("```js\nconst a = 1;\n```\n\n```mermaid\ngraph TD;\n```\n"), 1);
});

// The counter accepts only scenes the renderer can draw: an unknown tone, an
// unknown anchor, a non-numeric width and a viewBox without four numbers are
// refused here exactly as `sceneDraws` refuses them.
test("a scene the engine cannot draw is not a visual", () => {
  const figure = (scene) => `<lk-figure>\n<script type="application/json">${JSON.stringify(scene)}</script>\n</lk-figure>`;
  const invalid = [
    { labels: [{ x: 1, y: 1, text: "a", tone: "purple" }] },
    { labels: [{ x: 1, y: 1, text: "a", anchor: "middle-ish" }] },
    { arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1, width: "wide" }] },
    { viewBox: "0 0 360", arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1 }] },
  ];
  for (const scene of invalid) assert.equal(countVisuals(figure(scene)), 0, JSON.stringify(scene));
  // The shapes that worked before still count.
  assert.equal(countVisuals(figure({ labels: [{ x: 1, y: 1, text: "a", tone: "blue", anchor: "middle" }] })), 1);
  assert.equal(countVisuals(figure({ viewBox: "0 0 360 290", arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1, width: 2 }] })), 1);
  assert.equal(countVisuals(figure({ grids: [{ cols: 1, rows: 1, w: 9, h: 9, cells: [{ c: 0, r: 0, kind: "value", text: "V(s)" }] }] })), 1, "a value cell may show its own text");
});

// A note figure is a JSON scene the reader draws; the counter only sees a
// visual when there is something in the scene to draw, and it accepts the same
// shapes the renderer iterates.
test("visuals count an lk-figure scene with content, never an empty one", () => {
  const figure = (payload) => `<lk-figure>\n<script type="application/json">${payload}</script>\n</lk-figure>\n`;
  assert.equal(countVisuals(figure('{"grids":[{"cols":4,"rows":3,"w":9,"h":9,"cells":[{"c":0,"r":0}]}]}')), 1);
  assert.equal(countVisuals(figure('{"title":"Solo un título"}')), 0, "a scene that draws nothing is not a visual");
  assert.equal(countVisuals(figure("{}")), 0);
  assert.equal(countVisuals(figure("{\"grids\": [")), 0, "a broken scene is not a visual");
  assert.equal(countVisuals("```html\n" + figure('{"grids":[{"cols":4}]}') + "```\n"), 0, "a sample is not a figure");
  assert.equal(countVisuals(figure('{"grids":"4"}')), 0, "a string is not a list of grids");
  assert.equal(countVisuals(figure('{"boxes":5}')), 0, "a number is not a list of boxes");
  assert.equal(countVisuals(figure('{"arrows":[]}')), 0, "an empty list draws nothing");
  assert.equal(countVisuals(figure('{"arrows":""}')), 0);
  assert.equal(countVisuals(figure('{"bars":{"baseline":100}}')), 0, "bars needs a bars list");
  assert.equal(countVisuals(figure('{"bars":{"baseline":100,"bars":[{"x":1,"w":9,"h":20}]}}')), 1);
  // An entry the renderer refuses makes the whole scene undrawable.
  for (const scene of ['{"grids":[{}]}', '{"arrows":[{}]}', '{"paths":[{}]}', '{"boxes":[{}]}', '{"labels":[{}]}', '{"bars":{"bars":[{}]}}']) {
    assert.equal(countVisuals(figure(scene)), 0, scene);
  }
  // A well-typed scene that paints nothing is a blank box, not a visual.
  assert.equal(countVisuals(figure('{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[]}]}')), 0, "a grid without cells draws nothing");
  assert.equal(countVisuals(figure('{"bars":{}}')), 0, "bars without bars draws nothing");
  assert.equal(countVisuals(figure('{"bars":{"bars":[{"x":1,"h":0}]}}')), 0, "a zero-height bar paints nothing");
  assert.equal(countVisuals(figure('{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[{"c":0,"r":0}]}]}')), 1);
  // A compact figure and an inline element on one line both draw, so both count.
  const compact = `<lk-figure><script type="application/json">{"grids":[{"cols":1,"rows":1,"w":9,"h":9,"cells":[{"c":0,"r":0}]}]}</script></lk-figure>`;
  assert.equal(countVisuals(`${compact}<svg><circle cx="1" cy="1" r="1"/></svg>`), 2);
  assert.equal(countVisuals(`<svg><circle cx="1" cy="1" r="1"/></svg>${compact}`), 2);
});

test("a topic reports what it still owes: missing parts, promised visuals and missing quiz", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gaps-")));
  const topic = join(root, "tema");
  mkdirSync(join(topic, "explicaciones"), { recursive: true });
  mkdirSync(join(topic, "mini-quiz"), { recursive: true });
  writeFileSync(
    join(topic, "plan.json"),
    JSON.stringify({
      topic: "Tema",
      parts: [
        { id: "p1", title: "Uno", slug: "Uno", visualsPlanned: true },
        { id: "p2", title: "Dos", slug: "Dos", visualsPlanned: true },
        { id: "p3", title: "Tres", slug: "Tres" },
      ],
    }),
  );
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Uno.md"), "# Uno\n\nSolo texto, ninguna figura.\n");
  writeFileSync(join(topic, "explicaciones", "Parte 2 - Dos.md"), "# Dos\n\n```mermaid\ngraph TD; A-->B;\n```\n");
  writeFileSync(join(topic, "mini-quiz", "p2.json"), JSON.stringify({ questions: [] }));

  const [summary] = listTopics(root);
  assert.deepEqual(summary.gaps, { missing: ["p3"], noVisuals: ["p1"], noQuiz: ["p1"] });
  assert.deepEqual(summary.parts.map((p) => p.visuals), [0, 1, 0]);
});

test('wide reading mode is opt-in, spreads the prose and survives a reload', { skip: !playwright && 'playwright not installed' }, async (t) => {
  const { view, topic } = await setup();
  const sections = Array.from(
    { length: 24 },
    (_, i) =>
      `## Sección ${i + 1}\n\nUn párrafo de prueba con suficiente texto como para que el reparto en dos columnas se observe en una pantalla ancha, sin depender de una figura.\n`,
  ).join('\n');
  writeFileSync(join(topic, 'explicaciones', 'Parte 1 - Claves.md'), `# Parte 1 — Claves\n\n${sections}`);
  const result = await view({ topic: TOPIC, part: 'p1' });

  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const measure = () =>
    page.evaluate(() => {
      const prose = document.querySelector('.prose');
      const toggle = document.querySelector('.reading-toggle');
      const box = document.querySelector('#app').getBoundingClientRect();
      return {
        columns: getComputedStyle(prose).columnCount,
        width: Math.round(box.width),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        pressed: toggle?.getAttribute('aria-pressed') ?? null,
        label: toggle?.textContent ?? '',
      };
    });

  await page.goto(result.structuredContent.url);
  const narrow = await measure();
  assert.equal(narrow.columns, 'auto', 'the default reader is a single narrow flow');
  assert.ok(narrow.width <= 800, `the default reader stays narrow (${narrow.width}px)`);
  assert.equal(narrow.pressed, 'false', 'the wide mode is off by default');
  assert.match(narrow.label, /modo ancho/i, 'the reader offers the toggle');
  assert.equal(narrow.overflow, 0, 'the default reader never overflows horizontally');

  await page.getByRole('button', { name: /modo ancho/i }).click();
  const wide = await measure();
  assert.equal(wide.columns, '2', 'the wide mode splits the prose into two columns');
  assert.ok(wide.width > 1200, `the wide mode uses the horizontal space (${wide.width}px)`);
  assert.equal(wide.pressed, 'true', 'the toggle reports the mode as on');
  assert.equal(wide.overflow, 0, 'the wide mode never overflows horizontally');

  await page.reload();
  assert.equal((await measure()).columns, '2', 'the chosen mode survives a reload');

  await page.setViewportSize({ width: 900, height: 900 });
  assert.equal((await measure()).columns, 'auto', 'a narrow screen keeps one column even in wide mode');
});

// The toggle belongs to the page, not to the template that served it: a
// hand-built part is authored as one narrow column and must still offer the
// same control, and the same persisted choice, as a generated one.
test('a hand-built part page offers the same wide reading toggle', { skip: !playwright && 'playwright not installed' }, async (t) => {
  const { view, topic } = await setup();
  const sections = Array.from(
    { length: 12 },
    (_, i) =>
      `<section><h2>Sección ${i + 1}</h2><p>Un párrafo de prueba con suficiente texto como para que el reparto en dos columnas se observe en una pantalla ancha, sin depender de una figura.</p></section>`,
  ).join('');
  writeFileSync(
    join(topic, 'explicaciones', 'Parte 1 - Claves.html'),
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>main { max-width: 648px; margin: 0 auto; padding: 0 24px; }</style></head><body><main>${sections}</main></body></html>`,
  );
  const result = await view({ topic: TOPIC, part: 'p1' });

  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const measure = () =>
    page.evaluate(() => {
      const main = document.querySelector('main');
      const toggle = document.querySelector('.reading-toggle');
      return {
        columns: getComputedStyle(main).columnCount,
        width: Math.round(main.getBoundingClientRect().width),
        pressed: toggle?.getAttribute('aria-pressed') ?? null,
        label: toggle?.textContent ?? '',
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

  await page.goto(result.structuredContent.url);
  const narrow = await measure();
  assert.match(narrow.label, /modo ancho/i, 'a hand-built part offers the toggle too');
  assert.equal(narrow.pressed, 'false', 'the wide mode is off by default');
  assert.ok(narrow.width <= 800, `the hand-built page keeps its own narrow column (${narrow.width}px)`);
  assert.equal(narrow.overflow, 0, 'the narrow hand-built page never overflows horizontally');

  await page.getByRole('button', { name: /modo ancho/i }).click();
  const wide = await measure();
  assert.equal(wide.pressed, 'true', 'the toggle reports the mode as on');
  assert.ok(wide.width > 1200, `the wide mode uses the horizontal space (${wide.width}px)`);
  assert.equal(wide.columns, '2', 'the wide mode splits the hand-built page into two columns');
  assert.equal(wide.overflow, 0, 'the wide mode never overflows horizontally');

  await page.reload();
  assert.equal((await measure()).pressed, 'true', 'the chosen mode survives a reload');

  await page.setViewportSize({ width: 900, height: 900 });
  assert.equal(await page.locator('.reading-toggle').isVisible(), false, 'below 1080 px the toggle is hidden');
});

// A hand-built page usually wraps its content in one element, and that element
// carries the authored max-width. Wide mode is the one thing allowed to override
// it: a wrapper that cannot break leaves the right half of the page empty.
test('wide mode spreads a wrapped hand-built page across both columns', { skip: !playwright && 'playwright not installed' }, async (t) => {
  const { view, topic } = await setup();
  const sections = Array.from(
    { length: 10 },
    (_, i) =>
      `<section><h2>Sección ${i + 1}</h2><p>Un párrafo de prueba con suficiente texto como para que el reparto en dos columnas se observe en una pantalla ancha, sin depender de una figura.</p></section>`,
  ).join('');
  writeFileSync(
    join(topic, 'explicaciones', 'Parte 1 - Claves.html'),
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>main { padding: 0 24px; } .wrap { max-width: 648px; margin: 0 auto; }</style></head><body><main><div class="wrap">${sections}</div></main></body></html>`,
  );
  const result = await view({ topic: TOPIC, part: 'p1' });

  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const spread = () =>
    page.evaluate(() => {
      const main = document.querySelector('main');
      const box = main.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      const blocks = [...document.querySelectorAll('main .wrap > *')];
      return {
        columns: getComputedStyle(main).columnCount,
        wrapper: Math.round(document.querySelector('.wrap').getBoundingClientRect().width),
        left: blocks.filter((b) => b.getBoundingClientRect().left < middle).length,
        right: blocks.filter((b) => b.getBoundingClientRect().left >= middle).length,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

  await page.goto(result.structuredContent.url);
  const narrow = await spread();
  assert.equal(narrow.columns, 'auto', 'the narrow page is a single flow');
  assert.equal(narrow.right, 0, 'the narrow page keeps everything in one column');

  await page.getByRole('button', { name: /modo ancho/i }).click();
  const wide = await spread();
  assert.equal(wide.columns, '2', 'the wide mode splits the wrapped page into two columns');
  assert.ok(wide.left > 0, `the first column carries content (${wide.left} blocks)`);
  assert.ok(wide.right > 0, `the second column carries content, not a hole (${wide.right} blocks)`);
  assert.ok(wide.wrapper > 1200, `an authored max-width on the wrapper is overridden (${wide.wrapper}px)`);
  assert.equal(wide.overflow, 0, 'the wide mode never overflows horizontally');
});

// The studio offers Artículo / Ancho / Libro and posts the choice to the page.
// Ancho is the document's wide mode: one control, not two, and the button has to
// report the mode the studio chose.
test("the studio's Ancho mode turns on the document's wide reading", { skip: !playwright && 'playwright not installed' }, async (t) => {
  const { view, topic } = await setup();
  const sections = Array.from(
    { length: 24 },
    (_, i) =>
      `## Sección ${i + 1}\n\nUn párrafo de prueba con suficiente texto como para que el reparto en dos columnas se observe en una pantalla ancha, sin depender de una figura.\n`,
  ).join('\n');
  writeFileSync(join(topic, 'explicaciones', 'Parte 1 - Claves.md'), `# Parte 1 — Claves\n\n${sections}`);
  const result = await view({ topic: TOPIC, part: 'p1' });

  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const measure = () =>
    page.evaluate(() => ({
      wide: document.body.classList.contains('wide'),
      book: document.body.classList.contains('book'),
      columns: getComputedStyle(document.querySelector('.prose')).columnCount,
      pressed: document.querySelector('.reading-toggle')?.getAttribute('aria-pressed') ?? null,
    }));
  const say = (mode) => page.evaluate((m) => window.postMessage({ type: 'learning-reading-mode', mode: m }, '*'), mode);

  await page.goto(result.structuredContent.url);
  assert.deepEqual(await measure(), { wide: false, book: false, columns: 'auto', pressed: 'false' }, 'the page starts narrow');

  await say('ancho');
  await page.waitForTimeout(150);
  const wide = await measure();
  assert.equal(wide.wide, true, 'Ancho in the studio turns on the wide mode');
  assert.equal(wide.columns, '2', 'Ancho in the studio splits the prose into two columns');
  assert.equal(wide.pressed, 'true', 'the button reports the mode the studio chose');

  await say('articulo');
  await page.waitForTimeout(150);
  const back = await measure();
  assert.equal(back.wide, false, 'Artículo turns the wide mode off again');
  assert.equal(back.columns, 'auto', 'Artículo returns to one column');
  assert.equal(back.pressed, 'false', 'the button follows the studio back');

  await say('libro');
  await page.waitForTimeout(150);
  const book = await measure();
  assert.equal(book.book, true, 'Libro still paginates');
  assert.equal(book.wide, false, 'Libro is not the wide mode');
});

test('every reader page declares the shared icon and serves it under the token', async () => {
  const { view } = await setup();
  const result = await view({ topic: TOPIC, part: 'p1' });
  const url = new URL(result.structuredContent.url);
  const page = await http(url.href);
  assert.equal(page.status, 200);
  const icon = page.body.match(/<link rel="icon" href="([^"]+)" type="image\/svg\+xml">/);
  assert.ok(icon, 'the page declares an svg icon');
  const svg = await http(new URL(icon[1], url).href);
  assert.equal(svg.status, 200);
  assert.match(svg.headers['content-type'], /^image\/svg\+xml/);
  assert.match(svg.body, /^<svg /);
  assert.equal((await http(new URL('/favicon.svg', url).href)).status, 404, 'the icon stays behind the token');
});

// The note's own kit vocabulary carries JSON: a walkthrough scene holds arrays like
// rows":[["7","..."]]. The wikilink rewrite must never touch that payload, or the deck
// silently dies inside the reader ("El recorrido tiene un JSON inválido").
test("obsidianToMarkdown keeps walkthrough JSON payloads intact", () => {
  const markdown = [
    "# Nota",
    "",
    '<lk-walkthrough>',
    '<script type="application/json">',
    '{"title":"Dos filas","steps":[{"title":"a","text":"b","scene":{"grids":[{"x":1,"y":2,"cols":["a","b"],"rows":[["7","x"],["11","y"]]}]}}]}',
    "</script>",
    "</lk-walkthrough>",
    "",
    "Cómo leerlo: dos filas.",
    "",
    "Ver [[otra nota]] para más.",
  ].join("\n");
  const out = obsidianToMarkdown(markdown, mkdtempSync(join(tmpdir(), "note-")));
  assert.ok(out.includes('"rows":[["7","x"],["11","y"]]'), `payload corrupted: ${out.slice(out.indexOf('"rows"'), out.indexOf('"rows"') + 40)}`);
  assert.ok(out.includes("Ver otra nota para más."), "a real wikilink must still resolve");
  assert.ok(out.includes("Cómo leerlo: dos filas."), "the reading guide survives");
});

// The same payload can appear inside a fenced block (a sample of the format): it is shown,
// never rewritten, and never resolved into a link.
test("obsidianToMarkdown leaves fenced samples alone", () => {
  const markdown = ["# N", "", "```json", '{"rows":[["7"]]}', "```", "", "Ver [[otra]]"].join("\n");
  const out = obsidianToMarkdown(markdown, mkdtempSync(join(tmpdir(), "note-")));
  assert.ok(out.includes('{"rows":[["7"]]}'), "a fenced sample is not a payload to rewrite");
  assert.ok(out.includes("Ver otra"), "wikilinks outside the fence still resolve");
});

// The note is written in the kit's own vocabulary: without kit.css the browser falls back to
// raw inline markup (huge default buttons floating over the text), which is exactly the design
// the reader must never show. The page ships the stylesheet before app.css so the note keeps
// the kit's paper layout and app.css still wins for the page chrome.
test("the part page ships the kit stylesheet and scripts for the note's own elements", async () => {
  const { view, shutdown } = await setup();
  const result = await view({ topic: TOPIC, part: "p1" });
  const page = await http(result.structuredContent.url);
  assert.match(page.body, /<link rel="stylesheet" href="[^"]*kit\/kit\.css\?v=\d+">/, "kit.css must load before app.css");
  assert.match(page.body, /kit\/scene\.js\?v=\d+/, "scene.js must load so a deck can be drawn");
  assert.match(page.body, /kit\/kit\.js\?v=\d+/, "kit.js must load so the custom elements upgrade");
  const kitAt = page.body.indexOf("kit/kit.css");
  const appAt = page.body.indexOf("app.css");
  assert.ok(kitAt !== -1 && appAt !== -1 && kitAt < appAt, "kit.css comes first, app.css refines it");
  await shutdown();
});

// A learner reported a control as still broken after it was fixed: the page cached app.css for
// an hour, so the deploy never reached their tab. Every view asset now carries a version stamp
// and must be revalidated, so the next load cannot show yesterday's stylesheet.
test("view assets are versioned and revalidated on every load", async () => {
  const { view, shutdown } = await setup();
  const result = await view({ topic: TOPIC, part: "p1" });
  const page = await http(result.structuredContent.url);
  assert.match(page.body, /app\.css\?v=\d+/, "app.css carries a version stamp");
  assert.match(page.body, /app\.js\?v=\d+/, "app.js carries the same stamp");
  const stamped = /app\.css\?v=(\d+)/.exec(page.body);
  const css = await http(`${result.structuredContent.base}app.css?v=${stamped[1]}`);
  assert.equal(css.status, 200);
  assert.equal(css.headers["cache-control"], "no-cache", "a deploy must be visible on the next load");
  await shutdown();
});

// A demo page under explicaciones/demos/ links the kit with a relative path
// (../../../kit/kit.js). Served through the reader, that climbs to
// <topic>/file/kit/..., so the same kit route must answer there or every deck in
// a demo page stays an unstyled, undrawn placeholder.
test("a demo page finds the kit through its own relative path", async () => {
  const { view, shutdown } = await setup();
  const result = await view({ topic: TOPIC, part: "p1" });
  const base = result.structuredContent.base;
  const viaTopic = await http(`${base}${TOPIC}/kit/kit.js`);
  assert.equal(viaTopic.status, 200);
  assert.match(viaTopic.headers["content-type"], /^text\/javascript/);
  assert.match(viaTopic.body, /lk-walkthrough/);
  const nested = await http(`${base}${TOPIC}/file/kit/kit.js`);
  assert.equal(nested.status, 200, "a deeper demo resolves one level further");
  const css = await http(`${base}${TOPIC}/kit/kit.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers["content-type"], /^text\/css/);
  assert.equal((await http(`${base}${TOPIC}/kit/nope.js`)).status, 404);
  assert.equal((await http(`${base}${TOPIC}/file/kit/..%2Fkit.css`)).status, 404);
  await shutdown();
});

// The reader draws a note figure with the engine the CLI uses, served beside the
// kit so the same file draws a still, a frame and a page.
test("the reader serves the visual engine beside the kit", async () => {
  const { view, shutdown } = await setup();
  const result = await view({ topic: TOPIC, part: "p1" });
  const base = result.structuredContent.base;
  const engine = await http(`${base}kit/visuals/draw.js`);
  assert.equal(engine.status, 200);
  assert.match(engine.headers["content-type"], /^text\/javascript/);
  assert.match(engine.body, /LKVisuals/);
  assert.match(engine.body, /function renderScene/);
  assert.equal((await http(`${base}${TOPIC}/kit/visuals/draw.js`)).status, 200, "a page under a topic resolves the same route");
  assert.equal((await http(`${base}${TOPIC}/file/kit/visuals/draw.js`)).status, 200, "a demo one level deeper does too");
  assert.equal((await http(`${base}kit/visuals/theme.mjs`)).status, 404, "only the classic engine file is served");
  assert.equal((await http(`${base}kit/visuals/nope.js`)).status, 404, "the route never guesses a file");
  await shutdown();
});

test("a regeneration backup refuses what a deletion refuses, and moves nothing on a refusal", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "regen-")));
  const topic = join(root, "redes");
  mkdirSync(join(topic, "explicaciones"), { recursive: true });
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "Redes", parts: [{ id: "p1", title: "Capas", slug: "Capas", subtema: "1.1" }] }));
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Capas.md"), "# Parte 1\n");

  assert.throws(() => backupPartForRegeneration(root, { topic: "../etc", part: "p1" }), /invalid topic id/);
  assert.throws(() => backupPartForRegeneration(root, { topic: "redes", part: "../p1" }), /invalid part id/);
  assert.throws(() => backupPartForRegeneration(root, { topic: "redes", part: "p9" }), /is not in the plan/);
  assert.throws(() => backupPartForRegeneration(root, { topic: "nada", part: "p1" }), /has no plan/);
  assert.equal(existsSync(join(root, ".papelera")), false, "a refused backup leaves no trash behind");
  assert.equal(existsSync(join(topic, "explicaciones", "Parte 1 - Capas.md")), true);

  // A part whose files are already gone is not an error: there is nothing to keep.
  rmSync(join(topic, "explicaciones", "Parte 1 - Capas.md"));
  assert.deepEqual(backupPartForRegeneration(root, { topic: "redes", part: "p1" }), { trash: "", moved: [] });
  assert.equal(existsSync(join(root, ".papelera")), false);
});

test("two regenerations in the same millisecond keep both previous versions", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "regen-")));
  const topic = join(root, "redes");
  mkdirSync(join(topic, "explicaciones"), { recursive: true });
  writeFileSync(join(topic, "plan.json"), JSON.stringify({ topic: "Redes", parts: [{ id: "p1", title: "Capas", slug: "Capas", subtema: "1.1" }] }));
  const page = join(topic, "explicaciones", "Parte 1 - Capas.html");
  const moment = new Date("2026-01-01T00:00:00.000Z");

  writeFileSync(page, "<p>primera version</p>");
  backupPartForRegeneration(root, { topic: "redes", part: "p1" }, moment);
  writeFileSync(page, "<p>segunda version</p>");
  backupPartForRegeneration(root, { topic: "redes", part: "p1" }, moment);

  // Both versions are the learner's earlier work: neither may overwrite the other.
  const kept = readdirSync(join(root, ".papelera"), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith("Parte 1 - Capas.html"))
    .map((name) => readFileSync(join(root, ".papelera", name), "utf8"));
  assert.deepEqual(kept.sort(), ["<p>primera version</p>", "<p>segunda version</p>"]);
});

test("a rich page keeps its media controls inside the article and one number per index entry", { skip: playwright ? false : "playwright not installed" }, async (t) => {
  const { topic, view, shutdown } = await setup();
  mkdirSync(join(topic, "explicaciones"), { recursive: true });
  writeFileSync(
    join(topic, "explicaciones", "Parte 1 - Claves.html"),
    `<!doctype html><html lang="es"><head><title>Claves</title></head><body><main>
      <h1>Parte 5 — Tareas episódicas y continuas</h1>
      <h2>1. Por qué existe</h2><p>${"Texto de la explicación. ".repeat(20)}</p>
      <h2>2. El almacén es episódico</h2><p>${"Texto. ".repeat(30)}</p>
      <h2>3. La cámara que no se apaga</h2><p>${"Texto. ".repeat(30)}</p>
    </main></body></html>`,
  );
  const url = (await view({ topic: TOPIC, part: "p1" })).structuredContent.url;
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  await page.waitForTimeout(800);

  const layout = await page.evaluate(() => {
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width) };
    };
    const main = document.querySelector("main");
    const audio = document.querySelector("lk-audio");
    const video = document.querySelector("lk-video");
    const toc = document.querySelector(".lk-toc");
    return {
      main: rect(main),
      title: rect(main.querySelector("h1")),
      audio: audio ? rect(audio) : null,
      video: video ? rect(video) : null,
      insideMain: !!document.querySelector("main lk-audio"),
      toc: toc ? rect(toc) : null,
      entries: [...document.querySelectorAll(".lk-toc li")].map((li) => li.textContent.trim()),
      page: document.documentElement.scrollWidth,
    };
  });

  // The audio and the video belong to the part: inside its measure, after the title.
  assert.equal(layout.insideMain, true, "the audio control is outside the article");
  for (const [name, control] of [["audio", layout.audio], ["video", layout.video]]) {
    assert.ok(control, `the page lost its ${name} control`);
    assert.ok(control.left >= layout.main.left - 1, `${name} starts left of the article: ${JSON.stringify(control)}`);
    assert.ok(control.right <= layout.main.right + 1, `${name} spills past the article: ${JSON.stringify(control)}`);
    assert.ok(control.top >= layout.title.top, `${name} sits above the title: ${JSON.stringify(control)}`);
  }

  // The list numbers the entries; a heading that already says "1." would count twice.
  assert.deepEqual(layout.entries, ["Por qué existe", "El almacén es episódico", "La cámara que no se apaga"]);

  // A 180 px column broke a title into a lone word on a desktop screen.
  assert.ok(layout.toc.width >= 220, `the index is too narrow: ${layout.toc.width}px`);
  assert.ok(layout.toc.left >= layout.main.right, "the index covers the article");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const phone = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(phone <= 390, `the phone page overflows horizontally: ${phone}px`);
  await shutdown();
});

// ── The learner's real conditions (#207) ─────────────────────────────────────
// Every figure gate ran in a light theme, a narrow column and the headless
// default font. The learner read the same pages on a black paper, in wide mode,
// with the reader's own serif, and the callouts pointed at the wrong glyphs.
// These tests render the part through the real reader — marked, DOMPurify,
// math.js, app.js, book.js and the kit — because a hand-built page cannot prove
// what the learner sees: rendering the note by hand turned the inline
// `<lk-math>` of a paragraph into a real element and swallowed the sentence.
const KIT_EXAMPLES = join(import.meta.dirname, "kit", "examples");
const SHOTS = "/tmp/207-shots";
const example = (name) => readFileSync(join(KIT_EXAMPLES, name), "utf8");
// The kit blocks of an example, verbatim: a part carries the same figures.
const kitBlocks = (name) => [...example(name).matchAll(/<lk-(?:scene|walkthrough)[\s\S]*?<\/lk-(?:scene|walkthrough)>/g)].map((m) => m[0]);

// A part as the learner read it: sections of prose with a scene and a deck.
function partNote() {
  const prose = (n) => `<section><h2>${n}. Una sección</h2>${"<p>El texto de la sección explica una idea y la deja dicha en una línea.</p>".repeat(12)}</section>`;
  return ["# Parte 1 — Claves", prose(1), `<section><h2>2. La fórmula</h2>${kitBlocks("formula-anotada.md")[0]}</section>`, prose(3), `<section><h2>4. La curva</h2>${kitBlocks("curva-gaussiana.md")[0]}</section>`, prose(5)].join("\n\n");
}

async function readerPart(t, markdown, { theme = "light", width = 900, height = 1000, wide = false } = {}) {
  const { topic, view } = await setup();
  writeFileSync(join(topic, "explicaciones", "Parte 1 - Claves.md"), markdown);
  const browser = await playwright.chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  const result = await view({ topic: TOPIC, part: "p1" });
  await page.goto(`${result.structuredContent.url}?theme=${theme}`);
  await page.evaluate(() => document.fonts.ready);
  if (wide) await page.locator(".reading-toggle").click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  return page;
}

// What the reader actually gets, measured in the browser: a callout whose guide
// does not end on its glyph, a stroke over a word, ink that does not contrast
// with its paper, a stage that drew nothing, a figure scaled above its viewBox.
const MEASURE = (theme) => {
  const out = { empty: [], missed: [], overlaps: [], faint: [], scaled: [], islands: [] };
  const night = theme === "dark" || theme === "black";
  const rgb = (value) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]; return (hi + 0.05) / (lo + 0.05); };
  const paper = (node) => {
    for (let el = node; el; el = el.parentElement) {
      const c = rgb(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const screen = (path, at) => {
    const m = path.getScreenCTM(), p = path.getPointAtLength(at);
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  };
  const round = (n) => Math.round(n * 10) / 10;
  for (const stage of document.querySelectorAll(".lk-wt-stage, .lk-scene-stage, .lk-figure-stage")) {
    const svg = stage.querySelector("svg");
    if (!svg) { out.empty.push(`${stage.className}: no svg`); continue; }
    const box = svg.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) out.empty.push(`${stage.className}: ${Math.round(box.width)}×${Math.round(box.height)}`);
    // Una figura crece hasta el ancho de una columna de lectura, con un tope de
    // 1,6× su viewBox: en modo ancho el deck ya no queda flotando pequeño dentro
    // del marco, y sus etiquetas nunca bajan del tamaño de lectura.
    const vb = svg.viewBox?.baseVal?.width || 0;
    if (vb && box.width / vb > 1.62) out.scaled.push(`${stage.className}: ${Math.round(box.width)}px para un viewBox de ${Math.round(vb)} (${round(box.width / vb)}×)`);
    // Un recorrido muestra un paso por vez: se mide cada paso, porque el que
    // nadie mira es donde el callout se desvía sin que se note.
    // #209: a scene is one surface with the page. In the night papers no white sheet is
    // drawn behind it and no piece of the drawing is filled white: that is the island.
    if (night) {
      const host = stage.closest("lk-scene, lk-figure, lk-walkthrough") ?? stage;
      const sheet = rgb(getComputedStyle(host).backgroundColor);
      if (sheet && sheet.a > 0.9 && sheet.r > 240 && sheet.g > 240 && sheet.b > 240) out.islands.push(`${stage.className}: la hoja de la escena es blanca sobre el papel ${theme}`);
      const white = [...svg.querySelectorAll("rect, circle, path")].filter((el) => {
        if (el.closest("marker")) return false;
        const fill = rgb(getComputedStyle(el).fill);
        return fill && fill.a > 0.9 && fill.r > 240 && fill.g > 240 && fill.b > 240;
      });
      if (white.length) out.islands.push(`${stage.className}: ${white.length} pieza(s) se pintan de blanco sobre el papel ${theme}`);
    }
    const steps = [...svg.querySelectorAll("[data-step]")];
    const shownNow = steps.map((g) => g.style.display);
    const passes = steps.length ? steps.map((_, i) => i + 1) : [0];
    for (const pass of passes) {
      steps.forEach((g) => { g.style.display = pass && Number(g.dataset.step) === pass ? "" : "none"; });
      const atoms = [...svg.querySelectorAll("tspan[data-atom]")].map((node) => ({ at: Number(node.dataset.atom), text: node.textContent, box: node.getBoundingClientRect() }));
      // A callout names its glyph; the guide has to end on that glyph's box.
      for (const guide of svg.querySelectorAll("[data-callout-guide]")) {
        const n = guide.dataset.calloutGuide;
        if (guide.dataset.atom === undefined) { out.missed.push(`la guía ${n} no declara su símbolo`); continue; }
        const path = guide.querySelector("path");
        const atom = atoms[Number(guide.dataset.atom)];
        if (!path || !atom || !atom.box.width) { out.missed.push(`la guía ${n} apunta al átomo ${guide.dataset.atom}, que no existe`); continue; }
        const tip = screen(path, path.getTotalLength());
        const b = atom.box;
        const gap = Math.hypot(Math.max(b.x - tip.x, 0, tip.x - b.right), Math.max(b.y - tip.y, 0, tip.y - b.bottom));
        if (gap > 3) out.missed.push(`la guía ${n} queda a ${round(gap)} px de «${atom.text}»`);
      }
      // The badge numbers are drawn over the guide that starts at their centre.
      const words = [...svg.querySelectorAll("text")]
        .filter((node) => !node.closest("[data-callout]"))
        .map((node) => ({ node, text: node.textContent.trim(), box: node.getBoundingClientRect() }))
        .filter((w) => w.text && w.box.width > 1);
      for (const path of svg.querySelectorAll("path[stroke]")) {
        if (path.closest("marker")) continue;
        // A stroke of a step nobody is looking at crosses nothing: its geometry still
        // answers getScreenCTM, so it has to be skipped by hand.
        if (path.closest("[data-step]")?.style.display === "none") continue;
        const total = path.getTotalLength?.() ?? 0;
        if (!total) continue;
        for (let i = 0; i <= 32; i++) {
          const p = screen(path, (total * i) / 32);
          const hit = words.find((w) => p.x > w.box.x + 2 && p.x < w.box.right - 2 && p.y > w.box.y + 2 && p.y < w.box.bottom - 2);
          if (hit) { out.overlaps.push(`un trazo cruza «${hit.text.slice(0, 24)}»`); break; }
        }
      }
      for (const word of words) {
        const ink = rgb(getComputedStyle(word.node).fill);
        if (!ink) continue;
        const c = ratio(ink, paper(word.node));
        if (c < 4.5) out.faint.push(`«${word.text.slice(0, 24)}» ${round(c)}:1`);
      }
    }
    steps.forEach((g, i) => { g.style.display = shownNow[i]; });
  }
  // #222: the classic deck follows the page paper in the night themes, and its own
  // words (title, caption, step buttons) read at 4.5:1 on it.
  for (const deck of document.querySelectorAll("lk-walkthrough")) {
    for (const node of deck.querySelectorAll(".lk-title, .lk-wt-caption strong, .lk-wt-caption p, .lk-wt-count, .lk-wt-bar button:not(:disabled):not(.lk-wt-dot), .lk-wt-full")) {
      if (!node.textContent.trim()) continue;
      const ink = rgb(getComputedStyle(node).color);
      if (!ink) continue;
      const c = ratio(ink, paper(node));
      if (c < 4.5) out.faint.push(`${node.className || node.tagName} del deck ${round(c)}:1`);
    }
  }
  return out;
};

const MATRIX = ["light", "dark", "black"].flatMap((theme) => [["narrow", 900, false], ["wide", 1920, true]].map(([size, width, wide]) => ({ theme, size, width, wide })));

// marked eats the backslash of `\;` `\!` `\,` before math.js sees it: the learner read
// «x+2=3; ⟹; x=3−2» and «, exp!(». The formula goes to KaTeX exactly as written, in
// the three forms a note uses: display dollars, inline dollars and the kit element.
test("spacing commands reach KaTeX untouched in $$, $ and <lk-math>", { skip: !playwright && "playwright not installed" }, async (t) => {
  const note = [
    "# Espacios", "",
    "Display: $$x\\;=\\;1$$", "",
    "Inline: $\\exp\\!(x)$ y fin.", "",
    "<lk-math display>x + 2 = 3 \\;\\Longrightarrow\\; x = 3 - 2 \\;\\Longrightarrow\\; x = 1</lk-math>", "",
    "Elemento en línea: <lk-math>\\exp\\!(x)\\,dx</lk-math> fin.", "",
  ].join("\n");
  const page = await readerPart(t, note);
  await page.locator(".katex").first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".katex").length >= 4, null, { timeout: 15000 });
  const seen = await page.evaluate(() => [...document.querySelectorAll(".katex")].map((k) => k.querySelector("annotation")?.textContent ?? ""));
  assert.deepEqual(seen, [
    "x\\;=\\;1",
    "\\exp\\!(x)",
    "x + 2 = 3 \\;\\Longrightarrow\\; x = 3 - 2 \\;\\Longrightarrow\\; x = 1",
    "\\exp\\!(x)\\,dx",
  ]);
  // What the learner sees is the `.katex-html` layer: a stray «;» «!» or «,» there is the bug.
  const visible = await page.evaluate(() => [...document.querySelectorAll(".katex-html")].map((k) => k.textContent));
  assert.equal(visible.some((text) => /[;!,]/.test(text.replace(/[\u2061\u2063]/g, ""))), false, `a spacing command leaked into the formula: ${JSON.stringify(visible)}`);
});

// The reader's own prose must survive the reader: an inline `<lk-math>` inside a
// paragraph is a code span, not an element that swallows the sentence.
test("the part's prose reaches the reader whole, inline code included", { skip: !playwright && "playwright not installed" }, async (t) => {
  const page = await readerPart(t, example("formula-anotada.md"));
  await page.locator("lk-scene svg").waitFor();
  const prose = await page.locator(".prose p").last().textContent();
  assert.match(prose, /va con <lk-math> y su cuenta renglón a renglón/);
  assert.match(prose, /Nunca se escribe dos veces la misma fórmula/);
  assert.equal(await page.locator(".prose code", { hasText: "<lk-math>" }).count(), 1, "the inline code span is a code span");
});

test("every figure keeps its callouts on their glyphs, its stage drawn, its type at reading size and its ink readable, in every theme and width", { skip: !playwright && "playwright not installed" }, async (t) => {
  mkdirSync(SHOTS, { recursive: true });
  const articles = [
    ["formula-anotada", example("formula-anotada.md")],
    ["curva-gaussiana", example("curva-gaussiana.md")],
    ["formula-gaussiana", example("formula-gaussiana.md")],
    // An lk-figure names tones, not colours: it has to follow the night paper too.
    ["figura", `# Figura\n\n<lk-figure>\n<script type="application/json">\n${JSON.stringify({ title: "El almacén", aria: "Una rejilla con el robot y la salida", viewBox: "0 0 760 290", grids: [{ x: 16, y: 40, cols: 4, rows: 3, w: 82, h: 82, cells: [{ c: 0, r: 0, kind: "robot" }, { c: 3, r: 0, kind: "exit", label: "+1" }] }], arrows: [{ x1: 20, y1: 260, x2: 320, y2: 260, tone: "blue", label: "el robot sigue su política" }] })}\n</script>\n</lk-figure>\n`],
    ["parte", partNote()],
  ];
  for (const [name, markdown] of articles) {
    for (const { theme, size, width, wide } of MATRIX) {
      const page = await readerPart(t, markdown, { theme, width, wide });
      await page.locator("lk-scene svg, lk-walkthrough svg, lk-figure svg").first().waitFor();
      const seen = await page.evaluate(MEASURE, theme);
      const where = `${name} · ${theme} · ${size}`;
      assert.deepEqual(seen.empty, [], `${where}: una figura quedó sin dibujar`);
      assert.deepEqual(seen.missed, [], `${where}: un callout no termina en el símbolo que nombra`);
      assert.deepEqual(seen.overlaps, [], `${where}: un trazo cruza un texto`);
      assert.deepEqual(seen.faint, [], `${where}: la tinta de la figura no se lee sobre su papel`);
      assert.deepEqual(seen.scaled, [], `${where}: la figura se estira por encima de su viewBox`);
      assert.deepEqual(seen.islands, [], `${where}: la escena es una isla blanca sobre el papel de noche`);
      await page.screenshot({ path: join(SHOTS, `figura-${name}-${theme}-${size}.png`), fullPage: true });
      const deck = page.locator("lk-walkthrough").first();
      if (name === "curva-gaussiana" && await deck.count()) {
        mkdirSync(STORY_SHOTS, { recursive: true });
        await deck.scrollIntoViewIfNeeded();
        await deck.screenshot({ path: join(STORY_SHOTS, `curva-gaussiana-${theme}-${size}-walkthrough.png`) });
      }
    }
  }
});

// A callout names the symbol it points at. An x coordinate measured against one
// font is what put ① on «=» and ⑥ on nothing in the learner's reader.
test("the gated examples anchor every callout to a symbol, never to an x coordinate", () => {
  const specs = kitBlocks("formula-anotada.md").filter((block) => block.startsWith("<lk-scene")).map((block) => JSON.parse(/<script type="application\/json">([\s\S]*?)<\/script>/.exec(block)[1]));
  const callouts = specs.flatMap((spec) => spec.scene.callouts ?? []);
  assert.ok(callouts.length > 0, "formula-anotada.md has no callouts");
  for (const callout of callouts) {
    assert.ok(Number.isInteger(callout.at) || typeof callout.symbol === "string", `el callout ${callout.n} no declara su símbolo`);
    assert.equal(callout.to, undefined, `el callout ${callout.n} todavía apunta a una coordenada`);
  }
});

// Wide mode is two columns; a deck that is not told to cross them is split in
// two, and the learner saw only its title with an empty stage beside it.
test("a walkthrough in wide mode renders its stage in place, once, with readable buttons", { skip: !playwright && "playwright not installed" }, async (t) => {
  const page = await readerPart(t, partNote(), { width: 1920, height: 1080, wide: true });
  const deck = page.locator("lk-walkthrough").first();
  await deck.locator("svg").waitFor();
  const seen = await deck.evaluate((node) => {
    const stage = node.querySelector(".lk-wt-stage");
    const bar = node.querySelector(".lk-wt-bar");
    const prev = bar.querySelector("button");
    const rgb = (value) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const paper = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.9) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const [hi, lo] = [lum(rgb(getComputedStyle(prev).color)), lum(paper(prev))].sort((a, b) => b - a);
    const box = stage.getBoundingClientRect();
    return {
      fragments: node.getClientRects().length,
      span: getComputedStyle(node).columnSpan,
      breakInside: getComputedStyle(node).breakInside,
      stage: [Math.round(box.width), Math.round(box.height)],
      title: node.querySelector(".lk-title").getBoundingClientRect().y,
      bar: bar.getBoundingClientRect().y,
      contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10,
    };
  });
  assert.equal(seen.span, "all", "el deck no cruza las columnas: se parte entre ellas y su título queda en una con el escenario en la otra");
  assert.equal(seen.breakInside, "avoid", "el deck no está protegido de partirse entre columnas");
  assert.equal(seen.fragments, 1, "el deck se parte entre las dos columnas");
  assert.ok(seen.stage[0] > 100 && seen.stage[1] > 100, `el escenario quedó vacío: ${seen.stage}`);
  assert.ok(seen.title < seen.bar, "el título quedó debajo de sus controles");
  assert.ok(seen.contrast >= 4.5, `el botón «Anterior» no se lee sobre su papel: ${seen.contrast}:1`);
  await page.screenshot({ path: join(SHOTS, "wide-deck.png"), fullPage: true });
});

// Full screen is where the letters are meant to grow. From wide mode the deck
// kept its 320 px column and the figure stayed a thumbnail on a 1920 px screen.
test("full screen grows the figure from wide mode", { skip: !playwright && "playwright not installed" }, async (t) => {
  const page = await readerPart(t, partNote(), { width: 1920, height: 1080, wide: true });
  const deck = page.locator("lk-walkthrough").first();
  await deck.locator("svg").waitFor();
  await deck.getByRole("button", { name: "Pantalla completa" }).click();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains("lk-walkthrough"));
  await page.waitForTimeout(250);
  const full = await deck.evaluate((node) => {
    const svg = node.querySelector("svg").getBoundingClientRect();
    return { w: Math.round(svg.width), h: Math.round(svg.height), screen: [innerWidth, innerHeight] };
  });
  assert.ok(full.h >= full.screen[1] * 0.5 || full.w >= full.screen[0] * 0.5, `la figura no creció en pantalla completa: ${full.w}×${full.h} en ${full.screen.join("×")}`);
  await page.screenshot({ path: join(SHOTS, "wide-deck-fullscreen.png") });
});

// ── Formulas and exercises, step by step (#209) ─────────────────────────────
// The learner asked for the formula to be shown whole and then symbol by symbol,
// and for a worked exercise to show the arrow that moves a term across the
// equation. Both are the same `<lk-story>` furniture: a header with the formula
// or equation, a stage with the actors and the movement, a narrator and a player.
// These tests render both examples through the real reader in every theme and
// width, step through every step, and measure what the learner sees: a tag whose
// elbow does not land on its piece, a moving-term arrow that does not start and
// end on the two measured boxes, a label below the reading size, a figure that
// grew past its cap.
const STORY_SHOTS = "/tmp/vl-shots";
const STORY_MATRIX = ["light", "dark", "black"].flatMap((theme) => [
  { theme, size: "narrow", width: 900, wide: false },
  { theme, size: "wide", width: 1920, wide: true },
]);

const STORY_MEASURE = (_card, theme) => {
  const out = { empty: [], missed: [], moves: [], tiny: [], scaled: [], focus: [], faint: [], islands: [], small: [], header: [], pieces: [] };
  const gap = (p, b) => Math.hypot(Math.max(b.x - p.x, 0, p.x - b.right), Math.max(b.y - p.y, 0, p.y - b.bottom));
  const rgb = (value) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]; return (hi + 0.05) / (lo + 0.05); };
  const paper = (node) => {
    for (let el = node; el; el = el.parentElement) {
      const c = rgb(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const night = theme === "dark" || theme === "black";
  for (const story of document.querySelectorAll("lk-story")) {
    const svg = story.querySelector("svg");
    if (!svg) { out.empty.push("lk-story: no svg"); continue; }
    const box = svg.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) out.empty.push(`lk-story: ${Math.round(box.width)}×${Math.round(box.height)}`);
    const vb = svg.viewBox?.baseVal?.width || 0;
    if (vb && box.width / vb > 1.62) out.scaled.push(`lk-story: ${Math.round(box.width)}px para un viewBox de ${Math.round(vb)}`);
    const scale = vb ? box.width / vb : 1;
    // One surface: the stage has no paper of its own, and it fills the card it lives in.
    const card = story.getBoundingClientRect();
    const stage = story.querySelector(".lk-story-stage");
    const panel = stage.getBoundingClientRect();
    const stagePaper = rgb(getComputedStyle(stage).backgroundColor);
    const cardPaper = paper(story);
    if (stagePaper && stagePaper.a > 0.05 && ratio(stagePaper, cardPaper) > 1.05) out.islands.push(`el escenario pinta ${getComputedStyle(stage).backgroundColor} sobre una tarjeta ${JSON.stringify(cardPaper)}`);
    if (panel.width < card.width - 4) out.islands.push(`el escenario mide ${Math.round(panel.width)} px en una tarjeta de ${Math.round(card.width)} px`);
    // The drawing is centred in its panel, not pushed to a side.
    if (Math.abs((box.left + box.right) / 2 - (panel.left + panel.right) / 2) > 2) out.islands.push("el dibujo no queda centrado en su escenario");
    const steps = [...svg.querySelectorAll("[data-step]")];
    const shownNow = steps.map((g) => g.style.display);
    for (const pass of steps.map((_, i) => i + 1)) {
      steps.forEach((g) => { g.style.display = Number(g.dataset.step) === pass ? "" : "none"; });
      const step = steps.find((g) => Number(g.dataset.step) === pass);
      for (const tag of step.querySelectorAll("[data-tag-to]")) {
        const target = step.querySelector(`[data-actor="${tag.dataset.tagTo}"], [data-box-id="${tag.dataset.tagTo}"], [data-label-id="${tag.dataset.tagTo}"], [data-icon-id="${tag.dataset.tagTo}"], [data-callout="${tag.dataset.tagTo}"]`);
        const elbow = tag.querySelector("[data-elbow]");
        if (!target || !elbow) { out.missed.push(`el rótulo «${tag.dataset.tagText}» no tiene destino`); continue; }
        const end = elbow.getPointAtLength(elbow.getTotalLength());
        const m = elbow.getScreenCTM();
        const p = { x: m.a * end.x + m.c * end.y + m.e, y: m.b * end.x + m.d * end.y + m.f };
        const gapPx = gap(p, target.getBoundingClientRect());
        if (gapPx > 3) out.missed.push(`el rótulo «${tag.dataset.tagText}» queda a ${Math.round(gapPx)} px de su pieza`);
      }
      // #217: props, state marks and result marks are anchored and inside the canvas.
      {
        const vbox = svg.viewBox.baseVal;
        const inside = (b) => Math.min(b.x - vbox.x, b.y - vbox.y, vbox.x + vbox.width - (b.x + b.width), vbox.y + vbox.height - (b.y + b.height));
        const touch = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
        const actors = [...step.querySelectorAll("[data-actor]")].map((a) => ({ id: a.dataset.actor, b: a.getBBox() }));
        const props = [...step.querySelectorAll("[data-prop-id]")].map((p) => ({ id: p.dataset.propId, on: p.dataset.propOn, b: p.getBBox(), missing: p.dataset.propMissing }));
        for (const p of props) {
          if (p.missing) { out.pieces.push(`la pieza ${p.id} nombra a ${p.missing}, que no está en el paso`); continue; }
          if (!p.b.width) { out.pieces.push(`la pieza ${p.id} no dibuja nada`); continue; }
          if (inside(p.b) < 12) out.pieces.push(`la pieza ${p.id} queda a ${Math.round(inside(p.b))}u del borde del lienzo`);
          for (const a of actors) if (touch(p.b, a.b)) out.pieces.push(`la pieza ${p.id} se encima sobre ${a.id}`);
          for (const o of props) if (o.id !== p.id && o.b.width && touch(p.b, o.b)) out.pieces.push(`la pieza ${p.id} se encima sobre ${o.id}`);
        }
        for (const glyph of step.querySelectorAll("[data-state-mark] text, [data-mark-kind] text")) {
          const b = glyph.getBBox();
          if (inside(b) < 12) out.pieces.push(`la marca ${glyph.textContent} queda a ${Math.round(inside(b))}u del borde del lienzo`);
          for (const a of actors) if (touch(b, a.b)) out.pieces.push(`la marca ${glyph.textContent} se encima sobre ${a.id}`);
          for (const p of props) if (p.b.width && touch(b, p.b)) out.pieces.push(`la marca ${glyph.textContent} se encima sobre ${p.id}`);
        }
        for (const a of step.querySelectorAll('[data-actor][data-state="invalid"]')) {
          if (!a.querySelector("[data-strike]")) out.pieces.push(`el actor inválido ${a.dataset.actor} no está tachado`);
        }
      }
      for (const move of step.querySelectorAll("[data-move-from]")) {
        const from = step.querySelector(`[data-actor="${move.dataset.moveFrom}"], [data-prop-id="${move.dataset.moveFrom}"]`);
        const to = step.querySelector(`[data-actor="${move.dataset.moveTo}"], [data-prop-id="${move.dataset.moveTo}"]`);
        const path = move.querySelector("[data-move-path]");
        if (!from || !to || !path) { out.moves.push(`el movimiento ${move.dataset.moveFrom}→${move.dataset.moveTo} no tiene sus actores`); continue; }
        const m = path.getScreenCTM();
        const at = (len) => { const p = path.getPointAtLength(len); return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }; };
        const start = at(0), end = at(path.getTotalLength());
        const startGap = gap(start, from.getBoundingClientRect());
        const endGap = gap(end, to.getBoundingClientRect());
        if (startGap > 3) out.moves.push(`la flecha de «${move.dataset.moveVerb}» no empieza en ${move.dataset.moveFrom} (${Math.round(startGap)} px)`);
        if (endGap > 3) out.moves.push(`la flecha de «${move.dataset.moveVerb}» no termina en ${move.dataset.moveTo} (${Math.round(endGap)} px)`);
      }
      for (const t of step.querySelectorAll("text")) {
        const text = t.textContent.trim();
        const size = Number(t.getAttribute("font-size")) || 0;
        if (!text || !size) continue;
        const px = size * scale;
        if (px < 14) out.tiny.push(`«${text.slice(0, 20)}» a ${px.toFixed(1)} px`);
        const ink = rgb(getComputedStyle(t).fill);
        if (ink) {
          const c = ratio(ink, cardPaper);
          if (c < 4.5) out.faint.push(`«${text.slice(0, 20)}» ${Math.round(c * 10) / 10}:1`);
        }
      }
      // In the night papers no white surface is drawn: a white fill is the island.
      if (night) {
        for (const el of step.querySelectorAll("rect, circle, path")) {
          if (el.closest("marker")) continue;
          const fill = rgb(getComputedStyle(el).fill);
          if (fill && fill.a > 0.9 && fill.r > 240 && fill.g > 240 && fill.b > 240) { out.islands.push("una pieza del escenario se pinta de blanco sobre el papel de noche"); break; }
        }
      }
      out.focus.push({ step: pass, focused: [...story.querySelectorAll(".lk-token[data-focus='1']")].map((t) => t.dataset.atom) });
    }
    steps.forEach((g, i) => { g.style.display = shownNow[i]; });
    // The narrator and the header equation are the most readable things on the card.
    const size = (selector) => parseFloat(getComputedStyle(story.querySelector(selector)).fontSize);
    if (size(".lk-story-narrator") < 17) out.small.push(`el narrador mide ${size(".lk-story-narrator")} px (mínimo 17)`);
    if (size(".lk-story-formula") < 22) out.small.push(`la ecuación de la cabecera mide ${size(".lk-story-formula")} px (mínimo 22)`);
    // #222: the header is one line, always. A highlighted group neither wraps the
    // equation nor spreads its letters: it keeps the width it has unhighlighted.
    const formula = story.querySelector(".lk-story-formula");
    if (formula) {
      const tokens = [...formula.querySelectorAll(".lk-token")];
      const tops = tokens.map((t) => Math.round(t.getBoundingClientRect().top));
      if (Math.max(...tops) - Math.min(...tops) > 4) out.header.push(`la ecuación se parte en ${new Set(tops).size} líneas`);
      const line = parseFloat(getComputedStyle(formula).lineHeight) || parseFloat(getComputedStyle(formula).fontSize) * 1.5;
      if (formula.clientHeight > line * 1.4) out.header.push(`la cabecera mide ${formula.clientHeight} px de alto para una línea de ${Math.round(line)} px`);
      const extent = () => tokens.length ? tokens[tokens.length - 1].getBoundingClientRect().right - tokens[0].getBoundingClientRect().left : 0;
      const focused = tokens.filter((t) => t.dataset.focus === "1");
      for (const t of focused) {
        const spacing = getComputedStyle(t).letterSpacing;
        if (spacing !== "normal" && parseFloat(spacing) !== 0) out.header.push(`el átomo resaltado «${t.textContent}» separa sus letras (${spacing})`);
      }
      if (focused.length) {
        const lit = extent();
        const was = focused.map((t) => t.className);
        focused.forEach((t) => { t.className = "lk-token"; delete t.dataset.focus; });
        const plain = extent();
        focused.forEach((t, i) => { t.className = was[i]; t.dataset.focus = "1"; });
        if (Math.abs(lit - plain) > Math.max(3, plain * 0.01)) out.header.push(`resaltar un grupo cambia el ancho de la ecuación: ${Math.round(plain)} → ${Math.round(lit)} px`);
      }
    }
    const chip = story.querySelector(".lk-story-narrator .lk-chip");
    if (chip && parseFloat(getComputedStyle(chip).fontSize) < 15) out.small.push("las fichas del narrador bajan de 15 px");
  }
  return out;
};

// The focus ids each step declares, read from the example's JSON, so the header
// highlight is checked against the step it belongs to.
const storyFocus = (markdown) => {
  const spec = JSON.parse(/<lk-story>[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/.exec(markdown)[1]);
  return spec.steps.map((step) => step.focus ?? []);
};

const STORY_EXAMPLES = [["formula-gaussiana", "formula-gaussiana.md"], ["derivacion-x", "derivacion-x.md"], ["propiedad-rust", "propiedad-rust.md"], ["prestamos-rust", "prestamos-rust.md"]];

for (const [name, file] of STORY_EXAMPLES) {
  test(`the ${name} walkthrough anchors every tag and moving term and keeps its labels at reading size, in every theme and width`, { skip: !playwright && "playwright not installed" }, async (t) => {
    mkdirSync(STORY_SHOTS, { recursive: true });
    const markdown = example(file);
    const focus = storyFocus(markdown);
    for (const { theme, size, width, wide } of STORY_MATRIX) {
      const page = await readerPart(t, markdown, { theme, width, wide });
      const story = page.locator("lk-story").first();
      await story.locator("svg").waitFor();
      const steps = await story.locator(".lk-story-seg").count();
      for (let s = 0; s < steps; s++) {
        if (s > 0) await story.getByRole("button", { name: "Paso siguiente" }).click();
        await story.locator(".lk-story-count").filter({ hasText: `${s + 1} / ${steps}` }).waitFor();
        await page.waitForTimeout(60);
        const seen = await story.evaluate(STORY_MEASURE, theme);
        const where = `${name} · ${theme} · ${size} · paso ${s + 1}`;
        assert.deepEqual(seen.empty, [], `${where}: el recorrido quedó sin dibujar`);
        assert.deepEqual(seen.missed, [], `${where}: un rótulo no termina en su pieza`);
        assert.deepEqual(seen.moves, [], `${where}: la flecha del término no empieza y termina en sus dos cajas medidas`);
        assert.deepEqual(seen.tiny, [], `${where}: una etiqueta se dibuja por debajo del tamaño de lectura`);
        assert.deepEqual(seen.scaled, [], `${where}: la figura creció por encima de su tope`);
        assert.deepEqual(seen.islands, [], `${where}: el recorrido no es una sola hoja (isla blanca o escenario que no llena la tarjeta)`);
        assert.deepEqual(seen.faint, [], `${where}: la tinta del escenario no se lee sobre el papel`);
        assert.deepEqual(seen.small, [], `${where}: el narrador o la cabecera bajan del tamaño de lectura`);
        assert.deepEqual(seen.header, [], `${where}: la cabecera se parte en dos líneas o el resaltado separa sus letras`);
        assert.deepEqual(seen.pieces, [], `${where}: una pieza, un ✓ o un ✗ queda fuera del lienzo, sin su actor o encima de otra pieza`);
        const focused = seen.focus.find((f) => f.step === s + 1)?.focused ?? [];
        assert.deepEqual(focused, focus[s], `${where}: la cabecera no resalta los átomos del paso`);
        // The story itself, never the full page: a full-page capture drags the fixed
        // progress bar and the wide-mode button into the middle of the figure.
        await story.screenshot({ path: join(STORY_SHOTS, `${name}-${theme}-${size}-paso-${s + 1}.png`) });
        if ((theme === "black" && wide) || (theme === "light" && !wide)) {
          await story.scrollIntoViewIfNeeded();
          await page.screenshot({ path: join(STORY_SHOTS, `${name}-${theme}-${size}-paso-${s + 1}-vista.png`) });
        }
      }
      await page.close();
    }
  });
}

// ── Visual pieces: verdict cards, memory, tables, sets (#218–#221) ───────────
// Each piece is drawn by the real reader in every theme and width, and measured
// with the same function the gates use (`measurePiece`): nothing off the canvas,
// no word over another, no connector that misses its cell or crosses a word, ink
// that reads on its paper, no white island on the night papers. A story that
// draws a piece is stepped, and every step is measured and photographed.
const PIECE_SHOTS = "/tmp/vp-shots";
const PIECE_MATRIX = [
  ...STORY_MATRIX,
  { theme: "light", size: "phone", width: 390, wide: false },
  { theme: "black", size: "phone", width: 390, wide: false },
];
const PIECE_HOSTS = "lk-cards, lk-memory, lk-tables, lk-venn";
// What each kind owes the learner beyond the generic measure.
const PIECE_ASSERTS = {
  "lk-memory": async (host, _size, where) => {
    const seen = await host.evaluate((node) => [...node.querySelectorAll(".lk-mstep")].map((step) => ({
      badge: step.querySelector(".lk-mbadge")?.textContent,
      code: Boolean(step.querySelector(".lk-mcode")?.textContent),
      live: step.querySelectorAll("svg path[data-from][data-to]").length,
      dead: step.querySelectorAll("svg path[data-from]:not([data-to])").length,
      crosses: step.querySelectorAll(".lk-mcross").length,
    })));
    assert.ok(seen.length >= 2, `${where}: the diagram has no steps`);
    seen.forEach((step, i) => {
      assert.equal(step.badge, String(i + 1), `${where}: step ${i + 1} is not numbered`);
      assert.ok(step.code, `${where}: step ${i + 1} does not repeat its code line`);
      assert.equal(step.crosses, step.dead, `${where}: step ${i + 1} has a dead pointer without its ✗`);
    });
  },
  "lk-cards": async (host, size, where) => {
    const seen = await host.evaluate((node) => {
      const cards = [...node.querySelectorAll(".lk-card")];
      const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
      const red = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(getComputedStyle(c).borderTopColor); return m ? +m[1] > +m[2] + 40 && +m[1] > +m[3] : false; };
      return { n: cards.length, distinctTops: new Set(tops).size, failing: cards.filter((c) => c.dataset.verdict === "no").map(red), passing: cards.filter((c) => c.dataset.verdict === "ok").map(red) };
    });
    assert.ok(seen.failing.every(Boolean) && !seen.passing.some(Boolean), `${where}: the failing card is not the only one tinted red`);
    if (seen.n >= 2) {
      if (size === "phone") assert.equal(seen.distinctTops, seen.n, `${where}: the cards do not stack on a phone`);
      else assert.ok(seen.distinctTops < seen.n, `${where}: the cards do not sit side by side`);
    }
  },
};
// Pieces the example draws: [selector, owner, how many steps to photograph].
const PIECE_EXAMPLES = [["prestamos-rust", "prestamos-rust.md"], ["memoria-string-rust", "memoria-string-rust.md"], ["sql-join-videojuegos", "sql-join-videojuegos.md"], ["sql-group-by", "sql-group-by.md"], ["sql-venn-joins", "sql-venn-joins.md"]];

for (const [name, file] of PIECE_EXAMPLES) {
  test(`the ${name} pieces pass the measure in every theme and width`, { skip: !playwright && "playwright not installed" }, async (t) => {
    mkdirSync(PIECE_SHOTS, { recursive: true });
    const markdown = example(file);
    for (const { theme, size, width, wide } of PIECE_MATRIX) {
      const page = await readerPart(t, markdown, { theme, width, wide });
      await page.locator(".lk-p, lk-story svg").first().waitFor();
      const hosts = page.locator(`${PIECE_HOSTS}, lk-story`);
      const count = await hosts.count();
      assert.ok(count > 0, `${name} · ${theme} · ${size}: the reader drew no piece`);
      for (let h = 0; h < count; h++) {
        const host = hosts.nth(h);
        const tag = await host.evaluate((node) => node.tagName.toLowerCase());
        const where = `${name} · ${theme} · ${size} · ${tag}`;
        if (tag === "lk-story") {
          const steps = await host.locator(".lk-story-seg").count();
          for (let s = 0; s < steps; s++) {
            if (s > 0) await host.getByRole("button", { name: "Paso siguiente" }).click();
            await host.locator(".lk-story-count").filter({ hasText: `${s + 1} / ${steps}` }).waitFor();
            await page.waitForTimeout(60);
            if (!(await host.locator(".lk-story-piece:visible").count())) continue;
            const { problems } = await host.evaluate(measurePiece);
            assert.deepEqual(problems, [], `${where} · paso ${s + 1}`);
            await host.screenshot({ path: join(PIECE_SHOTS, `${name}-${tag}-${theme}-${size}-paso-${s + 1}.png`) });
          }
        } else {
          await host.locator(".lk-p").first().waitFor();
          const { problems } = await host.evaluate(measurePiece);
          assert.deepEqual(problems, [], where);
          await PIECE_ASSERTS[tag]?.(host, size, where);
          await host.screenshot({ path: join(PIECE_SHOTS, `${name}-${tag}-${theme}-${size}.png`) });
        }
      }
      await page.close();
    }
  });
}

// A story that draws a piece also owns the whole screen: the piece grows with it and
// every step stays measured (nothing clipped by the full-screen stage).
test("full screen keeps every piece step inside the canvas and measured", { skip: !playwright && "playwright not installed" }, async (t) => {
  mkdirSync(PIECE_SHOTS, { recursive: true });
  for (const [name, file] of PIECE_EXAMPLES) {
    const markdown = example(file);
    const storyJson = /<lk-story>[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/.exec(markdown)?.[1];
    if (!storyJson || !JSON.parse(storyJson).steps.some((step) => ["cards", "memory", "tables", "venn"].some((k) => step.stage?.[k]))) continue;
    const page = await readerPart(t, markdown, { theme: "black", width: 1920, height: 1080, wide: true });
    const story = page.locator("lk-story").first();
    await story.locator(".lk-story-stage .lk-p").first().waitFor();
    const steps = await story.locator(".lk-story-seg").count();
    await story.evaluate((node) => node.requestFullscreen?.());
    await page.waitForFunction(() => document.fullscreenElement?.tagName === "LK-STORY");
    await page.waitForTimeout(250);
    for (let s = 0; s < steps; s++) {
      if (s > 0) await story.getByRole("button", { name: "Paso siguiente" }).click();
      await story.locator(".lk-story-count").filter({ hasText: `${s + 1} / ${steps}` }).waitFor();
      await page.waitForTimeout(120);
      const { problems } = await story.evaluate(measurePiece);
      assert.deepEqual(problems, [], `${name} · pantalla completa · paso ${s + 1}`);
      const clipped = await story.evaluate((node) => {
        const stage = node.querySelector(".lk-story-stage").getBoundingClientRect();
        const piece = node.querySelector(".lk-story-piece:not([hidden]) .lk-p").getBoundingClientRect();
        return piece.top < stage.top - 1 || piece.bottom > stage.bottom + 1 ? `la pieza mide ${Math.round(piece.height)} px en un escenario de ${Math.round(stage.height)} px` : "";
      });
      assert.equal(clipped, "", `${name} · pantalla completa · paso ${s + 1}`);
      await page.screenshot({ path: join(PIECE_SHOTS, `${name}-black-fullscreen-paso-${s + 1}.png`) });
    }
    await page.close();
  }
});

test("full screen grows every walkthrough and keeps their labels at reading size", { skip: !playwright && "playwright not installed" }, async (t) => {
  mkdirSync(STORY_SHOTS, { recursive: true });
  for (const [name, file] of STORY_EXAMPLES) {
    const page = await readerPart(t, example(file), { theme: "black", width: 1920, height: 1080, wide: true });
    const story = page.locator("lk-story").first();
    await story.locator("svg").waitFor();
    await story.getByRole("button", { name: "Paso siguiente" }).click();
    await page.waitForTimeout(80);
    await story.evaluate((node) => node.requestFullscreen?.());
    await page.waitForFunction(() => document.fullscreenElement?.tagName === "LK-STORY");
    await page.waitForTimeout(250);
    const full = await story.evaluate((node) => {
      const svg = node.querySelector("svg");
      const box = svg.getBoundingClientRect();
      const scale = svg.viewBox?.baseVal?.width ? box.width / svg.viewBox.baseVal.width : 1;
      const labels = [...node.querySelectorAll("svg text")].map((t) => ({
        text: t.textContent.trim(),
        px: (Number(t.getAttribute("font-size")) || 0) * scale,
      })).filter((l) => l.text);
      const html = [...node.querySelectorAll(".lk-story-formula, .lk-story-narrator, .lk-story-player")].map((el) => ({ text: el.className, px: parseFloat(getComputedStyle(el).fontSize) }));
      return { w: Math.round(box.width), h: Math.round(box.height), screen: [innerWidth, innerHeight], labels: [...labels, ...html] };
    });
    assert.ok(full.h >= full.screen[1] * 0.4 || full.w >= full.screen[0] * 0.4, `la figura no creció en pantalla completa: ${full.w}×${full.h} en ${full.screen.join("×")}`);
    const tiny = full.labels.filter((l) => l.px && l.px < 14);
    assert.deepEqual(tiny, [], `${name}: una etiqueta se dibuja por debajo del tamaño de lectura en pantalla completa`);
    await page.screenshot({ path: join(STORY_SHOTS, `${name}-black-fullscreen.png`) });
    await page.close();
  }
});

// The six icon kinds the kit draws: each one has to put visible ink on the
// stage in the reader, in every theme and width. The robot of «El problema que
// solo existe en el tiempo» was declared at x 8 with size 56, so half of it sat
// outside the viewBox and the SVG clipped it; the icon's default white fill on
// white paper left only a 2-unit outline. Both are fixed: the tone's soft fill
// and a centre kept inside the canvas.
test("all six icon kinds draw visible ink in the reader, in every theme and width", { skip: !playwright && "playwright not installed" }, async (t) => {
  mkdirSync(STORY_SHOTS, { recursive: true });
  const kinds = ["robot", "house", "doc", "person", "coin", "gear"];
  const spec = {
    viewBox: "0 0 760 200",
    title: "Los seis iconos",
    caption: "Cada icono dibuja su objeto con la tinta de su tono.",
    scene: { icons: kinds.map((kind, i) => ({ kind, id: kind, x: 70 + i * 124, y: 90, size: 56, tone: ["blue", "green", "amber", "red", "blue", "green"][i] })) },
  };
  const markdown = `# Los seis iconos\n\nUn icono se dibuja con la tinta de su tono.\n\n<lk-scene>\n<script type="application/json">\n${JSON.stringify(spec)}\n</script>\n</lk-scene>\n`;
  for (const { theme, size, width, wide } of STORY_MATRIX) {
    const page = await readerPart(t, markdown, { theme, width, wide });
    await page.locator("lk-scene svg").waitFor();
    const seen = await page.evaluate((kinds) => {
      const svg = document.querySelector("lk-scene svg");
      const vb = svg.viewBox.baseVal;
      return kinds.map((kind) => {
        const g = svg.querySelector(`[data-icon="${kind}"]`);
        if (!g) return { kind, why: "no se dibujó" };
        const b = g.getBBox();
        const inside = b.x >= vb.x - 1 && b.y >= vb.y - 1 && b.x + b.width <= vb.x + vb.width + 1 && b.y + b.height <= vb.y + vb.height + 1;
        const inked = [...g.querySelectorAll("circle, path, rect")].some((el) => {
          const fill = el.getAttribute("fill");
          const stroke = el.getAttribute("stroke");
          return (fill && fill !== "#ffffff" && fill !== "none") || (stroke && stroke !== "#ffffff" && stroke !== "none");
        });
        return { kind, w: b.width, h: b.height, inside, inked };
      });
    }, kinds);
    const where = `${theme} · ${size}`;
    assert.deepEqual(seen.filter((s) => s.why || s.w < 10 || s.h < 10), [], `${where}: un icono no dibuja tinta`);
    assert.deepEqual(seen.filter((s) => !s.inside), [], `${where}: un icono queda fuera del lienzo`);
    assert.deepEqual(seen.filter((s) => !s.inked), [], `${where}: un icono no tiene tinta`);
    await page.screenshot({ path: join(STORY_SHOTS, `iconos-${theme}-${size}.png`), fullPage: true });
    await page.close();
  }
});
