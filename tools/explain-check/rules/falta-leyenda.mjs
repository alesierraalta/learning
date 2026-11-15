// 7j (#305). Una fórmula o una derivación (`lk-story` de `kind` formula o derivation) trae `facts` en algún
// paso: es su leyenda de símbolos, la que dice qué es cada símbolo. Es una regla de autoría (`authoringOnly`).
// El motor aplica la misma regla (`faltaLeyendaFindings` en `internal/engine/standard_falta_leyenda.go`).
const esFormula = (b) => b.tag === 'lk-story' && (b.spec.kind === 'formula' || b.spec.kind === 'derivation');
const conLeyenda = (pasos) => pasos.some((paso) => Array.isArray(paso?.facts) && paso.facts.length > 0);

export default {
  id: 'falta-leyenda',
  authoringOnly: true,
  check({ bloquesDeRecorrido }) {
    const sinLeyenda = bloquesDeRecorrido.filter((b) => esFormula(b) && !conLeyenda(b.pasos));
    return {
      ok: sinLeyenda.length === 0,
      detail: sinLeyenda.length
        ? `${sinLeyenda.length} fórmula(s) o derivación(es) sin leyenda · da a un paso facts: [[símbolo, qué es], ...] con cada símbolo de la fórmula`
        : '',
      items: sinLeyenda.map((b) => ({ linea: b.linea })),
    };
  },
};
