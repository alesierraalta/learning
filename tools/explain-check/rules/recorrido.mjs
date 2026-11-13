// 4 (cont.). Un recorrido de fórmula o de ejercicio (`<lk-story>`) es un recorrido más:
// la parte debe uno, y el motor los cuenta igual (`walkthroughOpen` + `storyOpen`).
export default {
  id: 'recorrido',
  check({ recorridos }) {
    return { ok: recorridos <= 1, detail: `${recorridos} recorrido(s)` };
  },
};
