/**
 * What the learner thought of a part, once it is over.
 *
 * `sugerencias.json` records what to change: every motive there is a complaint, and those lines
 * drive corrections. This is the other half — a verdict with reasons that can be positive — so the
 * studio knows what a learner calls good and can repeat it instead of only subtracting. Keeping the
 * two apart is deliberate: praise fed into a correction channel becomes noise, and a suggestion is a
 * request while a verdict is a record.
 *
 * One verdict per part: a learner who changes their mind replaces what they said. The document is
 * bounded and replaced atomically, and a damaged file never blocks the studio.
 */
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained } from "../integrations/pi/paths.ts";

const MAX_ENTRADAS = 500;
const MAX_TEXTO = 2000;
const MAX_MOTIVOS = 8;

export type Signo = "gusta" | "mejora";

export interface Motivo {
  id: string;
  texto: string;
  /** What the reason says about the part: it worked, or it needs fixing. */
  signo: Signo;
}

/**
 * The reasons a verdict can carry. The `mejora` side repeats the ids of `studio/sugerencias.ts` so
 * the vocabulary a learner already reads there does not fork; the `gusta` side is new, because
 * until now there was nothing to say about a part that worked.
 */
export const MOTIVOS: readonly Motivo[] = [
  { id: "ejemplo-claro", texto: "El ejemplo fue claro", signo: "gusta" },
  { id: "visual-util", texto: "El dibujo ayudó", signo: "gusta" },
  { id: "paso-a-paso", texto: "Se siguió paso a paso", signo: "gusta" },
  { id: "buen-ritmo", texto: "El ritmo fue bueno", signo: "gusta" },
  { id: "conecta-con-lo-que-se", texto: "Conectó con lo que ya sabía", signo: "gusta" },
  { id: "ejercicio-util", texto: "El ejercicio sirvió", signo: "gusta" },
  { id: "demasiado-texto", texto: "Demasiado texto", signo: "mejora" },
  { id: "faltan-ejemplos", texto: "Faltan ejemplos", signo: "mejora" },
  { id: "faltan-visuales", texto: "Faltan visuales", signo: "mejora" },
  { id: "muy-abstracto", texto: "Muy abstracto", signo: "mejora" },
  { id: "matematicas-confusas", texto: "Matemáticas confusas", signo: "mejora" },
  { id: "sin-paso-a-paso", texto: "Sin paso a paso", signo: "mejora" },
  { id: "sobran-preguntas", texto: "Sobran preguntas", signo: "mejora" },
  { id: "no-entendi", texto: "No entendí una idea", signo: "mejora" },
];

export const GUSTA: readonly string[] = MOTIVOS.filter((motivo) => motivo.signo === "gusta").map((motivo) => motivo.id);
export const MEJORA: readonly string[] = MOTIVOS.filter((motivo) => motivo.signo === "mejora").map((motivo) => motivo.id);

export type Valor = "gusta" | "no-gusta";

export interface Valoracion {
  id: string;
  tema: string;
  parte: string;
  valor: Valor;
  motivos: string[];
  texto: string;
  timestamp: string;
}

export interface ValoracionesFile {
  version: 1;
  actualizado: string;
  entradas: Valoracion[];
}

/** One reason as the tutor may read it: how often it was said, in the learner's own vocabulary. */
export interface Gusto {
  motivo: string;
  texto: string;
  veces: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const motivoPorId = (id: string): Motivo | undefined => MOTIVOS.find((motivo) => motivo.id === id);

function validate(input: unknown): Omit<Valoracion, "id" | "timestamp"> {
  if (!isRecord(input)) throw new HttpError(400, "invalid verdict");
  const { tema, parte, valor, motivos, texto } = input;
  if (typeof tema !== "string" || !/^[\w-]{1,80}$/.test(tema)) throw new HttpError(400, "invalid topic");
  if (typeof parte !== "string" || !/^p\d+$/.test(parte)) throw new HttpError(400, "invalid part");
  if (valor !== "gusta" && valor !== "no-gusta") throw new HttpError(400, "invalid verdict");
  if (!Array.isArray(motivos)) throw new HttpError(400, "invalid motives");
  if (motivos.length > MAX_MOTIVOS) throw new HttpError(400, "too many motives");
  for (const motivo of motivos) {
    if (typeof motivo !== "string" || motivoPorId(motivo) === undefined) throw new HttpError(400, "unknown motive");
  }
  if (typeof texto !== "string") throw new HttpError(400, "invalid text");
  if (texto.length > MAX_TEXTO) throw new HttpError(400, "invalid text");
  return { tema, parte, valor, motivos: [...new Set(motivos)], texto: texto.trim() };
}

function filePath(root: string): string {
  const file = join(root, "valoraciones.json");
  try {
    lstatSync(file);
    if (!resolveContained(root, file).ok) throw new HttpError(400, "invalid verdict path");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return file;
}

const vacio = (): ValoracionesFile => ({ version: 1, actualizado: "", entradas: [] });

/** A damaged file is reported and read as empty: a learner's opinion must never lock the studio. */
export function readValoraciones(root: string): ValoracionesFile {
  let text: string;
  try { text = readFileSync(filePath(root), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return vacio();
    throw error;
  }
  try {
    const data = JSON.parse(text);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.entradas)) throw new Error("shape");
    const entradas: Valoracion[] = [];
    for (const entry of data.entradas) {
      try { entradas.push({ ...validate(entry), id: String((entry as Record<string, unknown>).id ?? ""), timestamp: String((entry as Record<string, unknown>).timestamp ?? "") }); }
      catch { /* one bad row does not cost the others */ }
    }
    return { version: 1, actualizado: typeof data.actualizado === "string" ? data.actualizado : "", entradas };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`estudio: valoraciones.json ilegible, empiezo sin veredictos · ${reason}\n`);
    return vacio();
  }
}

export function listarValoraciones(root: string, filter: { tema?: string; parte?: string } = {}): { entradas: Valoracion[]; motivos: readonly Motivo[] } {
  const entradas = readValoraciones(root).entradas.filter((entrada) =>
    (filter.tema === undefined || entrada.tema === filter.tema) && (filter.parte === undefined || entrada.parte === filter.parte));
  return { entradas, motivos: MOTIVOS };
}

function write(root: string, data: ValoracionesFile): void {
  const file = filePath(root);
  const temp = join(root, `.valoraciones-${randomBytes(12).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* no temporary file */ }
    throw error;
  }
}

/**
 * Records what the learner said. A second verdict for the same part replaces the first instead of
 * stacking: the page shows one opinion, and so does the record.
 */
export function recordValoracion(root: string, input: unknown): { entrada: Valoracion; gustos: { gusta: Gusto[]; mejora: Gusto[] } } {
  const body = validate(input);
  const data = readValoraciones(root);
  const entrada: Valoracion = { ...body, id: `v-${randomBytes(6).toString("hex")}`, timestamp: new Date().toISOString() };
  const others = data.entradas.filter((cada) => !(cada.tema === body.tema && cada.parte === body.parte));
  const entradas = [...others, entrada].slice(-MAX_ENTRADAS);
  write(root, { version: 1, actualizado: entrada.timestamp, entradas });
  return { entrada, gustos: loQueGusta(entradas) };
}

/**
 * What repeats, split by sign. A reason said once is left out when `minimo` is raised: one bad day
 * is not a rule, and the tutor reads a bounded digest and never the whole history. Free text is
 * kept in the document and shown to the learner, but never quoted into a prompt: it is unbounded
 * text, and a prompt is not the place to trust it.
 */
export function loQueGusta(entradas: readonly Valoracion[], options: { minimo?: number } = {}): { gusta: Gusto[]; mejora: Gusto[] } {
  const minimo = options.minimo ?? 1;
  const counts = new Map<string, number>();
  for (const entrada of entradas) {
    for (const motivo of entrada.motivos) counts.set(motivo, (counts.get(motivo) ?? 0) + 1);
  }
  const orden = (id: string) => MOTIVOS.findIndex((motivo) => motivo.id === id);
  const build = (signo: Signo): Gusto[] =>
    [...counts.entries()]
      .filter(([id, veces]) => veces >= minimo && motivoPorId(id)?.signo === signo)
      .map(([id, veces]) => ({ motivo: id, texto: motivoPorId(id)?.texto ?? id, veces }))
      .sort((left, right) => right.veces - left.veces || orden(left.motivo) - orden(right.motivo));
  return { gusta: build("gusta"), mejora: build("mejora") };
}

/** The block the tutor reads. Its title is also what the studio strips before showing a message. */
export const GUSTOS_TITULO = "[Lo que esta persona valora]";

/** How much of the digest the prompt may carry: a hint, not a biography. */
const MAX_GUSTOS = 900;

/**
 * The verdicts as instructions for the writer, or "" when nothing repeated. Only motives with at
 * least two mentions appear: a single verdict is a bad day, and the whole point of a bound is that
 * the tutor is steered, not buried.
 */
export function gustosBlock(root: string): string {
  const { gusta, mejora } = loQueGusta(readValoraciones(root).entradas, { minimo: 2 });
  if (gusta.length === 0 && mejora.length === 0) return "";
  const lines = [GUSTOS_TITULO];
  if (gusta.length) lines.push(`Lo que le funcionó: ${gusta.slice(0, 5).map((cada) => `${cada.texto} (${cada.veces} partes)`).join("; ")}. Repítelo.`);
  if (mejora.length) lines.push(`Lo que le resta: ${mejora.slice(0, 5).map((cada) => `${cada.texto} (${cada.veces} partes)`).join("; ")}. Evítalo.`);
  const text = lines.join("\n");
  return text.length > MAX_GUSTOS ? `${text.slice(0, MAX_GUSTOS)}\n[…recortado]` : text;
}

/** The prompt with the learner's verdicts appended, once they say something twice. */
export function withGustos(text: string, root: string): string {
  const block = gustosBlock(root);
  return block ? `${text}\n\n${block}` : text;
}

/**
 * What the learner should read: the prompt's own blocks never appear as their words or as the
 * tutor's answer. Only the block, never the text around it.
 */
export function stripGustos(text: string): string {
  const start = text.indexOf(GUSTOS_TITULO);
  if (start < 0) return text;
  const rest = text.slice(start + GUSTOS_TITULO.length);
  const end = rest.search(/\n\s*\n|\n\[/);
  const tail = end < 0 ? "" : rest.slice(end);
  return `${text.slice(0, start)}${tail}`.trim();
}
