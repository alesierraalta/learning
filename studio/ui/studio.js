(() => {
  const root = document.getElementById("studio");
  let base;
  try {
    base = JSON.parse(document.getElementById("studio-data").textContent).base;
  } catch {
    root.textContent = "No se pudo iniciar el estudio: falta su configuración. Vuelve a abrirlo con el comando estudio.";
    return;
  }

  // ---------- small DOM kit ----------
  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    book: '<path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    app: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    chat: '<path d="M5 5h14v10H9l-4 4z"/>',
    send: '<path d="M4 12l16-8-6 16-2-7z"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    fresh: '<path d="M12 5v14M5 12h14"/>',
    restart: '<path d="M4 12a8 8 0 1 0 3-6.3"/><path d="M4 4v4h4"/>',
    quiz: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 11h7M9 15h7"/>',
    deck: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  };
  const svgParser = new DOMParser();
  const icon = (name) =>
    document.importNode(
      svgParser.parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`,
        "image/svg+xml",
      ).documentElement,
      true,
    );
  const h = (tag, props, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "style") node.style.cssText = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };
  const btn = (label, onclick, cls = "btn", iconName) => h("button", { class: cls, type: "button", onclick }, iconName && icon(iconName), label);
  const markdown = (text) => {
    const node = h("div");
    if (window.DOMPurify && window.marked) node.append(DOMPurify.sanitize(marked.parse(text), { RETURN_DOM_FRAGMENT: true }));
    else node.textContent = text;
    return node;
  };
  let toastTimer;
  const toast = (text) => {
    document.querySelector(".toast")?.remove();
    const node = h("div", { class: "toast", role: "status" }, text);
    document.body.append(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 4200);
  };

  // ---------- server ----------
  const request = async (path, options) => {
    const response = await fetch(base + path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
    return body;
  };
  const post = (path, body = {}) =>
    request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // ---------- deleting a note ----------
  /**
   * Nothing is destroyed: the studio moves the note to the vault's `.papelera/`,
   * so the confirmation names exactly what leaves the library.
   */
  const askDelete = ({ body, title, detail, leaves }) => {
    const note = h("p", { class: "modal-note" }, "No se pierde nada: queda en la papelera del vault y se puede restaurar.");
    const cancel = btn("Cancelar", () => box.remove(), "btn ghost");
    const accept = btn(
      "Mover a la papelera",
      async () => {
        accept.disabled = true;
        try {
          await post("delete", body);
          box.remove();
          toast(`«${title}» está en la papelera`);
          if (leaves) go("#/");
          await loadLibrary();
        } catch (error) {
          accept.disabled = false;
          note.textContent = error.message;
          note.classList.add("alert");
        }
      },
      "btn danger",
    );
    const box = h(
      "div",
      { class: "modal-backdrop" },
      h(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "delete-title" },
        h("h2", { id: "delete-title" }, `¿Mover «${title}» a la papelera?`),
        h("p", {}, detail),
        note,
        h("div", { class: "modal-actions" }, cancel, accept),
      ),
    );
    box.addEventListener("click", (event) => {
      if (event.target === box) box.remove();
    });
    box.addEventListener("keydown", (event) => {
      if (event.key === "Escape") box.remove();
    });
    document.body.append(box);
    cancel.focus();
  };

  // ---------- what the engine state means for the learner ----------
  /** The same stages with their article, for sentences ("en la explicación"). */
  const STAGE_IN = {
    preparation: "la preparación del plan",
    diagnosis: "el diagnóstico inicial",
    planning: "la planificación",
    explanation: "la explicación",
    own_words: "tu vuelco",
    quiz: "el mini-quiz",
    feedback: "la corrección",
    adaptation: "el ajuste del plan",
    exercises: "los ejercicios",
    final_quiz: "el cuestionario final",
    final: "el cierre",
  };
  const STAGE = {
    preparation: "preparando el plan",
    diagnosis: "diagnóstico inicial",
    planning: "planificando la ruta",
    explanation: "explicación",
    own_words: "tu vuelco con tus palabras",
    quiz: "mini-quiz",
    feedback: "corrección",
    adaptation: "ajuste del plan",
    exercises: "ejercicios",
    final_quiz: "cuestionario final",
    final: "cierre",
  };
  const TONE = { you: "var(--amber)", tutor: "var(--blue)", alert: "var(--red)", done: "var(--green)", test: "var(--muted)" };
  const partIndex = (topic, id) => topic.parts.findIndex((p) => p.id === id);
  const partName = (topic, id) => (partIndex(topic, id) >= 0 ? `la Parte ${partIndex(topic, id) + 1}` : "la parte actual");
  const written = (topic) => topic.parts.filter((p) => p.written).length;
  const prompts = {
    resume: (t) => `Sigamos con ${t.title} (carpeta ${t.id}).`,
    next: (t) => `Escribe la siguiente parte de ${t.title} (carpeta ${t.id}).`,
    gaps: (t) => `Repasa mis lagunas de ${t.title} (carpeta ${t.id}).`,
    fill: (t) => {
      const ids = ((t.gaps && t.gaps.missing) || []).join(", ");
      return `Escribe las partes que faltan de ${t.title} (carpeta ${t.id}): ${ids}. Cada una con sus visuales, sus ejemplos y su mini-quiz.`;
    },
  };

  /** One sentence and one button: what to do next in a topic. */
  function nextStep(topic) {
    const stage = topic.nextStage || topic.stage;
    const where = STAGE_IN[stage] || stage || "";
    const part = topic.part ? partName(topic, topic.part) : "";
    const read = (id) => Object.assign(() => go(`#/leer/${topic.id}/${id}`), { route: `#/leer/${topic.id}/${id}` });
    if (topic.status === "sin inscribir") {
      return { tone: "test", label: "Tema de prueba", text: "Este tema no lleva seguimiento del motor: puedes leer sus partes y probar sus apps.", cta: ["Ver el tema", () => go(`#/tema/${topic.id}`)] };
    }
    if (topic.status === "completed") {
      return { tone: "done", label: "Terminado", text: "Completaste este tema. Puedes repasarlo cuando quieras.", cta: ["Repasar mis lagunas", () => say(prompts.gaps(topic))] };
    }
    if (topic.status === "waiting") {
      if (stage === "diagnosis") return { tone: "you", label: "Te toca a ti", text: "Responde el diagnóstico inicial: con tus respuestas el tutor entiende qué sabes y enfoca el plan de tu ruta.", cta: ["Responder el diagnóstico", read("quiz")] };
      if (stage === "quiz" && topic.part) return { tone: "you", label: "Te toca a ti", text: `Responde el mini-quiz de ${part}.`, cta: ["Ir al quiz", read(topic.part)] };
      if (stage === "own_words") return { tone: "you", label: "Te toca a ti", text: `Escribe con tus palabras lo que entendiste de ${part}.`, cta: ["Escribírselo al tutor", () => openDrawer(`Mi vuelco de ${part} de ${topic.title}: `)] };
      return { tone: "you", label: "Te toca a ti", text: `El tutor espera tu respuesta (${where}).`, cta: ["Abrir el tutor", () => openDrawer()] };
    }
    if (topic.status === "blocked") {
      return { tone: "alert", label: "Pendiente del tutor", text: `El tutor dejó algo sin terminar en ${where}${part ? ` de ${part}` : ""}. Pídele que lo resuelva.`, cta: ["Pedir que lo termine", () => say(prompts.resume(topic))] };
    }
    if (stage === "explanation" && topic.part) {
      const p = topic.parts[partIndex(topic, topic.part)];
      if (p && p.written) return { tone: "tutor", label: "Sigue leyendo", text: `Lee ${part}: ${p.title}.`, cta: ["Leer ahora", read(p.id)] };
      return { tone: "tutor", label: "Siguiente paso", text: `${part[0]?.toUpperCase()}${part.slice(1)} todavía no está escrita: el tutor puede prepararla.`, cta: ["Pedir esa parte", () => say(prompts.next(topic))] };
    }
    return { tone: "tutor", label: "Siguiente paso", text: `El tutor puede seguir con ${where || "el tema"}.`, cta: ["Seguir", () => say(prompts.resume(topic))] };
  }

  // ---------- routing ----------
  let library = { topics: [], quick: [] };
  const go = (hash) => {
    if (location.hash === hash) render();
    else location.hash = hash;
  };
  const topicById = (id) => library.topics.find((t) => t.id === id);
  const crumbs = h("nav", { class: "crumbs", "aria-label": "Ubicación" });
  const stage = h("main", { class: "stage", id: "stage" });

  function setCrumbs(items) {
    crumbs.replaceChildren(
      ...items.flatMap((item, i) => [
        ...(i ? [h("span", { class: "sep" }, "/")] : []),
        item.href ? h("a", { href: item.href }, item.text) : h("span", {}, item.text),
      ]),
    );
  }

  function render() {
    const [, view, a, b] = location.hash.split("/").map(decodeURIComponent);
    window.scrollTo(0, 0);
    if (view === "tema" && a) return topicView(a);
    if (view === "leer" && a) return readerView({ topicId: a, part: b, mode: "page" });
    if (view === "app" && a) return readerView({ topicId: a, part: b, mode: "app" });
    if (view === "rapido" && a) return readerView({ quickId: a });
    if (view === "resultados" && a) return resultsView(a, b);
    if (view === "editar") return editorView(a);
    return homeView();
  }

  // ---------- home ----------
  function continueCard(topic, step, compact = false) {
    return h(
      "article",
      { class: "continue reveal", style: `--tone:${TONE[step.tone]};--i:1` },
      h("span", { class: "label" }, step.label),
      compact ? null : h("h3", {}, topic.title),
      h("p", { class: "next" }, step.text),
      h(
        "div",
        { class: "actions" },
        btn(step.cta[0], step.cta[1], `btn ${step.tone === "you" ? "you" : "primary"}`, "play"),
        compact ? null : btn("Ver el tema", () => go(`#/tema/${topic.id}`), "btn ghost"),
      ),
    );
  }

  /** One chip per part, filled when the part is written (like the memory chips of the slides). */
  function progress(topic) {
    const total = topic.parts.length || 1;
    const chips = topic.parts.map((p) => h("span", { class: p.written ? "on" : "" }));
    return [
      h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(written(topic)) }, chips),
      h("div", { class: "progress-label" }, h("span", {}, `${written(topic)} de ${topic.parts.length} partes escritas`), h("span", {}, STAGE[topic.nextStage || topic.stage] || "")),
    ];
  }

  function homeView() {
    setCrumbs([{ text: "Inicio" }]);
    const order = { you: 0, tutor: 1, alert: 2, done: 4, test: 5 };
    const ranked = library.topics.map((t) => ({ t, s: nextStep(t) })).sort((x, y) => order[x.s.tone] - order[y.s.tone]);
    const focus = ranked.find((r) => r.s.tone !== "test" && r.s.tone !== "done") || ranked[0];
    // The cards follow the last time each topic was opened; never-opened ones keep the order above.
    const byOpened = [...ranked].sort((x, y) => (y.t.opened || 0) - (x.t.opened || 0));
    const input = h("input", { type: "text", name: "topic", "aria-label": "¿Qué quieres aprender?", placeholder: "Por ejemplo: qué es una función hash, JOINs en SQL, el teorema de Bayes…", autocomplete: "off" });
    const start = (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return input.focus();
      say(`Quiero aprender ${text}.`);
      input.value = "";
    };
    const page = h(
      "div",
      { class: "page" },
      h(
        "section",
        { class: "hero" },
        h(
          "div",
          { class: "reveal", style: "--i:0" },
          h("p", { class: "eyebrow" }, "Tu cuaderno de estudio"),
          h("h1", {}, "¿Qué ", h("em", {}, "estudiamos"), " hoy?"),
          h("p", { class: "lede" }, "Elige un tema de tu biblioteca o pide uno nuevo. El tutor trabaja de fondo: prepara el plan, escribe las explicaciones, corrige tus respuestas y te guía."),
          h("form", { class: "ask-big", onsubmit: start }, input, h("button", { class: "btn primary", type: "submit" }, icon("spark"), "Empezar")),
          h(
            "div",
            { class: "modes" },
            h("div", { class: "mode uni" }, h("b", {}, "Universitario: "), "plan, diagnóstico, partes con quiz y seguimiento hasta dominarlo."),
            h("div", { class: "mode quick" }, h("b", {}, "Rápido: "), "una nota breve para entender algo hoy. El tutor te pregunta cuál prefieres."),
          ),
        ),
        focus ? continueCard(focus.t, focus.s) : h("div", { class: "continue reveal", style: "--i:1" }, h("span", { class: "label" }, "Para empezar"), h("p", { class: "next" }, "Todavía no tienes temas. Escribe arriba lo que quieres aprender.")),
      ),
      h("div", { class: "section-title" }, h("h2", {}, "Tus temas"), h("p", {}, `${library.topics.length} en tu biblioteca`)),
      library.topics.length
        ? h(
            "div",
            { class: "cards" },
            byOpened.map(({ t, s }, i) =>
              h(
                "button",
                { class: "card reveal", type: "button", style: `--i:${i + 2};--tone:${TONE[s.tone]}`, onclick: () => go(`#/tema/${t.id}`) },
                h("span", { class: `tag${s.tone === "test" ? " test" : ""}` }, s.tone === "test" ? "Prueba" : "Universitario"),
                h("h3", {}, t.title),
                h("span", { class: "status" }, s.label),
                h("div", { class: "foot" }, progress(t)),
              ),
            ),
          )
        : h("p", { class: "empty" }, "Aquí aparecerán tus temas universitarios."),
      h(
        "div",
        { class: "section-title has-action" },
        h("div", { class: "section-heading" }, h("h2", {}, "Notas rápidas"), h("p", {}, "Explicaciones breves, sin plan")),
        btn("Nueva nota", () => go("#/editar"), "btn small", "fresh"),
      ),
      library.quick.length
        ? h(
            "div",
            { class: "cards" },
            library.quick.map((q, i) =>
              h(
                "div",
                { class: "card quick-card reveal", style: `--i:${i + 3}` },
                h(
                  "button",
                  { class: "quick-open", type: "button", onclick: () => go(`#/rapido/${q.id}`) },
                  h("span", { class: "icon" }, noteIcon()),
                  h("div", {}, h("h3", {}, q.title), h("span", { class: "muted" }, "Nota rápida")),
                ),
                btn("Editar", () => go(`#/editar/${encodeURIComponent(q.id)}`), "btn small ghost", "doc"),
              ),
            ),
          )
        : h("p", { class: "empty" }, "Cuando pidas algo en modo rápido, la nota aparecerá aquí."),
      h("div", { class: "section-title" }, h("h2", {}, "Cómo funciona"), h("p", {}, `tutorial de ${window.StudioTutorial?.count ?? 6} diapositivas`)),
      h(
        "section",
        { class: "how" },
        window.StudioTutorial
          ? h("button", { class: "preview", type: "button", "aria-label": "Abrir el tutorial", onclick: () => openTutorial() }, window.StudioTutorial.preview(0))
          : null,
        h(
          "div",
          {},
          h(
            "ol",
            {},
            h("li", {}, h("span", { class: "n" }, "1"), h("div", {}, h("b", {}, "Elige o pide"), h("span", { class: "t" }, "Abre un tema de tu biblioteca o escribe arriba lo que quieres aprender."))),
            h("li", {}, h("span", { class: "n" }, "2"), h("div", {}, h("b", {}, "Lee, prueba y responde"), h("span", { class: "t" }, "Cada parte es una página con la explicación completa, demos, video y su quiz."))),
            h("li", {}, h("span", { class: "n" }, "3"), h("div", {}, h("b", {}, "El tutor te guía"), h("span", { class: "t" }, "Corrige tu razonamiento concepto por concepto y prepara lo siguiente."))),
          ),
          h("div", { style: "margin-top:22px" }, btn("Ver el tutorial", () => openTutorial(), "btn primary", "deck")),
        ),
      ),
    );
    stage.replaceChildren(page);
  }

  /** The note sheet of the slides: a page with a folded corner and text lines. */
  function noteIcon() {
    const svg = icon("doc");
    svg.setAttribute("stroke", "#059669");
    return svg;
  }
  function openTutorial() {
    window.StudioTutorial?.open({
      onStart: () => {
        go("#/");
        setTimeout(() => document.querySelector(".ask-big input")?.focus(), 80);
      },
    });
  }

  // ---------- topic ----------
  function topicView(id) {
    const topic = topicById(id);
    if (!topic) {
      setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Tema" }]);
      return stage.replaceChildren(h("div", { class: "page" }, h("p", { class: "empty" }, "No encuentro ese tema. Vuelve al inicio.")));
    }
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: topic.title }]);
    markOpened(topic);
    const step = nextStep(topic);
    const firstPending = topic.parts.find((p) => !p.written);
    const gaps = topic.gaps || { missing: [], noVisuals: [], noQuiz: [] };
    const rows = [];
    if (topic.hasDiagnosis) {
      const current = (topic.nextStage || topic.stage) === "diagnosis";
      const writtenCount = topic.parts.filter((p) => p.written).length;
      // The plan's parts come from preparation; the diagnosis only decides the focus.
      // Say that, even when the tutor wrote parts before the learner answered.
      const diagnosisMeta = current
        ? writtenCount
          ? `Te toca: responde; enfoca las ${topic.parts.length - writtenCount} partes que faltan`
          : "Te toca: responde sus preguntas"
        : "Hecho · enfocó el plan de tu ruta";
      rows.push(
        h(
          "li",
          { class: `part-row reveal ${current ? "current" : "done"}`, style: "--i:2" },
          h("span", { class: "node" }, current ? icon("quiz") : icon("check")),
          h("div", {}, h("h3", {}, "Diagnóstico inicial"), h("div", { class: "meta" }, diagnosisMeta)),
          h("div", { class: "row-actions" }, btn(current ? "Responder" : "Ver", () => go(`#/leer/${topic.id}/quiz`), current ? "btn small you" : "btn small")),
        ),
      );
    }
    topic.parts.forEach((p, i) => {
      const current = topic.part === p.id && topic.status !== "sin inscribir";
      const state = p.answered && !current ? "done" : current ? "current" : p.written ? "ready" : "pending";
      const meta = {
        done: "Hecha · quiz respondido",
        current: `Ahora: ${STAGE[topic.nextStage || topic.stage] || "en curso"}`,
        ready: "Lista para leer",
        pending: "Todavía no escrita",
      }[state];
      // A written part still owes what the plan promised: say so instead of letting it look finished.
      const owed = [];
      if (p.written && gaps.noVisuals.includes(p.id)) owed.push("sin visuales");
      if (p.written && gaps.noQuiz.includes(p.id)) owed.push("sin mini-quiz");
      if (p.written && p.visuals > 0) owed.push(`${p.visuals} visual${p.visuals === 1 ? "" : "es"}`);
      const metaText = owed.length ? `${meta} · ${owed.join(" · ")}` : meta;
      rows.push(
        h(
          "li",
          { class: `part-row reveal ${state}`, style: `--i:${i + 3}` },
          h("span", { class: "node" }, state === "done" ? icon("check") : String(i + 1)),
          h("div", {}, h("h3", {}, p.title), h("div", { class: "meta" }, `Parte ${i + 1} · ${metaText}`)),
          h(
            "div",
            { class: "row-actions" },
            p.written ? btn("Leer", () => go(`#/leer/${topic.id}/${p.id}`), state === "current" ? "btn small primary" : "btn small", "book") : null,
            p.hasApp ? btn("App", () => go(`#/app/${topic.id}/${p.id}`), "btn small", "app") : null,
            !p.written && p === firstPending && topic.status !== "sin inscribir" ? btn("Pedir esta parte", () => say(prompts.next(topic)), "btn small ghost", "spark") : null,
          ),
        ),
      );
    });
    for (const ex of topic.exercises || []) {
      rows.push(h("li", { class: "part-row ready" },
        h("div", {}, h("h3", {}, ex.titulo), h("div", { class: "meta" }, `Código · ${ex.lenguaje} · Mejor: ${ex.mejor || "sin entregas"}`)),
        btn("Resolver", () => go(`#/leer/${topic.id}/${encodeURIComponent(`codigo/${ex.id}`)}`), "btn small")));
    }
    stage.replaceChildren(
      h(
        "div",
        { class: "page" },
        h(
          "section",
          { class: "topic-head" },
          h(
            "div",
            {},
            h("span", { class: `tag reveal${step.tone === "test" ? " test" : ""}`, style: "--i:0" }, step.tone === "test" ? "Prueba" : "Universitario"),
            h("h1", { class: "reveal", style: "--i:0" }, topic.title),
            h("div", { class: "reveal", style: "--i:1;max-width:520px" }, progress(topic)),
            gaps.missing.length > 0 && topic.status !== "sin inscribir"
              ? h(
                  "div",
                  { class: "empty reveal", style: "--i:1" },
                  h(
                    "p",
                    {},
                    `El plan tiene ${topic.parts.length} partes y ${topic.parts.length - gaps.missing.length} escrita${topic.parts.length - gaps.missing.length === 1 ? "" : "s"}: faltan ${gaps.missing.length} (${gaps.missing.join(", ")}).`,
                  ),
                  btn("Pedir las que faltan", () => say(prompts.fill(topic)), "btn small ghost", "spark"),
                )
              : null,
            h("ol", { class: "route", "aria-label": "Ruta del tema" }, rows),
          ),
          h(
            "aside",
            {},
            h(
              "div",
              { class: "aside-sticky" },
              continueCard(topic, step, true),
              h(
                                        "div",
                                        { class: "side-actions reveal", style: "--i:2" },
                                        topic.status !== "sin inscribir" ? btn("Repasar mis lagunas", () => say(prompts.gaps(topic)), "btn", "spark") : null,
                                        btn("Preguntar sobre este tema", () => openDrawer(`Sobre ${topic.title}: `), "btn", "chat"),
                                        btn(
                                          "Borrar el tema",
                                          () =>
                                            askDelete({
                                              body: { kind: "topic", topic: topic.id },
                                              title: topic.title,
                                              detail: `Se moverá «${topic.title}» completo: su plan, sus partes, sus apps y sus mini-quizzes.`,
                                              leaves: true,
                                            }),
                                          "btn ghost danger",
                                          "x",
                                        ),
              ),
            ),
          ),
        ),
),
);
}

  // ---------- reader ----------
  let readSeq = 0;
  async function readerView({ topicId, part, quickId, mode }) {
    const seq = ++readSeq;
    const topic = topicId ? topicById(topicId) : null;
    // A quick note the library does not list yet (just written) is still a quick note.
    const quick = quickId ? library.quick.find((q) => q.id === quickId) || { id: quickId, title: quickId } : null;
    if (topic) markOpened(topic);
    const index = topic && part !== "quiz" ? partIndex(topic, part) : -1;
    const info = index >= 0 ? topic.parts[index] : null;
    const exercise = topic?.exercises?.find((e) => part === `codigo/${e.id}`);
    const title = quick ? quick.title : exercise ? exercise.titulo : part === "quiz" ? "Diagnóstico inicial" : info ? info.title : "";
    const kicker = quick ? "Nota rápida" : exercise ? "Ejercicio de código" : part === "quiz" ? "Diagnóstico" : `Parte ${index + 1}`;
    setCrumbs(
      quick
        ? [{ text: "Inicio", href: "#/" }, { text: "Notas rápidas" }, { text: quick.title }]
        : [{ text: "Inicio", href: "#/" }, { text: topic ? topic.title : topicId, href: `#/tema/${topicId}` }, { text: kicker }],
    );
    // The bridge is another origin: dictation needs the microphone delegated to it,
    // and its demo embeds can only go fullscreen if this frame delegates that too.
    const frame = h("iframe", { class: "sheet", title: title || "Contenido", allow: "microphone; fullscreen", allowfullscreen: "" });
    const neighbours = topic ? topic.parts.filter((p) => p.written) : [];
    const at = info ? neighbours.indexOf(info) : -1;
    const prev = at > 0 ? neighbours[at - 1] : null;
    const next = at >= 0 && at < neighbours.length - 1 ? neighbours[at + 1] : null;
    // On a phone the label hides and the icon carries the action, so the name
    // lives in aria-label too.
    const barBtn = (label, onclick, cls, iconName) =>
      h("button", { class: cls, type: "button", onclick, "aria-label": label, title: label }, icon(iconName), h("span", { class: "label" }, label));
    const bar = h(
      "div",
      { class: "reader-bar" },
      h("button", { class: "icon-btn", type: "button", "aria-label": "Volver", title: "Volver", onclick: () => go(quick ? "#/" : `#/tema/${topicId}`) }, icon("back")),
      h("div", { class: "title" }, h("small", {}, kicker), title),
      info && info.hasApp
        ? h(
            "div",
            { class: "switch", role: "group", "aria-label": "Formato" },
            h("button", { type: "button", "aria-pressed": String(mode !== "app"), onclick: () => go(`#/leer/${topicId}/${part}`) }, "Explicación"),
            h("button", { type: "button", "aria-pressed": String(mode === "app"), onclick: () => go(`#/app/${topicId}/${part}`) }, "App interactiva"),
          )
        : null,
      prev ? barBtn("Anterior", () => go(`#/leer/${topicId}/${prev.id}`), "btn small ghost nav", "back") : null,
      next ? barBtn("Siguiente", () => go(`#/leer/${topicId}/${next.id}`), "btn small ghost nav", "next") : null,
      barBtn("Preguntar", () => openDrawer(quick ? `Sobre la nota «${title}»: ` : `Sobre ${kicker.toLowerCase()} de ${topic?.title || topicId}: `), "btn small", "chat"),
      quick || info
        ? barBtn(
            "Borrar",
            () =>
              askDelete({
                body: quick ? { kind: "quick", quick: quickId } : { kind: "part", topic: topicId, part },
                title,
                detail: quick
                  ? `Se moverá la nota rápida «${title}».`
                  : `Se moverá «${title}» con su explicación, su app, sus demos y su mini-quiz.`,
                leaves: true,
              }),
            "btn small ghost danger",
            "x",
          )
        : null,
    );
    stage.replaceChildren(h("div", { class: "reader" }, bar, h("div", { class: "sheet-wrap" }, frame)));
    try {
      const query = new URLSearchParams(quick ? { quick: quickId } : { topic: topicId, ...(part ? { part } : {}) });
      const data = await request(`api/view?${query}`);
      if (seq !== readSeq) return;
      const url = mode === "app" ? data.appUrl : data.url;
      if (!url) throw new Error("Esta parte no tiene aplicación interactiva.");
      frame.src = url;
    } catch (error) {
      if (seq === readSeq) frame.replaceWith(h("p", { class: "empty" }, error.message));
    }
  }

  // ---------- results of a submitted quiz ----------
  // The reading frame announces a graded submission; the learner lands on its results
  // and watches the tutor read them until it is done, then goes on to the next step.
  let submitted = null;
  let showResultsStatus = () => {};
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.type !== "learning:submitted" || typeof data.topic !== "string" || !Array.isArray(data.results)) return;
    const frame = stage.querySelector("iframe.sheet");
    if (!frame || event.source !== frame.contentWindow) return;
    submitted = { ...data, sawBusy: tutor.busy, done: false };
    go(`#/resultados/${encodeURIComponent(data.topic)}/${encodeURIComponent(data.part || "quiz")}`);
  });
  // Called on every tutor change: the turn that reads the answers is over once the tutor
  // has been busy and is idle again (the prompt may still be queued when the page opens).
  function watchResults() {
    if (!submitted || submitted.done) return;
    if (tutor.busy) submitted.sawBusy = true;
    else if (submitted.sawBusy || !tutor.alive) {
      submitted.done = true;
      loadLibrary().then(() => showResultsStatus());
    }
    showResultsStatus();
  }
  function resultsView(topicId, part) {
    if (!submitted || submitted.topic !== topicId || (submitted.part || "quiz") !== part) return go(`#/tema/${encodeURIComponent(topicId)}`);
    const topic = topicById(topicId);
    const kicker = part === "quiz" ? "Diagnóstico" : topic ? `Parte ${partIndex(topic, part) + 1}` : part;
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: topic ? topic.title : topicId, href: `#/tema/${topicId}` }, { text: "Resultados" }]);
    const [points, total] = String(submitted.score).split("/").map(Number);
    const status = h("div", { class: "results-status", role: "status", "aria-live": "polite" });
    showResultsStatus = () => {
      if (!status.isConnected || !submitted) return;
      if (!submitted.done) {
        status.replaceChildren(
          h("span", { class: "spinner" }),
          h("div", {}, h("p", { class: "reading" }, "El agente está leyendo tus análisis…"), tutor.activity ? h("p", { class: "muted" }, tutor.activity) : null),
        );
        return;
      }
      const fresh = topicById(topicId);
      const step = fresh ? nextStep(fresh) : null;
      status.replaceChildren(
        step ? h("p", {}, step.text) : h("p", {}, "El tutor ya leyó tus respuestas."),
        btn("Ir a lo siguiente", () => (step ? step.cta[1]() : go(`#/tema/${encodeURIComponent(topicId)}`)), "btn primary", "next"),
      );
    };
    stage.replaceChildren(
      h(
        "div",
        { class: "page results" },
        h("p", { class: "eyebrow" }, `${kicker} · resultados`),
        h("h1", {}, `Puntaje ${submitted.score}`, h("span", { class: "pct" }, ` — ${total ? Math.round((points / total) * 100) : 0} %`)),
        status,
        h(
          "ol",
          { class: "results-list" },
          submitted.results.map((r) =>
            h(
              "li",
              { class: r.ok ? "ok" : "miss" },
              h("p", { class: "question" }, r.enunciado || r.id),
              h("p", {}, h("strong", {}, r.ok ? "✔ Correcta" : "✘ Incorrecta"), ` — elegiste ${r.chosen}: ${r.chosenText}`),
              r.ok ? null : h("p", { class: "muted" }, `La correcta es ${r.correct}: ${r.correctText}`),
            ),
          ),
        ),
      ),
    );
    showResultsStatus();
  }

  // Opening a topic (its page or any of its sheets) moves it to the front of the home cards.
  function markOpened(topic) {
    topic.opened = Date.now();
    post("opened", { topic: topic.id }).catch(() => {});
  }

  // ---------- note editor ----------
  // The editor only calls the two routes the bridge owns: `api/note` to read and
  // `save-note` to write. It never touches the vault itself, and it never turns
  // user text into HTML: the preview is the real reader page in its own frame.
  let editSeq = 0;

  /**
   * The title field is the note's name: creation derives the file id from it and
   * the reader takes the body's first heading as the title, so saving keeps that
   * heading in step with the field instead of letting two titles disagree.
   */
  function titled(source, heading) {
    const name = heading.trim();
    if (!name) return source;
    const first = source.replace(/^\s+/, "");
    if (/^#(?!#)\s/.test(first)) return source.replace(/^(\s*)#(?!#)[^\n]*/, (_, lead) => `${lead}# ${name}`);
    return `# ${name}${first ? `\n\n${first}` : "\n"}`;
  }

  async function editorView(quickId) {
    const seq = ++editSeq;
    const isNew = !quickId;
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Notas rápidas", href: "#/" }, { text: isNew ? "Nueva nota" : "Editar nota" }]);

    const title = h("input", { id: "note-title", name: "title", type: "text", autocomplete: "off", placeholder: "Por ejemplo: qué es una función hash" });
    const body = h("textarea", { id: "note-body", name: "body", rows: "16", spellcheck: "false", placeholder: "# Título\n\nEscribe la nota. Las diapositivas guiadas van dentro de su bloque (lk-walkthrough)." });
    const problems = h("div", { class: "editor-problems", role: "alert", hidden: true });
    const conflict = h("div", { class: "editor-conflict", role: "alert", hidden: true });
    const status = h("p", { class: "editor-status", role: "status" });
    const saveBtn = btn("Guardar", save, "btn primary", "check");
    const frame = h("iframe", { class: "sheet", title: "Vista previa de la nota", allow: "microphone; fullscreen", allowfullscreen: "" });
    const preview = h("div", { class: "editor-preview-body" });
    // The frame shows the reader; while the author types it shows the draft.
    const previewNote = h("span", { class: "muted" }, isNew ? "borrador" : "lo guardado");
    const hint = h(
      "p",
      { class: "editor-hint" },
      "Escribe y el borrador aparece aquí, dibujado por el lector real. Guardar es lo que lo escribe en rapidos/.",
    );
    let draftTimer = 0;
    // The version the fields were built from: a save must name it, so a note
    // changed elsewhere is refused instead of silently overwritten.
    let rev = "";
    let saving = false;

    /** The draft is never written: the bridge draws it from memory and hands back a URL. */
    async function refreshDraft() {
      try {
        const response = await fetch(base + "api/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: title.value.trim(), body: titled(body.value, title.value) }),
        });
        const answer = await response.json().catch(() => ({}));
        if (seq !== editSeq || !response.ok || typeof answer.url !== "string") return;
        frame.src = answer.url;
        preview.replaceChildren(frame);
        previewNote.textContent = "tu borrador";
      } catch {
        // A draft that cannot be drawn leaves the last preview in place; saving reports real errors.
      }
    }

    function scheduleDraft() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(refreshDraft, 600);
    }

    async function refreshPreview() {
      if (!quickId) return;
      try {
        const data = await request(`api/view?quick=${encodeURIComponent(quickId)}`);
        if (seq !== editSeq) return;
        frame.src = `${data.url}${data.url.includes("?") ? "&" : "?"}v=${encodeURIComponent(rev)}`;
        preview.replaceChildren(frame);
      } catch (error) {
        if (seq === editSeq) preview.replaceChildren(h("p", { class: "empty" }, `No se pudo abrir la vista previa: ${error.message}`));
      }
    }

    async function load() {
      try {
        const note = await request(`api/note?quick=${encodeURIComponent(quickId)}`);
        if (seq !== editSeq) return false;
        rev = note.rev;
        title.value = note.title;
        body.value = note.body;
        headingNode.textContent = note.title;
        await refreshPreview();
        return true;
      } catch (error) {
        if (seq === editSeq) status.textContent = `No se pudo abrir la nota: ${error.message}`;
        return false;
      }
    }

    /** A refused save keeps the typed text: only the server's own words change. */
    function showProblems(list) {
      problems.replaceChildren(
        h("p", { class: "problems-title" }, list.length === 1 ? "La nota no se guardó: una diapositiva tiene un problema." : `La nota no se guardó: sus diapositivas tienen ${list.length} problemas.`),
        h("ul", {}, list.map((item) => h("li", {}, typeof item === "string" ? item : String(item?.text ?? "")))),
      );
      problems.hidden = false;
      problems.scrollIntoView({ block: "nearest" });
    }

    /** The answer's `rev` is never adopted: that would let the next click overwrite the other edit. */
    function showConflict() {
      conflict.replaceChildren(
        h("p", {}, "La nota cambió en otro sitio desde que la abriste. No se guardó nada."),
        btn("Recargar", reload, "btn small", "restart"),
      );
      conflict.hidden = false;
    }

    async function reload() {
      conflict.hidden = true;
      problems.hidden = true;
      status.textContent = "Recargando…";
      const ok = await load();
      if (ok && seq === editSeq) status.textContent = "";
    }

    async function save(event) {
      event?.preventDefault();
      if (saving) return;
      saving = true;
      saveBtn.disabled = true;
      problems.hidden = true;
      conflict.hidden = true;
      status.textContent = "Guardando…";
      const payload = { body: titled(body.value, title.value) };
      if (quickId) {
        payload.quick = quickId;
        payload.rev = rev;
      } else {
        payload.title = title.value.trim();
      }
      try {
        const response = await fetch(base + "save-note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const answer = await response.json().catch(() => ({}));
        if (seq !== editSeq) return;
        if (response.ok) {
          toast("Nota guardada");
          await loadLibrary();
          go(`#/rapido/${encodeURIComponent(answer.id)}`);
          return;
        }
        if (response.status === 400 && Array.isArray(answer.problems) && answer.problems.length) {
          status.textContent = "";
          showProblems(answer.problems);
          return;
        }
        if (response.status === 409) {
          status.textContent = "";
          showConflict();
          return;
        }
        status.textContent = answer.error || `No se pudo guardar (error ${response.status}).`;
      } catch (error) {
        status.textContent = `No se pudo guardar: ${error.message}`;
      } finally {
        saving = false;
        saveBtn.disabled = false;
      }
    }

    const headingNode = h("h1", {}, isNew ? "Nueva nota" : library.quick.find((q) => q.id === quickId)?.title || "Editar nota");
    stage.replaceChildren(
      h(
        "div",
        { class: "page editor-page" },
        h(
          "header",
          { class: "editor-head" },
          h("span", { class: "tag" }, isNew ? "Nueva nota" : "Editar"),
          headingNode,
          h("p", { class: "muted" }, "El archivo sigue siendo la verdad: se guarda en rapidos/ y el lector lo muestra al instante."),
        ),
        h(
          "div",
          { class: "editor-grid" },
          h(
            "form",
            { class: "editor-form", onsubmit: save },
            h("label", { class: "field" }, h("span", {}, "Título"), title),
            h("label", { class: "field" }, h("span", {}, "Texto (Markdown, diapositivas incluidas)"), body),
            problems,
            conflict,
            status,
            h("div", { class: "editor-actions" }, btn("Cancelar", () => go(quickId ? `#/rapido/${encodeURIComponent(quickId)}` : "#/"), "btn ghost"), saveBtn),
          ),
          h(
            "section",
            { class: "editor-preview" },
            h("header", { class: "preview-head" }, h("h2", {}, "Vista previa"), previewNote),
            preview,
          ),
        ),
      ),
    );
    body.addEventListener("input", scheduleDraft);
    title.addEventListener("input", scheduleDraft);
    if (isNew) {
      preview.replaceChildren(hint);
    } else {
      await load();
    }
  }

  // ---------- tutor ----------
  const tutor = { busy: false, alive: true, activity: "", unread: 0, note: null, turnNote: null, turnTopic: null };
  const thread = h("div", { class: "thread", "aria-live": "polite" });
  const composerText = h("textarea", { rows: "1", "aria-label": "Mensaje para el tutor", placeholder: "Escribe al tutor…" });
  const stateLine = h("span", { class: "state" }, "Conectando…");
  const pillWhat = h("span", { class: "what" }, "Tutor");
  const pillBadge = h("span", { class: "badge", hidden: true });
  const pill = h("button", { class: "tutor-pill", type: "button", "aria-controls": "drawer", "aria-expanded": "false", onclick: () => (document.body.classList.contains("drawer-open") ? closeDrawer() : openDrawer()) }, h("span", { class: "dot" }), pillWhat, pillBadge);
  const menu = h(
    "div",
    { class: "menu", role: "menu" },
    btn("Detener lo que está haciendo", () => { menu.classList.remove("open"); post("abort").catch((e) => toast(e.message)); }, "", "stop"),
    btn("Nueva conversación", () => {
      menu.classList.remove("open");
      if (confirm("¿Empezar una conversación nueva con el tutor? La actual queda guardada en Pi.")) post("new-session").catch((e) => toast(e.message));
    }, "", "fresh"),
    btn("Reiniciar el tutor", () => { menu.classList.remove("open"); post("restart").catch((e) => toast(e.message)); }, "", "restart"),
  );
  const asks = new Map();
  const assistant = new Map();
  const activities = new Map();
  let scheduled = false;

  const intro = h(
    "div",
    { class: "intro" },
    h("h3", {}, "Tu tutor"),
    h("p", {}, "Trabaja de fondo con tu método de siempre. Pídele lo que necesites; cuando tenga que preguntarte algo (por ejemplo, si lo quieres universitario o rápido) verás aquí unos botones."),
    h(
      "div",
      { class: "chips" },
      ["¿Qué tengo pendiente en mis temas?", "Sigamos con mi último tema.", "Explícame de nuevo lo último que leí."].map((text) => h("button", { class: "chip", type: "button", onclick: () => say(text) }, text)),
    ),
  );

  function updatePill() {
    watchResults();
    const asking = asks.size > 0;
    pill.className = `tutor-pill${!tutor.alive ? " dead" : asking ? " asking" : tutor.busy ? " working" : ""}`;
    const text = !tutor.alive ? "Tutor detenido" : asking ? "El tutor te pregunta algo" : tutor.busy ? `Trabajando · ${tutor.activity || "pensando"}` : "Tutor listo";
    pillWhat.textContent = text;
    stateLine.textContent = !tutor.alive ? "Detenido · usa ⋯ para reiniciarlo" : asking ? "Esperando tu respuesta" : tutor.busy ? `Trabajando · ${tutor.activity || "pensando"}` : "Listo";
    pillBadge.hidden = !tutor.unread;
    pillBadge.textContent = String(tutor.unread);
  }
  const atBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
  function append(node) {
    const stick = atBottom();
    intro.remove();
    thread.append(node);
    if (stick) thread.scrollTop = thread.scrollHeight;
  }
  const noteUnread = () => {
    if (!document.body.classList.contains("drawer-open")) tutor.unread++;
    updatePill();
  };
  function openDrawer(prefill) {
    document.body.classList.add("drawer-open");
    pill.setAttribute("aria-expanded", "true");
    tutor.unread = 0;
    updatePill();
    if (typeof prefill === "string") {
      composerText.value = prefill;
      grow();
      composerText.focus();
      composerText.setSelectionRange(prefill.length, prefill.length);
    }
    thread.scrollTop = thread.scrollHeight;
  }
  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    pill.setAttribute("aria-expanded", "false");
  }
  async function say(text) {
    openDrawer();
    try {
      await post("prompt", { text });
    } catch (error) {
      append(h("div", { class: "notice error" }, `No se pudo enviar: ${error.message}`));
    }
  }
  function grow() {
    composerText.style.height = "auto";
    composerText.style.height = `${Math.min(composerText.scrollHeight, 180)}px`;
  }
  const sendComposer = () => {
    const text = composerText.value.trim();
    if (!text) return;
    composerText.value = "";
    grow();
    say(text);
  };
  composerText.addEventListener("input", grow);
  composerText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendComposer();
    }
  });

  function renderAssistant(id) {
    const entry = assistant.get(id);
    entry.node.replaceChildren(...markdown(entry.text).childNodes);
  }
  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const stick = atBottom();
      for (const [id, entry] of assistant) if (entry.dirty) { entry.dirty = false; renderAssistant(id); }
      if (stick) thread.scrollTop = thread.scrollHeight;
    });
  }
  function assistantEntry(id) {
    if (!assistant.has(id)) {
      const node = h("div", { class: "msg assistant" });
      assistant.set(id, { node, text: "", dirty: false });
      append(node);
    }
    return assistant.get(id);
  }
  function askCard(dialog) {
    const answer = async (body) => {
      card.querySelectorAll("button, textarea").forEach((n) => (n.disabled = true));
      try {
        await post("dialog", { id: dialog.id, ...body });
      } catch (error) {
        card.querySelectorAll("button, textarea").forEach((n) => (n.disabled = false));
        toast(error.message);
      }
    };
    const field = h("textarea", { rows: "3", placeholder: dialog.placeholder || "Tu respuesta" });
    const card = h(
      "section",
      { class: "ask-card", "aria-label": "Pregunta del tutor" },
      h("span", { class: "label" }, "El tutor te pregunta"),
      h("h4", {}, dialog.title || "¿Cómo seguimos?"),
      dialog.message ? h("p", {}, dialog.message) : null,
      dialog.method === "select"
        ? h("div", { class: "options" }, (dialog.options || []).map((option) => h("button", { type: "button", onclick: () => answer({ value: String(option) }) }, String(option))))
        : dialog.method === "confirm"
          ? h("div", { class: "options" }, h("button", { type: "button", onclick: () => answer({ confirmed: true }) }, "Sí"), h("button", { type: "button", onclick: () => answer({ confirmed: false }) }, "No"))
          : h("div", { class: "options" }, field, h("button", { type: "button", onclick: () => answer({ value: field.value }) }, "Enviar respuesta")),
      h("button", { class: "cancel", type: "button", onclick: () => answer({ cancelled: true }) }, "Ahora no"),
    );
    return card;
  }

  const events = new EventSource(base + "events");
  const on = (name, fn) =>
    events.addEventListener(name, (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      fn(data);
    });
  on("history", ({ messages, note }) => {
    thread.replaceChildren();
    assistant.clear();
    activities.clear();
    showNote(note);
    if (!messages.length) thread.append(intro);
    for (const m of messages) thread.append(m.role === "user" ? h("div", { class: "msg user" }, m.text) : h("div", { class: "msg assistant" }, ...markdown(m.text).childNodes));
    thread.scrollTop = thread.scrollHeight;
  });
  on("state", (s) => {
    if (tutor.busy && !s.busy) offerTurnEnd();
    tutor.busy = s.busy;
    tutor.alive = s.alive;
    if (!s.busy) tutor.activity = "";
    updatePill();
  });
  on("user", ({ text }) => {
    tutor.turnNote = null;
    tutor.turnTopic = null;
    append(h("div", { class: "msg user" }, text));
  });
  on("assistant_delta", ({ id, delta }) => {
    const entry = assistantEntry(id);
    entry.text += delta;
    entry.dirty = true;
    scheduleRender();
  });
  on("assistant_end", ({ id, text }) => {
    const entry = assistantEntry(id);
    entry.text = text;
    renderAssistant(id);
    noteUnread();
  });
  // The tutor writes notes inside the vault: the chat hands back the way to the one it wrote.
  const noteRoute = (note) => {
    if (note?.quick) return library.quick.some((q) => q.id === note.quick) ? `#/rapido/${encodeURIComponent(note.quick)}` : null;
    const topic = note ? topicById(note.topic) : null;
    const part = topic ? topic.parts[note.index - 1] : null;
    return part ? `#/leer/${note.topic}/${part.id}` : null;
  };
  const openNote = (note) => {
    const route = noteRoute(note);
    if (!route) return;
    closeDrawer();
    go(route);
  };
  const noteButton = (note) => (noteRoute(note) ? btn("Ir a la nota", () => openNote(note), "btn small ghost", "book") : null);
  // A turn ends with what to do next, right under the explanation: the topic it worked on
  // offers its next step (the learner never has to guess it from the reply), and a turn that
  // wrote a note offers the way to it. The turn may have created the topic, so the library is
  // read again before deciding.
  const offerTurnEnd = async () => {
    const note = tutor.turnNote;
    const topicId = tutor.turnTopic;
    tutor.turnNote = null;
    tutor.turnTopic = null;
    if (!note && !topicId) return;
    await loadLibrary();
    const topic = topicId ? topicById(topicId) : null;
    const step = topic ? nextStep(topic) : null;
    const [label, action] = step ? step.cta : [];
    if (step && !(note && action.route && action.route === noteRoute(note))) {
      const run = () => {
        closeDrawer();
        action();
      };
      append(h("div", { class: "next-cta" }, h("p", {}, h("strong", {}, `${step.label}: `), step.text), btn(label, run, "btn small primary", "next")));
    }
    if (!note) return;
    showNote(note);
    const button = noteButton(note);
    if (button) append(h("div", { class: "note-cta" }, button));
  };
  // The head keeps the way back to the last note the tutor wrote, so a reloaded tab still has it.
  const noteBtn = btn("Ir a la nota", () => openNote(tutor.note), "btn small ghost", "book");
  noteBtn.style.display = "none";
  const showNote = (note) => {
    tutor.note = noteRoute(note) ? note : null;
    noteBtn.style.display = tutor.note ? "" : "none";
    noteBtn.title = !tutor.note ? "" : tutor.note.quick ? "Ir a la nota rápida" : `Ir a la nota: Parte ${tutor.note.index}`;
  };
  on("tool", ({ phase, id, label, ok, note, topic }) => {
    if (phase === "start") {
      const row = h("div", { class: "activity running" }, h("span", { class: "spinner" }), label);
      activities.set(id, row);
      append(row);
      tutor.activity = label;
    } else {
      const row = activities.get(id);
      if (row) row.replaceChildren(icon(ok ? "check" : "x"), label);
      row?.classList.remove("running");
      tutor.activity = "";
      // The way to the note and the next step come only once the turn is over (offerTurnEnd), never mid-turn.
      if (ok && note) tutor.turnNote = note;
      if (ok && topic) tutor.turnTopic = topic;
    }
    updatePill();
  });
  on("dialog", (dialog) => {
    if (asks.has(dialog.id)) return;
    const card = askCard(dialog);
    asks.set(dialog.id, card);
    append(card);
    openDrawer();
    thread.scrollTop = thread.scrollHeight;
    updatePill();
  });
  on("dialog_closed", ({ id }) => {
    asks.get(id)?.remove();
    asks.delete(id);
    updatePill();
  });
  on("notice", ({ message }) => append(h("div", { class: "notice" }, message)));
  on("error", ({ message }) => append(h("div", { class: "notice error" }, message)));
  on("library_changed", () => loadLibrary());
  events.onerror = () => {
    stateLine.textContent = "Reconectando…";
  };

  const drawer = h(
    "aside",
    { class: "drawer", id: "drawer", "aria-label": "Tutor" },
    h(
      "div",
      { class: "drawer-head" },
      h("h2", {}, "Tutor", stateLine),
      noteBtn,
      h("button", { class: "icon-btn", type: "button", "aria-label": "Más opciones", onclick: () => menu.classList.toggle("open") }, icon("more")),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Cerrar el tutor", onclick: closeDrawer }, icon("x")),
      menu,
    ),
    thread,
    h(
      "div",
      { class: "composer" },
      h("div", { class: "box" }, composerText, h("button", { class: "send", type: "button", "aria-label": "Enviar", onclick: sendComposer }, icon("send"))),
      h("div", { class: "hint" }, h("span", {}, "Enter envía · Shift+Enter, nueva línea"), h("button", { class: "stop", type: "button", onclick: () => post("abort").catch((e) => toast(e.message)) }, "Detener")),
    ),
  );

  // ---------- boot ----------
  async function loadLibrary() {
    try {
      library = await request("api/library");
    } catch (error) {
      toast(`No se pudo leer la biblioteca: ${error.message}`);
    }
    const [, view] = location.hash.split("/");
    // Never re-render the editor from a library change: it would drop typed text.
    // The results page refreshes its own status instead of being drawn again.
    if (view !== "leer" && view !== "app" && view !== "rapido" && view !== "editar" && view !== "resultados") render();
  }
  root.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "brand", href: "#/" }, h("b", {}, "Estudio"), h("span", {}, "Learnings")),
      crumbs,
      h("div", { class: "top-actions" }, btn("Tutorial", () => openTutorial(), "btn small tutorial-btn", "deck"), pill),
    ),
    h("div", { class: "app" }, stage),
    drawer,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { menu.classList.remove("open"); }
  });
  window.addEventListener("hashchange", render);
  updatePill();
  loadLibrary().then(() => {
    render();
    if (window.StudioTutorial && !window.StudioTutorial.seen()) openTutorial();
  });
})();
