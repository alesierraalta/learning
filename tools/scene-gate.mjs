// Gate de escenas: mide lo que una escena dibuja, no lo que promete.
//
// `deck-gate.mjs` inspecciona los recorridos paso a paso y no mira las escenas,
// así que una nota con figuras podía pasar sin que nadie comprobara su
// geometría. Esto abre la nota, dibuja cada `lk-scene` en un navegador real y
// mide las cajas de los glifos: tipografía ilegible, escenas que se rindieron al
// ajustar, texto fuera del lienzo y palabras encima de otras palabras.
//
// Uso: node tools/scene-gate.mjs <nota.md | directorio>
// Sale 1 si encuentra algo, 0 si todas las escenas pasan.

import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { measurePieces, PIECE_TAGS } from '../integrations/pi/kit/piece-gate.mjs';

const KIT = fileURLToPath(new URL('../integrations/pi/kit', import.meta.url));
// El suelo duro: por debajo de 11 px el glifo no se lee de ninguna manera.
const MIN_PX = 11;
// El mínimo del lector: la figura se dibuja a 1 unidad ≈ 1 píxel, así que una
// etiqueta de 12 unidades se lee a 12 px. El alumno rechazó la Parte 1 de PL/SQL
// por esto: «DML» a 12 px y el resto del lienzo en blanco (#243).
const MIN_READ_PX = 14;
// Aire mínimo en el borde del lienzo, y alto máximo de una franja vacía: una
// figura no se corta en el borde ni deja un tercio de su lienzo en blanco.
const EDGE = 12;
const BAND = 60;
// La parte del lienzo que el dibujo tiene que usar: un cuarto de papel en blanco
// ya no es margen, es una figura que no se atrevió a ocupar su canvas (#243).
const SHARE = 0.75;
// El dibujo de un paso de historia cubre al menos esta parte de su escenario (la caja que
// envuelve sus piezas, sin el suelo). El mínimo sale de los ejemplos aprobados del kit,
// que van del 27 % al 77 %: por debajo del 25 % un paso dibuja casi nada (#261).
const STAGE_SHARE_MIN = 0.25;

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    attempts.push(async () => createRequire(root + '/')('playwright'));
  } catch {}
  for (const attempt of attempts) {
    try {
      const mod = await attempt();
      if (mod?.chromium || mod?.default?.chromium) return mod.chromium ? mod : mod.default;
    } catch {}
  }
  return null;
}

function notesAt(target) {
  const path = resolve(target);
  let info;
  try {
    info = statSync(path);
  } catch {
    return [path];
  }
  if (info.isDirectory()) {
    return readdirSync(path, { recursive: true })
      .filter((f) => String(f).endsWith('.md'))
      .map((f) => join(path, String(f)));
  }
  return [path];
}

// Una escena quieta y un recorrido de fórmula o de ejercicio (`<lk-story>`): los dos se
// dibujan con el mismo vocabulario y se miden igual; el recorrido, paso a paso.
const SCENE = new RegExp(`<lk-(scene|story|${PIECE_TAGS.join('|')})[^>]*>\\s*<script type="application\\/json">([\\s\\S]*?)<\\/script>\\s*<\\/lk-\\1>`, 'g');

// La línea de suelo (#261): una historia de derivación traza una línea horizontal al pie de su
// lienzo bajo sus actores, y esa línea no significa nada salvo en un alcance o en una línea de
// tiempo, que lo declaran con `frame`. Una historia de fórmula dibuja ejes de su función (la
// campana), no suelos, y no entra.
const groundOf = (spec) => {
  if (spec.kind !== 'derivation' || ['scope', 'timeline'].includes(spec.frame)) return null;
  const [, vy, vw, vh] = String(spec.viewBox || '0 0 360 250').trim().split(/\s+/).map(Number);
  for (const [i, step] of (spec.steps || []).entries()) {
    const scene = step?.stage?.scene || step?.stage || {};
    for (const p of scene.paths || []) {
      const m = /^\s*M\s*([-\d.]+)\s+([-\d.]+)\s+L\s*([-\d.]+)\s+([-\d.]+)\s*$/.exec(p?.d || '');
      if (!m || p.arrow) continue;
      const [x1, y1, x2, y2] = m.slice(1).map(Number);
      if (y1 === y2 && Math.abs(x2 - x1) >= 0.5 * vw && y1 >= vy + 0.6 * vh) return { paso: i + 1 };
    }
  }
  return null;
};

const playwright = await loadPlaywright();
if (!playwright) {
  console.log('playwright is not installed: set PLAYWRIGHT_MODULE to its entry point');
  process.exit(2);
}

const targets = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!targets.length) {
  console.log('usage: node tools/scene-gate.mjs <nota.md | directorio>');
  process.exit(2);
}

const browser = await playwright.chromium.launch();
let failures = 0;
let scenes = 0;
let unreadable = false;

try {
  for (const note of targets.flatMap(notesAt)) {
    let source;
    try {
      source = readFileSync(note, 'utf8');
    } catch (error) {
      console.log(`no se pudo leer ${note}: ${error.code || error.message}`);
      unreadable = true;
      continue;
    }
    const specs = [...source.matchAll(SCENE)].map((m) => ({ tag: m[1], json: m[2] }));
    // Una figura que no se puede leer es un hallazgo, no un fallo del estudio: la
    // escena rota tiene que volver al tutor para que la corrija. Se valida antes de
    // abrir el navegador, porque un JSON roto deja la página en blanco y la puerta
    // se rendía esperando un SVG que nunca llegaba (#237).
    const illegible = [];
    const readable = specs.filter((spec) => {
      try {
        JSON.parse(spec.json);
        return true;
      } catch (error) {
        illegible.push({ tag: spec.tag, detail: `el payload no es JSON: ${error.message}` });
        return false;
      }
    });
    // Una apertura sin su `<script>` no entra en `specs`: tampoco se dibuja, y
    // también es un hallazgo en vez de un «sin escenas» que nadie corrige.
    const openings = [...source.matchAll(new RegExp(`<lk-(scene|story|${PIECE_TAGS.join('|')})[\\s>]`, 'g'))].length;
    for (let i = specs.length; i < openings; i++) illegible.push({ tag: 'scene', detail: 'no tiene payload JSON' });
    for (const bad of illegible) {
      failures += 1;
      console.log(`${note}: <lk-${bad.tag}> ilegible`);
      console.log(`  escena-ilegible: <lk-${bad.tag}> (${bad.detail})`);
    }
    if (!readable.length) continue;
    const specsToDraw = readable;
    // El suelo se mide en el JSON, sin navegador: la misma regla que `explain-check` no tiene.
    for (const spec of readable) {
      if (spec.tag !== 'story') continue;
      const suelo = groundOf(JSON.parse(spec.json));
      if (!suelo) continue;
      failures += 1;
      console.log(`${note}: historia con suelo`);
      console.log(`  suelo-sin-sentido: el paso ${suelo.paso} traza una línea de suelo y la historia no es de alcance ni de línea de tiempo · un suelo solo significa algo en un alcance o en una línea de tiempo: declara "frame": "scope" o "timeline" en la historia, o quita la línea`);
    }

    const dir = mkdtempSync(join(tmpdir(), 'scene-gate-'));
    mkdirSync(join(dir, 'kit'), { recursive: true });
    for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
    const body = specsToDraw.map((s, i) => `<lk-${s.tag} id="s${i}"><script type="application/json">${s.json}</script></lk-${s.tag}>`).join('\n');
    writeFileSync(join(dir, 'page.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body><main style="max-width:720px;margin:0 auto">${body}</main></body></html>`);

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(pathToFileURL(join(dir, 'page.html')).href);
      await page.waitForSelector('lk-scene svg, lk-story svg, .lk-p', { timeout: 15000 });
      await page.waitForTimeout(400);
      const report = await page.evaluate(({ minPx, minReadPx, share, stageMin, EDGE, BAND }) => [...document.querySelectorAll('lk-scene, lk-story')].map((host) => {
        // El lienzo de escena de un recorrido es el SVG que cuelga del escenario: las
        // piezas (tarjetas, memoria, tablas, conjuntos) llevan SVG propios y las mide
        // `measurePieces`.
        const svg = host.tagName === 'LK-STORY' ? host.querySelector('.lk-story-stage > svg') : host.querySelector('svg');
        const problems = [];
        if (!svg) return { title: host.getAttribute('title') || '', problems };
        // Un recorrido se mide un paso por vez: los demás se ocultan, porque un paso
        // oculto mide cero y dos pasos a la vez se pisarían sin que el lector lo vea.
        const steps = [...svg.querySelectorAll('[data-step]')];
        const shown = steps.map((g) => g.style.display);
        const measure = (scope, label) => {
          const found = [];
          const add = (p) => found.push(label ? { ...p, text: `${p.text} (${label})` } : p);
        const width = svg.getBoundingClientRect().width;
        const bounds = svg.viewBox.baseVal.width;
        const scale = width / bounds;
        const texts = [...scope.querySelectorAll('text')].map((t) => {
          const b = t.getBBox();
          return { text: t.textContent.trim(), x: b.x, y: b.y, w: b.width, h: b.height, px: (Number(t.getAttribute('font-size')) || 0) * scale };
        }).filter((t) => t.text);
        if (!texts.length) add({ kind: 'empty-scene', text: host.getAttribute('title') || '', detail: 'la escena no dibujó nada: revisa la forma del JSON' });
        for (const t of texts) if (t.px < minPx) add({ kind: 'text-too-small', text: t.text, detail: `${t.px.toFixed(1)} px` });
        // La letra por debajo del mínimo de lectura: el glifo se lee, pero el
        // lector tiene que acercarse. La escena se dibuja a 1 unidad ≈ 1 píxel, así
        // que el tamaño que escribió el autor es el que ve el lector.
        for (const t of texts) if (t.px < minReadPx) add({ kind: 'letra-diminuta', text: t.text, detail: `${t.px.toFixed(1)} px, por debajo del mínimo de lectura (${minReadPx} px): dibuja la figura más grande o sube la letra` });
        if (host.querySelector('.lk-scene-stage, .lk-story-stage')?.dataset.overflow) add({ kind: 'scene-overflow', text: host.getAttribute('title') || '', detail: 'el ajuste no pudo encajar el texto sin comprimirlo' });
        for (const t of texts) if (t.x < -1 || t.x + t.w > bounds + 1) add({ kind: 'text-outside-canvas', text: t.text, detail: `x ${t.x.toFixed(0)}–${(t.x + t.w).toFixed(0)} fuera de 0–${bounds}` });
        // Una pieza pegada al borde se corta en cuanto el lector cambia el ancho:
        // la caja «μ = 120 ms» vivía a 0 unidades del tope y en pantalla completa
        // se veía sin su filete de arriba.
        const vb = svg.viewBox.baseVal;
        const pieces = [
          ...[...scope.querySelectorAll('rect, circle, text')].map((el) => ({ el, b: el.getBBox() })),
          ...[...scope.querySelectorAll('path')].filter((p) => !p.closest('marker')).map((el) => ({ el, b: el.getBBox() })),
        ].filter(({ b }) => b.width > 1 || b.height > 1);
        for (const { el, b } of pieces) {
          const air = Math.min(b.x - vb.x, b.y - vb.y, vb.x + vb.width - (b.x + b.width), vb.y + vb.height - (b.y + b.height));
          if (air < EDGE) add({ kind: 'al-borde', text: (el.textContent || '').trim().slice(0, 40) || el.tagName.toLowerCase(), detail: `a ${air.toFixed(0)}u del borde (mínimo ${EDGE}u)` });
        }
        // Una pieza declarada que no dibuja tinta: un icono o una figura que queda
        // entera fuera del lienzo (el SVG la recorta) o con caja cero. El robot de
        // «El problema que solo existe en el tiempo» se declaraba a 8 unidades con
        // 56 de ancho y el `viewBox` lo cortaba por la mitad.
        for (const g of scope.querySelectorAll('[data-icon], [data-box], [data-actor]')) {
          const b = g.getBBox();
          const outside = b.x + b.width <= vb.x || b.x >= vb.x + vb.width || b.y + b.height <= vb.y || b.y >= vb.y + vb.height;
          if ((!b.width && !b.height) || outside) {
            add({ kind: 'pieza-invisible', text: g.dataset.icon || g.dataset.actor || g.textContent.trim().slice(0, 40) || 'una pieza', detail: outside ? 'queda entera fuera del lienzo y el SVG la recorta' : 'no dibuja tinta' });
          }
        }
        // Una figura que no usa su lienzo: el dibujo ocupa menos de tres cuartos
        // del ancho o del alto del canvas. La escena de PL/SQL metía dos cajas de
        // 100 unidades en un lienzo de 200 y el lector miraba medio papel en blanco
        // (#243). Un recorrido no se mide así: su escenario deja el aire por el que
        // se mueven los actores, y sus pasos se miden uno por uno.
        if (!steps.length && pieces.length) {
          const ink = pieces.reduce((a, { b }) => ({
            x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
            right: Math.max(a.right, b.x + b.width), bottom: Math.max(a.bottom, b.y + b.height),
          }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
          // Se mide el alto: el ancho lo limita la columna de lectura, y una fórmula
          // anotada ocupa el centro del lienzo a propósito. El alto es lo que el autor
          // eligió, y es el que deja el papel en blanco.
          const h = (ink.bottom - ink.y) / vb.height;
          const name = svg.getAttribute('aria-label') || host.getAttribute('title') || '';
          if (h < share) add({ kind: 'lienzo-vacio', text: name, detail: `la figura ocupa el ${Math.round(h * 100)} % del alto de su lienzo: dibújala más grande o recorta el viewBox` });
        }
        // Una franja vacía más alta que 60 unidades es lienzo que nadie mira: el
        // resumen dejaba un tercio de su alto en blanco debajo de las etiquetas.
        const spans = host.tagName === 'LK-STORY' ? [] : pieces.map(({ b }) => [b.y, b.y + b.height]).sort((a, b) => a[0] - b[0]);
        let cursor = vb.y;
        for (const [start, end] of spans) {
          if (start - cursor > BAND) add({ kind: 'lienzo-vacio', text: host.getAttribute('title') || '', detail: `franja vacía de ${(start - cursor).toFixed(0)}u entre y ${cursor.toFixed(0)} y y ${start.toFixed(0)}` });
          cursor = Math.max(cursor, end);
        }
        if (host.tagName !== 'LK-STORY' && vb.y + vb.height - cursor > BAND) add({ kind: 'lienzo-vacio', text: host.getAttribute('title') || '', detail: `franja vacía de ${(vb.y + vb.height - cursor).toFixed(0)}u al pie del lienzo` });
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i], b = texts[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (ox <= 0 || oy <= 0) continue;
            const overlap = ox * oy;
            if (overlap > 0.15 * Math.min(a.w * a.h, b.w * b.h)) add({ kind: 'text-over-text', text: `${a.text} / ${b.text}`, detail: `${Math.round(overlap)} u² encima` });
          }
        }
          return found;
        };
        // El dibujo de un paso cubre su parte del escenario: la caja que envuelve sus piezas,
        // sin el suelo. Un paso con dos actores y una flecha en un lienzo ancho queda por debajo.
        const stageShare = (g, label) => {
          const box = svg.viewBox.baseVal;
          const ink = [];
          for (const el of g.querySelectorAll('rect, circle, text, path')) {
            if (el.closest('marker')) continue;
            const b = el.getBBox();
            if (b.width <= 1 && b.height <= 1) continue;
            // El suelo no es dibujo: una línea horizontal al pie del lienzo no cuenta.
            if (el.tagName === 'path' && b.height < 1 && b.width >= 0.5 * box.width && b.y >= box.y + 0.6 * box.height) continue;
            ink.push(b);
          }
          if (!ink.length) return [];
          const x0 = Math.min(...ink.map((b) => b.x)), y0 = Math.min(...ink.map((b) => b.y));
          const x1 = Math.max(...ink.map((b) => b.x + b.width)), y1 = Math.max(...ink.map((b) => b.y + b.height));
          const covered = ((x1 - x0) * (y1 - y0)) / (box.width * box.height);
          if (covered >= stageMin) return [];
          return [{ kind: 'escenario-vacio', text: label, detail: `el dibujo ocupa el ${Math.round(covered * 100)} % de su escenario (mínimo ${Math.round(stageMin * 100)} %) · dibuja la acción más grande: actores de más tamaño, la pieza que cuenta el caso o un movimiento que llene el lienzo` }];
        };
        if (steps.length) {
          steps.forEach((g, i) => {
            steps.forEach((o) => { o.style.display = o === g ? '' : 'none'; });
            problems.push(...measure(g, `paso ${i + 1}`));
            problems.push(...stageShare(g, `paso ${i + 1}`));
          });
          steps.forEach((g, i) => { g.style.display = shown[i]; });
        } else problems.push(...measure(svg, ''));
        return { title: host.getAttribute('title') || '', problems };
      }), { minPx: MIN_PX, minReadPx: MIN_READ_PX, share: SHARE, stageMin: STAGE_SHARE_MIN, EDGE, BAND });

      scenes += report.length;
      // Las piezas se miden aparte: a dos anchos y paso a paso.
      const pieces = await measurePieces(page, { scope: 'geometry' });
      scenes += pieces.filter((p) => p.tag !== 'lk-story').length;
      for (const piece of pieces) {
        if (!piece.problems.length) continue;
        failures += piece.problems.length;
        console.log(`${note}: pieza ${piece.id}${piece.title ? ` — ${piece.title}` : ''}`);
        for (const p of piece.problems) console.log(`  ${p.kind}: ${p.text} (${p.detail})`);
      }
      report.forEach((scene, i) => {
        if (!scene.problems.length) return;
        failures += scene.problems.length;
        console.log(`${note}: escena ${i + 1}${scene.title ? ` — ${scene.title}` : ''}`);
        for (const p of scene.problems) console.log(`  ${p.kind}: ${p.text} (${p.detail})`);
      });
    } catch (error) {
      // Un payload que sí es JSON pero que el lector no puede dibujar también es
      // de la nota: el tutor recibe el hallazgo, no el log del estudio.
      failures += 1;
      console.log(`${note}: escena no dibujada`);
      console.log(`  escena-no-dibuja: ${String(error.message).split('\n')[0]}`);
    } finally {
      await page.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}

const summary = failures
  ? `${failures} problema(s) en ${scenes} escena(s)`
  : scenes
    ? `ok: ${scenes} escena(s) sin problemas`
    : 'sin escenas: no hay nada que medir';
console.log(summary);
const code = unreadable ? 2 : failures ? 1 : 0;
process.exit(code);
