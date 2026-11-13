// 6. ASCII dibujado: la geometría se dibuja, no se escribe.
// La geometría se dibuja, no se escribe: las cajas ASCII y las flechas de texto
// (`--->`, `---[`, `==>`) son la misma falta (#246). El código cercado es un
// ejemplo, no un dibujo, y no se mide.
import { FLECHAS_DE_TEXTO } from '../nota.mjs';

export default {
  id: 'ascii',
  check({ sinCodigo }) {
    const ascii = sinCodigo.split('\n').filter((l) => /[┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░]|─+[►▶▸]/.test(l) || FLECHAS_DE_TEXTO.test(l));
    return { ok: ascii.length === 0, detail: ascii.length ? `${ascii.length} línea(s) dibujadas con caracteres` : '' };
  },
};
