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
const secciones = [...src.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()).filter((t) => !/^Ruta$/i.test(t));
add('secciones', secciones.length <= 2, `${secciones.length} sección(es) de contenido`);

// 4. Una escena y como mucho un recorrido.
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
const parrafos = lineasProsa
  .join('\n')
  .split(/\n\s*\n/)
  .map((b) => b.split('\n').map((l) => l.replace(/^\s*(>\s?|[-*]\s+|\d+[.)]\s+)/, '')).join(' ').trim())
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
add('parrafos', muros.length === 0, `${muros.length} párrafo(s) con más de dos frases`);

// 7. Tamaño: la prosa que se lee, sin código, tablas ni figuras.
const prosa = src
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/<lk-(scene|walkthrough)[\s\S]*?<\/lk-\1>/g, ' ')
  .replace(/^\|.*\|$/gm, ' ')
  .replace(/^#{1,6}\s.*$/gm, ' ')
  .replace(/<[^>]+>/g, ' ')
  .trim().split(/\s+/).filter(Boolean).length;
add('tamaño', prosa <= maxWords, `${prosa} palabra(s) de prosa (tope ${maxWords})`);

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
