(() => {
  "use strict";
  const app = document.getElementById("app");
  const CONFIDENCE = { seguro: "seguro", dudo: "dudo", adivine: "adiviné" };
  // The text column of a 320 px phone: a graphic this narrow is never squeezed.
  const PHONE_COLUMN = 280;
  let data;
  try {
    data = JSON.parse(document.getElementById("view-data").textContent);
  } catch {
    app.textContent = "No se pudieron cargar los datos. Recarga la página.";
    return;
  }
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const link = (text, href) => {
    const node = element("a", text);
    node.href = href;
    return node;
  };
  // Wide reading mode: an opt-in layout for horizontal screens. The default reader
  // keeps one narrow column; this one spreads the prose into two so a monitor is used.
  const WIDE_KEY = "learnings.wide-reading";
  const storedWide = () => {
    try {
      return localStorage.getItem(WIDE_KEY) === "1";
    } catch {
      return false;
    }
  };
  const setWide = (wide, remember = true) => {
    document.body.classList.toggle("wide", wide);
    if (!remember) return;
    try {
      if (wide) localStorage.setItem(WIDE_KEY, "1");
      else localStorage.removeItem(WIDE_KEY);
    } catch {
      // A frame without storage keeps the choice for this page only.
    }
  };
  const readingToggle = () => {
    const button = element("button", undefined, "reading-toggle");
    button.type = "button";
    button.title = "Leer en dos columnas, para pantallas horizontales";
    const mark = element("span", "▭▭", "mark");
    const pressed = () => String(document.body.classList.contains("wide"));
    button.setAttribute("aria-pressed", pressed());
    button.append(mark, element("span", "Modo ancho"));
    button.addEventListener("click", () => {
      setWide(!document.body.classList.contains("wide"));
      button.setAttribute("aria-pressed", pressed());
    });
    app.append(button);
  };
  const renderer = new marked.Renderer();
  const renderCode = renderer.code;
  renderer.code = function (token) {
    if (token.lang?.trim().toLowerCase() === "svg" && /^\s*<svg[\s>][\s\S]*<\/svg>\s*$/i.test(token.text)) {
      return token.text;
    }
    return renderCode.call(this, token);
  };
  const markdown = (text, inline = false) => {
    const node = element(inline ? "span" : "div");
    const math = globalThis.lkMath?.extract(text) ?? { text, blocks: [] };
    // The kit vocabulary written inside a note IS the lesson: walkthrough decks and
    // their JSON payload scripts must survive marked + DOMPurify, then kit.js (loaded
    // in the page head) upgrades them on connect. Diagrams come written as inline
    // SVG or svg fences, which need the svg profile; nothing a note writes may load from outside
    // the document, so image, use and foreignObject stay out.
    const clean = DOMPurify.sanitize(inline ? marked.parseInline(math.text) : marked.parse(math.text, { renderer }), {
      USE_PROFILES: { html: true, svg: true },
      ADD_TAGS: ["video", "audio", "source", "details", "summary", "script",
        "lk-walkthrough", "lk-callout", "lk-quiz", "lk-widget", "lk-diagram", "lk-math", "lk-steps", "lk-ask", "lk-step"],
      ADD_ATTR: ["controls", "preload", "type", "title"],
      FORBID_TAGS: ["foreignObject", "image", "use"],
    });
    // The sanitizer has already spoken; parsing the result in an inert document
    // keeps the page from ever handing note text straight to innerHTML.
    node.append(...new DOMParser().parseFromString(clean, "text/html").body.childNodes);
    // A diagram drawn for a desktop canvas shrinks its words with it on a phone:
    // its box keeps the authored width (the width attribute, else the viewBox)
    // so CSS can hold a legible scale and scroll.
    const insideKit = (svg) => {
      for (let el = svg.parentElement; el && el !== node; el = el.parentElement) if (el.tagName.startsWith("LK-")) return true;
      return false;
    };
    for (const svg of node.querySelectorAll("svg[viewBox]")) {
      const given = svg.getAttribute("width")?.trim() ?? "";
      const width = /^\d+(\.\d+)?(px)?$/.test(given) ? parseFloat(given) : svg.viewBox.baseVal?.width;
      // Nested SVGs and kit components lay themselves out, and a graphic that
      // fits the narrowest phone column (an icon in a sentence) needs no box.
      if (!width || width <= PHONE_COLUMN || svg.parentElement.closest("svg") || insideKit(svg)) continue;
      const box = element("div", undefined, "diagram");
      box.style.setProperty("--diagram-width", `${width}px`);
      svg.replaceWith(box);
      box.append(svg);
    }
    globalThis.lkMath?.render(node, math.blocks);
    return node;
  };
  const status = () => {
    const node = element("p");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    return node;
  };
  const textarea = (parent, title) => {
    const label = element("label", title, "text-field");
    const input = element("textarea");
    input.rows = 3;
    input.maxLength = 8000;
    label.append(input);
    parent.append(label);
    return input;
  };
  const post = async (payload) => {
    const response = await fetch(data.submitUrl, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error((result.error || "No se pudo enviar.") + (response.status === 409 ? " Recarga la página para ver las respuestas guardadas." : ""));
    return result;
  };
  function decorate(root) {
    root.querySelectorAll("blockquote").forEach((quote) => {
      const first = quote.firstElementChild;
      if (!first || first.tagName !== "P") return;
      const match = /^\[!([\w-]+)\]([+-])?[ \t]*([^\n]*)(?:\n|$)/.exec(first.textContent);
      if (!match) return;
      const box = element(match[2] ? "details" : "aside", undefined, "callout");
      box.dataset.type = match[1].toLowerCase();
      if (match[2] === "+") box.open = true;
      box.append(element(match[2] ? "summary" : "div", match[3].trim() || match[1], "callout-title"));
      // Remove the marker without flattening the remaining rich text.
      let remaining = match[0].length;
      const walker = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
      while (remaining > 0 && walker.nextNode()) {
        const text = walker.currentNode;
        const count = Math.min(remaining, text.length);
        text.deleteData(0, count);
        remaining -= count;
      }
      if (!first.textContent.trim()) first.remove();
      box.append(...quote.childNodes);
      quote.replaceWith(box);
    });
    root.querySelectorAll("h2").forEach((heading) => {
      const first = heading.firstChild;
      const match = first?.nodeType === Node.TEXT_NODE && /^(\d+)\.\s+/.exec(first.textContent);
      if (!match) return;
      first.deleteData(0, match[0].length);
      heading.prepend(element("span", `${match[1]}.`, "section-number"));
    });
    root.querySelectorAll("li").forEach((item) => {
      if (/^T\d+\b/.test(item.textContent.trim())) item.classList.add("study-step");
    });
    root.querySelectorAll("p").forEach((paragraph) => {
      if (paragraph.textContent.includes("≠")) paragraph.classList.add("distinction");
      if (/Entrada\s*[➔→]/i.test(paragraph.textContent) && /Salida/i.test(paragraph.textContent)) paragraph.classList.add("ipo-summary");
    });
    root.querySelectorAll("li, h2, h3").forEach((item) => {
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      const match = first && /^(\s*)(T\d+)\b/.exec(first.data);
      if (!match) return;
      first.splitText(match[0].length);
      first.replaceWith(document.createTextNode(match[1]), element("span", match[2], "step-label"));
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const markers = [];
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.parentElement.closest("pre, code") && /◄──\s*(NUEVO|BLOQUEO)/.test(text.data)) markers.push(text);
    }
    markers.forEach((text) => {
      const fragment = document.createDocumentFragment();
      let end = 0;
      for (const match of text.data.matchAll(/◄──\s*(NUEVO|BLOQUEO)/g)) {
        fragment.append(document.createTextNode(text.data.slice(end, match.index)), element("strong", match[0], match[1] === "NUEVO" ? "marker-new" : "marker-block"));
        end = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(text.data.slice(end)));
      text.replaceWith(fragment);
    });
    const nodes = [...root.querySelectorAll("code.language-mermaid")].map((code) => {
      const diagram = element("div", code.textContent, "mermaid");
      code.parentElement.replaceWith(diagram);
      return diagram;
    });
    if (nodes.length) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: {
        fontFamily: '"DejaVu Sans", Arial, sans-serif', fontSize: "18px",
        primaryColor: "#ffffff", primaryTextColor: "#0f172a", primaryBorderColor: "#0f172a",
        lineColor: "#475569", secondaryColor: "#f8fafc", tertiaryColor: "#ffffff",
      } });
      mermaid.run({ nodes }).catch(() => {
        root.append(element("p", "No se pudo dibujar un diagrama.", "error"));
      });
    }
  }
  function showResult(parent, result, question) {
    const line = element("div", undefined, result.ok ? "correct result" : "error result");
    line.append(element("strong", `${result.ok ? "✔ Correcta" : "✘ Incorrecta"} — elegiste ${result.chosen}`));
    if (!result.ok) {
      line.append(element("span", ` · la correcta es ${result.correct}: `), markdown(question.options[result.correct] || "", true));
    }
    parent.append(line);
  }
  function showScore(parent, score, saved) {
    const [points, total] = score.split("/").map(Number);
    const banner = element("div", undefined, "reward");
    banner.append(element("strong", `Puntaje ${score} — ${total ? Math.round(points / total * 100) : 0} %`));
    if (saved) banner.append(element("p", `Enviado al chat de Pi y guardado en ${saved}`));
    parent.append(banner);
  }
  function quiz() {
    if (!data.quiz) return;
    const diagnosis = data.kind === "diagnosis";
    const section = element("section");
    section.append(element("h2", diagnosis ? "Diagnóstico" : "Mini-quiz"));
    const form = element("form");
    form.noValidate = true;
    const recorded = new Map((data.answered || []).map((result) => [result.id, result]));
    const pending = [];
    const groups = new Map();
    for (const [index, question] of data.quiz.questions.entries()) {
      let container = form;
      if (diagnosis) {
        const round = question.round ?? 1;
        if (!groups.has(round)) {
          const group = element("section");
          group.append(element("h3", `Ronda ${round}`));
          groups.set(round, group);
          form.append(group);
        }
        container = groups.get(round);
      }
      const field = element("fieldset", undefined, "quiz-question");
      const legend = element("legend");
      legend.append(markdown(question.enunciado, true));
      field.append(legend);
      if (typeof question.pieza?.contenido === "string") field.append(markdown(question.pieza.contenido));
      const result = recorded.get(question.id);
      const readonly = Boolean(result) || (!diagnosis && Array.isArray(data.answered));
      const choices = [];
      for (const letter of ["A", "B", "C", "D", "E"]) {
        if (!(letter in question.options)) continue;
        const label = element("label", undefined, "option");
        const radio = element("input");
        radio.type = "radio";
        radio.name = `question-${index}`;
        radio.value = letter;
        radio.disabled = readonly;
        radio.checked = result?.chosen === letter;
        label.append(radio, element("strong", letter), markdown(question.options[letter], true));
        field.append(label);
        choices.push(radio);
      }
      if (result) {
        if (result.razonamiento) field.append(element("p", `Cómo lo pensé: ${result.razonamiento}`, "muted"));
        else {
          if (result.entendi) field.append(element("p", `Entendiste: ${result.entendi}`, "muted"));
          if (result.porque) field.append(element("p", `Por qué: ${result.porque}`, "muted"));
        }
        if (CONFIDENCE[result.confianza]) field.append(element("p", `Confianza: ${CONFIDENCE[result.confianza]}`, "muted"));
        showResult(field, result, question);
      }
      if (!readonly) {
        const thought = window.learningThoughtField(`question-${index}`, index, data);
        field.append(thought);
        const razonamiento = thought.querySelector('textarea');
        const confidence = element("div", undefined, "confidence");
        confidence.append(element("span", "¿Qué tan seguro estás?"));
        const sure = Object.entries(CONFIDENCE).map(([value, text]) => {
          const label = element("label");
          const radio = element("input");
          radio.type = "radio";
          radio.name = `confidence-${index}`;
          radio.value = value;
          label.append(radio, element("span", text[0].toUpperCase() + text.slice(1)));
          confidence.append(label);
          return radio;
        });
        field.append(confidence);
        pending.push({ question, field, choices, razonamiento, sure });
      }
      container.append(field);
    }
    if (recorded.size) showScore(form, `${[...recorded.values()].filter((r) => r.ok).length}/${recorded.size}`);
    if (pending.length) {
      const ownWords = !diagnosis && textarea(form, "Vuelco con tus palabras");
      const exercises = !diagnosis && textarea(form, "Ejercicios (código o respuesta)");
      const button = element("button", "Enviar al tutor");
      button.type = "submit";
      const message = status();
      form.append(button, message);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const missing = pending.find((item) => !item.choices.some((input) => input.checked));
        if (missing) {
          message.className = "error";
          message.textContent = "Responde todas las preguntas antes de enviar.";
          missing.choices[0]?.focus();
          return;
        }
        const unsure = pending.find((item) => !item.sure.some((input) => input.checked));
        if (unsure) {
          message.className = "error";
          message.textContent = "Indica en cada pregunta qué tan seguro estás: seguro, dudo o adiviné.";
          unsure.sure[0].focus();
          return;
        }
        const answers = Object.fromEntries(pending.map((item) => [item.question.id, item.choices.find((input) => input.checked).value]));
        const reasoning = Object.fromEntries(
          pending.map((item) => [
            item.question.id,
            {
              razonamiento: item.razonamiento.value.trim(),
              confianza: item.sure.find((input) => input.checked).value,
            },
          ]),
        );
        const payload = { kind: diagnosis ? "diagnosis" : "mini-quiz", topic: data.topic, answers, reasoning };
        if (!diagnosis) {
          payload.part = data.part;
          if (ownWords.value.trim()) payload.ownWords = ownWords.value.trim();
          if (exercises.value.trim()) payload.exercises = exercises.value.trim();
        }
        button.disabled = true;
        message.textContent = "Enviando…";
        try {
          const response = await post(payload);
          response.results.forEach((result) => {
            const item = pending.find((entry) => entry.question.id === result.id);
            if (item) showResult(item.field, result, item.question);
          });
          showScore(section, response.score, response.saved);
          form.querySelectorAll("input, textarea, button").forEach((input) => { input.disabled = true; });
          message.textContent = "";
        } catch (error) {
          message.className = "error";
          message.textContent = error.message;
          button.disabled = false;
        }
      });
    }
    section.append(form);
    app.append(section);
    decorate(section);
    verdicts();
  }
  function verdicts() {
    if (!data.verdicts?.length) return;
    const labels = { claro: "✔ Claro", dudoso: "◐ Dudoso", laguna: "✘ Laguna" };
    const panel = element("section", undefined, "verdicts");
    panel.append(element("h2", "Diagnóstico por concepto"));
    for (const v of data.verdicts) {
      const row = element("div", undefined, `verdict verdict-${v.estado}`);
      row.append(element("strong", `${labels[v.estado] || v.estado} · ${v.codigo}`), element("span", ` (pregunta ${v.pregunta})`, "muted"));
      row.append(element("p", `«${v.evidencia}»`));
      panel.append(row);
    }
    app.append(panel);
  }
  function exerciseLinks() {
    if (!data.exercises?.length) return;
    const section = element("section");
    section.append(element("h2", "Ejercicios de código"));
    for (const ex of data.exercises) {
      const row = element("p");
      row.append(link(ex.titulo, data.topicBase + "codigo/" + encodeURIComponent(ex.id)), element("span", ` · ${ex.lenguaje} · Mejor: ${ex.mejor || "sin entregas"}`));
      if (ex.error) row.append(element("span", " · Ejercicio no disponible", "error"));
      section.append(row);
    }
    app.append(section);
  }

  function codePage() {
    const ex = data.exercise;
    app.append(element("p", `Lenguaje: ${ex.lenguaje} · archivo ${data.file}`, "part-kicker"), markdown(ex.enunciado));
    for (const test of ex.tests.filter((t) => !t.oculto)) {
      app.append(element("h3", test.nombre), element("p", "Entrada"), element("pre", test.entrada), element("p", "Salida esperada"), element("pre", test.salida));
    }
    const hidden = ex.tests.filter((t) => t.oculto).length;
    if (hidden) app.append(element("p", `Y ${hidden} ${hidden === 1 ? "prueba oculta" : "pruebas ocultas"} que se corrigen al entregar.`, "muted"));
    const key = `learning-code:${data.topic}:${ex.id}`;
    const editor = textarea(app, "Tu código");
    editor.className = "code-editor";
    editor.spellcheck = false;
    editor.maxLength = 100000;
    editor.rows = 18;
    let draft;
    try { draft = localStorage.getItem(key); } catch {}
    editor.value = draft ?? data.lastCode ?? ex.plantilla;
    const saveDraft = () => { try { localStorage.setItem(key, editor.value); } catch {} };
    editor.addEventListener("input", saveDraft);
    const input = textarea(app, "Mi entrada");
    const note = textarea(app, "Nota para el tutor (opcional)");
    const panel = element("section", undefined, "code-results");
    panel.setAttribute("aria-live", "polite");
    const history = element("section");
    history.append(element("h2", "Historial de entregas"));
    const when = (iso) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }); };
    const addHistory = (s) => history.append(element("p", `#${s.numero} · ${s.aprobados}/${s.total} pruebas · ${when(s.fecha)}`));
    (data.submissions || []).forEach(addHistory);
    const buttons = [];
    const states = { correcto: "✔ correcto", incorrecto: "✘ incorrecto", tiempo: "⏱ tiempo", error: "💥 error", ejecutado: "▶ ejecutado" };
    const run = async (mode) => {
      buttons.forEach((b) => b.disabled = true);
      panel.replaceChildren(element("p", "Ejecutando…"));
      const payload = { topic: data.topic, exercise: ex.id, code: editor.value };
      if (mode === "submit") { payload.kind = "code"; payload.note = note.value; }
      if (mode === "free") payload.input = input.value;
      try {
        const response = await fetch(mode === "submit" ? data.submitUrl : data.runUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        panel.replaceChildren(element("h2", mode === "free" ? "Ejecución con tu entrada" : `Resultado: ${result.aprobados}/${result.total} pruebas`));
        if (!result.compilacion.ok) panel.append(element("h3", "Error de compilación", "error"));
        if (result.compilacion.salida) panel.append(element("pre", result.compilacion.salida));
        for (const r of result.resultados) {
          panel.append(element("h3", `${r.nombre}${r.oculto ? " (oculto)" : ""} · ${states[r.estado]}`, r.estado === "correcto" ? "correct" : r.estado === "ejecutado" ? "" : "error"));
          if (!r.oculto) for (const [key, label] of [["entrada", "Entrada"], ["esperado", "Esperado"], ["obtenido", "Obtenido"], ["errores", "Errores"]]) {
            if (r[key] !== undefined && (key !== "errores" || r[key].trim())) panel.append(element("p", label), element("pre", r[key]));
          }
        }
        if (mode === "submit") {
          panel.append(element("p", "Entrega guardada y enviada al tutor."));
          addHistory({ numero: Number(result.saved.split("/").pop().split(".")[0]), aprobados: result.aprobados, total: result.total, fecha: new Date().toISOString() });
        }
      } catch (error) { panel.replaceChildren(element("p", `No se pudo ejecutar: ${error.message}`, "error")); }
      finally { buttons.forEach((b) => b.disabled = false); }
    };
    const actions = element("div", undefined, "code-actions");
    for (const [text, mode] of [["Probar con las pruebas visibles", "visible"], ["Probar con mi entrada", "free"], ["Entregar al tutor", "submit"]]) {
      const button = element("button", text);
      button.onclick = () => run(mode);
      buttons.push(button);
      actions.append(button);
    }
    const restore = element("button", "Restaurar plantilla", "secondary");
    restore.onclick = () => { if (confirm("¿Restaurar la plantilla? Se perderá el borrador actual.")) { editor.value = ex.plantilla; saveDraft(); } };
    actions.append(restore);
    app.append(actions, panel, history);
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
        saveDraft();
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!buttons[0].disabled) run("visible"); }
    });
  }

  // Inside the studio the studio itself navigates; the view's own back link would move the frame.
  const embedded = window.self !== window.top;
  if (!embedded && data.topicBase) app.append(link(`← ${data.topicTitle || data.title}`, data.topicBase));
  else if (!embedded && data.kind !== "index") app.append(link("← Temas", data.home));
  // A part note carries its own title.
  if (data.kind !== "part") app.append(element("h1", data.title || "Learnings"));
  if (data.kind === "code") { codePage(); return; }
  if (data.kind === "index" || data.kind === "topic") {
    const list = element("ul", undefined, "navigation");
    for (const item of data.topics || data.parts || []) {
      const row = element("li");
      if (data.kind === "index") row.append(link(item.title, data.home + encodeURIComponent(item.id) + "/"));
      else if (item.written) row.append(link(item.title || item.id, data.topicBase + encodeURIComponent(item.id)));
      else row.append(element("span", `${item.title || item.id} — pendiente`, "muted"));
      list.append(row);
    }
    app.append(list);
    if (data.hasDiagnosis) app.append(link("Diagnóstico", data.topicBase + "quiz"));
    exerciseLinks();
    return;
  }
  if (data.kind === "part") {
    const article = markdown(data.markdown);
    article.className = "prose";
    const title = article.querySelector("h1");
    if (title) {
      const match = /^Parte\s+(\d+)\s*[—–-]\s*(.+)$/i.exec(title.textContent.trim());
      const number = match?.[1] || String(data.part || "").replace(/^p/i, "");
      const subject = match?.[2] || data.title || "";
      const shortSubject = /\(([^)]+)\)\s*$/.exec(subject)?.[1] || subject;
      title.before(element("p", `Parte ${number} · ${shortSubject}`, "part-kicker"));
    }
    if (data.app) {
      const launch = element("div", undefined, "app-launch");
      const open = link("▶ Abrir la aplicación interactiva de esta parte", data.app);
      open.className = "app-button";
      launch.append(open, element("p", "La explicación como experimento: predices, mueves, calculas y respondes; lo que envíes llega al chat de Pi.", "muted"));
      if (title) title.after(launch);
      else article.prepend(launch);
    }
    app.append(article);
    decorate(article);
    setWide(storedWide(), false);
    readingToggle();
  }
  exerciseLinks();
  const frames = [];
  if (data.demos?.length) {
    const section = element("section");
    section.append(element("h2", "Demos interactivas"));
    data.demos.forEach((path) => {
      const name = path.split("/").pop();
      const frame = element("iframe");
      frame.src = path.split("/").map(encodeURIComponent).join("/");
      frame.setAttribute("sandbox", "allow-scripts");
      // Fullscreen must be allowed explicitly, or the demo's own
      // "Pantalla completa" button is denied and looks dead.
      frame.setAttribute("allow", "fullscreen");
      frame.setAttribute("allowfullscreen", "");
      frame.title = name;
      section.append(element("h3", name), frame);
      frames.push({ frame, name });
    });
    app.append(section);
  }
  quiz();
  const questionForm = element("form", undefined, "tutor");
  questionForm.append(element("h2", "Pregunta al tutor"));
  const questionText = textarea(questionForm, "Tu pregunta u observación");
  const send = element("button", "Enviar pregunta");
  send.type = "submit";
  const questionStatus = status();
  questionForm.append(send, questionStatus);
  app.append(questionForm);
  let demo;
  window.addEventListener("message", (event) => {
    const source = frames.find((entry) => entry.frame.contentWindow === event.source);
    if (!source || !event.data || event.data.type !== "learning-demo" || typeof event.data.observation !== "string") return;
    const observation = `[demo ${source.name}] ${event.data.observation}`.slice(0, 2000);
    questionText.value = `${questionText.value}${questionText.value ? "\n" : ""}${observation}`;
    demo = source.name;
  });
  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!questionText.value.trim()) {
      questionStatus.className = "error";
      questionStatus.textContent = "Escribe una pregunta antes de enviar.";
      questionText.focus();
      return;
    }
    send.disabled = true;
    const payload = { kind: "question", topic: data.topic, text: questionText.value.trim() };
    if (data.part) payload.part = data.part;
    if (demo) payload.demo = demo;
    try {
      await post(payload);
      questionText.value = "";
      demo = undefined;
      questionStatus.className = "correct";
      questionStatus.textContent = "Enviada al chat";
    } catch (error) {
      questionStatus.className = "error";
      questionStatus.textContent = error.message;
    } finally {
      send.disabled = false;
    }
  });
})();
