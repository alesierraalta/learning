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
