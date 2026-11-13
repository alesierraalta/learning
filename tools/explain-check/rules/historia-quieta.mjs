// 7h (a). El recorrido se mueve: una historia de derivación cuyos pasos no mueven
// nada —ni un `moves`, ni un cambio de estado, ni una pieza que cambie, ni un
// puntero— es la misma foto tres veces. Una historia de fórmula no entra: su
// avance es el token resaltado de la cabecera.
// La historia se mueve si algo cambia en cualquier paso: un movimiento, un actor
// que en algún paso está en otro estado, una pieza que en algún paso está en
// otro estado, o un puntero que cambia. Un actor que aparece o una pieza que se
// reemplaza no cuentan: eso es la foto, no la acción.
const senalesDeLaHistoria = (steps) => {
  const cambios = new Map();
  const anota = (key, value) => {
    if (!cambios.has(key)) cambios.set(key, new Set());
    cambios.get(key).add(value);
  };
  const piezas = [], punteros = [];
  let moves = 0;
  for (const step of steps) {
    const stage = step?.stage || {};
    const scene = stage.scene || stage;
    moves += (scene.moves || []).length;
    for (const a of scene.actors || []) anota(`actor:${a.id}`, a.state || 'active');
    for (const p of scene.props || []) anota(`prop:${p.id}`, `${p.label || ''}|${p.state || ''}|${p.tone || ''}`);
    const piece = ['cards', 'memory', 'tables', 'venn', 'tree'].map((k) => stage[k]).find(Boolean);
    piezas.push(piece ? JSON.stringify(piece) : '');
    punteros.push([...JSON.stringify(stage).matchAll(/"points"\s*:\s*"([^"]*)"/g)].map((m) => m[1]).join('|'));
  }
  const cambiaEstado = [...cambios.values()].some((set) => set.size > 1);
  const cambiaPieza = piezas.some((p, i) => i > 0 && p !== piezas[i - 1]);
  const cambiaPuntero = punteros.some((p, i) => i > 0 && p !== punteros[i - 1]);
  return moves > 0 || cambiaEstado || cambiaPieza || cambiaPuntero;
};

export default {
  id: 'historia-quieta',
  check({ historiasSpecs }) {
    const historiasQuietas = historiasSpecs.filter((spec) => {
      const steps = spec.steps || [];
      if ((spec.kind || '') !== 'derivation' || steps.length < 2) return false;
      return !senalesDeLaHistoria(steps);
    });
    return {
      ok: historiasQuietas.length === 0,
      detail: historiasQuietas.length
        ? `la historia «${historiasQuietas[0].title || 'sin título'}» no mueve nada en ${historiasQuietas[0].steps.length} paso(s): ni un movimiento (\`moves\`), ni un cambio de estado de sus actores, ni una pieza que cambie · dibuja la acción paso a paso, no la misma foto repetida`
        : '',
    };
  },
};
