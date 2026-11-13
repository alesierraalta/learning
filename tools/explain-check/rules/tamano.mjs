// 7. Tamaño: la prosa que se lee, sin código, tablas ni figuras.
import { PIEZAS } from '../nota.mjs';

export default {
  id: 'tamaño',
  check({ src }, { maxWords }) {
    const prosa = src
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(new RegExp(`<lk-(scene|walkthrough|story|${PIEZAS})[\\s\\S]*?<\\/lk-\\1>`, 'g'), ' ')
      .replace(/^\|.*\|$/gm, ' ')
      .replace(/^#{1,6}\s.*$/gm, ' ')
      .replace(/<[^>]+>/g, ' ')
      .trim().split(/\s+/).filter(Boolean).length;
    return { ok: prosa <= maxWords, detail: `${prosa} palabra(s) de prosa (tope ${maxWords})` };
  },
};
