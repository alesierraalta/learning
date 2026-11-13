// ¿En qué registro está escrito un texto? Esta herramienta mide, no juzga.
//
// Nace de la queja del alumno: nuestras explicaciones no suenan como las que él
// señala como referencia. Antes de poner una puerta hay que saber qué número
// separa los dos corpus de verdad, y con qué umbral. Esto calcula los números;
// `report.md` dice cuáles separan y de dónde sale cada umbral.
//
// Dos capas, porque el registro tiene dos mitades:
//   - la frase: palabras por frase, sílabas, nominalizaciones, sujeto abstracto,
//     términos sin explicar, tuteo, frases largas;
//   - el mecanismo: ruta al abrir, un solo ejemplo que muta, escena antes de
//     definición, definición ligada al ejemplo, contraste, aritmética paso a paso.
//
// La medida que manda es `terminosSinExplicar`: el fallo concreto que reportó el
// alumno fue «ejecuta código secuencial en el buffer de la memoria», sin decir en
// palabras qué es el buffer. Un término es técnico si es `código`, si es una sigla
// o si su raíz no está en `lexico-comun.txt` (español corriente por frecuencia).
//
// Uso:
//   node tools/register/measure.mjs                  # los dos corpus, tabla
//   node tools/register/measure.mjs --json           # lo mismo, en JSON
//   node tools/register/measure.mjs --text nota.md   # un texto suelto
//   node tools/register/measure.mjs --corpus ref     # sólo un corpus
//   node tools/register/measure.mjs --terms          # términos sin explicar

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEXICON_FILE = join(HERE, 'lexico-comun.txt');

/* ------------------------------------------------------------------ */
/* Léxico                                                              */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set(
  `a al algo algún alguna algunas alguno algunos ante antes aquel aquella aquellas aquello aquellos aqui así aun aún cada como con contra cual cuales cualquier cuando de del desde donde dos el ella ellas ello ellos en entre era eran eres es esa esas ese eso esos esta estaba estado estas este esto estos estoy fue fueron ha habia había han has hasta hay la las le les lo los mas más me mi mientras mismo mucho muchos muy nada ni no nos nosotros nuestra nuestro o os otra otro para pero poco por porque que qué quien quienes se sea sean según ser si sí sin sobre sois somos son soy su sus también tan tanto te tenemos tener tiene tienen todo todos tu tus un una uno unos vosotros vuestra vuestro y ya yo`.split(
    /\s+/,
  ),
);

/**
 * Sustantivos de dominio: español corriente que en estas partes es el concepto
 * que se está enseñando. La lista es corta a propósito — sólo lo que el alumno
 * nombró y los conceptos que las dos materias usan como término. Meter aquí
 * palabras como «estructura» o «proceso» convierte la medida en ruido.
 */
const TECHNICAL_EXTRA = new Set(
  `sesión sesion commit rollback savepoint buffer transacción transaccion tupla bloque segmento marcador esquema cursor bloqueo ámbito ambito préstamo prestamo ownership grafo trellis cuantización cuantizacion payload codebook token tensor router episodio descuento horizonte recompensa retorno política politica estado acción accion valor modelo agente entorno experto secuencial procedural transaccional tipado tipada anónimo anonimo huérfana huerfana foránea foranea bidimensional inmutable mutable desnormalización desnormalizacion`.split(
    /\s+/,
  ),
);

/** Sujetos abstractos: la cosa que actúa sin que nadie actúe. */
const ABSTRACT_NOUNS = new Set(
  `sistema motor sesión sesion proceso mecanismo arquitectura estructura interfaz buffer transacción transaccion capa módulo modulo componente flujo estado nivel conjunto modelo política politica función funcion algoritmo protocolo canal segmento gestor planificador subsistema abstracción abstraccion implementación implementacion operación operacion ejecución ejecucion gestión gestion control comportamiento rendimiento capacidad entorno agente retorno recompensa valor trellis cuantización cuantizacion payload metadata stream codebook experto backbone router grafo camino transición transicion episodio horizonte descuento actualización actualizacion iteración iteracion evaluación evaluacion`.split(
    /\s+/,
  ),
);

/** Nominalización: el sustantivo que se comió al verbo. */
const NOMINALIZATION = /(?:ciones|ción|siones|sión|mientos|miento|dades|dad|encias|encia)$/i;

/** Marcadores de ejemplo concreto. */
const EXAMPLE_MARKERS = [
  /\bpor ejemplo\b/i,
  /\bejemplo conductor\b/i,
  /\ben nuestro ejemplo\b/i,
  /\bnuestro ejemplo\b/i,
  /\bimagina(?:te|mos)?\b/i,
  /\bsupongamos\b/i,
  /\bsupón\b/i,
  /\busaremos siempre el mismo ejemplo\b/i,
  /\bel caso concreto\b/i,
  /\bnuestro caso\b/i,
  /\btenemos un\b/i,
];

/**
 * Verbos que presentan un término en palabras llanas: «X es», «X significa»,
 * «X contiene», «X intenta predecir».
 *
 * La distinción que hace útil la medida: la referencia explica con verbos
 * explicativos (es, significa, contiene, intenta, mide, representa) y nuestras
 * partes describen con verbos de máquina (ejecuta, intercepta, fija, retiene,
 * vincula, agrupa). Los segundos no están aquí a propósito.
 */
const CUE_WORDS =
  'es|son|era|eran|significa|significan|sirve|sirven|se refiere|consiste|quiere decir|representa|indica|contiene|guarda|devuelve|permite|mide|determina|intenta|define|describe|calcula|llamamos|llamaremos|llamado|llamada|denominado|denominada';

const DEFINITION_CUE = new RegExp(`\\b(?:${CUE_WORDS})\\b`, 'i');

/** Ligadura término → valor del ejemplo: «En nuestro ejemplo: agente = robot». */
const BINDING_CUE = /(?:en nuestro ejemplo|en este caso|en el ejemplo|nuestro ejemplo|aquí|aqui|ejemplo)\s*[:,]/i;

/** Contraste explícito: la prueba de que el texto enseña comparando. */
const CONTRAST_MARKERS = [
  /\bantes\b/gi,
  /\bdespués\b/gi,
  /\bdespues\b/gi,
  /\ben cambio\b/gi,
  /\ba diferencia\b/gi,
  /\bal revés\b/gi,
  /\bal reves\b/gi,
  /\bpor el contrario\b/gi,
  /\ben lugar de\b/gi,
  /\bes incorrecto\b/gi,
  /\bno es lo mismo\b/gi,
  /\bvisualmente\b/gi,
  /\bno exactamente\b/gi,
];

/** Segunda persona: el texto le habla a alguien. */
const TUTEO =
  /\b(?:tú|tu|tus|ti|te|tienes|tenías|tendrás|puedes|podías|podrás|debes|deberías|haces|harás|hiciste|ves|verás|sabes|sabrás|quieres|querrás|imagina|imagínate|supón|supongamos|fíjate|fijate|piensa|mira|aprende|apréndetelas|usas|usarás|creas|crearás|escribes|escribirás|declaras|ejecutas|obtienes|obtendrás|lees|leerás|dices|dirás|pones|pondrás|tomas|tomarás|necesitas|necesitarás|encuentras|encontrarás|empiezas|empezarás|recuerda|ten en cuenta)\b/i;

/** Primera persona del plural inclusiva: «abramos esa caja», «veamos». */
const NOSOTROS =
  /\b(?:nosotros|usamos|usaremos|usábamos|veamos|vemos|vimos|supongamos|imaginemos|hagamos|llamemos|multiplicamos|dividimos|restamos|sumamos|observa|abramos|podemos|necesitamos|queremos|empezamos|construimos|vamos a|tenemos|sabemos|elegimos|medimos|comparamos|escribimos|decimos|pensamos|volvemos|seguimos|acabamos|pasamos|dejamos|ponemos|tomamos)\b/i;

/** Palabras en negrita que no son términos del tema. */
const BOLD_STOPLIST = new Set(
  `fuente ruta importante nota ojo simplificado resumen en resumen cuidado atención atencion`.split(/\s+/),
);

const CODE_LANGS = new Set([
  'sql',
  'js',
  'ts',
  'javascript',
  'typescript',
  'bash',
  'sh',
  'json',
  'rust',
  'python',
  'html',
  'css',
  'yaml',
  'yml',
  'tsx',
  'jsx',
  'go',
]);

/* ------------------------------------------------------------------ */
/* Raíces                                                              */
/* ------------------------------------------------------------------ */

const DERIVATIONAL = [
  'mente', 'idades', 'idad', 'aciones', 'acion', 'ciones', 'cion', 'siones', 'sion',
  'encias', 'encia', 'ancias', 'ancia', 'dades', 'dad', 'mientos', 'miento', 'ivos',
  'ivo', 'ivas', 'iva', 'osos', 'oso', 'osas', 'osa', 'ables', 'able', 'ibles',
  'ible', 'ales', 'al', 'istas', 'ista', 'ismos', 'ismo', 'dores', 'dor', 'doras', 'dora',
];
const VERBAL = [
  'andose', 'iendose', 'arse', 'erse', 'irse', 'ando', 'iendo', 'aron', 'ieron',
  'amos', 'emos', 'imos', 'aban', 'ian', 'aba', 'ia', 'ado', 'ada', 'idos', 'idas',
  'ido', 'ida', 'an', 'en', 'as', 'es', 'ar', 'er', 'ir', 'a', 'e', 'o',
];

const stripAccents = (w) => w.normalize('NFD').replace(/\p{M}+/gu, '');

/**
 * Raíz de una palabra española: quita plural, derivación y desinencia verbal,
 * hasta que la palabra deja de cambiar. Es tosca a propósito — sólo se usa para
 * preguntar «¿esta raíz está en el léxico corriente?», no para lingüística.
 */
export function stem(word) {
  let w = stripAccents(String(word).toLowerCase()).replace(/[^a-zñ]/g, '');
  if (w.length <= 3) return w;
  for (let pass = 0; pass < 3; pass++) {
    const before = w;
    for (const s of DERIVATIONAL) {
      if (w.endsWith(s) && w.length - s.length >= 3) {
        w = w.slice(0, -s.length);
        break;
      }
    }
    for (const s of VERBAL) {
      if (w.endsWith(s) && w.length - s.length >= 3) {
        w = w.slice(0, -s.length);
        break;
      }
    }
    if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1);
    if (w === before) break;
  }
  return w;
}

let lexicon = null;

/** Raíces del español corriente. Se lee una vez; si falta el archivo, no hay léxico. */
export function loadLexicon(file = LEXICON_FILE) {
  if (lexicon) return lexicon;
  lexicon = new Set();
  if (!existsSync(file)) return lexicon;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const w = line.trim();
    if (!w || w.startsWith('#')) continue;
    lexicon.add(w);
  }
  return lexicon;
}

/** ¿Es español corriente? Las palabras cortas y los números lo son. */
export function isCommonWord(word) {
  const w = String(word).toLowerCase();
  if (!/^\p{L}+$/u.test(w)) return true;
  if (w.length <= 3) return true;
  const lex = loadLexicon();
  if (!lex.size) return true; // sin léxico no se acusa a nadie
  return lex.has(stem(w));
}

/* ------------------------------------------------------------------ */
/* Extracción de prosa                                                 */
/* ------------------------------------------------------------------ */

const STEP_LINE = /^(?=.*\d)(?=.*[=+\-×*/^≈→]).{0,90}$/;
const BOX_DRAWING = /[┌┐└┘│─├┤┬┴┼►◄▼▲█▂▃▄▅▆▇]/;

/** Una línea que es una cuenta, no una frase. */
export function isStepLine(line) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (!STEP_LINE.test(t)) return false;
  if (/[.!?]$/.test(t) && /[a-záéíóúñ]{4,}\s+[a-záéíóúñ]{4,}/i.test(t)) return false;
  return true;
}

/**
 * El texto que un lector lee como prosa: sin portada, sin código, sin tablas,
 * sin piezas `lk-*`, sin quiz, sin diagramas de caja. Se conservan la negrita
 * (es cómo el texto nombra un término) y las cuentas paso a paso (son el
 * mecanismo que el alumno señala como bueno), que se devuelven aparte.
 */
/**
 * Una línea de fuente o de atribución nombra de dónde sale el texto («**Fuente**: RFC 9293…»,
 * «Fuente: …»). No es prosa de la explicación: sus siglas no son términos que la parte deba explicar.
 * «Fuente de datos…» sí es prosa: la fuente va con dos puntos o en negrita, nunca como frase suelta.
 */
const SOURCE_LINE = /^(?:\*\*(?:fuentes?|sources?)\*\*|\*?(?:fuentes?|sources?)\*?\s*:)/i;

export function extractProse(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const prose = [];
  const steps = [];
  let i = 0;

  if (lines[0] !== undefined && lines[0].trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end > 0) i = end + 1;
  }

  let inQuiz = false;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    // Piezas del motor: el JSON no es prosa.
    if (/^<lk-[a-z-]+/i.test(t)) {
      if (!/<\/lk-[a-z-]+>\s*$/i.test(t)) {
        while (i + 1 < lines.length && !/<\/lk-[a-z-]+>/i.test(lines[i])) i++;
      }
      continue;
    }

    // Bloques cercados: el código se va; las cuentas se quedan como pasos.
    if (t.startsWith('```')) {
      const lang = t.slice(3).trim().toLowerCase();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      if (!CODE_LANGS.has(lang)) {
        const filled = body.filter((l) => l.trim());
        const arithmetic = filled.filter((l) => isStepLine(l)).length;
        const diagram = filled.some((l) => BOX_DRAWING.test(l));
        if (!diagram && arithmetic >= 2) steps.push(...filled.map((l) => l.trim()));
      }
      continue;
    }

    // Matemática en bloque: es la aritmética renglón a renglón.
    if (t.startsWith('\\[')) {
      const buf = [];
      while (i < lines.length && !/\\\]/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) buf.push(lines[i]);
      const step = buf.join(' ').replace(/\\\[|\\\]/g, '').trim();
      if (step) steps.push(step);
      continue;
    }

    // Encabezados: fuera, salvo que el encabezado sea el término en negrita
    // («### **Agente**»): ahí el título es la introducción del término.
    if (/^#{1,6}\s/.test(t)) {
      inQuiz = /quiz/i.test(t);
      const boldOnly = t.replace(/^#{1,6}\s+/, '').trim().match(/^\*\*([^*]+)\*\*:?$/);
      if (boldOnly && !SOURCE_LINE.test(boldOnly[0])) prose.push(`**${boldOnly[1].trim()}**`);
      continue;
    }
    if (inQuiz) continue;

    if (t.startsWith('|')) continue; // tablas
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) continue; // separadores

    let body = t.replace(/^>\s?/, '');
    body = body.replace(/:chatgpt-content-reference\{[^}]*\}/g, '');
    body = body.replace(/\[([^\]]+)\]\((?:https?:)[^)]*\)/g, '$1');
    body = body.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    if (!body.trim() || SOURCE_LINE.test(body.trim())) continue;
    prose.push(body.trim());
  }

  return { prose: prose.join('\n'), steps };
}

/* ------------------------------------------------------------------ */
/* Frases y palabras                                                   */
/* ------------------------------------------------------------------ */

const ABBREVIATIONS = new Set(
  `p.ej ej etc vs aprox núm num fig cap art dr dra sr sra ud uds ee.uu a.c d.c p pp vol ed trad máx mín inc s.l s.a tel av`.split(
    /\s+/,
  ),
);

const CLOSERS = new Set(['»', '"', '”', '’', ')', ']', "'"]);

/** Parte una línea en frases sin romper decimales, siglas ni comillas de cierre. */
export function splitInline(line) {
  const chars = [...line];
  const out = [];
  let buf = '';
  for (let i = 0; i < chars.length; i++) {
    buf += chars[i];
    const c = chars[i];
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    while (i + 1 < chars.length && /[.!?…]/.test(chars[i + 1])) buf += chars[++i];
    while (i + 1 < chars.length && CLOSERS.has(chars[i + 1])) buf += chars[++i];
    const next = chars[i + 1];
    if (next === undefined) break;
    if (!/\s/.test(next)) continue;
    const head = buf.trim();
    const lastWord = head.replace(/[.!?…»"”’)\]']+$/, '').split(/\s+/).pop() ?? '';
    if (ABBREVIATIONS.has(lastWord.toLowerCase())) {
      // «El motor, etc. Y sigue» son dos frases; «Dr. García» es una sola.
      const rest = chars.slice(i + 1).join('').trimStart()[0] ?? '';
      const title = /^(?:dr|dra|sr|sra|ud|uds|d|dña)$/i.test(lastWord);
      if (title || !/^[A-ZÁÉÍÓÚÑ¿¡«"]/.test(rest)) continue;
    }
    if (/^\d+$/.test(lastWord)) continue;
    if (head.length < 3) continue;
    out.push(head);
    buf = '';
    while (i + 1 < chars.length && /\s/.test(chars[i + 1])) i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Frases del texto: cada línea es un párrafo; las listas son frases propias. */
export function splitSentences(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      const body = item[1].trim();
      if (body) out.push(body);
      continue;
    }
    for (const s of splitInline(line)) if (s.trim()) out.push(s.trim());
  }
  return out.filter((s) => /\p{L}/u.test(s));
}

const WORD = /\d+(?:[.,]\d+)*|[\p{L}][\p{L}\p{M}’'_-]*/gu;

/** Palabras: números con sus decimales, letras con apóstrofos y guiones bajos. */
export function tokenize(text) {
  const clean = text
    .replace(/`[^`]*`/g, ' ')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/[*_#>|]/g, ' ');
  return (clean.match(WORD) ?? []).map((w) => w.replace(/[’']s$/, ''));
}

const VOWELS = 'aeiouáéíóúü';
const STRONG = 'aeoáéó';
const ACCENTED_WEAK = 'íú';

/** Sílabas de una palabra española: un núcleo vocálico por sílaba. */
export function syllables(word) {
  const w = String(word)
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-záéíóúüñ]/g, '');
  if (!w) return 0;
  const groups = [];
  let cur = '';
  for (const ch of w) {
    if (VOWELS.includes(ch)) cur += ch;
    else if (cur) {
      groups.push(cur);
      cur = '';
    }
  }
  if (cur) groups.push(cur);
  let total = 0;
  for (const g of groups) {
    let i = 0;
    while (i < g.length) {
      total += 1;
      const a = g[i];
      const b = g[i + 1];
      if (!b) break;
      const hiatus =
        (STRONG.includes(a) && STRONG.includes(b)) || ACCENTED_WEAK.includes(a) || ACCENTED_WEAK.includes(b);
      i += hiatus ? 1 : 2;
    }
  }
  return Math.max(1, total);
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
export const percentile = (xs, p) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/* ------------------------------------------------------------------ */
/* Medidas de frase                                                    */
/* ------------------------------------------------------------------ */

const words = (s) => tokenize(s).length;

const isNominalization = (w) => w.length >= 6 && NOMINALIZATION.test(w);

function nominalizationsPer100(tokens) {
  const hits = tokens.filter(isNominalization).length;
  return tokens.length ? (hits / tokens.length) * 100 : 0;
}

/** El sujeto es una cosa que no hace nada visible. */
export function hasAbstractSubject(sentence) {
  const tokens = tokenize(sentence);
  if (!tokens.length) return false;
  const lower = tokens.map((t) => t.toLowerCase());
  const DET = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'este', 'esta', 'estos', 'estas',
    'ese', 'esa', 'cada', 'todo', 'toda', 'todos', 'todas', 'nuestro', 'nuestra', 'su', 'sus',
  ]);
  let head = null;
  if (DET.has(lower[0])) {
    for (let i = 1; i < Math.min(lower.length, 5); i++) {
      if (STOPWORDS.has(lower[i])) continue;
      head = lower[i];
      break;
    }
  } else if (lower[0] && !STOPWORDS.has(lower[0])) {
    head = lower[0];
  }
  if (!head) return false;
  return ABSTRACT_NOUNS.has(head) || isNominalization(head);
}

/* ------------------------------------------------------------------ */
/* Términos técnicos                                                   */
/* ------------------------------------------------------------------ */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Un token es término técnico si es sigla, está en el dominio o no es español corriente. */
export function isTechnicalWord(word) {
  const w = String(word).trim();
  if (!w) return false;
  if (/^[\p{Lu}\p{N}][\p{Lu}\p{N}\/-]{1,}$/u.test(w)) return true; // siglas: DML, SYN, EXL3, PL/SQL
  if (TECHNICAL_EXTRA.has(w.toLowerCase())) return true;
  return !isCommonWord(w);
}

/**
 * Términos del texto, con su tipo. `code` y `acronym` siempre cuentan; una
 * palabra rara cuenta si no es un nombre propio suelto (mayúscula inicial y una
 * sola aparición: «Feuerstein» no es un término que haya que explicar).
 *
 * Una negrita sólo es término si es una etiqueta sola en su línea («**Agente**»)
 * o si la palabra ya es técnica: la negrita de énfasis («**ahora**») no pide
 * explicación.
 */
export function technicalTerms(text) {
  const terms = new Map();
  const add = (term, kind) => {
    const key = plain(term);
    if (!key || key.length < 2) return;
    if (BOLD_STOPLIST.has(key.toLowerCase())) return;
    const prev = terms.get(key);
    if (!prev) terms.set(key, { kind, count: 1 });
    else prev.count += 1;
  };

  // Código en línea: no todo lo que va entre comillas invertidas es un término.
  // `c1`, `&libro` o `refs/heads/main` son valores del ejemplo, no conceptos que
  // haya que definir; `%TYPE`, `SAVEPOINT` o `flex-direction` sí.
  const isValue = (s) => s.length <= 2 || /^[&"'\d]/.test(s) || /[=/]/.test(s);
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const inner = m[1].trim().split(/[\s(=,;:]/)[0];
    if (!inner || inner.length < 2 || !/\p{L}/u.test(inner)) continue;
    if (isValue(inner)) continue;
    add(inner, 'code');
  }

  // Negritas: etiqueta sola en su línea, o palabra que ya es técnica.
  for (const line of text.split('\n')) {
    const label = line.trim().match(/^\*\*([^*]+)\*\*:?$/);
    if (!label) continue;
    const inner = label[1].trim();
    if (inner.split(/\s+/).length > 4) continue; // una pregunta en negrita no es un término
    if (/[?!]/.test(inner)) continue;
    if (!/\p{L}{2,}/u.test(inner)) continue; // «2,758 bits/peso» es un resultado, no un término
    add(inner, 'bold');
  }
  // Negrita dentro de una frase: sólo cuenta si es una sola palabra técnica.
  // Una frase en negrita es énfasis («**estructura en los datos**»), no un término.
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const inner = m[1].trim();
    if (!inner || inner.length > 40 || /\s/.test(inner)) continue;
    if (isTechnicalWord(inner)) add(inner, 'bold');
  }

  const tokens = text.match(/[\p{L}][\p{L}\p{M}’'_]*/gu) ?? [];
  const seen = new Map();
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, { surface: t, count: 0 });
    seen.get(key).count += 1;
  }
  for (const [key, info] of seen) {
    if (key.length < 3) continue;
    if (STOPWORDS.has(key)) continue;
    if (!isTechnicalWord(info.surface)) continue;
    const properName = /^\p{Lu}/u.test(info.surface) && !/^\p{Lu}[\p{Lu}\p{N}\/-]+$/u.test(info.surface);
    if (properName && info.count === 1) continue;
    add(info.surface, /^[\p{Lu}\p{N}][\p{Lu}\p{N}\/-]+$/u.test(info.surface) ? 'acronym' : 'rare');
  }
  return terms;
}

/**
 * El texto sin marcas: la negrita, el código y la notación matemática no cuentan
 * como palabras distintas. «acción \(a_t\)» y «acción» son el mismo término.
 */
const plain = (s) =>
  String(s)
    .replace(/\\\([^)]*\\\)/g, '')
    .replace(/\\\[[^\]]*\\\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const mentions = (sentence, term) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(term.replace(/[`*]/g, ''))}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(sentence);

/**
 * ¿El término se explica en palabras llanas en alguna de sus apariciones?
 *
 * No se exige la primera: la ruta del principio nombra los términos sin
 * definirlos, y eso es el mapa, no el fallo. Lo que se exige es que el texto los
 * defina en algún momento con una frase llana, no que los use y siga.
 */
export function explainedAtFirstUse(term, sentences) {
  const bare = plain(term);
  if (!bare) return false;
  let seen = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (!mentions(plain(sentences[i]), bare)) continue;
    if (definedAround(bare, sentences, i)) return true;
    if (++seen >= 40) break;
  }
  return false;
}

function definedAround(bare, sentences, index) {
  const here = plain(sentences[index]);
  const next = plain(sentences[index + 1] ?? '');
  const window = `${here} ${next}`;
  // «X es», «X contiene», «X intenta predecir»: hasta tres palabras de por medio.
  const after = new RegExp(`${escape(bare)}(?:\\s+[\\p{L}]{2,8}){0,3}\\s+(?:${CUE_WORDS})\\b`, 'iu');
  if (after.test(window)) return true;
  // «A eso lo llamamos retorno», «se llama episodio»: el verbo va delante.
  if (new RegExp(`(?:llamamos|llamaremos|llamad[oa]|denominad[oa]|conocid[oa] como|se llama)\\s+${escape(bare)}`, 'i').test(window)) return true;
  // Glosa entre paréntesis o con dos puntos: «(X: …)», «X: …».
  if (new RegExp(`\\(\\s*${escape(bare)}\\s*:`, 'i').test(window)) return true;
  if (new RegExp(`${escape(bare)}\\s*[:=]`, 'i').test(here)) return true;
  // El término va solo en su línea y la frase siguiente lo define: «**Agente**» → «Es quien…».
  if (/^\*\*[^*]+\*\*:?$/.test(sentences[index].trim()) && /^(?:Es|Son|Un|Una)\b/.test(next)) return true;
  // La definición llega en la frase siguiente y el término vuelve a nombrarse ahí.
  if (DEFINITION_CUE.test(sentences[index + 1] ?? '') && mentions(next, bare)) return true;
  return false;
}

/**
 * ¿El término queda atado al ejemplo concreto? Vale la ligadura en la misma
 * frase («En nuestro ejemplo: agente = robot») y la que anuncia el ejemplo en la
 * frase anterior y lo resuelve en la siguiente («En nuestro ejemplo:» / «agente =
 * robot aspirador»).
 */
export function boundToExample(term, sentences) {
  const bare = plain(term).trim();
  if (!bare) return false;
  const assignment = new RegExp(`${escape(bare)}\\s*=`, 'i');
  for (let i = 0; i < sentences.length; i++) {
    const here = plain(sentences[i]);
    if (assignment.test(here)) return true;
    if (!mentions(here, bare)) continue;
    const next = plain(sentences[i + 1] ?? '');
    const previous = plain(sentences[i - 1] ?? '');
    if (BINDING_CUE.test(here) || BINDING_CUE.test(previous)) return true;
    if (BINDING_CUE.test(next) && assignment.test(next)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Medidas de mecanismo                                                */
/* ------------------------------------------------------------------ */

/** Ruta al abrir: un itinerario numerado antes de empezar. */
export function hasRoute(prose) {
  const lines = prose.split('\n').filter((l) => l.trim()).slice(0, 16);
  return lines.filter((l) => /^\s*\d+[.)]\s+/.test(l)).length >= 3;
}

/**
 * Las frases que definen un término: la negrita sola en su línea («**Agente**»), o la negrita
 * seguida de «es» o «son», con o sin dos puntos («**Estado**: es todo…»). La forma con dos puntos
 * es la que escriben las partes; la de la referencia es la línea sola.
 */
const ES_DEFINICION = [/^\*\*[^*]+\*\*:?$/, /\*\*[^*]+\*\*:?\s*(?:es|son)\b/i];

/**
 * Dónde está el primer ejemplo concreto y qué definiciones vienen antes de él. Sin ejemplo, todas
 * las definiciones van antes. Lo usa la regla «sin-escena-antes» del checador.
 */
export function definicionesYEjemplos(sentences) {
  const ejemplo = sentences.findIndex((s) => EXAMPLE_MARKERS.some((re) => re.test(s)));
  const definiciones = [];
  sentences.forEach((s, i) => {
    if (ES_DEFINICION.some((re) => re.test(s.trim()))) definiciones.push(i);
  });
  return { ejemplo, definiciones };
}

/** La primera frase donde se nombra el término, o undefined. */
export function primeraMencion(term, sentences) {
  return sentences.find((s) => mentions(plain(s), plain(term)));
}

/** Escena antes de definición: el ejemplo concreto llega antes que el término. */
export function sceneBeforeDefinition(sentences) {
  const sceneAt = sentences.findIndex((s) => EXAMPLE_MARKERS.some((re) => re.test(s)));
  const defAt = sentences.findIndex((s) => /^\*\*[^*]+\*\*:?$/.test(s.trim()) || /\*\*[^*]+\*\*\s*(?:es|son)\b/i.test(s));
  if (sceneAt < 0) return false;
  if (defAt < 0) return true;
  return sceneAt < defAt;
}

/** El ejemplo que muta: un ancla que reaparece, no diez ejemplos sueltos. */
export function runningExample(sentences) {
  const exampleSentences = sentences.filter((s) => EXAMPLE_MARKERS.some((re) => re.test(s)));
  const counts = new Map();
  for (const s of exampleSentences) {
    for (const t of tokenize(s)) {
      const w = t.toLowerCase();
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  let anchor = '';
  let top = 0;
  for (const [w, n] of counts) if (n > top) [anchor, top] = [w, n];
  return {
    exampleSentences: exampleSentences.length,
    anchor,
    dominance: exampleSentences.length ? top / exampleSentences.length : 0,
    distinct: counts.size,
  };
}

function countMatches(text, regexes) {
  let n = 0;
  for (const re of regexes) n += (text.match(re) ?? []).length;
  return n;
}

/* ------------------------------------------------------------------ */
/* Un texto                                                            */
/* ------------------------------------------------------------------ */

/** Todas las medidas de un texto. */
export function measureText(text, { id = 'texto', corpus = 'our' } = {}) {
  const { prose, steps } = extractProse(text);
  const sentences = splitSentences(prose);
  const tokens = tokenize(prose);
  const nWords = tokens.length;
  const per1000 = (n) => (nWords ? (n / nWords) * 1000 : 0);
  const per100 = (n) => (nWords ? (n / nWords) * 100 : 0);

  const lengths = sentences.map((s) => words(s)).filter((n) => n > 0);
  const syllablesTotal = tokens.reduce((a, t) => a + syllables(t), 0);
  const silPer100 = nWords ? (syllablesTotal / nWords) * 100 : 0;
  const sentPer100 = nWords ? (sentences.length / nWords) * 100 : 0;
  const fernandezHuerta = 206.84 - 0.6 * silPer100 - 1.02 * sentPer100;

  const terms = technicalTerms(prose);
  const termList = [...terms.entries()].map(([term, info]) => {
    const sentence = sentences.find((s) => mentions(plain(s), plain(term))) ?? '';
    return {
      term,
      kind: info.kind,
      count: info.count,
      explained: explainedAtFirstUse(term, sentences),
      bound: boundToExample(term, sentences),
      sentence,
    };
  });
  const explained = termList.filter((t) => t.explained).length;
  const bound = termList.filter((t) => t.bound).length;
  const totalUses = termList.reduce((a, t) => a + t.count, 0);
  const explainedUses = termList.filter((t) => t.explained).reduce((a, t) => a + t.count, 0);
  const boundUses = termList.filter((t) => t.bound).reduce((a, t) => a + t.count, 0);

  const boldTerms = [...prose.matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !BOLD_STOPLIST.has(t.toLowerCase()));
  const boldDefined = boldTerms.filter((t) => explainedAtFirstUse(t, sentences)).length;
  const boldBound = boldTerms.filter((t) => boundToExample(t, sentences)).length;

  const example = runningExample(sentences);
  const stepLines = steps.filter((s) => isStepLine(s));
  let run = 0;
  let bestRun = 0;
  for (const s of steps) {
    if (isStepLine(s)) {
      run += 1;
      bestRun = Math.max(bestRun, run);
    } else run = 0;
  }

  return {
    id,
    corpus,
    words: nWords,
    sentences: sentences.length,
    paragraphs: prose.split('\n').filter((l) => l.trim()).length,
    wordsPerSentence: {
      mean: mean(lengths),
      p90: percentile(lengths, 0.9),
      max: lengths.length ? Math.max(...lengths) : 0,
      sd: sd(lengths),
    },
    longSentences: lengths.length ? lengths.filter((n) => n > 25).length / lengths.length : 0,
    fernandezHuerta,
    nominalizationsPer100: nominalizationsPer100(tokens),
    abstractSubject: sentences.length ? sentences.filter(hasAbstractSubject).length / sentences.length : 0,
    terms: termList.length,
    explainedTerms: termList.length ? explained / termList.length : 1,
    boundTerms: termList.length ? bound / termList.length : 1,
    // Ponderado por uso: el concepto que se repite cuarenta veces pesa más que
    // la jerga que pasa una vez. Es la medida que manda.
    explainedWeighted: totalUses ? explainedUses / totalUses : 1,
    boundWeighted: totalUses ? boundUses / totalUses : 1,
    unexplained: termList.filter((t) => !t.explained),
    boldTerms: boldTerms.length,
    boldDefined: boldTerms.length ? boldDefined / boldTerms.length : 1,
    boldBound: boldTerms.length ? boldBound / boldTerms.length : 1,
    boldTermsPer1000: per1000(boldTerms.length),
    tuteo: sentences.length ? sentences.filter((s) => TUTEO.test(s)).length / sentences.length : 0,
    nosotros: sentences.length ? sentences.filter((s) => NOSOTROS.test(s)).length / sentences.length : 0,
    codeSpansPer100: per100((text.match(/`[^`]+`/g) ?? []).length),
    route: hasRoute(prose) ? 1 : 0,
    sceneFirst: sceneBeforeDefinition(sentences) ? 1 : 0,
    exampleSentences: example.exampleSentences,
    exampleAnchor: example.anchor,
    exampleDominance: example.dominance,
    contrastPer1000: per1000(countMatches(prose, CONTRAST_MARKERS)),
    stepsPer1000: per1000(stepLines.length),
    longestStepRun: bestRun,
  };
}

/* ------------------------------------------------------------------ */
/* Corpus                                                              */
/* ------------------------------------------------------------------ */

/**
 * Las medidas que se agregan, con su dirección buena y cómo se escriben.
 *
 * `scope: 'global'` marca las que necesitan el texto entero: un término se
 * explica una vez y luego se usa libremente, así que medirlo por secciones
 * convierte una explicación correcta en un fallo. La referencia se mide entera
 * para esas y por secciones para las de frase.
 */
export const MEASURES = [
  { key: 'wordsPerSentence.mean', label: 'palabras/frase (media)', better: 'down', format: 'num1', scope: 'local' },
  { key: 'wordsPerSentence.p90', label: 'palabras/frase (p90)', better: 'down', format: 'num1', scope: 'local' },
  { key: 'wordsPerSentence.max', label: 'palabras/frase (máx)', better: 'down', format: 'num1', scope: 'local' },
  { key: 'longSentences', label: 'frases >25 palabras', better: 'down', format: 'pct', scope: 'local' },
  { key: 'fernandezHuerta', label: 'Fernández-Huerta', better: 'up', format: 'num1', scope: 'local' },
  { key: 'nominalizationsPer100', label: 'nominalizaciones/100', better: 'down', format: 'num2', scope: 'local' },
  { key: 'abstractSubject', label: 'sujeto abstracto', better: 'down', format: 'pct', scope: 'local' },
  { key: 'explainedWeighted', label: 'términos explicados (por uso)', better: 'up', format: 'pct', scope: 'global' },
  { key: 'explainedTerms', label: 'términos explicados (por tipo)', better: 'up', format: 'pct', scope: 'global' },
  { key: 'boundWeighted', label: 'términos atados al ejemplo (por uso)', better: 'up', format: 'pct', scope: 'global' },
  { key: 'boldDefined', label: 'negritas definidas', better: 'up', format: 'pct', scope: 'global' },
  { key: 'boldBound', label: 'negritas atadas al ejemplo', better: 'up', format: 'pct', scope: 'global' },
  { key: 'boldTermsPer1000', label: 'negritas-término/1000', better: 'up', format: 'num1', scope: 'global' },
  { key: 'tuteo', label: 'tuteo', better: 'none', format: 'pct', scope: 'local' },
  { key: 'nosotros', label: 'nosotros/imperativo', better: 'none', format: 'pct', scope: 'local' },
  { key: 'codeSpansPer100', label: 'código en línea/100', better: 'down', format: 'num2', scope: 'local' },
  { key: 'route', label: 'ruta al abrir', better: 'up', format: 'pct', scope: 'global' },
  { key: 'sceneFirst', label: 'escena antes de definición', better: 'up', format: 'pct', scope: 'global' },
  { key: 'exampleDominance', label: 'dominancia del ejemplo', better: 'up', format: 'pct', scope: 'global' },
  { key: 'contrastPer1000', label: 'contrastes/1000', better: 'up', format: 'num2', scope: 'local' },
  { key: 'stepsPer1000', label: 'pasos de cuenta/1000', better: 'up', format: 'num2', scope: 'global' },
  { key: 'longestStepRun', label: 'racha de cuenta más larga', better: 'up', format: 'num1', scope: 'global' },
];

const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/** Media, dispersión y p90 de un corpus, medida a medida. */
export function aggregate(rows) {
  const out = {};
  for (const m of MEASURES) {
    const values = rows.map((r) => Number(pick(r, m.key) ?? 0)).filter((n) => Number.isFinite(n));
    out[m.key] = {
      mean: mean(values),
      sd: sd(values),
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      p90: percentile(values, 0.9),
      p10: percentile(values, 0.1),
      n: values.length,
    };
  }
  return out;
}

/** d de Cohen: cuánto se separan dos corpus en unidades de desviación. */
export function effectSize(a, b) {
  const pooled = Math.sqrt((a.sd ** 2 + b.sd ** 2) / 2);
  if (!pooled) return a.mean === b.mean ? 0 : Infinity;
  return (a.mean - b.mean) / pooled;
}

export function loadManifest(dir = HERE) {
  const file = join(dir, 'corpus.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function measureCorpus(manifest, dir = HERE) {
  const rows = [];
  for (const entry of manifest.texts) {
    const path = join(dir, entry.file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    rows.push(measureText(text, { id: entry.id, corpus: entry.corpus }));
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '∞');
const pct = (n) => `${(n * 100).toFixed(0)}%`;

const show = (value, format) => {
  if (!Number.isFinite(value)) return '∞';
  if (format === 'pct') return pct(value);
  if (format === 'num2') return fmt(value, 2);
  return fmt(value, 1);
};

function printTable(rows) {
  const groups = [...new Set(rows.map((r) => r.corpus))];
  const agg = Object.fromEntries(groups.map((g) => [g, aggregate(rows.filter((r) => r.corpus === g))]));
  const refLocal = agg.ref ?? agg[groups[0]];
  const refWhole = agg['ref-whole'] ?? refLocal;
  const ours = agg.our ?? agg[groups[groups.length - 1]];
  const secondary = agg.ref2 ?? null;

  console.log(`textos: ${groups.map((g) => `${g}=${rows.filter((r) => r.corpus === g).length}`).join('  ')}`);
  console.log(
    `palabras: ${groups.map((g) => `${g}=${rows.filter((r) => r.corpus === g).reduce((a, r) => a + r.words, 0)}`).join('  ')}`,
  );
  console.log('');
  const header = ['medida', 'ref media (p90)', 'aprenderust', 'nuestro media (p90)', 'd ref↔nuestro'];
  const widths = [32, 17, 12, 21, 15];
  const row = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' ');
  console.log(row(header));
  console.log(row(widths.map((w) => '-'.repeat(w))));
  for (const m of MEASURES) {
    const a = (m.scope === 'global' ? refWhole : refLocal)[m.key];
    const b = ours[m.key];
    const d = effectSize(a, b);
    const share = m.better === 'up' || m.better === 'down';
    const cell = (aggRow) => (aggRow ? `${show(aggRow.mean, m.format)} (${show(aggRow.p90, m.format)})` : '—');
    console.log(
      row([
        m.label,
        cell(a),
        secondary ? show(secondary[m.key].mean, m.format) : '—',
        cell(b),
        share ? fmt(Math.abs(d), 2) : '—',
      ]),
    );
  }
  console.log('');
  console.log('textos medidos:');
  for (const r of rows) {
    console.log(
      `  ${r.corpus.padEnd(4)} ${r.id.padEnd(38)} ${String(r.words).padStart(6)} palabras  ${fmt(r.wordsPerSentence.mean, 1).padStart(5)} p/f  FH ${fmt(r.fernandezHuerta, 1).padStart(5)}  nominal ${fmt(r.nominalizationsPer100, 2)}  sin explicar ${pct(1 - r.explainedTerms)}`,
    );
  }
}

function printTerms(rows) {
  for (const r of rows) {
    if (!r.unexplained.length) continue;
    console.log(`\n## ${r.corpus} · ${r.id} — ${r.unexplained.length} términos sin explicar de ${r.terms}`);
    for (const t of r.unexplained) {
      console.log(`- ${t.term}  [${t.kind}]`);
      console.log(`  «${t.sentence}»`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const asTerms = args.includes('--terms');
  const textAt = args.indexOf('--text');
  const corpusAt = args.indexOf('--corpus');

  if (textAt >= 0) {
    const file = args[textAt + 1];
    const text = readFileSync(file, 'utf8');
    const row = measureText(text, { id: file, corpus: 'text' });
    if (asTerms) printTerms([row]);
    else console.log(JSON.stringify(row, null, 2));
    return;
  }

  const manifest = loadManifest();
  if (!manifest) {
    console.error('falta tools/register/corpus.json');
    process.exit(2);
  }
  const wanted = corpusAt >= 0 ? args[corpusAt + 1] : null;
  const scoped = wanted ? { ...manifest, texts: manifest.texts.filter((t) => t.corpus === wanted) } : manifest;
  const rows = measureCorpus(scoped);

  if (asJson) {
    const groups = [...new Set(rows.map((r) => r.corpus))];
    const out = {
      texts: rows.map(({ unexplained, ...rest }) => ({ ...rest, unexplained: unexplained.length })),
      corpora: Object.fromEntries(groups.map((g) => [g, aggregate(rows.filter((r) => r.corpus === g))])),
    };
    if (out.corpora.ref && out.corpora.our) {
      out.effect = Object.fromEntries(
        MEASURES.map((m) => [m.key, effectSize(out.corpora.ref[m.key], out.corpora.our[m.key])]),
      );
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (asTerms) {
    printTerms(rows);
    return;
  }
  printTable(rows);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
