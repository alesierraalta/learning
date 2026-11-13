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
  'glosario-en-bloque',
];

// Tres definiciones seguidas son un glosario en bloque (#265). La referencia del alumno nunca pone dos
// seguidas: su explicación de RL reparte cada definición con una frase del ejemplo. El banco de #264 pone
// cinco; el umbral es el primero que la referencia no alcanza.
export const GLOSARIO_EN_BLOQUE = 3;

const INSTRUCCION = {
  termino: 'explícalo en palabras llanas aquí y átalo al ejemplo',
  frases: 'divide en dos frases: una idea por frase',
  negrita: 'márcalo en negrita la primera vez y defínelo en una línea: «**término**: es …»',
  escena: 'dibuja antes el ejemplo: una frase con «Imagina…», «Por ejemplo…» o «En nuestro ejemplo…», y define después',
  contraste: 'escribe un antes y un después con las mismas palabras: «Antes: … Después: …»',
  cuenta: 'pásala a renglones: un bloque cercado con un paso por línea y el resultado al final',
  cuentaBloque: 'alarga el bloque de cuenta: un paso por renglón, con el resultado al final',
  glosario: 'reparte las definiciones: entre una y otra va una frase del ejemplo («Imagina…», «En nuestro ejemplo…») o una escena, nunca tres «Término: Es …» seguidos',
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

  // 7. Glosario en bloque: tres o más definiciones seguidas, sin una frase del ejemplo entre ellas.
  const bloques = bloquesDeDefiniciones(text);
  const largo = Math.max(0, ...bloques.map((b) => b.count));
  add('glosario-en-bloque', largo < GLOSARIO_EN_BLOQUE,
    largo < GLOSARIO_EN_BLOQUE
      ? `${largo} definición(es) seguida(s) como mucho (en bloque desde ${GLOSARIO_EN_BLOQUE})`
      : `${largo} definiciones seguidas, sin una frase del ejemplo entre ellas (en bloque desde ${GLOSARIO_EN_BLOQUE})`,
    bloques.filter((b) => b.count >= GLOSARIO_EN_BLOQUE).map((b) => item(b.first.term, b.first.sentence, INSTRUCCION.glosario)));

  return rows;
}

// Una definición: un término en negrita (o «Término:») seguido de un verbo que define («Es …», «Son …»),
// en la misma línea o en la siguiente. Las líneas en blanco no cortan una serie; una frase cualquiera sí.
const DEFINE = /^(Es|Son|Significa|Significan|Se llama|Se trata de)\b/;
export function bloquesDeDefiniciones(text) {
  const lineas = text.split('\n').map((l) => l.trim());
  const marcas = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (l === '') continue;
    const misma = /^\*\*([^*]+)\*\*\s*:\s*(.+)$/.exec(l) ?? /^([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ .-]{1,40}):\s*(.+)$/.exec(l);
    if (misma && DEFINE.test(misma[2])) { marcas.push({ def: true, term: misma[1].trim(), sentence: misma[2].trim() }); continue; }
    if (/^\*\*[^*]+\*\*\s*:?$/.test(l)) {
      let j = i + 1;
      while (j < lineas.length && lineas[j] === '') j++;
      if (j < lineas.length && DEFINE.test(lineas[j])) {
        marcas.push({ def: true, term: l.replace(/\*/g, '').replace(/:$/, '').trim(), sentence: lineas[j] });
        i = j;
        continue;
      }
    }
    marcas.push({ def: false });
  }
  const bloques = [];
  let actual = null;
  for (const marca of marcas) {
    if (marca.def) {
      actual ??= { count: 0, first: marca };
      actual.count += 1;
    } else if (actual) {
      bloques.push(actual);
      actual = null;
    }
  }
  if (actual) bloques.push(actual);
  return bloques;
}
