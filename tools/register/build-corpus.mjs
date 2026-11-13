// Arma el corpus con el que se calibra el registro: la referencia y lo nuestro.
//
// Los textos se guardan ya en prosa (sin código, sin tablas, sin piezas `lk-*`,
// sin quiz, sin diagramas) porque eso es lo que se mide. La primera línea de
// cada archivo dice de dónde salió.
//
// Uso:
//   node tools/register/build-corpus.mjs            # todo lo que exista en disco
//   node tools/register/build-corpus.mjs --refs     # además, las lecciones de aprenderust.dev
//
// `--refs` necesita Playwright (PLAYWRIGHT_MODULE) y red. Sin el flag, el corpus
// secundario se queda con lo que ya esté guardado.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { extractProse } from './measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'corpus');

/*
 * La referencia que el alumno señaló: la explicación de RL que pegó en el chat.
 *
 * El archivo trae dos documentos pegados: la explicación de RL (registro que el
 * alumno elogia) y un informe sobre EXL3 (registro técnico, sin definir nada).
 * Se separan porque no son el mismo registro y mezclarlos esconde la diferencia.
 */
const REFERENCE = {
  id: 'chatgpt-rl',
  file: 'ref-chatgpt-rl.txt',
  source: '/tmp/register-ref/chatgpt-rl-reference.md (explicación de RL pegada por el alumno)',
  path: '/tmp/register-ref/chatgpt-rl-reference.md',
  corte: 'Profundiza en los conceptos clave',
};

/* Lecciones publicadas de aprenderust.dev: segundo punto de comparación, separado. */
const LESSONS = [
  'ownership',
  'referencias-y-prestamos',
  'variables-y-mutabilidad',
  'tipos-de-datos',
  'funciones',
  'structs',
];

/* Nuestro corpus: las partes agy que tenemos. */
const OURS = [
  { id: 'plsql-parte-1', path: 'internal/engine/testdata/plsql-parte-1.md' },
  { id: 'sql-parte-1', path: 'internal/engine/testdata/sql-parte-1.md' },
  { id: 'proof-part', path: '/tmp/proof-part.md' },
  { id: 'tcp-parte-1-banco', git: 'origin/feat/245-icon-actors:internal/engine/testdata/tcp-parte-1-banco.md' },
  { id: 'plsql-parte-1-actores', git: 'origin/feat/245-icon-actors:internal/engine/testdata/plsql-parte-1-actores.md' },
];

const KIT = [
  'curva-gaussiana',
  'derivacion-x',
  'formula-anotada',
  'formula-gaussiana',
  'memoria-string-rust',
  'plsql-transaccion',
  'prestamos-rust',
  'propiedad-rust',
  'sql-group-by',
  'sql-join-videojuegos',
  'sql-venn-joins',
];

const BENCH = [
  'bayes-theorem',
  'css-flexbox',
  'git-branching',
  'rust-borrowing',
  'tcp-handshake',
];

/**
 * Una sección que ya no existe se retira, no se borra: este repositorio no
 * borra archivos. Queda una línea que dice dónde vive ahora el texto, para que
 * nadie mida un archivo viejo creyendo que es el corpus.
 */
function retireStale(written) {
  const pattern = /^ref-chatgpt-(?:rl|exl3)-\d+\.txt$/;
  for (const name of readdirSync(OUT)) {
    if (!pattern.test(name) || written.has(name)) continue;
    writeFileSync(
      join(OUT, name),
      '# fuente: (sección retirada: el corte de la referencia cambió; el texto vive en ref-chatgpt-rl.txt o ref-chatgpt-exl3.txt)\n',
      'utf8',
    );
    console.log(`  retirada ${name}`);
  }
}

/** Lo que ya estaba listado: un archivo que no se regenera sigue en el corpus. */
function readPrevious() {
  const file = join(HERE, 'corpus.json');
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed.texts) ? parsed.texts : [];
  } catch {
    return [];
  }
}

/**
 * La cuenta paso a paso se guarda en un cercado `cuenta` para que sobreviva al
 * viaje: `measure.mjs` la reconoce como pasos y no como frases.
 */
function writeSnapshot(id, file, source, prose, steps = []) {
  const cuenta = steps.length ? `\n\n\`\`\`cuenta\n${steps.join('\n')}\n\`\`\`\n` : '';
  const body = `# fuente: ${source}\n\n${prose.trim()}${cuenta}\n`;
  writeFileSync(join(OUT, file), body, 'utf8');
  const words = prose.trim().split(/\s+/).filter(Boolean).length;
  console.log(`  ${file.padEnd(42)} ${String(words).padStart(6)} palabras  ${String(steps.length).padStart(4)} pasos`);
  return { id, file: `corpus/${file}`, source };
}

function fromFile(entry) {
  if (!existsSync(entry.path)) {
    console.log(`  (falta ${entry.path})`);
    return null;
  }
  const { prose, steps } = extractProse(readFileSync(entry.path, 'utf8'));
  return writeSnapshot(entry.id, `our-${entry.id}.txt`, entry.path, prose, steps);
}

function fromGit(entry) {
  const shown = spawnSync('git', ['show', entry.git], { encoding: 'utf8' });
  if (shown.status !== 0) {
    console.log(`  (falta ${entry.git})`);
    return null;
  }
  const { prose, steps } = extractProse(shown.stdout);
  return writeSnapshot(entry.id, `our-${entry.id}.txt`, `git show ${entry.git}`, prose, steps);
}

/* ------------------------------------------------------------------ */
/* aprenderust.dev: prosa de la lección, no código ni quiz             */
/* ------------------------------------------------------------------ */

async function fetchLesson(slugName) {
  const modulePath = process.env.PLAYWRIGHT_MODULE;
  if (!modulePath) throw new Error('falta PLAYWRIGHT_MODULE (ruta a playwright/index.mjs)');
  const { chromium } = await import(modulePath);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const url = `https://aprenderust.dev/${slugName}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const data = await page.evaluate(() => {
      const article = document.querySelector('article.lesson-article');
      if (!article) return { paras: [], captions: [] };
      const skip = 'table, pre, .sql-playground, .diagram-wrap, .quiz, nav, .intro, .lesson-head';
      const paras = [];
      for (const el of article.querySelectorAll('p, li')) {
        if (el.closest(skip)) continue;
        if (el.querySelector('p, li')) continue;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) paras.push(text);
      }
      // Los pasos de la introducción animada son la narración de la escena.
      const captions = [...article.querySelectorAll('.intro-line')]
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return { paras, captions };
    });
    const prose = [...data.captions, ...data.paras].join('\n');
    return { url, prose };
  } finally {
    await browser.close();
  }
}

async function buildRefs(manifest) {
  for (const lesson of LESSONS) {
    try {
      const { url, prose } = await fetchLesson(lesson);
      const entry = writeSnapshot(`aprenderust-${lesson}`, `ref2-aprenderust-${lesson}.txt`, url, prose, []);
      manifest.texts.push({ id: entry.id, corpus: 'ref2', file: entry.file });
    } catch (error) {
      console.log(`  (no se pudo leer ${lesson}: ${error.message})`);
    }
  }
}

/* ------------------------------------------------------------------ */

/** El archivo trae dos documentos: la explicación de RL y el informe de EXL3. */
function splitReference(body) {
  const cut = body.indexOf(REFERENCE.corte);
  const next = cut > 0 ? body.indexOf('## Ruta', cut) : -1;
  if (next < 0) {
    return [{ id: 'chatgpt-rl', corpus: 'ref', body, wholeFile: REFERENCE.file, sectionPrefix: 'ref-chatgpt-rl-' }];
  }
  return [
    {
      id: 'chatgpt-rl',
      corpus: 'ref',
      body: body.slice(0, next),
      wholeFile: REFERENCE.file,
      sectionPrefix: 'ref-chatgpt-rl-',
    },
    {
      id: 'chatgpt-exl3',
      corpus: 'ref-exl3',
      body: body.slice(next),
      wholeFile: 'ref-chatgpt-exl3.txt',
      sectionPrefix: 'ref-chatgpt-exl3-',
    },
  ];
}

/**
 * La referencia se mide por secciones: un solo texto no tiene dispersión y una
 * media sin dispersión no permite decir si una medida separa o no. Cada sección
 * es una unidad de prosa con su propio tema, y el texto entero queda también en
 * disco para leerlo y para medir el mecanismo de una pieza.
 */
function referenceSections(source, minWords = 120) {
  const lines = source.split('\n');
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (/^#{1,2}\s/.test(line) && current.length) {
      chunks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length) chunks.push(current.join('\n'));

  const sections = [];
  let carry = { prose: '', steps: [] };
  for (const chunk of chunks) {
    const { prose, steps } = extractProse(chunk);
    const body = `${carry.prose}${carry.prose ? '\n' : ''}${prose}`.trim();
    const allSteps = [...carry.steps, ...steps];
    const count = body.split(/\s+/).filter(Boolean).length;
    if (count < minWords) {
      carry = { prose: body, steps: allSteps };
      continue;
    }
    sections.push({ prose: body, steps: allSteps });
    carry = { prose: '', steps: [] };
  }
  if (carry.prose.trim()) {
    if (sections.length) {
      sections[sections.length - 1].prose += `\n${carry.prose.trim()}`;
      sections[sections.length - 1].steps.push(...carry.steps);
    } else sections.push(carry);
  }
  return sections;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = { texts: [] };

  console.log('referencia (ChatGPT):');
  if (existsSync(REFERENCE.path)) {
    const raw = readFileSync(REFERENCE.path, 'utf8');
    // El archivo empieza con el mensaje del alumno pegado al título: la
    // explicación propiamente dicha arranca en su «## Ruta».
    const cut = raw.search(/^##\s+Ruta\s*$/m);
    const body = cut > 0 ? raw.slice(cut) : raw;
    const docs = splitReference(body);
    for (const doc of docs) {
      const { prose, steps } = extractProse(doc.body);
      const file = doc.wholeFile;
      const entry = writeSnapshot(doc.id, file, REFERENCE.source, prose, steps);
      manifest.texts.push({ id: entry.id, corpus: `${doc.corpus}-whole`, file: entry.file });
      referenceSections(doc.body).forEach((section, index) => {
        const name = doc.sectionPrefix + String(index + 1).padStart(2, '0') + '.txt';
        const id = `${doc.id}-${String(index + 1).padStart(2, '0')}`;
        const done = writeSnapshot(id, name, REFERENCE.source, section.prose, section.steps);
        manifest.texts.push({ id: done.id, corpus: doc.corpus, file: done.file });
      });
    }
  } else {
    console.log(`  (falta ${REFERENCE.path})`);
  }

  console.log('nuestro corpus (partes agy):');
  for (const entry of OURS) {
    const done = entry.git ? fromGit(entry) : fromFile(entry);
    if (done) manifest.texts.push({ id: done.id, corpus: 'our', file: done.file });
  }
  for (const name of KIT) {
    const path = join(HERE, '..', '..', 'integrations/pi/kit/examples', `${name}.md`);
    const done = fromFile({ id: `kit-${name}`, path });
    if (done) manifest.texts.push({ id: done.id, corpus: 'our', file: done.file });
  }
  for (const name of BENCH) {
    // El vault lleva el nombre del tema, que no siempre es el del bench.
    const vault = join('/tmp/bench246/out', name, 'vault');
    const topic = existsSync(vault) ? readdirSync(vault)[0] : null;
    const path = topic ? join(vault, topic, 'explicaciones') : null;
    if (!path || !existsSync(path)) {
      console.log(`  (falta ${path ?? vault})`);
      continue;
    }
    const file = readdirSync(path).find((f) => f.endsWith('.md'));
    if (!file) continue;
    const done = fromFile({ id: `bench-${name}`, path: join(path, file) });
    if (done) manifest.texts.push({ id: done.id, corpus: 'our', file: done.file });
  }

  if (process.argv.includes('--refs')) {
    console.log('referencia secundaria (aprenderust.dev):');
    await buildRefs(manifest);
  } else {
    console.log('referencia secundaria: sin cambios (usa --refs para volver a bajarla)');
  }

  // El manifiesto se ordena: ref, ref2, our. Sólo se conservan del manifiesto
  // anterior los textos que esta pasada no regenera (la referencia secundaria,
  // que necesita red); lo demás se reescribe para que no queden secciones
  // viejas listadas por haber cambiado el corte.
  const previous = readPrevious().filter((t) => t.corpus === 'ref2');
  const byFile = new Map([...previous, ...manifest.texts].map((t) => [t.file, t]));
  const order = { ref: 0, ref2: 1, our: 2 };
  const texts = [...byFile.values()]
    .filter((t) => existsSync(join(HERE, t.file)))
    .sort((a, b) => order[a.corpus] - order[b.corpus] || a.id.localeCompare(b.id));

  retireStale(new Set(texts.map((t) => t.file.replace(/^corpus\//, ''))));
  writeFileSync(join(HERE, 'corpus.json'), `${JSON.stringify({ texts }, null, 2)}\n`, 'utf8');
  console.log(`\ncorpus.json: ${texts.length} textos (${[...new Set(texts.map((t) => t.corpus))].join(', ')})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
