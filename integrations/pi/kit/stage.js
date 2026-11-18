/* lk-stage — a declared isometric stage. Plain browser JavaScript, no build step.
   The validator is deliberately DOM-free so scene-lint and node:test can use it. */
(function (global) {
  'use strict';

  const KINDS = ['robot', 'room', 'charger', 'block'];
  const FACT_TONES = ['neutral', 'good', 'bad', 'warn'];
  const CHIP_TONES = ['neutral', 'good', 'bad', 'warn', 'info'];
  const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ROWS = [1, 2, 3, 4, 5];
  const ROOT_KEYS = ['title', 'question', 'focus', 'actors', 'lanes', 'steps'];
  const ACTOR_KEYS = ['id', 'kind', 'cell', 'name', 'color'];
  const LANE_KEYS = ['id', 'from', 'to', 'verb', 'identity'];
  const STEP_KEYS = ['activeActor', 'highlightLane', 'battery', 'facts', 'narrator'];
  const FACT_KEYS = ['identity', 'label', 'value', 'tone'];
  const WORLD = { w: 1200, h: 700 };
  const HALF = { w: 75, h: 39 };
  const ORIGIN = { x: 580, y: 170 };
  const EASE_MS = 420;
  const NS = 'http://www.w3.org/2000/svg';

  class StageSpecError extends Error {
    constructor(message) { super(message); this.name = 'StageSpecError'; }
  }

  const shown = (value) => {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  };
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const fail = (path, message) => { throw new StageSpecError(`${path}: ${message}`); };

  function knownKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(path ? `${path}.${key}` : key, `unknown key "${key}"`);
    }
  }

  // Coordinates are never authored. A stray x/y is refused wherever it hides,
  // before the shape-specific vocabulary is checked.
  function noCoordinates(value, path) {
    if (Array.isArray(value)) {
      value.forEach((item, i) => noCoordinates(item, `${path}[${i}]`));
    } else if (object(value)) {
      for (const [key, item] of Object.entries(value)) {
        const at = path ? `${path}.${key}` : key;
        if (key === 'x' || key === 'y') fail(at, `unknown key "${key}"`);
        noCoordinates(item, at);
      }
    }
  }

  function chipsOf(line, path) {
    const pattern = /\[([^\]|]+)\|([^\]]+)\]/g;
    let cursor = 0, match;
    while ((match = pattern.exec(line)) !== null) {
      if (/[\[\]]/.test(line.slice(cursor, match.index))) fail(path, 'malformed chip');
      const tone = match[2].trim();
      if (!CHIP_TONES.includes(tone)) fail(path, `${shown(tone)} is not a tone`);
      cursor = match.index + match[0].length;
    }
    if (/[\[\]]/.test(line.slice(cursor))) fail(path, 'malformed chip');
  }

  /** Pure S4 validation: returns a fresh, complete spec or throws a located error. */
  function validate(spec) {
    if (!object(spec)) fail('spec', 'expected an object');
    noCoordinates(spec, '');
    knownKeys(spec, ROOT_KEYS, '');
    if (!text(spec.question)) fail('question', 'expected a non-empty string');
    if (!text(spec.focus)) fail('focus', 'expected a non-empty string');
    if (spec.title !== undefined && !text(spec.title)) fail('title', 'expected a non-empty string');
    if (spec.question.toLowerCase().indexOf(spec.focus.toLowerCase()) < 0) {
      fail('focus', `${shown(spec.focus)} is not in the question`);
    }
    if (!Array.isArray(spec.actors) || spec.actors.length === 0) fail('actors', 'expected a non-empty array');
    if (!Array.isArray(spec.lanes)) fail('lanes', 'expected an array');
    if (!Array.isArray(spec.steps) || spec.steps.length === 0) fail('steps', 'expected a non-empty array');

    const actors = [], ids = new Set();
    for (const [i, raw] of spec.actors.entries()) {
      const at = `actors[${i}]`;
      if (!object(raw)) fail(at, 'expected an object');
      knownKeys(raw, ACTOR_KEYS, at);
      if (!text(raw.id)) fail(`${at}.id`, `${shown(raw.id)} is not an id`);
      if (ids.has(raw.id)) fail(`${at}.id`, `${shown(raw.id)} is a duplicate id`);
      if (!KINDS.includes(raw.kind)) fail(`${at}.kind`, `${shown(raw.kind)} is not a kind`);
      if (typeof raw.cell !== 'string' || !/^[A-F][1-5]$/.test(raw.cell)) fail(`${at}.cell`, `${shown(raw.cell)} is not a cell`);
      if (!text(raw.name)) fail(`${at}.name`, `${shown(raw.name)} is not a name`);
      if (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) fail(`${at}.color`, `${shown(raw.color)} is not a colour`);
      ids.add(raw.id);
      actors.push({ ...raw });
    }
    const actor = (value, at) => {
      if (!ids.has(value)) fail(at, `${shown(value)} is not an actor`);
      return value;
    };

    const lanes = [], laneIds = new Set();
    for (const [i, raw] of spec.lanes.entries()) {
      const at = `lanes[${i}]`;
      if (!object(raw)) fail(at, 'expected an object');
      knownKeys(raw, LANE_KEYS, at);
      if (!text(raw.id)) fail(`${at}.id`, `${shown(raw.id)} is not an id`);
      if (laneIds.has(raw.id)) fail(`${at}.id`, `${shown(raw.id)} is a duplicate id`);
      actor(raw.from, `${at}.from`);
      actor(raw.to, `${at}.to`);
      if (!text(raw.verb)) fail(`${at}.verb`, `${shown(raw.verb)} is not a verb`);
      actor(raw.identity, `${at}.identity`);
      laneIds.add(raw.id);
      lanes.push({ ...raw });
    }
    const lane = (value, at) => {
      if (value !== null && !laneIds.has(value)) fail(at, `${shown(value)} is not a lane`);
      return value;
    };

    const steps = [];
    for (const [i, raw] of spec.steps.entries()) {
      const at = `steps[${i}]`;
      if (!object(raw)) fail(at, 'expected an object');
      knownKeys(raw, STEP_KEYS, at);
      actor(raw.activeActor, `${at}.activeActor`);
      lane(raw.highlightLane === undefined ? null : raw.highlightLane, `${at}.highlightLane`);
      if (raw.battery !== undefined && (typeof raw.battery !== 'number' || !Number.isFinite(raw.battery) || raw.battery < 0 || raw.battery > 100)) {
        fail(`${at}.battery`, `${shown(raw.battery)} is not a battery level`);
      }
      if (!Array.isArray(raw.facts)) fail(`${at}.facts`, 'expected an array');
      const facts = raw.facts.map((fact, j) => {
        const where = `${at}.facts[${j}]`;
        if (!object(fact)) fail(where, 'expected an object');
        knownKeys(fact, FACT_KEYS, where);
        actor(fact.identity, `${where}.identity`);
        if (!text(fact.label)) fail(`${where}.label`, `${shown(fact.label)} is not a label`);
        if (!text(fact.value) && !(typeof fact.value === 'number' && Number.isFinite(fact.value))) {
          fail(`${where}.value`, `${shown(fact.value)} is not a value`);
        }
        if (!FACT_TONES.includes(fact.tone)) fail(`${where}.tone`, `${shown(fact.tone)} is not a tone`);
        return { ...fact };
      });
      if (!Array.isArray(raw.narrator) || raw.narrator.length === 0) fail(`${at}.narrator`, 'expected a non-empty array');
      const narrator = raw.narrator.map((line, j) => {
        const where = `${at}.narrator[${j}]`;
        if (!text(line)) fail(where, `${shown(line)} is not a narrator line`);
        chipsOf(line, where);
        return line;
      });
      steps.push({ ...raw, highlightLane: raw.highlightLane ?? null, facts, narrator });
    }
    return { title: spec.title || '', question: spec.question, focus: spec.focus, actors, lanes, steps };
  }

  // ---------- Drawing helpers ----------
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const point = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const fmt = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  const mix = (hex, target, amount) => {
    const a = parseInt(hex.slice(1), 16), b = parseInt(target.slice(1), 16);
    const channel = (shift) => Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, amount));
    return '#' + [channel(16), channel(8), channel(0)].map((n) => n.toString(16).padStart(2, '0')).join('');
  };
  const light = (hex) => mix(hex, '#FFFFFF', 0.22);
  const dark = (hex) => mix(hex, '#101A24', 0.28);

  function element(tag, value, attrs = {}) {
    const node = global.document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    for (const [key, item] of Object.entries(attrs)) node.setAttribute(key, item);
    return node;
  }
  function graphic(tag, attrs = {}, value) {
    const node = global.document.createElementNS(NS, tag);
    for (const [key, item] of Object.entries(attrs)) node.setAttribute(key, item);
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function polygon(points, rounding = 0) {
    if (!rounding) return 'M' + points.map(fmt).join(' L') + ' Z';
    return points.map((current, i) => {
      const prev = points[(i - 1 + points.length) % points.length], next = points[(i + 1) % points.length];
      const a = point(current, prev, rounding), b = point(current, next, rounding);
      return (i === 0 ? 'M' : ' L') + fmt(a) + ' Q' + fmt(current) + ' ' + fmt(b);
    }).join('') + ' Z';
  }
  function center(cell) {
    const match = /^([A-F])([1-5])$/.exec(cell || '');
    const column = COLUMNS.indexOf(match?.[1]), row = ROWS.indexOf(Number(match?.[2]));
    return { x: ORIGIN.x + (column - row) * HALF.w, y: ORIGIN.y + (column + row) * HALF.h };
  }
  function diamond(cx, cy, scale = 1) {
    const w = HALF.w * scale, h = HALF.h * scale;
    return [{ x: cx, y: cy - h }, { x: cx + w, y: cy }, { x: cx, y: cy + h }, { x: cx - w, y: cy }];
  }
  function prism(parent, options) {
    const { cx, cy, scale, height, color, rounded = false } = options;
    const base = diamond(cx, cy, scale), top = base.map((p) => ({ x: p.x, y: p.y - height }));
    const stroke = 'rgba(12,24,38,.32)';
    const left = graphic('path', { d: polygon([top[3], top[2], base[2], base[3]]), fill: color, stroke, 'stroke-width': 1, 'data-prism': '1' });
    const right = graphic('path', { d: polygon([top[2], top[1], base[1], base[2]]), fill: dark(color), stroke, 'stroke-width': 1, 'data-prism': '1' });
    const crown = graphic('path', { d: polygon(top, rounded ? 0.16 : 0), fill: light(color), stroke: 'rgba(255,255,255,.24)', 'stroke-width': 1, 'data-prism': '1' });
    parent.append(left, right, crown);
    return { base, top };
  }
  function facePoint(faces, u, v) {
    return point(point(faces.top[2], faces.top[1], u), point(faces.base[2], faces.base[1], u), v);
  }
  function facePolygon(faces, coords) {
    return polygon(coords.map(([u, v]) => facePoint(faces, u, v)));
  }
  function topPoint(faces, u, v) {
    const scale = (faces.top[1].x - faces.top[3].x) / (2 * HALF.w);
    const h = (faces.top[2].y - faces.top[0].y) / 2;
    return {
      x: (faces.top[1].x + faces.top[3].x) / 2 + (u - v) * HALF.w * scale,
      y: (faces.top[1].y + faces.top[3].y) / 2 + (u + v) * h,
    };
  }
  function topPolygon(faces, coords) {
    return polygon(coords.map(([u, v]) => topPoint(faces, u, v)));
  }
  function shadow(parent, gradientId, scale = 0.8) {
    parent.append(graphic('ellipse', {
      cx: 0, cy: HALF.h * 0.24, rx: HALF.w * scale, ry: HALF.h * 0.72 * scale,
      fill: `url(#${gradientId})`, class: 'lk-stage-shadow',
    }));
  }

  const LIFT = { robot: 90, room: 48, charger: 124, block: 92 };

  function drawKind(wrapper, actor, uid, defs) {
    const color = actor.color;
    if (actor.kind === 'robot') {
      shadow(wrapper, uid + '-shadow', 0.7);
      const faces = prism(wrapper, { cx: 0, cy: 0, scale: 0.56, height: 46, color, rounded: true });
      wrapper.append(graphic('path', {
        d: facePolygon(faces, [[0.16, 0.3], [0.82, 0.3], [0.82, 0.76], [0.16, 0.76]]),
        fill: '#102435', stroke: light(color), 'stroke-width': 1.4,
      }));
      [[0.36, 0.52], [0.62, 0.52]].forEach(([u, v]) => {
        const eye = facePoint(faces, u, v);
        wrapper.append(graphic('circle', { cx: eye.x.toFixed(1), cy: eye.y.toFixed(1), r: 2.4, fill: '#E4F4FF' }));
      });
      wrapper.append(graphic('path', {
        d: topPolygon(faces, [[-0.72, -0.26], [0.72, -0.26], [0.72, 0.26], [-0.72, 0.26]]),
        fill: 'rgba(9,22,36,.72)', stroke: light(color), 'stroke-width': 1,
      }));
      for (let i = 0; i < 4; i += 1) {
        const from = -0.64 + i * 0.32;
        wrapper.append(graphic('path', {
          class: 'lk-stage-battery-cell', 'data-index': i,
          d: topPolygon(faces, [[from, -0.16], [from + 0.27, -0.16], [from + 0.27, 0.16], [from, 0.16]]),
          fill: light(color),
        }));
      }
      const antenna = topPoint(faces, 0, 0);
      wrapper.append(graphic('line', { x1: antenna.x.toFixed(1), y1: (antenna.y - 1).toFixed(1), x2: antenna.x.toFixed(1), y2: (antenna.y - 15).toFixed(1), stroke: light(color), 'stroke-width': 2, 'stroke-linecap': 'round' }));
      wrapper.append(graphic('circle', { cx: antenna.x.toFixed(1), cy: (antenna.y - 17).toFixed(1), r: 3, fill: light(color) }));
      return;
    }
    if (actor.kind === 'room') {
      shadow(wrapper, uid + '-shadow', 0.95);
      const faces = prism(wrapper, { cx: 0, cy: 0, scale: 0.92, height: 10, color });
      const clipId = uid + '-dirt';
      const clip = graphic('clipPath', { id: clipId }, polygon(faces.top));
      defs.append(clip);
      const dirt = graphic('g', { 'clip-path': `url(#${clipId})`, class: 'lk-stage-dirt' }, undefined);
      [[-0.5, 0.1, 7, 3.4], [-0.24, -0.34, 5, 2.6], [0.16, 0.34, 8, 3.6], [0.46, -0.12, 6, 2.8], [0.66, 0.26, 4.5, 2.2], [-0.02, -0.05, 4, 2]].forEach(([u, v, rx, ry], i) => {
        const spot = topPoint(faces, u, v);
        dirt.append(graphic('ellipse', { cx: spot.x.toFixed(1), cy: spot.y.toFixed(1), rx, ry, fill: i % 2 ? '#8C5B2C' : '#795024', opacity: 0.62 }));
      });
      wrapper.append(dirt);
      return;
    }
    if (actor.kind === 'charger') {
      shadow(wrapper, uid + '-shadow', 0.7);
      const faces = prism(wrapper, { cx: 0, cy: 0, scale: 0.46, height: 92, color });
      wrapper.append(graphic('path', {
        d: facePolygon(faces, [[0.18, 0.16], [0.78, 0.16], [0.78, 0.86], [0.18, 0.86]]),
        fill: 'rgba(8,29,27,.68)', stroke: light(color), 'stroke-width': 1.2,
      }));
      const bolt = [[0.54, 0.22], [0.31, 0.55], [0.48, 0.55], [0.39, 0.81], [0.68, 0.45], [0.5, 0.45]].map(([u, v]) => facePoint(faces, u, v));
      wrapper.append(graphic('path', { d: polygon(bolt), fill: '#FFE28A', stroke: '#FFF3C4', 'stroke-width': 0.8 }));
      const cap = topPoint(faces, 0, 0);
      wrapper.append(graphic('ellipse', { cx: cap.x.toFixed(1), cy: cap.y.toFixed(1), rx: 11, ry: 4.5, fill: 'rgba(255,255,255,.35)' }));
      return;
    }
    shadow(wrapper, uid + '-shadow', 0.72);
    const faces = prism(wrapper, { cx: 0, cy: 0, scale: 0.58, height: 60, color });
    wrapper.append(graphic('path', { d: facePolygon(faces, [[0.2, 0.28], [0.8, 0.28], [0.8, 0.72], [0.2, 0.72]]), fill: 'rgba(11,20,34,.32)' }));
    const cap = topPoint(faces, 0, 0);
    wrapper.append(graphic('ellipse', { cx: cap.x.toFixed(1), cy: cap.y.toFixed(1), rx: 8, ry: 3.5, fill: 'rgba(255,255,255,.16)' }));
  }

  // ---------- Computed placement (S3: the spec has no coordinates) ----------
  const hits = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap
    && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  const inside = (r) => r.x >= 12 && r.y >= 12 && r.x + r.w <= WORLD.w - 12 && r.y + r.h <= WORLD.h - 12;
  function clearOf(rect, obstacles) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const hit = obstacles.find((other) => hits(rect, other, 8));
      if (!hit) break;
      const moves = [
        { x: rect.x, y: hit.y - rect.h - 10 }, { x: rect.x, y: hit.y + hit.h + 10 },
        { x: hit.x - rect.w - 10, y: rect.y }, { x: hit.x + hit.w + 10, y: rect.y },
      ].filter((move) => move.x >= 12 && move.y >= 12 && move.x + rect.w <= WORLD.w - 12 && move.y + rect.h <= WORLD.h - 12);
      if (!moves.length) break;
      moves.sort((a, b) => Math.hypot(a.x - rect.x, a.y - rect.y) - Math.hypot(b.x - rect.x, b.y - rect.y));
      rect.x = moves[0].x; rect.y = moves[0].y;
    }
    rect.x = clamp(rect.x, 12, WORLD.w - rect.w - 12);
    rect.y = clamp(rect.y, 12, WORLD.h - rect.h - 12);
    return rect;
  }

  function buildActors(actorGroup, labelGroup, actors, uid, defs, labels) {
    const placedTags = [], silhouettes = [], byId = new Map();
    for (const actor of [...actors].sort((a, b) => center(a.cell).y - center(b.cell).y)) {
      const at = center(actor.cell);
      const wrapper = graphic('g', { class: 'lk-stage-actor', transform: `translate(${fmt(at)})`, 'data-actor': actor.id });
      const ring = graphic('ellipse', { class: 'lk-stage-ring', cx: 0, cy: 2, rx: HALF.w * 0.72, ry: HALF.h * 0.72, fill: 'none', stroke: actor.color, 'stroke-width': 2, opacity: 0 });
      wrapper.append(ring);
      drawKind(wrapper, actor, uid, defs);
      actorGroup.append(wrapper);
      // getBBox() is local to the translated wrapper: move it into world space.
      const box = wrapper.getBBox();
      silhouettes.push({ x: box.x + at.x, y: box.y + at.y, w: box.width, h: box.height });

      const width = Math.max(80, actor.name.length * 6.2 + 26);
      const lift = LIFT[actor.kind];
      const tag = graphic('g', { class: 'lk-stage-tag', 'data-tag': actor.id });
      tag.append(graphic('rect', { x: (-width / 2).toFixed(1), y: -13, width: width.toFixed(1), height: 26, rx: 13, stroke: actor.color, 'stroke-width': 1.2 }));
      tag.append(graphic('circle', { cx: (-width / 2 + 13).toFixed(1), cy: 0, r: 3, fill: actor.color }));
      tag.append(graphic('text', { x: (-width / 2 + 23).toFixed(1), y: 4.5, 'font-size': 12.5, 'font-weight': 650, 'text-anchor': 'start' }, actor.name));
      const obstacles = [...silhouettes, ...placedTags];
      let chosen = null;
      // A tag belongs to its object: keep it directly above it, never off in a
      // corner of the stage. Height, not horizontal distance, resolves clashes.
      // A small sideways step is still attached to the object; a far corner
      // of the stage is not. Both offsets stay within the reader's tile scale.
      for (const dx of [0, -64, 64]) {
        for (const dy of [-lift, -lift - 24, -lift - 48, -lift - 72, -lift + 22]) {
          const rect = { x: at.x + dx - width / 2, y: at.y + dy - 13, w: width, h: 26 };
          const clear = obstacles.every((other, k) => !hits(rect, other, k < silhouettes.length ? 8 : 24));
          if (!inside(rect) || !clear) continue;
          chosen = { dx, dy, rect }; break;
        }
        if (chosen) break;
      }
      if (!chosen) {
        chosen = { dx: 0, dy: -lift, rect: { x: at.x - width / 2, y: at.y - lift - 13, w: width, h: 26 } };
        clearOf(chosen.rect, obstacles);
        chosen.dx = chosen.rect.x + width / 2 - at.x;
        chosen.dy = chosen.rect.y + 13 - at.y;
      }
      // Labels live in their own last layer: even a future placement mistake
      // cannot hide a word behind a prism again.
      const tagX = at.x + chosen.dx, tagY = at.y + chosen.dy;
      tag.setAttribute('transform', `translate(${tagX.toFixed(1)},${tagY.toFixed(1)})`);
      labelGroup.append(tag);
      labels.push({ node: tag, x: tagX, y: tagY });
      placedTags.push(chosen.rect);
      byId.set(actor.id, { wrapper, ring, center: at });
    }
    return { byId, tagRects: placedTags, silhouettes };
  }

  function bezier(a, control, b, t) {
    return {
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * control.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * control.y + t * t * b.y,
    };
  }

  function buildLanes(laneGroup, labelGroup, defs, spec, byId, tagRects, silhouettes, uid, labels) {
    const placed = [], lanes = new Map();
    for (const [index, lane] of spec.lanes.entries()) {
      const from = byId.get(lane.from).center, to = byId.get(lane.to).center;
      const color = spec.actors.find((actor) => actor.id === lane.identity).color;
      const mid = point(from, to, 0.5), dx = to.x - from.x, dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      // Two possible bows: one of them leaves a clear lane for the verb pill.
      const bends = [90, -90, 140, -140, 190, -190].map((bend) => ({
        x: mid.x - (dy / length) * bend, y: mid.y + (dx / length) * bend,
      }));
      const width = Math.max(54, lane.verb.length * 6.4 + 22), height = 26;
      const obstacles = [...silhouettes, ...tagRects, ...placed];
      let chosen = null, control = bends[0];
      search: for (const bow of bends) {
        for (const t of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74]) {
          for (const offset of [0, 10, -10]) {
            const p = bezier(from, bow, to, t);
            const x = p.x - (dy / length) * offset, y = p.y + (dx / length) * offset;
            const rect = { x: x - width / 2, y: y - height / 2, w: width, h: height };
            const clear = obstacles.every((other, k) => !hits(rect, other, k < silhouettes.length ? 10 : 24));
            if (!inside(rect) || !clear) continue;
            chosen = { x, y, rect }; control = bow; break search;
          }
        }
      }
      if (!chosen) {
        const p = bezier(from, control, to, 0.5);
        chosen = { x: p.x, y: p.y, rect: { x: p.x - width / 2, y: p.y - height / 2, w: width, h: height } };
      }
      const path = `M${fmt(from)} Q${fmt(control)} ${fmt(to)}`;
      const markerId = `${uid}-arrow-${index}`;
      const marker = graphic('marker', { id: markerId, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
      marker.append(graphic('path', { d: 'M0,1 L9,5 L0,9 Z', fill: color }));
      defs.append(marker);
      const wrapper = graphic('g', { class: 'lk-stage-lane is-dim', 'data-lane': lane.id, style: `--lk-stage-lane:${color}` });
      wrapper.append(graphic('path', { d: path, class: 'lk-stage-lane-bed' }));
      wrapper.append(graphic('path', { d: path, class: 'lk-stage-lane-dashes' }));
      wrapper.append(graphic('path', { d: path, class: 'lk-stage-lane-flow', 'marker-end': `url(#${markerId})` }));
      const label = graphic('g', { class: 'lk-stage-lane-label', 'data-lane': lane.id, transform: `translate(${chosen.x.toFixed(1)},${chosen.y.toFixed(1)})` });
      label.append(graphic('rect', { x: (-width / 2).toFixed(1), y: -height / 2, width: width.toFixed(1), height, rx: 14, stroke: color, 'stroke-width': 1.2 }));
      label.append(graphic('text', { x: 0, y: 4.5, fill: light(color), 'font-size': 12.5, 'font-weight': 650, 'text-anchor': 'middle' }, lane.verb));
      labelGroup.append(label);
      labels.push({ node: label, x: chosen.x, y: chosen.y });
      laneGroup.append(wrapper);
      placed.push(chosen.rect);
      lanes.set(lane.id, wrapper);
    }
    return lanes;
  }

  function buildFacts(host, step, spec) {
    host.replaceChildren();
    const heading = element('div', undefined, { class: 'lk-stage-panel-head' });
    heading.append(element('span', 'Datos del paso', { class: 'lk-stage-eyebrow' }));
    host.append(heading);
    for (const fact of step.facts) {
      const color = spec.actors.find((actor) => actor.id === fact.identity).color;
      const card = element('div', undefined, { class: `lk-stage-fact tone-${fact.tone}` });
      card.style.setProperty('--lk-stage-fact', color);
      card.append(element('span', fact.label, { class: 'lk-stage-fact-label' }), element('strong', String(fact.value), { class: 'lk-stage-fact-value' }));
      host.append(card);
    }
  }

  function buildNarrator(host, lines) {
    host.replaceChildren();
    for (const [index, line] of lines.entries()) {
      const row = element('p', undefined, { class: 'lk-stage-line' + (lines.length > 1 && index === lines.length - 1 ? ' is-conclusion' : '') });
      const pattern = /\[([^\]|]+)\|([^\]]+)\]/g;
      let cursor = 0, match;
      while ((match = pattern.exec(line)) !== null) {
        if (match.index > cursor) row.append(document.createTextNode(line.slice(cursor, match.index)));
        row.append(element('span', match[1], { class: `lk-stage-chip tone-${match[2].trim()}` }));
        cursor = match.index + match[0].length;
      }
      if (cursor < line.length) row.append(document.createTextNode(line.slice(cursor)));
      host.append(row);
    }
    host.classList.remove('is-entering');
    void host.offsetWidth;
    host.classList.add('is-entering');
  }

  function ease(progress) {
    // cubic-bezier(.2,.8,.2,1), solved in x so the camera uses the one contract.
    const curve = (a, b, t) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    let t = progress;
    for (let i = 0; i < 8; i += 1) {
      const x = curve(0.2, 0.2, t) - progress;
      const d = 3 * (1 - t) * (1 - t) * 0.2 + 6 * (1 - t) * t * (0.2 - 0.2) + 3 * t * t * (1 - 0.2);
      if (Math.abs(d) < 1e-6) break;
      t = clamp(t - x / d, 0, 1);
    }
    return curve(0.8, 1, t);
  }

  function viewBoxOf(svg) {
    const [x, y, w, h] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    return { x, y, w, h };
  }
  const boxOf = (bbox) => ({ x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height });
  function unionBoxes(...boxes) {
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function overviewFor(content) {
    // Even margins around the declared actors and their labels, not around a
    // fixed 1200x700 canvas whose lower half the prototype left empty.
    const ratio = WORLD.w / WORLD.h, pad = 60;
    const w = Math.max(content.w + pad * 2, (content.h + pad * 2) * ratio);
    const h = w / ratio;
    return { x: content.x + content.w / 2 - w / 2, y: content.y + content.h / 2 - h / 2, w, h };
  }
  function cameraFor(step, byId, content, overview) {
    const ratio = WORLD.w / WORLD.h, margin = 48;
    const left = content.x - margin, right = content.x + content.w + margin;
    const top = content.y - margin, bottom = content.y + content.h + margin;
    const at = byId.get(step.activeActor).center;
    // Widen the frame only as much as centring this actor needs. The camera
    // never crops a label to make an actor bigger; type is counter-scaled so
    // a wider frame does not shrink what the reader reads.
    // 0.61 leaves headroom for the 12% centring tolerance instead of forcing
    // an exact, unnecessarily wide centre on the busiest step.
    const needX = Math.max(at.x - left, right - at.x) / 0.61;
    const needY = Math.max(at.y - top, bottom - at.y) / 0.61 * ratio;
    const w = Math.max(overview.w, needX, needY, (bottom - top) * ratio);
    const h = w / ratio;
    return {
      x: clamp(at.x - w / 2, right - w, left),
      y: clamp(at.y - h / 2, bottom - h, top),
      w, h,
    };
  }
  const viewText = (v) => [v.x, v.y, v.w, v.h].map((n) => n.toFixed(1)).join(' ');

  function mount(host, spec) {
    const uid = `lk-stage-${++stageId}`;
    if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '0');
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', spec.title || 'Escenario isométrico');

    const head = element('header', undefined, { class: 'lk-stage-head' });
    head.append(element('span', 'Escenario isométrico', { class: 'lk-stage-kicker' }));
    const question = element('h1', undefined, { class: 'lk-stage-question' });
    const at = spec.question.toLowerCase().indexOf(spec.focus.toLowerCase());
    if (at >= 0) {
      question.append(document.createTextNode(spec.question.slice(0, at)));
      question.append(element('mark', spec.question.slice(at, at + spec.focus.length)));
      question.append(document.createTextNode(spec.question.slice(at + spec.focus.length)));
    } else {
      question.textContent = spec.question;
    }
    head.append(question);

    const body = element('div', undefined, { class: 'lk-stage-body' });
    const surface = element('div', undefined, { class: 'lk-stage-surface' });
    const svg = graphic('svg', { viewBox: `0 0 ${WORLD.w} ${WORLD.h}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Escenario isométrico con los actores declarados' });
    const defs = graphic('defs', {});
    const gradient = graphic('radialGradient', { id: `${uid}-shadow` });
    gradient.append(graphic('stop', { offset: '0%', 'stop-color': '#000814', 'stop-opacity': 0.48 }));
    gradient.append(graphic('stop', { offset: '65%', 'stop-color': '#000814', 'stop-opacity': 0.2 }));
    gradient.append(graphic('stop', { offset: '100%', 'stop-color': '#000814', 'stop-opacity': 0 }));
    defs.append(gradient);
    svg.append(defs);
    const floor = graphic('g', { class: 'lk-stage-floor' }, undefined);
    for (const row of ROWS) {
      for (const column of COLUMNS) {
        const at = center(column + row);
        floor.append(graphic('path', { d: polygon(diamond(at.x, at.y, 0.99)), class: 'lk-stage-tile' }));
      }
    }
    svg.append(floor);
    const laneLayer = graphic('g', { class: 'lk-stage-lane-layer' });
    const actorLayer = graphic('g', { class: 'lk-stage-actor-layer' });
    const labelLayer = graphic('g', { class: 'lk-stage-label-layer' });
    svg.append(laneLayer, actorLayer, labelLayer);
    surface.append(svg);
    const facts = element('aside', undefined, { class: 'lk-stage-facts', 'aria-label': 'Datos del paso' });
    body.append(surface, facts);

    const narrator = element('section', undefined, { class: 'lk-stage-narrator', 'aria-label': 'Narrador', 'aria-live': 'polite' });
    const player = element('div', undefined, { class: 'lk-stage-player' });
    const controls = element('div', undefined, { class: 'lk-stage-controls' });
    const prev = element('button', '← Anterior', { type: 'button', 'aria-label': 'Paso anterior' });
    const next = element('button', 'Siguiente →', { type: 'button', 'aria-label': 'Paso siguiente' });
    controls.append(prev, next);
    const dots = element('div', undefined, { class: 'lk-stage-dots', 'aria-label': 'Pasos' });
    const counter = element('span', '', { class: 'lk-stage-count' });
    player.append(controls, dots, counter);
    host.append(head, body, narrator, player);

    const labels = [];
    const { byId, tagRects, silhouettes } = buildActors(actorLayer, labelLayer, spec.actors, uid, defs, labels);
    const lanes = buildLanes(laneLayer, labelLayer, defs, spec, byId, tagRects, silhouettes, uid, labels);
    const content = unionBoxes(boxOf(actorLayer.getBBox()), boxOf(labelLayer.getBBox()));
    const overview = overviewFor(content);
    // Type is authored at the overview scale and counter-scaled on every
    // camera frame: a zoom changes the scene, never the size of a word.
    const scaleLabels = (factor) => {
      for (const label of labels) {
        label.node.setAttribute('transform', `translate(${label.x.toFixed(1)},${label.y.toFixed(1)}) scale(${factor.toFixed(4)})`);
      }
    };
    scaleLabels(1);
    svg.setAttribute('viewBox', viewText(overview));
    const reduce = global.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
    let index = 0, animation = 0;

    function battery(level) {
      const filled = clamp(Math.ceil((level / 100) * 4), 1, 4);
      const cells = svg.querySelectorAll('.lk-stage-battery-cell');
      const robot = spec.actors.find((actor) => actor.kind === 'robot');
      cells.forEach((cell) => {
        const on = Number(cell.getAttribute('data-index')) < filled;
        cell.setAttribute('fill', on ? (level <= 20 ? '#FF9B6A' : light(robot.color)) : 'rgba(255,255,255,.13)');
      });
      svg.querySelectorAll('circle[r="2.4"]').forEach((eye) => eye.setAttribute('fill', level === 0 ? '#5A6B80' : '#E4F4FF'));
    }

    function draw(animate) {
      const step = spec.steps[index];
      host.dataset.step = String(index + 1);
      for (const [id, actor] of byId) {
        const active = id === step.activeActor;
        actor.wrapper.classList.toggle('is-active', active);
        actor.ring.setAttribute('opacity', active ? 0.8 : 0);
      }
      for (const [id, lane] of lanes) lane.setAttribute('class', `lk-stage-lane ${id === step.highlightLane ? 'is-primary' : 'is-dim'}`);
      battery(typeof step.battery === 'number' ? step.battery : 100);
      buildFacts(facts, step, spec);
      buildNarrator(narrator, step.narrator);
      counter.textContent = `${index + 1}/${spec.steps.length}`;
      prev.disabled = index === 0;
      next.disabled = index === spec.steps.length - 1;
      [...dots.children].forEach((dot, i) => {
        dot.classList.toggle('is-current', i === index);
        dot.setAttribute('aria-current', i === index ? 'step' : 'false');
      });

      const from = viewBoxOf(svg), target = cameraFor(step, byId, content, overview);
      cancelAnimationFrame(animation);
      if (!animate || reduce.matches) {
        svg.setAttribute('viewBox', viewText(target));
        scaleLabels(target.w / overview.w);
        host.dataset.settled = 'true';
      } else {
        host.dataset.settled = 'false';
        const start = global.performance.now();
        const frame = (now) => {
          const t = clamp((now - start) / EASE_MS, 0, 1), e = ease(t);
          const current = {
            x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e),
            w: lerp(from.w, target.w, e), h: lerp(from.h, target.h, e),
          };
          svg.setAttribute('viewBox', viewText(current));
          scaleLabels(current.w / overview.w);
          if (t < 1) animation = requestAnimationFrame(frame);
          else host.dataset.settled = 'true';
        };
        animation = requestAnimationFrame(frame);
      }
    }

    function go(nextIndex, animate = true) {
      index = clamp(nextIndex, 0, spec.steps.length - 1);
      draw(animate);
    }
    spec.steps.forEach((_, i) => {
      const dot = element('button', '', { type: 'button', 'aria-label': `Ir al paso ${i + 1}` });
      dot.addEventListener('click', () => go(i));
      dots.append(dot);
    });
    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    host.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    });
    draw(false);
  }
  let stageId = 0;

  const api = { validate, StageSpecError, KINDS, FACT_TONES, CHIP_TONES, mount };
  global.lkStage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof global.customElements !== 'undefined' && !global.customElements.get('lk-stage')) {
    global.customElements.define('lk-stage', class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        Promise.resolve().then(() => {
          const script = this.querySelector(':scope > script[type="application/json"]');
          if (!script) throw new Error('lk-stage: expected an inline JSON script');
          let raw;
          try { raw = JSON.parse(script.textContent); }
          catch (error) { throw new Error(`lk-stage: invalid JSON: ${error.message}`); }
          mount(this, validate(raw));
          this.dataset.ready = 'true';
        }).catch((error) => {
          this.replaceChildren(element('p', error.message, { class: 'lk-stage-error', role: 'alert' }));
          this.dataset.ready = 'error';
        });
      }
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
