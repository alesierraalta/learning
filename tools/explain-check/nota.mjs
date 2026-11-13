// La nota, leída una vez: lo que más de una regla mira. El texto sin código, las
// historias, las escenas, las tarjetas, las fórmulas y los párrafos se derivan aquí,
// y cada regla recibe la nota ya leída (#269). Lo que mide una sola regla vive en su
// archivo de `rules/`.

// Las piezas visuales (tarjetas, memoria, tablas, conjuntos, el explorador de un
// escenario y el árbol) son figuras como la escena: ocupan su lugar en la parte.
export const PIEZAS = 'cards|memory|tables|venn|explorer|tree';

// Un flujo escrito con guiones es geometría escrita, no dibujada: `--->`, `---[`,
// `-->`, `==>`, `<--`. La regla de ASCII de la prosa y la de la cabecera usan el
// mismo patrón (#246).
export const FLECHAS_DE_TEXTO = /-{2,}>|={2,}>|-{2,}\[|<-{2,}|<=+/;

// Las palabras de una marca o de una etiqueta, sin tildes y en minúsculas.
export const normaTexto = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const fichas = (t) => normaTexto(t).split(/[^a-z0-9]+/).filter(Boolean);

// Un campo que dibuja algo: una lista con elementos, o cualquier valor verdadero.
export const declara = (value) => Array.isArray(value) ? value.length > 0 : Boolean(value);

/** Lee la nota una vez. `src` ya es la nota: una página HTML llega traducida. */
export function leerNota(src, esPagina) {
  // Sin código: un bloque cercado es un ejemplo de marcado, no un dibujo ni prosa.
  const sinCodigo = src.replace(/```[\s\S]*?```/g, ' ');

  // Escenas y recorridos (reglas 4 y 5): se cuentan en el texto entero.
  const piezas = (src.match(new RegExp(`<lk-(?:${PIEZAS})[\\s>]`, 'g')) || []).length;
  const escenas = (src.match(/<lk-scene[\s>]/g) || []).length + piezas;
  const recorridos = (src.match(/<lk-(?:walkthrough|story)[\s>]/g) || []).length;

  // Fórmulas: las del kit, las que se dibujan en una escena y el LaTeX plano.
  const formulas = [...src.matchAll(/<lk-math[^>]*>([\s\S]*?)<\/lk-math>/g)].map((m) => m[1]);
  const dibujadas = [];
  const atomos = (node, out) => {
    if (!node) return;
    for (const f of Array.isArray(node) ? node : [node]) {
      out.push((f?.atoms || []).map((a) => (typeof a === 'string' ? a : a?.t || '')).join(''));
    }
  };
  for (const block of src.matchAll(/<lk-(scene|walkthrough)[^>]*>([\s\S]*?)<\/lk-\1>/g)) {
    const payload = block[2].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) continue;
    let spec;
    try { spec = JSON.parse(payload[1]); } catch { continue; }
    const walk = (scene) => {
      if (!scene) return;
      atomos(scene.formulas, dibujadas);
      atomos(scene.formula, dibujadas);
    };
    walk(spec.scene);
    for (const step of spec.steps || []) walk(step.scene);
  }
  // La fórmula también puede venir en LaTeX plano, `$$…$$` o `$…$`: se lee igual, y
  // un `$…$` con espacios y sin operadores es prosa con precios, no una fórmula.
  const planas = [...src.matchAll(/\$\$([\s\S]+?)\$\$/g)].map((m) => m[1]).concat(
    [...src.replace(/\$\$[\s\S]+?\$\$/g, ' ').matchAll(/\$([^$\n]+?)\$/g)]
      .map((m) => m[1])
      .filter((t) => /[\\^_=]/.test(t) || !/\s/.test(t)),
  );

  // Historias, escenas quietas y tarjetas: el JSON de cada bloque, sin código.
  const historiasSpecs = [];
  for (const m of sinCodigo.matchAll(/<lk-story[^>]*>[\s\S]*?<\/lk-story>/g)) {
    const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) continue;
    try { historiasSpecs.push(JSON.parse(payload[1])); } catch {}
  }
  const escenasSpecs = [];
  for (const m of sinCodigo.matchAll(/<lk-scene[^>]*>[\s\S]*?<\/lk-scene>/g)) {
    const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) continue;
    try { escenasSpecs.push(JSON.parse(payload[1])); } catch {}
  }
  const tarjetas = [];
  for (const m of sinCodigo.matchAll(/<lk-cards[^>]*>[\s\S]*?<\/lk-cards>/g)) {
    const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
    if (!payload) continue;
    try { tarjetas.push(...(JSON.parse(payload[1]).cards || [])); } catch {}
  }

  // El ritmo: los párrafos de prosa y sus frases. Las reglas `frases` y `parrafos` leen estas.
  const lineasProsa = src
    .replace(/```[\s\S]*?```/g, '\n\n')
    .replace(new RegExp(`<lk-(scene|walkthrough|story|${PIEZAS}|quiz|quick-quiz)[\\s\\S]*?<\\/lk-\\1>`, 'g'), '\n\n')
    .split('\n')
    // Títulos, tablas y etiquetas no son prosa; las citas y las viñetas sí: una ficha
    // con tres frases dentro de `>` es un muro igual que un párrafo suelto.
    .filter((l) => !/^\s*(#{1,6}\s|\||<)/.test(l));
  // Cada viñeta es su propia unidad: una lista es una idea por línea, no un párrafo.
  // Las citas siguen agrupándose, para que tres frases dentro de `>` cuenten como muro.
  const bloques = [];
  let actual = [];
  for (const linea of lineasProsa) {
    const esVineta = /^\s*(?:[-*]\s+|\d+[.)]\s+)/.test(linea);
    if (esVineta || linea.trim() === '') {
      if (actual.length) bloques.push(actual);
      actual = esVineta ? [linea] : [];
    } else actual.push(linea);
  }
  if (actual.length) bloques.push(actual);
  const parrafos = bloques
    .map((b) => b.map((l) => l.replace(/^\s*(>\s?|[-*]\s+|\d+[.)]\s+)/, '')).join(' ').trim())
    .filter(Boolean);
  const frases = parrafos
    .flatMap((b) => b.split(/(?<=[.!?])\s+/))
    .map((f) => f.trim())
    .filter((f) => f.length > 1);

  return { src, esPagina, sinCodigo, escenas, recorridos, formulas, dibujadas, planas, historiasSpecs, escenasSpecs, tarjetas, parrafos, frases };
}
