/* Shared dictation and optional reasoning field for every quiz. */
(() => {
  window.learningDictate = function dictate(area, button, note, config) {
    if (config?.transcribeUrl && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
      let recorder, stream, pending = null;
      const resting = (text, retry = null) => {
        pending = retry;
        button.disabled = false;
        button.textContent = retry ? 'Reenviar audio' : 'Dictar';
        button.dataset.state = '';
        note.textContent = text;
      };
      // A failed upload keeps its recording so it can be sent again; an expired page cannot
      // take it (its address is gone), so it asks for a reload instead of saying «not found».
      const send = async (blob) => {
        button.disabled = true;
        button.textContent = 'Transcribiendo…';
        try {
          const response = await fetch(config.transcribeUrl, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
          const data = await response.json().catch(() => ({}));
          if (response.status === 404) return resting('Esta página caducó porque el Estudio se actualizó: recárgala para volver a dictar.');
          if (!response.ok) return resting(data.error || 'No se pudo transcribir el audio.', blob);
          area.value = [area.value.trim(), String(data.text ?? '').trim()].filter(Boolean).join(' ');
          resting('');
        } catch {
          resting('No se pudo enviar el audio; revisa la conexión y reenvíalo.', blob);
        }
      };
      button.addEventListener('click', async () => {
        if (recorder?.state === 'recording') { recorder.stop(); return; }
        if (pending) { send(pending); return; }
        button.disabled = true;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          recorder = new MediaRecorder(stream);
          const chunks = [];
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const blob = new Blob(chunks, { type: recorder.mimeType });
            recorder = null;
            send(blob);
          };
          recorder.start();
          button.textContent = 'Detener';
          button.dataset.state = 'listening';
          note.textContent = 'Escuchando: habla con calma.';
          button.disabled = false;
        } catch (error) {
          stream?.getTracks().forEach(track => track.stop());
          button.disabled = false;
          button.textContent = 'Dictar';
          note.textContent = error.name === 'NotAllowedError' ? 'Permiso de micrófono denegado.' : !window.isSecureContext ? 'El dictado necesita abrir el Estudio por HTTPS.' : error.message;
        }
      });
      return;
    }
    if (config?.transcribeUrl && !window.isSecureContext) {
      note.textContent = 'El dictado necesita abrir el Estudio por HTTPS.';
    }
    const Engine = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Engine) {
      button.hidden = true;
      note.textContent = 'Este navegador no dicta; escribe con el teclado.';
      return;
    }
    let recognition = null, base = '';
    const resting = (text = '') => {
      note.textContent = text;
      button.dataset.state = '';
      button.textContent = 'Dictar';
      recognition = null;
    };
    button.addEventListener('click', () => {
      if (recognition) { recognition.stop(); return; }
      base = area.value.trim();
      recognition = new Engine();
      recognition.lang = 'es-ES';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) base = [base, result[0].transcript.trim()].filter(Boolean).join(' ');
          else interim += result[0].transcript;
        }
        area.value = [base, interim.trim()].filter(Boolean).join(' ');
      };
      recognition.onerror = (event) => resting(event.error === 'not-allowed' ? 'Permiso de micrófono denegado.' : `No se pudo dictar (${event.error}).`);
      recognition.onend = () => resting();
      try {
        recognition.start();
        button.dataset.state = 'listening';
        button.textContent = 'Detener';
        note.textContent = 'Escuchando: habla con calma.';
      } catch (error) { resting(error.message); }
    });
  };
  window.learningThoughtField = function (id, index, config) {
    const el = (tag, text, attrs = {}) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };
    const wrap = el('div', undefined, { class: 'lk-thought' });
    const area = el('textarea', undefined, { id: `${id}-razonamiento`, name: `${id}-razonamiento`, rows: '4', placeholder: 'Opcional: qué te pide la pregunta, por qué eliges esa opción, qué te hace dudar…' });
    const bar = el('div', undefined, { class: 'lk-thought-bar' });
    const mic = el('button', 'Dictar', { type: 'button', class: 'lk-mic', 'aria-label': `Dictar el razonamiento de la pregunta ${index + 1}` });
    const note = el('span', '', { class: 'lk-mic-note', 'aria-live': 'polite' });
    bar.append(mic, note);
    wrap.append(
      el('label', 'Cómo lo pensé (opcional)', { class: 'lk-thought-label', for: `${id}-razonamiento` }),
      el('span', 'Si me lo cuentas, el tutor ve cómo razono y me corrige mejor; si lo dejas vacío, el quiz sigue valiendo.', { class: 'lk-thought-hint' }),
      area, bar,
    );
    window.learningDictate(area, mic, note, config);
    return wrap;
  };
})();
