import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained } from "../integrations/pi/paths.ts";

const defaults = {
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

function validate(value: unknown): typeof defaults {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k));
  if (!record(value) || !keys(value, ["version", "aspectos"]) || value.version !== 1 || !Array.isArray(value.aspectos) || value.aspectos.length !== defaults.aspectos.length) throw new HttpError(400, "invalid preferences");
  const seen = new Set<string>();
  for (const item of value.aspectos) {
    if (!record(item) || !keys(item, ["id", "titulo", "descripcion", "nivel"])) throw new HttpError(400, "invalid aspect");
    const original = defaults.aspectos.find((a) => a.id === item.id);
    if (!original || seen.has(original.id) || item.titulo !== original.titulo || item.descripcion !== original.descripcion || (typeof item.nivel !== "string" || !["menos", "medio", "más"].includes(item.nivel))) throw new HttpError(400, "invalid aspect");
    seen.add(original.id);
  }
  return value as typeof defaults;
}

function filePath(root: string) {
  const file = join(root, "preferencias.json");
  try {
    lstatSync(file);
    if (!resolveContained(root, file).ok) throw new HttpError(400, "invalid preferences path");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return file;
}

export function readPreferences(root: string) {
  const file = filePath(root);
  try { return validate(JSON.parse(readFileSync(file, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaults);
    throw error;
  }
}

export function savePreferences(root: string, input: unknown) {
  const data = validate(input);
  const file = filePath(root);
  const temp = join(root, `.preferencias-${randomBytes(12).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* no temporary file */ }
    throw error;
  }
  return data;
}
