/**
 * The useful-waiting section (#376/S6): the part's map from `plan.json`, ungraded
 * questions before the part exists and a review of earlier answered mini-quizzes
 * afterwards. Every file here is one the studio or the reader already reads:
 * `plan.json`, `quiz.json`, `mini-quiz/<part>.json` and their answer files.
 *
 * Answer keys are never sent with the questions: `revelar` only works once the
 * part note is on disk, and the review carries its own answers because those
 * questions were already answered by the learner.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { HttpError, listTopics, quizFingerprintOfPart, readPlan } from "../integrations/pi/bridge.ts";

const LETTERS = ["A", "B", "C", "D", "E"] as const;
const MAX_REPASO = 5;
const MAX_ANTES = 3;

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);

/** A vault JSON the readers know, or nothing: a damaged optional file cannot break the waiting section. */
function readRecord(file: string): Json | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return object(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface GlosarioVista {
  estado: "listo" | "generando" | "no-disponible";
  terminos: Array<{ termino: string; definicion: string; ejemplo: string }>;
  preliminar: true;
}

interface Suggested {
  enunciado: string;
  opciones: Record<string, string>;
  respuesta?: string;
  explicacion?: string;
}

interface Question {
  id: string;
  enunciado: string;
  opciones: Record<string, string>;
  answer: string;
  explicacion?: string;
}

export interface EsperaItem {
  id: string;
  enunciado: string;
  opciones?: Record<string, string>;
  respuesta?: string;
  explicacion?: string;
  /** The file the question came from, in the learner's language when it is a plan part. */
  origen: string;
}

export interface EsperaDoc {
  part: { id: string; number: number; title: string };
  mapa: { aprende: string[]; subtemas: string[]; dependeDe: Array<{ number: number; title: string; written: boolean }> };
  preguntas: { tipo: "antes" | "repaso"; items: EsperaItem[] } | null;
  glosario: GlosarioVista;
  profesor: null;
}

/** The tutor's letters are relabelled A…E, the same space the reader uses for options. */
function questionOf(raw: unknown): Question | undefined {
  if (!object(raw) || typeof raw.id !== "string" || typeof raw.enunciado !== "string" || !object(raw.options) || typeof raw.answer !== "string") return undefined;
  const entries = Object.entries(raw.options).filter(([, text]) => typeof text === "string");
  if (entries.length === 0 || entries.length > LETTERS.length) return undefined;
  const letters = new Map(entries.map(([letter], index) => [letter, LETTERS[index]]));
  const answer = letters.get(raw.answer);
  if (answer === undefined) return undefined;
  return {
    id: raw.id,
    enunciado: raw.enunciado,
    opciones: Object.fromEntries(entries.map(([, text], index) => [LETTERS[index], text as string])),
    answer,
    ...(typeof raw.explicacion === "string" && raw.explicacion.trim() ? { explicacion: raw.explicacion } : {}),
  };
}

function questionsOf(file: string): Question[] {
  const data = readRecord(file);
  if (!data || !Array.isArray(data.questions)) return [];
  return data.questions.map(questionOf).filter((question): question is Question => question !== undefined);
}

function answersOf(file: string): { answers: Record<string, string>; razonamientos: Record<string, string>; quiz: string } {
  const data = readRecord(file);
  if (!data) return { answers: {}, razonamientos: {}, quiz: "" };
  const answers = object(data.answers)
    ? Object.fromEntries(Object.entries(data.answers).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  const razonamientos: Record<string, string> = {};
  if (object(data.razonamientos)) {
    for (const [id, value] of Object.entries(data.razonamientos)) {
      if (!object(value)) continue;
      const text = [value.razonamiento, value.entendi, value.porque].find((part) => typeof part === "string" && part.trim());
      if (typeof text === "string") razonamientos[id] = text;
    }
  }
  return { answers, razonamientos, quiz: typeof data.quiz === "string" ? data.quiz : "" };
}

/** What the plan says the learner will get from this part: its own goals, or its own title. */
function aprendeDe(entry: Json | undefined, title: string): string[] {
  if (entry) {
    for (const key of ["aprende", "objetivos", "objetivo"]) {
      const value = entry[key];
      if (Array.isArray(value)) {
        const lines = value.filter((line): line is string => typeof line === "string" && line.trim() !== "");
        if (lines.length) return lines;
      } else if (typeof value === "string" && value.trim()) return [value.trim()];
    }
  }
  return [title];
}

/** The prompt's part, when it really asks for a part of a topic the studio knows. */
export function writePartTarget(root: string, topicHint: string | null, text: string): { topic: string; part: string; number: number } | null {
  const WRITE_INTENT = /\b(?:escribe|escribir|redacta|redactar|genera|generar|prepara|preparar|rehaz|regenera|corrige)\b/i;
  let topic = topicHint ?? "";
  let id: string | undefined;
  let number: number | undefined;
  const composer = /^Escribe la Parte (\d+) «[^»\n]+» de .+? \(carpeta ([\w-]+)\)/i.exec(text);
  if (composer) {
    number = Number(composer[1]);
    topic = composer[2];
  } else {
    const header = /^\[Vista HTML · ([^·\]\n]+) · (p\d+) ·/.exec(text);
    if (header && WRITE_INTENT.test(text)) {
      topic = header[1].trim();
      id = header[2];
    } else {
      const plain = /^(?:Escribe|Escribir|Redacta|Redactar|Genera|Generar|Prepara|Preparar|Rehaz|Regenera|Corrige)\s+(?:la\s+)?Parte\s+(\d+)\b/i.exec(text);
      if (plain && topicHint) number = Number(plain[1]);
    }
  }
  if (!/^[\w-]+$/.test(topic)) return null;
  let plan;
  try { plan = readPlan(join(root, topic)); } catch { return null; }
  if (!plan) return null;
  const index = id ? plan.parts.findIndex((part) => part.id === id) : number !== undefined ? number - 1 : -1;
  if (index < 0 || index >= plan.parts.length) return null;
  return { topic, part: plan.parts[index].id, number: index + 1 };
}

/** The canonical note of a part, so the studio knows which write begins a generation. */
export function partNotePath(root: string, topic: string, part: string): string | null {
  let plan;
  try { plan = readPlan(join(root, topic)); } catch { return null; }
  const index = plan?.parts.findIndex((entry) => entry.id === part) ?? -1;
  if (!plan || index < 0) return null;
  return join(root, topic, "explicaciones", `Parte ${index + 1} - ${plan.parts[index].slug}.md`);
}

/** The document the waiting section serves: no answers, no course material (yet) and no guessing. */
export function buildEspera(root: string, topicId: string, partId: string, options: {
  revelar?: boolean;
  glosario?: GlosarioVista;
  preguntasGlosario?: Suggested[];
} = {}): EsperaDoc {
  if (!/^[\w-]+$/.test(topicId) || !/^p\d+$/.test(partId)) throw new HttpError(400, "invalid topic or part");
  let plan;
  try { plan = readPlan(join(root, topicId)); } catch { plan = undefined; }
  if (!plan) throw new HttpError(404, `topic ${topicId} has no plan`);
  const index = plan.parts.findIndex((part) => part.id === partId);
  if (index < 0) throw new HttpError(404, `part ${partId} is not in plan.json`);
  const part = plan.parts[index];
  let written: boolean[] = [];
  try {
    const summary = listTopics(root).find((topic) => topic.id === topicId);
    written = (summary?.parts ?? []).map((entry) => entry.written === true);
  } catch {
    // A damaged topic cannot invent a written part: every dependency reads as pending.
  }
  const raw = readRecord(join(root, topicId, "plan.json"));
  const entry = object(raw) && Array.isArray(raw.parts) && object(raw.parts[index]) ? raw.parts[index] as Json : undefined;
  const mapa = {
    aprende: aprendeDe(entry, part.title),
    subtemas: plan.parts.map((item) => item.subtema).filter((subtema) => subtema !== ""),
    dependeDe: plan.parts.slice(0, index).map((item, position) => ({
      number: position + 1,
      title: item.title,
      written: written[position] === true,
    })),
  };
  const glosario: GlosarioVista = options.glosario ?? { estado: "no-disponible", terminos: [], preliminar: true };
  const dir = join(root, topicId);
  const reveal = options.revelar === true && written[index] === true;
  const antes = (questions: Question[], origen: string): EsperaItem[] => questions.slice(0, MAX_ANTES).map((question) => ({
    id: question.id,
    enunciado: question.enunciado,
    opciones: question.opciones,
    origen,
    ...(reveal ? { respuesta: question.answer, ...(question.explicacion ? { explicacion: question.explicacion } : {}) } : {}),
  }));
  const diagnosis = questionsOf(join(dir, "quiz.json"));
  const suggested = (options.preguntasGlosario ?? []).map((question, position): Question | undefined => {
    const normalized = questionOf({ id: `g${position + 1}`, enunciado: question.enunciado, options: question.opciones, answer: question.respuesta });
    if (!question.enunciado || !normalized) return undefined;
    return { ...normalized, ...(question.explicacion ? { explicacion: question.explicacion } : {}) };
  }).filter((question): question is Question => question !== undefined);

  let preguntas: EsperaDoc["preguntas"] = null;
  if (index > 0) {
    const wrong: EsperaItem[] = [];
    const right: EsperaItem[] = [];
    for (const earlier of plan.parts.slice(0, index)) {
      const answers = answersOf(join(dir, "mini-quiz", `${earlier.id}.answers.json`));
      if (Object.keys(answers.answers).length === 0) continue;
      const earlierQuestions = questionsOf(join(dir, "mini-quiz", `${earlier.id}.json`));
      // #416: a review is only a review of answers that answer the quiz on disk. A file left by another
      // version would otherwise be shown as right or wrong against a key the learner never saw.
      if (earlierQuestions.length === 0 || answers.quiz !== quizFingerprintOfPart(dir, earlier.id)) continue;
      for (const question of earlierQuestions) {
        if (!Object.hasOwn(answers.answers, question.id)) continue;
        const explanation = answers.razonamientos[question.id] ?? question.explicacion;
        const item: EsperaItem = {
          id: question.id,
          enunciado: question.enunciado,
          opciones: question.opciones,
          respuesta: question.answer,
          ...(explanation ? { explicacion: explanation } : {}),
          origen: `mini-quiz/${earlier.id}`,
        };
        (answers.answers[question.id] === question.answer ? right : wrong).push(item);
      }
    }
    if (wrong.length + right.length > 0) preguntas = { tipo: "repaso", items: [...wrong, ...right].slice(0, MAX_REPASO) };
  }
  if (!preguntas) {
    const items = diagnosis.length ? antes(diagnosis, "diagnostico") : antes(suggested, "glosario");
    if (items.length) preguntas = { tipo: "antes", items };
  }
  return { part: { id: partId, number: index + 1, title: part.title }, mapa, preguntas, glosario, profesor: null };
}
