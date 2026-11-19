/* lk-guided — a declared step-by-step figure for formulas, worked examples and
   numbers before/after. Plain browser JavaScript: no build step, no runtime
   dependency. The spec owns every word and number; this file owns the grammar
   (formula, cards, rows, numbers, note), the focus marks and the player. */
(function (global) {
  'use strict';

  const FORMS = ['formula', 'example', 'numbers'];
  const TONES = ['blue', 'green', 'red'];
  const KINDS = ['formula', 'cards', 'rows', 'numbers', 'note'];
  const ROOT_KEYS = ['form', 'kicker', 'question', 'caption', 'steps'];
  const STEP_KEYS = ['title', 'label', 'caption', 'blocks'];
  const BLOCK_KEYS = {
    formula: ['kind', 'tokens', 'focus', 'tone'],
    cards: ['kind', 'cards', 'focus', 'tone'],
    rows: ['kind', 'headings', 'rows', 'focus', 'tone'],
    numbers: ['kind', 'values', 'focusList', 'tone'],
    note: ['kind', 'text', 'focus', 'tone']
  };

  class GuidedSpecError extends Error {
    constructor(path, value, reason) {
      super(`spec error · ${path} = ${shown(value)} — ${reason}`);
      this.name = 'GuidedSpecError';
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
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const fail = (path, value, reason) => { throw new GuidedSpecError(path, value, reason); };
  function knownKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fail(`${path ? path + '.' : ''}${key}`, value[key], 'unknown key');
    }
  }
  function tone(value, path) {
    if (value !== undefined && !TONES.includes(value)) fail(path, value, `expected one of ${TONES.join(', ')}`);
    return value || 'blue';
  }
  function focusIndex(value, length, path, required) {
    if (value === undefined) {
      if (required) fail(path, value, 'expected a focus index');
      return undefined;
    }
    if (!Number.isInteger(value) || value < 0 || value >= length) {
      fail(path, value, `focus index out of range (expected 0..${length - 1})`);
    }
    return value;
  }
  function list(value, path) {
    if (!Array.isArray(value)) fail(path, value, 'expected an array');
    return value;
  }
  function blockKeys(block, path) { knownKeys(block, BLOCK_KEYS[block.kind], path); }

  /** DOM-free, path-and-value validation: the element shows errors, never throws. */
  function validate(spec) {
    if (!object(spec)) fail('spec', spec, 'expected an object');
    knownKeys(spec, ROOT_KEYS, 'spec');
    if (!FORMS.includes(spec.form)) fail('spec.form', spec.form, `expected one of ${FORMS.join(', ')}`);
    for (const key of ['kicker', 'question']) {
      if (!text(spec[key])) fail(`spec.${key}`, spec[key], 'expected non-empty text');
    }
    if (spec.caption !== undefined && !text(spec.caption)) fail('spec.caption', spec.caption, 'expected non-empty text');
    list(spec.steps, 'spec.steps');
    if (!spec.steps.length) fail('spec.steps', spec.steps, 'expected at least one step');
    spec.steps.forEach((step, i) => {
      const at = `steps[${i}]`;
      if (!object(step)) fail(at, step, 'expected an object');
      knownKeys(step, STEP_KEYS, at);
      for (const key of ['title', 'label', 'caption']) {
        if (step[key] !== undefined && !text(step[key])) fail(`${at}.${key}`, step[key], 'expected non-empty text');
      }
      list(step.blocks, `${at}.blocks`);
      if (!step.blocks.length) fail(`${at}.blocks`, step.blocks, 'expected at least one block');
      let marks = 0;
      step.blocks.forEach((block, j) => {
        const bp = `${at}.blocks[${j}]`;
        if (!object(block)) fail(bp, block, 'expected an object');
        if (!KINDS.includes(block.kind)) fail(`${bp}.kind`, block.kind, `expected one of ${KINDS.join(', ')}`);
        blockKeys(block, bp);
        tone(block.tone, `${bp}.tone`);
        if (block.kind === 'formula') {
          const tokens = list(block.tokens, `${bp}.tokens`);
          if (!tokens.length) fail(`${bp}.tokens`, tokens, 'expected at least one token');
          tokens.forEach((token, k) => {
            if (!object(token)) fail(`${bp}.tokens[${k}]`, token, 'expected an object');
            knownKeys(token, ['text', 'cls'], `${bp}.tokens[${k}]`);
            if (!text(token.text)) fail(`${bp}.tokens[${k}].text`, token.text, 'expected non-empty text');
            if (token.cls !== undefined && !text(token.cls)) fail(`${bp}.tokens[${k}].cls`, token.cls, 'expected non-empty text');
          });
          marks += focusIndex(block.focus, tokens.length, `${bp}.focus`) === undefined ? 0 : 1;
        } else if (block.kind === 'cards') {
          const cards = list(block.cards, `${bp}.cards`);
          if (!cards.length) fail(`${bp}.cards`, cards, 'expected at least one card');
          cards.forEach((card, k) => {
            if (!object(card)) fail(`${bp}.cards[${k}]`, card, 'expected an object');
            knownKeys(card, ['label', 'value', 'note', 'wrong', 'wrongTone'], `${bp}.cards[${k}]`);
            for (const key of ['label', 'value']) {
              if (!text(card[key])) fail(`${bp}.cards[${k}].${key}`, card[key], 'expected non-empty text');
            }
            for (const key of ['note', 'wrongTone']) {
              if (card[key] !== undefined && !text(card[key])) fail(`${bp}.cards[${k}].${key}`, card[key], 'expected non-empty text');
            }
            if (card.wrong !== undefined && typeof card.wrong !== 'boolean') fail(`${bp}.cards[${k}].wrong`, card.wrong, 'expected a boolean');
          });
          marks += focusIndex(block.focus, cards.length, `${bp}.focus`) === undefined ? 0 : 1;
        } else if (block.kind === 'rows') {
          list(block.headings, `${bp}.headings`).forEach((heading, k) => {
            if (!text(heading)) fail(`${bp}.headings[${k}]`, heading, 'expected non-empty text');
          });
          const rows = list(block.rows, `${bp}.rows`);
          if (!rows.length) fail(`${bp}.rows`, rows, 'expected at least one row');
          rows.forEach((row, k) => {
            if (!object(row)) fail(`${bp}.rows[${k}]`, row, 'expected an object');
            knownKeys(row, ['label', 'cells'], `${bp}.rows[${k}]`);
            if (!text(row.label)) fail(`${bp}.rows[${k}].label`, row.label, 'expected non-empty text');
            list(row.cells, `${bp}.rows[${k}].cells`).forEach((cell, n) => {
              if (!text(cell)) fail(`${bp}.rows[${k}].cells[${n}]`, cell, 'expected non-empty text');
            });
          });
          marks += focusIndex(block.focus, rows.length, `${bp}.focus`) === undefined ? 0 : 1;
        } else if (block.kind === 'numbers') {
          const values = list(block.values, `${bp}.values`);
          if (!values.length) fail(`${bp}.values`, values, 'expected at least one value');
          values.forEach((value, k) => {
            if (!object(value)) fail(`${bp}.values[${k}]`, value, 'expected an object');
            knownKeys(value, ['label', 'old', 'value'], `${bp}.values[${k}]`);
            for (const key of ['label', 'value']) {
              if (!text(value[key])) fail(`${bp}.values[${k}].${key}`, value[key], 'expected non-empty text');
            }
            if (value.old !== undefined && !text(value.old)) fail(`${bp}.values[${k}].old`, value.old, 'expected non-empty text');
          });
          const focusList = list(block.focusList, `${bp}.focusList`);
          focusList.forEach((index, k) => focusIndex(index, values.length, `${bp}.focusList[${k}]`, true));
          marks += focusList.length ? 1 : 0;
        } else {
          if (!text(block.text)) fail(`${bp}.text`, block.text, 'expected non-empty text');
          if (block.focus !== undefined && typeof block.focus !== 'boolean') fail(`${bp}.focus`, block.focus, 'expected a boolean');
          marks += block.focus ? 1 : 0;
        }
      });
      if (!marks) fail(`${at}.blocks`, step.blocks, 'expected at least one focus mark');
      if (marks > 2) fail(`${at}.blocks`, step.blocks, 'expected at most two focus marks');
    });
    return spec;
  }

  const el = (tag, className, value, attrs) => {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    for (const [key, item] of Object.entries(attrs || {})) node.setAttribute(key, String(item));
    return node;
  };
  const focus = (node, mark) => {
    node.classList.add('lk-gd-focus', `lk-gd-tone-${mark}`);
    node.dataset.focus = mark;
    return node;
  };

  function formula(block) {
    const wrap = el('div', 'lk-gd-block lk-gd-formula');
    block.tokens.forEach((token, i) => {
      const node = el('span', `lk-gd-token${token.cls ? ' ' + token.cls : ''}`, token.text);
      if (i === block.focus) focus(node, block.tone || 'blue');
      else if (block.focus !== undefined) node.classList.add('lk-gd-quiet');
      wrap.append(node);
    });
    return wrap;
  }
  function cards(block) {
    const wrap = el('div', 'lk-gd-block lk-gd-card-grid');
    block.cards.forEach((card, i) => {
      const box = el('div', 'lk-gd-card');
      if (i === block.focus) focus(box, block.tone || 'blue');
      else if (card.wrong) {
        box.classList.add('lk-gd-wrong');
        box.dataset.wrong = card.wrongTone || 'red';
      } else if (block.focus !== undefined) box.classList.add('lk-gd-quiet');
      box.append(el('span', 'lk-gd-card-label', card.label), el('span', 'lk-gd-card-value', card.value));
      if (card.note) box.append(el('span', 'lk-gd-card-note', card.note));
      wrap.append(box);
    });
    return wrap;
  }
  function rows(block) {
    const wrap = el('div', 'lk-gd-block lk-gd-rows');
    if (block.headings && block.headings.length) {
      const head = el('div', 'lk-gd-row lk-gd-row-head');
      block.headings.forEach((heading) => head.append(el('span', 'lk-gd-cell-label', heading)));
      wrap.append(head);
    }
    block.rows.forEach((row, i) => {
      const line = el('div', 'lk-gd-row');
      line.append(el('span', 'lk-gd-cell-label', row.label));
      row.cells.forEach((cell) => line.append(el('span', 'lk-gd-cell', cell)));
      if (i === block.focus) focus(line, block.tone || 'blue');
      else if (block.focus !== undefined) line.classList.add('lk-gd-quiet');
      wrap.append(line);
    });
    return wrap;
  }
  function numbers(block) {
    const wrap = el('div', 'lk-gd-block lk-gd-num-grid');
    const firstMark = (block.focusList || [])[0];
    block.values.forEach((value, i) => {
      const box = el('div', 'lk-gd-num-box');
      box.append(el('span', 'lk-gd-cell-label', value.label));
      if (value.old) {
        box.append(el('span', 'lk-gd-num-old', value.old), el('span', 'lk-gd-num-arrow', '→'));
      }
      box.append(el('span', 'lk-gd-num-value', value.value));
      if (i === firstMark) focus(box, block.tone || 'blue');
      else if ((block.focusList || []).includes(i)) {
        // Several changed numbers share one idea: tint them, outline only the first.
        box.classList.add('lk-gd-marked', `lk-gd-tone-${block.tone || 'blue'}`);
      } else if (block.focusList && block.focusList.length) box.classList.add('lk-gd-quiet');
      wrap.append(box);
    });
    return wrap;
  }
  function note(block) {
    const box = el('div', 'lk-gd-block lk-gd-note', block.text);
    if (block.focus) focus(box, block.tone || 'blue');
    return box;
  }
  const BUILDERS = { formula, cards, rows, numbers, note };

  function stepNode(spec, index) {
    const step = spec.steps[index];
    const panel = el('section', 'lk-gd-step', null, { 'data-step': String(index + 1) });
    panel.append(el('h3', 'lk-gd-step-title', step.title || `${index + 1} · ${step.label || ''}`));
    const blocks = el('div', 'lk-gd-blocks');
    const marked = step.blocks.some((b) => b.focus !== undefined || b.focus || (b.focusList || []).length);
    step.blocks.forEach((block) => {
      const node = BUILDERS[block.kind](block);
      if (marked && block.focus === undefined && !block.focus && !(block.focusList || []).length) {
        node.classList.add('lk-gd-quiet');
      }
      blocks.append(node);
    });
    panel.append(blocks);
    return panel;
  }

  function skeleton(host, spec) {
    const scripts = [...host.querySelectorAll(':scope > script')];
    const header = el('header', 'lk-gd-header');
    header.append(el('span', 'lk-gd-kicker', spec.kicker), el('p', 'lk-gd-question', spec.question));
    const label = el('span', 'lk-gd-step-label');
    header.append(label);
    const stage = el('div', 'lk-gd-stage');
    const panels = spec.steps.map((_, i) => {
      const panel = stepNode(spec, i);
      stage.append(panel);
      return panel;
    });
    const caption = el('p', 'lk-gd-caption');
    const player = el('div', 'lk-gd-player');
    const prev = el('button', 'lk-gd-btn', '← Anterior', { type: 'button', 'aria-label': 'Paso anterior' });
    const dots = el('div', 'lk-gd-dots');
    const next = el('button', 'lk-gd-btn', 'Siguiente →', { type: 'button', 'aria-label': 'Paso siguiente' });
    const play = el('button', 'lk-gd-btn lk-gd-play', '▶ Reproducir', { type: 'button', 'aria-label': 'Reproducir pasos' });
    const count = el('span', 'lk-gd-count', `1/${spec.steps.length}`);
    player.append(prev, dots, next, play, count);
    const error = el('p', 'lk-gd-error', null, { role: 'alert' });
    error.hidden = true;
    host.replaceChildren(...scripts, header, stage, caption, player, error);
    return { header, label, stage, panels, caption, player, prev, dots, next, play, count, error };
  }

  /** Mount one validated spec into one element; each element owns its state. */
  function mount(host, spec) {
    validate(spec);
    const refs = skeleton(host, spec);
    host.dataset.form = spec.form;
    host.dataset.error = 'false';
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0;
    let index = 0;
    let timer = null;

    const dotNodes = spec.steps.map((_, i) => {
      const dot = el('button', 'lk-gd-dot', String(i + 1), {
        type: 'button', 'aria-label': `Ir al paso ${i + 1}`,
      });
      dot.addEventListener('click', () => go(i));
      refs.dots.append(dot);
      return dot;
    });
    function stop() {
      if (timer) global.clearInterval(timer);
      timer = null;
      refs.play.textContent = '▶ Reproducir';
      refs.play.setAttribute('aria-label', 'Reproducir pasos');
    }
    function go(next) {
      index = Math.max(0, Math.min(spec.steps.length - 1, Number(next) || 0));
      const step = spec.steps[index];
      refs.panels.forEach((panel, i) => { panel.hidden = i !== index; });
      dotNodes.forEach((dot, i) => {
        if (i === index) dot.setAttribute('aria-current', 'step');
        else dot.removeAttribute('aria-current');
      });
      refs.label.textContent = step.label || '';
      refs.caption.textContent = step.caption || spec.caption || '';
      refs.count.textContent = `${index + 1}/${spec.steps.length}`;
      refs.prev.disabled = index === 0;
      refs.next.disabled = index === spec.steps.length - 1;
      host.dataset.step = String(index + 1);
      host.dataset.settled = 'true';
    }
    refs.prev.addEventListener('click', () => { stop(); go(index - 1); });
    refs.next.addEventListener('click', () => { stop(); go(index + 1); });
    refs.play.addEventListener('click', () => {
      if (timer) { stop(); return; }
      if (index === spec.steps.length - 1) go(0);
      refs.play.textContent = '❚❚ Pausa';
      refs.play.setAttribute('aria-label', 'Pausar pasos');
      timer = global.setInterval(() => {
        if (index >= spec.steps.length - 1) stop();
        else go(index + 1);
      }, global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1800 : 1500);
    });
    host.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('button')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); stop(); go(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); stop(); go(index - 1); }
    });
    go(0);
    return { go, stop, get index() { return index; } };
  }

  const api = { validate, mount, GuidedSpecError };
  global.lkGuided = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (global.customElements && !global.customElements.get('lk-guided')) {
    global.customElements.define('lk-guided', class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        Promise.resolve().then(() => {
          const script = this.querySelector(':scope > script[type="application/json"]');
          if (!script) fail('spec', undefined, 'expected a direct inline JSON script');
          let raw;
          try { raw = JSON.parse(script.textContent); }
          catch (error) { fail('spec', script.textContent, `invalid JSON: ${error.message}`); }
          this.api = mount(this, raw);
          this.dataset.ready = 'true';
        }).catch((error) => {
          const message = error instanceof GuidedSpecError ? error.message
            : `spec error · ${String(error && error.message || error)}`;
          const box = el('p', 'lk-gd-error', message, { role: 'alert' });
          this.replaceChildren(box);
          this.dataset.error = 'true';
          this.dataset.ready = 'error';
        });
      }
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
