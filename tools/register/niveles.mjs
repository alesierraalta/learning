// Los dos ejes del registro que el alumno elige: «qué tan simple» (sencillez) y «qué tan técnico»
// (tecnicidad). Cada nivel de cada eje es un umbral de las medidas de `hallazgos.mjs`.
//
// La tabla vive en `rules/deep.json` (thresholds.partStandard.register.levels): el motor (Go) y esta
// herramienta leen los mismos números, así que no hay una segunda copia que pueda desviarse. El defecto
// «más» en los dos ejes son los valores de la referencia (report.md §5 y §7).
//
// Sólo se mapean las medidas que se hacen cumplir. `boundWeighted` y `codeSpansPer100` están en §7,
// pero no separan la referencia de lo nuestro (§4), así que no son puerta y no tienen nivel.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NIVELES = ['menos', 'medio', 'más'];
export const NIVEL_DEFECTO = 'más';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEEP = join(HERE, '..', '..', 'rules', 'deep.json');

/**
 * La tabla de niveles: eje → medida → nivel → valor. Sin tabla no hay umbrales, así que falla aquí, con el
 * nombre del archivo, en vez de medir con números inventados.
 */
const TABLA = (() => {
  let doc;
  try {
    doc = JSON.parse(readFileSync(DEEP, 'utf8'));
  } catch (error) {
    throw new Error(`${DEEP}: no se puede leer la tabla de niveles (${error.message})`);
  }
  const levels = doc?.thresholds?.partStandard?.register?.levels;
  if (!levels) throw new Error(`${DEEP}: falta thresholds.partStandard.register.levels`);
  return levels;
})();

const nivelDe = (preferencias, eje) => {
  const aspecto = preferencias?.aspectos?.find?.((a) => a?.id === eje);
  return NIVELES.includes(aspecto?.nivel) ? aspecto.nivel : NIVEL_DEFECTO;
};

/** Los umbrales de cada medida para las preferencias del alumno; sin preferencias, el defecto. */
export function umbralesDe(preferencias) {
  const sencillez = nivelDe(preferencias, 'sencillez');
  const tecnicidad = nivelDe(preferencias, 'tecnicidad');
  const s = (clave) => TABLA.sencillez[clave][sencillez];
  const t = (clave) => TABLA.tecnicidad[clave][tecnicidad];
  return {
    frasesMedia: s('frasesMedia'),
    frasesP90: s('frasesP90'),
    contraste: s('contraste'),
    pasos: s('pasos'),
    racha: s('racha'),
    escenaAntes: s('escenaAntes'),
    explicado: t('explicado'),
    negritas: t('negritas'),
    niveles: { sencillez, tecnicidad },
  };
}
