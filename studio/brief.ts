/**
 * The compact, factual PART BRIEF a write-part prompt carries so the tutor does
 * not spend its first minutes discovering the topic with ls/find/reads (T2b).
 *
 * Everything here comes from files the studio already reads: `plan.json` through
 * the bridge's plan reader, `listTopics` for which siblings are written, and the
 * state/tutor/ledger paths it already knows. No note content is inlined and no
 * value is guessed: a topic without a readable plan gets no brief at all.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listTopics, readPlan } from "../integrations/pi/bridge.ts";
import { ruleSheetText } from "../tools/part-check.mjs";
import { materialOrdenado } from "./indice.ts";
import { materiaForTopic } from "./materias.ts";

export const PART_BRIEF_MARK = "PART BRIEF";
/** Hard ceiling for the whole block, rule sheet included (#372/T2d): 12 KiB, no more. */
export const MAX_PART_BRIEF_BYTES = 12288;
/** The sheet comes from the rules themselves; frequent first-draft findings lead, then the rest.
 * The compact form is reserved so it always fits. */
const RULES_FULL = `\n${ruleSheetText()}\n`;
const RULES_COMPACT = `\n${ruleSheetText({ compact: true })}\n`;
const FACTS_LIMIT = MAX_PART_BRIEF_BYTES - Buffer.byteLength(RULES_COMPACT, "utf8") - 64;
/** Hard ceiling for the factual part; the builder aims lower so a long title cannot push it over. */
const SOFT_LIMIT = FACTS_LIMIT - 128;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_TOOL = join(REPO, "tools", "part-check.mjs");
/** The composer's `writePromptOf` (studio/ui/studio.js): the canonical write-part request. */
const WRITE_PROMPT = /^Escribe la Parte (\d+) «([^»\n]+)» de .+? \(carpeta ([\w-]+)\)/;
/** A part chat is a write-part chat only when it actually asks for the part to be written. */
const VIEW_HEADER = /^\[Vista HTML · ([^·\]\n]+) · (p\d+) ·/;
const WRITE_INTENT = /(?:escribe|escribir|redacta|redactar|genera|generar|prepara|preparar)\s+(?:la\s+)?parte/i;
/** Fields a plan part may carry beyond id/title/slug; quoted as stored, never invented. */
const PLAN_EXTRA = ["subtema", "objetivos", "objetivo", "examplesPlanned", "visualsPlanned", "demosPlanned", "pareto", "examen"];

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** Long titles and absurd paths are clipped; the exact target path never is. */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return bytes(clean) <= max ? clean : `${Buffer.from(clean, "utf8").subarray(0, Math.max(0, max - 1)).toString("utf8").replace(/\uFFFD$/, "")}…`;
}

function clipPath(path: string, max: number): string {
  if (bytes(path) <= max) return path;
  const head = Math.floor(max * 0.4);
  return `${path.slice(0, head)}…${path.slice(-(max - head - 1))}`;
}

function readRecord(path: string): Json | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Which plan entry the prompt asks to write: the UI names it by number and title, the part chat by id. */
function target(root: string, text: string): { topicId: string; plan: NonNullable<ReturnType<typeof readPlan>>; index: number } | undefined {
  let topicId: string;
  let id: string | undefined;
  let number: number | undefined;
  let title: string | undefined;
  const composer = WRITE_PROMPT.exec(text);
  if (composer) {
    topicId = composer[3];
    number = Number(composer[1]);
    title = composer[2];
  } else {
    const header = VIEW_HEADER.exec(text);
    if (!header || !WRITE_INTENT.test(text)) return undefined;
    topicId = header[1].trim();
    id = header[2];
  }
  if (!/^[\w-]+$/.test(topicId)) return undefined;
  let plan;
  try {
    plan = readPlan(join(root, topicId));
  } catch {
    return undefined;
  }
  if (!plan || plan.parts.length === 0) return undefined;
  const normal = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // The composer names the part by number; a repeated title must not send the tutor to the
  // wrong note. The title is only a fallback for an out-of-range number, and the hosted view
  // names the part by id.
  const numbered = number !== undefined && number >= 1 && number <= plan.parts.length ? number - 1 : -1;
  const index = id ? plan.parts.findIndex((part) => part.id === id) : numbered;
  const chosen = index >= 0 ? index : plan.parts.findIndex((part) => normal(part.title) === normal(title ?? ""));
  return chosen >= 0 ? { topicId, plan, index: chosen } : undefined;
}

/** The part's plan entry as stored, bounded: title, subtema/objetivos and the planning flags. */
function planLine(entry: Json, title: string): string {
  const fields = [`title=${JSON.stringify(title)}`];
  for (const key of PLAN_EXTRA) {
    if (!(key in entry)) continue;
    const value = JSON.stringify(entry[key]);
    if (value !== undefined) fields.push(`${key}=${clip(value, 120)}`);
  }
  return `Plan: ${clip(fields.join(" "), 400)}`;
}

/**
 * The brief itself, or "" for any prompt that is not a write-part request.
 * `root` is the Learnings root the studio was started with; paths are absolute
 * because the tutor may run in a different cwd.
 */
export function partBrief(root: string, text: string): string {
  const found = target(root, text);
  if (!found) return "";
  const { topicId, plan, index } = found;
  const topicDir = resolve(root, topicId);
  const part = plan.parts[index];
  const targetPath = join(topicDir, "explicaciones", `Parte ${index + 1} - ${part.slug}.md`);
  const raw = readRecord(join(topicDir, "plan.json"));
  const entry = raw && Array.isArray(raw.parts) && isRecord(raw.parts[index]) ? raw.parts[index] : {};
  const statePath = join(topicDir, ".learning", "state.json");
  const state = readRecord(statePath);
  const method = state === undefined ? "sin elegir" : typeof state.method === "string" && state.method ? state.method : "sin elegir";
  const summary = listTopics(root).find((topic) => topic.id === topicId);
  const siblings = plan.parts.map((other, position) => ({
    number: position + 1,
    title: other.title,
    path: join(topicDir, "explicaciones", `Parte ${position + 1} - ${other.slug}.md`),
    written: summary?.parts[position]?.written === true,
  }));
  const files = [
    ["state.json", statePath],
    ["tutor.json", join(root, "tutor.json")],
    ["registro.jsonl", join(topicDir, "registro.jsonl")],
  ].filter(([, path]) => existsSync(path!));

  const head = `[${PART_BRIEF_MARK} · tema ${topicId} · dir ${topicDir}]\n`;
  const fixed = [
    `Destino: ${targetPath}`,
    planLine(entry, part.title),
    `Método: ${method}`,
    "Partes:",
    ...(files.length ? [`Archivos: ${files.map(([label, path]) => `${label}=${path}`).join(" | ")}`] : []),
    `Comprobación: node ${CHECK_TOOL} ${targetPath}`,
  ];

  /** Rebuild the sibling lines with shorter titles (and only then shorter paths) until it fits. */
  let maxTitle = 64;
  let maxPath = Number.POSITIVE_INFINITY;
  let facts = "";
  for (;;) {
    const lines = siblings.map((sibling) => {
      const status = sibling.written ? "escrita" : "pendiente";
      return `${sibling.number}. ${clip(sibling.title, maxTitle)} | ${status} | ${clipPath(sibling.path, maxPath)}`;
    });
    const brief = `${head}${[...fixed.slice(0, 4), ...lines, ...fixed.slice(4)].join("\n")}\n`;
    if (bytes(brief) <= SOFT_LIMIT) { facts = brief; break; }
    if (maxTitle > 8) {
      maxTitle = Math.max(8, maxTitle - 8);
      continue;
    }
    if (maxPath > 80) {
      maxPath = maxPath === Number.POSITIVE_INFINITY ? 180 : Math.max(80, maxPath - 20);
      continue;
    }
    // A vault with thousands of parts still stays bounded: keep the destination and
    // the check command, then as many siblings as fit, rather than an unbounded block.
    const keep = [`${head}${fixed[0]}\n${fixed.at(-1)}\nPartes:\n`];
    for (const line of lines) {
      if (bytes(keep.join("")) + bytes(`${line}\n`) > SOFT_LIMIT) break;
      keep.push(`${line}\n`);
    }
    facts = keep.join("").slice(0, FACTS_LIMIT - 1);
    break;
  }
  const withFullSheet = `${facts}${RULES_FULL}`;
  return bytes(withFullSheet) <= MAX_PART_BRIEF_BYTES ? withFullSheet : `${facts}${RULES_COMPACT}`;
}

export const PLAN_BRIEF_MARK = "PLAN BRIEF";
/** The planning turn carries the course, never the whole context window (#407/T2). */
export const MAX_PLAN_BRIEF_BYTES = 8192;
/** Kept for the line that reports what did not fit: a clipped brief always says so. */
const PLAN_FOOTER_RESERVE = 200;
const PLAN_CHUNK_BYTES = 480;

/**
 * The course material a topic's route must be derived from, or "" when there is nothing to say:
 * no course, no indexed material, or a plan already written. Bounded by construction, and it never
 * drops chunks silently — the count of what stayed out travels with it, so the tutor can ask.
 */
export function planBrief(root: string, topic: string): string {
  // A turn must never fail because the material cannot be read: the brief is an improvement to the
  // planning prompt, and a tutor without it behaves exactly as it did before #407.
  try {
    if (!/^[\w-]+$/.test(topic)) return "";
    if (existsSync(join(root, topic, "plan.json"))) return "";
    const materia = materiaForTopic(root, topic);
    if (!materia) return "";
    return briefDeMaterial(root, topic, materia.id, materia.nombre);
  } catch (error) {
    process.stderr.write(`estudio: el material no se pudo leer para el plan de ${topic} · ${(error as Error).message}\n`);
    return "";
  }
}

function briefDeMaterial(root: string, topic: string, idMateria: string, nombreMateria: string): string {
  const trozos = materialOrdenado(root, idMateria);
  if (trozos.length === 0) return "";
  const fuentes = new Set(trozos.map((trozo) => trozo.nombre));
  const head = [
    `[${PLAN_BRIEF_MARK} · tema ${topic} · materia ${idMateria}/${nombreMateria}]`,
    `Material: ${fuentes.size} fuentes, ${trozos.length} fragmentos, en este orden; el examen va primero porque pondera el orden, no porque recorte la cobertura.`,
    "Deriva de este material la ruta completa, en pasos: cubre todo lo que aparece aquí y no inventes temas que no estén. El plan es tuyo: no lo muestres ni enumeres partes futuras al aprendiz.",
  ].join("\n");
  // A course name long enough to eat the whole budget leaves no room for material: no brief.
  if (bytes(head) + PLAN_FOOTER_RESERVE > MAX_PLAN_BRIEF_BYTES) return "";
  const lineas: string[] = [];
  let usados = bytes(head) + PLAN_FOOTER_RESERVE;
  for (const trozo of trozos) {
    const linea = `- ${trozo.nombre} (${trozo.tipo}, ${trozo.ubicacion}): ${clip(trozo.texto, PLAN_CHUNK_BYTES)}`;
    const costo = bytes(linea) + 1;
    if (usados + costo > MAX_PLAN_BRIEF_BYTES) break;
    lineas.push(linea);
    usados += costo;
  }
  const resto = trozos.length - lineas.length;
  const cola = resto > 0
    ? `[${resto} fragmentos sin mostrar: pide las fuentes que necesites antes de escribir el plan.]`
    : "";
  const brief = `${head}\n${lineas.join("\n")}${lineas.length ? "\n" : ""}${cola}\n`;
  return bytes(brief) <= MAX_PLAN_BRIEF_BYTES ? brief : `${head}\n${cola}\n`;
}
