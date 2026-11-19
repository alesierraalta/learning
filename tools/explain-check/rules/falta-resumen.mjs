// 7i (#305). Un recorrido o una historia de tres pasos o más cierra con su `summary`: la tarjeta de
// resultados después del último paso. Un recorrido de dos pasos no la pide. Es una regla de autoría
// (`authoringOnly`): mide lo que el tutor escribe, no lo que el lector ya ve. El motor aplica la misma
// regla (`faltaResumenFindings` en `internal/engine/standard_falta_resumen.go`) y un test cruza los dos.
const tieneResumen = (spec) => Boolean(spec.summary) && typeof spec.summary === 'object' && !Array.isArray(spec.summary);

export default {
  id: 'falta-resumen',
  authoringOnly: true,
  check({ bloquesDeRecorrido, usaFigurasDePaso }) {
    if (usaFigurasDePaso) return { ok: true, detail: '', items: [] };
    const sinResumen = bloquesDeRecorrido.filter((b) => b.pasos.length >= 3 && !tieneResumen(b.spec));
    return {
      ok: sinResumen.length === 0,
      detail: sinResumen.length
        ? `${sinResumen.length} recorrido(s) de tres o más pasos sin resumen · cierra cada uno con un summary {title, text?, metrics: [[clave, valor], ...]} después del último paso`
        : '',
      items: sinResumen.map((b) => ({ linea: b.linea })),
    };
  },
};
