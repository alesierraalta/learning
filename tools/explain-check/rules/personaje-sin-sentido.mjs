// 7j. El personaje contradice su etiqueta (#261): un servidor, un archivo o una base que es una persona
// o un resultado de la prueba, o una persona que es una máquina o un documento. Un léxico corto, medido en
// la etiqueta del actor de una historia y en la del grupo de un árbol; el motor aplica la misma regla
// (`characterSenseFindings`) con la clave aditiva `characterSense`, y lee las mismas palabras.
import { fichas } from '../nota.mjs';

const PERSONA_PALABRAS = new Set(['persona', 'personas', 'paciente', 'pacientes', 'enfermo', 'enfermos', 'sano', 'sanos', 'usuario', 'usuarios', 'alumno', 'alumnos', 'cliente', 'clientes', 'gente', 'poblacion', 'estudiante', 'estudiantes', 'ciudadano', 'ciudadanos', 'vecino', 'vecinos', 'individuo', 'individuos', 'habitante', 'habitantes']);
const RESULTADO_PALABRAS = new Set(['positivo', 'positivos', 'negativo', 'negativos', 'resultado', 'resultados', 'diagnostico', 'diagnosticos', 'falso', 'falsos', 'verdadero', 'verdaderos', 'prueba', 'pruebas', 'test', 'tests']);
const MAQUINA_PALABRAS = new Set(['servidor', 'servidores', 'host', 'archivo', 'archivos', 'documento', 'documentos', 'bd']);
// `doc` es el nombre del documento en el kit: el mismo dibujo que `file` (`S.icon`, ALIAS).
const PERSONAJE_DE_MAQUINA = new Set(['server', 'file', 'doc', 'database']);

const contradice = (kind, tag) => {
  const palabras = new Set(fichas(tag));
  const tiene = (lexico) => [...palabras].some((w) => lexico.has(w));
  const maquina = tiene(MAQUINA_PALABRAS) || (palabras.has('base') && palabras.has('datos'));
  if (PERSONAJE_DE_MAQUINA.has(kind) && (tiene(PERSONA_PALABRAS) || tiene(RESULTADO_PALABRAS))) return 'persona o resultado';
  if (kind === 'user' && maquina) return 'máquina';
  return null;
};

export default {
  id: 'personaje-sin-sentido',
  check({ historiasSpecs, sinCodigo }) {
    const personajes = [];
    const revisa = (kind, tag, donde) => {
      const motivo = contradice(kind, tag);
      if (motivo) personajes.push({ kind, tag: tag.trim(), donde, motivo });
    };
    for (const spec of historiasSpecs) {
      for (const [i, step] of (spec.steps || []).entries()) {
        const scene = step?.stage?.scene || step?.stage || {};
        for (const a of scene.actors || []) revisa(a?.kind || a?.icon || '', String(a?.tag || a?.label || ''), `paso ${i + 1}`);
      }
    }
    for (const m of sinCodigo.matchAll(/<lk-tree[^>]*>[\s\S]*?<\/lk-tree>/g)) {
      const payload = m[0].match(/<script type="application\/json">([\s\S]*?)<\/script>/);
      if (!payload) continue;
      let arbol;
      try { arbol = JSON.parse(payload[1]); } catch { continue; }
      for (const n of arbol.nodes || []) {
        const tag = Array.isArray(n?.lines) && n.lines.length ? n.lines.join(' ') : String(n?.label || n?.id || '');
        revisa(n?.kind || 'user', tag, 'el árbol');
      }
    }
    return {
      ok: personajes.length === 0,
      detail: personajes.length
        ? `el personaje «${personajes[0].kind}» de «${personajes[0].tag}» (${personajes[0].donde}) contradice su etiqueta · ${personajes[0].motivo === 'máquina' ? 'un servidor, un archivo o una base se dibuja con su propio personaje («server», «file», «database»)' : 'una persona o un resultado se dibuja con «user»; «server», «file» y «database» son máquinas o documentos'}`
        : '',
    };
  },
};
