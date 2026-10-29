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
      const arrows = [...stage.querySelectorAll('line')].filter(shown).map(a => {
        const b = a.getBBox();
        // Only the shaft matters: the arrowhead is wide and a label beside it is fine.
        const x1 = Number(a.getAttribute('x1')), x2 = Number(a.getAttribute('x2'));
        return { shaft: x1 === x2, x: b.x, w: b.width, y: b.y, h: b.height };
      });
      const texts = [...stage.querySelectorAll('text')].filter(shown).map(t => ({ el: t, b: t.getBBox(), free: !t.dataset.fit, txt: t.textContent.trim() }));
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
        // An arrow's own label must sit clear of the shaft it names.
        for (const a of arrows) {
          const across = a.shaft ? (a.x >= t.b.x - 1 && a.x <= t.b.x + t.b.width + 1)
            : Math.min(t.b.x + t.b.width, a.x + a.w) - Math.max(t.b.x, a.x) > 6;
          const along = Math.min(t.b.y + t.b.height, a.y + a.h) - Math.max(t.b.y, a.y);
          if (across && along > 2) { out.push({ kind: 'text-over-arrow', over: Math.round(along), text: t.txt.slice(0, 28) }); break; }
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
