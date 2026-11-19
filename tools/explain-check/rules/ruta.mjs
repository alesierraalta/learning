import { HINTS } from '../hints.mjs';
import { usaFigurasDePaso } from '../nota.mjs';

// La separación entre el nombre del paso y la frase que dice qué se verá ahí:
// `—`, `–`, `:` o `-`. El guion se lee entre espacios para no partir una palabra,
// y los dos puntos por el espacio que los sigue, porque el español no los separa
// antes. Es el mismo patrón que `rutaSeparator` en `internal/engine/standard_ruta.go`.
const SEPARADOR = /(?:\s[—–]|[—–]|:\s|\s-\s)/;

// Las palabras que una línea de ruta escribe después del separador. Cero significa
// que la línea nombra el paso y no dice nada de lo que se verá ahí.
const palabrasDeDetalle = (linea) => {
  const cuerpo = linea.replace(/^\s*\d+[.)]/, '');
  const separador = cuerpo.match(SEPARADOR);
  if (!separador) return 0;
  const detalle = cuerpo.slice(separador.index + separador[0].length).trim();
  return detalle ? detalle.split(/\s+/).length : 0;
};

// La prelectura es la prosa que va del título a `## Ruta`: los párrafos que no son
// materia gris (frontmatter, cercas, títulos, tablas, elementos, viñetas ni líneas
// numeradas). Se copia la lectura de `rutaPreReading` del motor.
const parrafosDePrelectura = (src) => {
  let lineas = src.replace(/\r\n/g, '\n').split('\n');
  if (lineas[0]?.trim() === '---') {
    const cierre = lineas.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (cierre > 0) lineas = lineas.slice(cierre + 1);
  }
  const bloques = [];
  let actual = [];
  const cierra = () => {
    if (actual.length) bloques.push(actual.join(' '));
    actual = [];
  };
  let enCerca = false;
  for (const linea of lineas) {
    const limpia = linea.trim();
    if (/^##\s*Ruta\s*$/.test(limpia)) break;
    if (limpia.startsWith('```')) {
      enCerca = !enCerca;
      cierra();
      continue;
    }
    if (enCerca) continue;
    if (limpia === '' || /^#/.test(limpia) || /^\|/.test(limpia) ||
      /^</.test(limpia) || /^[-*] /.test(limpia) || /^\s*\d+[.)]/.test(limpia)) {
      cierra();
      continue;
    }
    actual.push(limpia);
  }
  cierra();
  return bloques;
};

// Una prelectura es un párrafo de dos o tres frases llanas, de 70 palabras como
// mucho. Se cuenta en frases, no en signos de puntuación, como el motor.
const tienePrelectura = (src) => parrafosDePrelectura(src).some((bloque) => {
  const frases = (bloque.match(/[.!?](?:\s|$)/g) || []).length;
  return frases >= 2 && frases <= 3 && bloque.split(/\s+/).filter(Boolean).length <= 70;
});

// 1. La ruta: el mapa de la parte, tres o cuatro líneas. En material nuevo cada línea
// dice qué se verá, y antes de la ruta va un resumen corto de lo que cubre la parte
// (S27). Una parte antigua, con figuras de legado, sigue pasando igual (S10).
export default {
  id: 'ruta',
  hint: HINTS['ruta'],
  check({ src, usaFigurasDePaso: figurasDePaso }) {
    const ruta = src.match(/^##\s*Ruta\s*$([\s\S]*?)(?=^##\s|\Z)/m);
    const lineasRuta = ruta
      ? ruta[1].split('\n').filter((l) => /^\s*\d+[.)]/.test(l))
      : [];
    if (!ruta || lineasRuta.length < 3 || lineasRuta.length > 4) {
      return { ok: false, detail: ruta ? `${lineasRuta.length} línea(s)` : 'no hay `## Ruta`' };
    }
    // Una parte antigua no estrena la prelectura ni las descripciones: su ruta se
    // queda con la forma que tenía cuando se publicó.
    if (!(figurasDePaso ?? usaFigurasDePaso(src))) {
      return { ok: true, detail: `${lineasRuta.length} línea(s)` };
    }
    const fallas = [];
    if (!tienePrelectura(src)) {
      fallas.push('falta la prelectura antes de `## Ruta`: escribe 2 o 3 frases llanas (70 palabras como máximo) '
        + 'con lo que cubre la parte, justo antes de la ruta');
    }
    for (const [i, linea] of lineasRuta.entries()) {
      if (palabrasDeDetalle(linea) < 6) {
        fallas.push(`línea ${i + 1} sin frase descriptiva: escribe «<paso> — <qué se verá ahí>» con un separador `
          + '(«—», «:» o «-») y 6 palabras o más después de él');
      }
    }
    return fallas.length
      ? { ok: false, detail: fallas.join('; ') }
      : { ok: true, detail: `${lineasRuta.length} línea(s)` };
  },
};
