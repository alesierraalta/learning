/* Reading modes: the studio says the mode, this page turns its own pages.
   Loaded by every part page, markdown or hand-built, because the page is the
   only side that can measure itself. */
// Book mode: the studio says the mode, and this page turns its own pages. The
// document is the only side that can measure itself, so it also says where the
// reader is and how many pages the part has.
(() => {
  // A fixture page writes #app; a real part is served as <main>. Both are the
  // page this mode paginates.
  const scroller = document.getElementById("app") ?? document.querySelector("main");
  if (!scroller) return;
  // Wide reading: an opt-in layout for horizontal screens, offered by every part
  // page because this file is the only script both templates load. The default
  // keeps one narrow column; the wide mode gives the page the monitor and splits
  // a single flow of blocks in two. The choice belongs to the device, under the
  // key the reader has always used.
  const WIDE_KEY = "learnings.wide-reading";
  const storedWide = () => {
    try {
      return localStorage.getItem(WIDE_KEY) === "1";
    } catch {
      return false;
    }
  };
  let wideButton = null;
  const setWide = (wide, remember = true) => {
    document.body.classList.toggle("wide", wide);
    // The button and the studio's reading mode are two faces of one state.
    if (wideButton) wideButton.setAttribute("aria-pressed", String(wide));
    if (!remember) return;
    try {
      if (wide) localStorage.setItem(WIDE_KEY, "1");
      else localStorage.removeItem(WIDE_KEY);
    } catch {
      // A frame without storage keeps the choice for this page only.
    }
  };
  const readingToggle = () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reading-toggle";
    button.title = "Leer en dos columnas, para pantallas horizontales";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = "▭▭";
    const label = document.createElement("span");
    label.textContent = "Modo ancho";
    button.append(mark, label);
    button.setAttribute("aria-pressed", String(document.body.classList.contains("wide")));
    button.addEventListener("click", () => setWide(!document.body.classList.contains("wide")));
    wideButton = button;
    document.body.append(button);
  };
  setWide(storedWide(), false);
  readingToggle();
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const width = () => scroller.clientWidth || 1;
  const state = () => {
    const pages = Math.max(1, Math.ceil(scroller.scrollWidth / width()));
    const page = Math.min(pages, Math.round(scroller.scrollLeft / width()) + 1);
    return { page, pages };
  };
  // Only a book page talks to the studio: every other page load would post a
  // message nobody asked for, and the frame's listeners are exact about what
  // they accept.
  const tell = () => {
    if (window.parent === window) return;
    if (!document.body.classList.contains("book")) return;
    window.parent.postMessage({ type: "learning-book", ...state() }, "*");
  };
  const turn = (delta) => {
    if (!document.body.classList.contains("book")) return;
    const { page, pages } = state();
    const next = Math.min(pages, Math.max(1, page + delta));
    if (next === page) return;
    scroller.scrollTo({ left: (next - 1) * width(), top: 0, behavior: reduced() ? "auto" : "smooth" });
    setTimeout(tell, reduced() ? 0 : 340);
  };
  const setMode = (mode) => {
    document.body.classList.toggle("book", mode === "libro");
    // The studio's Ancho IS the document's wide mode: one control, not two. It is
    // not remembered, because the studio keeps its own reading preference and
    // this page keeps the button's choice for reading it on its own.
    setWide(mode === "ancho", false);
    scroller.scrollTo({ left: 0, top: 0, behavior: "auto" });
    requestAnimationFrame(tell);
  };
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "learning-reading-mode") setMode(data.mode);
    else if (data.type === "learning-page" && Number.isInteger(data.delta)) turn(data.delta);
  });
  window.addEventListener("resize", tell);
  window.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("book")) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    turn(event.key === "ArrowRight" ? 1 : -1);
  });
  let start = null;
  scroller.addEventListener("pointerdown", (event) => { start = event.clientX; });
  scroller.addEventListener("pointerup", (event) => {
    if (start === null) return;
    const dx = event.clientX - start;
    start = null;
    if (Math.abs(dx) < 40) return;
    turn(dx < 0 ? 1 : -1);
  });
  tell();
})();
