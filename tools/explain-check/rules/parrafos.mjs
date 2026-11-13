// 6b (cont.). Un párrafo que no sea un muro: más de dos frases en un mismo bloque.
// El rechazo cita el primer muro: sin sus primeras palabras el tutor no sabe cuál
// de los párrafos partir. El motor cuenta igual (`wallParagraphs` en
// `internal/engine/standard_parrafos.go`) y un test cruza las dos cuentas.
const abre = (b) => b.split(/\s+/).slice(0, 8).join(' ');

export default {
  id: 'parrafos',
  check({ parrafos }) {
    const muros = parrafos.filter((b) => (b.match(/[.!?](\s|$)/g) || []).length > 2);
    return {
      ok: muros.length === 0,
      detail: `${muros.length} párrafo(s) con más de dos frases${muros.length ? ` · el primero abre «${abre(muros[0])}»` : ''}`,
    };
  },
};
