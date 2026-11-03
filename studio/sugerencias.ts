import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained, safeTopic } from "../integrations/pi/paths.ts";
import { readGlobalTelemetry } from "../integrations/pi/telemetry.ts";
import { readPreferences, savePreferences } from "./preferences.ts";

/**
 * What the learner asks of a part, and why. The reason is the point: a chip maps to
 * a preference level (so the next explanation already changes) and the words travel
 * with the prompt (so the tutor knows what was wrong with this one).
 *
 * The file is called `sugerencias.json` and not `feedback.json`: `feedback/{part}.json`
 * is the engine's own record of a finished part and must not be confused with it.
 */

/** The vocabulary the reader offers. Each chip moves the preferences one level. */
export const motivos = [
  { id: "demasiado-texto", texto: "Demasiado texto", ajustes: { texto: -1 } },
  { id: "faltan-ejemplos", texto: "Faltan ejemplos", ajustes: { ejemplos: 1 } },
  { id: "faltan-visuales", texto: "Faltan visuales", ajustes: { visuales: 1 } },
  { id: "muy-abstracto", texto: "Muy abstracto", ajustes: { analogias: 1 } },
  { id: "matematicas-confusas", texto: "Matemáticas confusas", ajustes: { matematicas: -1, pasos: 1 } },
  { id: "sin-paso-a-paso", texto: "Sin paso a paso", ajustes: { pasos: 1 } },
  { id: "sobran-preguntas", texto: "Sobran preguntas", ajustes: { preguntas: -1 } },
  { id: "no-entendi", texto: "No entendí una idea", ajustes: {} },
] as const;

/** A level is a string here: the preferences file is read from disk, not only from this module. */
export const niveles: readonly string[] = ["menos", "medio", "más"];

export type Origen = "sugerencia" | "regenerar";

export interface Sugerencia {
  id: string;
  tema: string;
  parte: string;
  motivos: string[];
  texto: string;
  origen: Origen;
  timestamp: string;
}

export interface SugerenciasFile {
  version: 1;
  actualizado: string;
  entradas: Sugerencia[];
}

const empty = (): SugerenciasFile => ({ version: 1, actualizado: "", entradas: [] });

/** Old entries are the ones that already changed a preference and the prompt: they go first. */
const MAX_ENTRADAS = 500;
/** The words that reach every prompt: enough to steer, few enough to stay readable. */
const MAX_TEXTO_DIRECTRIZ = 240;
const MAX_CITAS = 10;
const MAX_CONTEXTO = 1400;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const known = (id: string) => motivos.some((m) => m.id === id);

function filePath(root: string) {
  const file = join(root, "sugerencias.json");
  try {
    lstatSync(file);
    if (!resolveContained(root, file).ok) throw new HttpError(400, "invalid sugerencias path");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return file;
}

function clean(entrada: unknown): Sugerencia | null {
  if (!isRecord(entrada)) return null;
  const { id, tema, parte, motivos: reasons, texto, origen, timestamp } = entrada;
  if (typeof id !== "string" || typeof tema !== "string" || typeof parte !== "string") return null;
  if (!Array.isArray(reasons) || typeof texto !== "string" || typeof timestamp !== "string") return null;
  if (origen !== "sugerencia" && origen !== "regenerar") return null;
  return { id, tema, parte, motivos: reasons.filter((r): r is string => typeof r === "string" && known(r)), texto, origen, timestamp };
}

/** A store that cannot be read is not a broken studio: it reads as empty, and the next write keeps the old file aside. */
export function readSugerencias(root: string): SugerenciasFile {
  const file = filePath(root);
  let text: string;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
  try {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.entradas)) return empty();
    const entradas = data.entradas.map(clean).filter((e): e is Sugerencia => e !== null);
    return { version: 1, actualizado: typeof data.actualizado === "string" ? data.actualizado : "", entradas };
  } catch { return empty(); }
}

function write(file: string, data: SugerenciasFile) {
  const temp = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* no temporary file */ }
    throw error;
  }
}

/** The file that cannot be parsed is kept: suggestions are the learner's words, not a cache. */
function keepAside(root: string) {
  const file = filePath(root);
  try { readFileSync(file); } catch { return; }
  const data = readSugerencias(root);
  if (data.entradas.length > 0) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try { renameSync(file, join(root, `sugerencias.corrupta-${stamp}.json`)); } catch { /* nothing to keep */ }
}

function validate(raw: unknown): Omit<Sugerencia, "id" | "timestamp"> {
  if (!isRecord(raw)) throw new HttpError(400, "invalid sugerencia");
  const keys = Object.keys(raw);
  if (!keys.every((k) => ["tema", "parte", "motivos", "texto", "origen"].includes(k))) throw new HttpError(400, "invalid sugerencia");
  if (!safeTopic(raw.tema) || typeof raw.parte !== "string" || !/^p\d+$/.test(raw.parte)) throw new HttpError(400, "invalid sugerencia target");
  const texto = typeof raw.texto === "string" ? raw.texto.trim() : "";
  if (texto.length > 2000) throw new HttpError(400, "sugerencia text is too long");
  const reasons = raw.motivos === undefined ? [] : raw.motivos;
  if (!Array.isArray(reasons) || !reasons.every((r): r is string => typeof r === "string" && known(r))) throw new HttpError(400, "invalid sugerencia motivo");
  const origen = raw.origen === undefined ? "sugerencia" : raw.origen;
  if (origen !== "sugerencia" && origen !== "regenerar") throw new HttpError(400, "invalid sugerencia origen");
  // A reason is the whole point of the box: an empty one teaches nothing.
  if (reasons.length === 0 && texto.length === 0) throw new HttpError(400, "a sugerencia needs a motivo or a text");
  return { tema: raw.tema, parte: raw.parte, motivos: [...new Set(reasons)], texto, origen };
}

/**
 * Moves the aspects the chips name, one level each, and saves the preferences the
 * reader shows. Repeating a suggestion does not stack: "más ejemplos" twice is still más.
 */
function applyMotivos(root: string, chosen: string[]) {
  const preferences = readPreferences(root);
  let touched = false;
  for (const id of chosen) {
    const motivo = motivos.find((m) => m.id === id);
    if (!motivo) continue;
    for (const [aspecto, delta] of Object.entries(motivo.ajustes)) {
      const item = preferences.aspectos.find((a) => a.id === aspecto);
      if (!item) continue;
      const next = niveles[Math.min(niveles.length - 1, Math.max(0, niveles.indexOf(item.nivel) + delta))];
      if (next !== item.nivel) { item.nivel = next; touched = true; }
    }
  }
  return touched ? savePreferences(root, preferences) : preferences;
}

const label = (id: string) => motivos.find((m) => m.id === id)?.texto ?? id;
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** The words worth remembering, newest first, each said once. */
function citas(entradas: Sugerencia[]) {
  const seen = new Set<string>();
  const out: Sugerencia[] = [];
  for (const entrada of [...entradas].reverse()) {
    const texto = entrada.texto.trim();
    if (!texto || seen.has(texto)) continue;
    seen.add(texto);
    out.push(entrada);
    if (out.length === MAX_CITAS) break;
  }
  return out;
}

/** Repeated reasons are a pattern, not a coincidence: they name what the learner keeps missing. */
function costumbres(entradas: Sugerencia[]) {
  const counts = new Map<string, number>();
  for (const entrada of entradas.slice(-50)) for (const motivo of entrada.motivos) counts.set(motivo, (counts.get(motivo) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${label(id)} (${n})`);
}

export function listSugerencias(root: string, filter: { tema?: string; parte?: string } = {}) {
  const data = readSugerencias(root);
  const entradas = data.entradas
    .filter((e) => (!filter.tema || e.tema === filter.tema) && (!filter.parte || e.parte === filter.parte))
    .slice(-20)
    .reverse();
  return { entradas, motivos, directrices: directrices(data.entradas) };
}

export function directrices(entradas: Sugerencia[]) {
  const lines: string[] = [];
  const repetidos = costumbres(entradas);
  if (repetidos.length > 0) lines.push(`Suele pedir: ${repetidos.join(", ")}.`);
  for (const entrada of citas(entradas)) {
    const motivosDichos = entrada.motivos.length > 0 ? ` (${entrada.motivos.map(label).join(", ")})` : "";
    lines.push(`- «${clip(entrada.texto.trim(), MAX_TEXTO_DIRECTRIZ)}» — ${entrada.tema}/${entrada.parte}${motivosDichos}`);
  }
  return lines;
}

/**
 * What the tutor must know before writing again, in the fewest lines that change the
 * result: the preferences on disk, what the quizzes say is weak, and the learner's words.
 */
export function tutorContext(root: string, tema?: string): string {
  const preferences = readPreferences(root);
  const nivelesDichos = preferences.aspectos.map((a) => `${a.id}=${a.nivel}`).join(", ");
  const lines = [`Contexto guardado del alumno (no lo menciones ni lo cites; úsalo para decidir):`, `- Preferencias: ${nivelesDichos}.`];
  try {
    const global = readGlobalTelemetry(root);
    const debiles = global.perfil_alumno.puntos_a_reforzar.filter((p) => p.trim()).slice(0, 4);
    if (debiles.length > 0) lines.push(`- A reforzar según sus quizzes: ${debiles.join(", ")}.`);
    const porCategoria = Object.entries(global.estadisticas_globales.por_categoria)
      .filter(([, c]) => c.total > 0)
      .sort((a, b) => b[1].fallos / b[1].total - a[1].fallos / a[1].total)
      .slice(0, 3)
      .map(([categoria, c]) => `${categoria} (${c.fallos}/${c.total} fallos)`);
    if (porCategoria.length > 0) lines.push(`- Donde más falla: ${porCategoria.join(", ")}.`);
  } catch { /* telemetry that cannot be read must not stop an explanation */ }
  const entradas = directrices(readSugerencias(root).entradas.filter((e) => !tema || e.tema === tema));
  if (entradas.length > 0) lines.push("- Lo que dijo del material:", ...entradas.map((l) => (l.startsWith("- ") ? l : `  ${l}`)));
  return clip(lines.join("\n"), MAX_CONTEXTO);
}

/** Records the suggestion and moves the preferences its chips name. */
export function recordSugerencia(root: string, raw: unknown) {
  const input = validate(raw);
  keepAside(root);
  const data = readSugerencias(root);
  const entrada: Sugerencia = { id: `s-${randomBytes(6).toString("hex")}`, ...input, timestamp: new Date().toISOString() };
  data.entradas.push(entrada);
  if (data.entradas.length > MAX_ENTRADAS) data.entradas = data.entradas.slice(-MAX_ENTRADAS);
  data.actualizado = entrada.timestamp;
  write(filePath(root), data);
  const preferencias = applyMotivos(root, entrada.motivos);
  return { entrada, preferencias, directrices: directrices(data.entradas) };
}
