// A figure is a scene: what it means, not where the pixels go. This module is
// the only place that turns meaning into SVG, so the same drawing can be a
// still in a note and a frame in a video.
import { THEMES, TONES, theme as themeOf } from "./theme.mjs";
import { mix } from "./color.mjs";
import { placeLabel } from "./place.mjs";

export const CELL_KINDS = ["free", "policy", "value", "exit", "wall", "hazard", "robot", "start"];
export const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const MODES = ["static", "vars"];

export const signed = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) throw new Error(`not a number: ${n}`);
  const text = Math.abs(value).toFixed(2).replace(".", ",");
  return value < 0 ? `−${text}` : `+${text}`;
};

function ink(palette, name, mode) {
  if (!TONES.includes(name) || !(name in palette)) {
    throw new Error(`a scene names a tone the theme does not have: "${name}" (tones: ${TONES.join(", ")})`);
  }
  return mode === "vars" ? `var(--v-${name})` : palette[name];
}

function paint(palette, tone, alpha, mode) {
  if (mode === "vars") return `color-mix(in srgb, var(--v-${tone}) ${Math.round(alpha * 100)}%, var(--v-paper))`;
  return mix(palette[tone], palette.paper, alpha);
}

function themeBlock(name) {
  const palette = THEMES[name];
  return TONES.map((tone) => `--v-${tone}:${palette[tone]}`).join(";");
}

export function varsStyle() {
  const light = themeBlock("light");
  const dark = themeBlock("dark");
  return [
    "<style>",
    `svg,[data-theme]{${light}}`,
    `@media(prefers-color-scheme:dark){svg,[data-theme]{${dark}}}`,
    `[data-theme="dark"] svg,[data-theme="dark"]{${dark}}`,
    `[data-theme="light"] svg,[data-theme="light"]{${light}}`,
    "</style>",
  ].join("");
}

const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// An open V, not a filled triangle: it reads as a hand-drawn head at any size.
function head(id, color) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1.4 L9 5 L1 8.6" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
}

function caption(text, x, y, { size = 17, anchor = "middle", color = "var(--v-slate)", mode = "vars", palette, halo = true } = {}) {
  const stroke = mode === "vars" ? "var(--v-paper)" : palette.paper;
  const outline = halo ? ` paint-order="stroke" stroke="${stroke}" stroke-width="4.5" stroke-linejoin="round"` : "";
  return `<text x="${round(x)}" y="${round(y)}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${outline}>${esc(text)}</text>`;
}

const round = (n) => Math.round(n * 100) / 100;

function arrowGlyph(a, palette, mode, rects) {
  const tone = a.tone ?? "slate";
  const color = ink(palette, tone, mode);
  const spot = placeLabel(rects, a, 17);
  const line = `M${round(a.x1)} ${round(a.y1)} L${round(a.x2)} ${round(a.y2)}`;
  const label = a.label ? caption(a.label, spot.x, spot.y + 12, { anchor: spot.anchor, mode, palette }) : "";
  return `<path d="${line}" fill="none" stroke="${color}" stroke-width="${a.width ?? 2}" marker-end="url(#head-${tone})" stroke-linecap="round"/>${label}`;
}

function gridParts(g, where) {
  const cols = Number(g.cols);
  const rows = Number(g.rows);
  const w = Number(g.w);
  const h = Number(g.h);
  if (![cols, rows, w, h].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error(`a grid needs cols, rows, w and h greater than zero (${where})`);
  }
  return { cols, rows, w, h, x: Number(g.x ?? 0), y: Number(g.y ?? 0), cells: g.cells ?? [] };
}

const FILL_ALPHA = { free: 0.05, policy: 0.05, value: 0.05, start: 0.05, robot: 0.12, wall: 0.2, exit: 0.14, hazard: 0.14 };
const KIND_TONE = { policy: "blue", exit: "green", hazard: "red", wall: "slate" };

function cellMarkup(grid, cell, palette, mode, index) {
  const kind = cell.kind ?? "free";
  if (!CELL_KINDS.includes(kind)) {
    throw new Error(`a cell kind the engine does not have: "${kind}" at (${cell.c},${cell.r}) (${index})`);
  }
  const x = grid.x + Number(cell.c) * grid.w;
  const y = grid.y + Number(cell.r) * grid.h;
  const fillAlpha = FILL_ALPHA[kind];
  const tone = cell.tone ?? KIND_TONE[kind] ?? "blue";
  const parts = [
    `<rect x="${round(x)}" y="${round(y)}" width="${round(grid.w)}" height="${round(grid.h)}" rx="3" fill="${paint(palette, tone, fillAlpha, mode)}" stroke="${ink(palette, "line", mode)}" stroke-width="1"/>`,
  ];
  if (kind === "policy") {
    const dir = cell.dir;
    if (!dir) throw new Error(`a policy with no direction at (${cell.c},${cell.r})`);
    const [dx, dy] = DIRECTIONS[dir] ?? (() => { throw new Error(`a policy direction the engine does not have: "${dir}"`); })();
    const cx = x + grid.w / 2;
    const cy = y + grid.h / 2;
    const len = Math.min(grid.w, grid.h) * 0.3;
    parts.push(`<path d="M${round(cx - dx * len / 2)} ${round(cy - dy * len / 2)} L${round(cx + dx * len / 2)} ${round(cy + dy * len / 2)}" fill="none" stroke="${ink(palette, "blue", mode)}" stroke-width="2.2" marker-end="url(#head-blue)" stroke-linecap="round"/>`);
  }
  if (kind === "value" || cell.value !== undefined) {
    parts.push(`<text x="${round(x + grid.w / 2)}" y="${round(y + grid.h / 2 + 6)}" font-size="17" fill="${ink(palette, "ink", mode)}" text-anchor="middle">${esc(cell.text ?? signed(cell.value))}</text>`);
  }
  if (cell.label) {
    parts.push(`<text x="${round(x + grid.w / 2)}" y="${round(y + grid.h / 2 + 6)}" font-size="${cell.size ?? 17}" fill="${ink(palette, cell.tone ?? "ink", mode)}" text-anchor="middle">${esc(cell.label)}</text>`);
  }
  if (kind === "robot") {
    parts.push(`<circle cx="${round(x + grid.w / 2)}" cy="${round(y + grid.h / 2)}" r="${round(Math.min(grid.w, grid.h) * 0.16)}" fill="none" stroke="${ink(palette, "ink", mode)}" stroke-width="2"/>`);
  }
  if (kind === "hazard" && !cell.label) {
    parts.push(`<path d="M${round(x + grid.w / 2 - 6)} ${round(y + grid.h / 2 - 6)} l12 12 M${round(x + grid.w / 2 + 6)} ${round(y + grid.h / 2 - 6)} l-12 12" stroke="${ink(palette, "red", mode)}" stroke-width="2" stroke-linecap="round"/>`);
  }
  return parts.join("");
}

function boxMarkup(b, palette, mode) {
  const fill = b.fill ? paint(palette, b.fill, b.alpha ?? 0.08, mode) : paint(palette, b.tone ?? "blue", b.alpha ?? 0.05, mode);
  const stroke = ink(palette, b.tone ?? "line", mode);
  const parts = [
    `<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.w)}" height="${round(b.h)}" rx="${b.rx ?? 4}" fill="${fill}" stroke="${stroke}" stroke-width="${b.strokeWidth ?? 1.2}"/>`,
  ];
  if (b.label) parts.push(`<text x="${round(b.x + b.w / 2)}" y="${round(b.y + b.h / 2 + (b.labelOffset ?? 6))}" font-size="${b.size ?? 18}" fill="${ink(palette, b.text ?? "ink", mode)}" text-anchor="middle">${esc(b.label)}</text>`);
  if (b.sub) parts.push(`<text x="${round(b.x + b.w / 2)}" y="${round(b.y + b.h / 2 + 26)}" font-size="${b.subSize ?? 13}" fill="${ink(palette, "slate", mode)}" text-anchor="middle">${esc(b.sub)}</text>`);
  return parts.join("");
}

function panelMarkup(p, palette, mode) {
  const lines = (p.lines ?? []).map((line, i) => `<text x="${round(p.x + 16)}" y="${round(p.y + 34 + i * (p.lineH ?? 26))}" font-size="${p.size ?? 16}" fill="${ink(palette, "ink", mode)}">${esc(line)}</text>`).join("");
  return [
    `<rect x="${round(p.x)}" y="${round(p.y)}" width="${round(p.w)}" height="${round(p.h)}" rx="6" fill="${paint(palette, p.tone ?? "blue", 0.04, mode)}" stroke="${ink(palette, "line", mode)}" stroke-width="1"/>`,
    p.title ? `<text x="${round(p.x + 16)}" y="${round(p.y + 22)}" font-size="${p.titleSize ?? 15}" fill="${ink(palette, "slate", mode)}">${esc(p.title)}</text>` : "",
    lines,
  ].join("");
}

function dashedMarkup(d, palette, mode) {
  return [
    `<rect x="${round(d.x)}" y="${round(d.y)}" width="${round(d.w)}" height="${round(d.h)}" rx="${d.rx ?? 22}" fill="none" stroke="${ink(palette, d.tone ?? "muted", mode)}" stroke-width="${d.width ?? 1.6}" stroke-dasharray="14 10"/>`,
    d.label ? `<text x="${round(d.x + d.w / 2)}" y="${round(d.y + d.h / 2 + 5)}" font-size="${d.size ?? 16}" fill="${ink(palette, "muted", mode)}" text-anchor="middle">${esc(d.label)}</text>` : "",
  ].join("");
}

function barsMarkup(bars, palette, mode) {
  const baseline = Number(bars.baseline ?? 200);
  return (bars.bars ?? []).map((bar) => {
    const height = Math.abs(Number(bar.h ?? 0));
    const y = Number(bar.h ?? 0) < 0 ? baseline : baseline - height;
    return [
      `<rect x="${round(bar.x)}" y="${round(y)}" width="${round(bar.w ?? 32)}" height="${round(height)}" rx="2" fill="${paint(palette, bar.tone ?? "blue", 0.16, mode)}" stroke="${ink(palette, bar.tone ?? "blue", mode)}" stroke-width="1"/>`,
      bar.label ? `<text x="${round(bar.x + (bar.w ?? 32) / 2)}" y="${round(y - 8)}" font-size="14" fill="${ink(palette, "ink", mode)}" text-anchor="middle">${esc(bar.label)}</text>` : "",
      bar.xLabel ? `<text x="${round(bar.x + (bar.w ?? 32) / 2)}" y="${round(baseline + 18)}" font-size="13" fill="${ink(palette, "slate", mode)}" text-anchor="middle">${esc(bar.xLabel)}</text>` : "",
    ].join("");
  }).join("");
}

function labelMarkup(l, palette, mode) {
  return `<text x="${round(l.x)}" y="${round(l.y)}" font-size="${l.size ?? 16}" fill="${ink(palette, l.tone ?? "ink", mode)}" text-anchor="${l.anchor ?? "start"}"${l.weight ? ` font-weight="${l.weight}"` : ""}>${esc(l.text)}</text>`;
}

function pathMarkup(p, palette, mode) {
  if (!p.d) throw new Error("a path needs a d attribute");
  const color = ink(palette, p.tone ?? "ink", mode);
  const end = p.arrow === false ? "" : ` marker-end="url(#head-${p.tone ?? "ink"})"`;
  return `<path d="${esc(p.d)}" fill="${p.fill ? ink(palette, p.fill, mode) : "none"}" stroke="${color}" stroke-width="${p.width ?? 1.8}" stroke-linecap="round"${end}/>`;
}

export function renderScene(scene, { theme: themeName = "light", mode = "vars" } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}" (modes: ${MODES.join(", ")})`);
  const palette = themeOf(themeName);
  const [minX, minY, w] = String(scene.viewBox ?? "0 0 360 290").split(/\s+/).map(Number);
  const boxes = scene.boxes ?? [];
  const rects = boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const used = new Set(["slate"]);

  const body = [];
  for (const g of scene.grids ?? []) {
    const grid = gridParts(g, `${minX},${minY}`);
    for (const cell of grid.cells) {
      if (cell.kind === "policy") used.add(cell.tone ?? "blue");
      if (cell.kind === "hazard") used.add("red");
      body.push(cellMarkup(grid, cell, palette, mode, `${grid.cols}x${grid.rows}`));
    }
  }
  for (const s of scene.sheets ?? []) body.push(boxMarkup({ ...s, fill: s.fill ?? "soft", label: s.label }, palette, mode));
  for (const p of scene.panels ?? []) body.push(panelMarkup(p, palette, mode));
  for (const d of scene.dashed ?? []) body.push(dashedMarkup(d, palette, mode));
  if (scene.bars) body.push(barsMarkup(scene.bars, palette, mode));
  for (const b of boxes) body.push(boxMarkup(b, palette, mode));
  for (const a of scene.arrows ?? []) {
    used.add(a.tone ?? "slate");
    body.push(arrowGlyph(a, palette, mode, rects));
  }
  for (const p of scene.paths ?? []) {
    used.add(p.tone ?? "ink");
    body.push(pathMarkup(p, palette, mode));
  }
  for (const l of scene.labels ?? []) body.push(labelMarkup(l, palette, mode));

  const markers = [...used].map((tone) => head(`head-${tone}`, ink(palette, tone, mode))).join("");
  const style = mode === "vars" ? varsStyle() : "";
  const title = scene.title ? caption(scene.title, minX + w / 2, minY + 18, { size: 20, anchor: "middle", color: ink(palette, "ink", mode), mode, palette, halo: false }) : "";
  const aria = scene.aria ? `<title>${esc(scene.aria)}</title>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.viewBox ?? "0 0 360 290"}" role="img">${style}${aria}<defs>${markers}</defs>${title}${body.join("")}</svg>`;
}
