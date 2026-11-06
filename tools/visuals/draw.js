/* The drawing engine, as one classic script.
 *
 * A figure is a scene: what it means, not where the pixels go. This file is the
 * only place that turns meaning into SVG, so the same drawing can be a still in
 * a note, a frame in a video and a figure in the reader. It touches no DOM and
 * no Node API: the CLI imports it through the ESM wrappers beside it, and the
 * reader loads it before kit.js and draws with `window.LKVisuals`.
 */
(() => {
  "use strict";

  // ---------- theme ----------
  // One palette, two papers. A figure never picks a colour: it names a tone,
  // and the theme decides what that tone looks like on white and on black.
  const TONES = ["ink", "slate", "line", "soft", "blue", "green", "amber", "red", "muted", "paper"];

  const THEMES = {
    light: {
      paper: "#ffffff",
      ink: "#0F2E3D",
      slate: "#41586B",
      line: "#D7DEE3",
      soft: "#F4F7F8",
      blue: "#004276",
      green: "#21594F",
      amber: "#8A6B3F",
      red: "#B3261E",
      muted: "#8A99A3",
    },
    dark: {
      paper: "#0B0B0C",
      ink: "#F1EFE8",
      slate: "#B9C2C7",
      line: "#2A3238",
      soft: "#14181B",
      blue: "#7FB6E4",
      green: "#6FC3A8",
      amber: "#D8B36A",
      red: "#F08A80",
      muted: "#8695A0",
    },
  };

  THEMES.black = { ...THEMES.dark, paper: "#000000" };

  function theme(name) {
    const found = THEMES[name];
    if (!found) throw new Error(`unknown theme "${name}" (themes: ${Object.keys(THEMES).join(", ")})`);
    return found;
  }

  // ---------- colour ----------
  // Fills are mixed against the paper, never layered with alpha over an unknown
  // background: the same figure has to survive a white page and a black one.
  const HEX = /^#[0-9a-f]{6}$/i;

  function channels(hex) {
    if (!HEX.test(hex)) throw new Error(`not a hex colour: ${hex}`);
    return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  }

  const hex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

  function mix(tone, paper, alpha) {
    const a = Number(alpha);
    if (!Number.isFinite(a) || a < 0 || a > 1) throw new Error(`alpha out of range: ${alpha}`);
    const [tr, tg, tb] = channels(tone);
    const [pr, pg, pb] = channels(paper);
    return hex([tr * a + pr * (1 - a), tg * a + pg * (1 - a), tb * a + pb * (1 - a)]);
  }

  function luminance(hex) {
    const [r, g, b] = channels(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  // ---------- label placement ----------
  // An arrow's label is placed by rule, not by hand: the first candidate that
  // clears every box in the band wins.
  const OVER = 4;

  const overlaps = (spot, rect) =>
    spot.x < rect.x + rect.w + OVER &&
    spot.x + spot.w > rect.x - OVER &&
    spot.y < rect.y + rect.h + OVER &&
    spot.y + spot.h > rect.y - OVER;

  const rectsOf = (arrows) => (Array.isArray(arrows) ? arrows : []).filter((a) => a && Number.isFinite(a.x));

  function width(text, size) {
    return String(text).length * size * 0.52;
  }

  function placeLabel(rects, arrow, size = 18) {
    const boxes = rectsOf(rects);
    const text = String(arrow.label ?? "");
    const w = width(text, size);
    const h = size * 1.2;
    const midX = (arrow.x1 + arrow.x2) / 2;
    const midY = (arrow.y1 + arrow.y2) / 2;
    const horizontal = Math.abs(arrow.x2 - arrow.x1) >= Math.abs(arrow.y2 - arrow.y1);

    const candidates = horizontal
      ? [
          { x: midX - w / 2, y: Math.min(arrow.y1, arrow.y2) - h - OVER, anchor: "middle" },
          { x: midX - w / 2, y: Math.max(arrow.y1, arrow.y2) + OVER, anchor: "middle" },
          { x: arrow.x1 - w - OVER, y: midY - h / 2, anchor: "end" },
          { x: arrow.x2 + OVER, y: midY - h / 2, anchor: "start" },
        ]
      : [
          { x: Math.min(arrow.x1, arrow.x2) - w - OVER, y: midY - h / 2, anchor: "end" },
          { x: Math.max(arrow.x1, arrow.x2) + OVER, y: midY - h / 2, anchor: "start" },
          { x: midX - w / 2, y: Math.min(arrow.y1, arrow.y2) - h - OVER, anchor: "middle" },
          { x: midX - w / 2, y: Math.max(arrow.y1, arrow.y2) + OVER, anchor: "middle" },
        ];

    for (const spot of candidates) {
      const box = { x: spot.x, y: spot.y, w, h };
      if (!boxes.some((rect) => overlaps(box, rect))) return spot;
    }
    return candidates[0];
  }

  // ---------- scene markup ----------
  const CELL_KINDS = ["free", "policy", "value", "exit", "wall", "hazard", "robot", "start"];
  const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  const MODES = ["static", "vars"];

  const signed = (n) => {
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
    if (!TONES.includes(tone) || !(tone in palette)) {
      throw new Error(`a scene names a tone the theme does not have: "${tone}" (tones: ${TONES.join(", ")})`);
    }
    const value = number(alpha, "a fill alpha");
    if (value < 0 || value > 1) throw new Error(`alpha out of range: ${alpha}`);
    if (mode === "vars") return `color-mix(in srgb, var(--v-${tone}) ${Math.round(value * 100)}%, var(--v-paper))`;
    return mix(palette[tone], palette.paper, value);
  }

  function themeBlock(name) {
    const palette = THEMES[name];
    return TONES.map((tone) => `--v-${tone}:${palette[tone]}`).join(";");
  }

  // The token block without its tags: a reader injects it once for every
  // figure on the page, and the SVG only names the tokens.
  function themeCss() {
    const light = themeBlock("light");
    const dark = themeBlock("dark");
    const black = themeBlock("black");
    return [
      `svg,[data-theme]{${light}}`,
      `@media(prefers-color-scheme:dark){svg,[data-theme]{${dark}}}`,
      `[data-theme="dark"] svg,[data-theme="dark"]{${dark}}`,
      `[data-theme="black"] svg,[data-theme="black"]{${black}}`,
      `[data-theme="light"] svg,[data-theme="light"]{${light}}`,
    ].join("");
  }

  function varsStyle() {
    return `<style>${themeCss()}</style>`;
  }

  const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // An open V, not a filled triangle: it reads as a hand-drawn head at any size.
  function head(id, color) {
    return `<marker id="${id}" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1.4 L9 5 L1 8.6" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>`;
  }

  function caption(text, x, y, { size = 17, anchor = "middle", color = "var(--v-slate)", mode = "vars", palette, halo = true } = {}) {
    const stroke = mode === "vars" ? "var(--v-paper)" : palette.paper;
    const outline = halo ? ` paint-order="stroke" stroke="${stroke}" stroke-width="4.5" stroke-linejoin="round"` : "";
    return `<text x="${round(x)}" y="${round(y)}" font-size="${number(size, "a caption size")}" fill="${color}" text-anchor="${anchor}"${outline}>${esc(text)}</text>`;
  }

  const round = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value)) throw new Error(`not a number: ${n}`);
    return Math.round(value * 100) / 100;
  };

  // A scene is note data, not code. Every attribute value goes through here so a
  // quote can never close the attribute and start an event handler.
  const ATTR = /[&<>"']/g;
  const ATTR_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const attr = (value) => String(value ?? "").replace(ATTR, (c) => ATTR_MAP[c]);

  function number(value, what) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${what} is not a number: ${value}`);
    return n;
  }

  const ANCHORS = ["start", "middle", "end"];
  function anchor(value) {
    if (value === undefined) return "start";
    if (!ANCHORS.includes(value)) throw new Error(`a label anchor the engine does not have: "${value}" (anchors: ${ANCHORS.join(", ")})`);
    return value;
  }

  function arrowGlyph(a, palette, mode, rects) {
    const tone = a.tone ?? "slate";
    const color = ink(palette, tone, mode);
    const spot = placeLabel(rects, a, 17);
    const line = `M${round(a.x1)} ${round(a.y1)} L${round(a.x2)} ${round(a.y2)}`;
    const width = number(a.width ?? 2, "an arrow width");
    const label = a.label ? caption(a.label, spot.x, spot.y + 12, { anchor: spot.anchor, mode, palette }) : "";
    return `<path d="${line}" fill="none" stroke="${color}" stroke-width="${width}" marker-end="url(#head-${tone})" stroke-linecap="round"/>${label}`;
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
      parts.push(`<text x="${round(x + grid.w / 2)}" y="${round(y + grid.h / 2 + 6)}" font-size="${number(cell.size ?? 17, "a cell label size")}" fill="${ink(palette, cell.tone ?? "ink", mode)}" text-anchor="middle">${esc(cell.label)}</text>`);
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
      `<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.w)}" height="${round(b.h)}" rx="${round(number(b.rx ?? 4, "a box rx"))}" fill="${fill}" stroke="${stroke}" stroke-width="${number(b.strokeWidth ?? 1.2, "a box stroke width")}"/>`,
    ];
    if (b.label) parts.push(`<text x="${round(b.x + b.w / 2)}" y="${round(b.y + b.h / 2 + number(b.labelOffset ?? 6, "a label offset"))}" font-size="${number(b.size ?? 18, "a box label size")}" fill="${ink(palette, b.text ?? "ink", mode)}" text-anchor="middle">${esc(b.label)}</text>`);
    if (b.sub) parts.push(`<text x="${round(b.x + b.w / 2)}" y="${round(b.y + b.h / 2 + 26)}" font-size="${number(b.subSize ?? 13, "a box sub size")}" fill="${ink(palette, "slate", mode)}" text-anchor="middle">${esc(b.sub)}</text>`);
    return parts.join("");
  }

  function panelMarkup(p, palette, mode) {
    const lineH = number(p.lineH ?? 26, "a panel line height");
    const size = number(p.size ?? 16, "a panel text size");
    const lines = (p.lines ?? []).map((line, i) => `<text x="${round(p.x + 16)}" y="${round(p.y + 34 + i * lineH)}" font-size="${size}" fill="${ink(palette, "ink", mode)}">${esc(line)}</text>`).join("");
    return [
      `<rect x="${round(p.x)}" y="${round(p.y)}" width="${round(p.w)}" height="${round(p.h)}" rx="6" fill="${paint(palette, p.tone ?? "blue", 0.04, mode)}" stroke="${ink(palette, "line", mode)}" stroke-width="1"/>`,
      p.title ? `<text x="${round(p.x + 16)}" y="${round(p.y + 22)}" font-size="${number(p.titleSize ?? 15, "a panel title size")}" fill="${ink(palette, "slate", mode)}">${esc(p.title)}</text>` : "",
      lines,
    ].join("");
  }

  function dashedMarkup(d, palette, mode) {
    return [
      `<rect x="${round(d.x)}" y="${round(d.y)}" width="${round(d.w)}" height="${round(d.h)}" rx="${round(number(d.rx ?? 22, "a dashed rx"))}" fill="none" stroke="${ink(palette, d.tone ?? "muted", mode)}" stroke-width="${number(d.width ?? 1.6, "a dashed width")}" stroke-dasharray="14 10"/>`,
      d.label ? `<text x="${round(d.x + d.w / 2)}" y="${round(d.y + d.h / 2 + 5)}" font-size="${number(d.size ?? 16, "a dashed label size")}" fill="${ink(palette, "muted", mode)}" text-anchor="middle">${esc(d.label)}</text>` : "",
    ].join("");
  }

  function barsMarkup(bars, palette, mode) {
    const baseline = number(bars.baseline ?? 200, "a bar baseline");
    return (bars.bars ?? []).map((bar) => {
      const height = Math.abs(number(bar.h ?? 0, "a bar height"));
      const y = number(bar.h ?? 0, "a bar height") < 0 ? baseline : baseline - height;
      return [
        `<rect x="${round(bar.x)}" y="${round(y)}" width="${round(bar.w ?? 32)}" height="${round(height)}" rx="2" fill="${paint(palette, bar.tone ?? "blue", 0.16, mode)}" stroke="${ink(palette, bar.tone ?? "blue", mode)}" stroke-width="1"/>`,
        bar.label ? `<text x="${round(bar.x + (bar.w ?? 32) / 2)}" y="${round(y - 8)}" font-size="14" fill="${ink(palette, "ink", mode)}" text-anchor="middle">${esc(bar.label)}</text>` : "",
        bar.xLabel ? `<text x="${round(bar.x + (bar.w ?? 32) / 2)}" y="${round(baseline + 18)}" font-size="13" fill="${ink(palette, "slate", mode)}" text-anchor="middle">${esc(bar.xLabel)}</text>` : "",
      ].join("");
    }).join("");
  }

  function labelMarkup(l, palette, mode) {
    return `<text x="${round(l.x)}" y="${round(l.y)}" font-size="${number(l.size ?? 16, "a label size")}" fill="${ink(palette, l.tone ?? "ink", mode)}" text-anchor="${anchor(l.anchor)}"${l.weight ? ` font-weight="${number(l.weight, "a label weight")}"` : ""}>${esc(l.text)}</text>`;
  }

  function pathMarkup(p, palette, mode) {
    if (!p.d) throw new Error("a path needs a d attribute");
    const color = ink(palette, p.tone ?? "ink", mode);
    const end = p.arrow === false ? "" : ` marker-end="url(#head-${p.tone ?? "ink"})"`;
    return `<path d="${attr(p.d)}" fill="${p.fill ? ink(palette, p.fill, mode) : "none"}" stroke="${color}" stroke-width="${number(p.width ?? 1.8, "a path width")}" stroke-linecap="round"${end}/>`;
  }

  // A scene is drawn only when every entry is one the loops above can read.
  // These checks mirror those loops: a counter or a gate can therefore ask
  // `sceneDraws` and agree with the drawing instead of accepting a blank SVG.
  const LIST_KEYS = ["grids", "sheets", "panels", "dashed", "boxes", "arrows", "paths", "labels"];
  const ITEM_NUMBERS = {
    sheets: ["rx", "strokeWidth", "size", "subSize", "labelOffset", "alpha"],
    boxes: ["rx", "strokeWidth", "size", "subSize", "labelOffset", "alpha"],
    panels: ["lineH", "size", "titleSize"],
    dashed: ["rx", "width", "size"],
    arrows: ["width"],
    paths: ["width"],
    labels: ["size", "weight"],
  };
  const ITEM_TONES = {
    sheets: ["tone", "fill", "text"],
    boxes: ["tone", "fill", "text"],
    panels: ["tone"],
    dashed: ["tone"],
    arrows: ["tone"],
    paths: ["tone", "fill"],
    labels: ["tone"],
  };
  const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const toneProblem = (value) => (value === undefined || TONES.includes(value) ? "" : `a scene names a tone the theme does not have: "${value}"`);

  function itemProblem(key, item) {
    if (!isRecord(item)) return `a ${key} entry must be an object`;
    if (key === "grids") {
      if (!["cols", "rows", "w", "h"].every((field) => finite(item[field]) && Number(item[field]) > 0)) return "a grid needs cols, rows, w and h greater than zero";
      if (!Array.isArray(item.cells)) return "a grid needs a cells list";
      for (const cell of item.cells) {
        if (!isRecord(cell)) return "a grid cell must be an object";
        if (!finite(cell.c) || !finite(cell.r)) return "a grid cell needs its column and row";
        const tone = toneProblem(cell.tone);
        if (tone) return tone;
        if (cell.size !== undefined && !finite(cell.size)) return "a cell label size is not a number";
        if ((cell.kind === "value" || cell.value !== undefined) && (cell.text === undefined || cell.text === null) && !finite(cell.value)) return "a value cell needs a number or a text";
      }
      return "";
    }
    for (const field of ITEM_TONES[key] ?? []) {
      const tone = toneProblem(item[field]);
      if (tone) return tone;
    }
    for (const field of ITEM_NUMBERS[key] ?? []) {
      if (item[field] !== undefined && !finite(item[field])) return `a ${key} ${field} is not a number: ${item[field]}`;
    }
    if (key === "panels" && item.lines !== undefined && !Array.isArray(item.lines)) return "a panel needs a lines list";
    if (key === "labels" && item.anchor !== undefined && !ANCHORS.includes(item.anchor)) return `a label anchor the engine does not have: "${item.anchor}" (anchors: ${ANCHORS.join(", ")})`;
    if (item.alpha !== undefined && (Number(item.alpha) < 0 || Number(item.alpha) > 1)) return `alpha out of range: ${item.alpha}`;
    if (key === "arrows") return ["x1", "y1", "x2", "y2"].every((field) => finite(item[field])) ? "" : "an arrow needs both ends";
    if (key === "paths") return typeof item.d === "string" && item.d.trim() ? "" : "a path needs a d attribute";
    if (key === "labels") return finite(item.x) && finite(item.y) && item.text !== undefined && item.text !== null && String(item.text).length > 0 ? "" : "a label needs a place and a text";
    return ["x", "y", "w", "h"].every((field) => finite(item[field])) ? "" : `a ${key} entry needs x, y, w and h`;
  }

  function barsProblem(bars) {
    if (!isRecord(bars)) return "a scene's bars must be an object with a bars list";
    if (bars.bars !== undefined && !Array.isArray(bars.bars)) return "a scene's bars must hold a bars list";
    if (bars.baseline !== undefined && !finite(bars.baseline)) return "a bar baseline must be a number";
    for (const bar of bars.bars ?? []) {
      if (!isRecord(bar)) return "a bar must be an object";
      if (!finite(bar.x) || !finite(bar.h)) return "a bar needs its place and its height";
      if (bar.w !== undefined && !finite(bar.w)) return "a bar width must be a number";
      const tone = toneProblem(bar.tone);
      if (tone) return tone;
    }
    return "";
  }

  function sceneProblems(scene) {
    if (!isRecord(scene)) return ["a scene must be an object"];
    const problems = [];
    const box = String(scene.viewBox ?? "0 0 360 290").trim().split(/\s+/).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
      problems.push(`a viewBox needs four numbers and a positive size: ${JSON.stringify(scene.viewBox)}`);
    }
    for (const key of LIST_KEYS) {
      const value = scene[key];
      if (value === undefined || value === null) continue;
      if (!Array.isArray(value)) {
        problems.push(`a scene's ${key} must be a list`);
        continue;
      }
      value.forEach((item, index) => {
        const problem = itemProblem(key, item);
        if (problem) problems.push(`${problem} (${key}[${index}])`);
      });
    }
    if (scene.bars !== undefined && scene.bars !== null) {
      const problem = barsProblem(scene.bars);
      if (problem) problems.push(problem);
    }
    return problems;
  }

  // True when the scene is valid and at least one entry would paint something.
  // A grid without cells and a bars object without bars are valid JSON but
  // draw a blank box, which is not a figure. Cells still get the renderer's own
  // semantic refusal (an unknown kind or a policy without direction), so the
  // count never accepts a scene the drawing would skip.
  function sceneDraws(scene) {
    if (sceneProblems(scene).length) return false;
    const cellDraws = (cell) => {
      const kind = cell.kind ?? "free";
      if (!CELL_KINDS.includes(kind)) return false;
      return kind !== "policy" || (cell.dir in DIRECTIONS);
    };
    if ((scene.grids ?? []).some((grid) => (grid.cells ?? []).length > 0 && grid.cells.every(cellDraws))) return true;
    if (LIST_KEYS.some((key) => key !== "grids" && (scene[key] ?? []).length > 0)) return true;
    return ((scene.bars?.bars) ?? []).some((bar) => finite(bar.h) && Number(bar.h) !== 0);
  }

  function renderScene(scene, { theme: themeName = "light", mode = "vars", style = true } = {}) {
    if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}" (modes: ${MODES.join(", ")})`);
    const problems = sceneProblems(scene);
    if (problems.length) throw new Error(problems[0]);
    const palette = theme(themeName);
    const box = String(scene.viewBox ?? "0 0 360 290").trim().split(/\s+/).map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
      throw new Error(`a viewBox needs four numbers and a positive size: ${JSON.stringify(scene.viewBox)}`);
    }
    const [minX, minY, w] = box;
    const viewBox = box.join(" ");
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
    const styleTag = mode === "vars" && style ? varsStyle() : "";
    const title = scene.title ? caption(scene.title, minX + w / 2, minY + 18, { size: 20, anchor: "middle", color: ink(palette, "ink", mode), mode, palette, halo: false }) : "";
    const aria = scene.aria ? `<title>${esc(scene.aria)}</title>` : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">${styleTag}${aria}<defs>${markers}</defs>${title}${body.join("")}</svg>`;
  }

  const api = {
    TONES, THEMES, theme, mix, luminance, contrast, placeLabel,
    CELL_KINDS, DIRECTIONS, signed, varsStyle, themeCss, renderScene, sceneProblems, sceneDraws,
  };
  if (typeof window !== "undefined") window.LKVisuals = api;
  if (typeof module === "object" && module?.exports) module.exports = api;
})();
