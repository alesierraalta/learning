// La puerta que revisa una explicación también se prueba: una que acepta todo no
// sirve de nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
 {"title":"La cuenta","focus":[],"narrator":"Es la cuenta entera.","stage":{"scene":{"actors":[{"id":"n","x":140,"y":90,"w":80,"h":40,"label":"1 + 1","tone":"blue"}],"labels":[{"x":180,"y":160,"text":"la cuenta"}]}}},
 {"title":"El resultado","focus":["two"],"narrator":"El resultado es «2».","stage":{"scene":{"actors":[{"id":"n","x":140,"y":90,"w":80,"h":40,"label":"2","tone":"green"}],"labels":[{"x":180,"y":160,"text":"el resultado"}]}}},
 {"title":"Otra vez","focus":[],"narrator":"La cuenta se lee igual.","stage":{"scene":{"actors":[{"id":"n","x":140,"y":90,"w":80,"h":40,"label":"1 + 1","tone":"blue"}],"labels":[{"x":180,"y":160,"text":"la cuenta"}]}}}
]}
</script>
</lk-story>`;

const run = (file) => spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file], { encoding: 'utf8' });

// El lenguaje de historia (#237): el recorrido de la parte se dibuja con
// `<lk-story>` (actores con estado, movimientos y marcas) o con una pieza. Un
// `<lk-walkthrough>` clásico ya no cuenta: sus cajas y flechas libres se dibujan
// mal, y es el camino que tomó el modelo débil.
// El actor es un personaje con su dibujo (#245): el robot se dibuja con
// `kind:"robot"`, no como una caja que dice «robot».
const HISTORIA = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","narrator":"El robot empieza en la casilla de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","tag":"robot"}]}}},
 {"title":"Sube","narrator":"El robot sube una casilla y deja la de abajo.","stage":{"scene":{"actors":[{"id":"r","kind":"robot","x":110,"y":210,"size":56,"tone":"slate","state":"faded"},{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}},
 {"title":"Paga","narrator":"Cada paso cuesta menos cero coma cero cuatro.","stage":{"scene":{"actors":[{"id":"u","kind":"robot","x":110,"y":80,"size":56,"tone":"blue","tag":"arriba"}],"marks":[{"kind":"ok","actors":["u"]}]}}}
]}
</script>
</lk-story>`;

// La escena se dibuja: el ejemplo se mira, y el recorrido no la sustituye.
// Una escena quieta dibuja un personaje, no solo cajas: el engranaje del proceso
// es lo que la separa de «dos cajas y una flecha» (#245).
const ESCENA = `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","caption":"El estado entra y la acción sale.","scene":{"boxes":[{"x":88,"y":48,"w":212,"h":100,"label":"el estado","tone":"blue","size":22}],"icons":[{"kind":"gear","x":352,"y":98,"size":72,"tone":"slate"}]}}
</script>
</lk-scene>
`;

const CUMPLE = `# Parte 1

## Ruta

1. Qué es el estado
2. Qué es la acción
3. Cómo se combinan

## 1. El estado

Imagina un robot aspirador en la sala.

${ESCENA}
**Estado**: es todo lo que hace falta saber para decidir.

Antes, el robot sabía poco. Ahora sabe que la sala está sucia.

## 2. La acción

**Acción**: es lo que el robot puede hacer.

Antes de aspirar, la batería está al 70 %. Después de aspirar, baja al 68 %.

${HISTORIA}

<lk-quiz>{"id":"q1"}</lk-quiz>
`;

// La misma parte sin su recorrido: las pruebas que traen su propio recorrido de
// fórmula lo cambian por este, para no gastar el tope de un recorrido por parte.
const CUMPLE_SIN_HISTORIA = CUMPLE.replace(HISTORIA, '');

// El recorrido clásico: un `<lk-walkthrough>` de tres pasos que dibuja. Es lo que
// el estándar ya no acepta como único recorrido de una parte.
const CLASICO = `<lk-walkthrough class="lk-wt-compact">
<script type="application/json">
{"title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"La salida","text":"El robot empieza abajo.","scene":{"boxes":[{"x":110,"y":210,"w":140,"h":56,"label":"robot"}]}},
 {"title":"Sube","text":"Sube una casilla.","scene":{"boxes":[{"x":110,"y":80,"w":140,"h":56,"label":"arriba"}],"arrows":[{"x1":180,"y1":210,"x2":180,"y2":136,"label":"sube","labelBeside":true}]}},
 {"title":"Paga","text":"Cada paso cuesta menos cero coma cero cuatro.","scene":{"boxes":[{"x":110,"y":80,"w":140,"h":56,"label":"arriba"}]}}
]}
</script>
</lk-walkthrough>`;

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
const CON_FORMULA = CUMPLE.replace('**Estado**: es todo lo que hace falta saber para decidir.',
  '**Estado**: es todo lo que hace falta saber para decidir.\n\nEl valor se escribe así:\n\n<lk-math>Q(s,a) = c/(1-\\gamma)</lk-math>\n');

test('una fórmula con su leyenda de símbolos pasa', () => {
  const f = join(dir, 'formula-con-leyenda.md');
  writeFileSync(f, `${STORY_SIMPLE}\n\n${CON_FORMULA.replace(HISTORIA, '')}\nDonde:\n\n- \`Q\` es el valor de hacer \`a\` en \`s\`.\n- \`c\` es el coste de un paso.\n- \`\\gamma\` es el descuento.\n`);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+leyenda/);
});

// Un símbolo se nombra con su misma letra: `Q` y `q` son símbolos distintos, y una
// `q` suelta en otro JSON de la página no nombra a `Q`.
test('un símbolo no se nombra con otra caja', () => {
  const f = join(dir, 'otra-caja.md');
  writeFileSync(f, `${CON_FORMULA}\nDonde:\n\n- \`q\` es el valor de hacer \`a\` en \`s\`.\n- \`c\` es el coste de un paso.\n- \`\\gamma\` es el descuento.\n`);
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

Imagina una campana de valores.

**Densidad**: es la forma de la campana.

Antes de calcularla, la curva parece plana. Después, con la fórmula, se ve el pico.

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
  writeFileSync(f, `${STORY_SIMPLE}\n\n${CON_VIVA.replace(HISTORIA, '')}\nDonde:\n\n- \`f\` es la densidad.\n- \`x\` es el valor que miras.\n- \`\\sigma\` es el ancho.\n- \`\\mu\` es el centro.\n`);
  const r = run(f);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+leyenda/);
});

// El rechazo del ritmo cita el primer muro: sin sus primeras palabras el tutor no
// sabe cuál de los párrafos partir.
test('el rechazo de párrafos cita el primer muro', () => {
  const f = join(dir, 'muro-citado.md');
  writeFileSync(f, CUMPLE.replace('**Estado**: es todo lo que hace falta saber para decidir.', 'Una. Dos. Tres.'));
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
const PLANA = CUMPLE.replace('**Estado**: es todo lo que hace falta saber para decidir.',
  '**Estado**: es todo lo que hace falta saber para decidir.\n\nEl valor se escribe así:\n\n$$Q(s,a) = c/(1-\\gamma)$$');

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
  writeFileSync(f, `${STORY_SIMPLE}\n\n${PLANA.replace(HISTORIA, '')}\nDonde:\n\n- \`Q\` es el valor de hacer \`a\` en \`s\`.\n- \`c\` es el coste de un paso.\n- \`\\gamma\` es el descuento.\n`);
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
  {"title":"La fórmula entera","focus":[],"narrator":"Es la densidad «f» en el punto «x».","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(x)","tone":"blue"}],"labels":[{"x":180,"y":170,"text":"la campana"}]}}},
  {"title":"f: la densidad","focus":["f"],"narrator":"«f» es la densidad: la altura de la curva.","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(x)","tone":"blue"}],"labels":[{"x":180,"y":170,"text":"la altura"}]}}},
  {"title":"x: el punto","focus":["x"],"narrator":"«x» es el punto que miras.","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(x)","tone":"blue"}],"labels":[{"x":180,"y":170,"text":"la latencia"}]}}},
  {"title":"Con el ejemplo","focus":[],"narrator":"Con «x = 184», «f(184) = 0,000 65».","stage":{"scene":{"actors":[{"id":"curva","x":120,"y":80,"w":120,"h":40,"label":"f(184)","tone":"green"}],"labels":[{"x":180,"y":170,"text":"el resultado"}]}}}
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
  writeFileSync(f, CUMPLE.replace(HISTORIA, '').replace('## 2. La acción', `## 2. La fórmula\n\nLa densidad se explica paso a paso.\n\n${FORMULA_STORY}`));
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

// El lenguaje de historia (#237): el recorrido de la parte se dibuja con
// `<lk-story>` o con una pieza. Un `<lk-walkthrough>` clásico solo no cuenta, y el
// rechazo nombra el elemento que hay que usar. La parte real que el alumno
// rechazó —Parte 1 de SQL, escrita por el estudio con agy— es la prueba.
const PARTE_SQL = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'sql-parte-1.md');

test('la parte real con solo un walkthrough clásico falla la historia y nombra el arreglo', () => {
  const r = run(PARTE_SQL);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA historia/);
  assert.match(r.stdout, /usa una historia por pasos <lk-story> o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>/);
  assert.match(r.stdout, /un <lk-walkthrough> clásico no cuenta/);
});

test('una parte cuyo único recorrido es el walkthrough clásico falla la historia', () => {
  const file = join(dir, 'walkthrough-clasico.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA.replace('## 2. La acción', `## 2. La acción\n\nLa acción se recorre paso a paso.\n\n${CLASICO}`));
  const r = run(file);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA historia/);
});

test('una pieza es el lenguaje de historia: la parte sin recorrido la pasa', () => {
  const file = join(dir, 'pieza-sin-historia.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA.replace(ESCENA, TARJETAS));
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+historia/);
  assert.match(r.stdout, /ok\s+recorrido\s+0 recorrido/);
});

test('una historia por pasos pasa la historia', () => {
  const file = join(dir, 'historia.md');
  writeFileSync(file, CUMPLE);
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+historia/);
  assert.match(r.stdout, /ok\s+recorrido\s+1 recorrido/);
});

// Las instrucciones que lee el modelo dicen lo mismo que la puerta: una parte
// nueva usa el lenguaje de historia y el `<lk-walkthrough>` clásico es legado. Si
// la skill y el AGENTS.md no lo dicen, el modelo sigue tomando el camino viejo.
test('la skill, los visuales y el AGENTS.md de Learnings dicen que el walkthrough clásico es legado', () => {
  const repo = join(TOOLS, '..');
  const skill = readFileSync(join(repo, 'skills', 'explicacion-interactiva', 'SKILL.md'), 'utf8');
  const visuales = readFileSync(join(repo, 'skills', 'explicacion-interactiva', 'references', 'visuales.md'), 'utf8');
  const agents = readFileSync(join(repo, 'deploy', 'vps', 'learnings', 'AGENTS.md'), 'utf8');
  for (const [name, text] of [['SKILL.md', skill], ['visuales.md', visuales], ['AGENTS.md', agents]]) {
    assert.match(text, /lenguaje de historia/i, `${name} no nombra el lenguaje de historia`);
    assert.match(text, /<lk-walkthrough>[^.\n]*legado|legado[^.\n]*<lk-walkthrough>|walkthrough clásico es \*\*legado\*\*|clásico es \*\*legado\*\*/i, `${name} no dice que el walkthrough clásico es legado`);
    assert.match(text, /<lk-story>/, `${name} no nombra <lk-story>`);
  }
  // La regla medida vive en la skill, con el mensaje que el motor devuelve.
  assert.match(skill, /the part carries no story and no piece/);
  assert.match(skill, /usa una historia por pasos <lk-story> o una pieza/);
});

// Una parte con solo una escena (o un SVG) no trae historia ni pieza: el lenguaje
// de historia es obligatorio, no una opción. El rechazo nombra el elemento que hay
// que usar, y el motor devuelve el mismo veredicto (`storyLanguageFindings`).
test('una parte con solo una escena falla la historia', () => {
  const file = join(dir, 'solo-escena.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA);
  const r = run(file);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA historia/);
  assert.match(r.stdout, /usa una historia por pasos <lk-story> o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>/);
});

test('una parte con solo un SVG falla la historia', () => {
  const file = join(dir, 'solo-svg.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA.replace(ESCENA,
    '<svg viewBox="0 0 100 50" role="img" aria-label="una figura"><text x="10" y="20">hola</text></svg>'));
  const r = run(file);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FALLA historia/);
});

// ── Story quality (#243) ─────────────────────────────────────────────────────
// La Parte 1 de PL/SQL pasó el estándar y el alumno la rechazó: su historia no
// lleva la línea de SQL en la cabecera (aunque la parte la enseña) y sus pasos
// dibujan solo cajas con texto. Las dos son estructurales: se leen del JSON.
const PARTE_PLSQL = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'plsql-parte-1.md');

// Una historia con la línea de código en su cabecera: un `equation` por paso con
// el token del paso resaltado.
const HISTORIA_CON_CABECERA = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El débito","viewBox":"0 0 360 210","steps":[
 {"title":"Débito","equation":{"size":18,"atoms":[{"t":"UPDATE ","id":"u"},{"t":"cuentas","id":"t"},{"t":" SET saldo = saldo - 200","id":"set"}]},"focus":["set"],
  "narrator":"El débito resta 200 en la cuenta 10.","stage":{"scene":{"actors":[{"id":"c10","kind":"row","x":90,"y":110,"size":64,"tone":"blue","tag":"Cuenta 10"}],"marks":[{"kind":"ok","actors":["c10"]}]}}}
]}
</script>
</lk-story>`;

test('la parte real de PL/SQL no lleva la línea de SQL en la cabecera de su historia', () => {
  const r = run(PARTE_PLSQL);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA historia-cabecera/);
  assert.match(r.stdout, /equation\.atoms|formula\.atoms/);
  assert.match(r.stdout, /focus/);
});

test('una historia con la línea de código en su cabecera pasa', () => {
  const file = join(dir, 'cabecera-con-linea.md');
  writeFileSync(file, CUMPLE.replace(HISTORIA, HISTORIA_CON_CABECERA));
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+historia-cabecera/);
});

test('la parte real de PL/SQL dibuja su historia con cajas y texto', () => {
  const r = run(PARTE_PLSQL);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA escenario-de-cajas/);
  // El rechazo nombra el vocabulario que hay que usar.
  for (const word of ['actors', 'props', 'moves', '<lk-cards>', '<lk-memory>', '<lk-tables>', '<lk-venn>']) {
    assert.ok(r.stdout.includes(word), `el rechazo no nombra ${word}: ${r.stdout}`);
  }
});

test('una historia con actores en su escenario pasa el escenario', () => {
  const file = join(dir, 'escenario-con-actores.md');
  writeFileSync(file, CUMPLE);
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+escenario-de-cajas/);
});

test('una historia que dibuja una pieza en su escenario pasa el escenario', () => {
  const file = join(dir, 'escenario-con-pieza.md');
  writeFileSync(file, CUMPLE.replace(HISTORIA, `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"El robot sube","viewBox":"0 0 360 300","steps":[
 {"title":"Las tarjetas","narrator":"Cada paso cuesta menos.","stage":{"cards":{"cards":[{"verdict":"ok","title":"compila"}]}}}
]}
</script>
</lk-story>`));
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+escenario-de-cajas/);
});

// ── Personajes, escenas y la pieza que le toca (#245) ────────────────────────
// La Parte 1 de PL/SQL pasó todas las puertas y el alumno la rechazó igual: sus
// actores son rectángulos con una etiqueta («Cuenta 10»), su escena quieta es dos
// cajas y una flecha, y la idea «memoria de sesión contra disco» se dibuja con
// cajas aunque el kit tiene `lk-memory` para eso. Las tres reglas se leen del
// JSON, sin navegador, y el motor aplica las dos primeras con claves aditivas.
const PARTE_ACTORES = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'plsql-parte-1-actores.md');

// Una historia de cajas cuando un personaje encaja: «Cuenta 10» es una fila de la
// tabla `cuentas`, y una fila se dibuja como fila.
const HISTORIA_DE_CAJAS = `<lk-story>
<script type="application/json">
{"kind":"derivation","title":"Las dos cuentas","viewBox":"0 0 360 210","steps":[
 {"title":"Los saldos","equation":{"atoms":[{"t":"SELECT saldo FROM cuentas;","id":"q"}]},"focus":["q"],"narrator":"Las dos cuentas están en reposo.","stage":{"scene":{"actors":[{"id":"c10","x":30,"y":40,"w":135,"h":85,"label":"Cuenta 10","tone":"slate"},{"id":"c20","x":195,"y":40,"w":135,"h":85,"label":"Cuenta 20","tone":"slate"}]}}}
]}
</script>
</lk-story>`;

test('la parte real de PL/SQL dibuja sus actores como cajas con su nombre', () => {
  const r = run(PARTE_ACTORES);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA actor-sin-personaje/);
  // El rechazo nombra el personaje que encaja para el actor que lo tiene.
  assert.match(r.stdout, /Cuenta 10/);
  assert.match(r.stdout, /row/);
  // Y nombra los personajes que hay para dibujar.
  for (const kind of ['database', 'session', 'lock', 'server', 'process', 'file', 'packet', 'robot']) {
    assert.ok(r.stdout.includes(kind), `el rechazo no nombra ${kind}: ${r.stdout}`);
  }
});

test('una historia de cajas cuando un personaje encaja falla el personaje', () => {
  const file = join(dir, 'historia-de-cajas.md');
  writeFileSync(file, CUMPLE.replace(HISTORIA, HISTORIA_DE_CAJAS));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA actor-sin-personaje/);
});

test('una historia con el personaje dibujado pasa el personaje', () => {
  const file = join(dir, 'historia-con-personaje.md');
  writeFileSync(file, CUMPLE);
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+actor-sin-personaje/);
});

// La escena quieta se mide con el mismo rasero que el escenario de la historia:
// dos cajas y una flecha no son un dibujo.
test('la escena quieta de la parte real es dos cajas y una flecha', () => {
  const r = run(PARTE_ACTORES);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA escenario-de-cajas/);
  assert.match(r.stdout, /<lk-scene>/);
});

test('una escena quieta de cajas y flechas falla el escenario', () => {
  const file = join(dir, 'escena-de-cajas.md');
  writeFileSync(file, CUMPLE.replace(ESCENA, `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","caption":"El estado entra y la acción sale.","scene":{"boxes":[{"x":88,"y":48,"w":212,"h":100,"label":"el estado","tone":"blue","size":22},{"x":420,"y":48,"w":212,"h":100,"label":"la acción","tone":"green","size":22}],"arrows":[{"x1":306,"y1":98,"x2":412,"y2":98,"tone":"slate","width":3,"label":"sale"}]}}
</script>
</lk-scene>`));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA escenario-de-cajas/);
});

// La pieza que le toca a la idea: el código que cambia filas guardadas se cuenta
// con `lk-tables` o `lk-memory`, nunca con una escena de cajas.
test('la parte real cambia filas y no trae la pieza que lo cuenta', () => {
  const r = run(PARTE_ACTORES);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA pieza-adecuada/);
  assert.match(r.stdout, /lk-tables/);
  assert.match(r.stdout, /lk-memory/);
});

test('una parte con UPDATE y sin tablas ni memoria falla la pieza', () => {
  const file = join(dir, 'update-sin-pieza.md');
  writeFileSync(file, `${CUMPLE}\n\`\`\`sql\nUPDATE cuentas SET saldo = saldo - 200 WHERE id = 10;\n\`\`\`\n`);
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA pieza-adecuada/);
});

test('una parte con UPDATE y lk-memory pasa la pieza', () => {
  const file = join(dir, 'update-con-memoria.md');
  writeFileSync(file, CUMPLE.replace(ESCENA, `<lk-memory>
<script type="application/json">
{"title":"La sesión y el disco","columns":[{"id":"s","label":"SESIÓN"},{"id":"d","label":"DISCO"}],"steps":[
 {"code":"UPDATE cuentas SET saldo = saldo - 200 WHERE id = 10;","rows":[
  {"s":{"id":"v","name":"v_saldo","cells":["800"],"tone":"blue"},"d":{"id":"h","name":"cuentas","cells":["saldo 1000"],"tone":"slate"}}]}
]}
</script>
</lk-memory>`));
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+pieza-adecuada/);
});

// Una parte que contrasta el código que compila con el que falla se cuenta con
// tarjetas de veredicto, no con dos bloques de código seguidos.
const CONTRASTE = `\`\`\`sql
SELECT saldo FROM cuentas WHERE id = 10;
\`\`\`

Así se lee una fila.

\`\`\`sql
SELECT saldo FROM cuentas WHERE id = 'diez';
\`\`\`

Así no compila: el id es un número.

`;

test('una parte que contrasta código que compila y que falla sin tarjetas falla la pieza', () => {
  const file = join(dir, 'contraste-sin-tarjetas.md');
  writeFileSync(file, `${CUMPLE}\n${CONTRASTE}`);
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA pieza-adecuada/);
  assert.match(r.stdout, /lk-cards/);
});

test('una parte que contrasta código y dibuja sus tarjetas pasa la pieza', () => {
  const file = join(dir, 'contraste-con-tarjetas.md');
  writeFileSync(file, CUMPLE
    .replace(ESCENA, `<lk-cards>
<script type="application/json">
{"title":"Con id número y con id texto","cards":[
 {"verdict":"ok","pill":"COMPILA","title":"id = 10","reason":"el id es un número"},
 {"verdict":"no","pill":"NO COMPILA","title":"id = 'diez'","reason":"el id es texto"}]}
</script>
</lk-cards>`)
    .replace(HISTORIA, HISTORIA_CON_CABECERA)
    .concat(`\n${CONTRASTE}`));
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+pieza-adecuada/);
});

// ── Lo que midió el banco (#246) ─────────────────────────────────────────────
// Las cinco partes del banco pasaron las cuatro puertas y ninguna enseña nada:
// sus recorridos son dos robots quietos en tres pasos (ni un movimiento, ni un
// cambio de estado), su «ecuación» de cabecera es un esquema en texto
// («Cliente ---[ SYN ]---> Servidor») y cada paso lleva un `scene` que el esquema
// no lee. La parte real del banco es la prueba.
const PARTE_BANCO = join(TOOLS, '..', 'internal', 'engine', 'testdata', 'tcp-parte-1-banco.md');

test('la parte del banco dibuja un recorrido que no mueve nada', () => {
  const r = run(PARTE_BANCO);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA historia-quieta/);
  assert.match(r.stdout, /moves/);
  assert.match(r.stdout, /estado/);
});

test('la cabecera del banco es un esquema en texto, no la línea de código', () => {
  const r = run(PARTE_BANCO);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA cabecera-con-flechas/);
  assert.match(r.stdout, /--->|---\[/);
});

test('los pasos del banco llevan una clave que el esquema no lee', () => {
  const r = run(PARTE_BANCO);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA clave-muerta/);
  assert.match(r.stdout, /`scene`/);
  assert.match(r.stdout, /stage/);
});

// Una historia que cambia algo —un estado, una pieza, un movimiento— no es quieta.
test('una historia que cambia un estado pasa la quietud', () => {
  const file = join(dir, 'historia-viva.md');
  writeFileSync(file, CUMPLE);
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+historia-quieta/);
});

// Una historia con la línea de código en su cabecera no lleva flechas de texto.
test('una cabecera con la línea de código pasa', () => {
  const file = join(dir, 'cabecera-de-codigo.md');
  writeFileSync(file, CUMPLE.replace(HISTORIA, HISTORIA_CON_CABECERA));
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+cabecera-con-flechas/);
});

// Una etiqueta de escena con un flujo de texto tampoco se dibuja: se escribe.
test('una etiqueta de escena con flechas de texto es un hallazgo', () => {
  const file = join(dir, 'etiqueta-con-flechas.md');
  writeFileSync(file, CUMPLE.replace(ESCENA, `<lk-scene>
<script type="application/json">
{"viewBox":"0 0 760 200","caption":"El flujo.","scene":{"labels":[{"x":380,"y":120,"text":"[Inicio] ---> [Cursos] ---> [Perfil]","size":18}],"icons":[{"kind":"gear","x":200,"y":60,"size":48,"tone":"slate"}]}}
</script>
</lk-scene>`));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA cabecera-con-flechas/);
});

// La prosa también: la regla de ASCII cubre ahora las flechas de texto.
test('una flecha de texto en la prosa falla el ascii', () => {
  const file = join(dir, 'prosa-con-flechas.md');
  writeFileSync(file, CUMPLE.replace('**Estado**: es todo lo que hace falta saber para decidir.',
    '**Estado**: es todo lo que hace falta saber para decidir.\n\nEl flujo es Cliente ---> Servidor y vuelve.'));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA ascii/);
});

test('una historia sin claves muertas pasa', () => {
  const file = join(dir, 'sin-claves-muertas.md');
  writeFileSync(file, CUMPLE);
  const r = run(file);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok\s+clave-muerta/);
});

// ── Lo que midió el banco 2 (#261) ───────────────────────────────────────────
// Las cuatro partes del segundo banco pasaron todas las puertas y eran genéricas:
// una marca que repite el movimiento (la flecha «SYN» y luego «✓ SYN»), una tarjeta
// teñida de rojo para un estado válido (DETACHED) y un ojo o un lápiz que el texto
// no nombra. Son las partes reales del banco: se miden tal cual salieron.
const BANCO_2 = join(TOOLS, 'register', 'fixtures', 'bench261');
const bancoDos = (nombre) => join(BANCO_2, nombre);

test('el banco de TCP repite el movimiento en su marca: «SYN» bajo la flecha «SYN»', () => {
  const r = run(bancoDos('tcp-handshake.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA marca-eco/);
  assert.match(r.stdout, /«SYN»/);
});

test('el banco de Rust repite el verbo del movimiento en su marca: «presta»', () => {
  const r = run(bancoDos('rust-borrowing.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA marca-eco/);
  assert.match(r.stdout, /«presta»/);
});

test('el banco de Git tiñe de rojo un estado válido: DETACHED no es un error', () => {
  const r = run(bancoDos('git-branching.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA veredicto-sin-error/);
  assert.match(r.stdout, /DETACHED/);
});

test('el banco de Git lleva el ojo y el lápiz en HEAD sin que el texto hable de leer o escribir', () => {
  const r = run(bancoDos('git-branching.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA accesorio-sin-sentido/);
  assert.match(r.stdout, /HEAD en rama activa/);
});

test('el banco de TCP lleva un icono de lectura en el acuse sin que su texto lo diga', () => {
  const r = run(bancoDos('tcp-handshake.md'));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA accesorio-sin-sentido/);
});

// El banco de Bayes no repite marcas, no tiñe tarjetas y no lleva iconos: pasa las
// reglas nuevas, que no son un castigo a todo lo que tiene una tarjeta.
test('el banco de Bayes pasa las reglas de marca, veredicto e icono', () => {
  const r = run(bancoDos('bayes-theorem.md'));
  assert.match(r.stdout, /ok\s+marca-eco/);
  assert.match(r.stdout, /ok\s+veredicto-sin-error/);
  assert.match(r.stdout, /ok\s+accesorio-sin-sentido/);
});

// Una marca que nombra el resultado, no el movimiento, pasa: el ✓ dice «conexión
// pedida» y no repite la flecha. Se cambia solo la marca del paso 1; el paso 2 sigue.
test('una marca que nombra el resultado, no el movimiento, deja de ser eco en su paso', () => {
  const file = join(dir, 'tcp-marca-resultado.md');
  const origen = readFileSync(bancoDos('tcp-handshake.md'), 'utf8');
  const editado = origen.replace('{ "kind": "ok", "actor": "c1", "label": "SYN" }', '{ "kind": "ok", "actor": "c1", "label": "conexión pedida" }');
  assert.notEqual(editado, origen, 'el texto a cambiar no está en el banco');
  writeFileSync(file, editado);
  const r = run(file);
  assert.match(r.stdout, /FALLA marca-eco/);
  assert.match(r.stdout, /el paso 2 marca «SYN-ACK»/);
  assert.doesNotMatch(r.stdout, /el paso 1 marca/);
});

// Una tarjeta neutra con los dos estados válidos no se tiñe: el banco de Git con
// DETACHED como contraste neutro pasa la regla del veredicto.
test('una tarjeta neutra con un estado válido no se tiñe de error', () => {
  const file = join(dir, 'git-neutro.md');
  const origen = readFileSync(bancoDos('git-branching.md'), 'utf8');
  const editado = origen.replace('"verdict": "no",\n      "pill": "DETACHED"', '"verdict": "neutral",\n      "pill": "DETACHED"');
  assert.notEqual(editado, origen, 'el veredicto a cambiar no está en el banco');
  writeFileSync(file, editado);
  const r = run(file);
  assert.match(r.stdout, /ok\s+veredicto-sin-error/);
});

// Una tarjeta de error con su veredicto de error pasa, y su icono también si la
// razón dice qué se lee.
const CASOS_CON_ICONO = (verdict, pill, razon) => `<lk-cards>
<script type="application/json">
{"title":"Dos casos","cards":[
 {"id":"a","verdict":"${verdict}","pill":"${pill}","title":"Caso compartido","draw":{"refs":[{"text":"&s1","icon":"read","tone":"green"}],"target":{"text":"s1"}},"reason":"${razon}"},
 {"id":"b","verdict":"ok","pill":"COMPILA","title":"Otro caso","draw":{"refs":[{"text":"s2","tone":"slate"}],"target":{"text":"s1"}},"reason":"Sin icono."}
]}
</script>
</lk-cards>`;

test('una tarjeta de error con veredicto de error pasa la regla del veredicto', () => {
  const file = join(dir, 'tarjeta-error.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + CASOS_CON_ICONO('no', 'NO COMPILA', 'Se lee y se mueve a la vez.'));
  const r = run(file);
  assert.match(r.stdout, /ok\s+veredicto-sin-error/);
});

test('un icono de lectura cuya razón dice que se lee pasa la regla del icono', () => {
  const file = join(dir, 'icono-con-sentido.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + CASOS_CON_ICONO('ok', 'COMPILA', 'El ojo lee el dato sin moverlo.'));
  const r = run(file);
  assert.match(r.stdout, /ok\s+accesorio-sin-sentido/);
});

test('un icono de lectura cuya razón no dice nada de leer es un hallazgo', () => {
  const file = join(dir, 'icono-sin-sentido.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + CASOS_CON_ICONO('ok', 'COMPILA', 'Lo compara con el otro caso.'));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA accesorio-sin-sentido/);
  assert.match(r.stdout, /Caso compartido/);
});

// ── Probabilidad: los conteos antes que la fórmula (#261) ─────────────────────────────────────────
// Una parte de probabilidad cuenta los casos antes de la fórmula. El ejemplo de Bayes con
// mil personas es el modelo gated: la skill lo nombra y el banco de la gate lo mide.
const KIT_EXAMPLES = join(TOOLS, '..', 'integrations', 'pi', 'kit', 'examples');

test('el ejemplo de Bayes con mil personas cuenta los casos antes de la fórmula y cumple el estándar', () => {
  const r = run(join(KIT_EXAMPLES, 'bayes-mil-personas.md'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cumple el estándar/);
});

test('la skill y sus visuales piden contar antes de la fórmula, con el ejemplo de mil personas', () => {
  const repo = join(TOOLS, '..');
  const skill = readFileSync(join(repo, 'skills', 'explicacion-interactiva', 'SKILL.md'), 'utf8');
  const visuales = readFileSync(join(repo, 'skills', 'explicacion-interactiva', 'references', 'visuales.md'), 'utf8');
  for (const [name, text] of [['SKILL.md', skill], ['visuales.md', visuales]]) {
    assert.match(text, /probabilidad/i, `${name} no nombra la probabilidad`);
    assert.match(text, /conteos[^\n]*antes de la fórmula|antes de la fórmula[^\n]*conteos/i, `${name} no pide los conteos antes de la fórmula`);
    assert.match(text, /mil personas/i, `${name} no nombra el ejemplo de mil personas`);
  }
});

// La página rica es la explicación de cada parte: la skill dice cuándo es obligatoria, y que
// el estudio avisa cuando la nota no tiene su .html junto a ella.
test('la skill dice que la página rica es obligatoria y que el estudio avisa si falta', () => {
  const skill = readFileSync(join(TOOLS, '..', 'skills', 'explicacion-interactiva', 'SKILL.md'), 'utf8');
  assert.match(skill, /página rica[^\n]*obligatoria|obligatoria[^\n]*página rica/i, 'SKILL.md no dice que la página rica es obligatoria');
  assert.match(skill, /avisa[^\n]*\.html|\.html[^\n]*avisa/i, 'SKILL.md no dice que el estudio avisa si falta el .html');
});

// El árbol de frecuencias (#261) es una figura, como la escena y las demás piezas: una parte
// con una escena y un árbol tiene dos figuras, y el tope de una parte es una.
const ARBOL = `<lk-tree>
<script type="application/json">
{"title":"Mil personas","nodes":[{"id":"a","lines":["personas"]},{"id":"b","lines":["sanos"]}],"links":[{"from":"a","to":"b","count":990,"rate":"99 %"}]}
</script>
</lk-tree>
`;

test('a frequency tree is the part\'s figure: with a scene beside it the part has two', () => {
  const file = join(dir, 'arbol-y-escena.md');
  writeFileSync(file, CUMPLE.replace('<lk-quiz>', `${ARBOL}\n<lk-quiz>`));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA escena\s+2 escena\(s\)/);
});

// El personaje contradice su etiqueta (#261): un servidor, un documento o una base que es una persona o
// un resultado de la prueba, o una persona que es un servidor. Un léxico corto, medido en la etiqueta.
const HISTORIA_CON_PERSONAJE = (kind, tag) => `<lk-story>\n<script type="application/json">\n{"kind":"derivation","title":"Un grupo","viewBox":"0 0 360 300","steps":[\n {"title":"Uno","narrator":"El grupo aparece.","stage":{"scene":{"actors":[{"id":"g","kind":"${kind}","x":110,"y":150,"size":56,"tone":"blue","tag":"${tag}"}]}}},\n {"title":"Dos","narrator":"El grupo cambia.","stage":{"scene":{"actors":[{"id":"g","kind":"${kind}","x":110,"y":150,"size":56,"tone":"blue","tag":"${tag}","state":"faded"}]}}}\n]}\n</script>\n</lk-story>`;

test('a server drawn for a group of people is a finding: the character contradicts its tag', () => {
  const file = join(dir, 'personaje-servidor.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + HISTORIA_CON_PERSONAJE('server', '9 enfermos'));
  const r = run(file);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FALLA personaje-sin-sentido/);
  assert.match(r.stdout, /«server»/);
});

test('a document drawn for a test result is a finding', () => {
  const file = join(dir, 'personaje-documento.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + HISTORIA_CON_PERSONAJE('file', '108 positivos'));
  const r = run(file);
  assert.match(r.stdout, /FALLA personaje-sin-sentido/);
});

// `doc` es el nombre del documento en el kit: el mismo dibujo que `file`, y la misma falta.
test('a doc drawn for a test result is a finding: the kit draws doc as file', () => {
  const file = join(dir, 'personaje-doc.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + HISTORIA_CON_PERSONAJE('doc', '108 positivos'));
  const r = run(file);
  assert.match(r.stdout, /FALLA personaje-sin-sentido/);
});

test('a person drawn for a server is a finding', () => {
  const file = join(dir, 'personaje-persona-servidor.md');
  writeFileSync(file, CUMPLE_SIN_HISTORIA + HISTORIA_CON_PERSONAJE('user', 'Servidor'));
  const r = run(file);
  assert.match(r.stdout, /FALLA personaje-sin-sentido/);
});

test('a person for a group of people, and a server for a server, are not findings', () => {
  const persona = join(dir, 'personaje-persona.md');
  writeFileSync(persona, CUMPLE_SIN_HISTORIA + HISTORIA_CON_PERSONAJE('user', '9 enfermos'));
  assert.match(run(persona).stdout, /ok\s+personaje-sin-sentido/);
  const servidor = join(dir, 'personaje-servidor-ok.md');
  writeFileSync(servidor, CUMPLE_SIN_HISTORIA + HISTORIA_CON_PERSONAJE('server', 'Servidor'));
  assert.match(run(servidor).stdout, /ok\s+personaje-sin-sentido/);
});

// El árbol de frecuencias también tiene personajes: un grupo de personas dibujado como servidor es el
// mismo hallazgo.
test('a frequency tree with a server for its group of people is a finding', () => {
  const file = join(dir, 'arbol-servidor.md');
  const arbol = `<lk-tree>\n<script type="application/json">\n{"nodes":[{"id":"a","lines":["personas"],"kind":"user"},{"id":"b","lines":["enfermos"],"kind":"server"},{"id":"c","lines":["sanos"],"kind":"user"}],"links":[{"from":"a","to":"b","count":10,"rate":"1 %"},{"from":"a","to":"c","count":990,"rate":"99 %"}]}\n</script>\n</lk-tree>`;
  writeFileSync(file, CUMPLE_SIN_HISTORIA + arbol);
  const r = run(file);
  assert.match(r.stdout, /FALLA personaje-sin-sentido/);
});

// La skill y los visuales nombran el árbol de frecuencias para los conteos: el modelo que lee
// la skill tiene que saber qué pieza es la de los conteos, y qué regla mide los personajes.
test('la skill y los visuales nombran el árbol de frecuencias y la regla del personaje', () => {
  const repo = join(TOOLS, '..');
  const skill = readFileSync(join(repo, 'skills', 'explicacion-interactiva', 'SKILL.md'), 'utf8');
  const visuales = readFileSync(join(repo, 'skills', 'explicacion-interactiva', 'references', 'visuales.md'), 'utf8');
  assert.match(skill, /<lk-tree>/, 'SKILL.md no nombra <lk-tree>');
  assert.match(visuales, /<lk-tree>/, 'visuales.md no nombra <lk-tree>');
  assert.match(visuales, /personaje-sin-sentido/, 'visuales.md no nombra la regla del personaje');
});
