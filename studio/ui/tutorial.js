// The studio tutorial: six slides in the visual language of the Learnings decks
// (~/Developer/learnings-video-runs/slides: deck.css, illus.py), revealed step by step.
(() => {
  // Shared vocabulary: palette and SVG primitives come from scene.js, so the
  // tutorial and the inline walkthroughs of a page draw exactly the same way.
  const S = window.LKScene;
  if (!S) throw new Error("scene.js must load before tutorial.js");
  const { C, f, txt, lbl, step, gear, packet, dashed, sheet, box, node, badge, defs, curve, path, line } = S;

  const laptop = (x, y, w = 420, inner = "") => {
    const h = w * 0.62;
    return `<rect x="${x}" y="${y}" width="${w}" height="${f(h)}" rx="16" fill="${C.slate}"/>` +
      `<rect x="${x + 16}" y="${y + 16}" width="${w - 32}" height="${f(h - 32)}" rx="6" fill="#ffffff"/>${inner}` +
      `<path d="M ${x - 40} ${f(y + h + 26)} L ${x} ${f(y + h)} H ${x + w} L ${x + w + 40} ${f(y + h + 26)} Z" fill="#64748b"/>`;
  };

  const windowChrome = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#ffffff" stroke="${C.line}" stroke-width="3"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="34" rx="12" fill="${C.soft}"/>` +
    [C.red, C.amber, C.green].map((c, i) => `<circle cx="${x + 22 + i * 20}" cy="${y + 17}" r="6" fill="${c}"/>`).join("");

  const vault = (x, y) =>
    [2, 1, 0].map((k) => sheet(x + k * 26, y + k * 22, 190, 240, k === 0 ? "nota.md" : "", k === 0 ? 6 : 0)).join("");

  const studioScreen = (x, y, w, h) => {
    // a miniature of the studio home inside a screen area
    const s = w / 560;
    const X = (v) => f(x + v * s), Y = (v) => f(y + v * s);
    return `<rect x="${X(0)}" y="${Y(0)}" width="${f(w)}" height="${f(20 * s)}" fill="${C.soft}"/>` +
      `<text x="${X(14)}" y="${Y(15)}" font-size="${f(13 * s)}" fill="${C.ink}">Estudio</text>` +
      `<rect x="${X(470)}" y="${Y(4)}" width="${f(78 * s)}" height="${f(13 * s)}" rx="3" fill="#ffffff" stroke="${C.ink}" stroke-width="${f(1.5 * s)}"/>` +
      `<text x="${X(22)}" y="${Y(62)}" font-size="${f(27 * s)}" fill="${C.ink}">¿Qué estudiamos hoy?</text>` +
      `<rect x="${X(22)}" y="${Y(78)}" width="${f(270 * s)}" height="${f(24 * s)}" rx="4" fill="#ffffff" stroke="${C.ink}" stroke-width="${f(1.6 * s)}"/>` +
      `<rect x="${X(232)}" y="${Y(82)}" width="${f(54 * s)}" height="${f(16 * s)}" rx="3" fill="${C.blue}"/>` +
      `<rect x="${X(320)}" y="${Y(40)}" width="${f(220 * s)}" height="${f(90 * s)}" rx="10" fill="${C.soft2}" stroke="${C.slate2}" stroke-width="${f(1.6 * s)}" stroke-dasharray="${f(6 * s)} ${f(5 * s)}"/>` +
      `<rect x="${X(338)}" y="${Y(102)}" width="${f(84 * s)}" height="${f(16 * s)}" rx="3" fill="${C.amber}"/>` +
      [0, 1, 2].map((i) => `<rect x="${X(22 + i * 176)}" y="${Y(150)}" width="${f(164 * s)}" height="${f(Math.max(40, h / s - 172) * s)}" rx="6" fill="#ffffff" stroke="${C.line}" stroke-width="${f(1.6 * s)}"/>` +
        `<rect x="${X(34 + i * 176)}" y="${Y(165)}" width="${f(110 * s)}" height="${f(8 * s)}" rx="3" fill="${C.ink}"/>` +
        [0, 1, 2, 3, 4].map((k) => `<rect x="${X(34 + i * 176 + k * 28)}" y="${Y(186)}" width="${f(22 * s)}" height="${f(8 * s)}" rx="2" fill="${k <= i ? C.blue : C.line}"/>`).join("")).join("");
  };

  // ---------- the six slides ----------
  const META = "El Estudio desde cero";
  const SLIDES = [
    {
      title: "Qué es el Estudio y quién trabaja de fondo",
      scene: () =>
        step(1, laptop(60, 160, 540, studioScreen(76, 176, 508, 303)) + txt(330, 560, "el Estudio") + lbl(330, 598, "lo que ves en el navegador")) +
        step(2, dashed(830, 10, 870, 700, "de fondo, en tu computadora") +
          gear(1040, 262, 78) + txt(1040, 392, "tutor", { color: C.blue, size: 32 }) + lbl(1040, 428, "Pi con tu skill y tus preferencias") +
          vault(1350, 140) + txt(1470, 446, "tu vault de Obsidian") + lbl(1470, 482, "notas, partes, quizzes, videos")) +
        step(3, line(620, 262, 945, 262, { color: C.green }) + packet(700, 224, C.green) + lbl(725, 324, "tus mensajes") + lbl(725, 356, "y sus respuestas")) +
        step(4, curve(1130, 262, 1338, 250, { color: C.blue }) + lbl(1235, 222, "escribe y guarda")) +
        step(5, box(930, 488, 220, 90, "motor", { stroke: C.slate, fill: C.soft, sub: "comprueba cada etapa" }) + line(1040, 444, 1040, 480, { color: C.slate, dashedLine: true })) +
        step(6, path("M 1470 500 C 1470 690, 900 700, 612 600", { color: C.green, dashedLine: true }) + lbl(1590, 600, "el Estudio") + lbl(1590, 632, "te lo muestra")),
    },
    {
      title: "Cómo empiezas un tema",
      scene: () =>
        step(1, txt(60, 50, "1. lo escribes", { anchor: "start", color: C.slate }) +
          `<rect x="60" y="80" width="660" height="96" rx="10" fill="#ffffff" stroke="${C.ink}" stroke-width="3"/>` +
          lbl(90, 138, "Quiero aprender: qué es una función hash", { anchor: "start", color: C.ink }) +
          box(560, 98, 140, 60, "Empezar", { stroke: C.blue, fill: C.blue, color: "#ffffff", size: 24 })) +
        step(2, line(730, 128, 868, 128, { color: C.green }) + packet(762, 90, C.green, 60, 40) + gear(950, 130, 64) + txt(950, 238, "tutor", { color: C.blue })) +
        step(3, `<rect x="1080" y="10" width="620" height="270" rx="10" fill="${C.amberS}" stroke="${C.amber}" stroke-width="3"/>` +
          txt(1110, 58, "el tutor te pregunta", { anchor: "start", color: C.amber, size: 26 }) +
          txt(1110, 104, "¿Cómo quieres aprender?", { anchor: "start", bold: false, size: 34 }) +
          box(1110, 136, 270, 110, "Universitario", { stroke: C.blue, fill: C.blueS, color: C.blue, size: 30 }) +
          box(1404, 136, 270, 110, "Rápido", { stroke: C.green, fill: C.greenS, color: C.green, size: 30 })) +
        step(4, curve(1245, 250, 760, 520, { color: C.blue, bend: 0.2 }) +
          line(130, 560, 690, 560, { color: C.line, arrow: false, dashedLine: true, width: 4 }) +
          ["plan", "diag.", "P1", "P2", "P3"].map((t, i) => node(130 + i * 140, 560, t, { r: 40, stroke: i < 2 ? C.green : C.blue, fill: i < 2 ? C.greenS : C.blueS, color: i < 2 ? C.green : C.blue })).join("") +
          txt(410, 650, "universitario", { color: C.blue }) + lbl(410, 688, "plan, diagnóstico y partes con quiz; seguimiento hasta dominarlo")) +
        step(5, curve(1540, 250, 1400, 380, { color: C.green, bend: 0.1 }) + sheet(1300, 390, 220, 250, "función-hash.md", 6, C.green) + txt(1410, 690, "rápido", { color: C.green }) + lbl(1410, 726, "una nota breve para entenderlo hoy")),
    },
    {
      title: "Una parte por dentro",
      scene: () => {
        const x = 560, y = 0, w = 600, h = 740;
        return step(1, sheet(x, y, w, h, "Parte 3 — Política, valor y modelo", 0) +
            txt(x + 24, y + 96, "1. Por qué existe", { anchor: "start", size: 22 }) +
            [0, 1].map((i) => `<rect x="${x + 24}" y="${y + 112 + i * 20}" width="${w - 60}" height="8" rx="4" fill="${C.line}"/>`).join("") +
            txt(x + 24, y + 384, "4. De la intuición a la fórmula", { anchor: "start", size: 22 }) +
            txt(x + 300, y + 428, "V(s) = Σ P · [ r + γ · V(s′) ]", { size: 26, bold: false, italic: true }) +
            lbl(270, 160, "la explicación completa,") + lbl(270, 194, "como en Obsidian") + curve(420, 150, x + 18, y + 112, { color: C.slate, dashedLine: true })) +
          step(2, `<rect x="${x + 24}" y="${y + 166}" width="${w - 48}" height="170" rx="8" fill="${C.ink}"/>` +
            `<path d="M ${x + 280} ${y + 216} L ${x + 340} ${y + 251} L ${x + 280} ${y + 286} Z" fill="#ffffff"/>` +
            lbl(270, 300, "video de la parte;") + lbl(270, 334, "si no existe: «Generar video»") + curve(420, 310, x + 18, y + 250, { color: C.slate, dashedLine: true })) +
          step(3, `<rect x="${x + 24}" y="${y + 456}" width="${w - 48}" height="150" rx="8" fill="#ffffff" stroke="${C.blue}" stroke-width="3"/>` +
            Array.from({ length: 12 }, (_, i) => `<rect x="${f(x + 44 + (i % 4) * 56)}" y="${f(y + 472 + Math.floor(i / 4) * 40)}" width="48" height="32" rx="4" fill="${i === 3 ? C.greenS : i === 7 ? C.redS : i === 5 ? C.line : C.blueS}"/>`).join("") +
            `<circle cx="${x + 68}" cy="${y + 568}" r="11" fill="${C.amber}"/>` +
            `<rect x="${x + 300}" y="${y + 480}" width="250" height="14" rx="7" fill="${C.line}"/><circle cx="${x + 380}" cy="${y + 487}" r="12" fill="${C.blue}"/>` +
            box(x + 300, y + 520, 160, 50, "Ejecutar", { stroke: C.blue, fill: C.blue, color: "#ffffff", size: 20 }) +
            txt(1400, 486, "demo interactiva", { color: C.blue }) + lbl(1400, 522, "la mueves tú: política,") + lbl(1400, 556, "recompensa, valor, modelo") + curve(1230, 520, x + w - 18, y + 530, { color: C.blue, dashedLine: true })) +
          step(4, `<rect x="${x + 24}" y="${y + 630}" width="${w - 48}" height="92" rx="8" fill="${C.amberS}" stroke="${C.amber}" stroke-width="3"/>` +
            txt(x + 44, y + 664, "Mini-quiz", { anchor: "start", size: 22, color: C.amber }) +
            [0, 1, 2, 3].map((i) => `<circle cx="${x + 60 + i * 120}" cy="${y + 698}" r="10" fill="#ffffff" stroke="${C.ink}" stroke-width="2.5"/>`).join("") +
            txt(1400, 650, "quiz al final", { color: C.amber }) + lbl(1400, 686, "con lo que entendiste,") + lbl(1400, 720, "por qué y tu confianza") + curve(1250, 680, x + w - 18, y + 676, { color: C.amber, dashedLine: true }));
      },
    },
    {
      title: "Tu razonamiento cuenta",
      scene: () =>
        step(1, `<rect x="20" y="20" width="640" height="640" rx="10" fill="#ffffff" stroke="${C.ink}" stroke-width="3"/>` +
          txt(48, 70, "¿Qué número compara el robot para elegir?", { anchor: "start", size: 25 }) +
          ["A  la recompensa del próximo paso", "B  el valor V de donde puede llegar"].map((t, i) =>
            `<circle cx="64" cy="${118 + i * 46}" r="11" fill="${i === 1 ? C.blue : "#ffffff"}" stroke="${C.ink}" stroke-width="2.5"/>` + lbl(88, 127 + i * 46, t, { anchor: "start", color: C.ink, size: 24 })).join("") +
          txt(48, 248, "¿Qué entendiste que te pide?", { anchor: "start", size: 22 }) +
          `<rect x="48" y="262" width="584" height="70" rx="6" fill="${C.soft2}" stroke="${C.line}" stroke-width="2.5"/>` + lbl(64, 306, "elegir con lo que gana a la larga", { anchor: "start", color: C.ink }) +
          txt(48, 372, "¿Por qué esa opción?", { anchor: "start", size: 22 }) +
          `<rect x="48" y="386" width="584" height="70" rx="6" fill="${C.soft2}" stroke="${C.line}" stroke-width="2.5"/>` + lbl(64, 430, "porque V resume todo lo que viene", { anchor: "start", color: C.ink }) +
          txt(48, 500, "¿Qué tan seguro estás?", { anchor: "start", size: 22 }) +
          [["seguro", false], ["dudo", true], ["adiviné", false]].map(([t, on], i) => box(48 + i * 196, 520, 176, 60, t, { stroke: on ? C.amber : C.line, fill: on ? C.amberS : "#ffffff", color: on ? C.amber : C.slate, size: 24, rx: 30 })).join("")) +
        step(2, line(680, 340, 840, 340, { color: C.green }) + packet(722, 300, C.green, 64, 42) + gear(930, 340, 70) + txt(930, 458, "tutor", { color: C.blue }) + lbl(930, 494, "lee respuesta y razonamiento")) +
        step(3, [
          ["claro", "1.1.3", "«elegir con lo que gana a la larga»", C.green, C.greenS],
          ["dudoso", "1.1.1", "«porque V resume todo lo que viene»", C.amber, C.amberS],
          ["laguna", "P0.1", "«dudo»: no sabe qué es el descuento", C.red, C.redS],
        ].map(([state, code, quote, c, s], i) =>
          `<rect x="1130" y="${30 + i * 150}" width="580" height="120" rx="8" fill="${s}" stroke="${c}" stroke-width="3"/>` +
          txt(1156, 78 + i * 150, `${state} · ${code}`, { anchor: "start", color: c, size: 28 }) +
          lbl(1156, 118 + i * 150, quote, { anchor: "start", color: C.ink, size: 24 })).join("") +
          curve(1010, 330, 1120, 240, { color: C.slate }) + lbl(1230, 500, "un veredicto por concepto, citando tus palabras", { anchor: "start" })) +
        step(4, path("M 1130 390 C 1050 390, 1180 470, 1180 552", { color: C.red }) + sheet(1080, 560, 200, 170, "", 4, C.red) +
          txt(1300, 650, "laguna central:", { color: C.red, size: 26, anchor: "start" }) + txt(1300, 686, "la parte se vuelve a explicar", { color: C.red, size: 26, anchor: "start" })) +
        step(5, lbl(340, 712, "un acierto adivinado nunca cuenta como «claro»", { color: C.slate })),
    },
    {
      title: "Dónde está cada cosa",
      scene: () => {
        const wx = 40, wy = 10, ww = 1180, wh = 700;
        return step(1, windowChrome(wx, wy, ww, wh) +
            `<rect x="${wx + 3}" y="${wy + 34}" width="${ww - 6}" height="52" fill="#ffffff" stroke="${C.line}" stroke-width="2"/>` +
            txt(wx + 28, wy + 70, "Estudio", { anchor: "start", bold: false, size: 28 }) +
            box(wx + 700, wy + 44, 140, 34, "Tutorial", { size: 18 }) + box(wx + 900, wy + 44, 256, 34, "● Tutor listo", { size: 18, color: C.ink }) +
            txt(wx + 40, wy + 170, "¿Qué estudiamos hoy?", { anchor: "start", bold: false, size: 46 }) +
            `<rect x="${wx + 40}" y="${wy + 200}" width="460" height="64" rx="8" fill="#ffffff" stroke="${C.ink}" stroke-width="3"/>` +
            box(wx + 380, wy + 212, 106, 40, "Empezar", { stroke: C.blue, fill: C.blue, color: "#ffffff", size: 18 }) +
            `<rect x="${wx + 540}" y="${wy + 120}" width="300" height="190" rx="16" fill="${C.soft2}" stroke="${C.slate2}" stroke-width="3" stroke-dasharray="11 8"/>` +
            txt(wx + 566, wy + 160, "Te toca a ti", { anchor: "start", color: C.amber, size: 22 }) +
            box(wx + 566, wy + 240, 200, 44, "Responder", { stroke: C.amber, fill: C.amber, color: "#ffffff", size: 18 }) +
            [0, 1, 2].map((i) => `<rect x="${wx + 40 + i * 270}" y="${wy + 380}" width="250" height="250" rx="10" fill="#ffffff" stroke="${C.line}" stroke-width="3"/>` +
              `<rect x="${wx + 60 + i * 270}" y="${wy + 404}" width="70" height="20" fill="${C.blueS}" stroke="${C.blue}" stroke-width="2"/>` +
              `<rect x="${wx + 60 + i * 270}" y="${wy + 446}" width="190" height="14" rx="3" fill="${C.ink}"/>` +
              [0, 1, 2, 3, 4].map((k) => `<rect x="${wx + 60 + i * 270 + k * 40}" y="${wy + 590}" width="32" height="12" rx="3" fill="${k <= i + 1 ? C.blue : C.line}"/>`).join("")).join("") +
            `<rect x="${wx + 870}" y="${wy + 88}" width="${ww - 873}" height="${wh - 91}" fill="#ffffff" stroke="${C.line}" stroke-width="2"/>` +
            txt(wx + 890, wy + 128, "Tutor", { anchor: "start", bold: false, size: 26 }) +
            `<rect x="${wx + 890}" y="${wy + 150}" width="200" height="40" rx="20" fill="${C.blueS}"/>` +
            `<rect x="${wx + 980}" y="${wy + 204}" width="180" height="40" rx="20" fill="${C.greenS}"/>` +
            `<rect x="${wx + 890}" y="${wy + 270}" width="270" height="210" rx="8" fill="${C.amberS}" stroke="${C.amber}" stroke-width="3"/>` +
            txt(wx + 906, wy + 304, "el tutor te pregunta", { anchor: "start", color: C.amber, size: 18 }) +
            box(wx + 906, wy + 330, 238, 52, "Universitario", { size: 20 }) + box(wx + 906, wy + 396, 238, 52, "Rápido", { size: 20 })) +
          [
            [wx + 40, wy + 200, "Pide un tema nuevo aquí"],
            [wx + 540, wy + 120, "Lo que te toca ahora, con su botón"],
            [wx + 40, wy + 380, "Tus temas, con su avance por partes"],
            [wx + 1132, wy + 110, "El tutor: ábrelo desde arriba"],
            [wx + 1158, wy + 270, "Sus preguntas salen como botones"],
          ].map(([ax, ay, text], i) =>
            step(i + 2, badge(ax, ay, i + 1) + badge(1290, 120 + i * 120, i + 1) + txt(1330, 129 + i * 120, text, { anchor: "start", size: 26 }))).join("");
      },
    },
    {
      title: "Listo para empezar",
      finale: true,
      scene: () =>
        step(1, laptop(40, 140, 360, studioScreen(56, 156, 328, 191)) + txt(220, 470, "tú eliges")) +
        step(2, line(450, 260, 600, 260, { color: C.green }) + gear(720, 250, 78) + txt(720, 380, "el tutor prepara", { color: C.blue })) +
        step(3, line(840, 260, 990, 260, { color: C.blue }) + sheet(1030, 100, 260, 320, "tu parte", 9, C.blue) + txt(1160, 470, "tú aprendes")) +
        step(4, line(1330, 260, 1450, 260, { color: C.amber }) + box(1470, 190, 230, 140, "claro", { stroke: C.green, fill: C.greenS, color: C.green, sub: "y lo siguiente" }) +
          lbl(860, 560, "Puedes volver a este tutorial desde el botón «Tutorial», arriba.")),
    },
  ];

  // ---------- deck ----------
  const parser = new DOMParser();
  const parseSvg = (markup) =>
    document.importNode(parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1728 740">${defs()}${markup}</svg>`, "image/svg+xml").documentElement, true);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const slideNode = (i) => {
    const s = SLIDES[i];
    const node = el("section", "deck-slide");
    const header = el("header");
    header.append(el("div", "meta", META), el("h1", "", s.title));
    const scene = el("div", "scene");
    scene.append(parseSvg(s.scene()));
    node.append(header, scene);
    return node;
  };
  const stepsOf = (node) => Math.max(1, ...[...node.querySelectorAll("[data-step]")].map((g) => Number(g.dataset.step)));
  const fit = (frame, node) => {
    const apply = () => (node.style.transform = `scale(${frame.clientWidth / 1920})`);
    apply();
    return apply;
  };

  /** A static, fully revealed slide scaled to its container (home preview). */
  function preview(i = 0) {
    const frame = el("div", "deck-frame");
    frame.style.width = "100%";
    const node = slideNode(i);
    frame.append(node);
    const resize = new ResizeObserver(() => (node.style.transform = `scale(${frame.clientWidth / 1920})`));
    resize.observe(frame);
    return frame;
  }

  function open({ onClose, onStart } = {}) {
    document.querySelector(".deck")?.remove();
    let index = 0, at = 1, node, refit;
    const overlay = el("div", "deck");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Tutorial del Estudio");
    const frame = el("div", "deck-frame");
    const controls = el("div", "deck-controls");
    const prev = el("button", "btn", "◀ Anterior");
    const next = el("button", "btn primary", "Siguiente ▶");
    const dots = el("div", "deck-dots");
    const skip = el("button", "deck-skip", "Saltar el tutorial");
    [prev, next, skip].forEach((b) => (b.type = "button"));
    SLIDES.forEach((_, i) => {
      const dot = el("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Diapositiva ${i + 1}`);
      dot.addEventListener("click", () => show(i, 1));
      dots.append(dot);
    });
    controls.append(prev, dots, next, skip);
    overlay.append(frame, controls);

    const close = (start = false) => {
      overlay.remove();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      try { localStorage.setItem("estudio.tutorial", "visto"); } catch { /* private mode */ }
      if (start && onStart) onStart();
      else if (onClose) onClose();
    };
    function reveal() {
      node.querySelectorAll("[data-step]").forEach((g) => g.classList.toggle("hidden", Number(g.dataset.step) > at));
      const total = stepsOf(node);
      node.querySelector(".count").textContent = `${index + 1} / ${SLIDES.length}`;
      prev.disabled = index === 0 && at === 1;
      next.textContent = index === SLIDES.length - 1 && at >= total ? "Terminar" : "Siguiente ▶";
      [...dots.children].forEach((d, i) => d.setAttribute("aria-current", String(i === index)));
      node.querySelector(".finale")?.toggleAttribute("hidden", at < total);
    }
    function show(i, stepAt) {
      index = i;
      node = slideNode(i);
      node.append(el("div", "count"));
      if (SLIDES[i].finale) {
        const finale = el("div", "finale");
        const start = el("button", "btn primary", "Empezar un tema");
        const mine = el("button", "btn", "Ver mis temas");
        start.type = mine.type = "button";
        start.addEventListener("click", () => close(true));
        mine.addEventListener("click", () => close(false));
        finale.append(start, mine);
        node.append(finale);
      }
      frame.replaceChildren(node);
      refit = fit(frame, node);
      at = stepAt === "all" ? stepsOf(node) : stepAt;
      reveal();
    }
    const forward = () => {
      if (at < stepsOf(node)) { at++; reveal(); }
      else if (index < SLIDES.length - 1) show(index + 1, 1);
      else close(false);
    };
    const backward = () => {
      if (at > 1) { at--; reveal(); }
      else if (index > 0) show(index - 1, "all");
    };
    const onResize = () => refit && refit();
    const onKey = (event) => {
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") { event.preventDefault(); forward(); }
      else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); backward(); }
      else if (event.key === "Escape") close(false);
    };
    next.addEventListener("click", forward);
    prev.addEventListener("click", backward);
    skip.addEventListener("click", () => close(false));
    frame.addEventListener("click", (event) => { if (!event.target.closest("button")) forward(); });
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    show(0, 1);
    next.focus();
  }

  const seen = () => {
    try { return localStorage.getItem("estudio.tutorial") === "visto"; } catch { return true; }
  };
  window.StudioTutorial = { open, preview, seen, count: SLIDES.length };
})();
