/* lk-stage — a declared isometric stage. Plain browser JavaScript, no build step.
   The validator is deliberately DOM-free so scene-lint and node:test can use it. */
(function (global) {
  'use strict';

  const KINDS = ['robot', 'room', 'charger', 'block'];
  const SPRITE_PREFIX = 'sprite:';
  const isSpriteKind = (kind) => typeof kind === 'string' && kind.startsWith(SPRITE_PREFIX) && kind.length > SPRITE_PREFIX.length;
  const editDistance = (a, b) => {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      for (let j = 1; j <= b.length; j += 1) {
        row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = row;
    }
    return prev[b.length];
  };
  function checkSpriteKind(kind, path) {
    const name = kind.slice(SPRITE_PREFIX.length);
    if (!object(global.PK_VOCAB)) fail(path, `${shown(kind)} needs vocab/sprites.js to be loaded`);
    try { global.PK_VOCAB.resolve(name); } catch {
      const candidates = [...KINDS.map((k) => SPRITE_PREFIX + k), ...(global.PK_VOCAB.names || [])];
      const closest = candidates.sort((a, b) => editDistance(name, a) - editDistance(name, b) || a.localeCompare(b)).slice(0, 3);
      fail(path, `unknown sprite "${name}" (closest: ${closest.map((n) => `"${n}"`).join(', ')})`);
    }
  }
  const FACT_TONES = ['neutral', 'good', 'bad', 'warn', 'info'];
  const CHIP_TONES = ['neutral', 'good', 'bad', 'warn', 'info'];
  const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ROWS = [1, 2, 3, 4, 5];
  const ROOT_KEYS = ['title', 'kicker', 'caption', 'question', 'focus', 'dirt', 'route', 'actors', 'lanes', 'steps'];
  const ACTOR_KEYS = ['id', 'kind', 'cell', 'cells', 'labelCell', 'labelSide', 'name', 'color'];
  const LANE_KEYS = ['id', 'from', 'to', 'verb', 'identity', 'labelT'];
  const STEP_KEYS = ['activeActor', 'cell', 'cleaned', 'signal', 'highlightLane', 'battery', 'facts', 'narrator', 'focusOn'];
  const FACT_KEYS = ['identity', 'label', 'value', 'tone'];
  const FOCUS_KEYS = ['target', 'tone'];
  const FOCUS_TONES = ['look', 'right', 'wrong'];
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

  const cellOf = (cell) => ({ c: COLUMNS.indexOf(cell?.[0]), r: ROWS.indexOf(Number(cell?.[1])) });
  const isCell = (cell) => typeof cell === 'string' && /^[A-F][1-5]$/.test(cell);
  const adjacent = (a, b) => {
    const p = cellOf(a), q = cellOf(b);
    return p.c >= 0 && q.c >= 0 && Math.abs(p.c - q.c) + Math.abs(p.r - q.r) === 1;
  };

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
    for (const key of ['kicker', 'caption']) {
      if (spec[key] !== undefined && !text(spec[key])) fail(key, 'expected a non-empty string');
    }
    if (spec.question.toLowerCase().indexOf(spec.focus.toLowerCase()) < 0) {
      fail('focus', `${shown(spec.focus)} is not in the question`);
    }
    if (!Array.isArray(spec.actors) || spec.actors.length === 0) fail('actors', 'expected a non-empty array');
    if (!Array.isArray(spec.lanes)) fail('lanes', 'expected an array');
    if (!Array.isArray(spec.steps) || spec.steps.length === 0) fail('steps', 'expected a non-empty array');
    if (spec.dirt !== undefined && !Array.isArray(spec.dirt)) fail('dirt', 'expected an array');
    const dirt = (spec.dirt || []).map((cell, i) => {
      if (!isCell(cell)) fail(`dirt[${i}]`, `${shown(cell)} is not a cell`);
      return cell;
    });
    if (new Set(dirt).size !== dirt.length) fail('dirt', 'duplicate cells');
    // Legacy step-only specs have no route: every frame keeps the protagonist
    // on its declared cell. An authored route keeps the full adjacency gate.
    const legacyRoute = spec.route === undefined;
    const home = spec.actors.find((a) => a.kind === 'robot')?.cell || spec.actors[0].cell;
    // Without an authored route the robot stays on its declared cell; the
    // camera still follows the active actor of each step.
    const route = legacyRoute ? spec.steps.map(() => home) : spec.route;
    if (!Array.isArray(route) || route.length !== spec.steps.length) fail('route', 'expected one cell per step');
    if (!legacyRoute) route.forEach((cell, i) => {
      if (!isCell(cell)) fail(`route[${i}]`, `${shown(cell)} is not a cell`);
      if (i && !adjacent(route[i - 1], cell)) fail(`route[${i}]`, `${shown(cell)} is not adjacent to ${shown(route[i - 1])}`);
    });
    if (!legacyRoute && new Set(route).size !== route.length) fail('route', 'duplicate cells');

    const actors = [], ids = new Set();
    for (const [i, raw] of spec.actors.entries()) {
      const at = `actors[${i}]`;
      if (!object(raw)) fail(at, 'expected an object');
      knownKeys(raw, ACTOR_KEYS, at);
      if (!text(raw.id)) fail(`${at}.id`, `${shown(raw.id)} is not an id`);
      if (ids.has(raw.id)) fail(`${at}.id`, `${shown(raw.id)} is a duplicate id`);
      if (!KINDS.includes(raw.kind) && !isSpriteKind(raw.kind)) fail(`${at}.kind`, `${shown(raw.kind)} is not a kind`);
      if (isSpriteKind(raw.kind)) checkSpriteKind(raw.kind, `${at}.kind`);
      if (!isCell(raw.cell)) fail(`${at}.cell`, `${shown(raw.cell)} is not a cell`);
      let cells;
      if (raw.labelSide !== undefined && !['above', 'right', 'left'].includes(raw.labelSide)) fail(`${at}.labelSide`, `${shown(raw.labelSide)} is not a label side`);
      const declaredCells = raw.kind === 'room' && raw.cells === undefined ? [raw.cell] : raw.cells;
      if (raw.kind === 'room') {
        if (!Array.isArray(declaredCells) || declaredCells.length === 0) fail(`${at}.cells`, 'a room needs named tiles');
        if (raw.labelCell !== undefined && !declaredCells.includes(raw.labelCell)) fail(`${at}.labelCell`, `${shown(raw.labelCell)} is not in the room`);
        cells = declaredCells.map((cell, j) => {
          if (!isCell(cell)) fail(`${at}.cells[${j}]`, `${shown(cell)} is not a cell`);
          return cell;
        });
        if (!cells.includes(raw.cell)) fail(`${at}.cells`, `${shown(raw.cell)} is not in the room`);
      } else if (raw.cells !== undefined) {
        fail(`${at}.cells`, `only a room can declare cells`);
      }
      if (!text(raw.name)) fail(`${at}.name`, `${shown(raw.name)} is not a name`);
      if (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) fail(`${at}.color`, `${shown(raw.color)} is not a colour`);
      ids.add(raw.id);
      actors.push({ ...raw, cells });
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
      if (raw.labelT !== undefined && (typeof raw.labelT !== 'number' || raw.labelT < 0 || raw.labelT > 1)) fail(`${at}.labelT`, `${shown(raw.labelT)} is not a path fraction`);
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
      const cell = raw.cell === undefined ? route[i] : raw.cell;
      if (!isCell(cell)) fail(`${at}.cell`, `${shown(cell)} is not a cell`);
      if (cell !== route[i]) fail(`${at}.cell`, `${shown(cell)} is not route[${i}] (${shown(route[i])})`);
      const cleaned = raw.cleaned === undefined ? [] : raw.cleaned.map((cell, j) => {
        if (!isCell(cell)) fail(`${at}.cleaned[${j}]`, `${shown(cell)} is not a cell`);
        if (!dirt.includes(cell)) fail(`${at}.cleaned[${j}]`, `${shown(cell)} is not dirty in the spec`);
        return cell;
      });
      if (raw.signal !== undefined && !text(raw.signal)) fail(`${at}.signal`, `${shown(raw.signal)} is not a signal`);
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
      const declaredFocus = raw.focusOn === undefined
        ? [{ target: 'actor:' + raw.activeActor, tone: 'look' }] : raw.focusOn;
      if (!Array.isArray(declaredFocus) || declaredFocus.length < 1 || declaredFocus.length > 2) {
        fail(`${at}.focusOn`, 'expected one or two focus targets');
      }
      const focusOn = declaredFocus.map((rawFocus, j) => {
        const where = `${at}.focusOn[${j}]`;
        if (!object(rawFocus)) fail(where, 'expected an object');
        knownKeys(rawFocus, FOCUS_KEYS, where);
        if (!text(rawFocus.target)) fail(`${where}.target`, 'expected a target');
        const [prefix, ...parts] = rawFocus.target.split(':');
        const value = parts.join(':');
        if (!['actor', 'tag', 'lane', 'fact'].includes(prefix) || !value) {
          fail(`${where}.target`, `${shown(rawFocus.target)} must be actor:, tag:, lane: or fact:`);
        }
        if (prefix === 'actor' || prefix === 'tag') actor(value, `${where}.target`);
        if (prefix === 'lane') lane(value, `${where}.target`);
        if (prefix === 'fact' && (!/^\d+$/.test(value) || Number(value) >= facts.length)) {
          fail(`${where}.target`, `${shown(rawFocus.target)} is not a fact of this step`);
        }
        if (!FOCUS_TONES.includes(rawFocus.tone)) fail(`${where}.tone`, `${shown(rawFocus.tone)} is not a focus tone`);
        return { target: rawFocus.target, tone: rawFocus.tone };
      });
      if (new Set(focusOn.map((focus) => focus.target)).size !== focusOn.length) fail(`${at}.focusOn`, 'duplicate focus target');
      steps.push({ ...raw, cell, cleaned, highlightLane: raw.highlightLane ?? null, facts, narrator, focusOn });
    }
    return { title: spec.title || '', kicker: spec.kicker || '', caption: spec.caption || '',
      question: spec.question, focus: spec.focus, dirt, route: [...route], actors, lanes, steps };
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
    const { cx, cy, scale, height, color, rounded = false, surface = false } = options;
    const base = diamond(cx, cy, scale), top = base.map((p) => ({ x: p.x, y: p.y - height }));
    const stroke = 'rgba(12,24,38,.32)';
    const mark = surface ? 'floor' : '1';
    const left = graphic('path', { d: polygon([top[3], top[2], base[2], base[3]]), fill: color, stroke, 'stroke-width': 1, 'data-prism': mark });
    const right = graphic('path', { d: polygon([top[2], top[1], base[1], base[2]]), fill: dark(color), stroke, 'stroke-width': 1, 'data-prism': mark });
    const crown = graphic('path', { d: polygon(top, rounded ? 0.16 : 0), fill: light(color), stroke: 'rgba(255,255,255,.24)', 'stroke-width': 1, 'data-prism': mark });
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

  const LIFT = { robot: 170, room: 48, charger: 124, block: 92, sprite: 82 };
  const liftOf = (kind) => LIFT[kind] || (isSpriteKind(kind) ? LIFT.sprite : 92);

  // A room is a floor plan: named tiles with a low wall on its outside edges.
  // All coordinates are computed from cell names, never authored.
  function drawLowWalls(parent, cells, anchor, color) {
    const names = new Set(cells);
    const origin = center(anchor);
    const w = HALF.w * 0.97, h = HALF.h * 0.97, rise = 11;
    for (const cell of cells) {
      const { c, r } = cellOf(cell), at = center(cell);
      const ox = at.x - origin.x, oy = at.y - origin.y;
      const T = { x: ox, y: oy - h }, R = { x: ox + w, y: oy };
      const B = { x: ox, y: oy + h }, L = { x: ox - w, y: oy };
      const edges = [];
      if (!names.has(`${COLUMNS[c + 1]}${r}`)) edges.push([R, B]);
      if (!names.has(`${COLUMNS[c - 1]}${r}`)) edges.push([L, T]);
      if (!names.has(`${COLUMNS[c]}${r + 1}`)) edges.push([L, B]);
      if (!names.has(`${COLUMNS[c]}${r - 1}`)) edges.push([T, R]);
      for (const [p, q] of edges) {
        const top1 = { x: p.x, y: p.y - rise }, top2 = { x: q.x, y: q.y - rise };
        parent.append(graphic('path', {
          d: polygon([top1, top2, q, p]), fill: dark(color),
          stroke: 'rgba(12,24,38,.28)', 'stroke-width': 0.8, 'data-prism': 'wall',
        }));
        parent.append(graphic('path', {
          d: `M${fmt(top1)} L${fmt(top2)}`, stroke: light(color),
          'stroke-width': 2.1, 'stroke-linecap': 'round', 'data-prism': 'wall',
        }));
      }
    }
  }

  function drawKind(wrapper, actor, uid, _defs) {
    const color = actor.color;
    if (isSpriteKind(actor.kind)) {
      // Upright billboard on its own tile: same shadow, same tag placement as a prism.
      shadow(wrapper, uid + '-shadow', 0.62);
      const sprite = global.PK_VOCAB.render(actor.kind.slice(SPRITE_PREFIX.length), 3);
      sprite.setAttribute('x', '-36');
      sprite.setAttribute('y', '-74');
      sprite.setAttribute('data-vocab-sprite', actor.kind);
      wrapper.append(sprite);
      return;
    }
    if (actor.kind === 'robot') {
      shadow(wrapper, uid + '-shadow', 0.82);
      const faces = prism(wrapper, { cx: 0, cy: 0, scale: 0.74, height: 58, color, rounded: true });
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
      const anchor = center(actor.cell);
      for (const cell of actor.cells || [actor.cell]) {
        const at = center(cell);
        prism(wrapper, { cx: at.x - anchor.x, cy: at.y - anchor.y, scale: 0.97, height: 7, color, surface: true });
      }
      drawLowWalls(wrapper, actor.cells || [actor.cell], actor.cell, color);
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
  function buildActors(actorGroup, labelGroup, actors, route, uid, defs, labels) {
    const placedTags = [], silhouettes = [], byId = new Map(), made = [];
    // First pass: draw every object, then measure all silhouettes in world
    // space. A room is a whole zone, so its tag must clear every other zone.
    // Rooms first, props next, robot last: the protagonist is never buried
    // under a floor prism or its own signal.
    const drawOrder = [...actors].sort((a, b) => {
      if (a.kind === 'robot') return 1;
      if (b.kind === 'robot') return -1;
      return center(a.cell).y - center(b.cell).y;
    });
    for (const actor of drawOrder) {
      const at = center(actor.cell);
      const wrapper = graphic('g', { class: 'lk-stage-actor', transform: `translate(${fmt(at)})`, 'data-actor': actor.id, 'data-kind': actor.kind });
      const ring = graphic('ellipse', { class: 'lk-stage-ring', cx: 0, cy: 2, rx: HALF.w * 0.72, ry: HALF.h * 0.72, fill: 'none', stroke: actor.color, 'stroke-width': 2, opacity: 0 });
      wrapper.append(ring);
      drawKind(wrapper, actor, uid, defs);
      let signal;
      if (actor.kind === 'robot') {
        signal = graphic('g', { class: 'lk-stage-signal', 'data-signal': '' });
        signal.append(graphic('rect', { x: 56, y: -98, width: 92, height: 34, rx: 17 }));
        signal.append(graphic('text', { x: 102, y: -75, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700 }, ''));
        wrapper.append(signal);
      }
      actorGroup.append(wrapper);
      const box = wrapper.getBBox();
      const silhouette = { x: box.x + at.x, y: box.y + at.y, w: box.width, h: box.height };
      silhouettes.push(silhouette);
      made.push({ actor, at, wrapper, ring, signal, silhouette });
    }
    // The robot visits several cells: every tag must clear every future
    // position, not just the first frame, or a label lands on a moving prism.
    const routeSilhouettes = [];
    const robot = made.find((item) => item.actor.kind === 'robot');
    if (robot) {
      const first = center(route[0]);
      for (const cell of route) {
        const at = center(cell);
        const s = robot.silhouette;
        routeSilhouettes.push({ x: s.x + at.x - first.x, y: s.y + at.y - first.y, w: s.w, h: s.h, tight: true });
      }
    }
    const wallRects = [];
    const objectSilhouettes = [];
    for (const item of made) {
      if (item.actor.kind !== 'room') objectSilhouettes.push(item.silhouette);
      for (const wall of item.wrapper.querySelectorAll('[data-prism="wall"]')) {
        const b = wall.getBBox();
        wallRects.push({ x: b.x + item.at.x, y: b.y + item.at.y, w: b.width, h: b.height, owner: item.actor.id, tight: true });
      }
    }
    const robotTagRects = [];
    // Second pass: tags live in their own last layer, above every prism.
    // The robot is placed first so every other label can avoid its whole path.
    const tagOrder = [...made].sort((a, b) => (a.actor.kind === 'robot' ? -1 : 0) - (b.actor.kind === 'robot' ? -1 : 0));
    for (const item of tagOrder) {
      const { actor, at, silhouette, wrapper, ring, signal } = item;
      const cells = actor.cells || [actor.cell];
      const roomWidth = Math.max(64, actor.name.length * 4.8 + 18);
      const width = actor.kind === 'room' ? roomWidth : Math.max(108, actor.name.length * 9.2 + 36);
      const centroid = cells.reduce((sum, cell) => {
        const p = center(cell);
        return { x: sum.x + p.x / cells.length, y: sum.y + p.y / cells.length };
      }, { x: 0, y: 0 });
      // Flat room names sit on a declared tile. Prefer the tile furthest from
      // the route and the props, so the word never becomes a badge on a prism.
      const propCells = made.filter((m) => m.actor.kind !== 'room').map((m) => m.actor.cell);
      const far = (cell) => Math.min(...route.concat(propCells).map((other) => {
        const a = cellOf(cell), b = cellOf(other);
        return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
      }));
      const rest = cells.filter((cell) => cell !== actor.labelCell).sort((a, b) => far(b) - far(a));
      const roomCells = actor.labelCell ? [actor.labelCell, ...rest] : rest;
      const roomHomes = roomCells.map((cell) => center(cell));
      const homes = actor.kind === 'room'
        ? [...roomHomes, centroid]
        : [{ x: at.x + (actor.labelSide === 'right' ? 70 : actor.labelSide === 'left' ? -70 : 0),
            y: at.y - liftOf(actor.kind) - (actor.labelSide === 'above' ? 0 : 18) }];
      const tag = graphic('g', { class: 'lk-stage-tag' + (actor.kind === 'room' ? ' lk-stage-room-name' : ''), 'data-tag': actor.id });
      tag.append(graphic('rect', { x: (-width / 2).toFixed(1), y: -17, width: width.toFixed(1), height: 34, rx: 17, stroke: actor.color, 'stroke-width': 1.2 }));
      tag.append(graphic('circle', { cx: (-width / 2 + 14).toFixed(1), cy: 0, r: 3, fill: actor.color }));
      const tagText = graphic('text', { x: (-width / 2 + (actor.kind === 'room' ? 16 : 25)).toFixed(1), y: 5, 'font-size': 14.5, 'font-weight': 650, 'text-anchor': 'start' }, actor.name);
      tag.append(tagText);
      if (actor.kind === 'room') {
        tagText.setAttribute('textLength', (width - 26).toFixed(1));
        tagText.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
      // A room's axis-aligned zone box overlaps its neighbours in an isometric
      // projection; floor labels use raised objects and walls, not those boxes.
      const obstacles = actor.kind === 'room'
        ? [...placedTags, ...robotTagRects, ...objectSilhouettes, ...routeSilhouettes]
        : [...objectSilhouettes.filter((s) => s !== item.silhouette),
          ...routeSilhouettes, ...wallRects.filter((w) => w.owner !== actor.id), ...placedTags];
      const first = center(route[0]);
      const shifts = actor.kind === 'robot'
        ? route.map((cell) => { const p = center(cell); return { dx: p.x - first.x, dy: p.y - first.y }; })
        : [{ dx: 0, dy: 0 }];
      let chosen = null;
      const dxs = actor.kind === 'room' ? [0, -14, 14] : [0, -26, 26, -52, 52, -78, 78];
      const dys = actor.kind === 'room' ? [0, -10, 10] : [0, -20, -40, -60, 20];
      for (const home of homes) {
        for (const dx of dxs) {
          for (const dy of dys) {
            const rects = shifts.map((shift) => ({
              x: home.x + dx + shift.dx - width / 2, y: home.y + dy + shift.dy - 17, w: width, h: 34,
            }));
            if (rects.some((rect) => !inside(rect) || obstacles.some((other) => hits(rect, other, other.tight ? 4 : other.w > 200 ? 6 : 18)))) continue;
            chosen = { x: home.x + dx, y: home.y + dy, rect: rects[0] };
            break;
          }
          if (chosen) break;
        }
        if (chosen) break;
      }
      if (!chosen) {
        // Never push a tag into a prism just to find free space: staying on
        // its object is more important than an arbitrary collision-free spot.
        const home = homes[0];
        chosen = { x: home.x, y: home.y, rect: { x: home.x - width / 2, y: home.y - 17, w: width, h: 34 } };
      }
      if (actor.kind === 'robot') {
        const start = center(route[0]);
        for (const cell of route) {
          const p = center(cell);
          robotTagRects.push({ x: chosen.rect.x + p.x - start.x, y: chosen.rect.y + p.y - start.y, w: width, h: 34 });
        }
      }
      tag.setAttribute('transform', `translate(${chosen.x.toFixed(1)},${chosen.y.toFixed(1)})`);
      labelGroup.append(tag);
      labels.push({ node: tag, id: actor.id, x: chosen.x, y: chosen.y, baseX: chosen.x, baseY: chosen.y });
      placedTags.push(chosen.rect);
      byId.set(actor.id, {
        wrapper, ring, signal, center: at, silhouette,
        kind: actor.kind,
      });
    }
    return { byId, tagRects: placedTags, silhouettes, routeSilhouettes, wallRects, objectSilhouettes, robotTagRects };
  }

  function bezier(a, control, b, t) {
    return {
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * control.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * control.y + t * t * b.y,
    };
  }

  function buildLanes(laneGroup, labelGroup, defs, spec, byId, tagRects, _wallRects, objectSilhouettes, routeSilhouettes, robotTagRects, uid, labels) {
    const placed = [], lanes = new Map();
    for (const [index, lane] of spec.lanes.entries()) {
      const from = byId.get(lane.from).center, to = byId.get(lane.to).center;
      const color = spec.actors.find((actor) => actor.id === lane.identity).color;
      const mid = point(from, to, 0.5), dx = to.x - from.x, dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      // Two possible bows: one of them leaves a clear lane for the verb pill.
      const bends = [80, -80, 120, -120, 160, -160, 200, -200, 240, -240, 320, -320, 400, -400].map((bend) => ({
        x: mid.x - (dy / length) * bend, y: mid.y + (dx / length) * bend,
      }));
      const width = Math.max(72, lane.verb.length * 8.2 + 30), height = 30;
      const obstacles = [...objectSilhouettes, ...routeSilhouettes, ...tagRects, ...robotTagRects, ...placed];
      const raisedCount = objectSilhouettes.length + routeSilhouettes.length + robotTagRects.length;
      let chosen = null, control = bends[0], best = null, bestOverlap = Infinity;
      const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const ts = lane.labelT === undefined ? [] : [lane.labelT];
      for (let s = 4; s <= 20; s += 1) ts.push(s / 20);
      search: for (const bow of bends) {
        for (const t of ts) {
          for (const offset of [0]) {
            const p = bezier(from, bow, to, t);
            const x = p.x - (dy / length) * offset, y = p.y + (dx / length) * offset;
            const rect = { x: x - width / 2, y: y - height / 2, w: width, h: height };
            const score = obstacles.reduce((sum, other) => sum + overlap(rect, other), 0);
            if (score < bestOverlap && inside(rect)) { bestOverlap = score; best = { x, y, rect }; control = bow; }
            const clear = obstacles.every((other, k) => !hits(rect, other, k < raisedCount ? 8 : 18));
            if (!inside(rect) || !clear) continue;
            chosen = { x, y, rect }; control = bow; break search;
          }
        }
      }
      if (!chosen) chosen = best || (() => { const p = bezier(from, control, to, 0.5); return { x: p.x, y: p.y, rect: { x: p.x - width / 2, y: p.y - height / 2, w: width, h: height } }; })();
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
      label.append(graphic('text', { x: 0, y: 5, 'font-size': 14.5, 'font-weight': 650, 'text-anchor': 'middle' }, lane.verb));
      labelGroup.append(label);
      labels.push({ node: label, id: lane.id, x: chosen.x, y: chosen.y, baseX: chosen.x, baseY: chosen.y });
      laneGroup.append(wrapper);
      placed.push(chosen.rect);
      lanes.set(lane.id, wrapper);
    }
    return lanes;
  }

  function buildFacts(host, step, spec) {
    host.replaceChildren();
    if (spec.caption) host.append(element('p', spec.caption, { class: 'lk-stage-caption' }));
    for (const [index, fact] of step.facts.entries()) {
      const color = spec.actors.find((actor) => actor.id === fact.identity).color;
      const card = element('div', undefined, { class: `lk-stage-fact tone-${fact.tone}`, 'data-fact': String(index) });
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
    const ratio = WORLD.w / WORLD.h, pad = 14;
    const w = Math.max(content.w + pad * 2, (content.h + pad * 2) * ratio);
    const h = w / ratio;
    return { x: content.x + content.w / 2 - w / 2, y: content.y + content.h / 2 - h / 2, w, h };
  }
  function cameraFor(focus, content, overview) {
    const ratio = WORLD.w / WORLD.h, margin = 10;
    const left = content.x - margin, right = content.x + content.w + margin;
    const top = content.y - margin, bottom = content.y + content.h + margin;
    const at = focus;
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
    if (spec.title || spec.kicker) host.setAttribute('aria-label', spec.title || spec.kicker);

    const head = element('header', undefined, { class: 'lk-stage-head' });
    if (spec.kicker) head.append(element('span', spec.kicker, { class: 'lk-stage-kicker' }));
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
    const svg = graphic('svg', { viewBox: `0 0 ${WORLD.w} ${WORLD.h}`, preserveAspectRatio: 'xMidYMid meet', role: 'img',
      ...(spec.kicker ? { 'aria-label': spec.kicker } : {}) });
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

    const dirtLayer = graphic('g', { class: 'lk-stage-dirt-layer' });
    for (const cell of spec.dirt) {
      const at = center(cell);
      const patch = graphic('g', { class: 'lk-stage-dirt', 'data-dirt': cell, transform: `translate(${fmt(at)})` });
      [[-13, 4, 7, 3.4], [3, -6, 5, 2.6], [14, 8, 8, 3.6], [24, -2, 4.5, 2.2]].forEach(([dx, dy, rx, ry], i) => {
        patch.append(graphic('ellipse', { cx: dx, cy: dy, rx, ry, fill: i % 2 ? '#8A6B3F' : '#6E532F', opacity: 0.62 }));
      });
      dirtLayer.append(patch);
    }
    svg.append(dirtLayer);

    const routePoints = spec.route.map((cell) => center(cell));
    const routePath = 'M' + routePoints.map(fmt).join(' L');
    const routeLayer = graphic('g', { class: 'lk-stage-route', 'data-route': '1' });
    routeLayer.append(graphic('path', { d: routePath, class: 'lk-stage-route-bed' }));
    const progress = graphic('path', { d: routePath, class: 'lk-stage-route-progress', 'data-route-progress': '1' });
    routeLayer.append(progress);
    routePoints.forEach((p, i) => routeLayer.append(graphic('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: i === 0 ? 4 : 3,
      class: 'lk-stage-route-stop', 'data-stop': i,
    })));
    svg.append(routeLayer);

    const laneLayer = graphic('g', { class: 'lk-stage-lane-layer' });
    const actorLayer = graphic('g', { class: 'lk-stage-actor-layer' });
    const labelLayer = graphic('g', { class: 'lk-stage-label-layer' });
    svg.append(laneLayer, actorLayer, labelLayer);
    surface.append(svg);
    const facts = element('aside', undefined, { class: 'lk-stage-facts',
      ...(spec.caption ? { 'aria-label': spec.caption } : {}) });
    body.append(surface, facts);

    const narrator = element('section', undefined, { class: 'lk-stage-explain', 'aria-live': 'polite' });
    const player = element('div', undefined, { class: 'lk-stage-player' });
    const controls = element('div', undefined, { class: 'lk-stage-controls' });
    const prev = element('button', '←', { type: 'button', 'aria-label': 'Paso anterior' });
    const next = element('button', '→', { type: 'button', 'aria-label': 'Paso siguiente' });
    const play = element('button', '▶', { type: 'button', 'aria-label': 'Reproducir pasos', 'aria-pressed': 'false' });
    controls.append(prev, next, play);
    const dots = element('div', undefined, { class: 'lk-stage-dots', 'aria-label': 'Progreso de pasos' });
    const counter = element('span', '', { class: 'lk-stage-count' });
    player.append(controls, dots, counter);
    const focusLayer = element('div', undefined, { class: 'lk-stage-focus-layer', 'aria-hidden': 'true' });
    host.append(head, body, narrator, player, focusLayer);

    const labels = [];
    const { byId, tagRects, routeSilhouettes, wallRects, objectSilhouettes, robotTagRects } =
      buildActors(actorLayer, labelLayer, spec.actors, spec.route, uid, defs, labels);
    const lanes = buildLanes(laneLayer, labelLayer, defs, spec, byId, tagRects, wallRects, objectSilhouettes, routeSilhouettes, robotTagRects, uid, labels);
    const content = unionBoxes(boxOf(actorLayer.getBBox()), boxOf(labelLayer.getBBox()), boxOf(routeLayer.getBBox()));
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
    const robotId = spec.actors.find((actor) => actor.kind === 'robot')?.id;
    const robotActor = robotId ? byId.get(robotId) : null;
    const robotAt0 = center(spec.route[0]);
    let robotAt = robotAt0;
    let index = 0, animation = 0, playing = false, playTimer = 0;
    const stopPlay = () => {
      playing = false;
      clearInterval(playTimer);
      play.setAttribute('aria-pressed', 'false');
    };
    const setRobot = (p) => robotActor?.wrapper.setAttribute('transform', `translate(${fmt(p)})`);
    const robotTag = labels.find((label) => label.id === robotId);
    const moveRobotTag = (at) => {
      if (!robotTag) return;
      robotTag.x = robotTag.baseX + at.x - robotAt0.x;
      robotTag.y = robotTag.baseY + at.y - robotAt0.y;
    };

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

    const FOCUS_COLOR = { look: '#004276', right: '#21594F', wrong: '#DD4A68' };
    let focused = [];
    function syncFocus() {
      const hostBox = host.getBoundingClientRect();
      focusLayer.replaceChildren();
      for (const item of focused) {
        if (item.target.startsWith('fact:')) continue; // the card's own border is the focus outline
        const targetBox = item.el.getBoundingClientRect();
        if (!targetBox.width || !targetBox.height) continue;
        const outline = element('div', undefined, {
          class: 'lk-stage-focus',
          'data-tone': item.tone,
          'data-target': item.target,
        });
        outline.style.setProperty('--lk-stage-focus', FOCUS_COLOR[item.tone]);
        outline.style.left = `${Math.round(clamp(targetBox.left - hostBox.left - 5, 3, hostBox.width - 6))}px`;
        outline.style.top = `${Math.round(clamp(targetBox.top - hostBox.top - 5, 3, hostBox.height - 6))}px`;
        outline.style.width = `${Math.round(Math.min(targetBox.width + 10, hostBox.width - 6))}px`;
        outline.style.height = `${Math.round(Math.min(targetBox.height + 10, hostBox.height - 6))}px`;
        focusLayer.append(outline);
      }
    }
    function focusTargets(step) {
      for (const el of host.querySelectorAll('[data-focused]')) el.removeAttribute('data-focused');
      for (const el of host.querySelectorAll('.is-focused')) el.classList.remove('is-focused');
      focused = [];
      for (const item of step.focusOn) {
        const [prefix, value] = item.target.split(':');
        let el = null;
        if (prefix === 'actor') el = byId.get(value)?.wrapper;
        if (prefix === 'tag') el = labelLayer.querySelector(`.lk-stage-tag[data-tag="${value}"]`);
        if (prefix === 'lane') el = labelLayer.querySelector(`.lk-stage-lane-label[data-lane="${value}"]`);
        if (prefix === 'fact') el = facts.querySelector(`[data-fact="${value}"]`);
        if (!el) continue;
        el.classList.add('is-focused');
        el.setAttribute('data-focused', item.tone);
        if (prefix === 'fact') el.style.setProperty('--lk-stage-focus', FOCUS_COLOR[item.tone]);
        focused.push({ ...item, el });
      }
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
      const cellAt = center(step.cell);
      moveRobotTag(cellAt);
      host.dataset.cell = step.cell;
      robotActor?.wrapper.setAttribute('data-cell', step.cell);
      progress.setAttribute('d', 'M' + routePoints.slice(0, index + 1).map(fmt).join(' L'));
      routeLayer.querySelectorAll('.lk-stage-route-stop').forEach((stop, i) => stop.classList.toggle('is-reached', i <= index));
      dirtLayer.querySelectorAll('[data-dirt]').forEach((patch) => patch.classList.toggle('is-clean', step.cleaned.includes(patch.getAttribute('data-dirt'))));
      if (robotActor?.signal) {
        robotActor.signal.setAttribute('data-signal', step.signal || '');
        robotActor.signal.querySelector('text').textContent = step.signal || '';
      }
      battery(typeof step.battery === 'number' ? step.battery : 100);
      buildFacts(facts, step, spec);
      buildNarrator(narrator, step.narrator);
      focusTargets(step);
      counter.textContent = `${index + 1}/${spec.steps.length}`;
      prev.disabled = index === 0;
      next.disabled = index === spec.steps.length - 1;
      [...dots.children].forEach((dot, i) => {
        dot.classList.toggle('is-current', i === index);
        dot.setAttribute('aria-current', i === index ? 'step' : 'false');
      });

      const from = viewBoxOf(svg), cameraAt = byId.get(step.activeActor)?.center || cellAt;
      const target = cameraFor(cameraAt, content, overview);
      const robotFrom = robotAt;
      cancelAnimationFrame(animation);
      if (!animate || reduce.matches) {
        setRobot(cellAt); robotAt = cellAt;
        svg.setAttribute('viewBox', viewText(target));
        scaleLabels(target.w / overview.w);
        host.dataset.settled = 'true';
        syncFocus();
      } else {
        host.dataset.settled = 'false';
        const start = global.performance.now();
        const frame = (now) => {
          const t = clamp((now - start) / EASE_MS, 0, 1), e = ease(t);
          const current = {
            x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e),
            w: lerp(from.w, target.w, e), h: lerp(from.h, target.h, e),
          };
          setRobot(point(robotFrom, cellAt, e));
          svg.setAttribute('viewBox', viewText(current));
          scaleLabels(current.w / overview.w);
          syncFocus();
          if (t < 1) animation = requestAnimationFrame(frame);
          else { setRobot(cellAt); robotAt = cellAt; host.dataset.settled = 'true'; syncFocus(); }
        };
        animation = requestAnimationFrame(frame);
      }
    }

    function go(nextIndex, animate = true) {
      stopPlay();
      index = clamp(nextIndex, 0, spec.steps.length - 1);
      draw(animate);
    }
    spec.steps.forEach((_, i) => {
      const dot = element('span', '', { class: 'lk-stage-dot', 'data-step': String(i + 1) });
      dots.append(dot);
    });
    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    play.addEventListener('click', () => {
      if (playing) { stopPlay(); return; }
      if (index >= spec.steps.length - 1) go(0, false);
      playing = true;
      play.setAttribute('aria-pressed', 'true');
      playTimer = setInterval(() => {
        if (index >= spec.steps.length - 1) { stopPlay(); return; }
        index += 1;
        draw(false);
      }, 1200);
    });
    global.addEventListener?.('resize', syncFocus);
    host.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    });
    host.go = go;
    host.stepCount = spec.steps.length;
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
          console.error('lk-stage:', error);
          this.replaceChildren(element('p', error.message, { class: 'lk-stage-error', role: 'alert' }));
          this.dataset.ready = 'error';
        });
      }
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
