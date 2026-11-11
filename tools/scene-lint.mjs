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

const KIT = fileURLToPath(new URL('../integrations/pi/kit', import.meta.url));
// La punta mide 8 × el grosor del trazo y se come el tramo. Un tramo con más de
// 45 % de punta se lee como un triángulo suelto; por debajo de 24 unidades no se
// lee de ninguna manera.
const MAX_HEAD_RATIO = 0.45;
const MIN_SHAFT = 24;

async function loadPlaywright() {
  const attempts = [];
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
const blocks = [...src.matchAll(/<lk-(scene|walkthrough)[^>]*>[\s\S]*?<\/lk-\1>/g)].map((m) => m[0]);
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
</head><body><main style="max-width:720px;margin:0 auto">${blocks.join('\n')}</main></body></html>`);

const pw = await loadPlaywright();
const browser = await pw.chromium.launch();
const findings = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(join(dir, 'page.html')).href);
  await page.waitForSelector('lk-scene svg, lk-walkthrough svg', { timeout: 15000 });
  await page.waitForTimeout(400);
  const report = await page.evaluate(({ minShaft, maxRatio }) => {
    const out = [];
    document.querySelectorAll('lk-scene, lk-walkthrough').forEach((host, i) => {
      const title = host.querySelector('svg')?.getAttribute('aria-label') || '';
      host.querySelectorAll('svg').forEach((svg) => {
        const box = svg.viewBox.baseVal;
        const rects = [...svg.querySelectorAll('rect')].map((r) => ({ el: r, b: r.getBBox() }));
        // En un recorrido los pasos conviven en el mismo SVG, ocultos unos y visible
        // uno: dos textos de pasos distintos no se pisan en pantalla, así que se
        // comparan solo dentro del mismo paso.
        const stepOf = (el) => el.closest('[data-step]')?.dataset.step || '0';
        const texts = [...svg.querySelectorAll('text')]
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
            if (p.closest('marker') || p.hasAttribute('marker-end') || stepOf(p) !== step) continue;
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

        // 3 y 4. trazo sobre texto y punta enterrada
        for (const { el: a, step, from, to } of arrows) {
          if (!a.getTotalLength) continue;
          const len = a.getTotalLength();
          if (!len) continue;
          const width = Number(a.getAttribute('stroke-width')) || 2;
          const head = 8 * width;
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
          const buried = rects.some(({ el, b }) => stepOf(el) === step && end.x > b.x + 3 && end.x < b.x + b.width - 3 && end.y > b.y + 3 && end.y < b.y + b.height - 3);
          if (buried) add('punta-enterrada', '', 'la punta termina dentro de una caja');
        }

        // 5. un conector que termina en el aire: la guía de un callout o el tramo de
        // una flecha con etiqueta tienen que llegar a una pieza o a un texto. Si el
        // texto se encogió dentro de su hueco, el trazo queda colgando antes de sus
        // palabras: la línea que «no llega» es esto.
        const strokes = [...svg.querySelectorAll('path')]
          .filter((p) => !p.closest('marker'))
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
      });
    });
    return out;
  }, { minShaft: MIN_SHAFT, maxRatio: MAX_HEAD_RATIO });
  findings.push(...report);
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
