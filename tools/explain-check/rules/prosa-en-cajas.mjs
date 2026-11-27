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
//
// #437. La regla mide lo que el lector ve, no los bytes de la nota. La sub-línea de una caja se
// dibuja dentro de la caja (`integrations/pi/kit/kit.js:1512`), así que se mide con el umbral del
// título y tramo a tramo, porque un rótulo de lista (`·`) o de flujo (`→`) enumera piezas cortas
// —el corpus no tiene ninguna sub-línea de caja más larga que sus tramos—; un icono encima de una
// caja es su adorno y no dibuja nada que la caja no dibuje (#273), igual que en `escenario-de-cajas`;
// la misma cadena escrita en NFC o en NFD mide igual; un carácter de ancho cero tras el punto no
// borra el punto; y una figura cuyo JSON no parsea se reporta en vez de darse por buena.
//
// #484. El paso de un `lk-guided` también son cajas con texto, y la regla las mide con el rasero que
// ya tiene: la ficha de la tarjeta y la etiqueta del número (3 palabras / 20 caracteres), el valor de
// la tarjeta y el del número como título (6 / 40), la nota de la tarjeta como sub-línea (10 / 50) y el
// pie del paso como el pie de una figura (22 / 120). Sale de la misma lectura del corpus que los demás
// umbrales: las 127 cajas, 124 sub-líneas, 153 fichas y 54 pies del corpus aprobado. El paso dibuja
// sus tarjetas y sus números, así que la señal de «nada dibujado» no se aplica aquí.
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
// Un rótulo que enumera piezas (`·`, `→`, `|`) no es una frase seguida: cada tramo se mide solo.
const TRAMOS = /\s*(?:·|•|→|->|⟶|⇒|\|)\s*/;
// Lo que el lector no ve no cuenta: ni la forma de normalización ni los caracteres de ancho cero.
const INVISIBLES = /[\u200B-\u200F\u2060-\u2064\uFEFF]/g;

const declara = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);
// El texto tal como se lee: la misma cadena en NFC y en NFD es la misma, y medirla da lo mismo.
const legible = (valor) => String(valor ?? '').normalize('NFC').replace(INVISIBLES, '').trim();
// La longitud se cuenta en caracteres, no en unidades UTF-16.
const caracteres = (texto) => [...texto].length;
const palabras = (texto) => texto.split(/\s+/).filter(Boolean).length;
const esFrase = (label) => {
  const texto = legible(label);
  if (!texto) return false;
  return /[.…]$/.test(texto) || caracteres(texto) > LIMITE_DE_CARACTERES || palabras(texto) > LIMITE_DE_PALABRAS;
};
const esLarga = (texto, limite, tope, { frase = true } = {}) => {
  const limpio = legible(texto);
  if (!limpio) return false;
  return (frase && /[.…]$/.test(limpio)) || caracteres(limpio) > limite || palabras(limpio) > tope;
};
const esClausula = (label) => {
  const texto = legible(label);
  return !FLUJO.test(texto) && palabras(texto) >= PALABRAS_DE_UNA_CLAUSULA;
};
// Un icono sobre una caja es su adorno (#273): el kit lo lleva a una esquina de esa caja
// (`kit.js:1539`) y no dibuja nada que la caja no dibuje. Un icono suelto sí es un dibujo.
const enCaja = (icono, cajas) => cajas.some((caja) => caja && icono.x >= caja.x && icono.x <= caja.x + caja.w && icono.y >= caja.y && icono.y <= caja.y + caja.h);

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
const GUIDADO = /<lk-guided\b[^>]*>([\s\S]*?)<\/lk-guided>/gi;

// Un paso de `lk-guided` como una figura más: sus tarjetas y sus números son cajas, fichas y
// sub-líneas; su pie es el pie del paso, y el paso dibuja lo que muestra, así que `dibuja` es true.
const pasosGuiados = (sinCodigo) => {
  const encontradas = [];
  for (const bloque of sinCodigo.matchAll(GUIDADO)) {
    const payload = bloque[1].match(PAYLOAD);
    if (!payload) continue;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { continue; }
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.steps)) continue;
    spec.steps.forEach((paso, i) => {
      const cajas = [];
      const fichas = [];
      const subs = [];
      const bloques = Array.isArray(paso?.blocks) ? paso.blocks : [];
      for (const actual of bloques) {
        cadaObjeto(actual?.cards, (tarjeta) => {
          if (typeof tarjeta.label === 'string') fichas.push(tarjeta.label);
          if (typeof tarjeta.value === 'string') cajas.push(tarjeta.value);
          if (typeof tarjeta.note === 'string') subs.push(tarjeta.note);
        });
        cadaObjeto(actual?.values, (valor) => {
          if (typeof valor.label === 'string') fichas.push(valor.label);
          if (typeof valor.value === 'string') cajas.push(valor.value);
        });
      }
      encontradas.push({
        tag: 'lk-guided',
        title: `${i + 1} · ${legible(paso?.label || paso?.title || 'sin título')}`,
        cajas,
        subs,
        subsDeCaja: [],
        fichas,
        pie: texto(paso?.caption),
        dibuja: true,
        ilegible: false,
      });
    });
  }
  return encontradas;
};

// Una spec de paso ilegible no se mide aquí: `figuras` la reporta como figura que no se puede leer.
const figuras = (sinCodigo) => {
  const encontradas = [...pasosGuiados(sinCodigo)];
  for (const bloque of sinCodigo.matchAll(FIGURAS)) {
    const tag = bloque[1].toLowerCase();
    const payload = bloque[2].match(PAYLOAD);
    if (!payload) continue;
    let spec;
    // Lo que la regla no puede medir no puede darlo por bueno: una spec ilegible se reporta.
    try { spec = JSON.parse(payload[1]); } catch { spec = null; }
    if (!spec || typeof spec !== 'object') {
      encontradas.push({ tag, title: '', cajas: [], subs: [], subsDeCaja: [], fichas: [], pie: '', dibuja: false, ilegible: true });
      continue;
    }
    const cajas = [];
    const subs = [];
    const subsDeCaja = [];
    const fichas = [];
    let dibuja = false;
    recorrer(spec, (nodo) => {
      const cajasDelNodo = Array.isArray(nodo.boxes) ? nodo.boxes : [];
      cadaObjeto(nodo.boxes, (caja) => {
        if (typeof caja.label === 'string') cajas.push(caja.label);
        if (typeof caja.sub === 'string') subsDeCaja.push(caja.sub);
      });
      // La sub-línea de un actor de secuencia y su ficha se dibujan con su nombre.
      cadaObjeto(nodo.actors, (actor) => {
        if (typeof actor.sub === 'string') subs.push(actor.sub);
        if (typeof actor.tag === 'string') fichas.push(actor.tag);
      });
      cadaObjeto(nodo.tags, (ficha) => {
        if (typeof ficha.text === 'string') fichas.push(ficha.text);
      });
      if (DIBUJOS.some((clave) => clave !== 'icons' && declara(nodo[clave]))) dibuja = true;
      // El icono solo dibuja cuando está suelto: encima de una caja es su adorno (#273).
      if (declara(nodo.icons) && (!Array.isArray(nodo.icons) || nodo.icons.some((icono) => !enCaja(icono ?? {}, cajasDelNodo)))) dibuja = true;
    });
    encontradas.push({
      tag,
      title: String(spec.title || spec.scene?.title || '').trim(),
      cajas,
      subs,
      subsDeCaja,
      fichas,
      pie: tag === CON_PIE ? texto(spec.caption) : '',
      dibuja,
      ilegible: false,
    });
  }
  return encontradas;
};

const SUB = [LIMITE_DE_SUB, PALABRAS_DE_SUB];
const FICHA = [LIMITE_DE_FICHA, PALABRAS_DE_FICHA];
const PIE = [LIMITE_DE_PIE, PALABRAS_DE_PIE];

// Qué texto de la figura lleva una frase, en el orden en que se lee la figura.
const infraccion = (figura) => {
  if (figura.ilegible) return 'el JSON de la figura no se lee: arréglalo antes de darla por buena';
  const caja = figura.cajas.find(esFrase);
  if (caja) return `la caja «${caja}» es una frase, no un título`;
  // La sub-línea de la caja se dibuja dentro de la caja, con el título: su umbral es el del título.
  const tramo = figura.subsDeCaja
    .flatMap((sub) => legible(sub).split(TRAMOS).filter(Boolean))
    .find((texto) => esLarga(texto, LIMITE_DE_CARACTERES, LIMITE_DE_PALABRAS));
  if (tramo) return `la sub-línea de la caja «${tramo}» es una frase, no una sub-línea de ${LIMITE_DE_PALABRAS} palabras`;
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
    const ilegibles = malas.filter(({ figura }) => figura.ilegible).length;
    return {
      ok: malas.length === 0,
      detail: malas.length
        ? `${malas.length} figura(s) con frases en las cajas o en su sub-línea, su ficha o su pie${ilegibles ? ', o con una spec que no se lee' : ''} · un título de hasta ${LIMITE_DE_PALABRAS} palabras y ${LIMITE_DE_CARACTERES} caracteres, una sub-línea de ${PALABRAS_DE_SUB}, una ficha de ${PALABRAS_DE_FICHA} y un pie de ${PALABRAS_DE_PIE}, sin punto final fuera del pie; y si la figura no dibuja nada (${DIBUJOS.join(', ')}), sus cajas son estados cortos, no prosa`
        : '',
      items: malas.map(({ figura, porque }) => ({
        linea: `${figura.tag} «${figura.title || 'sin título'}» · ${porque}`,
      })),
    };
  },
};
