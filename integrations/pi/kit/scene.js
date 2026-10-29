// Shared drawing vocabulary for the Learnings visual language: the palette and
// the SVG primitives of the slides (~/Developer/learnings-video-runs/slides), used
// by the studio tutorial and by the inline lk-walkthrough of a page.
(() => {
  const C = {
    ink: "#0F2E3D", slate: "#3F5B69", slate2: "#5A7481", line: "rgba(15,46,61,.30)", soft: "#F6F7F7", soft2: "#FAFBFB",
    blue: "#004276", blueS: "rgba(0,66,118,0.06)", green: "#21594F", greenS: "rgba(15,46,61,0.05)", amber: "#8A6B3F", amberS: "rgba(166,127,89,0.08)",
    red: "#DD4A68", redS: "rgba(221,74,104,0.07)", gold: "#a67f59", muted: "rgba(15,46,61,.62)", meta: "#555555",
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  const f = (n) => Number(n).toFixed(1);

  // ---------- illustrations (ported from illus.py) ----------

  const txt = (x, y, t, { size = 28, color = C.ink, bold = true, anchor = "middle", italic = false, fit = 0 } = {}) =>
    `<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${bold ? ' font-weight="700"' : ""}${italic ? ' font-style="italic"' : ""}${fit ? ` data-fit="${f(fit)}"` : ""}>${esc(t)}</text>`;

  const lbl = (x, y, t, o = {}) => txt(x, y, t, { size: 26, color: C.slate, bold: false, italic: true, ...o });

  const step = (n, body) => `<g data-step="${n}">${body}</g>`;

  const gear = (cx, cy, r = 60, teeth = 10, color = C.blue) => {
    const pts = [];
    for (let i = 0; i < teeth * 2; i++) {
      const ang = (Math.PI * i) / teeth;
      const rr = i % 2 === 0 ? r : r * 0.78;
      for (const d of [-0.12, 0.12]) pts.push(`${f(cx + rr * Math.cos(ang + d))} ${f(cy + rr * Math.sin(ang + d))}`);
    }
    return `<path d="M ${pts.join(" L ")} Z" fill="${color}"/><circle cx="${cx}" cy="${cy}" r="${f(r * 0.32)}" fill="#ffffff"/>`;
  };

  const packet = (x, y, color = C.blue, w = 70, h = 46) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" fill="#ffffff" stroke="${color}" stroke-width="2"/>` +
    `<path d="M ${x} ${y} L ${f(x + w / 2)} ${f(y + h * 0.55)} L ${x + w} ${y}" fill="none" stroke="${color}" stroke-width="2"/>`;

  const dashed = (x, y, w, h, label, color = C.slate2, fill = C.soft2) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${fill}" stroke="${color}" stroke-width="3.5" stroke-dasharray="14 10"/>` +
    (label ? txt(x + w / 2, y + 50, label, { size: 30, color: C.slate }) : "");

  const sheet = (x, y, w, h, title = "", lines = 4, color = C.slate) => {
    const fold = Math.min(34, w * 0.2);
    let out = `<path d="M ${x} ${y} H ${x + w - fold} L ${x + w} ${y + fold} V ${y + h} H ${x} Z" fill="#ffffff" stroke="${color}" stroke-width="2"/>` +
      `<path d="M ${x + w - fold} ${y} V ${y + fold} H ${x + w}" fill="${C.soft}" stroke="${color}" stroke-width="2"/>`;
    if (title) out += txt(x + 18, y + 40, title, { size: 22, anchor: "start" });
    for (let i = 0; i < lines; i++) out += `<rect x="${x + 18}" y="${f(y + (title ? 62 : 26) + i * 22)}" width="${f((w - 36) * (i % 3 === 2 ? 0.6 : 0.92))}" height="9" rx="4" fill="${C.line}"/>`;
    return out;
  };

  const box = (x, y, w, h, label, { stroke = C.ink, fill = "#ffffff", color = C.ink, size = 28, sub = "", rx = 0 } = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    txt(x + w / 2, y + h / 2 + (sub ? -2 : size * 0.35), label, { size, color, fit: w - 12 }) +
    (sub ? txt(x + w / 2, y + h / 2 + 30, sub, { size: 22, color: C.slate, bold: false, italic: true, fit: w - 12 }) : "");

  const node = (cx, cy, label, { fill = "#ffffff", stroke = C.ink, color = C.ink, r = 30 } = {}) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` + txt(cx, cy + 9, label, { size: 24, color });

  // A real table: header band, cell values and colour marks, so a figure can
  // show the data it talks about instead of four grey lines.
  const grid = (x, y, cols, rows, o = {}) => {
    const size = o.size || 22, rowH = o.rowH || 48, w = o.width || 560;
    const header = o.header === false ? 0 : 1;
    const colW = w / cols.length;
    const h = rowH * (rows.length + header);
    const tone = (t) => ({ blue: C.blueS, green: C.greenS, amber: C.amberS, red: C.redS, soft: C.soft }[t] || C.soft);
    const ink = (t) => ({ blue: C.blue, green: C.green, amber: C.amber, red: C.red }[t] || C.ink);
    let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" fill="#ffffff" stroke="${C.ink}" stroke-width="2"/>`;
    for (const [key, t] of Object.entries(o.rowTone || {})) {
      out += `<rect x="${x + 2}" y="${f(y + rowH * (Number(key) + header) + 1)}" width="${w - 4}" height="${rowH - 2}" fill="${tone(t)}"/>`;
    }
    for (const [key, t] of Object.entries(o.colTone || {})) {
      out += `<rect x="${f(x + colW * Number(key) + 1)}" y="${y + 2}" width="${f(colW - 2)}" height="${h - 4}" fill="${tone(t)}"/>`;
    }
    if (header) {
      out += `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${rowH - 1}" rx="0" fill="none"/>`;
      cols.forEach((c, i) => { out += txt(x + colW * (i + 0.5), f(y + rowH * 0.66), c, { size: size - 2, color: C.slate, fit: colW - 10 }); });
      out += `<path d="M ${x + 2} ${y + rowH + 1} H ${f(x + w - 2)}" stroke="${C.line}" stroke-width="2"/>`;
    }
    rows.forEach((row, r) => {
      if (r) out += `<path d="M ${x + 2} ${f(y + rowH * (r + header) + 1)} H ${f(x + w - 2)}" stroke="${C.line}" stroke-width="1.5"/>`;
      row.forEach((cell, c) => {
        const t = (o.cellTone || {})[`${r},${c}`];
        out += txt(x + colW * (c + 0.5), f(y + rowH * (r + header) + rowH / 2 + size * 0.36), cell, { size, color: t ? ink(t) : C.ink, bold: !!t || c === 0, fit: colW - 10 });
      });
    });
    return out;
  };

  const markerIds = { [C.slate]: "a-slate", [C.blue]: "a-blue", [C.green]: "a-green", [C.red]: "a-red", [C.amber]: "a-amber" };

  const defs = () =>
    `<defs>${Object.entries(markerIds).map(([color, id]) => `<marker id="${id}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M 0 0 L 12 6 L 0 12 Z" fill="${color}"/></marker>`).join("")}</defs>`;

  const curve = (x1, y1, x2, y2, { color = C.slate, dashedLine = false, arrow = true, bend = 0.35, width = 4 } = {}) => {
    const dx = (x2 - x1) * bend;
    return `<path d="M ${x1} ${y1} C ${f(x1 + dx)} ${y1}, ${f(x2 - dx)} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="10 9"' : ""}${arrow ? ` marker-end="url(#${markerIds[color] || "a-slate"})"` : ""}/>`;
  };

  const path = (d, { color = C.slate, dashedLine = false, arrow = true, width = 4 } = {}) =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="10 9"' : ""}${arrow ? ` marker-end="url(#${markerIds[color] || "a-slate"})"` : ""}/>`;

  const line = (x1, y1, x2, y2, { color = C.slate, arrow = true, width = 4, dashedLine = false } = {}) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="10 9"' : ""}${arrow ? ` marker-end="url(#${markerIds[color] || "a-slate"})"` : ""}/>`;

  const badge = (cx, cy, n) => `<circle cx="${cx}" cy="${cy}" r="24" fill="${C.blue}"/>` + txt(cx, cy + 9, String(n), { size: 26, color: "#ffffff" });

  /** A complete SVG document showing markup, sized by its viewBox. */
  const svg = (markup, viewBox = "0 0 1728 740") =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs()}${markup}</svg>`;

  window.LKScene = {
    C, esc, f, txt, lbl, step, gear, packet, dashed, sheet, box, node, badge, grid, defs,
    curve, path, line, svg,
  };
})();
