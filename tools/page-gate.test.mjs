// The whole-page gate is tested on the real reader and on the real broken note.
// A gate that cannot find its browser must never pass: without a measurement the
// studio would offer a part nobody looked at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, 'page-gate.mjs');
// The note the learner regenerated in #296, copied without one line touched.
const GAUSS = join(HERE, 'page-gate.fixture.md');
const dir = mkdtempSync(join(tmpdir(), 'page-gate-test-'));

// `node --test` does not resolve a global module by name: the variable the helper and CI set is
// part of the browser being available, and the global install is the other usual place.
const browserAvailable = () => {
  if (process.env.PLAYWRIGHT_MODULE) return true;
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    createRequire(`${root}/`)('playwright');
    return true;
  } catch {
    return false;
  }
};

const note = (name, body) => {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
};

const run = (args, env = {}) => {
  const merged = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete merged[key];
  return spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', env: merged, timeout: 180_000 });
};

const CURVE = 'M 40 210 C 100 210 120 60 180 60 C 240 60 260 210 320 210';
const CLEAN = `# Parte 1 — Una curva

## Ruta

1. La curva.

<lk-story>
<script type="application/json">
${JSON.stringify({
  kind: 'formula',
  title: 'La curva, paso a paso',
  viewBox: '0 0 360 260',
  formula: { size: 18, atoms: [{ t: 'f', id: 'f' }, { t: '(', id: 'open' }, { t: 'x', id: 'x' }, { t: ')', id: 'close' }] },
  steps: [
    { title: 'La curva', focus: [], narrator: 'La curva sube y baja.', stage: { scene: { paths: [{ d: CURVE, tone: 'blue', width: 4, arrow: false }], labels: [{ x: 180, y: 235, text: 'x', size: 16 }] } } },
    { title: 'f', focus: ['f'], narrator: 'La función es la altura de la curva.', stage: { scene: { paths: [{ d: CURVE, tone: 'blue', width: 4, arrow: false }], actors: [{ id: 'v', x: 150, y: 60, w: 60, h: 28, label: 'f(x)', tone: 'blue', tag: 'la altura' }] } } },
    { title: 'x', focus: ['x'], narrator: 'La x es el punto que miras.', stage: { scene: { paths: [{ d: CURVE, tone: 'blue', width: 4, arrow: false }], labels: [{ x: 180, y: 235, text: 'x', size: 16 }] } } },
  ],
}, null, 2)}
</script>
</lk-story>

Cómo leerlo: avanza y mira la curva.
`;

test('the Gaussian part from #296 renders its story where the learner reads it', {
  skip: browserAvailable() ? false : 'playwright is not installed',
}, () => {
  // RED on current main (#296): the four figure gates pass this note, but the
  // hand-built reader page splits its story across the wide columns. The same
  // assertion passes once #296 fixes the kit.
  const r = run([GAUSS]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok: 4 recorrido\(s\) sin problemas/);
});

test('a story that draws, narrates and has its player passes in both learner conditions', {
  skip: browserAvailable() ? false : 'playwright is not installed',
}, () => {
  const r = run([note('limpia.md', CLEAN)], { PAGE_GATE_TEMPLATES: 'note' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok: 2 recorrido\(s\) sin problemas/);
  assert.doesNotMatch(r.stdout, /GATE FAILED/);
});

test('a note with no story says it measured nothing instead of pretending it passed one', {
  skip: browserAvailable() ? false : 'playwright is not installed',
}, () => {
  const r = run([note('prosa.md', '# Prosa\n\nSolo texto, sin recorrido.\n')]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /sin recorridos/);
});

test('an unreadable story payload is a finding, not an approval', {
  skip: browserAvailable() ? false : 'playwright is not installed',
}, () => {
  const r = run([note('ilegible.md', '# Parte 1\n\n<lk-story>\n<script type="application/json">\n{ esto no es json }\n</script>\n</lk-story>\n')]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /story-illegible/);
});

test('without Playwright the gate exits non-zero and says why', () => {
  const r = run([note('sin-navegador.md', CLEAN)], {
    PLAYWRIGHT_MODULE: '/no/existe/playwright/index.mjs',
    PATH: '/no/existe',
  });
  assert.notEqual(r.status, 0, `a gate that cannot measure must not pass: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout + r.stderr, /playwright is not installed/);
});
