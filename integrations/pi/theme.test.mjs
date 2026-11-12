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

test("black is a separate persistent theme passed to reader frames", () => {
  assert.equal(boot({ search: "?theme=black", stored: "dark" }).root.dataset.theme, "black");
  assert.equal(boot({ stored: "black" }).root.dataset.theme, "black");
  const { root, sandbox, listeners } = boot();
  sandbox.learningTheme.set("black");
  assert.equal(root.dataset.theme, "black");
  assert.equal(sandbox.written, "black");
  send(listeners, "message", { data: { type: "learning-theme", theme: "dark" } });
  send(listeners, "message", { data: { type: "learning-theme", theme: "black" } });
  assert.equal(root.dataset.theme, "black");
});

test("black paper is available to studio, rich pages and figure rendering", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const studio = readFileSync(join(root, "studio/ui/studio.js"), "utf8");
  const studioCss = readFileSync(join(root, "studio/ui/studio.css"), "utf8");
  const kitCss = readFileSync(join(root, "integrations/pi/kit/kit.css"), "utf8");
  assert.match(studio, /current === "dark" \? "black" : current === "black" \? "light" : "dark"/);
  assert.match(studioCss, /:root\[data-theme="black"\] \{[^}]*--paper: #000000/);
  assert.match(kitCss, /:root\[data-theme="black"\] \{[^}]*--paper: #000000/);
  const sandbox = { window: null };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(root, "tools/visuals/draw.js"), "utf8"), sandbox);
  assert.equal(sandbox.LKVisuals.theme("black").paper, "#000000");
  assert.match(sandbox.LKVisuals.themeCss(), /\[data-theme="black"\][^}]*--v-paper:#000000/);
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

test("the dark paper keeps its figures legible: the deck follows the page, only mermaid keeps its own sheet", () => {
  const css = readFileSync(join(import.meta.dirname, "kit", "kit.css"), "utf8");
  // #222: the classic deck is no longer a white island in the night themes.
  assert.equal(/:root\[data-theme="(?:dark|black)"\] \.lk-walkthrough \{[^}]*background: #fff/.test(css), false, "the deck keeps no white island in the dark page");
  const night = css.match(/:root:is\(\[data-theme="dark"\], \[data-theme="black"\]\) \.lk-walkthrough \{[^}]*\}/);
  assert.ok(night, "the deck has a night rule for both night themes");
  assert.match(night[0], /background: var\(--paper\)/, "the deck paints the page paper");
  assert.match(night[0], /color: var\(--ink\)/, "the deck takes the night ink");
  const mermaid = css.match(/:root:is\(\[data-theme="dark"\], \[data-theme="black"\]\) pre\.mermaid \{[^}]*\}/);
  assert.ok(mermaid && /color: var\(--ink\)/.test(mermaid[0]), "a mermaid diagram is drawn on its own light paper");
});

test("interactive components use legible theme surfaces and light islands", () => {
  const kit = readFileSync(join(import.meta.dirname, "kit/kit.css"), "utf8");
  const studio = readFileSync(join(import.meta.dirname, "../../studio/ui/studio.css"), "utf8");
  const sandbox = { window: null };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(import.meta.dirname, "../../tools/visuals/draw.js"), "utf8"), sandbox);
  const { contrast } = sandbox.LKVisuals;
  assert.match(kit, /textarea \{[^}]*background: var\(--paper\); color: var\(--ink\)/);
  assert.match(kit, /\.lk-scene-caption \{[^}]*color: var\(--muted\)/);
  assert.match(kit, /\.lk-edge-label \{ stroke: var\(--paper\)/);
  for (const [selector, foreground] of [["correct", "--emerald"], ["error", "--crimson"]]) {
    const rule = kit.match(new RegExp(`:root:is\\(\\[data-theme="dark"\\], \\[data-theme="black"\\]\\) \\.lk-qq-result\\.lk-${selector} \\{([^}]*)\\}`));
    assert.ok(rule, `${selector} result applies to both night themes`);
    assert.ok(rule[1].includes(`color: var(${foreground})`));
    const background = rule[1].match(/background: (#[0-9a-f]{6})/i)[1];
    const ink = foreground === "--emerald" ? "#7FCBAE" : "#EE93A4";
    assert.ok(contrast(ink, background) >= 4.5, `${selector} result has readable contrast`);
  }
  const primary = studio.match(/\.deck-controls \.btn\.primary, \.deck > \.finale \.btn\.primary \{[^}]*background: (#\w+); color: (#\w+)/);
  assert.ok(primary);
  assert.ok(contrast(primary[1] === "#fff" ? "#ffffff" : primary[1], primary[2]) >= 4.5);
  assert.match(kit, /pre\.mermaid \{ --ink: #0F2E3D; background: #fff; color: var\(--ink\)/);
});

// A reader figure is drawn from the note's scene by the visual engine. The
// renderer is a classic script loaded before kit.js, so the component can use it
// on the first connect: the same file the CLI draws with, not a second copy.
test("the figure renderer runs as a classic script and names tones, not colours", () => {
  const sandbox = { window: null };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../tools/visuals/draw.js"), "utf8"), sandbox);
  const visuals = sandbox.LKVisuals;
  assert.ok(visuals && typeof visuals.renderScene === "function", "draw.js exposes the engine on the page");
  const svg = visuals.renderScene({ arrows: [{ x1: 1, y1: 1, x2: 9, y2: 1, tone: "blue", label: "va" }] }, { mode: "vars", style: false });
  assert.match(svg, /var\(--v-blue\)/, "a figure names a tone");
  assert.doesNotMatch(svg, /<style>/, "the token block is injected once per page, not once per figure");
  assert.match(visuals.themeCss(), /--v-ink:#F1EFE8/, "the dark paper travels with the renderer");
});

// #207: the learner read the annotated formula on the black paper and the figure
// had no sheet at all — dark ink on black. The two night themes were written as
// one selector list, so each rule applied to only half of them: `lk-scene` got
// its paper in dark and lost it in black.
const ruleBody = (css, head) => {
  const at = css.indexOf(head);
  return at === -1 ? null : css.slice(at + head.length, css.indexOf("}", at));
};

// #209: the story followed the night paper while a still scene stayed a white island
// right above it. A scene is one surface with the page: in both night themes its stage
// paints with the page paper and its tones are remapped for contrast, and the remap is
// one selector list so neither night theme is left without it. A mermaid diagram keeps
// its own light sheet.
test("a scene follows both night papers: remapped tones, no white island", () => {
  const css = readFileSync(join(import.meta.dirname, "kit", "kit.css"), "utf8");
  const night = ':root:is([data-theme="dark"], [data-theme="black"])';
  assert.equal(ruleBody(css, `${night} lk-scene {`), null, "la escena ya no tiene una hoja clara propia en los papeles de noche");
  assert.doesNotMatch(css, /lk-scene \.lk-scene-caption \{ color: rgba\(15, 46, 61/, "el pie de la escena sigue el papel de noche");
  const remap = css.match(/:is\(:root\[data-theme="dark"\], :root\[data-theme="black"\]\) \.lk-remap [^{]*\{[^}]*\}/g) ?? [];
  assert.ok(remap.length >= 14, "los tonos del dibujo se remapean para los dos papeles de noche en una sola lista");
  assert.ok(remap.some((rule) => /fill="#ffffff"/i.test(rule) && /var\(--paper\)/.test(rule)), "la superficie blanca del dibujo se pinta con el papel");
  for (const [tone, ink] of [["#004276", "#8FC0E0"], ["#21594F", "#7FCBAE"], ["#8A6B3F", "#E0B583"], ["#CC405C", "#EE93A4"]]) {
    assert.ok(remap.some((rule) => rule.includes(tone) && /fill:var\(--k-/.test(rule)), `el tono ${tone} se remapea`);
    assert.match(css, new RegExp(`--k-[a-z]+:${ink}`, "i"), `${ink} es la tinta de noche de ${tone}`);
  }
  const mermaid = ruleBody(css, `${night} pre.mermaid {`);
  assert.ok(mermaid && /background: #fff/.test(mermaid) && /color: var\(--ink\)/.test(mermaid), "el diagrama de mermaid conserva su hoja clara");
});
