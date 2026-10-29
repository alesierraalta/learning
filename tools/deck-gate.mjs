// Real-browser gate for guided decks: every word must sit inside its container,
// no free label may cross a box, and an arrow's label must clear its shaft.
// Run before publishing a note:
//   node tools/deck-gate.mjs <note.md>
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerBridge } from '../integrations/pi/bridge.ts';
import { lintMarkdown, countDecks } from './deck-lint.mjs';

let playwright;
for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/home/alesierraalta/.npm-global/lib/node_modules/playwright/index.mjs'].filter(Boolean)) {
  try { playwright = await import(id); break; } catch {}
}
if (!playwright) {
  console.log('playwright is not installed: set PLAYWRIGHT_MODULE to its entry point');
  process.exit(2);
}
const { chromium } = playwright;

const file = process.argv[2];
if (!file) { console.log('usage: node tools/deck-gate.mjs <note.md>'); process.exit(2); }
// The structural rules come first: they are the same ones the studio enforces on save.
const noteText = readFileSync(file, 'utf8');
const structural = lintMarkdown(noteText);
if (structural.length) {
  console.log(JSON.stringify({ decks: countDecks(noteText), problems: structural.length, bad: structural }, null, 1));
  console.log('GATE FAILED');
  process.exit(1);
}
const browser = await chromium.launch();
const root = mkdtempSync(join(tmpdir(), 'gate-'));
mkdirSync(join(root, 'rapidos'), { recursive: true });
copyFileSync(file, join(root, 'rapidos', 'test.md'));
const tools = new Map();
registerBridge({ on() { return () => {}; }, registerTool(t) { tools.set(t.name, t); }, sendUserMessage() {} }, { root });
const base = (await tools.get('learning_view').execute('call', {}, undefined, undefined, { cwd: root })).structuredContent.base;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(base + 'rapidos/test');
const decks = page.locator('lk-walkthrough');
await decks.first().waitFor();
const total = await decks.count();
const bad = [];
for (let d = 0; d < total; d++) {
  const deck = decks.nth(d);
  const steps = await deck.locator('.lk-wt-dot').count();
  for (let s = 0; s < steps; s++) {
    await deck.locator('.lk-wt-dot').nth(s).click();
    await deck.locator('.lk-wt-count').filter({ hasText: `Paso ${s + 1} de` }).waitFor();
    const found = await deck.evaluate(node => {
      const stage = node.querySelector('.lk-wt-stage');
      const shown = el => el.closest('[data-step]')?.style.display !== 'none';
      const rects = [...stage.querySelectorAll('rect')].filter(r => shown(r) && r.getBBox().height >= 18)
        .map(r => ({ ...r.getBBox(), rb: r.getBoundingClientRect() }));
      // Every arrow, straight or bent, is measured along its own ink in screen coordinates:
      // bounding boxes live in each element's user space, so they cannot be compared across
      // groups.
      const point = (x, y, m) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
      const arrows = [...stage.querySelectorAll('line, path')].filter(el => shown(el) && !el.closest('marker')).map(el => {
        const m = el.getScreenCTM();
        if (!m) return null;
        const pts = [];
        if (el.tagName.toLowerCase() === 'line') {
          pts.push(point(Number(el.getAttribute('x1')), Number(el.getAttribute('y1')), m), point(Number(el.getAttribute('x2')), Number(el.getAttribute('y2')), m));
        } else {
          let len = 0;
          try { len = el.getTotalLength(); } catch { return null; }
          if (!len) return null;
          for (let at = 0; at <= len; at += 2) { const p = el.getPointAtLength(at); pts.push(point(p.x, p.y, m)); }
        }
        if (pts.length < 2) return null;
        // Both ends land on a box border, where a descender grazing the arrow is not a caption
        // sitting on it; the run that carries the caption is the middle.
        const runs = pts.filter(p => Math.hypot(p.x - pts[0].x, p.y - pts[0].y) > 5 && Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 5);
        return runs.length ? { pts: runs } : null;
      }).filter(Boolean);
      const texts = [...stage.querySelectorAll('text')].filter(shown).map(t => ({ el: t, b: t.getBBox(), box: t.getBoundingClientRect(), free: !t.dataset.fit, txt: t.textContent.trim() }));
      const out = [];
      for (const t of texts) {
        const cx = t.b.x + t.b.width / 2, cy = t.b.y + t.b.height / 2;
        const inside = rects.filter(r => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height);
        const host = inside.sort((a, b) => a.width * a.height - b.width * b.height)[0];
        if (!t.free && host) {
          const spill = Math.round(Math.max(host.x - t.b.x, t.b.x + t.b.width - (host.x + host.width), host.y - t.b.y, t.b.y + t.b.height - (host.y + host.height)));
          if (spill > 1) out.push({ kind: 'spill', over: spill, text: t.txt.slice(0, 28) });
        } else {
          // A free label belongs to no box: touching one is a collision, never a home.
          for (const r of rects) {
            const hit = Math.min(t.b.x + t.b.width, r.x + r.width) - Math.max(t.b.x, r.x);
            const vhit = Math.min(t.b.y + t.b.height, r.y + r.height) - Math.max(t.b.y, r.y);
            if (hit > 2 && vhit > 2) { out.push({ kind: 'label-over-box', over: Math.round(hit), text: t.txt.slice(0, 28) }); break; }
          }
        }
        // A label may never sit on the ink of an arrow: the caption would hide the very
        // direction the arrow exists to show.
        const ink = t.box;
        const near = (x, y) => x >= ink.x + 3 && x <= ink.x + ink.width - 3 && y >= ink.y + 3 && y <= ink.y + ink.height - 3;
        for (const a of arrows) {
          if (a.pts.some(p => near(p.x, p.y))) { out.push({ kind: 'text-over-arrow', over: 0, text: t.txt.slice(0, 28) }); break; }
        }
      }
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i].b, b = texts[j].b;
        const hit = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const vhit = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (hit > 2 && vhit > 2) out.push({ kind: 'text-over-text', over: Math.round(hit), text: `${texts[i].txt.slice(0, 14)} | ${texts[j].txt.slice(0, 14)}` });
      }
      return out;
    });
    for (const item of found) bad.push({ deck: d + 1, step: s + 1, ...item });
  }
}
await browser.close();
console.log(JSON.stringify({ decks: total, problems: bad.length, bad }, null, 1));
console.log(bad.length ? 'GATE FAILED' : 'GATE PASSED');
process.exit(bad.length ? 1 : 0);
