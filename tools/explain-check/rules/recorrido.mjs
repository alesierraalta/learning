// 4 (cont.). Un recorrido de fórmula o de ejercicio (`<lk-story>`) es un recorrido más: la parte debe uno, y el motor los
// cuenta igual (`deckCount`). Una historia de derivación es un cálculo, no un recorrido, y no cuenta (#324): cada cuenta
// resuelta es su propia derivación, y `recorridosTope` ya la deja fuera.
export default {
  id: 'recorrido',
  check({ recorridosTope }) {
    return { ok: recorridosTope <= 1, detail: `${recorridosTope} recorrido(s)` };
  },
};
