import { HINTS } from '../hints.mjs';
// 4. Una escena y como mucho un recorrido. El motor (`explanation-standard`,
// `minScenes`) exige además que haya una escena y que su payload dibuje: eso
// necesita leer el JSON, y el rechazo del motor nombra el arreglo («dibuja el
// ejemplo con <lk-scene>»). Aquí se cuenta la presencia y el tope.
// Las piezas visuales (tarjetas, memoria, tablas, conjuntos, el explorador de un
// escenario) son figuras como la escena: ocupan su lugar en la parte y gastan su
// tope. El motor cuenta igual (`pieceOpenCount` en `internal/engine/pieces.go`).
export default {
  id: 'escena',
  hint: HINTS['escena'],
  check({ escenas, usaFigurasDePaso }) {
    // `sceneFindings` no aplica el presupuesto de una escena a una parte escrita
    // solo con los elementos nuevos; cada uno es su propia escena dibujada.
    if (usaFigurasDePaso) return { ok: true, detail: `${escenas} escena(s) legada(s)` };
    return { ok: escenas <= 1, detail: `${escenas} escena(s)` };
  },
};
