import { HINTS } from '../hints.mjs';
// #419. Una figura que repite la prosa en cajas: una frase por caja, unidas por flechas, nada
// dibujado. El alumno lee el párrafo dos veces. Dos señales: la caja que lleva una frase (termina en
// punto, o pasa de 40 caracteres o de 6 palabras) y la figura que no dibuja nada que no sea texto y
// cuyas cajas son cláusulas (cuatro palabras o más) en vez de estados cortos. El corpus aprobado fija
// los números: sus 127 cajas miden 34 caracteres y 6 palabras como mucho, y ninguna termina en punto.
// Un título corto con su sub-línea, como el de un diagrama de causa o de estado, sigue pasando.
const LIMITE_DE_CARACTERES = 40;
const LIMITE_DE_PALABRAS = 6;
const PALABRAS_DE_UNA_CLAUSULA = 4;
// Lo que dibuja algo que no es texto: un paso que lo trae no es prosa en cajas.
const DIBUJOS = ['grids', 'sheets', 'actors', 'icons', 'paths', 'curves', 'nodes', 'bars', 'gears',
  'tables', 'memory', 'venn', 'tree'];
// Las figuras que dibujan cajas con su `label`. El contrato nuevo no las tiene: siempre dibuja.
const FIGURAS = /<(lk-scene|lk-walkthrough|lk-story|lk-figure)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const PAYLOAD = /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i;
// Un rótulo de flujo (`A → B`) no es una cláusula: es la cadena que une dos piezas.
const FLUJO = /(?:→|->|⟶|⇒)/;

const declara = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);
const palabras = (texto) => texto.split(/\s+/).filter(Boolean).length;
const esFrase = (label) => {
  const texto = String(label ?? '').trim();
  if (!texto) return false;
  return /[.…]$/.test(texto) || texto.length > LIMITE_DE_CARACTERES || palabras(texto) > LIMITE_DE_PALABRAS;
};
const esClausula = (label) => !FLUJO.test(label) && palabras(String(label).trim()) >= PALABRAS_DE_UNA_CLAUSULA;

const recorrer = (nodo, visitar) => {
  if (!nodo || typeof nodo !== 'object') return;
  if (Array.isArray(nodo)) { nodo.forEach((hijo) => recorrer(hijo, visitar)); return; }
  visitar(nodo);
  for (const valor of Object.values(nodo)) recorrer(valor, visitar);
};

// Cada bloque de figura, con sus cajas y si dibuja algo fuera del texto. Se lee el JSON de la
// misma forma que `nota.mjs`; una spec ilegible no se mide aquí (la reporta la regla del JSON).
const figuras = (sinCodigo) => {
  const encontradas = [];
  for (const bloque of sinCodigo.matchAll(FIGURAS)) {
    const payload = bloque[2].match(PAYLOAD);
    if (!payload) continue;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { continue; }
    if (!spec || typeof spec !== 'object') continue;
    const cajas = [];
    let dibuja = false;
    recorrer(spec, (nodo) => {
      if (Array.isArray(nodo.boxes)) {
        for (const caja of nodo.boxes) if (caja && typeof caja.label === 'string') cajas.push(caja.label);
      }
      if (DIBUJOS.some((clave) => declara(nodo[clave]))) dibuja = true;
    });
    encontradas.push({
      tag: bloque[1].toLowerCase(),
      title: String(spec.title || spec.scene?.title || '').trim(),
      cajas,
      dibuja,
    });
  }
  return encontradas;
};

export default {
  id: 'prosa-en-cajas',
  hint: HINTS['prosa-en-cajas'],
  check({ sinCodigo }) {
    const malas = figuras(sinCodigo).filter((figura) => {
      if (!figura.cajas.length) return false;
      // Señal 1: una caja que lleva una frase no lleva un título, dibuje o no la figura.
      if (figura.cajas.some(esFrase)) return true;
      // Señal 2: nada dibujado y todas las cajas son cláusulas, no estados cortos.
      return !figura.dibuja && figura.cajas.every(esClausula);
    });
    return {
      ok: malas.length === 0,
      detail: malas.length
        ? `${malas.length} figura(s) con frases en las cajas · una caja lleva un título de hasta ${LIMITE_DE_PALABRAS} palabras y ${LIMITE_DE_CARACTERES} caracteres, no una frase; y si la figura no dibuja nada (${DIBUJOS.join(', ')}), sus cajas son estados cortos, no prosa`
        : '',
      items: malas.map((figura) => ({
        linea: `${figura.tag} «${figura.title || 'sin título'}» · la caja «${figura.cajas.find((c) => esFrase(c)) || figura.cajas.find(esClausula)}» es una frase, no un título`,
      })),
    };
  },
};
