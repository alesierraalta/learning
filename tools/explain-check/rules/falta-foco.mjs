// 7k (#305). Un recorrido o una historia de tres pasos gráficos (escena SVG, no pieza) tiene un `ring` de
// texto en algún paso: el id de una pieza de ese paso, que el kit rodea con un anillo. Las historias de piezas
// (tarjetas, memoria, tablas, conjuntos) no tienen pasos gráficos. Un `focus` no cuenta: en una historia es la
// lista de símbolos de su cabecera. Es una regla de autoría (`authoringOnly`); el motor aplica la misma regla
// (`faltaFocoFindings` en `internal/engine/standard_falta_foco.go`).
const PIEZAS = ['cards', 'memory', 'tables', 'venn', 'tree'];
// En un `lk-walkthrough` cada paso dibuja su escena; en un `lk-story` un paso con pieza no la dibuja.
const pasoGrafico = (b, paso) => b.tag === 'lk-walkthrough' || !PIEZAS.some((pieza) => paso?.stage?.[pieza] != null);
const conAnillo = (pasos) => pasos.some((paso) => typeof paso?.ring === 'string' && paso.ring.length > 0);

export default {
  id: 'falta-foco',
  authoringOnly: true,
  check({ bloquesDeRecorrido }) {
    const sinAnillo = bloquesDeRecorrido.filter((b) => b.pasos.filter((paso) => pasoGrafico(b, paso)).length >= 3 && !conAnillo(b.pasos));
    return {
      ok: sinAnillo.length === 0,
      detail: sinAnillo.length
        ? `${sinAnillo.length} recorrido(s) de tres o más pasos gráficos sin foco · da a un paso ring: "<id de una pieza de ese paso>" para resaltar lo que explica`
        : '',
      items: sinAnillo.map((b) => ({ linea: b.linea })),
    };
  },
};
