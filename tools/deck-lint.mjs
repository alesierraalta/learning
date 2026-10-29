// Structural rules for guided decks, shared by the publishing gate and by the
// studio save path. It reads text only: no browser, no filesystem, no writes.
// The real-browser gate (tools/deck-gate.mjs) measures the same decks; this
// module is the fast check that can run on every save.

const CHAR = 0.56; // rough advance width of the deck font at 1em
const ARROW_LABEL_MAX = 30;
const LABEL_MAX = 46;
const TITLE_MAX = 42;
const TEXT_MAX = 190;
const MAX_WIDTH = 360;
const MIN_STEPS = 3;
const MAX_STEPS = 6;

// Every problem carries the deck it belongs to and, when it belongs to one, the
// step, so a caller can point the author at the exact scene.
const problem = (deck, step) => (kind, text) => ({ deck, step, kind, text });

export function lintMarkdown(text) {
  const problems = [];
  const blocks = [...String(text ?? '').matchAll(/<lk-walkthrough([^>]*)>([\s\S]*?)<\/lk-walkthrough>/g)];

  blocks.forEach(([, attrs, body], index) => {
    const deck = index + 1;
    const add = problem(deck, 0);
    if (!/lk-wt-compact/.test(attrs)) problems.push(add('attribute', 'missing class="lk-wt-compact"'));
    const json = body.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!json) {
      problems.push(add('payload', 'missing application/json payload'));
      return;
    }
    let spec;
    try {
      spec = JSON.parse(json[1]);
    } catch (error) {
      problems.push(add('payload', `invalid JSON: ${error.message}`));
      return;
    }
    const box = /^(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)$/.exec(spec.viewBox || '');
    if (!box) {
      problems.push(add('viewBox', 'viewBox must be "0 0 W H"'));
      return;
    }
    const width = Number(box[3]);
    const height = Number(box[4]);
    if (width > MAX_WIDTH) problems.push(add('viewBox', `viewBox width ${width} is too wide for lk-wt-compact; keep it at ${MAX_WIDTH} or less`));
    if (!spec.title) problems.push(add('title', 'missing deck title'));

    const steps = spec.steps ?? [];
    if (steps.length < MIN_STEPS) problems.push(add('steps', `${steps.length} steps; use at least ${MIN_STEPS}`));
    if (steps.length > MAX_STEPS) problems.push(add('steps', `${steps.length} steps; keep it at ${MAX_STEPS} or fewer`));

    steps.forEach((step, i) => {
      const at = problem(deck, i + 1);
      const tag = `step ${i + 1}`;
      if (!step.title) problems.push(at('step', `${tag}: missing title`));
      if (!step.text) problems.push(at('step', `${tag}: missing text`));
      if ((step.title || '').length > TITLE_MAX) problems.push(at('step', `${tag}: title too long`));
      if ((step.text || '').length > TEXT_MAX) problems.push(at('step', `${tag}: text too long (${step.text.length})`));

      const scene = step.scene ?? {};
      const boxes = scene.boxes ?? [];
      const arrows = scene.arrows ?? [];
      const labels = scene.labels ?? [];
      const grids = scene.grids ?? [];
      if (boxes.length === 0 && grids.length === 0) problems.push(at('scene', `${tag}: no boxes`));
      if (arrows.length === 0) problems.push(at('scene', `${tag}: no arrows`));

      arrows.forEach((a, k) => {
        const name = `arrow ${k + 1}`;
        if (!a.label) problems.push(at('arrow', `${tag}: ${name} has no label`));
        for (const key of ['x1', 'y1', 'x2', 'y2']) {
          if (typeof a[key] !== 'number') problems.push(at('arrow', `${tag}: ${name} missing ${key}`));
        }
        if (a.x1 === a.x2 && a.y1 === a.y2) problems.push(at('arrow', `${tag}: ${name} has zero length`));
        const mx = (a.x1 + a.x2) / 2;
        const my = (a.y1 + a.y2) / 2 - 14;
        for (const b of boxes) {
          if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) problems.push(at('arrow', `${tag}: ${name} label falls inside box "${b.label}"`));
        }
        if (a.label && a.label.length > ARROW_LABEL_MAX) problems.push(at('arrow', `${tag}: ${name} label too long (${a.label.length} > ${ARROW_LABEL_MAX})`));
      });

      boxes.forEach((b, k) => {
        const name = `box ${k + 1}`;
        for (const key of ['x', 'y', 'w', 'h']) {
          if (typeof b[key] !== 'number') problems.push(at('box', `${tag}: ${name} missing ${key}`));
        }
        if (!b.label) problems.push(at('box', `${tag}: ${name} has no label`));
        if (b.x < 0 || b.y < 0 || b.x + b.w > width || b.y + b.h > height) problems.push(at('box', `${tag}: box "${b.label}" leaves the viewBox`));
        const size = b.size ?? 26;
        const needed = (b.label || '').length * CHAR * size + 18;
        if (needed > b.w) problems.push(at('box', `${tag}: box "${b.label}" needs ${Math.round(needed)}px but has ${b.w}px at size ${size}`));
        if (b.sub && b.sub.length * CHAR * 22 + 18 > b.w) problems.push(at('box', `${tag}: box "${b.label}" sub-line too wide`));
        boxes.slice(k + 1).forEach((other) => {
          const apart = b.x + b.w <= other.x || other.x + other.w <= b.x || b.y + b.h <= other.y || other.y + other.h <= b.y;
          if (!apart) problems.push(at('box', `${tag}: boxes "${b.label}" and "${other.label}" overlap`));
        });
      });

      labels.forEach((l) => {
        if (!l.text) problems.push(at('label', `${tag}: empty label`));
        if (l.x < 0 || l.x > width || l.y < 0 || l.y > height) problems.push(at('label', `${tag}: label "${l.text}" leaves the viewBox`));
        if (l.text && l.text.length > LABEL_MAX) problems.push(at('label', `${tag}: label "${l.text.slice(0, 12)}…" too long (${l.text.length} > ${LABEL_MAX})`));
      });

      grids.forEach((g) => {
        if (g.x < 0 || g.x + (g.width ?? 560) > width) problems.push(at('grid', `${tag}: grid leaves the viewBox`));
      });
    });
  });

  return problems;
}

// The decks a note declares, for callers that need to say how many were checked.
export function countDecks(text) {
  return [...String(text ?? '').matchAll(/<lk-walkthrough[\s>]/g)].length;
}
