// 7i (a). Las marcas, las tarjetas y sus iconos (#261). Tres defectos que el segundo
// banco repitió con todas las puertas en verde: una marca que repite la flecha o la
// etiqueta de su mismo paso («SYN» bajo la flecha «SYN»), una tarjeta teñida de rojo para
// un estado válido (DETACHED) y un ojo o un lápiz que el texto no nombra. Se leen del
// JSON, sin navegador, y el motor aplica las mismas reglas con las claves aditivas
// `markEcho`, `verdictError` y `accessorySense`.
import { fichas } from '../nota.mjs';

// Una marca repite una etiqueta cuando sus palabras son las de la etiqueta, o un tramo
// seguido suyo: «SYN» repite «SYN-ACK» y «servidor» repite «Servidor».
const repiteEtiqueta = (marca, etiqueta) => {
  const m = fichas(marca), e = fichas(etiqueta);
  if (!m.length || !e.length) return false;
  for (let i = 0; i + m.length <= e.length; i++) if (m.every((w, j) => e[i + j] === w)) return true;
  return false;
};

export default {
  id: 'marca-eco',
  check({ historiasSpecs }) {
    const marcaEco = [];
    for (const spec of historiasSpecs) {
      for (const [i, step] of (spec.steps || []).entries()) {
        const scene = step?.stage?.scene || step?.stage || {};
        const etiquetas = [
          ...(scene.moves || []).map((m) => m?.verb),
          ...(scene.actors || []).flatMap((a) => [a?.tag, a?.label]),
        ].filter((t) => typeof t === 'string' && t.trim());
        for (const marca of scene.marks || []) {
          if (typeof marca?.label !== 'string' || !marca.label.trim()) continue;
          const eco = etiquetas.find((e) => repiteEtiqueta(marca.label, e));
          if (eco !== undefined) marcaEco.push({ paso: i + 1, marca: marca.label.trim(), eco: eco.trim() });
        }
      }
    }
    return {
      ok: marcaEco.length === 0,
      detail: marcaEco.length
        ? `el paso ${marcaEco[0].paso} marca «${marcaEco[0].marca}», que repite la etiqueta «${marcaEco[0].eco}» de ese mismo paso · la marca nombra lo que el paso aprueba («conexión pedida», «0.50»), no el movimiento ni el nombre que ya dibuja`
        : '',
    };
  },
};
