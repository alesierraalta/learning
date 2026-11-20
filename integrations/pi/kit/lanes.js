/* lk-lanes — a declared shared-resource timeline. Plain browser JavaScript, no
   build step and no runtime dependency. The renderer owns layout (percentages,
   lanes, straight/one-bend connectors, labels and arrows); the spec owns only
   time, identity and wording. */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const TONES = ['neutral', 'good', 'bad', 'warn', 'info'];
  const FACTS = ['critical', 'slack', 'conflict', 'wait'];
  const ITEM_KINDS = ['bar', 'point', 'milestone'];
  const LINK_KINDS = ['dependency', 'message'];
  const ROOT_KEYS = ['form', 'kicker', 'question', 'focus', 'timeUnit', 'timeMax', 'lanes', 'items', 'links', 'resources', 'steps'];
  const LANE_KEYS = ['id', 'name', 'role', 'color', 'icon'];
  const RESOURCE_KEYS = ['id', 'name', 'color', 'icon'];
  const ITEM_KEYS = ['id', 'lane', 'label', 'kind', 'start', 'end', 'resource', 'note'];
  const RESOURCE_REF_KEYS = ['id', 'waitFrom'];
  const LINK_KEYS = ['id', 'from', 'to', 'kind', 'verb', 'tone'];
  const STEP_KEYS = ['title', 'time', 'reveal', 'highlight', 'links', 'facts', 'narrator'];

  /* Lucide-shaped inline icons: a lane names an icon, never an asset URL. */
  const ICONS = {
    knife: '<path d="M4 20l9-9M12 4c3 0 5 2 5 5 0 4-4 6-6 6 0-2 2-6 1-11z"/><path d="M3 21l3-3"/>',
    flame: '<path d="M12 22c4 0 7-3 7-7 0-4-4-6-4-10-3 2-4 4-4 6-2-1-3-3-3-5-2 2-3 5-3 9 0 4 3 7 7 7z"/><path d="M12 22c2 0 3-1.5 3-3.5 0-2-2-3-2-5-1 1-2 2-2 3-1-.5-1.5-1.5-1.5-2.5C8 15 9 22 12 22z"/>',
    'cake-slice': '<path d="M3 20h18M5 20v-6c0-2 3-3 7-3s7 1 7 3v6M5 14c2 1 4 1 7 0s5-1 7 0M12 11V7M12 7c-1-2 1-3 0-4"/>',
    oven: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h2M15 6.5h2M7 14h10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    alert: '<path d="M12 3L2 20h20L12 3zM12 9v5M12 17h.01"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H14a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8"/>',
  };

  class LanesSpecError extends Error {
    constructor(path, value, reason) {
      super(`spec error · ${path || 'spec'} = ${shown(value)} — ${reason}`);
      this.name = 'LanesSpecError';
      this.path = path;
      this.value = value;
      this.reason = reason;
    }
  }
  const shown = (value) => { const text = JSON.stringify(value); return text === undefined ? String(value) : text; };
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const num = (value) => typeof value === 'number' && Number.isFinite(value);
  const fail = (path, value, reason) => { throw new LanesSpecError(path, value, reason); };
  const hexColour = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  function knownKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(path ? `${path}.${key}` : key, value[key], 'unknown key');
    }
  }
  function noCoordinates(value, path) {
    if (Array.isArray(value)) value.forEach((item, i) => noCoordinates(item, `${path}[${i}]`));
    else if (object(value)) for (const [key, item] of Object.entries(value)) {
      const at = path ? `${path}.${key}` : key;
      if (key === 'x' || key === 'y') fail(at, item, 'unknown key (the renderer computes layout)');
      noCoordinates(item, at);
    }
  }
  function array(value, path) {
    if (!Array.isArray(value)) fail(path, value, 'expected an array');
    return value;
  }
  function unique(ids, path) {
    if (new Set(ids).size !== ids.length) fail(path, ids, `duplicate id in ${shown(ids)}`);
  }
  function validateChips(line, path, tones) {
    if (!text(line)) fail(path, line, 'expected a caption line');
    const pattern = /\[([^\]|]+)\|([^\]]+)\]/g;
    let cursor = 0, match;
    while ((match = pattern.exec(line)) !== null) {
      if (/[\[\]]/.test(line.slice(cursor, match.index))) fail(path, line, 'malformed chip');
      const tone = match[2].trim();
      if (!tones.includes(tone)) fail(path, tone, `unknown tone or lane id`);
      cursor = match.index + match[0].length;
    }
    if (/[\[\]]/.test(line.slice(cursor))) fail(path, line, 'malformed chip');
  }

  /** Loud, path-and-value validation: no silent fallback, ever. */
  function validate(spec) {
    if (!object(spec)) fail('spec', spec, 'expected an object');
    noCoordinates(spec, '');
    knownKeys(spec, ROOT_KEYS, 'spec');
    if (spec.form !== 'timeline') fail('form', spec.form, 'expected "timeline"');
    for (const key of ['kicker', 'question', 'focus', 'timeUnit']) {
      if (!text(spec[key])) fail(key, spec[key], 'expected non-empty text');
    }
    if (!text(spec.focus) || spec.question.toLowerCase().indexOf(spec.focus.toLowerCase()) < 0) {
      fail('focus', spec.focus, `does not occur in question ${shown(spec.question)}`);
    }
    if (!Number.isInteger(spec.timeMax) || spec.timeMax <= 0 || spec.timeMax > 1000) {
      fail('timeMax', spec.timeMax, 'expected a positive number of time units');
    }

    const lanes = array(spec.lanes, 'lanes');
    if (!lanes.length) fail('lanes', lanes, 'expected at least one lane');
    lanes.forEach((lane, i) => {
      const at = `lanes[${i}]`;
      if (!object(lane)) fail(at, lane, 'expected an object');
      knownKeys(lane, LANE_KEYS, at);
      if (!text(lane.id)) fail(`${at}.id`, lane.id, 'expected an id');
      if (!text(lane.name)) fail(`${at}.name`, lane.name, 'expected text');
      if (lane.role !== undefined && !text(lane.role)) fail(`${at}.role`, lane.role, 'expected text');
      if (!hexColour(lane.color)) fail(`${at}.color`, lane.color, 'expected a #rrggbb colour');
      if (lane.icon !== undefined && !(lane.icon in ICONS)) fail(`${at}.icon`, lane.icon, 'unknown icon name');
    });
    const laneIds = lanes.map((lane) => lane.id);
    unique(laneIds, 'lanes');

    const resources = spec.resources === undefined ? [] : array(spec.resources, 'resources');
    resources.forEach((resource, i) => {
      const at = `resources[${i}]`;
      if (!object(resource)) fail(at, resource, 'expected an object');
      knownKeys(resource, RESOURCE_KEYS, at);
      if (!text(resource.id)) fail(`${at}.id`, resource.id, 'expected an id');
      if (!text(resource.name)) fail(`${at}.name`, resource.name, 'expected text');
      if (resource.color !== undefined && !hexColour(resource.color)) fail(`${at}.color`, resource.color, 'expected a #rrggbb colour');
      if (resource.icon !== undefined && !(resource.icon in ICONS)) fail(`${at}.icon`, resource.icon, 'unknown icon name');
    });
    const resourceIds = resources.map((resource) => resource.id);
    unique(resourceIds, 'resources');

    const items = array(spec.items, 'items');
    if (!items.length) fail('items', items, 'expected at least one item');
    items.forEach((item, i) => {
      const at = `items[${i}]`;
      if (!object(item)) fail(at, item, 'expected an object');
      knownKeys(item, ITEM_KEYS, at);
      if (!text(item.id)) fail(`${at}.id`, item.id, 'expected an id');
      if (!laneIds.includes(item.lane)) fail(`${at}.lane`, item.lane, `not a declared lane (lanes: ${laneIds.map(shown).join(', ')})`);
      if (!text(item.label)) fail(`${at}.label`, item.label, 'expected text');
      if (!ITEM_KINDS.includes(item.kind)) fail(`${at}.kind`, item.kind, 'expected a bar, point or milestone');
      if (!num(item.start) || item.start < 0 || item.start > spec.timeMax) fail(`${at}.start`, item.start, `outside [0, ${spec.timeMax}]`);
      if (item.kind === 'bar') {
        if (!num(item.end)) fail(`${at}.end`, item.end, 'expected a number');
        if (item.end < item.start) fail(`${at}.end`, item.end, `before start ${shown(item.start)}`);
        if (item.end > spec.timeMax) fail(`${at}.end`, item.end, `outside [0, ${spec.timeMax}]`);
      } else if (item.end !== undefined) fail(`${at}.end`, item.end, `not allowed on a ${item.kind}`);
      if (item.note !== undefined && !text(item.note)) fail(`${at}.note`, item.note, 'expected text');
      if (item.resource !== undefined) {
        if (item.kind !== 'bar') fail(`${at}.resource`, item.resource, `cannot hold a resource on a ${item.kind}`);
        if (!object(item.resource)) fail(`${at}.resource`, item.resource, 'expected an object');
        knownKeys(item.resource, RESOURCE_REF_KEYS, `${at}.resource`);
        if (!resourceIds.includes(item.resource.id)) fail(`${at}.resource.id`, item.resource.id, `not a declared resource (resources: ${resourceIds.map(shown).join(', ')})`);
        if (item.resource.waitFrom !== undefined) {
          if (!num(item.resource.waitFrom) || item.resource.waitFrom < 0) fail(`${at}.resource.waitFrom`, item.resource.waitFrom, 'expected a time');
          if (item.resource.waitFrom >= item.start) fail(`${at}.resource.waitFrom`, item.resource.waitFrom, 'nothing would be waiting');
        }
      }
    });
    const itemIds = items.map((item) => item.id);
    unique(itemIds, 'items');
    const byId = new Map(items.map((item) => [item.id, item]));
    const finishOf = (item) => (item.kind === 'bar' ? item.end : item.start);

    const links = array(spec.links, 'links');
    links.forEach((link, i) => {
      const at = `links[${i}]`;
      if (!object(link)) fail(at, link, 'expected an object');
      knownKeys(link, LINK_KEYS, at);
      if (!text(link.id)) fail(`${at}.id`, link.id, 'expected an id');
      if (!itemIds.includes(link.from)) fail(`${at}.from`, link.from, `not a declared item (items: ${itemIds.map(shown).join(', ')})`);
      if (!itemIds.includes(link.to)) fail(`${at}.to`, link.to, `not a declared item (items: ${itemIds.map(shown).join(', ')})`);
      if (link.from === link.to) fail(`${at}.to`, link.to, 'same item as from');
      if (!LINK_KINDS.includes(link.kind)) fail(`${at}.kind`, link.kind, 'expected a dependency or a message');
      if (link.kind === 'dependency' && finishOf(byId.get(link.from)) > byId.get(link.to).start) {
        fail(`${at}.to`, byId.get(link.to).start, `before ${shown(link.from)} finishes at ${shown(finishOf(byId.get(link.from)))}`);
      }
      if (link.kind === 'message' && !text(link.verb)) fail(`${at}.verb`, link.verb, 'expected a message verb');
      if (link.tone !== undefined && ![...TONES, ...laneIds].includes(link.tone)) fail(`${at}.tone`, link.tone, 'unknown tone or lane id');
    });
    unique(links.map((link) => link.id), 'links');

    const steps = array(spec.steps, 'steps');
    if (!steps.length) fail('steps', steps, 'expected at least one step');
    const tones = [...TONES, ...laneIds];
    steps.forEach((step, i) => {
      const at = `steps[${i}]`;
      if (!object(step)) fail(at, step, 'expected an object');
      knownKeys(step, STEP_KEYS, at);
      if (!text(step.title)) fail(`${at}.title`, step.title, 'expected text');
      if (!num(step.time) || step.time < 0 || step.time > spec.timeMax) fail(`${at}.time`, step.time, `outside [0, ${spec.timeMax}]`);
      for (const key of ['reveal', 'highlight', 'links', 'facts']) {
        array(step[key], `${at}.${key}`);
      }
      step.reveal.forEach((id, j) => { if (!itemIds.includes(id)) fail(`${at}.reveal[${j}]`, id, 'not a declared item'); });
      step.highlight.forEach((id, j) => { if (!itemIds.includes(id)) fail(`${at}.highlight[${j}]`, id, 'not a declared item'); });
      step.links.forEach((id, j) => { if (!links.some((link) => link.id === id)) fail(`${at}.links[${j}]`, id, 'not a declared link'); });
      step.facts.forEach((fact, j) => { if (!FACTS.includes(fact)) fail(`${at}.facts[${j}]`, fact, 'not a derived fact'); });
      if (step.highlight.length > 2) fail(`${at}.highlight`, step.highlight, 'expected at most two focus outlines');
      if (!Array.isArray(step.narrator) || !step.narrator.length) fail(`${at}.narrator`, step.narrator, 'expected at least one caption line');
      step.narrator.forEach((line, j) => validateChips(line, `${at}.narrator[${j}]`, tones));
    });
    return spec;
  }

  /** Derived facts: critical chain, slack, resource waits and claim overlaps. */
  function compute(spec) {
    const byId = new Map(spec.items.map((item) => [item.id, item]));
    const duration = (item) => (item.kind === 'bar' ? item.end - item.start : 0);
    const deps = spec.links.filter((link) => link.kind === 'dependency');
    const parents = new Map(spec.items.map((item) => [item.id, []]));
    const children = new Map(spec.items.map((item) => [item.id, []]));
    for (const link of deps) {
      parents.get(link.to).push(link.from);
      children.get(link.from).push(link.to);
    }
    const indegree = new Map(spec.items.map((item) => [item.id, parents.get(item.id).length]));
    const queue = spec.items.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const child of children.get(id)) {
        indegree.set(child, indegree.get(child) - 1);
        if (indegree.get(child) === 0) queue.push(child);
      }
    }
    if (order.length !== spec.items.length) {
      const stuck = spec.items.filter((item) => indegree.get(item.id) > 0).map((item) => item.id);
      fail('links', stuck, `dependency graph has a cycle involving ${shown(stuck)}`);
    }
    const ES = new Map(), EF = new Map();
    for (const id of order) {
      const before = parents.get(id);
      ES.set(id, before.length ? Math.max(...before.map((parent) => EF.get(parent))) : 0);
      EF.set(id, ES.get(id) + duration(byId.get(id)));
    }
    const projectFinish = Math.max(...spec.items.map((item) => EF.get(item.id)));
    const LS = new Map(), LF = new Map(), slack = new Map();
    for (const id of [...order].reverse()) {
      const after = children.get(id);
      LF.set(id, after.length ? Math.min(...after.map((child) => LS.get(child))) : projectFinish);
      LS.set(id, LF.get(id) - duration(byId.get(id)));
      slack.set(id, Math.round((LS.get(id) - ES.get(id)) * 1e6) / 1e6);
    }
    const critical = new Set(spec.items.filter((item) => slack.get(item.id) === 0).map((item) => item.id));
    const sinks = spec.items.filter((item) => !children.get(item.id).length && critical.has(item.id) && EF.get(item.id) === projectFinish);
    const chain = [];
    let cursor = sinks.length ? sinks[sinks.length - 1].id : null;
    while (cursor) {
      chain.unshift(cursor);
      const before = parents.get(cursor).filter((id) => critical.has(id) && EF.get(id) === ES.get(cursor));
      cursor = before.length ? before[before.length - 1] : null;
    }
    const claims = [], waits = [], conflicts = [];
    for (const item of spec.items) {
      if (!item.resource) continue;
      const claimFrom = item.resource.waitFrom === undefined ? item.start : item.resource.waitFrom;
      claims.push({ item: item.id, resource: item.resource.id, lane: item.lane, from: claimFrom, to: item.end });
      if (item.resource.waitFrom !== undefined) {
        waits.push({ item: item.id, resource: item.resource.id, lane: item.lane, from: item.resource.waitFrom, to: item.start });
      }
    }
    for (let i = 0; i < claims.length; i += 1) {
      for (let j = i + 1; j < claims.length; j += 1) {
        const a = claims[i], b = claims[j];
        if (a.resource !== b.resource || a.lane === b.lane) continue;
        const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
        if (to > from) conflicts.push({ resource: a.resource, a: a.item, b: b.item, lanes: [a.lane, b.lane], from, to });
      }
    }
    return {
      ES, EF, LS, LF, slack, projectFinish, critical, chain,
      criticalLinks: deps.filter((link) => critical.has(link.from) && critical.has(link.to)).map((link) => link.id),
      claims, waits, conflicts,
    };
  }

  const el = (tag, className, value, attrs = {}) => {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    for (const [key, item] of Object.entries(attrs)) node.setAttribute(key, String(item));
    return node;
  };
  const svgEl = (tag, attrs = {}, value) => {
    const node = global.document.createElementNS(NS, tag);
    for (const [key, item] of Object.entries(attrs)) node.setAttribute(key, String(item));
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const fmt = (value) => Number(value.toFixed(2)).toString().replace('.', ',');
  const pct = (value, max) => (value / max) * 100;
  function icon(name) {
    // ICONS holds fixed, authored path data; never interpolate spec text here.
    const markup = `<svg xmlns="${NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    const parsed = new global.DOMParser().parseFromString(markup, 'image/svg+xml');
    return global.document.importNode(parsed.documentElement, true);
  }
  function questionNode(spec) {
    const node = el('p', 'lk-ln-question');
    const at = spec.question.toLowerCase().indexOf(spec.focus.toLowerCase());
    node.append(
      global.document.createTextNode(spec.question.slice(0, at)),
      el('mark', 'lk-ln-mark', spec.question.slice(at, at + spec.focus.length)),
      global.document.createTextNode(spec.question.slice(at + spec.focus.length))
    );
    return node;
  }
  function caption(host, lines, spec) {
    host.replaceChildren();
    lines.forEach((line, i) => {
      const row = el('p', 'lk-ln-line');
      const pattern = /\[([^\]|]+)\|([^\]]+)\]/g;
      let cursor = 0, match;
      while ((match = pattern.exec(line)) !== null) {
        if (match.index > cursor) row.append(global.document.createTextNode(line.slice(cursor, match.index)));
        const tone = match[2].trim();
        const chip = el('span', 'lk-ln-chip' + (TONES.includes(tone) ? ` tone-${tone}` : ''), match[1]);
        if (!TONES.includes(tone)) {
          chip.dataset.lane = tone;
          chip.style.setProperty('--chip', (spec.lanes.find((lane) => lane.id === tone) || {}).color || 'var(--lk-ln-accent)');
        }
        row.append(chip);
        cursor = match.index + match[0].length;
      }
      if (cursor < line.length) row.append(global.document.createTextNode(line.slice(cursor)));
      if (i === lines.length - 1 && lines.length > 1) row.classList.add('is-conclusion');
      host.append(row);
    });
  }

  /** Mount one validated spec into one element; each element owns its state. */
  function mount(host, spec) {
    const facts = compute(spec);
    const laneIndex = new Map(spec.lanes.map((lane, i) => [lane.id, i]));
    const laneById = new Map(spec.lanes.map((lane) => [lane.id, lane]));
    const itemById = new Map(spec.items.map((item) => [item.id, item]));
    const resource = (spec.resources || [])[0];

    const figure = el('section', 'lk-ln-figure', null, { tabindex: '0', 'aria-label': 'Línea de tiempo' });
    figure.dataset.figure = 'timeline';
    const head = el('header', 'lk-ln-head');
    const headTop = el('div', 'lk-ln-head-top');
    headTop.append(el('span', 'lk-ln-kicker', spec.kicker), el('span', 'lk-ln-unit', `unidad: ${spec.timeUnit}`));
    const timeChip = el('span', 'lk-ln-time-chip', `t = 0`);
    const stepTitle = el('span', 'lk-ln-step-title-value');
    const stepLine = el('div', 'lk-ln-step-line');
    stepLine.append(stepTitle);
    head.append(headTop, questionNode(spec), stepLine, timeChip);

    const surface = el('div', 'lk-ln-surface', null, { 'aria-label': 'Línea de tiempo y recursos compartidos' });
    const axis = el('div', 'lk-ln-axis');
    axis.append(el('div', 'lk-ln-axis-corner', `carril · ${spec.timeUnit}`));
    const axisPlot = el('div', 'lk-ln-axis-plot');
    const ticks = [...new Set([...Array.from({ length: Math.ceil(spec.timeMax / 2) }, (_, i) => i * 2), spec.timeMax].filter((tick) => tick <= spec.timeMax))];
    for (const tick of ticks) {
      axisPlot.append(el('span', 'lk-ln-tick', String(tick), {
        'data-first': tick === 0 ? 'true' : 'false',
        'data-last': tick === spec.timeMax ? 'true' : 'false',
        style: `left:${pct(tick, spec.timeMax)}%`,
      }));
    }
    axis.append(axisPlot);

    const body = el('div', 'lk-ln-body');
    const names = el('div', 'lk-ln-lane-names');
    for (const lane of spec.lanes) {
      const name = el('div', 'lk-ln-lane-name', null, { style: `--lane:${lane.color}` });
      const glyph = el('span', 'lk-ln-lane-glyph');
      glyph.append(icon(lane.icon || 'arrow'));
      const words = el('span', 'lk-ln-lane-text');
      words.append(el('b', 'lk-ln-lane-title', lane.name), el('small', 'lk-ln-lane-role', lane.role || ''));
      name.append(glyph, words);
      names.append(name);
    }
    const resourceName = el('div', 'lk-ln-resource-name');
    if (resource) {
      resourceName.style.setProperty('--res', resource.color || 'var(--lk-ln-warm)');
      const glyph = el('span', 'lk-ln-lane-glyph');
      glyph.append(icon(resource.icon || 'oven'));
      const words = el('span', 'lk-ln-lane-text');
      words.append(el('b', 'lk-ln-lane-title', resource.name), el('small', 'lk-ln-lane-role', 'recurso compartido'));
      resourceName.append(glyph, words);
    }
    names.append(resourceName);

    const plot = el('div', 'lk-ln-plot-stack', null, { style: `--tick-step:${100 / spec.timeMax}%` });
    const tracks = el('div', 'lk-ln-lane-tracks');
    const itemNodes = new Map();
    for (const lane of spec.lanes) {
      const track = el('div', 'lk-ln-track', null, { 'data-lane': lane.id });
      for (const item of spec.items.filter((candidate) => candidate.lane === lane.id)) {
        const node = el('div', 'lk-ln-item', null, {
          class: 'lk-ln-item', 'data-item': item.id, 'data-kind': item.kind,
          'data-lane': item.lane, style: `--lane:${lane.color}`,
        });
        node.style.left = `${pct(item.start, spec.timeMax)}%`;
        if (item.kind === 'bar') node.style.width = `${pct(item.end - item.start, spec.timeMax)}%`;
        const label = el('span', 'lk-ln-item-label', item.label);
        if (item.kind !== 'bar' && item.start === 0) label.dataset.edge = 'first';
        if (item.kind !== 'bar' && item.start === spec.timeMax) label.dataset.edge = 'last';
        if (item.kind === 'bar' && spec.items.some((other) => other.lane === item.lane && other.kind !== 'bar' && other.start === item.start)) label.dataset.edge = 'far';
        node.append(label);
        if (item.kind === 'bar') node.append(el('span', 'lk-ln-slack', null, { 'data-slack': item.id }));
        track.append(node);
        itemNodes.set(item.id, node);
      }
      tracks.append(track);
    }
    plot.append(tracks);

    const linksLayer = svgEl('svg', { class: 'lk-ln-links', 'aria-hidden': 'true' });
    const defs = svgEl('defs');
    const marker = svgEl('marker', { id: 'lk-ln-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--lk-ln-muted)' }));
    defs.append(marker);
    linksLayer.append(defs);
    plot.append(linksLayer);
    const linkLabels = el('div', 'lk-ln-link-labels');
    plot.append(linkLabels);

    const strip = el('div', 'lk-ln-resource-strip');
    const waitNodes = [], conflictNodes = [];
    for (const claim of facts.claims) {
      const item = itemById.get(claim.item);
      const lane = laneById.get(claim.lane);
      const hold = el('div', 'lk-ln-resource-hold', lane.name, {
        'data-hold': claim.item, style: `left:${pct(item.start, spec.timeMax)}%;width:${pct(item.end - item.start, spec.timeMax)}%;--lane:${lane.color}`,
      });
      strip.append(hold);
    }
    for (const wait of facts.waits) {
      const node = el('div', 'lk-ln-resource-wait', 'espera', {
        'data-wait': wait.item, 'data-from': String(wait.from), 'data-to': String(wait.to),
        style: `left:${pct(wait.from, spec.timeMax)}%;width:${pct(wait.to - wait.from, spec.timeMax)}%`,
      });
      strip.append(node);
      waitNodes.push(node);
    }
    for (const conflict of facts.conflicts) {
      const node = el('div', 'lk-ln-resource-conflict', `conflicto ${fmt(conflict.from)}–${fmt(conflict.to)}`, {
        'data-conflict': `${conflict.a}|${conflict.b}`,
        style: `left:${pct(conflict.from, spec.timeMax)}%;width:${pct(conflict.to - conflict.from, spec.timeMax)}%`,
      });
      strip.append(node);
      conflictNodes.push(node);
    }
    plot.append(strip);
    const playhead = el('div', 'lk-ln-playhead', null, { 'aria-hidden': 'true' });
    plot.append(playhead);
    body.append(names, plot);
    surface.append(axis, body);

    const factsHost = el('div', 'lk-ln-facts', null, { 'aria-live': 'polite' });
    const factNodes = {};
    for (const fact of FACTS) {
      factNodes[fact] = el('div', 'lk-ln-fact', null, { 'data-fact': fact, hidden: 'hidden' });
      factsHost.append(factNodes[fact]);
    }
    const captionHost = el('section', 'lk-ln-caption', null, { 'aria-label': 'Explicación del paso', 'aria-live': 'polite' });
    figure.append(head, surface, factsHost, captionHost);

    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const originRect = () => plot.getBoundingClientRect();
    const rectInPlot = (node, origin) => {
      const r = node.getBoundingClientRect();
      return { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top,
        bottom: r.bottom - origin.top, width: r.width, height: r.height };
    };
    /** Straight or exactly one bend; the last point always sits on a target edge. */
    function drawLinks(activeIds) {
      linkLabels.replaceChildren();
      const w = plot.clientWidth, h = tracks.clientHeight;
      if (!w || !h) return;
      linksLayer.setAttribute('viewBox', `0 0 ${w} ${h}`);
      for (const child of [...linksLayer.children]) if (child.tagName !== 'defs') child.remove();
      const origin = originRect();
      const targetCounts = new global.Map();
      for (const link of spec.links) {
        if (!activeIds.includes(link.id)) continue;
        const from = itemById.get(link.from), to = itemById.get(link.to);
        const fromLane = laneIndex.get(from.lane);
        const fr = rectInPlot(itemNodes.get(from.id), origin);
        const tr = rectInPlot(itemNodes.get(to.id), origin);
        const start = [from.kind === 'bar' ? fr.right : fr.left + fr.width / 2, fr.top + fr.height / 2];
        const sameTarget = targetCounts.get(link.to) || 0;
        targetCounts.set(link.to, sameTarget + 1);
        let end;
        if (to.kind !== 'bar') end = [tr.left + tr.width / 2, tr.bottom];
        else if (link.kind === 'message') end = [tr.left + 8, tr.top];
        else if (sameTarget || fromLane > laneIndex.get(to.lane)) end = [tr.left + 8, tr.top];
        else end = [tr.left, tr.top + tr.height / 2];
        const points = Math.abs(end[0] - start[0]) < .6 || Math.abs(end[1] - start[1]) < .6
          ? [start, end]
          : from.kind === 'bar' ? [start, [end[0], start[1]], end] : [start, [start[0], end[1]], end];
        const d = points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(' ');
        const g = svgEl('g', { class: 'lk-ln-link', 'data-link': link.id, 'data-kind': link.kind });
        g.append(svgEl('path', {
          class: 'lk-ln-link-path', d, 'data-points': String(points.length),
          'marker-end': 'url(#lk-ln-arrow)',
        }));
        linksLayer.append(g);
        if (link.kind === 'message') {
          const label = el('span', 'lk-ln-link-label', link.verb, { 'data-link-label': link.id });
          if (link.tone && TONES.includes(link.tone)) label.dataset.tone = link.tone;
          linkLabels.append(label);
          const half = label.offsetWidth / 2 + 3;
          label.style.left = `${clamp(tr.left + 20, half, w - half)}px`;
          label.style.top = `${Math.min(h - 12, fromLane * 72 + 68)}px`;
        }
      }
    }

    let index = 0;
    function go(next) {
      index = Math.max(0, Math.min(spec.steps.length - 1, next));
      const step = spec.steps[index];
      const show = new Set(step.facts);
      figure.dataset.step = String(index + 1);
      stepTitle.textContent = step.title;
      timeChip.textContent = `t = ${fmt(step.time)}`;
      playhead.style.left = `${pct(step.time, spec.timeMax)}%`;
      const focusTone = show.has('conflict') ? 'lk-ln-focus-wrong'
        : show.has('wait') ? 'lk-ln-focus-keep' : 'lk-ln-focus-look';
      for (const item of spec.items) {
        const node = itemNodes.get(item.id);
        const focused = step.highlight.includes(item.id);
        const conflicted = show.has('conflict') && facts.conflicts.some((c) => c.a === item.id || c.b === item.id);
        node.classList.toggle('is-pending', !step.reveal.includes(item.id));
        node.classList.toggle('is-dim', step.reveal.includes(item.id) && !focused);
        node.classList.remove('lk-ln-focus', 'lk-ln-focus-look', 'lk-ln-focus-keep', 'lk-ln-focus-wrong');
        node.removeAttribute('data-focus');
        if (focused) {
          node.classList.add('lk-ln-focus', conflicted ? 'lk-ln-focus-wrong' : focusTone);
          node.dataset.focus = conflicted ? 'red' : show.has('wait') ? 'green' : 'blue';
        }
      }
      for (const node of figure.querySelectorAll('[data-slack]')) {
        const value = facts.slack.get(node.dataset.slack);
        node.textContent = show.has('slack') && value > 0 ? `holgura ${fmt(value)}` : '';
      }
      for (const node of waitNodes) node.hidden = !show.has('wait');
      for (const node of conflictNodes) node.hidden = !show.has('conflict');
      drawLinks(step.links);
      const chainNames = facts.chain.map((id) => itemById.get(id).label).join(' → ');
      factNodes.critical.hidden = !show.has('critical');
      factNodes.critical.replaceChildren(el('b', '', 'RUTA CRÍTICA'),
        global.document.createTextNode(` ${chainNames} · ${fmt(facts.projectFinish)} ${spec.timeUnit}`));
      factNodes.slack.hidden = !show.has('slack');
      const loose = spec.items.filter((item) => facts.slack.get(item.id) > 0)
        .map((item) => `${item.label} ${fmt(facts.slack.get(item.id))}`).join(', ');
      factNodes.slack.replaceChildren(el('b', '', 'HOLGURA'), global.document.createTextNode(` ${loose || 'ninguna'} ${spec.timeUnit}`));
      factNodes.conflict.hidden = !show.has('conflict');
      factNodes.conflict.replaceChildren(el('b', '', 'CONFLICTO'), global.document.createTextNode(
        ` ${facts.conflicts.map((c) => `${laneById.get(c.lanes[0]).name} / ${laneById.get(c.lanes[1]).name} ${fmt(c.from)}–${fmt(c.to)}`).join('; ') || 'ninguno'}`));
      factNodes.wait.hidden = !show.has('wait');
      factNodes.wait.replaceChildren(el('b', '', 'ESPERA'), global.document.createTextNode(
        ` ${facts.waits.map((w) => `${itemById.get(w.item).label} ${fmt(w.from)}–${fmt(w.to)}`).join('; ') || 'ninguna'}`));
      caption(captionHost, step.narrator, spec);
    }

    const playerHost = el('div', 'lk-ln-player-host');
    figure.append(playerHost);
    const controls = el('div', 'lk-ln-controls');
    const prev = el('button', 'lk-ln-btn', '← Anterior', { type: 'button', 'aria-label': 'Paso anterior' });
    const play = el('button', 'lk-ln-btn lk-ln-play', '▶ Reproducir', { type: 'button', 'aria-label': 'Reproducir pasos' });
    const next = el('button', 'lk-ln-btn', 'Siguiente →', { type: 'button', 'aria-label': 'Paso siguiente' });
    controls.append(prev, play, next);
    const segments = el('div', 'lk-ln-segments', null, { role: 'group', 'aria-label': 'Progreso por pasos' });
    const dots = spec.steps.map((step, i) => {
      const dot = el('button', 'lk-ln-seg', null, { type: 'button', 'aria-label': `Ir al paso ${i + 1}: ${step.title}` });
      segments.append(dot);
      return dot;
    });
    const count = el('span', 'lk-ln-count');
    const player = el('div', 'lk-ln-player', null, { role: 'group', 'aria-label': 'Reproductor' });
    player.append(controls, segments, count);
    playerHost.append(player);
    let timer = 0;
    function stop() {
      if (timer) global.clearInterval(timer);
      timer = 0;
      play.textContent = '▶ Reproducir';
      play.setAttribute('aria-label', 'Reproducir pasos');
    }
    function goto(nextIndex, fromPlay = false) {
      if (!fromPlay) stop();
      go(nextIndex);
      count.textContent = `${index + 1}/${spec.steps.length}`;
      prev.disabled = index === 0;
      next.disabled = index === spec.steps.length - 1;
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-done', i < index);
        dot.classList.toggle('is-current', i === index);
        dot.setAttribute('aria-current', i === index ? 'step' : 'false');
      });
      if (fromPlay && index === spec.steps.length - 1) stop();
    }
    prev.addEventListener('click', () => goto(index - 1));
    next.addEventListener('click', () => goto(index + 1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => goto(i)));
    play.addEventListener('click', () => {
      if (timer) { stop(); return; }
      if (index === spec.steps.length - 1) goto(0);
      play.textContent = '❚❚ Pausar';
      play.setAttribute('aria-label', 'Pausar pasos');
      timer = global.setInterval(() => goto(index + 1, true),
        global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1800 : 1500);
    });
    figure.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('button')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); goto(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goto(index - 1); }
    });
    // Keep the author's JSON in the element: gates read it after rendering.
    const scripts = [...host.querySelectorAll(':scope > script')];
    host.replaceChildren(...scripts, figure);
    goto(0);
    const redraw = () => drawLinks(spec.steps[index].links);
    if (global.ResizeObserver) new global.ResizeObserver(redraw).observe(plot);
    return { figure, facts, goto, stop, drawLinks };
  }

  const api = { validate, compute, mount, LanesSpecError, ICONS };
  global.lkLanes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (global.customElements && !global.customElements.get('lk-lanes')) {
    global.customElements.define('lk-lanes', class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        Promise.resolve().then(() => {
          const script = this.querySelector(':scope > script[type="application/json"]');
          if (!script) fail('spec', undefined, 'expected a direct inline JSON script');
          let raw;
          try { raw = JSON.parse(script.textContent); }
          catch (error) { fail('spec', script.textContent, `invalid JSON: ${error.message}`); }
          this.api = mount(this, validate(raw));
          this.dataset.ready = 'true';
        }).catch((error) => {
          const message = error instanceof LanesSpecError ? error.message
            : `spec error · ${String(error && error.message || error)}`;
          this.replaceChildren(el('p', 'lk-ln-error', message, { role: 'alert' }));
          this.dataset.error = 'true';
          this.dataset.ready = 'error';
        });
      }
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
