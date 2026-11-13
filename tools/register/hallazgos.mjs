// Los hallazgos de registro: seis reglas que separan la referencia de lo nuestro (report.md §4).
// Las medidas vienen de measure.mjs, una sola implementación; aquí se decide, se cita la frase
// y se dice cómo reescribirla. Cada hallazgo trae `items`: la frase exacta y su instrucción.
import {
  extractProse,
  splitSentences,
  tokenize,
  isStepLine,
  technicalTerms,
  definicionesYEjemplos,
  primeraMencion,
  measureText,
} from './measure.mjs';
import { NIVEL_DEFECTO } from './niveles.mjs';

export const REGLAS_DE_REGISTRO = [
  'termino-sin-explicar',
  'frases-largas',
  'sin-negritas',
  'sin-escena-antes',
  'sin-contraste',
  'cuentas-sin-pasos',
];

const INSTRUCCION = {
  termino: 'explícalo en palabras llanas aquí y átalo al ejemplo',
  frases: 'divide en dos frases: una idea por frase',
  negrita: 'márcalo en negrita la primera vez y defínelo en una línea: «**término**: es …»',
  escena: 'dibuja antes el ejemplo: una frase con «Imagina…», «Por ejemplo…» o «En nuestro ejemplo…», y define después',
  contraste: 'escribe un antes y un después con las mismas palabras: «Antes: … Después: …»',
  cuenta: 'pásala a renglones: un bloque cercado con un paso por línea y el resultado al final',
  cuentaBloque: 'alarga el bloque de cuenta: un paso por renglón, con el resultado al final',
};

// Una cuenta dentro de la frase: «10 - 0.9 + 8.1 = 17.2». Un signo entre dos cifras y un «=» con cifra.
const CUENTA_EN_FRASE = /\d[\d.,]*\s*[-+×*/]\s*\d[\d.,]*[^=\n]*=\s*-?\d/;

const pct = (n) => `${Math.round(n * 100)} %`;

/** Una frase que afirma algo: no una definición ni la apertura de un ejemplo. */
const esAfirmacion = (s) => {
  const { definiciones, ejemplo } = definicionesYEjemplos([s]);
  return tokenize(s).length > 6 && definiciones.length === 0 && ejemplo < 0;
};
const dec = (n) => n.toFixed(1).replace('.', ',');
const item = (term, sentence, instruccion) => ({
  term,
  sentence,
  instruccion,
  linea: `${term ? `${term} — ` : ''}«${sentence}» — ${instruccion}`,
});

/** Las seis reglas sobre un texto. `umbrales` sale de `umbralesDe`. */
export function hallazgosDeRegistro(text, umbrales) {
  const m = measureText(text);
  const { prose, steps } = extractProse(text);
  const sentences = splitSentences(prose);
  const nivel = (eje) => umbrales.niveles?.[eje] ?? NIVEL_DEFECTO;
  const rows = [];
  const add = (rule, ok, detail, items = []) => rows.push({ rule, ok, detail, items: ok ? [] : items });

  // 1. El término se explica donde aparece: pesa el uso, no el tipo.
  const sinExplicar = m.unexplained;
  add('termino-sin-explicar', m.explainedWeighted >= umbrales.explicado,
    `${sinExplicar.length} término(s) sin explicar de ${m.terms} · uso explicado ${pct(m.explainedWeighted)} (mínimo ${pct(umbrales.explicado)}, tecnicidad=${nivel('tecnicidad')})`,
    sinExplicar.map((t) => item(t.term, t.sentence, INSTRUCCION.termino)));

  // 2. Frases: media y p90 de palabras por frase. Se citan las más largas.
  const { mean, p90 } = m.wordsPerSentence;
  const porLargura = sentences.map((s) => ({ s, n: tokenize(s).length })).sort((a, b) => b.n - a.n);
  const sobreTope = porLargura.filter((x) => x.n > umbrales.frasesP90);
  add('frases-largas', mean <= umbrales.frasesMedia && p90 <= umbrales.frasesP90,
    `media ${dec(mean)} palabras (tope ${umbrales.frasesMedia}) · p90 ${dec(p90)} (tope ${umbrales.frasesP90}) · sencillez=${nivel('sencillez')}`,
    (sobreTope.length ? sobreTope : porLargura).slice(0, 3).map((x) => item(null, x.s, INSTRUCCION.frases)));

  // 3. Negritas: cada término técnico que no va en negrita se cita con su primera frase.
  const negritas = new Set([...prose.matchAll(/\*\*([^*]+)\*\*/g)].map((x) => x[1].trim().toLowerCase()));
  const sinNegrita = [...technicalTerms(prose).entries()]
    // Sólo las palabras piden negrita: un valor en código se explica, no se marca como término.
    .filter(([term, info]) => (info.kind === 'rare' || info.kind === 'acronym') && !negritas.has(term.toLowerCase()))
    .map(([term]) => item(term, primeraMencion(term, sentences) ?? term, INSTRUCCION.negrita));
  add('sin-negritas', m.boldTermsPer1000 >= umbrales.negritas,
    `${dec(m.boldTermsPer1000)} negrita(s)-término por 1000 palabras (mínimo ${umbrales.negritas}, tecnicidad=${nivel('tecnicidad')})`,
    sinNegrita);

  // 4. Escena antes de definición: §7 mide la parte de definiciones que van después del primer ejemplo.
  const { ejemplo, definiciones } = definicionesYEjemplos(sentences);
  const antes = definiciones.filter((i) => ejemplo < 0 || i < ejemplo);
  const despues = definiciones.length ? (definiciones.length - antes.length) / definiciones.length : 1;
  add('sin-escena-antes', despues >= umbrales.escenaAntes,
    `${pct(despues)} de las definiciones van después del primer ejemplo (mínimo ${pct(umbrales.escenaAntes)}, sencillez=${nivel('sencillez')})`,
    antes.map((i) => item(null, sentences[i], INSTRUCCION.escena)));

  // 5. Contraste: un antes y un después, o una comparación. Se cita una frase que afirma algo, no la
  // apertura de un ejemplo ni una definición: esas ya tienen su sitio en la parte.
  const ancla = sentences.find(esAfirmacion) ?? sentences.find((s) => tokenize(s).length > 6) ?? sentences[0] ?? '';
  add('sin-contraste', m.contrastPer1000 >= umbrales.contraste,
    `${dec(m.contrastPer1000)} marcador(es) de contraste por 1000 palabras (mínimo ${umbrales.contraste}) · sencillez=${nivel('sencillez')}`,
    ancla ? [item(null, ancla, INSTRUCCION.contraste)] : []);

  // 6. Cuentas: si hay una cuenta, va renglón a renglón. Una cuenta en la frase o un bloque corto falla.
  const enFrase = sentences.filter((s) => CUENTA_EN_FRASE.test(s));
  const renglones = steps.filter((s) => isStepLine(s));
  const calcula = enFrase.length > 0 || renglones.length > 0;
  const enRegla = m.stepsPer1000 >= umbrales.pasos && m.longestStepRun >= umbrales.racha;
  add('cuentas-sin-pasos', !calcula || enRegla,
    calcula
      ? `${enFrase.length} cuenta(s) en la frase · ${dec(m.stepsPer1000)} renglón(es) de cuenta por 1000 palabras (mínimo ${umbrales.pasos}), bloque de ${m.longestStepRun} (mínimo ${umbrales.racha}) · sencillez=${nivel('sencillez')}`
      : 'sin cuentas',
    enFrase.length ? enFrase.map((s) => item(null, s, INSTRUCCION.cuenta)) : renglones.slice(0, 1).map((s) => item(null, s, INSTRUCCION.cuentaBloque)));

  return rows;
}
