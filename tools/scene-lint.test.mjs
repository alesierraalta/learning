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
  writeFileSync(file, story(`{"actors":[{"id":"s1","icon":"robot","x":70,"y":150,"size":56,"tone":"blue","state":"invalid","tag":"s1"},{"id":"s2","icon":"robot","x":290,"y":150,"size":56,"tone":"amber","tag":"s2"}],"props":[{"id":"leer","kind":"read","on":"s1","side":"right","tone":"blue"},{"id":"valor","kind":"value","on":"s2","side":"left","label":"hola","tone":"green"}],"marks":[{"kind":"no","actors":["s1","leer"]}]}`));
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
