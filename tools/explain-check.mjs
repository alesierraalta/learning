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
const escenas = (src.match(/<lk-scene[\s>]/g) || []).length;
const recorridos = (src.match(/<lk-walkthrough[\s>]/g) || []).length;
add('escena', escenas <= 1, `${escenas} escena(s)`);
add('recorrido', recorridos <= 1, `${recorridos} recorrido(s)`);

// 5. Mini-quiz: la parte se cierra con preguntas, no con un resumen.
const quiz = /lk-(quick-)?quiz|mini-quiz|##\s*Mini-quiz/i.test(src);
add('mini-quiz', quiz, quiz ? '' : 'no hay mini-quiz');

// 6. ASCII dibujado: la geometría se dibuja, no se escribe.
const ascii = src.split('\n').filter((l) => /[┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░]|─+[►▶▸]/.test(l));
add('ascii', ascii.length === 0, ascii.length ? `${ascii.length} línea(s) dibujadas con caracteres` : '');

// 6b. El ritmo: frases cortas y un párrafo que no sea un muro. El estándar
// pide una idea por frase; una frase de 40 palabras no se lee, se atraviesa.
const lineasProsa = src
  .replace(/```[\s\S]*?```/g, '\n\n')
  .replace(/<lk-(scene|walkthrough|quiz|quick-quiz)[\s\S]*?<\/lk-\1>/g, '\n\n')
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
  .replace(/<lk-(scene|walkthrough)[\s\S]*?<\/lk-\1>/g, ' ')
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

// 8. Las figuras conviven: se delega en scene-lint, que abre un navegador.
let figuras = { ok: true, detail: 'sin figuras' };
if (escenas || recorridos) {
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
  for (const r of rows) console.log(`${r.ok ? 'ok   ' : 'FALLA'} ${r.rule.padEnd(12)} ${r.detail}`);
  console.log(`\n${fallan.length ? `NO cumple: ${fallan.length} regla(s)` : 'cumple el estándar'} · ${file}`);
}
process.exit(fallan.length ? 1 : 0);
