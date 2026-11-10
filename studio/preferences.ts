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

export function readPreferences(root: string): Preferences {
  const text = readDoc(root, "preferencias");
  return text === undefined ? structuredClone(defaults) : validate(JSON.parse(text));
}

export function savePreferences(root: string, input: unknown): Preferences {
  const data = validate(input);
  writeDoc(root, "preferencias", `${JSON.stringify(data, null, 2)}\n`);
  return data;
}
