// The stage draws one frame at a time. frame(t) is a pure function of t: no CSS
// animation, no requestAnimationFrame, no clock — so a render is reproducible
// frame for frame, and Playwright can ask for any instant it wants.
(() => {
  const S = window.LKScene;
  const NS = "http://www.w3.org/2000/svg";
  const DRAW = 0.55; // seconds for one element to draw itself
  const STAGGER = 0.07; // seconds between consecutive entering elements
  const OUT = 0.28; // seconds for the previous state to fade

  const el = {
    kicker: document.getElementById("kicker"),
    title: document.getElementById("title"),
    figure: document.getElementById("fig"),
    counter: document.getElementById("counter"),
    stateTitle: document.getElementById("stateTitle"),
    stateText: document.getElementById("stateText"),
    brand: document.getElementById("brand"),
    note: document.querySelector(".note"),
    bar: document.getElementById("bar"),
  };

  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (v) => 1 - Math.pow(1 - v, 3);

  const TONES = () => ({
    blue: { stroke: S.C.blue, fill: S.C.blueS, color: S.C.blue },
    green: { stroke: S.C.green, fill: S.C.greenS, color: S.C.green },
    amber: { stroke: S.C.amber, fill: S.C.amberS, color: S.C.amber },
    red: { stroke: S.C.red, fill: S.C.redS, color: S.C.red },
    slate: { stroke: S.C.line, fill: "#ffffff", color: S.C.slate },
    ink: { stroke: S.C.ink, fill: "#ffffff", color: S.C.ink },
    muted: { stroke: S.C.line, fill: S.C.soft, color: S.C.muted },
  });

  const tone = (name) => TONES()[name] || TONES().ink;

  const sig = (kind, item) => kind + "|" + JSON.stringify(item);

  // ---- scene -> SVG ------------------------------------------------------
  // One <g> per primitive, so the animation can treat a box, an arrow and a
  // label as single units and reveal them in drawing order.
  function sceneMarkup(scene) {
    const out = [];
    let n = 0;
    const push = (kind, item, markup) => {
      out.push(`<g data-prim="${n++}" data-kind="${kind}" data-sig="${escapeAttr(sig(kind, item))}">${markup}</g>`);
    };

    for (const g of scene.grids || []) {
      push("shape", g, S.grid(g.x, g.y, g.cols, g.rows, g));
    }
    for (const s of scene.sheets || []) {
      push("shape", s, S.sheet(s.x, s.y, s.width || s.w, s.height || s.h, s.title || "", s.lines || 4));
    }
    for (const d of scene.dashed || []) {
      push("shape", d, S.dashed(d.x, d.y, d.w, d.h, d.label || "", d.color || S.C.slate2, d.fill || S.C.soft2));
    }
    for (const p of scene.panels || []) {
      push("shape", p, panel(p));
    }
    for (const b of scene.bars || []) {
      push("shape", b, bars(b));
    }
    for (const b of scene.boxes || []) {
      const t = tone(b.tone);
      push("shape", b, S.box(b.x, b.y, b.w, b.h, b.label, {
        stroke: t.stroke, fill: b.fill || t.fill, color: t.color, size: b.size || 22, sub: b.sub || "", rx: b.rx || 0,
      }));
    }
    for (const n2 of scene.nodes || []) {
      const t = tone(n2.tone);
      push("shape", n2, S.node(n2.cx, n2.cy, n2.label, { fill: t.fill, stroke: t.stroke, color: t.color, r: n2.r || 30 }));
    }
    // A policy field: one arrow per cell, drawn small in the cell's bottom-left
    // corner so it never sits on the cell's own label. A beat that says "una
    // flecha por casilla" then has the whole field on screen at once, and each
    // arrow is its own primitive, so the field can assemble cell by cell.
    for (const p of scene.policy || []) {
      const color = tone(p.tone || "blue").stroke;
      const [dx, dy] = direction(p.dir);
      const pad = p.pad || 6;
      const len = p.len || 18;
      const x0 = p.x + pad;
      const y0 = p.y + p.h - pad;
      push("stroke", p, S.line(x0, y0, x0 + dx * len, y0 + dy * len, { color, width: p.width || 2.5 }));
    }
    for (const g of scene.gears || []) {
      push("shape", g, S.gear(g.cx, g.cy, g.r || 60, g.teeth || 10, tone(g.tone).stroke));
    }
    for (const p of scene.packets || []) {
      push("shape", p, S.packet(p.x, p.y, tone(p.tone).stroke, p.w || 70, p.h || 46));
    }
    for (const a of scene.arrows || []) {
      const color = tone(a.tone).stroke;
      const width = a.width || 4;
      const markup = S.line(a.x1, a.y1, a.x2, a.y2, { color, width, dashedLine: !!a.dashed }) + arrowLabel(scene, a, color);
      push("stroke", a, markup);
    }
    for (const c of scene.curves || []) {
      const color = tone(c.tone).stroke;
      push("stroke", c, S.curve(c.x1, c.y1, c.x2, c.y2, { color, dashedLine: !!c.dashed, bend: c.bend || 0.35, width: c.width || 4 }));
    }
    for (const p of scene.paths || []) {
      const color = tone(p.tone).stroke;
      push("stroke", p, S.path(p.d, { color, dashedLine: !!p.dashed, width: p.width || 4 }));
    }
    for (const l of scene.lines || []) {
      const color = tone(l.tone).stroke;
      push("stroke", l, S.line(l.x1, l.y1, l.x2, l.y2, { color, width: l.width || 3, dashedLine: !!l.dashed, arrow: l.arrow !== false }));
    }
    for (const b of scene.badges || []) {
      push("shape", b, S.badge(b.cx, b.cy, b.n));
    }
    for (const f of scene.formulas || []) {
      push("text", f, formula(f));
    }
    for (const l of scene.labels || []) {
      push("text", l, S.lbl(l.x, l.y, l.text, {
        size: l.size || 18, color: l.color || S.C.muted, anchor: l.anchor || "middle", italic: !!l.italic, bold: !!l.bold,
      }));
    }
    return out.join("");
  }

  // A policy arrow points from the cell's centre outward: eight compass names,
  // so "up-right" is a diagonal and "right" a straight arrow.
  function direction(dir) {
    const parts = String(dir || "right").toLowerCase().split(/[-\s_]+/);
    const dx = parts.includes("left") ? -1 : parts.includes("right") ? 1 : 0;
    const dy = parts.includes("up") || parts.includes("top") ? -1 : parts.includes("down") || parts.includes("bottom") ? 1 : 0;
    if (!dx && !dy) return [1, 0];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // A caption on an arrow must not land on a box: try the four sides of the
  // arrow in order and keep the first one that clears every element.
  function labelPlace(scene, a, size) {
    const w = String(a.label).length * size * 0.52;
    const h = size * 1.15;
    const rects = [];
    for (const b of [...(scene.boxes || []), ...(scene.panels || []), ...(scene.dashed || []), ...(scene.bars || [])]) {
      rects.push([b.x, b.y, b.x + (b.w || b.width || 0), b.y + (b.h || b.height || 0)]);
    }
    for (const g of scene.grids || []) {
      rects.push([g.x, g.y, g.x + (g.width || 560), g.y + (g.rowH || 48) * ((g.rows || []).length + (g.header === false ? 0 : 1))]);
    }
    const crosses = (x1, y1, x2, y2) => rects.some((q) => x1 < q[2] + 2 && x2 > q[0] - 2 && y1 < q[3] + 2 && y2 > q[1] - 2);
    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2;
    const left = (x, anchor) => x - (anchor === "middle" ? w / 2 : anchor === "end" ? w : 0);
    // The row band the arrow sits in: clearing it beats squeezing between tiles.
    const band = rects.filter((q) => my > q[1] && my < q[3]);
    const top = band.length ? Math.min(...band.map((q) => q[1])) : my;
    const bottom = band.length ? Math.max(...band.map((q) => q[3])) : my;
    const left0 = band.length ? Math.min(...band.map((q) => q[0])) : mx;
    const right0 = band.length ? Math.max(...band.map((q) => q[2])) : mx;
    const candidates = Math.abs(a.x2 - a.x1) >= Math.abs(a.y2 - a.y1)
      ? [
        { x: mx, y: top - 8, anchor: "middle" },
        { x: mx, y: bottom + size + 10, anchor: "middle" },
        { x: a.x1 - 10, y: my + size * 0.35, anchor: "end" },
        { x: a.x2 + 10, y: my + size * 0.35, anchor: "start" },
        { x: mx, y: my - 14, anchor: "middle" },
      ]
      : [
        { x: left0 - 12, y: my + size * 0.35, anchor: "end" },
        { x: right0 + 12, y: my + size * 0.35, anchor: "start" },
        { x: mx + size * 0.8, y: my - 4, anchor: "start" },
        { x: mx - size * 0.8, y: my - 4, anchor: "end" },
      ];
    for (const c of candidates) {
      if (!crosses(left(c.x, c.anchor), c.y - h, left(c.x, c.anchor) + w, c.y)) return c;
    }
    return candidates[0];
  }

  function arrowLabel(scene, a, color) {
    if (!a.label) return "";
    const size = a.labelSize || 15;
    const at = labelPlace(scene, a, size);
    const x = at.x;
    const y = at.y;
    // A halo keeps a short arrow's caption readable when it lands on a box.
    const text = S.lbl(x, y, a.label, { size, color, anchor: at.anchor, italic: false, bold: true });
    return text.replace("<text ", '<text paint-order="stroke" stroke="#ffffff" stroke-width="5" stroke-linejoin="round" ');
  }

  function panel(p) {
    const t = tone(p.tone);
    let out = `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10" fill="${p.fill || t.fill}" stroke="${t.stroke}" stroke-width="2"/>`;
    if (p.title) out += S.txt(p.x + p.w / 2, p.y + 34, p.title, { size: p.size || 20, color: t.color });
    (p.lines || []).forEach((line, i) => {
      out += S.txt(p.x + p.w / 2, p.y + 34 + (i + 1) * (p.lineH || 30), line, { size: (p.size || 20) - 4, color: S.C.slate, bold: false, fit: p.w - 16 });
    });
    return out;
  }

  // A small value plot: bars grow from a baseline, labels sit under each bar.
  function bars(b) {
    const items = b.items || [];
    const max = b.max || Math.max(...items.map((i) => Math.abs(i.value)), 1);
    const w = b.w, h = b.h;
    const slot = w / Math.max(items.length, 1);
    const barW = Math.min(b.barW || 42, slot * 0.6);
    const zero = b.zero ?? h;
    let out = `<path d="M ${b.x} ${b.y + zero} H ${b.x + w}" stroke="${S.C.line}" stroke-width="2"/>`;
    items.forEach((it, i) => {
      const v = it.value / max;
      const bh = Math.abs(v) * (b.height || h * 0.8);
      const cx = b.x + slot * (i + 0.5);
      const t = tone(it.tone);
      const top = v >= 0 ? b.y + zero - bh : b.y + zero;
      out += `<rect x="${cx - barW / 2}" y="${top}" width="${barW}" height="${Math.max(bh, 1)}" fill="${t.fill}" stroke="${t.stroke}" stroke-width="2"/>`;
      out += S.txt(cx, v >= 0 ? top - 9 : top + bh + 18, it.note || String(it.value), { size: b.size || 14, color: t.color });
      out += S.lbl(cx, b.y + zero + (b.labelGap || 26), it.label, { size: b.size || 14, color: S.C.muted, italic: false });
    });
    if (b.caption) out += S.lbl(b.x + w / 2, b.y + zero + (b.labelGap || 26) + 26, b.caption, { size: 14, color: S.C.muted });
    return out;
  }

  function formula(f) {
    const size = f.size || 34;
    return S.txt(f.x, f.y, f.text, { size, color: f.color || S.C.ink, bold: true, anchor: f.anchor || "middle", fit: f.fit || 0 });
  }

  // ---- layers -----------------------------------------------------------
  function buildLayer(state, viewBox) {
    const g = document.createElementNS(NS, "g");
    g.style.display = "none";
    // Built through a parser, never innerHTML: the markup is ours, but the
    // engine should stay valid for any note author who copies a deck.
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="${NS}" viewBox="${viewBox}">${S.defs()}${sceneMarkup(state.scene)}</svg>`,
      "image/svg+xml",
    );
    const failure = doc.querySelector("parsererror");
    if (failure) throw new Error(`scene markup is not valid SVG: ${failure.textContent.slice(0, 300)}`);
    for (const child of [...doc.documentElement.children]) g.appendChild(document.importNode(child, true));
    const prims = [...g.children].map((node) => ({
      node,
      sig: node.getAttribute("data-sig"),
      kind: node.getAttribute("data-kind"),
      len: 0,
      head: null,
    }));
    for (const p of prims) {
      if (p.kind !== "stroke") continue;
      const path = p.node.querySelector("path");
      if (!path) continue;
      const total = path.getTotalLength();
      path.setAttribute("stroke-dasharray", String(total));
      path.setAttribute("stroke-dashoffset", String(total));
      p.len = total;
      if (path.getAttribute("marker-end")) {
        // The head must arrive with the line, not before it.
        const end = path.getPointAtLength(total);
        const before = path.getPointAtLength(Math.max(0, total - 2));
        const angle = (Math.atan2(end.y - before.y, end.x - before.x) * 180) / Math.PI;
        const head = document.createElementNS(NS, "polygon");
        // The base sits BEHIND the tip, so the triangle points the way the line
        // travels. With the base in front, every arrow in every part pointed
        // backwards: a viewer asked for an up arrow and never saw one.
        // A thin line gets a proportionally smaller head, or the head swallows
        // the whole shaft and the arrow reads as a bare triangle.
        const weight = Number(path.getAttribute("stroke-width")) || 4;
        const scale = Math.max(0.5, weight / 4);
        head.setAttribute("points", "0,0 -14,-6 -14,6");
        head.setAttribute("transform", `translate(${end.x},${end.y}) rotate(${angle}) scale(${scale})`);
        head.setAttribute("fill", path.getAttribute("stroke"));
        head.setAttribute("opacity", "0");
        path.removeAttribute("marker-end");
        p.node.appendChild(head);
        p.head = head;
      }
    }
    const sigs = new Set(prims.map((p) => p.sig));
    return { g, prims, sigs };
  }

  function paint(layer, at, prevSigs) {
    let rank = 0;
    for (const p of layer.prims) {
      const entering = !prevSigs.has(p.sig);
      const progress = entering ? ease(clamp((at - rank * STAGGER) / DRAW)) : 1;
      if (entering) rank++;
      if (p.kind === "stroke") {
        if (p.len) p.node.querySelector("path").setAttribute("stroke-dashoffset", String(p.len * (1 - progress)));
        if (p.head) p.head.setAttribute("opacity", String(progress * progress));
      } else {
        p.node.setAttribute("opacity", progress.toFixed(3));
        p.node.setAttribute("transform", `translate(0,${((1 - progress) * 6).toFixed(2)})`);
      }
    }
  }

  // ---- plan -------------------------------------------------------------
  let plan = null;
  let layersByBeat = [];
  let current = -1;

  function boot(next) {
    plan = next;
    el.brand.textContent = `${plan.part} · ${plan.title}`;
    el.figure.setAttribute("viewBox", plan.beats[0].viewBox);
    layersByBeat = plan.beats.map((beat) => {
      const svg = document.createElementNS(NS, "g");
      svg.style.display = "none";
      el.figure.appendChild(svg);
      return { svg, layers: null, beat };
    });
  }

  function layersFor(index) {
    const slot = layersByBeat[index];
    if (slot.layers) return slot.layers;
    const beat = plan.beats[index];
    slot.svg.replaceChildren();
    slot.layers = beat.states.map((state) => {
      const layer = buildLayer(state, beat.viewBox);
      slot.svg.appendChild(layer.g);
      return layer;
    });
    return slot.layers;
  }

  function frame(t) {
    const beat = pick(plan.beats, t);
    const index = plan.beats.indexOf(beat);
    if (index !== current) {
      for (const entry of layersByBeat) entry.svg.style.display = "none";
      current = index;
      el.kicker.textContent = beat.kicker || "";
      el.title.textContent = beat.title;
      el.figure.setAttribute("viewBox", beat.viewBox);
      layersByBeat[index].svg.style.display = "";
    }
    const layers = layersFor(index);
    const head = clamp((t - beat.start) / 0.35);
    el.kicker.style.opacity = head.toFixed(3);
    el.title.style.opacity = head.toFixed(3);

    let k = -1;
    for (let i = 0; i < beat.states.length; i++) if (t >= beat.states[i].t) k = i;
    layers.forEach((layer, i) => {
      layer.g.style.display = i === k || i === k - 1 ? "" : "none";
    });
    if (k < 0) {
      el.counter.textContent = "";
    } else {
      const st = beat.states[k];
      const prevSigs = k > 0 ? layers[k - 1].sigs : new Set();
      paint(layers[k], t, prevSigs);
      if (k > 0) {
        const gone = clamp((t - st.t) / OUT);
        layers[k - 1].g.setAttribute("opacity", String(1 - gone));
      }
      el.counter.textContent = `${k + 1} / ${beat.states.length}`;
      el.stateTitle.textContent = st.title || "";
      el.stateText.textContent = st.text || "";
      el.note.style.opacity = (clamp((t - st.t) / 0.3) * clamp((t - beat.start) / 0.3)).toFixed(3);
    }

    let covered = 0;
    for (const b of plan.beats) if (t >= b.start) covered = Math.min(t, b.end) - b.start + sumBefore(plan.beats, b);
    el.bar.style.width = `${clamp(covered / plan.total) * 100}%`;
  }

  function sumBefore(beats, beat) {
    let s = 0;
    for (const b of beats) {
      if (b === beat) break;
      s += b.end - b.start;
    }
    return s;
  }

  function pick(beats, t) {
    for (let i = 0; i < beats.length; i++) if (t < beats[i].end) return beats[i];
    return beats[beats.length - 1];
  }

  window.__boot = boot;
  window.__frame = frame;
  window.__ready = () => document.fonts.ready.then(() => true);
})();
