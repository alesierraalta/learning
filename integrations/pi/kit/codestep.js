/* lk-codestep — a declared code stepper. Plain browser JavaScript, no build
   step and no runtime dependency. The renderer owns the window, the folds, the
   state panels and the focus marks; the spec only names what to show. */
(function (global) {
  'use strict';

  const WIDGETS = ['vars', 'stack', 'output', 'queue', 'flags'];
  const TOP_KEYS = ['title', 'language', 'code', 'window', 'regions', 'steps'];
  const STEP_KEYS = ['line', 'state', 'narrator', 'focus'];
  const TONES = ['good', 'bad', 'warn', 'info', 'neutral'];
  const CHIP = /\[([^\]|]+)\|([a-z]+)\]/g;
  const KEYWORDS = {
    python: new Set(['def', 'if', 'elif', 'else', 'for', 'in', 'while', 'return', 'not', 'and', 'or',
      'None', 'True', 'False', 'class', 'with', 'as', 'import', 'from', 'lambda', 'yield', 'break',
      'continue', 'pass', 'try', 'except']),
    c: new Set(['int', 'char', 'float', 'double', 'void', 'if', 'else', 'for', 'while', 'do', 'return',
      'struct', 'const', 'static', 'sizeof', 'break', 'continue', 'switch', 'case', 'default', 'NULL']),
    plsql: new Set(['declare', 'begin', 'end', 'if', 'then', 'elsif', 'else', 'loop', 'while', 'for',
      'return', 'select', 'into', 'from', 'where', 'null', 'exception', 'function', 'procedure',
      'is', 'raise', 'commit', 'rollback'])
  };
  const COMMENTS = {
    python: '#.*', c: '\\/\\/.*|\\/\\*.*?\\*\\/', plsql: '--.*|\\/\\*.*?\\*\\/'
  };

  class CodeStepSpecError extends Error {
    constructor(path, value, reason) {
      super(`spec error · ${path} = ${shown(value)} — ${reason}`);
      this.name = 'CodeStepSpecError';
      this.path = path;
      this.value = value;
      this.reason = reason;
    }
  }
  const shown = (value) => {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  };
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const primitive = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
  const fail = (path, value, reason) => { throw new CodeStepSpecError(path, value, reason); };

  function knownKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(`${path ? path + '.' : ''}${key}`, value[key], 'unknown key');
    }
  }

  /** Normalise the optional named line ranges. Errors name the exact key. */
  function normalizeRegions(regions, total) {
    if (!object(regions) && !Array.isArray(regions)) {
      fail('spec.regions', regions, 'expected an array or name/ranges object');
    }
    const entries = Array.isArray(regions)
      ? regions.map((value, i) => ({ path: `regions[${i}]`, name: value && value.name, from: value && value.from, to: value && value.to }))
      : Object.entries(regions).map(([name, value]) => ({ path: `regions.${name}`, name, from: value && value.from, to: value && value.to }));
    return entries.map(({ path, name, from, to }) => {
      if (typeof name !== 'string' || !name) fail(`${path}.name`, name, 'expected a non-empty string');
      if (!Number.isInteger(from) || from < 1 || from > total) {
        fail(`${path}.from`, from, `line out of range (expected 1..${total})`);
      }
      if (!Number.isInteger(to) || to < 1 || to > total) {
        fail(`${path}.to`, to, `line out of range (expected 1..${total})`);
      }
      if (from > to) fail(path, { name, from, to }, 'from must be <= to');
      return { name, from, to };
    });
  }

  function chipsOf(line, path) {
    for (const match of line.matchAll(CHIP)) {
      if (!TONES.includes(match[2])) fail(path, match[0], 'unknown tone');
    }
  }

  /** DOM-free validation: the element shows the located error instead of throwing. */
  function validate(spec) {
    if (!object(spec)) fail('spec', spec, 'expected an object');
    knownKeys(spec, TOP_KEYS, 'spec');
    if (typeof spec.title !== 'string') fail('spec.title', spec.title, 'expected a string');
    if (typeof spec.language !== 'string') fail('spec.language', spec.language, 'expected a string');
    if (!Array.isArray(spec.code) || !spec.code.length || spec.code.some((line) => typeof line !== 'string')) {
      fail('spec.code', spec.code, 'expected a non-empty array of strings');
    }
    if (spec.window !== undefined && (!Number.isInteger(spec.window) || spec.window < 1 || spec.window > 24)) {
      fail('spec.window', spec.window, 'expected an integer between 1 and 24');
    }
    if (spec.regions !== undefined) normalizeRegions(spec.regions, spec.code.length);
    if (!Array.isArray(spec.steps) || !spec.steps.length) {
      fail('spec.steps', spec.steps, 'expected a non-empty array');
    }
    spec.steps.forEach((step, i) => {
      const at = `steps[${i}]`;
      if (!object(step)) fail(at, step, 'expected an object');
      knownKeys(step, STEP_KEYS, at);
      const lines = Array.isArray(step.line) ? step.line : [step.line];
      if (!lines.length) fail(`${at}.line`, step.line, 'line out of range (empty)');
      lines.forEach((line, j) => {
        const path = Array.isArray(step.line) ? `${at}.line[${j}]` : `${at}.line`;
        if (!Number.isInteger(line) || line < 1 || line > spec.code.length) {
          fail(path, line, `line out of range (expected 1..${spec.code.length})`);
        }
      });
      if (!object(step.state)) fail(`${at}.state`, step.state, 'expected an object');
      for (const [widget, value] of Object.entries(step.state)) {
        const path = `${at}.state.${widget}`;
        if (!WIDGETS.includes(widget)) fail(path, value, 'unknown widget');
        if (widget === 'vars' || widget === 'flags') {
          if (!object(value)) fail(path, value, 'expected a name/value object');
          for (const [name, item] of Object.entries(value)) {
            if (widget === 'flags' && typeof item !== 'boolean') fail(`${path}.${name}`, item, 'expected a boolean');
            if (widget === 'vars' && !primitive(item)) fail(`${path}.${name}`, item, 'expected a primitive value');
          }
        } else if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
          fail(path, value, 'expected an array of strings');
        }
      }
      if (step.focus !== undefined && (typeof step.focus !== 'string' || !step.focus.trim()) &&
          !(Array.isArray(step.focus) && step.focus.length && step.focus.every((v) => typeof v === 'string' && v.trim()))) {
        fail(`${at}.focus`, step.focus, 'expected a non-empty string or array of strings');
      }
      if (!Array.isArray(step.narrator) || !step.narrator.length || step.narrator.some((line) => typeof line !== 'string')) {
        fail(`${at}.narrator`, step.narrator, 'expected a non-empty array of strings');
      }
      step.narrator.forEach((line, j) => chipsOf(line, `${at}.narrator[${j}]`));
    });
    return spec;
  }

  function tokenize(line, language) {
    if (!Object.hasOwn(KEYWORDS, language)) return [{ text: line, cls: '' }];
    const pattern = new RegExp(
      `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|${COMMENTS[language]}|\\b\\d+(?:\\.\\d+)?\\b|[A-Za-z_]\\w*)`,
      'g'
    );
    const tokens = [];
    let cursor = 0;
    for (const match of line.matchAll(pattern)) {
      if (match.index > cursor) tokens.push({ text: line.slice(cursor, match.index), cls: '' });
      const text = match[0];
      let cls = '';
      if (text.startsWith('"') || text.startsWith("'")) cls = 'tok-val';
      else if (COMMENTS[language] && new RegExp(`^(?:${COMMENTS[language]})`).test(text)) cls = 'tok-comment';
      else if (/^\d/.test(text)) cls = 'tok-val';
      else if (KEYWORDS[language].has(language === 'plsql' ? text.toLowerCase() : text)) cls = 'tok-key';
      else if (line[match.index + text.length] === '(') cls = 'tok-fn';
      tokens.push({ text, cls });
      cursor = match.index + text.length;
    }
    if (cursor < line.length) tokens.push({ text: line.slice(cursor), cls: '' });
    return tokens;
  }

  const activeLines = (step) => Array.isArray(step.line) ? step.line : [step.line];
  const formatValue = (value) => typeof value === 'string' ? JSON.stringify(value) : shown(value);

  function windowRange(total, active, size, regions) {
    const loActive = Math.min(...active), hiActive = Math.max(...active);
    const region = regions.find((r) => loActive >= r.from && hiActive <= r.to);
    const padding = Math.max(0, size - (hiActive - loActive + 1));
    let lo;
    if (region && region.to - region.from + 1 <= size) lo = region.from;
    else if (region) lo = Math.max(region.from, Math.min(loActive - Math.floor(padding / 2), region.to - size + 1));
    else lo = loActive - Math.floor(padding / 2);
    lo = Math.max(1, Math.min(lo, total - size + 1));
    let hi = Math.min(total, lo + size - 1);
    if (hiActive > hi) { hi = hiActive; lo = Math.max(1, hi - size + 1); }
    return [lo, hi];
  }

  function foldLabel(from, to, regions) {
    const count = to - from + 1;
    const overlapping = regions
      .map((region) => ({ region, shared: Math.min(to, region.to) - Math.max(from, region.from) + 1 }))
      .filter((item) => item.shared > 0)
      .sort((a, b) => b.shared - a.shared)[0];
    return overlapping ? `⋯ ${count} líneas: ${overlapping.region.name}()` : `⋯ ${count} líneas`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function skeleton(host) {
    // The author's JSON stays in the element: spec readers and gates can still
    // inspect it after the figure has been drawn.
    const scripts = [...host.querySelectorAll(':scope > script')];
    const head = el('header', 'lk-cs-head');
    const top = el('div', 'lk-cs-head-top');
    top.append(el('span', 'lk-cs-led'), el('span', 'lk-cs-kicker', 'PASO A PASO · CÓDIGO'), el('span', 'lk-cs-meta'));
    head.append(top, el('h1', 'lk-cs-title'));
    const codeband = el('div', 'lk-cs-codeband');
    const codebar = el('div', 'lk-cs-codebar');
    codebar.append(el('span', 'lk-cs-file'), el('span', 'lk-cs-codebar-right'));
    const lines = el('ol', 'lk-cs-lines');
    codeband.append(codebar, lines);
    const state = el('div', 'lk-cs-state');
    const sectionHead = el('div', 'lk-cs-section-head');
    sectionHead.append(el('span', '', 'ESTADO'), el('span', 'lk-cs-step-label'));
    const widgets = el('div', 'lk-cs-widgets');
    state.append(sectionHead, widgets);
    const caption = el('div', 'lk-cs-caption');
    const player = el('div', 'lk-cs-player');
    const buttons = el('div', 'lk-cs-buttons');
    const prev = el('button', 'lk-cs-btn', '←');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Paso anterior');
    const next = el('button', 'lk-cs-btn', '→');
    next.type = 'button';
    next.setAttribute('aria-label', 'Paso siguiente');
    buttons.append(prev, next);
    const dots = el('div', 'lk-cs-dots');
    dots.setAttribute('aria-label', 'Pasos');
    player.append(buttons, dots, el('span', 'lk-cs-count'));
    const error = el('p', 'lk-cs-error');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    host.replaceChildren(...scripts, head, codeband, state, caption, player, error);
    return { head, meta: top.querySelector('.lk-cs-meta'), title: head.querySelector('.lk-cs-title'),
      codeband, file: codebar.querySelector('.lk-cs-file'), codebarRight: codebar.querySelector('.lk-cs-codebar-right'),
      lines, state, stepLabel: sectionHead.querySelector('.lk-cs-step-label'), widgets, caption,
      player, prev, next, dots, count: player.querySelector('.lk-cs-count'), error };
  }

  function codeLine(spec, n) {
    const row = el('li', 'lk-cs-code-line');
    row.dataset.line = String(n);
    row.append(el('span', 'lk-cs-gutter', String(n).padStart(2, '0')));
    const code = el('code', 'lk-cs-code-text');
    for (const token of tokenize(spec.code[n - 1], spec.language)) {
      code.append(el('span', `lk-cs-tok-${token.cls || 'plain'}`, token.text));
    }
    row.append(code);
    return row;
  }

  function widgetSection(name, title, body) {
    const section = el('section', `lk-cs-widget lk-cs-w-${name}`);
    section.dataset.widget = name;
    section.append(el('h3', 'lk-cs-widget-title', title), body);
    return section;
  }

  function drawState(widgets, step, previous, hints) {
    widgets.replaceChildren();
    for (const [name, value] of Object.entries(step.state)) {
      const before = previous && previous[name];
      let body;
      if (name === 'vars') {
        body = el('dl', 'lk-cs-vars');
        for (const [key, val] of Object.entries(value)) {
          const changed = Boolean(previous && shown(previous.vars && previous.vars[key]) !== shown(val));
          const row = el('div', `lk-cs-var${changed ? ' is-changed' : ''}`);
          row.dataset.var = key;
          if (changed) row.dataset.stateFocus = key;
          row.append(el('dt', '', key), el('dd', '', formatValue(val).replace(/^"|"$/g, '')));
          body.append(row);
        }
        body = widgetSection(name, 'variables', body);
      } else if (name === 'flags') {
        const box = el('div', 'lk-cs-flags');
        for (const [key, val] of Object.entries(value)) {
          const chip = el('span', `lk-cs-flag${val ? ' is-on' : ''}`, `${key}: ${val ? 'sí' : 'no'}`);
          chip.dataset.flag = key;
          if (before && Object.hasOwn(before, key) && before[key] !== val) chip.dataset.stateFocus = key;
          box.append(chip);
        }
        body = widgetSection(name, 'banderas', box);
      } else if (name === 'stack' || name === 'queue') {
        const list = el('ol', `lk-cs-${name}`);
        const items = name === 'queue' && !value.length ? ['—'] : value;
        for (const item of items) {
          const row = el('li', name === 'queue' && !value.length ? 'lk-cs-empty' : '', item);
          if (before && !before.includes(item)) row.dataset.stateFocus = name;
          list.append(row);
        }
        body = widgetSection(name, name === 'stack' ? 'pila' : 'cola', list);
      } else {
        const out = el('pre', 'lk-cs-output', value.length ? value.join('\n') : '—');
        if (before && shown(before) !== shown(value)) out.dataset.stateFocus = name;
        body = widgetSection(name, 'salida', out);
      }
      widgets.append(body);
    }
    for (const hint of hints) {
      for (const node of widgets.querySelectorAll('[data-var], [data-flag]')) {
        if (node.dataset.stateFocus || node.dataset.var !== hint && node.dataset.flag !== hint
            && node.textContent.trim() !== hint) continue;
        node.dataset.stateFocus = hint;
      }
    }
  }

  function drawCaption(caption, lines) {
    caption.replaceChildren();
    for (const line of lines) {
      const p = el('p', 'lk-cs-line');
      let cursor = 0;
      for (const match of line.matchAll(CHIP)) {
        if (match.index > cursor) p.append(document.createTextNode(line.slice(cursor, match.index)));
        p.append(el('span', `lk-cs-chip tone-${match[2]}`, match[1]));
        cursor = match.index + match[0].length;
      }
      if (cursor < line.length) p.append(document.createTextNode(line.slice(cursor)));
      caption.append(p);
    }
  }

  function overlay(host, pane, cells, cls) {
    host.querySelectorAll(`.${cls}`).forEach((node) => node.remove());
    if (!pane || !cells.length) return;
    const box = pane.getBoundingClientRect();
    const rects = cells.map((cell) => cell.getBoundingClientRect());
    const top = Math.max(2, Math.min(...rects.map((r) => r.top)) - box.top - 4);
    const bottom = Math.min(box.height - 2, Math.max(...rects.map((r) => r.bottom)) - box.top + 4);
    const left = Math.max(2, Math.min(...rects.map((r) => r.left)) - box.left - 4);
    const right = Math.min(box.width - 2, Math.max(...rects.map((r) => r.right)) - box.left + 4);
    if (bottom <= top || right <= left) return;
    const block = el('div', cls);
    const cell = cells[0];
    block.dataset.focus = cell.dataset.tone || (cell.classList.contains('is-active') ? 'blue' : 'blue');
    block.style.left = `${left.toFixed(2)}px`;
    block.style.top = `${top.toFixed(2)}px`;
    block.style.width = `${(right - left).toFixed(2)}px`;
    block.style.height = `${(bottom - top).toFixed(2)}px`;
    pane.append(block);
  }

  /** Mount one validated spec into one element. Every element owns its state. */
  function mount(host, spec) {
    validate(spec);
    const refs = skeleton(host);
    const view = {
      host, spec, index: 0, size: spec.window || 12,
      regions: spec.regions === undefined ? [] : normalizeRegions(spec.regions, spec.code.length),
      expanded: new Set(), range: null, api: null
    };
    host.dataset.error = 'false';
    host.dataset.settled = 'true';
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0;

    function focusMarks() {
      const active = [...refs.lines.querySelectorAll('.lk-cs-code-line.is-active')];
      overlay(host, refs.codeband, active, 'lk-cs-focus-block');
      const cells = [...refs.widgets.querySelectorAll('[data-state-focus]')];
      const tones = cells.map((cell) => cell.dataset.tone).filter(Boolean);
      const tone = tones.includes('red') ? 'red' : tones.includes('green') ? 'green' : 'blue';
      const block = refs.state.querySelector('.lk-cs-focus-block');
      overlay(host, refs.state, cells, 'lk-cs-focus-block');
      const drawn = refs.state.querySelector('.lk-cs-focus-block');
      if (drawn && block !== drawn) drawn.dataset.focus = tone;
    }

    function draw() {
      const step = spec.steps[view.index];
      const active = activeLines(step);
      const activeSet = new Set(active);
      const hints = step.focus === undefined ? [] : Array.isArray(step.focus) ? step.focus : [step.focus];
      const [lo, hi] = windowRange(spec.code.length, active, view.size, view.regions);
      view.range = [lo, hi];
      host.dataset.step = String(view.index + 1);
      host.dataset.activeLine = active.join(',');
      host.dataset.range = `${lo}-${hi}`;
      refs.title.textContent = spec.title;
      refs.meta.textContent = `${spec.language} · ${spec.steps.length} estados`;
      refs.file.textContent = `${spec.language} · código`;
      const region = view.regions.find((r) => lo >= r.from && hi <= r.to);
      refs.codebarRight.textContent = `${region ? region.name + ' · ' : ''}líneas ${lo}–${hi}`;
      refs.stepLabel.textContent = `${view.index + 1} / ${spec.steps.length}`;
      refs.lines.replaceChildren();
      const appendFold = (from, to) => {
        const key = `${from}-${to}`;
        const row = el('li', 'lk-cs-fold-row');
        if (view.expanded.has(key)) {
          for (let n = from; n <= to; n += 1) refs.lines.append(codeLine(spec, n));
          return;
        }
        const button = el('button', 'lk-cs-fold', foldLabel(from, to, view.regions));
        button.type = 'button';
        button.dataset.from = String(from);
        button.dataset.to = String(to);
        button.setAttribute('aria-label', `Mostrar líneas ${from} a ${to}`);
        row.append(button);
        refs.lines.append(row);
      };
      if (lo > 1) appendFold(1, lo - 1);
      for (let n = lo; n <= hi; n += 1) {
        const line = codeLine(spec, n);
        if (activeSet.has(n)) {
          line.classList.add('is-active');
          line.setAttribute('aria-current', 'step');
        }
        refs.lines.append(line);
      }
      if (hi < spec.code.length) appendFold(hi + 1, spec.code.length);
      drawState(refs.widgets, step, view.index > 0 ? spec.steps[view.index - 1].state : null, hints);
      drawCaption(refs.caption, step.narrator);
      refs.dots.replaceChildren();
      spec.steps.forEach((_, i) => {
        const dot = el('button', `lk-cs-dot${i === view.index ? ' is-current' : ''}${i < view.index ? ' is-past' : ''}`);
        dot.type = 'button';
        dot.dataset.step = String(i + 1);
        dot.setAttribute('aria-label', `Ir al paso ${i + 1}`);
        if (i === view.index) dot.setAttribute('aria-current', 'step');
        refs.dots.append(dot);
      });
      refs.count.textContent = `${view.index + 1}/${spec.steps.length}`;
      refs.prev.disabled = view.index === 0;
      refs.next.disabled = view.index === spec.steps.length - 1;
      host.dataset.settled = 'false';
      requestAnimationFrame(() => {
        focusMarks();
        host.dataset.settled = 'true';
      });
    }

    refs.lines.addEventListener('click', (event) => {
      const fold = event.target.closest('.lk-cs-fold');
      if (!fold) return;
      view.expanded.add(`${fold.dataset.from}-${fold.dataset.to}`);
      draw();
    });
    refs.prev.addEventListener('click', () => view.api.goTo(view.index - 1));
    refs.next.addEventListener('click', () => view.api.goTo(view.index + 1));
    refs.dots.addEventListener('click', (event) => {
      const dot = event.target.closest('[data-step]');
      if (dot) view.api.goTo(Number(dot.dataset.step) - 1);
    });
    host.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); view.api.goTo(view.index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); view.api.goTo(view.index - 1); }
    });
    view.api = {
      goTo(index) {
        const target = Math.max(0, Math.min(spec.steps.length - 1, index));
        if (target === view.index) return;
        view.expanded.clear();
        view.index = target;
        draw();
      },
      get index() { return view.index; },
      state() { return { index: view.index, range: view.range, window: view.size }; }
    };
    draw();
    return view.api;
  }

  const api = { validate, normalizeRegions, tokenize, mount, CodeStepSpecError };
  global.lkCodeStep = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (global.customElements && !global.customElements.get('lk-codestep')) {
    global.customElements.define('lk-codestep', class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        Promise.resolve().then(() => {
          const script = this.querySelector(':scope > script[type="application/json"]');
          if (!script) throw new CodeStepSpecError('spec', undefined, 'expected an inline JSON script');
          let raw;
          try { raw = JSON.parse(script.textContent); }
          catch (error) { throw new CodeStepSpecError('spec', script.textContent, `invalid JSON: ${error.message}`); }
          mount(this, raw);
          this.dataset.ready = 'true';
        }).catch((error) => {
          const message = error instanceof CodeStepSpecError ? error.message
            : `spec error · ${String(error && error.message || error)}`;
          this.replaceChildren(el('p', 'lk-cs-error', message));
          this.querySelector('.lk-cs-error').setAttribute('role', 'alert');
          this.dataset.error = 'true';
          this.dataset.ready = 'error';
        });
      }
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
