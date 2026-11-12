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

const KIT = fileURLToPath(new URL('../integrations/pi/kit', import.meta.url));
const MIN_PX = 11;
// Aire mínimo en el borde del lienzo, y alto máximo de una franja vacía: una
// figura no se corta en el borde ni deja un tercio de su lienzo en blanco.
const EDGE = 12;
const BAND = 60;

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
const SCENE = /<lk-(scene|story)[^>]*>\s*<script type="application\/json">([\s\S]*?)<\/script>\s*<\/lk-\1>/g;

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
    if (!specs.length) continue;

    const dir = mkdtempSync(join(tmpdir(), 'scene-gate-'));
    mkdirSync(join(dir, 'kit'), { recursive: true });
    for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js']) cpSync(join(KIT, file), join(dir, 'kit', file));
    const body = specs.map((s, i) => `<lk-${s.tag} id="s${i}"><script type="application/json">${s.json}</script></lk-${s.tag}>`).join('\n');
    writeFileSync(join(dir, 'page.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="./kit/kit.css"><script src="./kit/scene.js" defer></script><script src="./kit/kit.js" defer></script>
</head><body><main style="max-width:720px;margin:0 auto">${body}</main></body></html>`);

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(pathToFileURL(join(dir, 'page.html')).href);
      await page.waitForSelector('lk-scene svg, lk-story svg', { timeout: 15000 });
      await page.waitForTimeout(400);
      const report = await page.evaluate(({ minPx, EDGE, BAND }) => [...document.querySelectorAll('lk-scene, lk-story')].map((host) => {
        const svg = host.querySelector('svg');
        const problems = [];
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
        if (steps.length) {
          steps.forEach((g, i) => {
            steps.forEach((o) => { o.style.display = o === g ? '' : 'none'; });
            problems.push(...measure(g, `paso ${i + 1}`));
          });
          steps.forEach((g, i) => { g.style.display = shown[i]; });
        } else problems.push(...measure(svg, ''));
        return { title: host.getAttribute('title') || '', problems };
      }), { minPx: MIN_PX, EDGE, BAND });

      scenes += report.length;
      report.forEach((scene, i) => {
        if (!scene.problems.length) return;
        failures += scene.problems.length;
        console.log(`${note}: escena ${i + 1}${scene.title ? ` — ${scene.title}` : ''}`);
        for (const p of scene.problems) console.log(`  ${p.kind}: ${p.text} (${p.detail})`);
      });
    } catch (error) {
      failures += 1;
      console.log(`${note}: no se pudo dibujar (${String(error.message).split('\n')[0]})`);
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
