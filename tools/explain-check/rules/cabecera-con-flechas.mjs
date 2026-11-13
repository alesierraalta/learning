// 7h (b). La cabecera es la línea de código o la fórmula, nunca un esquema de flechas.
import { FLECHAS_DE_TEXTO } from '../nota.mjs';

export default {
  id: 'cabecera-con-flechas',
  check({ historiasSpecs, escenasSpecs }) {
    const conFlechas = [];
    for (const spec of historiasSpecs) {
      const atoms = (spec.kind === 'derivation'
        ? (spec.steps || []).flatMap((step) => step?.equation?.atoms || [])
        : (spec.formula?.atoms || []));
      for (const atom of atoms) {
        const text = typeof atom === 'string' ? atom : atom?.t || '';
        if (FLECHAS_DE_TEXTO.test(text)) { conFlechas.push({ where: 'la cabecera de la historia', text: text.trim() }); break; }
      }
    }
    for (const spec of escenasSpecs) {
      const scene = spec.scene || {};
      for (const label of [...(scene.labels || []), ...(scene.boxes || [])]) {
        const text = label?.text || label?.label || '';
        if (FLECHAS_DE_TEXTO.test(text)) { conFlechas.push({ where: 'una etiqueta de la escena', text: text.trim() }); break; }
      }
    }
    return {
      ok: conFlechas.length === 0,
      detail: conFlechas.length
        ? `${conFlechas[0].where} es un esquema en texto («${conFlechas[0].text}»): la cabecera lleva la línea de código o la fórmula, y el flujo se dibuja con actores y movimientos, nunca con \`--->\` o \`---[\``
        : '',
    };
  },
};
