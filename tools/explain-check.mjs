// ¿Esta explicación cumple el estándar? Una respuesta, regla por regla.
//
// Las otras herramientas miden una cosa cada una: `scene-gate` la tipografía,
// `scene-lint` la convivencia de las piezas, `part-lint` el tamaño. Esto las
// orquesta y añade lo estructural que ninguna mira, para poder pasar una nota
// real de `content/` y saber qué falta antes de publicarla.
//
// Uso: node tools/explain-check.mjs <nota.md> [--max 450] [--json]
// Sale 1 si alguna regla falla.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hallazgosDeRegistro } from './register/hallazgos.mjs';
import { umbralesDe } from './register/niveles.mjs';
import { preferenciasDe } from './register/preferencias.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
const asJson = process.argv.includes('--json');
const maxWords = Number(process.argv.includes('--max') ? process.argv[process.argv.indexOf('--max') + 1] : 450);

if (!file) {
  console.error('uso: node tools/explain-check.mjs <nota.md> [--max 450] [--json]');
  process.exit(2);
}

const src = readFileSync(file, 'utf8');
const rows = [];
const add = (rule, ok, detail) => rows.push({ rule, ok, detail });

// 1. La ruta: el mapa de la parte, tres o cuatro líneas.
const ruta = src.match(/^##\s*Ruta\s*$([\s\S]*?)(?=^##\s|\Z)/m);
const lineasRuta = ruta ? ruta[1].split('\n').filter((l) => /^\s*\d+[.)]/.test(l)).length : 0;
add('ruta', Boolean(ruta) && lineasRuta >= 3 && lineasRuta <= 4, ruta ? `${lineasRuta} línea(s)` : 'no hay `## Ruta`');

// 2. Cierre: el estándar prohíbe resumir al final.
const cierre = /(^|\n)#{1,6}\s*(Resumen para guardar|Apuntes comprimidos|En resumen)/i.test(src);
add('sin-resumen', !cierre, cierre ? 'cierra con un resumen, prohibido' : '');

// 3. Una parte es una idea: dos secciones de contenido como máximo, sin contar Ruta.
// La Ruta es el mapa y el mini-quiz es el quiz que el mismo estándar pide: no son
// secciones de contenido. El motor cuenta igual (`contentSections` en
// `internal/engine/standard.go`), para que su rechazo y esta medición coincidan.
const secciones = [...src.matchAll(/^##\s+(.+)$/gm)]
  .map((m) => m[1].trim())
  .filter((t) => !/^Ruta$/i.test(t) && !/mini-quiz/i.test(t));
add('secciones', secciones.length <= 2, `${secciones.length} sección(es) de contenido`);

// 4. Una escena y como mucho un recorrido. El motor (`explanation-standard`,
// `minScenes`) exige además que haya una escena y que su payload dibuje: eso
// necesita leer el JSON, y el rechazo del motor nombra el arreglo («dibuja el
// ejemplo con <lk-scene>»). Aquí se cuenta la presencia y el tope.
// Las piezas visuales (tarjetas, memoria, tablas, conjuntos, el explorador de un
// escenario) son figuras como la escena: ocupan su lugar en la parte y gastan su
// tope. El motor cuenta igual (`pieceOpenCount` en `internal/engine/pieces.go`).
const PIEZAS = 'cards|memory|tables|venn|explorer';
const piezas = (src.match(new RegExp(`<lk-(?:${PIEZAS})[\\s>]`, 'g')) || []).length;
const escenas = (src.match(/<lk-scene[\s>]/g) || []).length + piezas;
// Un recorrido de fórmula o de ejercicio (`<lk-story>`) es un recorrido más: la
// parte debe uno, y el motor los cuenta igual (`walkthroughOpen` + `storyOpen`).
const recorridos = (src.match(/<lk-(?:walkthrough|story)[\s>]/g) || []).length;
add('escena', escenas <= 1, `${escenas} escena(s)`);
add('recorrido', recorridos <= 1, `${recorridos} recorrido(s)`);

// 4b. El lenguaje de historia: la parte dibuja su recorrido con `<lk-story>` o con
// una pieza, nunca solo con el `<lk-walkthrough>` clásico, cuyas cajas y flechas
// libres se dibujan mal (#237). Una escena o un SVG no lo sustituyen. El motor
// aplica la misma regla (`storyLanguageFindings` en `internal/engine/standard.go`)
// y un test cruza los dos veredictos. El código en un bloque cercado es un ejemplo
// de marcado, no un dibujo: el motor lo ignora y aquí también.
const sinCodigo = src.replace(/```[\s\S]*?```/g, ' ');
const historias = (sinCodigo.match(/<lk-story[\s>]/g) || []).length;
const piezasDibujadas = (sinCodigo.match(new RegExp(`<lk-(?:${PIEZAS})[\\s>]`, 'g')) || []).length;
const lenguajeDeHistoria = historias + piezasDibujadas > 0;
add('historia', lenguajeDeHistoria, lenguajeDeHistoria ? '' :
  'no hay historia ni pieza · usa una historia por pasos <lk-story> o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>; un <lk-walkthrough> clásico no cuenta');

// 5. Mini-quiz: la parte se cierra con preguntas, no con un resumen.
const quiz = /lk-(quick-)?quiz|mini-quiz|##\s*Mini-quiz/i.test(src);
add('mini-quiz', quiz, quiz ? '' : 'no hay mini-quiz');

// Un flujo escrito con guiones es geometría escrita, no dibujada: `--->`, `---[`,
// `-->`, `==>`, `<--`. La regla de ASCII de la prosa y la de la cabecera usan el
// mismo patrón (#246).
const FLECHAS_DE_TEXTO = /-{2,}>|={2,}>|-{2,}\[|<-{2,}|<=+/;

// 6. ASCII dibujado: la geometría se dibuja, no se escribe.
// La geometría se dibuja, no se escribe: las cajas ASCII y las flechas de texto
// (`--->`, `---[`, `==>`) son la misma falta (#246). El código cercado es un
// ejemplo, no un dibujo, y no se mide.
const ascii = sinCodigo.split('\n').filter((l) => /[┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░]|─+[►▶▸]/.test(l) || FLECHAS_DE_TEXTO.test(l));
add('ascii', ascii.length === 0, ascii.length ? `${ascii.length} línea(s) dibujadas con caracteres` : '');

// 6b. El ritmo: frases cortas y un párrafo que no sea un muro. El estándar
// pide una idea por frase; una frase de 40 palabras no se lee, se atraviesa.
const lineasProsa = src
  .replace(/```[\s\S]*?```/g, '\n\n')
  .replace(new RegExp(`<lk-(scene|walkthrough|story|${PIEZAS}|quiz|quick-quiz)[\\s\\S]*?<\\/lk-\\1>`, 'g'), '\n\n')
  .split('\n')
  // Títulos, tablas y etiquetas no son prosa; las citas y las viñetas sí: una ficha
  // con tres frases dentro de `>` es un muro igual que un párrafo suelto.
  .filter((l) => !/^\s*(#{1,6}\s|\||<)/.test(l));
// Cada viñeta es su propia unidad: una lista es una idea por línea, no un párrafo.
// Las citas siguen agrupándose, para que tres frases dentro de `>` cuenten como muro.
const bloques = [];
let actual = [];
for (const linea of lineasProsa) {
  const esVineta = /^\s*(?:[-*]\s+|\d+[.)]\s+)/.test(linea);
  if (esVineta || linea.trim() === '') {
    if (actual.length) bloques.push(actual);
    actual = esVineta ? [linea] : [];
  } else actual.push(linea);
}
if (actual.length) bloques.push(actual);
const parrafos = bloques
  .map((b) => b.map((l) => l.replace(/^\s*(>\s?|[-*]\s+|\d+[.)]\s+)/, '')).join(' ').trim())
  .filter(Boolean);
const frases = parrafos
  .flatMap((b) => b.split(/(?<=[.!?])\s+/))
  .map((f) => f.trim())
  .filter((f) => f.length > 1);
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;
const largas = frases.filter((f) => palabras(f) > 18);
const media = frases.length ? Math.round(frases.reduce((a, f) => a + palabras(f), 0) / frases.length) : 0;
add('frases', largas.length === 0, `${largas.length} frase(s) de más de 18 palabras · media ${media}`);
const muros = parrafos.filter((b) => (b.match(/[.!?](\s|$)/g) || []).length > 2);
// El rechazo cita el primer muro: sin sus primeras palabras el tutor no sabe cuál
// de los párrafos partir. El motor cuenta igual (`wallParagraphs` en
// `internal/engine/standard.go`) y un test cruza las dos cuentas.
const abre = (b) => b.split(/\s+/).slice(0, 8).join(' ');
add('parrafos', muros.length === 0, `${muros.length} párrafo(s) con más de dos frases${muros.length ? ` · el primero abre «${abre(muros[0])}»` : ''}`);

// 7. Tamaño: la prosa que se lee, sin código, tablas ni figuras.
const prosa = src
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(new RegExp(`<lk-(scene|walkthrough|story|${PIEZAS})[\\s\\S]*?<\\/lk-\\1>`, 'g'), ' ')
  .replace(/^\|.*\|$/gm, ' ')
  .replace(/^#{1,6}\s.*$/gm, ' ')
  .replace(/<[^>]+>/g, ' ')
  .trim().split(/\s+/).filter(Boolean).length;
add('tamaño', prosa <= maxWords, `${prosa} palabra(s) de prosa (tope ${maxWords})`);

// 7b. La leyenda: una fórmula que no nombra sus símbolos no se entiende. Cada símbolo
// que aparece en una fórmula (latino de una letra o griega) se nombra en las líneas
// siguientes, en la forma `x` es ... o «x → ...». La fórmula también puede venir
// dibujada en una escena, símbolo por símbolo: los callouts de la escena son su
// leyenda, y el arreglo de una fórmula sin leyenda es esa escena, nunca <lk-math>.
const formulas = [...src.matchAll(/<lk-math[^>]*>([\s\S]*?)<\/lk-math>/g)].map((m) => m[1]);
// Una fórmula dibujada en una escena: los átomos de `scene.formulas` (y de
// `scene.formula`), un átomo por símbolo, en una escena quieta o en un paso del
// recorrido. El motor los lee igual (`sceneFormulaBodies`).
const dibujadas = [];
const atomos = (node, out) => {
  if (!node) return;
  for (const f of Array.isArray(node) ? node : [node]) {
    out.push((f?.atoms || []).map((a) => (typeof a === 'string' ? a : a?.t || '')).join(''));
  }
};
for (const block of src.matchAll(/<lk-(scene|walkthrough)[^>]*>([\s\S]*?)<\/lk-\1>/g)) {
  const payload = block[2].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!payload) continue;
  let spec;
  try { spec = JSON.parse(payload[1]); } catch { continue; }
  const walk = (scene) => {
    if (!scene) return;
    atomos(scene.formulas, dibujadas);
    atomos(scene.formula, dibujadas);
  };
  walk(spec.scene);
  for (const step of spec.steps || []) walk(step.scene);
}
// La fórmula también puede venir en LaTeX plano, `$$…$$` o `$…$`: se lee igual, y
// cuando aparece así el arreglo es el elemento del kit, `<lk-math>`. Un `$…$` con
// espacios y sin operadores es prosa con precios, no una fórmula.
const planas = [...src.matchAll(/\$\$([\s\S]+?)\$\$/g)].map((m) => m[1]).concat(
  [...src.replace(/\$\$[\s\S]+?\$\$/g, ' ').matchAll(/\$([^$\n]+?)\$/g)]
    .map((m) => m[1])
    .filter((t) => /[\\^_=]/.test(t) || !/\s/.test(t)),
);
// Una macro griega es un símbolo: son las variables de la fórmula, y se leen igual
// escritas como macro (`\sigma`) que literales (`σ`). Todo lo demás es un comando:
// da forma (`\frac`, `\left`, `\right`), opera (`\cdot`, `\sum`, `\int`) o nombra
// una función (`\exp`, `\log`, `\mathrm`, `\text`), y un comando no se define en la
// leyenda. `\pi` y `e` son constantes, no símbolos que la parte tenga que nombrar.
const GRIEGAS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'varpi', 'rho', 'varrho', 'sigma',
  'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'digamma',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);
const CONSTANTES = new Set(['pi', 'Pi', 'varpi']);
const LETRAS_CONSTANTES = new Set(['π', 'Π', 'ϖ']);
const simbolos = new Set();
for (const f of formulas.concat(dibujadas).concat(planas)) {
  for (const m of f.match(/\\[A-Za-z]+/g) || []) {
    const nombre = m.slice(1);
    if (GRIEGAS.has(nombre) && !CONSTANTES.has(nombre)) simbolos.add(m);
  }
  const limpio = f.replace(/\\[A-Za-z]+/g, ' ').replace(/\{[^}]*\}/g, ' ');
  // `e` como número de Euler (`e^{…}`) es una constante, no un símbolo.
  const sinEuler = limpio.replace(/(^|[^A-Za-z])e\s*\^/g, ' ');
  for (const w of sinEuler.match(/[A-Za-z]+/g) || []) if (w.length === 1) simbolos.add(w);
  // Una griega literal es un símbolo como cualquier otro, salvo las constantes.
  for (const g of sinEuler.match(/\p{Script=Greek}/gu) || []) if (!LETRAS_CONSTANTES.has(g)) simbolos.add(g);
}
const sinNombrar = [...simbolos].filter((s) => {
  // Un símbolo está nombrado si aparece entre comillas o seguido de = → : o "es".
  // El borde es Unicode: `\\b` es ASCII, así que «① γ: …» no nombraba a γ. Y la
  // letra es la misma: `Q` y `q` son símbolos distintos.
  const nombre = s.replace(/^\\/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = new RegExp('(\\x60|«|")\\s*\\\\?' + nombre + '\\s*(\\x60|»|")|(^|[^\\p{L}\\p{N}_])' + nombre + '\\s*(=|→|->|:|es\\b)', 'u');
  return !patron.test(src);
});
const sinFormula = formulas.length === 0 && dibujadas.length === 0 && planas.length === 0;
// El arreglo es la escena anotada: un callout por símbolo. <lk-math> dibuja una
// ecuación limpia y sin flechas, así que queda para una cuenta.
const arreglo = `dibuja la fórmula como escena anotada: un callout numerado por símbolo, con su nombre en su línea de labels («① ${sinNombrar[0]}: …»)`;
const cuenta = planas.length ? '; <lk-math> es para una cuenta, nunca para explicar una fórmula' : '';
add('leyenda', sinNombrar.length === 0, sinFormula ? 'sin fórmulas' : sinNombrar.length ? `símbolo(s) sin nombrar: ${sinNombrar.join(', ')} · ${arreglo}${cuenta}` : '');

// 7c. La primera fórmula de la parte se enseña con un recorrido de fórmula: paso
// 1 la fórmula entera, un paso por símbolo con qué es, para qué se usa y cuánto
// vale en el ejemplo, y el último con los números sustituidos y su resultado. Un
// `<lk-math>` suelto o una escena quieta no sustituyen al recorrido. El motor
// aplica la misma regla (`formulaWalkthrough` en `internal/engine/standard.go`)
// y un test cruza los dos veredictos.
const nodeHasFormula = (node) => Boolean(node) && (
  (Array.isArray(node.formulas) && node.formulas.some((f) => (f?.atoms || []).length > 0)) ||
  (node.formula && (node.formula.atoms || []).length > 0));
const stepHasFormula = (step) => nodeHasFormula(step?.scene) || nodeHasFormula(step?.stage?.scene) ||
  (step?.equation?.atoms || []).length > 0 || (step?.header?.atoms || []).length > 0;
const primeraFormula = (() => {
  const plain = src.replace(/```[\s\S]*?```/g, ' ');
  const spots = [];
  for (const m of plain.matchAll(/<lk-math[^>]*>[\s\S]*?<\/lk-math>/g)) spots.push(m.index);
  for (const m of plain.matchAll(/\$\$[\s\S]+?\$\$/g)) spots.push(m.index);
  const rest = plain.replace(/\$\$[\s\S]+?\$\$/g, ' ');
  for (const m of rest.matchAll(/\$([^$\n]+?)\$/g)) {
    const body = m[1];
    if (!/[\\^_=]/.test(body) && /\s/.test(body)) continue;
    spots.push(m.index);
  }
  const ranges = [];
  for (const m of plain.matchAll(/<lk-(scene|walkthrough|story)[^>]*>[\s\S]*?<\/lk-\1>/g)) {
    const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) continue;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { continue; }
    const has = nodeHasFormula(spec.scene) || (spec.formula?.atoms || []).length > 0 || (spec.steps || []).some(stepHasFormula);
    if (!has) continue;
    spots.push(m.index);
    if (spec.kind === 'formula' || spec.kind === 'derivation') ranges.push([m.index, m.index + m[0].length]);
  }
  if (!spots.length) return null;
  spots.sort((a, b) => a - b);
  const first = spots[0];
  return ranges.some(([a, b]) => first >= a && first < b) ? null : first;
})();
add('formula-walkthrough', primeraFormula === null, primeraFormula === null ? '' : 'la primera fórmula no tiene recorrido de fórmula · dibújala con <lk-story kind="formula">: paso 1 la fórmula entera, un paso por símbolo con qué es, para qué se usa y cuánto vale en el ejemplo, y el último con los números sustituidos y su resultado');

// 7d. La historia se lee, no solo existe (#243): la parte que enseña código o una
// fórmula pone esa línea en la cabecera del recorrido, y sus pasos dibujan la
// acción. Las dos se leen del JSON, sin navegador, y el motor aplica las mismas
// reglas (`storyHeaderFindings` y `storyStageFindings` en
// `internal/engine/standard.go`); un test cruza los dos veredictos.
const historiasSpecs = [];
for (const m of sinCodigo.matchAll(/<lk-story[^>]*>[\s\S]*?<\/lk-story>/g)) {
  const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!payload) continue;
  try { historiasSpecs.push(JSON.parse(payload[1])); } catch {}
}
// La parte muestra código o una fórmula: un bloque cercado, una fórmula dibujada,
// `<lk-math>` o LaTeX plano. Es lo que la cabecera del recorrido tiene que llevar.
const muestraCodigoOFormula = /```[\s\S]*?```/.test(src) || formulas.length + dibujadas.length + planas.length > 0;
// La línea de la cabecera: el `equation` del paso en un recorrido de derivación, la
// `formula` del recorrido entero en uno de fórmula. Es lo que `kit.js` dibuja.
const cabeceraDe = (spec, step) => ((spec.kind === 'derivation' ? step?.equation?.atoms : spec?.formula?.atoms) || []);
const sinCabecera = muestraCodigoOFormula
  ? historiasSpecs.filter((spec) => (spec.steps || []).some((step) => cabeceraDe(spec, step).length === 0))
  : [];
add('historia-cabecera', sinCabecera.length === 0, sinCabecera.length
  ? 'la historia no lleva en su cabecera la línea de código o la fórmula que la parte enseña · ponla con `equation.atoms` en cada paso (o `formula.atoms` para el recorrido entero) y resalta el token del paso en `focus`'
  : '');
// El vocabulario que dibuja una acción: lo que el paso tiene que traer. Una caja
// con su texto no es una acción, y un recorrido de cajas no enseña nada.
const VOCABULARIO = ['actors', 'props', 'moves', 'tags', 'icons', 'callouts', 'curves', 'paths', 'formulas', 'formula', 'grids', 'sheets', 'bars', 'stats', 'nodes', 'badges', 'dashed', 'policy', 'arrows'];
const PIEZAS_DIBUJADAS = ['cards', 'memory', 'tables', 'venn'];
const declara = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);
const pasoDibujaAccion = (step) => {
  const stage = step?.stage || {};
  if (PIEZAS_DIBUJADAS.some((k) => declara(stage[k]))) return true;
  const scene = stage.scene || stage;
  return VOCABULARIO.some((k) => declara(scene[k]));
};
const soloCajas = historiasSpecs.filter((spec) => (spec.steps || []).length > 0 && (spec.steps || []).every((step) => !pasoDibujaAccion(step)));

// 7e. El personaje (#245): un actor es un personaje con su dibujo, no un
// rectángulo con su nombre. El kit dibuja diez personajes con `kind` —el cilindro
// de la base de datos, la fila, la sesión, el candado, el usuario, el servidor, el
// proceso, el archivo, el paquete y el robot— y una historia cuyos actores son
// todos cajas, cuando el nombre de alguno nombra un personaje, es un hallazgo. Se
// lee del JSON, sin navegador, y el motor aplica la misma regla
// (`actorCharacterFindings` en `internal/engine/standard.go`).
const PERSONAJES = [
  ['database', /base de datos|\bbd\b|\bdisco\b|\bbase\b/i],
  ['row', /\bfila\b|\bregistro\b|\bcuenta\b|\btupla\b/i],
  ['session', /\bsesi[oó]n\b|\bconexi[oó]n\b/i],
  ['lock', /\bbloqueo\b|\bcerrojo\b|\btransacci[oó]n\b/i],
  ['user', /\busuario\b|\bpersona\b|\bcliente\b|\balumno\b/i],
  ['server', /\bservidor\b|\bhost\b/i],
  ['process', /\bproceso\b|\bprograma\b|\bbloque\b|\bscript\b/i],
  ['file', /\barchivo\b|\bdocumento\b|\bficha\b/i],
  ['packet', /\bpaquete\b|\btrama\b|\bpacket\b|\bpetici[oó]n\b|\bmensaje\b/i],
  ['robot', /\brobot\b|\bagente\b/i],
];
const PERSONAJES_DIBUJABLES = PERSONAJES.map(([kind]) => kind).join(', ');
const actoresDe = (spec) => (spec.steps || []).flatMap((step) => {
  const stage = step?.stage || {};
  const scene = stage.scene || stage;
  return (scene.actors || []).map((a) => ({ ...a, step: step?.title || '' }));
});
const personajeDe = (label) => PERSONAJES.find(([, re]) => re.test(String(label || '')))?.[0];
const dibujaPersonaje = (a) => Boolean(a.kind || a.icon);
const sinPersonaje = historiasSpecs
  .map((spec) => {
    const actores = actoresDe(spec);
    if (!actores.length || actores.some(dibujaPersonaje)) return null;
    const encajan = actores.map((a) => ({ label: a.label, kind: personajeDe(a.label) })).filter((x) => x.kind);
    return encajan.length ? { spec, encajan } : null;
  })
  .filter(Boolean);
add('actor-sin-personaje', sinPersonaje.length === 0, sinPersonaje.length
  ? `los actores de «${sinPersonaje[0].spec.title || 'la historia'}» son cajas con su nombre — «${sinPersonaje[0].encajan[0].label}» es un ${sinPersonaje[0].encajan[0].kind}: dibújalo con \`kind\` («${sinPersonaje[0].encajan[0].kind}») y su nombre en \`tag\`; los personajes son ${PERSONAJES_DIBUJABLES}`
  : '');

// 7f. La escena quieta se mide con el mismo rasero que el escenario del recorrido
// (#245): una `<lk-scene>` que solo dibuja cajas con su texto y flechas es «dos
// cajas y una flecha», el defecto que el alumno rechazó. Una pieza, un personaje,
// un icono, una curva, una fórmula o un callout la salvan; el motor aplica la
// misma regla (`sceneStageFindings`).
const DIBUJO_DE_ESCENA = ['actors', 'props', 'icons', 'nodes', 'grids', 'sheets', 'bars', 'stats',
  'formulas', 'formula', 'curves', 'paths', 'dashed', 'badges', 'callouts', 'policy', 'tags'];
const escenasSpecs = [];
for (const m of sinCodigo.matchAll(/<lk-scene[^>]*>[\s\S]*?<\/lk-scene>/g)) {
  const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!payload) continue;
  try { escenasSpecs.push(JSON.parse(payload[1])); } catch {}
}
const escenasDeCajas = escenasSpecs.filter((spec) => {
  const scene = spec.scene || {};
  if (DIBUJO_DE_ESCENA.some((k) => declara(scene[k]))) return false;
  return declara(scene.boxes) || declara(scene.arrows);
});
add('escenario-de-cajas', soloCajas.length === 0 && escenasDeCajas.length === 0,
  [
    soloCajas.length
      ? `todos los pasos de la historia dibujan solo cajas con texto · dibuja la acción: ${VOCABULARIO.filter((k) => k !== 'arrows').join(', ')}; o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>`
      : '',
    escenasDeCajas.length
      ? `la escena quieta «${escenasDeCajas[0].title || 'sin título'}» solo dibuja cajas con su texto y flechas · dibuja el personaje (<lk-scene> con \`actors\` y \`kind\`) o usa la pieza que le toca: <lk-memory>, <lk-tables>, <lk-venn>, <lk-cards>`
      : '',
  ].filter(Boolean).join(' · '));

// 7g. La pieza que le toca a la idea (#245). Dos casos medibles: el código que
// cambia filas guardadas (INSERT/UPDATE/DELETE/JOIN) se cuenta con `lk-tables` o
// `lk-memory`, y el contraste entre el código que compila y el que falla se cuenta
// con `lk-cards`. La tabla de decisión vive en la skill; aquí se mide lo que se
// puede medir sin juicio.
const bloquesCodigo = [...src.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const codigo = bloquesCodigo.join('\n');
const cambiaFilas = /\b(INSERT|UPDATE|DELETE|JOIN)\b/i.test(codigo);
const traeTablasOMemoria = /<lk-(tables|memory)[\s>]/.test(sinCodigo);
const contrastaCodigo = bloquesCodigo.length >= 2 &&
  /no compila|error de compilaci[oó]n|compile error|does not compile|no compile|falla al compilar|panic:/i.test(src);
const traeTarjetas = /<lk-cards[\s>]/.test(sinCodigo);
const piezasQueFaltan = [
  cambiaFilas && !traeTablasOMemoria
    ? 'el código cambia filas guardadas (INSERT/UPDATE/DELETE/JOIN) · cuéntalo con <lk-tables> (filas y relaciones) o <lk-memory> (estado en memoria o en disco a lo largo del tiempo)'
    : '',
  contrastaCodigo && !traeTarjetas
    ? 'la parte contrasta el código que compila con el que falla · dibújalo con <lk-cards> (la regla frente a la violación, con su código)'
    : '',
].filter(Boolean);
add('pieza-adecuada', piezasQueFaltan.length === 0, piezasQueFaltan.join(' · '));

// 7h. Lo que midió el banco (#246). Tres defectos que ninguna puerta medía y que
// las cinco partes del banco repitieron: el recorrido que no mueve nada, la
// cabecera escrita como esquema de flechas y las claves que el esquema no lee.
// Las tres se leen del JSON, sin navegador, y el motor las aplica con claves
// aditivas (`storyMotion`, `arrowFlows`, `deadKeys`).

// (a) El recorrido se mueve: una historia de derivación cuyos pasos no mueven
// nada —ni un `moves`, ni un cambio de estado, ni una pieza que cambie, ni un
// puntero— es la misma foto tres veces. Una historia de fórmula no entra: su
// avance es el token resaltado de la cabecera.
// La historia se mueve si algo cambia en cualquier paso: un movimiento, un actor
// que en algún paso está en otro estado, una pieza que en algún paso está en
// otro estado, o un puntero que cambia. Un actor que aparece o una pieza que se
// reemplaza no cuentan: eso es la foto, no la acción.
const senalesDeLaHistoria = (steps) => {
  const cambios = new Map();
  const anota = (key, value) => {
    if (!cambios.has(key)) cambios.set(key, new Set());
    cambios.get(key).add(value);
  };
  const piezas = [], punteros = [];
  let moves = 0;
  for (const step of steps) {
    const stage = step?.stage || {};
    const scene = stage.scene || stage;
    moves += (scene.moves || []).length;
    for (const a of scene.actors || []) anota(`actor:${a.id}`, a.state || 'active');
    for (const p of scene.props || []) anota(`prop:${p.id}`, `${p.label || ''}|${p.state || ''}|${p.tone || ''}`);
    const piece = ['cards', 'memory', 'tables', 'venn'].map((k) => stage[k]).find(Boolean);
    piezas.push(piece ? JSON.stringify(piece) : '');
    punteros.push([...JSON.stringify(stage).matchAll(/"points"\s*:\s*"([^"]*)"/g)].map((m) => m[1]).join('|'));
  }
  const cambiaEstado = [...cambios.values()].some((set) => set.size > 1);
  const cambiaPieza = piezas.some((p, i) => i > 0 && p !== piezas[i - 1]);
  const cambiaPuntero = punteros.some((p, i) => i > 0 && p !== punteros[i - 1]);
  return moves > 0 || cambiaEstado || cambiaPieza || cambiaPuntero;
};
const historiasQuietas = historiasSpecs.filter((spec) => {
  const steps = spec.steps || [];
  if ((spec.kind || '') !== 'derivation' || steps.length < 2) return false;
  return !senalesDeLaHistoria(steps);
});
add('historia-quieta', historiasQuietas.length === 0, historiasQuietas.length
  ? `la historia «${historiasQuietas[0].title || 'sin título'}» no mueve nada en ${historiasQuietas[0].steps.length} paso(s): ni un movimiento (\`moves\`), ni un cambio de estado de sus actores, ni una pieza que cambie · dibuja la acción paso a paso, no la misma foto repetida`
  : '');

// (b) La cabecera es la línea de código o la fórmula, nunca un esquema de flechas.
const conFlechas = [];
for (const spec of historiasSpecs) {
  const atoms = (spec.kind === 'derivation'
    ? (spec.steps || []).flatMap((step) => step?.equation?.atoms || [])
    : (spec.formula?.atoms || []));
  for (const atom of atoms) {
    const text = typeof atom === 'string' ? atom : atom?.t || '';
    if (FLECHAS_DE_TEXTO.test(text)) { conFlechas.push({ where: 'la cabecera de la historia', text: text.trim() }); break; }
  }
}
for (const spec of escenasSpecs) {
  const scene = spec.scene || {};
  for (const label of [...(scene.labels || []), ...(scene.boxes || [])]) {
    const text = label?.text || label?.label || '';
    if (FLECHAS_DE_TEXTO.test(text)) { conFlechas.push({ where: 'una etiqueta de la escena', text: text.trim() }); break; }
  }
}
add('cabecera-con-flechas', conFlechas.length === 0, conFlechas.length
  ? `${conFlechas[0].where} es un esquema en texto («${conFlechas[0].text}»): la cabecera lleva la línea de código o la fórmula, y el flujo se dibuja con actores y movimientos, nunca con \`--->\` o \`---[\``
  : '');

// (c) Las claves que el esquema no lee: un paso con `scene` al lado de `stage`
// declara un dibujo que nadie dibuja. El escenario vive en `stage` y su dibujo en
// `stage.scene`; lo demás es dato muerto que enseña mal el esquema al tutor.
const CLAVES_DEL_PASO = new Set(['title', 'narrator', 'equation', 'focus', 'stage', 'say', 'header']);
const CLAVES_DEL_ESCENARIO = new Set(['scene', 'cards', 'memory', 'tables', 'venn', 'caption']);
const CLAVES_DE_LA_ESCENA = new Set(['actors', 'props', 'moves', 'tags', 'marks', 'icons', 'callouts',
  'curves', 'paths', 'formulas', 'formula', 'grids', 'sheets', 'gears', 'boxes', 'arrows', 'nodes',
  'bars', 'stats', 'policy', 'badges', 'dashed', 'labels', 'title', 'aria', 'caption']);
const clavesMuertas = [];
for (const spec of historiasSpecs) {
  for (const [i, step] of (spec.steps || []).entries()) {
    for (const key of Object.keys(step || {})) if (!CLAVES_DEL_PASO.has(key)) clavesMuertas.push({ step: i + 1, path: key });
    const stage = step?.stage || {};
    for (const key of Object.keys(stage)) if (!CLAVES_DEL_ESCENARIO.has(key)) clavesMuertas.push({ step: i + 1, path: `stage.${key}` });
    const scene = stage.scene || {};
    for (const key of Object.keys(scene)) if (!CLAVES_DE_LA_ESCENA.has(key)) clavesMuertas.push({ step: i + 1, path: `stage.scene.${key}` });
  }
}
add('clave-muerta', clavesMuertas.length === 0, clavesMuertas.length
  ? `el paso ${clavesMuertas[0].step} lleva \`${clavesMuertas[0].path}\`, que el esquema no lee · el escenario vive en \`stage\` y su dibujo en \`stage.scene\`; las claves del paso son ${[...CLAVES_DEL_PASO].join(', ')}`
  : '');

// 9. El registro: seis reglas que separan la referencia de lo nuestro (`tools/register/`). Cada una
// mide con el umbral del nivel que el alumno eligió en sus preferencias; sin preferencias, «más» en
// los dos ejes, que son los valores de la referencia. Un hallazgo cita la frase y dice cómo reescribirla.
rows.push(...hallazgosDeRegistro(src, umbralesDe(preferenciasDe(file))));

// 8. Las figuras conviven: se delega en scene-lint, que abre un navegador.
let figuras = { ok: true, detail: 'sin figuras' };
if (escenas || recorridos) {  // `escenas` ya incluye las piezas
  const r = spawnSync(process.execPath, [join(TOOLS, 'scene-lint.mjs'), file], { encoding: 'utf8' });
  if (/playwright no está disponible/.test(r.stderr + r.stdout)) figuras = { ok: true, detail: 'sin navegador: no se pudo medir' };
  else if (r.status === 0) figuras = { ok: true, detail: '' };
  else {
    const hits = (r.stdout.match(/^ {2}[a-z-]+:/gm) || []).length;
    figuras = { ok: false, detail: `${hits} hallazgo(s) de convivencia` };
  }
}
add('figuras', figuras.ok, figuras.detail);

const fallan = rows.filter((r) => !r.ok);
if (asJson) console.log(JSON.stringify({ file, rows, ok: fallan.length === 0 }, null, 1));
else {
  for (const r of rows) {
    console.log(`${r.ok ? 'ok   ' : 'FALLA'} ${r.rule.padEnd(12)} ${r.detail}`);
    // Cada término o frase que falla va debajo de su regla, con la instrucción de reescritura.
    if (!r.ok) for (const item of r.items ?? []) console.log(`  · ${item.linea}`);
  }
  console.log(`\n${fallan.length ? `NO cumple: ${fallan.length} regla(s)` : 'cumple el estándar'} · ${file}`);
}
process.exit(fallan.length ? 1 : 0);
