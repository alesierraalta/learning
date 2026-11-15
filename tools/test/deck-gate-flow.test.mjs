// La puerta de los recorridos mide la misma flecha con y sin `flow` (#300): el trazo que fluye no
// cambia la tinta que deck-gate mide. La flecha de la prueba produce un hallazgo real
// (`text-over-arrow`), así que la comparación tiene algo que comparar.
//
// Uso: node --test tools/test/deck-gate-flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'deck-gate.mjs');
const dir = mkdtempSync(join(tmpdir(), 'deck-flow-'));

/** Playwright tal como lo resuelve `deck-gate`: el módulo global, no el del repo. */
const globalPlaywright = () => {
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    createRequire(`${root}/`)('playwright');
    return true;
  } catch {
    return false;
  }
};

// Un paso de historia con una flecha etiquetada y una palabra libre sobre su trazo.
const paso = (n, arrow) => ({
  title: `Paso ${n}`,
  narrator: `El paso ${n} dibuja la flecha.`,
  equation: { atoms: [{ t: `a${n}`, id: `a${n}` }] },
  stage: { scene: {
    actors: [{ id: 'c10', x: 90, y: 150, label: 'cuenta', tone: 'slate', tag: 'Cuenta 10', kind: 'row', size: 64 }],
    arrows: [arrow],
    labels: [{ x: 280, y: 54, text: 'encima', size: 14 }],
  } },
});
const nota = (name, arrow) => {
  const file = join(dir, name);
  const spec = { kind: 'derivation', title: 'Una flecha', viewBox: '0 0 360 260', steps: [1, 2, 3].map((n) => paso(n, arrow)) };
  writeFileSync(file, `# Parte 1\n\n<lk-story>\n<script type="application/json">\n${JSON.stringify(spec)}\n</script>\n</lk-story>\n`);
  return file;
};
const ARROW = { x1: 40, y1: 50, x2: 320, y2: 50, tone: 'slate', label: 'transferencia', labelBeside: true };
const run = (file) => spawnSync(process.execPath, [GATE, file], { encoding: 'utf8' });

test('una flecha con flow tiene la misma tinta que la misma flecha sin él en deck-gate', {
  skip: globalPlaywright() ? false : 'playwright is not installed globally',
}, () => {
  const plain = nota('sin-flow.md', ARROW);
  const flowing = nota('con-flow.md', { ...ARROW, flow: true });
  const a = run(plain), b = run(flowing);
  const normal = (r, file) => (r.stdout + r.stderr).split(file).join('NOTA');
  assert.match(normal(a, plain), /text-over-arrow/, 'la flecha de referencia no produce el hallazgo que se mide');
  assert.equal(b.status, a.status, normal(b, flowing));
  assert.equal(normal(b, flowing), normal(a, plain));
});
