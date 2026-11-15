// ¿Esta explicación cumple el estándar? Una respuesta, regla por regla.
//
// Las otras herramientas miden una cosa cada una: `scene-gate` la tipografía,
// `scene-lint` la convivencia de las piezas, `part-lint` el tamaño. Esto las
// orquesta y añade lo estructural que ninguna mira, para poder pasar una nota
// real de `content/` y saber qué falta antes de publicarla.
//
// Este archivo es el corredor (#269): lee la nota una vez (`explain-check/nota.mjs`)
// y pasa cada regla del registro (`explain-check/reglas.mjs`) por su archivo en
// `explain-check/rules/`. Añadir una regla es un archivo y una línea en el registro.
//
// Una regla de autoría (`authoringOnly`, #305) mide lo que el tutor escribe: su falla impide dar
// la parte por buena al escribirla, pero no impide servir una parte que ya se escribió. Por eso el
// JSON trae `serves`: true cuando pasan todas las demás reglas.
//
// Uso: node tools/explain-check.mjs <nota.md> [--max 450] [--json]
// Sale 1 si alguna regla falla.

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notaDeHtml } from './register/nota-html.mjs';
import { leerNota } from './explain-check/nota.mjs';
import { REGLAS } from './explain-check/reglas.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2];
const asJson = process.argv.includes('--json');
const maxWords = Number(process.argv.includes('--max') ? process.argv[process.argv.indexOf('--max') + 1] : 450);

if (!file) {
  console.error('uso: node tools/explain-check.mjs <nota.md> [--max 450] [--json]');
  process.exit(2);
}

// Una página HTML que escribió un turno se mide con las mismas reglas que su nota (#265): se traduce a la
// forma de nota, con sus figuras del kit intactas. La nota Markdown se lee tal cual.
const esPagina = /\.html?$/i.test(file);
const original = readFileSync(file, 'utf8');
const src = esPagina ? notaDeHtml(original) : original;
const nota = leerNota(src, esPagina, original);
const ctx = { file, maxWords, tools: TOOLS };

const rows = [];
for (const regla of REGLAS) {
  const salida = regla.check(nota, ctx);
  // Una regla devuelve su fila; el registro de medidas devuelve varias, cada una con su `rule`.
  // Las filas de una regla de autoría se marcan, y `serves` no las cuenta (#305).
  const autoria = regla.authoringOnly === true;
  if (Array.isArray(salida)) rows.push(...salida.map((r) => ({ ...r, authoringOnly: autoria })));
  else rows.push({ rule: regla.id, ok: salida.ok, detail: salida.detail, ...(salida.items ? { items: salida.items } : {}), authoringOnly: autoria });
}

const fallan = rows.filter((r) => !r.ok);
// Lo que el lector necesita para ver la parte: todas las reglas menos las de autoría (#305).
const serves = rows.every((r) => r.ok || r.authoringOnly);
if (asJson) console.log(JSON.stringify({ file, rows, ok: fallan.length === 0, serves }, null, 1));
else {
  for (const r of rows) {
    console.log(`${r.ok ? 'ok   ' : 'FALLA'} ${r.rule.padEnd(12)} ${r.detail}`);
    // Cada término o frase que falla va debajo de su regla, con la instrucción de reescritura.
    if (!r.ok) for (const item of r.items ?? []) console.log(`  · ${item.linea}`);
  }
  console.log(`\n${fallan.length ? `NO cumple: ${fallan.length} regla(s)` : 'cumple el estándar'} · ${file}`);
}
// `exitCode`, not `exit()`: a large report is still being written to a pipe, and exit() would cut it short.
process.exitCode = fallan.length ? 1 : 0;
