/**
 * Course materials: a course ("materia") groups the real exams, documents and
 * transcripts the learner uploads for a subject. Everything lives under the
 * Learnings root; this module owns the on-disk contract, validation, extraction
 * and the per-course lock that keeps concurrent uploads from losing a source.
 *
 * Storage (server only):
 *   <root>/.materias/<courseId>/materia.json
 *   <root>/.materias/<courseId>/fuentes/<sourceId>/<safe-name> (+ extracted .txt and PDF pages)
 *
 * The PDF derivative code is shared with the older `api/subir` upload so both
 * routes keep the same pdftotext / pdftoppm guarantees.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { basename, extname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { HttpError } from "../integrations/pi/errors.ts";
import { resolveContained, safeTopic } from "../integrations/pi/paths.ts";

export const MAX_FUENTE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const PDF_PAGE_DPI = 150;
const PDF_PAGE_INFO_FILE = "pages.json";
const SLUG = /^[a-f0-9]{32}$/;

export const MATERIA_ERRORS = {
  tooLarge: "El archivo supera el límite de 20 MB.",
  unsupported: "Tipo de archivo no permitido. Sube PDF, PNG, JPEG, WebP, DOCX, TXT o MD.",
  pdfText: "No se pudo extraer el texto del PDF.",
  pdfPages: "No se pudieron generar las imágenes de las páginas del PDF.",
  storage: "No se pudo guardar el archivo en el vault.",
  filename: "Incluye un nombre de archivo válido en X-File-Name.",
  empty: "El archivo está vacío.",
  nombre: "Incluye un nombre de materia válido.",
  tipo: "X-Tipo debe ser examen, documento o transcripcion.",
  curso: "No existe esa materia.",
  fuente: "No existe esa fuente en la materia.",
  tema: "No existe ese tema.",
  ocupado: "Ese tema ya pertenece a otra materia.",
} as const;

export type TipoFuente = "examen" | "documento" | "transcripcion";
const TIPOS = new Set<TipoFuente>(["examen", "documento", "transcripcion"]);

/** The MIME allow-list extends today's upload types with DOCX, TXT and MD. */
const TIPOS_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

export interface FuenteMateria {
  id: string;
  tipo: TipoFuente;
  nombre: string;
  /** Relative to the course folder, e.g. `fuentes/<id>/apuntes.pdf`. */
  archivo: string;
  bytes: number;
  subida: string;
  paginas?: number;
  /** Relative to the course folder: always a UTF-8 text file. */
  texto: string;
}

export interface Materia {
  id: string;
  nombre: string;
  creada: string;
  temas: string[];
  fuentes: FuenteMateria[];
}

export interface MateriaSummary {
  id: string;
  nombre: string;
  temas: string[];
  fuentes: number;
  porTipo: Record<TipoFuente, number>;
}

export interface MateriaRef {
  id: string;
  nombre: string;
}

export interface FuenteInput {
  fileName: string;
  contentType: string;
  tipo: string;
  content: Buffer;
}

// ---- Small shared primitives -------------------------------------------------

function bad(status: number, message: string): never {
  throw new HttpError(status, message);
}

function materiasRoot(root: string): string {
  return join(root, ".materias");
}

function courseDir(root: string, id: string): string {
  if (!SLUG.test(id)) bad(404, MATERIA_ERRORS.curso);
  return join(materiasRoot(root), id);
}

/** Creates a directory only after its parent is proven to be inside the vault. */
function ensureDirectory(root: string, directory: string): void {
  const parent = join(directory, "..");
  if (!existsSync(parent)) bad(500, MATERIA_ERRORS.storage);
  const containedParent = resolveContained(root, parent);
  if (!containedParent.ok || containedParent.targetReal !== parent || !statSync(parent).isDirectory()) {
    bad(500, MATERIA_ERRORS.storage);
  }
  if (!existsSync(directory)) {
    try {
      mkdirSync(directory);
    } catch {
      bad(500, MATERIA_ERRORS.storage);
    }
  }
  const contained = resolveContained(root, directory);
  if (!contained.ok || contained.targetReal !== directory || !statSync(directory).isDirectory()) {
    bad(500, MATERIA_ERRORS.storage);
  }
}

function containedFile(root: string, file: string): void {
  const contained = resolveContained(root, file);
  if (!contained.ok || contained.targetReal !== file || !statSync(file).isFile()) {
    bad(500, MATERIA_ERRORS.storage);
  }
}

/** materia.json is never edited in place: readers see either the old or the new document. */
function writeMateria(root: string, materia: Materia): void {
  const directory = courseDir(root, materia.id);
  const temp = join(directory, `.materia-${randomBytes(8).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(materia, null, 2)}\n`, { flag: "wx" });
    renameSync(temp, join(directory, "materia.json"));
  } catch {
    try { rmSync(temp, { force: true }); } catch { /* best effort */ }
    bad(500, MATERIA_ERRORS.storage);
  }
}

// ---- Locks -------------------------------------------------------------------

type Gate = Promise<void>;
const courseGates = new Map<string, Gate>();

/** Two uploads to the same course queue; uploads to different courses do not. */
async function withCourseLock<T>(root: string, id: string, work: () => Promise<T> | T): Promise<T> {
  const key = `${root}:${id}`;
  const previous = courseGates.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const gate: Gate = previous.then(() => current, () => current);
  courseGates.set(key, gate);
  await previous.catch(() => {});
  try {
    return await work();
  } finally {
    release();
    if (courseGates.get(key) === gate) courseGates.delete(key);
  }
}

/** Topic ownership spans courses, so linking and unlinking share one gate. */
let topicGate: Gate = Promise.resolve();
async function withTopicLock<T>(work: () => Promise<T> | T): Promise<T> {
  const previous = topicGate;
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const gate: Gate = previous.then(() => current, () => current);
  topicGate = gate;
  await previous.catch(() => {});
  try {
    return await work();
  } finally {
    release();
    if (topicGate === gate) topicGate = Promise.resolve();
  }
}

// ---- Validation and extraction -----------------------------------------------

/** Rejects separators and dot-dot before reducing a name to its safe leaf. */
export function safeMateriaName(raw: string, extension: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    bad(400, MATERIA_ERRORS.filename);
  }
  if (!decoded || decoded.includes("\0") || decoded.includes("/") || decoded.includes("\\")) {
    bad(400, MATERIA_ERRORS.filename);
  }
  const leaf = basename(decoded);
  const ext = extname(leaf).toLowerCase();
  if (ext !== extension && !(extension === ".jpg" && ext === ".jpeg")) {
    bad(415, MATERIA_ERRORS.unsupported);
  }
  const stem = (ext ? leaf.slice(0, -ext.length) : leaf)
    .normalize("NFKC")
    .replace(/\.{2,}/g, ".")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  let safe = "";
  for (const character of stem) {
    if (Buffer.byteLength(safe + character, "utf8") > 255 - Buffer.byteLength(extension, "utf8")) break;
    safe += character;
  }
  return `${safe.replace(/[.\s]+$/g, "") || "documento"}${extension}`;
}

function validMime(contentType: string): string {
  const mime = String(contentType).split(";", 1)[0].trim().toLowerCase();
  if (!Object.hasOwn(TIPOS_MIME, mime)) bad(415, MATERIA_ERRORS.unsupported);
  return mime;
}

function assertContent(mime: string, content: Buffer): void {
  const starts = (bytes: number[]) => bytes.every((byte, index) => content[index] === byte);
  const ascii = (text: string) => content.subarray(0, text.length).toString("ascii") === text;
  if (!content.length) bad(400, MATERIA_ERRORS.empty);
  if (content.length > MAX_FUENTE_BYTES) bad(413, MATERIA_ERRORS.tooLarge);
  if (mime === "application/pdf" && !ascii("%PDF-")) bad(415, MATERIA_ERRORS.unsupported);
  if (mime === "image/png" && !starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) bad(415, MATERIA_ERRORS.unsupported);
  if (mime === "image/jpeg" && !starts([0xff, 0xd8, 0xff])) bad(415, MATERIA_ERRORS.unsupported);
  if (mime === "image/webp" && !(ascii("RIFF") && content.subarray(8, 12).toString("ascii") === "WEBP")) {
    bad(415, MATERIA_ERRORS.unsupported);
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !starts([0x50, 0x4b, 0x03, 0x04])) {
    bad(415, MATERIA_ERRORS.unsupported);
  }
}

/** Reads the raw body of a source upload, with the same 20 MiB bound as `api/subir`. */
export async function readFuenteBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size <= MAX_FUENTE_BYTES) chunks.push(bytes);
  }
  if (size > MAX_FUENTE_BYTES) bad(413, MATERIA_ERRORS.tooLarge);
  if (!size) bad(400, MATERIA_ERRORS.empty);
  return Buffer.concat(chunks, size);
}

/** The ZIP reader DOCX needs: central directory + raw deflate, no new dependency. */
function zipMember(archive: Buffer, wanted: string): Buffer {
  if (archive.length < 22 || archive.readUInt32LE(0) !== 0x04034b50) bad(415, MATERIA_ERRORS.unsupported);
  let end = -1;
  for (let at = archive.length - 22; at >= Math.max(0, archive.length - 22 - 65535); at--) {
    if (archive.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) bad(415, MATERIA_ERRORS.unsupported);
  let cursor = archive.readUInt32LE(end + 16);
  const entries = archive.readUInt16LE(end + 10);
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) bad(415, MATERIA_ERRORS.unsupported);
    const method = archive.readUInt16LE(cursor + 10);
    const compressed = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const local = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name !== wanted) continue;
    if (local + 30 > archive.length || archive.readUInt32LE(local) !== 0x04034b50) bad(415, MATERIA_ERRORS.unsupported);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    if (start + compressed > archive.length) bad(415, MATERIA_ERRORS.unsupported);
    const body = archive.subarray(start, start + compressed);
    if (method === 0) return body;
    if (method === 8) {
      try { return inflateRawSync(body); } catch { bad(415, MATERIA_ERRORS.unsupported); }
    }
    bad(415, MATERIA_ERRORS.unsupported);
  }
  bad(415, MATERIA_ERRORS.unsupported);
}

function xmlText(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_all, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[entity] ?? entity;
  });
}

/** Paragraph-by-paragraph text from word/document.xml, including XML entities. */
function docxText(content: Buffer): string {
  let document: string;
  try {
    document = zipMember(content, "word/document.xml").toString("utf8");
  } catch {
    bad(415, MATERIA_ERRORS.unsupported);
  }
  const texts = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => xmlText(match[1]));
  const paragraphs = [...document.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match) => texts(match[1]).join(""));
  const lines = paragraphs.length ? paragraphs : texts(document);
  if (!lines.some((line) => line.trim())) bad(415, MATERIA_ERRORS.unsupported);
  return `${lines.join("\n")}\n`;
}

/**
 * Shared PDF derivatives: UTF-8 text, up to 20 page PNGs and the page manifest.
 * Both the old `api/subir` route and course uploads call this function.
 */
export async function writePdfDerivatives(
  root: string,
  directory: string,
  filePath: string,
  nombre: string,
): Promise<{ textPath: string; totalPages: number; renderedPages: number; truncated: boolean }> {
  const textPath = `${filePath}.txt`;
  const failure = await new Promise<Error | null>((resolveFailure) => {
    execFile("pdftotext", [filePath, textPath], { timeout: 30_000 }, (error) => resolveFailure(error));
  });
  if (failure) bad(500, MATERIA_ERRORS.pdfText);
  containedFile(root, textPath);
  const renderPrefix = join(directory, "render");
  const renderFailure = await new Promise<Error | null>((resolveFailure) => {
    execFile(
      "pdftoppm",
      ["-f", "1", "-l", String(MAX_PDF_PAGES), "-r", String(PDF_PAGE_DPI), "-png", "-forcenum", filePath, renderPrefix],
      { timeout: 30_000 },
      (error) => resolveFailure(error),
    );
  });
  if (renderFailure) bad(500, MATERIA_ERRORS.pdfPages);
  const pageInfo = await new Promise<{ error: Error | null; stdout: string }>((resolveInfo) => {
    execFile("pdfinfo", [filePath], { timeout: 30_000 }, (error, stdout) => resolveInfo({ error, stdout }));
  });
  const pageCount = /^Pages:\s+(\d+)\s*$/m.exec(pageInfo.stdout)?.[1];
  if (pageInfo.error || !pageCount || Number(pageCount) < 1 || !Number.isSafeInteger(Number(pageCount))) {
    bad(500, MATERIA_ERRORS.pdfPages);
  }
  const totalPages = Number(pageCount);
  const renderedPages = Math.min(totalPages, MAX_PDF_PAGES);
  const renderedByPage = new Map<number, string>();
  for (const name of readdirSync(directory)) {
    const match = /^render-0*([1-9]\d*)\.png$/.exec(name);
    if (!match) continue;
    const page = Number(match[1]);
    if (page > renderedPages || renderedByPage.has(page)) bad(500, MATERIA_ERRORS.pdfPages);
    renderedByPage.set(page, join(directory, name));
  }
  if (renderedByPage.size !== renderedPages) bad(500, MATERIA_ERRORS.pdfPages);
  for (let page = 1; page <= renderedPages; page++) {
    const renderedPath = renderedByPage.get(page);
    if (!renderedPath) bad(500, MATERIA_ERRORS.pdfPages);
    containedFile(root, renderedPath);
    const pagePath = `${filePath}.p${page}.png`;
    renameSync(renderedPath, pagePath);
    containedFile(root, pagePath);
  }
  const infoPath = join(directory, PDF_PAGE_INFO_FILE);
  writeFileSync(infoPath, JSON.stringify({
    pdf: nombre,
    totalPages,
    renderedPages,
    truncated: totalPages > MAX_PDF_PAGES,
  }), { flag: "wx" });
  containedFile(root, infoPath);
  return { textPath, totalPages, renderedPages, truncated: totalPages > MAX_PDF_PAGES };
}

// ---- Public course API -------------------------------------------------------

export function createMateria(root: string, nombre: unknown): Materia {
  if (typeof nombre !== "string") bad(400, MATERIA_ERRORS.nombre);
  const clean = nombre.trim();
  if (!clean || clean.length > 200 || /[\0\r\n]/.test(clean)) bad(400, MATERIA_ERRORS.nombre);
  ensureDirectory(root, materiasRoot(root));
  const id = randomBytes(16).toString("hex");
  const directory = join(materiasRoot(root), id);
  try {
    mkdirSync(directory);
  } catch {
    bad(500, MATERIA_ERRORS.storage);
  }
  const materia: Materia = { id, nombre: clean, creada: new Date().toISOString(), temas: [], fuentes: [] };
  try {
    writeMateria(root, materia);
  } catch (error) {
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* best effort */ }
    throw error;
  }
  return materia;
}

export function listMaterias(root: string): MateriaSummary[] {
  const directory = materiasRoot(root);
  if (!existsSync(directory)) return [];
  const contained = resolveContained(root, directory);
  if (!contained.ok || contained.targetReal !== directory || !statSync(directory).isDirectory()) return [];
  const summaries: MateriaSummary[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
    try {
      const materia = getMateria(root, entry.name);
      const porTipo: Record<TipoFuente, number> = { examen: 0, documento: 0, transcripcion: 0 };
      for (const fuente of materia.fuentes) porTipo[fuente.tipo]++;
      summaries.push({ id: materia.id, nombre: materia.nombre, temas: materia.temas, fuentes: materia.fuentes.length, porTipo });
    } catch {
      // One damaged course must not hide the others in the list.
    }
  }
  return summaries;
}

export function getMateria(root: string, id: string): Materia {
  const directory = courseDir(root, id);
  const contained = resolveContained(root, directory);
  if (!contained.ok || contained.targetReal !== directory || !statSync(directory).isDirectory()) {
    if (!existsSync(directory)) bad(404, MATERIA_ERRORS.curso);
    bad(500, MATERIA_ERRORS.storage);
  }
  const file = join(directory, "materia.json");
  containedFile(root, file);
  try {
    const doc = JSON.parse(readFileSync(file, "utf8")) as Materia;
    if (doc.id !== id || typeof doc.nombre !== "string" || !Array.isArray(doc.temas) || !Array.isArray(doc.fuentes)) {
      bad(500, MATERIA_ERRORS.storage);
    }
    return doc;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    bad(500, MATERIA_ERRORS.storage);
  }
}

/** Read-only lookup used by the topic summaries the UI already receives. */
export function materiaForTopic(root: string, tema: string): MateriaRef | null {
  for (const { id } of listMaterias(root)) {
    const materia = getMateria(root, id);
    if (materia.temas.includes(tema)) return { id: materia.id, nombre: materia.nombre };
  }
  return null;
}

export async function addFuente(root: string, id: string, input: FuenteInput): Promise<FuenteMateria> {
  getMateria(root, id);
  const mime = validMime(input.contentType);
  const tipo = input.tipo as TipoFuente;
  if (!TIPOS.has(tipo)) bad(400, MATERIA_ERRORS.tipo);
  const nombre = safeMateriaName(String(input.fileName ?? ""), TIPOS_MIME[mime]);
  assertContent(mime, input.content);
  let text: string;
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = docxText(input.content);
  } else if (mime === "text/plain" || mime === "text/markdown") {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(input.content);
    } catch {
      bad(415, MATERIA_ERRORS.unsupported);
    }
  } else {
    text = "";
  }
  return withCourseLock(root, id, async () => {
    const materia = getMateria(root, id);
    ensureDirectory(root, join(courseDir(root, id), "fuentes"));
    const fuenteId = randomBytes(16).toString("hex");
    const directory = join(courseDir(root, id), "fuentes", fuenteId);
    try {
      mkdirSync(directory);
    } catch {
      bad(500, MATERIA_ERRORS.storage);
    }
    try {
      const contained = resolveContained(root, directory);
      if (!contained.ok || contained.targetReal !== directory) bad(500, MATERIA_ERRORS.storage);
      const archivo = `fuentes/${fuenteId}/${nombre}`;
      const filePath = join(courseDir(root, id), archivo);
      writeFileSync(filePath, input.content, { flag: "wx" });
      containedFile(root, filePath);
      let pages: number | undefined;
      if (mime === "application/pdf") {
        const pdf = await writePdfDerivatives(root, directory, filePath, nombre);
        pages = pdf.totalPages;
      } else {
        const textPath = `${filePath}.txt`;
        writeFileSync(textPath, text, "utf8");
        containedFile(root, textPath);
      }
      const fuente: FuenteMateria = {
        id: fuenteId,
        tipo,
        nombre,
        archivo,
        bytes: input.content.length,
        subida: new Date().toISOString(),
        ...(pages === undefined ? {} : { paginas: pages }),
        texto: `${archivo}.txt`,
      };
      materia.fuentes.push(fuente);
      writeMateria(root, materia);
      return fuente;
    } catch (error) {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* best effort */ }
      throw error;
    }
  });
}

export async function deleteFuente(root: string, id: string, fuenteId: string): Promise<void> {
  if (!SLUG.test(fuenteId)) bad(404, MATERIA_ERRORS.fuente);
  await withCourseLock(root, id, () => {
    const materia = getMateria(root, id);
    const index = materia.fuentes.findIndex((fuente) => fuente.id === fuenteId);
    if (index < 0) bad(404, MATERIA_ERRORS.fuente);
    const source = join(courseDir(root, id), "fuentes", fuenteId);
    const contained = resolveContained(root, source);
    if (!contained.ok || contained.targetReal !== source || !statSync(source).isDirectory()) {
      bad(500, MATERIA_ERRORS.storage);
    }
    const trashRoot = join(courseDir(root, id), ".papelera");
    ensureDirectory(root, trashRoot);
    const trash = join(trashRoot, `${fuenteId}-${randomBytes(6).toString("hex")}`);
    renameSync(source, trash);
    const moved = resolveContained(root, trash);
    if (!moved.ok || moved.targetReal !== trash) bad(500, MATERIA_ERRORS.storage);
    materia.fuentes.splice(index, 1);
    try {
      writeMateria(root, materia);
    } catch (error) {
      renameSync(trash, source);
      throw error;
    }
  });
}

function topicOwner(root: string, tema: string): Materia | null {
  for (const { id } of listMaterias(root)) {
    const materia = getMateria(root, id);
    if (materia.temas.includes(tema)) return materia;
  }
  return null;
}

function checkTema(root: string, tema: unknown): string {
  if (!safeTopic(tema)) bad(400, MATERIA_ERRORS.tema);
  const dir = join(root, tema);
  const contained = resolveContained(root, dir);
  if (!contained.ok || contained.targetReal !== dir || !statSync(dir).isDirectory()) bad(404, MATERIA_ERRORS.tema);
  return tema;
}

export async function linkTema(root: string, id: string, tema: unknown): Promise<Materia> {
  getMateria(root, id);
  const safe = checkTema(root, tema);
  return withTopicLock(() => withCourseLock(root, id, () => {
    const materia = getMateria(root, id);
    if (materia.temas.includes(safe)) return materia;
    if (topicOwner(root, safe)) bad(409, MATERIA_ERRORS.ocupado);
    materia.temas.push(safe);
    writeMateria(root, materia);
    return materia;
  }));
}

export async function unlinkTema(root: string, id: string, tema: unknown): Promise<Materia> {
  getMateria(root, id);
  const safe = checkTema(root, tema);
  return withTopicLock(() => withCourseLock(root, id, () => {
    const materia = getMateria(root, id);
    const index = materia.temas.indexOf(safe);
    if (index < 0) bad(404, MATERIA_ERRORS.tema);
    materia.temas.splice(index, 1);
    writeMateria(root, materia);
    return materia;
  }));
}
