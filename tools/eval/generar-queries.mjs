#!/usr/bin/env node
/**
 * Builds the larger T4 label set from the real Spanish notes in `content/`.
 * Every target is one chunk produced by studio/indice.ts's own `segmentarTexto`,
 * identified by its sha256 so an evaluation cannot silently drift to a note-level
 * label. The tuning/held-out split is assigned here with a fixed seed, before
 * any retrieval result is inspected.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SEED = 373;
const { segmentarTexto } = await import(new URL("../../studio/indice.ts", import.meta.url).href);
const { STOPWORDS, solape } = await import(new URL("./labels.mjs", import.meta.url).href);

/** Authored by reading the target chunk: two questions reusing its words, two paraphrases. */
const PREGUNTAS = [
  // Parte 1, chunk 0 — deciding now versus later
  ["p1c0-l1", "lexical", "Parte 1 - El problema que solo existe en el tiempo.md", 0, "Con un 4 % de batería, ¿qué recompensa inmediata tiene aspirar comparada con ir al cargador?"],
  ["p1c0-l2", "lexical", "Parte 1 - El problema que solo existe en el tiempo.md", 0, "¿Qué decisión gana si solo se mira el instante y cuál gana si se mira la hora siguiente?"],
  ["p1c0-p1", "paraphrase", "Parte 1 - El problema que solo existe en el tiempo.md", 0, "Si el aparato casi no tiene energía y limpiar ofrece un premio inmediato, ¿por qué conviene reponerla primero?"],
  ["p1c0-p2", "paraphrase", "Parte 1 - El problema que solo existe en el tiempo.md", 0, "¿Por qué cambia el veredicto de una elección cuando se alarga el horizonte?"],
  // Parte 1, chunk 1 — supervised / unsupervised / reinforcement
  ["p1c1-l1", "lexical", "Parte 1 - El problema que solo existe en el tiempo.md", 1, "¿Qué diferencia hay entre supervisado, no supervisado y refuerzo según quién da la respuesta?"],
  ["p1c1-l2", "lexical", "Parte 1 - El problema que solo existe en el tiempo.md", 1, "En refuerzo, ¿qué recibes en lugar de una respuesta correcta?"],
  ["p1c1-p1", "paraphrase", "Parte 1 - El problema que solo existe en el tiempo.md", 1, "Cuando no se etiqueta ningún ejemplo y aparece un efecto tras intervenir, ¿cómo se denomina este aprendizaje?"],
  ["p1c1-p2", "paraphrase", "Parte 1 - El problema que solo existe en el tiempo.md", 1, "¿Cómo se llama el caso en que se entregan muchas fotos sin rótulo y surgen agrupaciones parecidas?"],
  // Parte 2, chunk 0 — the black box
  ["p2c0-l1", "lexical", "Parte 2 - Las cinco piezas.md", 0, "¿Qué entra, qué sale y qué vuelve en la caja negra del robot aspirador?"],
  ["p2c0-l2", "lexical", "Parte 2 - Las cinco piezas.md", 0, "¿Qué dos extremos se muestran en la caja negra antes de nombrar las cinco piezas?"],
  ["p2c0-p1", "paraphrase", "Parte 2 - Las cinco piezas.md", 0, "¿Qué dato llega, qué se decide y qué señal regresa al dispositivo mientras obra?"],
  ["p2c0-p2", "paraphrase", "Parte 2 - Las cinco piezas.md", 0, "¿Qué se introduce, qué se decide y qué señal retorna al aparato en el esquema inicial?"],
  // Parte 2, chunk 1 — state, action, reward
  ["p2c1-l1", "lexical", "Parte 2 - Las cinco piezas.md", 1, "¿Qué datos forman el estado del robot en el ejemplo de la sala y la cocina?"],
  ["p2c1-l2", "lexical", "Parte 2 - Las cinco piezas.md", 1, "¿Qué número indica qué tan deseable fue una consecuencia y qué ejemplo numérico se da?"],
  ["p2c1-p1", "paraphrase", "Parte 2 - Las cinco piezas.md", 1, "¿Qué datos describen la situación momento a momento y qué cifra cuantifica lo ocurrido?"],
  ["p2c1-p2", "paraphrase", "Parte 2 - Las cinco piezas.md", 1, "¿Cómo se denomina la opción ejecutable, como recoger el polvo o aguardar?"],
  // Parte 3, chunk 0 — one instant, two returns
  ["p3c0-l1", "lexical", "Parte 3 - Un paso completo.md", 0, "¿Qué dos cosas devuelve el entorno cuando el robot elige aspirar en T0?"],
  ["p3c0-l2", "lexical", "Parte 3 - Un paso completo.md", 0, "¿Qué valores tiene la batería antes y después de ese paso?"],
  ["p3c0-p1", "paraphrase", "Parte 3 - Un paso completo.md", 0, "Tras la intervención, ¿qué cambio queda registrado para manejar lo que sigue y qué premio se percibe de inmediato?"],
  ["p3c0-p2", "paraphrase", "Parte 3 - Un paso completo.md", 0, "Al terminar la maniobra, ¿qué dato sobre el lugar y la carga queda para la siguiente decisión?"],
  // Parte 3, chunk 1 — consumed reward versus next state
  ["p3c1-l1", "lexical", "Parte 3 - Un paso completo.md", 1, "¿Qué condiciona el paso siguiente: el +10 ya cobrado o la batería al 68 %?"],
  ["p3c1-l2", "lexical", "Parte 3 - Un paso completo.md", 1, "¿Qué cuatro elementos se repiten en el ciclo descrito al final de esta parte?"],
  ["p3c1-p1", "paraphrase", "Parte 3 - Un paso completo.md", 1, "¿Cuál de los datos obtenidos influye todavía en la decisión posterior y cuál ya se agotó?"],
  ["p3c1-p2", "paraphrase", "Parte 3 - Un paso completo.md", 1, "¿Por qué el premio ya entregado no incide más y sí lo hace la situación resultante?"],
  // Parte 4, chunk 0 — four concepts
  ["p4c0-l1", "lexical", "Parte 4 - Los cuatro conceptos que se confunden.md", 0, "¿Qué concepto responde a la pregunta «¿qué acción elijo estando aquí?»"],
  ["p4c0-l2", "lexical", "Parte 4 - Los cuatro conceptos que se confunden.md", 0, "¿De qué dos formas se escribe el valor según esta parte?"],
  ["p4c0-p1", "paraphrase", "Parte 4 - Los cuatro conceptos que se confunden.md", 0, "¿Cómo se llama la regla que decide la conducta y qué distinción hay entre premio recibido y expectativa futura?"],
  ["p4c0-p2", "paraphrase", "Parte 4 - Los cuatro conceptos que se confunden.md", 0, "¿Qué mecanismo anticipa el desenlace de una intervención y es prescindible?"],
  // Parte 4, chunk 1 — same room, different future
  ["p4c1-l1", "lexical", "Parte 4 - Los cuatro conceptos que se confunden.md", 1, "¿Por qué dos estados que se ven iguales pueden valer muy distinto?"],
  ["p4c1-l2", "lexical", "Parte 4 - Los cuatro conceptos que se confunden.md", 1, "¿Qué diferencia hay entre el estado A con 4 % y el estado B con 100 % de batería?"],
  ["p4c1-p1", "paraphrase", "Parte 4 - Los cuatro conceptos que se confunden.md", 1, "Si dos situaciones se ven iguales pero una permite actuar mucho más rato, ¿qué magnitud las separa?"],
  ["p4c1-p2", "paraphrase", "Parte 4 - Los cuatro conceptos que se confunden.md", 1, "¿Qué medida separa dos cuartos iguales cuando uno apenas logra continuar?"],
  // Parte 5, chunk 0 — explore or exploit
  ["p5c0-l1", "lexical", "Parte 5 - Explorar o explotar.md", 0, "¿Qué gana el robot al probar la segunda acción apenas conocida?"],
  ["p5c0-l2", "lexical", "Parte 5 - Explorar o explotar.md", 0, "¿Qué recompensa puede salir al explorar y cuál al explotar?"],
  ["p5c0-p1", "paraphrase", "Parte 5 - Explorar o explotar.md", 0, "¿Qué se obtiene al arriesgarse con una opción poco ensayada, aunque el premio pueda caer?"],
  ["p5c0-p2", "paraphrase", "Parte 5 - Explorar o explotar.md", 0, "¿Qué se logra al arriesgarse con una vía inédita y qué se sacrifica al quedarse con la segura?"],
  // Parte 5, chunk 1 — the simplest balance
  ["p5c1-l1", "lexical", "Parte 5 - Explorar o explotar.md", 1, "¿Qué regla reparte el tiempo con una sola probabilidad?"],
  ["p5c1-l2", "lexical", "Parte 5 - Explorar o explotar.md", 1, "¿Qué ocurre cuanto más alto es el número que ajusta la exploración?"],
  ["p5c1-p1", "paraphrase", "Parte 5 - Explorar o explotar.md", 1, "¿Con qué mecanismo se decide cada tanto ensayar una alternativa en vez de repetir la favorita?"],
  ["p5c1-p2", "paraphrase", "Parte 5 - Explorar o explotar.md", 1, "¿Por qué persistir en la elección más segura acaba rindiendo poco?"],
  // Parte 6, chunk 0 — return and discounting
  ["p6c0-l1", "lexical", "Parte 6 - El retorno y el descuento.md", 0, "¿Qué total intenta maximizar el agente en vez de la próxima recompensa?"],
  ["p6c0-l2", "lexical", "Parte 6 - El retorno y el descuento.md", 0, "¿Cuál es el retorno con descuento de +10, −1 y +10?"],
  ["p6c0-p1", "paraphrase", "Parte 6 - El retorno y el descuento.md", 0, "¿Qué total pretende optimizar quien decide, en lugar del premio de este instante?"],
  ["p6c0-p2", "paraphrase", "Parte 6 - El retorno y el descuento.md", 0, "¿Por qué un premio lejano se cuenta por menos que uno próximo?"],
  // Parte 6, chunk 1 — what the factor means
  ["p6c1-l1", "lexical", "Parte 6 - El retorno y el descuento.md", 1, "¿Qué significa que el factor esté cerca de 1?"],
  ["p6c1-l2", "lexical", "Parte 6 - El retorno y el descuento.md", 1, "¿Qué ve el agente cuando el factor vale cero?"],
  ["p6c1-p1", "paraphrase", "Parte 6 - El retorno y el descuento.md", 1, "¿Qué ocurre con la mirada de quien decide cuando el coeficiente se aproxima a la unidad?"],
  ["p6c1-p2", "paraphrase", "Parte 6 - El retorno y el descuento.md", 1, "¿Cómo se comporta la visión de quien decide con un coeficiente nulo?"],
];

/** Seeded Fisher-Yates: the split is fixed before any metric is read. */
function ordenSemilla(total) {
  let estado = SEED >>> 0;
  const azar = () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let valor = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    valor ^= valor + Math.imul(valor ^ (valor >>> 7), 61 | valor);
    return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
  };
  const indices = Array.from({ length: total }, (_, index) => index);
  for (let index = total - 1; index > 0; index--) {
    const otro = Math.floor(azar() * (index + 1));
    [indices[index], indices[otro]] = [indices[otro], indices[index]];
  }
  return indices;
}

function notasSpanish() {
  const encontradas = new Set();
  for (const tema of readdirSync(join(REPO, "content"), { withFileTypes: true })) {
    if (!tema.isDirectory() || tema.name.startsWith(".")) continue;
    const explicaciones = join(REPO, "content", tema.name, "explicaciones");
    let archivos = [];
    try { archivos = readdirSync(explicaciones).filter((nombre) => /\.(md|txt)$/i.test(nombre)); } catch { /* no explicaciones */ }
    for (const archivo of archivos.sort()) encontradas.add(`${tema.name}/explicaciones/${archivo}`);
    for (const archivo of readdirSync(join(REPO, "content", tema.name)).filter((nombre) => /\.(md|txt)$/i.test(nombre)).sort()) {
      encontradas.add(`${tema.name}/${archivo}`);
    }
  }
  return [...encontradas].sort();
}

const notas = notasSpanish();
const chunks = new Map();
const chunksPorNota = {};
for (const nota of notas) {
  const texto = readFileSync(join(REPO, "content", nota), "utf8");
  chunksPorNota[nota] = {};
  for (const segmento of segmentarTexto(texto, { nombre: nota.split("/").at(-1), tipo: "documento" })) {
    chunks.set(`${nota}|${segmento.pos}`, segmento.texto);
    chunksPorNota[nota][segmento.pos] = segmento.texto;
  }
}

const porTipo = new Map();
for (const entrada of PREGUNTAS) {
  if (!porTipo.has(entrada[1])) porTipo.set(entrada[1], []);
  porTipo.get(entrada[1]).push(entrada);
}
const split = new Map();
for (const entradas of porTipo.values()) {
  ordenSemilla(entradas.length).forEach((indice, posicion) => {
    split.set(entradas[indice][0], posicion < entradas.length / 2 ? "tuning" : "heldout");
  });
}

const queries = PREGUNTAS.map(([id, kind, archivo, pos, q]) => {
  const nota = `aprendizaje-por-refuerzo/explicaciones/${archivo}`;
  const texto = chunks.get(`${nota}|${pos}`);
  if (texto === undefined) throw new Error(`no existe el chunk ${archivo} pos ${pos}`);
  return {
    id, kind, split: split.get(id), q,
    esperado: {
      archivo, pos,
      chunk: createHash("sha256").update(texto).digest("hex"),
    },
  };
});

const comun = {
  descripcion: "Preguntas escritas leyendo cada chunk real de las notas en español; la etiqueta es ese chunk, no solo la nota.",
  origen: "content/*/explicaciones y cualquier texto .md/.txt de content/",
  chunking: "studio/indice.ts segmentarTexto (220 palabras objetivo, 40 de solape)",
  seed: SEED,
  notas,
  chunks: chunksPorNota,
  split: "Fisher-Yates con seed 373 dentro de cada kind; mitad tuning, mitad heldout; asignado antes de medir",
  stopwords: [...STOPWORDS].sort(),
};

function escribe(nombre, contenido) {
  const ruta = join(HERE, nombre);
  writeFileSync(ruta, JSON.stringify(contenido, null, 2) + "\n");
  console.log(`${nombre}: ${contenido.queries.length} preguntas`);
}

escribe("queries-373.json", { ...comun, queries });
for (const parte of ["tuning", "heldout"]) {
  escribe(`queries-${parte}.json`, {
    ...comun,
    descripcion: `${comun.descripcion} Subconjunto ${parte}.`,
    queries: queries.filter((entrada) => entrada.split === parte),
  });
}

for (const tipo of ["lexical", "paraphrase"]) {
  const entradas = queries.filter((entrada) => entrada.kind === tipo);
  const solapes = entradas.map((entrada) => {
    const nota = `aprendizaje-por-refuerzo/explicaciones/${entrada.esperado.archivo}`;
    return solape(entrada.q, chunks.get(`${nota}|${entrada.esperado.pos}`));
  });
  console.log(`${tipo}: ${entradas.length} preguntas · solape medio ${(solapes.reduce((suma, lista) => suma + lista.length, 0) / entradas.length).toFixed(2)} · máximo ${Math.max(...solapes.map((lista) => lista.length))}`);
  if (tipo === "paraphrase") {
    for (const [indice, lista] of solapes.entries()) {
      if (lista.length) console.log(`  REVISAR ${entradas[indice].id}: ${lista.join(" ")}`);
    }
  }
}
