// 7i (b). Las tarjetas de veredicto: el tinte rojo es para un error. Una tarjeta que falla y no
// dice NO COMPILA, ERROR, INCORRECTO o RECHAZADO tiñe un estado válido (#261). La
// tarjeta neutra (`verdict: "neutral"`) es el contraste sin tinte.
import { normaTexto } from '../nota.mjs';

const VEREDICTO_DE_ERROR = /\b(no compila|errores?|incorrect[oa]|rechazad[oa]|falla|fallo|invalid[oa]|no valid[oa]|prohibid[oa]|denegad[oa]|bloquead[oa]|panic|excepcion)\b/;

export default {
  id: 'veredicto-sin-error',
  check({ tarjetas }) {
    const sinError = tarjetas.filter((c) => c?.verdict === 'no' && !VEREDICTO_DE_ERROR.test(normaTexto(c.pill || 'ERROR')));
    return {
      ok: sinError.length === 0,
      detail: sinError.length
        ? `la tarjeta «${sinError[0].title || sinError[0].id || ''}» se teñe de rojo con su veredicto «${sinError[0].pill}», que no es un error · si los dos estados son válidos, márcala neutra con "verdict": "neutral"; el rojo es para un error: NO COMPILA, ERROR, INCORRECTO, RECHAZADO`
        : '',
    };
  },
};
