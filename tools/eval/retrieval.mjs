#!/usr/bin/env node
/**
 * Retrieval quality check for T4. Loads a labelled JSON set, indexes the real
 * course notes (or reuses an existing vault) and prints hit@1, hit@5 and MRR
 * for keyword-only, semantic-only and hybrid search. With the deterministic
 * testdata embedder these are harness numbers, not the quality of the Rust
 * model; set LEARNING_EMBED_BIN/LEARNING_EMBED_ARGS to measure that binary.
 */
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const argumentsList = process.argv.slice(2);
const flag = (name) => {
  const position = argumentsList.indexOf(name);
  return position >= 0 ? argumentsList[position + 1] : undefined;
};
const etiquetas = resolve(flag("--labels") ?? join(HERE, "queries.json"));
const k = Math.max(5, Math.min(50, Number(flag("--k") ?? 8) || 8));
const modos = (flag("--modes") ?? "claves,semantico,hibrido").split(",").map((modo) => modo.trim()).filter(Boolean);
const sinModelo = argumentsList.includes("--no-embed") || process.env.LEARNING_EMBED_OFF === "1";

const set = JSON.parse(readFileSync(etiquetas, "utf8"));
if (!Array.isArray(set.queries) || !set.queries.length) throw new Error("el conjunto etiquetado no tiene preguntas");

const embedderExplicito = Boolean(process.env.LEARNING_EMBED_BIN?.trim());
process.env.LEARNING_EMBED_BIN ??= process.execPath;
if (!embedderExplicito) process.env.LEARNING_EMBED_ARGS ??= join(REPO, "studio", "testdata", "fake-embed.mjs");

const { addFuente, createMateria, listMaterias } = await import(pathToFileURL(join(REPO, "studio", "materias.ts")).href);
const indice = await import(pathToFileURL(join(REPO, "studio", "indice.ts")).href);
if (sinModelo) indice.configurarIndice({ embedCommand: null });

const indicado = flag("--root");
const root = indicado ? resolve(indicado) : mkdtempSync(join(tmpdir(), "retrieval-eval-"));
let idMateria = flag("--materia");
if (!indicado) {
  const notas = resolve(REPO, set.notas ?? "content/aprendizaje-por-refuerzo/explicaciones");
  const { id } = createMateria(root, "Aprendizaje por refuerzo");
  idMateria = id;
  for (const archivo of readdirSync(notas).filter((nombre) => nombre.endsWith(".md")).sort()) {
    await addFuente(root, id, {
      fileName: archivo,
      contentType: "text/markdown",
      tipo: "documento",
      content: readFileSync(join(notas, archivo)),
    });
  }
  indice.sincronizarMateria(root, id);
} else {
  const materias = listMaterias(root);
  if (!idMateria) idMateria = materias[0]?.id;
  if (!idMateria) throw new Error("ese root no tiene materias");
  for (const materia of materias) indice.sincronizarMateria(root, materia.id);
}
await indice.esperarIndice();

const nombre = (r) => basename(r.nombre);
const metricas = (resultados, esperado) => {
  const posicion = resultados.findIndex((resultado) => nombre(resultado) === esperado.archivo);
  return {
    hit1: posicion === 0 ? 1 : 0,
    hit5: posicion >= 0 && posicion < 5 ? 1 : 0,
    mrr: posicion >= 0 ? 1 / (posicion + 1) : 0,
  };
};

console.log(`retrieval: ${set.queries.length} preguntas · k=${k} · materia ${idMateria}`);
console.log(`embedder: ${sinModelo ? "desactivado (claves)" : (process.env.LEARNING_EMBED_BIN === process.execPath ? "fake determinista" : process.env.LEARNING_EMBED_BIN)}`);
for (const modo of modos) {
  if (!["claves", "semantico", "hibrido"].includes(modo)) throw new Error(`modo desconocido: ${modo}`);
  const mediciones = [];
  for (const ejemplo of set.queries) {
    const resultados = await indice.buscar(root, idMateria, ejemplo.q, { k, modo });
    mediciones.push(metricas(resultados, ejemplo.esperado));
  }
  const media = (clave) => mediciones.reduce((suma, medicion) => suma + medicion[clave], 0) / mediciones.length;
  console.log(`${modo.padEnd(9)} hit@1 ${media("hit1").toFixed(3)}  hit@5 ${media("hit5").toFixed(3)}  MRR ${media("mrr").toFixed(3)}`);
}
await indice.cerrarIndice();
