// La puerta que mide la convivencia de las piezas también se prueba: una que
// acepta todo deja pasar el callout que se apoya en la guía del vecino, que es
// exactamente el defecto que el alumno vio en la fórmula anotada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(TOOLS, '..', 'integrations', 'pi', 'kit', 'examples');
const dir = mkdtempSync(join(tmpdir(), 'scene-lint-'));

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

const PLAYWRIGHT = await loadPlaywright();
const SKIP = PLAYWRIGHT ? false : 'playwright no está instalado: no se puede medir la escena';

const lint = (file) => spawnSync(process.execPath, [join(TOOLS, 'scene-lint.mjs'), file], { encoding: 'utf8' });

// Una escena con la fórmula y los callouts que se le pasen, para medir solo la
// convivencia de los números.
const sceneWith = (callouts) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 240","title":"dos callouts","caption":"Cada número señala un símbolo.","scene":{
  "formulas":[{"x":380,"y":120,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"}]}],
  "callouts":${JSON.stringify(callouts)}}}
</script>
</lk-scene>
`;

const note = (name, callouts) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La fórmula\n\nSe dibuja símbolo por símbolo.\n\n${sceneWith(callouts)}\n`);
  return file;
};

// El caso que el alumno vio: el círculo del 2 se apoya en la guía del 1.
test('un callout encima de la guía de otro callout es un hallazgo', { skip: SKIP }, () => {
  const file = note('guia.md', [
    { n: 1, x: 100, y: 40, to: [100, 120] },
    { n: 2, x: 120, y: 86, to: [120, 120] },
  ]);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /callout-encimado: 2 \/ 1/);
});

// Dos números que se tocan tampoco se leen: no se sabe cuál es cuál.
test('dos callouts que se tocan son un hallazgo', { skip: SKIP }, () => {
  const file = note('circulos.md', [
    { n: 1, x: 100, y: 40, to: [100, 120] },
    { n: 2, x: 120, y: 50, to: [120, 90] },
  ]);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /callout-encimado: 1 \/ 2/);
});

// Y el ejemplo que se publica no tiene el defecto: si lo tuviera, el gate lo dice.
test('el ejemplo de la fórmula anotada pasa el lint', { skip: SKIP }, () => {
  const r = lint(join(EXAMPLES, 'formula-anotada.md'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /sin problemas de convivencia/);
});

// La punta de una flecha tiene que caer sobre algo dibujado. La caja de una curva
// es enorme y su trazo pasa por el medio: medir contra la caja deja pasar una
// flecha que termina en el aire al lado de la cola, que es lo que el alumno vio.
const curveScene = (arrow) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 240","title":"una curva y una flecha","caption":"La punta señala la curva.","scene":{
  "paths":[{"d":"M 60 200 C 200 200 260 40 380 40 C 500 40 560 200 700 200","tone":"blue","width":4,"arrow":false}],
  "arrows":${JSON.stringify([arrow])},
  "boxes":[{"x":300,"y":150,"w":160,"h":40,"label":"una caja","size":14}]}}
</script>
</lk-scene>
`;

const curveNote = (name, arrow) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La curva\n\nSe dibuja como su curva.\n\n${curveScene(arrow)}\n`);
  return file;
};

test('una flecha que termina en el aire sobre la curva es un hallazgo', { skip: SKIP }, () => {
  const file = curveNote('punta-aire.md', { x1: 380, y1: 190, x2: 380, y2: 90, label: 'aquí', tone: 'blue', width: 2, labelSize: 15 });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /flecha-al-aire/);
  assert.match(r.stdout, /la punta queda a \d+u del trazo más cercano/);
});

test('una flecha que termina sobre la curva no es un hallazgo', { skip: SKIP }, () => {
  const file = curveNote('punta-curva.md', { x1: 380, y1: 190, x2: 380, y2: 44, label: 'aquí', tone: 'blue', width: 2, labelSize: 15 });
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /sin problemas de convivencia/);
});
