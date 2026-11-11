// Escenas: la geometría que el autor declara tiene que sobrevivir al navegador.
//
// Estos tres casos nacieron de un barrido real sobre `lk-scene`: un rótulo que se
// dibuja encima de la flecha que etiqueta, tipografía que se encoge hasta ser
// ilegible sin avisar, y una escena que se aplasta dentro de una columna estrecha
// porque la única regla responsive miraba el ancho de la ventana.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE) attempts.push(() => import(process.env.PLAYWRIGHT_MODULE));
  attempts.push(() => import('playwright'));
  // Un árbol sin `node_modules` (este repositorio no tiene manifiesto) resuelve
  // Playwright desde el prefijo global, que es un directorio: ESM no lo importa.
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

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se puede medir el trazado';

const BOX_A = { x: 8, y: 60, w: 196, h: 96, label: 'AGENTE', sub: 'robot', tone: 'blue', size: 22, subSize: 14, subDy: 22 };
const BOX_B = { x: 556, y: 60, w: 196, h: 96, label: 'ENTORNO', sub: 'casa', tone: 'green', size: 22, subSize: 14, subDy: 22 };

function page(scenes, { columnWidth = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-scene-'));
  mkdirSync(join(dir, 'site/kit'), { recursive: true });
  mkdirSync(join(dir, 'site/topic'), { recursive: true });
  for (const file of ['kit.css', 'kit.js', 'scene.js', 'dictate.js', 'theme.js']) cpSync(join(KIT, file), join(dir, 'site/kit', file));
  const body = Object.entries(scenes).map(([id, spec]) => `<lk-scene id="${id}"><script type="application/json">${JSON.stringify(spec)}</script></lk-scene>`).join('\n');
  const wrapped = columnWidth ? `<div style="width:${columnWidth}px">${body}</div>` : body;
  writeFileSync(join(dir, 'site/topic/probe.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="../kit/kit.css"><script src="../kit/scene.js" defer></script><script src="../kit/kit.js" defer></script>
</head><body><main style="max-width:720px;margin:0 auto">${wrapped}</main></body></html>`);
  return 'file://' + join(dir, 'site/topic/probe.html');
}

async function measure(url, ids) {
  const browser = await PLAYWRIGHT.chromium.launch();
  try {
    const view = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await view.goto(url);
    await view.waitForSelector('lk-scene svg');
    await view.waitForTimeout(400);
    return await view.evaluate((ids) => ids.map((id) => {
      const host = document.getElementById(id);
      const svg = host.querySelector('svg');
      const width = svg.getBoundingClientRect().width;
      const scale = width / svg.viewBox.baseVal.width;
      return {
        width,
        overflow: host.querySelector('.lk-scene-stage')?.dataset.overflow || '',
        texts: [...svg.querySelectorAll('text')].map((t) => {
          const b = t.getBBox();
          return { content: t.textContent, x: b.x, y: b.y, w: b.width, h: b.height, px: (Number(t.getAttribute('font-size')) || 0) * scale };
        }),
      };
    }), ids);
  } finally {
    await browser.close();
  }
}

test('un rótulo no se dibuja encima de la caja ni de la punta de su flecha', { skip: SKIP }, async () => {
  const spec = {
    viewBox: '0 0 760 200', title: 'prueba',
    scene: {
      boxes: [BOX_A, BOX_B],
      // Flecha corta con un rótulo largo: el caso que el ajuste por ancho de
      // escenario daba por bueno y dibujaba sobre la caja y sobre la punta.
      arrows: [{ x1: 212, y1: 108, x2: 340, y2: 108, label: 'recompensa +10 y estado nuevo', tone: 'green', labelSize: 15, width: 3 }],
    },
  };
  const [shot] = await measure(page({ s: spec }), ['s']);
  const tip = 340;
  const headBack = 10 * 11 / 12 * 3;
  const sourceRight = BOX_A.x + BOX_A.w;
  const label = shot.texts.find((t) => t.content.startsWith('recompensa'));
  assert.ok(label, 'la escena perdió su rótulo');
  assert.ok(label.x >= sourceRight + 1, `el rótulo entra en la caja: empieza en ${label.x.toFixed(1)}, la caja acaba en ${sourceRight}`);
  assert.ok(label.x + label.w <= tip - headBack, `el rótulo tapa la punta de la flecha: acaba en ${(label.x + label.w).toFixed(1)}, la cabeza empieza en ${(tip - headBack).toFixed(1)}`);
});

test('ningún texto de una escena se dibuja por debajo de 11 px', { skip: SKIP }, async () => {
  const spec = {
    viewBox: '0 0 760 200', title: 'prueba',
    scene: {
      boxes: [{ ...BOX_A, label: 'WWWWWWWW' }, { ...BOX_B, label: 'WWWWWWWW' }],
      // Glifos anchos: el ajuste de texto llegaba al suelo del 55 % del tamaño
      // declarado y dejaba la etiqueta a 7 px sin decírselo a nadie. La etiqueta
      // va al lado del trazo entero, así que tiene que ser larga para no caber ni
      // en el tramo libre de la flecha.
      arrows: [{ x1: 208, y1: 108, x2: 552, y2: 108, label: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', tone: 'ink', labelSize: 15, width: 3 }],
    },
  };
  const [shot] = await measure(page({ s: spec }), ['s']);
  const tiny = shot.texts.filter((t) => t.content.trim() && t.px < 11);
  assert.deepEqual(tiny.map((t) => `${t.content} a ${t.px.toFixed(1)} px`), [], 'hay texto ilegible en la escena');
  assert.equal(shot.overflow, '1', 'el ajuste encogió el texto sin marcar la escena como desbordada');
});

test('en una columna estrecha la escena conserva la escala y hace scroll', { skip: SKIP }, async () => {
  const spec = {
    viewBox: '0 0 760 230', title: 'prueba',
    scene: { boxes: [BOX_A, BOX_B], arrows: [{ x1: 208, y1: 100, x2: 552, y2: 100, label: 'acción: aspirar', tone: 'blue', labelSize: 15, width: 3, labelAt: 0.36 }] },
  };
  // 380 px de columna dentro de una ventana de 1440: la regla responsive antigua
  // miraba la ventana, así que la escena se aplastaba a la mitad de su tamaño.
  const [shot] = await measure(page({ s: spec }, { columnWidth: 380 }), ['s']);
  assert.ok(shot.width >= 640, `la escena se aplastó a ${shot.width.toFixed(0)} px de ancho`);
  const agent = shot.texts.find((t) => t.content === 'AGENTE');
  assert.ok(agent && agent.px >= 12, `la etiqueta de caja se dibuja a ${agent?.px.toFixed(1)} px`);
});
