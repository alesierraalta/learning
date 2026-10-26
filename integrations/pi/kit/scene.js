// Shared drawing vocabulary for the Learnings visual language: the palette and
// the SVG primitives of the slides (~/Developer/learnings-video-runs/slides), used
// by the studio tutorial and by the inline lk-walkthrough of a page.
(() => {
  const C = {
    ink: "#0f172a", slate: "#334155", slate2: "#475569", line: "#cbd5e1", soft: "#f1f5f9", soft2: "#f8fafc",
    blue: "#2563eb", blueS: "#dbeafe", green: "#059669", greenS: "#d1fae5", amber: "#d97706", amberS: "#fef3c7",
    red: "#dc2626", redS: "#fee2e2", gold: "#d4a017", muted: "#64748b", meta: "#555555",
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  const f = (n) => Number(n).toFixed(1);

  // ---------- illustrations (ported from illus.py) ----------

  const txt = (x, y, t, { size = 28, color = C.ink, bold = true, anchor = "middle", italic = false } = {}) =>
    `<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${bold ? ' font-weight="700"' : ""}${italic ? ' font-style="italic"' : ""}>${esc(t)}</text>`;

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
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#ffffff" stroke="${color}" stroke-width="3"/>` +
    `<path d="M ${x} ${y} L ${f(x + w / 2)} ${f(y + h * 0.55)} L ${x + w} ${y}" fill="none" stroke="${color}" stroke-width="3"/>`;

  const dashed = (x, y, w, h, label, color = C.slate2, fill = C.soft2) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${fill}" stroke="${color}" stroke-width="3.5" stroke-dasharray="14 10"/>` +
    (label ? txt(x + w / 2, y + 50, label, { size: 30, color: C.slate }) : "");

  const sheet = (x, y, w, h, title = "", lines = 4, color = C.slate) => {
    const fold = Math.min(34, w * 0.2);
    let out = `<path d="M ${x} ${y} H ${x + w - fold} L ${x + w} ${y + fold} V ${y + h} H ${x} Z" fill="#ffffff" stroke="${color}" stroke-width="3"/>` +
      `<path d="M ${x + w - fold} ${y} V ${y + fold} H ${x + w}" fill="${C.soft}" stroke="${color}" stroke-width="3"/>`;
    if (title) out += txt(x + 18, y + 40, title, { size: 22, anchor: "start" });
    for (let i = 0; i < lines; i++) out += `<rect x="${x + 18}" y="${f(y + (title ? 62 : 26) + i * 22)}" width="${f((w - 36) * (i % 3 === 2 ? 0.6 : 0.92))}" height="9" rx="4" fill="${C.line}"/>`;
    return out;
  };

  const box = (x, y, w, h, label, { stroke = C.ink, fill = "#ffffff", color = C.ink, size = 28, sub = "", rx = 6 } = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>` +
    txt(x + w / 2, y + h / 2 + (sub ? -2 : size * 0.35), label, { size, color }) +
    (sub ? txt(x + w / 2, y + h / 2 + 30, sub, { size: 22, color: C.slate, bold: false, italic: true }) : "");

  const node = (cx, cy, label, { fill = "#ffffff", stroke = C.ink, color = C.ink, r = 30 } = {}) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>` + txt(cx, cy + 9, label, { size: 24, color });

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
    C, esc, f, txt, lbl, step, gear, packet, dashed, sheet, box, node, badge, defs,
    curve, path, line, svg,
  };
})();
