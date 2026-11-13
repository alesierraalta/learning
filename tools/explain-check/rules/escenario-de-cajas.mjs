// 7f. La escena quieta se mide con el mismo rasero que el escenario del recorrido
// (#245): una `<lk-scene>` que solo dibuja cajas con su texto y flechas es «dos
// cajas y una flecha», el defecto que el alumno rechazó. Una pieza, un personaje,
// un icono, una curva, una fórmula o un callout la salvan; el motor aplica la
// misma regla (`sceneStageFindings`).
import { declara } from '../nota.mjs';

const VOCABULARIO = ['actors', 'props', 'moves', 'tags', 'icons', 'callouts', 'curves', 'paths', 'formulas', 'formula', 'grids', 'sheets', 'bars', 'stats', 'nodes', 'badges', 'dashed', 'policy', 'arrows'];
const PIEZAS_DIBUJADAS = ['cards', 'memory', 'tables', 'venn', 'tree'];
const DIBUJO_DE_ESCENA = ['actors', 'props', 'icons', 'nodes', 'grids', 'sheets', 'bars', 'stats',
  'formulas', 'formula', 'curves', 'paths', 'dashed', 'badges', 'callouts', 'policy', 'tags'];

// El vocabulario que dibuja una acción: lo que el paso tiene que traer. Una caja
// con su texto no es una acción, y un recorrido de cajas no enseña nada.
const pasoDibujaAccion = (step) => {
  const stage = step?.stage || {};
  if (PIEZAS_DIBUJADAS.some((k) => declara(stage[k]))) return true;
  const scene = stage.scene || stage;
  return VOCABULARIO.some((k) => declara(scene[k]));
};

export default {
  id: 'escenario-de-cajas',
  check({ historiasSpecs, escenasSpecs }) {
    const soloCajas = historiasSpecs.filter((spec) => (spec.steps || []).length > 0 && (spec.steps || []).every((step) => !pasoDibujaAccion(step)));
    const escenasDeCajas = escenasSpecs.filter((spec) => {
      const scene = spec.scene || {};
      if (DIBUJO_DE_ESCENA.some((k) => declara(scene[k]))) return false;
      return declara(scene.boxes) || declara(scene.arrows);
    });
    return {
      ok: soloCajas.length === 0 && escenasDeCajas.length === 0,
      detail: [
        soloCajas.length
          ? `todos los pasos de la historia dibujan solo cajas con texto · dibuja la acción: ${VOCABULARIO.filter((k) => k !== 'arrows').join(', ')}; o una pieza: <lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>`
          : '',
        escenasDeCajas.length
          ? `la escena quieta «${escenasDeCajas[0].title || 'sin título'}» solo dibuja cajas con su texto y flechas · dibuja el personaje (<lk-scene> con \`actors\` y \`kind\`) o usa la pieza que le toca: <lk-memory>, <lk-tables>, <lk-venn>, <lk-cards>`
          : '',
      ].filter(Boolean).join(' · '),
    };
  },
};
