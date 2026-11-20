/**
 * Local hybrid index for a course's material (#373/T4). One SQLite file per
 * Learnings root keeps keyword chunks (FTS5), their source hash and their
 * float32 vectors; the embeddings themselves come from one long-lived
 * `bin/embed` child speaking the pinned JSON Lines contract. Uploading only
 * does the keyword work synchronously — vectors are filled by a background
 * queue — and a missing binary or model leaves the index usable with keywords.
 *
 * Storage mirrors integrations/pi/store.ts: WAL, a busy timeout and one
 * DatabaseSync per root. The file is `<dir of STUDIO_DB>/indice.db`, with
 * `STUDIO_INDICE_DB` as an explicit override.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { resolveContained } from "../integrations/pi/paths.ts";
import { dbPath } from "../integrations/pi/store.ts";
import { getMateria, listMaterias, type FuenteMateria } from "./materias.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

export const DIM = 384;
/** The exact FTS5 tokenizer: diacritics matter in the index, not in a query. */
export const TOKENIZER = "unicode61 remove_diacritics 2";
const TARGET_WORDS = 220;
const OVERLAP_WORDS = 40;
const BATCH = 32;
const RRF_K = 1;
/** Semantic ranks only contribute chunks at least this similar to the query. */
const MIN_COSENO = 0.8;
const MAX_K = 50;
const ARCHIVOS_MODELO = ["onnx/model_quantized.onnx", "tokenizer.json", "config.json", "special_tokens_map.json", "tokenizer_config.json"];

export type Senal = "keyword" | "semantic";
export type ModoBusqueda = "hibrido" | "claves" | "semantico";

export interface Segmento {
  pos: number;
  ubicacion: string;
  texto: string;
}

export interface Resultado {
  id: string;
  materia: string;
  fuente: string;
  tipo: string;
  nombre: string;
  ubicacion: string;
  texto: string;
  score: number;
  senales: Senal[];
  signals: Senal[];
}

export interface EstadoIndice {
  chunks: number;
  conVector: number;
  pendiente: number;
  semantica: boolean;
  fuentes: number;
}

export interface Progreso {
  materia: string;
  fuente: string;
  total: number;
  procesados: number;
  estado: "encolado" | "procesando" | "listo" | "error";
  error?: string;
}

export interface OpcionesIndice {
  /** An explicit command replaces the binary check; `null` forces keyword-only. */
  embedCommand?: string[] | null;
  modelDir?: string;
  dylibPath?: string;
  timeoutMs?: number;
  startupMs?: number;
}

interface Config {
  comando: string[] | null;
  inyectado: boolean;
  modelDir: string;
  dylibPath: string;
  timeoutMs: number;
  startupMs: number;
}

interface Atom {
  texto: string;
  palabras: number;
  linea: number;
  parrafo: number;
  pagina: number;
  salto: boolean;
  cabecera?: string;
  turno?: string;
}

interface Trabajo {
  root: string;
  materia: string;
  fuente: string;
  items: Array<{ id: string; texto: string }>;
}

interface CacheVectores {
  version: number;
  ids: string[];
  tipos: string[];
  datos: Float32Array;
}

// ---- Text preparation --------------------------------------------------------

/** Accent- and case-insensitive text for both FTS5 and deterministic chunk ids. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const HORA = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?)\b/;
const PONENTE = /^\s*(?:[-–—]\s*)?(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?[\p{L}\p{N}][\p{L}\p{N} .'_’-]{0,48}\s*:\s+/u;

function atomos(texto: string, nombre: string | undefined, tipo: string | undefined): { lista: Atom[]; paginas: number; conParrafos: boolean } {
  const lista: Atom[] = [];
  const paginas = texto.replace(/\r\n?/g, "\n").split("\f");
  const docx = Boolean(nombre?.toLowerCase().endsWith(".docx"));
  const transcripcion = tipo === "transcripcion";
  let linea = 0;
  let parrafo = 1;
  let enBlanco = false;
  let turno = "";

  for (const [indicePagina, pagina] of paginas.entries()) {
    for (const crudo of pagina.split("\n")) {
      linea++;
      const textoLinea = crudo.trim();
      if (!textoLinea) {
        if (!enBlanco) parrafo++;
        enBlanco = true;
        continue;
      }
      enBlanco = false;
      const numeroParrafo = docx ? lista.length + 1 : parrafo;
      const cabecera = transcripcion && (HORA.test(textoLinea) || PONENTE.test(textoLinea)) ? textoLinea : undefined;
      if (cabecera) turno = cabecera;
      const palabrasLinea = textoLinea.split(/\s+/).filter(Boolean);
      const paginaNumero = indicePagina + 1;
      // Transcripts are cut only between lines (a speaker/timestamp line is
      // never broken); every other source is cut between words. Both stay
      // inside a word, and both remember where a new line begins.
      if (transcripcion) {
        for (let offset = 0; offset < palabrasLinea.length; offset += 60) {
          const pieza = palabrasLinea.slice(offset, offset + 60).join(" ");
          lista.push({
            texto: pieza,
            palabras: Math.min(60, palabrasLinea.length - offset),
            linea,
            parrafo: numeroParrafo,
            pagina: paginaNumero,
            salto: offset === 0,
            cabecera: offset === 0 ? cabecera : undefined,
            turno,
          });
        }
      } else {
        for (const [position, palabra] of palabrasLinea.entries()) {
          lista.push({ texto: palabra, palabras: 1, linea, parrafo: numeroParrafo, pagina: paginaNumero, salto: position === 0 });
        }
      }
    }
  }
  return { lista, paginas: paginas.filter((pagina) => pagina.trim()).length, conParrafos: parrafo > 1 || docx };
}

function ubicacionDe(slice: Atom[], opciones: { nombre?: string; tipo?: string }, conParrafos: boolean): string {
  const pagina = slice[0].pagina;
  const ultimaPagina = slice.at(-1)!.pagina;
  if (opciones.nombre?.toLowerCase().endsWith(".pdf") || pagina !== 1 || ultimaPagina !== 1) {
    return pagina === ultimaPagina ? `página ${pagina}` : `páginas ${pagina}–${ultimaPagina}`;
  }
  const lineas = `${Math.min(...slice.map((atom) => atom.linea))}–${Math.max(...slice.map((atom) => atom.linea))}`;
  if (opciones.tipo === "transcripcion") return `líneas ${lineas}`;
  if (conParrafos) {
    const parrafos = `${Math.min(...slice.map((atom) => atom.parrafo))}–${Math.max(...slice.map((atom) => atom.parrafo))}`;
    return parrafos.startsWith("1–1") ? "párrafo 1" : `párrafos ${parrafos}`;
  }
  return `líneas ${lineas}`;
}

function textoDe(slice: Atom[], transcripcion: boolean): string {
  const lineas: string[] = [];
  for (const [index, atom] of slice.entries()) {
    if (index === 0 && transcripcion && atom.turno && !slice.some((otro) => otro.cabecera === atom.turno)) {
      lineas.push(atom.turno);
    }
    if (index > 0 && atom.salto) lineas.push(atom.texto);
    else if (index > 0) lineas[lineas.length - 1] += ` ${atom.texto}`;
    else lineas.push(atom.texto);
  }
  return lineas.join("\n").trim();
}

/** ~220 words, ~40 words of overlap, whole words and whole transcript lines only. */
export function segmentarTexto(texto: string, opciones: { nombre?: string; tipo?: string; objetivo?: number; solape?: number } = {}): Segmento[] {
  const { lista, conParrafos } = atomos(texto, opciones.nombre, opciones.tipo);
  const objetivo = opciones.objetivo ?? TARGET_WORDS;
  const solape = opciones.solape ?? OVERLAP_WORDS;
  const transcripcion = opciones.tipo === "transcripcion";
  const segmentos: Segmento[] = [];
  let inicio = 0;

  while (inicio < lista.length) {
    let fin = inicio;
    let palabras = 0;
    while (fin < lista.length && palabras < objetivo) {
      if (fin > inicio && lista[fin].pagina !== lista[inicio].pagina) break;
      palabras += lista[fin].palabras;
      fin++;
    }
    // Never leave a speaker heading as the last line of a transcript chunk.
    if (transcripcion && fin < lista.length && fin > inicio && lista[fin - 1].cabecera) fin++;
    const slice = lista.slice(inicio, fin);
    segmentos.push({
      pos: segmentos.length,
      ubicacion: ubicacionDe(slice, opciones, conParrafos),
      texto: textoDe(slice, transcripcion),
    });
    if (fin >= lista.length) break;
    let atras = 0;
    let siguiente = fin;
    while (siguiente > inicio && atras < solape) {
      siguiente--;
      atras += lista[siguiente].palabras;
    }
    inicio = Math.max(siguiente, inicio + 1);
  }
  return segmentos;
}

// ---- SQLite ------------------------------------------------------------------

const bases = new Map<string, DatabaseSync>();

export function indicePath(root: string): string {
  return process.env.STUDIO_INDICE_DB?.trim() || join(dirname(dbPath(root)), "indice.db");
}

function database(root: string): DatabaseSync {
  const clave = resolve(root);
  const existente = bases.get(clave);
  if (existente) return existente;
  const archivo = indicePath(clave);
  mkdirSync(dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS fuentes (
      materia TEXT NOT NULL, fuente TEXT NOT NULL, hash TEXT NOT NULL,
      PRIMARY KEY (materia, fuente)
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY, materia TEXT NOT NULL, fuente TEXT NOT NULL,
      tipo TEXT NOT NULL, nombre TEXT NOT NULL, pos INTEGER NOT NULL,
      ubicacion TEXT NOT NULL, texto TEXT NOT NULL, texto_norm TEXT NOT NULL,
      hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chunks_materia ON chunks (materia, fuente, pos);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      texto_norm, content='chunks', content_rowid='rowid', tokenize='${TOKENIZER}'
    );
    CREATE TABLE IF NOT EXISTS vectors (chunk_id TEXT PRIMARY KEY, vec BLOB NOT NULL);
  `);
  bases.set(clave, db);
  return db;
}

function transaccion<T>(db: DatabaseSync, trabajo: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const resultado = trabajo();
    db.exec("COMMIT");
    return resultado;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function idChunk(materia: string, fuente: string, segmento: Segmento, hash: string): string {
  return createHash("sha256")
    .update(`${materia}\0${fuente}\0${segmento.pos}\0${hash}\0${segmento.texto}`)
    .digest("hex");
}

function borraDelIndice(db: DatabaseSync, materia: string, fuente: string): number {
  const filas = db.prepare("SELECT rowid FROM chunks WHERE materia = ? AND fuente = ?").all(materia, fuente) as Array<{ rowid: number }>;
  for (const fila of filas) db.prepare("DELETE FROM chunks_fts WHERE rowid = ?").run(fila.rowid);
  db.prepare("DELETE FROM vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE materia = ? AND fuente = ?)").run(materia, fuente);
  db.prepare("DELETE FROM chunks WHERE materia = ? AND fuente = ?").run(materia, fuente);
  db.prepare("DELETE FROM fuentes WHERE materia = ? AND fuente = ?").run(materia, fuente);
  return filas.length;
}

function textoDeFuente(root: string, id: string, fuente: FuenteMateria): { ruta: string; texto: string; hash: string } {
  const raiz = resolve(root);
  const ruta = join(raiz, ".materias", id, fuente.texto);
  const contenido = resolveContained(raiz, ruta);
  if (!contenido.ok || contenido.targetReal !== ruta || !statSync(ruta).isFile()) {
    throw new Error(`El texto de la fuente ${fuente.id} no está dentro de la materia.`);
  }
  const bytes = readFileSync(ruta);
  return { ruta, texto: bytes.toString("utf8"), hash: createHash("sha256").update(bytes).digest("hex") };
}

// ---- Embedder client ----------------------------------------------------------

let ajuste: OpcionesIndice = {};
let fallido = false;
let cliente: ClienteEmbed | undefined;
let notificar: ((evento: Progreso) => void) | undefined;

function directorioModelo(): string {
  const modelo = join(process.env.XDG_DATA_HOME || join(process.env.HOME || "", ".local", "share"), "learning", "embed");
  return process.env.LEARNING_EMBED_DIR?.trim() || modelo;
}

function libreriaOrt(): string | undefined {
  if (process.env.LEARNING_EMBED_DYLIB?.trim()) return process.env.LEARNING_EMBED_DYLIB.trim();
  const raiz = directorioModelo();
  const candidatos = [
    join(raiz, "libonnxruntime.so"),
    join(raiz, "onnxruntime", "lib", "libonnxruntime.so"),
    join(raiz, "runtime", "lib", "libonnxruntime.so"),
  ];
  if (candidatos.some((candidato) => existsSync(candidato))) return candidatos.find((candidato) => existsSync(candidato));
  try {
    for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const posible = join(raiz, entrada.name, "lib", "libonnxruntime.so");
      if (existsSync(posible)) return posible;
    }
  } catch { /* no model directory yet */ }
  return undefined;
}

function configActual(): Config {
  const modelo = directorioModelo();
  const comun = {
    modelDir: ajuste.modelDir ?? process.env.LEARNING_EMBED_MODEL_DIR?.trim() ?? modelo,
    dylibPath: ajuste.dylibPath ?? libreriaOrt() ?? "",
    timeoutMs: ajuste.timeoutMs ?? Number(process.env.LEARNING_EMBED_TIMEOUT_MS ?? 30_000),
    startupMs: ajuste.startupMs ?? Number(process.env.LEARNING_EMBED_STARTUP_MS ?? 30_000),
  };
  if (ajuste.embedCommand === null) return { ...comun, comando: null, inyectado: false };
  if (ajuste.embedCommand?.length) return { ...comun, comando: [...ajuste.embedCommand], inyectado: true };
  const desdeEnv = process.env.LEARNING_EMBED_BIN?.trim();
  if (desdeEnv) {
    const args = (process.env.LEARNING_EMBED_ARGS ?? "").trim().split(/\s+/).filter(Boolean);
    return { ...comun, comando: [desdeEnv, ...args], inyectado: true };
  }
  return { ...comun, comando: [join(REPO, "bin", "embed")], inyectado: false };
}

function disponible(config: Config): boolean {
  if (fallido || !config.comando?.length) return false;
  if (config.inyectado) return true;
  const raiz = config.modelDir;
  return existsSync(config.comando[0])
    && ARCHIVOS_MODELO.every((archivo) => existsSync(join(raiz, archivo)))
    && Boolean(config.dylibPath && existsSync(config.dylibPath));
}

type Respuesta = { id: string; dim?: number; vectors?: string[]; error?: string };
type Espera = { resolve: (respuesta: Respuesta) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

class ClienteEmbed {
  private proc: ChildProcessWithoutNullStreams | undefined;
  private listo: Promise<void> | undefined;
  private buffer = "";
  private esperas = new Map<string, Espera>();
  private serie = 0;
  private reinicios = 0;
  private cola: Promise<unknown> = Promise.resolve();
  private cerrado = false;
  private stderr = "";
  private readonly config: Config;

  constructor(config: Config) { this.config = config; }

  /** One child per studio, started only when the first batch actually needs it. */
  private iniciar(): Promise<void> {
    if (this.listo) return this.listo;
    this.listo = new Promise<void>((resolve, reject) => {
      let resuelto = false;
      const timer = setTimeout(() => falla(new Error("el embedder no se puso listo a tiempo")), this.config.startupMs);
      const falla = (error: Error) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(timer);
        this.proc = undefined;
        reject(error);
      };
      const [bin, ...args] = this.config.comando ?? [];
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawn(bin!, [...args, "--model-dir", this.config.modelDir], {
          env: {
            ...process.env,
            ORT_DYLIB_PATH: this.config.dylibPath,
            EMBED_THREADS: process.env.EMBED_THREADS ?? "2",
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        falla(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.proc = proc;
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => {
        this.buffer += chunk;
        let corte: number;
        while ((corte = this.buffer.indexOf("\n")) >= 0) {
          const linea = this.buffer.slice(0, corte).trim();
          this.buffer = this.buffer.slice(corte + 1);
          if (!linea) continue;
          let mensaje: Respuesta & { ready?: boolean; model?: string };
          try { mensaje = JSON.parse(linea); } catch { continue; }
          if (mensaje.ready === true) {
            if (mensaje.dim !== DIM) falla(new Error(`el embedder anunció dim ${mensaje.dim}`));
            else { resuelto = true; clearTimeout(timer); resolve(); }
          } else if (mensaje.ready === false) {
            falla(new Error(mensaje.error ?? "el embedder no se pudo iniciar"));
          } else if (mensaje.id !== undefined) {
            this.entregar(mensaje);
          }
        }
      });
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-2000); });
      proc.on("error", (error) => falla(error));
      proc.on("exit", (code, senal) => {
        for (const espera of this.esperas.values()) {
          clearTimeout(espera.timer);
          espera.reject(new Error(`el embedder salió (${code ?? senal}): ${this.stderr}`));
        }
        this.esperas.clear();
        this.proc = undefined;
        if (!resuelto) falla(new Error(`el embedder salió (${code ?? senal}): ${this.stderr}`));
      });
    });
    return this.listo;
  }

  private entregar(mensaje: Respuesta): void {
    const espera = this.esperas.get(mensaje.id);
    if (!espera) return;
    clearTimeout(espera.timer);
    this.esperas.delete(mensaje.id);
    if (mensaje.error) espera.reject(new Error(mensaje.error));
    else espera.resolve(mensaje);
  }

  private pedir(kind: "passage" | "query", texts: string[]): Promise<Respuesta> {
    const proc = this.proc;
    if (!proc) return Promise.reject(new Error("el embedder no está vivo"));
    const id = `${Date.now().toString(36)}-${++this.serie}`;
    return new Promise<Respuesta>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.esperas.delete(id);
        reject(new Error("timeout esperando vectores"));
      }, this.config.timeoutMs);
      this.esperas.set(id, { resolve, reject, timer });
      proc.stdin.write(`${JSON.stringify({ id, kind, texts })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.esperas.delete(id);
        reject(error);
      });
    });
  }

  private decodificar(respuesta: Respuesta, cantidad: number): Float32Array[] {
    if (respuesta.dim !== DIM || !Array.isArray(respuesta.vectors) || respuesta.vectors.length !== cantidad) {
      throw new Error("respuesta de vectores no válida");
    }
    return respuesta.vectors.map((base64) => {
      const bytes = Buffer.from(base64, "base64");
      if (bytes.length !== DIM * 4) throw new Error("vector de dimensiones incorrectas");
      const vector = new Float32Array(DIM);
      for (let index = 0; index < DIM; index++) vector[index] = bytes.readFloatLE(index * 4);
      return vector;
    });
  }

  /** Serializes requests, retries the whole batch once after a crash. */
  embed(kind: "passage" | "query", texts: string[]): Promise<Float32Array[]> {
    if (!texts.length) return Promise.resolve([]);
    const ejecutar = async (): Promise<Float32Array[]> => {
      for (let intento = 0; intento < 2; intento++) {
        try {
          await this.iniciar();
          return this.decodificar(await this.pedir(kind, texts), texts.length);
        } catch (error) {
          this.limpiar();
          if (intento === 0 && this.reinicios === 0 && !this.cerrado) { this.reinicios++; continue; }
          throw error;
        }
      }
      throw new Error("el embedder no pudo responder");
    };
    const resultado = this.cola.then(ejecutar, ejecutar);
    this.cola = resultado.then(() => undefined, () => undefined);
    return resultado;
  }

  private limpiar(): void {
    for (const espera of this.esperas.values()) clearTimeout(espera.timer);
    this.esperas.clear();
    this.proc = undefined;
    this.listo = undefined;
    this.buffer = "";
  }

  async cerrar(): Promise<void> {
    this.cerrado = true;
    for (const espera of this.esperas.values()) {
      clearTimeout(espera.timer);
      espera.reject(new Error("el embedder se está cerrando"));
    }
    this.esperas.clear();
    const proc = this.proc;
    this.limpiar();
    if (!proc) return;
    await new Promise<void>((resolve) => {
      const temporal = setTimeout(() => { try { proc.kill(); } catch { /* ya salió */ } }, 500);
      proc.once("exit", () => { clearTimeout(temporal); resolve(); });
      try { proc.stdin.end(); } catch { /* ya salió */ }
    });
  }
}

/** Replaces the child's command; an empty object restores the pinned default. */
export function configurarIndice(opciones: OpcionesIndice = {}): void {
  const anterior = cliente;
  cliente = undefined;
  ajuste = { ...opciones };
  fallido = false;
  if (anterior) void anterior.cerrar();
}

/** The studio forwards queue progress to its SSE stream. */
export function progresoIndice(fn: (evento: Progreso) => void): void { notificar = fn; }

function emitir(evento: Progreso): void {
  if (!notificar) return;
  try { notificar(evento); } catch { /* a closed stream cannot stop the queue */ }
}

function clientePara(): ClienteEmbed {
  if (!cliente) cliente = new ClienteEmbed(configActual());
  return cliente;
}

function bytesDe(vector: Float32Array): Buffer {
  const bytes = Buffer.alloc(vector.length * 4);
  for (let index = 0; index < vector.length; index++) bytes.writeFloatLE(vector[index], index * 4);
  return bytes;
}

const versiones = new Map<string, number>();
const datosCache = new Map<string, CacheVectores>();

function claveCache(root: string, materia: string): string { return `${resolve(root)}\0${materia}`; }

function invalidar(root: string, materia?: string): void {
  const prefijo = `${resolve(root)}\0`;
  if (materia === undefined) {
    for (const clave of versiones.keys()) if (clave.startsWith(prefijo)) versiones.set(clave, (versiones.get(clave) ?? 0) + 1);
    return;
  }
  const clave = claveCache(root, materia);
  versiones.set(clave, (versiones.get(clave) ?? 0) + 1);
}

function cacheDe(db: DatabaseSync, root: string, materia: string): CacheVectores {
  const clave = claveCache(root, materia);
  const version = versiones.get(clave) ?? 0;
  const guardado = datosCache.get(clave);
  if (guardado && guardado.version === version) return guardado;
  const filas = db.prepare(`
    SELECT c.id AS id, c.tipo AS tipo, v.vec AS vec
    FROM vectors v JOIN chunks c ON c.id = v.chunk_id
    WHERE c.materia = ? ORDER BY c.pos
  `).all(materia) as Array<{ id: string; tipo: string; vec: Uint8Array }>;
  const datos = new Float32Array(filas.length * DIM);
  const ids: string[] = [];
  const tipos: string[] = [];
  filas.forEach((fila, index) => {
    if (fila.vec.byteLength !== DIM * 4) return;
    ids.push(fila.id);
    tipos.push(fila.tipo);
    const bytes = new Uint8Array(fila.vec.buffer, fila.vec.byteOffset, fila.vec.byteLength);
    datos.set(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), index * DIM);
  });
  const resultado: CacheVectores = { version, ids: ids.slice(0, ids.length), tipos, datos };
  datosCache.set(clave, resultado);
  return resultado;
}

function guardarVectores(root: string, materia: string, items: Array<{ id: string; vector: Float32Array }>): void {
  const db = database(root);
  transaccion(db, () => {
    const insertar = db.prepare("INSERT INTO vectors (chunk_id, vec) VALUES (?, ?) ON CONFLICT(chunk_id) DO UPDATE SET vec = excluded.vec");
    for (const item of items) {
      // A rehash while a batch was in flight must not resurrect a stale chunk.
      if (db.prepare("SELECT 1 FROM chunks WHERE id = ?").get(item.id)) insertar.run(item.id, bytesDe(item.vector));
    }
  });
  invalidar(root, materia);
}

// ---- Background embedding queue ----------------------------------------------

const trabajos: Trabajo[] = [];
let cola: Promise<void> = Promise.resolve();

export function esperarIndice(): Promise<void> { return cola; }

function encolar(trabajo: Trabajo): void {
  trabajos.push(trabajo);
  emitir({ materia: trabajo.materia, fuente: trabajo.fuente, total: trabajo.items.length, procesados: 0, estado: "encolado" });
  cola = cola.then(() => drenar(), () => drenar());
}

async function drenar(): Promise<void> {
  while (trabajos.length) {
    const trabajo = trabajos.shift()!;
    await procesar(trabajo);
  }
}

async function procesar(trabajo: Trabajo): Promise<void> {
  const config = configActual();
  if (!disponible(config) || !trabajo.items.length) {
    emitir({ ...trabajo, total: trabajo.items.length, procesados: 0, estado: "error", error: "sin embedder disponible" });
    return;
  }
  emitir({ materia: trabajo.materia, fuente: trabajo.fuente, total: trabajo.items.length, procesados: 0, estado: "procesando" });
  const embedder = clientePara();
  let procesados = 0;
  for (let offset = 0; offset < trabajo.items.length; offset += BATCH) {
    const lote = trabajo.items.slice(offset, offset + BATCH);
    try {
      const vectores = await embedder.embed("passage", lote.map((item) => item.texto));
      guardarVectores(trabajo.root, trabajo.materia, lote.map((item, index) => ({ id: item.id, vector: vectores[index] })));
      procesados += lote.length;
    } catch (error) {
      fallido = true;
      emitir({
        materia: trabajo.materia, fuente: trabajo.fuente, total: trabajo.items.length, procesados,
        estado: "error", error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }
  emitir({ materia: trabajo.materia, fuente: trabajo.fuente, total: trabajo.items.length, procesados, estado: "listo" });
}

export async function cerrarIndice(): Promise<void> {
  await cola;
  const actual = cliente;
  cliente = undefined;
  if (actual) await actual.cerrar();
}

// ---- Incremental index -------------------------------------------------------

function pendientesDe(db: DatabaseSync, materia: string, fuente: string): Array<{ id: string; texto: string }> {
  return db.prepare(`
    SELECT c.id AS id, c.texto AS texto FROM chunks c
    LEFT JOIN vectors v ON v.chunk_id = c.id
    WHERE c.materia = ? AND c.fuente = ? AND v.chunk_id IS NULL ORDER BY c.pos
  `).all(materia, fuente) as Array<{ id: string; texto: string }>;
}

/** Keyword rows are committed before this returns; vectors are queued only. */
export function indizarFuente(root: string, id: string, fuente: FuenteMateria): { chunks: number; reindexado: boolean; pendiente: number } {
  const raiz = resolve(root);
  const db = database(raiz);
  const { texto, hash } = textoDeFuente(raiz, id, fuente);
  const anterior = db.prepare("SELECT hash FROM fuentes WHERE materia = ? AND fuente = ?").get(id, fuente.id) as { hash: string } | undefined;
  const contados = (db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE materia = ? AND fuente = ?").get(id, fuente.id) as { n: number }).n;

  if (anterior?.hash === hash && contados > 0) {
    const pendientes = pendientesDe(db, id, fuente.id);
    if (pendientes.length && disponible(configActual())) encolar({ root: raiz, materia: id, fuente: fuente.id, items: pendientes });
    return { chunks: contados, reindexado: false, pendiente: pendientes.length };
  }

  const segmentos = segmentarTexto(texto, { nombre: fuente.nombre, tipo: fuente.tipo });
  transaccion(db, () => {
    borraDelIndice(db, id, fuente.id);
    const insertar = db.prepare(`
      INSERT INTO chunks (id, materia, fuente, tipo, nombre, pos, ubicacion, texto, texto_norm, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertarFts = db.prepare("INSERT INTO chunks_fts (rowid, texto_norm) VALUES (?, ?)");
    for (const segmento of segmentos) {
      const chunkId = idChunk(id, fuente.id, segmento, hash);
      const normalized = normalizar(segmento.texto);
      const inserted = insertar.run(chunkId, id, fuente.id, fuente.tipo, fuente.nombre, segmento.pos, segmento.ubicacion, segmento.texto, normalized, hash);
      insertarFts.run(Number(inserted.lastInsertRowid), normalized);
    }
    db.prepare("INSERT INTO fuentes (materia, fuente, hash) VALUES (?, ?, ?) ON CONFLICT(materia, fuente) DO UPDATE SET hash = excluded.hash")
      .run(id, fuente.id, hash);
  });
  invalidar(raiz, id);
  const pendientes = pendientesDe(db, id, fuente.id);
  if (pendientes.length) encolar({ root: raiz, materia: id, fuente: fuente.id, items: pendientes });
  return { chunks: segmentos.length, reindexado: true, pendiente: pendientes.length };
}

/** Called after a source was moved to `.papelera`. */
export function desindizarFuente(root: string, id: string, fuenteId: string): number {
  const db = database(resolve(root));
  const borrados = transaccion(db, () => borraDelIndice(db, id, fuenteId));
  invalidar(root, id);
  return borrados;
}

/** Reconciles the index with materia.json, including a changed text hash. */
export function sincronizarMateria(root: string, id: string): EstadoIndice {
  const materia = getMateria(root, id);
  const presentes = new Set<string>();
  for (const fuente of materia.fuentes) {
    indizarFuente(root, id, fuente);
    presentes.add(fuente.id);
  }
  const db = database(resolve(root));
  const antiguas = db.prepare("SELECT fuente FROM fuentes WHERE materia = ?").all(id) as Array<{ fuente: string }>;
  for (const fila of antiguas) {
    if (presentes.has(fila.fuente)) continue;
    transaccion(db, () => borraDelIndice(db, id, fila.fuente));
    invalidar(root, id);
  }
  return estadoIndice(root, id);
}

/** Recomputes every chunk from the stored files: same files, same chunk ids. */
export function reconstruirIndice(root: string, id?: string): { materias: number; fuentes: number; chunks: number } {
  const raiz = resolve(root);
  const db = database(raiz);
  transaccion(db, () => {
    db.exec("DELETE FROM vectors");
    db.exec("DELETE FROM chunks");
    db.exec("DELETE FROM fuentes");
    db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')");
  });
  invalidar(raiz);
  const materias = id ? [getMateria(raiz, id)] : listMaterias(raiz).map((materia) => getMateria(raiz, materia.id));
  let fuentes = 0;
  let chunks = 0;
  for (const materia of materias) {
    for (const fuente of materia.fuentes) {
      chunks += indizarFuente(raiz, materia.id, fuente).chunks;
      fuentes++;
    }
  }
  return { materias: materias.length, fuentes, chunks };
}

export function estadoIndice(root: string, id: string): EstadoIndice {
  const db = database(resolve(root));
  const cuenta = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
  const chunks = cuenta("SELECT COUNT(*) AS n FROM chunks WHERE materia = ?");
  const conVector = cuenta(`
    SELECT COUNT(DISTINCT v.chunk_id) AS n FROM vectors v
    JOIN chunks c ON c.id = v.chunk_id WHERE c.materia = ?
  `);
  const fuentes = cuenta("SELECT COUNT(*) AS n FROM fuentes WHERE materia = ?");
  return { chunks, conVector, pendiente: chunks - conVector, semantica: disponible(configActual()), fuentes };
}

// ---- Hybrid search ------------------------------------------------------------

/** Reciprocal Rank Fusion, rank 1 = best; ties break by id for reproducibility. */
export function fusionarRRF(listas: readonly (readonly string[])[]): Array<{ id: string; score: number; senales: string[] }> {
  const combinadas = new Map<string, { id: string; score: number; listas: number[] }>();
  listas.forEach((lista, indice) => {
    const vistos = new Set<string>();
    lista.forEach((id, posicion) => {
      if (vistos.has(id)) return;
      vistos.add(id);
      const actual = combinadas.get(id) ?? { id, score: 0, listas: [] };
      actual.score += 1 / (RRF_K + posicion + 1);
      actual.listas.push(indice);
      combinadas.set(id, actual);
    });
  });
  return [...combinadas.values()]
    .map((actual) => ({
      id: actual.id,
      score: actual.score,
      senales: actual.listas.map((indice) => indice === 0 ? "keyword" : indice === 1 ? "semantic" : `lista-${indice}`),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function porClave(db: DatabaseSync, materia: string, consulta: string, tipos: string[], limite: number): string[] {
  const terminos = normalizar(consulta).split(" ").filter(Boolean).slice(0, 16);
  if (!terminos.length) return [];
  const match = terminos.map((termino) => `"${termino.replace(/"/g, '""')}"`).join(" OR ");
  const filtro = tipos.length ? ` AND c.tipo IN (${tipos.map(() => "?").join(", ")})` : "";
  const sql = `
    SELECT c.id AS id FROM chunks_fts f
    JOIN chunks c ON c.rowid = f.rowid
    WHERE chunks_fts MATCH ? AND c.materia = ?${filtro}
    ORDER BY bm25(chunks_fts) LIMIT ?
  `;
  const filas = db.prepare(sql).all(match, materia, ...tipos, limite) as Array<{ id: string }>;
  return filas.map((fila) => fila.id);
}

async function porVector(db: DatabaseSync, root: string, materia: string, consulta: string, tipos: string[], limite: number): Promise<string[]> {
  if (!disponible(configActual())) return [];
  const cache = cacheDe(db, root, materia);
  if (!cache.ids.length) return [];
  const [vector] = await clientePara().embed("query", [consulta]);
  let norma = 0;
  for (const valor of vector) norma += valor * valor;
  if (!norma) return [];
  const puntuados: Array<{ id: string; coseno: number }> = [];
  for (const [index, id] of cache.ids.entries()) {
    if (tipos.length && !tipos.includes(cache.tipos[index])) continue;
    let coseno = 0;
    for (let dimension = 0; dimension < DIM; dimension++) coseno += vector[dimension] * cache.datos[index * DIM + dimension];
    if (coseno < MIN_COSENO) continue;
    puntuados.push({ id, coseno });
  }
  return puntuados.sort((a, b) => b.coseno - a.coseno || a.id.localeCompare(b.id)).slice(0, limite).map((item) => item.id);
}

export async function buscar(
  root: string,
  materia: string,
  consulta: string,
  opciones: { k?: number; tipos?: string[]; modo?: ModoBusqueda } = {},
): Promise<Resultado[]> {
  const db = database(resolve(root));
  const k = Math.max(1, Math.min(MAX_K, Math.trunc(opciones.k ?? 8)));
  const tipos = (opciones.tipos ?? []).filter((tipo) => tipo === "examen" || tipo === "documento" || tipo === "transcripcion");
  const modo = opciones.modo ?? "hibrido";
  const limite = Math.max(k * 4, 20);
  const claves = modo === "semantico" ? [] : porClave(db, materia, consulta, tipos, limite);
  let vectores: string[] = [];
  if (modo !== "claves") {
    try { vectores = await porVector(db, root, materia, consulta, tipos, limite); }
    catch { /* an embedder failure degrades to keywords, never to a failed search */ }
  }
  const combinadas = fusionarRRF([claves, vectores]);
  const resultados: Resultado[] = [];
  for (const combinada of combinadas.slice(0, k)) {
    const fila = db.prepare("SELECT id, materia, fuente, tipo, nombre, ubicacion, texto FROM chunks WHERE id = ?").get(combinada.id) as
      | { id: string; materia: string; fuente: string; tipo: string; nombre: string; ubicacion: string; texto: string }
      | undefined;
    if (!fila) continue;
    const senales = combinada.senales as Senal[];
    resultados.push({ ...fila, score: combinada.score, senales, signals: [...senales] });
  }
  return resultados;
}

// ---- Rebuild command ---------------------------------------------------------

const invocado = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocado) {
  const argumentos = process.argv.slice(2);
  const posicion = argumentos.indexOf("--rebuild");
  const objetivo = posicion >= 0 ? argumentos[posicion + 1] : undefined;
  if (!objetivo) {
    console.error("Uso: node studio/indice.ts --rebuild <root>");
    process.exitCode = 2;
  } else {
    try {
      const informe = reconstruirIndice(resolve(objetivo));
      await esperarIndice();
      await cerrarIndice();
      console.log(`reconstruido: ${informe.materias} materias, ${informe.fuentes} fuentes, ${informe.chunks} chunks`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
