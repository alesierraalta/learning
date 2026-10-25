(() => {
  'use strict';
  const base = JSON.parse(document.getElementById('studio-data').textContent).base;
  const root = document.getElementById('studio');
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, action, cls = '') => {
    const node = el('button', cls, text);
    node.type = 'button';
    node.addEventListener('click', () => Promise.resolve().then(action).catch(report));
    return node;
  };
  const sidebar = el('aside', 'library');
  sidebar.setAttribute('aria-label', 'Biblioteca');
  const viewer = el('section', 'viewer');
  viewer.setAttribute('aria-label', 'Contenido');
  const tutor = el('details', 'tutor');
  tutor.open = !window.matchMedia('(max-width: 800px)').matches;
  tutor.append(el('summary', 'panel-title', 'Tutor'));
  const connection = el('div', 'connection muted', 'Conectando…');
  connection.setAttribute('role', 'status');
  const stateLine = el('div', 'state muted');
  const transcript = el('div', 'transcript');
  transcript.setAttribute('aria-label', 'Conversación');
  const composer = el('form', 'composer');
  const input = el('textarea');
  input.placeholder = 'Escribe al tutor…';
  input.setAttribute('aria-label', 'Mensaje al tutor');
  input.rows = 3;
  const send = el('button', 'primary', 'Enviar');
  send.type = 'submit';
  composer.append(input, send);
  composer.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    try {
      await post('prompt', { text });
      if (input.value.trim() === text) input.value = '';
    } catch (error) { report(error); }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  const controls = el('div', 'controls');
  controls.append(button('Detener', () => post('abort', {})), button('Nueva conversación', () => {
    if (window.confirm('¿Iniciar una nueva conversación?')) return post('new-session', {});
  }));
  const tutorBody = el('div', 'tutor-body');
  tutorBody.append(connection, stateLine, transcript, composer, controls);
  tutor.append(tutorBody);
  root.append(sidebar, viewer, tutor);
  function line(text, cls = 'muted') {
    const node = el('div', `message ${cls}`, text);
    transcript.append(node);
    transcript.scrollTop = transcript.scrollHeight;
    return node;
  }
  function report(error) { line(error.message || String(error), 'error'); }
  async function request(path, options) {
    const response = await fetch(base + path, options);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `Error HTTP ${response.status}`);
    return data;
  }
  function post(path, body) {
    return request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  function markdown(node, text) {
    node.replaceChildren(DOMPurify.sanitize(marked.parse(text), { RETURN_DOM_FRAGMENT: true }));
  }
  const assistants = new Map();
  const tools = new Map();
  const dialogs = new Map();
  let selected = null;
  let viewing = false;
  let viewRequest = 0;
  function progress(topic) {
    const written = topic.parts.filter(part => part.written).length;
    return `${topic.part ? `Parte ${topic.part} de ${topic.parts.length} · ` : ''}${topic.stage || topic.nextStage || topic.status || 'Sin iniciar'} · ${written} ${written === 1 ? 'parte escrita' : 'partes escritas'}`;
  }
  function overview(topic) {
    selected = topic;
    viewing = false;
    viewRequest++;
    viewer.replaceChildren(el('div', 'kicker', 'Universidad'), el('h1', '', topic.title), el('p', 'muted', progress(topic)));
    const list = el('ul', 'parts');
    for (const part of topic.parts) {
      const item = el('li');
      if (part.written) {
        item.append(button(part.title, () => openView(topic, part.id)));
        if (part.hasApp) item.append(button('▶ Aplicación interactiva', () => openView(topic, part.id, true), 'primary'));
      } else item.append(el('span', 'muted', `${part.title} · pendiente`));
      list.append(item);
    }
    if (topic.hasDiagnosis) {
      const item = el('li');
      item.append(button('Diagnóstico', () => openView(topic, 'quiz')));
      list.append(item);
    }
    const actions = el('div', 'topic-actions');
    for (const [label, text] of [
      ['Seguir donde lo dejé', `Sigamos con ${topic.title} (carpeta ${topic.id}).`],
      ['Pedir la siguiente parte', `Escribe la siguiente parte de ${topic.title} (carpeta ${topic.id}).`],
      ['Repasar mis lagunas', `Repasa mis lagunas de ${topic.title} (carpeta ${topic.id}).`]
    ]) actions.append(button(label, () => post('prompt', { text })));
    viewer.append(list, actions);
  }
  async function openView(topic, part, app = false) {
    const version = ++viewRequest;
    const query = new URLSearchParams({ topic: topic.id });
    if (part !== undefined) query.set('part', part);
    const data = await request(`api/view?${query}`);
    if (version !== viewRequest) return;
    const url = app ? data.appUrl : data.url;
    if (!url) throw new Error('La aplicación interactiva no está disponible.');
    selected = topic;
    viewing = true;
    const frame = el('iframe', 'content-frame');
    frame.title = app ? `Aplicación interactiva: ${topic.title}` : topic.title;
    frame.src = url;
    viewer.replaceChildren(button('← Volver al resumen', () => topic.parts ? overview(topic) : welcome()), frame);
  }
  function welcome() {
    selected = null;
    viewing = false;
    viewRequest++;
    viewer.replaceChildren(el('div', 'kicker', 'Learning Studio'), el('h1', '', 'Un espacio para aprender'), el('p', 'muted', 'Elige un contenido de la biblioteca o comienza un tema nuevo.'));
  }
  function newTopic() {
    welcome();
    const form = el('form', 'new-topic');
    const label = el('label', '', '¿Qué quieres aprender?');
    const field = el('input');
    field.type = 'text';
    field.required = true;
    label.append(field);
    const submit = el('button', 'primary', 'Comenzar');
    submit.type = 'submit';
    form.append(label, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = field.value.trim();
      if (!text) return;
      try { await post('prompt', { text: `Quiero aprender ${text}.` }); field.value = ''; }
      catch (error) { report(error); }
    });
    viewer.replaceChildren(el('div', 'kicker', 'Nuevo tema'), el('h1', '', 'Aprender algo nuevo'), form);
    field.focus();
  }
  let libraryVersion = 0;
  async function loadLibrary() {
    const version = ++libraryVersion;
    const library = await request('api/library');
    if (version !== libraryVersion) return;
    sidebar.replaceChildren(el('div', 'kicker', 'Learning Studio'), el('h2', '', 'Biblioteca'), button('+ Aprender algo nuevo', newTopic, 'primary'), el('h3', '', 'Universidad'));
    for (const topic of library.topics) {
      const entry = button('', () => overview(topic), 'library-entry');
      entry.append(el('strong', '', topic.title), el('span', 'muted', progress(topic)));
      sidebar.append(entry);
    }
    if (!library.topics.length) sidebar.append(el('p', 'muted', 'Todavía no hay temas.'));
    sidebar.append(el('h3', '', 'Rápidos'));
    for (const note of library.quick) sidebar.append(button(note.title, () => openView(note), 'library-entry'));
    if (selected && !viewing) {
      const updated = library.topics.find(topic => topic.id === selected.id);
      if (updated) overview(updated);
    }
  }
  function showDialog(data) {
    dialogs.get(data.id)?.remove();
    const card = el('section', 'dialog');
    card.append(el('h3', '', data.title || 'El tutor pregunta'));
    if (data.message) card.append(el('p', '', data.message));
    const answer = body => post('dialog', { id: data.id, ...body });
    if (data.method === 'select') {
      for (const option of data.options || []) card.append(button(option, () => answer({ value: option })));
    } else if (data.method === 'confirm') {
      card.append(button('Sí', () => answer({ confirmed: true })), button('No', () => answer({ confirmed: false })));
    } else {
      const field = el('textarea');
      field.placeholder = data.placeholder || '';
      field.setAttribute('aria-label', data.title || 'Respuesta al tutor');
      card.append(field, button('Enviar', () => answer({ value: field.value })));
    }
    card.append(button('Cancelar', () => answer({ cancelled: true }), 'cancel'));
    dialogs.set(data.id, card);
    transcript.append(card);
    transcript.scrollTop = transcript.scrollHeight;
  }
  const events = new EventSource(base + 'events');
  const on = (name, handler) => events.addEventListener(name, event => {
    try { handler(JSON.parse(event.data)); } catch (error) { report(error); }
  });
  events.onopen = () => { connection.textContent = 'Conectado'; };
  events.onerror = () => { connection.textContent = 'Reconectando…'; };
  on('history', data => {
    transcript.replaceChildren();
    assistants.clear(); tools.clear(); dialogs.clear();
    for (const message of data.messages) {
      const node = line('', message.role === 'user' ? 'user' : 'assistant');
      if (message.role === 'assistant') markdown(node, message.text);
      else node.textContent = message.text;
    }
  });
  on('user', data => line(data.text, 'user'));
  function assistant(data, end) {
    let entry = assistants.get(data.id);
    if (!entry) { entry = { node: line('', 'assistant'), text: '' }; assistants.set(data.id, entry); }
    entry.text = end ? data.text : entry.text + data.delta;
    markdown(entry.node, entry.text);
    transcript.scrollTop = transcript.scrollHeight;
  }
  on('assistant_delta', data => assistant(data, false));
  on('assistant_end', data => assistant(data, true));
  on('tool', data => {
    let node = tools.get(data.id);
    if (!node) { node = line('', 'tool muted'); tools.set(data.id, node); }
    node.classList.toggle('running', data.phase === 'start');
    node.textContent = `${data.phase === 'start' ? '◌' : data.ok ? '✔' : '✘'} ${data.label || data.name || 'Herramienta'}`;
  });
  on('notice', data => line(data.message));
  on('error', data => report(new Error(data.message)));
  on('state', data => {
    stateLine.replaceChildren(el('span', '', !data.alive ? 'El tutor no está activo' : data.busy ? 'El tutor está trabajando… Puedes enviar otro mensaje.' : 'Listo para aprender'));
    if (!data.alive) stateLine.append(button('Reiniciar', () => post('restart', {})));
  });
  on('dialog', showDialog);
  on('dialog_closed', data => { dialogs.get(data.id)?.remove(); dialogs.delete(data.id); });
  on('library_changed', () => { loadLibrary().catch(report); });
  welcome();
  loadLibrary().catch(report);
})();
