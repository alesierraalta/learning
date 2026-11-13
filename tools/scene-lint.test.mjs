// La puerta que mide la convivencia de las piezas también se prueba: una que
// acepta todo deja pasar el callout que se apoya en la guía del vecino, que es
// exactamente el defecto que el alumno vio en la fórmula anotada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
// El lienzo mide lo que la caja dibuja: así el único defecto que se mide es el
// aire en el borde, no el papel que la figura deja sin usar (#243).
const edgeScene = (box) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 96","title":"una caja al borde","caption":"Todo deja aire en el borde.","scene":{
  "paths":[{"d":"M 40 48 L 320 48","tone":"slate","width":2,"arrow":false}],
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
  const file = edgeNote('con-aire.md', { x: 100, y: 12, w: 80, h: 72, label: 'con aire', size: 14 });
  const r = gate(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Una franja vacía más alta que 60 unidades es lienzo que nadie mira: la escena
// del resumen dejaba un tercio de su alto en blanco debajo de las etiquetas.
const bandScene = (viewBox) => `<lk-scene>
<script type="application/json">
{"viewBox":"${viewBox}","title":"una franja vacía","caption":"El lienzo mide lo que dibuja.","scene":{
  "paths":[{"d":"M 40 12 L 40 88","tone":"slate","width":2,"arrow":false}],"labels":[{"x":180,"y":30,"text":"una línea","size":14}]}}
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
// encimadas. La etiqueta se pone donde la punta llega: desde #237 la punta mide
// 3 × el trazo y su vértice cae en el extremo, no 7 unidades más allá.
test('una punta de flecha sobre un texto es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'punta.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 340","scene":{
  "paths":[{"d":"M 16 210 L 344 210","tone":"slate","width":2,"arrow":false}],
  "boxes":[{"x":100,"y":300,"w":96,"h":30,"label":"","tone":"slate","size":12}],
  "arrows":[{"x1":148,"y1":300,"x2":148,"y2":210,"tone":"blue","width":2}],
  "labels":[{"x":148,"y":206,"text":"μ−σ","size":12}]}}
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

// Un icono suelto encima de una palabra (#273): el alumno vio un documento sobre el
// rótulo «Commit» y todos los gates pasaban. Un icono sobre una caja lo lleva el kit a
// una esquina de esa caja; este no es de ninguna caja, así que el lint lo mide donde cae.
test('un icono suelto encima de una palabra es un hallazgo icono-sobre-texto', { skip: SKIP }, () => {
  const file = join(dir, 'icono-sobre-texto.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 200","scene":{
  "icons":[{"kind":"robot","x":180,"y":100,"size":56,"tone":"blue"}],
  "labels":[{"x":180,"y":112,"text":"el robot","size":18}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /icono-sobre-texto/);
});

test('un icono suelto junto a una palabra, sin tocarla, no es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'icono-junto-texto.md');
  writeFileSync(file, `# Parte 1\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 200","scene":{
  "icons":[{"kind":"robot","x":80,"y":100,"size":56,"tone":"blue"}],
  "labels":[{"x":150,"y":112,"text":"el robot","size":18}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  // Sin hallazgos: si el lint no llegara a medir, el test fallaría en vez de pasar en vacío.
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// Un icono y una palabra de pasos distintos no se miden juntos (#273): los pasos de una
// historia se dibujan en el mismo SVG y se miden a la vez, pero nunca se ven a la vez.
test('un icono del paso 1 no se mide contra la palabra del paso 2', { skip: SKIP }, () => {
  const file = join(dir, 'icono-otro-paso.md');
  writeFileSync(file, `# Parte 1\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Dos pasos","viewBox":"0 0 360 200","steps":[
 {"title":"Uno","equation":{"atoms":[{"t":"a","id":"a"}]},"narrator":"Uno.","stage":{"scene":{"icons":[{"kind":"robot","x":180,"y":100,"size":56,"tone":"blue"}],"labels":[{"x":180,"y":112,"text":"uno","size":18}]}}},
 {"title":"Dos","equation":{"atoms":[{"t":"b","id":"b"}]},"narrator":"Dos.","stage":{"scene":{"labels":[{"x":180,"y":112,"text":"dos","size":18}]}}}
]}
</script>
</lk-story>
`);
  const r = lint(file);
  assert.match(r.stdout, /icono-sobre-texto: uno/, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /icono-sobre-texto: dos/);
});

// La parte real de Git (#273): el documento de la caja «Commit» se dibujaba encima de su
// rótulo. El kit lo lleva a una esquina libre de esa caja, así que el lint no lo encuentra.
const GIT_PART = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'git-branching-parte-1.md');
test('la parte real de Git no tiene un icono encima de su rótulo', { skip: SKIP }, () => {
  const r = lint(GIT_PART);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// scene-gate mide también los recorridos de fórmula y de ejercicio (`<lk-story>`), paso a
// paso, y lo que miden son las marcas: una etiqueta de «combina» o un ✓ fuera del lienzo
// lo recorta el SVG y el lector ve una astilla. Antes la puerta solo abría `<lk-scene>` y
// decía «sin escenas» ante un recorrido entero.
// Cada paso de la historia de prueba lleva un trazo de marco arriba (#261): un paso con un solo dibujo
// en un lienzo vacío es el escenario vacío que `scene-gate` mide. El trazo está lejos de todo, no es
// una flecha ni una pieza, y no cambia lo que cada prueba comprueba.
const conMarco = (stage) => {
  const scene = JSON.parse(stage);
  scene.paths = [...(scene.paths || []), { d: 'M 30 30 L 330 30', tone: 'slate', width: 2, arrow: false }];
  return JSON.stringify(scene);
};
const story = (stage) => `# Parte 1\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Una cuenta","viewBox":"0 0 360 250","steps":[
 {"title":"Uno","equation":{"atoms":[{"t":"a","id":"a"}]},"narrator":"Uno.","stage":{"scene":${conMarco('{"actors":[{"id":"a","x":150,"y":120,"w":44,"h":40,"label":"a","tone":"blue"}]}')}}},
 {"title":"Dos","equation":{"atoms":[{"t":"b","id":"b"}]},"narrator":"Dos.","stage":{"scene":${conMarco('{"actors":[{"id":"a","x":150,"y":120,"w":44,"h":40,"label":"a","tone":"blue"}]}')}}},
 {"title":"Tres","equation":{"atoms":[{"t":"c","id":"c"}]},"narrator":"Tres.","stage":{"scene":${conMarco(stage)}}}
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

// ── Actors with state and props (#217) ──────────────────────────────────────
// Las piezas nuevas del escenario —el valor en su cofre, el ojo, el lápiz, la marca
// entre dos actores, el ✗ de un actor inválido— se miden con lo que el navegador
// dibujó: una que nombra un actor que no existe, o que se dibuja encima de una
// palabra, es un hallazgo; una que cabe y convive pasa las dos puertas.
const robots = '{"id":"s1","icon":"robot","x":180,"y":150,"size":56,"tone":"blue","tag":"s1"}';

test('una pieza anclada a un actor que no existe es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'pieza-sin-actor.md');
  writeFileSync(file, story(`{"actors":[${robots}],"props":[{"id":"valor","kind":"value","on":"nadie","label":"hola"}]}`));
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /pieza-sin-destino/);
  assert.match(r.stdout, /valor/);
});

test('una marca entre dos actores que no están es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'marca-sin-actores.md');
  writeFileSync(file, story(`{"actors":[${robots}],"marks":[{"kind":"ok","between":["s1","nadie"]}]}`));
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /pieza-sin-destino/);
});

test('una pieza dibujada encima de una palabra es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'ojo-sobre-palabra.md');
  writeFileSync(file, story(`{"actors":[${robots}],"props":[{"id":"leer","kind":"read","on":"s1","side":"right"}],"labels":[{"x":253,"y":156,"text":"palabra","size":14}]}`));
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /pieza-sobre-texto/);
});

test('un actor con estado, sus piezas y sus marcas pasan scene-lint y scene-gate', { skip: SKIP }, () => {
  const file = join(dir, 'estado-limpio.md');
  writeFileSync(file, story(`{"actors":[{"id":"s1","icon":"robot","x":70,"y":150,"size":56,"tone":"blue","state":"invalid","tag":"s1"},{"id":"s2","icon":"robot","x":290,"y":150,"size":56,"tone":"amber","tag":"s2"}],"props":[{"id":"leer","kind":"read","on":"s1","side":"right","tone":"blue"},{"id":"valor","kind":"value","on":"s2","side":"left","label":"hola","tone":"green"}],"marks":[{"kind":"no","actors":["s1","leer"],"label":"no compila"}]}`));
  const a = lint(file);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  const b = gate(file);
  assert.equal(b.status, 0, b.stdout + b.stderr);
});

test('scene-gate mide las piezas nuevas: un cofre que no cabe en el lienzo es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'pieza-enorme.md');
  writeFileSync(file, story(`{"actors":[${robots}],"props":[{"id":"valor","kind":"value","on":"s1","side":"right","size":230}]}`));
  const r = gate(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /al-borde/);
});

// Las piezas visuales (tarjetas, memoria, tablas, conjuntos) también se miden: la
// gate las abre a dos anchos y paso a paso, y el lint busca palabras pisadas.
const PIEZA_BUENA = `<lk-cards>
<script type="application/json">
{"cards":[{"verdict":"ok","pill":"COMPILA","title":"Muchas","draw":{"refs":[{"text":"&s"},{"text":"&s"}],"target":{"text":"s"}},"reason":"Todos leen."},{"verdict":"no","pill":"NO COMPILA","title":"Mezcla","draw":{"refs":[{"text":"&s"},{"text":"&mut s"}],"target":{"text":"s"}},"reason":"Uno escribe."}]}
</script>
</lk-cards>
`;
const pieza = (name, block) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. Los casos\n\nCada caso con su veredicto.\n\n${block}\n`);
  return file;
};

test('una pieza visual que se dibuja bien pasa la gate y el lint', { skip: SKIP }, () => {
  const file = pieza('pieza-buena.md', PIEZA_BUENA);
  const g = gate(file);
  assert.equal(g.status, 0, g.stdout + g.stderr);
  assert.match(g.stdout, /ok: 1 escena/);
  const l = lint(file);
  assert.equal(l.status, 0, l.stdout + l.stderr);
});

test('una pieza que el lector no puede dibujar es un hallazgo de la gate', { skip: SKIP }, () => {
  const file = pieza('pieza-rota.md', PIEZA_BUENA.replace(/,\{"verdict":"no"[\s\S]*?"reason":"Uno escribe\."\}/, ''));
  const g = gate(file);
  assert.equal(g.status, 1, g.stdout + g.stderr);
});

// La prosa del lector se justifica y esa regla llegaba a la razón de una tarjeta
// («Uno            escribiría / mientras otro lee»). El lint mide con la regla del
// lector puesta —si no, mediría una página que el aprendiz nunca ve— y una pieza
// bien alineada no produce el hallazgo. El hallazgo en sí (`texto-justificado`) se
// prueba en `integrations/pi/kit/test/pieces.test.mjs`, sobre la misma medida.
test('el lint mide con la regla de prosa del lector y no inventa hallazgos en una pieza bien alineada', { skip: SKIP }, () => {
  const source = readFileSync(join(TOOLS, 'scene-lint.mjs'), 'utf8');
  assert.match(source, /\.prose p \{ text-align: justify/, 'el lint ya no mide con la prosa justificada del lector');
  const file = pieza('pieza-alineada.md', PIEZA_BUENA);
  const l = lint(file);
  assert.equal(l.status, 0, l.stdout + l.stderr);
  assert.doesNotMatch(l.stdout, /texto-justificado/);
});

// ── Classic walkthrough rendering (#237) ─────────────────────────────────────
// La punta de la flecha crece con el trazo pero tiene tope, y una etiqueta nunca
// se comprime para caber: el alumno vio un triángulo de 44 unidades sobre un
// trazo de 80 y «ORA-02291» aplastada en 36 unidades, como una letra condensada.
const PARTE_SQL = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'sql-parte-1.md');

const flechaScene = (arrow) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"una flecha","caption":"La punta señala la caja.","scene":{
  "boxes":[{"x":20,"y":70,"w":160,"h":60,"label":"origen","size":18},{"x":560,"y":70,"w":160,"h":60,"label":"destino","size":18}],
  "arrows":${JSON.stringify([arrow])}}}
</script>
</lk-scene>
`;

const flechaNote = (name, arrow) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La flecha\n\nSe dibuja con su punta.\n\n${flechaScene(arrow)}\n`);
  return file;
};

// La parte real que el alumno rechazó ya no trae ninguno de los dos defectos: la
// punta mide 3 × el trazo (12 unidades con un trazo de 4) y ninguna etiqueta se
// comprime. Antes del arreglo la misma nota daba punta 44 y `textLength` 36.
test('la parte real de SQL no tiene puntas desproporcionadas ni etiquetas comprimidas', { skip: SKIP }, () => {
  const r = lint(PARTE_SQL);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /punta-grande/);
  assert.doesNotMatch(r.stdout, /etiqueta-comprimida/);
});

// Una punta que no crece con su trazo: un trazo de 1 unidad con una punta de 6 es
// un triángulo sobre un hilo. El tope es 4 × el grosor.
test('una punta que no crece con el trazo es un hallazgo', { skip: SKIP }, () => {
  const file = flechaNote('punta-desproporcionada.md', { x1: 180, y1: 100, x2: 560, y2: 100, label: 'va', tone: 'blue', width: 1, labelSize: 15, labelBeside: true });
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /punta-grande/);
  assert.match(r.stdout, /tope 4 ×/);
});

// Una etiqueta que no cabe ni al tamaño mínimo se marca: el lector la ve
// aplastada o fuera de su caja, y el arreglo es acortarla, no comprimirla.
test('una etiqueta que no cabe ni al tamaño mínimo es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'etiqueta-comprimida.md');
  writeFileSync(file, `# Parte 1\n\n## 1. La caja\n\nLa caja lleva su nombre.\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"una caja estrecha","caption":"La caja lleva su nombre.","scene":{"boxes":[{"x":20,"y":60,"w":90,"h":60,"label":"una etiqueta larguísima que no cabe","size":22}]}}
</script>
</lk-scene>\n`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /etiqueta-comprimida/);
  assert.match(r.stdout, /acórtalo o muévelo al lado del trazo/);
});

// Una etiqueta de flecha no puede ser más grande que la letra de la figura: se lee
// como un título y tapa la flecha que etiqueta. La parte real que el alumno
// rechazó dibujaba «ORA-02291» a 22 sobre cajas de 13 y rótulos de 12.
test('la parte real de SQL no tiene etiquetas de flecha más grandes que su figura', { skip: SKIP }, () => {
  const r = lint(PARTE_SQL);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /etiqueta-desproporcionada/);
});

// Una etiqueta de flecha que se dibuja más grande que la letra de la figura es un
// hallazgo: aquí la caja encoge su rótulo para caber y la etiqueta de la flecha
// se queda por encima de él.
test('una etiqueta de flecha más grande que la letra de la figura es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'etiqueta-desproporcionada.md');
  writeFileSync(file, `# Parte 1

## 1. La flecha

La flecha lleva su palabra.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","title":"una flecha con su palabra","caption":"La palabra va al lado del trazo.","scene":{
  "boxes":[{"x":20,"y":60,"w":90,"h":60,"label":"una etiqueta larguísima que no cabe","size":22},{"x":560,"y":60,"w":160,"h":60,"label":"destino","size":18}],
  "arrows":[{"x1":112,"y1":90,"x2":560,"y2":90,"label":"va","labelSize":15,"labelBeside":true}]}}
</script>
</lk-scene>
`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /etiqueta-desproporcionada/);
  assert.match(r.stdout, /la letra de la figura a \d+/);
});

// ── A broken scene payload is a finding, not a silent skip (#237) ────────────
// La parte real trae un `<lk-scene>` cuyo JSON está roto (la cadena del `caption`
// quedó sin cerrar). La puerta se rendía al dibujar y el estudio lo leía como un
// fallo suyo, no como algo que corregir: la escena rota volvía al tutor como
// «crashed» o no volvía. Ahora es un hallazgo con su nombre.
const escenaRota = (name, json) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La escena\n\nSe dibuja.\n\n<lk-scene>\n<script type="application/json">\n${json}\n</script>\n</lk-scene>\n`);
  return file;
};

test('una escena con el JSON roto es un hallazgo de la gate', { skip: SKIP }, () => {
  const file = escenaRota('escena-json-roto.md', '{"viewBox":"0 0 760 200","caption":"una cadena sin cerrar\n  "scene": {"boxes":[{"x":20,"y":20,"w":100,"h":40,"label":"a"}]}}');
  const g = gate(file);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}escena-ilegible: /m);
  assert.match(g.stdout, /no es JSON/);
});

test('una escena sin payload es un hallazgo de la gate', { skip: SKIP }, () => {
  const file = join(dir, 'escena-sin-payload.md');
  writeFileSync(file, `# Parte 1\n\n## 1. La escena\n\nSe dibuja.\n\n<lk-scene title="sin payload"></lk-scene>\n`);
  const g = gate(file);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}escena-ilegible: /m);
});

test('la parte real de SQL dice que su escena no se puede leer', { skip: SKIP }, () => {
  const g = gate(PARTE_SQL);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}escena-ilegible: /m);
});

// El estudio lee los hallazgos de la gate con esta forma (`  <kind>: <texto>`): si
// la línea no la cumple, la escena rota no vuelve al tutor.
test('el estudio lee la escena rota como un hallazgo, no como un fallo suyo', { skip: SKIP }, async () => {
  const { findingsOf } = await import('../studio/checks.ts');
  const file = escenaRota('escena-para-el-estudio.md', '{"viewBox":"0 0 760 200","caption":"roto');
  const g = gate(file);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  const findings = findingsOf('scene-gate.mjs', g.stdout);
  assert.ok(findings.some((f) => f.startsWith('escena-ilegible:')), `el estudio no lee el hallazgo: ${JSON.stringify(findings)}`);
});

// ── Story quality (#243) ─────────────────────────────────────────────────────
// La Parte 1 de PL/SQL pasó las cuatro puertas y el alumno la rechazó igual: su
// escena dibuja la letra a 12 px, deja un cuarto de su lienzo en blanco y su
// recorrido aprueba dos cajas con un ✓ que no dice qué aprueba. Los tres son
// medibles, y estos casos fijan la medida sobre la parte real.
const PARTE_PLSQL = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'plsql-parte-1.md');

// Dos cajas que ocupan el lienzo: así el único defecto que se mide es la letra.
const escenaConLetra = (name, size) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La memoria\n\nSe dibuja.\n\n<lk-scene>
<script type="application/json">
{"viewBox":"0 0 360 200","title":"la memoria","caption":"La sesión y el disco.","scene":{
  "boxes":[{"x":16,"y":20,"w":150,"h":150,"label":"Memoria","sub":"v_saldo: 1000","tone":"blue"},{"x":194,"y":20,"w":150,"h":150,"label":"Disco","sub":"cuentas","tone":"green"}],
  "labels":[{"x":180,"y":180,"text":"DML","size":${size},"tone":"blue"}]}}
</script>
</lk-scene>\n`);
  return file;
};

test('una escena con la letra por debajo del mínimo de lectura es un hallazgo', { skip: SKIP }, () => {
  const g = gate(escenaConLetra('letra-diminuta.md', 12));
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}letra-diminuta: DML/m);
  assert.match(g.stdout, /12\.0 px.*14 px/);
});

test('una escena con la letra del tamaño de lectura no es un hallazgo', { skip: SKIP }, () => {
  const g = gate(escenaConLetra('letra-legible.md', 15));
  assert.equal(g.status, 0, g.stdout + g.stderr);
  assert.doesNotMatch(g.stdout, /letra-diminuta/);
});

// La figura que no usa su lienzo: el dibujo ocupa menos de tres cuartos del
// canvas y el lector mira un cuarto de papel en blanco.
const escenaEnLienzo = (name, viewBox) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La memoria\n\nSe dibuja.\n\n<lk-scene>
<script type="application/json">
{"viewBox":"${viewBox}","title":"la memoria","caption":"La sesión y el disco.","scene":{
  "boxes":[{"x":16,"y":20,"w":150,"h":150,"label":"Memoria","sub":"v_saldo: 1000","tone":"blue"},{"x":194,"y":20,"w":150,"h":150,"label":"Disco","sub":"cuentas","tone":"green"}],
  "labels":[{"x":180,"y":180,"text":"DML","size":15,"tone":"blue"}]}}
</script>
</lk-scene>\n`);
  return file;
};

test('una figura que deja un cuarto de su lienzo vacío es un hallazgo', { skip: SKIP }, () => {
  const g = gate(escenaEnLienzo('lienzo-sin-usar.md', '0 0 360 400'));
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}lienzo-vacio: la memoria/m);
  assert.match(g.stdout, /de su lienzo/);
});

test('una figura que usa su lienzo no es un hallazgo', { skip: SKIP }, () => {
  const g = gate(escenaEnLienzo('lienzo-usado.md', '0 0 360 200'));
  assert.equal(g.status, 0, g.stdout + g.stderr);
  assert.doesNotMatch(g.stdout, /lienzo-vacio/);
});

// El ✓ de la parte real: aprueba dos cajas a la vez y no lleva su nombre, así que
// cae en el hueco entre las dos y no se sabe qué aprobó.
const historiaConMarca = (name, mark) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La transacción\n\nSe dibuja.\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"La transacción","viewBox":"0 0 360 210","steps":[
 {"title":"Dos saldos","narrator":"Las dos cuentas están en reposo.","stage":{"scene":{
   "actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","tone":"slate"},{"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","tone":"slate"}],
   "marks":[${JSON.stringify(mark)}]}}}
]}
</script>
</lk-story>\n`);
  return file;
};

test('un ✓ entre dos cajas sin su nombre es un hallazgo', { skip: SKIP }, () => {
  const r = lint(historiaConMarca('marca-suelta.md', { kind: 'ok', actors: ['c10', 'c20'] }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}marca-suelta: ok/m);
  assert.match(r.stdout, /c10, c20|dos/);
});

test('un ✓ sobre un actor no es un hallazgo', { skip: SKIP }, () => {
  const r = lint(historiaConMarca('marca-sobre-actor.md', { kind: 'ok', actors: ['c10'] }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /marca-suelta/);
});

test('un ✓ entre dos cajas con su nombre no es un hallazgo', { skip: SKIP }, () => {
  const r = lint(historiaConMarca('marca-con-nombre.md', { kind: 'ok', actors: ['c10', 'c20'], label: 'confirmado' }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /marca-suelta/);
});

// La parte real que el alumno rechazó: su escena dibuja a 12 px y su recorrido
// aprueba dos cajas con un ✓ sin nombre. Ninguna de las dos puertas lo medía.
test('la parte real de PL/SQL dibuja su escena por debajo del mínimo de lectura', { skip: SKIP }, () => {
  const g = gate(PARTE_PLSQL);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}letra-diminuta: /m);
});

test('la parte real de PL/SQL deja un cuarto de su escena en blanco', { skip: SKIP }, () => {
  const g = gate(PARTE_PLSQL);
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^ {2}lienzo-vacio: .*de su lienzo/m);
});

test('la parte real de PL/SQL aprueba dos cajas con un ✓ que no dice qué aprueba', { skip: SKIP }, () => {
  const r = lint(PARTE_PLSQL);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}marca-suelta: ok/m);
});

// ── La marca y la cabecera se leen al tamaño del lector (#243, segunda vuelta) ──
// El alumno vio el ✓ de la parte corregida más grande que los nombres de las
// cuentas, y en el teléfono la cabecera cortada por los dos lados: ni el principio
// ni el final de la sentencia, y el token resaltado partido en el borde.
const PLSQL_CORREGIDO = join(EXAMPLES, 'plsql-transaccion.md');

// La parte corregida ya no tiene los dos defectos: la marca se dibuja al tamaño de
// los nombres y la cabecera se escala hasta caber entera.
test('la parte corregida dibuja su marca y su cabecera al tamaño del lector', { skip: SKIP }, () => {
  const r = lint(PLSQL_CORREGIDO);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /etiqueta-desproporcionada/);
  assert.doesNotMatch(r.stdout, /cabecera-cortada/);
});

// La regla sigue viva: una marca sobre un escenario que no escribe ningún nombre
// se dibuja a 24 unidades, por encima del mínimo de lectura, y se lee como el
// título de la escena. El arreglo es nombrar a los actores.
const historiaSinNombres = (mark) => {
  const file = join(dir, 'marca-sin-nombres.md');
  writeFileSync(file, `# Parte 1\n\n## 1. La transacción\n\nSe dibuja.\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"La transacción","viewBox":"0 0 360 210","steps":[
 {"title":"Dos saldos","narrator":"Las dos cuentas están en reposo.","equation":{"atoms":[{"t":"SELECT 1;","id":"q"}]},"focus":["q"],"stage":{"scene":{
   "actors":[{"id":"c10","icon":"robot","x":90,"y":120,"size":56,"tone":"slate"},{"id":"c20","icon":"robot","x":270,"y":120,"size":56,"tone":"slate"}],
   "marks":[${JSON.stringify(mark)}]}}}
]}
</script>
</lk-story>\n`);
  return file;
};

test('una marca más grande que la letra de su escenario es un hallazgo', { skip: SKIP }, () => {
  const r = lint(historiaSinNombres({ kind: 'ok', actors: ['c10', 'c20'], label: 'confirmado' }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}etiqueta-desproporcionada: ✓/m);
  assert.match(r.stdout, /la letra de la figura a \d+/);
});

// La cabecera no se corta: un token que no cabe ni partido por tokens es un
// hallazgo, porque el lector no puede leer ni el principio ni el final.
test('una cabecera con un token que no cabe es un hallazgo', { skip: SKIP }, () => {
  const file = join(dir, 'cabecera-cortada.md');
  const largo = 'x'.repeat(140);
  writeFileSync(file, `# Parte 1\n\n## 1. La transacción\n\nSe dibuja.\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"La transacción","viewBox":"0 0 360 210","steps":[
 {"title":"Uno","narrator":"Una línea larguísima.","equation":{"atoms":[{"t":"${largo}","id":"l"}]},"focus":["l"],"stage":{"scene":{
   "actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","size":16,"tag":"saldo 1000"}]}}}
]}
</script>
</lk-story>\n`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^ {2}cabecera-cortada: /m);
});

// Las dos reglas tienen su lado limpio: una marca al tamaño de los nombres y una
// cabecera que cabe entera no son un hallazgo.
const historiaConMarcaAlTamano = (mark) => {
  const file = join(dir, 'marca-al-tamano.md');
  writeFileSync(file, `# Parte 1\n\n## 1. La transacción\n\nSe dibuja.\n\n<lk-story>
<script type="application/json">
{"kind":"derivation","title":"La transacción","viewBox":"0 0 360 210","steps":[
 {"title":"Dos saldos","narrator":"Las dos cuentas están en reposo.","equation":{"atoms":[{"t":"SELECT 1;","id":"q"}]},"focus":["q"],"stage":{"scene":{
   "actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","size":16,"tag":"saldo 1000"},{"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","size":16,"tag":"saldo 1000"}],
   "marks":[${JSON.stringify(mark)}]}}}
]}
</script>
</lk-story>\n`);
  return file;
};

test('una marca al tamaño de los nombres no es un hallazgo', { skip: SKIP }, () => {
  const r = lint(historiaConMarcaAlTamano({ kind: 'ok', actors: ['c10', 'c20'], label: 'confirmado' }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /etiqueta-desproporcionada/);
  assert.doesNotMatch(r.stdout, /cabecera-cortada/);
});

// Un personaje (#245) es un dibujo, no un conector: sus trazos no tienen que
// «llegar» a nada. El engranaje del proceso se dibuja con un polígono cerrado y
// el cilindro de la base de datos con un cuerpo curvo; medidos como flechas, sus
// extremos quedan en el aire y la puerta rechazaba la escena que el alumno sí lee.
const personajeEscena = (kind) => `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 220","title":"el personaje","caption":"El proceso y su dato.","scene":{
  "boxes":[{"x":88,"y":70,"w":212,"h":80,"label":"el dato","tone":"blue","size":22}],
  "icons":[{"kind":"${kind}","x":350,"y":110,"size":80,"tone":"slate"}]}}
</script>
</lk-scene>
`;

const personajeNote = (name, kind) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. El personaje\n\nSe dibuja el personaje.\n\n${personajeEscena(kind)}\n`);
  return file;
};

for (const kind of ['gear', 'database', 'row', 'session', 'lock', 'server', 'process', 'file', 'packet']) {
  test(`un personaje dibujado no es un trazo al aire: ${kind}`, { skip: SKIP }, () => {
    const r = lint(personajeNote(`personaje-${kind}.md`, kind));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /trazo-al-aire/);
  });
}

// ── Una fila torcida y una marca en el hueco (#245) ─────────────────────────
// El alumno vio la fila de cuentas torcida: «Cuenta 20» caía ~55 px por debajo de
// «Cuenta 10» porque el marco a trazos y el candado del bloqueo agrandaban la caja
// medida, y su ficha subía mientras su cofre bajaba. Y vio el «✓ acreditado»
// flotando en el hueco entre los dos cofres, más cerca de ninguno: aprobaba a
// Cuenta 20 y no estaba sobre ella.
const rowStory = (actors, marks = [], viewBox = '0 0 360 260') => `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"La fila de cuentas","viewBox":"${viewBox}","steps":[
 {"title":"La fila","narrator":"Dos cuentas en una fila.","equation":{"atoms":[{"t":"SELECT 1;","id":"q"}]},"focus":["q"],"stage":{"scene":{
  "actors":${JSON.stringify(actors)},
  "props":[{"id":"saldo10","kind":"value","on":"c10","side":"below","label":"800","tone":"blue"},{"id":"saldo20","kind":"value","on":"c20","side":"below","label":"1500","tone":"amber"}],
  "marks":${JSON.stringify(marks)}}}}
]}
</script>
</lk-story>`;

const rowNote = (name, actors, marks, viewBox) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## 1. La fila\n\nSe dibuja la fila.\n\n${rowStory(actors, marks, viewBox)}\n`);
  return file;
};

const ROW_ACTORS = [
  { id: 'c10', kind: 'row', x: 90, y: 120, size: 64, tone: 'blue', tag: 'Cuenta 10' },
  { id: 'c20', kind: 'row', x: 270, y: 120, size: 64, tone: 'amber', tag: 'Cuenta 20' },
];

test('una fila de actores a distinta altura es un hallazgo', { skip: SKIP }, () => {
  const crooked = [{ ...ROW_ACTORS[0] }, { ...ROW_ACTORS[1], y: 152 }];
  const r = lint(rowNote('fila-torcida.md', crooked, []));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /fila-torcida/);
});

test('una fila de actores que comparten línea base no es un hallazgo', { skip: SKIP }, () => {
  const r = lint(rowNote('fila-derecha.md', ROW_ACTORS, []));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /fila-torcida/);
});

test('una marca sin sitio en su columna cae al hueco y es un hallazgo', { skip: SKIP }, () => {
  // El actor pegado al borde: debajo está su cofre y a su izquierda no cabe el ✓,
  // así que la única salida es el hueco entre las dos cuentas — y ahí no aprueba a
  // nadie. Es el ✓ suelto que el alumno vio flotando entre los dos saldos (#243).
  const tight = [
    { id: 'c10', kind: 'row', x: 60, y: 120, size: 64, tone: 'blue', tag: 'Cuenta 10' },
    { id: 'c20', kind: 'row', x: 300, y: 120, size: 64, tone: 'amber', tag: 'Cuenta 20' },
  ];
  const r = lint(rowNote('marca-en-el-hueco.md', tight, [{ kind: 'ok', actor: 'c10' }]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /marca-suelta/);
  assert.match(r.stdout, /hueco|dueño/);
});

// ── El escenario de un paso y el suelo de una historia (#261) ────────────────
// Una historia de derivación no pone un suelo horizontal bajo sus actores: el suelo
// solo significa algo en un alcance o en una línea de tiempo. Y un paso dibuja la
// parte de su escenario que el kit calibró. El banco segundo trae los dos casos.
const BANCO_2 = join(TOOLS, 'register', 'fixtures', 'bench261');
const bancoDos = (nombre) => join(BANCO_2, nombre);

test('el primer paso del banco de Rust deja casi vacío su escenario', { skip: SKIP }, () => {
  const r = gate(bancoDos('rust-borrowing.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /escenario-vacio: paso 1/);
});

test('una historia de derivación que traza un suelo bajo sus actores es un hallazgo', { skip: SKIP }, () => {
  const r = gate(bancoDos('tcp-handshake.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /suelo-sin-sentido: el paso 1/);
});

// Una línea de tiempo declara su marco: su suelo es el eje del tiempo, no decoración.
test('una historia de línea de tiempo puede trazar su suelo', { skip: SKIP }, () => {
  const file = join(dir, 'tcp-linea-de-tiempo.md');
  const origen = readFileSync(bancoDos('tcp-handshake.md'), 'utf8');
  const editado = origen.replace('"kind": "derivation",', '"kind": "derivation",\n  "frame": "timeline",');
  assert.notEqual(editado, origen, 'el kind a cambiar no está en el banco');
  writeFileSync(file, editado);
  const r = gate(file);
  assert.doesNotMatch(r.stdout, /suelo-sin-sentido/);
});

// Una historia de fórmula dibuja sus ejes: la línea horizontal de la campana es el eje
// de la latencia, no un suelo.
test('el eje de la campana gaussiana no es un suelo ni un escenario vacío', { skip: SKIP }, () => {
  const r = gate(join(EXAMPLES, 'formula-gaussiana.md'));
  assert.doesNotMatch(r.stdout, /suelo-sin-sentido/);
  assert.doesNotMatch(r.stdout, /escenario-vacio/);
});

// Los ejemplos de historia aprobados del kit pasan las dos medidas.
test('los ejemplos de historia del kit pasan el escenario y el suelo', { skip: SKIP }, () => {
  for (const name of ['derivacion-x.md', 'plsql-transaccion.md', 'prestamos-rust.md', 'propiedad-rust.md']) {
    const r = gate(join(EXAMPLES, name));
    assert.doesNotMatch(r.stdout, /suelo-sin-sentido/, name);
    assert.doesNotMatch(r.stdout, /escenario-vacio/, name);
  }
});

// Dos fichas de nombre de actores vecinos que se tocan a 390 px se leen como una sola ficha (#261): la
// regla de texto encimado mide también las fichas, en píxeles de la pantalla del lector.
test('dos fichas de nombre de una sola palabra que se tocan a 390 px son un hallazgo: el kit no puede partirlas', { skip: SKIP }, () => {
  const file = join(dir, 'fichas-pegadas.md');
  writeFileSync(file, `# Parte 1\n\n<lk-story>\n<script type="application/json">\n{"kind":"derivation","title":"Dos cuentas","viewBox":"0 60 360 190","steps":[\n {"title":"Uno","equation":{"atoms":[{"t":"a","id":"a"}]},"narrator":"Uno.","stage":{"scene":{"actors":[{"id":"x","kind":"user","x":100,"y":168,"size":72,"tone":"blue","tag":"Cuentaprincipal"},{"id":"y","kind":"user","x":200,"y":168,"size":72,"tone":"amber","tag":"Cuentasecundaria"}]}}},\n {"title":"Dos","equation":{"atoms":[{"t":"b","id":"b"}]},"narrator":"Dos.","stage":{"scene":{"actors":[{"id":"x","kind":"user","x":100,"y":168,"size":72,"tone":"blue","tag":"Cuentaprincipal","state":"faded"},{"id":"y","kind":"user","x":200,"y":168,"size":72,"tone":"amber","tag":"Cuentasecundaria"}]}}}\n]}\n</script>\n</lk-story>\n`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /texto-encimado/);
  assert.match(r.stdout, /390 px/);
});

// Un cliente (un robot) y un servidor de figura distinta en una fila: sus fichas se alinean por la base de
// la pastilla, no por el trazo que baja hasta cada personaje (#261).
test('una fila de personajes de figura distinta tiene las fichas alineadas por su base', { skip: SKIP }, () => {
  const file = join(dir, 'fila-figuras-distintas.md');
  writeFileSync(file, `# Parte 1\n\n<lk-story>\n<script type="application/json">\n{"kind":"derivation","title":"Cliente y servidor","viewBox":"0 60 360 190","steps":[\n {"title":"Uno","equation":{"atoms":[{"t":"a","id":"a"}]},"narrator":"Uno.","stage":{"scene":{"actors":[{"id":"c","kind":"robot","x":100,"y":150,"size":56,"tone":"blue","tag":"Cliente"},{"id":"s","kind":"server","x":260,"y":150,"size":56,"tone":"purple","tag":"Servidor"}]}}},\n {"title":"Dos","equation":{"atoms":[{"t":"b","id":"b"}]},"narrator":"Dos.","stage":{"scene":{"actors":[{"id":"c","kind":"robot","x":100,"y":150,"size":56,"tone":"blue","tag":"Cliente","state":"faded"},{"id":"s","kind":"server","x":260,"y":150,"size":56,"tone":"purple","tag":"Servidor"}]}}}\n]}\n</script>\n</lk-story>\n`);
  const r = lint(file);
  assert.doesNotMatch(r.stdout, /fila-torcida/, r.stdout + r.stderr);
});

// Dos fichas de dos palabras se parten en dos líneas y no tuercen la fila: se mide la base de la ficha (#261).
test('una ficha partida en dos líneas no tuerce la fila de sus vecinos', { skip: SKIP }, () => {
  const file = join(dir, 'fila-partida.md');
  writeFileSync(file, `# Parte 1\n\n<lk-story>\n<script type="application/json">\n{"kind":"derivation","title":"Dos cuentas","viewBox":"0 60 360 190","steps":[\n {"title":"Uno","equation":{"atoms":[{"t":"a","id":"a"}]},"narrator":"Uno.","stage":{"scene":{"actors":[{"id":"x","kind":"user","x":100,"y":168,"size":72,"tone":"blue","tag":"Cuenta uno"},{"id":"y","kind":"user","x":200,"y":168,"size":72,"tone":"amber","tag":"Cuenta dos"}]}}},\n {"title":"Dos","equation":{"atoms":[{"t":"b","id":"b"}]},"narrator":"Dos.","stage":{"scene":{"actors":[{"id":"x","kind":"user","x":100,"y":168,"size":72,"tone":"blue","tag":"Cuenta uno"},{"id":"y","kind":"user","x":200,"y":168,"size":72,"tone":"amber","tag":"Cuenta dos"}]}}}\n]}\n</script>\n</lk-story>\n`);
  const r = lint(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// El ejemplo de Bayes con mil personas deja 6 px entre sus fichas a 390 px: es el caso que midió el alumno.
test('el ejemplo de Bayes con mil personas deja 6 px entre sus fichas a 390 px', { skip: SKIP }, () => {
  const r = lint(join(EXAMPLES, 'bayes-mil-personas.md'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// El árbol de frecuencias (#261) es una pieza: sus rótulos de rama no se encimen. Con cuentas
// tan largas que dos rótulos vecinos se pisan, el lint lo encuentra.
test('frequency-tree branch labels that pile on each other are a finding', { skip: SKIP }, () => {
  const file = join(dir, 'arbol-encimado.md');
  const arbol = {
    nodes: [
      { id: 'todas', lines: ['1000 personas'], kind: 'user' },
      { id: 'enf', lines: ['enfermos'], kind: 'user' },
      { id: 'san', lines: ['sanos'], kind: 'user' },
      { id: 'a', lines: ['positivos'], kind: 'user' },
      { id: 'b', lines: ['negativos'], kind: 'user' },
      { id: 'c', lines: ['positivos'], kind: 'user' },
      { id: 'd', lines: ['negativos'], kind: 'user' },
    ],
    links: [
      { from: 'todas', to: 'enf', count: 1000000, rate: '99,99 %' },
      { from: 'todas', to: 'san', count: 1000000, rate: '99,99 %' },
      { from: 'enf', to: 'a', count: 1000000, rate: '99,99 %' },
      { from: 'enf', to: 'b', count: 1000000, rate: '99,99 %' },
      { from: 'san', to: 'c', count: 1000000, rate: '99,99 %' },
      { from: 'san', to: 'd', count: 1000000, rate: '99,99 %' },
    ],
  };
  writeFileSync(file, `# Parte 1\n\n## 1. Mil personas\n\n<lk-tree>\n<script type="application/json">\n${JSON.stringify(arbol)}\n</script>\n</lk-tree>\n`);
  const r = lint(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /text-over-text/);
});
