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
