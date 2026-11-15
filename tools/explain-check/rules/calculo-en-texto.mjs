// 7l (#324). Un cálculo escrito como texto o como fórmulas. Cuenta como cálculo: dos o más renglones de
// `<expr> = <expr>` que sustituyen números y llevan una operación, en un bloque cercado o en renglones seguidos; dos o
// más renglones de cuenta dentro de una sola fórmula con renglones (`\\`, `aligned`, `align`, `array`, `gathered`); y
// dos o más fórmulas seguidas (`$$…$$`, `\[…\]`, `<lk-math display>` y los `<lk-math>` sueltos en su línea) que hacen lo
// mismo (decisión 4). La cuenta se dibuja como historia de derivación (`<lk-story kind="derivation">`: un paso por
// renglón o por fórmula, el término que cambia en `focus` y un `summary` con el resultado). Un renglón o una fórmula sola
// (el resultado, un valor dentro de una frase, una fórmula sin números, una fórmula con sus valores en una línea), una
// lista de datos sin operación, una llamada a función y el código de un lenguaje de programación no son cuentas. Un
// `<lk-math>` dentro de una frase, con un punto detrás o citado en código, es prosa. Es una regla de autoría
// (`authoringOnly`). El motor aplica la misma regla (`calculoEnTextoFindings` en
// `internal/engine/standard_calculo_en_texto.go`) y un test cruza los dos.
import { isStepLine } from '../../register/measure.mjs';
import { sinCercasPorRenglon } from '../../lib/explain-check-code.mjs';

// Lo que es código o dibujo y no una cuenta: los lenguajes de programación que mide el registro (`CODE_LANGS` en
// `tools/register/measure.mjs`) y los formatos visuales del kit.
const CODIGO = new Set([
  'sql', 'js', 'ts', 'javascript', 'typescript', 'bash', 'sh', 'json', 'rust', 'python', 'html', 'css', 'yaml', 'yml',
  'tsx', 'jsx', 'go', 'mermaid', 'desmos-graph', 'geogebra', 'ggb', 'datachart', 'markmap',
]);

// Los espacios que el lector ve como espacio. Se cambian antes de leer, para que `\s` signifique lo mismo en las dos
// herramientas (la del motor no conoce los espacios Unicode).
const ESPACIOS = /[\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

// La marca de una viñeta o de una cita al empezar el renglón.
const MARCA = /^\s*(?:>\s*)*(?:[-*+]\s+|\d{1,3}[.)]\s+)?/;
// Un lado de `<expr> = <expr>`: letras, cifras, espacios, operadores, paréntesis y signos de una expresión.
const LADO = /^[\p{L}\p{N} +\-−–—×·*\/÷^()[\]{}.,_%√]+$/u;
const NUMEROS = /^[\d.,+\-−–—×·*\/÷^()%\s]+$/;
// Una llamada a función (`foo(1)`) no es aritmética. Una palabra de dos letras o más es una unidad o un rótulo
// (`184 ms`, `512 bits`, `pesos`): no cambia que el lado tenga números. Una letra sola es una variable.
const LLAMADA = /\p{L}\s*\(/u;
const PALABRA = /\p{L}{2,}/gu;
// Una operación entre dos operandos: `64 / 32`, `3 − 2`, `(184 - 120) / 32`. Un signo suelto (`+10`) no es una.
const OPERACION = /[\d)]\s*[+\-−–—×·*\/÷^]\s*[\d(]/;
// Las fórmulas: `$$…$$`, `\[…\]` y cada `<lk-math>`, de display o suelto. Un grupo por forma.
const FORMULA = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]*?)\\\]|<lk-math\b([^>]*)>([\s\S]*?)<\/lk-math>/g;
// Un `<lk-math>` sin display es fórmula solo en su línea: como mucho una viñeta o una cita delante, y nada detrás.
const ANTES_DE_SUELTO = /^\s*(?:>\s*)*(?:[-*+]\s+|\d{1,3}[.)]\s+)?$/;
// El salto de renglón de una fórmula: `\\`, con su espaciado opcional (`\\[2pt]`).
const SALTO = /\\\\(?:\[[^\]]*\])?/;
// Las entidades HTML que una página escribe dentro de una fórmula, leídas como el signo que son.
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
// Las letras griegas que una fórmula escribe como comando: una variable, no un número.
const GRIEGAS = new Map([
  ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['epsilon', 'ε'], ['theta', 'θ'], ['lambda', 'λ'],
  ['mu', 'μ'], ['pi', 'π'], ['rho', 'ρ'], ['sigma', 'σ'], ['tau', 'τ'], ['phi', 'φ'], ['omega', 'ω'],
  ['Delta', 'Δ'], ['Sigma', 'Σ'], ['Omega', 'Ω'],
]);

const renglon = (raw) => raw.replace(MARCA, '').trim().replace(/^`/, '').replace(/`$/, '').trim();

// Un renglón de la forma `<expr> = <expr>`: exactamente un `=`, y a cada lado una expresión.
const ecuacion = (texto) => {
  const partes = texto.split('=');
  return partes.length === 2 && partes.every((p) => p.trim() !== '' && LADO.test(p.trim()));
};

// El lado que sustituye números: solo cifras y operadores (una letra es una variable sin sustituir).
const numerico = (lado) => {
  if (LLAMADA.test(lado)) return null;
  const s = lado.replace(PALABRA, ' ').trim();
  return /\d/.test(s) && NUMEROS.test(s) ? s : null;
};

// Un renglón de cuenta: una ecuación con un lado numérico, en la forma de un renglón de paso (`isStepLine`, el del
// registro: corto, con cifra y signo, y no una frase). Dice también si la sustitución lleva una operación.
const cuenta = (texto) => {
  if (!ecuacion(texto) || !isStepLine(texto)) return null;
  const lados = texto.split('=').map(numerico).filter(Boolean);
  return lados.length ? { operacion: lados.some((s) => OPERACION.test(s)) } : null;
};

// Un tramo de renglones de texto: dos o más cuentas, y una operación entre ellas.
const hallazgoDeRenglones = (renglones) => {
  const cuentas = renglones.filter((r) => cuenta(r.texto));
  if (cuentas.length < 2 || !cuentas.some((r) => cuenta(r.texto).operacion)) return null;
  return { desde: cuentas[0].desde, hasta: cuentas.at(-1).hasta, n: cuentas.length };
};

// Una figura del kit (`<lk-…>`, hasta su cierre) se cambia por una marca que no es texto, con sus saltos de línea, para
// que el número de línea sea el del archivo. `<lk-math>` se queda cuando `conMath`: es una fórmula, no una figura.
const blanqueaFiguras = (src, conMath) => {
  let out = '';
  let at = 0;
  for (const open of src.matchAll(/<(lk-[a-z-]+)\b[^>]*>/g)) {
    if (open.index < at) continue;
    const nombre = open[1];
    if (conMath && nombre === 'lk-math') continue;
    const cierre = `</${nombre}>`;
    const cierreAt = src.indexOf(cierre, open.index + open[0].length);
    if (cierreAt < 0) continue;
    const end = cierreAt + cierre.length;
    out += `${src.slice(at, open.index)}\u0001${src.slice(open.index, end).replace(/[^\n]/g, '')}`;
    at = end;
  }
  return out + src.slice(at);
};

// Lo que se lee como texto: sin figuras del kit, `<lk-math>` incluido, y sin fórmulas de display.
const sinFiguras = (src) => blanqueaFiguras(src, false).replace(FORMULA, (bloque) => `\u0001${bloque.replace(/[^\n]/g, '')}`);

const calculosEnTexto = (src) => {
  const lineas = sinFiguras(src).split('\n');
  const hallazgos = [];
  let tramo = [];
  const cierra = () => {
    const h = hallazgoDeRenglones(tramo);
    if (h) hallazgos.push(h);
    tramo = [];
  };
  for (let i = 0; i < lineas.length; i++) {
    const t = lineas[i].trim();
    if (t.startsWith('```')) {
      cierra();
      const lang = t.slice(3).trim().toLowerCase();
      const cuerpo = [];
      let j = i + 1;
      for (; j < lineas.length && !lineas[j].trim().startsWith('```'); j++) cuerpo.push({ desde: j + 1, hasta: j + 1, texto: renglon(lineas[j]) });
      if (!CODIGO.has(lang)) {
        const h = hallazgoDeRenglones(cuerpo);
        if (h) hallazgos.push(h);
      }
      i = j;
      continue;
    }
    // Una línea en blanco no separa dos renglones de cuenta; cualquier otra línea que no sea una ecuación sí.
    if (t === '') continue;
    const texto = renglon(lineas[i]);
    if (ecuacion(texto)) tramo.push({ desde: i + 1, hasta: i + 1, texto });
    else cierra();
  }
  cierra();
  return hallazgos;
};

// La fórmula en la forma de texto que lee la regla. Las entidades HTML se leen como su signo; los entornos
// (`\begin{…}`, `\end{…}`, la columna de un `array`) y las marcas de maquetación (`\nonumber`, `\label{…}`) no son parte
// de la cuenta; las fracciones son cocientes, las raíces potencias y los índices van entre paréntesis; las letras
// griegas son letras. Lo que queda se lee como un renglón de texto.
const normaliza = (contenido) => {
  let s = contenido.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e) => ENTIDADES[e])
    .replace(/\s+/g, ' ')
    .replace(/\\begin\{array\}\{[^{}]*\}/g, ' ')
    .replace(/\\(?:begin|end)\{[^{}]*\}/g, ' ')
    .replace(/\\(?:label|tag)\{[^{}]*\}/g, ' ')
    .replace(/\\(?:hline|nonumber|notag)\b/g, ' ')
    .replace(/\\(?:left|right|displaystyle|textstyle|quad|qquad)\b/g, ' ')
    .replace(/\\[,;:! ]/g, ' ')
    // `\cdots` antes que `\cdot`: el puntillo de los puntos suspensivos no es un producto.
    .replace(/\\cdots/g, ' ')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\(?:text|textrm|textbf|mathrm|mathbf|mathit|mathsf|operatorname)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\([a-zA-Z]+)/g, (m, nombre) => GRIEGAS.get(nombre) ?? m);
  for (let previo = ''; previo !== s; ) {
    previo = s;
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\[dt]?frac([0-9])([0-9])/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '($1)^(1/2)');
  }
  return s.replace(/([\^_])\{([^{}]*)\}/g, '$1($2)')
    .replace(/\\\\/g, ' ')
    .replace(/&/g, '')
    .replace(/\\([a-zA-Z]+)/g, ' $1 ')
    .replace(/\\(.)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Los renglones de una fórmula: cada `\\` es un renglón. Un renglón que empieza por `=` (la continuación de un `aligned`,
// `align` o `array`, con su `&` ya quitado) toma el lado izquierdo del último renglón que lo tenga.
const renglonesDeFormula = (contenido) => {
  const renglones = [];
  let ladoPrevio = null;
  for (const parte of contenido.split(SALTO)) {
    let texto = normaliza(parte);
    if (texto === '') continue;
    if (texto.startsWith('=') && ladoPrevio !== null) texto = ladoPrevio + texto;
    const i = texto.indexOf('=');
    if (i > 0) ladoPrevio = texto.slice(0, i).trim();
    renglones.push(texto);
  }
  return renglones;
};

const lineaDe = (texto, indice) => (texto.slice(0, indice).match(/\n/g) ?? []).length + 1;

// Un `<lk-math>` sin display es fórmula solo si está en su línea: como mucho una viñeta o una cita delante, y nada detrás.
const soloEnSuLinea = (texto, inicio, fin) => {
  const antes = texto.slice(texto.lastIndexOf('\n', inicio - 1) + 1, inicio);
  const cierre = texto.indexOf('\n', fin);
  return ANTES_DE_SUELTO.test(antes) && /^\s*$/.test(texto.slice(fin, cierre < 0 ? texto.length : cierre));
};

const bloquesDeFormula = (texto) => {
  const bloques = [];
  for (const m of texto.matchAll(FORMULA)) {
    const fin = m.index + m[0].length;
    let inicio = m.index;
    let contenido = m[1] ?? m[2];
    if (contenido === undefined) {
      if (!/\bdisplay\b/.test(m[3]) && !soloEnSuLinea(texto, m.index, fin)) continue;
      contenido = m[4];
      // Un suelto empieza al principio de su línea: su viñeta es de la línea, no del hueco entre dos fórmulas.
      inicio = texto.lastIndexOf('\n', m.index - 1) + 1;
    }
    const calculos = renglonesDeFormula(contenido).map((r) => cuenta(r)).filter(Boolean);
    bloques.push({ inicio, fin, desde: lineaDe(texto, m.index), hasta: lineaDe(texto, fin - 1), calculos });
  }
  return bloques;
};

// Una serie: dos o más renglones de cuenta entre sus fórmulas, y una operación entre ellos.
const hallazgoDeSerie = (serie) => {
  const conCalculo = serie.filter((b) => b.calculos.length > 0);
  const n = conCalculo.reduce((total, b) => total + b.calculos.length, 0);
  if (n < 2 || !conCalculo.some((b) => b.calculos.some((c) => c.operacion))) return null;
  return { desde: conCalculo[0].desde, hasta: conCalculo.at(-1).hasta, n };
};

// El texto donde se leen las fórmulas: sin las cercas de código (`sinCercasPorRenglon`, de `tools/lib`), sin las figuras
// del kit (salvo `<lk-math>`) y sin el código de línea, que es texto citado. Cada cerca deja su marca y sus saltos de línea.
const visible = (src) => blanqueaFiguras(sinCercasPorRenglon(src), true).replace(/`[^`\n]*`/g, '\u0001');

// Una serie de fórmulas: cada una sigue a la anterior con solo blancos entre las dos. Una frase, una etiqueta o una
// figura entre ellas la corta.
const formulas = (src) => {
  const texto = visible(src);
  const hallazgos = [];
  let serie = [];
  const cierra = () => {
    const h = hallazgoDeSerie(serie);
    if (h) hallazgos.push(h);
    serie = [];
  };
  for (const b of bloquesDeFormula(texto)) {
    if (serie.length && /^\s*$/.test(texto.slice(serie.at(-1).fin, b.inicio))) serie.push(b);
    else {
      cierra();
      serie.push(b);
    }
  }
  cierra();
  return hallazgos;
};

export default {
  id: 'calculo-en-texto',
  authoringOnly: true,
  check({ src }) {
    const texto = src.replace(ESPACIOS, ' ');
    const hallazgos = [...calculosEnTexto(texto), ...formulas(texto)].sort((a, b) => a.desde - b.desde);
    return {
      ok: hallazgos.length === 0,
      detail: hallazgos.length
        ? `${hallazgos.length} cálculo(s) escrito(s) como texto o como fórmulas · dibuja cada uno como <lk-story kind="derivation">: un paso por renglón o por fórmula, el término que cambia en focus y un summary con el resultado`
        : '',
      items: hallazgos.map((h) => ({ linea: `líneas ${h.desde}–${h.hasta} · cuenta de ${h.n} renglones` })),
    };
  },
};
