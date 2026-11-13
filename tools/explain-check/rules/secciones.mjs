// 3. Una parte es una idea: dos secciones de contenido como máximo, sin contar Ruta.
// La Ruta es el mapa y el mini-quiz es el quiz que el mismo estándar pide: no son
// secciones de contenido. El motor cuenta igual (`contentSections` en
// `internal/engine/standard_secciones.go`), para que su rechazo y esta medición coincidan.
export default {
  id: 'secciones',
  check({ src }) {
    const secciones = [...src.matchAll(/^##\s+(.+)$/gm)]
      .map((m) => m[1].trim())
      .filter((t) => !/^Ruta$/i.test(t) && !/mini-quiz/i.test(t));
    return { ok: secciones.length <= 2, detail: `${secciones.length} sección(es) de contenido` };
  },
};
