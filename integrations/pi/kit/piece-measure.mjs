// Mide lo que el lector dibujó de una pieza visual (tarjetas de veredicto, memoria,
// tablas unidas, conjuntos). Una sola función, sin dependencias de fuera: se
// serializa dentro del navegador (`page.evaluate(measurePiece, opts)` o
// `host.evaluate(measurePiece, opts)`), así los tests del lector, `scene-gate` y
// `scene-lint` miden con la misma vara.
//
// Cada hallazgo es { kind, text, detail }:
//   empty-piece          la pieza no dibujó nada o mide casi cero
//   off-canvas           algo se sale de su escenario o la pieza desborda en horizontal;
//                        dentro del marco de desplazamiento de una tabla, lo que se corta antes de su
//                        inicio o una primera columna cortada al abrir sí cuenta, y lo que queda tras
//                        su final es alcanzable deslizando
//   text-too-small       una palabra baja del tamaño de lectura
//   text-over-text       dos palabras se pisan
//   connector-miss       un conector no empieza o no termina en su ancla medida
//   connector-over-text  un conector atraviesa una palabra que no es suya
//   outline-over-text    el borde de un conjunto atraviesa una palabra
//   texto-justificado    una palabra se alinea justificada: la prosa del lector se
//                        justifica y esa regla no vale dentro de una pieza
//   faint-ink            una tinta no se lee sobre su fondo (< 4,5:1)
//   white-island         una superficie blanca sobre el papel de noche
//
// `scope`: "all" (por defecto), "geometry" (empty, off-canvas, size, connectors) o
// "convivencia" (text-over-text, connector-over-text).
export function measurePiece(host, { minPx = 13, scope = 'all', slack = 1 } = {}) {
  const problems = [];
  const add = (kind, text, detail) => problems.push({ kind, text: String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), detail });
  const wants = (name) => scope === 'all' || scope === name;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
  };
  const pieces = [...host.querySelectorAll('.lk-p')].filter(shown);
  if (!pieces.length) { add('empty-piece', host.getAttribute('title') || host.tagName.toLowerCase(), 'la pieza no se dibujó'); return { problems }; }

  const canvas = (host.querySelector?.('.lk-story-stage') || host).getBoundingClientRect();
  const rgb = (value) => {
    const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\)/.exec(value || '');
    if (!m) return null;
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]; return (hi + 0.05) / (lo + 0.05); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const paperBehind = (node) => {
    const layers = [];
    for (let n = node; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    return layers.reduceRight((under, c) => over(c, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const night = ['dark', 'black'].includes(document.documentElement.dataset.theme);

  // Lo que el lector ve de una palabra: dentro de un marco de desplazamiento, solo lo que el marco deja ver.
  // Una palabra fuera de su marco no se ve y su caja vacía no choca con nada.
  const seenBox = (node, b) => {
    const frame = node.closest?.('.lk-tframe');
    if (!frame) return b;
    const f = frame.getBoundingClientRect();
    const left = Math.max(b.left, f.left), right = Math.min(b.right, f.right);
    if (right <= left) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    return { left, right, top: b.top, bottom: b.bottom, width: right - left, height: b.height };
  };
  const words = [];
  for (const piece of pieces) {
    const walker = document.createTreeWalker(piece, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      const owner = node.parentElement;
      if (!text || !owner || owner.closest('[hidden], [data-measure-skip]') || owner.tagName === 'SCRIPT' || owner.tagName === 'STYLE') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const b = range.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      const style = getComputedStyle(owner);
      const svg = owner instanceof SVGElement ? owner.ownerSVGElement : null;
      const px = parseFloat(style.fontSize) * (svg ? (svg.getScreenCTM()?.a || 1) : 1);
      const ink = rgb(svg ? style.fill : style.color);
      words.push({ text, owner, b: seenBox(owner, b), full: b, px, ink });
    }
  }

  // Lo que vive en el marco de desplazamiento de una tabla se mide contra ese marco, no
  // contra el escenario: lo que queda tras su final se alcanza deslizando; lo que se corta
  // antes de su inicio, la primera columna cortada al abrir y lo que no puede deslizar sí.
  const inFrame = (node, r) => {
    const frame = node.closest?.('.lk-tframe');
    if (!frame) return undefined;
    const f = frame.getBoundingClientRect();
    const cell = node.closest('td, th');
    if (frame.scrollLeft < 1 && r.left < f.left - slack) return `cortada antes de su marco: x ${Math.round(r.left)} < ${Math.round(f.left)}`;
    if (cell?.cellIndex === 0 && frame.scrollLeft < 1 && r.right > f.right + slack) return 'la primera columna queda cortada al abrir la tabla';
    if (frame.scrollWidth <= frame.clientWidth + 1 && (r.left < f.left - slack || r.right > f.right + slack)) return `fuera de su marco: x ${Math.round(r.left)}–${Math.round(r.right)} fuera de ${Math.round(f.left)}–${Math.round(f.right)}`;
    return null;
  };
  if (wants('geometry') || scope === 'all') {
    for (const piece of pieces) {
      if (piece.scrollWidth > piece.clientWidth + 1) add('off-canvas', piece.className, `la pieza desborda en horizontal: ${piece.scrollWidth} > ${piece.clientWidth}`);
      const r = piece.getBoundingClientRect();
      if (r.width < 40 || r.height < 24) add('empty-piece', piece.className, `${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    for (const w of words) {
      if (w.px < minPx) add('text-too-small', w.text, `${w.px.toFixed(1)} px (mínimo ${minPx})`);
      // La prosa del lector se justifica; una pieza no. Su texto se alinea al inicio o
      // al centro, y una línea corta justificada abre huecos entre palabras.
      if (getComputedStyle(w.owner).textAlign === 'justify') add('texto-justificado', w.text, 'la pieza se alinea justificada, no al inicio ni al centro');
      const framed = inFrame(w.owner, w.full);
      if (framed === undefined) {
        if (w.full.left < canvas.left - slack || w.full.right > canvas.right + slack) add('off-canvas', w.text, `x ${Math.round(w.full.left)}–${Math.round(w.full.right)} fuera de ${Math.round(canvas.left)}–${Math.round(canvas.right)}`);
        if (w.full.left < -slack || w.full.right > innerWidth + slack) add('off-canvas', w.text, 'queda fuera de la ventana');
      } else if (framed) add('off-canvas', w.text, framed);
    }
    for (const piece of pieces) for (const box of piece.querySelectorAll('[data-anchor], svg')) {
      const r = box.getBoundingClientRect();
      if (!r.width) continue;
      const framed = inFrame(box, r);
      if (framed === undefined) {
        if (r.left < canvas.left - slack || r.right > canvas.right + slack) add('off-canvas', box.dataset?.anchor || box.tagName.toLowerCase(), `x ${Math.round(r.left)}–${Math.round(r.right)} fuera de ${Math.round(canvas.left)}–${Math.round(canvas.right)}`);
      } else if (framed) add('off-canvas', box.dataset?.anchor || box.tagName.toLowerCase(), framed);
    }
    for (const w of words) {
      if (!w.ink) continue;
      const paper = paperBehind(w.owner);
      const c = ratio(over(w.ink, paper), paper);
      if (w.ink.a > 0.3 && c < 4.5) add('faint-ink', w.text, `${c.toFixed(1)}:1`);
    }
    if (night) {
      for (const piece of pieces) for (const el of piece.querySelectorAll('*')) {
        const c = rgb(getComputedStyle(el).backgroundColor);
        if (c && c.a > 0.9 && c.r > 240 && c.g > 240 && c.b > 240) { add('white-island', el.className?.baseVal ?? el.className, 'superficie blanca sobre papel de noche'); break; }
      }
    }
  }

  const anchorBox = (piece, id) => piece.querySelector(`[data-anchor="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null;
  const gap = (p, b) => Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom));
  const ends = (path) => {
    const m = path.getScreenCTM();
    const at = (len) => { const p = path.getPointAtLength(len); return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }; };
    return { at, total: path.getTotalLength() };
  };
  for (const piece of pieces) {
    for (const path of piece.querySelectorAll('svg path[data-from]')) {
      // Un conector oculto (su celda clave queda fuera de su marco) no se dibuja: no es un fallo de trazo.
      if (path.getAttribute('visibility') === 'hidden') continue;
      const { at, total } = ends(path);
      if (!total) { add('connector-miss', path.dataset.from, 'el conector no dibuja trazo'); continue; }
      const from = anchorBox(piece, path.dataset.from);
      const to = path.dataset.to ? anchorBox(piece, path.dataset.to) : null;
      if (wants('geometry') || scope === 'all') {
        if (!from) add('connector-miss', path.dataset.from, 'el ancla de salida no existe en el paso');
        else if (gap(at(0), from) > 3) add('connector-miss', path.dataset.from, `empieza a ${Math.round(gap(at(0), from))} px de su ancla`);
        if (path.dataset.to) {
          if (!to) add('connector-miss', path.dataset.to, 'el ancla de llegada no existe en el paso');
          else if (gap(at(total), to) > 3) add('connector-miss', path.dataset.to, `termina a ${Math.round(gap(at(total), to))} px de su ancla`);
        }
      }
      if (wants('convivencia')) {
        for (let len = 8; len < total - 8; len += 3) {
          const p = at(len);
          const hit = words.find((w) => p.x > w.b.left + 1 && p.x < w.b.right - 1 && p.y > w.b.top + 1 && p.y < w.b.bottom - 1);
          if (hit) { add('connector-over-text', `${path.dataset.from}→${path.dataset.to || '✗'}`, `cruza «${hit.text}»`); break; }
        }
      }
    }
  }

  if (wants('convivencia')) {
    // El contorno de un conjunto (un círculo de un Venn) tampoco pasa por una palabra.
    for (const circle of pieces.flatMap((piece) => [...piece.querySelectorAll('circle[data-set]')])) {
      const m = circle.getScreenCTM();
      const cx = +circle.getAttribute('cx'), cy = +circle.getAttribute('cy'), r = +circle.getAttribute('r');
      for (let a = 0; a < 360; a += 3) {
        const x = cx + r * Math.cos(a * Math.PI / 180), y = cy + r * Math.sin(a * Math.PI / 180);
        const p = { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
        const hit = words.find((w) => p.x > w.b.left + 1 && p.x < w.b.right - 1 && p.y > w.b.top + 1 && p.y < w.b.bottom - 1);
        if (hit) { add('outline-over-text', circle.dataset.set, `el borde cruza «${hit.text}»`); break; }
      }
    }
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const a = words[i], b = words[j];
        if (a.owner === b.owner) continue;
        const ox = Math.min(a.b.right, b.b.right) - Math.max(a.b.left, b.b.left);
        const oy = Math.min(a.b.bottom, b.b.bottom) - Math.max(a.b.top, b.b.top);
        if (ox <= 0 || oy <= 0) continue;
        if (ox * oy > 0.2 * Math.min(a.b.width * a.b.height, b.b.width * b.b.height)) add('text-over-text', `${a.text} / ${b.text}`, `${Math.round(ox * oy)} px² encima`);
      }
    }
  }
  return { problems };
}
