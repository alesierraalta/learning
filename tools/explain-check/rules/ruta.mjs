// 1. La ruta: el mapa de la parte, tres o cuatro líneas.
export default {
  id: 'ruta',
  check({ src }) {
    const ruta = src.match(/^##\s*Ruta\s*$([\s\S]*?)(?=^##\s|\Z)/m);
    const lineasRuta = ruta ? ruta[1].split('\n').filter((l) => /^\s*\d+[.)]/.test(l)).length : 0;
    return { ok: Boolean(ruta) && lineasRuta >= 3 && lineasRuta <= 4, detail: ruta ? `${lineasRuta} línea(s)` : 'no hay `## Ruta`' };
  },
};
