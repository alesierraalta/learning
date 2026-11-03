// The theme bootstrap: one decision, three surfaces. It runs in a browser before
// anything paints, so it is exercised here in a sandbox with the same globals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "kit", "theme.js"), "utf8");

function boot({ search = "", stored = null, system = "light" } = {}) {
  const root = { dataset: {} };
  const listeners = new Map();
  const sandbox = {
    document: { documentElement: root },
    localStorage: {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
        sandbox.written = value;
      },
    },
    matchMedia: () => ({ matches: system === "dark", addEventListener() {} }),
    location: { search },
    addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    URLSearchParams,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { root, listeners, sandbox };
}

const send = (listeners, name, data) => (listeners.get(name) ?? []).forEach((fn) => fn(data));

test("the address wins, then the browser's choice, then the system", () => {
  assert.equal(boot({ search: "?theme=dark", stored: "light" }).root.dataset.theme, "dark");
  assert.equal(boot({ stored: "dark", system: "light" }).root.dataset.theme, "dark");
  assert.equal(boot({ system: "dark" }).root.dataset.theme, "dark");
  assert.equal(boot({ system: "light" }).root.dataset.theme, "light");
  // A value nobody wrote is not a choice.
  assert.equal(boot({ stored: "neon", system: "dark" }).root.dataset.theme, "dark");
  assert.equal(boot({ search: "?theme=neon", system: "light" }).root.dataset.theme, "light");
});

test("the studio's choice is kept for this browser and paints the page", () => {
  const { root, sandbox } = boot({ system: "light" });
  sandbox.learningTheme.set("dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(sandbox.written, "dark", "the choice is remembered");
  assert.equal(sandbox.learningTheme.current(), "dark");

  sandbox.learningTheme.set("sepia");
  assert.equal(root.dataset.theme, "dark", "an unknown theme never repaints");
  assert.equal(sandbox.learningTheme.key, "learnings.theme");
});

test("a frame follows the studio by message, and the storage key follows another tab", () => {
  const { root, listeners } = boot({ search: "?theme=light", system: "light" });
  send(listeners, "message", { data: { type: "learning-theme", theme: "dark" } });
  assert.equal(root.dataset.theme, "dark");
  // Another message that is not ours changes nothing.
  send(listeners, "message", { data: { type: "other", theme: "light" } });
  assert.equal(root.dataset.theme, "dark");
  send(listeners, "storage", { key: "learnings.theme" });
  assert.equal(root.dataset.theme, "light", "with nothing stored, the system decides again");
});

test("the dark paper keeps its figures legible: an island resets the ink, not only the tokens", () => {
  const css = readFileSync(join(import.meta.dirname, "kit", "kit.css"), "utf8");
  const island = css.match(/:root\[data-theme="dark"\] \.lk-walkthrough \{[^}]*\}/);
  assert.ok(island, "the walkthrough keeps a light paper inside the dark page");
  assert.match(island[0], /color: var\(--ink\)/, "text inherited from the page turns dark again inside the island");
  const mermaid = css.match(/:root\[data-theme="dark"\] pre\.mermaid \{[^}]*\}/);
  assert.ok(mermaid && /color: var\(--ink\)/.test(mermaid[0]), "a mermaid diagram is drawn on its own light paper");
});
