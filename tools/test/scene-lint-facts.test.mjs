// Los datos de un paso (`facts`) y la tarjeta de cierre (`summary`) (#301) tienen forma: scene-lint
// dice cuál está mal (`hechos-*` y `resumen-*`) y no deja pasar una tabla que el lector no podría
// leer. Un `facts` y un `summary` bien formados no son hallazgos.
//
// Uso: node --test tools/test/scene-lint-facts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const LINT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scene-lint.mjs');

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

const skip = (await loadPlaywright()) ? false : 'playwright is not installed';

// Un recorrido válido de tres pasos; cada caso cambia solo su `facts` o su `summary`.
const BOXES = [
  { x: 60, y: 120, w: 200, h: 110, label: 'Cuenta 10' },
  { x: 560, y: 120, w: 200, h: 110, label: 'Cuenta 20' },
];
const walk = (extra = {}, facts) => ({
  title: 'Débito',
  viewBox: '0 0 900 320',
  steps: [
    { title: 'Uno', text: 'Dos cuentas.', scene: { boxes: BOXES } },
    { title: 'Dos', text: 'Se resta.', ...(facts === undefined ? {} : { facts }), scene: { boxes: BOXES } },
    { title: 'Tres', text: 'Listo.', scene: { boxes: BOXES } },
  ],
  ...extra,
});
const block = (spec) => `<lk-walkthrough>\n<script type="application/json">${JSON.stringify(spec)}</script>\n</lk-walkthrough>`;
const note = (...specs) => `# Datos\n\n${specs.map(block).join('\n\n')}\n`;

const cache = new Map();
// Corre scene-lint sobre una nota y devuelve sus hallazgos en JSON, salga como salga.
function lint(key, text) {
  if (!cache.has(key)) {
    const dir = mkdtempSync(join(tmpdir(), 'hechos-lint-'));
    const file = join(dir, 'nota.md');
    writeFileSync(file, text);
    const run = spawnSync(process.execPath, [LINT, file, '--json'], { encoding: 'utf8', timeout: 170000 });
    rmSync(dir, { recursive: true, force: true });
    if (run.error || !run.stdout.trim()) throw new Error(`scene-lint no devolvió hallazgos: ${run.stderr || run.error?.message}`);
    cache.set(key, JSON.parse(run.stdout));
  }
  return cache.get(key);
}

// Los bloques de los casos, en orden: el número del bloque es su posición en la nota (desde 1).
const CASES = {
  string: walk({}, 'saldo 800'),
  wideRow: walk({}, [['saldo', '800', 'extra']]),
  tooMany: walk({}, [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4'], ['e', '5'], ['f', '6']]),
  empty: walk({}, [['', '800'], ['saldo', '   ']]),
  noTitle: walk({ summary: { metrics: [['saldo final', '800']] } }),
  metricsNotList: walk({ summary: { title: 'Cierre', metrics: 'saldo final: 800' } }),
  summaryString: walk({ summary: 'Resultado' }),
  metricEmpty: walk({ summary: { title: 'Cierre', metrics: [['saldo final', '']] } }),
  metricsTooMany: walk({ summary: { title: 'Cierre', metrics: [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4'], ['e', '5'], ['f', '6']] } }),
  valid: walk({ summary: { title: 'Resultado', text: 'La cuenta 10 queda en 800.', metrics: [['saldo final', '800'], ['filas tocadas', 1]] } }, [['saldo', '800'], ['cambio', '-200']]),
};
const ORDER = Object.keys(CASES);
const NOTE = note(...ORDER.map((name) => CASES[name]));
// Los tipos de hallazgo de datos de un caso, sin repetir: una fila vacía y otra dan un solo tipo.
const kindsOf = (name, findings) => [...new Set(findings
  .filter((f) => f.block === ORDER.indexOf(name) + 1 && /^(hechos|resumen)-/.test(f.kind))
  .map((f) => f.kind))];

test('scene-lint refuse un facts que no es una lista de pares [clave, valor]', { skip }, () => {
  const findings = lint('all', NOTE);
  assert.deepEqual(kindsOf('string', findings), ['hechos-mal-formados'], 'un facts de texto no se reporta');
  assert.deepEqual(kindsOf('wideRow', findings), ['hechos-mal-formados'], 'una fila de tres celdas no se reporta');
});

test('scene-lint refuse más de cinco hechos y los pares con clave o valor vacíos', { skip }, () => {
  const findings = lint('all', NOTE);
  assert.deepEqual(kindsOf('tooMany', findings), ['hechos-demasiados'], 'seis filas no se reportan');
  assert.deepEqual(kindsOf('empty', findings), ['hechos-vacios'], 'una clave o un valor vacíos no se reportan');
});

test('scene-lint refuse un resumen sin título, con métricas que no son una lista o vacías', { skip }, () => {
  const findings = lint('all', NOTE);
  assert.deepEqual(kindsOf('noTitle', findings), ['resumen-mal-formado'], 'un resumen sin título no se reporta');
  assert.deepEqual(kindsOf('metricsNotList', findings), ['resumen-mal-formado'], 'métricas que no son una lista no se reportan');
  assert.deepEqual(kindsOf('summaryString', findings), ['resumen-mal-formado'], 'un resumen de texto no se reporta');
  assert.deepEqual(kindsOf('metricEmpty', findings), ['resumen-vacio'], 'una métrica con valor vacío no se reporta');
});

test('scene-lint refuse más de cinco métricas en la tarjeta de cierre', { skip }, () => {
  assert.deepEqual(kindsOf('metricsTooMany', lint('all', NOTE)), ['resumen-demasiados']);
});

test('un facts y un summary bien formados no son hallazgos', { skip }, () => {
  assert.deepEqual(kindsOf('valid', lint('all', NOTE)), [], 'un facts o un summary correctos se reportan');
});
