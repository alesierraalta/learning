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
//   focused-out-of-view  el actor enfocado del explorador se sale de su mapa
//   log-overflow         una fila del registro del explorador se desborda
//   travel-over-text     la etiqueta de lo que viaja tapa una palabra
//   map-underfilled      el mapa del explorador no llena su panel en el ancho amplio
//   log-header-orphan    una cabecera del registro cae en otra línea o se parte
//   log-cell-stacked     una celda del registro cae bajo su fila en el ancho amplio
//   log-cell-wraps       una celda que no es la información se parte en dos líneas
//   log-cell-overflow    una celda del registro se desborda de su columna
//   subtitle-style       un subtítulo del paso va en versalitas, con espaciado o bajo el mínimo
//   link-on-edge         un trazo del explorador queda al borde de su panel
//
// `scope`: "all" (por defecto), "geometry" (empty, off-canvas, size, connectors) o
// "convivencia" (text-over-text, connector-over-text).
export function measurePiece(host, { minPx = 13, scope = 'all', slack = 1 } = {}) {
  const problems = [];
  const add = (kind, text, detail) => problems.push({ kind, text: String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), detail });
  const wants = (name) => scope === 'all' || scope === name;
  // Una vista oculta no se mide: el `hidden` del atributo y un `<details>` cerrado
  // dejan cajas con tamaño pero nada que el lector vea.
  const off = (node) => Boolean(node.closest('[hidden], details:not([open])'));
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !off(el);
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
      if (!text || !owner || off(owner) || owner.closest('[data-measure-skip]') || owner.tagName === 'SCRIPT' || owner.tagName === 'STYLE') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      // Un nodo que el texto parte en varias líneas se mide línea a línea: su caja entera
      // se extiende hasta la línea de al lado y tapaba una ficha que no la toca.
      const lines = [...range.getClientRects()].filter((b) => b.width >= 1 && b.height >= 1);
      if (!lines.length) continue;
      const style = getComputedStyle(owner);
      const svg = owner instanceof SVGElement ? owner.ownerSVGElement : null;
      const px = parseFloat(style.fontSize) * (svg ? (svg.getScreenCTM()?.a || 1) : 1);
      const ink = rgb(svg ? style.fill : style.color);
      for (const b of lines) words.push({ text, owner, b: seenBox(owner, b), full: b, px, ink });
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
    // #228: el explorador enfoca a los actores de cada paso. El enfocado se queda
    // dentro de su mapa en cualquier ancho, y una fila del registro no se desborda.
    for (const map of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xmap')])) {
      if (!shown(map)) continue;
      const box = map.getBoundingClientRect();
      for (const actor of map.querySelectorAll('.lk-xactor[data-focus="1"]')) {
        const r = actor.getBoundingClientRect();
        if (r.left < box.left - slack || r.right > box.right + slack || r.top < box.top - slack || r.bottom > box.bottom + slack) add('focused-out-of-view', actor.dataset.actor, 'el actor enfocado se sale de su mapa');
        else if (r.left < -slack || r.right > innerWidth + slack) add('focused-out-of-view', actor.dataset.actor, 'el actor enfocado se sale de la ventana');
      }
    }
    for (const row of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xlogrow')])) {
      if (!shown(row)) continue;
      if (row.scrollWidth > row.clientWidth + 1) add('log-overflow', row.textContent, `${row.scrollWidth} > ${row.clientWidth}`);
    }
    // #228 (segunda tanda): el mapa llena su panel en el ancho amplio. El panel es la fila de
    // la rejilla (la lista la marca): los actores cubren al menos el 60 % de su alto y van
    // centrados. Apilado (teléfono) o en una sola columna, el mapa no comparte fila: no aplica.
    for (const grid of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xgrid')])) {
      const list = grid.querySelector('.lk-xlist'), map = grid.querySelector('.lk-xmap');
      if (!list || !map || off(map) || !shown(grid)) continue;
      const g = grid.getBoundingClientRect();
      if (list.getBoundingClientRect().right > map.getBoundingClientRect().left + 1) continue;
      const cards = [...map.querySelectorAll('.lk-xactor')].filter(shown);
      if (!cards.length) continue;
      const top = Math.min(...cards.map((c) => c.getBoundingClientRect().top));
      const bottom = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom));
      const share = (bottom - top) / g.height;
      if (share < 0.6) add('map-underfilled', 'mapa', `los actores cubren ${Math.round(share * 100)} % del panel (mínimo 60 %)`);
      else if (Math.abs((top + bottom) / 2 - (g.top + g.bottom) / 2) > 0.15 * g.height) add('map-underfilled', 'mapa', 'los actores no van centrados en el panel');
    }
    // #228 (segunda tanda): el registro es una tabla. Las cabeceras visibles comparten línea
    // y cada título cabe en una; en el ancho amplio cada celda cae en su columna, en su línea,
    // y la fila ocupa una sola salvo que su información se parta de verdad.
    const linesOf = (node) => { const r = document.createRange(); r.selectNodeContents(node); return r.getClientRects().length; };
    for (const log of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xlog')])) {
      if (!shown(log)) continue;
      const wide = log.getBoundingClientRect().width >= 640;
      const heads = [...log.querySelectorAll('.lk-xloghead > span')].filter(shown);
      const headTops = heads.map((h) => h.getBoundingClientRect().top);
      if (headTops.length && Math.max(...headTops) - Math.min(...headTops) > 1) add('log-header-orphan', heads.map((h) => h.textContent).join(' '), 'una cabecera del registro cae en otra línea');
      for (const h of heads) {
        if (linesOf(h) > 1) add('log-header-orphan', h.textContent, 'el título se parte en dos líneas');
        if (h.scrollWidth > h.clientWidth + 1) add('log-cell-overflow', h.textContent, `${h.scrollWidth} > ${h.clientWidth}`);
      }
      for (const row of [...log.querySelectorAll('.lk-xlogrow')].filter(shown)) {
        const cells = [...row.children].filter(shown);
        for (const c of cells) if (c.scrollWidth > c.clientWidth + 1) add('log-cell-overflow', c.textContent, `${c.scrollWidth} > ${c.clientWidth}`);
        if (!wide) continue;
        const info = row.querySelector('.lk-xinfo');
        const cellTops = cells.map((c) => c.getBoundingClientRect().top);
        if (Math.max(...cellTops) - Math.min(...cellTops) > 1) add('log-cell-stacked', row.textContent, 'una celda cae bajo la fila');
        for (const c of cells) if (c !== info && linesOf(c) > 1) add('log-cell-wraps', c.textContent, 'una celda que no es la información se parte en dos líneas');
        const cs = getComputedStyle(row);
        const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const rowLines = Math.round((row.getBoundingClientRect().height - padY) / lineH);
        const textLines = Math.max(1, ...cells.map((c) => linesOf(c)));
        if (rowLines > textLines) add('log-cell-stacked', row.textContent, `la fila ocupa ${rowLines} líneas y su texto ${textLines}`);
      }
    }
    // #228 (segunda tanda): el subtítulo de cada paso va en caja baja, con el espaciado normal
    // y no más pequeño que el mínimo de lectura. El título puede seguir en versalitas.
    for (const sub of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xssub')])) {
      if (!shown(sub)) continue;
      const cs = getComputedStyle(sub);
      if (cs.textTransform !== 'none') add('subtitle-style', sub.textContent, `va en ${cs.textTransform}`);
      if (cs.letterSpacing !== 'normal' && Math.abs(parseFloat(cs.letterSpacing)) > 0.01) add('subtitle-style', sub.textContent, `espaciado ${cs.letterSpacing}`);
      if (parseFloat(cs.fontSize) < minPx) add('subtitle-style', sub.textContent, `${parseFloat(cs.fontSize).toFixed(1)} px (mínimo ${minPx})`);
    }
    // #228 (segunda tanda): ningún trazo del explorador toca el borde de su panel. Son 8 px
    // como mínimo; en el teléfono, donde los enlaces van por la cuneta, 20 px.
    for (const panel of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xmap, .lk-xseqrows')])) {
      if (!shown(panel)) continue;
      const P = panel.getBoundingClientRect();
      const min = P.width < 420 ? 20 : 8;
      for (const path of panel.querySelectorAll('path.lk-xlink, path.lk-xflow, path.lk-xseqarrow')) {
        if (off(path) || !path.getAttribute('d')) continue;
        const total = path.getTotalLength(), m = path.getScreenCTM();
        if (!total || !m) continue;
        let near = Infinity;
        for (let len = 0; len <= total; len += 2) {
          const p = path.getPointAtLength(len);
          const x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f;
          near = Math.min(near, x - P.left, P.right - x, y - P.top, P.bottom - y);
        }
        if (near < min) add('link-on-edge', path.dataset.from ? `${path.dataset.from}→${path.dataset.to || '·'}` : 'trazo', `a ${Math.round(near)} px del borde del panel (mínimo ${min})`);
      }
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
  // Un conector declara el extremo que le toca: uno cortado por su etiqueta declara
  // solo la salida en el primer tramo y solo la llegada en el segundo, y los dos se
  // miden contra su ancla.
  for (const piece of pieces) {
    for (const path of piece.querySelectorAll('svg path[data-from], svg path[data-to]')) {
      // Un conector oculto (su celda clave queda fuera de su marco) no se dibuja: no es un fallo de trazo.
      if (off(path) || path.getAttribute('visibility') === 'hidden') continue;
      const { at, total } = ends(path);
      const label = `${path.dataset.from || '·'}→${path.dataset.to || '·'}`;
      if (!total) { add('connector-miss', label, 'el conector no dibuja trazo'); continue; }
      const from = path.dataset.from ? anchorBox(piece, path.dataset.from) : null;
      const to = path.dataset.to ? anchorBox(piece, path.dataset.to) : null;
      if (wants('geometry') || scope === 'all') {
        if (path.dataset.from) {
          if (!from) add('connector-miss', path.dataset.from, 'el ancla de salida no existe en el paso');
          else if (gap(at(0), from) > 3) add('connector-miss', path.dataset.from, `empieza a ${Math.round(gap(at(0), from))} px de su ancla`);
        }
        if (path.dataset.to) {
          if (!to) add('connector-miss', path.dataset.to, 'el ancla de llegada no existe en el paso');
          else if (gap(at(total), to) > 3) add('connector-miss', path.dataset.to, `termina a ${Math.round(gap(at(total), to))} px de su ancla`);
        }
      }
      if (wants('convivencia')) {
        for (let len = 8; len < total - 8; len += 3) {
          const p = at(len);
          const hit = words.find((w) => p.x > w.b.left + 1 && p.x < w.b.right - 1 && p.y > w.b.top + 1 && p.y < w.b.bottom - 1);
          if (hit) { add('connector-over-text', label, `cruza «${hit.text}»`); break; }
        }
      }
    }
  }

  if (wants('convivencia')) {
    // #228: la etiqueta de lo que viaja no tapa una palabra del mapa.
    for (const chip of pieces.flatMap((piece) => [...piece.querySelectorAll('.lk-xtravel')])) {
      if (!shown(chip)) continue;
      const c = chip.getBoundingClientRect();
      const hit = words.find((w) => !chip.contains(w.owner) && Math.min(c.right, w.b.right) - Math.max(c.left, w.b.left) > 2 && Math.min(c.bottom, w.b.bottom) - Math.max(c.top, w.b.top) > 2);
      if (hit) add('travel-over-text', chip.textContent, `tapa «${hit.text}»`);
    }
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
