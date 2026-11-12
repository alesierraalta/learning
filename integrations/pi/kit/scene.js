// Shared drawing vocabulary for the Learnings visual language: the palette and
// the SVG primitives of the slides (~/Developer/learnings-video-runs/slides), used
// by the studio tutorial and by the inline lk-walkthrough of a page.
(() => {
  const C = {
    ink: "#0F2E3D", slate: "#3F5B69", slate2: "#5A7481", line: "rgba(15,46,61,.30)", soft: "#F6F7F7", soft2: "#FAFBFB",
    blue: "#004276", blueS: "rgba(0,66,118,0.06)", green: "#21594F", greenS: "rgba(15,46,61,0.05)", amber: "#8A6B3F", amberS: "rgba(166,127,89,0.08)",
    // El rojo de la figura es tinta, no un filete: se lee a 11 px sobre el papel
    // claro y el #DD4A68 de la página daba 4,0:1. Este da 4,7:1 y sigue siendo el
    // mismo acento magenta.
    red: "#CC405C", redS: "rgba(204,64,92,0.07)", gold: "#a67f59", muted: "rgba(15,46,61,.62)", meta: "#555555",
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

  // subDy/subSize travel with the label size: a scene drawn at the width of the
  // reading column uses 17-unit words, and a fixed 30-unit offset would push
  // the caption against the bottom edge. The defaults are the video's.
  const box = (x, y, w, h, label, { stroke = C.ink, fill = "#ffffff", color = C.ink, size = 28, sub = "", rx = 0, subDy = 30, subSize = 22 } = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    txt(x + w / 2, y + h / 2 + (sub ? -2 : size * 0.35), label, { size, color, fit: w - 12 }) +
    (sub ? txt(x + w / 2, y + h / 2 + subDy, sub, { size: subSize, color: C.slate, bold: false, italic: true, fit: w - 12 }) : "");

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

  // La punta de una flecha crece con el trazo —una flecha gruesa necesita una
  // punta gruesa— pero tiene tope: 3 × el grosor, entre 6 y 14 unidades. Antes
  // medía 11 × el grosor (44 unidades con un trazo de 4) y en un tramo de 80 se
  // leía como un triángulo suelto, que es lo que el alumno vio (#237). El tope se
  // mide en unidades del lienzo, así que el marcador se declara en
  // `userSpaceOnUse`: con `strokeWidth` la punta volvía a crecer sin límite.
  const HEAD = { ratio: 3, min: 6, max: 14 };
  const head = (width) => Math.min(HEAD.max, Math.max(HEAD.min, HEAD.ratio * (Number(width) || 0)));
  const markerNames = { [C.slate]: "slate", [C.blue]: "blue", [C.green]: "green", [C.red]: "red", [C.amber]: "amber" };
  const markerName = (color) => markerNames[color] || "slate";
  const markerId = (color, width) => `a-${markerName(color)}-${Math.round(head(width))}`;

  // Un marcador por color y por grosor: la punta depende del trazo que la lleva.
  // Los grosores salen del propio dibujo, así que `defs` lee el marcado que va a
  // envolver; el 4 es el trazo por defecto de `line`, `curve` y `path`.
  const defs = (markup = "") => {
    const text = String(markup);
    const widths = new Set([4]);
    for (const m of text.matchAll(/stroke-width="([0-9.]+)"/g)) widths.add(Number(m[1]));
    // Las piezas del escenario (movimientos y marcas) fijan su grosor al medir, no
    // en el marcado: sus puntas se declaran aquí.
    if (text.includes("data-move-")) widths.add(1.5);
    if (text.includes("data-mark-")) widths.add(2);
    const markers = new Map();
    for (const color of Object.keys(markerNames)) {
      for (const width of widths) {
        const id = markerId(color, width);
        if (markers.has(id)) continue;
        const size = head(width);
        markers.set(id, `<marker id="${id}" viewBox="0 0 12 12" refX="12" refY="6" markerUnits="userSpaceOnUse" markerWidth="${f(size)}" markerHeight="${f(size)}" orient="auto-start-reverse"><path d="M 0 0 L 12 6 L 0 12 Z" fill="${color}"/></marker>`);
      }
    }
    return `<defs>${[...markers.values()].join("")}</defs>`;
  };

  const curve = (x1, y1, x2, y2, { color = C.slate, dashedLine = false, arrow = true, bend = 0.35, width = 4 } = {}) => {
    const dx = (x2 - x1) * bend;
    return `<path d="M ${x1} ${y1} C ${f(x1 + dx)} ${y1}, ${f(x2 - dx)} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="10 9"' : ""}${arrow ? ` marker-end="url(#${markerId(color, width)})"` : ""}/>`;
  };

  // Un trazo puede cerrar una región: `fill` pinta el interior (la banda ±σ bajo la
  // curva) y el contorno sigue siendo el mismo camino. Sin `fill`, no pinta nada.
  const path = (d, { color = C.slate, dashedLine = false, arrow = true, width = 4, fill = "none" } = {}) =>
    `<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="10 9"' : ""}${arrow ? ` marker-end="url(#${markerId(color, width)})"` : ""}/>`;

  const line = (x1, y1, x2, y2, { color = C.slate, arrow = true, width = 4, dashedLine = false } = {}) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="10 9"' : ""}${arrow ? ` marker-end="url(#${markerId(color, width)})"` : ""}/>`;

  // Una fórmula puesta en escena: cada símbolo es un átomo propio, así una llamada
  // puede señalar «esta V» o «esta s» sin adivinar coordenadas de la cadena entera.
  // `offset` numera los átomos de una escena con varias fórmulas: un callout nombra
  // el símbolo por su número en la escena, no por su lugar dentro de una fórmula.
  // Un átomo puede llevar `id` estable: el paso de un recorrido resalta ese id y
  // el resto queda atenuado, sin que el autor escriba una coordenada.
  const formula = (cx, cy, atoms, { size = 64, color = C.ink, anchor: anchorMode = "middle", offset = 0, focus = null, focusColor = C.blue, dim = true } = {}) => {
    const focused = focus && focus.length ? new Set(focus.map(String)) : null;
    const parts = atoms.map((a, i) => {
      const kind = typeof a === "string" ? { t: a } : a;
      const id = kind.id ?? String(i);
      const on = focused ? focused.has(id) || focused.has(String(i)) : false;
      const dy = kind.sub ? "12" : kind.sup ? "-18" : "0";
      const fs = kind.sub || kind.sup ? size * 0.52 : size;
      const style = kind.italic === false ? "" : ' font-style="italic"';
      const mark = focused ? (on ? ` fill="${focusColor}" data-focus="1"` : (dim ? ' fill-opacity="0.28"' : '')) : "";
      return `<tspan data-atom="${offset + i}" data-atom-id="${esc(id)}" font-size="${f(fs)}" dy="${dy}"${style}${mark}>${esc(kind.t)}</tspan>`;
    }).join("");
    return `<text x="${f(cx)}" y="${f(cy)}" text-anchor="${anchorMode}" font-size="${f(size)}" font-weight="700" fill="${color}">${parts}</text>`;
  };

  // Un rótulo con punta: el nombre del actor va arriba, en una ficha con un
  // puntero que baja hasta su caja. La posición la mide `placeStory` sobre la
  // caja dibujada, así el rótulo acierta en cualquier tipografía y ancho.
  const tag = (text, { color = C.slate, fill = "#ffffff", size = 13 } = {}) => {
    const w = Math.max(30, String(text).length * size * 0.56 + 16), h = size + 12;
    return `<g data-tag-chip="1"><rect x="${f(-w / 2)}" y="${f(-h)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`
      + `<text x="0" y="${f(-h / 2 + size * 0.36)}" font-size="${size}" fill="${color}" text-anchor="middle" font-weight="700">${esc(text)}</text>`
      + `<path d="M -4 0 L 0 6 L 4 0 Z" fill="${color}"/></g>`;
  };

  // Un codo ortogonal: el conector que une un rótulo con su blanco sin cruzar
  // nada. Si los dos puntos comparten columna, es una línea recta.
  const elbow = (x1, y1, x2, y2, { color = C.slate, width = 1.5, dashedLine = false } = {}) => {
    const my = f((y1 + y2) / 2);
    const d = Math.abs(x1 - x2) < 2 ? `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}` : `M ${f(x1)} ${f(y1)} L ${f(x1)} ${my} L ${f(x2)} ${my} L ${f(x2)} ${f(y2)}`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dashedLine ? ' stroke-dasharray="5 4"' : ""}/>`;
  };

  // La marca del resultado: ✓ o ✗, del tamaño de la letra que la rodea.
  const mark = (kind, x, y, { color = C.green, size = 26 } = {}) =>
    txt(x, y, kind === "no" ? "✗" : "✓", { size, color, bold: true });

  // Objetos dibujados: lo que se mueve o cambia es el objeto, no una caja con su nombre.
  const icon = (kind, cx, cy, size = 64, { stroke = C.ink, fill = "#ffffff" } = {}) => {
    const s = size;
    const sw = Math.max(2, s * 0.045);
    const st = `fill="none" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"`;
    if (kind === "robot") {
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(s * 0.5)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<circle cx="${f(cx)}" cy="${f(cy - s * 0.08)}" r="${f(s * 0.13)}" fill="${stroke}"/>`
        + `<path d="M ${f(cx - s * 0.32)} ${f(cy + s * 0.22)} H ${f(cx + s * 0.32)}" ${st}/>`
        + `<path d="M ${f(cx - s * 0.1)} ${f(cy + s * 0.34)} H ${f(cx + s * 0.1)}" fill="none" stroke="${stroke}" stroke-width="${f(sw * 1.6)}" stroke-linecap="round"/>`;
    }
    if (kind === "house") {
      return `<path d="M ${f(cx - s * 0.46)} ${f(cy - s * 0.04)} L ${f(cx)} ${f(cy - s * 0.44)} L ${f(cx + s * 0.46)} ${f(cy - s * 0.04)}" ${st}/>`
        + `<rect x="${f(cx - s * 0.36)}" y="${f(cy - s * 0.04)}" width="${f(s * 0.72)}" height="${f(s * 0.48)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<rect x="${f(cx - s * 0.11)}" y="${f(cy + s * 0.14)}" width="${f(s * 0.22)}" height="${f(s * 0.3)}" fill="${stroke}"/>`;
    }
    if (kind === "doc") {
      const fold = s * 0.24;
      return `<path d="M ${f(cx - s * 0.3)} ${f(cy - s * 0.42)} H ${f(cx + s * 0.3 - fold)} L ${f(cx + s * 0.3)} ${f(cy - s * 0.42 + fold)} V ${f(cy + s * 0.42)} H ${f(cx - s * 0.3)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<path d="M ${f(cx + s * 0.3 - fold)} ${f(cy - s * 0.42)} V ${f(cy - s * 0.42 + fold)} H ${f(cx + s * 0.3)}" ${st}/>`
        + [0, 1, 2].map((i) => `<path d="M ${f(cx - s * 0.18)} ${f(cy - s * 0.08 + i * s * 0.16)} H ${f(cx + s * 0.18)}" fill="none" stroke="${stroke}" stroke-width="${f(sw * 0.8)}" stroke-linecap="round"/>`).join("");
    }
    if (kind === "person") {
      return `<circle cx="${f(cx)}" cy="${f(cy - s * 0.2)}" r="${f(s * 0.17)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<path d="M ${f(cx - s * 0.3)} ${f(cy + s * 0.44)} Q ${f(cx)} ${f(cy - s * 0.02)} ${f(cx + s * 0.3)} ${f(cy + s * 0.44)}" ${st}/>`;
    }
    if (kind === "coin") {
      return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(s * 0.42)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<path d="M ${f(cx - s * 0.14)} ${f(cy - s * 0.12)} H ${f(cx + s * 0.14)} M ${f(cx)} ${f(cy - s * 0.12)} V ${f(cy + s * 0.16)}" fill="none" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linecap="round"/>`;
    }
    if (kind === "gear") {
      const teeth = 10, r = s * 0.42, pts = [];
      for (let i = 0; i < teeth * 2; i++) {
        const ang = (Math.PI * i) / teeth;
        const rr = i % 2 === 0 ? r : r * 0.78;
        for (const d of [-0.12, 0.12]) pts.push(`${f(cx + rr * Math.cos(ang + d))} ${f(cy + rr * Math.sin(ang + d))}`);
      }
      return `<path d="M ${pts.join(" L ")} Z" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.34)}" fill="none" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
    }
    return "";
  };


  // Una pieza que carga significado, no una caja con su nombre: un valor en un
  // cofre, un ojo que lee, un lápiz que escribe. Se dibuja centrada en (cx, cy) y
  // sin texto: la etiqueta la pone quien la coloca, midiendo lo que el navegador
  // dibujó. Un tipo que no conoce devuelve "" y quien llama prueba con un icono.
  const prop = (kind, cx, cy, size = 34, { stroke = C.ink, fill = "#ffffff" } = {}) => {
    const s = size;
    const sw = Math.max(2, s * 0.06);
    const line = (extra = "") => `fill="none" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"${extra}`;
    if (kind === "value") {
      const top = cy - s * 0.36, h = s * 0.72;
      return `<rect x="${f(cx - s / 2)}" y="${f(top)}" width="${f(s)}" height="${f(h)}" rx="${f(s * 0.1)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`
        + `<path d="M ${f(cx - s / 2)} ${f(top + h * 0.38)} H ${f(cx + s / 2)}" ${line()}/>`
        + `<rect x="${f(cx - s * 0.08)}" y="${f(top + h * 0.38 - s * 0.07)}" width="${f(s * 0.16)}" height="${f(s * 0.2)}" rx="${f(s * 0.03)}" fill="${stroke}"/>`;
    }
    if (kind === "read") {
      return `<path d="M ${f(cx - s / 2)} ${f(cy)} Q ${f(cx)} ${f(cy - s * 0.62)} ${f(cx + s / 2)} ${f(cy)} Q ${f(cx)} ${f(cy + s * 0.62)} ${f(cx - s / 2)} ${f(cy)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`
        + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(s * 0.19)}" fill="${stroke}"/>`;
    }
    if (kind === "write") {
      const u = { x: 0.7071, y: -0.7071 }, n = { x: 0.7071, y: 0.7071 };
      const at = (t, w) => `${f(cx + u.x * s * t + n.x * s * w)} ${f(cy + u.y * s * t + n.y * s * w)}`;
      const h = 0.11;
      return `<path d="M ${at(-0.5, 0)} L ${at(-0.26, h)} L ${at(0.5, h)} L ${at(0.5, -h)} L ${at(-0.26, -h)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`
        + `<path d="M ${at(0.3, h)} L ${at(0.3, -h)}" ${line()}/>`
        + `<path d="M ${at(-0.5, 0)} L ${at(-0.36, 0)}" fill="none" stroke="${stroke}" stroke-width="${f(sw * 1.8)}" stroke-linecap="round"/>`;
    }
    return "";
  };

  // Una proporción se ve, no se lee: barra, etiqueta y valor al final.
  const bars = (x, y, rows, { width = 560, rowH = 56, labelW = 175, valueW = 95 } = {}) => {
    const barW = width - labelW - valueW;
    const max = Math.max(...rows.map((r) => (r.max ?? r.value)), 1);
    return rows.map((r, i) => {
      const yy = y + i * rowH;
      const w = Math.max(3, (r.value / max) * barW);
      return `<text x="${f(x)}" y="${f(yy + rowH * 0.62)}" font-size="20" fill="${C.ink}" font-weight="700">${esc(r.label)}</text>`
        + `<rect x="${f(x + labelW)}" y="${f(yy + rowH * 0.22)}" width="${f(barW)}" height="${f(rowH * 0.44)}" fill="${C.soft}"/>`
        + `<rect x="${f(x + labelW)}" y="${f(yy + rowH * 0.22)}" width="${f(w)}" height="${f(rowH * 0.44)}" fill="${r.color || C.blue}"/>`
        + `<text x="${f(x + labelW + barW + 14)}" y="${f(yy + rowH * 0.62)}" font-size="20" fill="${C.slate}" font-weight="700">${esc(r.display || String(r.value) + (r.unit || ""))}</text>`;
    }).join("");
  };

  // Una cifra que importa, grande, con su nombre debajo.
  const stat = (cx, cy, value, label = "", { color = C.ink, size = 54 } = {}) =>
    txt(cx, cy, String(value), { size, color })
    + (label ? txt(cx, cy + size * 0.78, label, { size: 18, color: C.slate, bold: false, italic: true }) : "");

  const badge = (cx, cy, n) => `<circle cx="${cx}" cy="${cy}" r="24" fill="${C.blue}"/>` + txt(cx, cy + 9, String(n), { size: 26, color: "#ffffff" });

  /** A complete SVG document showing markup, sized by its viewBox. */
  const svg = (markup, viewBox = "0 0 1728 740") =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs(markup)}${markup}</svg>`;

  window.LKScene = {
    C, esc, f, txt, lbl, step, gear, packet, dashed, sheet, box, node, badge, grid, icon, prop, bars, stat, formula, defs,
    curve, path, line, svg, tag, elbow, mark, head, markerId,
  };
})();
