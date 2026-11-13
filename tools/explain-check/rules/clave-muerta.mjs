// 7h (c). Las claves que el esquema no lee: un paso con `scene` al lado de `stage`
// declara un dibujo que nadie dibuja. El escenario vive en `stage` y su dibujo en
// `stage.scene`; lo demás es dato muerto que enseña mal el esquema al tutor.
const CLAVES_DEL_PASO = new Set(['title', 'narrator', 'equation', 'focus', 'stage', 'say', 'header']);
const CLAVES_DEL_ESCENARIO = new Set(['scene', 'cards', 'memory', 'tables', 'venn', 'tree', 'caption']);
const CLAVES_DE_LA_ESCENA = new Set(['actors', 'props', 'moves', 'tags', 'marks', 'icons', 'callouts',
  'curves', 'paths', 'formulas', 'formula', 'grids', 'sheets', 'gears', 'boxes', 'arrows', 'nodes',
  'bars', 'stats', 'policy', 'badges', 'dashed', 'labels', 'title', 'aria', 'caption']);

export default {
  id: 'clave-muerta',
  check({ historiasSpecs }) {
    const clavesMuertas = [];
    for (const spec of historiasSpecs) {
      for (const [i, step] of (spec.steps || []).entries()) {
        for (const key of Object.keys(step || {})) if (!CLAVES_DEL_PASO.has(key)) clavesMuertas.push({ step: i + 1, path: key });
        const stage = step?.stage || {};
        for (const key of Object.keys(stage)) if (!CLAVES_DEL_ESCENARIO.has(key)) clavesMuertas.push({ step: i + 1, path: `stage.${key}` });
        const scene = stage.scene || {};
        for (const key of Object.keys(scene)) if (!CLAVES_DE_LA_ESCENA.has(key)) clavesMuertas.push({ step: i + 1, path: `stage.scene.${key}` });
      }
    }
    return {
      ok: clavesMuertas.length === 0,
      detail: clavesMuertas.length
        ? `el paso ${clavesMuertas[0].step} lleva \`${clavesMuertas[0].path}\`, que el esquema no lee · el escenario vive en \`stage\` y su dibujo en \`stage.scene\`; las claves del paso son ${[...CLAVES_DEL_PASO].join(', ')}`
        : '',
    };
  },
};
