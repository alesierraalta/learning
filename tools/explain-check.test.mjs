// La puerta que revisa una explicación también se prueba: una que acepta todo no
// sirve de nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'explain-check-'));
// Un recorrido de fórmula mínimo, sin símbolos: el primer sitio donde aparece
// una fórmula es el recorrido, así la regla nueva no se mezcla con la leyenda.
const STORY_SIMPLE = `<lk-story>
<script type="application/json">
{"kind":"formula","title":"Una cuenta","viewBox":"0 0 360 250","formula":{"size":18,"atoms":[{"t":"1","id":"one"},{"t":" + ","id":"plus"},{"t":"1","id":"one2"},{"t":" = ","id":"eq"},{"t":"2","id":"two"}]},"steps":[
 {"title":"La cuenta","focus":[],"narrator":"Es la cuenta entera.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la cuenta"}]}}},
 {"title":"El resultado","focus":["two"],"narrator":"El resultado es «2».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"el resultado"}]}}},
 {"title":"Otra vez","focus":[],"narrator":"La cuenta se lee igual.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la cuenta"}]}}}
]}
</script>
</lk-story>`;

const run = (file) => spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file], { encoding: 'utf8' });

// La escena se dibuja: el ejemplo se mira, y el recorrido no la sustituye.
const ESCENA = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","caption":"El estado entra y la acción sale.","scene":{"boxes":[{"x":88,"y":48,"w":212,"h":100,"label":"el estado","tone":"blue","size":22}]}}
</script>
</lk-scene>
`;

const CUMPLE = `# Parte 1

## Ruta

1. Qué es el estado
2. Qué es la acción
3. Cómo se combinan

## 1. El estado

El estado es lo que hace falta saber para decidir.

${ESCENA}
## 2. La acción

La acción es lo que el agente puede hacer.

<lk-quiz>{"id":"q1"}</lk-quiz>
`;

test('acepta una parte que cumple el estándar', () => {
  const f = join(dir, 'cumple.md');
  writeFileSync(f, CUMPLE);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cumple el estándar/);
});

// El mini-quiz es el quiz que el mismo estándar pide, no una tercera idea: su
// heading no gasta una de las dos secciones de contenido. El motor cuenta igual
// (`contentSections` en `internal/engine/standard.go`), para que el tutor y el
// motor coincidan.
test('un heading de mini-quiz no es una sección de contenido', () => {
  const f = join(dir, 'con-heading-quiz.md');
  writeFileSync(f, `${CUMPLE}\n## Mini-quiz\n\n1. ¿Qué es el estado?\n`);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+secciones/);
});

test('rechaza una tercera sección de contenido', () => {
  const f = join(dir, 'tres-secciones.md');
  writeFileSync(f, `${CUMPLE}\n## 3. Otra idea\n\nOtra cosa que pide su propia parte.\n`);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA secciones/);
});

test('rechaza una parte sin ruta', () => {
  const f = join(dir, 'sin-ruta.md');
  writeFileSync(f, CUMPLE.replace(/## Ruta[\s\S]*?(?=## 1\.)/, ''));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA ruta/);
});

test('rechaza una parte que cierra con resumen', () => {
  const f = join(dir, 'resumen.md');
  writeFileSync(f, `${CUMPLE}\n## Resumen para guardar\n\nTodo lo dicho, otra vez.\n`);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA sin-resumen/);
});

test('rechaza una parte que pasa del tope de prosa', () => {
  const f = join(dir, 'larga.md');
  writeFileSync(f, `${CUMPLE}\n${'palabra '.repeat(500)}\n`);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA tamaño/);
});

test('rechaza una parte sin mini-quiz', () => {
  const f = join(dir, 'sin-quiz.md');
  writeFileSync(f, CUMPLE.replace('<lk-quiz>{"id":"q1"}</lk-quiz>', ''));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA mini-quiz/);
});

// Una lista es una idea por línea: tres viñetas cortas, cada una con su punto,
// no son un párrafo de tres frases. Una viñeta con tres frases dentro sí lo es.
test('una lista de viñetas cortas no es un párrafo muro', () => {
  const f = join(dir, 'lista-corta.md');
  writeFileSync(f, CUMPLE.replace('1. Qué es el estado\n2. Qué es la acción\n3. Cómo se combinan',
    '1. Qué es el estado.\n2. Qué es la acción.\n3. Cómo se combinan.'));
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+parrafos/);
});

test('una viñeta con tres frases es un párrafo muro', () => {
  const f = join(dir, 'vineta-muro.md');
  writeFileSync(f, CUMPLE.replace('1. Qué es el estado', '- El estado es lo que hace falta saber. Cambia en cada paso. Sin él no se decide.'));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA parrafos/);
});

// «Las partes de matemáticas deben indicar qué es cada elemento» y «dices c/(1−γ)
// pero no lo habías nombrado antes»: una fórmula sin su leyenda de símbolos es un muro.
const CON_FORMULA = CUMPLE.replace('El estado es lo que hace falta saber para decidir.',
  'El valor se escribe así:\n\n<lk-math>Q(s,a) = c/(1-\\gamma)</lk-math>\n');

test('una fórmula con su leyenda de símbolos pasa', () => {
  const f = join(dir, 'formula-con-leyenda.md');
  writeFileSync(f, STORY_SIMPLE + '\n\n' + CON_FORMULA + '\nDonde:\n\n- `Q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n- `\\gamma` es el descuento.\n');
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+leyenda/);
});

// Un símbolo se nombra con su misma letra: `Q` y `q` son símbolos distintos, y una
// `q` suelta en otro JSON de la página no nombra a `Q`.
test('un símbolo no se nombra con otra caja', () => {
  const f = join(dir, 'otra-caja.md');
  writeFileSync(f, CON_FORMULA + '\nDonde:\n\n- `q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n- `\\gamma` es el descuento.\n');
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA leyenda/);
  assert.match(r.stdout, /Q/);
});

test('una fórmula con símbolos sin nombrar falla la leyenda', () => {
  const f = join(dir, 'formula-sin-leyenda.md');
  writeFileSync(f, CON_FORMULA);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA leyenda/);
  assert.match(r.stdout, /gamma/);
});

// La fórmula viva de una parte real: los comandos de LaTeX no son símbolos, \pi y
// `e` son constantes, y las griegas sí. Antes de esto la leyenda pedía nombrar
// \frac, \sqrt, \left, \right, \pi y e, y el tutor corregía una fórmula correcta.
const VIVA = 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}';
// Sin escena: el JSON de una escena trae claves como `"x":88`, y la leyenda las lee
// como si nombraran la `x` de la fórmula. Lo que se mide aquí es la fórmula sola.
const CON_VIVA = `# Parte 1

## Ruta

1. Qué es la densidad
2. Qué es la media
3. Cómo se leen

## 1. La densidad

La densidad se escribe así:

<lk-math>${VIVA}</lk-math>

<lk-quiz>{"id":"q1"}</lk-quiz>
`;

/** Los símbolos que la leyenda pide nombrar, sin la barra de las macros. */
const pedidos = (stdout) => {
  const detalle = /símbolo\(s\) sin nombrar: ([^·]+)/.exec(stdout);
  assert.ok(detalle, `no legend detail in ${stdout}`);
  return detalle[1].split(',').map((s) => s.trim().replace(/^\\/, '')).sort();
};

test('la leyenda de una fórmula real pide sus símbolos, no sus comandos', () => {
  const f = join(dir, 'formula-viva.md');
  writeFileSync(f, CON_VIVA);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA leyenda/);
  // f y x son símbolos; \sigma y \mu también. \frac, \sqrt, \left, \right, \pi y
  // e no: dan forma, operan o son constantes.
  assert.deepEqual(pedidos(r.stdout), ['f', 'mu', 'sigma', 'x']);
});

test('la misma fórmula pasa cuando su leyenda nombra sus cuatro símbolos', () => {
  const f = join(dir, 'formula-viva-leyenda.md');
  writeFileSync(f, STORY_SIMPLE + '\n\n' + CON_VIVA + '\nDonde:\n\n- `f` es la densidad.\n- `x` es el valor que miras.\n- `\\sigma` es el ancho.\n- `\\mu` es el centro.\n');
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+leyenda/);
});

// El rechazo del ritmo cita el primer muro: sin sus primeras palabras el tutor no
// sabe cuál de los párrafos partir.
test('el rechazo de párrafos cita el primer muro', () => {
  const f = join(dir, 'muro-citado.md');
  writeFileSync(f, CUMPLE.replace('El estado es lo que hace falta saber para decidir.', 'Una. Dos. Tres.'));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA parrafos/);
  assert.match(r.stdout, /el primero abre «Una\. Dos\. Tres\.»/);
});

// La fórmula anotada: la escena dibuja la fórmula símbolo por símbolo y sus
// callouts son la leyenda. Un símbolo que ningún callout nombra es una fórmula
// que no se puede leer, y el arreglo es la escena, nunca <lk-math>.
const FORMULA_ANOTADA = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 380","caption":"Cada número señala un símbolo de la fórmula y dice qué es.","scene":{
  "formulas":[{"x":380,"y":104,"size":28,"atoms":[{"t":"f"},{"t":"("},{"t":"x"},{"t":")"},{"t":" = "},{"t":"1/(σ√(2π))"},{"t":" · "},{"t":"exp(−(x−μ)²/(2σ²))"}]}],
  "callouts":[{"n":1,"x":96,"y":40,"to":[96,92],"tone":"blue"},{"n":2,"x":150,"y":40,"to":[150,92],"tone":"amber"},{"n":3,"x":420,"y":40,"to":[420,92],"tone":"green"},{"n":4,"x":300,"y":40,"to":[300,92],"tone":"slate"},{"n":5,"x":560,"y":40,"to":[560,92],"tone":"red"},{"n":6,"x":660,"y":40,"to":[660,92],"tone":"blue"}],
  "labels":[
    {"x":380,"y":190,"text":"① f: la densidad, la altura de la curva"},
    {"x":380,"y":222,"text":"② x: el valor que miras, la latencia"},
    {"x":380,"y":254,"text":"③ μ: el centro, dónde está el pico"},
    {"x":380,"y":286,"text":"④ σ: el ancho, cuánto se abre la campana"},
    {"x":380,"y":318,"text":"⑤ 1/(σ√(2π)): el factor que normaliza; π: 3,1416"},
    {"x":380,"y":350,"text":"⑥ exp(…): el exponente, la distancia al centro"}
  ]}}
</script>
</lk-scene>
`;

const SIN_SIGMA = FORMULA_ANOTADA.replace('    {"x":380,"y":286,"text":"④ σ: el ancho, cuánto se abre la campana"},\n', '');

test('una fórmula anotada con un callout por símbolo pasa la leyenda', () => {
  const f = join(dir, 'formula-anotada.md');
  writeFileSync(f, CUMPLE.replace(ESCENA, FORMULA_ANOTADA));
  const r = run(f);
  assert.match(r.stdout, /ok\s+leyenda/);
});

// Un símbolo que la escena dibuja y ningún callout nombra es una fórmula que no
// se puede leer. El arreglo que se imprime es la escena anotada, no el elemento
// de la ecuación: <lk-math> dibuja una fórmula limpia y sin flechas, que es lo
// que el alumno rechazó.
test('una fórmula anotada con un símbolo sin callout falla la leyenda', () => {
  const f = join(dir, 'formula-anotada-incompleta.md');
  writeFileSync(f, CUMPLE.replace(ESCENA, SIN_SIGMA));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA leyenda/);
  assert.match(r.stdout, /σ/);
  assert.match(r.stdout, /escena anotada/);
  assert.match(r.stdout, /un callout numerado por símbolo/);
  assert.doesNotMatch(r.stdout, /para que el kit la dibuje/);
});

// La fórmula en LaTeX plano se lee igual, y el arreglo es la escena anotada;
// <lk-math> queda para una cuenta.
const PLANA = CUMPLE.replace('El estado es lo que hace falta saber para decidir.',
  'El valor se escribe así:\n\n$$Q(s,a) = c/(1-\\gamma)$$');

test('una fórmula en LaTeX plano sin leyenda falla y nombra la escena anotada', () => {
  const f = join(dir, 'formula-plana.md');
  writeFileSync(f, PLANA);
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA leyenda/);
  assert.match(r.stdout, /gamma/);
  assert.match(r.stdout, /escena anotada/);
  assert.match(r.stdout, /<lk-math> es para una cuenta/);
  assert.doesNotMatch(r.stdout, /para que el kit la dibuje/);
});

test('una fórmula plana con su leyenda pasa', () => {
  const f = join(dir, 'formula-plana-leyenda.md');
  writeFileSync(f, STORY_SIMPLE + '\n\n' + PLANA + '\nDonde:\n\n- `Q` es el valor de hacer `a` en `s`.\n- `c` es el coste de un paso.\n- `\\gamma` es el descuento.\n');
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+leyenda/);
});

// La primera fórmula de la parte se enseña con un recorrido de fórmula: un
// <lk-math> suelto no sustituye al recorrido, y el arreglo lo nombra.
const FORMULA_STORY = `<lk-story>
<script type="application/json">
{"kind":"formula","title":"La densidad","viewBox":"0 0 360 250","formula":{"size":18,"atoms":[{"t":"f","id":"f"},{"t":"(","id":"open"},{"t":"x","id":"x"},{"t":")","id":"close"}]},
 "steps":[
  {"title":"La fórmula entera","focus":[],"narrator":"Es la densidad «f» en el punto «x».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la campana"}]}}},
  {"title":"f: la densidad","focus":["f"],"narrator":"«f» es la densidad: la altura de la curva.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la altura"}]}}},
  {"title":"x: el punto","focus":["x"],"narrator":"«x» es el punto que miras.","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"la latencia"}]}}},
  {"title":"Con el ejemplo","focus":[],"narrator":"Con «x = 184», «f(184) = 0,000 65».","stage":{"scene":{"labels":[{"x":180,"y":120,"text":"el resultado"}]}}}
 ]}
</script>
</lk-story>
`;

test('rechaza una fórmula que no tiene recorrido de fórmula', () => {
  const f = join(dir, 'formula-sin-recorrido.md');
  writeFileSync(f, CUMPLE.replace('## 2. La acción', '## 2. La fórmula\n\nLa densidad se escribe así:\n\n<lk-math>f(x) = 1/(\\sigma\\sqrt{2\\pi})</lk-math>\n\nDonde `f` es la densidad, `x` el punto y `\\sigma` el ancho.'));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA formula-walkthrough/);
  assert.match(r.stdout, /<lk-story kind="formula">/);
  assert.match(r.stdout, /paso 1 la fórmula entera/);
});

test('acepta la fórmula con su recorrido de fórmula', () => {
  const f = join(dir, 'formula-con-recorrido.md');
  writeFileSync(f, CUMPLE.replace('## 2. La acción', `## 2. La fórmula\n\nLa densidad se explica paso a paso.\n\n${FORMULA_STORY}`));
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+formula-walkthrough/);
  assert.match(r.stdout, /ok\s+recorrido\s+1 recorrido/);
});

// Las piezas visuales (tarjetas, memoria, tablas, conjuntos): se miran, no se leen.
// Su JSON no gasta el tope de prosa ni se cuenta como frases, una pieza ocupa el
// lugar de la escena (una figura por parte) y se mide con `scene-lint`.
const TARJETAS = `<lk-cards>
<script type="application/json">
{"caption":"Cada caso, con su veredicto.","cards":[{"verdict":"ok","pill":"COMPILA","title":"Muchas «&»","draw":{"refs":[{"text":"&s"},{"text":"&s"}],"target":{"text":"s"}},"reason":"Todos leen a la vez y nadie escribe jamás en el valor compartido durante ese tiempo largo que dura el préstamo completo."},{"verdict":"no","pill":"NO COMPILA","title":"Mezcla","draw":{"refs":[{"text":"&s"},{"text":"&mut s"}],"target":{"text":"s"}},"reason":"Uno escribiría."}]}
</script>
</lk-cards>
`;

test('una pieza es la figura de la parte: su JSON no es prosa', () => {
  const f = join(dir, 'pieza.md');
  writeFileSync(f, CUMPLE.replace(ESCENA, TARJETAS));
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+frases\s+0 frase/);
  assert.match(r.stdout, /ok\s+figuras/);
});

test('una escena y una pieza son dos figuras y la parte solo admite una', () => {
  const f = join(dir, 'pieza-y-escena.md');
  writeFileSync(f, CUMPLE.replace(ESCENA, `${ESCENA}\n${TARJETAS}`));
  const r = run(f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA escena\s+2 escena\(s\)/);
});
