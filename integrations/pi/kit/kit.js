/* Shared, light-DOM learning components. No build step. */
(async () => {
  if (!window.learningThoughtField) {
    const source = new URL('dictate.js', document.currentScript.src);
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source.href;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  const offline = 'Abre esta página desde Pi para enviarla al tutor';
  const config = () => window.LEARNING_BRIDGE;
  const el = (tag, text, attrs = {}) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
    return n;
  };
  const button = (text, action) => {
    const b = el('button', text, { type: 'button' });
    b.addEventListener('click', action); return b;
  };
  const status = () => el('p', '', { role: 'status', 'aria-live': 'polite' });
  async function post(payload) {
    const b = config();
    if (!b) throw new Error(offline);
    const response = await fetch(b.submitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: b.topic, part: b.part, ...payload }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  const thoughtField = (id, index) => window.learningThoughtField(id, index, config());
  const loaded = new Map();
  function library(name, url, integrity, css = false) {
    if (!loaded.has(name)) loaded.set(name, new Promise((resolve, reject) => {
      const n = el(css ? 'link' : 'script');
      if (css) { n.rel = 'stylesheet'; n.href = url; } else n.src = url;
      n.integrity = integrity; n.crossOrigin = 'anonymous';
      n.onload = resolve; n.onerror = () => reject(new Error(`No se pudo cargar ${name}`));
      document.head.append(n);
    }));
    return loaded.get(name);
  }
  const katex = () => Promise.all([
    library('katex-css', 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css', 'sha384-5TcZemv2l/9On385z///+d7MSYlvIEw9FuZTIdZ14vJLqWphw7e7ZPuOiCHJcFCP', true),
    library('katex', 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js', 'sha384-cMkvdD8LoxVzGF/RPUKAcvmm49FQ0oxwDF3BGKtDXcEc+T1b2N+teh/OJfpU0jr6')
  ]);
  function define(name, render) {
    customElements.define(name, class extends HTMLElement {
      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        Promise.resolve().then(() => render.call(this)).catch(error => this.append(el('p', error.message, { role: 'alert' })));
      }
    });
  }
  define('lk-callout', function () {
    if (this.getAttribute('title')) this.prepend(el('strong', this.getAttribute('title'), { class: 'lk-title' }));
  });
  define('lk-widget', function () {
    if (this.getAttribute('title')) this.prepend(el('strong', this.getAttribute('title'), { class: 'lk-title' }));
  });
  define('lk-step', function () {
    const head = el('strong', this.getAttribute('label') || '', { class: 'lk-step-label' });
    const mark = this.getAttribute('mark');
    if (mark) head.append(el('span', mark === 'bloqueo' ? ' ◄── BLOQUEO' : ' ◄── NUEVO', { class: `lk-mark ${mark}` }));
    this.prepend(head);
  });
  define('lk-steps', function () {
    const steps = [...this.querySelectorAll(':scope > lk-step')];
    let index = 0, all = false;
    const label = status();
    const prev = button('◀', () => { index = Math.max(0, index - 1); all = false; draw(); });
    const next = button('▶', () => { index = Math.min(steps.length - 1, index + 1); all = false; draw(); });
    prev.setAttribute('aria-label', 'Paso anterior'); next.setAttribute('aria-label', 'Paso siguiente');
    const toggle = button('Ver todos', () => { all = !all; draw(); });
    const controls = el('div', undefined, { class: 'lk-controls' }); controls.append(prev, next, toggle, label); this.prepend(controls);
    function draw() {
      steps.forEach((s, i) => { s.hidden = !all && i !== index; });
      prev.disabled = index === 0; next.disabled = index >= steps.length - 1;
      toggle.textContent = all ? 'Ver un paso' : 'Ver todos';
      label.textContent = all ? `${steps.length} pasos` : `${index + 1} / ${steps.length}`;
    }
    draw();
  });
  let diagramId = 0;
  define('lk-diagram', function () {
    const spec = JSON.parse(this.querySelector('script[type="application/json"]').textContent);
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const unit = 80, bw = 190, bh = 70;
    const width = spec.width || Math.max(...spec.nodes.map(n => n.x * unit + bw + 20));
    const height = spec.height || Math.max(...spec.nodes.map(n => n.y * unit + bh + 20));
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': this.getAttribute('title') || 'Diagrama de conceptos' });
    const id = `lk-arrow-${++diagramId}`;
    const defs = svgEl('defs', {}), marker = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#475569' })); defs.append(marker); svg.append(defs);
    const nodes = new Map(spec.nodes.map(n => [n.id, { ...n, px: n.x * unit, py: n.y * unit }]));
    for (const edge of spec.edges || []) {
      const a = nodes.get(edge.from), b = nodes.get(edge.to);
      if (!a || !b) throw new Error('Arista con nodo desconocido');
      const dx = b.px - a.px, dy = b.py - a.py;
      const scale = Math.max(Math.abs(dx) / (bw / 2), Math.abs(dy) / (bh / 2));
      if (!scale) continue;
      const reverse = (spec.edges || []).some(e => e.from === edge.to && e.to === edge.from);
      const length = Math.hypot(dx, dy), ox = reverse ? -dy / length * 16 : 0, oy = reverse ? dx / length * 16 : 0;
      const x1 = a.px + bw / 2 + dx / scale + ox, y1 = a.py + bh / 2 + dy / scale + oy;
      const x2 = b.px + bw / 2 - dx / scale + ox, y2 = b.py + bh / 2 - dy / scale + oy;
      svg.append(svgEl('line', { x1, y1, x2, y2, stroke: '#475569', 'stroke-width': 1.5, 'stroke-dasharray': edge.dashed ? '5 4' : '', 'marker-end': `url(#${id})` }));
      if (edge.label) svg.append(svgEl('text', { x: (x1 + x2) / 2 + 8, y: (y1 + y2) / 2 - 8 + (reverse ? (dy > 0 ? -24 : 24) : 0), class: 'lk-edge-label' }, edge.label));
    }
    for (const n of nodes.values()) {
      const colors = { agent: '#2563eb', env: '#059669', store: '#d97706', decision: '#2563eb', box: '#e2e8f0' };
      const g = svgEl('g', {});
      g.append(svgEl('rect', { x: n.px, y: n.py, width: bw, height: bh, rx: n.kind === 'decision' ? 30 : 8, fill: '#ffffff', stroke: colors[n.kind || 'box'], 'stroke-width': 1.5 }));
      g.append(svgEl('text', { x: n.px + bw / 2, y: n.py + (n.sub ? 28 : 40), 'text-anchor': 'middle', class: 'lk-node-label' }, n.label));
      if (n.sub) g.append(svgEl('text', { x: n.px + bw / 2, y: n.py + 50, 'text-anchor': 'middle', class: 'lk-node-sub' }, n.sub));
      svg.append(g);
    }
    this.append(svg);
  });
  define('lk-math', async function () {
    const source = this.textContent;
    await katex(); window.katex.render(source, this, { displayMode: this.hasAttribute('display'), throwOnError: false });
  });
  define('lk-video', async function () {
    const b = config();
    if (!b) { this.append(el('p', offline)); return; }
    const out = status();
    const generate = button('🎬 Generar video', async () => {
      generate.disabled = true;
      try {
        await post({ kind: 'video' });
        out.textContent = 'Pedido al tutor; el video aparecerá aquí cuando esté listo';
        this.poll = setInterval(check, 30000);
      } catch (e) { out.textContent = e.message; generate.disabled = false; }
    });
    const check = async () => {
      if (!this.isConnected) { clearInterval(this.poll); return; }
      try {
        const response = await fetch(b.video, { method: 'HEAD' });
        if (response.status === 200) {
          clearInterval(this.poll);
          const video = el('video', undefined, { controls: '', preload: 'metadata', src: b.video });
          this.replaceChildren(video);
        }
      } catch { /* A missing video leaves the generation control available. */ }
    };
    this.append(generate, out); await check();
  });
  function textField(label, name, required = false) {
    const wrapper = el('label', label, { class: 'lk-field' });
    const input = el('textarea', undefined, { name, rows: '3' }); input.required = required;
    wrapper.append(input); return wrapper;
  }
  define('lk-ask', function () {
    const form = el('form'), field = textField('Pregunta al tutor', 'text', true), out = status();
    const submit = el('button', 'Enviar pregunta', { type: 'submit' });
    form.append(field, submit, out); this.append(form);
    if (!config()) { out.textContent = offline; submit.disabled = true; }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const text = form.elements.text.value.trim(); if (!text) return;
      submit.disabled = true;
      try { await post({ kind: 'question', text }); out.textContent = 'Enviada al tutor'; form.reset(); }
      catch (e) { out.textContent = e.message; }
      finally { submit.disabled = false; }
    });
  });
  define('lk-quiz', async function () {
    const b = config();
    if (!b) { this.append(el('p', offline)); return; }
    const response = await fetch(b.quizUrl);
    if (!response.ok) throw new Error(`No se pudo cargar el mini-quiz (HTTP ${response.status})`);
    const data = await response.json(), form = el('form'), out = status();
    const boxes = new Map();
    for (const [index, q] of data.questions.entries()) {
      const box = el('fieldset', undefined, { class: 'lk-question' });
      box.append(el('legend', `${index + 1}. ${q.enunciado || q.stem}`));
      for (const [letter, text] of Object.entries(q.options)) {
        const label = el('label', undefined, { class: 'lk-option' });
        label.append(el('input', undefined, { type: 'radio', name: q.id, value: letter, required: '' }), el('span', `${letter}. ${text}`)); box.append(label);
      }
      box.append(thoughtField(q.id, index));
      const confidence = el('div', 'Confianza (opcional): ', { class: 'lk-controls' });
      for (const [value, title] of Object.entries({ seguro: 'Seguro', dudo: 'Dudo', adivine: 'Adiviné' })) {
        const label = el('label'); label.append(el('input', undefined, { type: 'radio', name: `${q.id}-confianza`, value }), document.createTextNode(title)); confidence.append(label);
      }
      box.append(confidence); boxes.set(q.id, box); form.append(box);
    }
    const ownWords = textField('Vuelco con tus palabras (opcional)', 'ownWords');
    const exercises = textField('Ejercicios (opcional)', 'exercises');
    const submit = el('button', 'Enviar al tutor', { type: 'submit' });
    form.append(ownWords, exercises, submit, out); this.append(form);
    function showResults(graded) {
      for (const r of graded.results || []) {
        const box = boxes.get(r.id); if (!box) continue;
        box.append(el('p', `${r.ok ? '✔' : '✘'} Elegiste ${r.chosen}; correcta: ${r.correct}`, { class: r.ok ? 'lk-correct' : 'lk-error' }));
      }
      const [score, total] = String(graded.score || '0/0').split('/').map(Number);
      out.textContent = `Puntaje ${score}/${total} — ${total ? Math.round(score / total * 100) : 0} %`; out.classList.add('lk-reward');
      form.querySelectorAll('input, textarea, button').forEach(n => { n.disabled = true; });
    }
    if (data.answered != null) {
      const recorded = data.answered;
      const a = Array.isArray(recorded) ? {
        results: recorded,
        score: `${recorded.filter(r => r.ok).length}/${recorded.length}`,
        reasoning: Object.fromEntries(recorded.map(r => [r.id, r]))
      } : recorded;
      for (const q of data.questions) {
        const chosen = a.answers?.[q.id] || a.results?.find(r => r.id === q.id)?.chosen;
        for (const input of boxes.get(q.id).querySelectorAll('input')) if (input.name === q.id) input.checked = input.value === chosen;
        const reasoning = (a.reasoning || a.razonamientos || {})[q.id] || {};
        const thought = reasoning.razonamiento || [reasoning.entendi, reasoning.porque].filter(Boolean).join(' ');
        form.elements[`${q.id}-razonamiento`].value = thought;
        for (const input of boxes.get(q.id).querySelectorAll('input')) if (input.name === `${q.id}-confianza`) input.checked = input.value === reasoning.confianza;
      }
      form.elements.ownWords.value = a.ownWords || ''; form.elements.exercises.value = a.exercises || '';
      showResults(a);
    }
    if (data.verdicts != null) {
      const panel = el('section'); panel.append(el('h3', 'Diagnóstico por concepto'));
      for (const [key, v] of Object.entries(data.verdicts)) {
        const item = el('div', undefined, { class: 'lk-verdict' });
        item.append(el('strong', `${v.codigo || v.concepto || key}: ${v.veredicto || v.estado || ''}`), el('blockquote', v.evidencia || '')); panel.append(item);
      }
      this.append(panel);
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const answers = {}, reasoning = {};
      for (const q of data.questions) {
        answers[q.id] = form.elements[q.id].value;
        const razonamiento = form.elements[`${q.id}-razonamiento`].value.trim();
        if (razonamiento) {
          const confianza = form.elements[`${q.id}-confianza`].value;
          reasoning[q.id] = confianza ? { razonamiento, confianza } : { razonamiento };
        }
      }
      submit.disabled = true;
      try {
        const payload = { kind: 'mini-quiz', answers, reasoning };
        for (const key of ['ownWords', 'exercises']) if (form.elements[key].value.trim()) payload[key] = form.elements[key].value.trim();
        showResults(await post(payload));
      } catch (e) { out.textContent = e.message; submit.disabled = false; }
    });
  });
  async function decorate() {
    const main = document.querySelector('main') || document.body;
    const headings = [...main.querySelectorAll('h2')];
    if (headings.length) {
      const toc = el('nav', undefined, { class: 'lk-toc', 'aria-label': 'Índice de lectura' });
      const details = el('details'), summary = el('summary', 'En esta parte'), list = el('ol');
      headings.forEach((h, i) => { if (!h.id) h.id = `lk-section-${i + 1}`; const li = el('li'); li.append(el('a', h.textContent, { href: `#${h.id}` })); list.append(li); });
      details.append(summary, list); toc.append(details);
      const title = main.querySelector('h1');
      if (title) title.after(toc); else main.prepend(toc);
    }
    const progress = el('progress', undefined, { class: 'lk-progress', max: '100', value: '0', 'aria-label': 'Progreso de lectura' }); document.body.prepend(progress);
    const update = () => { const extent = document.documentElement.scrollHeight - innerHeight; progress.value = extent > 0 ? scrollY / extent * 100 : 100; };
    addEventListener('scroll', update, { passive: true }); addEventListener('resize', update); update();
    const diagrams = document.querySelectorAll('pre.mermaid');
    if (diagrams.length) {
      try {
        await library('mermaid', 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js', 'sha384-zkWMJO4sgpPUzyuOgDx8HB/K55glbAwajEpk1Go2NWRuPkPA/wIhoEJTuSkmOYrV');
        window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'DejaVu Sans' });
        await window.mermaid.run({ nodes: diagrams });
      } catch (error) { diagrams.forEach(n => n.append(el('p', error.message))); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate, { once: true }); else decorate();

  // A step-by-step figure for a page: each step reveals one more layer of the
  // same scene, drawn with the deck vocabulary (scene.js), so an explanation
  // shows what it says instead of only describing it.
  const WALK_TONES = () => {
    const C = window.LKScene.C;
    return {
      ink: { stroke: C.ink, fill: '#ffffff', color: C.ink },
      slate: { stroke: C.slate, fill: C.soft, color: C.slate },
      blue: { stroke: C.blue, fill: C.blueS, color: C.blue },
      green: { stroke: C.green, fill: C.greenS, color: C.green },
      amber: { stroke: C.amber, fill: C.amberS, color: C.amber },
      red: { stroke: C.red, fill: C.redS, color: C.red },
    };
  };
  function walkScene(scene) {
    const S = window.LKScene;
    const tones = WALK_TONES();
    const tone = (name) => tones[name] || tones.slate;
    let out = '';
    // Sheets and boxes first: a highlight drawn before them would disappear
    // under their white fill.
    for (const s of scene.sheets || []) out += S.sheet(s.x, s.y, s.w, s.h, s.title || '', s.lines ?? 4, tone(s.tone).stroke);
    for (const g of scene.grids || []) out += S.grid(g.x, g.y, g.cols, g.rows, g);
    for (const g of scene.gears || []) out += S.gear(g.x, g.y, g.r || 60, g.teeth || 10, tone(g.tone).stroke);
    for (const b of scene.boxes || []) {
      const t = tone(b.tone);
      out += S.box(b.x, b.y, b.w, b.h, b.label || '', {
        stroke: b.stroke || t.stroke, fill: b.fill || t.fill, color: b.color || t.color,
        size: b.size || 26, sub: b.sub || '', rx: b.rx ?? 10,
      });
    }
    for (const n of scene.nodes || []) {
      const t = tone(n.tone);
      out += S.node(n.x, n.y, n.label || '', { stroke: t.stroke, fill: t.fill, color: t.color, r: n.r || 30 });
    }
    for (const a of scene.arrows || []) {
      const color = tone(a.tone).stroke;
      if (a.bend !== undefined) out += S.curve(a.x1, a.y1, a.x2, a.y2, { color, dashedLine: !!a.dashed, bend: a.bend });
      else out += S.line(a.x1, a.y1, a.x2, a.y2, { color, dashedLine: !!a.dashed });
      // An arrow that carries its own words is what makes a step readable: the
      // reader does not have to infer what moved, the figure says it.
      if (a.label) {
        const mid = a.bend === undefined ? { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 } : { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 - Math.abs(a.y2 - a.y1) * 0.18 };
        out += S.lbl(mid.x, mid.y - 14, a.label, {
          anchor: a.labelAnchor || 'middle',
          color: tone(a.labelTone || a.tone).color,
          size: a.labelSize || 22,
        });
      }
    }
    for (const b of scene.badges || []) out += S.badge(b.x, b.y, b.n);
    for (const d of scene.dashed || []) out += S.dashed(d.x, d.y, d.w, d.h, d.label || '', tone(d.tone).stroke, d.fill);
    for (const l of scene.labels || []) out += S.lbl(l.x, l.y, l.text, { anchor: l.anchor || 'middle', color: tone(l.tone).color, size: l.size || 24 });
    return out;
  }
  define('lk-walkthrough', function () {
    const S = window.LKScene;
    if (!S) throw new Error('Falta scene.js: no se puede dibujar el recorrido');
    let spec;
    try { spec = JSON.parse(this.querySelector('script[type="application/json"]').textContent); }
    catch (error) { throw new Error(`El recorrido tiene un JSON inválido: ${error.message}`); }
    const steps = spec.steps || [];
    if (!steps.length) throw new Error('El recorrido no tiene pasos');
    const stage = el('div', undefined, { class: 'lk-wt-stage' });
    stage.innerHTML = S.svg(steps.map((s, i) => S.step(i + 1, walkScene(s.scene || {}))).join(''), spec.viewBox || '0 0 1200 640');
    const captionTitle = el('strong');
    const captionText = el('p');
    const caption = el('div', undefined, { class: 'lk-wt-caption' });
    caption.append(captionTitle, captionText);
    const hint = el('p', 'Desliza el diagrama para verlo completo', { class: 'lk-wt-hint' });
    const count = el('span', undefined, { class: 'lk-wt-count' });
    const dots = el('div', undefined, { class: 'lk-wt-dots' });
    let index = 0, whole = false;
    const prev = button('◀ Anterior', () => go(index - 1));
    const next = button('Siguiente ▶', () => go(index + 1));
    const reveal = button('Ver todo', () => { whole = !whole; draw(); });
    // The figure is the lesson: letting it own the screen is what makes the
    // small labels readable on a laptop and in class.
    const full = button('Pantalla completa', () => {
      if (document.fullscreenElement === this) {
        document.exitFullscreen?.();
        return;
      }
      // A denied request must be visible, never a dead button: the embed may
      // lack allow="fullscreen" (sandboxed iframe) or the user may have
      // blocked the permission.
      this.requestFullscreen?.().catch(() => {
        hint.textContent = 'Pantalla completa bloqueada por el contexto donde está embebido este demo.';
        hint.classList.add('lk-wt-hint-error');
        setTimeout(() => {
          hint.textContent = 'Desliza el diagrama para verlo completo';
          hint.classList.remove('lk-wt-hint-error');
        }, 4000);
      });
    });
    full.className = 'lk-wt-full';
    const syncFull = () => {
      const on = document.fullscreenElement === this;
      full.textContent = on ? 'Salir' : 'Pantalla completa';
      full.setAttribute('aria-pressed', String(on));
    };
    document.addEventListener('fullscreenchange', syncFull);
    const bar = el('div', undefined, { class: 'lk-wt-bar' });
    bar.append(prev, count, next, reveal, dots);
    this.classList.add('lk-walkthrough');
    this.tabIndex = 0;
    if (spec.title) this.append(el('strong', spec.title, { class: 'lk-title' }));
    this.append(full, stage, hint, bar, caption);
    steps.forEach((_, i) => {
      const dot = button(String(i + 1), () => go(i));
      dot.className = 'lk-wt-dot';
      dot.setAttribute('aria-label', `Paso ${i + 1}`);
      dots.append(dot);
    });
    function go(to) { index = Math.max(0, Math.min(steps.length - 1, to)); whole = false; draw(); }
    function draw() {
      // One scene per step: the figure shows the state that step describes, and
      // «Ver todo» shows the last one. Cumulative scenes still work, because
      // their last step already contains every earlier element.
      stage.querySelectorAll('[data-step]').forEach((g) => {
        const shown = whole ? steps.length : index + 1;
        g.style.display = Number(g.dataset.step) === shown ? '' : 'none';
      });
      const step = steps[index];
      captionTitle.textContent = step.title || '';
      captionText.textContent = step.text || '';
      count.textContent = whole ? `${steps.length} pasos` : `Paso ${index + 1} de ${steps.length}`;
      prev.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      reveal.textContent = whole ? 'Ver por pasos' : 'Ver todo';
      [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    }
    this.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    });
    draw();
  });
})();
