// 4b. El lenguaje de historia: la parte dibuja su recorrido con `<lk-story>` o con
// una pieza, nunca solo con el `<lk-walkthrough>` clásico, cuyas cajas y flechas
// libres se dibujan mal (#237). Una escena o un SVG no lo sustituyen. El motor
// aplica la misma regla (`storyLanguageFindings` en `internal/engine/standard_historia.go`)
// y un test cruza los dos veredictos. El código en un bloque cercado es un ejemplo
// de marcado, no un dibujo: el motor lo ignora y aquí también.
import { PIEZAS } from '../nota.mjs';

export default {
  id: 'historia',
  check({ sinCodigo }) {
    const historias = (sinCodigo.match(/<lk-story[\s>]/g) || []).length;
    const piezasDibujadas = (sinCodigo.match(new RegExp(`<lk-(?:${PIEZAS})[\\s>]`, 'g')) || []).length;
    const lenguajeDeHistoria = historias + piezasDibujadas > 0;
    return {
      ok: lenguajeDeHistoria,
      detail: lenguajeDeHistoria ? '' :
        'no hay historia ni pieza · usa una historia por pasos <lk-story> o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>; un <lk-walkthrough> clásico no cuenta',
    };
  },
};
