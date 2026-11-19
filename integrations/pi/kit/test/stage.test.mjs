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
    // Every upright prism is a silhouette a label must stay clear of. The
    // approved map draws room names on their own floor tiles; those are not
    // raised prisms and are measured by the S22 text gate instead.
    prisms: [...host.querySelectorAll('.lk-stage-actor path:not([data-prism="floor"]):not([data-prism="wall"])')].map((n, i) => ({ ...box(n), i, owner: n.closest('[data-actor]')?.dataset.actor })),
    // S20 measures the words, not the whole pill: the approved map draws the
    // room name on its floor and lets pill backgrounds cross empty space.
    labels: [...rects('.lk-stage-tag text'), ...rects('.lk-stage-lane-label text')],
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
      assert.equal(overlap(label, prism), false, `step ${step}: "${label.text}" sits on ${prism.owner}'s prism ${prism.i} at ${prism.x.toFixed(0)},${prism.y.toFixed(0)} (${label.x.toFixed(0)},${label.y.toFixed(0)})`);
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
  // The approved map reframes toward the active actor instead of keeping a
  // fixed overview, so actor spread and the old 12 px inset no longer describe
  // the picture. S21 is checked below as the figure's own width, and the S20
  // gate checks that every label stays inside the stage at every step.
  assert.ok(stage.w >= 1000, `step ${step}: the stage is only ${Math.round(stage.w)} px wide`);
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
        assert.ok(tag.rect.x >= stage.x - 1 && tag.rect.y >= stage.y - 1
          && tag.rect.x + tag.rect.w <= stage.x + stage.w + 1 && tag.rect.y + tag.rect.h <= stage.y + stage.h + 1,
        `step ${step}: ${tag.id}'s tag leaves the stage`);
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

// ---- S18-S22: the approved after-map picture gate, against the kit example ----
async function openAt1440() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message)));
  await page.goto(EXAMPLE);
  await page.waitForSelector('lk-stage[data-ready="true"]', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('lk-stage').scrollIntoView({ block: 'center' }));
  return page;
}

// Ports the meaningful gate-rules.mjs assertions: they measure what the reader
// sees (boxes, computed styles), never the author's spec or internal state.
const s22 = () => {
  const host = document.querySelector('lk-stage');
  const surface = host.querySelector('.lk-stage-surface');
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  };
  const rgbOf = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value || '');
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
    const hex = /^#([0-9a-f]{6})$/i.exec((value || '').trim());
    if (!hex) return null;
    const n = parseInt(hex[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  };
  const backdrop = rgbOf(getComputedStyle(host).getPropertyValue('--lk-stage-stage')) || { r: 230, g: 233, b: 226 };
  const alphaOf = (el) => {
    let a = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) a *= Number.parseFloat(getComputedStyle(n).opacity) || 1;
    return a;
  };
  const over = (c, a) => `rgb(${Math.round(c.r * a + backdrop.r * (1 - a))}, ${Math.round(c.g * a + backdrop.g * (1 - a))}, ${Math.round(c.b * a + backdrop.b * (1 - a))})`;
  const contrast = (a, b) => {
    const lum = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c) || [];
      const v = (m[1] || '').split(/[,\s]+/).map(Number).slice(0, 3).map((n) => {
        const s = n / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const pills = [...host.querySelectorAll('.lk-stage-tag, .lk-stage-lane-label')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => {
    const rect = el.querySelector('rect'), label = el.querySelector('text');
    const fill = rgbOf(getComputedStyle(rect).fill), ink = rgbOf(getComputedStyle(label).fill);
    const a = alphaOf(el), rb = rect.getBoundingClientRect(), tb = label.getBoundingClientRect();
    const fillColor = over(fill, a * fill.a), inkColor = over(ink, a * ink.a);
    return { text: label.textContent, opacity: a, ratio: contrast(inkColor, fillColor),
      padding: Math.round(Math.min(tb.left - rb.left, rb.right - tb.right, tb.top - rb.top, rb.bottom - tb.bottom)) };
  });
  const leafTexts = [...host.querySelectorAll('*')].filter((el) => {
    if (el.closest('script,style')) return false;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && el.getBoundingClientRect().width > 0;
  }).filter((el) => !el.parentElement || ![...host.querySelectorAll('*')].some((other) => other !== el && el.contains(other) && [...other.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())));
  const marks = [...host.querySelectorAll('[data-prism="1"], [data-vocab-sprite]')].filter((el) => el.getBoundingClientRect().width > 0);
  return {
    step: host.dataset.step,
    surface: box(surface), host: box(host),
    buttons: [...host.querySelectorAll('.lk-stage-player button')].map((b) => ({ text: b.textContent.trim(), visible: b.getBoundingClientRect().width > 0 })),
    dotsAreButtons: host.querySelectorAll('.lk-stage-dots button').length,
    forbidden: [...document.querySelectorAll('input,select,textarea,[role="slider"],[title],details,summary')].length,
    narrator: /Narrador/i.test(document.body.innerText) || [...document.querySelectorAll('[aria-label],[alt]')].some((el) => /Narrador/i.test((el.getAttribute('aria-label') || '') + (el.getAttribute('alt') || ''))),
    legend: /leyenda|color\s+(azul|verde|rojo)|azul\s*=\s*verde|verde\s*=\s*rojo/i.test(document.body.innerText),
    stripes: [...document.querySelectorAll('body *')].filter((el) => {
      const s = getComputedStyle(el);
      const left = Number.parseFloat(s.borderLeftWidth) || 0;
      return left > Math.max(...['borderTopWidth', 'borderRightWidth', 'borderBottomWidth'].map((k) => Number.parseFloat(s[k]) || 0)) + 1;
    }).map((el) => el.tagName + '.' + el.className),
    insets: [...document.querySelectorAll('body *')].filter((el) => /inset/i.test(getComputedStyle(el).boxShadow || '')).length,
    caption: host.querySelector('.lk-stage-caption')?.textContent.trim() || '',
    eyebrow: host.querySelectorAll('.lk-stage-panel-head, .lk-stage-eyebrow').length,
    pills,
    focuses: [...host.querySelectorAll('.lk-stage-focus')].map((el) => ({ box: box(el), target: el.dataset.target, color: getComputedStyle(el).outlineColor, width: getComputedStyle(el).outlineWidth })),
    cards: [...host.querySelectorAll('.lk-stage-fact[data-focused]')].map((el) => ({ box: box(el), target: 'fact:' + el.dataset.fact, tone: el.dataset.focused,
      borders: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((k) => getComputedStyle(el)[k]),
      color: getComputedStyle(el).borderTopColor, outline: getComputedStyle(el).outlineStyle })),
    texts: leafTexts.map((el) => ({ text: el.textContent.trim().slice(0, 40), box: box(el), font: getComputedStyle(el).fontFamily, svg: el.namespaceURI.includes('svg') })),
    marks: marks.map((el) => box(el)),
    lanes: [...host.querySelectorAll('.lk-stage-lane[data-lane]')].map((el) => {
      const p = el.querySelector('.lk-stage-lane-dashes');
      const end = p.getPointAtLength(p.getTotalLength());
      const at = new DOMPoint(end.x, end.y).matrixTransform(p.getScreenCTM());
      return { id: el.dataset.lane, end: { x: at.x, y: at.y } };
    }),
  };
};

const hit = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
const auditS22 = (seen, step, spec) => {
  assert.equal(seen.narrator, false, `step ${step}: visible or labelled "Narrador"`);
  assert.equal(seen.legend, false, `step ${step}: colour legend text`);
  assert.equal(seen.forbidden, 0, `step ${step}: forbidden controls`);
  assert.deepEqual(seen.stripes, [], `step ${step}: accent stripes`);
  assert.equal(seen.insets, 0, `step ${step}: inset accent stripes`);
  assert.equal(seen.dotsAreButtons, 0, `step ${step}: dots must be progress, not controls`);
  assert.equal(seen.eyebrow, 0, `step ${step}: panel heading is not a plain caption`);
  assert.equal(seen.caption, spec.caption, `step ${step}: plain caption is missing`);
  assert.deepEqual(seen.buttons.filter((b) => b.visible).map((b) => b.text), ['←', '→', '▶'], `step ${step}: player glyphs`);
  assert.ok(seen.surface.w >= 1000, `step ${step}: map is ${Math.round(seen.surface.w)} px wide (<1000) at 1440`);
  assert.ok(seen.host.h <= 860, `step ${step}: figure is ${Math.round(seen.host.h)} px tall (>860) at 1440x900`);
  for (const p of seen.pills) {
    assert.ok(p.ratio >= 4.5, `step ${step}: pill "${p.text}" contrast ${p.ratio.toFixed(2)} < 4.5 at opacity ${p.opacity}`);
    assert.ok(p.padding >= 6, `step ${step}: label "${p.text}" has ${p.padding}px pill padding`);
  }
  for (const t of seen.texts) {
    assert.match(t.font, /Atkinson Hyperlegible|Liberation Mono|DejaVu Sans Mono|Consolas|monospace/, `step ${step}: "${t.text}" uses ${t.font}`);
    if (t.svg) assert.ok(t.box.left >= seen.surface.left - 1 && t.box.right <= seen.surface.right + 1 && t.box.top >= seen.surface.top - 1 && t.box.bottom <= seen.surface.bottom + 1,
      `step ${step}: "${t.text}" escapes the stage`);
  }
  for (let i = 0; i < seen.texts.length; i += 1) {
    for (let j = i + 1; j < seen.texts.length; j += 1) {
      assert.equal(hit(seen.texts[i].box, seen.texts[j].box), false, `step ${step}: "${seen.texts[i].text}" intersects "${seen.texts[j].text}"`);
    }
    for (const mark of seen.marks) assert.equal(hit(seen.texts[i].box, mark), false, `step ${step}: "${seen.texts[i].text}" intersects a prism`);
  }
  for (const lane of seen.lanes) {
    const to = spec.actors.find((a) => a.id === spec.lanes.find((l) => l.id === lane.id).to);
    const targetBox = seen.actors?.[to?.id];
    assert.ok(targetBox === undefined || (lane.end.x >= targetBox.left - 8 && lane.end.x <= targetBox.right + 8 && lane.end.y >= targetBox.top - 8 && lane.end.y <= targetBox.bottom + 8),
      `step ${step}: lane ${lane.id} ends outside ${to?.id}`);
  }
  const focused = [...seen.focuses, ...seen.cards];
  assert.ok(focused.length >= 1 && focused.length <= 2, `step ${step}: ${focused.length} focus marks (expected 1-2)`);
  const COLORS = { look: 'rgb(0, 66, 118)', right: 'rgb(33, 89, 79)', wrong: 'rgb(221, 74, 104)' };
  for (const f of seen.focuses) {
    assert.equal(f.color, COLORS[f.tone] || COLORS.look, `step ${step}: focus ${f.target} colour ${f.color}`);
    assert.equal(f.width, '2px', `step ${step}: focus ${f.target} outline`);
    assert.ok(f.box.left >= seen.host.left - 1 && f.box.right <= seen.host.right + 1 && f.box.top >= seen.host.top - 1 && f.box.bottom <= seen.host.bottom + 1,
      `step ${step}: focus ${f.target} escapes the figure`);
  }
  for (const c of seen.cards) {
    assert.deepEqual(c.borders, ['2px', '2px', '2px', '2px'], `step ${step}: focused fact ${c.target} needs one border`);
    assert.equal(c.outline, 'none', `step ${step}: focused fact ${c.target} has a second outline`);
    assert.equal(c.color, COLORS[c.tone], `step ${step}: fact ${c.target} has the wrong focus colour`);
  }
  for (let i = 0; i < focused.length; i += 1) {
    for (let j = i + 1; j < focused.length; j += 1) {
      const x = focused[i].box, y = focused[j].box;
      assert.equal(hit(x, y), false, `step ${step}: focus marks ${focused[i].target}/${focused[j].target} overlap`);
      const nested = (a, b) => a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
      assert.equal(nested(x, y) || nested(y, x), false, `step ${step}: focus marks ${focused[i].target}/${focused[j].target} are nested`);
    }
  }
};

test('the figure leads the eye, uses only ← → ▶ and keeps every pill readable at 1440x900', { skip }, async () => {
  const page = await openAt1440();
  try {
    const spec = await page.evaluate(() => JSON.parse(document.querySelector('lk-stage script[type="application/json"]').textContent));
    assert.ok(spec.caption, 'the kit example must declare the plain caption');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await page.evaluate(() => document.querySelector('lk-stage').go(0, false));
      for (let step = 1; step <= spec.steps.length; step += 1) {
        if (step > 1) await page.evaluate((n) => document.querySelector('lk-stage').go(n - 1, false), step);
        const seen = await page.evaluate(s22);
        auditS22(seen, `${step}/${theme}`, spec);
      }
    }
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('▶ plays one step per tick and stops when clicked again; ← and → still work', { skip }, async () => {
  const page = await openAt1440();
  try {
    const count = () => page.locator('.lk-stage-count').textContent();
    assert.equal(await count(), '1/3');
    const play = page.getByRole('button', { name: 'Reproducir pasos' });
    await play.click();
    await page.waitForFunction(() => document.querySelector('lk-stage').dataset.step === '2', null, { timeout: 3000 });
    await play.click();
    await page.waitForTimeout(1400);
    assert.equal(await count(), '2/3', '▶ must stop on the second click');
    await page.getByRole('button', { name: 'Paso anterior' }).click();
    assert.equal(await count(), '1/3');
    await page.getByRole('button', { name: 'Paso siguiente' }).click();
    assert.equal(await count(), '2/3');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});
