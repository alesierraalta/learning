// Mide lo que el gate de escenas no mide.
//
// `scene-gate.mjs` cuida de la tipografía y del ajuste; esto cuida de la
// convivencia entre las piezas: texto que se mete en una caja ajena, trazos de
// flecha que atraviesan texto, puntas enterradas dentro de una caja, tramos
// demasiado cortos para leerse, cajas que se salen del lienzo y callouts que se
// apoyan unos en otros (el círculo de un número sobre la guía del vecino).
//
// Uso: node tools/scene-lint.mjs <nota.md> [--json]
// Sale 1 si encuentra algo, 0 si todo convive bien.

import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { measurePieces, PIECE_TAGS } from '../integrations/pi/kit/piece-gate.mjs';

const KIT = fileURLToPath(new URL('../integrations/pi/kit', import.meta.url));
// La punta mide 8 × el grosor del trazo y se come el tramo. Un tramo con más de
// 45 % de punta se lee como un triángulo suelto; por debajo de 24 unidades no se
// lee de ninguna manera.
const MAX_HEAD_RATIO = 0.45;
const MIN_SHAFT = 24;
// La punta crece con el trazo, pero tiene tope: 16 unidades de largo y nunca más
// de 4 veces el grosor. Una punta de 44 unidades en un trazo de 4 se lee como un
// triángulo suelto que tapa lo que señala, y es lo que el alumno vio (#237).
const MAX_HEAD = 16;
const MAX_HEAD_STROKES = 4;
// Dos trazos se tocan cuando sus centros están a menos de la mitad de cada
// grosor: 2 de la flecha + 4 de la curva = 3, más medio punto de redondeo.
const CROSS = 3.5;
// Una pieza a menos de 40 unidades de otra ya se lee con ella; más lejos y sin
// nada que la alcance es una palabra flotando al lado de la figura.
const LOOSE = 40;
// Dos fichas de nombre de actores vecinos a menos de 6 píxeles se leen como una sola (#261).
const TAG_MIN_PX = 6;
// Un icono que pisa una palabra más de 3 unidades se lee encima de ella (#273).
const ICON_TEXT_OVERLAP = 3;

// Las fichas de nombre de los actores (`[data-tag-to]`) que se pisan en vertical y quedan a menos de
// `minPx` píxeles de la pantalla se tocan: se leen como una sola ficha. Un paso oculto mide cero, así
// que se muestran todos mientras se mide y luego se dejan como estaban.
const tagGapsPx = ({ minPx }) => {
  const out = [];
  const hiddenSteps = [...document.querySelectorAll('[data-step]')];
  const wasShown = hiddenSteps.map((g) => g.style.display);
  hiddenSteps.forEach((g) => { g.style.display = ''; });
  document.querySelectorAll('lk-scene, lk-walkthrough, lk-story').forEach((host, i) => {
    const title = host.querySelector('svg')?.getAttribute('aria-label') || '';
    const stepOf = (el) => el.closest('[data-step]')?.dataset.step || '0';
    const chips = [...host.querySelectorAll('[data-tag-to]')].filter((tag) => !tag.closest('.lk-p') && tag.querySelector('rect'));
    for (let a = 0; a < chips.length; a++) {
      for (let b = a + 1; b < chips.length; b++) {
        if (stepOf(chips[a]) !== stepOf(chips[b])) continue;
        const ra = chips[a].querySelector('rect').getBoundingClientRect();
        const rb = chips[b].querySelector('rect').getBoundingClientRect();
        const level = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 0;
        const gap = Math.max(rb.left - ra.right, ra.left - rb.right);
        if (!level || gap >= minPx) continue;
        const text = `${chips[a].dataset.tagText} / ${chips[b].dataset.tagText}`;
        const measured = gap < 0 ? `se pisan ${Math.abs(gap).toFixed(1)} px` : `quedan a ${gap.toFixed(1)} px`;
        out.push({ block: i + 1, title, kind: 'texto-encimado', text, detail: `a 390 px ${measured} (mínimo ${minPx} px): se leen como una sola ficha` });
      }
    }
  });
  hiddenSteps.forEach((g, i) => { g.style.display = wasShown[i]; });
  return out;
};

async function loadPlaywright() {
  // El mismo orden que `scene-gate` y `deck-gate`: el módulo que indique el
  // entorno, el del proyecto y el global. En la máquina de pruebas el navegador
  // está fuera del árbol del repo y solo llega por `PLAYWRIGHT_MODULE`; una
  // puerta que no lo mira no puede medir y el lint se caía en vez de medir.
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    attempts.push(async () => createRequire(root + '/')('playwright'));
  } catch {}
  for (const attempt of attempts) {
    try { return await attempt(); } catch {}
  }
  throw new Error('playwright no está disponible');
}

const note = process.argv[2];
const asJson = process.argv.includes('--json');
if (!note) {
  console.error('uso: node tools/scene-lint.mjs <nota.md> [--json]');
  process.exit(2);
}

const src = readFileSync(note, 'utf8');
const blocks = [...src.matchAll(new RegExp(`<lk-(scene|walkthrough|story|${PIECE_TAGS.join('|')})[^>]*>[\\s\\S]*?<\\/lk-\\1>`, 'g'))].map((m) => m[0]);
if (!blocks.length) {
  console.log(`${note}: no tiene escenas`);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'scene-lint-'));
mkdirSync(join(dir, 'kit'), { recursive: true });
cpSync(KIT, join(dir, 'kit'), { recursive: true });
writeFileSync(join(dir, 'page.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="kit/kit.css">
<script src="kit/scene.js" defer></script><script src="kit/kit.js" defer></script>
<style>/* La prosa del lector se justifica (view/app.css) y esa regla llega a lo que la nota
   escribe dentro de la prosa: el lint mide con ella puesta, como el lector. */
.prose p { text-align: justify; hyphens: auto; }</style>
</head><body><main style="max-width:720px;margin:0 auto"><div class="prose">${blocks.map((b, i) => b.replace(/^<lk-([a-z]+)/, `<lk-$1 id="s${i}"`)).join('\n')}</div></main></body></html>`);

const pw = await loadPlaywright();
const browser = await pw.chromium.launch();
const findings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(join(dir, 'page.html')).href);
  await page.waitForSelector('lk-scene svg, lk-walkthrough svg, lk-story svg, .lk-p', { timeout: 15000 });
  await page.waitForTimeout(400);
  const report = await page.evaluate(({ minShaft, maxRatio, cross, loose, maxHead, maxHeadStrokes, iconText }) => {
    const out = [];
    // Un paso oculto mide cero: se mide con todos los pasos puestos.
    const hiddenSteps = [...document.querySelectorAll('[data-step]')];
    const wasShown = hiddenSteps.map((g) => g.style.display);
    hiddenSteps.forEach((g) => { g.style.display = ''; });
    document.querySelectorAll('lk-scene, lk-walkthrough, lk-story').forEach((host, i) => {
      const title = host.querySelector('svg')?.getAttribute('aria-label') || '';
      [...host.querySelectorAll('svg')].filter((svg) => !svg.closest('.lk-p')).forEach((svg) => {
        const box = svg.viewBox.baseVal;
        const rects = [...svg.querySelectorAll('rect')].map((r) => ({ el: r, b: r.getBBox() }));
        // En un recorrido los pasos conviven en el mismo SVG, ocultos unos y visible
        // uno: dos textos de pasos distintos no se pisan en pantalla, así que se
        // comparan solo dentro del mismo paso.
        const stepOf = (el) => el.closest('[data-step]')?.dataset.step || '0';
        // El número de un callout se dibuja sobre el centro de su guía: su texto no
        // es una palabra de la escena y no se mide como tal.
        const texts = [...svg.querySelectorAll('text')]
          .filter((t) => !t.closest('[data-callout]'))
          .map((t) => ({ el: t, step: stepOf(t), s: t.textContent.trim(), b: t.getBBox() }))
          .filter((t) => t.s);
        // Las flechas también viven en un paso: una flecha del paso 2 no atraviesa
        // el texto del paso 1, porque nunca se ven a la vez. Los extremos son los que
        // escribió el autor (`data-arrow`/`data-to`): una flecha con etiqueta se
        // dibuja en dos tramos y el segundo arranca donde termina el hueco de las
        // palabras, no donde el autor la empezó.
        const arrows = [];
        for (const g of svg.querySelectorAll('[data-arrow]')) {
          const el = g.querySelector('path[marker-end]');
          if (!el) continue;
          const [x1, y1] = String(g.dataset.arrow || '').split(',').map(Number);
          const [x2, y2] = String(g.dataset.to || '').split(',').map(Number);
          arrows.push({ el, step: stepOf(g), from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
        }
        for (const el of svg.querySelectorAll('path[marker-end]')) {
          if (el.closest('[data-arrow]') || el.closest('marker')) continue;
          const len = el.getTotalLength();
          arrows.push({ el, step: stepOf(el), from: el.getPointAtLength(0), to: el.getPointAtLength(len) });
        }
        const add = (kind, text, detail) => out.push({ block: i + 1, title, kind, text, detail });

        // 0. la punta de una flecha: crece con el trazo y tiene tope. El largo se
        // mide en el marcador que el navegador dibujó —`markerWidth` en unidades
        // del lienzo o del trazo, según `markerUnits`—, no en lo que el autor
        // prometió, y se compara con el grosor del trazo que la lleva.
        const headLength = (el) => {
          const id = (el.getAttribute('marker-end') || '').match(/#([^)]*)/)?.[1];
          const marker = id ? svg.querySelector(`marker[id="${id}"]`) : null;
          if (!marker) return null;
          const stroke = parseFloat(getComputedStyle(el).strokeWidth) || 1;
          const units = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : stroke;
          return { len: marker.markerWidth.baseVal.value * units, stroke };
        };
        for (const el of svg.querySelectorAll('path[marker-end], line[marker-end]')) {
          if (el.closest('marker')) continue;
          const head = headLength(el);
          if (!head) continue;
          if (head.len > maxHead) add('punta-grande', '', `la punta mide ${head.len.toFixed(0)}u (tope ${maxHead}u): baja el grosor del trazo o la punta`);
          else if (head.len > maxHeadStrokes * head.stroke) add('punta-grande', '', `la punta mide ${(head.len / head.stroke).toFixed(1)} × el trazo de ${head.stroke}u (tope ${maxHeadStrokes} ×): engorda el trazo o acorta la punta`);
        }

        // 0b. una etiqueta comprimida no se lee: el navegador la encogió con
        // `textLength` (glifos aplastados) o no cabe ni al tamaño mínimo. El alumno
        // la vio como una letra condensada encima de la flecha (#237).
        for (const t of svg.querySelectorAll('text')) {
          const what = t.textContent.trim().slice(0, 40);
          if (t.hasAttribute('textLength') || t.getAttribute('lengthAdjust')) add('etiqueta-comprimida', what, 'el texto se comprime para caber: acórtalo o muévelo al lado del trazo');
          else if (t.dataset.overflow) add('etiqueta-comprimida', what, 'el texto no cabe en su hueco ni al tamaño mínimo: acórtalo o muévelo al lado del trazo');
        }

        // 0c. una etiqueta de flecha no puede ser más grande que la letra de la
        // figura: se lee como un título y tapa la flecha que etiqueta. La
        // referencia es la letra más pequeña de la figura (sus cajas y sus rótulos
        // sueltos), que es el tope que aplica el dibujante; si la etiqueta lo pasa,
        // se escribió más grande que la figura (#237).
        const sizeOf = (t) => Number(t.getAttribute('font-size')) || 0;
        // La letra de la figura incluye el nombre de un actor y la ficha de su
        // nombre: en un recorrido son los nombres con los que el lector compara.
        const figureLetter = new Map();
        for (const t of svg.querySelectorAll('[data-box] text, [data-label] text, [data-actor] text, [data-tag-to] text')) {
          const size = sizeOf(t);
          if (!size) continue;
          const step = stepOf(t);
          figureLetter.set(step, Math.min(figureLetter.get(step) ?? Infinity, size));
        }
        for (const t of svg.querySelectorAll('[data-arrow] text')) {
          const cap = figureLetter.get(stepOf(t));
          const size = sizeOf(t);
          if (cap === undefined || !size || size <= cap) continue;
          add('etiqueta-desproporcionada', t.textContent.trim().slice(0, 40), `se dibuja a ${size} y la letra de la figura a ${cap}: baja la etiqueta al tamaño de la figura`);
        }
        // 0d. una marca tampoco: el ✓ o el ✗ y su nombre no se dibujan más grandes
        // que los nombres de su escenario (#243). Sin ninguna letra en el paso, el
        // tope es el mínimo de lectura: una marca suelta sobre dos iconos sin
        // nombre se lee como el título de la escena.
        for (const t of svg.querySelectorAll('[data-mark-kind] text')) {
          const cap = figureLetter.get(stepOf(t)) ?? 14;
          const size = sizeOf(t);
          if (!size || size <= cap) continue;
          add('etiqueta-desproporcionada', t.textContent.trim().slice(0, 40), `la marca se dibuja a ${size} y la letra de la figura a ${cap}: baja la marca al tamaño de los nombres`);
        }

        // 1. cajas fuera del lienzo
        for (const { el, b } of rects) {
          if (b.x + b.width > box.width + 1 || b.y + b.height > box.height + 1 || b.x < -1 || b.y < -1)
            add('fuera-del-lienzo', el.getAttribute('class') || 'caja', `x ${b.x.toFixed(0)}–${(b.x + b.width).toFixed(0)}, y ${b.y.toFixed(0)}–${(b.y + b.height).toFixed(0)} en ${box.width}×${box.height}`);
        }

        // 2. texto que cruza el borde de una caja ajena
        for (const t of texts) {
          const inside = rects.some(({ el, b }) => stepOf(el) === t.step && b.x <= t.b.x + 1 && b.x + b.width >= t.b.x + t.b.width - 1 && b.y <= t.b.y + 1 && b.y + b.height >= t.b.y + t.b.height - 1);
          if (inside) continue;
          for (const { el, b } of rects) {
            if (stepOf(el) !== t.step) continue;
            const ox = Math.min(t.b.x + t.b.width, b.x + b.width) - Math.max(t.b.x, b.x);
            const oy = Math.min(t.b.y + t.b.height, b.y + b.height) - Math.max(t.b.y, b.y);
            if (ox > 4 && oy > 4) { add('texto-en-caja', t.s.slice(0, 40), `cruza ${ox.toFixed(0)}u`); break; }
          }
        }

        // 2b. dos textos encimados: una leyenda que se pega a otra se lee como una palabra inventada
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i], b = texts[j];
            if (a.step !== b.step) continue;
            const ox = Math.min(a.b.x + a.b.width, b.b.x + b.b.width) - Math.max(a.b.x, b.b.x);
            const oy = Math.min(a.b.y + a.b.height, b.b.y + b.b.height) - Math.max(a.b.y, b.b.y);
            if (ox > 4 && oy > 4) add('texto-encimado', `${a.s.slice(0, 24)} / ${b.s.slice(0, 24)}`, `se pisan ${ox.toFixed(0)}u`);
          }
        }

        // 2d. un callout encima de otro callout: el círculo de un número tapa la guía
        // del vecino y deja de saberse de quién es cada número. Los callouts van
        // marcados en el dibujo (`data-callout`, `data-callout-guide`), así que se
        // miden por lo que el navegador pintó y no por lo que el autor prometió.
        const callouts = [...svg.querySelectorAll('[data-callout]')].map((g) => {
          const circle = g.querySelector('circle');
          if (!circle) return null;
          const b = circle.getBBox();
          return { n: g.dataset.callout, step: stepOf(g), x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 };
        }).filter(Boolean);
        const guides = new Map([...svg.querySelectorAll('[data-callout-guide]')].map((g) => {
          const p = g.querySelector('path');
          if (!p || !p.getTotalLength) return [g.dataset.calloutGuide, null];
          return [g.dataset.calloutGuide, { step: stepOf(g), a: p.getPointAtLength(0), z: p.getPointAtLength(p.getTotalLength()) }];
        }));
        const toSegment = (pt, s) => {
          const dx = s.z.x - s.a.x, dy = s.z.y - s.a.y;
          const len2 = dx * dx + dy * dy;
          const t = len2 ? Math.max(0, Math.min(1, ((pt.x - s.a.x) * dx + (pt.y - s.a.y) * dy) / len2)) : 0;
          return Math.hypot(pt.x - (s.a.x + t * dx), pt.y - (s.a.y + t * dy));
        };
        for (let i = 0; i < callouts.length; i++) {
          const a = callouts[i];
          for (let j = i + 1; j < callouts.length; j++) {
            const b = callouts[j];
            if (a.step !== b.step) continue;
            const apart = Math.hypot(a.x - b.x, a.y - b.y);
            if (apart < a.r + b.r) add('callout-encimado', `${a.n} / ${b.n}`, `los círculos se tocan: ${apart.toFixed(0)}u < ${(a.r + b.r).toFixed(0)}u`);
          }
          for (const other of callouts) {
            if (other === a || other.step !== a.step) continue;
            const guide = guides.get(other.n);
            if (!guide) continue;
            const gap = toSegment(a, guide);
            if (gap < a.r) add('callout-encimado', `${a.n} / ${other.n}`, `el círculo ${a.n} se apoya en la guía ${other.n}: ${gap.toFixed(0)}u < ${a.r.toFixed(0)}u`);
          }
        }

        // 2c. una flecha que no sale ni llega a nada: sus dos extremos tienen que tocar
        // una caja, un icono o un texto. Una punta en el vacío no explica nada.
        // Las piezas con caja propia (una caja, un icono, un texto) se miden por su
        // caja; los trazos, por su tinta. La caja de una campana es enorme y su
        // trazo pasa por el medio: medir la punta contra la caja deja pasar una
        // flecha que termina en el aire sobre la cola.
        const shapes = [...svg.querySelectorAll('rect, circle, text')]
          .map((el) => ({ step: stepOf(el), b: el.getBBox() }))
          .filter(({ b }) => b.width > 2 && b.height > 2);
        const nearShape = (pt, step, tol) => shapes.some(({ step: s, b }) => s === step &&
          pt.x >= b.x - tol && pt.x <= b.x + b.width + tol && pt.y >= b.y - tol && pt.y <= b.y + b.height + tol);
        // Una curva es una pieza, y su caja no dice dónde está su tinta: la campana
        // ocupa un rectángulo enorme y su trazo pasa por el medio. La punta se mide
        // contra los puntos del trazo, no contra su caja, o una flecha que termina
        // en el aire sobre la cola pasa por «cerca de la curva».
        const ink = new Map();
        const inkOf = (step) => {
          if (ink.has(step)) return ink.get(step);
          const pts = [];
          for (const p of svg.querySelectorAll('path')) {
            // La tinta de una flecha no es una pieza: medirla contra sí misma deja
            // pasar una punta que solo se toca a sí misma.
            if (p.closest('marker') || p.closest('[data-arrow]') || p.hasAttribute('marker-end') || stepOf(p) !== step) continue;
            if (!p.getTotalLength) continue;
            const len = p.getTotalLength();
            if (!len) continue;
            const stride = Math.max(1, len / 240);
            for (let at = 0; at <= len; at += stride) pts.push(p.getPointAtLength(at));
          }
          ink.set(step, pts);
          return pts;
        };
        // 12 unidades: la mitad del radio de un callout. Más lejos, la punta no
        // está sobre nada que el lector pueda ver.
        const nearInk = (pt, step, tol = 12) => inkOf(step).some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) <= tol);

        // 2e. la guía de un callout tampoco cruza texto. Una flecha se mide arriba
        // por sus extremos; la guía no tiene punta y su destino es un glifo, así que
        // se mide punto por punto contra las palabras del mismo paso. La flecha que
        // entraba en la etiqueta «μ−σ» del eje es este defecto.
        for (const guide of svg.querySelectorAll('[data-callout-guide] path')) {
          const step = stepOf(guide);
          const len = guide.getTotalLength ? guide.getTotalLength() : 0;
          if (!len) continue;
          for (const t of texts) {
            if (t.step !== step) continue;
            let hit = false;
            for (let k = 0; k <= 40 && !hit; k++) {
              const pt = guide.getPointAtLength((len * k) / 40);
              hit = pt.x > t.b.x + 2 && pt.x < t.b.x + t.b.width - 2 && pt.y > t.b.y + 2 && pt.y < t.b.y + t.b.height - 2;
            }
            if (hit) { add('trazo-sobre-texto', t.s.slice(0, 40), 'la guía de un callout cruza el texto'); break; }
          }
        }

        // 2f. un callout declara el símbolo que señala. Si la fórmula cambió y el
        // número sigue nombrando el símbolo viejo, la guía no llega a ningún glifo:
        // el número apunta al aire, que es lo que el alumno vio con el ⑥.
        const atomBoxes = new Map([...svg.querySelectorAll('tspan[data-atom]')].map((t) => [Number(t.dataset.atom), t.getBBox()]));
        for (const guide of svg.querySelectorAll('[data-callout-guide]')) {
          const n = guide.dataset.calloutGuide;
          const missing = guide.dataset.calloutMissing;
          if (missing !== undefined) {
            add('callout-desviado', n, `el símbolo «${missing}» no está en la fórmula: el número no señala nada`);
            continue;
          }
          if (guide.dataset.atom === undefined) continue;
          const box = atomBoxes.get(Number(guide.dataset.atom));
          const path = guide.querySelector('path');
          if (!box || !path || !path.getTotalLength) {
            add('callout-desviado', n, `declara el átomo ${guide.dataset.atom}, que la fórmula no tiene`);
            continue;
          }
          const end = path.getPointAtLength(path.getTotalLength());
          const gap = Math.hypot(Math.max(box.x - end.x, 0, end.x - (box.x + box.width)), Math.max(box.y - end.y, 0, end.y - (box.y + box.height)));
          if (gap > 3) add('callout-desviado', n, `la guía termina a ${gap.toFixed(0)}u de la caja de su glifo`);
        }

        // 3 y 4. trazo sobre texto y punta enterrada
        for (const { el: a, step, from, to } of arrows) {
          if (!a.getTotalLength) continue;
          const len = a.getTotalLength();
          if (!len) continue;
          const width = Number(a.getAttribute('stroke-width')) || 2;
          const head = headLength(a)?.len ?? 8 * width;
          if (len < minShaft) add('flecha-ilegible', '', `${len.toFixed(0)}u de trazo (mínimo ${minShaft})`);
          else if (head / len > maxRatio) add('flecha-corta', '', `punta ${head.toFixed(0)}u en trazo ${len.toFixed(0)}u (${Math.round((head / len) * 100)} %)`);
          for (const t of texts) {
            if (t.step !== step) continue;
            let hit = false;
            for (let k = 0; k <= 40 && !hit; k++) {
              const pt = a.getPointAtLength((len * k) / 40);
              hit = pt.x > t.b.x + 2 && pt.x < t.b.x + t.b.width - 2 && pt.y > t.b.y + 2 && pt.y < t.b.y + t.b.height - 2;
            }
            if (hit) { add('trazo-sobre-texto', t.s.slice(0, 40), ''); break; }
          }
          const start = from;
          const end = to;
          const startOk = nearShape(start, step, 18) || nearInk(start, step);
          // La punta tiene que caer sobre algo dibujado: la tinta de un trazo o la
          // caja de una pieza, a 12 unidades o menos. Una punta en el aire no señala
          // nada, y una flecha que apunta «a la curva» sin tocarla es el defecto que
          // el alumno vio: el número quedaba sobre el vacío, al lado de la cola.
          const endOk = nearShape(end, step, 12) || nearInk(end, step);
          if (!startOk || !endOk) {
            const gap = inkOf(step).reduce((min, q) => Math.min(min, Math.hypot(q.x - end.x, q.y - end.y)), Infinity);
            add('flecha-al-aire', '', `extremo(s) fuera de toda pieza (${len.toFixed(0)}u); la punta queda a ${Number.isFinite(gap) ? gap.toFixed(0) : '∞'}u del trazo más cercano`);
          }
          // La caja de un actor es su figura, no el marco a trazos ni el candado de su
          // estado: esas piezas se dibujan por fuera de la figura y una flecha que
          // llega al borde de la cosa que señala (`#283` la apoya en él) quedaba
          // enterrada en el marco, no en la caja.
          const buried = rects.some(({ el, b }) => {
            if (stepOf(el) !== step) return false;
            const actor = el.closest('[data-actor]');
            const box = actor ? (actor.querySelector('[data-figure]') || actor).getBBox() : b;
            return end.x > box.x + 3 && end.x < box.x + box.width - 3 && end.y > box.y + 3 && end.y < box.y + box.height - 3;
          });
          if (buried) add('punta-enterrada', '', 'la punta termina dentro de una caja');
          // 3b. la flecha llega a su destino sin atravesar la tinta de otra pieza.
          // El trazo de «el pico» entraba a la campana desde abajo y cortaba el
          // flanco derecho a 156 unidades de la punta: el lector veía una línea
          // metida dentro de la curva. Se mide sobre los extremos que escribió el
          // autor, no sobre los tramos que deja el hueco de las palabras. Los
          // primeros 12u son el enganche: una flecha que arranca sobre la pieza que
          // conecta no la atraviesa (#280).
          const reach = Math.hypot(end.x - start.x, end.y - start.y);
          if (reach > 24) {
            const inkPoints = inkOf(step);
            const step12 = Math.max(0.5, reach / 500);
            let cut = null;
            for (let at = 12; at <= reach - 12 && !cut; at += step12) {
              const p = { x: start.x + ((end.x - start.x) * at) / reach, y: start.y + ((end.y - start.y) * at) / reach };
              if (inkPoints.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= cross)) cut = reach - at;
            }
            if (cut !== null) add('flecha-cruza-trazo', '', `el trazo atraviesa otra pieza a ${cut.toFixed(0)}u de la punta`);
          }
        }

        // 4b. una pieza suelta: una caja o una etiqueta que ninguna flecha ni guía
        // alcanza y que queda lejos de todo lo dibujado. La caja «μ = 120 ms» del
        // resumen flotaba sola al pie de la figura y el lector no sabía qué medía.
        const pieceBoxes = [...svg.querySelectorAll('rect, circle, text')]
          .filter((el) => !el.closest('[data-callout]') && !el.closest('[data-arrow]'))
          .map((el) => ({ el, step: stepOf(el), b: el.getBBox() }))
          .filter(({ b }) => b.width > 1 || b.height > 1);
        const gapTo = (a, b) => Math.hypot(
          Math.max(b.x - (a.x + a.width), 0, a.x - (b.x + b.width)),
          Math.max(b.y - (a.y + a.height), 0, a.y - (b.y + b.height)));
        const union = (boxes) => boxes.reduce((a, b) => ({
          x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
          width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
          height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
        }));
        const reachedBy = (box, step) => {
          const near = (pt) => pt && pt.x >= box.x - 18 && pt.x <= box.x + box.width + 18 && pt.y >= box.y - 18 && pt.y <= box.y + box.height + 18;
          if (arrows.some(({ step: s, from, to }) => s === step && (near(from) || near(to)))) return true;
          for (const guide of guides.values()) if (guide && guide.step === step && (near(guide.a) || near(guide.z))) return true;
          return false;
        };
        for (const group of svg.querySelectorAll('[data-box], [data-label]')) {
          const step = stepOf(group);
          const parts = [...group.querySelectorAll('rect, circle, text')].map((el) => el.getBBox()).filter((b) => b.width || b.height);
          if (!parts.length) continue;
          const box = union(parts);
          if (reachedBy(box, step)) continue;
          const others = pieceBoxes.filter(({ el, step: s }) => s === step && !group.contains(el));
          const inkPoints = inkOf(step);
          // Una caja sola no está suelta: es la figura entera. El hallazgo es una
          // pieza separada de lo que dibuja, no un dibujo de una pieza.
          if (!others.length && !inkPoints.length) continue;
          if (others.some(({ b }) => gapTo(box, b) <= loose)) continue;
          if (inkPoints.some((q) => gapTo(box, { x: q.x, y: q.y, width: 0, height: 0 }) <= loose)) continue;
          const what = group.textContent.trim().slice(0, 40) || (group.dataset.box ? 'una caja' : 'una etiqueta');
          add('pieza-suelta', what, `ninguna flecha la alcanza y queda a más de ${loose}u de lo dibujado`);
        }

        // 5. un conector que termina en el aire: la guía de un callout o el tramo de
        // una flecha con etiqueta tienen que llegar a una pieza o a un texto. Si el
        // texto se encogió dentro de su hueco, el trazo queda colgando antes de sus
        // palabras: la línea que «no llega» es esto.
        // Un personaje o una pieza es un dibujo, no un conector (#245): los trazos
        // de un icono —el polígono del engranaje, el cuerpo curvo del cilindro— no
        // tienen que «llegar» a nada, y medirlos como flechas rechazaba la escena
        // que el alumno sí lee. Los conectores siguen midiéndose igual.
        const strokes = [...svg.querySelectorAll('path')]
          .filter((p) => !p.closest('marker') && !p.closest('[data-icon], [data-prop-id], [data-actor]'))
          .map((p) => {
            const len = p.getTotalLength ? p.getTotalLength() : 0;
            const pts = [];
            if (len) {
              const stride = Math.max(2, len / 160);
              for (let at = 0; at <= len; at += stride) pts.push(p.getPointAtLength(at));
            }
            return { el: p, step: stepOf(p), len, pts, fill: p.getAttribute('fill') || 'none' };
          })
          .filter((s) => s.pts.length > 1);
        const nearAnyPiece = (pt, step, self) => {
          if (nearShape(pt, step, 12)) return true;
          if (texts.some((t) => t.step === step && pt.x >= t.b.x - 12 && pt.x <= t.b.x + t.b.width + 12 && pt.y >= t.b.y - 12 && pt.y <= t.b.y + t.b.height + 12)) return true;
          return strokes.some((s) => s !== self && s.step === step && s.pts.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) <= 12));
        };
        for (const s of strokes) {
          if (s.el.hasAttribute('marker-end') || s.el.closest('[data-path]')) continue;
          for (const end of [s.pts[0], s.pts[s.pts.length - 1]]) {
            if (!nearAnyPiece(end, s.step, s)) add('trazo-al-aire', '', 'un extremo del conector no llega a ninguna pieza ni a ningún texto (12u)');
          }
        }

        // 6. dos trazos que corren pegados: una flecha que sube al lado de la línea
        // de μ se lee como una sola línea torcida. Se mide cuánto corre cada par a
        // menos de 6 unidades; más de 40 es un trazo encimado. Solo se juzga el par
        // en el que participa un conector: la tinta de la figura se toca a propósito
        // (la cola de la campana se apoya en su eje, el resaltado rojo repasa la
        // curva), y una región rellena tampoco es un trazo.
        const strokesOnly = strokes.filter((s) => s.fill === 'none');
        const isInkStroke = (s) => !!s.el.closest('[data-path]');
        for (let i = 0; i < strokesOnly.length; i++) {
          for (let j = i + 1; j < strokesOnly.length; j++) {
            const a = strokesOnly[i], b = strokesOnly[j];
            if (a.step !== b.step) continue;
            if (isInkStroke(a) && isInkStroke(b)) continue;
            const stride = a.len / Math.max(1, a.pts.length - 1);
            let run = 0;
            for (const p of a.pts) if (b.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= 6)) run += stride;
            if (run > 40) add('trazos-encimados', '', `dos trazos corren a menos de 6u durante ${Math.round(run)}u`);
          }
        }

        // 10. una punta sobre un texto: el triángulo del marcador no puede tocar
        // una palabra. La etiqueta «μ−σ» del paso 2 de la gaussiana quedaba debajo
        // de la punta de la flecha y el lector leía las dos cosas encimadas.
        const headTriangle = (el) => {
          const markerId = (el.getAttribute('marker-end') || '').match(/#([^)]*)/)?.[1];
          const marker = markerId ? svg.querySelector(`marker[id="${markerId}"]`) : null;
          if (!marker || !el.getTotalLength) return null;
          const len = el.getTotalLength();
          if (!len) return null;
          const end = el.getPointAtLength(len), prev = el.getPointAtLength(Math.max(0, len - 0.01));
          const dx = end.x - prev.x, dy = end.y - prev.y, mag = Math.hypot(dx, dy);
          if (!mag) return null;
          const ux = dx / mag, uy = dy / mag;
          const vb = marker.viewBox.baseVal;
          const units = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : (parseFloat(getComputedStyle(el).strokeWidth) || 1);
          const sx = marker.markerWidth.baseVal.value / vb.width * units;
          const sy = marker.markerHeight.baseVal.value / vb.height * units;
          return [[0, 0], [12, 6], [0, 12]].map(([x, y]) => {
            const a = (x - marker.refX.baseVal.value) * sx, b = (y - marker.refY.baseVal.value) * sy;
            return { x: end.x + ux * a - uy * b, y: end.y + uy * a + ux * b };
          });
        };
        const gapToText = (p, t) => Math.hypot(
          Math.max(t.b.x - p.x, 0, p.x - (t.b.x + t.b.width)),
          Math.max(t.b.y - p.y, 0, p.y - (t.b.y + t.b.height)));
        for (const el of svg.querySelectorAll('path[marker-end], line[marker-end]')) {
          if (el.closest('marker')) continue;
          const tri = headTriangle(el);
          if (!tri) continue;
          const pts = [...tri];
          for (let i = 0; i < 3; i++) {
            for (let k = 1; k < 4; k++) pts.push({ x: tri[i].x + (tri[(i + 1) % 3].x - tri[i].x) * k / 4, y: tri[i].y + (tri[(i + 1) % 3].y - tri[i].y) * k / 4 });
          }
          pts.push({ x: (tri[0].x + tri[1].x + tri[2].x) / 3, y: (tri[0].y + tri[1].y + tri[2].y) / 3 });
          const hit = texts.find((t) => t.step === stepOf(el) && pts.some((p) => gapToText(p, t) < 4));
          if (hit) add('punta-sobre-texto', hit.s.slice(0, 40), 'la punta de la flecha toca el texto: mueve la etiqueta o la flecha');
        }

        // 11. una pieza declarada que no dibuja tinta: un icono o una figura que
        // queda entera fuera del lienzo (el SVG la recorta) o con caja cero. El
        // robot de «El problema que solo existe en el tiempo» se declaraba a 8
        // unidades con 56 de ancho y el `viewBox` lo cortaba por la mitad.
        const vb = svg.viewBox.baseVal;
        for (const g of svg.querySelectorAll('[data-icon], [data-box], [data-actor], [data-path]')) {
          const b = g.getBBox();
          const outside = b.x + b.width <= vb.x || b.x >= vb.x + vb.width || b.y + b.height <= vb.y || b.y >= vb.y + vb.height;
          const empty = !b.width && !b.height;
          if (!outside && !empty) continue;
          const what = g.dataset.icon || g.dataset.actor || g.textContent.trim().slice(0, 30) || 'una pieza';
          add('pieza-invisible', what, outside ? 'queda entera fuera del lienzo y el SVG la recorta' : 'no dibuja tinta');
        }

        // 11b. un icono que pisa una palabra de su paso (#273): el documento de «Commit»
        // se dibujó encima de su rótulo y todos los gates pasaban. El kit lleva un icono
        // de caja a una esquina libre antes de medir; el que queda donde lo declaró se mide
        // donde cae, y pisar una palabra más de `iconText` unidades es un hallazgo.
        for (const g of svg.querySelectorAll('[data-icon]')) {
          const b = g.getBBox();
          const step = stepOf(g);
          const hit = texts.find((t) => t.step === step
            && Math.min(b.x + b.width, t.b.x + t.b.width) - Math.max(b.x, t.b.x) > iconText
            && Math.min(b.y + b.height, t.b.y + t.b.height) - Math.max(b.y, t.b.y) > iconText);
          if (hit) add('icono-sobre-texto', hit.s.slice(0, 40), `el icono ${g.dataset.icon} se dibuja encima de esta palabra: mueve el icono o la etiqueta`);
        }

        // 12. las piezas del escenario de un recorrido (#217): un valor, un ojo o un
        // lápiz anclados a un actor, una marca entre dos actores, el nombre de un
        // actor. Se anclan por id, así que la que nombra algo que el paso no tiene no
        // señala nada; y la tinta de una pieza no cae sobre la palabra de otra.
        const inCanvas = (b) => b.x + b.width > vb.x && b.x < vb.x + vb.width && b.y + b.height > vb.y && b.y < vb.y + vb.height;
        for (const g of svg.querySelectorAll('[data-prop-id], [data-mark-kind], [data-tag-to]')) {
          const step = stepOf(g);
          const missing = g.dataset.propMissing ?? g.dataset.markMissing;
          if (missing !== undefined) {
            add('pieza-sin-destino', g.dataset.propId || g.dataset.markKind, `ancla en «${missing}», que el paso no tiene`);
            continue;
          }
          if (g.dataset.tagTo !== undefined && !g.firstChild) {
            add('pieza-sin-destino', g.dataset.tagText || g.dataset.tagTo, `el nombre ancla en «${g.dataset.tagTo}», que el paso no tiene`);
            continue;
          }
          if (!g.firstChild) continue;
          const gb = g.getBBox();
          if (!inCanvas(gb)) add('pieza-invisible', g.dataset.propId || g.dataset.tagText || g.dataset.markKind, 'queda entera fuera del lienzo y el SVG la recorta');
          if (g.dataset.propId === undefined) continue;
          for (const ink of g.querySelectorAll('rect, circle, path')) {
            const b = ink.getBBox();
            const hit = texts.find((t) => t.step === step && !g.contains(t.el)
              && Math.min(b.x + b.width, t.b.x + t.b.width) - Math.max(b.x, t.b.x) > 2
              && Math.min(b.y + b.height, t.b.y + t.b.height) - Math.max(b.y, t.b.y) > 2);
            if (hit) { add('pieza-sobre-texto', hit.s.slice(0, 40), `la pieza ${g.dataset.propId} se dibuja encima de esta palabra`); break; }
          }
        }

        // 13. una marca suelta (#243, #245): un ✓ o un ✗ aprueba un actor, una pieza
        // o un resultado con nombre. Entre dos cajas y sin nombre cae en el hueco que
        // las separa y no se sabe qué aprobó —el alumno lo vio en la Parte 1 de PL/SQL,
        // donde el ✓ de COMMIT flotaba entre las dos cuentas—; lejos de su ancla, no
        // aprueba nada. Y una marca con nombre tampoco se explica sola: el nombre dice
        // qué aprobó, no a quién, así que su centro tiene que caer sobre su dueño y no
        // en el hueco entre dos actores (#245).
        for (const g of svg.querySelectorAll('[data-mark-kind]')) {
          const kind = g.dataset.markKind || 'ok';
          const label = g.dataset.markLabel || '';
          const ids = String(g.dataset.markActors || '').split(',').filter(Boolean);
          const between = String(g.dataset.markBetween || '').split(',').filter(Boolean);
          const anchors = ids.length ? ids : between;
          if (anchors.length > 1) {
            // Un resultado entre dos piezas se explica con su nombre: dice qué pasa
            // de una a otra. Sin nombre, no se sabe qué aprobó.
            if (!label) add('marca-suelta', `${kind}: ${anchors.join(', ')}`, `aprueba ${anchors.length} piezas a la vez y no lleva su nombre: ponle su nombre (\`label\`) o marca la pieza que lo aprueba`);
            continue;
          }
          if (!anchors.length) {
            add('marca-suelta', kind, 'no nombra a quién aprueba: ancla la marca en un actor, una pieza o un resultado con nombre');
            continue;
          }
          // El glifo que dibujó el navegador: si no hay ninguno, la marca no se dibujó
          // (su ancla no existe) y ya lo dice `pieza-sin-destino`.
          const glyph = g.querySelector('text');
          if (!glyph) continue;
          const scope = g.closest('[data-step]') || svg;
          const target = scope.querySelector(`[data-actor="${anchors[0]}"], [data-prop-id="${anchors[0]}"], [data-box-id="${anchors[0]}"]`);
          if (!target) continue;
          const a = glyph.getBBox(), b = target.getBBox();
          const gap = Math.hypot(Math.max(b.x - (a.x + a.width), 0, a.x - (b.x + b.width)), Math.max(b.y - (a.y + a.height), 0, a.y - (b.y + b.height)));
          if (gap > 16) { add('marca-suelta', `${kind}: ${anchors[0]}`, `el glifo queda a ${gap.toFixed(0)}u de lo que aprueba: pégalo a su actor o a su pieza`); continue; }
          // La marca con dueño se pega a su dueño, nunca al hueco (#245): si su
          // caja cae entre su dueño y otra pieza —o su centro queda más cerca de
          // otra—, «✓ acreditado» flota entre los dos cofres y no aprueba a nadie.
          const tol = 6;
          const cx = a.x + a.width / 2, owner = b.x + b.width / 2;
          const others = [...scope.querySelectorAll('[data-actor], [data-prop-id], [data-box-id]')]
            .filter((el) => el !== target)
            .map((el) => {
              const q = el.getBBox();
              return { id: el.dataset.actor || el.dataset.propId || el.dataset.boxId, box: q, cx: q.x + q.width / 2 };
            });
          const inGap = others.filter((o) => {
            const lo = Math.min(b.x + b.width, o.box.x + o.box.width), hi = Math.max(b.x, o.box.x);
            return hi - lo > 0 && a.x >= lo - tol && a.x + a.width <= hi + tol;
          });
          const nearer = others.filter((o) => Math.abs(o.cx - cx) < Math.abs(owner - cx) - 0.5);
          if (inGap.length || nearer.length) {
            const why = inGap.length
              ? `su caja cae en el hueco entre su dueño y ${inGap[0].id}`
              : `su centro está más cerca de ${nearer[0].id} que de su dueño`;
            add('marca-suelta', `${kind}: ${anchors[0]}`, `la marca queda en el hueco: ${why} · pégala a su actor o a su pieza, nunca al hueco entre dos`);
          }
        }

        // 14. una fila torcida (#245): dos actores que van uno al lado del otro —sus
        // figuras se solapan en vertical— comparten línea base. Un estado que dibuja
        // marco y candado agrandaba la caja medida de un actor, su ficha subía y su
        // cofre bajaba, y la fila se veía torcida. Se mide la figura (el personaje o
        // la caja), no el borde decorado, y la ficha de su nombre.
        {
          const figureOf = (el) => el.querySelector('[data-figure]') || el;
          // Una ficha es de su paso: la misma cuenta lleva ficha en todos los pasos y
          // la última tapaba a las demás si el mapa iba solo por id.
          const tagOf = new Map([...svg.querySelectorAll('[data-tag-to]')].map((t) => [`${stepOf(t)}|${t.dataset.tagTo}`, t]));
          const actors = [...svg.querySelectorAll('[data-actor]')].map((el) => {
            const f = figureOf(el).getBBox();
            const tag = tagOf.get(`${stepOf(el)}|${el.dataset.actor}`);
            return { id: el.dataset.actor, step: stepOf(el), figure: f, cy: f.y + f.height / 2, tag: tag ? (tag.querySelector('rect') || tag).getBBox() : null };
          });
          // Una fila son dos actores uno al lado del otro —sus figuras no se pisan
          // en horizontal— a menos de una figura de distancia en vertical. Más lejos
          // ya no es una fila: es otro renglón del dibujo.
          const sideBySide = (a, b) => {
            const across = Math.min(a.figure.x + a.figure.width, b.figure.x + b.figure.width) - Math.max(a.figure.x, b.figure.x);
            return across <= Math.min(a.figure.width, b.figure.width) * 0.2;
          };
          for (let i = 0; i < actors.length; i++) {
            for (let j = i + 1; j < actors.length; j++) {
              const a = actors[i], b = actors[j];
              if (a.step !== b.step || !sideBySide(a, b)) continue;
              const reach = Math.max(a.figure.height, b.figure.height) * 2;
              if (Math.abs(a.cy - b.cy) > reach) continue;
              const ids = `${a.id}, ${b.id}`;
              const figures = Math.abs(a.cy - b.cy);
              if (figures > 6) add('fila-torcida', ids, `los centros de sus personajes difieren en ${figures.toFixed(0)}u (máximo 6): tiende la fila desde el marco más grande, estado incluido`);
              if (a.tag && b.tag) {
                // La ficha se mide por la base de su pastilla: el trazo que baja hasta el personaje no cuenta, y una
                // ficha partida en dos líneas es más alta pero se apoya en la misma base (#261).
                const tags = Math.abs((a.tag.y + a.tag.height) - (b.tag.y + b.tag.height));
                if (tags > 6) add('fila-torcida', ids, `sus fichas de nombre quedan a ${tags.toFixed(0)}u de altura (máximo 6): la fila se lee torcida`);
              }
            }
          }
        }

        // 9. una flecha cortada por su etiqueta se lee como dos conectores: el tramo
        // que llega al número y otro que sale de él. La flecha va entera, con las
        // palabras al lado (`labelBeside`).
        for (const group of svg.querySelectorAll('[data-arrow]')) {
          const paths = [...group.querySelectorAll('path')].filter((p) => p.getTotalLength);
          const label = group.querySelector('text');
          if (paths.length < 2 || !label) continue;
          const lb = label.getBBox();
          const nearLabel = (pt) => pt.x >= lb.x - 8 && pt.x <= lb.x + lb.width + 8 && pt.y >= lb.y - 8 && pt.y <= lb.y + lb.height + 8;
          const ends = paths.map((p) => ({ a: p.getPointAtLength(0), z: p.getPointAtLength(p.getTotalLength()) }));
          if (ends.some((e) => nearLabel(e.z)) && ends.some((e) => nearLabel(e.a))) {
            add('flecha-quebrada', label.textContent.trim().slice(0, 24), 'la etiqueta corta el trazo: la flecha va entera y las palabras al lado');
          }
        }

        // 9b. una flecha metida en la franja de las fichas de nombre (#283): el kit
        // reenruta la flecha ENTERA —trazo, punta y etiqueta— a la primera franja
        // libre entre sus dos actores; cuando no hay ninguna, sube las fichas y lo
        // declara (`data-arrow-crowded`). Aquí se cuentan las dos cosas: la flecha
        // que el lector ve metida en las palabras de una ficha y la escena tan
        // apretada que hubo que mover las fichas para dejar pasar el trazo. En las
        // dos, la corrección es separar los actores o mover lo que ocupa la franja,
        // nunca recortar la flecha.
        const chipPills = [...svg.querySelectorAll('[data-tag-to] rect')].map((r) => ({ step: stepOf(r), b: r.getBBox() }));
        for (const group of svg.querySelectorAll('[data-arrow]')) {
          const step = stepOf(group);
          const crowded = group.dataset.arrowCrowded === '1';
          const ink = [];
          for (const p of group.querySelectorAll('path')) {
            if (p.closest('marker') || !p.getTotalLength) continue;
            const len = p.getTotalLength();
            if (!len) continue;
            const stride = Math.max(1, len / 200);
            for (let at = 0; at <= len; at += stride) ink.push(p.getPointAtLength(at));
          }
          const inBand = chipPills.filter((c) => c.step === step)
            .some(({ b }) => ink.some((p) => p.x > b.x - 2 && p.x < b.x + b.width + 2 && p.y > b.y - 2 && p.y < b.y + b.height + 2));
          if (!crowded && !inBand) continue;
          const label = group.querySelector('text');
          add('flecha-en-franja-de-etiquetas', (label ? label.textContent.trim() : '').slice(0, 24) || 'una flecha', crowded
            ? 'la flecha no tiene franja libre entre sus actores: las fichas subieron para dejarla pasar · separa los actores o mueve la pieza que ocupa la franja'
            : 'el trazo de la flecha entra en la franja de las fichas de nombre: reenrútala a la franja libre entre sus actores');
        }

        // 15. un movimiento declarado que no se dibuja (#286). El kit acepta dos
        // formas del mismo movimiento —`from`/`to` y `actor`/`toX`/`toY`— y marca en
        // el grupo el que no pudo dibujar (`data-move-undrawn`): una forma que no
        // entiende, un origen o un destino que el paso no tiene, o un trazo de
        // longitud cero. Antes lo descartaba en silencio y la historia se leía como
        // una foto repetida con todas las puertas en verde.
        const sinMovimiento = {
          'sin-forma': 'el movimiento no nombra de dónde sale: escribe `{"from":"a","to":"b"}` o `{"actor":"a","toX":…,"toY":…}`',
          'sin-destino': 'el movimiento no nombra a dónde llega: escribe `to` (una pieza) o `toX`/`toY` (un punto)',
          cero: 'el destino cae donde el actor ya está: el trazo mide 0 unidades y no se dibuja · mueve el punto o el actor',
        };
        for (const move of svg.querySelectorAll('[data-move]')) {
          const why = move.dataset.moveUndrawn;
          if (!why) continue;
          const from = move.dataset.moveFrom || '—';
          const to = move.dataset.moveTo || move.dataset.moveToPoint || '—';
          // El origen o el destino que el paso no tiene se nombra en el hallazgo: el
          // tutor corrige la nota desde el mensaje, sin abrir el dibujo.
          const detail = why === 'origen'
            ? `el movimiento sale de «${from}», que el paso no tiene`
            : why === 'destino'
              ? `el movimiento llega a «${move.dataset.moveTo}», que el paso no tiene`
              : sinMovimiento[why] || 'el movimiento no se pudo dibujar';
          add('movimiento-no-dibujado', `${from} → ${to}`, `${detail} (paso ${stepOf(move)})`);
        }
      });
      // 14. la cabecera de una historia se lee entera a cualquier ancho (#243): en
      // el teléfono el alumno veía «ntas SET saldo = saldo + 5…», sin principio ni
      // final, y el token resaltado partido en el borde. La cabecera se escala hasta
      // el suelo de lectura y, por debajo, se parte por tokens; lo que se mide aquí
      // es que nada quede cortado ni se deslice fuera de la vista.
      if (host.tagName === 'LK-STORY') {
        const head = host.querySelector('.lk-story-head');
        const line = host.querySelector('.lk-story-formula');
        if (head && line) {
          const hb = head.getBoundingClientRect();
          const addHead = (text, detail) => out.push({ block: i + 1, title, kind: 'cabecera-cortada', text, detail });
          const inside = (r) => r.left >= hb.left - 0.5 && r.right <= hb.right + 0.5 && r.top >= hb.top - 0.5 && r.bottom <= hb.bottom + 0.5;
          for (const t of line.querySelectorAll('.lk-token')) {
            const r = t.getBoundingClientRect();
            if (!r.width && !r.height) continue;
            if (!inside(r)) { addHead(t.textContent.trim().slice(0, 30) || 'un token', `el token queda fuera de la cabecera (${Math.round(r.left - hb.left)} … ${Math.round(r.right - hb.right)} px)`); break; }
          }
          if (line.scrollWidth > line.clientWidth + 1) addHead('la línea', `la cabecera se desliza (${line.scrollWidth} > ${line.clientWidth} px): escálala o pártela por tokens`);
        }
      }
    });
    hiddenSteps.forEach((g, i) => { g.style.display = wasShown[i]; });
    return out;
  }, { minShaft: MIN_SHAFT, maxRatio: MAX_HEAD_RATIO, cross: CROSS, loose: LOOSE, maxHead: MAX_HEAD, maxHeadStrokes: MAX_HEAD_STROKES, iconText: ICON_TEXT_OVERLAP });
  findings.push(...report);
  // Las fichas de nombre se miden también a 390 px, en píxeles de la pantalla: el teléfono reduce el
  // lienzo, así que lo que cabe en unidades puede tocarse en píxeles (#261).
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.waitForTimeout(250);
  findings.push(...await page.evaluate(tagGapsPx, { minPx: TAG_MIN_PX }));
  // Las piezas visuales (tarjetas, memoria, tablas, conjuntos): una palabra no se
  // monta sobre otra y un conector no atraviesa lo que no es suyo.
  for (const piece of await measurePieces(page, { scope: 'convivencia' })) {
    for (const p of piece.problems) findings.push({ block: Number(piece.id.slice(1)) + 1, title: piece.title, kind: p.kind, text: p.text, detail: p.detail });
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}

if (asJson) console.log(JSON.stringify(findings, null, 1));
else if (!findings.length) console.log(`ok: ${blocks.length} bloque(s) sin problemas de convivencia`);
else {
  for (const f of findings) console.log(`${note}: bloque ${f.block} — ${f.title}\n  ${f.kind}: ${f.text}${f.detail ? ` (${f.detail})` : ''}`);
}
process.exit(findings.length ? 1 : 0);
