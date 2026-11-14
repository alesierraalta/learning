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
    // A quick note names its own note; a part names itself: each route checks the page it answers for (#276).
    const body = { topic: b.topic, ...(b.part ? { part: b.part } : {}), ...(b.note ? { note: b.note } : {}), ...payload };
    const response = await fetch(b.submitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    // Each of the part's own exercises gets a box under its statement; a part without exercises gets none.
    const exercises = (data.exercises || []).map((ex, index) => {
      const box = el('fieldset', undefined, { class: 'lk-question lk-exercise' });
      box.append(el('legend', `${index + 1}. ${ex.enunciado}`), textField('Tu respuesta (opcional)', `exercise-${ex.id}`));
      return { id: ex.id, box };
    });
    const submit = el('button', 'Enviar al tutor', { type: 'submit' });
    form.append(ownWords, ...exercises.map(({ box }) => box), submit, out); this.append(form);
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
      form.elements.ownWords.value = a.ownWords || '';
      for (const { id, box } of exercises) box.querySelector('textarea').value = a.exercises?.[id] || '';
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
        if (form.elements.ownWords.value.trim()) payload.ownWords = form.elements.ownWords.value.trim();
        const exerciseAnswers = {};
        for (const { id, box } of exercises) {
          const text = box.querySelector('textarea').value.trim();
          if (text) exerciseAnswers[id] = text;
        }
        if (Object.keys(exerciseAnswers).length) payload.exercises = exerciseAnswers;
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

    // #276: the options come in the learner's order and the key never comes at all, so the bridge grades the pick.
    const qId = spec.id || '';
    const name = qId || 'lk-quick-quiz';
    const options = spec.opciones || spec.options || {};
    for (const [letter, text] of Object.entries(options)) {
      const label = el('label', undefined, { class: 'lk-option' });
      label.append(
        el('input', undefined, { type: 'radio', name, value: letter, required: '' }),
        el('span', `${letter}. ${text}`)
      );
      box.append(label);
    }

    const submit = el('button', 'Comprobar respuesta', { type: 'submit', class: 'lk-qq-submit' });
    const resultBox = el('div', undefined, { class: 'lk-qq-result', hidden: '' });
    form.append(box, submit, resultBox);
    this.append(form);

    // The verdict, the right letter and the explanation are the bridge's reply, never the page's own data.
    function show(graded) {
      const ok = Boolean(graded.ok);
      const said = graded.explicacion || '';
      resultBox.hidden = false;
      resultBox.className = `lk-qq-result ${ok ? 'lk-correct' : 'lk-error'}`;
      resultBox.textContent = ok
        ? `✔ ¡Correcto! ${said}`.trim()
        : `✘ Incorrecto. Elegiste ${graded.chosen}; la correcta es ${graded.correct}. ${said}`.trim();
      return ok;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const chosen = form.elements[name].value;
      if (!chosen) return;
      submit.disabled = true;
      try {
        const graded = await post({ kind: 'quick-quiz', id: qId, chosen });
        const ok = show(graded);
        form.querySelectorAll('input').forEach(i => { i.disabled = true; });
        const b = config();
        const por_que = ok
          ? (graded.explicacion ? `Acierto: ${graded.explicacion}` : 'Acierto')
          : `Fallo (eligió ${graded.chosen}, correcta: ${graded.correct}): ${graded.explicacion || 'No consolidó el concepto.'}`;
        const entry = {
          id: graded.id || qId,
          punto: point || 'Punto explicable',
          categoria: tag,
          pregunta: spec.pregunta || spec.enunciado || '',
          respuesta_alumno: graded.chosen,
          respuesta_correcta: graded.correct,
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
      } catch (e) {
        // Refused or unreachable: the learner keeps the question and can try again.
        resultBox.hidden = false;
        resultBox.className = 'lk-qq-result lk-error';
        resultBox.textContent = e.message;
        submit.disabled = false;
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
  // La letra de la ficha de nombre de un escenario y el aire mínimo al borde del
  // lienzo (#280): la etiqueta de una flecha se mide contra la letra de la figura
  // y contra el mismo margen que las puertas exigen a cualquier pieza.
  const STAGE_TAG_SIZE = 16;
  const STAGE_EDGE = 12;
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
  // Un icono sobre una caja (#273) es su adorno: se apoya en una esquina libre de esa
  // caja, nunca encima de su rótulo, aunque la nota lo haya puesto allí. Se mide lo que
  // el navegador dibujó: gana la primera esquina que no toca ninguna palabra (con dos
  // unidades de aire) ni otra pieza del paso, y la tinta se desplaza dentro de su grupo.
  function placeIcons(stage) {
    const svg = stage.querySelector("svg");
    if (!svg) return;
    const attached = [...svg.querySelectorAll("[data-icon-box]")];
    if (!attached.length) return;
    // Un paso oculto mide cero: se mide con todos los pasos puestos.
    const groups = [...svg.querySelectorAll("[data-step]")];
    const shown = groups.map((g) => g.style.display);
    groups.forEach((g) => { g.style.display = ""; });
    const room = svg.viewBox.baseVal;
    const rectOf = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
    const grow = (r, m) => ({ x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m });
    const touches = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const icon of attached) {
      const ink = icon.querySelector(":scope > [data-icon-ink]");
      if (!ink) continue;
      // La tinta vuelve a su sitio antes de medirla: el grupo exterior ya incluye el
      // desplazamiento de su hijo, así que se mide la posición declarada.
      ink.removeAttribute("transform");
      const at = rectOf(icon);
      if (!at.width && !at.height) continue;
      const [bx, by, bw, bh] = icon.dataset.iconBox.split(",").map(Number);
      const w = at.width, h = at.height, pad = 3;
      const scope = icon.closest("[data-step]") || svg;
      const texts = [...scope.querySelectorAll("text")].filter((t) => !t.closest("[data-callout]")).map(rectOf);
      const ownBox = (r) => Number(r.getAttribute("x")) === bx && Number(r.getAttribute("y")) === by && Number(r.getAttribute("width")) === bw && Number(r.getAttribute("height")) === bh;
      const pieces = [...scope.querySelectorAll("[data-icon]")].filter((g) => g !== icon).map(rectOf)
        .concat([...scope.querySelectorAll("[data-box] rect")].filter((r) => !ownBox(r)).map(rectOf));
      const inside = [
        { x: bx + bw - pad - w, y: by + pad },
        { x: bx + pad, y: by + pad },
        { x: bx + bw - pad - w, y: by + bh - pad - h },
        { x: bx + pad, y: by + bh - pad - h },
      ];
      // Sobre la esquina: la mitad del icono sale de la caja, como una insignia.
      const hanging = [
        { x: bx + bw - w / 2, y: by - h / 2 },
        { x: bx - w / 2, y: by - h / 2 },
        { x: bx + bw - w / 2, y: by + bh - h / 2 },
        { x: bx - w / 2, y: by + bh - h / 2 },
      ];
      // Se prueban primero las esquinas de dentro, de la más cercana a donde la nota la puso.
      const dist = (c) => Math.hypot(c.x - at.x, c.y - at.y);
      const byDist = (list) => [...list].sort((p, q) => dist(p) - dist(q));
      const corners = [...byDist(inside), ...byDist(hanging)];
      const fits = (c) => c.x >= room.x && c.y >= room.y && c.x + w <= room.x + room.width && c.y + h <= room.y + room.height;
      const free = (c) => {
        const r = { x: c.x, y: c.y, width: w, height: h };
        return fits(c) && !texts.some((t) => touches(r, grow(t, 2))) && !pieces.some((p) => touches(r, p));
      };
      const spot = corners.find(free) ?? corners.find(fits) ?? corners[0];
      ink.setAttribute("transform", `translate(${(spot.x - at.x).toFixed(2)} ${(spot.y - at.y).toFixed(2)})`);
    }
    groups.forEach((g, i) => { g.style.display = shown[i]; });
  }
  // La escena de un paso de `lk-story` no escribe coordenadas de rótulos ni de
  // flechas: nombra el actor que el rótulo acompaña y el término que se mueve, y
  // esta pasada mide las cajas que el navegador dibujó. El rótulo con punta se
  // apoya en el borde de su caja, el codo llega a su blanco y la flecha del
  // movimiento empieza y termina en las dos cajas medidas del término.
  function placeStory(stage) {
    const svg = stage.querySelector("svg");
    if (!svg) return;
    placeIcons(stage);
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
    // La punta la declara `scene.js` por color y por grosor: una flecha gruesa
    // necesita una punta gruesa y una fina, fina (#237).
    const marker = (name, width = 1.5) => `url(#${S.markerId(tone(name).stroke, width)})`;
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
    // El nombre del resultado viaja con el glifo: un ✓ entre dos piezas que no
    // lleva su palabra no dice qué aprobó, y el alumno lo leyó como un ✓ suelto
    // en el hueco (#243). Con nombre, la marca se explica sola.
    // La letra de la figura en un paso: el nombre de un actor, la ficha de su
    // nombre, su caja o el rótulo suelto. Una marca nunca se dibuja más grande que
    // ellos: el ✓ de la parte corregida salía a 24 sobre nombres de 16 y se leía
    // como el título de la escena (#243).
    const letterOf = (step) => {
      const sizes = [];
      for (const t of step.querySelectorAll("[data-actor] text, [data-box] text, [data-label] text, [data-tag-to] text")) {
        const size = Number(t.getAttribute("font-size")) || 0;
        if (size) sizes.push(size);
      }
      return sizes.length ? Math.min(...sizes) : 24;
    };
    const glyphAt = (holder, kind, union, { corner = false, avoid = [], below: underneath = false, label = "", size = 24 } = {}) => {
      const t = tone(kind === "no" ? "red" : "green");
      const words = `${kind === "no" ? "✗" : "✓"}${label ? ` ${label}` : ""}`;
      const glyph = make("text", { "font-size": size, "font-weight": 700, fill: t.color }, words);
      holder.replaceChildren(glyph);
      const right = { x: union.x + union.width + 10, y: union.y + union.height / 2 + 8, anchor: "start" };
      const left = { x: union.x - 10, y: union.y + union.height / 2 + 8, anchor: "end" };
      // Debajo, a 18 unidades: la marca se apoya en su pieza y no en el borde del
      // lienzo. Con 28 no cabía en un lienzo de 260 y caía al hueco de al lado
      // (#245); con 18 cabe y sigue fuera de la pieza.
      const below = { x: union.x + union.width / 2, y: union.y + union.height + 18, anchor: "middle" };
      const lower = { x: union.x + union.width / 2, y: union.y + union.height + 26, anchor: "middle" };
      // Una marca con un solo dueño se aparta del vecino, no se mete entre los dos
      // (#245): el lado de fuera es el que tiene menos piezas, y ahí va el ✓ o el ✗
      // cuando no cabe debajo. Centrada en el hueco no aprueba a nadie.
      const lefts = avoid.filter((b) => b.x + b.width <= union.x + 1).length;
      const rights = avoid.filter((b) => b.x >= union.x + union.width - 1).length;
      const outer = lefts <= rights ? left : right;
      const inner = outer === left ? right : left;
      const sides = corner
        ? [{ x: union.x + union.width + 6, y: union.y + 18, anchor: "start" }, right, below, left, { x: union.x - 6, y: union.y + 18, anchor: "end" }]
        : underneath ? [below, lower, outer, inner] : [below, lower, outer, inner];
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
    // La figura de un actor es su personaje (o su caja), no el borde decorado.
    const figureOf = (el) => el.querySelector("[data-figure]") || el;
    // Una fila se tiende desde el marco más grande (#245): el marco a trazos y el
    // candado de un actor bloqueado agrandan su caja medida, y sin esto su ficha
    // subía y su cofre bajaba mientras el vecino se quedaba quieto, así que la fila
    // se veía torcida. La fila son los actores uno al lado del otro a menos de dos
    // figuras de distancia en vertical; su tope y su base son los del más alto.
    const rowFrames = (step) => {
      const frames = [...step.querySelectorAll("[data-actor]")].map((el) => ({ el, b: el.getBBox() }));
      const rows = [];
      for (const f of frames) {
        const row = rows.find((r) => r.some((o) => {
          const across = Math.min(o.b.x + o.b.width, f.b.x + f.b.width) - Math.max(o.b.x, f.b.x);
          const reach = Math.max(o.b.height, f.b.height) * 2;
          return across <= Math.min(o.b.width, f.b.width) * 0.2 && Math.abs((o.b.y + o.b.height / 2) - (f.b.y + f.b.height / 2)) <= reach;
        }));
        if (row) row.push(f); else rows.push([f]);
      }
      const byId = new Map();
      for (const row of rows) {
        if (row.length < 2) continue;
        const top = Math.min(...row.map((o) => o.b.y));
        const bottom = Math.max(...row.map((o) => o.b.y + o.b.height));
        for (const o of row) byId.set(o.el.dataset.actor, { top, bottom });
      }
      return byId;
    };
    // Una pieza dibujada se pone desde su actor, no desde una coordenada: junto al
    // lado que declara, y si ahí no cabe —borde del lienzo, otro actor, otra pieza o
    // el nombre que el actor lleva arriba— en el primero que sí.
    const parse = (markup) => [...new DOMParser().parseFromString(`<svg xmlns="${ns}">${markup}</svg>`, "image/svg+xml").documentElement.childNodes].map((n) => document.importNode(n, true));
    // #261: las fichas de nombre de dos actores vecinos no se tocan. Cada ficha se mide con su texto al
    // tamaño de lectura (16 unidades). Si dos fichas que se pisan en vertical quedan a menos de TAG_GAP
    // unidades (a 390 px, menos de 6 píxeles), se parte en dos líneas la más ancha que tenga dos palabras:
    // su ancho baja a la de la palabra más larga y la vecina respira.
    const TAG_SIZE = STAGE_TAG_SIZE, TAG_GAP = 8;
    const tagWidth = (lines) => Math.max(30, Math.max(...lines.map((line) => line.length)) * TAG_SIZE * 0.56 + 16);
    const tagHeight = (lines) => lines.length * TAG_SIZE + (lines.length - 1) * 4 + 12;
    // La partición en dos líneas que deja la línea más larga más corta; null si el texto es una palabra.
    const splitTag = (text) => {
      const words = String(text).trim().split(/\s+/);
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
        if (!best || tagWidth(lines) < tagWidth(best)) best = lines;
      }
      return best;
    };
    const layoutTags = (step, rows) => {
      const chips = [...step.querySelectorAll("[data-tag-to]")].map((tag) => {
        const target = findIn(step, tag.dataset.tagTo);
        if (!target) return null;
        const b = target.getBBox();
        const fig = figureOf(target).getBBox();
        const row = target.hasAttribute("data-actor") ? rows.get(target.dataset.actor) : null;
        const at = tag.dataset.tagAt ? tag.dataset.tagAt.split(",").map(Number) : [];
        return {
          tag, target, fig, t: tone(tag.dataset.tagTone), lines: [tag.dataset.tagText || ""],
          // La ficha nunca se sale del lienzo: se centra en su actor y se mete dentro del canvas (#243).
          wanted: at.length && Number.isFinite(at[0]) ? at[0] : fig.x + fig.width / 2,
          fixedY: at.length > 1 && Number.isFinite(at[1]) ? at[1] : null,
          baseY: row ? row.top : b.y,
        };
      }).filter(Boolean);
      const place = () => {
        for (const c of chips) {
          c.w = tagWidth(c.lines);
          c.h = tagHeight(c.lines);
          c.cx = Math.min(Math.max(c.wanted, room.x + c.w / 2 + 12), room.x + room.width - c.w / 2 - 12);
          c.cy = c.fixedY ?? c.baseY - 8;
        }
        // Las fichas se quedan en su franja: una flecha que cae en ella se
        // reenruta entera, no se sube la ficha (#283). La subida queda solo para
        // cuando no hay ninguna franja libre —el lint lo cuenta entonces—, y la
        // decide `rerouteArrows` sobre lo que el navegador dibujó.
      };
      // Dos fichas se tocan si sus cajas se pisan en vertical y quedan a menos de TAG_GAP en horizontal.
      const clashes = (a, b) => {
        const gap = Math.max(b.cx - b.w / 2 - (a.cx + a.w / 2), a.cx - a.w / 2 - (b.cx + b.w / 2));
        return Math.min(a.cy, b.cy) - Math.max(a.cy - a.h, b.cy - b.h) > 0 && gap < TAG_GAP;
      };
      place();
      let split = true;
      while (split) {
        split = false;
        for (let i = 0; i < chips.length && !split; i++) {
          for (let j = i + 1; j < chips.length && !split; j++) {
            if (!clashes(chips[i], chips[j])) continue;
            // Se parte la más ancha que tenga dos palabras: es la que más aire recupera.
            const candidate = [chips[i], chips[j]].sort((p, q) => q.w - p.w).find((c) => c.lines.length === 1 && splitTag(c.lines[0]));
            if (!candidate) continue;
            candidate.lines = splitTag(candidate.lines[0]);
            place();
            split = true;
          }
        }
      }
      return chips;
    };

    const placeProps = (step, rows, chips) => {
      const props = [...step.querySelectorAll("[data-prop-id]")];
      props.forEach((p) => p.replaceChildren());
      // Cada ficha reserva su caja medida, con las líneas que tiene (#261). Una ficha que nombra a una pieza
      // no reserva nada: la pieza va en su lado.
      const reserved = chips.filter((c) => !c.target.hasAttribute("data-prop-id")).map((c) => ({ x: c.cx - c.w / 2 - 4, y: c.cy - c.h - 8, width: c.w + 8, height: c.h + 16 }));
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
          if (label) prop.append(make("text", { x: cx.toFixed(1), y: labelY.toFixed(1), "font-size": 16, "font-weight": 700, fill: t.color, "text-anchor": "middle" }, label));
        };
        let spots;
        if (prop.dataset.propOn) {
          const anchor = findIn(step, prop.dataset.propOn);
          if (!anchor) { prop.dataset.propMissing = prop.dataset.propOn; continue; }
          const b = anchor.getBBox();
          // La columna de una pieza es la de su figura, no la de su borde decorado:
          // el candado del bloqueo corría el cofre cuatro unidades a la derecha.
          const fig = figureOf(anchor).getBBox();
          const row = anchor.hasAttribute("data-actor") ? rows.get(anchor.dataset.actor) : null;
          const top = row ? row.top : b.y, bottom = row ? row.bottom : b.y + b.height;
          const gap = 10, cxm = fig.x + fig.width / 2, cym = b.y + b.height / 2;
          // La pieza ocupa lo que ocupa su nombre, no solo su icono: «liberado» a 16
          // unidades es más ancho que el cofre y, midiendo con el icono, la pieza
          // entraba dos unidades en el actor de al lado (#243).
          const half = Math.max(size / 2, label ? (label.length * 16 * 0.56 + 4) / 2 : 0);
          const at = {
            right: [b.x + b.width + gap + half, cym, "up"],
            left: [b.x - gap - half, cym, "up"],
            above: [cxm, top - gap - size / 2, "up"],
            below: [cxm, bottom + gap + size / 2, "down"],
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
    // La ficha se escribe en coordenadas absolutas, no con un `transform`: las puertas miden
    // `getBBox()`, que vive en el espacio local del nodo, y una ficha transformada se medía en el origen.
    const drawChip = (c) => {
      const { tag, cx, cy, w, h, lines, t, fig } = c;
      const lineY = (i) => cy - h / 2 + TAG_SIZE * 0.36 + (i - (lines.length - 1) / 2) * (TAG_SIZE + 4);
      tag.replaceChildren(
        make("rect", { x: cx - w / 2, y: cy - h, width: w, height: h, rx: h / 2, fill: "#ffffff", stroke: t.stroke, "stroke-width": 1.5 }),
        ...lines.map((line, i) => make("text", { x: cx, y: lineY(i), "font-size": TAG_SIZE, fill: t.color, "text-anchor": "middle", "font-weight": 700 }, line)),
        make("path", { d: `M ${cx - 4} ${cy} L ${cx} ${cy + 6} L ${cx + 4} ${cy} Z`, fill: t.stroke }),
      );
      const tx = fig.x + fig.width / 2, ty = fig.y, my = (cy + ty) / 2;
      const d = Math.abs(cx - tx) < 2 ? `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}` : `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${cx.toFixed(1)} ${my.toFixed(1)} L ${tx.toFixed(1)} ${my.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`;
      tag.append(make("path", { d, fill: "none", stroke: t.stroke, "stroke-width": 1.5, "data-elbow": "1" }));
    };
    for (const step of scopes) {
      const rows = rowFrames(step);
      const chips = layoutTags(step, rows);
      placeProps(step, rows, chips);
      for (const c of chips) drawChip(c);
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
        path.setAttribute("marker-end", marker(move.dataset.moveTone, 1.5));
        const label = move.querySelector("[data-move-label]");
        label.textContent = move.dataset.moveVerb || "";
        // En un trazo horizontal el verbo va centrado sobre el trazo, lejos de la punta;
        // en uno que baja, más a la derecha del arranque, como siempre.
        label.setAttribute("x", (sideBySide && lane ? (start.x + end.x) / 2 : Math.max((start.x + end.x) / 2, start.x + 66)).toFixed(1));
        label.setAttribute("y", (Math.min(start.y, end.y) - 16).toFixed(1));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "16");
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
          if (!hole) { glyphAt(mark, kind === "no" ? "no" : "ok", joint, { avoid: pieces(), size: Math.min(24, letterOf(step)) }); continue; }
          const t = tone(kind === "no" ? "red" : "green");
          const words = `${kind === "no" ? "✗" : "✓"}${mark.dataset.markLabel ? ` ${mark.dataset.markLabel}` : ""}`;
          const size = Math.min(24, letterOf(step));
          mark.replaceChildren(make("text", { x: (hole.x + hole.width / 2).toFixed(1), y: (hole.y + hole.height / 2 + size * 0.34).toFixed(1), "font-size": size, "font-weight": 700, fill: t.color, "text-anchor": "middle" }, words));
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
          // La etiqueta del resultado se apoya sobre el marco, no fuera del lienzo:
          // a 16 unidades y con el marco a 8, la línea base subía hasta dejar la
          // palabra a 10 unidades del borde (#243).
          if (mark.dataset.markLabel) parts.push(make("text", { x: union.x + union.width / 2, y: Math.max(18, union.y - pad - 4), "font-size": 16, "font-weight": 700, fill: t.color, "text-anchor": "middle" }, mark.dataset.markLabel));
          const to = mark.dataset.markTo ? findIn(step, mark.dataset.markTo) : null;
          if (to) {
            const b = to.getBBox();
            const sx = union.x + union.width / 2, sy = union.y + union.height + pad;
            // La punta se detiene 10 unidades arriba de la caja: la marca del
            // resultado dibuja su marco 8 unidades por fuera y una punta en el
            // borde quedaba enterrada dentro de ese marco.
            const ex = b.x + b.width / 2, ey = b.y - 10, my = (sy + ey) / 2;
            parts.push(make("path", { d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx.toFixed(1)} ${my.toFixed(1)}, ${ex.toFixed(1)} ${my.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`, fill: "none", stroke: t.stroke, "stroke-width": 2, "stroke-dasharray": "6 5", "marker-end": marker("amber", 2) }));
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
          // Una marca con nombre es más ancha que el glifo suelto: junto a su ancla
          // se salía del lienzo, así que va debajo, centrada, y nunca encima de un
          // actor ni de una pieza (#243).
          const wide = Boolean(mark.dataset.markLabel) || ids.length > 1;
          glyphAt(mark, kind === "no" ? "no" : "ok", union, { avoid: pieces(), below: onProps || wide, label: mark.dataset.markLabel || "", size: Math.min(24, letterOf(step)) });
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
        glyphAt(holder, "no", boxOf(target), { corner: true, avoid: pieces().filter((b) => !(b.x === target.getBBox().x && b.y === target.getBBox().y)), size: Math.min(24, letterOf(step)) });
      }
      rerouteArrows(step, chips, drawChip);
      liftChipsOffArrows(step, chips, drawChip);
    }
    // #283: una flecha entre dos actores va ENTRE los dos actores. El camino que
    // dibujó `walkScene` sale de la coordenada que escribió el autor, y si sus dos
    // extremos caen en la franja de las fichas de nombre —o por encima de las
    // figuras, donde no hay aire para sus palabras— la flecha quedaba recortada en
    // un muñón: un tramo corto con la punta en el aire y la etiqueta en una franja
    // vacía. `#280` subió las fichas y el alumno siguió viendo el muñón, así que
    // aquí se reenruta la flecha ENTERA —trazo, punta y etiqueta— a la primera
    // franja horizontal libre que comparten los dos actores, con los dos extremos
    // sobre sus figuras. Solo si no hay ninguna franja libre suben las fichas, y
    // entonces el grupo queda marcado (`data-arrow-crowded`) para que el lint lo
    // cuente: nunca se dibuja un muñón.
    function rerouteArrows(step, chips, drawChip) {
      const groups = [...step.querySelectorAll("[data-arrow]")];
      if (!groups.length) return;
      const figures = [...step.querySelectorAll("[data-actor]")].map((el) => {
        const b = figureOf(el).getBBox();
        return { el, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
      });
      if (figures.length < 2) return;
      // La ficha es de su actor: solo una flecha que sale y llega a dos actores con
      // ficha de nombre puede caer en la franja de las fichas.
      const chipped = new Set(chips.map((c) => c.target));
      const pill = (c) => ({ x: c.cx - c.w / 2, y: c.cy - c.h, width: c.w, height: c.h });
      const hits = (a, b, pad = 0) => a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
      // Lo que una flecha reenrutada no puede pisar: lo que el paso ya dibujó. Las
      // figuras de sus dos actores quedan fuera: los extremos se apoyan en ellas.
      const obstacles = (ends, self) => {
        const out = chips.map(pill);
        for (const f of figures) if (!ends.includes(f.el)) out.push({ x: f.x, y: f.y, width: f.w, height: f.h });
        for (const el of step.querySelectorAll("[data-prop-id], [data-box], [data-icon], [data-label], [data-mark-kind], [data-move-from], [data-arrow]")) {
          if (el === self) continue;
          const b = el.getBBox();
          if (b.width > 1 || b.height > 1) out.push({ x: b.x, y: b.y, width: b.width, height: b.height });
        }
        return out;
      };
      const actorNear = (x, y) => {
        let best = null;
        for (const f of figures) {
          // El extremo se escribió en la columna de su actor: fuera de ella no es suyo.
          if (Math.abs(x - f.cx) > f.w / 2 + 12) continue;
          const d = Math.hypot(x - f.cx, y - f.cy);
          if (d > Math.max(f.h, 24) * 3) continue;
          if (!best || d < best.d) best = { f, d };
        }
        return best ? best.f : null;
      };
      // La etiqueta se apoya en el trazo, nunca en una franja vacía: su borde queda a
      // 2 unidades de la tinta y su centro a menos de 20 del trazo. Se mide lo que el
      // navegador dibujó y se corrige una vez, así acierta en cualquier tipografía.
      const seat = (label, cx, line, ink, up) => {
        label.setAttribute("x", S.f(cx));
        label.setAttribute("text-anchor", "middle");
        const edge = up ? line - ink - 2 : line + ink + 2;
        label.setAttribute("y", S.f(edge));
        const b = label.getBBox();
        const shift = up ? edge - (b.y + b.height) : edge - b.y;
        label.setAttribute("y", S.f(edge + shift));
        delete label.dataset.edgeX;
        delete label.dataset.edgeY;
        delete label.dataset.edgeAnchor;
      };
      for (const group of groups) {
        const declared = String(group.dataset.arrowDeclared || `${group.dataset.arrow},${group.dataset.to}`).split(",").map(Number);
        if (declared.length !== 4 || !declared.every(Number.isFinite)) continue;
        // Los extremos que escribió el autor se guardan: cada pasada parte de ellos,
        // así el reenrutado no se corre al medirse dos veces (fuentes, ancho, tema).
        if (group.dataset.arrowDeclared === undefined) group.dataset.arrowDeclared = declared.join(",");
        const [x1, y1, x2, y2] = declared;
        // Un trazo que baja no es una fila de actores: su franja libre se mide aparte.
        if (Math.abs(y2 - y1) > Math.abs(x2 - x1) * 1.5) continue;
        const A = actorNear(x1, y1), B = actorNear(x2, y2);
        if (!A || !B || A === B) continue;
        if (!chipped.has(A.el) || !chipped.has(B.el)) continue;
        const [L, R] = A.cx <= B.cx ? [A, B] : [B, A];
        const gap = R.x - L.right;
        const top = Math.max(L.y, R.y), bottom = Math.min(L.bottom, R.bottom);
        if (!(bottom - top > 0)) continue; // uno arriba del otro: no es una fila
        const path = [...group.children].find((n) => n.tagName === "path" && n.hasAttribute("marker-end"));
        if (!path) continue;
        const shaft = Number(path.getAttribute("stroke-width")) || 4;
        // La tinta del trazo y su punta: la etiqueta no se apoya en ninguna de las dos.
        const ink = Math.max(shaft / 2, S.head(shaft) / 2) + 2;
        // La etiqueta vuelve a la letra que dibujó `walkScene`: el corte anterior le
        // dejó un hueco más chico que sus palabras y `fitSceneText` la comprimió.
        const label = [...group.children].find((n) => n.tagName === "text");
        const size = Number(group.dataset.labelSize) || Number(label?.getAttribute("font-size")) || 16;
        let caption = null;
        if (label) {
          label.setAttribute("font-size", String(size));
          label.removeAttribute("data-overflow");
          const b = label.getBBox();
          caption = { width: b.width, height: b.height };
        }
        const midX = (L.right + R.x) / 2, midY = (top + bottom) / 2;
        const blocks = obstacles([L.el, R.el], group);
        // Las franjas de la fila que comparten los dos actores, del medio hacia los
        // bordes: en cualquiera de ellas los dos extremos caen sobre sus figuras.
        const lanes = [];
        for (let d = 0; d <= (bottom - top) / 2; d += 2) {
          if (!d) lanes.push(midY);
          else {
            if (midY - d >= top + ink) lanes.push(midY - d);
            if (midY + d <= bottom - ink) lanes.push(midY + d);
          }
        }
        // La etiqueta cabe arriba o debajo del trazo, a menos de 20 unidades de él y
        // dentro del lienzo; gana el primer sitio que no pisa nada dibujado.
        const seatOf = (y, up) => ({
          x: midX - (caption ? caption.width : 0) / 2,
          y: up ? y - ink - 2 - (caption ? caption.height : 0) : y + ink + 2,
          width: caption ? caption.width : 0,
          height: caption ? caption.height : 0,
        });
        const freeSeat = (y, up) => {
          const box = seatOf(y, up);
          if (!caption) return true;
          if (box.y < room.y + STAGE_EDGE || box.y + box.height > room.y + room.height - STAGE_EDGE) return false;
          if (box.x < room.x + STAGE_EDGE || box.x + box.width > room.x + room.width - STAGE_EDGE) return false;
          return !blocks.some((b) => hits(box, b, 2));
        };
        let lane = null;
        if (gap >= 40) {
          for (const y of lanes) {
            if (blocks.some((b) => hits({ x: L.right - 2, y: y - ink, width: gap + 4, height: 2 * ink }, b))) continue;
            const up = freeSeat(y, true) ? true : freeSeat(y, false) ? false : null;
            if (up === null) continue;
            lane = { y, up };
            break;
          }
        }
        if (lane) {
          const up = lane.up;
          // Un solo tramo: se descartan los trozos del corte y el muñón.
          for (const n of [...group.children]) if (n.tagName === "path" && !n.hasAttribute("marker-end")) n.remove();
          path.setAttribute("d", `M ${S.f(L.right)} ${S.f(lane.y)} L ${S.f(R.x)} ${S.f(lane.y)}`);
          group.dataset.arrow = `${S.f(L.right)},${S.f(lane.y)}`;
          group.dataset.to = `${S.f(R.x)},${S.f(lane.y)}`;
          delete group.dataset.arrowCrowded;
          if (label) {
            const fit = Math.max(40, 2 * Math.min(midX - room.x - 4, room.x + room.width - midX - 4));
            label.setAttribute("data-fit", S.f(fit));
            seat(label, midX, lane.y, ink, up);
          }
          continue;
        }
        // Sin franja libre: las fichas suben por encima de la flecha (la conducta de
        // #280) y el grupo se marca para que el lint lo cuente. La flecha se dibuja
        // entera igual: nunca un muñón.
        const band = { x: Math.min(x1, x2), y: Math.min(y1, y2) - ink, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) + 2 * ink };
        const crowd = [L, R].map((f) => chips.find((c) => c.target === f.el)).filter((c) => c && hits(band, pill(c), 4));
        if (!crowd.length) continue;
        group.dataset.arrowCrowded = "1";
        for (const n of [...group.children]) if (n.tagName === "path" && !n.hasAttribute("marker-end")) n.remove();
        path.setAttribute("d", `M ${S.f(x1)} ${S.f(y1)} L ${S.f(x2)} ${S.f(y2)}`);
        if (label) {
          const fit = Math.max(40, 2 * Math.min((x1 + x2) / 2 - room.x - 4, room.x + room.width - (x1 + x2) / 2 - 4));
          label.setAttribute("data-fit", S.f(fit));
          const up = Math.min(y1, y2) - ink - 2 - label.getBBox().height >= room.y + STAGE_EDGE;
          seat(label, (x1 + x2) / 2, Math.min(y1, y2), ink, up);
        }
      }
    }

    // #280 sigue valiendo para la flecha que no se puede reenrutar: una ficha que
    // queda debajo de un extremo de flecha —el trazo le cruza las palabras— sube
    // por encima de él, dentro del lienzo, y su puntero sigue llegando al actor. La
    // flecha ya está reenrutada cuando se mide esto, así que una ficha solo sube
    // por la flecha que de verdad la pisa. Sube la fila entera: dos fichas de la
    // misma fila a distinta altura se leen torcidas (#245).
    function liftChipsOffArrows(step, chips, drawChip) {
      const groups = [...step.querySelectorAll("[data-arrow]")];
      if (!groups.length || !chips.length) return;
      const rows = new Map();
      for (const c of chips) {
        const at = c.fixedY ?? c.baseY - 8;
        const crowded = groups
          .flatMap((g) => [String(g.dataset.arrow || "").split(",").map(Number), String(g.dataset.to || "").split(",").map(Number)])
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
          .filter(([x, y]) => Math.abs(x - c.cx) <= c.w / 2 + 4 && y < at && at - y <= 2 * c.h)
          .map(([, y]) => y);
        if (!crowded.length) continue;
        if (!rows.has(c.baseY)) rows.set(c.baseY, { list: [], ys: [] });
        rows.get(c.baseY).list.push(c);
        rows.get(c.baseY).ys.push(...crowded);
      }
      for (const { list, ys } of rows.values()) {
        const above = Math.min(...ys) - 6;
        const tallest = Math.max(...list.map((c) => c.h));
        const up = above - tallest >= room.y + STAGE_EDGE;
        for (const c of list) {
          if (c.fixedY !== null) continue;
          c.cy = up ? above : Math.max(...ys) + 6 + c.h;
          drawChip(c);
        }
      }
    }

    // La etiqueta de la flecha se coloca al final, cuando las fichas, los cofres y
    // las marcas ya están dibujados: su sitio depende de lo que el navegador midió.
    placeEdgeLabels(svg);
    groups.forEach((g, i) => { g.style.display = shown[i]; });
  }
  // El contrato de la etiqueta de una flecha (#237) también rige en el escenario de
  // una historia (#280): no pasa la letra de la figura, no se apoya en su propio
  // trazo y cabe en el lienzo con el margen de la figura. Si el sitio recto —arriba,
  // al medio— no cabe porque la flecha roza el borde o las fichas de nombre ocupan
  // ese aire, la etiqueta sube al hombro de la flecha —sobre uno de sus extremos— o
  // pasa debajo del trazo. Se mide lo que el navegador dibujó, no una estimación.
  function placeEdgeLabels(svg) {
    const room = svg.viewBox.baseVal;
    const clear = 4;
    const touches = (a, b) => a.x < b.x + b.width + 2 && b.x < a.x + a.width + 2 && a.y < b.y + b.height + 2 && b.y < a.y + a.height + 2;
    for (const text of svg.querySelectorAll('text[data-edge-label]')) {
      const group = text.closest('[data-arrow]');
      if (!group) continue;
      const [x1, y1] = String(group.dataset.arrow || '').split(',').map(Number);
      const [x2, y2] = String(group.dataset.to || '').split(',').map(Number);
      if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
      // La tinta que la etiqueta no puede tocar es la de su propia flecha.
      const ink = [];
      for (const stroke of group.querySelectorAll('path, line')) {
        if (stroke.closest('marker') || !stroke.getTotalLength) continue;
        const len = stroke.getTotalLength();
        if (!len) continue;
        for (let at = 0; at <= len; at += 2) ink.push(stroke.getPointAtLength(at));
        ink.push(stroke.getPointAtLength(len));
      }
      const step = group.closest('[data-step]') || svg;
      const others = [...step.querySelectorAll('text, rect, circle')]
        .filter((el) => el !== text && !group.contains(el))
        .map((el) => el.getBBox())
        .filter((b) => b.width || b.height);
      const anchor = text.getAttribute('text-anchor') || 'middle';
      // El sitio que dibujó el render se guarda: cada pasada parte de ahí, así el
      // ajuste no se corre al medirse dos veces (fuentes, ancho, tema).
      if (text.dataset.edgeX === undefined) {
        text.dataset.edgeX = text.getAttribute('x');
        text.dataset.edgeY = text.getAttribute('y');
        text.dataset.edgeAnchor = anchor;
      }
      const baseX = Number(text.dataset.edgeX) || 0;
      const baseY = Number(text.dataset.edgeY) || 0;
      text.setAttribute('x', text.dataset.edgeX);
      text.setAttribute('y', text.dataset.edgeY);
      text.setAttribute('text-anchor', text.dataset.edgeAnchor);
      const origin = text.getBBox();
      if (!origin.width && !origin.height) continue;
      const ascent = baseY - origin.y;
      const descent = origin.y + origin.height - baseY;
      const fits = () => {
        const b = text.getBBox();
        const air = Math.min(b.x - room.x, b.y - room.y, room.x + room.width - (b.x + b.width), room.y + room.height - (b.y + b.height));
        // Medio punto de colchón: el redondeo de la medición no puede dejar la
        // etiqueta justo por debajo del margen que la puerta exige.
        if (air < STAGE_EDGE + 0.5) return false;
        const near = (p) => p.x > b.x - clear && p.x < b.x + b.width + clear && p.y > b.y - clear && p.y < b.y + b.height + clear;
        if (ink.some(near)) return false;
        return !others.some((o) => touches(b, o));
      };
      const tryAt = (x, y, where) => {
        text.setAttribute('x', String(Math.round(x * 10) / 10));
        text.setAttribute('y', String(Math.round(y * 10) / 10));
        text.setAttribute('text-anchor', where);
        return fits();
      };
      const left = Math.min(x1, x2), right = Math.max(x1, x2);
      const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
      const below = bottom + clear + 1.5 + ascent;
      const horizontal = Math.abs(y2 - y1) <= Math.abs(x2 - x1) * 1.5;
      let placed = false;
      if (horizontal) {
        // El sitio recto, sus dos hombros y los mismos tres debajo del trazo.
        for (const [x, y, where] of [[midX, baseY, 'middle'], [left, baseY, 'start'], [right, baseY, 'end'], [midX, below, 'middle'], [left, below, 'start'], [right, below, 'end']]) {
          if (tryAt(x, y, where)) { placed = true; break; }
        }
      } else {
        // Una flecha vertical lleva sus palabras a un lado: se prueban el lado que
        // declaró el autor y el otro, al medio y en los dos extremos.
        const gap = anchor === 'start' ? origin.x - right : left - (origin.x + origin.width);
        const flip = anchor === 'start' ? 'end' : 'start';
        const flipX = anchor === 'start' ? left - Math.max(4, gap) : right + Math.max(4, gap);
        for (const [x, y, where] of [[baseX, baseY, anchor], [baseX, midY, anchor], [baseX, top, anchor], [baseX, bottom, anchor], [flipX, midY, flip], [flipX, top, flip]]) {
          if (tryAt(x, y, where)) { placed = true; break; }
        }
      }
      if (placed) continue;
      // Sin sitio limpio, la etiqueta se mete dentro del lienzo: una palabra a
      // caballo del borde no se lee y la puerta la rechaza.
      text.setAttribute('text-anchor', 'middle');
      const b = text.getBBox();
      const x = Math.min(Math.max(baseX, room.x + STAGE_EDGE + 0.5 + b.width / 2), room.x + room.width - STAGE_EDGE - 0.5 - b.width / 2);
      const y = Math.min(Math.max(baseY, room.y + STAGE_EDGE + 0.5 + ascent), room.y + room.height - STAGE_EDGE - 0.5 - descent);
      text.setAttribute('x', String(Math.round(x * 10) / 10));
      text.setAttribute('y', String(Math.round(y * 10) / 10));
    }
  }
  function walkScene(scene, stageWidth, stageTop = 0, stageHeight = 0) {
    const S = window.LKScene;
    const tones = WALK_TONES();
    const tone = (name) => tones[name] || tones.slate;
    // La letra de una etiqueta de flecha no puede ser más grande que la letra de la
    // figura: ni más que los rótulos sueltos (la leyenda de la escena) ni más que
    // las cajas. «ORA-02291» a 22 sobre cajas de 13 se leía como un título y tapaba
    // la flecha que etiquetaba (#237). Si no cabe a ese tamaño, la etiqueta sube o
    // la puerta la marca; nunca crece.
    const figureSizes = [
      ...(scene.labels || []).map((l) => l.size || 24),
      ...(scene.boxes || []).map((b) => b.size || 26),
      // La ficha de nombre de un actor y el nombre de una caja son letra de la
      // figura. En un escenario la ficha es la única palabra que el lector
      // compara, así que la etiqueta de la flecha no se dibuja más grande que
      // ella: a 22 sobre fichas de 16 se leía como un título (#280).
      ...(scene.actors || []).map((a) => (a.kind || a.icon ? (a.tag ? STAGE_TAG_SIZE : 0) : a.size || 18)),
      ...(scene.tags || []).map(() => STAGE_TAG_SIZE),
    ].filter((size) => size > 0);
    const labelCap = figureSizes.length ? Math.min(...figureSizes) : 22;
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
      // Un icono sobre una caja es su adorno (#273): `placeIcons` lo lleva a una esquina
      // libre de esa caja, nunca encima de su rótulo, aunque la nota lo haya puesto allí.
      // Su tinta va en un grupo propio para que esa pasada la desplace.
      const onBox = (scene.boxes || []).find((b) => ic.x >= b.x && ic.x <= b.x + b.w && ic.y >= b.y && ic.y <= b.y + b.h);
      const ink = S.icon(ic.kind || 'doc', cx, cy, size, { stroke: t.stroke, fill: ic.fill || t.fill });
      out += `<g data-icon="${S.esc(ic.kind || 'doc')}"${ic.id ? ` data-icon-id="${S.esc(ic.id)}"` : ''}`
        + (onBox ? ` data-icon-box="${onBox.x},${onBox.y},${onBox.w},${onBox.h}"><g data-icon-ink="1">${ink}</g>` : `>${ink}`) + '</g>';
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
      const size = Math.min(a.labelSize || 22, labelCap);
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
      // La punta la mide `scene.js`: crece con el trazo, tiene tope y su vértice
      // cae en el extremo del trazo (refX = 12 del viewBox de 12), así que se
      // come `S.head(shaft)` unidades hacia atrás y no 36,67 con un trazo de 4.
      const headBack = S.head(shaft);
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
          anchor: 'middle', color: tone(a.labelTone || a.tone).color, size, edge: true,
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
          const x = vertical ? (side > 0 ? right : left) : Math.max(15, Math.min(stageWidth - 15, (freeStart + freeEnd) / 2));
          // Las palabras van al lado del trazo, no dentro, así que su ancho no lo
          // limita el tramo de la flecha: medirlas contra el tramo las comprimía
          // —«ORA-02291» en 36 unidades— y el alumno las vio como una letra
          // condensada encima de la flecha (#237). Lo que sí las limita son las
          // cajas que ocupan su altura: entre ellas el rótulo no las invade, y si
          // no hay ninguna a su altura, el ancho libre es el del escenario.
          const besideY = Math.min(a.y1, a.y2) - gap - size * 0.3;
          const band = (scene.boxes || []).filter((b) => besideY + size * 0.3 > b.y && besideY - size * 0.85 < b.y + b.h);
          const leftEdge = Math.max(0, ...band.filter((b) => b.x + b.w <= x).map((b) => b.x + b.w));
          const rightEdge = Math.min(stageWidth, ...band.filter((b) => b.x >= x).map((b) => b.x));
          const inBand = Math.max(1, 2 * Math.min(x - leftEdge - 4, rightEdge - x - 4));
          // Si las palabras no caben entre las cajas a un tamaño legible, suben por
          // encima de ellas en vez de encogerse: una etiqueta condensada no se lee
          // (#237). Ahí el ancho libre es el del escenario.
          const lift = !vertical && band.length > 0 && a.label.length * size * 0.45 > inBand;
          const labelY = lift ? Math.max(size, Math.min(...band.map((b) => b.y)) - size * 0.3 - 6) : besideY;
          let fit = inBand;
          if (vertical) fit = Math.max(1, side > 0 ? stageWidth - x - 4 : x - 4);
          else if (lift) fit = Math.max(1, 2 * Math.min(x - 4, stageWidth - x - 4));
          out += S.lbl(x, vertical ? midY + size * 0.36 : labelY, a.label, {
            anchor: vertical ? (side > 0 ? 'start' : 'end') : 'middle',
            color: tone(a.labelTone || a.tone).color,
            size, fit, edge: true,
          });
        }
      }
      out = out.slice(0, drawnFrom)
        + `<g data-arrow="${a.x1},${a.y1}" data-to="${a.x2},${a.y2}" data-label-size="${size}">` + out.slice(drawnFrom) + '</g>';
    }
    for (const b of scene.badges || []) out += S.badge(b.x, b.y, b.n);
    for (const d of scene.dashed || []) out += S.dashed(d.x, d.y, d.w, d.h, d.label || '', tone(d.tone).stroke, d.fill);
    for (const l of scene.labels || []) out += `<g data-label="1"${l.id ? ` data-label-id="${S.esc(l.id)}"` : ''}>` + S.lbl(l.x, l.y, l.text, { anchor: l.anchor || 'middle', color: tone(l.tone).color, size: l.size || 24 }) + '</g>';
    // Actores, rótulos con punta, movimientos y marcas: la escena de un paso de
    // `lk-story`. Se dibujan como marcadores vacíos y `placeStory` los rellena con
    // las cajas que el navegador midió, nunca con coordenadas escritas a mano.
    // Un actor tiene estado: activo (su tono), apagado (gris: ya no vale), inválido
    // (gris, tachado y con su ✗), bloqueado (su tono, marco a trazos y su candado) o
    // en espera (gris, marco a trazos: todavía no le toca). El actor es una caja con
    // su etiqueta o, con `kind` (o su alias `icon`), un personaje dibujado —el
    // cilindro de la base de datos, la fila, la sesión, el candado, el usuario, el
    // servidor, el proceso, el archivo, el paquete, el robot— centrado en (x, y).
    // Un actor de cajas cuando la idea tiene personaje es lo que el alumno rechazó
    // (#245): el personaje se dibuja, no se nombra dentro de un rectángulo.
    const STATES = ['invalid', 'faded', 'locked', 'waiting'];
    for (const a of scene.actors || []) {
      const t = tone(a.tone);
      const state = STATES.includes(a.state) ? a.state : 'active';
      const grey = state === 'invalid' || state === 'faded' || state === 'waiting';
      const framed = state === 'locked' || state === 'waiting';
      const ink = grey ? S.C.slate2 : t.stroke;
      const sheet = grey ? '#ffffff' : t.fill;
      let body, frame;
      const kind = a.kind || a.icon;
      if (kind) {
        const size = a.size || 56;
        const cx = stageWidth ? Math.min(Math.max(a.x, size / 2), stageWidth - size / 2) : a.x;
        const cy = stageHeight ? Math.min(Math.max(a.y, stageTop + size / 2), stageTop + stageHeight - size / 2) : a.y;
        body = S.icon(kind, cx, cy, size, { stroke: ink, fill: sheet });
        frame = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
      } else {
        body = S.box(a.x, a.y, a.w, a.h, a.label || '', {
          stroke: ink, fill: sheet, color: grey ? S.C.slate2 : t.color, size: a.size || 18, rx: a.rx ?? 10,
        });
        frame = { x: a.x, y: a.y, w: a.w, h: a.h };
      }
      // El marco a trazos dice «no está libre»: bloqueado o esperando. Se dibuja
      // sobre el borde que el navegador midió, no en una coordenada aparte.
      const dashed = framed
        ? `<g data-frame="${state}">${`<rect x="${S.f(frame.x - 5)}" y="${S.f(frame.y - 5)}" width="${S.f(frame.w + 10)}" height="${S.f(frame.h + 10)}" rx="6" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="6 5"/>`}</g>`
        : '';
      const strike = state === 'invalid'
        ? `<g data-strike="1">${S.line(frame.x - 6, frame.y + frame.h / 2, frame.x + frame.w + 6, frame.y + frame.h / 2, { color: tone('red').stroke, arrow: false, width: 2.5 })}</g>`
        : '';
      // El candado del actor bloqueado se dibuja en su esquina, con el papel de la
      // escena detrás: el candado es un personaje más, no un adorno de color.
      const lock = state === 'locked'
        ? `<g data-lock="1"><circle cx="${S.f(frame.x + frame.w)}" cy="${S.f(frame.y)}" r="${S.f(Math.max(9, frame.w * 0.2))}" fill="#ffffff" stroke="${ink}" stroke-width="1.5"/>${S.icon('lock', frame.x + frame.w, frame.y, Math.max(14, frame.w * 0.3), { stroke: ink, fill: '#ffffff' })}</g>`
        : '';
      out += `<g data-actor="${S.esc(a.id)}" data-state="${state}"${grey ? ' data-faded="1"' : ''}><g data-figure="1">${body}</g>${dashed}${strike}${lock}</g>`;
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
      // Nunca se comprime el texto: una etiqueta condensada no se lee, y el
      // alumno la vio como una letra inventada encima de la flecha (#237). Si no
      // cabe al tamaño mínimo se deja, y la marca `data-overflow` lo dice para que
      // la puerta lo corrija: la etiqueta se acorta o se mueve al lado del trazo.
      if (text.getComputedTextLength() > max) {
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

  // #261: cada veredicto tiene su tono y su píldora por defecto. «neutral» es el
  // contraste entre dos estados que son válidos: sin tinte de error, con el tono de la
  // pizarra. El rojo es solo para un error.
  const CARD_VERDICT = {
    ok: { tone: 'green', fallback: 'CORRECTO' },
    no: { tone: 'red', fallback: 'ERROR' },
    neutral: { tone: 'slate', fallback: 'ESTADO' },
  };
  // #218: de dos a cuatro casos lado a lado. Cada tarjeta lleva su veredicto en una
  // píldora, un título, el dibujo mínimo del caso y una línea de razón; la que falla
  // se tiñe de rojo. Es para código: compila / no compila, correcto / error.
  function cardsPiece(spec) {
    const cards = Array.isArray(spec.cards) ? spec.cards : [];
    if (cards.length < 2 || cards.length > 4) throw new Error('Las tarjetas de veredicto necesitan de 2 a 4 casos');
    const root = el('div', undefined, { class: 'lk-p lk-cards', role: 'list', 'data-n': String(cards.length) });
    cards.forEach((c, i) => {
      const verdict = c.verdict === 'no' || c.verdict === 'neutral' ? c.verdict : 'ok';
      const { tone, fallback } = CARD_VERDICT[verdict];
      const bad = verdict === 'no';
      const card = el('article', undefined, { class: 'lk-card', role: 'listitem', 'data-verdict': verdict, 'data-anchor': c.id ?? `card-${i + 1}` });
      card.append(el('span', c.pill || fallback, { class: 'lk-pill', 'data-tone': tone }));
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
    // #252: la tabla se desplaza dentro de su propio marco, nunca más allá de la columna. El marco es
    // enfocable y marca hacia dónde hay más (`data-more`): el desvanecido del borde lo muestra.
    const frame = el('div', undefined, { class: 'lk-tframe', tabindex: '0', role: 'region', 'aria-label': name || 'resultado' });
    frame.append(grid);
    const scroll = el('div', undefined, { class: 'lk-tscroll' });
    scroll.append(frame);
    // Al desplazarse, el marco vuelve a marcar sus bordes y los conectores de la unión se trazan de nuevo.
    frame.addEventListener('scroll', () => {
      markFrame(scroll);
      const join = scroll.closest('.lk-tjoin');
      if (join) placeTables(join);
    }, { passive: true });
    wrap.append(scroll);
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
    // La tabla origen va primero: al apilarse, queda encima de la tabla destino.
    const ordered = join && from.table !== to.table ? [from.table, to.table] : tables;
    ordered.forEach((t) => {
      const isFrom = join && t === from.table, isTo = join && t === to.table;
      const tones = isFrom ? t.rows.map((r, i) => tonesOf(matches[i], r[from.col]))
        : isTo ? t.rows.map((r, k) => (matches.includes(k) ? tonesOf(k, r[to.col]) : ''))
          : [];
      wide.append(dataTable(t.id, t.name, t.columns || [], t.rows || [], { keyCol: isFrom ? from.col : isTo ? to.col : -1, tones, anchorKeys: Boolean(isFrom), anchorRows: Boolean(isTo) }));
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
  // #252: por debajo del ancho en que las dos tablas caben lado a lado, se apilan (la tabla origen
  // encima de la destino) y cada conector se traza de nuevo por el espacio libre junto a ellas: sale de
  // su celda clave hacia la derecha, baja por un canal, cruza el hueco y entra por la izquierda a su
  // fila. El primero baja más y sale más lejos por la derecha; el siguiente queda más arriba y más cerca.
  // Con las filas en el mismo orden en las dos tablas, ninguno cruza a otro; si el orden se invierte, sí.
  // Lado a lado, un conector es una sola curva entre la celda clave y la fila que coincide. Un conector
  // dibuja lo que su marco deja ver: si la celda clave queda fuera de su marco se oculta, y si la fila
  // queda fuera termina en el borde visible.
  const CHANNEL = 9;
  function markFrame(scroll) {
    const frame = scroll.firstElementChild;
    const more = [];
    if (frame.scrollLeft > 1) more.push('start');
    if (frame.scrollLeft + frame.clientWidth < frame.scrollWidth - 1) more.push('end');
    if (more.length) scroll.dataset.more = more.join(' ');
    else delete scroll.dataset.more;
  }
  function placeTables(join) {
    const svg = join.querySelector(':scope > .lk-mover');
    if (!svg) return;
    const tables = [...join.querySelectorAll(':scope > .lk-ttable')];
    const links = [...svg.querySelectorAll('path[data-from][data-to]')];
    // El relleno de los canales va siempre, apiladas o no: así el ancho en que se apilan depende solo de la
    // columna. Medir no toca el ancho ni la posición de un marco desplazado.
    join.style.paddingInline = `${(links.length + 1) * CHANNEL}px`;
    const stacked = tables.length === 2 && tables[1].getBoundingClientRect().top > tables[0].getBoundingClientRect().top + 2;
    if (stacked) {
      join.dataset.layout = 'stack';
      join.style.rowGap = `${Math.max(36, (links.length + 1) * 10)}px`;
    } else {
      delete join.dataset.layout;
      join.style.rowGap = '';
    }
    const b = join.getBoundingClientRect();
    if (!b.width) return;
    svg.setAttribute('width', b.width.toFixed(1));
    svg.setAttribute('height', b.height.toFixed(1));
    svg.setAttribute('viewBox', `0 0 ${b.width.toFixed(1)} ${b.height.toFixed(1)}`);
    const f = (n) => n.toFixed(1);
    const box = (node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left - b.left, right: r.right - b.left, top: r.top - b.top, bottom: r.bottom - b.top, cy: (r.top + r.bottom) / 2 - b.top };
    };
    const anchor = (id) => join.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
    // Lo que se ve de una tabla es lo que deja ver su marco de desplazamiento.
    const seen = (node) => {
      const frame = node.closest('.lk-tframe');
      if (!frame) return null;
      const r = frame.getBoundingClientRect();
      return { left: r.left - b.left, right: r.right - b.left };
    };
    const ends = links.map((path) => {
      const fromNode = anchor(path.dataset.from), toNode = anchor(path.dataset.to);
      if (!fromNode || !toNode) return null;
      const from = box(fromNode), to = box(toNode), fv = seen(fromNode), tv = seen(toNode);
      // Una celda clave fuera de su marco no tiene de dónde salir: su conector se oculta hasta que vuelva a verse.
      if (fv && (from.right < fv.left - 1 || from.right > fv.right + 1)) {
        path.setAttribute('visibility', 'hidden');
        return null;
      }
      path.removeAttribute('visibility');
      // Una fila desplazada fuera de su marco termina en el borde visible de este.
      if (tv) to.left = Math.max(to.left, tv.left);
      return { path, from, to };
    });
    if (stacked) {
      const [source, target] = tables.map((t) => box(t));
      const right = Math.max(source.right, target.right), left = Math.min(source.left, target.left);
      const step = (target.top - source.bottom) / (links.length + 1);
      ends.forEach((end, j) => {
        if (!end) return;
        const { path, from, to } = end;
        const x = right + CHANNEL * (links.length - j), y = source.bottom + step * (links.length - j), xl = left - CHANNEL * (j + 1);
        path.setAttribute('d', `M ${f(from.right)} ${f(from.cy)} H ${f(x)} V ${f(y)} H ${f(xl)} V ${f(to.cy)} H ${f(to.left)}`);
      });
      return;
    }
    for (const end of ends) {
      if (!end) continue;
      const { path, from, to } = end;
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

  // #228: el explorador de un escenario. Un mapa donde cada actor del sistema se
  // dibuja una vez (su nombre y el detalle que lo identifica), una lista de pasos
  // numerados que mueve el mapa —el paso activo enfoca a sus actores y muestra qué
  // viaja entre ellos—, un panel de detalles por paso y un registro de eventos que
  // se llena al avanzar. La segunda vista es el mismo recorrido como diagrama de
  // secuencia. Los enlaces y lo que viaja se trazan midiendo las cajas que el
  // navegador dibujó: el autor no escribe una coordenada.
  const EXPLORER_TONES = { query: 'blue', answer: 'green', syn: 'amber', ack: 'amber', get: 'blue', ok: 'green', render: 'slate' };
  let explorerCount = 0;
  const explorerTone = (item) => (item && item.tone ? toneOf(item.tone) : EXPLORER_TONES[item && item.kind] || 'slate');

  function explorerPiece(host) {
    const S = window.LKScene;
    if (!S) throw new Error('Falta scene.js: no se puede dibujar el explorador');
    const spec = readSpec(host, 'El explorador');
    const actors = Array.isArray(spec.actors) ? spec.actors : [];
    if (actors.length < 2) throw new Error('El explorador necesita al menos dos actores: un escenario es un intercambio entre sistemas');
    if (actors.length > 6) throw new Error('El explorador dibuja hasta seis actores: un escenario con más es dos escenarios');
    const ids = new Set();
    for (const a of actors) {
      if (!a.id || !a.name) throw new Error('Cada actor del explorador necesita un id y un nombre');
      if (ids.has(a.id)) throw new Error(`El explorador repite el actor «${a.id}»`);
      ids.add(a.id);
    }
    const who = (id, where) => {
      if (!ids.has(id)) throw new Error(`El explorador nombra a «${id}» en ${where}, y su mapa no lo tiene`);
      return id;
    };
    const steps = (Array.isArray(spec.steps) ? spec.steps : []).map((s, i) => {
      if (!s.title) throw new Error(`El paso ${i + 1} del explorador no tiene título`);
      const step = { ...s, focus: (s.focus || []).map((id) => who(id, `el foco del paso ${i + 1}`)) };
      if (s.travels) step.travels = { ...s.travels, from: who(s.travels.from, `lo que viaja en el paso ${i + 1}`), to: who(s.travels.to, `lo que viaja en el paso ${i + 1}`) };
      if (s.log) step.log = { ...s.log, from: who(s.log.from, `el registro del paso ${i + 1}`), to: who(s.log.to, `el registro del paso ${i + 1}`) };
      return step;
    });
    if (!steps.length) throw new Error('El explorador necesita sus pasos');
    if (steps.length > 8) throw new Error('El explorador cuenta hasta ocho pasos: un escenario más largo son dos');
    const links = (spec.links || []).map((l) => ({ from: who(l.from, 'un enlace'), to: who(l.to, 'un enlace'), tone: toneOf(l.tone) }));
    const rows = Array.isArray(spec.rows) && spec.rows.length ? spec.rows : [actors.map((a) => a.id)];
    const cell = new Map();
    rows.forEach((row, r) => (Array.isArray(row) ? row : []).forEach((id, c) => { if (id) { who(id, 'el mapa'); cell.set(id, { row: r, col: c }); } }));
    for (const a of actors) if (!cell.has(a.id)) throw new Error(`El mapa del explorador no coloca a «${a.id}»: escríbelo en «rows»`);
    const cols = rows.reduce((n, row) => Math.max(n, Array.isArray(row) ? row.length : 0), 1);
    const nameOf = (id) => (actors.find((a) => a.id === id) || {}).name || id;
    const views = (Array.isArray(spec.views) && spec.views.length ? spec.views : ['map']).filter((v) => v === 'map' || v === 'sequence');
    const n = ++explorerCount;
    const root = el('div', undefined, { class: 'lk-p lk-explorer', 'data-piece': 'explorer' });
    const bar = el('div', undefined, { class: 'lk-xbar' });
    const grid = el('div', undefined, { class: 'lk-xgrid' });
    // La lista de pasos: en una columna ancha vive a la izquierda; en un teléfono se
    // pliega, porque el panel de detalles ya dice en qué paso está el lector.
    const list = el('details', undefined, { class: 'lk-xlist' });
    list.append(el('summary', 'Los pasos', { class: 'lk-xsummary' }));
    const ol = el('ol', undefined, { class: 'lk-xsteps' });
    list.append(ol);
    const map = el('div', undefined, { class: 'lk-xmap' });
    // El número de columnas del mapa y el de actores: la rejilla y la secuencia usan
    // uno cada una (la secuencia tiene una columna por actor).
    root.style.setProperty('--xcols', String(cols));
    root.style.setProperty('--xactors', String(actors.length));
    root.style.setProperty('--xrows', String(Math.max(1, rows.length)));
    const details = el('div', undefined, { class: 'lk-xdetails' });
    grid.append(list, map, details);
    // El mapa: cada actor una vez, con su icono, su nombre y su detalle. `data-anchor`
    // es el id que los enlaces nombran; `data-focus` lo pone el paso activo.
    for (const a of actors) {
      const at = cell.get(a.id);
      const card = el('div', undefined, { class: 'lk-xactor', 'data-actor': a.id, 'data-anchor': a.id, 'data-tone': toneOf(a.tone), 'data-focus': '0' });
      card.style.setProperty('--row', String(at.row + 1));
      card.style.setProperty('--col', String(at.col + 1));
      // El personaje del actor (`kind`) es el que dibuja `scene.icon`, el mismo de una
      // historia. Sin `kind` el actor es una caja con su nombre; un `kind` que el kit no
      // dibuja se declara, en vez de quedar como una caja vacía.
      if (a.kind) {
        const markup = S.icon(a.kind, 22, 22, 34, { stroke: 'currentColor', fill: 'none' });
        if (!markup) throw new Error(`El actor «${a.id}» pide el personaje «${a.kind}», que el kit no dibuja`);
        const icon = svgPart('svg', { class: 'lk-xicon', viewBox: '0 0 44 44', 'aria-hidden': 'true' });
        // El personaje son todas sus figuras: `svgNode` devuelve el `<svg>` entero y se
        // pasan todos sus hijos, no solo el primero.
        icon.append(...svgNode(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).children);
        card.append(icon);
      }
      card.append(el('span', a.name, { class: 'lk-xname' }));
      if (a.detail) card.append(el('span', a.detail, { class: 'lk-xdetail' }));
      map.append(card);
    }
    const overlay = svgPart('svg', { class: 'lk-xlinks', 'aria-hidden': 'true' });
    const defs = svgPart('defs');
    for (const tone of PIECE_TONES) {
      const marker = svgPart('marker', { id: `lk-xm-${n}-${tone}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', 'data-tone': tone });
      marker.append(svgPart('path', { d: 'M 0 0 L 10 5 L 0 10 Z' }));
      defs.append(marker);
    }
    overlay.append(defs);
    for (const l of links) overlay.append(svgPart('path', { class: 'lk-xlink', fill: 'none', 'data-link': '1', 'data-from': l.from, 'data-to': l.to, 'data-tone': l.tone }));
    overlay.append(svgPart('path', { class: 'lk-xflow', fill: 'none', 'data-travel': '1' }));
    overlay.append(svgPart('path', { class: 'lk-xflow', fill: 'none', 'data-travel-to': '1' }));
    map.append(overlay);
    const travel = el('span', undefined, { class: 'lk-xtravel', 'aria-hidden': 'true' });
    map.append(travel);
    // La segunda vista: las mismas vidas y los mismos pasos, como secuencia.
    const seq = el('div', undefined, { class: 'lk-xseq' });
    seq.hidden = true;
    const seqHead = el('div', undefined, { class: 'lk-xseqhead' });
    seqHead.append(el('span', undefined, { class: 'lk-xgutter' }));
    for (const a of actors) seqHead.append(el('span', a.name, { class: 'lk-xseqname', 'data-tone': toneOf(a.tone) }));
    const seqRows = el('div', undefined, { class: 'lk-xseqrows' });
    for (const a of actors) seqRows.append(el('span', undefined, { class: 'lk-xlife', 'data-anchor': `life-${a.id}`, 'data-life': a.id, 'data-tone': toneOf(a.tone) }));
    const seqOverlay = svgPart('svg', { class: 'lk-xseqlinks', 'aria-hidden': 'true' });
    seqRows.append(seqOverlay);
    const seqLabels = [];
    steps.forEach((s, i) => {
      const row = el('div', undefined, { class: 'lk-xseqrow', 'data-seq': String(i + 1) });
      row.append(el('span', String(i + 1), { class: 'lk-xseqn' }));
      for (let k = 0; k < actors.length; k++) row.append(el('span', undefined, { class: 'lk-xseqcell' }));
      seqRows.append(row);
      const label = el('span', s.travels ? s.travels.label || '' : '', { class: 'lk-xseqmsg', 'data-tone': explorerTone(s.travels) });
      label.hidden = !s.travels;
      seqRows.append(label);
      seqLabels.push(label);
      if (!s.travels) return;
      const path = svgPart('path', { class: 'lk-xseqarrow', fill: 'none', 'data-seq': String(i + 1), 'data-from': `life-${s.travels.from}`, 'data-tone': explorerTone(s.travels) });
      if (s.travels.from !== s.travels.to) path.setAttribute('data-to', `life-${s.travels.to}`);
      seqOverlay.append(path);
    });
    seq.append(seqHead, seqRows);
    // El registro: una fila por paso, con su número, origen, destino, tipo e info. Se
    // llena al avanzar y se vacía al reiniciar.
    // Una tabla: la cabecera y cada fila usan las mismas columnas (`--xlogcols` en el CSS), así
    // cada texto cae bajo su título. La cabecera va dentro del área que se desplaza, pegada arriba,
    // para que ambas tengan el mismo ancho aunque aparezca la barra de desplazamiento.
    const log = el('div', undefined, { class: 'lk-xlog', role: 'table', 'aria-label': 'Registro de eventos' });
    const logBody = el('div', undefined, { class: 'lk-xlogbody' });
    const logHead = el('div', undefined, { class: 'lk-xloghead', role: 'row' });
    ['Nº', 'Origen', 'Destino', 'Tipo', 'Info'].forEach((h, c) => logHead.append(el('span', h, c === 4 ? { class: 'lk-xhinfo', role: 'columnheader' } : { role: 'columnheader' })));
    logBody.append(logHead);
    const logRows = steps.map((s, i) => {
      const row = el('div', undefined, { class: 'lk-xlogrow', role: 'row', 'data-tone': explorerTone(s.log) });
      row.append(el('span', String(i + 1), { class: 'lk-xln', role: 'cell' }));
      row.append(el('span', s.log ? nameOf(s.log.from) : '—', { class: 'lk-xfrom', role: 'cell' }));
      row.append(el('span', s.log ? nameOf(s.log.to) : '—', { class: 'lk-xto', role: 'cell' }));
      row.append(el('span', (s.log && s.log.kind) || '—', { class: 'lk-xkind', role: 'cell' }));
      row.append(el('span', (s.log && s.log.info) || '', { class: 'lk-xinfo', role: 'cell' }));
      row.hidden = i > 0;
      logBody.append(row);
      return row;
    });
    log.append(logBody);
    // El registro es opcional: `"log": false` lo quita, y un recorrido en el que ningún
    // paso escribe una fila no tiene nada que llenar.
    root.append(bar, grid, seq);
    if (spec.log !== false && steps.some((s) => s.log)) root.append(log);
    // Los controles: atrás, reproducir, adelante, reiniciar, la vista y la pantalla
    // completa. El contador lleva `role="status"` para que el lector sepa en qué paso
    // está sin mirar la lista.
    const count = el('span', undefined, { class: 'lk-xpos', role: 'status' });
    const prev = button('◀', () => go(index - 1));
    const next = button('▶', () => go(index + 1));
    const play = button('▶ Reproducir', () => toggle());
    const reset = button('↺ Reiniciar', () => { stop(); index = 0; draw(); });
    prev.setAttribute('aria-label', 'Paso anterior');
    next.setAttribute('aria-label', 'Paso siguiente');
    play.setAttribute('aria-label', 'Reproducir los pasos');
    reset.setAttribute('aria-label', 'Reiniciar los pasos');
    bar.append(prev, play, next, reset);
    let view = 'map';
    let viewButton = null;
    if (views.includes('sequence')) {
      viewButton = button('Secuencia', () => { view = view === 'map' ? 'sequence' : 'map'; draw(); });
      viewButton.setAttribute('aria-label', 'Ver la secuencia');
      bar.append(viewButton);
    }
    const full = button('Pantalla completa', () => {
      if (document.fullscreenElement === host) { document.exitFullscreen?.(); return; }
      host.requestFullscreen?.().catch(() => { full.textContent = 'Pantalla completa bloqueada'; });
    });
    full.className = 'lk-xfull';
    full.setAttribute('aria-label', 'Pantalla completa');
    bar.append(full, count);
    const syncFull = () => {
      const on = document.fullscreenElement === host;
      full.textContent = on ? 'Salir' : 'Pantalla completa';
      full.setAttribute('aria-pressed', String(on));
      placeExplorer(root);
    };
    document.addEventListener('fullscreenchange', syncFull);
    let index = 0, timer = null;
    const stepButtons = steps.map((s, i) => {
      const item = el('li');
      const b = el('button', undefined, { type: 'button', class: 'lk-xstep', 'data-step': String(i + 1) });
      b.append(el('span', String(i + 1), { class: 'lk-xn' }));
      const text = el('span', undefined, { class: 'lk-xst' });
      text.append(el('b', s.title, { class: 'lk-xstitle' }));
      if (s.subtitle) text.append(el('i', s.subtitle, { class: 'lk-xssub' }));
      b.append(text);
      b.addEventListener('click', () => { stop(); go(i); });
      item.append(b);
      ol.append(item);
      return b;
    });
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const go = (to) => { index = Math.max(0, Math.min(steps.length - 1, to)); draw(); };
    const toggle = () => {
      if (timer) { stop(); draw(); return; }
      if (index === steps.length - 1) { index = 0; draw(); }
      timer = setInterval(() => {
        if (index >= steps.length - 1) { stop(); draw(); return; }
        index += 1; draw();
      }, 4200);
      draw();
    };
    function draw() {
      const step = steps[index];
      const focus = new Set(step.focus.length ? step.focus : actors.map((a) => a.id));
      for (const card of map.querySelectorAll('.lk-xactor')) card.dataset.focus = focus.has(card.dataset.actor) ? '1' : '0';
      map.dataset.focusing = '1';
      stepButtons.forEach((b, i) => {
        b.setAttribute('aria-current', String(i === index));
        b.dataset.state = i === index ? 'current' : i < index ? 'done' : 'next';
      });
      details.replaceChildren();
      details.append(el('p', `Paso ${index + 1} de ${steps.length}`, { class: 'lk-xcount' }));
      details.append(el('h4', step.title, { class: 'lk-xtitle' }));
      if (step.subtitle) details.append(el('p', step.subtitle, { class: 'lk-xsub' }));
      if (step.details && step.details.text) {
        const p = el('p', undefined, { class: 'lk-xtext' });
        p.append(inline(step.details.text));
        details.append(p);
      }
      const pairs = (step.details && step.details.rows) || [];
      if (pairs.length) {
        const dl = el('dl', undefined, { class: 'lk-xrows' });
        for (const [k, v] of pairs) {
          const row = el('div', undefined, { class: 'lk-xrow' });
          row.append(el('dt', k), el('dd', v));
          dl.append(row);
        }
        details.append(dl);
      }
      logRows.forEach((row, i) => { row.hidden = i > index; row.dataset.state = i === index ? 'current' : 'done'; });
      seq.querySelectorAll('.lk-xseqrow').forEach((row, i) => { row.dataset.state = i === index ? 'current' : i < index ? 'done' : 'next'; });
      seqLabels.forEach((label, i) => { label.dataset.state = i === index ? 'current' : i < index ? 'done' : 'next'; });
      seqOverlay.querySelectorAll('.lk-xseqarrow').forEach((path, i) => { path.dataset.state = i === index ? 'current' : i < index ? 'done' : 'next'; });
      travel.textContent = step.travels ? step.travels.label || '' : '';
      travel.dataset.tone = explorerTone(step.travels);
      travel.hidden = !step.travels || !step.travels.label;
      map.hidden = view !== 'map';
      seq.hidden = view !== 'sequence';
      if (viewButton) {
        viewButton.textContent = view === 'map' ? 'Secuencia' : 'Mapa';
        viewButton.setAttribute('aria-pressed', String(view === 'sequence'));
      }
      root.dataset.step = String(index + 1);
      count.textContent = `${index + 1} / ${steps.length}`;
      prev.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      play.textContent = timer ? '❚❚ Pausa' : index === steps.length - 1 ? '↺ Repetir' : '▶ Reproducir';
      play.setAttribute('aria-pressed', String(Boolean(timer)));
      placeExplorer(root);
    }
    root.xsteps = steps;
    host.classList.add('lk-piece-host', 'lk-explorer-host');
    if (spec.title) host.append(el('strong', spec.title, { class: 'lk-title' }));
    host.append(root);
    if (spec.caption) host.append(el('p', spec.caption, { class: 'lk-piece-caption' }));
    host.tabIndex = 0;
    host.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); stop(); go(index + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); stop(); go(index - 1); }
    });
    // La lista se pliega sola en una columna estrecha y se abre en una ancha: el
    // lector de un teléfono ya tiene el paso en el panel de detalles.
    const fitList = () => { list.open = root.getBoundingClientRect().width >= 640; };
    if (window.ResizeObserver) new ResizeObserver(fitList).observe(root);
    fitList();
    watchPiece(host);
    draw();
  }

  // La medida del explorador: los enlaces salen del borde de un actor y llegan al
  // borde del otro; lo que viaja se pone en la franja vacía que el mapa le deja
  // (encima de su fila, o entre las dos filas) y la flecha se corta donde está la
  // etiqueta, para que ninguna palabra quede debajo de un trazo.
  function placeExplorer(root) {
    const map = root.querySelector('.lk-xmap');
    if (!map) return;
    const f = (n) => n.toFixed(1);
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    const rectAt = (box) => (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2, right: r.right - box.left, bottom: r.bottom - box.top };
    };
    if (!map.hidden) {
      const box = map.getBoundingClientRect();
      if (box.width) {
        const at = rectAt(box);
        const svg = map.querySelector('svg.lk-xlinks');
        svg.setAttribute('width', f(box.width));
        svg.setAttribute('height', f(box.height));
        svg.setAttribute('viewBox', `0 0 ${f(box.width)} ${f(box.height)}`);
        const cards = new Map([...map.querySelectorAll('.lk-xactor')].map((node) => [node.dataset.actor, at(node)]));
        // El borde de una caja por donde sale la recta que va al centro de la otra.
        const border = (r, sx, sy) => {
          const tx = sx ? r.w / 2 / Math.abs(sx) : Infinity;
          const ty = sy ? r.h / 2 / Math.abs(sy) : Infinity;
          const t = Math.min(tx, ty);
          return { x: r.cx + sx * t, y: r.cy + sy * t };
        };
        const pair = (a, b) => {
          const dx = b.cx - a.cx, dy = b.cy - a.cy;
          return [border(a, dx, dy), border(b, -dx, -dy)];
        };
        const all = [...cards.values()];
        // Los actores apilados (el teléfono) no tienen franja a los lados de la columna. Cada
        // enlace baja por una cuneta a la derecha de las tarjetas, fuera de ellas: el enlace entre
        // actores más cercanos va por el carril de dentro, y el más largo por el de fuera. Cada
        // tarjeta reparte sus puntos de salida entre sus enlaces, y se prueban las órdenes de esos
        // puntos para quedarse con la que no hace cruzar ninguna recta. Lo que viaja baja por la
        // cuneta de la izquierda: nunca se mezcla con los enlaces.
        const stackedLinkRoutes = (paths, cardsById, { right, edge, step }) => {
          const order = [...cardsById.keys()].sort((p, q) => cardsById.get(p).cy - cardsById.get(q).cy);
          const rank = (id) => order.indexOf(id);
          const lanes = paths.map((p, i) => ({ p, i, span: Math.abs(rank(p.dataset.from) - rank(p.dataset.to)) })).sort((x, y) => x.span - y.span || x.i - y.i);
          const laneX = new Map(lanes.map((item, k) => [item.p, right + edge + step * k]));
          const onCard = new Map();
          for (const p of paths) for (const id of [p.dataset.from, p.dataset.to]) onCard.set(id, [...(onCard.get(id) || []), p]);
          const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));
          // Las órdenes posibles de cada tarjeta, la original primero. Si son demasiadas, solo la original.
          let orders = [new Map()];
          for (const [id, list] of onCard) {
            const options = perms(list);
            const next = orders.length * options.length <= 720 ? options : [list];
            orders = orders.flatMap((o) => next.map((opt) => new Map([...o, [id, opt]])));
          }
          const yAt = (ord, id, p) => { const c = cardsById.get(id), list = ord.get(id); return c.y + (c.h * (list.indexOf(p) + 1)) / (list.length + 1); };
          const hits = (s, t) => Math.max(Math.min(s.x1, s.x2), Math.min(t.x1, t.x2)) <= Math.min(Math.max(s.x1, s.x2), Math.max(t.x1, t.x2)) + 0.5
            && Math.max(Math.min(s.y1, s.y2), Math.min(t.y1, t.y2)) <= Math.min(Math.max(s.y1, s.y2), Math.max(t.y1, t.y2)) + 0.5;
          const segments = (ord, p) => {
            const x = laneX.get(p), ya = yAt(ord, p.dataset.from, p), yb = yAt(ord, p.dataset.to, p);
            return [{ x1: right, y1: ya, x2: x, y2: ya }, { x1: x, y1: ya, x2: x, y2: yb }, { x1: x, y1: yb, x2: right, y2: yb }];
          };
          const crossings = (ord) => {
            const S = paths.map((p) => segments(ord, p));
            let n = 0;
            for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) for (const s of S[i]) for (const t of S[j]) if (hits(s, t)) n++;
            return n;
          };
          let best = orders[0], fewest = Infinity;
          for (const ord of orders) { const n = crossings(ord); if (n < fewest) { best = ord; fewest = n; } if (!n) break; }
          return new Map(paths.map((p) => {
            const x = laneX.get(p), ya = yAt(best, p.dataset.from, p), yb = yAt(best, p.dataset.to, p);
            return [p, `M ${f(right)} ${f(ya)} H ${f(x)} V ${f(yb)} H ${f(right)}`];
          }));
        };
        const stacked = all.every((c) => Math.abs(c.cx - all[0].cx) < 2);
        const stackedRoutes = stacked ? stackedLinkRoutes([...svg.querySelectorAll('path[data-link]')].filter((p) => cards.has(p.dataset.from) && cards.has(p.dataset.to)), cards, { right: all[0].right, edge: 12, step: 6 }) : null;
        for (const path of svg.querySelectorAll('path[data-link]')) {
          const a = cards.get(path.dataset.from), b = cards.get(path.dataset.to);
          if (!a || !b) continue;
          if (stacked) {
            path.setAttribute('d', stackedRoutes.get(path));
            continue;
          }
          const [p, q] = pair(a, b);
          path.setAttribute('d', `M ${f(p.x)} ${f(p.y)} L ${f(q.x)} ${f(q.y)}`);
        }
        const travel = map.querySelector('.lk-xtravel');
        const flow = svg.querySelector('path[data-travel]');
        const tail = svg.querySelector('path[data-travel-to]');
        const clear = (path) => { path.setAttribute('d', ''); path.removeAttribute('data-from'); path.removeAttribute('data-to'); path.removeAttribute('marker-end'); };
        const step = root.xsteps ? root.xsteps[Number(root.dataset.step) - 1] : null;
        const tr = step && step.travels;
        if (!tr || travel.hidden || !cards.has(tr.from) || !cards.has(tr.to)) { clear(flow); clear(tail); return; }
        const a = cards.get(tr.from), b = cards.get(tr.to);
        const tone = explorerTone(tr);
        const marker = `url(#lk-xm-${explorerCount}-${tone})`;
        travel.style.left = '0px';
        travel.style.top = '0px';
        const chip = travel.getBoundingClientRect();
        const w = chip.width, h = chip.height;
        // La franja vacía del mapa: encima de la fila del actor, o entre las dos filas.
        const laneAbove = (r) => {
          const same = all.filter((c) => Math.abs(c.cy - r.cy) < r.h / 2);
          const top = Math.min(...same.map((c) => c.y));
          const above = all.filter((c) => c.bottom <= top + 1);
          const floor = above.length ? Math.max(...above.map((c) => c.bottom)) : 0;
          return (floor + top) / 2;
        };
        const place = (cx, cy) => {
          travel.style.left = `${f(cx - w / 2)}px`;
          travel.style.top = `${f(cy - h / 2)}px`;
        };
        const single = (path, from, to, d) => {
          path.setAttribute('data-from', from);
          path.setAttribute('data-to', to);
          path.setAttribute('marker-end', marker);
          path.dataset.tone = tone;
          path.setAttribute('d', d);
        };
        const part = (path, from, to, d) => {
          if (from) path.setAttribute('data-from', from); else path.removeAttribute('data-from');
          if (to) path.setAttribute('data-to', to); else path.removeAttribute('data-to');
          path.setAttribute('marker-end', marker);
          path.dataset.tone = tone;
          path.setAttribute('d', d);
        };
        // La franja vacía que sigue a un actor por abajo: ahí cabe una etiqueta aunque
        // entre los dos actores haya otros.
        const gapBelow = (r) => {
          const next = all.filter((c) => c.y > r.bottom + 1).map((c) => c.y);
          return (r.bottom + (next.length ? Math.min(...next) : box.height)) / 2;
        };
        if (tr.from === tr.to) {
          // El paso ocurre dentro de un actor: la etiqueta va en la franja de arriba y
          // una guía corta baja hasta su borde.
          const cy = laneAbove(a);
          const cx = clamp(a.cx, w / 2 + 2, box.width - w / 2 - 2);
          place(cx, cy);
          part(flow, tr.from, null, `M ${f(a.cx)} ${f(a.y)} L ${f(cx)} ${f(cy + h / 2)}`);
          flow.removeAttribute('marker-end');
          clear(tail);
          return;
        }
        const sameRow = Math.abs(a.cy - b.cy) < Math.min(a.h, b.h) / 2;
        if (sameRow) {
          // Dos actores en la misma fila: la etiqueta va encima de la fila y la flecha
          // sube hasta ella y baja al otro actor.
          const cy = laneAbove(a);
          const cx = clamp((a.cx + b.cx) / 2, w / 2 + 2, box.width - w / 2 - 2);
          place(cx, cy);
          const under = cy + h / 2 + 8;
          single(flow, tr.from, tr.to, `M ${f(a.cx)} ${f(a.y)} C ${f(a.cx)} ${f(under)}, ${f(b.cx)} ${f(under)}, ${f(b.cx)} ${f(b.y)}`);
          clear(tail);
          return;
        }
        if (stacked) {
          // Lo que viaja baja por la cuneta de la izquierda, a 12 px de la columna; la etiqueta va
          // centrada en la franja que queda entre las dos tarjetas.
          const lane = all[0].x - 12;
          const cy = gapBelow(a.cy < b.cy ? a : b);
          const cx = clamp(box.width / 2, w / 2 + 2, box.width - w / 2 - 2);
          place(cx, cy);
          single(flow, tr.from, tr.to, `M ${f(a.x)} ${f(a.cy)} H ${f(lane)} V ${f(b.cy)} H ${f(b.x)}`);
          clear(tail);
          return;
        }
        // Uno encima del otro en la rejilla ancha: la etiqueta busca la franja entre las
        // dos filas que no tape una tarjeta ni el trazo de un enlace, y la flecha se corta
        // a su paso cuando la etiqueta cae sobre la línea.
        const [p, q] = pair(a, b);
        const lane = gapBelow(a.cy < b.cy ? a : b);
        const spots = [[(p.x + q.x) / 2, (p.y + q.y) / 2], [a.cx, lane], [b.cx, lane], [(a.cx + b.cx) / 2, lane]];
        const chipRect = (x, y) => ({ left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2 });
        const overRect = (r, o) => Math.min(r.right, o.right) - Math.max(r.left, o.left) > 0 && Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) > 0;
        const overLink = (r) => [...svg.querySelectorAll('path[data-link]')].some((link) => {
          const len = link.getTotalLength ? link.getTotalLength() : 0;
          for (let i = 0; i <= 24 && len; i++) {
            const pt = link.getPointAtLength((len * i) / 24);
            if (pt.x > r.left && pt.x < r.right && pt.y > r.top && pt.y < r.bottom) return true;
          }
          return false;
        });
        let spot = null;
        for (const [sx, sy] of spots) {
          const x = clamp(sx, w / 2 + 2, box.width - w / 2 - 2);
          const y = clamp(sy, h / 2 + 2, box.height - h / 2 - 2);
          const r = chipRect(x, y);
          spot = spot || { x, y };
          if (all.some((c) => overRect(r, c)) || overLink(r)) continue;
          spot = { x, y };
          break;
        }
        const cx = spot.x, cy = spot.y;
        place(cx, cy);
        const dx = q.x - p.x, dy = q.y - p.y;
        // Liang–Barsky: el tramo de la recta que queda dentro de la etiqueta.
        let lo = 0, hi = 1;
        for (const [dir, start, min, max] of [[dx, p.x, cx - w / 2, cx + w / 2], [dy, p.y, cy - h / 2, cy + h / 2]]) {
          if (Math.abs(dir) < 1e-6) { if (start < min || start > max) { lo = hi; } continue; }
          const t0 = (min - start) / dir, t1 = (max - start) / dir;
          lo = Math.max(lo, Math.min(t0, t1));
          hi = Math.min(hi, Math.max(t0, t1));
        }
        if (hi - lo > 0.02) {
          const enter = { x: p.x + dx * lo, y: p.y + dy * lo };
          const exit = { x: p.x + dx * hi, y: p.y + dy * hi };
          part(flow, tr.from, null, `M ${f(p.x)} ${f(p.y)} L ${f(enter.x)} ${f(enter.y)}`);
          flow.removeAttribute('marker-end');
          part(tail, null, tr.to, `M ${f(exit.x)} ${f(exit.y)} L ${f(q.x)} ${f(q.y)}`);
          return;
        }
        single(flow, tr.from, tr.to, `M ${f(p.x)} ${f(p.y)} L ${f(q.x)} ${f(q.y)}`);
        clear(tail);
        return;
      }
    }
    // La secuencia: las vidas se colocan bajo su nombre y cada paso es una flecha de
    // una vida a la otra, con lo que viaja escrito encima.
    const seq = root.querySelector('.lk-xseq');
    const seqRows = root.querySelector('.lk-xseqrows');
    if (!seq || !seqRows || seq.hidden) return;
    const box = seqRows.getBoundingClientRect();
    if (!box.width) return;
    const at = rectAt(box);
    const head = [...root.querySelectorAll('.lk-xseqname')].map((node) => at(node));
    const lives = new Map([...seqRows.querySelectorAll('.lk-xlife')].map((node, i) => [node.dataset.life, { node, x: head[i] ? head[i].cx : 0 }]));
    for (const life of lives.values()) {
      life.node.style.left = `${f(life.x)}px`;
      life.node.style.top = '0px';
      life.node.style.bottom = '0px';
    }
    const svg = seqRows.querySelector('.lk-xseqlinks');
    if (svg) {
      svg.setAttribute('width', f(box.width));
      svg.setAttribute('height', f(box.height));
      svg.setAttribute('viewBox', `0 0 ${f(box.width)} ${f(box.height)}`);
      for (const path of svg.querySelectorAll('path[data-seq]')) {
        const row = seqRows.querySelector(`.lk-xseqrow[data-seq="${path.dataset.seq}"]`);
        const label = seqRows.querySelectorAll('.lk-xseqmsg')[Number(path.dataset.seq) - 1];
        if (!row) continue;
        const r = at(row);
        const from = lives.get(String(path.dataset.from).replace(/^life-/, ''));
        const to = lives.get(String(path.dataset.to || '').replace(/^life-/, ''));
        if (!from) continue;
        const y = r.cy;
        if (!to || to === from) {
          path.setAttribute('d', `M ${f(from.x)} ${f(y - 9)} C ${f(from.x + 26)} ${f(y - 9)}, ${f(from.x + 26)} ${f(y + 9)}, ${f(from.x)} ${f(y + 9)}`);
        } else {
          path.setAttribute('d', `M ${f(from.x)} ${f(y)} L ${f(to.x)} ${f(y)}`);
        }
        const marker = `url(#lk-xm-${explorerCount}-${path.dataset.tone || 'slate'})`;
        path.setAttribute('marker-end', marker);
        if (label && !label.hidden) {
          const lb = label.getBoundingClientRect();
          const mid = to && to !== from ? (from.x + to.x) / 2 : from.x + 26;
          label.style.left = `${f(clamp(mid - lb.width / 2, 2, box.width - lb.width - 2))}px`;
          label.style.top = `${f(y - lb.height - 6)}px`;
        }
      }
    }
  }
  // #261: un árbol de frecuencias. Cada grupo es una persona (su personaje, con `kind`), cada
  // rama lleva su cuenta y su porcentaje sobre el grupo de arriba, y las hojas que cuentan
  // van destacadas. El diseño es fijo: los grupos van por niveles, las hojas en orden y cada
  // padre centrado sobre sus dos ramas, así el rótulo de una rama cae encima de su trazo
  // horizontal, entre los dos trazos de su nivel. Dos ramas por grupo, o ninguna.
  const TREE = { leaf: 90, nodeW: 84, rootW: 132, h: 74, top: 6, gap: 64, drop: 40, icon: 30 };
  function treePiece(spec) {
    const S = window.LKScene;
    const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
    const links = Array.isArray(spec.links) ? spec.links : [];
    if (nodes.length < 2) throw new Error('Un árbol necesita al menos dos grupos');
    const byId = new Map(nodes.map((n) => [String(n.id), n]));
    const children = new Map([...byId.keys()].map((id) => [id, []]));
    const parent = new Map();
    for (const link of links) {
      const from = String(link.from), to = String(link.to);
      if (!byId.has(from) || !byId.has(to)) throw new Error(`La rama «${from} → ${to}» nombra un grupo que el árbol no tiene`);
      if (parent.has(to)) throw new Error(`El grupo «${to}» cuelga de dos ramas: cada grupo tiene una sola rama hacia él`);
      children.get(from).push(to);
      parent.set(to, from);
    }
    for (const [id, kids] of children) {
      if (kids.length === 1 || kids.length > 2) throw new Error(`El grupo «${id}» tiene ${kids.length} ramas: cada grupo se divide en dos ramas, o no se divide`);
    }
    const roots = [...byId.keys()].filter((id) => !parent.has(id));
    if (roots.length !== 1) throw new Error('El árbol tiene un solo grupo de arriba: el que no cuelga de ninguna rama');
    const depth = new Map();
    const visit = (id, level) => {
      if (depth.has(id)) throw new Error(`El grupo «${id}» se repite: un árbol no tiene ciclos`);
      depth.set(id, level);
      for (const kid of children.get(id)) visit(kid, level + 1);
    };
    visit(roots[0], 0);
    if (depth.size !== nodes.length) throw new Error('Hay grupos que no cuelgan del de arriba');
    const leaves = [];
    const collect = (id) => (children.get(id).length ? children.get(id).forEach(collect) : leaves.push(id));
    collect(roots[0]);
    const width = Math.max(360, leaves.length * TREE.leaf);
    const left = (width - leaves.length * TREE.leaf) / 2;
    const x = new Map(leaves.map((id, i) => [id, left + TREE.leaf / 2 + i * TREE.leaf]));
    const center = (id) => {
      if (!x.has(id)) x.set(id, children.get(id).map((kid) => center(kid)).reduce((a, b) => a + b, 0) / children.get(id).length);
      return x.get(id);
    };
    center(roots[0]);
    const rows = Math.max(...depth.values()) + 1;
    const height = TREE.top + rows * TREE.h + (rows - 1) * TREE.gap + 8;
    const top = (id) => TREE.top + depth.get(id) * (TREE.h + TREE.gap);
    const boxW = (id) => (depth.get(id) === 0 ? TREE.rootW : TREE.nodeW);
    const svg = svgPart('svg', { class: 'lk-tsvg', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': spec.title || 'Árbol de frecuencias' });
    const branches = svgPart('g', { class: 'lk-tbranches' });
    for (const link of links) {
      const from = String(link.from), to = String(link.to);
      const px = x.get(from), cx = x.get(to);
      const bottom = top(from) + TREE.h, joint = bottom + TREE.drop;
      const tone = toneOf(link.tone || byId.get(to).tone);
      branches.append(svgPart('path', { class: 'lk-tlink', 'data-from': from, 'data-to': to, 'data-tone': tone, d: `M ${px} ${bottom} V ${joint} H ${cx} V ${top(to)}` }));
      const mid = (px + cx) / 2;
      const label = svgPart('g', { class: 'lk-tbranch', 'data-branch': `${from}→${to}`, 'data-tone': tone });
      label.append(svgPart('text', { class: 'lk-tcount', x: mid, y: bottom + 20, 'text-anchor': 'middle' }, String(link.count)));
      label.append(svgPart('text', { class: 'lk-trate', x: mid, y: bottom + 35, 'text-anchor': 'middle' }, String(link.rate)));
      branches.append(label);
    }
    const groups = svgPart('g', { class: 'lk-tnodes' });
    for (const node of nodes) {
      const id = String(node.id), w = boxW(id), cx = x.get(id), t = top(id);
      const g = svgPart('g', { class: 'lk-tnode', 'data-node': id, 'data-highlight': node.highlight ? '1' : '0', 'data-tone': toneOf(node.tone) });
      g.append(svgPart('rect', { class: 'lk-tbox', 'data-anchor': id, x: cx - w / 2, y: t, width: w, height: TREE.h, rx: 10 }));
      const glyph = svgPart('g', { class: 'lk-tglyph' });
      // El dibujo del personaje sale de `S.icon` como marcado SVG: se lee como SVG y se
      // añaden sus nodos, sin pasarlo por innerHTML.
      const drawn = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${S.icon(node.kind || 'user', cx, t + 22, TREE.icon, { stroke: 'currentColor', fill: 'none' })}</svg>`, 'image/svg+xml');
      glyph.append(...drawn.documentElement.childNodes);
      g.append(glyph);
      const lines = Array.isArray(node.lines) ? node.lines : [node.label ?? id];
      lines.forEach((line, k) => g.append(svgPart('text', { class: 'lk-tname', x: cx, y: t + 50 + k * 16, 'text-anchor': 'middle' }, String(line))));
      groups.append(g);
    }
    svg.append(branches, groups);
    const root = el('div', undefined, { class: 'lk-p lk-tree', 'data-piece': 'tree' });
    root.append(svg);
    return root;
  }
  const PIECES = { cards: cardsPiece, memory: memoryPiece, tables: tablesPiece, venn: vennPiece, tree: treePiece };
  // Un paso de un recorrido dibuja una pieza en vez de una escena: la que su
  // `stage` nombra. Lo que el recorrido declara a su nivel (`spec.venn`, por
  // ejemplo, con los conjuntos) se hereda en cada paso, así un paso escribe solo lo
  // que cambia.
  function stagePiece(step, story) {
    const stage = step.stage || {};
    const kind = Object.keys(PIECES).find((k) => stage[k]);
    return kind ? { kind, spec: { ...(story[kind] || {}), ...stage[kind] } } : null;
  }
  define('lk-explorer', function () { explorerPiece(this); });
  for (const [kind, label] of [['cards', 'Las tarjetas'], ['memory', 'El diagrama de memoria'], ['tables', 'Las tablas'], ['venn', 'El diagrama de conjuntos'], ['tree', 'El árbol de frecuencias']]) {
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
    if (piece.dataset.piece === 'tables') {
      piece.querySelectorAll('.lk-tjoin').forEach(placeTables);
      piece.querySelectorAll('.lk-tscroll').forEach(markFrame);
    }
    if (piece.dataset.piece === 'explorer') placeExplorer(piece);
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
    // La cabecera se lee entera a cualquier ancho (#243): se escala hasta el suelo
    // de lectura y, si aun así no cabe, se parte por tokens —cada token es una
    // pieza entera—. Nunca se corta ni se desliza fuera de la vista: en el teléfono
    // el alumno veía «ntas SET saldo = saldo + 5…», sin principio ni final.
    const HEADER_FLOOR = 14;
    function fitHeader(line) {
      if (!line) return;
      line.removeAttribute('data-wrap');
      line.style.removeProperty('font-size');
      let size = parseFloat(getComputedStyle(line).fontSize) || 22;
      for (let i = 0; i < 8; i++) {
        if (line.scrollWidth <= line.clientWidth + 1) break;
        const next = Math.max(HEADER_FLOOR, size * (line.clientWidth / Math.max(1, line.scrollWidth)) * 0.98);
        if (next >= size - 0.5) { size = HEADER_FLOOR; line.style.fontSize = `${HEADER_FLOOR}px`; break; }
        size = next;
        line.style.fontSize = `${size.toFixed(2)}px`;
      }
      // Por debajo del suelo de lectura la línea se parte por tokens: el resaltado
      // queda entero y visible, y la cabecera crece en alto en vez de recortarse.
      if (line.scrollWidth > line.clientWidth + 1) line.dataset.wrap = '1';
      line.scrollLeft = 0;
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
        fitHeader(line);
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
    // La cabecera se vuelve a medir cuando cambia el ancho o terminan de cargar las
    // fuentes: el ajuste depende de las métricas reales del lector, no de una
    // estimación por número de caracteres (#243).
    const refitHeader = () => fitHeader(head.querySelector('.lk-story-formula'));
    document.fonts?.ready.then(refitHeader).catch(() => {});
    if (window.ResizeObserver) {
      let lastWidth = 0;
      new ResizeObserver(() => {
        const line = head.querySelector('.lk-story-formula');
        if (!line || line.clientWidth === lastWidth) return;
        lastWidth = line.clientWidth;
        fitHeader(line);
      }).observe(this);
    }
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
