import { HINTS } from '../hints.mjs';
import { usaFigurasDePaso } from '../nota.mjs';

// La separación entre el nombre del paso y la frase que dice qué se verá ahí:
// `—`, `–`, `:` o `-`. El guion se lee entre espacios para no partir una palabra,
// y los dos puntos por el espacio que los sigue, porque el español no los separa
// antes. Es el mismo patrón que `rutaSeparator` en `internal/engine/standard_ruta.go`.
const SEPARADOR = /(?:\s[—–]|[—–]|:\s|\s-\s)/;

// La prelectura es una introducción en palabras llanas, no un resumen de dos líneas
// (S28, que releva los topes de S27): de cuatro a seis frases, unas 60 a 160 palabras. La
// nota pone dos frases por párrafo, así que seis frases caben en hasta tres párrafos
// cortos. Y cada línea de la ruta dice de qué va el paso en una frase de diez palabras o más.
const MIN_FRASES = 4;
const MAX_FRASES = 6;
const MIN_PALABRAS = 60;
const MAX_PALABRAS = 160;
const MAX_PARRAFOS = 3;
const MIN_DETALLE = 10;

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

const frasesDe = (bloque) => (bloque.match(/[.!?](?:\s|$)/g) || []).length;
const palabrasDe = (bloque) => bloque.split(/\s+/).filter(Boolean).length;

// La prelectura como introducción: hasta tres párrafos cortos que suman cuatro a seis
// frases y unas 60 a 160 palabras. Devuelve el fallo que nombra lo que falta, o '' si está.
const falloDePrelectura = (src) => {
  const bloques = parrafosDePrelectura(src);
  if (!bloques.length) {
    return 'falta la prelectura antes de `## Ruta`: escribe una introducción en palabras llanas de 4 a 6 frases '
      + '(unas 60 a 160 palabras, en párrafos cortos de dos frases) con lo que cubre la parte y por qué importa, '
      + 'justo antes de la ruta';
  }
  let mejorFrases = 0;
  let mejorPalabras = 0;
  for (let inicio = 0; inicio < bloques.length; inicio++) {
    for (let largo = 1; largo <= MAX_PARRAFOS && inicio + largo <= bloques.length; largo++) {
      const bloque = bloques.slice(inicio, inicio + largo).join(' ');
      const frases = frasesDe(bloque);
      const palabras = palabrasDe(bloque);
      if (frases >= MIN_FRASES && frases <= MAX_FRASES &&
        palabras >= MIN_PALABRAS && palabras <= MAX_PALABRAS) {
        return '';
      }
      if (frases > mejorFrases) {
        mejorFrases = frases;
        mejorPalabras = palabras;
      }
    }
  }
  return `la prelectura antes de \`## Ruta\` tiene ${mejorFrases} frase(s) y ${mejorPalabras} palabra(s) — `
    + 'la introducción es de 4 a 6 frases, unas 60 a 160 palabras, en párrafos cortos de dos frases: '
    + 'la idea general y por qué importa, en palabras que el lector ya entiende';
};

// Los términos que la parte explica después: las etiquetas en negrita usadas como
// definición («**Término**: es …» o «**Término** es …») y cualquier `<dfn>`, leídas
// después de `## Ruta`, porque la prelectura y la ruta van antes de la explicación.
const VERBO_DEFINIDOR = /^(es|son|significa|significan|se llama|se trata de)\b/i;
const ETIQUETA = /^\*\*([^*]+)\*\*\s*:?\s*(.*)$/;
const DFN = /<dfn>([^<]+)<\/dfn>/g;

const terminosDefinidos = (src) => {
  const lineas = src.replace(/\r\n/g, '\n').split('\n');
  let inicio = 0;
  const ruta = lineas.findIndex((l) => /^##\s*Ruta\s*$/.test(l.trim()));
  if (ruta >= 0) inicio = ruta + 1;
  const vistos = new Set();
  const terminos = [];
  const agrega = (termino) => {
    const limpio = termino.trim();
    const clave = plano(limpio);
    if (!clave || vistos.has(clave)) return;
    vistos.add(clave);
    terminos.push(limpio);
  };
  for (let i = inicio; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    for (const m of linea.matchAll(DFN)) agrega(m[1]);
    const etiqueta = linea.match(ETIQUETA);
    if (!etiqueta) continue;
    if (VERBO_DEFINIDOR.test(etiqueta[2].trim())) {
      agrega(etiqueta[1]);
      continue;
    }
    // Una etiqueta sola en su línea, definida por la frase que viene justo después.
    if (etiqueta[2].trim() !== '') continue;
    for (let j = i + 1; j < lineas.length; j++) {
      if (lineas[j].trim() === '') continue;
      if (VERBO_DEFINIDOR.test(lineas[j].trim())) agrega(etiqueta[1]);
      break;
    }
  }
  return terminos;
};

// Sin acentos y en minúsculas, un carácter por carácter: el índice del texto plano es el
// índice del original, que hace falta para leer la paráfrasis que va justo después.
const plano = (texto) => texto.toLowerCase()
  .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
  .replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n');

const ES_PALABRA = /[\p{L}\p{N}\p{M}]/u;

// La paráfrasis va justo después del término: entre paréntesis («la especificación (el
// documento que dice qué debe hacer el sistema)») o tras un guion y una frase de tres
// palabras o más.
const parafraseado = (texto, fin) => {
  let i = fin;
  while (i < texto.length && /\s/.test(texto[i])) i++;
  if (i >= texto.length) return false;
  if (texto[i] === '(' || texto[i] === '[') {
    const cierre = texto[i] === '(' ? ')' : ']';
    const j = texto.indexOf(cierre, i + 1);
    if (j < 0) return false;
    return palabrasDe(texto.slice(i + 1, j)) >= 2;
  }
  if (texto[i] === '—' || texto[i] === '–' || texto[i] === '-') {
    let j = i + 1;
    while (j < texto.length && !'.!?\n'.includes(texto[j])) j++;
    return palabrasDe(texto.slice(i + 1, j)) >= 3;
  }
  return false;
};

// ¿El segmento usa el término sin decir qué significa ahí mismo? La comparación ignora
// mayúsculas y acentos y exige la palabra entera.
const nombraTermino = (segmento, termino) => {
  const texto = plano(segmento);
  const patron = plano(termino);
  if (!patron || patron.length > texto.length) return false;
  for (let i = texto.indexOf(patron); i >= 0; i = texto.indexOf(patron, i + 1)) {
    if (i > 0 && ES_PALABRA.test(texto[i - 1])) continue;
    const fin = i + patron.length;
    if (fin < texto.length && ES_PALABRA.test(texto[fin])) continue;
    if (parafraseado(segmento, fin)) continue;
    return true;
  }
  return false;
};

// 1. La ruta: el mapa de la parte, tres o cuatro líneas. En material nuevo cada línea
// dice qué se verá, en palabras llanas, y antes de la ruta va una introducción de cuatro
// a seis frases (S27, S28). Ni la introducción ni la ruta nombran un término que la
// parte explica después sin parafrasearlo. Una parte antigua, con figuras de legado,
// sigue pasando igual (S10).
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
    const faltaPrelectura = falloDePrelectura(src);
    if (faltaPrelectura) fallas.push(faltaPrelectura);
    // «Ningún término antes de su explicación»: un término que la parte define después
    // todavía no es una palabra del lector; nombrarlo aquí sin palabras llanas al lado
    // es un hallazgo.
    const terminos = terminosDefinidos(src);
    if (faltaPrelectura === '') {
      for (const bloque of parrafosDePrelectura(src)) {
        const termino = terminos.find((t) => nombraTermino(bloque, t));
        if (termino) {
          fallas.push(`la prelectura nombra «${termino}», un término que la parte solo explica después: `
            + `dilo en palabras llanas o parafraséalo ahí mismo («${termino} (… en palabras llanas)»)`);
          break;
        }
      }
    }
    for (const [i, linea] of lineasRuta.entries()) {
      if (palabrasDeDetalle(linea) < MIN_DETALLE) {
        fallas.push(`línea ${i + 1} sin frase descriptiva: escribe «<paso> — <qué se verá ahí en palabras llanas>» `
          + `con un separador («—», «:» o «-») y ${MIN_DETALLE} palabras o más después de él`);
      }
      const termino = terminos.find((t) => nombraTermino(linea.replace(/^\s*\d+[.)]/, ''), t));
      if (termino) {
        fallas.push(`línea ${i + 1} nombra «${termino}», un término que la parte solo explica después: `
          + `dilo en palabras llanas o parafraséalo ahí mismo («${termino} (… en palabras llanas)»)`);
      }
    }
    return fallas.length
      ? { ok: false, detail: fallas.join('; ') }
      : { ok: true, detail: `${lineasRuta.length} línea(s)` };
  },
};
