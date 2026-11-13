// La puerta de los recorridos también se prueba. Mide en un navegador real, así que
// lo primero que tiene que resolver es el navegador: si no lo encuentra, no puede
// aprobar nada. En el VPS el estudio corre esta puerta con su propio Node y sin
// PLAYWRIGHT_MODULE, y el módulo está instalado global — igual que para `scene-lint`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const GATE = join(TOOLS, 'deck-gate.mjs');
const dir = mkdtempSync(join(tmpdir(), 'deck-gate-'));

/** Playwright tal como lo resuelve `scene-lint`: el módulo global, no el del repo. */
const globalPlaywright = () => {
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    createRequire(`${root}/`)('playwright');
    return true;
  } catch {
    return false;
  }
};

const nota = (name, body) => {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
};

const run = (args, env = {}) => {
  const merged = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete merged[key];
  return spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', env: merged });
};

// La nota no tiene recorrido: la puerta no mide nada y sale 0. Que llegue a decirlo
// es la prueba de que el navegador se cargó: sin módulo sale 2 antes de leer la nota.
test('mide sin PLAYWRIGHT_MODULE cuando el módulo global existe', {
  skip: globalPlaywright() ? false : 'playwright is not installed globally',
}, () => {
  const r = run([nota('sin-recorrido.md', '# Nota\n\nSolo prosa, sin recorrido.\n')], { PLAYWRIGHT_MODULE: '' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no note with a guided deck/);
  assert.doesNotMatch(r.stdout + r.stderr, /playwright is not installed/);
});

// Sin navegador no hay medición, y una puerta que no mide no puede aprobar: sale
// distinto de cero y lo dice. El estudio lo lee como comprobación fallida (su log),
// nunca como una parte limpia.
test('sin Playwright sale distinto de cero y lo dice', () => {
  const r = run([nota('sin-navegador.md', '# Nota\n\nSolo prosa, sin recorrido.\n')], {
    PLAYWRIGHT_MODULE: '/no/existe/playwright/index.mjs',
    PATH: '/no/existe',
  });
  assert.notEqual(r.status, 0, `a gate that cannot measure must not pass: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout + r.stderr, /playwright is not installed/);
});

// ── El escenario de una historia se mide con su geometría (#280) ────────────
// La parte real que el alumno regeneró trae seis pasos con una flecha rotulada
// «transferencia» sobre dos cuentas. deck-gate la medía como un recorrido clásico y
// contaba doce hallazgos: la flecha cruzaba las dos fichas de nombre («Cuenta 10»,
// «Cuenta 20») porque la ficha del actor subía hasta su banda. El fixture es la
// nota sin una línea tocada; el arreglo es del kit.
const PARTE_PLSQL_HISTORIA = join(TOOLS, '..', 'integrations', 'pi', 'kit', 'test', 'fixtures', 'plsql-parte-1-v4.md');

test('la parte real de PL/SQL pasa deck-gate con la geometría de su historia', () => {
  const r = run([PARTE_PLSQL_HISTORIA]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /text-over-arrow/);
});

// La regla no se calla para los solapamientos reales: una palabra libre que el autor
// apoya sobre el trazo de su flecha sigue siendo un hallazgo.
test('una palabra libre sobre el trazo de una flecha sigue siendo un hallazgo', () => {
  const paso = (n) => ({
    title: `Paso ${n}`,
    narrator: `El paso ${n} dibuja la flecha.`,
    equation: { atoms: [{ t: `a${n}`, id: `a${n}` }] },
    stage: { scene: {
      actors: [{ id: 'c10', x: 90, y: 150, label: 'cuenta', tone: 'slate', tag: 'Cuenta 10', kind: 'row', size: 64 }],
      arrows: [{ x1: 40, y1: 50, x2: 320, y2: 50, tone: 'slate', label: 'transferencia', labelBeside: true }],
      labels: [{ x: 280, y: 54, text: 'encima', size: 14 }],
    } },
  });
  const file = nota('palabra-sobre-la-flecha.md', `# Parte 1\n\n<lk-story>\n<script type="application/json">\n${JSON.stringify({ kind: 'derivation', title: 'Una flecha', viewBox: '0 0 360 260', steps: [paso(1), paso(2), paso(3)] })}\n</script>\n</lk-story>\n`);
  const r = run([file]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /text-over-arrow/);
});
