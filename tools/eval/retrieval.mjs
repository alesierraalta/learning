#!/usr/bin/env node
/**
 * Retrieval quality check for T4. Loads a labelled JSON set, indexes the real
 * course notes (or reuses an existing vault) and prints hit@1, hit@5 and MRR
 * for keyword-only, semantic-only and hybrid search.
 *
 * The larger `queries-*.json` sets label one exact studio/indice.ts chunk and
 * carry `kind` (lexical/paraphrase) and `split` (tuning/heldout). Use
 * `--split`, `--kind` and `--check-overlap` to audit them; `--tune` explores a
 * small, explicit grid of RRF k / signal weights / semantic minimum cosine on
 * the selected split, and `--config` scores one configuration. With the
 * deterministic testdata embedder these are harness numbers, not the quality
 * of the Rust model; set LEARNING_EMBED_BIN/LEARNING_EMBED_ARGS to measure it.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { solape } from "./labels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const argumentsList = process.argv.slice(2);
const flag = (name, fallback) => {
  const position = argumentsList.indexOf(name);
  return position >= 0 ? argumentsList[position + 1] : fallback;
};
const etiquetas = resolve(flag("--labels", join(HERE, "queries.json")));
const k = Math.max(5, Math.min(50, Number(flag("--k", 8)) || 8));
const modos = (flag("--modes", "claves,semantico,hibrido")).split(",").map((modo) => modo.trim()).filter(Boolean);
const sinModelo = argumentsList.includes("--no-embed") || process.env.LEARNING_EMBED_OFF === "1";
const split = flag("--split", "all");
const kind = flag("--kind", "all");
const chequeaSolape = argumentsList.includes("--check-overlap");
const soloChequeo = argumentsList.includes("--check-only");
const tuned = argumentsList.includes("--tune");
const configArg = flag("--config");
const json = argumentsList.includes("--json");

const set = JSON.parse(readFileSync(etiquetas, "utf8"));
if (!Array.isArray(set.queries) || !set.queries.length) throw new Error("el conjunto etiquetado no tiene preguntas");
if (!["all", "tuning", "heldout"].includes(split)) throw new Error("--split debe ser all, tuning o heldout");
if (!["all", "lexical", "paraphrase"].includes(kind)) throw new Error("--kind debe ser all, lexical o paraphrase");
const ejemplos = set.queries.filter((entrada) => (split === "all" || entrada.split === split) && (kind === "all" || entrada.kind === kind));
if (!ejemplos.length) throw new Error("no hay preguntas para ese --split/--kind");

/** A paraphrase must express the idea without reusing the target's content words. */
function informeSolape() {
  const informes = [];
  for (const tipo of ["lexical", "paraphrase"]) {
    const entradas = ejemplos.filter((entrada) => entrada.kind === tipo);
    if (!entradas.length) continue;
    const solapes = entradas.map((entrada) => {
      const nota = `aprendizaje-por-refuerzo/explicaciones/${entrada.esperado.archivo}`;
      return { id: entrada.id, palabras: solape(entrada.q, set.chunks?.[nota]?.[entrada.esperado.pos] ?? "") };
    });
    const total = solapes.reduce((suma, entrada) => suma + entrada.palabras.length, 0);
    informes.push({ tipo, n: entradas.length, medio: total / entradas.length, max: Math.max(...solapes.map((entrada) => entrada.palabras.length)) });
    console.log(`solape ${tipo.padEnd(10)} n=${entradas.length} · medio ${(total / entradas.length).toFixed(2)} · máximo ${informes.at(-1).max}`);
    for (const entrada of solapes) {
      if (tipo === "paraphrase" && entrada.palabras.length) {
        console.log(`  REVISAR ${entrada.id}: ${entrada.palabras.join(" ")}`);
        process.exitCode = 1;
      }
    }
  }
  return informes;
}
if (chequeaSolape) informeSolape();
if (soloChequeo) process.exit(process.exitCode ?? 0);

const embedderExplicito = Boolean(process.env.LEARNING_EMBED_BIN?.trim());
process.env.LEARNING_EMBED_BIN ??= process.execPath;
if (!embedderExplicito) process.env.LEARNING_EMBED_ARGS ??= join(REPO, "studio", "testdata", "fake-embed.mjs");

const { listMaterias } = await import(pathToFileURL(join(REPO, "studio", "materias.ts")).href);
const indice = await import(pathToFileURL(join(REPO, "studio", "indice.ts")).href);
const DIM = indice.DIM;
if (sinModelo) indice.configurarIndice({ embedCommand: null });

const indicado = flag("--root");
const root = indicado ? resolve(indicado) : mkdtempSync(join(tmpdir(), "retrieval-eval-"));
let idMateria = flag("--materia");
if (!indicado) {
  const notas = Array.isArray(set.notas) ? set.notas.map((nota) => resolve(REPO, "content", nota))
    : set.notas ? [resolve(REPO, set.notas)] : descubrirNotas();
  // Fixed ids: chunk ids feed the score tie-break, so random ids would make
  // repeated runs of the same set disagree on equal-scoring rankings.
  const id = createHash("sha256").update(etiquetas).digest("hex").slice(0, 32);
  idMateria = id;
  const curso = join(root, ".materias", id);
  mkdirSync(curso, { recursive: true });
  const fuentes = notas.map((archivo) => {
    const fuenteId = createHash("sha256").update(archivo).digest("hex").slice(0, 32);
    const nombre = basename(archivo);
    const archivoFuente = `fuentes/${fuenteId}/${nombre}`;
    const bytes = readFileSync(archivo);
    mkdirSync(join(curso, "fuentes", fuenteId), { recursive: true });
    writeFileSync(join(curso, `${archivoFuente}.txt`), bytes);
    return {
      id: fuenteId, tipo: "documento", nombre, archivo: archivoFuente,
      bytes: bytes.length, subida: "2026-01-01T00:00:00.000Z", texto: `${archivoFuente}.txt`,
    };
  });
  writeFileSync(join(curso, "materia.json"), JSON.stringify({
    id, nombre: "Curso etiquetado", creada: "2026-01-01T00:00:00.000Z", temas: [], fuentes,
  }) + "\n");
  indice.sincronizarMateria(root, id);
} else {
  const materias = listMaterias(root);
  if (!idMateria) idMateria = materias[0]?.id;
  if (!idMateria) throw new Error("ese root no tiene materias");
  for (const materia of materias) indice.sincronizarMateria(root, materia.id);
}
await indice.esperarIndice();

function descubrirNotas() {
  const encontradas = [];
  const caminos = [join(REPO, "content")];
  while (caminos.length) {
    const actual = caminos.pop();
    for (const entrada of readdirSync(actual, { withFileTypes: true })) {
      if (entrada.name.startsWith(".")) continue;
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) caminos.push(ruta);
      else if (/\.(md|txt)$/i.test(entrada.name)) encontradas.push(ruta);
    }
  }
  return encontradas.sort();
}

const hashDe = (texto) => createHash("sha256").update(texto).digest("hex");
const metricas = (resultados, esperado) => {
  const posicion = resultados.findIndex((resultado) => esperado.chunk
    ? hashDe(resultado.texto) === esperado.chunk
    : basename(resultado.nombre) === esperado.archivo);
  return {
    hit1: posicion === 0 ? 1 : 0,
    hit5: posicion >= 0 && posicion < 5 ? 1 : 0,
    mrr: posicion >= 0 ? 1 / (posicion + 1) : 0,
  };
};
const media = (mediciones, clave) => mediciones.reduce((suma, medicion) => suma + medicion[clave], 0) / mediciones.length;
const formatea = (medidas) => `hit@1 ${medidas.hit1.toFixed(3)}  hit@5 ${medidas.hit5.toFixed(3)}  MRR ${medidas.mrr.toFixed(3)}`;

console.log(`retrieval: ${ejemplos.length} preguntas · k=${k} · split=${split} · kind=${kind} · materia ${idMateria}`);
console.log(`embedder: ${sinModelo ? "desactivado (claves)" : (process.env.LEARNING_EMBED_BIN === process.execPath ? "fake determinista" : process.env.LEARNING_EMBED_BIN)}`);

const resultadosBase = {};
for (const modo of modos) {
  if (!["claves", "semantico", "hibrido"].includes(modo)) throw new Error(`modo desconocido: ${modo}`);
  const mediciones = [];
  for (const ejemplo of ejemplos) {
    const resultados = await indice.buscar(root, idMateria, ejemplo.q, { k, modo });
    mediciones.push(metricas(resultados, ejemplo.esperado));
  }
  resultadosBase[modo] = { hit1: media(mediciones, "hit1"), hit5: media(mediciones, "hit5"), mrr: media(mediciones, "mrr") };
  console.log(`${modo.padEnd(9)} ${formatea(resultadosBase[modo])}`);
}

// ---- Tunable fusion, scored only on the requested split -----------------------

function configuracion(texto) {
  const base = { rrfK: 60, pesoClave: 1, pesoSemantico: 1, minCos: 0 };
  if (!texto) return base;
  const leida = JSON.parse(texto);
  for (const clave of Object.keys(base)) {
    if (!(clave in leida)) continue;
    if (!Number.isFinite(leida[clave])) throw new Error(`${clave} debe ser un número`);
    base[clave] = leida[clave];
  }
  if (base.rrfK <= -1 || base.pesoClave < 0 || base.pesoSemantico < 0 || base.minCos < -1) throw new Error("configuración de fusión fuera de rango");
  return base;
}

function fusion(claves, semanticos, config) {
  const combinadas = new Map();
  const añade = (id, puntos, señal) => {
    const actual = combinadas.get(id) ?? { id, score: 0, señales: [] };
    actual.score += puntos;
    actual.señales.push(señal);
    combinadas.set(id, actual);
  };
  claves.forEach((id, posicion) => añade(id, config.pesoClave / (config.rrfK + posicion + 1), "keyword"));
  semanticos.forEach((id, posicion) => añade(id, config.pesoSemantico / (config.rrfK + posicion + 1), "semantic"));
  return [...combinadas.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((entrada) => entrada.id);
}

async function preparar() {
  if (sinModelo) throw new Error("la fusión ajustable necesita el embedder real");
  const limite = Math.min(50, Math.max(k * 4, 20));
  const claves = [];
  for (const ejemplo of ejemplos) {
    claves.push((await indice.buscar(root, idMateria, ejemplo.q, { modo: "claves", k: limite })).map((resultado) => resultado.id));
  }
  await indice.cerrarIndice();

  const db = new DatabaseSync(indice.indicePath(root));
  const filas = db.prepare("SELECT id, texto FROM chunks WHERE materia = ? ORDER BY pos").all(idMateria);
  const vectorFilas = db.prepare(`
    SELECT c.id AS id, v.vec AS vec FROM vectors v
    JOIN chunks c ON c.id = v.chunk_id WHERE c.materia = ? ORDER BY c.pos
  `).all(idMateria);
  db.close();
  const mapa = new Map(filas.map((fila) => [fila.id, hashDe(fila.texto)]));
  const vectores = new Map(vectorFilas.map((fila) => {
    const bytes = new Uint8Array(fila.vec.buffer, fila.vec.byteOffset, fila.vec.byteLength);
    return [fila.id, new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
  }));

  const consultas = await embeberConsultas(ejemplos.map((ejemplo) => ejemplo.q));
  const semanticos = consultas.map((vector) => [...vectores.entries()]
    .map(([id, otro]) => {
      let coseno = 0;
      for (let dimension = 0; dimension < DIM; dimension++) coseno += vector[dimension] * otro[dimension];
      return { id, coseno };
    })
    .sort((a, b) => b.coseno - a.coseno || a.id.localeCompare(b.id))
    .slice(0, limite));
  return { claves, semanticos, mapa };
}

async function embeberConsultas(consultas) {
  const bin = process.env.LEARNING_EMBED_BIN;
  if (!bin || bin === process.execPath) throw new Error("se necesita LEARNING_EMBED_BIN con el modelo real para ajustar la fusión");
  const args = (process.env.LEARNING_EMBED_ARGS ?? "").trim().split(/\s+/).filter(Boolean);
  const dir = process.env.LEARNING_EMBED_MODEL_DIR || process.env.LEARNING_EMBED_DIR
    || join(process.env.HOME || "", ".local", "share", "learning", "embed");
  const proc = spawn(bin, [...args, "--model-dir", dir], {
    env: {
      ...process.env,
      ORT_DYLIB_PATH: process.env.LEARNING_EMBED_DYLIB ?? "",
      EMBED_THREADS: process.env.EMBED_THREADS ?? "2",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (trozo) => { stderr = (stderr + trozo).slice(-2000); });
  const lineas = createInterface({ input: proc.stdout })[Symbol.asyncIterator]();
  const espera = (mensaje, ms) => Promise.race([
    lineas.next().then(({ value, done }) => {
      if (done || !value) throw new Error(`el embedder cerró antes de ${mensaje}: ${stderr}`);
      return JSON.parse(value);
    }),
    new Promise((_, rechaza) => setTimeout(() => rechaza(new Error(`timeout: ${mensaje}`)), ms)),
  ]);
  try {
    const listo = await espera("la línea ready", Number(process.env.LEARNING_EMBED_STARTUP_MS ?? 30_000));
    if (listo.ready !== true || listo.dim !== DIM) throw new Error(`ready inesperado: ${JSON.stringify(listo)}`);
    const vectores = new Array(consultas.length);
    for (let offset = 0; offset < consultas.length; offset += 64) {
      const lote = consultas.slice(offset, offset + 64);
      const id = `q${offset}`;
      proc.stdin.write(`${JSON.stringify({ id, kind: "query", texts: lote })}\n`);
      const respuesta = await espera(`la respuesta ${id}`, Number(process.env.LEARNING_EMBED_TIMEOUT_MS ?? 30_000));
      if (respuesta.id !== id || respuesta.error || respuesta.vectors?.length !== lote.length) throw new Error(`respuesta inválida: ${JSON.stringify(respuesta).slice(0, 300)}`);
      respuesta.vectors.forEach((codificado, posicionLote) => {
        const bytes = Buffer.from(codificado, "base64");
        if (bytes.length !== DIM * 4) throw new Error(`vector de ${bytes.length} bytes`);
        const vector = new Float32Array(DIM);
        for (let dimension = 0; dimension < DIM; dimension++) vector[dimension] = bytes.readFloatLE(dimension * 4);
        vectores[offset + posicionLote] = vector;
      });
    }
    return vectores;
  } finally {
    try { proc.stdin.end(); } catch { /* ya cerró */ }
    setTimeout(() => { try { proc.kill(); } catch { /* ya salió */ } }, 500).unref();
  }
}

function medirConfig(config, preparado) {
  const mediciones = ejemplos.map((ejemplo, posicion) => {
    const semanticos = preparado.semanticos[posicion]
      .filter((entrada) => entrada.coseno >= config.minCos)
      .map((entrada) => entrada.id);
    const ranking = fusion(preparado.claves[posicion], semanticos, config);
    const hallado = ranking.findIndex((id) => preparado.mapa.get(id) === ejemplo.esperado.chunk);
    return { hit1: hallado === 0 ? 1 : 0, hit5: hallado >= 0 && hallado < 5 ? 1 : 0, mrr: hallado >= 0 ? 1 / (hallado + 1) : 0 };
  });
  return { hit1: media(mediciones, "hit1"), hit5: media(mediciones, "hit5"), mrr: media(mediciones, "mrr") };
}

if (tuned || configArg) {
  const preparado = await preparar();
  if (configArg) {
    const config = configuracion(configArg);
    const medidas = medirConfig(config, preparado);
    console.log(`config ${JSON.stringify(config)} → ${formatea(medidas)}`);
    resultadosBase.config = medidas;
  }
  if (tuned) {
    const candidatos = [];
    for (const rrfK of [1, 5, 10, 20, 60, 120]) {
      for (const pesoClave of [0.5, 1, 1.5, 2]) {
        for (const minCos of [0, 0.25, 0.5, 0.7, 0.8, 0.85]) {
          const config = { rrfK, pesoClave, pesoSemantico: 1, minCos };
          candidatos.push({ config, medidas: medirConfig(config, preparado) });
        }
      }
    }
    candidatos.sort((a, b) => b.medidas.mrr - a.medidas.mrr || a.config.rrfK - b.config.rrfK || a.config.pesoClave - b.config.pesoClave || a.config.minCos - b.config.minCos);
    console.log(`tuning: ${candidatos.length} configuraciones · ordenadas por MRR de ${split}/${kind}`);
    for (const candidato of candidatos.slice(0, 15)) {
      console.log(`  ${JSON.stringify(candidato.config)} → ${formatea(candidato.medidas)}`);
    }
    resultadosBase.tuning = { n: candidatos.length, top: candidatos.slice(0, 15) };
  }
}

if (json) console.log(JSON.stringify({ set: etiquetas, filtros: { split, kind, k }, resultados: resultadosBase }));
await indice.cerrarIndice();
