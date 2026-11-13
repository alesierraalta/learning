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
const src = esPagina ? notaDeHtml(readFileSync(file, 'utf8')) : readFileSync(file, 'utf8');
const nota = leerNota(src, esPagina);
const ctx = { file, maxWords, tools: TOOLS };

const rows = [];
for (const regla of REGLAS) {
  const salida = regla.check(nota, ctx);
  // Una regla devuelve su fila; el registro de medidas devuelve varias, cada una con su `rule`.
  if (Array.isArray(salida)) rows.push(...salida);
  else rows.push({ rule: regla.id, ok: salida.ok, detail: salida.detail });
}

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
