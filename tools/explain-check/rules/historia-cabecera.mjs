// 7d. La historia se lee, no solo existe (#243): la parte que enseña código o una
// fórmula pone esa línea en la cabecera del recorrido, y sus pasos dibujan la
// acción. Las dos se leen del JSON, sin navegador, y el motor aplica las mismas
// reglas (`storyHeaderFindings` y `storyStageFindings` en
// `internal/engine/standard_historia_cabecera.go` y `standard_escenario_de_historia.go`); un test cruza los dos veredictos.
//
// La línea de la cabecera: el `equation` del paso en un recorrido de derivación, la
// `formula` del recorrido entero en uno de fórmula. Es lo que `kit.js` dibuja.
const cabeceraDe = (spec, step) => ((spec.kind === 'derivation' ? step?.equation?.atoms : spec?.formula?.atoms) || []);

export default {
  id: 'historia-cabecera',
  check({ src, formulas, dibujadas, planas, historiasSpecs }) {
    // La parte muestra código o una fórmula: un bloque cercado, una fórmula dibujada,
    // `<lk-math>` o LaTeX plano. Es lo que la cabecera del recorrido tiene que llevar.
    const muestraCodigoOFormula = /```[\s\S]*?```/.test(src) || formulas.length + dibujadas.length + planas.length > 0;
    const sinCabecera = muestraCodigoOFormula
      ? historiasSpecs.filter((spec) => (spec.steps || []).some((step) => cabeceraDe(spec, step).length === 0))
      : [];
    return {
      ok: sinCabecera.length === 0,
      detail: sinCabecera.length
        ? 'la historia no lleva en su cabecera la línea de código o la fórmula que la parte enseña · ponla con `equation.atoms` en cada paso (o `formula.atoms` para el recorrido entero) y resalta el token del paso en `focus`'
        : '',
    };
  },
};
