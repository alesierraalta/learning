/* Shared, light-DOM learning components. No build step. */
(async () => {
  // A kit inlined in a saved copy has no address to find dictate.js by, and sends nothing.
  if (!window.learningThoughtField && document.currentScript?.src) {
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
  // A part saved for reading with no connection: what reaches the tutor or the network says so.
  const away = 'Necesita conexión: hazlo cuando vuelvas a estar en línea';
  const unreachable = () => { const b = config(); return !b ? offline : b.offline ? away : null; };
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
    const b = config(), reason = unreachable();
    if (reason) throw new Error(reason);
    const response = await fetch(b.submitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: b.topic, part: b.part, ...payload }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  const thoughtField = (id, index) => window.learningThoughtField(id, index, config());
  const loaded = new Map();
  function library(name, url, integrity, css = false) {
    // A library the page already loaded by its own tag (window.mermaid, window.katex) is not loaded twice.
    if (!css && !loaded.has(name) && window[name]) loaded.set(name, Promise.resolve());
    if (!loaded.has(name)) loaded.set(name, new Promise((resolve, reject) => {
      // A saved copy carries the library itself, keyed by the URL it would come from.
      const saved = window.learningOffline?.[url];
      if (saved !== undefined) {
        const inline = el(css ? 'style' : 'script'); inline.textContent = saved;
        document.head.append(inline); resolve(); return;
      }
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
    let spec;
    try { spec = JSON.parse(this.querySelector('script[type="application/json"]').textContent); }
    catch (error) { throw new Error(`El diagrama tiene un JSON inválido: ${error.message}`); }
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
    if (unreachable()) { this.append(el('p', b?.offline ? '🎬 El video de esta parte necesita conexión.' : offline)); return; }
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
  // One part, up to four ways to hear it: an episode per style, plus the
  // transcript the engine also wrote. A style that does not exist yet is a
  // request button, and the same row becomes the player once the file lands.
  const AUDIO_LABEL = { debate: 'Debate', entrevista: 'Entrevista', charla: 'Charla', formal: 'Explicación' };
  define('lk-audio', async function () {
    const b = config();
    if (unreachable()) { this.append(el('p', b?.offline ? '🎧 El audio de esta parte necesita conexión.' : offline)); return; }
    if (!b?.audio?.styles?.length) return;
    this.append(el('span', 'Escuchar esta parte', { class: 'lk-audio-title' }));
    for (const entry of b.audio.styles) {
      const label = AUDIO_LABEL[entry.style] || entry.style;
      const src = b.audio.base + encodeURIComponent(entry.name);
      const row = el('div', undefined, { class: 'lk-audio-row' });
      const head = el('span', label, { class: 'lk-audio-style' });
      const srt = entry.srt ? b.audio.base + encodeURIComponent(entry.srt) : '';
      const transcript = async () => {
        if (!srt || entry.srtExists) {
          if (srt && entry.srtExists) row.append(el('a', 'Transcripción', { href: srt, download: entry.srt, class: 'lk-audio-srt' }));
          return;
        }
        try {
          const head = await fetch(srt, { method: 'HEAD' });
          if (!head.ok || !row.isConnected || row.querySelector('a.lk-audio-srt')) return;
          row.append(el('a', 'Transcripción', { href: srt, download: entry.srt, class: 'lk-audio-srt' }));
        } catch { /* A delivery without a transcript is still listenable. */ }
      };
      const play = () => {
        const player = el('audio', undefined, { controls: '', preload: 'metadata', src });
        const download = el('a', 'Descargar', { href: src, download: entry.name, class: 'lk-audio-download' });
        row.replaceChildren(head, player, download);
        void transcript();
      };
      if (entry.exists) play();
      else {
        const line = status();
        const check = async () => {
          if (!this.isConnected) { clearInterval(this.poll); return; }
          try {
            const response = await fetch(src, { method: 'HEAD' });
            if (response.status === 200) { clearInterval(this.poll); play(); }
          } catch { /* A missing file leaves the request available. */ }
        };
        const ask = button(`🎧 Generar ${label.toLowerCase()}`, async () => {
          ask.disabled = true;
          try {
            await post({ kind: 'audio', style: entry.style });
            line.textContent = 'Pedido al tutor: el audio aparece aquí cuando esté listo';
            this.poll = setInterval(check, 30000);
          } catch (e) { line.textContent = e.message; ask.disabled = false; }
        });
        row.append(head, ask, line);
      }
      this.append(row);
    }
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
    const reason = unreachable();
    if (reason) { out.textContent = reason; submit.disabled = true; }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const text = form.elements.text.value.trim(); if (!text) return;
      submit.disabled = true;
      try { await post({ kind: 'question', text }); out.textContent = 'Enviada al tutor'; form.reset(); }
      catch (e) { out.textContent = e.message; }
      finally { submit.disabled = false; }
    });
  });
  const dontKnow = text => /^no se\.?$/i.test(String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim());
  define('lk-quiz', async function () {
    const b = config();
    if (unreachable()) { this.append(el('p', b?.offline ? 'El mini-quiz se responde con conexión: el tutor lo corrige.' : offline)); return; }
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
      // «No sé» already says how sure the learner is: its confidence hides and is not sent.
      box.addEventListener('change', event => {
        if (event.target.name !== q.id) return;
        const skip = dontKnow(q.options[event.target.value]);
        confidence.style.display = skip ? 'none' : '';
        if (skip) confidence.querySelectorAll('input').forEach(n => { n.checked = false; });
      });
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
        const graded = await post(payload);
        showResults(graded);
        notifyStudio(graded);
      } catch (e) { out.textContent = e.message; submit.disabled = false; }
    });
    // Inside the studio the page is a frame: the studio takes the learner to the results
    // and shows the tutor reading them. The bridge's frame-ancestors limit who can listen.
    function notifyStudio(graded) {
      if (window.parent === window) return;
      const byId = new Map(data.questions.map(q => [q.id, q]));
      const results = (graded.results || []).map(r => {
        const q = byId.get(r.id) || { options: {} };
        return { id: r.id, enunciado: q.enunciado || q.stem || '', chosen: r.chosen, chosenText: q.options[r.chosen] ?? '', correct: r.correct, correctText: q.options[r.correct] ?? '', ok: r.ok };
      });
      window.parent.postMessage({ type: 'learning:submitted', kind: 'mini-quiz', topic: b.topic, part: b.part, score: graded.score, results }, '*');
    }
  });
  define('lk-quick-quiz', async function () {
    const raw = this.querySelector('script[type="application/json"]');
    if (!raw) return;
    let spec;
    try { spec = JSON.parse(raw.textContent); } catch (e) { throw new Error(`Quiz rápido mal formado: ${e.message}`); }
    const point = this.getAttribute('point') || '';
    const tag = this.getAttribute('categoria') || this.getAttribute('category') || this.getAttribute('tag') || spec.categoria || spec.category || spec.tag || 'conceptual';
    const form = el('form', undefined, { class: 'lk-quick-quiz-form' });
    const box = el('fieldset', undefined, { class: 'lk-question lk-qq-box' });
    const tagLabel = el('span', `Quiz rápido · ${point || 'Punto clave'}`, { class: 'lk-qq-badge' });
    const legend = el('legend');
    legend.append(tagLabel, document.createElement('br'), document.createTextNode(spec.pregunta || spec.enunciado || ''));
    box.append(legend);

    const qId = spec.id || `qq-${Math.random().toString(36).slice(2, 8)}`;
    const options = spec.opciones || spec.options || {};
    for (const [letter, text] of Object.entries(options)) {
      const label = el('label', undefined, { class: 'lk-option' });
      label.append(
        el('input', undefined, { type: 'radio', name: qId, value: letter, required: '' }),
        el('span', `${letter}. ${text}`)
      );
      box.append(label);
    }

    const submit = el('button', 'Comprobar respuesta', { type: 'submit', class: 'lk-qq-submit' });
    const resultBox = el('div', undefined, { class: 'lk-qq-result', hidden: '' });
    form.append(box, submit, resultBox);
    this.append(form);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const chosen = form.elements[qId]?.value;
      if (!chosen) return;
      submit.disabled = true;
      form.querySelectorAll('input').forEach(i => { i.disabled = true; });

      const correcta = spec.correcta || spec.correct || spec.answer || '';
      const ok = chosen.toUpperCase() === correcta.toUpperCase();
      const explicacion = spec.explicacion || spec.explanation || '';
      const por_que = ok ? (explicacion ? `Acierto: ${explicacion}` : 'Respuesta correcta.') : `Fallo (eligió ${chosen}, correcta: ${correcta}): ${explicacion || 'No consolidó el concepto.'}`;

      resultBox.hidden = false;
      resultBox.className = `lk-qq-result ${ok ? 'lk-correct' : 'lk-error'}`;
      resultBox.textContent = ok
        ? `✔ ¡Correcto! ${explicacion}`
        : `✘ Incorrecto. Elegiste ${chosen}; la correcta es ${correcta}. ${explicacion}`;

      const b = config();
      const entry = {
        id: qId,
        punto: point || 'Punto explicable',
        categoria: tag,
        pregunta: spec.pregunta || spec.enunciado || '',
        respuesta_alumno: chosen,
        respuesta_correcta: correcta,
        ok,
        por_que,
        timestamp: new Date().toISOString()
      };

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'learning:quick-quiz',
          topic: b?.topic,
          part: b?.part,
          entry
        }, '*');
      }

      if (b?.submitUrl) {
        try {
          await post({ kind: 'quick-quiz', entry });
        } catch {
          /* best effort delivery */
        }
      }
    });
  });
  // The index numbers its own entries and a note already numbers its headings
  // ("1. Por qué existe"): without this the entry read "1. 1. Por qué existe".
  const headingLabel = (text) => text.replace(/^\s*\d+(?:\.\d+)*[.)]?\s+/, '');
  async function decorate() {
    const main = document.querySelector('main') || document.body;
    const prose = main.id === 'app' ? main.querySelector(':scope > .prose') : null;
    const headings = [...(prose || main).querySelectorAll('h2')].filter(h => !prose || !h.closest('.video-block, .audio-block'));
    if (headings.length) {
      const toc = el('nav', undefined, { class: 'lk-toc', 'aria-label': 'Índice de lectura' });
      const details = el('details'), summary = el('summary', 'En esta parte'), list = el('ol');
      details.open = true;
      headings.forEach((h, i) => { if (!h.id) h.id = `lk-section-${i + 1}`; const li = el('li'); li.append(el('a', headingLabel(h.textContent), { href: `#${h.id}` })); list.append(li); });
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
      slate: { stroke: C.slate, fill: '#ffffff', color: C.slate },
      blue: { stroke: C.blue, fill: 'rgba(0,66,118,0.05)', color: C.blue },
      green: { stroke: C.green, fill: 'rgba(15,46,61,0.04)', color: C.green },
      amber: { stroke: C.amber, fill: 'rgba(166,127,89,0.06)', color: C.amber },
      red: { stroke: C.red, fill: 'rgba(221,74,104,0.06)', color: C.red },
    };
  };
  // Compass words to a unit vector, so a deck can say "up" instead of computing
  // the endpoint by hand.
  function policyDir(dir) {
    const words = String(dir).toLowerCase().split(/[-_\s]+/);
    const dx = words.includes('right') ? 1 : words.includes('left') ? -1 : 0;
    const dy = words.some((w) => w === 'up' || w === 'top') ? -1 : words.some((w) => w === 'down' || w === 'bottom') ? 1 : 0;
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }
  // Un callout declara el símbolo que señala, nunca una coordenada: una x medida
  // contra una tipografía acierta solo en esa tipografía, y el lector dibuja la
  // fórmula con la suya (numerales de otro alto, anchos distintos), así que cada
  // número caía sobre el símbolo vecino. Las coordenadas de los números viejos se
  // siguen dibujando tal cual.
  const sceneAtoms = (scene) => (scene.formulas || (scene.formula ? [scene.formula] : []))
    .flatMap((fm) => (fm.atoms || []).map((a) => (typeof a === "string" ? { t: a } : { t: a.t, id: a.id })));
  // El número del átomo que el callout nombra, o null si la escena no lo tiene.
  // Un átomo se nombra por su índice (`at`), por su texto (`symbol`) o por su id
  // estable (`atom`), que es lo que un paso de un recorrido necesita cuando el
  // mismo símbolo aparece dos veces en la fórmula.
  function calloutAtom(callout, atoms) {
    if (Number.isInteger(callout.at)) return callout.at >= 0 && callout.at < atoms.length ? callout.at : null;
    if (typeof callout.atom === "string") {
      const at = atoms.findIndex((a) => String(a.id ?? "") === callout.atom);
      return at === -1 ? null : at;
    }
    if (typeof callout.symbol === "string") {
      const at = atoms.findIndex((a) => String(a.t).trim() === callout.symbol.trim());
      return at === -1 ? null : at;
    }
    return null;
  }
  // El punto de la caja del glifo más cercano al número: la guía termina en el
  // borde del símbolo, nunca encima ni al lado. Se retira una unidad —la mitad del
  // trazo— para que la línea toque la caja sin comerse el glifo.
  function edgeOf(box, x, y) {
    const cx = Math.min(Math.max(x, box.x), box.x + box.width);
    const cy = Math.min(Math.max(y, box.y), box.y + box.height);
    const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy);
    if (!len) return { x: cx, y: cy };
    const pull = Math.min(1, len / 2);
    return { x: cx + (dx / len) * pull, y: cy + (dy / len) * pull };
  }
  // La medida se hace sobre lo que el navegador dibujó, así que se repite cuando
  // las fuentes terminan de cargar, cuando cambia el ancho y cuando el lector
  // cambia de tema: la misma nota acierta en cualquier tipografía, tamaño y papel.
  function placeCallouts(stage) {
    const svg = stage.querySelector("svg");
    if (!svg) return;
    const guides = [...svg.querySelectorAll("[data-callout-guide][data-atom]")];
    if (!guides.length) return;
    // Un paso oculto mide cero: se mide con todos los pasos puestos.
    const groups = [...svg.querySelectorAll("[data-step]")];
    const shown = groups.map((g) => g.style.display);
    groups.forEach((g) => { g.style.display = ""; });
    const atoms = [...svg.querySelectorAll("tspan[data-atom]")];
    for (const guide of guides) {
      const path = guide.querySelector("path");
      const atom = atoms[Number(guide.dataset.atom)];
      if (!path || !atom) continue;
      const [x, y] = String(guide.dataset.from || "").split(",").map(Number);
      const box = atom.getBBox();
      if (!box.width && !box.height) continue;
      const end = edgeOf(box, x, y);
      path.setAttribute("d", `M ${x} ${y} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
    }
    groups.forEach((g, i) => { g.style.display = shown[i]; });
  }
  const watched = new WeakSet();
  function watchCallouts(stage, refit) {
    if (watched.has(stage)) return;
    watched.add(stage);
    const place = () => { refit?.(); placeCallouts(stage); placeStory(stage); };
    document.fonts?.ready.then(place).catch(() => {});
    let frame = 0;
    addEventListener("resize", () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); }, { passive: true });
    new MutationObserver(place).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  // La escena de un paso de `lk-story` no escribe coordenadas de rótulos ni de
  // flechas: nombra el actor que el rótulo acompaña y el término que se mueve, y
  // esta pasada mide las cajas que el navegador dibujó. El rótulo con punta se
  // apoya en el borde de su caja, el codo llega a su blanco y la flecha del
  // movimiento empieza y termina en las dos cajas medidas del término.
  function placeStory(stage) {
    const svg = stage.querySelector("svg");
    if (!svg) return;
    const ns = "http://www.w3.org/2000/svg";
    const make = (tag, attrs = {}, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const tones = WALK_TONES();
    const tone = (name) => tones[name] || tones.slate;
    const marker = (name) => `url(#a-${["blue", "green", "amber", "red"].includes(name) ? name : "slate"})`;
    // Una escena quieta no tiene pasos: sus actores, rótulos y marcas viven en el
    // SVG entero, así que se mide el SVG como un solo ámbito.
    const groups = [...svg.querySelectorAll("[data-step]")];
    const scopes = groups.length ? groups : [svg];
    const shown = groups.map((g) => g.style.display);
    groups.forEach((g) => { g.style.display = ""; });
    const sel = (id) => String(id).replace(/[^\w-]/g, "\\$&");
    const findIn = (step, id) => step.querySelector(`[data-actor="${sel(id)}"], [data-box-id="${sel(id)}"], [data-label-id="${sel(id)}"], [data-icon-id="${sel(id)}"], [data-callout="${sel(id)}"]`);
    for (const step of scopes) {
      for (const tag of step.querySelectorAll("[data-tag-to]")) {
        const target = findIn(step, tag.dataset.tagTo);
        if (!target) continue;
        const b = target.getBBox();
        const t = tone(tag.dataset.tagTone);
        const text = tag.dataset.tagText || "";
        const size = 13;
        const w = Math.max(30, text.length * size * 0.56 + 16), h = size + 12;
        const at = tag.dataset.tagAt ? tag.dataset.tagAt.split(",").map(Number) : [];
        const cx = at.length && Number.isFinite(at[0]) ? at[0] : b.x + b.width / 2;
        const cy = at.length > 1 && Number.isFinite(at[1]) ? at[1] : b.y - 8;
        // La ficha se escribe en coordenadas absolutas, no con un `transform`:
        // las puertas miden `getBBox()`, que vive en el espacio local del nodo, y
        // una ficha transformada se medía en el origen y se veía fuera del lienzo.
        tag.replaceChildren(
          make("rect", { x: cx - w / 2, y: cy - h, width: w, height: h, rx: h / 2, fill: "#ffffff", stroke: t.stroke, "stroke-width": 1.5 }),
          make("text", { x: cx, y: cy - h / 2 + size * 0.36, "font-size": size, fill: t.color, "text-anchor": "middle", "font-weight": 700 }, text),
          make("path", { d: `M ${cx - 4} ${cy} L ${cx} ${cy + 6} L ${cx + 4} ${cy} Z`, fill: t.stroke }),
        );
        const tx = b.x + b.width / 2, ty = b.y, my = (cy + ty) / 2;
        const d = Math.abs(cx - tx) < 2 ? `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}` : `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${cx.toFixed(1)} ${my.toFixed(1)} L ${tx.toFixed(1)} ${my.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`;
        tag.append(make("path", { d, fill: "none", stroke: t.stroke, "stroke-width": 1.5, "data-elbow": "1" }));
      }
      for (const move of step.querySelectorAll("[data-move-from]")) {
        const from = findIn(step, move.dataset.moveFrom), to = findIn(step, move.dataset.moveTo);
        if (!from || !to) continue;
        const a = from.getBBox(), b = to.getBBox();
        const t = tone(move.dataset.moveTone);
        const start = edgeOf(a, b.x + b.width / 2, b.y + b.height / 2);
        const end = edgeOf(b, a.x + a.width / 2, a.y + a.height / 2);
        const midY = (start.y + end.y) / 2;
        const path = move.querySelector("[data-move-path]");
        path.setAttribute("d", `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${start.x.toFixed(1)} ${midY.toFixed(1)}, ${end.x.toFixed(1)} ${midY.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
        path.setAttribute("stroke", t.stroke);
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-dasharray", "6 5");
        path.setAttribute("marker-end", marker(move.dataset.moveTone));
        const label = move.querySelector("[data-move-label]");
        label.textContent = move.dataset.moveVerb || "";
        label.setAttribute("x", Math.max((start.x + end.x) / 2, start.x + 66).toFixed(1));
        label.setAttribute("y", (Math.min(start.y, end.y) - 8).toFixed(1));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "13");
        label.setAttribute("font-weight", "700");
        label.setAttribute("fill", t.color);
        label.setAttribute("data-fit", String(Math.max(40, Math.abs(end.x - start.x) + 60)));
      }
      for (const mark of step.querySelectorAll("[data-mark-kind]")) {
        const kind = mark.dataset.markKind;
        const ids = String(mark.dataset.markActors || "").split(",").filter(Boolean);
        const boxes = ids.map((id) => findIn(step, id)).filter(Boolean).map((el) => el.getBBox());
        if (!boxes.length) continue;
        const union = boxes.reduce((a, b) => ({
          x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
          width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
          height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
        }));
        const t = tone(kind === "ok" ? "green" : kind === "no" ? "red" : "amber");
        const parts = [];
        if (kind === "combine") {
          const pad = 8;
          parts.push(make("rect", { x: union.x - pad, y: union.y - pad, width: union.width + pad * 2, height: union.height + pad * 2, rx: 14, fill: "none", stroke: t.stroke, "stroke-width": 2, "stroke-dasharray": "6 5" }));
          if (mark.dataset.markLabel) parts.push(make("text", { x: union.x + union.width / 2, y: union.y - pad - 8, "font-size": 13, "font-weight": 700, fill: t.color, "text-anchor": "middle" }, mark.dataset.markLabel));
          const to = mark.dataset.markTo ? findIn(step, mark.dataset.markTo) : null;
          if (to) {
            const b = to.getBBox();
            const sx = union.x + union.width / 2, sy = union.y + union.height + pad;
            // La punta se detiene 10 unidades arriba de la caja: la marca del
            // resultado dibuja su marco 8 unidades por fuera y una punta en el
            // borde quedaba enterrada dentro de ese marco.
            const ex = b.x + b.width / 2, ey = b.y - 10, my = (sy + ey) / 2;
            parts.push(make("path", { d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx.toFixed(1)} ${my.toFixed(1)}, ${ex.toFixed(1)} ${my.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`, fill: "none", stroke: t.stroke, "stroke-width": 2, "stroke-dasharray": "6 5", "marker-end": marker("amber") }));
          }
        } else {
          // El marco es el borde del propio actor, engrosado y del color del resultado:
          // un segundo rect por fuera dibujaba un doble borde. El ✓ se coloca donde
          // cabe dentro del lienzo —a la derecha, debajo o a la izquierda— midiendo lo
          // que el navegador dibujó, no con una coordenada: a la derecha de un actor
          // que llega a x 346 de 360 quedaba recortado y solo se veía una astilla.
          for (const id of ids) {
            const frame = findIn(step, id)?.querySelector("rect");
            if (!frame) continue;
            frame.setAttribute("stroke", t.stroke);
            frame.setAttribute("stroke-width", "3.5");
          }
          const glyph = make("text", { "font-size": 24, "font-weight": 700, fill: t.color }, kind === "no" ? "✗" : "✓");
          mark.replaceChildren(glyph);
          const room = svg.viewBox.baseVal;
          const sides = [
            { x: union.x + union.width + 10, y: union.y + union.height / 2 + 8, anchor: "start" },
            { x: union.x + union.width / 2, y: union.y + union.height + 28, anchor: "middle" },
            { x: union.x - 10, y: union.y + union.height / 2 + 8, anchor: "end" },
          ];
          for (const side of sides) {
            glyph.setAttribute("x", side.x.toFixed(1));
            glyph.setAttribute("y", side.y.toFixed(1));
            glyph.setAttribute("text-anchor", side.anchor);
            const g = glyph.getBBox();
            if (Math.min(g.x - room.x, g.y - room.y, room.x + room.width - (g.x + g.width), room.y + room.height - (g.y + g.height)) >= 12) break;
          }
          continue;
        }
        mark.replaceChildren(...parts);
      }
    }
    groups.forEach((g, i) => { g.style.display = shown[i]; });
  }
  function walkScene(scene, stageWidth, stageTop = 0, stageHeight = 0) {
    const S = window.LKScene;
    const tones = WALK_TONES();
    const tone = (name) => tones[name] || tones.slate;
    let out = '';
    // Sheets and boxes first: a highlight drawn before them would disappear
    // under their white fill.
    for (const s of scene.sheets || []) out += S.sheet(s.x, s.y, s.w, s.h, s.title || '', s.lines ?? 4, tone(s.tone).stroke);
    for (const g of scene.grids || []) out += S.grid(g.x, g.y, g.cols, g.rows, g);
    for (const g of scene.gears || []) out += S.gear(g.x, g.y, g.r || 60, g.teeth || 10, tone(g.tone).stroke);
    // Una caja y una etiqueta se marcan: el lint mide si alguna flecha las alcanza
    // o si quedan lejos de todo lo dibujado, que es una palabra flotando.
    for (const b of scene.boxes || []) {
      const t = tone(b.tone);
      out += `<g data-box="1"${b.id ? ` data-box-id="${S.esc(b.id)}"` : ''}>` + S.box(b.x, b.y, b.w, b.h, b.label || '', {
        stroke: b.stroke || t.stroke, fill: b.fill || t.fill, color: b.color || t.color,
        size: b.size || 26, sub: b.sub || '', rx: b.rx ?? 10,
        subDy: b.subDy ?? 30, subSize: b.subSize ?? 22,
      }) + '</g>';
    }
    for (const n of scene.nodes || []) {
      const t = tone(n.tone);
      out += S.node(n.x, n.y, n.label || '', { stroke: t.stroke, fill: t.fill, color: t.color, r: n.r || 30 });
    }
    // Un icono se dibuja con el relleno suave de su tono, no con blanco: un
    // relleno blanco sobre el papel blanco dejaba solo un contorno de 2 unidades y
    // el robot de «El problema que solo existe en el tiempo» se leía como nada.
    // Su centro se mantiene dentro del lienzo: `x` es el centro, y un icono a 8
    // unidades con 56 de ancho quedaba medio fuera del `viewBox` y el SVG lo
    // recortaba. Un icono declarado se ve entero o la puerta lo llama
    // `pieza-invisible`.
    for (const ic of scene.icons || []) {
      const t = tone(ic.tone);
      const size = ic.size || 64;
      const cx = stageWidth ? Math.min(Math.max(ic.x, size / 2), stageWidth - size / 2) : ic.x;
      const cy = stageHeight ? Math.min(Math.max(ic.y, stageTop + size / 2), stageTop + stageHeight - size / 2) : ic.y;
      out += `<g data-icon="${S.esc(ic.kind || 'doc')}"${ic.id ? ` data-icon-id="${S.esc(ic.id)}"` : ''}>`
        + S.icon(ic.kind || 'doc', cx, cy, size, { stroke: t.stroke, fill: ic.fill || t.fill }) + '</g>';
    }
    // Un número pegado al dibujo: dice «mira acá» sin repetir el nombre de la pieza.
    const atoms = sceneAtoms(scene);
    for (const c of scene.callouts || []) {
      const t = tone(c.tone || 'blue');
      // El número y su guía van marcados: el lint mide si un callout se apoya en el
      // de al lado, y un círculo sobre la guía ajena deja de saberse de quién es.
      const at = calloutAtom(c, atoms);
      if (at !== null) {
        // La guía nace sin destino: `placeCallouts` la lleva al glifo que el lector
        // dibujó, después de que el navegador componga la fórmula.
        out += `<g data-callout-guide="${c.n}" data-atom="${at}" data-from="${S.f(c.x)},${S.f(c.y)}">` + S.line(c.x, c.y, c.x, c.y, { color: t.stroke, width: 2, arrow: false }) + `</g>`;
      } else if (c.at !== undefined || c.symbol !== undefined || c.atom !== undefined) {
        // El callout nombra un símbolo que la fórmula no tiene: la escena lo dice en
        // vez de dibujar una guía al aire, y el lint lo llama `callout-desviado`.
        out += `<g data-callout-guide="${c.n}" data-callout-missing="${S.esc(c.symbol ?? c.atom ?? c.at)}"></g>`;
      } else if (Array.isArray(c.to)) {
        out += `<g data-callout-guide="${c.n}">` + S.line(c.x, c.y, c.to[0], c.to[1], { color: t.stroke, width: 2, arrow: false }) + `</g>`;
      }
      out += `<g data-callout="${c.n}">` + S.badge(c.x, c.y, c.n) + `</g>`;
    }
    let atomBase = 0;
    for (const fm of scene.formulas || (scene.formula ? [scene.formula] : [])) {
      out += S.formula(fm.x ?? 380, fm.y ?? 120, fm.atoms || [], {
        size: fm.size ?? 64, color: tone(fm.tone || 'ink').stroke, offset: atomBase,
        focus: fm.focus ?? scene.focus ?? null, dim: fm.dim !== false,
      });
      atomBase += (fm.atoms || []).length;
    }
    for (const b of scene.bars || []) {
      out += S.bars(b.x ?? 40, b.y ?? 60, (b.rows || []).map((r) => ({ ...r, color: tone(r.tone || 'blue').stroke })), {
        width: b.width ?? 560, rowH: b.rowH ?? 56,
      });
    }
    for (const st of scene.stats || []) {
      out += S.stat(st.x, st.y, st.value, st.label || '', { color: tone(st.tone || 'ink').stroke, size: st.size || 54 });
    }
    // Una curva es una curva: el escenario del video ya la dibuja así
    // (`tools/video/src/page/stage.js`), y la lectura tiene que poder dibujar la
    // campana en vez de una caja que la nombra. Va antes de las flechas: una
    // región rellena (la banda ±σ) no puede tapar la flecha que la señala, y la
    // punta de la flecha tiene que verse sobre la curva.
    // La tinta de la figura va marcada: el lint distingue el trazo que dibuja la
    // cosa (la curva, el eje, la banda) del conector que la señala, y solo al
    // conector le exige que sus dos extremos lleguen a algo.
    for (const c of scene.curves || []) {
      const t = tone(c.tone);
      out += '<g data-path="1">' + S.curve(c.x1, c.y1, c.x2, c.y2, {
        color: t.stroke, dashedLine: !!c.dashed, bend: c.bend ?? 0.35, width: c.width ?? 4, arrow: c.arrow !== false, fill: c.fill || 'none',
      }) + '</g>';
    }
    for (const p of scene.paths || []) {
      const t = tone(p.tone);
      out += '<g data-path="1">' + S.path(p.d, {
        color: t.stroke, dashedLine: !!p.dashed, width: p.width ?? 4, arrow: p.arrow !== false, fill: p.fill || 'none',
      }) + '</g>';
    }
    // A policy field is one fixed arrow per cell, the drawing a sentence like
    // "la fila de arriba apunta a la derecha" promises. Drawn before the plain
    // arrows so a beat's movement arrow stays the loudest thing on screen.
    for (const p of scene.policy || []) {
      const [ux, uy] = policyDir(p.dir || 'up');
      const len = p.len || 22;
      const pad = p.pad ?? 6;
      const x0 = p.x + pad;
      const y0 = p.y + p.h - pad;
      out += S.line(x0, y0, x0 + ux * len, y0 + uy * len, { color: tone(p.tone || 'blue').stroke, width: p.width || 2 });
    }
    for (const a of scene.arrows || []) {
      // La flecha se marca con los extremos que escribió el autor: una flecha con
      // etiqueta se dibuja en dos tramos, y el lint tiene que medir la punta que el
      // autor declaró, no el trozo que quedó después del hueco de las palabras.
      const drawnFrom = out.length;
      const color = tone(a.tone).stroke;
      const size = a.labelSize || 22;
      // A figure drawn at the width of the reading column is a third of the
      // video's canvas: at the video's 4-unit stroke the shaft and its head
      // swallow a short arrow. The width travels with the arrow so a scene can
      // say how heavy it should be.
      const shaft = a.width || 4;
      const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy) || 1;
      const vertical = Math.abs(dy) > Math.abs(dx) * 1.5;
      // A caption drawn on the line hides the direction the arrow exists to show. The arrow
      // is cut where its words sit, the way a labelled arrow is drawn by hand: shaft, words,
      // shaft with the head. A short arrow has no room to cut, so the words move beside it.
      // The scene marker is 11 units across a 12-unit viewBox, with refX=10
      // and a 4-unit stroke: it extends 10 * 11 / 12 * 4 = 36.67 units backwards.
      const headBack = 10 * 11 / 12 * shaft;
      const words = a.label ? Math.min(stageWidth - 30, a.label.length * size * 0.45 + 12) : 0;
      // El hueco se mide en la dirección del trazo: en una flecha vertical lo que
      // ocupa el texto es su alto, no su ancho. Con el ancho, el hueco triplicaba
      // al texto y la línea quedaba colgando antes de sus palabras.
      const cut = Math.min(len * 0.62, vertical ? size * 1.6 : words);
      const captionRun = vertical ? size * 1.2 : words;
      // Where along the shaft the words sit. Two arrows running the same way
      // stack their captions in one column and read as dashes; staggering them
      // (0.35 and 0.65) puts each caption beside the side it belongs to.
      const at = Math.min(0.88, Math.max(0.12, a.labelAt ?? 0.5));
      const before = len * at - cut / 2;
      const after = len * (1 - at) - cut / 2;
      // Las palabras van al lado de un trazo entero: cortar la flecha para meterlas
      // dentro se lee como dos conectores —uno que llega al número y otro que sale
      // de él—, y el lint lo llama `flecha-quebrada`. Solo se meten en el trazo
      // cuando arriba no hay aire para ponerlas (`labelBeside` fuerza el lado).
      const gap = 11 * shaft / 2 + 4;
      const besideTop = Math.min(a.y1, a.y2) - gap - size * 0.3 - size * 0.8;
      const besideFits = vertical || besideTop >= stageTop + 12;
      if (a.label && !a.labelBeside && !besideFits && cut >= captionRun && cut > size * 1.2 && before > size * 0.6 && after > headBack) {
        const ux = dx / len, uy = dy / len;
        const half = cut / 2;
        const midX = a.x1 + ux * len * at, midY = a.y1 + uy * len * at;
        const head = { x: midX + ux * half, y: midY + uy * half };
        out += S.line(a.x1, a.y1, midX - ux * half, midY - uy * half, { color, dashedLine: !!a.dashed, arrow: false, width: shaft });
        out += S.line(head.x, head.y, a.x2, a.y2, { color, dashedLine: !!a.dashed, width: shaft });
        out += S.lbl(midX + (vertical ? 0 : 0), midY + size * 0.36, a.label, {
          anchor: 'middle', color: tone(a.labelTone || a.tone).color, size,
          fit: vertical ? Math.max(1, 2 * Math.min(midX - 4, stageWidth - midX - 4)) : Math.max(1, cut - 14),
        });
      } else {
        if (a.bend !== undefined) out += S.curve(a.x1, a.y1, a.x2, a.y2, { color, dashedLine: !!a.dashed, bend: a.bend, width: shaft });
        else out += S.line(a.x1, a.y1, a.x2, a.y2, { color, dashedLine: !!a.dashed, width: shaft });
        if (a.label) {
          const midY = (a.y1 + a.y2) / 2 - (a.bend === undefined ? 0 : Math.abs(dy) * 0.18);
          const left = Math.min(a.x1, a.x2) - gap, right = Math.max(a.x1, a.x2) + gap;
          const side = left - 4 > stageWidth - right - 4 ? -1 : 1;
          // Las palabras pertenecen a la flecha, así que su ancho disponible es el
          // tramo libre de su propio eje, sin la punta. Medirlas contra el ancho del
          // escenario entero las dejaba dibujadas encima de la caja de salida y de
          // la cabeza: el ajuste decía que cabían donde no cabían.
          const dirX = Math.sign(dx) || 1;
          const freeStart = a.x1 + dirX * 3;
          const freeEnd = a.x2 - dirX * headBack;
          const freeWidth = Math.max(1, Math.abs(freeEnd - freeStart));
          const x = vertical ? (side > 0 ? right : left) : Math.max(15, Math.min(stageWidth - 15, (freeStart + freeEnd) / 2));
          const fit = vertical ? Math.max(1, side > 0 ? stageWidth - x - 4 : x - 4) : Math.max(1, Math.min(freeWidth - 4, 2 * Math.min(x - 4, stageWidth - x - 4)));
          out += S.lbl(x, vertical ? midY + size * 0.36 : Math.min(a.y1, a.y2) - gap - size * 0.3, a.label, {
            anchor: vertical ? (side > 0 ? 'start' : 'end') : 'middle',
            color: tone(a.labelTone || a.tone).color,
            size, fit,
          });
        }
      }
      out = out.slice(0, drawnFrom)
        + `<g data-arrow="${a.x1},${a.y1}" data-to="${a.x2},${a.y2}">` + out.slice(drawnFrom) + '</g>';
    }
    for (const b of scene.badges || []) out += S.badge(b.x, b.y, b.n);
    for (const d of scene.dashed || []) out += S.dashed(d.x, d.y, d.w, d.h, d.label || '', tone(d.tone).stroke, d.fill);
    for (const l of scene.labels || []) out += `<g data-label="1"${l.id ? ` data-label-id="${S.esc(l.id)}"` : ''}>` + S.lbl(l.x, l.y, l.text, { anchor: l.anchor || 'middle', color: tone(l.tone).color, size: l.size || 24 }) + '</g>';
    // Actores, rótulos con punta, movimientos y marcas: la escena de un paso de
    // `lk-story`. Se dibujan como marcadores vacíos y `placeStory` los rellena con
    // las cajas que el navegador midió, nunca con coordenadas escritas a mano.
    for (const a of scene.actors || []) {
      const t = tone(a.tone);
      const faded = a.state === 'faded';
      out += `<g data-actor="${S.esc(a.id)}"${faded ? ' data-faded="1"' : ''}>` + S.box(a.x, a.y, a.w, a.h, a.label || '', {
        stroke: faded ? S.C.slate2 : t.stroke, fill: faded ? '#F1F3F4' : t.fill, color: faded ? S.C.slate2 : t.color,
        size: a.size || 18, rx: a.rx ?? 10,
      }) + '</g>';
      // El nombre del actor va en una ficha con punta, arriba de su caja: el
      // rótulo dice quién es sin escribir una coordenada.
      if (a.tag) out += `<g data-tag-to="${S.esc(a.id)}" data-tag-text="${S.esc(a.tag)}" data-tag-tone="${S.esc(a.tone || 'slate')}"></g>`;
    }
    for (const tg of scene.tags || []) {
      out += `<g data-tag-to="${S.esc(tg.to)}" data-tag-text="${S.esc(tg.text)}" data-tag-tone="${S.esc(tg.tone || 'slate')}"${Array.isArray(tg.at) ? ` data-tag-at="${S.f(tg.at[0])},${S.f(tg.at[1])}"` : ''}></g>`;
    }
    for (const mv of scene.moves || []) {
      out += `<g data-move-from="${S.esc(mv.from)}" data-move-to="${S.esc(mv.to)}" data-move-verb="${S.esc(mv.verb || '')}" data-move-tone="${S.esc(mv.tone || 'amber')}"><path fill="none" data-move-path="1"/><text data-move-label="1"></text></g>`;
    }
    for (const mk of scene.marks || []) {
      out += `<g data-mark-kind="${S.esc(mk.kind)}" data-mark-actors="${S.esc((mk.actors || [mk.actor]).filter(Boolean).join(','))}"${mk.to ? ` data-mark-to="${S.esc(mk.to)}"` : ''}${mk.label ? ` data-mark-label="${S.esc(mk.label)}"` : ''}></g>`;
    }
    return out;
  }
  // No word may leave the box that holds it. Measuring the real glyphs is the
  // only honest way: a character count said this deck fit while it overflowed.
  // Shared by every figure on a page, stepped or still.
  function fitSceneText(stage, { minPx = 0, flagOverflow = false } = {}) {
    const S = window.LKScene;
    // Un texto que se encoge hasta lo ilegible ya no explica nada: el suelo se
    // declara en píxeles de pantalla y se traduce a unidades del lienzo. Cuando el
    // suelo impide encajar el texto, la escena lo marca en vez de callarse.
    const svg = stage.querySelector('svg');
    const vbWidth = svg?.viewBox?.baseVal?.width || 0;
    const svgWidth = svg ? svg.getBoundingClientRect().width : 0;
    const unitFloor = minPx > 0 && vbWidth > 0 && svgWidth > 0 ? (minPx * vbWidth) / svgWidth : 0;
    const groups = [...stage.querySelectorAll('[data-step]')];
    const shown = groups.map((g) => g.style.display);
    // A hidden text measures as zero, so the pass sees every step at once.
    groups.forEach((g) => { g.style.display = ''; });
    for (const text of stage.querySelectorAll('text[data-fit]')) {
      const max = Number(text.dataset.fit);
      const authored = Number(text.getAttribute('font-size')) || 22;
      if (!(max > 0)) continue;
      // El 2 % de margen evita que el redondeo subpíxel deje el suelo justo por
      // debajo del mínimo que la escena promete.
      const floor = Math.max(authored * 0.55, unitFloor * 1.02);
      for (let tries = 0; tries < 4; tries++) {
        const need = text.getComputedTextLength();
        if (need <= max) break;
        const size = Math.max(floor, (Number(text.getAttribute('font-size')) || authored) * (max / need) * 0.98);
        text.setAttribute('font-size', S.f(size));
        if (size === floor) break;
      }
      // Last resort: squeezing the glyphs is still better than spilling the box.
      if (text.getComputedTextLength() > max) {
        text.setAttribute('textLength', String(Math.round(max)));
        text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        text.dataset.overflow = '1';
        if (flagOverflow) stage.dataset.overflow = '1';
      }
    }
    groups.forEach((g, i) => { g.style.display = shown[i]; });
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
    const stageWidth = Number((spec.viewBox || '0 0 1200 640').trim().split(/[\s,]+/)[2]) || 1200;
    // El ancho declarado es el techo de la figura: 1 unidad ≈ 1 píxel. En modo
    // ancho la columna mide el doble y, sin esto, la escena se estiraba a 1,7×.
    stage.style.setProperty('--lk-vb', `${stageWidth}px`);
    const stageTop = Number((spec.viewBox || '0 0 1200 640').trim().split(/[\s,]+/)[1]) || 0;
    const stageHeight = Number((spec.viewBox || '0 0 1200 640').trim().split(/[\s,]+/)[3]) || 640;
    const markup = S.svg(steps.map((s, i) => S.step(i + 1, walkScene(s.scene || {}, stageWidth, stageTop, stageHeight))).join(''), spec.viewBox || '0 0 1200 640');
    stage.replaceChildren(document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true));
    const captionTitle = el('strong');
    const captionText = el('p');
    const caption = el('div', undefined, { class: 'lk-wt-caption' });
    caption.append(captionTitle, captionText);
    const hint = el('p', 'Desliza el diagrama para verlo completo', { class: 'lk-wt-hint' });
    const count = el('span', undefined, { class: 'lk-wt-count' });
    const dots = el('div', undefined, { class: 'lk-wt-dots' });
    let index = 0;
    const prev = button('◀ Anterior', () => go(index - 1));
    const next = button('Siguiente ▶', () => go(index + 1));
    const reveal = button('Ir al final', () => go(steps.length - 1));
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
    fitSceneText(stage);
    placeCallouts(stage);
    placeStory(stage);
    watchCallouts(stage, () => fitSceneText(stage));
    steps.forEach((_, i) => {
      const dot = button(String(i + 1), () => go(i));
      dot.className = 'lk-wt-dot';
      dot.setAttribute('aria-label', `Paso ${i + 1}`);
      dots.append(dot);
    });
    function go(to) { index = Math.max(0, Math.min(steps.length - 1, to)); draw(); }
    function draw() {
      // One scene per step: the figure shows the state that step describes, and
      // Un escenario por paso: la figura muestra el estado que ese paso describe.
      // «Ir al final» salta al último paso en vez de fingir que muestra todos: las
      // escenas se redibujan, no se acumulan.
      stage.querySelectorAll('[data-step]').forEach((g) => {
        g.style.display = Number(g.dataset.step) === index + 1 ? '' : 'none';
      });
      const step = steps[index];
      captionTitle.textContent = step.title || '';
      captionText.textContent = step.text || '';
      count.textContent = `Paso ${index + 1} de ${steps.length}`;
      prev.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    }
    this.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    });
    draw();
  });

  // El recorrido de una fórmula y el de un ejercicio comparten el mismo mueble:
  // una cabecera con la fórmula o la ecuación (el token del paso, resaltado), un
  // escenario donde pasa la acción (actores con su rótulo, estado por color,
  // flecha del movimiento con su verbo, marcas de resultado y codos que unen cada
  // rótulo con su blanco) y un narrador con frases cortas y fichas en línea. El
  // reproductor es el mismo en los dos: anterior, reproducir, siguiente, una barra
  // segmentada (un segmento por paso, lleno hasta el actual) y el contador N/M.
  define('lk-story', function () {
    const S = window.LKScene;
    if (!S) throw new Error('Falta scene.js: no se puede dibujar el recorrido');
    let spec;
    try { spec = JSON.parse(this.querySelector('script[type="application/json"]').textContent); }
    catch (error) { throw new Error(`El recorrido tiene un JSON inválido: ${error.message}`); }
    const steps = spec.steps || [];
    if (!steps.length) throw new Error('El recorrido no tiene pasos');
    const kind = spec.kind === 'derivation' ? 'derivation' : 'formula';
    const viewBox = spec.viewBox || '0 0 360 250';
    const box = viewBox.trim().split(/[\s,]+/).map(Number);
    const stageWidth = box[2] || 360, stageTop = box[1] || 0, stageHeight = box[3] || 250;
    const stage = el('div', undefined, { class: 'lk-story-stage lk-wt-stage lk-remap' });
    stage.style.setProperty('--lk-vb', `${stageWidth}px`);
    // La fórmula vive en la cabecera (HTML, con el token del paso resaltado); el
    // escenario dibuja la acción, no repite la fórmula. Duplicarla en el SVG la
    // dejaba como una pieza suelta al lado de la etiqueta del paso.
    const sceneOf = (step) => ({ ...((step.stage && step.stage.scene) || step.stage || {}) });
    const markup = S.svg(steps.map((s, i) => S.step(i + 1, walkScene(sceneOf(s), stageWidth, stageTop, stageHeight))).join(''), viewBox);
    stage.replaceChildren(document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true));
    const head = el('div', undefined, { class: 'lk-story-head' });
    const narrator = el('div', undefined, { class: 'lk-story-narrator' });
    const count = el('span', undefined, { class: 'lk-story-count' });
    const progress = el('div', undefined, { class: 'lk-story-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(steps.length) });
    const segs = steps.map(() => { const s = el('span', undefined, { class: 'lk-story-seg' }); progress.append(s); return s; });
    let index = 0, timer = null;
    const prev = button('◀', () => go(index - 1));
    const next = button('▶', () => go(index + 1));
    const play = button('▶ Reproducir', () => toggle());
    prev.setAttribute('aria-label', 'Paso anterior');
    next.setAttribute('aria-label', 'Paso siguiente');
    play.setAttribute('aria-label', 'Reproducir los pasos');
    const player = el('div', undefined, { class: 'lk-story-player' });
    player.append(prev, play, next, progress, count);
    this.classList.add('lk-story', `lk-story-kind-${kind}`);
    this.tabIndex = 0;
    if (spec.title) this.append(el('strong', spec.title, { class: 'lk-title' }));
    this.append(head, stage, narrator, player);
    // Una ficha en línea: «texto» se dibuja como un chip y *texto* como una
    // palabra clave con el color del acento. El narrador no escribe HTML.
    function inline(text) {
      const frag = document.createDocumentFragment();
      const source = String(text ?? '');
      const re = /«([^»]+)»|\*([^*]+)\*/g;
      let last = 0, m;
      while ((m = re.exec(source))) {
        if (m.index > last) frag.append(document.createTextNode(source.slice(last, m.index)));
        frag.append(m[1] !== undefined ? el('span', m[1], { class: 'lk-chip' }) : el('span', m[2], { class: 'lk-key' }));
        last = re.lastIndex;
      }
      if (last < source.length) frag.append(document.createTextNode(source.slice(last)));
      return frag;
    }
    function tokens(atoms, focus) {
      const on = new Set((focus || []).map(String));
      const wrap = el('div', undefined, { class: 'lk-story-formula' });
      atoms.forEach((a, i) => {
        const atom = typeof a === 'string' ? { t: a } : a;
        const id = atom.id ?? String(i);
        const token = el('span', atom.t, { class: 'lk-token', 'data-atom': id });
        token.style.whiteSpace = 'pre';
        if (on.has(id) || on.has(String(i))) { token.classList.add('lk-token-focus'); token.dataset.focus = '1'; }
        wrap.append(token);
      });
      return wrap;
    }
    function narrate(step) {
      narrator.replaceChildren();
      if (step.say) {
        const dl = el('dl', undefined, { class: 'lk-story-say' });
        for (const [label, key] of [['Qué es', 'what'], ['Para qué se usa', 'use'], ['En el ejemplo', 'value']]) {
          if (!step.say[key]) continue;
          const dd = el('dd'); dd.append(inline(step.say[key]));
          dl.append(el('dt', label), dd);
        }
        narrator.append(dl);
      }
      if (step.narrator) {
        const p = el('p', undefined, { class: 'lk-story-line' });
        p.append(inline(step.narrator));
        narrator.append(p);
      }
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function toggle() {
      if (timer) { stop(); draw(); return; }
      if (index === steps.length - 1) { index = 0; draw(); }
      timer = setInterval(() => {
        if (index >= steps.length - 1) { stop(); draw(); return; }
        index += 1; draw();
      }, 4200);
      draw();
    }
    function go(to) { index = Math.max(0, Math.min(steps.length - 1, to)); draw(); }
    function draw() {
      stage.querySelectorAll('[data-step]').forEach((g) => { g.style.display = Number(g.dataset.step) === index + 1 ? '' : 'none'; });
      const step = steps[index];
      const atoms = kind === 'derivation' ? (step.equation?.atoms || []) : (spec.formula?.atoms || []);
      head.replaceChildren();
      if (atoms.length) head.append(tokens(atoms, step.focus));
      narrate(step);
      count.textContent = `${index + 1} / ${steps.length}`;
      segs.forEach((seg, i) => { seg.dataset.filled = String(i <= index); seg.setAttribute('aria-current', String(i === index)); });
      progress.setAttribute('aria-valuenow', String(index + 1));
      prev.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      play.textContent = timer ? '❚❚ Pausa' : index === steps.length - 1 ? '↺ Repetir' : '▶ Reproducir';
      play.setAttribute('aria-pressed', String(Boolean(timer)));
    }
    this.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    });
    fitSceneText(stage, { minPx: 11 });
    placeStory(stage);
    watchCallouts(stage, () => fitSceneText(stage, { minPx: 11 }));
    draw();
  });

  // One figure that only has to be looked at. Same vocabulary, same measuring
  // pass as the walkthrough, without borrowing its step controls: a scene with
  // nothing to step through should not pretend to have steps.
  define('lk-scene', function () {
    const S = window.LKScene;
    if (!S) throw new Error('Falta scene.js: no se puede dibujar la escena');
    let spec;
    try { spec = JSON.parse(this.querySelector('script[type="application/json"]').textContent); }
    catch (error) { throw new Error(`La escena tiene un JSON inválido: ${error.message}`); }
    const viewBox = spec.viewBox || '0 0 1200 520';
    const stageWidth = Number(viewBox.trim().split(/[\s,]+/)[2]) || 1200;
    const stage = el('div', undefined, { class: 'lk-scene-stage lk-remap' });
    stage.style.setProperty('--lk-vb', `${stageWidth}px`);
    // Parsed as an SVG document, never assigned as HTML: the markup is ours and
    // already escaped, but a figure has no business executing anything.
    const stageTop = Number(viewBox.trim().split(/[\s,]+/)[1]) || 0;
    const stageHeight = Number(viewBox.trim().split(/[\s,]+/)[3]) || 520;
    const parsed = new DOMParser().parseFromString(S.svg(walkScene(spec.scene || {}, stageWidth, stageTop, stageHeight), viewBox), 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('La escena no se pudo dibujar: SVG inválido');
    stage.append(document.importNode(parsed.documentElement, true));
    const svg = stage.querySelector('svg');
    if (svg) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', spec.title || 'Escena');
    }
    const figure = el('figure');
    figure.append(stage);
    if (spec.caption) figure.append(el('figcaption', spec.caption, { class: 'lk-scene-caption' }));
    this.classList.add('lk-scene');
    if (spec.title) this.append(el('strong', spec.title, { class: 'lk-title' }));
    this.append(figure);
    fitSceneText(stage, { minPx: 11, flagOverflow: true });
    placeCallouts(stage);
    placeStory(stage);
    watchCallouts(stage, () => fitSceneText(stage, { minPx: 11, flagOverflow: true }));
  });

  // A figure drawn from its meaning by the visual engine (tools/visuals). The
  // note carries the scene; the drawing only names tones, so it follows the
  // paper it lands on: light, dark, or whatever the reader's system prefers.
  define('lk-figure', function () {
    const V = window.LKVisuals;
    if (!V) throw new Error('Falta visuals/draw.js: no se puede dibujar la figura');
    let scene;
    try { scene = JSON.parse(this.querySelector('script[type="application/json"]').textContent); }
    catch (error) { throw new Error(`La figura tiene un JSON inválido: ${error.message}`); }
    // One token block for every figure on the page: the drawing itself names
    // tones and never carries a colour of its own.
    if (!document.getElementById('lk-visuals-theme')) {
      const tokens = el('style'); tokens.id = 'lk-visuals-theme'; tokens.textContent = V.themeCss();
      document.head.append(tokens);
    }
    const stage = el('div', undefined, { class: 'lk-figure-stage' });
    const viewWidth = Number(String(scene.viewBox || '').trim().split(/[\s,]+/)[2]);
    if (viewWidth > 0) stage.style.setProperty('--lk-vb', `${viewWidth}px`);
    let markup;
    try { markup = V.renderScene(scene, { mode: 'vars', style: false }); }
    catch (error) { throw new Error(`La figura no se pudo dibujar: ${error.message}`); }
    // The engine draws only what it can read; a scene that would paint a blank
    // box is not a figure, and it says so instead of showing an empty drawing.
    if (!V.sceneDraws(scene)) throw new Error('La figura no dibuja nada: la escena está vacía');
    // Parsed as an SVG document, never assigned as HTML: the markup is ours and
    // already escaped, but a figure has no business executing anything.
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('La figura no se pudo dibujar: SVG inválido');
    stage.append(document.importNode(parsed.documentElement, true));
    const svg = stage.querySelector('svg');
    if (svg) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', scene.aria || scene.title || 'Figura');
    }
    const figure = el('figure');
    figure.append(stage);
    this.classList.add('lk-figure');
    this.append(figure);
  });
})();
