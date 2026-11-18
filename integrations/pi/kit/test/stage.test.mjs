// The robot story is the reference the learner chose: an isometric stage with
// base A's narration. This gate reads the real example in a real browser, the
// same way a part page will, and keeps the three defects of the prototype out.
//
// Uso: node --test integrations/pi/kit/test/stage.test.mjs
//      LK_STAGE_SHOTS=1 node --test ...   # also writes examples/lk-stage-robot/step-*.png
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = pathToFileURL(join(KIT, 'examples', 'lk-stage-robot.html')).href;
const SHOTS = process.env.LK_STAGE_SHOTS === '1';
const SHOT_DIR = join(KIT, 'examples', 'lk-stage-robot');
const LOCAL_CHROMIUM = '/home/ale/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

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
const launchOptions = existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {};
const browser = playwright ? await playwright.chromium.launch(launchOptions) : null;
after(() => browser?.close());

async function open() {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(EXAMPLE);
  await page.waitForSelector('lk-stage[data-ready="true"]', { timeout: 15000 });
  return page;
}

const next = (page) => page.getByRole('button', { name: 'Paso siguiente' }).click();
const settled = (page) => page.waitForFunction(() => document.querySelector('lk-stage')?.dataset.settled === 'true', null, { timeout: 3000 });

// Everything the gate asserts is measured on the boxes the reader sees, not on
// numbers hidden in the spec.
const inspect = () => {
  const host = document.querySelector('lk-stage');
  const spec = JSON.parse(host.querySelector('script[type="application/json"]').textContent);
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, text: node.textContent.trim() };
  };
  const rects = (selector) => [...host.querySelectorAll(selector)].map(box);
  return {
    counter: host.querySelector('.lk-stage-count').textContent.trim(),
    focus: host.querySelector('.lk-stage-question mark')?.textContent.trim() || '',
    expectedFocus: spec.focus,
    surface: rects('.lk-stage-surface')[0],
    actors: rects('[data-actor]'),
    active: rects('.lk-stage-actor.is-active')[0],
    // Every prism path is a projected silhouette a label must stay clear of.
    prisms: rects('.lk-stage-actor path'),
    labels: [...rects('.lk-stage-tag'), ...rects('.lk-stage-lane-label')],
    chips: [...host.querySelectorAll('.lk-stage-chip')].map((n) => ({ text: n.textContent.trim(), tone: n.className })),
    declaredIds: spec.actors.map((a) => a.id),
    declaredNames: spec.actors.map((a) => a.name),
    visibleText: [...host.querySelectorAll('text, span, strong, mark, button, p')].map((n) => n.textContent.trim()).join(' '),
  };
};

const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1
  && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

const assertStageGeometry = (seen, step) => {
  const stage = seen.surface;
  assert.ok(stage && seen.active && seen.prisms.length > 0, `step ${step}: the stage lost its measured pieces`);
  // The prototype's defect first: a pill drawn behind a prism is a failure even
  // if it is still readable in the markup.
  for (const label of seen.labels) {
    assert.ok(label.x >= stage.x - 2 && label.y >= stage.y - 2 && label.x + label.w <= stage.x + stage.w + 2 && label.y + label.h <= stage.y + stage.h + 2,
      `step ${step}: "${label.text}" leaves the stage`);
    for (const prism of seen.prisms) {
      assert.equal(overlap(label, prism), false, `step ${step}: "${label.text}" sits on a prism silhouette`);
    }
    for (const other of seen.labels) {
      if (other === label) continue;
      assert.equal(overlap(label, other), false, `step ${step}: "${label.text}" overlaps "${other.text}"`);
    }
  }
  const activeX = seen.active.x + seen.active.w / 2, activeY = seen.active.y + seen.active.h / 2;
  const stageX = stage.x + stage.w / 2, stageY = stage.y + stage.h / 2;
  assert.ok(Math.abs(activeX - stageX) <= stage.w * 0.12 && Math.abs(activeY - stageY) <= stage.h * 0.12,
    `step ${step}: active actor is off centre by ${(activeX - stageX).toFixed(1)}×${(activeY - stageY).toFixed(1)} px`);
  const pieces = [...seen.actors, ...seen.labels];
  const occupied = {
    x0: Math.min(...pieces.map((p) => p.x)), x1: Math.max(...pieces.map((p) => p.x + p.w)),
    y0: Math.min(...pieces.map((p) => p.y)), y1: Math.max(...pieces.map((p) => p.y + p.h)),
  };
  assert.ok((occupied.x1 - occupied.x0) / stage.w >= 0.55,
    `step ${step}: the actors and labels fill only ${Math.round((occupied.x1 - occupied.x0) / stage.w * 100)}% of the stage width`);
};

test('the robot example draws four declared actors, narration and a working player', { skip }, async () => {
  const page = await open();
  try {
    const first = await page.evaluate(inspect);
    assert.deepEqual(page.errors, [], 'the page must not raise a browser error');
    const names = await page.evaluate(() => [...document.querySelectorAll('lk-stage [data-tag] text')]
      .map((n) => n.textContent.trim()));
    assert.equal(names.length, 4, `expected four actors, saw ${names.length}`);
    assert.deepEqual([...names].sort(), [...first.declaredNames].sort());
    assert.equal(names.includes('Pared'), false, 'the prototype\'s decorative wall is gone');
    const ids = await page.evaluate(() => [...document.querySelectorAll('lk-stage [data-actor]')].map((g) => g.dataset.actor));
    assert.deepEqual([...ids].sort(), [...first.declaredIds].sort(), 'no actor outside the spec is drawn');

    assert.equal(first.counter, '1/3');
    assert.equal(first.focus, first.expectedFocus, 'the question highlights its declared word');
    assert.ok(first.chips.length > 0, 'the narrator has coloured chips');
    assert.ok(first.chips.some((c) => c.text === '4 % de batería'), 'the prototype\'s chip copy survives');
    assert.ok(first.chips.some((c) => /good|warn|bad|info|neutral/.test(c.tone)), 'chips carry a tone');
    assert.deepEqual(first.visibleText.match(/\b[A-F][1-5]\b/g) || [], [], 'no cell code is shown to the reader');

    for (const [step, counter] of [[1, '1/3'], [2, '2/3'], [3, '3/3']]) {
      if (step > 1) { await next(page); await settled(page); }
      const seen = await page.evaluate(inspect);
      assert.equal(seen.counter, counter, `step ${step} counter is ${seen.counter}`);
      assert.deepEqual(page.errors, [], 'step changes must not raise a browser error');
      assertStageGeometry(seen, step);
    }
  } finally {
    await page.close();
  }
});

// The previous gate measured collisions, not whether the picture still reads.
// These assertions are deliberately about the drawing a learner sees.
const picture = () => {
  const host = document.querySelector('lk-stage');
  const svg = host.querySelector('svg');
  const spec = JSON.parse(host.querySelector('script[type="application/json"]').textContent);
  const rect = (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  const surface = rect(host.querySelector('.lk-stage-surface'));
  const point = (path, length) => {
    const p = path.getPointAtLength(length), m = path.getScreenCTM();
    const at = p.matrixTransform(m);
    return { x: at.x, y: at.y };
  };
  const actors = [...host.querySelectorAll('[data-actor]')];
  const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const byActor = Object.fromEntries(actors.map((g) => [g.dataset.actor, { rect: rect(g), centre: centre(rect(g)) }]));
  const pills = [...host.querySelectorAll('.lk-stage-lane-label')];
  const lanes = [...host.querySelectorAll('[data-lane] .lk-stage-lane-dashes')].map((path, i) => {
    const style = getComputedStyle(path), length = path.getTotalLength();
    const samples = Array.from({ length: 25 }, (_, j) => point(path, length * j / 24));
    let opacity = parseFloat(style.opacity);
    for (let parent = path.parentElement; parent; parent = parent.parentElement) {
      opacity *= parseFloat(getComputedStyle(parent).opacity);
    }
    return {
      from: spec.lanes[i].from, to: spec.lanes[i].to, text: pills[i]?.textContent.trim() || '',
      dash: style.strokeDasharray, opacity, stroke: parseFloat(style.strokeWidth),
      start: point(path, 0), end: point(path, length), samples, pill: pills[i] ? rect(pills[i]) : null,
    };
  });
  const prismPoints = Object.fromEntries(actors.map((g) => [g.dataset.actor,
    [...g.querySelectorAll('[data-prism]')].flatMap((path) => {
      const length = path.getTotalLength();
      return Array.from({ length: 24 }, (_, i) => point(path, length * i / 23));
    }),
  ]));
  const tags = [...host.querySelectorAll('.lk-stage-tag')].map((tag) => {
    const actor = tag.dataset.tag, group = actors.find((g) => g.dataset.actor === actor);
    const top = group?.querySelectorAll('path')[2];
    return { id: actor, rect: rect(tag), top: top ? rect(top) : null };
  });
  return {
    surface, tile: 150 * surface.w / vb[2], lanes, tags, prisms: prismPoints,
    actors: Object.fromEntries(Object.entries(byActor).map(([id, a]) => [id, a.rect])),
    centres: Object.fromEntries(Object.entries(byActor).map(([id, a]) => [id, a.centre])),
    cells: spec.actors.map((a) => a.cell),
  };
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const distanceToRect = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h));
const distanceToPath = (p, points) => Math.min(...points.map((q) => distance(p, q)));
const pointGap = (a, b) => Math.min(...a.flatMap((p) => b.map((q) => distance(p, q))));

test('the picture keeps lanes, spacing, attached labels and constant type at every step', { skip }, async () => {
  const page = await open();
  const tagHeights = new Map();
  try {
    for (let step = 1; step <= 3; step += 1) {
      if (step > 1) { await next(page); await settled(page); }
      const seen = await page.evaluate(picture);
      const stage = seen.surface;

      for (const lane of seen.lanes) {
        assert.ok(lane.dash && lane.dash !== 'none', `step ${step}: ${lane.text} has no dashed lane`);
        assert.ok(lane.opacity >= 0.35 && lane.stroke >= 1, `step ${step}: ${lane.text}'s lane is invisible`);
        assert.ok(distance(lane.start, seen.centres[lane.from]) <= seen.tile,
          `step ${step}: ${lane.text} starts ${distance(lane.start, seen.centres[lane.from]).toFixed(0)}px from ${lane.from}`);
        assert.ok(distance(lane.end, seen.centres[lane.to]) <= seen.tile,
          `step ${step}: ${lane.text} ends ${distance(lane.end, seen.centres[lane.to]).toFixed(0)}px from ${lane.to}`);
        assert.ok(lane.pill && distanceToPath({ x: lane.pill.x + lane.pill.w / 2, y: lane.pill.y + lane.pill.h / 2 }, lane.samples) <= lane.pill.h / 2 + 4,
          `step ${step}: ${lane.text} does not touch its lane`);
      }

      for (const tag of seen.tags) {
        const middle = { x: tag.rect.x + tag.rect.w / 2, y: tag.rect.y + tag.rect.h / 2 };
        assert.ok(tag.top && distanceToRect(middle, tag.top) <= seen.tile * 1.5,
          `step ${step}: ${tag.id}'s tag is detached from its top face`);
        assert.ok(tag.rect.x >= stage.x + 12 && tag.rect.y >= stage.y + 12
          && tag.rect.x + tag.rect.w <= stage.x + stage.w - 12 && tag.rect.y + tag.rect.h <= stage.y + stage.h - 12,
        `step ${step}: ${tag.id}'s tag is closer than 12px to the stage edge`);
        if (!tagHeights.has(tag.id)) tagHeights.set(tag.id, []);
        tagHeights.get(tag.id).push(tag.rect.h);
      }

      const cells = seen.cells.map((cell) => [cell.charCodeAt(0) - 65, Number(cell[1]) - 1]);
      for (let i = 0; i < cells.length; i += 1) {
        for (let j = i + 1; j < cells.length; j += 1) {
          const gap = Math.max(Math.abs(cells[i][0] - cells[j][0]), Math.abs(cells[i][1] - cells[j][1]));
          assert.ok(gap > 1, `actors ${seen.cells[i]} and ${seen.cells[j]} occupy adjacent cells`);
        }
      }
      const ids = Object.keys(seen.actors);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          assert.ok(pointGap(seen.prisms[ids[i]], seen.prisms[ids[j]]) >= 4,
            `step ${step}: ${ids[i]} and ${ids[j]} have no visible gap`);
        }
      }
    }
    for (const [id, heights] of tagHeights) {
      const ratio = Math.max(...heights) / Math.min(...heights);
      assert.ok(ratio < 1.1, `${id}'s tag changes ${Math.round((ratio - 1) * 100)}% on screen with the zoom`);
    }
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('an invalid spec shows its located error instead of a broken figure', { skip }, async () => {
  const page = await open();
  try {
    await page.evaluate(() => {
      const spec = JSON.parse(document.querySelector('lk-stage script[type="application/json"]').textContent);
      spec.steps[0].activeActor = 'robo';
      const script = document.createElement('script');
      script.type = 'application/json';
      script.textContent = JSON.stringify(spec);
      const bad = document.createElement('lk-stage');
      bad.append(script);
      document.querySelector('main').append(bad);
    });
    await page.waitForSelector('lk-stage[data-ready="error"]');
    const invalid = page.locator('lk-stage[data-ready="error"]');
    assert.equal(await invalid.locator('.lk-stage-error').textContent(), 'steps[0].activeActor: "robo" is not an actor');
    assert.equal(await invalid.locator('svg').count(), 0, 'an invalid spec draws no broken figure');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('arrow keys move the focused stage, not the whole page', { skip }, async () => {
  const page = await open();
  try {
    await page.locator('lk-stage').focus();
    await page.keyboard.press('ArrowRight');
    await settled(page);
    assert.equal(await page.locator('.lk-stage-count').textContent(), '2/3');
    await page.keyboard.press('ArrowLeft');
    await settled(page);
    assert.equal(await page.locator('.lk-stage-count').textContent(), '1/3');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('captures the three settled steps at 1600x900 and DPR 2', { skip: skip ? 'playwright is not installed' : (!SHOTS && 'set LK_STAGE_SHOTS=1'), timeout: 60000 }, async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const page = await open();
  try {
    for (let step = 1; step <= 3; step += 1) {
      await settled(page);
      await page.screenshot({ path: join(SHOT_DIR, `step-${step}.png`), animations: 'disabled' });
      if (step < 3) await next(page);
    }
    assert.deepEqual(page.errors, [], 'a screenshot run must not hide browser errors');
  } finally {
    await page.close();
  }
});
