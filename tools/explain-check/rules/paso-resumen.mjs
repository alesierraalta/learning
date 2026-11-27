import { HINTS } from '../hints.mjs';
// #484. Una parte que no explica, resume: el alumno rechazó la Parte 3 de un tema real porque cada
// paso de su `lk-guided` era un título y un pie de cuatro palabras («Suma de obras.»), sin definición,
// sin ejemplo y sin porqué. El corpus aprobado fija el rasero del pie: los 8 pies del ejemplo del kit
// miden 8 palabras (45 caracteres) como mínimo, y cada uno va con un bloque `note` o `formula` que
// enseña. Un pie por debajo de esas 8 palabras y sin un bloque que enseñe es un resumen, no una
// explicación. Un paso sin pie no entra: esta regla mide el pie que resume la idea.
const PALABRAS_DEL_PIE = 8;
// Los bloques que enseñan: la frase que explica y la fórmula que se abre pieza a pieza.
const ENSENAN = ['note', 'formula'];
const palabras = (texto) => String(texto ?? '').normalize('NFC').replace(/[\u200B-\u200F\u2060-\u2064\uFEFF]/g, '').trim().split(/\s+/).filter(Boolean).length;

export default {
  id: 'paso-resumen',
  hint: HINTS['paso-resumen'],
  check({ figurasDePaso }) {
    const resumenes = [];
    let guiados = 0;
    for (const figura of figurasDePaso) {
      if (figura.tag !== 'lk-guided') continue;
      guiados += 1;
      // Lo que la regla no puede leer lo reporta `figuras`; aquí no se da por bueno ni por malo.
      if (figura.ilegible) continue;
      const pasos = Array.isArray(figura.spec.steps) ? figura.spec.steps : [];
      pasos.forEach((paso, i) => {
        const pie = typeof paso?.caption === 'string' ? paso.caption.trim() : '';
        if (!pie || palabras(pie) >= PALABRAS_DEL_PIE) return;
        const tipos = (Array.isArray(paso?.blocks) ? paso.blocks : []).map((bloque) => bloque?.kind);
        if (tipos.some((tipo) => ENSENAN.includes(tipo))) return;
        resumenes.push(`lk-guided ${guiados} · paso ${i + 1} «${pie}»: ${palabras(pie)} palabra(s) y ningún bloque que enseñe (${ENSENAN.join(', ')}) — escribe el pie de una frase y añade la definición, el ejemplo o el porqué`);
      });
    }
    return {
      ok: resumenes.length === 0,
      detail: resumenes.length
        ? `${resumenes.length} paso(s) resumen la idea en vez de explicarla · un pie de al menos ${PALABRAS_DEL_PIE} palabras (el más corto del corpus aprobado) o un bloque ${ENSENAN.join(' o ')} en ese paso`
        : '',
      items: resumenes.map((linea) => ({ linea })),
    };
  },
};
