// Mide lo que el gate de escenas no mide.
//
// `scene-gate.mjs` cuida de la tipografía y del ajuste; esto cuida de la
// convivencia entre las piezas: texto que se mete en una caja ajena, trazos de
// flecha que atraviesan texto, puntas enterradas dentro de una caja, tramos
// demasiado cortos para leerse y cajas que se salen del lienzo.
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
        const arrows = [...svg.querySelectorAll('path[marker-end]')];
        const add = (kind, text, detail) => out.push({ block: i + 1, title, kind, text, detail });

        // 1. cajas fuera del lienzo
        for (const { el, b } of rects) {
          if (b.x + b.width > box.width + 1 || b.y + b.height > box.height + 1 || b.x < -1 || b.y < -1)
            add('fuera-del-lienzo', el.getAttribute('class') || 'caja', `x ${b.x.toFixed(0)}–${(b.x + b.width).toFixed(0)}, y ${b.y.toFixed(0)}–${(b.y + b.height).toFixed(0)} en ${box.width}×${box.height}`);
        }

        // 2. texto que cruza el borde de una caja ajena
        for (const t of texts) {
          const inside = rects.some(({ b }) => b.x <= t.b.x + 1 && b.x + b.width >= t.b.x + t.b.width - 1 && b.y <= t.b.y + 1 && b.y + b.height >= t.b.y + t.b.height - 1);
          if (inside) continue;
          for (const { b } of rects) {
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

        // 3 y 4. trazo sobre texto y punta enterrada
        for (const a of arrows) {
          if (!a.getTotalLength) continue;
          const len = a.getTotalLength();
          if (!len) continue;
          const width = Number(a.getAttribute('stroke-width')) || 2;
          const head = 8 * width;
          if (len < minShaft) add('flecha-ilegible', '', `${len.toFixed(0)}u de trazo (mínimo ${minShaft})`);
          else if (head / len > maxRatio) add('flecha-corta', '', `punta ${head.toFixed(0)}u en trazo ${len.toFixed(0)}u (${Math.round((head / len) * 100)} %)`);
          for (const t of texts) {
            let hit = false;
            for (let k = 0; k <= 40 && !hit; k++) {
              const pt = a.getPointAtLength((len * k) / 40);
              hit = pt.x > t.b.x + 2 && pt.x < t.b.x + t.b.width - 2 && pt.y > t.b.y + 2 && pt.y < t.b.y + t.b.height - 2;
            }
            if (hit) { add('trazo-sobre-texto', t.s.slice(0, 40), ''); break; }
          }
          const end = a.getPointAtLength(len);
          const buried = rects.some(({ b }) => end.x > b.x + 3 && end.x < b.x + b.width - 3 && end.y > b.y + 3 && end.y < b.y + b.height - 3);
          if (buried) add('punta-enterrada', '', 'la punta termina dentro de una caja');
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
