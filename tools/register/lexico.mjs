// Regenera `lexico-comun.txt`: las raíces del español corriente.
//
// La medida principal —«¿este término se explica?»— necesita saber qué palabra es
// español corriente y qué palabra es jerga. Eso se decide por frecuencia: una
// palabra que aparece entre las más usadas del idioma no es un término técnico.
//
// Uso:
//   node tools/register/lexico.mjs --desde es_50k.txt [--top 50000]
//
// `es_50k.txt` es la lista de frecuencias OpenSubtitles 2018 en español de
// github.com/hermitdave/FrequencyWords (content/2018/es/es_50k.txt), una línea
// por forma: «palabra frecuencia». El archivo resultante se versiona para que la
// medida no dependa de la red.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stem } from './measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'lexico-comun.txt');

const args = process.argv.slice(2);
const fromAt = args.indexOf('--desde');
const topAt = args.indexOf('--top');

if (fromAt < 0) {
  console.error('uso: node tools/register/lexico.mjs --desde es_50k.txt [--top 50000]');
  process.exit(2);
}

const source = args[fromAt + 1];
const top = topAt >= 0 ? Number(args[topAt + 1]) : 50000;

const forms = readFileSync(source, 'utf8')
  .split('\n')
  .map((line) => line.trim().split(/\s+/)[0])
  .filter(Boolean)
  .slice(0, top);

const roots = [...new Set(forms.map(stem).filter(Boolean))].sort();

const header = `# Léxico común del español: raíces que NO son término técnico.
#
# Fuente: lista de frecuencias OpenSubtitles 2018 (es), las ${top} formas más
# frecuentes (github.com/hermitdave/FrequencyWords, content/2018/es/es_50k.txt),
# reducidas con el stemmer de tools/register/measure.mjs: una raíz por línea,
# sin acentos. Regenerar: node tools/register/lexico.mjs --desde es_50k.txt
#
# Una palabra cuya raíz está aquí es español corriente. Lo que no está —y todo
# lo que va en \`código\`— es término técnico y debe explicarse donde aparece.
`;

writeFileSync(OUT, `${header}\n${roots.join('\n')}\n`, 'utf8');
console.log(`${roots.length} raíces desde ${forms.length} formas → ${OUT}`);
