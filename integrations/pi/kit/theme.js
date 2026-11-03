/* Learnings: one dark paper for the studio, the reader and the rich pages.
   The studio owns the choice and keeps it per browser; a frame receives it as
   `?theme=` in its address or by message, so it never keeps a second copy.
   Loaded before the body paints: the paper drawn is the one chosen. */
(() => {
  const KEY = "learnings.theme";
  const root = document.documentElement;
  const known = (value) => (value === "dark" || value === "light" ? value : "");
  const stored = () => {
    try {
      return known(localStorage.getItem(KEY));
    } catch {
      return "";
    }
  };
  const system = () => (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const paint = (theme) => {
    root.dataset.theme = theme;
    return theme;
  };
  const apply = (theme) => paint(known(theme) || stored() || system());
  const set = (theme) => {
    const value = known(theme);
    // A value that is not a theme never repaints what is already on screen.
    if (!value) return root.dataset.theme || apply("");
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // A private window keeps the choice for this visit only.
    }
    return paint(value);
  };
  apply(new URLSearchParams(location.search).get("theme"));
  addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "learning-theme") apply(data.theme);
  });
  // Another tab of the same paper: follow it without writing anything.
  addEventListener("storage", (event) => {
    if (event.key === KEY) apply("");
  });
  matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (!stored()) apply("");
  });
  window.learningTheme = { apply, set, current: () => root.dataset.theme || "light", key: KEY };
})();
