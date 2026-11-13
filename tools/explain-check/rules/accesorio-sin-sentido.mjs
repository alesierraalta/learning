// 7i (c). El icono de leer o escribir (#261): el ojo y el lápiz dicen algo solo si el texto de
// la tarjeta habla de leer o de escribir. Un icono sin esa palabra es un adorno.
import { normaTexto } from '../nota.mjs';

const LEER_O_ESCRIBIR = /\b(leer|lee|leen|lectura|lector\w*|escrib\w*|escritura|escritor\w*|modific\w*|read\w*|write\w*)\b/;

export default {
  id: 'accesorio-sin-sentido',
  check({ tarjetas }) {
    const iconoSinSentido = tarjetas.map((c) => {
      const icono = (c?.draw?.refs || []).find((r) => r?.icon === 'read' || r?.icon === 'write');
      if (!icono) return null;
      const texto = [c.title, c.reason, c.pill, c.draw?.target?.text, ...(c.draw?.refs || []).map((r) => r?.text)]
        .filter((t) => typeof t === 'string').join(' ');
      return LEER_O_ESCRIBIR.test(normaTexto(texto)) ? null : { card: c, icono: icono.icon };
    }).filter(Boolean);
    return {
      ok: iconoSinSentido.length === 0,
      detail: iconoSinSentido.length
        ? `la tarjeta «${iconoSinSentido[0].card.title || iconoSinSentido[0].card.id || ''}» lleva el icono de ${iconoSinSentido[0].icono === 'read' ? 'lectura' : 'escritura'}, y ni su título, ni su razón, ni su código hablan de ${iconoSinSentido[0].icono === 'read' ? 'leer' : 'escribir'} · quita el icono o di en la razón qué se ${iconoSinSentido[0].icono === 'read' ? 'lee' : 'escribe'}`
        : '',
    };
  },
};
