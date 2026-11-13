import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../integrations/pi/bridge.ts";
import { readDoc, writeDoc } from "../integrations/pi/store.ts";

/** The numbers that justify an aspect the learner did not choose. */
export interface Evidencia {
  respuestas: number;
  aciertos: number;
}

export interface Aspecto {
  id: string;
  titulo: string;
  descripcion: string;
  nivel: string;
  origen?: "telemetria";
  evidencia?: Evidencia;
}

export interface Preferences {
  version: 1;
  aspectos: Aspecto[];
  /** Aspects the learner removed: the evidence may still say they fail them. */
  rechazados?: string[];
}

const defaults: Preferences = {
  version: 1,
  aspectos: [
    { id: "texto", titulo: "Cantidad de texto", descripcion: "Explicaciones breves y directas.", nivel: "menos" },
    { id: "ejemplos", titulo: "Ejemplos concretos", descripcion: "Un ejemplo central que crece con la explicación.", nivel: "más" },
    { id: "visuales", titulo: "Diagramas y elementos visuales", descripcion: "Diagramas integrados con la explicación.", nivel: "más" },
    { id: "analogias", titulo: "Analogías", descripcion: "Modelos del mundo real con sus límites.", nivel: "más" },
    { id: "matematicas", titulo: "Profundidad matemática", descripcion: "Matemáticas breves e intuitivas.", nivel: "menos" },
    { id: "pasos", titulo: "Desarrollo paso a paso", descripcion: "Desglosar la evolución y los cálculos.", nivel: "más" },
    { id: "preguntas", titulo: "Preguntas durante la explicación", descripcion: "Comprobaciones durante la lectura; los quizzes van al final.", nivel: "menos" },
    // El registro: los dos ejes de la prosa. «más» en los dos es la referencia (report §7).
    { id: "sencillez", titulo: "Qué tan simple", descripcion: "Cuánto se parte la idea: frases cortas, un contraste y la cuenta paso a paso.", nivel: "más" },
    { id: "tecnicidad", titulo: "Qué tan técnico", descripcion: "El término técnico se conserva, se nombra y se explica en palabras llanas donde aparece.", nivel: "más" },
  ],
};

const NIVELES = ["menos", "medio", "más"];
const SHIPPED = defaults.aspectos.map((a) => a.id);
const SHIPPED_KEYS = ["id", "titulo", "descripcion", "nivel"];
const DISCOVERED_KEYS = [...SHIPPED_KEYS, "origen", "evidencia"];

/** Evidence is a count and its hits: integers, and hits never exceed answers. */
function isEvidence(value: unknown): value is Evidencia {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Evidencia;
  if (Object.keys(evidence).length !== 2) return false;
  if (!Object.hasOwn(evidence, "respuestas") || !Object.hasOwn(evidence, "aciertos")) return false;
  if (!Number.isInteger(evidence.respuestas) || evidence.respuestas < 0) return false;
  if (!Number.isInteger(evidence.aciertos) || evidence.aciertos < 0) return false;
  return evidence.aciertos <= evidence.respuestas;
}

/**
 * The shipped aspects stay closed: their id, title and description are the
 * product's words, so a file that rewrites one is refused. A discovered aspect
 * is appended instead, and it has to carry the evidence that earned it.
 */
function validate(value: unknown): Preferences {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k));
  const shape = record(value) && (keys(value, ["version", "aspectos"]) || keys(value, ["version", "aspectos", "rechazados"]));
  if (!shape || value.version !== 1 || !Array.isArray(value.aspectos) || value.aspectos.length < defaults.aspectos.length) throw new HttpError(400, "invalid preferences");
  if (value.rechazados !== undefined) {
    const refused = value.rechazados;
    if (!Array.isArray(refused) || refused.some((id) => typeof id !== "string" || !id.trim()) || new Set(refused).size !== refused.length) throw new HttpError(400, "invalid preferences");
  }
  const seen = new Set<string>();
  for (const item of value.aspectos) {
    if (!record(item) || typeof item.id !== "string" || seen.has(item.id)) throw new HttpError(400, "invalid aspect");
    const original = defaults.aspectos.find((a) => a.id === item.id);
    if (original) {
      if (!keys(item, SHIPPED_KEYS) || item.titulo !== original.titulo || item.descripcion !== original.descripcion || !NIVELES.includes(item.nivel as string)) throw new HttpError(400, "invalid aspect");
    } else if (!keys(item, DISCOVERED_KEYS) || item.origen !== "telemetria" || typeof item.titulo !== "string" || !item.titulo.trim() || typeof item.descripcion !== "string" || !item.descripcion.trim() || !NIVELES.includes(item.nivel as string) || !isEvidence(item.evidencia)) {
      throw new HttpError(400, "invalid aspect");
    }
    seen.add(item.id);
  }
  // A file that lost one of the shipped aspects is not a preference, it is damage.
  if (!SHIPPED.every((id) => seen.has(id))) throw new HttpError(400, "invalid preferences");
  return value as unknown as Preferences;
}

/** The aspects the register added. A document saved before them gains them; the rest of it is untouched. */
const NUEVOS = ["sencillez", "tecnicidad"];

/** A document saved before the register aspects gains them at the default, and keeps every level it had. */
function completar(doc: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(doc.aspectos)) return doc;
  const ids = new Set(doc.aspectos.map((a) => (a && typeof a === "object" ? (a as { id?: unknown }).id : undefined)));
  const faltan = defaults.aspectos.filter((a) => NUEVOS.includes(a.id) && !ids.has(a.id));
  return faltan.length ? { ...doc, aspectos: [...doc.aspectos, ...faltan.map((a) => ({ ...a }))] } : doc;
}

/**
 * The file the engine and the explanation tools read: a copy of the stored document, in the Learnings root.
 * Not `preferencias.json`: the store keeps that name as its legacy import, and never writes it again.
 */
export const MIRROR_FILE = "niveles-alumno.json";

/**
 * Keeps `niveles-alumno.json` equal to the stored document. Best effort: the store is whole without the copy,
 * and the next read or save writes it again. Returns whether the copy is current.
 */
function mirror(root: string, data: Preferences): boolean {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const file = join(root, MIRROR_FILE);
  try {
    if (existsSync(file) && readFileSync(file, "utf8") === text) return true;
    writeFileSync(file, text, "utf8");
    return true;
  } catch {
    // A read-only root keeps working without its copy: the learner's data is in the store.
    return false;
  }
}

export function readPreferences(root: string): Preferences {
  const text = readDoc(root, "preferencias");
  if (text === undefined) return structuredClone(defaults);
  const stored: unknown = JSON.parse(text);
  const doc = stored && typeof stored === "object" && !Array.isArray(stored) ? completar(stored as Record<string, unknown>) : stored;
  const prefs = validate(doc);
  mirror(root, prefs);
  return prefs;
}

export function savePreferences(root: string, input: unknown): Preferences {
  const data = validate(input);
  writeDoc(root, "preferencias", `${JSON.stringify(data, null, 2)}\n`);
  mirror(root, data);
  return data;
}
