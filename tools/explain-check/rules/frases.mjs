// 6b. El ritmo: frases cortas. El estándar pide una idea por frase; una frase de 40
// palabras no se lee, se atraviesa.
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;

export default {
  id: 'frases',
  check({ frases }) {
    const largas = frases.filter((f) => palabras(f) > 18);
    const media = frases.length ? Math.round(frases.reduce((a, f) => a + palabras(f), 0) / frases.length) : 0;
    return { ok: largas.length === 0, detail: `${largas.length} frase(s) de más de 18 palabras · media ${media}` };
  },
};
