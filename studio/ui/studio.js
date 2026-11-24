(() => {
  const root = document.getElementById("studio");
  let CONFIG;
  try {
    CONFIG = JSON.parse(document.getElementById("studio-data").textContent);
  } catch {
    root.textContent = "No se pudo iniciar el estudio: falta su configuración. Vuelve a abrirlo con el comando estudio.";
    return;
  }
  const base = CONFIG.base;
  const EXAM_FORMAT_LABEL = { oral: "oral", written: "escrito", practical: "práctico" };
  const MAX_LEARNING_SOURCE_CHARS = 200_000;
  const LEARNING_SOURCE_COUNT_THRESHOLD = 20_000;
  const LEARNING_SOURCE_TOO_LONG = "El texto es demasiado largo: como mucho 200000 caracteres.";

  // The three ways to read a part. The article layout is the default; the
  // choice is kept on the device, like the document's own wide-reading key.
  const READING_MODE_KEY = "learnings.reading-mode";
  const READING_MODES = [
    ["articulo", "Art.", "Artículo"],
    ["ancho", "Ancho", "Ancho"],
    ["libro", "Libro", "Libro"],
  ];

  // ---------- small DOM kit ----------
  // Icons: lucide-static v1.74.0 (ISC), 2026-11-17. Each value is the inner markup of the
  // official 24x24 SVG; the wrapper below supplies the svg element and the stroke style.
  const ICONS = {
    back: '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
    next: '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />',
    book: '<path d="M12 5v16" /><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />',
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
    app: '<rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />',
    chat: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" />',
    check: '<path d="M20 6 9 17l-5-5" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    more: '<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />',
    stop: '<rect width="18" height="18" x="3" y="3" rx="2" />',
    fresh: '<path d="M5 12h14" /><path d="M12 5v14" />',
    restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />',
    quiz: '<circle cx="12" cy="12" r="10" /><path d="M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5" /><path d="M12 17h.01" />',
    doc: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
    deck: '<path d="M2 3h20" /><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3" /><path d="m7 21 5-5 5 5" />',
    // sparkles: Lucide has no eight-ray burst without a centre; this is the closest official icon.
    spark: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />',
    map: '<rect x="16" y="16" width="6" height="6" rx="1" /><rect x="2" y="16" width="6" height="6" rx="1" /><rect x="9" y="2" width="6" height="6" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" /><path d="M12 12V8" />',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />',
    settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" />',
    upload: '<path d="M12 3v12" /><path d="m17 8-5-5-5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
    moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />',
    sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />',
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
  // T2 (#364): one anchor per definition site of the 37-control inventory. Templates mark the
  // stable container that owns them, so a generated chat row or source still has exactly one home.
  const control = (node, group, id) => { node.dataset.group = String(group); node.dataset.control = id; return node; };
  const controls = (node, group, ids) => { node.dataset.group = String(group); node.dataset.controls = ids.join(" "); return node; };
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

  // ---------- with no connection ----------
  // The service worker (sw.js) answers from what this device kept when the server is
  // out of reach, and marks those answers; the studio says so instead of pretending.
  let offline = false;
  const offlineBanner = h("div", { class: "offline-banner", role: "status", hidden: true }, "Sin conexión · estás viendo lo guardado en este dispositivo");
  const setOffline = (value) => {
    if (offline === value) return;
    offline = value;
    offlineBanner.hidden = !value;
  };
  /** Parts this device can open with no connection, as `topic/part`. */
  let saved = new Set();
  const savedKey = (topicId, partId) => `${topicId}/${partId}`;
  const refreshSaved = () =>
    new Promise((resolve) => {
      const worker = navigator.serviceWorker?.controller;
      if (!worker) return resolve(saved);
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        saved = new Set(event.data.map((p) => savedKey(p.topic, p.part)));
        resolve(saved);
      };
      worker.postMessage({ type: "saved-parts" }, [channel.port2]);
    });
  /** What this device had saved when the studio opened: the reader waits for it with no connection. */
  const savedReady = refreshSaved();
  const offlineCopy = (topicId, partId) => `${base}api/offline?${new URLSearchParams({ topic: topicId, part: partId })}`;
  /** Fetching the copy is saving it: the worker keeps the answer. */
  async function savePart(topicId, partId) {
    try {
      const response = await fetch(offlineCopy(topicId, partId));
      // Read to the end: an unread body keeps the request open and its bytes held.
      await response.arrayBuffer();
      if (!response.ok || response.headers.get("x-learning-saved")) return false;
      saved.add(savedKey(topicId, partId));
      return true;
    } catch {
      return false;
    }
  }

  function canSaveParts() {
    if (navigator.serviceWorker?.controller) return true;
    toast("Este navegador no deja guardar partes en esta dirección: abre el estudio desde una con certificado de confianza.");
    return false;
  }

  /** Saves every written part of a topic, one after another, and says how many made it. */
  function saveTopicButton(topic) {
    const parts = topic.parts.filter((p) => p.written);
    const button = btn(
      "Guardar el tema sin conexión",
      async () => {
        if (!canSaveParts()) return;
        button.disabled = true;
        let done = 0;
        for (const [index, p] of parts.entries()) {
          button.lastChild.textContent = `Guardando ${index + 1} de ${parts.length}…`;
          if (await savePart(topic.id, p.id)) done += 1;
        }
        await refreshSaved();
        toast(
          done === parts.length
            ? `${done} ${done === 1 ? "parte guardada" : "partes guardadas"} para leer sin conexión`
            : `Se guardaron ${done} de ${parts.length} partes: vuelve a intentarlo con conexión.`,
        );
        if (location.hash === `#/tema/${topic.id}`) render();
      },
      "btn",
      "doc",
    );
    return button;
  }

  // ---------- server ----------
  const request = async (path, options) => {
    let response;
    try {
      response = await fetch(base + path, options);
    } catch (error) {
      setOffline(true);
      throw Object.assign(new Error("Sin conexión con el estudio."), { offline: true, cause: error });
    }
    setOffline(response.headers.get("x-learning-saved") === "1");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
    return body;
  };
  const post = (path, body = {}) =>
    request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // ---------- the paper ----------
  /**
   * One choice for every surface. The studio repaints itself and hands the theme
   * to the reader frame: it is another origin, so it cannot read this storage and
   * gets the theme in its address instead, which makes its first paint the right one.
   */
  const THEME_TEXT = { light: "Tema oscuro", dark: "Tema negro", black: "Tema claro" };
  const paintTheme = (button) => {
    const current = document.documentElement.dataset.theme;
    const label = current === "dark" ? "Cambiar a modo negro" : current === "black" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.replaceChildren(icon(current === "black" ? "sun" : "moon"), h("span", {}, THEME_TEXT[current] || THEME_TEXT.light));
  };
  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme;
    const next = current === "dark" ? "black" : current === "black" ? "light" : "dark";
    if (window.learningTheme?.set) window.learningTheme.set(next);
    else document.documentElement.dataset.theme = next;
    for (const painted of document.querySelectorAll(".theme-btn")) paintTheme(painted);
    for (const frame of document.querySelectorAll("iframe.sheet")) {
      frame.contentWindow?.postMessage({ type: "learning-theme", theme: next }, "*");
    }
  };
  const themeButton = () => {
    const button = h("button", { class: "theme-btn", type: "button", role: "menuitem" });
    paintTheme(button);
    button.addEventListener("click", () => {
      closeContextMenu();
      toggleTheme();
    });
    return button;
  };
  const withTheme = (url) => {
    const theme = document.documentElement.dataset.theme;
    if (!theme || !url) return url;
    return `${url}${url.includes("?") ? "&" : "?"}theme=${theme}`;
  };

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

  // ---------- what the learner wants changed ----------
  /**
   * The reason is the request. A chip moves one preference and the words travel with
   * the prompt, so the next explanation already answers what this one missed; repeating
   * a suggestion does not stack, it just keeps the aspect where the learner wants it.
   */
  const askSugerencia = async ({ topic, part, title, regenerate }) => {
    let catalogue = { motivos: [], directrices: [] };
    try {
      catalogue = await request(`api/sugerencias?tema=${encodeURIComponent(topic)}&parte=${encodeURIComponent(part)}`);
    } catch { /* the words alone are a suggestion too */ }
    const chosen = new Set();
    const area = h("textarea", { id: "sugerencia-texto", rows: "4", placeholder: "Cuéntalo con tus palabras: qué no cuadró, qué ejemplo se quedó corto…" });
    const note = h("span", { class: "muted dictado-note" });
    const dictate = h("button", { class: "btn small ghost dictado-btn", type: "button" }, "Dictar");
    if (window.learningDictate) window.learningDictate(area, dictate, note, { transcribeUrl: CONFIG.transcribeUrl });
    else { dictate.disabled = true; note.textContent = "Este navegador no puede dictar."; }
    const accept = btn(regenerate ? "Regenerar la parte" : "Guardar sugerencia", () => submit(), "btn primary");
    const refresh = () => {
      accept.disabled = chosen.size === 0 && !area.value.trim();
    };
    const chips = h(
      "div",
      { class: "chips", role: "group", "aria-label": "Motivos" },
      ...catalogue.motivos.map((motivo) => {
        const chip = h("button", { class: "chip", type: "button", "aria-pressed": "false" }, motivo.texto);
        chip.addEventListener("click", () => {
          if (chosen.has(motivo.id)) chosen.delete(motivo.id);
          else chosen.add(motivo.id);
          chip.setAttribute("aria-pressed", String(chosen.has(motivo.id)));
          refresh();
        });
        return chip;
      }),
    );
    area.addEventListener("input", refresh);
    const cancel = btn("Cancelar", () => box.remove(), "btn ghost");

    async function submit() {
      accept.disabled = true;
      const body = { tema: topic, parte: part, motivos: [...chosen], texto: area.value.trim() };
      try {
        const result = await post(regenerate ? "api/regenerar" : "api/sugerencias", body);
        box.remove();
        if (regenerate) {
          toast(result.trash ? `Regenerando «${title}»: la versión anterior se conserva y vuelve si la nueva no pasa` : `Regenerando «${title}»`);
          openDrawer();
        } else {
          toast("Sugerencia guardada: el tutor la tendrá en cuenta en la próxima explicación");
        }
      } catch (error) {
        accept.disabled = false;
        note.textContent = error.message;
        note.classList.add("alert");
      }
    }

    const box = h(
      "div",
      { class: "modal-backdrop" },
      h(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "sugerencia-title" },
        h("h2", { id: "sugerencia-title" }, regenerate ? "¿Por qué quieres regenerar esta parte?" : "¿Qué cambiarías de esta parte?"),
        h(
          "p",
          { class: "modal-note" },
          regenerate
            ? "La versión anterior no se pierde: se conserva en la papelera y vuelve a servirse si la nueva no pasa las comprobaciones. El plan y el video se conservan."
            : "Se guarda para que el tutor lo tenga en cuenta cuando vuelva a escribir esta parte.",
        ),
        chips,
        area,
        h("div", { class: "dictado" }, dictate, note),
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
    refresh();
    area.focus();
  };

  // ---------- what the engine state means for the learner ----------
  /** The same stages with their article, for sentences ("en la explicación"). */
  const STAGE_IN = {
    preparation: "la preparación del plan",
    diagnosis: "el diagnóstico inicial",
    method: "la elección del método",
    remedial: "la parte de refuerzo",
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
    method: "elección del método",
    remedial: "parte de refuerzo",
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
  /** The same words the topic view and the reader show when a regeneration was rolled back (#393). */
  const ROLLBACK_NOTICE = "La última regeneración no se completó: se mantiene la versión anterior";
  const partIndex = (topic, id) => topic.parts.findIndex((p) => p.id === id);
  const partName = (topic, id) => (partIndex(topic, id) >= 0 ? `la Parte ${partIndex(topic, id) + 1}` : "la parte actual");
  const written = (topic) => topic.parts.filter((p) => p.written).length;
  /** The part the tutor owes next: the one the engine points at, else the first one missing. */
  function owedPart(topic) {
    const at = topic.part ? topic.parts[partIndex(topic, topic.part)] : undefined;
    return at && !at.written ? at : topic.parts.find((p) => !p.written);
  }
  /** Asking for one part by name, with the folder the tutor works in. */
  const partNumber = (topic, part) => topic.parts.indexOf(part) + 1;
  const writePromptOf = (topic, number, title) =>
    `Escribe la Parte ${number} «${title}» de ${topic.title} (carpeta ${topic.id}): con sus visuales, sus ejemplos y su mini-quiz.`;
  const writePrompt = (topic, part) => writePromptOf(topic, partNumber(topic, part), part.title);
  /** The same request the composer sends, read back from a turn or from the chat history. */
  const WRITE_REQUEST = /^Escribe la Parte (\d+) «([^»\n]+)» de .+? \(carpeta ([\w-]+)\)/;
  const writePartOf = (text) => {
    const found = WRITE_REQUEST.exec(String(text ?? ""));
    return found ? { number: Number(found[1]), title: found[2], topic: found[3] } : null;
  };
  /** The panorama is built from two files the tutor writes: the plan and the map. */
  const planPrompt = (topic) =>
    `Escribe la planificación de ${topic.title} (carpeta ${topic.id}) en planificador.md: el diagnóstico, la tabla de plan por subtema, la ruta numerada y el mapa de dependencias.`;
  const mapPrompt = (topic) =>
    `Dibuja el mapa de dependencias de ${topic.title} (carpeta ${topic.id}) en mapa.mmd: un subgrupo por subtema y una flecha por cada dependencia entre conceptos.`;
  const subtemaPrompt = (topic, subtema) =>
    `Escribe la parte que explica el subtema ${subtema} de ${topic.title} (carpeta ${topic.id}): con sus visuales, sus ejemplos y su mini-quiz.`;
  const askWrite = (topic, part) => ({
    tone: "tutor",
    label: "Siguiente paso",
    text: `La Parte ${partNumber(topic, part)} todavía no está escrita: el tutor puede prepararla.`,
    cta: [`Escribir la Parte ${partNumber(topic, part)}`, () => say(writePrompt(topic, part), topic.id)],
  });
  const prompts = {
    resume: (t) => `Sigamos con ${t.title} (carpeta ${t.id}).`,
    gaps: (t) => `Repasa mis lagunas de ${t.title} (carpeta ${t.id}).`,
    fill: (t) => {
      const ids = ((t.gaps && t.gaps.missing) || []).join(", ");
      return `Escribe las partes que faltan de ${t.title} (carpeta ${t.id}): ${ids}. Cada una con sus visuales, sus ejemplos y su mini-quiz.`;
    },
    /**
     * A failed part is not rewritten: the engine closes it as failed and owes the intermediate
     * part declared right after it in plan.json (SKILL.md, «Reprobar»). The turn asks for that
     * part, with its own diagnosis and a mini-quiz whose questions are new.
     */
    redo: (t, part) => {
      const n = partNumber(t, part);
      return [
        `Rehaz la Parte ${n} «${part.title}» de ${t.title} (carpeta ${t.id}): su mini-quiz salió mal.`,
        `Analiza por qué falló y qué sí entendió, y declara justo después en plan.json su parte intermedia`,
        `(id «${part.id}r<n>», con "remedia": "${part.id}" y "analisis": ese diagnóstico).`,
        `Esa parte nueva explica exactamente la carencia, con sus visuales, sus ejemplos y un mini-quiz`,
        `con preguntas nuevas, ninguna repetida de los intentos anteriores.`,
        `La Parte ${n} reprobada no se borra: queda cerrada como reprobada.`,
      ].join(" ");
    },
  };

  /**
   * One sentence and one button: what to do next in a topic. It reads the engine's own report on
   * the topic (status, stage, part), so the step is the one the engine calls for and never a guess
   * from what the tutor happened to write.
   */
  function nextStep(topic) {
    const stage = topic.nextStage || topic.stage;
    const where = STAGE_IN[stage] || stage || "";
    const part = topic.part ? partName(topic, topic.part) : "";
    const read = (id) => Object.assign(() => go(`#/leer/${topic.id}/${id}`), { route: `#/leer/${topic.id}/${id}` });
    /** The part the engine points at, if the plan still has it. */
    const current = topic.part ? topic.parts[partIndex(topic, topic.part)] : undefined;
    /** A written part is read and quizzed on its own page: one button, the part's own name. */
    const readPart = (p) => ({
      tone: "you",
      label: "Te toca a ti",
      text: stage === "quiz" ? `Responde el mini-quiz de la Parte ${partNumber(topic, p)}: ${p.title}.` : `Lee la Parte ${partNumber(topic, p)}: ${p.title}.`,
      cta: [`Ir a Parte ${partNumber(topic, p)}`, read(p.id)],
    });
    if (topic.status === "sin inscribir") {
      const owed = owedPart(topic);
      if (owed) return { ...askWrite(topic, owed), tone: "test", label: "Sin seguimiento del motor" };
      return { tone: "test", label: "Tema de prueba", text: "Este tema no lleva seguimiento del motor: puedes leer sus partes y sus explicaciones.", cta: ["Ver el tema", () => go(`#/tema/${topic.id}`)] };
    }
    if (topic.status === "completed") {
      return { tone: "done", label: "Terminado", text: "Completaste este tema. Puedes repasarlo cuando quieras.", cta: ["Repasar mis lagunas", () => say(prompts.gaps(topic))] };
    }
    // The engine's remediation: the part failed its mini-quiz and owes its intermediate part,
    // which the tutor declares in plan.json and teaches. It comes before «blocked», because a
    // failed part is exactly what the engine reports as blocked.
    if (stage === "remedial" && current) {
      const n = partNumber(topic, current);
      return {
        tone: "alert",
        label: "Reprobaste",
        text: `Reprobaste el mini-quiz de la Parte ${n}: el tutor puede rehacerla como la parte intermedia que el motor pide.`,
        cta: [`Regenerar Parte ${n}`, () => say(prompts.redo(topic, current), topic.id, { deep: true })],
      };
    }
    if (topic.status === "waiting") {
      if (stage === "diagnosis") return { tone: "you", label: "Te toca a ti", text: "Responde el diagnóstico inicial: con tus respuestas el tutor entiende qué sabes y enfoca el plan de tu ruta.", cta: ["Responder el diagnóstico", read("quiz")] };
      // A part with no file yet cannot be read, quizzed or poured into own words:
      // the tutor writes it first, and that is the step the learner asks for.
      if (current && !current.written) return askWrite(topic, current);
      if (stage === "explanation") {
        const owed = owedPart(topic);
        if (owed) return askWrite(topic, owed);
      }
      if (stage === "quiz" && current) return readPart(current);
      if (stage === "own_words") return { tone: "you", label: "Te toca a ti", text: `Escribe con tus palabras lo que entendiste de ${part}.`, cta: ["Escribírselo al tutor", () => openDrawer(`Mi vuelco de ${part} de ${topic.title}: `)] };
      return { tone: "you", label: "Te toca a ti", text: `El tutor espera tu respuesta (${where}).`, cta: ["Abrir el tutor", () => openDrawer()] };
    }
    if (topic.status === "blocked") {
      return { tone: "alert", label: "Pendiente del tutor", text: `El tutor dejó algo sin terminar en ${where}${part ? ` de ${part}` : ""}. Pídele que lo resuelva.`, cta: ["Pedir que lo termine", () => say(prompts.resume(topic))] };
    }
    // The engine points at a part the learner has not read or quizzed yet: that part is the step.
    if ((stage === "explanation" || stage === "quiz") && current && current.written) return readPart(current);
    if (stage === "explanation") {
      const owed = owedPart(topic);
      if (owed) return askWrite(topic, owed);
    }
    // The method is the page's question, never the tutor's.
    if (stage === "method" && !topic.method) {
      return { tone: "you", label: "Te toca a ti", text: "Elige cómo quieres que te enseñe: el 20% vital o a tu ritmo, con tus preferencias.", cta: ["Elegir el método", () => go(`#/tema/${topic.id}`)] };
    }
    return { tone: "tutor", label: "Siguiente paso", text: `El tutor puede seguir con ${where || "el tema"}.`, cta: ["Seguir", () => say(prompts.resume(topic))] };
  }

  // ---------- routing ----------
  let library = { topics: [], quick: [], runners: null };
  // Who owns the stage: every render takes it, so a view that paints after an
  // await only paints if no other route arrived meanwhile (see materiaView).
  let stageSeq = 0;
  let panoramaBack = "#/";
  const openPanorama = (id, from) => { panoramaBack = from; go(`#/panorama/${id}`); };
  const go = (hash) => {
    if (location.hash === hash) render();
    else location.hash = hash;
  };
  const topicById = (id) => library.topics.find((t) => t.id === id);
  const crumbs = h("nav", { class: "crumbs", "aria-label": "Ubicación" });
  // «Ancladas»: the next step keeps one rank. It is the only primary in the bar,
  // wherever the card that used to hold it happens to be.
  let primaryHandler = () => {};
  const headerPrimary = h(
    "button",
    { class: "btn primary header-action", type: "button", hidden: true, onclick: () => primaryHandler() },
    icon("next"),
    h("span", { class: "label" }),
  );
  const setPrimary = (step) => {
    if (!step || !Array.isArray(step.cta)) {
      headerPrimary.hidden = true;
      return;
    }
    primaryHandler = step.cta[1];
    const text = step.cta[0];
    headerPrimary.lastChild.textContent = text;
    headerPrimary.setAttribute("aria-label", text);
    headerPrimary.hidden = false;
  };
  const stage = h("main", { class: "stage", id: "stage" });
  const mobileBack = h("a", { class: "mobile-back", hidden: true }, "←");
  let scrollAnchor = 0;
  function showChrome() { document.body.classList.remove("chrome-hidden"); }
  function scrollChrome(direction) {
    if (!matchMedia("(max-width: 720px)").matches) return;
    if (direction === "up") return showChrome();
    if (document.body.classList.contains("drawer-open") || document.activeElement?.closest(".topbar, .reader-head")) return;
    document.body.classList.add("chrome-hidden");
  }
  document.addEventListener("focusin", (event) => {
    if (event.target.closest?.(".topbar, .reader-head")) showChrome();
  });
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y <= 0) { scrollAnchor = 0; showChrome(); return; }
    if (Math.abs(y - scrollAnchor) < 24) return;
    scrollChrome(y > scrollAnchor ? "down" : "up");
    scrollAnchor = y;
  }, { passive: true });

  function setCrumbs(items) {
    const destination = [...items].reverse().find((item) => item.href);
    mobileBack.hidden = !destination;
    if (destination) {
      mobileBack.href = destination.href;
      mobileBack.setAttribute("aria-label", `Volver a ${destination.text}`);
    }
    crumbs.replaceChildren(
      ...items.flatMap((item, i) => [
        ...(i ? [h("span", { class: "sep" }, "/")] : []),
        item.href ? h("a", { href: item.href }, item.text) : h("span", {}, item.text),
      ]),
    );
  }

  let enteredPart = "";
  function render() {
    // The route changes now, not when an unfinished view decides to paint: the
    // courses' slow views check this generation instead of drawing over a topic.
    ++stageSeq;
    const [, view, a, b] = location.hash.split("/").map(decodeURIComponent);
    if (view !== "leer" || enteredPart !== `${a}/${b}`) enteredPart = "";
    closeContextMenu();
    setPrimary(null);
    showChrome();
    scrollAnchor = 0;
    window.scrollTo(0, 0);
    if (view === "tema" && a) return topicView(a);
    if (view === "materias") return a ? materiaView(a) : materiasView();
    if (view === "panorama" && a) return panoramaView(a, b);
    if (view === "leer" && a) return readerView({ topicId: a, part: b, mode: "page" });
    if (view === "rapido" && a) return readerView({ quickId: a });
    if (view === "resultados" && a) return resultsView(a, b);
    if (view === "editar") return editorView(a);
    if (view === "preferencias") return preferencesView();
    if (view === "sugerencias") return feedbackView();
    return homeView();
  }

  async function preferencesView() {
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Configuración" }, { text: "Preferencias" }]);
    const status = h("p", { role: "status", class: "muted" }, "Cargando…");
    const page = h("div", { class: "page preferences-page" },
      h("a", { class: "preferences-back", href: "#/" }, "← Volver al inicio"),
      h("header", { class: "preferences-head" }, h("p", { class: "preferences-eyebrow" }, "Tu forma de aprender"), h("h1", {}, "Preferencias"), h("p", { class: "preferences-lead" }, "Elige cómo prefieres que te expliquen."), h("a", { class: "btn small ghost", href: "#/sugerencias" }, "Ver tu feedback")), status);
    stage.replaceChildren(page);
    try {
      // The file is what the learner chose; the candidates are what their own
      // answers suggest. The second is offered, never applied on its own.
      const [data, found, tutor] = await Promise.all([
        request("api/preferences"),
        request("api/preferences/candidatos").then((r) => r.candidatos ?? []).catch(() => []),
        request("api/tutor"),
      ]);
      if (!page.isConnected) return;
      status.textContent = "";
      const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      const evidence = (e) => `${count(e.respuestas, "respuesta", "respuestas")}, ${count(e.aciertos, "acierto", "aciertos")}`;
      // Both buttons change the file and then the page follows it.
      const change = async (button, run, failure) => {
        button.disabled = true;
        try { await run(); render(); }
        catch (error) { button.disabled = false; status.textContent = `${failure}: ${error.message}`; }
      };
      if (found.length) {
        const one = found.length === 1;
        const add = h("button", { class: "btn small", type: "button", onclick: () => change(add, () => post("api/preferences/descubrir", {}), "No se pudo añadir") }, one ? "Añadirlo" : "Añadirlos");
        page.append(h("aside", { class: "preference-found", "aria-label": "Lo que sugiere tu uso" },
          h("p", {}, one ? "Tu uso sugiere un refuerzo nuevo" : `Tu uso sugiere ${found.length} refuerzos nuevos`),
          h("p", { class: "muted" }, found.map((c) => c.titulo).join(" · ")),
          add));
      }
      const field = (aspect) => {
        const discovered = aspect.origen === "telemetria";
        const quit = discovered ? h("button", { class: "btn small ghost", type: "button", onclick: () => change(quit, () => post("api/preferences/olvidar", { id: aspect.id }), "No se pudo quitar") }, "Quitar") : null;
        return h("fieldset", { class: "preference" },
          h("legend", {}, aspect.titulo, discovered ? h("span", { class: "preference-badge" }, "descubierto por tu uso") : null),
          h("div", { class: "preference-row" },
            h("div", { class: "preference-description" },
              h("p", { class: "muted" }, aspect.descripcion),
              discovered ? h("p", { class: "preference-evidence" }, evidence(aspect.evidencia)) : null,
              quit ? h("div", { class: "preference-actions" }, quit) : null),
            h("div", { class: "preference-levels" }, ["menos", "medio", "más"].map((level) => h("label", {},
              h("input", { type: "radio", name: aspect.id, value: level, checked: aspect.nivel === level, onchange: () => { aspect.nivel = level; status.textContent = ""; } }), level)))),
        );
      };
      // Who tutors is a choice of its own: it restarts the tutor, so it is not part of the preferences file.
      const agente = h("select", { name: "agente" },
        h("option", { value: "pi", selected: tutor.agente === "pi" }, "Pi"),
        h("option", { value: "agy", selected: tutor.agente === "agy" }, "Antigravity"));
      // The models belong to the chosen runtime, so the list follows the provider.
      const modelo = h("select", { name: "modelo" });
      const modelRow = h("div", { class: "preference-row" },
        h("div", { class: "preference-description" },
          h("p", { class: "muted" }, "Con qué modelo responde. El predeterminado es el del proveedor.")),
        h("div", { class: "preference-levels" }, modelo));
      // The saved model stays listed (and selected) while the catalogue loads or when it is
      // missing from it, so saving the page never silently drops it.
      const showModels = (ids, chosen) => modelo.replaceChildren(
        h("option", { value: "" }, "Predeterminado del proveedor"),
        ...(chosen && !ids.includes(chosen) ? [chosen] : []).concat(ids)
          .map((id) => h("option", { value: id, selected: id === chosen }, id)));
      let modelsFor = 0;
      const fillModels = async () => {
        const ask = ++modelsFor;
        const chosen = modelo.value || (agente.value === tutor.agente ? tutor.modelo : "");
        showModels([], chosen);
        const ids = (await request(`api/tutor/modelos?agente=${agente.value}`).catch(() => ({ modelos: [] }))).modelos ?? [];
        // A slower answer for a provider the learner already left is dropped.
        if (ask === modelsFor) showModels(ids, modelo.value || chosen);
      };
      agente.addEventListener("change", () => { modelo.value = ""; fillModels(); });
      // Not awaited: `pi --list-models` can take seconds and must not hold the page back.
      fillModels();
      const tutorField = h("fieldset", { class: "tutor-choice" },
        h("legend", {}, "Quién te da la tutoría"),
        h("div", { class: "preference-row" },
          h("div", { class: "preference-description" },
            h("p", { class: "muted" }, "El mismo motor comprueba tu trabajo con cualquiera de los dos.")),
          h("div", { class: "preference-levels" }, agente)),
        modelRow);
      const save = h("button", { class: "btn primary", type: "submit" }, "Guardar preferencias");
      const form = h("form", { class: "preferences-form", onsubmit: async (event) => {
        event.preventDefault();
        save.disabled = true;
        status.textContent = "Guardando…";
        try {
          if (agente.value !== tutor.agente || modelo.value !== tutor.modelo) {
            await post("api/tutor", { ...tutor, agente: agente.value, modelo: modelo.value });
          }
          await post("api/preferences", data);
          status.textContent = "Preferencias guardadas";
        } catch (error) { status.textContent = `No se pudo guardar: ${error.message}`; }
        finally { save.disabled = false; }
      } }, tutorField, data.aspectos.map(field), save);
      page.append(form);
    } catch (error) { if (page.isConnected) status.textContent = `No se pudieron cargar las preferencias: ${error.message}`; }
  }

  /** What the learner said with «Sugerir» and «Regenerar», by topic and part. */
  async function feedbackView() {
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Configuración", href: "#/preferencias" }, { text: "Tu feedback" }]);
    const status = h("p", { role: "status", class: "muted" }, "Cargando…");
    const page = h("div", { class: "page preferences-page feedback-page" },
      h("a", { class: "preferences-back", href: "#/preferencias" }, "← Volver a preferencias"),
      h("header", { class: "preferences-head" }, h("p", { class: "preferences-eyebrow" }, "Lo que dijiste del material"), h("h1", {}, "Tu feedback")), status);
    stage.replaceChildren(page);
    const count = (n) => `${n} ${n === 1 ? "sugerencia" : "sugerencias"}`;
    const reasons = (list) => h("ul", { class: "feedback-reasons" }, list.map((m) => h("li", { class: "chip" }, `${m.texto} · ${m.n}`)));
    const when = (iso) => { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }); };
    try {
      const resumen = await request("api/sugerencias/resumen");
      if (!page.isConnected) return;
      if (resumen.total === 0) { status.textContent = "Todavía no hay sugerencias: usa «Sugerir» o «Regenerar» al leer una parte."; return; }
      status.textContent = count(resumen.total);
      page.append(reasons(resumen.motivos), ...resumen.temas.flatMap((tema) => tema.partes.map((parte) => h("section", { class: "feedback-part" },
        h("h2", {}, `${tema.tema} · ${parte.parte}`),
        h("p", { class: "muted" }, count(parte.total)),
        parte.motivos.length ? reasons(parte.motivos) : null,
        ...parte.entradas.filter((e) => e.texto).map((e) => h("figure", {},
          // A long paste is folded, never cut: the words stay whole one click away.
          e.texto.length > 280
            ? h("details", {}, h("summary", {}, `${e.texto.replace(/\s+/g, " ").slice(0, 200).trim()}… `, h("span", { class: "feedback-more" }, "Ver completo")), h("blockquote", {}, e.texto))
            : h("blockquote", {}, e.texto),
          h("figcaption", { class: "muted" }, `${e.origen === "regenerar" ? "Regenerar" : "Sugerencia"} · ${when(e.timestamp)}`)))))));
    } catch (error) { if (page.isConnected) status.textContent = `No se pudo cargar el feedback: ${error.message}`; }
  }

  // ---------- home ----------
  function topicTag(topic, tone, reveal = false) {
    const format = topic.exam?.format;
    const formatLabel = EXAM_FORMAT_LABEL[format] || format;
    return h(
      "span",
      {
        class: `tag${reveal ? " reveal" : ""}${tone === "test" ? " test" : ""}`,
        style: reveal ? "--i:0" : undefined,
        title: format ? `Formato de examen: ${formatLabel}` : undefined,
        "aria-label": format ? `Examen ${formatLabel}` : undefined,
      },
      topic.exam ? "Examen" : tone === "test" ? "Prueba" : "Universitario",
    );
  }

  function continueCard(topic, step, compact = false, showProgress = false, anchored = false) {
    return h(
      "article",
      { class: "continue reveal", style: `--tone:${TONE[step.tone]};--i:1` },
      h("span", { class: "label" }, step.label),
      compact ? null : h("h3", {}, topic.title),
      h("p", { class: "next" }, step.text),
      showProgress ? progress(topic) : null,
      h(
        "div",
        { class: "actions" },
        anchored ? null : btn(step.cta[0], step.cta[1], `btn ${step.tone === "you" ? "you" : "primary"}`, "play"),
        compact ? null : btn("Ver el tema", () => go(`#/tema/${topic.id}`), "btn ghost"),
      ),
    );
  }

  /** One chip per part, filled when the part is written (like the memory chips of the slides). */
  function progress(topic) {
    const total = topic.parts.length || 1;
    const chips = topic.parts.map((p) => h("span", { class: p.written ? "on" : "" }));
    return [
      h("div", { class: "progress", role: "progressbar", "aria-label": "Partes escritas", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(written(topic)) }, chips),
      h("div", { class: "progress-label" }, h("span", {}, `${written(topic)} de ${topic.parts.length} partes escritas`), h("span", {}, STAGE[topic.nextStage || topic.stage] || "")),
    ];
  }

  /**
   * The course the next new topic is born in. The materia page sets it and sends the learner to the
   * new-topic entry that already exists; the request then carries it as `materia` (#407/T2b).
   */
  let nuevaMateria = "";

  /**
   * «Aprender algo nuevo»: the learner writes what to learn and picks the mode before sending, so no
   * tutor asks it. Exam format and, when practical, the kind of practice are decided here too.
   */
  function newLearningEntry(drawer = false) {
    // The home page draws the same form; only the drawer's second mount belongs to the inventory.
    const tag = (node, id) => (drawer ? control(node, 4, id) : node);
    const tagGroup = (node, ids) => (drawer ? controls(node, 4, ids) : node);
    const input = tag(h("textarea", { name: "topic", rows: "1", "aria-label": "¿Qué quieres aprender?", placeholder: "Por ejemplo: qué es una función hash, JOINs en SQL, el teorema de Bayes…", autocomplete: "off" }), "c04-topic");
    const sourceCount = h("span", { class: "learning-source-count", hidden: true });
    const sourceError = h("span", { class: "learning-source-error", hidden: true });
    const sourceHelp = h("p", { class: "learning-source-help", role: "status", "aria-live": "polite", hidden: true }, sourceCount, sourceError);
    let modo = "";
    let formato = "";
    let practica = "";
    const fuentes = [];
    const erroresFuente = [];
    let subidasPendientes = 0;
    const picks = [
      ["universitario", "Universitario", "plan, diagnóstico y partes con quiz"],
      ["rapido", "Rápido", "una nota breve para entenderlo hoy"],
      ["examen", "Examen", "lo vital del temario, el formato de tu examen (oral, escrito o práctico) y un simulacro final"],
    ].map(([id, title, hint]) =>
      h("button", { type: "button", class: "mode-pick", "data-modo": id, "aria-pressed": "false", onclick: () => pick(id) }, h("b", {}, title), h("span", {}, hint)),
    );
    const formatPicks = [
      ["oral", "Oral"],
      ["written", "Escrito"],
      ["practical", "Práctico"],
    ].map(([id, title]) =>
      h("button", { type: "button", class: "mode-pick", "data-formato": id, "aria-pressed": "false", onclick: () => pickFormat(id) }, h("b", {}, title)),
    );
    const practicePicks = [
      ["Laboratorios", "Laboratorios"],
      ["Construir una aplicación", "Construir una aplicación"],
      ["Ejercicios", "Ejercicios"],
      ["otro", "Otro"],
    ].map(([id, title]) =>
      h("button", { type: "button", class: "mode-pick", "data-practica": id, "aria-pressed": "false", onclick: () => pickPractice(id) }, h("b", {}, title)),
    );
    const deducirPick = h("button", { type: "button", class: "mode-pick", "data-formato": "deducir", "aria-pressed": "false", onclick: () => pickFormat("deducir") }, h("b", {}, "Que lo deduzca el tutor"));
    let formatButtons = formatPicks;
    const formatPicksContainer = tagGroup(h("div", { class: "mode-picks" }, formatPicks), ["c04-formats", "c04-deduce"]);
    const practiceInput = tag(h("input", { type: "text", class: "exam-practice-other", maxlength: "120", "aria-label": "Describe el tipo de práctica", placeholder: "¿Qué práctica harás?", autocomplete: "off", hidden: true }), "c04-practice");
    const fileInput = tag(h("input", {
      type: "file",
      accept: ".pdf,image/png,image/jpeg,image/webp",
      multiple: true,
      "aria-label": "Adjuntar examen o documento",
      onchange: () => { void uploadSources(); },
    }), "c04-file");
    const filePicker = h("label", { class: "learning-source-picker" }, h("span", {}, "Adjuntar examen o documento"), fileInput);
    const sourceList = tagGroup(h("ul", { class: "learning-source-list", "aria-label": "Archivos adjuntos" }), ["c04-remove"]);
    const sourceErrors = h("p", { class: "learning-source-errors", role: "status", "aria-live": "polite", hidden: true });
    const formatGroup = h(
      "div",
      { class: "exam-choice-group", role: "group", "aria-label": "Formato del examen", hidden: true },
      h("p", { class: "exam-choice-question" }, "¿Cómo será tu examen?"),
      formatPicksContainer,
    );
    const practiceGroup = h(
      "div",
      { class: "exam-choice-group", role: "group", "aria-label": "Tipo de práctica", hidden: true },
      h("p", { class: "exam-choice-question" }, "¿Qué tipo de práctica?"),
      tagGroup(h("div", { class: "mode-picks" }, practicePicks), ["c04-practices"]),
      practiceInput,
    );
    const submit = tag(h("button", { class: "btn primary", type: "submit", disabled: true }, icon("spark"), "Empezar"), "c04-start");
    const resetPractice = () => {
      practica = "";
      practiceInput.value = "";
      for (const b of practicePicks) b.setAttribute("aria-pressed", "false");
    };
    const resetExam = () => {
      formato = "";
      for (const b of formatButtons) b.setAttribute("aria-pressed", "false");
      resetPractice();
    };
    const canSubmit = () => {
      const text = input.value.trim();
      const examReady = modo !== "examen" || (
        formato !== "" && (formato !== "deducir" || fuentes.length > 0) &&
        (formato !== "practical" || (practica !== "" && (practica !== "otro" || practiceInput.value.trim() !== "")))
      );
      return Boolean(modo && (text || fuentes.length > 0) && input.value.length <= MAX_LEARNING_SOURCE_CHARS && examReady && subidasPendientes === 0);
    };
    const resizeInput = () => {
      input.style.height = "auto";
      const height = input.scrollHeight;
      input.style.height = `${Math.min(height, 240)}px`;
      input.style.overflowY = height > 240 ? "auto" : "hidden";
    };
    // The course the new topic is born in: the page already knows the learner's materia, and the
    // studio links the topic in the same turn that binds it, so the route is planned from it.
    let materiaId = nuevaMateria;
    const materiaPick = h("select", { id: "learning-materia", class: "learning-materia", "aria-label": "Materia del tema nuevo" },
      h("option", { value: "" }, "Sin materia"));
    const materiaField = h("div", { class: "learning-materia-field", hidden: true },
      h("label", { for: materiaPick.id }, "Materia del tema nuevo"),
      materiaPick);
    let hayMaterias = false;
    const paintMateria = () => { materiaField.hidden = !hayMaterias || modo === "rapido"; };
    materiaPick.addEventListener("change", () => { materiaId = materiaPick.value; nuevaMateria = ""; });
    request("api/materias").then((items) => {
      hayMaterias = items.length > 0;
      if (hayMaterias) {
        materiaPick.replaceChildren(
          h("option", { value: "" }, "Sin materia"),
          ...items.map((m) => h("option", { value: m.id }, m.nombre)),
        );
        if (!items.some((m) => m.id === materiaId)) materiaId = "";
        materiaPick.value = materiaId;
      }
      paintMateria();
    }).catch(() => { hayMaterias = false; paintMateria(); });
    const refresh = () => {
      paintMateria();
      const text = input.value;
      const tooLong = text.length > MAX_LEARNING_SOURCE_CHARS;
      if (!fuentes.length && formato === "deducir") resetExam();
      fileInput.disabled = subidasPendientes > 0;
      formatGroup.hidden = modo !== "examen";
      practiceGroup.hidden = modo !== "examen" || formato !== "practical";
      practiceInput.hidden = practica !== "otro" || practiceGroup.hidden;
      submit.disabled = !canSubmit();
      sourceCount.hidden = text.length <= LEARNING_SOURCE_COUNT_THRESHOLD;
      sourceCount.textContent = `${text.length} / ${MAX_LEARNING_SOURCE_CHARS} caracteres`;
      sourceError.hidden = !tooLong;
      sourceError.textContent = tooLong ? LEARNING_SOURCE_TOO_LONG : "";
      sourceHelp.hidden = sourceCount.hidden && sourceError.hidden;
      submit.title = tooLong ? LEARNING_SOURCE_TOO_LONG : "";
      resizeInput();
    };
    const updateSourceList = () => {
      if (fuentes.length) {
        if (!formatPicksContainer.contains(deducirPick)) formatPicksContainer.append(deducirPick);
        formatButtons = [...formatPicks, deducirPick];
      } else {
        deducirPick.remove();
        formatButtons = formatPicks;
      }
      sourceList.replaceChildren(...fuentes.map((source, index) => {
        const remove = btn("Quitar", () => {
          fuentes.splice(index, 1);
          updateSourceList();
          refresh();
        }, "btn ghost small");
        remove.setAttribute("aria-label", `Quitar ${source.nombre}`);
        return h("li", { class: "learning-source-item", "data-id": source.id }, h("span", {}, source.nombre), remove);
      }));
      sourceErrors.hidden = erroresFuente.length === 0;
      sourceErrors.textContent = erroresFuente.join("\n");
    };
    const uploadSources = async () => {
      const selected = Array.from(fileInput.files || []);
      fileInput.value = "";
      if (!selected.length) return;
      erroresFuente.length = 0;
      const remaining = Math.max(0, 5 - fuentes.length);
      const accepted = selected.slice(0, remaining);
      if (accepted.length < selected.length) erroresFuente.push("Puedes adjuntar un máximo de 5 archivos por tema.");
      subidasPendientes = accepted.length;
      updateSourceList();
      refresh();
      for (const file of accepted) {
        let uploadSucceeded = false;
        try {
          const response = await fetch(`${base}api/subir`, {
            method: "POST",
            headers: { "content-type": file.type, "x-file-name": encodeURIComponent(file.name) },
            body: file,
          });
          const uploaded = await response.json();
          if (!response.ok) throw new Error(uploaded.error || "No se pudo subir el archivo.");
          fuentes.push({ id: uploaded.id, nombre: uploaded.nombre, tipo: uploaded.tipo });
          uploadSucceeded = true;
        } catch (error) {
          erroresFuente.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
        subidasPendientes--;
        updateSourceList();
        if (uploadSucceeded) {
          if (!modo) pick("examen");
          if (modo === "examen" && !formato) pickFormat("deducir");
        }
        refresh();
      }
    };
    const pick = (id) => {
      modo = id;
      for (const b of picks) b.setAttribute("aria-pressed", String(b.dataset.modo === id));
      if (id !== "examen") resetExam();
      refresh();
    };
    const pickFormat = (id) => {
      formato = id;
      for (const b of formatButtons) b.setAttribute("aria-pressed", String(b.dataset.formato === id));
      if (id !== "practical") resetPractice();
      refresh();
    };
    const pickPractice = (id) => {
      practica = id;
      for (const b of practicePicks) b.setAttribute("aria-pressed", String(b.dataset.practica === id));
      if (id !== "otro") practiceInput.value = "";
      refresh();
    };
    const send = async () => {
      const text = input.value.trim();
      // The source bound and every required exam choice are checked again so Enter cannot bypass the disabled button.
      if (!canSubmit()) return input.focus();
      const body = { text, modo };
      if (modo === "examen") {
        body.examen = {
          formato,
          ...(formato === "practical" ? { practica: practica === "otro" ? practiceInput.value.trim() : practica } : {}),
        };
      }
      if (fuentes.length) body.fuentes = fuentes.map((source) => source.id);
      // A quick note is not a topic and belongs to no course: only a deep turn can join one.
      if (materiaId && modo !== "rapido") body.materia = materiaId;
      openDrawer();
      try {
        await post("api/aprender", body);
      } catch (error) {
        append(h("div", { class: "notice error" }, `No se pudo enviar: ${error.message}`));
        return; // what the learner wrote and chose stays where it is
      }
      input.value = "";
      modo = "";
      materiaId = "";
      nuevaMateria = "";
      materiaPick.value = "";
      resetExam();
      fuentes.length = 0;
      erroresFuente.length = 0;
      updateSourceList();
      for (const b of picks) b.setAttribute("aria-pressed", "false");
      refresh();
    };
    const form = h("form", { class: "ask-big", onsubmit: (event) => { event.preventDefault(); send(); } }, input, submit);
    input.addEventListener("input", refresh);
    practiceInput.addEventListener("input", refresh);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      form.requestSubmit();
    });
    return h(
      "section",
      { class: "new-learning", "aria-label": "Aprender algo nuevo" },
      form,
      h("p", { class: "learn-hint" }, "Al adjuntar, se selecciona Examen si no habías elegido modo y «Que lo deduzca el tutor» si el examen aún no tiene formato. Tus elecciones previas se conservan."),
      sourceHelp,
      h("div", { class: "learning-source-control" }, filePicker, sourceList, sourceErrors),
      materiaField,
      tagGroup(h("div", { class: "mode-picks", role: "group", "aria-label": "Modo de estudio" }, picks), ["c04-modes"]),
      formatGroup,
      practiceGroup,
    );
  }

  /**
   * The engine's method stage: the page asks how to be taught and records the choice with the
   * engine's own command; the tutor then plans with it. The tutor never asks this in the chat.
   */
  function methodCard(topic) {
    const card = h(
      "section",
      { class: "method-card reveal", "aria-label": "Cómo quieres que te enseñe" },
      h("h2", {}, "¿Cómo quieres que te enseñe?"),
      h("p", { class: "muted" }, "El método cambia el plan: elige una vez y el tutor sigue."),
      h(
        "div",
        { class: "methods" },
        h("button", { class: "method", type: "button", onclick: () => choose("pareto") }, h("b", {}, "Pareto"), h("span", {}, "El 20% vital: lo que más se usa, sin rodeos.")),
        h("button", { class: "method", type: "button", onclick: () => choose("preferencias") }, h("b", {}, "Preferencias"), h("span", {}, "A tu ritmo, con tus ejemplos y lo que ya sabes.")),
      ),
    );
    async function choose(metodo) {
      const buttons = [...card.querySelectorAll("button")];
      for (const b of buttons) b.disabled = true;
      try {
        await post("api/metodo", { tema: topic.id, metodo });
      } catch (error) {
        for (const b of buttons) b.disabled = false;
        toast(error.message);
      }
    }
    return card;
  }

  /**
   * The wide library's continuation surface. Every line comes from records the
   * studio already holds: the focused topic, its computed next step, its part
   * progress and the parts this device actually saved. Nothing is invented.
   */
  function homeRail(focus) {
    const block = (title, ...children) => h("div", { class: "rail-block" }, h("h3", {}, title), ...children);
    const blocks = [];
    if (focus) {
      blocks.push(block("Progreso", progress(focus.t)));
      blocks.push(block("Siguiente paso", h("span", { class: "label" }, focus.s.label), h("p", {}, focus.s.text)));
      const savedParts = focus.t.parts.filter((p) => saved.has(savedKey(focus.t.id, p.id)));
      if (savedParts.length) {
        const one = savedParts.length === 1;
        blocks.push(block("Guardado", h("p", { class: "saved" }, icon("check"), `${savedParts.length} ${one ? "parte guardada" : "partes guardadas"} en este dispositivo`)));
      }
    } else {
      blocks.push(block("Siguiente paso", h("p", {}, "Todavía no tienes temas. Escribe arriba lo que quieres aprender.")));
    }
    return h(
      "aside",
      { class: "home-rail", "aria-label": "Tu ruta" },
      h("p", { class: "eyebrow" }, "Recuperado del área vacío"),
      h("h2", {}, "Tu ruta"),
      ...blocks,
    );
  }

  function homeView() {
    setCrumbs([{ text: "Inicio" }]);
    const order = { you: 0, tutor: 1, alert: 2, done: 4, test: 5 };
    const ranked = library.topics.map((t) => ({ t, s: nextStep(t) })).sort((x, y) => order[x.s.tone] - order[y.s.tone]);
    const focus = ranked.find((r) => r.s.tone !== "test" && r.s.tone !== "done") || ranked[0];
    setPrimary(focus?.s);
    // The cards follow the last time each topic was opened; never-opened ones keep the order above.
    const byOpened = [...ranked].sort((x, y) => (y.t.opened || 0) - (x.t.opened || 0));
    const main = h(
      "div",
      { class: "home-main" },
      h(
        "section",
        { class: "hero" },
        h(
          "div",
          { class: "reveal", style: "--i:0" },
          h("p", { class: "eyebrow" }, "Tu cuaderno de estudio"),
          h("h1", {}, "¿Qué ", h("em", {}, "estudiamos"), h("br"), "hoy?"),
          h("p", { class: "lede" }, "Elige un tema de tu biblioteca o pide uno nuevo. El tutor trabaja de fondo: prepara el plan, escribe las explicaciones, corrige tus respuestas y te guía."),
          newLearningEntry(),
        ),
        focus ? continueCard(focus.t, focus.s, false, true, true) : h("div", { class: "continue reveal", style: "--i:1" }, h("span", { class: "label" }, "Para empezar"), h("p", { class: "next" }, "Todavía no tienes temas. Escribe arriba lo que quieres aprender.")),
      ),
      h("div", { class: "section-title" }, h("h2", {}, "Tus temas"), h("p", {}, `${library.topics.length} en tu biblioteca`)),
      runnersNote(),
      library.topics.length
        ? h(
            "div",
            { class: "cards" },
            byOpened.map(({ t, s }, i) =>
              h("div", { class: "topic-card" },
                h(
                  "button",
                  { class: "card reveal", type: "button", style: `--i:${i + 2};--tone:${TONE[s.tone]}`, onclick: () => go(`#/tema/${t.id}`) },
                  topicTag(t, s.tone),
                  h("h3", {}, t.title),
                  h("span", { class: "status" }, s.label),
                  h("div", { class: "foot" }, progress(t)),
                ),
                btn("Panorama del tema", () => openPanorama(t.id, "#/"), "btn small ghost", "map"),
              ),
            ),
          )
        : h("p", { class: "empty" }, "Aquí aparecerán tus temas universitarios."),
      h(
        "div",
        { class: "section-title has-action" },
        h("div", { class: "section-heading" }, h("h2", {}, "Materias"), h("p", {}, "Exámenes, documentos y transcripciones, juntos")),
        btn("Ver materias", () => go("#/materias"), "btn small", "book"),
      ),
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
      h("div", { class: "section-title has-action" },
        h("div", {}, h("h2", {}, "Cómo funciona"), h("p", {}, `Un recorrido por el Estudio · ${window.StudioTutorial?.count ?? 6} diapositivas`)),
        btn("Ver el tutorial", () => openTutorial(), "btn")),
      h("section", { class: "how", "aria-label": "Tutorial del Estudio" },
        h("div", {}, h("p", { class: "eyebrow" }, "Empieza por aquí"),
          h("h3", {}, "Conoce tu espacio de aprendizaje"),
          h("p", {}, "Descubre cómo empezar un tema, leer una parte y trabajar con tu tutor.")),
        h("button", { class: "btn ghost", type: "button", "aria-label": "Abrir el tutorial", onclick: () => openTutorial() }, "Abrir tutorial")),
    );
    const page = h(
      "div",
      { class: "page home-page" },
      h("div", { class: "home-layout" }, main, homeRail(focus)),
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
        setTimeout(() => document.querySelector(".ask-big textarea")?.focus(), 80);
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
    const catalogueNote = runnersNote(topic);
    const step = nextStep(topic);
    setPrimary(step);
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
    topic.parts.filter((p) => p.written).forEach((p, i) => {
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
      if (saved.has(savedKey(topic.id, p.id))) owed.push("Guardada en este dispositivo");
      const metaText = owed.length ? `${meta} · ${owed.join(" · ")}` : meta;
      rows.push(
        h(
          "li",
          { class: `part-row reveal ${state}`, style: `--i:${i + 3}` },
          h("span", { class: "node" }, state === "done" ? icon("check") : String(i + 1)),
          h("div", {}, h("h3", {}, p.title), h("div", { class: "meta" }, `Parte ${i + 1} · ${metaText}`), p.rolledBack ? h("div", { class: "meta part-rolledback" }, ROLLBACK_NOTICE) : null),
          h(
            "div",
            { class: "row-actions" },
            p.written ? btn("Leer", () => go(`#/leer/${topic.id}/${p.id}`), state === "current" ? "btn small primary" : "btn small", "book") : null,
            !p.written ? btn("Escribir esta parte", () => say(writePrompt(topic, p), topic.id), p === firstPending ? "btn small primary" : "btn small", "spark") : null,
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
            h("a", { class: "topic-back", href: "#/" }, "← Volver a tus temas"),
            topicTag(topic, step.tone, true),
            h("h1", { class: "reveal", style: "--i:0" }, topic.title),
            catalogueNote,
            topicMateriaCard(topic),
            h("div", { class: "reveal", style: "--i:1;max-width:520px" }, progress(topic)),
            // The plan and the map are one picture of the whole topic, not two
            // more notes: the entry sits with the progress it explains.
            h(
              "div",
              { class: "pano-entry reveal", style: "--i:1" },
              btn("Panorama del tema", () => openPanorama(topic.id, `#/tema/${topic.id}`), "btn small soft", "map"),
              h("span", { class: "pano-entry-note" }, "La planificación y el mapa de dependencias, en una vista completa"),
            ),
            currentEspera() ? esperaMount(currentEspera()) : null,
            gaps.missing.length > 0
              ? h(
                  "div",
                  { class: "empty reveal", style: "--i:1" },
                  h(
                    "p",
                    {},
                    `El plan tiene ${topic.parts.length} partes y ${topic.parts.length - gaps.missing.length} escrita${topic.parts.length - gaps.missing.length === 1 ? "" : "s"}: faltan ${gaps.missing.length} (${gaps.missing.join(", ")}).`,
                  ),
                  btn("Pedir las que faltan", () => say(prompts.fill(topic), topic.id), "btn small ghost", "spark"),
                )
              : null,
            (topic.nextStage || topic.stage) === "method" && !topic.method ? methodCard(topic) : null,
            h("div", { class: "topic-route-heading" }, h("h2", {}, "Tu ruta de aprendizaje"), h("span", {}, "Diagnóstico y partes")),
            h("ol", { class: "route", "aria-label": "Ruta del tema" }, rows),
          ),
          h(
            "aside",
            {},
            h(
              "div",
              { class: "aside-sticky" },
              continueCard(topic, step, true, false, true),
              h(
                                        "div",
                                        { class: "side-actions reveal", style: "--i:2" },
                                        topic.status !== "sin inscribir" ? btn("Repasar mis lagunas", () => say(prompts.gaps(topic)), "btn", "spark") : null,
                                        btn("Preguntar sobre este tema", () => openDrawer(`Sobre ${topic.title}: `), "btn", "chat"),
                                        topic.parts.some((p) => p.written) ? saveTopicButton(topic) : null,
                                        btn(
                                          "Borrar el tema",
                                          () =>
                                            askDelete({
                                              body: { kind: "topic", topic: topic.id },
                                              title: topic.title,
                                              detail: `Se moverá «${topic.title}» completo: su plan, sus partes y sus mini-quizzes.`,
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
  ensureEspera();
}

  // ---------- materias (T3 / S3) ----------
  // The material belongs to the course, not to a topic: the three groups are the
  // learner's own words from the spec, and every file keeps the type it was sent with.
  const MATERIA_TIPOS = [
    ["examen", "Exámenes"],
    ["documento", "Documentos"],
    ["transcripcion", "Transcripciones de clase"],
  ];
  const MATERIA_MIME = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  const MATERIA_ACCEPT = [...Object.keys(MATERIA_MIME), ...new Set(Object.values(MATERIA_MIME))].join(",");
  const MAX_MATERIA_FILE_BYTES = 20 * 1024 * 1024;
  const materiaExtension = (file) => {
    const dot = String(file?.name ?? "").lastIndexOf(".");
    return dot < 0 ? "" : file.name.slice(dot).toLowerCase();
  };
  const materiaFileType = (file) => MATERIA_MIME[materiaExtension(file)] || file.type || "application/octet-stream";
  const humanBytes = (bytes) => {
    const size = Number(bytes) || 0;
    return size >= 1024 * 1024
      ? `${(size / (1024 * 1024)).toFixed(1)} MB`
      : size >= 1024 ? `${Math.round(size / 1024)} KB` : `${size} B`;
  };
  const humanDate = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("es", { dateStyle: "medium" });
  };

  /** The topic page names its course and can move the topic to another one. */
  function topicMateriaCard(topic) {
    const current = h("p", { class: "topic-materia-current" },
      topic.materia ? `Este tema pertenece a «${topic.materia.nombre}».` : "Este tema todavía no pertenece a una materia.");
    const chosen = topic.materia?.id || "";
    // Keep the current course selectable from the first paint: the full list
    // arrives asynchronously, and until then "Sin materia" must not look like
    // the state of a topic that does belong to a course.
    const select = h("select", { id: `topic-materia-${topic.id}`, "aria-label": "Materia del tema" },
      h("option", { value: "" }, "Sin materia"),
      ...(chosen ? [h("option", { value: chosen }, topic.materia.nombre)] : []));
    select.value = chosen;
    const save = h("button", { class: "btn small primary", type: "button" }, icon("link"), "Guardar materia");
    const open = h("a", { class: "btn small ghost", href: "#/", hidden: true }, "Ver la materia");
    const status = h("p", { class: "topic-materia-status", role: "status", "aria-live": "polite" });
    const showCurrent = (nombre, id) => {
      current.textContent = nombre ? `Este tema pertenece a «${nombre}».` : "Este tema todavía no pertenece a una materia.";
      open.hidden = !id;
      if (id) open.href = `#/materias/${encodeURIComponent(id)}`;
    };
    showCurrent(topic.materia?.nombre, topic.materia?.id);
    const restore = (previous) => {
      if (!previous) return;
      post(`api/materias/${encodeURIComponent(previous.id)}/temas`, { tema: topic.id }).then(() => loadLibrary()).catch(() => {});
    };
    save.addEventListener("click", async () => {
      const chosen = select.value;
      const previous = topic.materia || null;
      if (chosen === (previous?.id || "")) {
        status.textContent = chosen ? "El tema ya está en esa materia." : "El tema ya está sin materia.";
        return;
      }
      save.disabled = true;
      status.textContent = "Guardando…";
      try {
        // Unlink first: one topic can live in only one course.
        if (previous) await request(`api/materias/${encodeURIComponent(previous.id)}/temas/${encodeURIComponent(topic.id)}`, { method: "DELETE" });
        if (chosen) await post(`api/materias/${encodeURIComponent(chosen)}/temas`, { tema: topic.id });
        save.disabled = false;
        status.textContent = chosen ? "Listo: el tema ya está en esa materia." : "Listo: el tema quedó sin materia.";
        await loadLibrary();
      } catch (error) {
        save.disabled = false;
        status.textContent = `No se pudo guardar: ${error.message}`;
        if (previous && chosen) restore(previous);
      }
    });
    const card = h("section", { class: "topic-materia" },
      h("h2", {}, "Materia"),
      current,
      h("div", { class: "topic-materia-controls" }, select, save, open),
      status);
    request("api/materias").then((items) => {
      if (!card.isConnected) return;
      select.replaceChildren(
        h("option", { value: "" }, "Sin materia"),
        ...(chosen && !items.some((m) => m.id === chosen) ? [h("option", { value: chosen }, topic.materia.nombre)] : []),
        ...items.map((m) => h("option", { value: m.id, selected: m.id === chosen }, m.nombre)),
      );
      select.value = chosen;
    }).catch((error) => {
      if (card.isConnected) status.textContent = `No pude cargar tus materias: ${error.message}`;
    });
    return card;
  }

  async function materiasView() {
    const seq = stageSeq;
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Materias" }]);
    const status = h("p", { class: "materia-status", role: "status", "aria-live": "polite" });
    const name = h("input", { id: "materia-nombre", type: "text", maxlength: "120", autocomplete: "off", placeholder: "Por ejemplo: Teoría de la computación" });
    const create = h("button", { class: "btn primary", type: "submit" }, icon("fresh"), "Crear materia");
    const list = h("div", { class: "materia-list" });
    const form = h("form", { class: "materia-create" }, h("label", { for: name.id }, "Nombre de la materia"), name, create);
    const page = h("div", { class: "page materias-page" },
      h("header", { class: "materias-head" },
        h("p", { class: "eyebrow" }, "Tu biblioteca de estudio"),
        h("h1", {}, "Materias"),
        h("p", { class: "muted" }, "Junta los exámenes, los documentos y las transcripciones de clase de cada materia.")),
      form, status, list);
    stage.replaceChildren(page);
    const paint = async (message) => {
      try {
        const items = await request("api/materias");
        if (seq !== stageSeq || !page.isConnected) return;
        list.replaceChildren(...items.map((item) => h("article", { class: "materia-card reveal", style: "--i:0" },
          h("a", { class: "materia-card-link", href: `#/materias/${encodeURIComponent(item.id)}` }, h("span", { class: "materia-card-icon" }, icon("book")), h("h2", {}, item.nombre)),
          h("p", { class: "materia-card-count" }, `${item.fuentes} ${item.fuentes === 1 ? "archivo" : "archivos"} · ${item.temas} ${item.temas === 1 ? "tema" : "temas"}`),
          h("ul", { class: "materia-types" }, MATERIA_TIPOS.map(([tipo, label]) => h("li", {}, `${item.porTipo?.[tipo] || 0} · ${label}`))))));
        status.textContent = message ?? (items.length ? "" : "Todavía no tienes materias. Crea una para juntar sus archivos.");
      } catch (error) {
        if (seq === stageSeq && page.isConnected) status.textContent = `No se pudieron cargar tus materias: ${error.message}`;
      }
    };
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!name.value.trim()) { status.textContent = "Escribe el nombre de la materia."; name.focus(); return; }
      create.disabled = true;
      status.textContent = "Creando la materia…";
      try {
        await post("api/materias", { nombre: name.value.trim() });
        name.value = "";
        await paint("Materia creada.");
      } catch (error) {
        status.textContent = `No se pudo crear la materia: ${error.message}`;
      } finally { create.disabled = false; }
    });
    await paint();
  }

  async function materiaView(id) {
    const seq = stageSeq;
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Materias", href: "#/materias" }, { text: "Materia" }]);
    stage.replaceChildren(h("div", { class: "page materia-page" }, h("p", { class: "muted" }, "Abriendo la materia…")));
    let materia;
    try {
      materia = await request(`api/materias/${encodeURIComponent(id)}`);
    } catch (error) {
      if (seq !== stageSeq) return;
      return stage.replaceChildren(h("div", { class: "page materia-page" },
        h("a", { class: "materia-back", href: "#/materias" }, "← Todas las materias"),
        h("h1", {}, "Materia"),
        h("p", { class: "materia-status alert", role: "status" }, `No se pudo abrir la materia: ${error.message}`)));
    }
    if (seq !== stageSeq) return;
    setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Materias", href: "#/materias" }, { text: materia.nombre }]);
    const groups = h("div", { class: "source-groups" });
    const topics = h("div", { class: "materia-topics" });
    const status = h("p", { class: "materia-status upload-status", role: "status", "aria-live": "polite" });

    const renderSources = () => groups.replaceChildren(...MATERIA_TIPOS.map(([tipo, label]) => {
      const sources = materia.fuentes.filter((source) => source.tipo === tipo);
      return h("section", { class: "source-group", "data-tipo": tipo },
        h("div", { class: "source-group-head" }, h("h2", {}, label), h("span", { class: "materia-count" }, String(sources.length))),
        sources.length
          ? h("ul", { class: "source-list" }, sources.map((source) => h("li", { class: "source-row", "data-id": source.id },
              h("div", { class: "source-info" },
                h("span", { class: "source-name" }, source.nombre),
                h("span", { class: "source-meta" }, `${humanBytes(source.bytes)} · ${humanDate(source.subida)}`)),
              (() => {
                const remove = btn("Quitar", () => askRemoveSource(source), "btn small ghost", "x");
                remove.setAttribute("aria-label", `Quitar ${source.nombre}`);
                return remove;
              })())))
          : h("p", { class: "muted source-empty" }, "Todavía no hay archivos de este tipo."));
    }));

    const askRemoveSource = (source) => {
      const note = h("p", { class: "modal-note" });
      const cancel = btn("Cancelar", () => box.remove(), "btn ghost");
      const accept = btn("Mover a la papelera", async () => {
        accept.disabled = true;
        try {
          await request(`api/materias/${encodeURIComponent(id)}/fuentes/${encodeURIComponent(source.id)}`, { method: "DELETE" });
          materia.fuentes = materia.fuentes.filter((item) => item.id !== source.id);
          box.remove();
          renderSources();
          toast(`«${source.nombre}» está en la papelera`);
        } catch (error) {
          accept.disabled = false;
          note.textContent = error.message;
          note.classList.add("alert");
        }
      }, "btn danger");
      const box = h("div", { class: "modal-backdrop" },
        h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "materia-remove-title" },
          h("h2", { id: "materia-remove-title" }, `¿Quitar «${source.nombre}» de la materia?`),
          h("p", {}, "El archivo se mueve a la papelera de la materia: no se borra del todo."),
          note,
          h("div", { class: "modal-actions" }, cancel, accept)));
      box.addEventListener("click", (event) => { if (event.target === box) box.remove(); });
      box.addEventListener("keydown", (event) => { if (event.key === "Escape") box.remove(); });
      document.body.append(box);
      cancel.focus();
    };

    const uploadFiles = async (files) => {
      const picked = Array.from(files || []);
      if (!picked.length) return;
      const errors = [];
      const accepted = picked.filter((file) => {
        if (!MATERIA_MIME[materiaExtension(file)]) { errors.push(`«${file.name}»: usa PDF, imagen, DOCX, TXT o MD.`); return false; }
        if (file.size > MAX_MATERIA_FILE_BYTES) { errors.push(`«${file.name}»: el archivo supera los 20 MiB.`); return false; }
        return true;
      });
      if (!accepted.length) { status.textContent = errors.join(" "); return; }
      let done = 0;
      let successes = 0;
      for (const file of accepted) {
        status.textContent = `Subiendo ${file.name} (${done + 1} de ${accepted.length})…`;
        try {
          const response = await fetch(`${base}api/materias/${encodeURIComponent(id)}/fuentes`, {
            method: "POST",
            headers: {
              "content-type": materiaFileType(file),
              "x-file-name": encodeURIComponent(file.name),
              "x-tipo": tipo.value,
            },
            body: file,
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `No se pudo subir el archivo (${response.status}).`);
          materia.fuentes.push(body);
          successes += 1;
        } catch (error) {
          errors.push(`«${file.name}»: ${error.message}`);
        }
        done += 1;
      }
      renderSources();
      status.textContent = [
        successes ? `${successes} ${successes === 1 ? "archivo subido" : "archivos subidos"}.` : "",
        ...errors,
      ].filter(Boolean).join(" ");
    };

    const tipo = h("select", { id: `materia-tipo-${id}`, "aria-label": "Tipo de archivo" },
      ...MATERIA_TIPOS.map(([value, label]) => h("option", { value }, label)));
    const fileInput = h("input", {
      id: `materia-archivos-${id}`,
      class: "materia-file-input",
      type: "file",
      multiple: true,
      accept: MATERIA_ACCEPT,
      "aria-label": "Archivos de la materia",
    });
    fileInput.addEventListener("change", () => { void uploadFiles(fileInput.files); fileInput.value = ""; });
    const picker = h("label", { class: "btn small", for: fileInput.id }, icon("upload"), "Elegir archivos");
    const drop = h("div", { class: "materia-drop" }, picker, h("span", { class: "muted" }, "o arrastra los archivos aquí"), fileInput);
    drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", (event) => { if (!drop.contains(event.relatedTarget)) drop.classList.remove("over"); });
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("over");
      void uploadFiles(event.dataTransfer?.files);
    });
    const upload = h("form", { class: "materia-upload", onsubmit: (event) => event.preventDefault() },
      h("div", { class: "upload-heading" }, h("h2", {}, "Añadir material"), h("p", { class: "muted" }, "Elige el tipo y añade uno o varios archivos: PDF, imágenes, DOCX, TXT o MD. Hasta 20 MiB por archivo.")),
      h("div", { class: "upload-controls" },
        h("div", { class: "upload-type" }, h("label", { for: tipo.id }, "Tipo de archivo"), tipo),
        drop),
      status);

    const renderTopics = () => {
      const all = library.topics || [];
      if (!all.length) { topics.replaceChildren(h("p", { class: "muted" }, "Todavía no hay temas en tu biblioteca.")); return; }
      topics.replaceChildren(...all.map((topic) => {
        const mine = materia.temas.includes(topic.id) || topic.materia?.id === id;
        const other = !mine && topic.materia ? topic.materia.nombre : "";
        const button = mine
          ? btn("Desvincular", () => unlinkTopic(topic), "btn small ghost")
          : btn(`Vincular ${topic.title}`, () => linkTopic(topic), "btn small", "link");
        return h("div", { class: "materia-topic-row", "data-topic": topic.id },
          h("div", { class: "materia-topic-name" }, h("span", {}, topic.title), other ? h("small", { class: "muted" }, ` · en ${other}`) : null),
          button);
      }));
    };
    // A new topic starts inside this course: the entry that already exists does the rest.
    const empezarEnMateria = () => { nuevaMateria = id; go("#/"); };
    const linkTopic = async (topic) => {
      status.textContent = `Vinculando ${topic.title}…`;
      try {
        await post(`api/materias/${encodeURIComponent(id)}/temas`, { tema: topic.id });
        if (!materia.temas.includes(topic.id)) materia.temas.push(topic.id);
        await loadLibrary();
      } catch (error) { status.textContent = `No se pudo vincular ${topic.title}: ${error.message}`; }
    };
    const unlinkTopic = async (topic) => {
      status.textContent = `Desvinculando ${topic.title}…`;
      try {
        await request(`api/materias/${encodeURIComponent(id)}/temas/${encodeURIComponent(topic.id)}`, { method: "DELETE" });
        materia.temas = materia.temas.filter((linked) => linked !== topic.id);
        await loadLibrary();
      } catch (error) { status.textContent = `No se pudo desvincular ${topic.title}: ${error.message}`; }
    };

    const page = h("div", { class: "page materia-page" },
      h("a", { class: "materia-back", href: "#/materias" }, "← Todas las materias"),
      h("header", { class: "materia-head" },
        h("p", { class: "eyebrow" }, "Material de estudio"),
        h("h1", {}, materia.nombre),
        h("p", { class: "muted" }, `Creada el ${humanDate(materia.creada)} · ${materia.fuentes.length} ${materia.fuentes.length === 1 ? "archivo" : "archivos"}`)),
      upload,
      h("section", { class: "materia-sources" },
        h("div", { class: "section-title" }, h("h2", {}, "Tus fuentes"), h("p", {}, "Cada archivo, con su tipo")),
        groups),
      h("section", { class: "materia-topics-section" },
        h("div", { class: "section-title has-action" },
          h("div", { class: "section-heading" }, h("h2", {}, "Temas de esta materia"), h("p", {}, "Un tema pertenece a una sola materia")),
          btn("Nuevo tema en esta materia", () => empezarEnMateria(), "btn small primary", "fresh")),
        topics));
    stage.replaceChildren(page);
    renderSources();
    renderTopics();
  }

  // ---------- panorama ----------
  // The plan and the dependency map arrive from the server as one picture: it
  // joins plan.json with planificador.md and mapa.mmd, and it lays the map out
  // there too. The studio only draws what it gets, so no diagram library is
  // loaded here and no geometry is computed twice.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, props, ...children) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };
  /** The map's own class names, in the words the plan uses. */
  const MAP_STATUS = { claro: "claro", dudoso: "dudoso", laguna: "laguna", no_visto: "no visto" };
  const MAP_TONES = {
    claro: { fill: "#d4edda", stroke: "#28a745", color: "#14532d" },
    dudoso: { fill: "#fff3cd", stroke: "#ffc107", color: "#664d03" },
    laguna: { fill: "#f8d7da", stroke: "#dc3545", color: "#842029" },
    no_visto: { fill: "#dbeafe", stroke: "#2563eb", color: "#1e3a8a" },
  };
  const statusText = (status) => MAP_STATUS[status] || status || "sin evaluar";
  const panoTab = (label, on, hash) =>
    h("button", { class: `pano-tab${on ? " on" : ""}`, type: "button", role: "tab", "aria-selected": String(on), onclick: () => go(hash) }, label);
  /** The plan's own row, in the words its table uses. */
  const routeMeta = (part) =>
    [
      part.subtema ? `subtema ${part.subtema}` : null,
      part.knows ? `sabes ${part.knows}` : null,
      part.depth || null,
      part.written ? "escrita" : "pendiente",
    ]
      .filter(Boolean)
      .join(" · ");
  let panoSeq = 0;

  async function panoramaView(id, tab) {
    const seq = ++panoSeq;
    const topic = topicById(id);
    const view = tab === "mapa" ? "mapa" : "plan";
    if (!topic) {
      setCrumbs([{ text: "Inicio", href: "#/" }, { text: "Panorama" }]);
      return stage.replaceChildren(h("div", { class: "page" }, h("p", { class: "empty" }, "No encuentro ese tema. Vuelve al inicio.")));
    }
    setCrumbs([{ text: "Inicio", href: "#/" }, ...(panoramaBack === "#/" ? [] : [{ text: topic.title, href: `#/tema/${id}` }]), { text: "Panorama" }]);
    stage.replaceChildren(h("div", { class: "page" }, h("p", { class: "empty" }, "Reuniendo el plan y el mapa del tema…")));
    let panorama;
    try {
      panorama = await request(`api/panorama?topic=${encodeURIComponent(id)}`);
    } catch (error) {
      if (seq !== panoSeq) return;
      return stage.replaceChildren(h("div", { class: "page" }, h("p", { class: "empty" }, `No pude reunir el panorama: ${error.message}`)));
    }
    if (seq !== panoSeq) return;
    const step = nextStep(topic);
    setPrimary(step);
    stage.replaceChildren(
      h(
        "div",
        { class: `page pano${view === "mapa" ? " pano-map" : ""}` },
        h(
          "header",
          { class: "pano-head reveal", style: "--i:0" },
          btn("Volver", () => go(panoramaBack), "btn small ghost", "back"),
          h("p", { class: "eyebrow" }, "Panorama del tema"),
          h("h1", {}, topic.title),
          view === "mapa" ? h("p", { class: "pano-intro" }, "Explora qué necesitas saber antes de avanzar a cada concepto.") : null,
          h(
            "div",
            { class: "pano-chips" },
            h("span", { class: `tag${written(topic) === topic.parts.length ? "" : " test"}` }, `${written(topic)} de ${topic.parts.length} partes escritas`),
            panorama.plan?.score ? h("span", { class: "tag test" }, `Diagnóstico ${panorama.plan.score}`) : null,
            topic.status === "sin inscribir" ? h("span", { class: "tag test" }, "Sin seguimiento del motor") : null,
            panorama.map ? h("span", { class: "tag test" }, `${panorama.map.graph.nodes.length} conceptos en el mapa`) : null,
          ),
          h(
            "div",
            { class: "pano-tabs", role: "tablist", "aria-label": "Vistas del panorama" },
            panoTab("Planificación", view === "plan", `#/panorama/${id}`),
            panoTab("Mapa de dependencias", view === "mapa", `#/panorama/${id}/mapa`),
          ),
        ),
        view === "plan" ? planPanel(topic, panorama) : mapPanel(topic, panorama),
      ),
    );
  }

  /** A section that only draws in the map says so, so nothing looks missing. */
  function diagramHint(count) {
    if (!count) return null;
    return h("span", { class: "hint" }, count === 1 ? "su diagrama vive en el mapa" : `${count} diagramas, en el mapa`);
  }
  /** The plan as a reader walks it: the route first, then what the tutor wrote. */
  function planPanel(topic, panorama) {
    const chapters = panorama.route.map((part, i) =>
      h(
        "li",
        { class: `part-row reveal ${part.written ? "ready" : "pending"}`, style: `--i:${i + 1}`, "data-part": part.id },
        h("span", { class: "node" }, String(part.number)),
        h("div", {}, h("h3", {}, part.title), h("div", { class: "meta" }, routeMeta(part)), part.why ? h("p", { class: "pano-why" }, part.why) : null),
        h(
          "div",
          { class: "row-actions" },
          part.written
            ? btn("Leer", () => go(`#/leer/${topic.id}/${part.id}`), "btn small", "book")
            : btn("Escribir esta parte", () => say(writePromptOf(topic, part.number, part.title), topic.id), "btn small primary", "spark"),
        ),
      ),
    );
    const sections = (panorama.plan?.sections ?? []).map((section, i) =>
      h("details", { class: "pano-section reveal", style: `--i:${i + 2}`, open: i === 0 },
        h("summary", {}, h("span", { class: "title" }, section.title), diagramHint(section.diagrams)),
        h("div", { class: "prose" }, markdown(section.markdown)),
      ),
    );
    return h(
      "div",
      { class: "pano-body" },
      h(
        "main",
        { class: "pano-main" },
        h(
          "section",
          { class: "pano-block" },
          h(
            "div",
            { class: "pano-block-title" },
            h("h2", {}, "La ruta"),
            h("p", {}, `${panorama.route.filter((part) => part.written).length} de ${panorama.route.length} escritas`),
          ),
          panorama.plan
            ? null
            : h(
                "div",
                { class: "pano-ask reveal" },
                h("p", {}, "Falta la planificación: el tutor todavía no escribió planificador.md."),
                btn("Pedir la planificación", () => say(planPrompt(topic), topic.id), "btn small", "spark"),
              ),
          h("ol", { class: "route", "aria-label": "Ruta del tema" }, chapters),
        ),
        sections.length ? h("section", { class: "pano-block" },
          h("div", { class: "pano-block-title" }, h("h2", {}, "El plan del tutor")),
          h("div", { class: "pano-sections" }, sections),
        ) : null,
        panorama.map
          ? null
          : h(
              "div",
              { class: "pano-ask reveal" },
              h("p", {}, "Falta el mapa de dependencias: el tutor todavía no lo dibujó."),
              btn("Pedir el mapa", () => say(mapPrompt(topic), topic.id), "btn small", "spark"),
            ),
      ),
      h(
        "aside",
        { class: "pano-aside" },
        h(
          "div",
          { class: "aside-sticky" },
          continueCard(topic, nextStep(topic), true, false, true),
          h(
            "div",
            { class: "side-actions" },
            btn("Ver el tema", () => go(`#/tema/${topic.id}`), "btn ghost", "deck"),
            panorama.map ? btn("Abrir el mapa", () => go(`#/panorama/${topic.id}/mapa`), "btn", "map") : null,
          ),
          h("p", { class: "pano-note" }, "En el mapa, cada caja se abre: dice qué necesita, a qué abre paso y qué parte de tu ruta lo explica."),
        ),
      ),
    );
  }

  /** The map the tutor drew, drawn again here: columns per subtema, and a card per concept. */
  function mapPanel(topic, panorama) {
    if (!panorama.map) {
      return h(
        "div",
        { class: "pano-body" },
        h(
          "main",
          { class: "pano-main" },
          h(
            "div",
            { class: "pano-ask reveal" },
            h("h2", {}, "Todavía no hay mapa"),
            h("p", {}, "El mapa de dependencias es un archivo mapa.mmd: el tutor dibuja ahí cada subtema con sus conceptos y las flechas de qué necesita a qué."),
            btn("Pedir el mapa de dependencias", () => say(mapPrompt(topic), topic.id), "btn primary", "spark"),
          ),
        ),
      );
    }
    const { layout, graph } = panorama.map;
    const at = new Map(layout.nodes.map((node) => [node.id, node]));
    const needs = (id) => graph.edges.filter((edge) => edge.to === id).map((edge) => at.get(edge.from)).filter(Boolean);
    const opens = (id) => graph.edges.filter((edge) => edge.from === id).map((edge) => at.get(edge.to)).filter(Boolean);
    const tone = (status) => MAP_TONES[status] || MAP_TONES.no_visto;

    const camera = svgEl("g", { class: "pano-cam" });
    const canvas = h("div", { class: "pano-canvas" });
    const cam = { x: 0, y: 0, k: 1 };
    let moved = false;
    let drag = null;
    // Fingers on the canvas, by pointer id: two of them pinch.
    const fingers = new Map();
    let pinch = null;
    // Below this scale a concept's words are too small to read on a tablet.
    const READABLE = 0.85;
    const apply = () => camera.setAttribute("transform", `translate(${cam.x.toFixed(1)},${cam.y.toFixed(1)}) scale(${cam.k.toFixed(3)})`);
    /**
     * `whole` shows the entire map. Otherwise a map that would only fit by shrinking
     * its words opens at a readable size on its first column, ready to be dragged.
     */
    let showWhole = false;
    const fit = (whole = showWhole) => {
      showWhole = whole;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const all = Math.min(box.width / layout.width, box.height / layout.height, 1.15);
      if (whole || all >= READABLE) {
        cam.k = all;
        cam.x = (box.width - layout.width * cam.k) / 2;
        cam.y = (box.height - layout.height * cam.k) / 2;
      } else {
        cam.k = READABLE;
        cam.x = 0;
        cam.y = Math.max(0, (box.height - layout.height * cam.k) / 2);
      }
      apply();
    };
    const zoomTo = (target, px, py) => {
      const box = canvas.getBoundingClientRect();
      const x = px ?? box.width / 2;
      const y = py ?? box.height / 2;
      const k = Math.min(2.6, Math.max(0.25, target));
      cam.x = x - ((x - cam.x) * k) / cam.k;
      cam.y = y - ((y - cam.y) * k) / cam.k;
      cam.k = k;
      apply();
    };
    const zoom = (factor, px, py) => zoomTo(cam.k * factor, px, py);

    const shapes = new Map();
    const detail = h("div", { class: "pano-detail" });
    const chip = (node) =>
      h(
        "span",
        { class: "pano-chip", style: `--fill:${tone(node.status).fill || "var(--soft)"};--line:${tone(node.status).stroke || "var(--line)"};--text:${tone(node.status).color || "var(--ink)"}` },
        statusText(node.status),
      );
    const depLink = (node) =>
      h(
        "li",
        {},
        h("button", { class: "pano-link", type: "button", onclick: () => select(node) }, node.number ? h("span", { class: "n" }, node.number) : null, node.title),
      );
  function depBlock(title, items, empty) {
    const body = items.length ? h("ul", {}, items.map(depLink)) : h("p", { class: "muted" }, empty);
    return h("div", { class: "pano-deps" }, h("h4", {}, title), body);
  }
  /** The part that explains a concept, or the request that would open one. */
  function closing(topic, node) {
    const part = node.part;
    if (!part) {
      const name = node.request ? `el subtema ${node.request}` : "este concepto";
      return [
        h("p", { class: "muted" }, `Tu ruta todavía no tiene una parte para ${name}.`),
        node.request
          ? btn(`Pedir la parte de ${node.request}`, () => say(subtemaPrompt(topic, node.request), topic.id), "btn small primary", "spark")
          : null,
      ];
    }
    const open = part.written
      ? btn("Leer esta parte", () => go(`#/leer/${topic.id}/${part.id}`), "btn small", "book")
      : btn("Escribir esta parte", () => say(writePromptOf(topic, part.number, part.title), topic.id), "btn small primary", "spark");
    return [h("p", { class: "pano-part-name" }, part.written ? "Aprendido en " : "Lo aprenderás en ", h("b", {}, `Parte ${part.number}`), ` · ${part.title}`), open];
  }
  function select(node) {
    for (const [id, shape] of shapes) shape.classList.toggle("on", id === node.id);
    detail.replaceChildren(
        h("p", { class: "eyebrow" }, node.number ? `Concepto ${node.number}` : "Concepto"),
        h("h3", {}, node.title),
        h("div", { class: "pano-meta-row" }, chip(node)),
        node.evidence ? h("p", {}, node.evidence) : null,
        depBlock("Necesita", needs(node.id), "Nada: arranca el mapa."),
        depBlock("Abre paso a", opens(node.id), "Nada todavía: es una hoja del mapa."),
        h("div", { class: "pano-part" }, closing(topic, node)),
      );
    }

    const used = ["claro", "dudoso", "laguna", "no_visto"];
    const legend = h(
      "div",
      { class: "pano-legend", "aria-label": "Colores del mapa" },
      used.map((status) =>
        h("span", {}, h("i", { style: `background:${tone(status).fill || "var(--paper)"};border-color:${tone(status).stroke || "var(--line)"}` }), statusText(status)),
      ),
    );
    const frames = layout.groups.map((group) =>
      svgEl(
        "g",
        { class: "pano-frame" },
        svgEl("rect", { x: group.x, y: group.y, width: group.w, height: group.h, rx: 16 }),
        svgEl("text", { x: group.x + 16, y: group.y + 21 }, group.title),
      ),
    );
    const links = layout.edges.map((edge) => svgEl("path", { class: "pano-edge", d: edge.path, "data-from": edge.from, "data-to": edge.to, "marker-end": "url(#pano-arrow)" }));
    const boxes = layout.nodes.map((node) => {
      const paint = tone(node.status);
      const shape = svgEl(
        "g",
        {
          class: `pano-node${node.part?.written ? " read" : ""}${node.part ? "" : " loose"}`,
          transform: `translate(${node.x},${node.y})`,
          "data-node": node.id,
          role: "button",
          tabindex: "0",
          "aria-label": `${node.number ? `${node.number}, ` : ""}${node.title}, ${statusText(node.status)}`,
          onclick: () => {
            if (!moved) select(node);
          },
          onkeydown: (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            select(node);
          },
        },
        svgEl("rect", { width: node.w, height: node.h, rx: 10, style: paint.fill ? `fill:${paint.fill};stroke:${paint.stroke}` : null }),
        node.lines.map((line) => svgEl("text", { x: 14, y: line.y, class: "pano-node-title" }, line.text)),
        svgEl("text", { x: 14, y: node.metaY, class: "pano-node-meta", style: `fill:${paint.color}` }, statusText(node.status)),
      );
      shapes.set(node.id, shape);
      return shape;
    });
    camera.append(...frames, ...links, ...boxes);
    // The canvas is the frame the camera moves inside: the drawing keeps one unit
    // per CSS pixel, so the fit is exact and nothing is clipped by a smaller box.
    canvas.append(
      svgEl(
        "svg",
        { class: "pano-svg", role: "img", "aria-label": `Mapa de dependencias de ${topic.title}` },
        svgEl("defs", {}, svgEl("marker", { id: "pano-arrow", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto" }, svgEl("path", { d: "M0 0L8 4L0 8z", fill: "var(--blue)" }))),
        camera,
      ),
    );
    // The map moves like a sheet of paper: drag to travel, the wheel to zoom,
    // and one button to bring the whole picture back into view.
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const box = canvas.getBoundingClientRect();
        zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - box.left, event.clientY - box.top);
      },
      { passive: false },
    );
    // Two fingers zoom around the point between them, as on any picture on a tablet.
    const spread = () => {
      const [a, b] = [...fingers.values()];
      const box = canvas.getBoundingClientRect();
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top };
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size === 2) {
        pinch = { ...spread(), k: cam.k };
        drag = null;
        moved = true;
        return;
      }
      drag = { x: event.clientX, y: event.clientY, camX: cam.x, camY: cam.y };
      moved = false;
    });
    canvas.addEventListener("pointermove", (event) => {
      if (fingers.has(event.pointerId)) fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && fingers.size >= 2) {
        const now = spread();
        if (pinch.distance > 0) zoomTo((pinch.k * now.distance) / pinch.distance, now.x, now.y);
        return;
      }
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      cam.x = drag.camX + dx;
      cam.y = drag.camY + dy;
      apply();
    });
    const release = (event) => {
      fingers.delete(event.pointerId);
      if (fingers.size < 2) pinch = null;
      drag = null;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", release);
    detail.replaceChildren(
      h("p", { class: "eyebrow" }, "Cómo leer el mapa"),
      h("p", { class: "pano-lead" }, "Cada caja es un concepto y cada flecha, lo que necesita para entenderse. Abre una caja: verás con qué se conecta y qué parte de tu ruta lo explica."),
    );
    requestAnimationFrame(() => fit());
    // The canvas changes size when the chat opens or the window moves: the map
    // re-fits instead of sliding under the detail the reader is reading.
    const resize = new ResizeObserver(() => {
      if (!canvas.isConnected) {
        resize.disconnect();
        return;
      }
      requestAnimationFrame(() => fit());
    });
    resize.observe(canvas);
    return h(
      "div",
      { class: "pano-body pano-body-map" },
      h(
        "main",
        { class: "pano-main" },
        h(
          "div",
          { class: "pano-map-bar" },
          h("div", { class: "pano-map-title" },
            h("h2", {}, "Mapa de dependencias"),
            h("p", { class: "pano-lead" }, "Arrastra para recorrerlo, acércate con la rueda o con dos dedos y abre cualquier caja."),
          ),
          h(
            "div",
            { class: "pano-controls" },
            h("button", { class: "icon-btn", type: "button", title: "Alejar", "aria-label": "Alejar", onclick: () => zoom(1 / 1.2) }, "−"),
            h("button", { class: "icon-btn", type: "button", title: "Acercar", "aria-label": "Acercar", onclick: () => zoom(1.2) }, "+"),
            h("button", { class: "icon-btn", type: "button", title: "Ajustar a la ventana", "aria-label": "Ajustar a la ventana", onclick: () => fit(true) }, icon("fit")),
          ),
        ),
        h("div", { class: "pano-scroll", role: "region", "aria-label": "Grafo de dependencias", tabindex: "0" }, canvas),
        legend,
      ),
      h("aside", { class: "pano-aside" }, h("div", { class: "aside-sticky" }, detail)),
    );
  }

  /**
   * The wide reading surface's companion. Every line comes from records the
   * studio already holds: the engine's next step, the topic's written parts and
   * the parts this device actually saved. Tutor and Tareas live once, in the
   * header; repeating them here would give an action two ranks.
   */
  function studyRail(topic, part, title) {
    const step = nextStep(topic);
    const block = (name, ...children) => h("div", { class: "rail-block" }, h("h3", {}, name), ...children);
    const blocks = [
      block("Progreso", progress(topic)),
      block("Siguiente paso", h("span", { class: "label" }, step.label), h("p", {}, step.text)),
    ];
    const savedBlock = h("div", { class: "rail-block", hidden: true });
    const showSaved = () => {
      const savedParts = topic.parts.filter((p) => saved.has(savedKey(topic.id, p.id)));
      savedBlock.hidden = !savedParts.length;
      if (!savedParts.length) return savedBlock.replaceChildren();
      const current = savedParts.find((p) => p.id === part);
      const one = savedParts.length === 1;
      savedBlock.replaceChildren(
        h("h3", {}, "Guardado"),
        h("p", { class: "saved" }, icon("check"),
          current ? `Guardada en este dispositivo · ${title}` : `${savedParts.length} ${one ? "parte guardada" : "partes guardadas"} en este dispositivo`),
      );
    };
    showSaved();
    const rail = h(
      "aside",
      { class: "study-rail", "aria-labelledby": "study-rail-title" },
      h("p", { class: "eyebrow" }, "Recuperado del área vacío"),
      h("h2", { id: "study-rail-title" }, "Tu ruta"),
      ...blocks,
      savedBlock,
    );
    rail.showSaved = showSaved;
    return rail;
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
    if (info && enteredPart !== `${topicId}/${part}`) {
      enteredPart = `${topicId}/${part}`;
      post("api/chats/abrir", { ambito: `parte:${topicId}/${part}`, nombre: `${kicker} · ${title}` }).then(setChats).catch((error) => toast(error.message));
    }
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
    let saveButton;
    let modeMenuItem;
    // The menu keeps the action's promise (`Descargar para ver sin conexión`)
    // in all states; only its availability follows the download. The saved
    // state itself is named by «Guardado» in the rail beside the sheet.
    const setSaveState = (label, disabled) => {
      if (seq !== readSeq || !saveButton.isConnected) return;
      saveButton.disabled = disabled;
      saveButton.title = label;
    };
    const saveReaderPart = async (automatic = false) => {
      if (!navigator.serviceWorker?.controller) {
        if (!automatic) canSaveParts();
        return;
      }
      setSaveState("Descargando…", true);
      const ok = await savePart(topicId, part);
      if (seq !== readSeq || !saveButton.isConnected) return;
      if (ok) {
        setSaveState("Guardada en este dispositivo", true);
        stage.querySelector(".study-rail")?.showSaved?.();
      }
      else {
        setSaveState("Descargar para ver sin conexión", false);
        toast("No se pudo guardar: vuelve a intentarlo con conexión.");
      }
    };
    // One definition per action, shared by the desktop row and the phone menu:
    // the menu can never drift from the row it replaces.
    // Three reading modes, and the choice belongs to this device, like the
    // wide-reading key the document keeps for itself.
    let readingMode = localStorage.getItem(READING_MODE_KEY);
    if (!READING_MODES.some(([id]) => id === readingMode)) readingMode = "articulo";
    // A native select, not three buttons: the row keeps back, title, Preguntar
    // and the overflow; three more buttons collapsed the title on a 1280px bar
    // whose font metrics differ from the machine that wrote this.
    const modeSwitch = h(
      "select",
      { class: "reader-mode", "aria-label": "Modo de lectura", title: "Modo de lectura", onchange: (e) => applyMode(e.target.value) },
      READING_MODES.map(([id, short, full]) => h("option", { value: id, title: full }, short)),
    );

    // S2/S4: one place, one rank. Preguntar is the bar's secondary action and
    // never reappears in the overflow; it is defined once and used only there.
    const askAction = {
      label: "Preguntar",
      icon: "chat",
      cls: "btn small",
      run: () => openDrawer(quick ? `Sobre la nota «${title}»: ` : `Sobre ${kicker.toLowerCase()} de ${topic?.title || topicId}: `),
    };
    const actions = [
      info?.written && mode !== "app"
        ? { label: "Descargar para ver sin conexión", icon: "doc", cls: "btn small ghost", run: () => saveReaderPart(), save: true }
        : null,
      info?.written
        ? { label: "Sugerir", icon: "pencil", cls: "btn small ghost", run: () => askSugerencia({ topic: topicId, part, title, regenerate: false }) }
        : null,
      info?.written
        ? { label: "Regenerar", icon: "refresh", cls: "btn small ghost", run: () => askSugerencia({ topic: topicId, part, title, regenerate: true }) }
        : null,
      {
        label: `Modo: ${READING_MODES.find(([id]) => id === readingMode)[1].toLowerCase()}`,
        icon: "book",
        cls: "btn small ghost",
        mode: true,
        run: () => applyMode(READING_MODES[(READING_MODES.findIndex(([id]) => id === readingMode) + 1) % READING_MODES.length][0]),
      },
      quick || info
        ? {
            label: "Borrar",
            icon: "x",
            cls: "btn small ghost danger",
            run: () =>
              askDelete({
                body: quick ? { kind: "quick", quick: quickId } : { kind: "part", topic: topicId, part },
                title,
                detail: quick
                  ? `Se moverá la nota rápida «${title}».`
                  : `Se moverá «${title}» con su explicación, sus demos y su mini-quiz.`,
                leaves: true,
              }),
          }
        : null,
      // The phone gives the studio bar's room to the lesson, so what that bar carried
      // lives here: nothing becomes unreachable when the chrome leaves. These are
      // menu-only at every width: one overflow, never a second row of equivalents.
      { label: "Conversación de esta parte", icon: "chat", cls: "btn small ghost", menuOnly: true, run: () => openDrawer() },
      { label: "Tema oscuro", icon: "moon", cls: "btn small ghost", menuOnly: true, run: toggleTheme },
      { label: "Configuración", icon: "settings", cls: "btn small ghost", menuOnly: true, run: () => go("#/preferencias") },
      { label: "Tutorial", icon: "deck", cls: "btn small ghost", menuOnly: true, run: () => openTutorial() },
      // «Anterior» and «Siguiente» were counted apart from the ten menu items in
      // the inventory: they move here too, so the bar has no second row of arrows.
      prev ? { label: "Anterior", icon: "back", cls: "btn small ghost", menuOnly: true, run: () => go(`#/leer/${topicId}/${prev.id}`) } : null,
      next ? { label: "Siguiente", icon: "next", cls: "btn small ghost", menuOnly: true, run: () => go(`#/leer/${topicId}/${next.id}`) } : null,
    ].filter(Boolean);

    // The one overflow: a positioned list, closed by Escape or a click outside.
    let closeMenu = () => {};
    const menu = h(
      "div",
      { class: "reader-menu", id: "reader-actions", role: "menu", hidden: true },
      actions.map((action) => {
        const item = h(
          "button",
          { class: "reader-menu-item", type: "button", role: "menuitem", onclick: () => { closeMenu(); action.run(); } },
          icon(action.icon),
          h("span", {}, action.label),
        );
        if (action.save) {
          // The row's save chip and this menu item are now the same control:
          // one label, one state, one handler, with no second rank in the bar.
          saveButton = item;
        }
        if (action.mode) modeMenuItem = item;
        return item;
      }),
    );
    const moreButton = h(
      "button",
      {
        class: "btn small ghost reader-more",
        type: "button",
        "aria-label": "Más acciones",
        title: "Más acciones",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": "reader-actions",
      },
      icon("more"),
      h("span", { class: "label" }, "Más acciones"),
    );
    const onMenuPointer = (event) => {
      if (!menu.contains(event.target) && event.target !== moreButton) closeMenu();
    };
    const onMenuKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenu();
      moreButton.focus();
    };
    closeMenu = () => {
      if (menu.hidden) return;
      menu.hidden = true;
      moreButton.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onMenuPointer, true);
      document.removeEventListener("keydown", onMenuKey);
    };
    moreButton.addEventListener("click", () => {
      if (!menu.hidden) return closeMenu();
      menu.hidden = false;
      moreButton.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onMenuPointer, true);
      document.addEventListener("keydown", onMenuKey);
      menu.querySelector("button:not(:disabled)")?.focus();
    });

    const bar = h(
      "div",
      { class: "reader-bar" },
      h("button", { class: "icon-btn reader-back", type: "button", "aria-label": "Volver", title: "Volver", onclick: () => go(quick ? "#/" : `#/tema/${topicId}`) }, icon("back")),
      h("div", { class: "title" }, h("small", {}, kicker), title),
      modeSwitch,
      barBtn(askAction.label, askAction.run, "btn small reader-ask", askAction.icon),
      moreButton,
    );
    const readerBack = bar.querySelector(".reader-back");
    if (matchMedia("(max-width: 720px)").matches) readerBack.setAttribute("aria-label", `Volver a ${quick ? "Inicio" : topic?.title || topicId}`);
    const pageLabel = h("span", { class: "reader-page" }, "1 / 1");
    const pagePrev = h("button", { class: "icon-btn", type: "button", "aria-label": "Página anterior", title: "Página anterior", onclick: () => turnPage(-1) }, icon("back"));
    const pageNext = h("button", { class: "icon-btn", type: "button", "aria-label": "Página siguiente", title: "Página siguiente", onclick: () => turnPage(1) }, icon("next"));
    const pageBar = h("div", { class: "reader-pages", hidden: true }, pagePrev, pageLabel, pageNext);
    const reader = h("div", { class: "reader" }, h("div", { class: "reader-head" }, bar, menu), info?.rolledBack ? h("p", { class: "part-rolledback", role: "status" }, ROLLBACK_NOTICE) : null, h("div", { class: "sheet-wrap" }, frame, pageBar));
    const waiting = currentEspera();
    if (waiting && waiting.topic === topicId && waiting.part === part) reader.insertBefore(esperaMount(waiting), reader.querySelector(".sheet-wrap"));
    stage.replaceChildren(topic ? h("div", { class: "reader-layout" }, reader, studyRail(topic, part, title)) : reader);
    ensureEspera();
    function applyMode(id) {
      readingMode = id;
      try { localStorage.setItem(READING_MODE_KEY, id); } catch { /* private mode */ }
      reader.classList.toggle("book", id === "libro");
      reader.classList.toggle("wide", id === "ancho");
      pageBar.hidden = id !== "libro";
      modeSwitch.value = id;
      if (modeMenuItem) {
        const short = READING_MODES.find(([mode]) => mode === id)[1].toLowerCase();
        modeMenuItem.querySelector("span").textContent = `Modo: ${short}`;
      }
      frame.contentWindow?.postMessage({ type: "learning-reading-mode", mode: id }, "*");
    }
    applyMode(readingMode);
    // The document registers its listener while loading, so the mode is said again
    // once the frame has one.
    frame.addEventListener("load", () => applyMode(readingMode));
    try {
      const query = new URLSearchParams(quick ? { quick: quickId } : { topic: topicId, ...(part ? { part } : {}) });
      const data = await request(`api/view?${query}`);
      if (seq !== readSeq) return;
      const url = data.url;
      if (!url) throw new Error("Esta parte no tiene vista HTML.");
      frame.src = withTheme(url);
      // A part read with a connection is kept on the device for reading without one.
      if (saveButton) {
        await savedReady;
        if (seq !== readSeq || !saveButton.isConnected) return;
        stage.querySelector(".study-rail")?.showSaved?.();
        if (saved.has(savedKey(topicId, part))) {
          setSaveState("Guardada en este dispositivo", true);
          // A kept copy follows the last version read online, so it is saved again in the background. The read does not
          // wait for that save, and a save that fails keeps the copy it had and shows nothing: savePart never rejects.
          savePart(topicId, part);
        } else if (!saveButton.disabled) saveReaderPart(true);
      }
    } catch (error) {
      if (seq !== readSeq) return;
      if (!error.offline || !info) return frame.replaceWith(h("p", { class: "empty" }, error.message));
      await savedReady;
      if (seq !== readSeq) return;
      stage.querySelector(".study-rail")?.showSaved?.();
      if (mode !== "app" && saved.has(savedKey(topicId, part))) {
        setSaveState("Guardada en este dispositivo", true);
        frame.src = offlineCopy(topicId, part);
      } else
        frame.replaceWith(
          h("p", { class: "empty" }, "Esta parte no está guardada en este dispositivo. Ábrela una vez con conexión y quedará guardada para leerla sin ella."),
        );
    }
  }

  // ---------- reading modes ----------
  // The frame owns the page: it is the only side that can measure itself, so the
  // studio only says which mode it wants and asks for a turn.
  function turnPage(delta) {
    const frame = document.querySelector(".reader.book iframe.sheet");
    frame?.contentWindow?.postMessage({ type: "learning-page", delta }, "*");
  }

  // ---------- results of a submitted quiz ----------
  // The reading frame announces a graded submission; the learner lands on its results
  // and watches the topic's background task read them until it settles, then goes on
  // to the next step. The main chat is a different conversation and says nothing here.
  const taskStates = new Map();
  let submitted = null;
  let showResultsStatus = () => {};
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "learning:scroll") {
      const frame = stage.querySelector("iframe.sheet");
      if (frame && event.source === frame.contentWindow && (data.direction === "up" || data.direction === "down")) scrollChrome(data.direction);
      return;
    }
    if (data && data.type === "learning-book") {
      const bar = document.querySelector(".reader-pages");
      const frame = document.querySelector(".reader iframe.sheet");
      if (!bar || !frame || event.source !== frame.contentWindow) return;
      if (!Number.isInteger(data.page) || !Number.isInteger(data.pages)) return;
      bar.querySelector(".reader-page").textContent = `${data.page} / ${data.pages}`;
      const [prev, next] = bar.querySelectorAll("button");
      prev.disabled = data.page <= 1;
      next.disabled = data.page >= data.pages;
      return;
    }
    if (data && data.type === "learning:quick-quiz" && data.entry) {
      const frame = stage.querySelector("iframe.sheet");
      if (frame && event.source === frame.contentWindow) {
        post("api/telemetry", { entry: data.entry }).catch(() => {});
      }
      return;
    }
    if (!data || data.type !== "learning:submitted" || typeof data.topic !== "string" || !Array.isArray(data.results)) return;
    const frame = stage.querySelector("iframe.sheet");
    if (!frame || event.source !== frame.contentWindow) return;
    submitted = { ...data, sawBusy: false, done: false, since: Date.now() };
    go(`#/resultados/${encodeURIComponent(data.topic)}/${encodeURIComponent(data.part || "quiz")}`);
  });
  // Called on every task summary: the reader's answers belong to the topic's task, so only
  // that task settling ends the wait. A main-chat turn is no longer evidence of anything here.
  function watchResults() {
    if (!submitted || submitted.done) return;
    const task = taskStates.get(submitted.topic);
    const pending = task && task.state !== "done" && task.state !== "failed";
    if (pending) {
      submitted.sawBusy = true;
      submitted.activity = task.activity;
    } else if (task && (submitted.sawBusy || task.updatedAt >= submitted.since)) {
      submitted.done = true;
      submitted.activity = "";
      loadLibrary().then(() => showResultsStatus());
    } else if (!task && tutor.busy) {
      // A delivery the bridge could not bind to a topic stays in the general chat.
      submitted.sawBusy = true;
      submitted.activity = tutor.activity;
    } else if (!task && submitted.sawBusy && !tutor.busy) {
      submitted.done = true;
      submitted.activity = "";
      loadLibrary().then(() => showResultsStatus());
    }
    showResultsStatus();
  }
  /** A question's own words, drawn by the shared renderer (#332): its code and formulas, never raw HTML. */
  const questionWords = (tag, props, text) => {
    const node = h(tag, props);
    window.lkQuestion.render(node, text ?? "");
    return node;
  };
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
          h("div", {}, h("p", { class: "reading" }, "El agente está leyendo tus análisis…"), submitted.activity ? h("p", { class: "muted" }, submitted.activity) : null),
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
              questionWords("p", { class: "question" }, r.enunciado || r.id),
              h("p", {}, h("strong", {}, r.ok ? "✔ Correcta" : "✘ Incorrecta"), " — elegiste ", `${r.chosen}: `, questionWords("span", {}, r.chosenText)),
              r.ok ? null : h("p", { class: "muted" }, `La correcta es ${r.correct}: `, questionWords("span", {}, r.correctText)),
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
        frame.src = withTheme(answer.url);
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
        frame.src = withTheme(`${data.url}${data.url.includes("?") ? "&" : "?"}v=${encodeURIComponent(rev)}`);
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

  // ---------- useful waiting (S6) ----------
  /** The waiting section reads only what the server publishes; no tutor code runs in the page. */
  const ESPERA_FASES = [
    ["escribiendo", "Escribiendo"],
    ["comprobando", "Comprobando"],
    ["corrigiendo", "Corrigiendo"],
    ["lista", "Lista"],
  ];
  const esperaState = { key: "", data: null, fase: null, started: 0, loading: "", revealed: false, answers: new Map(), clock: 0 };
  const esperaKey = (topic, part) => `${topic}/${part}`;
  const elapsedText = () => {
    const fromEvent = Number(esperaState.fase?.t);
    // A short `t` is the server's elapsed milliseconds; an epoch or a missing value is not.
    const ms = Number.isFinite(fromEvent) && fromEvent >= 0 && fromEvent < 86_400_000
      ? fromEvent
      : Math.max(0, Date.now() - (esperaState.started || Date.now()));
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  function startEsperaClock() {
    if (esperaState.clock) return;
    esperaState.clock = setInterval(() => {
      for (const node of document.querySelectorAll(".espera-elapsed")) node.textContent = elapsedText();
    }, 1000);
  }
  function clearWritePart() {
    const part = tutor.writePart;
    if (!part) return;
    const key = esperaKey(part.topic, part.part);
    for (const mount of stage.querySelectorAll(".espera-mount")) if (mount.dataset.esperaMount === key) mount.remove();
    tutor.writePart = null;
    esperaState.key = "";
    esperaState.data = null;
    esperaState.fase = null;
    esperaState.revealed = false;
    esperaState.answers.clear();
    esperaState.loading = "";
  }
  function setWritePart(text) {
    const found = writePartOf(text);
    const topic = found ? topicById(found.topic) : null;
    const part = topic?.parts[found.number - 1];
    if (!topic || !part) return false;
    const key = esperaKey(topic.id, part.id);
    tutor.writePart = { topic: topic.id, part: part.id, number: found.number };
    if (esperaState.key !== key) {
      esperaState.key = key;
      esperaState.data = null;
      esperaState.fase = null;
      esperaState.revealed = false;
      esperaState.answers.clear();
      esperaState.started = Date.now();
      esperaState.loading = "";
    }
    startEsperaClock();
    return true;
  }
  /** The section belongs to the topic or to the part the learner is looking at, not to the chat. */
  function currentEspera() {
    const part = tutor.writePart;
    if (!part) return null;
    const [, view, a, b] = location.hash.split("/").map(decodeURIComponent);
    if (view === "tema" && a === part.topic) return part;
    if (view === "leer" && a === part.topic && b === part.part) return part;
    return null;
  }
  function esperaMount(part) {
    return h("div", { class: "espera-mount", "data-espera-mount": esperaKey(part.topic, part.part) }, esperaCard(part));
  }
  function repaintEspera() {
    const part = currentEspera();
    if (!part) return;
    const key = esperaKey(part.topic, part.part);
    let mount = [...stage.querySelectorAll(".espera-mount")].find((node) => node.dataset.esperaMount === key);
    if (!mount) {
      // A turn can start while the learner is already on the page: the section has to
      // appear where they are, not wait for a hash change to draw it.
      const [, view] = location.hash.split("/");
      const host = view === "tema" ? stage.querySelector(".topic-head > div") : stage.querySelector(".reader");
      if (!host) return;
      mount = esperaMount(part);
      const before = view === "tema" ? host.querySelector(".topic-route-heading") : host.querySelector(".sheet-wrap");
      if (before) host.insertBefore(mount, before);
      else host.append(mount);
    }
    mount.replaceChildren(esperaCard(part));
  }
  async function loadEspera(reveal = false) {
    const part = tutor.writePart;
    if (!part) return;
    const key = esperaKey(part.topic, part.part);
    if (esperaState.key !== key) return;
    if (!reveal && (esperaState.data || esperaState.loading === key)) return;
    if (reveal && esperaState.revealed) return;
    esperaState.loading = key;
    if (reveal) esperaState.revealed = true;
    try {
      const query = new URLSearchParams({ topic: part.topic, part: part.part, ...(reveal ? { revelar: "1" } : {}) });
      const data = await request(`api/espera?${query}`);
      if (esperaState.key !== key) return;
      esperaState.data = reveal && esperaState.data
        ? { ...esperaState.data, preguntas: data.preguntas ?? esperaState.data.preguntas, profesor: data.profesor ?? null }
        : data;
    } catch {
      // The endpoint may still be starting: progress and the map placeholder stay quiet.
      if (reveal) esperaState.revealed = false;
    } finally {
      esperaState.loading = "";
      repaintEspera();
    }
  }
  function ensureEspera() {
    if (!currentEspera()) return;
    startEsperaClock();
    if (!esperaState.data && !esperaState.loading) void loadEspera(false);
  }
  const answerLetter = (item, choice) => {
    const expected = String(item?.respuesta ?? "").trim();
    return Boolean(expected) && (expected.toUpperCase() === choice || expected === item?.opciones?.[choice] || expected.toUpperCase().startsWith(`${choice}.`));
  };
  function revealFeedback(node, item) {
    const expected = String(item.respuesta ?? "").trim();
    const letter = expected.toUpperCase()[0];
    node.className = "espera-feedback";
    node.replaceChildren(
      h("strong", {}, `Respuesta: ${letter || expected}`),
      expected.length > 1 && expected.toUpperCase() !== letter ? ` · ${expected.slice(letter.length).replace(/^\.\s*/, "")}` : null,
      item.explicacion ? h("span", {}, ` ${item.explicacion}`) : null,
    );
  }
  function choiceFeedback(node, item, tipo, choice) {
    if (tipo === "repaso") {
      const correct = answerLetter(item, choice);
      node.className = `espera-feedback ${correct ? "good" : "bad"}`;
      node.replaceChildren(document.createTextNode(correct ? "Correcto" : "Incorrecto"), item.explicacion ? h("span", {}, ` ${item.explicacion}`) : null);
      return;
    }
    if (item.respuesta) {
      revealFeedback(node, item);
      node.append(document.createTextNode(` Habías elegido ${choice}.`));
      return;
    }
    node.className = "espera-feedback";
    node.textContent = "Anotado. Podrás comparar cuando la parte esté lista.";
  }
  function questionCard(item, tipo) {
    const choices = item.opciones && typeof item.opciones === "object" ? Object.entries(item.opciones) : [];
    const name = `espera-${String(item.id ?? "q").replace(/[^\w-]/g, "")}`;
    const chosen = esperaState.answers.get(item.id);
    const card = h("fieldset", { class: "espera-q", "data-qid": item.id }, h("legend", {}, item.enunciado));
    for (const [letter, text] of choices) {
      const id = `${name}-${letter}`;
      card.append(
        h(
          "div",
          { class: `espera-option${chosen === letter ? " chosen" : ""}` },
          h("input", {
            type: "radio", id, name, value: letter, checked: chosen === letter,
            onchange: () => {
              esperaState.answers.set(item.id, letter);
              for (const option of card.querySelectorAll(".espera-option")) option.classList.toggle("chosen", option.querySelector("input").value === letter);
              choiceFeedback(card.querySelector(".espera-feedback"), item, tipo, letter);
            },
          }),
          h("label", { for: id }, `${letter}. ${text}`),
        ),
      );
    }
    const feedback = h("p", { class: "espera-feedback", "aria-live": "polite", "aria-atomic": "true" });
    if (chosen) choiceFeedback(feedback, item, tipo, chosen);
    else if (tipo === "antes" && item.respuesta) revealFeedback(feedback, item);
    card.append(feedback);
    return card;
  }
  function esperaCard(part) {
    const data = esperaState.key === esperaKey(part.topic, part.part) ? esperaState.data : null;
    const fase = esperaState.fase;
    const at = ESPERA_FASES.findIndex(([id]) => id === fase?.fase);
    const label = at < 0 ? "Escribiendo" : fase.fase === "corrigiendo" && Number.isFinite(Number(fase.hallazgos))
      ? `Corrigiendo (${fase.hallazgos} hallazgos)`
      : ESPERA_FASES[at][1];
    const block = (title, items) => (items || []).length
      ? h("div", { class: "espera-block" }, h("h4", {}, title), h("ul", {}, items.map((item) => h("li", {}, String(item)))))
      : null;
    const mapa = data?.mapa;
    const preguntas = data?.preguntas;
    const glosario = data?.glosario;
    return h(
      "section",
      { class: "espera", "aria-labelledby": "espera-title" },
      h(
        "header",
        { class: "espera-head" },
        h("h2", { id: "espera-title" }, `Mientras se escribe la Parte ${part.number}`),
        h("p", { class: "espera-progreso", role: "status", "aria-live": "polite", "aria-atomic": "true" }, label, " · ", h("span", { class: "espera-elapsed" }, elapsedText())),
        h("ol", { class: "espera-fases", "aria-label": "Fases de la escritura" }, ESPERA_FASES.map(([, text], i) =>
          h("li", { class: i < at ? "done" : null, ...(i === at ? { "aria-current": "step" } : {}) }, text),
        )),
        fase?.fase === "lista" ? btn(`Abrir la Parte ${part.number}`, () => { closeDrawer(); go(`#/leer/${part.topic}/${part.part}`); }, "btn small primary", "book") : null,
      ),
      h(
        "div",
        { class: "espera-grid" },
        h(
          "div",
          { class: "espera-block" },
          h("h3", {}, "El mapa de esta parte"),
          mapa
            ? h(
                "div",
                { class: "espera-grid" },
                block("Aprenderás", mapa.aprende),
                block("Subtemas", mapa.subtemas),
                block("Necesitas antes", (mapa.dependeDe || []).map((dep) => `${dep.number ? `${dep.number} · ` : ""}${dep.title || ""}${dep.written ? " · ya escrita" : ""}`.trim())),
              )
            : h("p", { class: "espera-quiet" }, "Preparando el mapa de esta parte…"),
        ),
        preguntas
          ? h(
              "div",
              { class: "espera-block" },
              h("h3", {}, preguntas.tipo === "repaso" ? "Repaso" : "Antes de leer"),
              preguntas.tipo === "repaso"
                ? h("p", { class: "espera-quiet" }, "De tus mini-quizzes anteriores: las que fallaste van primero.")
                : h("p", { class: "espera-quiet" }, "No es un examen: elige lo que creas y compruébalo cuando la parte esté lista."),
              (preguntas.items || []).map((item) => questionCard(item, preguntas.tipo)),
            )
          : null,
        glosario?.estado === "listo"
          ? h(
              "div",
              { class: "espera-block" },
              h("h3", {}, "Glosario"),
              glosario.preliminar ? h("p", { class: "espera-quiet" }, "Preliminar: se afinará al escribir la parte.") : null,
              h("ul", {}, (glosario.terminos || []).map((term) =>
                h("li", {}, h("b", {}, term.termino), ` · ${term.definicion || ""}`, term.ejemplo ? h("em", {}, ` p. ej. ${term.ejemplo}`) : null),
              )),
            )
          : glosario?.estado === "generando"
            ? h("p", { class: "espera-quiet" }, "preparando glosario…")
            : null,
        data?.profesor
          ? h("div", { class: "espera-profesor" }, h("h3", {}, "Lo que dijo el profesor"), h("p", {}, JSON.stringify(data.profesor)))
          : null,
      ),
    );
  }

  // ---------- tutor ----------
  const tutor = { busy: false, alive: true, activity: "", unread: 0, note: null, turnNote: null, turnTopic: null, turnTema: null, writePart: null };
  let chats = { activo: "", chats: [] };
  let chatRevision = 0;
  const chatHeading = h("strong", {}, "Chats");
  const chatList = h("div", { class: "chat-list", "aria-label": "Conversaciones" });
  const relativeUse = (time) => {
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "Ahora";
    if (minutes < 60) return `Hace ${minutes} min`;
    if (minutes < 1440) return `Hace ${Math.floor(minutes / 60)} h`;
    return `Hace ${Math.floor(minutes / 1440)} días`;
  };
  function setChats(doc) {
    chats = doc;
    chatRevision++;
    chatHeading.textContent = doc.chats.find((chat) => chat.id === doc.activo)?.nombre || "Chats";
    controls(chatList, 3, ["c03-open", "c03-options", "c03-rename", "c03-delete", "c03-export"]);
    chatList.replaceChildren(...doc.chats.map((chat) => {
      const open = h("button", { type: "button", class: "chat-open", "aria-current": chat.id === doc.activo ? "true" : null, onclick: () => chatAction("api/chats/abrir", { id: chat.id }) },
        h("span", { class: "chat-name" }, chat.nombre), h("span", { class: "chat-used" }, relativeUse(chat.usado)),
        chat.contexto && h("span", { class: "chat-context" }, h("span", { role: "progressbar", "aria-label": `Contexto de ${chat.nombre}`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": chat.contexto.porcentaje, class: "chat-meter" }, h("span", { style: `width:${Math.max(0, Math.min(100, chat.contexto.porcentaje))}%` })), `${chat.contexto.porcentaje}%`));
      const options = h("details", { class: "chat-options" }, h("summary", { "aria-label": `Opciones de ${chat.nombre}` }, "⋯"),
        h("div", { class: "chat-menu" },
          btn("Renombrar", () => { options.open = false; const nombre = prompt("Nombre de la conversación", chat.nombre); if (nombre !== null) chatAction("api/chats/renombrar", { id: chat.id, nombre }); }),
          btn("Borrar", () => { options.open = false; if (confirm(`¿Borrar la conversación «${chat.nombre}»?`)) chatAction("api/chats/borrar", { id: chat.id }); }),
          btn("Exportar", () => { options.open = false; chatAction("api/chats/exportar", { id: chat.id }, true); })));
      return h("div", { class: "chat-row" }, open, options);
    }));
  }
  async function chatAction(path, body, exportOnly = false) {
    try {
      const result = await post(path, body);
      if (exportOnly) toast(result.path);
      else setChats(result);
    } catch (error) { toast(error.message); }
  }
  const createChat = () => { const nombre = prompt("Nombre de la conversación"); if (nombre !== null) chatAction("api/chats", { nombre }); };
  const thread = controls(h("div", { class: "thread", "aria-live": "polite" }), 2, ["c02-next", "c02-note"]);
  const composerText = control(h("textarea", { rows: "1", "aria-label": "Mensaje para el tutor", placeholder: "Escribe al tutor…" }), 1, "c01-composer");
  const stateLine = h("span", { class: "state" }, "Conectando…");
  const pillWhat = h("span", { class: "what" }, "Tutor");
  const pillBadge = h("span", { class: "badge", hidden: true });
  const pill = h("button", { class: "tutor-pill", type: "button", "aria-controls": "drawer", "aria-expanded": "false", onclick: () => (document.body.classList.contains("drawer-open") ? closeDrawer() : openDrawer()) }, h("span", { class: "dot" }), pillWhat, pillBadge);
  const menu = h(
    "div",
    { class: "menu", role: "menu", id: "tutor-mas-opciones" },
    control(btn("Detener lo que está haciendo", () => { setMenuOpen(false); post("abort").catch((e) => toast(e.message)); }, "", "stop"), 6, "c06-stop"),
    control(btn("Reiniciar el tutor", () => { setMenuOpen(false); post("restart").catch((e) => toast(e.message)); }, "", "restart"), 6, "c06-restart"),
  );
  // «Nueva conversación» belongs to Conversaciones, not to the frame menu: the handler is kept.
  const newConversation = control(btn("Nueva conversación", () => {
    setMenuOpen(false);
    if (confirm("¿Empezar una conversación nueva con el tutor? La actual queda guardada en Pi.")) post("new-session").catch((e) => toast(e.message));
  }, "", "fresh"), 3, "c03-new-conversation");
  const asks = new Map();
  const assistant = new Map();
  const activities = new Map();
  let scheduled = false;

  const intro = h(
    "div",
    { class: "intro" },
    h("h3", {}, "Tu tutor"),
    h("p", {}, "Trabaja de fondo con tu método de siempre. Pídele lo que necesites; cuando tenga que preguntarte algo verás aquí unos botones. Para empezar algo nuevo, usa «Aprender algo nuevo» y elige el modo ahí."),
      controls(
        h(
          "div",
          { class: "chips", role: "group", "aria-label": "Preguntas sugeridas" },
          ["¿Qué tengo pendiente en mis temas?", "Sigamos con mi último tema.", "Explícame de nuevo lo último que leí."].map((text) => h("button", { class: "chip", type: "button", "data-block-during-turn": "", onclick: () => say(text) }, text)),
        ),
        1, ["c01-chip"],
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
    paintTurnState();
  }
  // One primary per state: the server refuses a prompt while a turn is open, so the other
  // ways to start one are disabled and drawn as unavailable, not left looking runnable.
  function paintTurnState() {
    const busy = Boolean(tutor.busy);
    // The outputs are built after the idle state is painted, so they join the blocked set here:
    // every way out of a finished turn is unavailable while the next one runs.
    for (const node of document.querySelectorAll(".drawer [data-block-during-turn], .thread .next-cta button, .thread .note-cta button")) {
      node.setAttribute("data-block-during-turn", "");
      node.disabled = busy;
      node.setAttribute("aria-disabled", String(busy));
    }
    const send = document.querySelector(".composer .send");
    const stop = document.querySelector(".composer .stop");
    if (!send || !stop) return;
    send.classList.toggle("is-primary", !busy);
    stop.classList.toggle("is-primary", busy);
    stop.disabled = !busy;
    stop.setAttribute("aria-disabled", String(!busy));
  }
  const atBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
  /** A verdict about a turn sits above that turn's first tutor text; without one it goes last (#393). */
  function appendAbove(node, before) {
    const tutorNode = before ? assistant.get(String(before))?.node : undefined;
    if (!tutorNode?.isConnected) return append(node);
    const stick = atBottom();
    tutorNode.before(node);
    if (stick) thread.scrollTop = thread.scrollHeight;
  }
  function append(node) {
    const stick = atBottom();
    // The intro copy leaves once the chat starts, but its suggested prompts keep their place in
    // the thread: while a turn runs they are visibly disabled instead of pretending to be usable.
    if (intro.isConnected) {
      intro.classList.add("compact");
      intro.querySelector("h3")?.setAttribute("hidden", "");
      intro.querySelector("p")?.setAttribute("hidden", "");
    }
    thread.append(node);
    if (stick) thread.scrollTop = thread.scrollHeight;
  }
  const noteUnread = () => {
    if (!document.body.classList.contains("drawer-open")) tutor.unread++;
    updatePill();
  };
  function openDrawer(prefill) {
    // The two panels share the right edge: the tutor never opens on top of Tareas.
    const fromTasks = document.body.classList.contains("tasks-open");
    closeTasks();
    showChrome();
    document.body.classList.add("drawer-open");
    pill.setAttribute("aria-expanded", "true");
    tutor.unread = 0;
    updatePill();
    if (typeof prefill === "string") {
      composerText.value = prefill;
      grow();
      composerText.focus();
      composerText.setSelectionRange(prefill.length, prefill.length);
    } else if (fromTasks) composerText.focus();
    thread.scrollTop = thread.scrollHeight;
  }
  function closeDrawer() {
    const hadFocus = document.getElementById("drawer")?.contains(document.activeElement);
    document.body.classList.remove("drawer-open");
    pill.setAttribute("aria-expanded", "false");
    if (hadFocus) pill.focus();
  }
  /**
   * A writing request travels with what the learner already said and chose: the server
   * keeps that context, so the prompt carries it instead of the prompt builder guessing it.
   */
  const withContext = async (text, tema) => {
    try {
      const data = await request(`api/contexto?tema=${encodeURIComponent(tema)}`);
      return typeof data.texto === "string" && data.texto ? `${text}\n\n${data.texto}` : text;
    } catch { return text; }
  };
  /** Sends one message to the tutor. Returns whether the studio accepted the turn. */
  async function say(text, tema, { deep = false } = {}) {
    openDrawer();
    try {
      const body = { text: tema ? await withContext(text, tema) : text };
      // Deep tutoring names the topic so the engine checks that topic, never a guess.
      if (deep && tema) body.tema = tema;
      await post("prompt", body);
      if (setWritePart(text)) { ensureEspera(); repaintEspera(); }
      return true;
    } catch (error) {
      append(h("div", { class: "notice error" }, `No se pudo enviar: ${error.message}`));
      return false;
    }
  }
  /** The topic being taught right now: only its page binds the tutor, the rest of the app chats. */
  const deepTopic = () => {
    const [, view, a] = location.hash.split("/").map(decodeURIComponent);
    return view === "tema" && a ? a : "";
  };
  function grow() {
    composerText.style.height = "auto";
    composerText.style.height = `${Math.min(composerText.scrollHeight, 180)}px`;
  }
  const sendComposer = () => {
    const text = composerText.value.trim();
    if (!text) return;
    const tema = deepTopic();
    // The typed text belongs to the learner until the studio accepts the turn: it is cleared only
    // then, so a refused or failed send leaves it there to send again.
    say(text, tema || undefined, { deep: Boolean(tema) }).then((sent) => {
      if (!sent || composerText.value.trim() !== text) return;
      composerText.value = "";
      grow();
    });
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
  /** The same question card serves the main chat and a topic task; only the route differs. */
  function dialogCard(dialog, answer) {
    const field = h("textarea", { rows: "3", placeholder: dialog.placeholder || "Tu respuesta" });
    const card = controls(
      h(
        "section",
        { class: "ask-card", "aria-label": "Pregunta del tutor" },
      h("span", { class: "label" }, "El tutor te pregunta"),
      h("h4", {}, dialog.title || "¿Cómo seguimos?"),
      dialog.message ? h("p", {}, dialog.message) : null,
      dialog.method === "select"
        ? h("div", { class: "options" }, (dialog.options || []).map((option) => h("button", { type: "button", onclick: () => answer({ value: String(option) }, card) }, String(option))))
        : dialog.method === "confirm"
          ? h("div", { class: "options" }, h("button", { type: "button", onclick: () => answer({ confirmed: true }, card) }, "Sí"), h("button", { type: "button", onclick: () => answer({ confirmed: false }, card) }, "No"))
          : h("div", { class: "options" }, field, h("button", { type: "button", onclick: () => answer({ value: field.value }, card) }, "Enviar respuesta")),
        h("button", { class: "cancel", type: "button", onclick: () => answer({ cancelled: true }, card) }, "Ahora no"),
      ),
      5, ["c05-option", "c05-confirm", "c05-answer", "c05-send-answer", "c05-later"],
    );
    return card;
  }
  function askCard(dialog) {
    return dialogCard(dialog, async (body, card) => {
      card.querySelectorAll("button, textarea").forEach((n) => (n.disabled = true));
      try {
        await post("dialog", { id: dialog.id, ...body });
      } catch (error) {
        card.querySelectorAll("button, textarea").forEach((n) => (n.disabled = false));
        toast(error.message);
      }
    });
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
  on("chats", setChats);
  const initialChatRevision = chatRevision;
  request("api/chats").then((doc) => { if (chatRevision === initialChatRevision) setChats(doc); }).catch((error) => toast(error.message));
  /**
   * A turn the studio lost (a deploy stopped it) is not a silent empty chat: the chat says
   * so in Spanish and offers the way back to the topic it was teaching.
   */
  function interruptedCard({ topic, title, cause }) {
    const name = title || topic || "";
    // A deploy ended the turn on purpose: the request is sent again, and the card says why.
    const text = cause === "update"
      ? (name ? `Actualizamos el estudio y se interrumpió tu última petición sobre «${name}»; vuelve a enviarla.` : "Actualizamos el estudio y se interrumpió tu última petición; vuelve a enviarla.")
      : (name ? `El turno se interrumpió; el tutor puede seguir con ${name}.` : "El turno se interrumpió; el tutor puede seguir.");
    const resume = () => (topic ? say(`Sigamos con ${name} (carpeta ${topic}).`, topic, { deep: true }) : say("Sigamos."));
    const back = control(btn(name ? `Seguir con ${name}` : "Seguir", resume, "btn small ghost turn-link", "next"), 2, "c02-interrupted");
    back.setAttribute("data-block-during-turn", "");
    return h("div", { class: "next-cta interrupted" }, h("p", {}, text), back);
  }
  on("history", ({ messages, note, interrupted }) => {
    thread.replaceChildren();
    assistant.clear();
    activities.clear();
    showNote(note);
    if (!messages.length) thread.append(intro);
    for (const m of messages) {
      if (m.role === "user") thread.append(h("div", { class: "msg user" }, m.text));
      else if (m.role === "studio") thread.append(h("div", { class: "msg studio" }, m.text));
      else thread.append(h("div", { class: "msg assistant" }, ...markdown(m.text).childNodes));
    }
    if (interrupted) append(interruptedCard(interrupted));
    thread.scrollTop = thread.scrollHeight;
  });
  on("state", (s) => {
    // The topic the turn teaches, from the studio: the end of a turn that wrote nothing still
    // knows which topic to offer the next step of.
    if (s.tema !== undefined) tutor.turnTema = s.tema;
    if (tutor.busy && !s.busy) offerTurnEnd();
    tutor.busy = s.busy;
    tutor.alive = s.alive;
    if (!s.busy) {
      tutor.activity = "";
      // A turn without a `lista` event leaves nothing to study; the open button keeps it alive.
      if (tutor.writePart && esperaState.fase?.fase !== "lista") clearWritePart();
    }
    updatePill();
  });
  on("user", ({ text }) => {
    tutor.turnNote = null;
    tutor.turnTopic = null;
    if (!setWritePart(text)) clearWritePart();
    else { ensureEspera(); repaintEspera(); }
    append(h("div", { class: "msg user" }, text));
  });
  on("fase", (event) => {
    const part = tutor.writePart;
    if (!part || !event || (event.topic && event.topic !== part.topic) || (event.part && event.part !== part.part)) return;
    if (!ESPERA_FASES.some(([id]) => id === event.fase)) return;
    esperaState.fase = { fase: event.fase, hallazgos: event.hallazgos, t: event.t };
    if (event.fase === "lista") void loadEspera(true);
    repaintEspera();
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
  // The studio's own verdict, never the tutor's: a system notice in the conversation (#393).
  on("studio", ({ text, before }) => { appendAbove(h("div", { class: "msg studio" }, String(text ?? "")), before); noteUnread(); });
  // The tutor writes notes inside the vault: the chat hands back the way to the one it wrote.
  const noteRoute = (note) => {
    if (note?.quick) return library.quick.some((q) => q.id === note.quick) ? `#/rapido/${encodeURIComponent(note.quick)}` : null;
    const topic = note ? topicById(note.topic) : null;
    if (note?.diagnosis) return topic ? `#/leer/${note.topic}/quiz` : null;
    const part = topic ? topic.parts[note.index - 1] : null;
    return part ? `#/leer/${note.topic}/${part.id}` : null;
  };
  const openNote = (note) => {
    const route = noteRoute(note);
    if (!route) return;
    closeDrawer();
    go(route);
  };
  const noteLabel = (note) => note?.diagnosis ? "Ir al diagnóstico" : "Ir a la nota";
  const noteButton = (note) => (noteRoute(note) ? btn(noteLabel(note), () => openNote(note), "btn small ghost", "book") : null);
  // A busy→idle transition can repeat when an aborted turn still answers a pending dialog.
  // Keyed by what it offers, an answer's way out is appended once, however often it is repainted.
  const appendTurnOutput = (node, key) => {
    if ([...thread.querySelectorAll("[data-turn-output]")].some((old) => old.dataset.turnOutput === key)) return;
    node.setAttribute("data-turn-output", key);
    append(node);
    paintTurnState();
  };
  // A turn ends with what to do next, right under the explanation: the topic it worked on
  // offers its next step (the learner never has to guess it from the reply), and a turn that
  // wrote a note offers the way to it. The step comes from the engine's own report on the topic
  // — the library is read again, because the turn may have created or advanced it — and never
  // from which file the turn happened to write: a turn that wrote nothing still ends with it.
  const offerTurnEnd = async () => {
    const note = tutor.turnNote;
    // The topic the turn taught, even when it wrote nothing: the studio knows it from the turn.
    const topicId = tutor.turnTopic || tutor.turnTema;
    tutor.turnNote = null;
    tutor.turnTopic = null;
    if (!note && !topicId) return;
    await loadLibrary();
    const topic = topicId ? topicById(topicId) : null;
    const step = topic ? nextStep(topic) : null;
    const [label, action] = step ? step.cta : [];
    // One button per destination: when the engine's step already opens the note the turn wrote,
    // only one of the two is drawn. A part is offered by its own name («Ir a Parte N»), so the
    // step wins there; the diagnosis keeps the offer #179 gave it («Ir al diagnóstico»).
    const sameRoute = Boolean(note && action && action.route && action.route === noteRoute(note));
    const stepWins = sameRoute && !note.diagnosis;
    if (step && !(sameRoute && note.diagnosis)) {
      const run = () => {
        closeDrawer();
        action();
      };
      appendTurnOutput(h("div", { class: "next-cta" }, h("p", {}, h("strong", {}, `${step.label}: `), step.text), btn(label, run, "btn small ghost turn-link", "next")), label);
    }
    if (!note || stepWins) return;
    showNote(note);
    const button = noteButton(note);
    if (button) appendTurnOutput(h("div", { class: "note-cta" }, button), noteLabel(note));
  };
  // The head keeps the way back to the last note the tutor wrote, so a reloaded tab still has it.
  const noteBtn = control(btn("Ir a la nota", () => openNote(tutor.note), "btn small ghost", "book"), 2, "c02-head-note");
  noteBtn.setAttribute("data-block-during-turn", "");
  noteBtn.style.display = "none";
  const showNote = (note) => {
    tutor.note = noteRoute(note) ? note : null;
    noteBtn.style.display = tutor.note ? "" : "none";
    noteBtn.replaceChildren(icon("book"), noteLabel(tutor.note));
    noteBtn.title = !tutor.note ? "" : tutor.note.quick ? "Ir a la nota rápida" : tutor.note.diagnosis ? "Ir al diagnóstico inicial" : `Ir a la nota: Parte ${tutor.note.index}`;
  };
  on("tool", ({ phase, id, label, ok, note, topic, chat }) => {
    // A row belongs to the chat that produced it; before the list loads there is nothing to compare.
    if (chat && chats.activo && chat !== chats.activo) return;
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
  on("error", ({ message, before }) => appendAbove(h("div", { class: "notice error" }, message), before));
  on("library_changed", () => loadLibrary());
  events.onerror = () => {
    stateLine.textContent = "Reconectando…";
  };

  // ---------- background tasks ----------
  // A topic's reader work owns a Session and a tagged stream. The panel mirrors those
  // frames without ever writing into the main chat; the pill is the always-visible sign
  // that something is working or waiting for the learner.
  const TASK_STATE_TEXT = {
    working: "Trabajando",
    waiting: "Esperando turno",
    asking: "Preguntándote",
    done: "Terminada",
    failed: "Fallida",
    unknown: "Estado desconocido",
  };
  const KNOWN_TASK_STATES = new Set(["working", "waiting", "asking", "done", "failed"]);
  const STOPPABLE_TASK_STATES = new Set(["working", "waiting", "asking"]);
  // «Quitar» hides one finished instance, never a topic forever. The summary carries no
  // run id, so the instance is its final state plus the activity it reported; the browser
  // keeps that small map with the studio's other UI state.
  const DISMISSED_KEY = "estudio.tareas.descartadas";
  const readDismissals = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch { return {}; }
  };
  const dismissedTasks = readDismissals();
  const saveDismissals = () => {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedTasks)); } catch { /* private mode */ }
  };
  const taskInstance = (state, activity) => JSON.stringify({ state, activity: String(activity ?? "") });
  function hiddenTask(topic, state, activity) {
    const signature = taskInstance(state, activity);
    const stored = dismissedTasks[topic];
    if (stored === undefined) return false;
    // A live state, or a different terminal run, belongs to another instance: forget the old one.
    if (STOPPABLE_TASK_STATES.has(state) || stored !== signature) {
      delete dismissedTasks[topic];
      saveDismissals();
      return false;
    }
    return true;
  }
  const taskCards = new Map();
  const tasksList = h("div", { class: "tasks-list", "aria-label": "Tareas de fondo" },
    h("p", { class: "tasks-empty muted" }, "Todavía no hay tareas de fondo."));
  const tasksBadge = h("span", { class: "badge", hidden: true });
  const tasksWhat = h("span", { class: "what" }, "Tareas");
  const tasksPill = h("button", { class: "tasks-pill", type: "button", "aria-controls": "tasks-panel", "aria-expanded": "false", onclick: () => (document.body.classList.contains("tasks-open") ? closeTasks() : openTasks()) },
    h("span", { class: "dot" }), tasksWhat, tasksBadge);
  const tasksPanel = h(
    "aside",
    { class: "tasks-panel", id: "tasks-panel", "aria-label": "Tareas de fondo" },
    h("div", { class: "tasks-head" },
      h("h2", {}, "Tareas"),
      h("p", { class: "muted" }, "Cada tema trabaja en su propia conversación."),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Cerrar las tareas", onclick: closeTasks }, icon("x"))),
    tasksList,
  );
  // Its own scrim, not the tutor's: existing pages ask for `.scrim` and expect one.
  const tasksScrim = h("div", { class: "tasks-scrim", "aria-hidden": "true", onclick: closeTasks });

  // ---------- the one labelled overflow ----------
  // Three shell controls leave the bar together: the theme, Configuración and Tutorial.
  // Their old handlers are kept verbatim; only their rank and their container change.
  const contextMenu = h(
    "div",
    { class: "context-menu", id: "context-menu", role: "menu", "aria-label": "Contexto", hidden: true },
    themeButton(),
    h("button", { type: "button", role: "menuitem", onclick: () => { closeContextMenu(); go("#/preferencias"); } }, icon("settings"), h("span", {}, "Configuración")),
    h("button", { type: "button", role: "menuitem", onclick: () => { closeContextMenu(); openTutorial(); } }, icon("deck"), h("span", {}, "Tutorial")),
  );
  const contextTrigger = h(
    "button",
    {
      class: "context-trigger",
      type: "button",
      "aria-label": "Contexto",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-controls": "context-menu",
    },
    h("span", { class: "label" }, "Contexto"),
    icon("more"),
  );
  function closeContextMenu(returnFocus = false) {
    if (contextMenu.hidden) return;
    contextMenu.hidden = true;
    contextTrigger.setAttribute("aria-expanded", "false");
    if (returnFocus) contextTrigger.focus();
  }
  function openContextMenu() {
    if (!contextMenu.hidden) return;
    contextMenu.hidden = false;
    contextTrigger.setAttribute("aria-expanded", "true");
    contextMenu.querySelector("button")?.focus();
  }
  contextTrigger.addEventListener("click", () => {
    if (contextMenu.hidden) openContextMenu();
    else closeContextMenu(true);
  });
  document.addEventListener("pointerdown", (event) => {
    if (contextMenu.hidden) return;
    if (!contextMenu.contains(event.target) && !contextTrigger.contains(event.target)) closeContextMenu();
  });
  contextMenu.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...contextMenu.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    event.preventDefault();
  });

  function openTasks() {
    closeDrawer();
    document.body.classList.add("tasks-open");
    tasksPill.setAttribute("aria-expanded", "true");
    tasksPanel.querySelector(".icon-btn")?.focus();
  }
  function closeTasks() {
    const hadFocus = tasksPanel.contains(document.activeElement);
    document.body.classList.remove("tasks-open");
    tasksPill.setAttribute("aria-expanded", "false");
    if (hadFocus) tasksPill.focus();
  }
  const taskTitle = (topic) => library.topics.find((t) => t.id === topic)?.title || topic;
  function paintTaskTitles() {
    for (const record of taskCards.values()) {
      record.title.textContent = taskTitle(record.topic);
      record.abort.setAttribute("aria-label", `Detener la tarea de ${record.title.textContent}`);
      record.dismiss.setAttribute("aria-label", `Quitar la tarea de ${record.title.textContent} de la lista`);
    }
  }
  function updateTasksPill() {
    const states = [...taskStates.values()];
    const active = states.filter((t) => t.state === "working" || t.state === "waiting").length;
    const asking = states.some((t) => t.state === "asking") || [...taskCards.values()].some((r) => r.dialogs.size > 0);
    tasksPill.className = `tasks-pill${asking ? " asking" : active ? " working" : ""}`;
    tasksWhat.textContent = asking ? "Tareas · te pregunta algo" : active ? `Tareas · ${active} trabajando` : "Tareas";
    tasksPill.setAttribute("aria-label", asking ? "Tareas: te pregunta algo" : `Tareas: ${active} trabajando`);
    tasksBadge.hidden = active === 0;
    tasksBadge.textContent = String(active);
  }
  // The note a task's own tool wrote is the way to what it produced. The task view
  // has no destination field, so no link is drawn unless that note (or a listed
  // topic) really routes somewhere.
  function paintTaskResult(record, state) {
    record.way.replaceChildren();
    if (state !== "done") return;
    const note = record.note;
    const route = note ? noteRoute(note) : topicById(record.topic) ? `#/tema/${encodeURIComponent(record.topic)}` : null;
    if (!route) {
      record.way.append(h("p", { class: "task-no-result muted" }, "Esta tarea no dejó una ruta que se pueda abrir."));
      return;
    }
    const label = note ? noteLabel(note) : "Ir al tema";
    record.way.append(btn(label, () => { closeTasks(); closeDrawer(); go(route); }, "btn small ghost turn-link", note ? "book" : "next"));
  }
  function paintTask(record) {
    const view = taskStates.get(record.topic) ?? {};
    const state = KNOWN_TASK_STATES.has(view.state) ? view.state : "unknown";
    record.card.dataset.state = state;
    record.state.textContent = TASK_STATE_TEXT[state];
    if (view.queued) record.state.textContent += ` · ${view.queued} en cola`;
    record.state.title = record.state.textContent;
    record.activity.textContent = view.activity ?? "";
    const stoppable = STOPPABLE_TASK_STATES.has(state);
    record.abort.hidden = !stoppable;
    record.dismiss.hidden = stoppable;
    paintTaskResult(record, state);
  }
  function ensureTaskCard(topic) {
    let record = taskCards.get(topic);
    if (record) return record;
    tasksList.querySelector(".tasks-empty")?.remove();
    const title = h("h3", { class: "task-title" }, taskTitle(topic));
    const state = h("span", { class: "task-state" });
    const abort = btn("Detener", async () => {
      try {
        await post("api/tareas/abortar", { task: topic });
      } catch (error) { toast(error.message); }
    }, "btn small ghost danger task-abort", "stop");
    const dismiss = btn("Quitar", () => dismissTask(record), "btn small ghost task-dismiss");
    const activity = h("p", { class: "task-activity muted" });
    const way = h("div", { class: "task-way" });
    const transcript = h("div", { class: "task-transcript", "aria-live": "polite" });
    const card = h("section", { class: "task-card", "data-task": topic },
      h("div", { class: "task-head" }, title, state, abort, dismiss), activity, way, transcript);
    record = { topic, card, title, state, abort, dismiss, activity, way, transcript, note: null, stream: null, messages: new Map(), tools: new Map(), dialogs: new Map() };
    taskCards.set(topic, record);
    tasksList.append(card);
    paintTask(record);
    abort.setAttribute("aria-label", `Detener la tarea de ${title.textContent}`);
    dismiss.setAttribute("aria-label", `Quitar la tarea de ${title.textContent} de la lista`);
    return record;
  }
  function dismissTask(record) {
    const view = taskStates.get(record.topic) ?? {};
    dismissedTasks[record.topic] = taskInstance(view.state, view.activity);
    saveDismissals();
    const hadFocus = record.card.contains(document.activeElement);
    record.stream?.close();
    record.card.remove();
    taskCards.delete(record.topic);
    if (hadFocus) tasksPanel.querySelector(".icon-btn")?.focus();
  }
  function setTaskViews(views) {
    if (!Array.isArray(views)) return;
    for (const view of views) {
      if (!view || typeof view.topic !== "string") continue;
      const activity = typeof view.activity === "string" ? view.activity : "";
      if (hiddenTask(view.topic, view.state, activity)) continue;
      taskStates.set(view.topic, {
        state: view.state,
        activity,
        queued: Number(view.queued) || 0,
        updatedAt: Date.now(),
      });
      const record = ensureTaskCard(view.topic);
      paintTask(record);
      openTaskStream(view.topic);
    }
    updateTasksPill();
    watchResults();
  }
  function updateTaskState(topic, data) {
    const state = data.estado ?? data.state;
    if (!state) return;
    const previous = taskStates.get(topic) ?? {};
    const activity = typeof data.activity === "string" ? data.activity : previous.activity ?? "";
    const hadDismissal = Object.hasOwn(dismissedTasks, topic);
    if (hiddenTask(topic, state, activity)) return;
    taskStates.set(topic, {
      state,
      activity,
      queued: Number(data.queued ?? previous.queued) || 0,
      updatedAt: Date.now(),
    });
    const record = taskCards.get(topic) ?? (hadDismissal ? ensureTaskCard(topic) : null);
    if (record) paintTask(record);
    updateTasksPill();
    watchResults();
  }
  /** A verdict about a turn sits above that turn's first tutor text; without one it goes last (#393). */
  function appendTaskAbove(record, node, before) {
    const tutorNode = before ? record.messages.get(String(before))?.node : undefined;
    if (!tutorNode?.isConnected) return appendTask(record, node);
    tutorNode.before(node);
  }
  function appendTask(record, node) {
    record.transcript.querySelector(".tasks-empty")?.remove();
    record.transcript.append(node);
  }
  function renderTaskHistory(record, messages) {
    record.transcript.replaceChildren();
    record.messages.clear();
    record.tools.clear();
    record.dialogs.clear();
    for (const message of messages) {
      const text = String(message?.text ?? "");
      if (message?.role === "user") appendTask(record, h("div", { class: "msg user" }, text));
      else if (message?.role === "studio") appendTask(record, h("div", { class: "msg studio" }, text));
      else if (message?.role === "assistant") appendTask(record, h("div", { class: "msg assistant" }, ...markdown(text).childNodes));
    }
    if (!messages.length) record.transcript.append(h("p", { class: "tasks-empty muted" }, "Todavía no ha dicho nada."));
    updateTasksPill();
  }
  function taskAssistant(record, id) {
    let entry = record.messages.get(String(id));
    if (!entry) {
      const node = h("div", { class: "msg assistant" });
      entry = { node, text: "" };
      record.messages.set(String(id), entry);
      appendTask(record, node);
    }
    return entry;
  }
  function paintTaskAssistant(entry) {
    entry.node.replaceChildren(...markdown(entry.text).childNodes);
  }
  function taskTool(record, { phase, id, label, ok, note }) {
    // A task's tool result is the only place the stream carries what it wrote:
    // remember its note so the finished card can lead to the real note.
    if (phase === "end" && ok && note && typeof note === "object") {
      record.note = note;
      paintTask(record);
    }
    const name = String(label ?? "Trabajando");
    if (phase === "start") {
      const row = h("div", { class: "activity running" }, h("span", { class: "spinner" }), name);
      record.tools.set(String(id), row);
      appendTask(record, row);
      return;
    }
    const row = record.tools.get(String(id));
    if (!row) return;
    row.replaceChildren(icon(ok ? "check" : "x"), name);
    row.classList.remove("running");
  }
  function taskDialog(record, dialog) {
    if (!dialog || typeof dialog.id !== "string" || record.dialogs.has(dialog.id)) return;
    const card = dialogCard(dialog, async (body, node) => {
      node.querySelectorAll("button, textarea").forEach((n) => (n.disabled = true));
      try {
        await post("api/tareas/dialogo", { task: record.topic, id: dialog.id, ...body });
      } catch (error) {
        node.querySelectorAll("button, textarea").forEach((n) => (n.disabled = false));
        toast(error.message);
      }
    });
    record.dialogs.set(dialog.id, card);
    appendTask(record, card);
    updateTasksPill();
  }
  function openTaskStream(topic) {
    const record = taskCards.get(topic);
    if (!record || record.stream) return;
    const stream = new EventSource(`${base}api/tareas/eventos?task=${encodeURIComponent(topic)}`);
    record.stream = stream;
    const onTask = (name, fn) => stream.addEventListener(name, (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || data.task !== topic) return;
      fn(data);
    });
    // A task's history is its messages, state and activity only: the interruption card belongs to
    // the learner's own chat, never to a background task working silently in this panel.
    onTask("historial", ({ messages }) => renderTaskHistory(record, Array.isArray(messages) ? messages : []));
    onTask("estado", (s) => updateTaskState(topic, s));
    onTask("state", (s) => updateTaskState(topic, s));
    onTask("user", ({ text }) => appendTask(record, h("div", { class: "msg user" }, String(text ?? ""))));
    onTask("assistant_delta", ({ id, delta }) => {
      const entry = taskAssistant(record, id);
      entry.text += String(delta ?? "");
      paintTaskAssistant(entry);
    });
    onTask("assistant_end", ({ id, text }) => {
      const entry = taskAssistant(record, id);
      entry.text = String(text ?? "");
      paintTaskAssistant(entry);
    });
    onTask("studio", ({ text, before }) => appendTaskAbove(record, h("div", { class: "msg studio" }, String(text ?? "")), before));
    onTask("tool", (data) => taskTool(record, data));
    onTask("dialog", (dialog) => taskDialog(record, dialog));
    onTask("dialog_closed", ({ id }) => {
      const card = record.dialogs.get(String(id));
      card?.remove();
      record.dialogs.delete(String(id));
      updateTasksPill();
    });
    onTask("notice", ({ message }) => appendTask(record, h("div", { class: "notice" }, String(message ?? ""))));
    onTask("error", ({ message, before }) => appendTaskAbove(record, h("div", { class: "notice error" }, String(message ?? "")), before));
    onTask("tareas", ({ tareas }) => setTaskViews(tareas));
    onTask("library_changed", () => loadLibrary());
  }
  events.addEventListener("tareas", (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    setTaskViews(Array.isArray(data.tareas) ? data.tareas : []);
  });
  updateTasksPill();

  // ---------- the panel's own controls ----------
  // The tutor is a workspace, not a fixed rail: its left edge is a handle, its list
  // of conversations folds away and its reading mode gives the chat the window.
  // Every choice is kept on the device, so the tutor opens the way it was left.
  const WIDTH_KEY = "estudio.tutor.ancho";
  const LIST_KEY = "estudio.tutor.lista";
  const FOCUS_KEY = "estudio.tutor.completo";
  const WIDTH = { min: 360, default: 520, max: 1100 };
  const kept = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const keep = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };
  // Beside the page the panel keeps it a readable column; over the page (below
  // 1100px) it may take almost the whole window, and no more.
  const panelMax = () => (innerWidth > 1100 ? Math.min(WIDTH.max, innerWidth - 420) : Math.round(innerWidth * 0.92));
  // What the learner asked for, kept across windows; a narrow one only shrinks it.
  let asked = Number.parseInt(kept(WIDTH_KEY) ?? "", 10);
  if (!Number.isFinite(asked)) asked = WIDTH.default;
  asked = Math.max(WIDTH.min, Math.min(WIDTH.max, asked));
  const panelWidth = () => Math.max(WIDTH.min, Math.min(panelMax(), asked));
  const splitter = control(h("div", {
    class: "drawer-splitter",
    role: "separator",
    "aria-orientation": "vertical",
    "aria-label": "Ancho del tutor",
    tabindex: "0",
    "aria-valuemin": String(WIDTH.min),
    "aria-valuemax": String(panelMax()),
    "aria-valuenow": String(panelWidth()),
  }), 6, "c06-splitter");
  function applyWidth(persist = false) {
    if (persist) keep(WIDTH_KEY, String(asked));
    // A phone gives the panel the window: there the stylesheet owns the width.
    if (innerWidth <= 720) document.documentElement.style.removeProperty("--drawer");
    else document.documentElement.style.setProperty("--drawer", `${panelWidth()}px`);
    splitter.setAttribute("aria-valuemax", String(panelMax()));
    splitter.setAttribute("aria-valuenow", String(panelWidth()));
  }
  function setWidth(width, persist = true) {
    asked = Math.max(WIDTH.min, Math.min(WIDTH.max, Math.round(width)));
    applyWidth(persist);
  }
  // The edge follows the pointer: dragging left widens the panel.
  let dragging = null;
  splitter.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = { x: event.clientX, width: panelWidth() };
    splitter.setPointerCapture(event.pointerId);
    document.body.classList.add("drawer-resizing");
    event.preventDefault();
  });
  splitter.addEventListener("pointermove", (event) => {
    if (dragging) setWidth(dragging.width + (dragging.x - event.clientX), false);
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = null;
    document.body.classList.remove("drawer-resizing");
    applyWidth(true);
    if (splitter.hasPointerCapture?.(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  };
  splitter.addEventListener("pointerup", endDrag);
  splitter.addEventListener("pointercancel", endDrag);
  splitter.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 96 : 24;
    if (event.key === "ArrowLeft") setWidth(panelWidth() + step);
    else if (event.key === "ArrowRight") setWidth(panelWidth() - step);
    else return;
    event.preventDefault();
  });
  splitter.addEventListener("dblclick", () => setWidth(WIDTH.default));

  let listOpen = kept(LIST_KEY) !== "cerrada";
  const listBtn = control(h("button", { class: "icon-btn", type: "button", "aria-controls": "tutor-chats", onclick: () => setListOpen(!listOpen) }, icon("chat")), 3, "c03-toggle");
  function setListOpen(open) {
    listOpen = open;
    keep(LIST_KEY, open ? "abierta" : "cerrada");
    document.body.classList.toggle("tutor-list-hidden", !open);
    const label = open ? "Ocultar la lista de chats" : "Mostrar la lista de chats";
    listBtn.setAttribute("aria-expanded", String(open));
    listBtn.setAttribute("aria-label", label);
    listBtn.title = label;
  }

  let fullWindow = kept(FOCUS_KEY) === "si";
  const focusBtn = control(h("button", { class: "icon-btn drawer-focus-btn", type: "button", onclick: () => setFullWindow(!fullWindow) }, icon("fit")), 6, "c06-full");
  function setFullWindow(on) {
    fullWindow = on;
    keep(FOCUS_KEY, on ? "si" : "no");
    document.body.classList.toggle("drawer-focus", on);
    const label = on ? "Dejar de ver el tutor a pantalla completa" : "Ver el tutor a pantalla completa";
    focusBtn.setAttribute("aria-pressed", String(on));
    focusBtn.setAttribute("aria-label", label);
    focusBtn.title = label;
  }

  // Group 6 keeps its edge and header controls where their drag, focus and close handlers work;
  // only the overflow itself moves into the named disclosure. Group 3 keeps its toggle with the
  // list it controls, and group 4 keeps the whole form under one labelled summary.
  const moreBtn = control(h("button", {
    class: "icon-btn drawer-more-btn", type: "button", "aria-label": "Más acciones del panel",
    "aria-expanded": "false", "aria-controls": "tutor-mas-opciones",
    onclick: () => setMenuOpen(!menu.classList.contains("open")),
  }, icon("more")), 6, "c06-more");
  function setMenuOpen(open, returnFocus = false) {
    menu.classList.toggle("open", open);
    moreBtn.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector("button")?.focus();
    else if (returnFocus) moreBtn.focus();
  }
  const closeBtn = control(h("button", { class: "icon-btn", type: "button", "aria-label": "Cerrar el tutor", onclick: closeDrawer }, icon("x")), 6, "c06-close");

  const groupSummary = (num, label) => h("summary", {}, h("span", { class: "group-num", "aria-hidden": "true" }, String(num)), label);
  const chatsSection = h("section", { class: "chats", id: "tutor-chats", "aria-label": "Chats" },
    h("div", { class: "chats-head" }, chatHeading, control(btn("＋ Chat", createChat, "btn small"), 3, "c03-new-chat")), chatList);
  const conversationsGroup = h("details", { class: "drawer-group", id: "tutor-conversaciones" },
    groupSummary(3, "Conversaciones"),
    h("div", { class: "group-body" }, h("div", { class: "chats-tools" }, listBtn), chatsSection, newConversation));
  const learningGroup = h("details", { class: "drawer-group", id: "tutor-aprender" },
    control(groupSummary(4, "Aprender algo nuevo"), 4, "c04-summary"),
    h("div", { class: "group-body" }, newLearningEntry(true)));
  const frameGroup = h("details", { class: "drawer-group", id: "tutor-marco" },
    groupSummary(6, "Marco del panel"),
    h("div", { class: "group-body" },
      moreBtn, menu,
      h("p", { class: "frame-note" }, "Ancho del tutor: arrastra el borde o usa las flechas. Pantalla completa y Cerrar el tutor siguen en la cabecera.")));

  const rareGroups = [conversationsGroup, learningGroup, frameGroup];
  for (const group of rareGroups) group.addEventListener("toggle", () => {
    if (!group.open) return;
    for (const other of rareGroups) if (other !== group) other.open = false;
  });
  // #377: one quiet chip, closed by default on every size; the groups appear only on demand.
  const moreShell = h("details", { class: "drawer-more", id: "tutor-more" },
    h("summary", { class: "more-summary" }, "Más opciones"),
    h("div", { class: "more-body" }, ...rareGroups));

  const drawer = h(
    "aside",
    { class: "drawer", id: "drawer", "aria-label": "Tutor" },
    splitter,
    h("div", { class: "drawer-head" }, h("h2", {}, "Tutor", stateLine), noteBtn, focusBtn, closeBtn),
    thread,
    moreShell,
    h(
      "div",
      { class: "composer" },
      h("div", { class: "box" }, composerText, control(h("button", { class: "send is-primary", type: "button", "aria-label": "Enviar", "data-block-during-turn": "", onclick: sendComposer }, icon("send")), 1, "c01-send")),
      h("div", { class: "hint" }, h("span", {}, "Enter envía · Shift+Enter, nueva línea"), control(h("button", { class: "stop", type: "button", onclick: () => post("abort").catch((e) => toast(e.message)) }, "Detener"), 1, "c01-stop")),
    ),
  );

  // ---------- boot ----------
  /** #348: the same merged catalogue the reader uses, fetched after the shell paints. */
  function runnersNote(topic) {
    const list = topic?.runners ?? library.runners;
    if (!list?.languages?.length) return null;
    return h(
      "p",
      { class: "runners-note" },
      h("span", { class: "muted" }, "Ejecutables aquí: "),
      h("span", {}, list.runnable.length ? list.runnable.join(" · ") : "ninguno todavía"),
    );
  }

  /** Docker is never on the first paint: the library draws, then this quietly fills the runner line. */
  async function loadRunners() {
    try {
      library.runners = await request("api/runners");
    } catch {
      // A stopped Docker daemon is a state, not a broken studio: the library keeps its last list.
    }
    const [, view] = location.hash.split("/");
    if (view !== "leer" && view !== "rapido" && view !== "editar" && view !== "resultados" && view !== "preferencias" && view !== "sugerencias") render();
  }

  async function loadLibrary() {
    try {
      library = await request("api/library");
    } catch (error) {
      toast(`No se pudo leer la biblioteca: ${error.message}`);
    }
    paintTaskTitles();
    for (const record of taskCards.values()) paintTask(record);
    const [, view] = location.hash.split("/");
    // Never re-render the editor from a library change: it would drop typed text.
    // The results page refreshes its own status instead of being drawn again.
    if (view !== "leer" && view !== "rapido" && view !== "editar" && view !== "resultados" && view !== "preferencias" && view !== "sugerencias") render();
    void loadRunners();
  }
  root.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      mobileBack,
      h("a", { class: "brand", href: "#/" }, h("b", {}, "Estudio"), h("span", {}, "Learnings")),
      crumbs,
      headerPrimary,
      h("div", { class: "top-actions" }, pill, tasksPill, contextTrigger, contextMenu),
    ),
    offlineBanner,
    h("div", { class: "app" }, stage),
    // Where the tutor lies over the page (a tablet or a phone), the page behind it
    // dims and a tap on it closes the tutor, instead of a page cut mid-word.
    h("div", { class: "scrim", "aria-hidden": "true", onclick: () => closeDrawer() }),
    drawer,
    tasksScrim,
    tasksPanel,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Escape closes the overflow first and gives the key back to its trigger.
    if (!contextMenu.hidden) { closeContextMenu(true); return; }
    if (menu.classList.contains("open")) { setMenuOpen(false, true); return; }
    // Escape closes the innermost open disclosure before it closes its parent (and then the
    // drawer), and gives the key back to that disclosure's own summary. In DOM order Más wraps
    // the three groups, and a chat's ⋯ menu sits inside Conversaciones.
    const disclosures = [...drawer.querySelectorAll("details[open]")];
    const innermost = disclosures[disclosures.length - 1];
    if (innermost && document.body.classList.contains("drawer-open")) {
      innermost.open = false;
      innermost.querySelector(":scope > summary")?.focus();
      return;
    }
    // Escape leaves the tasks first, then the tutor, like their close buttons; a dialog on top owns the key.
    if (document.querySelector(".modal-backdrop")) return;
    if (document.body.classList.contains("tasks-open")) { closeTasks(); return; }
    closeDrawer();
  });
  applyWidth();
  setListOpen(listOpen);
  setFullWindow(fullWindow);
  addEventListener("resize", () => applyWidth());
  window.addEventListener("hashchange", render);
  updatePill();
  // Keeps the studio and its saved parts readable with no connection (studio/ui/sw.js).
  // Browsers allow it only on loopback or a trusted HTTPS certificate; elsewhere the
  // studio simply works online, as before.
  navigator.serviceWorker?.register("/sw.js", { scope: "/" }).catch(() => {});
  addEventListener("offline", () => setOffline(true));
  addEventListener("online", () => loadLibrary());
  // The marks of saved parts arrive from the worker after the first drawing.
  savedReady.then(() => {
    if (location.hash.startsWith("#/tema/") || location.hash === "#/" || location.hash === "") render();
  });
  loadLibrary().then(() => {
    render();
    if (window.StudioTutorial && !window.StudioTutorial.seen()) openTutorial();
  });
})();
