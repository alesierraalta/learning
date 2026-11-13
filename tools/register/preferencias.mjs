// Las preferencias del alumno para el checador y el motor: `niveles-alumno.json` de la raíz de Learnings.
// El estudio guarda las preferencias en su base (`learning.db`) y mantiene este archivo igual, para que
// el motor (Go) y las herramientas (JS) lean la misma copia. Se busca desde la nota hacia arriba, como
// mucho cuatro carpetas: `<raíz>/<tema>/explicaciones/<nota>.md` está a dos, y `<raíz>/_archivo/<tema>/…`
// a tres. Una carpeta con `learning.db` es la raíz aunque no tenga el archivo: entonces mandan los defectos.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const PREFERENCIAS = 'niveles-alumno.json';
/** Hasta cuántas carpetas por encima de la nota puede estar la raíz (igual que el motor). */
export const PROFUNDIDAD_RAIZ = 4;

/** Las preferencias de la raíz de Learnings de esta nota, o null: entonces mandan los defectos. */
export function preferenciasDe(file) {
  let dir = dirname(resolve(file));
  for (let depth = 0; depth < PROFUNDIDAD_RAIZ; depth++) {
    const copia = join(dir, PREFERENCIAS);
    if (existsSync(copia)) return leer(copia);
    if (existsSync(join(dir, 'learning.db'))) return null;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

// Un archivo ilegible no detiene el checador: la nota se mide con los defectos.
function leer(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
