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
    const S = window.LKScene;
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
    const findIn = (step, id) => step.querySelector(`[data-actor="${sel(id)}"], [data-box-id="${sel(id)}"], [data-label-id="${sel(id)}"], [data-icon-id="${sel(id)}"], [data-prop-id="${sel(id)}"], [data-callout="${sel(id)}"]`);
    // Un glifo de resultado (✓ / ✗) se coloca donde cabe dentro del lienzo, midiendo
    // lo que el navegador dibujó: sobre el lado que se prefiere, sin encimarse con
    // las piezas que se le pasan en `avoid`. Si ningún lado cabe, queda en el primero.
    const room = svg.viewBox.baseVal;
    const touches = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    const glyphAt = (holder, kind, union, { corner = false, avoid = [], below: underneath = false } = {}) => {
      const t = tone(kind === "no" ? "red" : "green");
      const glyph = make("text", { "font-size": 24, "font-weight": 700, fill: t.color }, kind === "no" ? "✗" : "✓");
      holder.replaceChildren(glyph);
      const right = { x: union.x + union.width + 10, y: union.y + union.height / 2 + 8, anchor: "start" };
      const left = { x: union.x - 10, y: union.y + union.height / 2 + 8, anchor: "end" };
      const below = { x: union.x + union.width / 2, y: union.y + union.height + 28, anchor: "middle" };
      const sides = corner
        ? [{ x: union.x + union.width + 6, y: union.y + 18, anchor: "start" }, right, below, left, { x: union.x - 6, y: union.y + 18, anchor: "end" }]
        : underneath ? [below, right, left] : [right, below, left];
      let first = null;
      for (const side of sides) {
        glyph.setAttribute("x", side.x.toFixed(1));
        glyph.setAttribute("y", side.y.toFixed(1));
        glyph.setAttribute("text-anchor", side.anchor);
        const g = glyph.getBBox();
        first = first || side;
        const air = Math.min(g.x - room.x, g.y - room.y, room.x + room.width - (g.x + g.width), room.y + room.height - (g.y + g.height));
        if (air >= 12 && !avoid.some((b) => touches(g, b))) return glyph;
      }
      glyph.setAttribute("x", first.x.toFixed(1));
      glyph.setAttribute("y", first.y.toFixed(1));
      glyph.setAttribute("text-anchor", first.anchor);
      return glyph;
    };
    const boxOf = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    // Una pieza dibujada se pone desde su actor, no desde una coordenada: junto al
    // lado que declara, y si ahí no cabe —borde del lienzo, otro actor, otra pieza o
    // el nombre que el actor lleva arriba— en el primero que sí.
    const parse = (markup) => [...new DOMParser().parseFromString(`<svg xmlns="${ns}">${markup}</svg>`, "image/svg+xml").documentElement.childNodes].map((n) => document.importNode(n, true));
    const placeProps = (step) => {
      const props = [...step.querySelectorAll("[data-prop-id]")];
      props.forEach((p) => p.replaceChildren());
      const reserved = [...step.querySelectorAll("[data-tag-to]")].map((tg) => {
        const target = findIn(step, tg.dataset.tagTo);
        if (!target || target.hasAttribute("data-prop-id")) return null;
        const b = target.getBBox();
        const w = Math.max(30, String(tg.dataset.tagText || "").length * 13 * 0.56 + 16);
        return { x: b.x + b.width / 2 - w / 2 - 4, y: b.y - 8 - 25 - 8, width: w + 8, height: 25 + 8 + 8 };
      }).filter(Boolean);
      const placed = [];
      for (const prop of props) {
        const kind = prop.dataset.propKind || "value";
        const size = Number(prop.dataset.propSize) || 34;
        const freed = prop.dataset.propState === "freed";
        const grey = freed || prop.dataset.propState === "faded";
        const t = grey ? { stroke: S.C.slate2, fill: "#ffffff", color: S.C.slate2 } : tone(prop.dataset.propTone || "slate");
        const label = prop.dataset.propLabel || "";
        const draw = (cx, cy, labelY) => {
          const markup = S.prop(kind, cx, cy, size, { stroke: t.stroke, fill: t.fill }) || S.icon(kind, cx, cy, size, { stroke: t.stroke, fill: t.fill });
          prop.replaceChildren(...parse(markup));
          // Un valor liberado ya no existe: su contorno se deshace en trazos y el
          // relleno desaparece, pero conserva su palabra («liberado»).
          if (freed) for (const shape of prop.querySelectorAll("rect, circle, path")) {
            shape.setAttribute("stroke-dasharray", "5 4");
            if (shape.getAttribute("fill") !== "none") shape.setAttribute("fill", "none");
          }
          if (label) prop.append(make("text", { x: cx.toFixed(1), y: labelY.toFixed(1), "font-size": 14, "font-weight": 700, fill: t.color, "text-anchor": "middle" }, label));
        };
        let spots;
        if (prop.dataset.propOn) {
          const anchor = findIn(step, prop.dataset.propOn);
          if (!anchor) { prop.dataset.propMissing = prop.dataset.propOn; continue; }
          const b = anchor.getBBox();
          const gap = 10, cxm = b.x + b.width / 2, cym = b.y + b.height / 2;
          const at = {
            right: [b.x + b.width + gap + size / 2, cym, "up"],
            left: [b.x - gap - size / 2, cym, "up"],
            above: [cxm, b.y - gap - size / 2, "up"],
            below: [cxm, b.y + b.height + gap + size / 2, "down"],
          };
          const order = [...new Set([prop.dataset.propSide, "right", "left", "below", "above"].filter((side) => at[side]))];
          spots = order.map((side) => at[side]);
        } else {
          const [x, y] = String(prop.dataset.propAt || "").split(",").map(Number);
          spots = [[x, y, "up"]];
        }
        const others = [...step.querySelectorAll("[data-actor]")].map(boxOf).concat(reserved, placed);
        let chosen = null;
        for (const [cx, cy, where] of spots) {
          draw(cx, cy, where === "up" ? cy - size / 2 - 6 : cy + size / 2 + 14);
          const g = prop.getBBox();
          const air = Math.min(g.x - room.x, g.y - room.y, room.x + room.width - (g.x + g.width), room.y + room.height - (g.y + g.height));
          chosen = chosen || [cx, cy, where];
          if (air >= 14 && !others.some((o) => touches(g, o))) { chosen = [cx, cy, where]; break; }
        }
        const [cx, cy, where] = chosen;
        draw(cx, cy, where === "up" ? cy - size / 2 - 6 : cy + size / 2 + 14);
        placed.push(boxOf(prop));
      }
    };
    for (const step of scopes) {
      placeProps(step);
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
        // Dos piezas una al lado de la otra se unen con un trazo que sale y llega en
        // horizontal, por la franja de altura que comparten; una arriba de la otra,
        // con el codo vertical de siempre.
        const sideBySide = Math.abs((a.x + a.width / 2) - (b.x + b.width / 2)) > Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) * 1.2;
        const shared = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
        const lane = Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
        const start = sideBySide && lane
          ? { x: a.x + a.width / 2 < b.x + b.width / 2 ? a.x + a.width : a.x, y: shared }
          : edgeOf(a, b.x + b.width / 2, b.y + b.height / 2);
        const end = sideBySide && lane
          ? { x: a.x + a.width / 2 < b.x + b.width / 2 ? b.x : b.x + b.width, y: shared }
          : edgeOf(b, a.x + a.width / 2, a.y + a.height / 2);
        const midY = (start.y + end.y) / 2;
        const path = move.querySelector("[data-move-path]");
        path.setAttribute("d", sideBySide && lane
          ? `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
          : `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${start.x.toFixed(1)} ${midY.toFixed(1)}, ${end.x.toFixed(1)} ${midY.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
        path.setAttribute("stroke", t.stroke);
        // La punta crece con el grosor del trazo (11 × el grosor): con 1,5 mide una
        // flecha, con 2 mide un triángulo que tapa el actor al que llega.
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "6 5");
        path.setAttribute("marker-end", marker(move.dataset.moveTone));
        const label = move.querySelector("[data-move-label]");
        label.textContent = move.dataset.moveVerb || "";
        // En un trazo horizontal el verbo va centrado sobre el trazo, lejos de la punta;
        // en uno que baja, más a la derecha del arranque, como siempre.
        label.setAttribute("x", (sideBySide && lane ? (start.x + end.x) / 2 : Math.max((start.x + end.x) / 2, start.x + 66)).toFixed(1));
        label.setAttribute("y", (Math.min(start.y, end.y) - 16).toFixed(1));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "13");
        label.setAttribute("font-weight", "700");
        label.setAttribute("fill", t.color);
        label.setAttribute("data-fit", String(Math.max(40, Math.abs(end.x - start.x) + 60)));
      }
      const pieces = () => [...step.querySelectorAll("[data-actor], [data-prop-id]")].map(boxOf);
      for (const mark of step.querySelectorAll("[data-mark-kind]")) {
        const kind = mark.dataset.markKind;
        // Un resultado entre dos actores cae en el hueco que los separa: el ✓ o el ✗
        // dice qué pasa de uno a otro, no de quién es.
        if (mark.dataset.markBetween) {
          const [a, b] = String(mark.dataset.markBetween).split(",").map((id) => findIn(step, id));
          if (!a || !b) { mark.dataset.markMissing = mark.dataset.markBetween; continue; }
          const [near, far] = [boxOf(a), boxOf(b)].sort((p, q) => p.x - q.x);
          const across = far.x - (near.x + near.width);
          const stacked = Math.max(near.y, far.y) - Math.min(near.y + near.height, far.y + far.height);
          const hole = across >= 30
            ? { x: near.x + near.width, y: Math.min(near.y, far.y), width: across, height: Math.max(near.y + near.height, far.y + far.height) - Math.min(near.y, far.y) }
            : stacked >= 30
              ? { x: Math.min(near.x, far.x), y: Math.min(near.y + near.height, far.y + far.height), width: Math.max(near.x + near.width, far.x + far.width) - Math.min(near.x, far.x), height: stacked }
              : null;
          const joint = { x: Math.min(near.x, far.x), y: Math.min(near.y, far.y), width: Math.max(near.x + near.width, far.x + far.width) - Math.min(near.x, far.x), height: Math.max(near.y + near.height, far.y + far.height) - Math.min(near.y, far.y) };
          if (!hole) { glyphAt(mark, kind === "no" ? "no" : "ok", joint, { avoid: pieces() }); continue; }
          const t = tone(kind === "no" ? "red" : "green");
          mark.replaceChildren(make("text", { x: (hole.x + hole.width / 2).toFixed(1), y: (hole.y + hole.height / 2 + 8).toFixed(1), "font-size": 24, "font-weight": 700, fill: t.color, "text-anchor": "middle" }, kind === "no" ? "✗" : "✓"));
          continue;
        }
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
          // Una pieza (un valor, un ojo) no lleva marco: el ✓ o el ✗ se pega debajo
          // de ella, para que se lea qué aprueba o rechaza.
          const onProps = ids.length > 0 && ids.every((id) => findIn(step, id)?.hasAttribute("data-prop-id"));
          if (!onProps) for (const id of ids) {
            const frame = findIn(step, id)?.querySelector("rect");
            if (!frame) continue;
            frame.setAttribute("stroke", t.stroke);
            frame.setAttribute("stroke-width", "3.5");
          }
          const strokes = [...step.querySelectorAll("[data-path]")].map(boxOf);
          glyphAt(mark, kind === "no" ? "no" : "ok", union, { avoid: onProps ? pieces().concat(strokes) : [], below: onProps });
          continue;
        }
        mark.replaceChildren(...parts);
      }
      // El ✗ de un actor inválido, junto a su esquina y sin encimarse con nada,
      // salvo que el autor ya marcó ese actor con su propio ✗.
      for (const holder of step.querySelectorAll("[data-state-mark]")) {
        const id = holder.dataset.stateMark;
        const target = findIn(step, id);
        if (!target) continue;
        const owned = [...step.querySelectorAll('[data-mark-kind="no"]')].some((m) => String(m.dataset.markActors || "").split(",").includes(id));
        if (owned) { holder.replaceChildren(); continue; }
        glyphAt(holder, "no", boxOf(target), { corner: true, avoid: pieces().filter((b) => !(b.x === target.getBBox().x && b.y === target.getBBox().y)) });
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
    // Un actor tiene estado: activo (su tono), apagado (gris: ya no vale) o inválido
    // (gris, tachado y con su ✗). El actor es una caja con su etiqueta o, con `icon`,
    // un dibujo —el robot— centrado en (x, y).
    for (const a of scene.actors || []) {
      const t = tone(a.tone);
      const state = a.state === 'invalid' ? 'invalid' : a.state === 'faded' ? 'faded' : 'active';
      const grey = state !== 'active';
      const ink = grey ? S.C.slate2 : t.stroke;
      const sheet = grey ? '#ffffff' : t.fill;
      let body, frame;
      if (a.icon) {
        const size = a.size || 56;
        const cx = stageWidth ? Math.min(Math.max(a.x, size / 2), stageWidth - size / 2) : a.x;
        const cy = stageHeight ? Math.min(Math.max(a.y, stageTop + size / 2), stageTop + stageHeight - size / 2) : a.y;
        body = S.icon(a.icon, cx, cy, size, { stroke: ink, fill: sheet });
        frame = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
      } else {
        body = S.box(a.x, a.y, a.w, a.h, a.label || '', {
          stroke: ink, fill: sheet, color: grey ? S.C.slate2 : t.color, size: a.size || 18, rx: a.rx ?? 10,
        });
        frame = { x: a.x, y: a.y, w: a.w, h: a.h };
      }
      const strike = state === 'invalid'
        ? `<g data-strike="1">${S.line(frame.x - 6, frame.y + frame.h / 2, frame.x + frame.w + 6, frame.y + frame.h / 2, { color: tone('red').stroke, arrow: false, width: 2.5 })}</g>`
        : '';
      out += `<g data-actor="${S.esc(a.id)}" data-state="${state}"${grey ? ' data-faded="1"' : ''}>${body}${strike}</g>`;
      if (state === 'invalid') out += `<g data-state-mark="${S.esc(a.id)}"></g>`;
      // El nombre del actor va en una ficha con punta, arriba de su caja: el
      // rótulo dice quién es sin escribir una coordenada.
      if (a.tag) out += `<g data-tag-to="${S.esc(a.id)}" data-tag-text="${S.esc(a.tag)}" data-tag-tone="${S.esc(grey ? 'slate' : a.tone || 'slate')}"></g>`;
    }
    // Una pieza con significado: un valor en su cofre, un ojo que lee, un lápiz que
    // escribe, o cualquiera de los iconos. Se ancla al actor por su id (`on`) y
    // `placeStory` la pone al lado que se pide, o donde quepa.
    for (const p of scene.props || []) {
      const at = Array.isArray(p.at) ? ` data-prop-at="${S.f(p.at[0])},${S.f(p.at[1])}"` : '';
      out += `<g data-prop-id="${S.esc(p.id)}" data-prop-kind="${S.esc(p.kind || 'value')}"${p.on ? ` data-prop-on="${S.esc(p.on)}"` : ''}${p.side ? ` data-prop-side="${S.esc(p.side)}"` : ''}`
        + `${p.label ? ` data-prop-label="${S.esc(p.label)}"` : ''} data-prop-tone="${S.esc(p.tone || 'slate')}"${p.size ? ` data-prop-size="${S.f(p.size)}"` : ''}${p.state === 'faded' || p.state === 'freed' ? ` data-prop-state="${p.state}"` : ''}${at}></g>`;
    }
    for (const tg of scene.tags || []) {
      out += `<g data-tag-to="${S.esc(tg.to)}" data-tag-text="${S.esc(tg.text)}" data-tag-tone="${S.esc(tg.tone || 'slate')}"${Array.isArray(tg.at) ? ` data-tag-at="${S.f(tg.at[0])},${S.f(tg.at[1])}"` : ''}></g>`;
    }
    for (const mv of scene.moves || []) {
      out += `<g data-move-from="${S.esc(mv.from)}" data-move-to="${S.esc(mv.to)}" data-move-verb="${S.esc(mv.verb || '')}" data-move-tone="${S.esc(mv.tone || 'amber')}"><path fill="none" data-move-path="1"/><text data-move-label="1"></text></g>`;
    }
    for (const mk of scene.marks || []) {
      out += `<g data-mark-kind="${S.esc(mk.kind)}" data-mark-actors="${S.esc((mk.actors || [mk.actor]).filter(Boolean).join(','))}"${Array.isArray(mk.between) ? ` data-mark-between="${S.esc(mk.between.slice(0, 2).join(','))}"` : ''}${mk.to ? ` data-mark-to="${S.esc(mk.to)}"` : ''}${mk.label ? ` data-mark-label="${S.esc(mk.label)}"` : ''}></g>`;
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
    const stage = el('div', undefined, { class: 'lk-wt-stage lk-remap' });
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

  // ===== piezas visuales: tarjetas de veredicto, memoria, tablas unidas, conjuntos =====
  // Cada pieza es JSON declarativo anclado por ids. Se dibujan en HTML (el lector las
  // apila o las junta según el ancho que tienen) y lo que se une con un trazo (un
  // puntero, un conector) se mide sobre lo que el navegador dibujó, nunca con una
  // coordenada que el autor adivine: el trazo nace y muere en una ancla
  // (`data-anchor`) y `piece-measure.mjs` comprueba que llega.
  // Una ficha en línea: «texto» se dibuja como un chip y *texto* como una palabra
  // clave con el color del acento. El narrador y los títulos no escriben HTML.
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
  const PIECE_TONES = ['green', 'red', 'amber', 'blue', 'slate'];
  const toneOf = (tone, fallback = 'slate') => (PIECE_TONES.includes(tone) ? tone : fallback);
  const svgNode = (markup) => document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true);
  const svgPart = (tag, attrs = {}, text) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function readSpec(host, what) {
    try { return JSON.parse(host.querySelector('script[type="application/json"]').textContent); }
    catch (error) { throw new Error(`${what} tiene un JSON inválido: ${error.message}`); }
  }
  // Un objeto del dibujo de una ficha: un verbo (lee, escribe) o un valor, con la
  // tinta de la propia ficha. Reusa las piezas de la escena; un tipo desconocido
  // no dibuja nada y la ficha queda con su texto.
  function chipIcon(kind) {
    const S = window.LKScene;
    const markup = S && (S.prop(kind, 11, 11, 18, { stroke: 'currentColor', fill: 'none' }) || S.icon(kind, 11, 11, 18, { stroke: 'currentColor', fill: 'none' }));
    if (!markup) return null;
    const icon = svgNode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" aria-hidden="true">${markup}</svg>`);
    icon.setAttribute('class', 'lk-pchip-icon');
    return icon;
  }
  function pieceChip(chip, extra = '') {
    const spec = typeof chip === 'string' ? { text: chip } : chip;
    const node = el('span', undefined, { class: `lk-pchip${extra}`, 'data-tone': toneOf(spec.tone) });
    const icon = spec.icon ? chipIcon(spec.icon) : null;
    if (icon) node.append(icon);
    node.append(el('span', spec.text ?? ''));
    return node;
  }
  const arrowDown = () => {
    const svg = svgPart('svg', { viewBox: '0 0 14 26', class: 'lk-parrow', 'aria-hidden': 'true' });
    svg.append(svgPart('path', { d: 'M 7 1 V 22 M 2 16 L 7 23 L 12 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return svg;
  };

  // #218: de dos a cuatro casos lado a lado. Cada tarjeta lleva su veredicto en una
  // píldora, un título, el dibujo mínimo del caso y una línea de razón; la que falla
  // se tiñe de rojo. Es para código: compila / no compila, correcto / error.
  function cardsPiece(spec) {
    const cards = Array.isArray(spec.cards) ? spec.cards : [];
    if (cards.length < 2 || cards.length > 4) throw new Error('Las tarjetas de veredicto necesitan de 2 a 4 casos');
    const root = el('div', undefined, { class: 'lk-p lk-cards', role: 'list', 'data-n': String(cards.length) });
    cards.forEach((c, i) => {
      const bad = c.verdict === 'no';
      const card = el('article', undefined, { class: 'lk-card', role: 'listitem', 'data-verdict': bad ? 'no' : 'ok', 'data-anchor': c.id ?? `card-${i + 1}` });
      card.append(el('span', c.pill || (bad ? 'ERROR' : 'CORRECTO'), { class: 'lk-pill', 'data-tone': bad ? 'red' : 'green' }));
      const title = el('h4', undefined, { class: 'lk-card-title' });
      title.append(inline(c.title));
      card.append(title);
      const draw = el('div', undefined, { class: 'lk-card-draw' });
      const refs = (c.draw?.refs || []).map((r) => pieceChip(r));
      if (refs.length) { const row = el('div', undefined, { class: 'lk-card-refs' }); row.append(...refs); draw.append(row); }
      if (refs.length && c.draw?.target) { const arrow = el('span', undefined, { class: 'lk-card-arrow', 'data-tone': bad ? 'red' : 'slate' }); arrow.append(arrowDown()); draw.append(arrow); }
      if (c.draw?.target) draw.append(pieceChip(c.draw.target, ' lk-pchip-target'));
      card.append(draw, el('p', c.reason || '', { class: 'lk-card-reason' }));
      root.append(card);
    });
    return root;
  }

  // #219: el estado de la memoria en pasos numerados. Cada paso repite la línea de
  // código que explica (insignia con su número y la línea), tiene sus columnas
  // (STACK / HEAP), celdas segmentadas (ptr | len | cap), píldoras de estado (dueña,
  // movida) y un puntero que sale de una celda y llega a las celdas de su destino.
  // Una celda inválida se dibuja a trazos y tachada, y su puntero muere en una ✗. El
  // puntero nombra su destino por id; `placeMemory` lo traza midiendo las cajas que
  // el navegador dibujó, y lo repite cuando cambian el ancho, la fuente o el tema.
  let memoryMarkers = 0;
  function memoryGroup(g) {
    const invalid = g.state === 'invalid';
    const group = el('div', undefined, { class: 'lk-mgroup', 'data-state': invalid ? 'invalid' : 'live' });
    if (g.name || g.pill) {
      const head = el('div', undefined, { class: 'lk-mhead' });
      if (g.name) head.append(el('span', g.name, { class: 'lk-mname' }));
      if (g.pill) head.append(el('span', g.pill.text, { class: 'lk-pill', 'data-tone': toneOf(g.pill.tone) }));
      group.append(head);
    }
    const strip = el('div', undefined, { class: 'lk-mcells', 'data-anchor': g.id, 'data-tone': toneOf(g.tone) });
    (g.cells || []).forEach((cell, i) => strip.append(el('span', typeof cell === 'string' ? cell : cell.text, { class: 'lk-mcell', 'data-anchor': `${g.id}.${i}` })));
    group.append(strip);
    return group;
  }
  function memoryBody(step, columns) {
    const body = el('div', undefined, { class: 'lk-mbody' });
    body.style.setProperty('--cols', String(columns.length));
    for (const c of columns) body.append(el('div', c.label, { class: 'lk-mcolhead' }));
    const rows = step.rows || [], ids = new Set(), pointers = [], dead = [];
    for (const row of rows) for (const c of columns) {
      const g = row[c.id];
      if (!g) { body.append(el('div', undefined, { class: 'lk-mgap' })); continue; }
      if (!g.id) throw new Error(`Una celda de ${c.label} no tiene id: el puntero la nombra por su id`);
      ids.add(g.id);
      body.append(memoryGroup(g));
      if (g.state === 'invalid') dead.push(g);
      else if (g.points) pointers.push(g);
    }
    for (const g of pointers) {
      if (!ids.has(g.points)) throw new Error(`El puntero de «${g.id}» apunta a «${g.points}», que el paso no tiene`);
    }
    const overlay = svgPart('svg', { class: 'lk-mover', 'aria-hidden': 'true' });
    const defs = svgPart('defs');
    const marker = (tone) => {
      const id = `lk-mh-${++memoryMarkers}`;
      const m = svgPart('marker', { id, viewBox: '0 0 8 8', refX: 8, refY: 4, markerWidth: 8, markerHeight: 8, orient: 'auto', markerUnits: 'userSpaceOnUse', 'data-tone': tone });
      m.append(svgPart('path', { d: 'M 0 0 L 8 4 L 0 8 Z' }));
      defs.append(m);
      return id;
    };
    overlay.append(defs);
    for (const g of pointers) {
      const tone = toneOf(g.tone, 'slate');
      overlay.append(svgPart('path', { class: 'lk-mptr', fill: 'none', 'data-from': g.id, 'data-to': g.points, 'data-tone': tone, 'marker-end': `url(#${marker(tone)})` }));
    }
    for (const g of dead) {
      overlay.append(svgPart('path', { class: 'lk-mptr lk-mdead', fill: 'none', 'data-from': g.id, 'data-tone': 'red' }));
      overlay.append(svgPart('text', { class: 'lk-mcross', 'data-cross': g.id, 'data-tone': 'red', 'font-size': 18, 'font-weight': 700 }, '✗'));
    }
    body.append(overlay);
    return body;
  }
  function memoryPiece(spec) {
    const columns = Array.isArray(spec.columns) ? spec.columns : [];
    if (!columns.length) throw new Error('El diagrama de memoria necesita sus columnas (STACK, HEAP…)');
    const numbered = Array.isArray(spec.steps);
    const steps = numbered ? spec.steps : Array.isArray(spec.rows) ? [spec] : [];
    if (!steps.length) throw new Error('El diagrama de memoria necesita pasos');
    const root = el('div', undefined, { class: 'lk-p lk-memory', 'data-piece': 'memory' });
    steps.forEach((step, i) => {
      const card = el('section', undefined, { class: 'lk-mstep' });
      if (numbered && step.code !== undefined) {
        const head = el('div', undefined, { class: 'lk-mstephead' });
        head.append(el('span', String(i + 1), { class: 'lk-mbadge' }), el('code', step.code, { class: 'lk-mcode' }));
        card.append(head);
      }
      card.append(memoryBody(step, columns));
      root.append(card);
    });
    return root;
  }
  // Un puntero sale del borde derecho de su celda, a la altura de su centro, y
  // llega al borde izquierdo de su destino; uno muerto sale igual, corto y a trazos,
  // y termina en la ✗. Todo en coordenadas del cuerpo del paso, medidas ahora.
  function placeMemory(body) {
    const svg = body.querySelector(':scope > .lk-mover');
    if (!svg) return;
    const b = body.getBoundingClientRect();
    if (!b.width) return;
    svg.setAttribute('width', b.width.toFixed(1));
    svg.setAttribute('height', b.height.toFixed(1));
    svg.setAttribute('viewBox', `0 0 ${b.width.toFixed(1)} ${b.height.toFixed(1)}`);
    const rect = (id) => {
      const node = body.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left - b.left, right: r.right - b.left, cy: (r.top + r.bottom) / 2 - b.top };
    };
    const f = (n) => n.toFixed(1);
    for (const path of svg.querySelectorAll('path[data-from]')) {
      const from = rect(path.dataset.from);
      if (!from) continue;
      if (path.dataset.to) {
        const to = rect(path.dataset.to);
        if (!to) continue;
        const ex = to.left, dx = (ex - from.right) / 2;
        path.setAttribute('d', Math.abs(to.cy - from.cy) < 3
          ? `M ${f(from.right)} ${f(from.cy)} L ${f(ex)} ${f(from.cy)}`
          : `M ${f(from.right)} ${f(from.cy)} C ${f(from.right + dx)} ${f(from.cy)}, ${f(ex - dx)} ${f(to.cy)}, ${f(ex)} ${f(to.cy)}`);
      } else {
        // El trazo y su ✗ caben en el hueco que separa a esta celda de la siguiente de
        // su fila (o del borde del cuerpo): nunca encima de las celdas vecinas.
        const next = [...body.querySelectorAll('.lk-mcells')].map((c) => c.getBoundingClientRect())
          .filter((r) => r.left - b.left > from.right + 1 && r.top - b.top < from.cy && r.bottom - b.top > from.cy)
          .map((r) => r.left - b.left);
        const room = (next.length ? Math.min(...next) : b.width) - from.right;
        const end = from.right + Math.min(40, Math.max(10, room - 28));
        path.setAttribute('d', `M ${f(from.right)} ${f(from.cy)} L ${f(end)} ${f(from.cy)}`);
        const cross = svg.querySelector(`[data-cross="${CSS.escape(path.dataset.from)}"]`);
        if (cross) { cross.setAttribute('x', f(end + 6)); cross.setAttribute('y', f(from.cy + 6)); }
      }
    }
  }

  // #220: tablas reales unidas por conectores, y la transformación GROUP BY. Cada
  // tabla lleva su cabecera y sus filas (monoespaciadas); las filas de un grupo se
  // tiñen con el color de su coincidencia; un conector curvo sale de la celda clave
  // de una tabla y llega a la fila que coincide en la otra (un color por
  // coincidencia), la condición va en una píldora y el resultado debajo. Las
  // coincidencias y el resultado se derivan de los datos de la nota, así que nunca
  // se contradicen; los conectores nombran celdas y filas por id y `placeTables` los
  // traza midiendo lo que el navegador dibujó. `show` descubre las partes de a poco
  // (tablas, links, on, result; rows, groups) para usarlas como pasos de un
  // recorrido.
  const MATCH_TONES = ['blue', 'green', 'amber', 'red', 'slate'];
  const arrowRight = () => { const a = arrowDown(); a.classList.add('lk-parrow-side'); return a; };
  function tableRef(tables, ref) {
    const [id, column] = String(ref || '').split('.');
    const table = tables.find((t) => t.id === id);
    const col = table ? (table.columns || []).indexOf(column) : -1;
    if (!table || col < 0) throw new Error(`El JOIN nombra «${ref}», que las tablas de la nota no tienen`);
    return { table, col };
  }
  function dataTable(id, name, columns, rows, { keyCol = -1, tones = [], anchorKeys = false, anchorRows = false, nulls = [] } = {}) {
    const wrap = el('div', undefined, { class: 'lk-ttable', 'data-table': id });
    if (name) wrap.append(el('div', name, { class: 'lk-tname' }));
    const grid = el('table', undefined, { class: 'lk-tgrid' });
    const head = el('tr');
    columns.forEach((c, j) => head.append(el('th', c, j === keyCol ? { 'data-key': '1' } : {})));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    rows.forEach((row, i) => {
      const tr = el('tr');
      if (anchorRows) tr.setAttribute('data-anchor', `${id}:${i}`);
      if (tones[i]) tr.setAttribute('data-tone', tones[i]);
      row.forEach((cell, j) => {
        const td = el('td', cell);
        if (anchorKeys && j === keyCol) td.setAttribute('data-anchor', `${id}:${i}.${j}`);
        if (nulls[i]?.[j]) td.classList.add('lk-tnull');
        tr.append(td);
      });
      tbody.append(tr);
    });
    grid.append(thead, tbody);
    wrap.append(grid);
    return wrap;
  }
  function joinView(spec, show) {
    const tables = Array.isArray(spec.tables) ? spec.tables : [];
    if (!tables.length) throw new Error('Las tablas necesitan al menos una tabla con sus filas');
    const view = el('div', undefined, { class: 'lk-tview' });
    const join = spec.join;
    let from, to, matches = [], tonesOf = () => '';
    if (join) {
      if (tables.length !== 2) throw new Error('Un JOIN une dos tablas');
      from = tableRef(tables, join.from);
      to = tableRef(tables, join.to);
      for (const row of from.table.rows) matches.push(to.table.rows.findIndex((r) => String(r[to.col]) === String(row[from.col])));
      const order = [...new Set(matches.filter((k) => k >= 0))];
      const colorOf = (k) => MATCH_TONES[order.indexOf(k) % MATCH_TONES.length];
      const lit = join.highlight === 'all' ? null : new Set((join.highlight || []).map(String));
      const tinted = (key) => join.highlight === 'all' || lit.has(String(key));
      tonesOf = (k, key) => (k >= 0 && tinted(key) ? colorOf(k) : '');
      view.colorOf = colorOf;
    }
    const wide = el('div', undefined, { class: 'lk-tjoin' });
    tables.forEach((t, n) => {
      const isFrom = join && t === from.table, isTo = join && t === to.table;
      const tones = isFrom ? t.rows.map((r, i) => tonesOf(matches[i], r[from.col]))
        : isTo ? t.rows.map((r, k) => (matches.includes(k) ? tonesOf(k, r[to.col]) : ''))
          : [];
      wide.append(dataTable(t.id, t.name, t.columns || [], t.rows || [], { keyCol: isFrom ? from.col : isTo ? to.col : -1, tones, anchorKeys: Boolean(isFrom), anchorRows: Boolean(isTo) }));
      if (join && n === 0) wide.append(el('div', undefined, { class: 'lk-tgutter' }));
    });
    if (join && show.has('links')) {
      const overlay = svgPart('svg', { class: 'lk-mover', 'aria-hidden': 'true' });
      const defs = svgPart('defs');
      const dots = new Map();
      const dot = (tone) => {
        if (!dots.has(tone)) {
          const id = `lk-td-${++memoryMarkers}`;
          const m = svgPart('marker', { id, viewBox: '0 0 8 8', refX: 4, refY: 4, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', 'data-tone': tone });
          m.append(svgPart('circle', { cx: 4, cy: 4, r: 3 }));
          defs.append(m);
          dots.set(tone, id);
        }
        return dots.get(tone);
      };
      matches.forEach((k, i) => {
        if (k < 0) return;
        const tone = view.colorOf(k);
        overlay.append(svgPart('path', { class: 'lk-tlink', fill: 'none', 'data-from': `${from.table.id}:${i}.${from.col}`, 'data-to': `${to.table.id}:${k}`, 'data-tone': tone, 'marker-end': `url(#${dot(tone)})` }));
      });
      overlay.prepend(defs);
      wide.append(overlay);
    }
    view.append(wide);
    if (join && show.has('on') && join.on) {
      const on = el('div', undefined, { class: 'lk-ton' });
      on.append(el('b', 'ON'), document.createTextNode(` ${join.on}`));
      view.append(on);
    }
    if (join && show.has('result') && spec.result) {
      const picks = (spec.result.select || []).map((ref) => tableRef(tables, ref));
      if (!picks.length) throw new Error('El resultado necesita `select`: las columnas que se piden');
      const rows = [], tones = [], nulls = [];
      from.table.rows.forEach((row, i) => {
        const k = matches[i];
        if (k < 0 && join.kind !== 'left') return;
        const cells = picks.map((p) => (p.table === from.table ? row[p.col] : k >= 0 ? to.table.rows[k][p.col] : 'NULL'));
        rows.push(cells);
        nulls.push(picks.map((p) => p.table !== from.table && k < 0));
        tones.push(tonesOf(k, row[from.col]));
      });
      const below = el('div', undefined, { class: 'lk-tbelow' });
      below.append(arrowDown(), el('div', spec.result.label || 'RESULTADO', { class: 'lk-tlabel' }));
      below.append(dataTable('result', '', picks.map((p) => p.table.columns[p.col]), rows, { tones, nulls }));
      view.append(below);
    }
    return view;
  }
  function groupView(group, show) {
    const columns = group.columns || [], rows = group.rows || [];
    const by = columns.indexOf(group.by) >= 0 ? columns.indexOf(group.by) : columns.length - 1;
    if (!rows.length) throw new Error('El GROUP BY necesita filas');
    const lit = new Set((group.highlight || []).map(String));
    const view = el('div', undefined, { class: 'lk-tgroup' });
    const labels = group.labels || {};
    const left = el('div', undefined, { class: 'lk-gcol' });
    left.append(el('div', labels.from || 'FILAS ORIGINALES', { class: 'lk-gtitle' }));
    for (const row of rows) {
      const item = el('div', undefined, { class: 'lk-grow' });
      if (lit.has(String(row[by]))) item.setAttribute('data-tone', 'green');
      row.forEach((cell, j) => item.append(el('span', cell, j === 0 ? { class: 'lk-gfirst' } : {})));
      left.append(item);
    }
    view.append(left);
    if (show.has('groups')) {
      const mid = el('div', undefined, { class: 'lk-gmid' });
      mid.append(el('b', 'GROUP BY'), el('span', columns[by] ?? ''), arrowRight());
      const right = el('div', undefined, { class: 'lk-gcol' });
      right.append(el('div', labels.to || 'GRUPOS + COUNT', { class: 'lk-gtitle' }));
      const groups = new Map();
      for (const row of rows) {
        const key = String(row[by]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row.filter((_, j) => j !== by).join(' · '));
      }
      for (const [key, values] of groups) {
        const card = el('div', undefined, { class: 'lk-ggroup' });
        if (lit.has(key)) card.setAttribute('data-tone', 'green');
        const chips = el('div', undefined, { class: 'lk-gchips' });
        chips.append(...values.map((v) => pieceChip(v)));
        card.append(el('b', key, { class: 'lk-gname' }), chips, el('span', String(values.length), { class: 'lk-gcount' }));
        right.append(card);
      }
      view.append(mid, right);
    }
    return view;
  }
  function tablesPiece(spec) {
    const root = el('div', undefined, { class: 'lk-p lk-tables', 'data-piece': 'tables' });
    root.append(spec.group ? groupView(spec.group, new Set(spec.show || ['rows', 'groups'])) : joinView(spec, new Set(spec.show || ['tables', 'links', 'on', 'result'])));
    return root;
  }
  // El conector sale del borde derecho de la celda clave, a la altura de su centro,
  // y llega al borde izquierdo de la fila que coincide: una curva horizontal en sus
  // dos extremos, así los que van a la misma fila se juntan en un punto.
  function placeTables(join) {
    const svg = join.querySelector(':scope > .lk-mover');
    if (!svg) return;
    const b = join.getBoundingClientRect();
    if (!b.width) return;
    svg.setAttribute('width', b.width.toFixed(1));
    svg.setAttribute('height', b.height.toFixed(1));
    svg.setAttribute('viewBox', `0 0 ${b.width.toFixed(1)} ${b.height.toFixed(1)}`);
    const f = (n) => n.toFixed(1);
    const rect = (id) => {
      const node = join.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left - b.left, right: r.right - b.left, cy: (r.top + r.bottom) / 2 - b.top };
    };
    for (const path of svg.querySelectorAll('path[data-from][data-to]')) {
      const from = rect(path.dataset.from), to = rect(path.dataset.to);
      if (!from || !to) continue;
      const dx = (to.left - from.right) / 2;
      path.setAttribute('d', `M ${f(from.right)} ${f(from.cy)} C ${f(from.right + dx)} ${f(from.cy)}, ${f(to.left - dx)} ${f(to.cy)}, ${f(to.left)} ${f(to.cy)}`);
    }
  }

  // #221: dos o tres conjuntos con su etiqueta; la región que responde va rellena y
  // un pie nombra la operación (INNER JOIN, unión, diferencia). Una región se nombra
  // por los conjuntos a los que pertenece, exactamente: «a+b» es lo que está en A y
  // en B y en ningún otro; «a» es lo que solo está en A. Una operación que suma
  // regiones las lista (LEFT JOIN = «a» y «a+b»). Cada región se rellena recortando
  // por los círculos que incluye y enmascarando los que excluye, así el relleno es
  // exacto aunque los círculos se solapen de dos o de tres maneras.
  let vennCount = 0;
  const VENN_LAYOUT = {
    2: { w: 300, h: 190, r: 62, at: [[112, 105], [188, 105]] },
    3: { w: 300, h: 262, r: 58, at: [[112, 100], [188, 100], [150, 166]] },
  };
  function vennPiece(spec) {
    const sets = Array.isArray(spec.sets) ? spec.sets : [];
    if (sets.length < 2 || sets.length > 3) throw new Error('Un diagrama de conjuntos necesita 2 o 3 conjuntos');
    const ids = sets.map((s) => s.id);
    const fill = (spec.fill || []).map(String);
    for (const key of fill) {
      if (key.split('+').some((id) => !ids.includes(id))) throw new Error(`La región «${key}» nombra un conjunto que el diagrama no tiene`);
    }
    const { w, h, r, at } = VENN_LAYOUT[sets.length];
    const n = ++vennCount;
    const svg = svgPart('svg', { class: 'lk-vsvg', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': [spec.op, spec.says].filter(Boolean).join(': ') || 'Conjuntos' });
    const defs = svgPart('defs');
    sets.forEach((s, i) => {
      const clip = svgPart('clipPath', { id: `lk-vc-${n}-${s.id}` });
      clip.append(svgPart('circle', { cx: at[i][0], cy: at[i][1], r }));
      defs.append(clip);
    });
    const fills = svgPart('g', { class: 'lk-vfills' });
    fill.forEach((key, k) => {
      const parts = key.split('+');
      const rect = svgPart('rect', { class: 'lk-vfill', 'data-region': key, x: 0, y: 0, width: w, height: h });
      const outside = ids.filter((id) => !parts.includes(id));
      if (outside.length) {
        const mask = svgPart('mask', { id: `lk-vm-${n}-${k}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h });
        mask.append(svgPart('rect', { x: 0, y: 0, width: w, height: h, fill: '#fff' }));
        for (const id of outside) { const i = ids.indexOf(id); mask.append(svgPart('circle', { cx: at[i][0], cy: at[i][1], r, fill: '#000' })); }
        defs.append(mask);
        rect.setAttribute('mask', `url(#lk-vm-${n}-${k})`);
      }
      let node = rect;
      for (const id of parts) { const g = svgPart('g', { 'clip-path': `url(#lk-vc-${n}-${id})` }); g.append(node); node = g; }
      fills.append(node);
    });
    svg.append(defs, fills);
    const mid = at.reduce((a, p) => [a[0] + p[0] / at.length, a[1] + p[1] / at.length], [0, 0]);
    sets.forEach((s, i) => {
      svg.append(svgPart('circle', { class: 'lk-vcircle', 'data-set': s.id, cx: at[i][0], cy: at[i][1], r, fill: 'none' }));
    });
    // La letra de cada conjunto va en su parte exclusiva: desde su centro, alejándose
    // del centro de todos los conjuntos. Su nota (el nombre de la tabla) va fuera del
    // círculo, arriba de él, porque en la parte exclusiva no cabe y un contorno nunca
    // pasa por una palabra.
    const topNote = sets.length === 2 ? (i) => [at[i][0] + (i ? 1 : -1) * r * 0.35, at[i][1] - r - 10, 'middle']
      : (i) => (i === 2 ? [at[i][0], at[i][1] + r + 22, 'middle'] : [at[i][0] + (i ? 1 : -1) * r * 0.35, at[i][1] - r - 10, 'middle']);
    sets.forEach((s, i) => {
      const dx = at[i][0] - mid[0], dy = at[i][1] - mid[1], len = Math.hypot(dx, dy) || 1;
      const lx = at[i][0] + (dx / len) * r * (sets.length === 2 ? 0.52 : 0.46), ly = at[i][1] + (dy / len) * r * (sets.length === 2 ? 0 : 0.46);
      svg.append(svgPart('text', { class: 'lk-vlabel', x: lx.toFixed(1), y: (ly + 7).toFixed(1) }, s.label ?? s.id));
      if (s.note) { const [nx, ny] = topNote(i); svg.append(svgPart('text', { class: 'lk-vnote', x: nx.toFixed(1), y: ny.toFixed(1) }, s.note)); }
    });
    const root = el('div', undefined, { class: 'lk-p lk-venn', 'data-piece': 'venn' });
    const card = el('div', undefined, { class: 'lk-vcard' });
    card.append(svg);
    if (spec.op || spec.says) {
      const caption = el('div', undefined, { class: 'lk-vcaption' });
      if (spec.op) caption.append(el('b', spec.op, { class: 'lk-vop' }));
      if (spec.says) caption.append(el('span', spec.says, { class: 'lk-vtext' }));
      card.append(caption);
    }
    root.append(card);
    return root;
  }

  const PIECES = { cards: cardsPiece, memory: memoryPiece, tables: tablesPiece, venn: vennPiece };
  // Un paso de un recorrido dibuja una pieza en vez de una escena: la que su
  // `stage` nombra. Lo que el recorrido declara a su nivel (`spec.venn`, por
  // ejemplo, con los conjuntos) se hereda en cada paso, así un paso escribe solo lo
  // que cambia.
  function stagePiece(step, story) {
    const stage = step.stage || {};
    const kind = Object.keys(PIECES).find((k) => stage[k]);
    return kind ? { kind, spec: { ...(story[kind] || {}), ...stage[kind] } } : null;
  }
  for (const [kind, label] of [['cards', 'Las tarjetas'], ['memory', 'El diagrama de memoria'], ['tables', 'Las tablas'], ['venn', 'El diagrama de conjuntos']]) {
    define(`lk-${kind}`, function () {
      const spec = readSpec(this, label);
      this.classList.add('lk-piece-host');
      if (spec.title) this.append(el('strong', spec.title, { class: 'lk-title' }));
      this.append(PIECES[kind](spec));
      if (spec.caption) this.append(el('p', spec.caption, { class: 'lk-piece-caption' }));
      for (const piece of this.querySelectorAll('.lk-p')) placePiece(piece);
      watchPiece(this);
    });
  }
  // La medida de los trazos se repite cuando las fuentes terminan de cargar, cuando
  // cambia el ancho y cuando el lector cambia de tema, como la de las escenas.
  function placePiece(piece) {
    if (piece.dataset.piece === 'memory') piece.querySelectorAll('.lk-mbody').forEach(placeMemory);
    if (piece.dataset.piece === 'tables') piece.querySelectorAll('.lk-tjoin').forEach(placeTables);
  }
  const piecesWatched = new WeakSet();
  function watchPiece(host) {
    if (piecesWatched.has(host)) return;
    piecesWatched.add(host);
    const again = () => host.querySelectorAll('.lk-p').forEach(placePiece);
    document.fonts?.ready.then(again).catch(() => {});
    if (window.ResizeObserver) new ResizeObserver(again).observe(host);
    new MutationObserver(again).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

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
    // Un paso dibuja una escena (el SVG de siempre) o una pieza (tarjetas, memoria,
    // tablas, conjuntos). El lienzo de escena solo existe si algún paso lo usa.
    const pieces = steps.map((s) => stagePiece(s, spec));
    const hasScene = pieces.some((p) => !p);
    if (hasScene) {
      const markup = S.svg(steps.map((s, i) => pieces[i] ? '' : S.step(i + 1, walkScene(sceneOf(s), stageWidth, stageTop, stageHeight))).join(''), viewBox);
      stage.replaceChildren(document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true));
    }
    const panels = pieces.map((p, i) => {
      if (!p) return null;
      const panel = el('div', undefined, { class: 'lk-story-piece', 'data-piece-step': String(i + 1) });
      panel.append(PIECES[p.kind](p.spec));
      stage.append(panel);
      return panel;
    });
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
      stage.querySelectorAll('svg [data-step]').forEach((g) => { g.style.display = Number(g.dataset.step) === index + 1 ? '' : 'none'; });
      const sceneSvg = stage.querySelector(':scope > svg');
      if (sceneSvg) sceneSvg.style.display = panels[index] ? 'none' : '';
      panels.forEach((panel, i) => { if (panel) panel.hidden = i !== index; });
      panels[index]?.querySelectorAll('.lk-p').forEach(placePiece);
      const step = steps[index];
      const atoms = kind === 'derivation' ? (step.equation?.atoms || []) : (spec.formula?.atoms || []);
      head.replaceChildren();
      if (atoms.length) {
        const line = tokens(atoms, step.focus);
        head.append(line);
        // A line that does not fit scrolls; the highlighted group is brought into view.
        const lit = line.querySelector('.lk-token-focus');
        if (lit && line.scrollWidth > line.clientWidth) line.scrollLeft = Math.max(0, lit.offsetLeft - line.clientWidth / 3);
      }
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
    if (hasScene) {
      fitSceneText(stage, { minPx: 11 });
      placeStory(stage);
      watchCallouts(stage, () => fitSceneText(stage, { minPx: 11 }));
    }
    watchPiece(stage);
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
