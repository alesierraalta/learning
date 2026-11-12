// El tope de una parte, medido.
//
// Una parte que no cabe en la cabeza no se puede contar con palabras propias. El
// estándar fija 450 palabras de prosa: se cuentan aquí, sin código, sin tablas y
// sin bloques visuales, porque eso no se lee como prosa.
//
// Uso: node tools/part-lint.mjs <parte.md | carpeta> [--max 450]
// Sale 1 si alguna parte pasa del tope.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX = Number(process.argv.includes('--max') ? process.argv[process.argv.indexOf('--max') + 1] : 450);
const target = process.argv[2];
if (!target) {
  console.error('uso: node tools/part-lint.mjs <parte.md | carpeta> [--max 450]');
  process.exit(2);
}

const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((f) => f.endsWith('.md')).map((f) => join(target, f))
  : [target];

function prose(file) {
  let out = readFileSync(file, 'utf8');
  out = out.replace(/```[\s\S]*?```/g, ' ');              // código y bloques text
  // Las figuras del kit: la escena, el recorrido clásico, el de fórmula o ejercicio
  // y las piezas visuales (tarjetas, memoria, tablas, conjuntos, explorador). El
  // motor las quita igual (`withoutPieces` y `proseStory`), para que su rechazo y
  // esta medición coincidan.
  out = out.replace(/<lk-(scene|walkthrough|story|cards|memory|tables|venn|explorer)[\s\S]*?<\/lk-\1>/g, ' '); // figuras
  out = out.replace(/^\|.*\|$/gm, ' ');                    // tablas
  out = out.replace(/^#{1,6}\s.*$/gm, ' ');                // títulos
  out = out.replace(/<[^>]+>/g, ' ');                      // etiquetas sueltas
  return out.trim().split(/\s+/).filter(Boolean).length;
}

let bad = 0;
for (const file of files) {
  const n = prose(file);
  const ok = n <= MAX;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'PASA'} ${String(n).padStart(4)} palabras (tope ${MAX}) · ${file}`);
}
process.exit(bad ? 1 : 0);
