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
// `al-borde` y `lienzo-vacio` son geometría del lienzo y viven en scene-gate.
const gate = (file) => spawnSync(process.execPath, [join(TOOLS, 'scene-gate.mjs'), file], { encoding: 'utf8' });

// Una escena con la fórmula y los callouts que se le pasen, para medir solo la
// convivencia de los números.
const sceneWith = (callouts) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","title":"dos callouts","caption":"Cada número señala un símbolo.","scene":{
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
{"viewBox":"0 0 760 260","title":"una curva y una flecha","caption":"La punta señala la curva.","scene":{
  "paths":[{"d":"M 60 200 C 200 200 260 40 380 40 C 500 40 560 200 700 200","tone":"blue","width":4,"arrow":false}],
  "arrows":${JSON.stringify([arrow])},
  "boxes":[{"x":300,"y":190,"w":160,"h":40,"label":"una caja","size":14}]}}
</script>
</lk-scene>
`;

const curveNote = (name, arrow) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La curva\n\nSe dibuja como su curva.\n\n${curveScene(arrow)}\n`);
  return file;
};

test('una flecha que termina en el aire sobre la curva es un hallazgo', { skip: SKIP }, () => {
  const file = curveNote('punta-aire.md', { x1: 380, y1: 190, x2: 380, y2: 90, label: 'aquí', tone: 'blue', width: 2, labelSize: 15, labelBeside: true });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /flecha-al-aire/);
  assert.match(r.stdout, /la punta queda a \d+u del trazo más cercano/);
});

test('una flecha que termina sobre la curva no es un hallazgo', { skip: SKIP }, () => {
  const file = curveNote('punta-curva.md', { x1: 380, y1: 190, x2: 380, y2: 44, label: 'aquí', tone: 'blue', width: 2, labelSize: 15, labelBeside: true });
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /sin problemas de convivencia/);
});

// La guía de un callout tampoco puede cruzar texto: la flecha que entra en la
// etiqueta del eje «μ−σ» es el defecto que el alumno vio en el paso 2.
const labelScene = (callout) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 120","title":"una etiqueta y un callout","caption":"La guía no toca las palabras.","scene":{
  "formulas":[{"x":380,"y":60,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"}]}],
  "labels":[{"x":120,"y":60,"text":"μ−σ","size":24}],
  "callouts":[${JSON.stringify(callout)}]}}
</script>
</lk-scene>
`;

const labelNote = (name, callout) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La fórmula\n\nSe dibuja símbolo por símbolo.\n\n${labelScene(callout)}\n`);
  return file;
};

test('una guía de callout que cruza un texto es un hallazgo', { skip: SKIP }, () => {
  const file = labelNote('guia-cruzada.md', { n: 1, x: 40, y: 60, to: [200, 60] });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /trazo-sobre-texto: μ−σ/);
});

test('una guía de callout que se detiene antes del texto no es un hallazgo', { skip: SKIP }, () => {
  const file = labelNote('guia-corta.md', { n: 1, x: 40, y: 60, to: [90, 60] });
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Un callout declara el símbolo que señala. Si la fórmula cambió y el número
// sigue nombrando el símbolo viejo, la guía no llega a ningún glifo: el número
// apunta al aire, que es lo que el alumno vio con el ⑥.
const anchorScene = (callout) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 160","title":"un callout desviado","caption":"Cada número señala un símbolo.","scene":{
  "formulas":[{"x":380,"y":120,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"}]}],
  "callouts":[${JSON.stringify(callout)}]}}
</script>
</lk-scene>
`;

const anchorNote = (name, callout) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La fórmula\n\nSe dibuja símbolo por símbolo.\n\n${anchorScene(callout)}\n`);
  return file;
};

test('un callout que nombra un símbolo que la fórmula no tiene es un hallazgo', { skip: SKIP }, () => {
  const file = anchorNote('desviado.md', { n: 1, x: 300, y: 40, symbol: 'μ' });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /callout-desviado: 1/);
  assert.match(r.stdout, /μ/);
});

test('un callout anclado a un símbolo que la fórmula sí tiene no es un hallazgo', { skip: SKIP }, () => {
  const file = anchorNote('anclado.md', { n: 1, x: 300, y: 40, symbol: 'x' });
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Una flecha llega a su destino sin atravesar la tinta de otra pieza. La flecha
// «el pico» entraba a la campana desde abajo y su trazo cortaba el flanco derecho
// a 156 unidades de la punta: el lector veía una línea metida dentro de la curva.
const crossScene = (arrow) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 240","title":"una flecha y una línea","caption":"La flecha no atraviesa la línea.","scene":{
  "paths":[{"d":"M 110 40 L 110 200","tone":"slate","width":2,"arrow":false}],
  "boxes":[{"x":20,"y":100,"w":40,"h":40,"label":"","size":12}],
  "arrows":[${JSON.stringify(arrow)}]}}
</script>
</lk-scene>
`;

const crossNote = (name, arrow) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La flecha\n\nSe dibuja la cosa misma.\n\n${crossScene(arrow)}\n`);
  return file;
};

test('una flecha que atraviesa el trazo de otra pieza es un hallazgo', { skip: SKIP }, () => {
  const file = crossNote('cruza.md', { x1: 60, y1: 120, x2: 220, y2: 120, tone: 'blue', width: 2 });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /flecha-cruza-trazo/);
});

test('una flecha que llega a la línea sin atravesarla no es un hallazgo', { skip: SKIP }, () => {
  const file = crossNote('llega.md', { x1: 60, y1: 120, x2: 105, y2: 120, tone: 'blue', width: 2 });
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Una pieza suelta no explica nada: una caja o una etiqueta que ninguna flecha
// alcanza y que queda lejos de todo lo dibujado es una palabra flotando. La caja
// «μ = 120 ms» del resumen estaba a 62 unidades de la etiqueta más cercana.
const looseScene = (extra) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 240","title":"una pieza suelta","caption":"Cada pieza se conecta con lo que nombra.","scene":{
  "paths":[{"d":"M 100 40 L 100 200","tone":"slate","width":2,"arrow":false}],
  ${extra}}}
</script>
</lk-scene>
`;

const looseNote = (name, extra) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La pieza\n\nSe dibuja la cosa misma.\n\n${looseScene(extra)}\n`);
  return file;
};

test('una caja que ninguna flecha alcanza y que está lejos de todo es un hallazgo', { skip: SKIP }, () => {
  const file = looseNote('suelta.md', '"boxes":[{"x":270,"y":20,"w":70,"h":40,"label":"suelta","size":12}]');
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /pieza-suelta/);
});

test('una caja alcanzada por una flecha no es un hallazgo', { skip: SKIP }, () => {
  const file = looseNote('conectada.md', '"boxes":[{"x":270,"y":20,"w":70,"h":40,"label":"conectada","size":12}],"arrows":[{"x1":268,"y1":40,"x2":104,"y2":40,"tone":"blue","width":2}]');
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Nada dibujado vive pegado al borde del lienzo: una caja a 0 unidades del tope
// se corta en cuanto el lector cambia el ancho, y en pantalla completa se veía
// sin su filete de arriba.
const edgeScene = (box) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 100","title":"una caja al borde","caption":"Todo deja aire en el borde.","scene":{
  "paths":[{"d":"M 40 60 L 320 60","tone":"slate","width":2,"arrow":false}],
  "boxes":[${JSON.stringify(box)}]}}
</script>
</lk-scene>
`;

const edgeNote = (name, box) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La caja\n\nSe dibuja la cosa misma.\n\n${edgeScene(box)}\n`);
  return file;
};

test('una pieza a menos de 12 unidades del borde del lienzo es un hallazgo', { skip: SKIP }, () => {
  const file = edgeNote('al-borde.md', { x: 100, y: 0, w: 80, h: 40, label: 'pegada', size: 12 });
  const r = gate(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /al-borde/);
});

test('una pieza con aire en el borde no es un hallazgo', { skip: SKIP }, () => {
  const file = edgeNote('con-aire.md', { x: 100, y: 20, w: 80, h: 40, label: 'con aire', size: 12 });
  const r = gate(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Una franja vacía más alta que 60 unidades es lienzo que nadie mira: la escena
// del resumen dejaba un tercio de su alto en blanco debajo de las etiquetas.
const bandScene = (viewBox) => `<lk-scene>
<script type="application/json">
{"viewBox":"${viewBox}","title":"una franja vacía","caption":"El lienzo mide lo que dibuja.","scene":{
  "paths":[{"d":"M 40 40 L 320 40","tone":"slate","width":2,"arrow":false}],"labels":[{"x":180,"y":30,"text":"una línea","size":12}]}}
</script>
</lk-scene>
`;

const bandNote = (name, viewBox) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La franja\n\nSe dibuja la cosa misma.\n\n${bandScene(viewBox)}\n`);
  return file;
};

test('una franja vacía más alta que 60 unidades es un hallazgo', { skip: SKIP }, () => {
  const file = bandNote('franja.md', '0 0 360 400');
  const r = gate(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /lienzo-vacio/);
});

test('un lienzo del alto de lo que dibuja no es un hallazgo', { skip: SKIP }, () => {
  const file = bandNote('justo.md', '0 0 360 100');
  const r = gate(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Una flecha que se corta en su etiqueta se lee como dos conectores: el tramo que
// llega al número y otro que sale de él. La flecha va entera, con las palabras al
// lado.
const brokenScene = (arrow) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 180","title":"una flecha cortada","caption":"La flecha va entera.","scene":{
  "paths":[{"d":"M 40 120 L 320 120","tone":"slate","width":2,"arrow":false}],
  "boxes":[{"x":20,"y":0,"w":60,"h":40,"label":"","size":12},{"x":280,"y":0,"w":60,"h":40,"label":"fin","size":12}],
  "arrows":[${JSON.stringify(arrow)}]}}
</script>
</lk-scene>
`;

const brokenNote = (name, arrow) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La flecha\n\nSe dibuja la cosa misma.\n\n${brokenScene(arrow)}\n`);
  return file;
};

test('una flecha cortada por su etiqueta es un hallazgo', { skip: SKIP }, () => {
  const file = brokenNote('quebrada.md', { x1: 80, y1: 20, x2: 280, y2: 20, label: 'se guarda', tone: 'blue', width: 4, labelSize: 21 });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /flecha-quebrada/);
});

test('una flecha entera con la etiqueta al lado no es un hallazgo', { skip: SKIP }, () => {
  const file = brokenNote('entera.md', { x1: 80, y1: 20, x2: 280, y2: 20, label: 'se guarda', tone: 'blue', width: 4, labelSize: 21, labelBeside: true });
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// La punta de una flecha no puede tocar una etiqueta: el paso 2 de la gaussiana
// dejaba «μ−σ» debajo del triángulo del marcador y el lector leía las dos cosas
// encimadas.
test('una punta de flecha sobre un texto es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'punta.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 340","scene":{
  "paths":[{"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false}],
  "boxes":[{"x":100,"y":300,"w":96,"h":30,"label":"","tone":"slate","size":12}],
  "arrows":[{"x1":148,"y1":300,"x2":148,"y2":210,"tone":"blue","width":2}],
  "labels":[{"x":128,"y":232,"text":"μ−σ","size":12}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /punta-sobre-texto/);
  assert.match(r.stdout, /μ−σ/);
});

test('una punta con aire sobre su etiqueta no es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'punta-aire.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 340","scene":{
  "paths":[{"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false}],
  "boxes":[{"x":100,"y":300,"w":96,"h":30,"label":"","tone":"slate","size":12}],
  "arrows":[{"x1":148,"y1":300,"x2":148,"y2":210,"tone":"blue","width":2}],
  "labels":[{"x":110,"y":232,"text":"μ−σ","size":12}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Una pieza declarada que no dibuja tinta: un icono entero fuera del lienzo lo
// recorta el SVG y el lector no ve nada.
test('un icono declarado fuera del lienzo es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'icono-fuera.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 200","scene":{
  "icons":[{"kind":"nope","x":80,"y":80,"size":56,"tone":"blue"}],
  "labels":[{"x":180,"y":180,"text":"un robot","size":14}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /pieza-invisible/);
});

test('un icono dentro del lienzo no es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'icono-dentro.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 200","scene":{
  "icons":[{"kind":"robot","x":80,"y":80,"size":56,"tone":"blue"}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// scene-gate mide también los recorridos de fórmula y de ejercicio (`<lk-story>`), paso a
// paso, y lo que miden son las marcas: una etiqueta de «combina» o un ✓ fuera del lienzo
// lo recorta el SVG y el lector ve una astilla. Antes la puerta solo abría `<lk-scene>` y
// decía «sin escenas» ante un recorrido entero.
const story = (stage) => `# Parte 1\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Una cuenta","viewBox":"0 0 360 250","steps":[
 {"title":"Uno","equation":{"atoms":[{"t":"a","id":"a"}]},"narrator":"Uno.","stage":{"scene":{"actors":[{"id":"a","x":150,"y":120,"w":44,"h":40,"label":"a","tone":"blue"}]}}},
 {"title":"Dos","equation":{"atoms":[{"t":"b","id":"b"}]},"narrator":"Dos.","stage":{"scene":{"actors":[{"id":"a","x":150,"y":120,"w":44,"h":40,"label":"a","tone":"blue"}]}}},
 {"title":"Tres","equation":{"atoms":[{"t":"c","id":"c"}]},"narrator":"Tres.","stage":{"scene":${stage}}}
]}
</script>
</lk-story>
`;

test('scene-gate mide las marcas de un recorrido: una etiqueta fuera del lienzo es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'recorrido-marca-fuera.md');
  writeFileSync(file, story('{"actors":[{"id":"p","x":60,"y":14,"w":44,"h":40,"label":"p","tone":"amber"},{"id":"q","x":120,"y":14,"w":44,"h":40,"label":"q","tone":"amber"}],"marks":[{"kind":"combine","actors":["p","q"],"label":"p + q"}]}'));
  const r = gate(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /al-borde/);
  assert.match(r.stdout, /p \+ q/);
});

test('scene-gate mide un ✓ pegado al borde derecho de un recorrido', { skip: SKIP }, () => {
  const file = join(dir, 'recorrido-check-al-borde.md');
  writeFileSync(file, story('{"actors":[{"id":"v","x":296,"y":120,"w":44,"h":40,"label":"v","tone":"green"}],"marks":[{"kind":"ok","actor":"v"}]}'));
  const r = gate(file);
  assert.equal(r.status, 0, 'un ✓ colocado dentro del lienzo no es un hallazgo: ' + r.stdout + r.stderr);
});

test('un recorrido con sus marcas dentro del lienzo pasa scene-gate', { skip: SKIP }, () => {
  const file = join(dir, 'recorrido-limpio.md');
  writeFileSync(file, story('{"actors":[{"id":"p","x":100,"y":120,"w":44,"h":40,"label":"p","tone":"amber"},{"id":"q","x":170,"y":120,"w":44,"h":40,"label":"q","tone":"amber"}],"marks":[{"kind":"combine","actors":["p","q"],"label":"p + q"}]}'));
  const r = gate(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok: 1 escena/);
});
