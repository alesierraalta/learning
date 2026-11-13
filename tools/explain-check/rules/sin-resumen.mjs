// 2. Cierre: el estándar prohíbe resumir al final.
export default {
  id: 'sin-resumen',
  check({ src }) {
    const cierre = /(^|\n)#{1,6}\s*(Resumen para guardar|Apuntes comprimidos|En resumen)/i.test(src);
    return { ok: !cierre, detail: cierre ? 'cierra con un resumen, prohibido' : '' };
  },
};
