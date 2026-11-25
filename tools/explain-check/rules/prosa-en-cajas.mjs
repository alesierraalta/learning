import { HINTS } from '../hints.mjs';
// #419. Una figura que repite la prosa en cajas: una frase por caja, unidas por flechas, nada
// dibujado. El alumno lee el párrafo dos veces. Dos señales: la caja que lleva una frase (termina en
// punto, o pasa de 40 caracteres o de 6 palabras) y la figura que no dibuja nada que no sea texto y
// cuyas cajas son cláusulas (cuatro palabras o más) en vez de estados cortos. El corpus aprobado fija
// los números: sus 127 cajas miden 34 caracteres y 6 palabras como mucho, y ninguna termina en punto.
// Un título corto con su sub-línea, como el de un diagrama de causa o de estado, sigue pasando.
//
// #431. La figura muestra más texto que su `label`, y la prosa se escondía ahí: en la sub-línea de la
// caja, en la ficha del nombre de un actor y en el pie que `lk-scene` dibuja. Los números también
// salen del corpus: 124 sub-líneas de 47 caracteres y 10 palabras como mucho, ninguna con punto
// final; 153 fichas (149 en actores y 4 en `scene.tags`) de 15 caracteres y 3 palabras; y 54 pies,
// que sí son frases —todos acaban en punto— y no pasan de 115 caracteres y 22 palabras. Un icono
// suelto sigue contando como dibujo para la segunda señal, pero ya no compra estas frases.
const LIMITE_DE_CARACTERES = 40;
const LIMITE_DE_PALABRAS = 6;
const PALABRAS_DE_UNA_CLAUSULA = 4;
const LIMITE_DE_SUB = 50;
const PALABRAS_DE_SUB = 10;
const LIMITE_DE_FICHA = 20;
const PALABRAS_DE_FICHA = 3;
const LIMITE_DE_PIE = 120;
const PALABRAS_DE_PIE = 22;
// Lo que dibuja algo que no es texto: un paso que lo trae no es prosa en cajas.
const DIBUJOS = ['grids', 'sheets', 'actors', 'icons', 'paths', 'curves', 'nodes', 'bars', 'gears',
  'tables', 'memory', 'venn', 'tree'];
// Las figuras que dibujan cajas con su `label`. El contrato nuevo no las tiene: siempre dibuja.
const FIGURAS = /<(lk-scene|lk-walkthrough|lk-story|lk-figure)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const PAYLOAD = /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i;
// Solo `lk-scene` dibuja su `caption`, como `<figcaption>`; el recorrido no tiene pie.
const CON_PIE = 'lk-scene';
// Un rótulo de flujo (`A → B`) no es una cláusula: es la cadena que une dos piezas.
const FLUJO = /(?:→|->|⟶|⇒)/;

const declara = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);
const palabras = (texto) => texto.split(/\s+/).filter(Boolean).length;
const esFrase = (label) => {
  const texto = String(label ?? '').trim();
  if (!texto) return false;
  return /[.…]$/.test(texto) || texto.length > LIMITE_DE_CARACTERES || palabras(texto) > LIMITE_DE_PALABRAS;
};
const esLarga = (texto, limite, tope, { frase = true } = {}) => {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return false;
  return (frase && /[.…]$/.test(limpio)) || limpio.length > limite || palabras(limpio) > tope;
};
const esClausula = (label) => !FLUJO.test(label) && palabras(String(label).trim()) >= PALABRAS_DE_UNA_CLAUSULA;

const recorrer = (nodo, visitar) => {
  if (!nodo || typeof nodo !== 'object') return;
  if (Array.isArray(nodo)) { nodo.forEach((hijo) => recorrer(hijo, visitar)); return; }
  visitar(nodo);
  for (const valor of Object.values(nodo)) recorrer(valor, visitar);
};

const texto = (valor) => typeof valor === 'string' ? valor : '';

const cadaObjeto = (lista, visitar) => {
  if (!Array.isArray(lista)) return;
  for (const item of lista) if (item && typeof item === 'object') visitar(item);
};

// Cada bloque de figura, con el texto que muestra y si dibuja algo fuera del texto. Se lee el JSON
// de la misma forma que `nota.mjs`; una spec ilegible no se mide aquí (la reporta la regla del JSON).
const figuras = (sinCodigo) => {
  const encontradas = [];
  for (const bloque of sinCodigo.matchAll(FIGURAS)) {
    const tag = bloque[1].toLowerCase();
    const payload = bloque[2].match(PAYLOAD);
    if (!payload) continue;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { continue; }
    if (!spec || typeof spec !== 'object') continue;
    const cajas = [];
    const subs = [];
    const fichas = [];
    let dibuja = false;
    recorrer(spec, (nodo) => {
      cadaObjeto(nodo.boxes, (caja) => {
        if (typeof caja.label === 'string') cajas.push(caja.label);
        if (typeof caja.sub === 'string') subs.push(caja.sub);
      });
      // La sub-línea de un actor de secuencia y su ficha se dibujan con su nombre.
      cadaObjeto(nodo.actors, (actor) => {
        if (typeof actor.sub === 'string') subs.push(actor.sub);
        if (typeof actor.tag === 'string') fichas.push(actor.tag);
      });
      cadaObjeto(nodo.tags, (ficha) => {
        if (typeof ficha.text === 'string') fichas.push(ficha.text);
      });
      if (DIBUJOS.some((clave) => declara(nodo[clave]))) dibuja = true;
    });
    encontradas.push({
      tag,
      title: String(spec.title || spec.scene?.title || '').trim(),
      cajas,
      subs,
      fichas,
      pie: tag === CON_PIE ? texto(spec.caption) : '',
      dibuja,
    });
  }
  return encontradas;
};

const SUB = [LIMITE_DE_SUB, PALABRAS_DE_SUB];
const FICHA = [LIMITE_DE_FICHA, PALABRAS_DE_FICHA];
const PIE = [LIMITE_DE_PIE, PALABRAS_DE_PIE];

// Qué texto de la figura lleva una frase, en el orden en que se lee la figura.
const infraccion = (figura) => {
  const caja = figura.cajas.find(esFrase);
  if (caja) return `la caja «${caja}» es una frase, no un título`;
  const sub = figura.subs.find((texto) => esLarga(texto, ...SUB));
  if (sub) return `la sub-línea «${sub}» es una frase, no una sub-línea de ${PALABRAS_DE_SUB} palabras`;
  const ficha = figura.fichas.find((texto) => esLarga(texto, ...FICHA));
  if (ficha) return `la ficha «${ficha}» es una frase, no un nombre de ${PALABRAS_DE_FICHA} palabras`;
  // El pie es el único sitio donde una frase está en su lugar: lo que no cabe es un párrafo.
  const pie = esLarga(figura.pie, ...PIE, { frase: false })
    ? `el pie «${figura.pie}» es un párrafo, no un pie de ${PALABRAS_DE_PIE} palabras`
    : '';
  if (pie) return pie;
  if (!figura.cajas.length) return '';
  // Señal 2: nada dibujado y todas las cajas son cláusulas, no estados cortos.
  return !figura.dibuja && figura.cajas.every(esClausula)
    ? `la caja «${figura.cajas.find(esClausula)}» es una cláusula, no un estado corto`
    : '';
};

export default {
  id: 'prosa-en-cajas',
  hint: HINTS['prosa-en-cajas'],
  check({ sinCodigo }) {
    const malas = figuras(sinCodigo)
      .map((figura) => ({ figura, porque: infraccion(figura) }))
      .filter(({ porque }) => porque);
    return {
      ok: malas.length === 0,
      detail: malas.length
        ? `${malas.length} figura(s) con frases en las cajas o en su sub-línea, su ficha o su pie · un título de hasta ${LIMITE_DE_PALABRAS} palabras y ${LIMITE_DE_CARACTERES} caracteres, una sub-línea de ${PALABRAS_DE_SUB}, una ficha de ${PALABRAS_DE_FICHA} y un pie de ${PALABRAS_DE_PIE}, sin punto final fuera del pie; y si la figura no dibuja nada (${DIBUJOS.join(', ')}), sus cajas son estados cortos, no prosa`
        : '',
      items: malas.map(({ figura, porque }) => ({
        linea: `${figura.tag} «${figura.title || 'sin título'}» · ${porque}`,
      })),
    };
  },
};
