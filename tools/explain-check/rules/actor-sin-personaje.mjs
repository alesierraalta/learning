// 7e. El personaje (#245): un actor es un personaje con su dibujo, no un
// rectángulo con su nombre. El kit dibuja diez personajes con `kind` —el cilindro
// de la base de datos, la fila, la sesión, el candado, el usuario, el servidor, el
// proceso, el archivo, el paquete y el robot— y una historia cuyos actores son
// todos cajas, cuando el nombre de alguno nombra un personaje, es un hallazgo. Se
// lee del JSON, sin navegador, y el motor aplica la misma regla
// (`actorCharacterFindings` en `internal/engine/standard_actor_sin_personaje.go`).
const PERSONAJES = [
  ['database', /base de datos|\bbd\b|\bdisco\b|\bbase\b/i],
  ['row', /\bfila\b|\bregistro\b|\bcuenta\b|\btupla\b/i],
  ['session', /\bsesi[oó]n\b|\bconexi[oó]n\b/i],
  ['lock', /\bbloqueo\b|\bcerrojo\b|\btransacci[oó]n\b/i],
  ['user', /\busuario\b|\bpersona\b|\bcliente\b|\balumno\b/i],
  ['server', /\bservidor\b|\bhost\b/i],
  ['process', /\bproceso\b|\bprograma\b|\bbloque\b|\bscript\b/i],
  ['file', /\barchivo\b|\bdocumento\b|\bficha\b/i],
  ['packet', /\bpaquete\b|\btrama\b|\bpacket\b|\bpetici[oó]n\b|\bmensaje\b/i],
  ['robot', /\brobot\b|\bagente\b/i],
];
const PERSONAJES_DIBUJABLES = PERSONAJES.map(([kind]) => kind).join(', ');
const actoresDe = (spec) => (spec.steps || []).flatMap((step) => {
  const stage = step?.stage || {};
  const scene = stage.scene || stage;
  return (scene.actors || []).map((a) => ({ ...a, step: step?.title || '' }));
});
const personajeDe = (label) => PERSONAJES.find(([, re]) => re.test(String(label || '')))?.[0];
const dibujaPersonaje = (a) => Boolean(a.kind || a.icon);

export default {
  id: 'actor-sin-personaje',
  check({ historiasSpecs }) {
    const sinPersonaje = historiasSpecs
      .map((spec) => {
        const actores = actoresDe(spec);
        if (!actores.length || actores.some(dibujaPersonaje)) return null;
        const encajan = actores.map((a) => ({ label: a.label, kind: personajeDe(a.label) })).filter((x) => x.kind);
        return encajan.length ? { spec, encajan } : null;
      })
      .filter(Boolean);
    return {
      ok: sinPersonaje.length === 0,
      detail: sinPersonaje.length
        ? `los actores de «${sinPersonaje[0].spec.title || 'la historia'}» son cajas con su nombre — «${sinPersonaje[0].encajan[0].label}» es un ${sinPersonaje[0].encajan[0].kind}: dibújalo con \`kind\` («${sinPersonaje[0].encajan[0].kind}») y su nombre en \`tag\`; los personajes son ${PERSONAJES_DIBUJABLES}`
        : '',
    };
  },
};
