/**
 * Study-view bridge: serves an interactive HTML view of every Learnings part
 * (note, video, demos, live quiz) on 127.0.0.1 and turns the learner's
 * submissions into chat messages, so nothing is copied by hand.
 *
 * Obsidian stays the source of truth: pages are rendered from the vault files
 * on every request, and the only write is the answers file the engine already
 * reads (never overwriting recorded answers). Every route requires the
 * per-session token; the Host header must be loopback (DNS rebinding) and a
 * submit must come from this origin with a fixed-schema JSON body.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveContained, safeTopic } from "./paths.ts";
import { CodeRunError, loadRunners, readExercise, publicExercise, forPage, runCode } from "./coderun.ts";
import { exerciseFile, listExercises, readSubmissions, saveSubmission } from "./codevault.ts";

const VIEW_DIR = join(dirname(fileURLToPath(import.meta.url)), "view");
const KIT_DIR = join(dirname(fileURLToPath(import.meta.url)), "kit");
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 8000;
const CHOICES = new Set(["A", "B", "C", "D", "E"]);
/** How sure the learner was of each answer, as shown in the chat message. */
const CONFIDENCE: Record<string, string> = { seguro: "seguro", dudo: "dudo", adivine: "adiviné" };
const DIAGNOSIS = "quiz";
const EMBED_SEARCH_DEPTH = 4;

export const CDN_SCRIPTS = [
  ["https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js", "sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+"],
  ["https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js", "sha384-JEyTNhjM6R1ElGoJns4U2Ln4ofPcqzSsynQkmEc/KGy6336qAZl70tDLufbkla+3"],
  ["https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js", "sha384-zkWMJO4sgpPUzyuOgDx8HB/K55glbAwajEpk1Go2NWRuPkPA/wIhoEJTuSkmOYrV"],
];

const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * A part's interactive app is a self-contained vault page (inline script and
 * style) served top-level so it can use the injected submit channel; it may
 * reach nothing but this server.
 */
const APP_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
/** A rich part page: page-authored demos run inline; it reaches only this server and the pinned CDN. */
const RICH_CSP = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
  "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
};
const VIDEO = new Set([".mp4", ".webm", ".mov"]);
const AUDIO = new Set([".mp3", ".m4a", ".wav"]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

interface PlanPart {
  id: string;
  title: string;
  slug: string;
}
interface Question {
  id: string;
  enunciado: string;
  options: Record<string, string>;
  answer: string;
  pieza?: unknown;
  round?: number;
}
interface Reasoning {
  razonamiento?: string;
  entendi?: string;
  porque?: string;
  confianza?: string;
}
interface Graded {
  id: string;
  chosen: string;
  correct: string;
  ok: boolean;
  razonamiento?: string;
  entendi?: string;
  porque?: string;
  confianza?: string;
}
interface AnswerFile {
  answers: Record<string, string>;
  razonamientos: Record<string, Reasoning>;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** A vault JSON object, undefined when absent; a malformed file is reported by name, never guessed. */
function readRecord(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new HttpError(500, `malformed JSON in the vault: ${file}`);
  }
  if (!isRecord(value)) throw new HttpError(500, `vault JSON is not an object: ${file}`);
  return value;
}

function readPlan(topicDir: string): { topic: string; parts: PlanPart[] } | undefined {
  const plan = readRecord(join(topicDir, "plan.json"));
  if (!plan || !Array.isArray(plan.parts)) return undefined;
  // id and slug become path segments: a part with a separator is not a part.
  const parts = plan.parts.filter((p): p is PlanPart => isRecord(p) && safeTopic(p.id) && safeTopic(p.slug));
  return { topic: typeof plan.topic === "string" ? plan.topic : "", parts };
}

function readQuestions(file: string): Question[] | undefined {
  const quiz = readRecord(file);
  if (!quiz || !Array.isArray(quiz.questions)) return undefined;
  return quiz.questions.filter(
    (q): q is Question =>
      isRecord(q) && typeof q.id === "string" && typeof q.enunciado === "string" && isRecord(q.options) && typeof q.answer === "string",
  );
}

/** New records hold one thought; older ones hold the two prompts we merged. */
const isReasoning = (value: unknown): value is Reasoning =>
  isRecord(value) &&
  (typeof value.razonamiento === "string" || (typeof value.entendi === "string" && typeof value.porque === "string"));

const thought = (reasoning: Reasoning | undefined): string =>
  reasoning?.razonamiento?.trim() ||
  [reasoning?.entendi, reasoning?.porque].filter((text): text is string => typeof text === "string" && text.trim() !== "").join("\n\n").trim();

function readAnswers(file: string): AnswerFile | undefined {
  const data = readRecord(file);
  if (!data) return undefined;
  if (!isRecord(data.answers)) {
    throw new HttpError(409, `recorded answers are unreadable: ${file}`);
  }
  const answers = Object.fromEntries(Object.entries(data.answers).filter((e): e is [string, string] => typeof e[1] === "string"));
  const razonamientos = isRecord(data.razonamientos)
    ? Object.fromEntries(Object.entries(data.razonamientos).filter((e): e is [string, Reasoning] => isReasoning(e[1])))
    : {};
  return { answers, razonamientos };
}

/** Concept verdicts the tutor recorded (feedback/{part}.json or diagnostico-conceptos.json). */
function readVerdicts(file: string): Record<string, unknown>[] | null {
  const data = readRecord(file);
  if (!data || !Array.isArray(data.conceptos)) return null;
  return data.conceptos.filter(
    (v): v is Record<string, unknown> =>
      isRecord(v) && ["codigo", "estado", "pregunta", "evidencia"].every((key) => typeof v[key] === "string"),
  );
}

/** The browser never receives answer keys before the learner answers. */
const publicQuestion = (q: Question) => ({ id: q.id, enunciado: q.enunciado, options: q.options, pieza: q.pieza, round: q.round });

const grade = (q: Question, chosen: string): Graded => ({ id: q.id, chosen, correct: q.answer, ok: chosen === q.answer });

function gradeRecorded(questions: Question[], recorded: AnswerFile | undefined): Graded[] | null {
  if (!recorded) return null;
  return questions
    .filter((q) => q.id in recorded.answers)
    .map((q) => ({ ...grade(q, recorded.answers[q.id]), ...recorded.razonamientos[q.id] }));
}

/** `explicaciones/Parte N - <slug>.html`: the part's rich page, when the builder wrote one. */
function richPage(topicDir: string, plan: { parts: PlanPart[] }, partId: string): string | undefined {
  const index = plan.parts.findIndex((p) => p.id === partId);
  if (index < 0) return undefined;
  const file = join(topicDir, "explicaciones", `Parte ${index + 1} - ${plan.parts[index].slug}.html`);
  return existsSync(file) ? file : undefined;
}

const partVideo = (plan: { parts: PlanPart[] }, partId: string) => {
  const index = plan.parts.findIndex((p) => p.id === partId);
  return `explicaciones/adjuntos/Parte ${index + 1} - ${plan.parts[index].slug}.mp4`;
};

/** Writes `script` first in <head>, or at the start of a page without one. */
const injectFirst = (html: string, script: string) =>
  /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + script) : script + html;

function partNote(topicDir: string, plan: { parts: PlanPart[] }, partId: string): string | undefined {
  const index = plan.parts.findIndex((p) => p.id === partId);
  if (index < 0) return undefined;
  const dir = join(topicDir, "explicaciones");
  const exact = join(dir, `Parte ${index + 1} - ${plan.parts[index].slug}.md`);
  if (existsSync(exact)) return exact;
  if (!existsSync(dir)) return undefined;
  const suffix = ` - ${plan.parts[index].slug}.md`;
  const found = readdirSync(dir).find((name) => name.startsWith("Parte ") && name.endsWith(suffix));
  return found ? join(dir, found) : undefined;
}

function findByName(dir: string, name: string, depth: number): string | undefined {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const hit = entries.find((e) => e.isFile() && e.name === name);
  if (hit) return join(dir, hit.name);
  if (depth === 0) return undefined;
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const nested = findByName(join(dir, entry.name), name, depth - 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

const fileUrl = (topicDir: string, file: string) =>
  `file/${relative(topicDir, file).split(sep).map(encodeURIComponent).join("/")}`;

/** Obsidian-only syntax (frontmatter, ![[embeds]], [[links]]) to portable Markdown/HTML. */
export function obsidianToMarkdown(markdown: string, topicDir: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_m, rawName: string) => {
      const name = rawName.trim();
      const file = findByName(topicDir, name, EMBED_SEARCH_DEPTH);
      if (!file) return `*${name} (no encontrado)*`;
      const src = fileUrl(topicDir, file);
      const ext = extname(name).toLowerCase();
      if (VIDEO.has(ext)) return `<video controls preload="metadata" src="${src}"></video>`;
      if (AUDIO.has(ext)) return `<audio controls src="${src}"></audio>`;
      if (IMAGE.has(ext)) return `<img alt="${name.replace(/"/g, "&quot;")}" src="${src}">`;
      return `*${name}*`;
    })
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => (alias ?? target).trim());
}

/** explicaciones/apps/<part>.html when the part has an interactive app. */
function partApp(topicDir: string, partId: string): string | undefined {
  if (!safeTopic(partId)) return undefined;
  const contained = resolveContained(topicDir, join(topicDir, "explicaciones", "apps", `${partId}.html`));
  return contained.ok && statSync(contained.targetReal).isFile() ? contained.targetReal : undefined;
}

function partDemos(topicDir: string, partId: string): string[] {
  const dir = join(topicDir, "explicaciones", "demos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(`${partId}-`) && name.endsWith(".html"))
    .sort()
    .map((name) => `file/explicaciones/demos/${name}`);
}

const quote = (text: string) => `"""\n${text.trim()}\n"""`;

const indented = (text: string) => text.trim().replace(/\n/g, "\n    ");

function quizMessage(header: string, saved: string, results: Graded[], reasoning: Record<string, Reasoning>): string[] {
  const score = results.filter((r) => r.ok).length;
  const lines = [header, `Respuestas y razonamientos guardados en ${saved} (resultado inmediato: ${score}/${results.length}):`];
  for (const r of results) {
    lines.push(`- ${r.id}: ${r.chosen} ${r.ok ? "✔" : `✘ (correcta: ${r.correct})`}`);
    const said = thought(reasoning[r.id]);
    if (said) {
      lines.push(`  Pensamiento: ${indented(said)}`);
      if (reasoning[r.id].confianza) lines.push(`  Confianza: ${CONFIDENCE[reasoning[r.id].confianza ?? ""] ?? "-"}`);
    }
  }
  return lines;
}

/** Atomic write: a reader sees either no file or the whole file. */
function writeAnswers(file: string, record: AnswerFile): void {
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(tmp, file);
}

const ALLOWED_KEYS: Record<string, Set<string>> = {
  "mini-quiz": new Set(["kind", "topic", "part", "answers", "reasoning", "ownWords", "exercises"]),
  diagnosis: new Set(["kind", "topic", "answers", "reasoning"]),
  question: new Set(["kind", "topic", "part", "text", "demo"]),
  video: new Set(["kind", "topic", "part"]),
  code: new Set(["kind", "topic", "exercise", "code", "note"]),
};

function optionalText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > MAX_TEXT_CHARS) {
    throw new HttpError(400, `${key} must be a string of at most ${MAX_TEXT_CHARS} characters`);
  }
  return value;
}

function checkAnswers(raw: unknown, questions: Question[], exact: boolean): Record<string, string> {
  if (!isRecord(raw) || Object.keys(raw).length === 0) throw new HttpError(400, "answers must be a non-empty object");
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const [id, choice] of Object.entries(raw)) {
    const q = byId.get(id);
    if (!q) throw new HttpError(400, `unknown question id: ${id}`);
    if (typeof choice !== "string" || !CHOICES.has(choice) || !(choice in q.options)) {
      throw new HttpError(400, `invalid option for ${id}`);
    }
  }
  if (exact && Object.keys(raw).length !== questions.length) throw new HttpError(400, "every question must be answered");
  return raw as Record<string, string>;
}

/** The learner's thought is optional: when they write it, it is stored and quoted; silence is allowed. */
function optionalReasoning(raw: unknown, answers: Record<string, string>): Record<string, Reasoning> {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) throw new HttpError(400, "reasoning must be an object of {razonamiento, confianza} per question");
  const extra = Object.keys(raw).find((id) => !(id in answers));
  if (extra) throw new HttpError(400, `reasoning for an unanswered question: ${extra}`);
  const out: Record<string, Reasoning> = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!isRecord(entry) || Object.keys(entry).some((key) => !["razonamiento", "entendi", "porque", "confianza"].includes(key))) {
      throw new HttpError(400, `reasoning for ${id} must be {razonamiento, confianza}`);
    }
    for (const key of ["razonamiento", "entendi", "porque"]) {
      const value = entry[key];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > MAX_TEXT_CHARS) {
        throw new HttpError(400, `reasoning for ${id} must be text of at most ${MAX_TEXT_CHARS} characters`);
      }
    }
    if (entry.confianza !== undefined && (typeof entry.confianza !== "string" || !Object.hasOwn(CONFIDENCE, entry.confianza))) {
      throw new HttpError(400, `reasoning confianza for ${id} must be one of ${Object.keys(CONFIDENCE).join(", ")}`);
    }
    const text = thought(entry as Reasoning);
    if (!text) continue;
    out[id] = entry.confianza ? { razonamiento: text, confianza: entry.confianza } : { razonamiento: text };
  }
  return out;
}

/** URL path below the token for a topic and part, after checking they exist in the vault. */
function viewPath(rootReal: string, topic: unknown, part: unknown): string {
  if (topic === undefined) return "";
  if (!safeTopic(topic) || !existsSync(join(rootReal, topic))) {
    throw new Error(`unknown topic ${JSON.stringify(topic)}: use one folder name under the Learnings root`);
  }
  if (part === undefined) return encodeURIComponent(topic);
  const dir = join(rootReal, topic);
  if (typeof part === "string" && part.startsWith("codigo/")) {
    const id = part.slice(7);
    exerciseFile(dir, id);
    return `${encodeURIComponent(topic)}/codigo/${encodeURIComponent(id)}`;
  }
  const plan = readPlan(dir);
  const known =
    part === DIAGNOSIS
      ? existsSync(join(dir, "quiz.json"))
      : typeof part === "string" && plan !== undefined && (partNote(dir, plan, part) ?? richPage(dir, plan, part)) !== undefined;
  if (!known) throw new Error(`part ${String(part)} is not written in ${topic}`);
  return `${encodeURIComponent(topic)}/${part}`;
}

export interface PartSummary {
  id: string;
  title: string;
  written: boolean;
  rich: boolean;
  hasApp: boolean;
  hasQuiz: boolean;
  answered: boolean;
}
export interface TopicSummary {
  id: string;
  title: string;
  hasDiagnosis: boolean;
  parts: PartSummary[];
  exercises: { id: string; titulo: string; lenguaje: string; mejor: string | null }[];
}

/** Every topic folder with a plan.json under the Learnings root, with its parts as the vault holds them. */
export function listTopics(rootReal: string, runners = loadRunners()): TopicSummary[] {
  return readdirSync(rootReal, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith(".") && e.name !== "rapidos")
    .flatMap((e) => {
      const dir = join(rootReal, e.name);
      let plan;
      try {
        plan = readPlan(dir);
      } catch {
        return [];
      }
      if (!plan && !existsSync(join(dir, "codigo"))) return [];
      // One unreadable file must not take the whole gallery down: a broken topic degrades to bare rows.
      try {
        const exercises = listExercises(dir, runners).map(({ id, titulo, lenguaje, mejor }) => ({ id, titulo, lenguaje, mejor }));
        const parts = (plan?.parts ?? []).map((p) => {
          const rich = richPage(dir, plan!, p.id) !== undefined;
          return {
            id: p.id,
            title: p.title,
            written: rich || partNote(dir, plan!, p.id) !== undefined,
            rich,
            hasApp: partApp(dir, p.id) !== undefined,
            hasQuiz: existsSync(join(dir, "mini-quiz", `${p.id}.json`)),
            answered: existsSync(join(dir, "mini-quiz", `${p.id}.answers.json`)),
          };
        });
        return [{ id: e.name, title: plan?.topic || e.name, hasDiagnosis: existsSync(join(dir, "quiz.json")), parts, exercises }];
      } catch {
        return [{ id: e.name, title: plan?.topic || e.name, hasDiagnosis: false, parts: [], exercises: [] }];
      }
    });
}

export interface BridgeOptions {
  root: string;
  runnersFile?: string;
  /** 0 picks a free port. */
  port?: number;
  /** Loopback origins (e.g. the learning studio) allowed to embed pages and apps. */
  frameAncestors?: string[];
  /** Directory of kit.css / kit.js (tests). */
  kitDir?: string;
}

export function registerBridge(pi: ExtensionAPI, options: BridgeOptions): void {
  const embedders = options.frameAncestors ?? [];
  const invalid = embedders.find((origin) => !LOOPBACK_ORIGIN.test(origin));
  if (invalid !== undefined) throw new Error(`frameAncestors accepts loopback http origins only, got ${JSON.stringify(invalid)}`);
  const pageCsp = `${PAGE_CSP}; frame-ancestors ${["'self'", ...embedders].join(" ")}`;
  const appCsp = `${APP_CSP}; frame-ancestors ${embedders.length ? embedders.join(" ") : "'none'"}`;
  const richCsp = `${RICH_CSP}; frame-ancestors ${["'self'", ...embedders].join(" ")}`;
  const kitDir = options.kitDir ?? KIT_DIR;
  let server: Server | undefined;
  let starting: Promise<void> | undefined;
  let port = 0;
  let token = "";
  let rootReal = "";

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const base = () => `http://127.0.0.1:${port}/${token}/`;

  const tokenMatches = (candidate: string) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const topicDir = (topic: unknown): string => {
    if (!safeTopic(topic)) throw new HttpError(400, "topic must be one folder name under the Learnings root");
    const contained = resolveContained(rootReal, join(rootReal, topic));
    if (!contained.ok || !statSync(contained.targetReal).isDirectory()) throw new HttpError(404, `unknown topic: ${topic}`);
    return contained.targetReal;
  };

  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}) => {
    res.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...extra,
    });
    res.end(body);
  };
  const sendJson = (res: ServerResponse, status: number, body: unknown) =>
    send(res, status, "application/json; charset=utf-8", JSON.stringify(body));

  const page = (res: ServerResponse, title: string, data: Record<string, unknown>) => {
    const prefix = `/${token}/`;
    const json = JSON.stringify({ ...data, submitUrl: `${prefix}submit`, home: prefix }).replace(/</g, "\\u003c");
    const scripts = CDN_SCRIPTS.map(([src, sri]) => `<script src="${src}" integrity="${sri}" crossorigin="anonymous"></script>`).join("\n");
    const escapedTitle = title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<link rel="stylesheet" href="${prefix}app.css">
${scripts}
</head>
<body>
<main id="app"></main>
<script type="application/json" id="view-data">${json}</script>
<script src="${prefix}app.js"></script>
</body>
</html>
`;
    send(res, 200, "text/html; charset=utf-8", html, { "content-security-policy": pageCsp });
  };

  const indexPage = (res: ServerResponse) => {
    page(res, "Learnings", { kind: "index", topics: listTopics(rootReal, loadRunners(options.runnersFile)).map(({ id, title }) => ({ id, title })) });
  };

  const topicPage = (res: ServerResponse, topic: string) => {
    const dir = topicDir(topic);
    const plan = readPlan(dir);
    if (!plan && !existsSync(join(dir, "codigo"))) throw new HttpError(404, `topic has no plan.json: ${topic}`);
    const parts = (plan?.parts ?? []).map((p) => ({ id: p.id, title: p.title, written: partNote(dir, plan!, p.id) !== undefined }));
    page(res, plan?.topic || topic, {
      kind: "topic",
      topic,
      title: plan?.topic || topic,
      exercises: listExercises(dir, loadRunners(options.runnersFile)),
      topicBase: `/${token}/${encodeURIComponent(topic)}/`,
      parts,
      hasDiagnosis: existsSync(join(dir, "quiz.json")),
    });
  };

  const config = (topic: string, partId: string, plan: { parts: PlanPart[] }) => {
    const json = JSON.stringify({
      submitUrl: `/${token}/submit`,
      quizUrl: `/${token}/api/quiz?topic=${encodeURIComponent(topic)}&part=${encodeURIComponent(partId)}`,
      topic,
      part: partId,
      video: `file/${partVideo(plan, partId).split("/").map(encodeURIComponent).join("/")}`,
    }).replace(/</g, "\\u003c");
    return `<script>window.LEARNING_BRIDGE = ${json};</script>`;
  };

  const partPage = (res: ServerResponse, topic: string, partId: string) => {
    const dir = topicDir(topic);
    const plan = readPlan(dir);
    const rich = plan && richPage(dir, plan, partId);
    if (plan && rich) {
      let html = injectFirst(readFileSync(rich, "utf8"), config(topic, partId, plan));
      const exercises = listExercises(dir, loadRunners(options.runnersFile)).filter((e) => e.parte === partId);
      if (exercises.length) {
        const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        const links = exercises.map((e) => `<li><a href="/${token}/${encodeURIComponent(topic)}/codigo/${encodeURIComponent(e.id)}">${escape(e.titulo)}</a> · ${escape(e.lenguaje)} · Mejor: ${escape(e.mejor || "sin entregas")}</li>`).join("");
        const section = `<section><h2>Ejercicios de código</h2><ul>${links}</ul></section>`;
        html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => section + "</body>") : html + section;
      }
      return send(res, 200, "text/html; charset=utf-8", html, { "content-security-policy": richCsp });
    }
    const note = plan && partNote(dir, plan, partId);
    if (!plan || !note) throw new HttpError(404, `part ${partId} is not written yet`);
    const part = plan.parts.find((p) => p.id === partId)!;
    const questions = readQuestions(join(dir, "mini-quiz", `${partId}.json`));
    page(res, part.title, {
      kind: "part",
      exercises: listExercises(dir, loadRunners(options.runnersFile)).filter((e) => e.parte === partId),
      topic,
      part: partId,
      title: part.title,
      topicTitle: plan.topic || topic,
      topicBase: `/${token}/${encodeURIComponent(topic)}/`,
      markdown: obsidianToMarkdown(readFileSync(note, "utf8"), dir),
      quiz: questions ? { questions: questions.map(publicQuestion) } : null,
      answered: questions ? gradeRecorded(questions, readAnswers(join(dir, "mini-quiz", `${partId}.answers.json`))) : null,
      demos: partDemos(dir, partId),
      app: partApp(dir, partId) ? `/${token}/${encodeURIComponent(topic)}/${partId}/app` : null,
      verdicts: readVerdicts(join(dir, "feedback", `${partId}.json`)),
    });
  };

  const quizApi = (res: ServerResponse, url: URL) => {
    const topic = url.searchParams.get("topic");
    const partId = url.searchParams.get("part") ?? "";
    const dir = topicDir(topic);
    const plan = readPlan(dir);
    if (!plan?.parts.some((p) => p.id === partId)) throw new HttpError(404, `part ${partId} is not in plan.json`);
    const questions = readQuestions(join(dir, "mini-quiz", `${partId}.json`));
    if (!questions) throw new HttpError(404, `part ${partId} has no mini-quiz`);
    sendJson(res, 200, {
      questions: questions.map(publicQuestion),
      answered: gradeRecorded(questions, readAnswers(join(dir, "mini-quiz", `${partId}.answers.json`))),
      verdicts: readVerdicts(join(dir, "feedback", `${partId}.json`)),
    });
  };

  const kitFile = (res: ServerResponse, name: string) => {
    if (!/^(?:fonts\/)?[\w-]+\.(js|css|woff2)$/.test(name)) throw new HttpError(404, "not found");
    const contained = resolveContained(kitDir, join(kitDir, name));
    if (!contained.ok) throw new HttpError(404, "not found");
    send(res, 200, MIME[extname(name)], readFileSync(contained.targetReal));
  };

  /** A quick explanation (`rapidos/<id>.md`): the same view, no engine and no quiz sidecar. */
  const quickPage = (res: ServerResponse, id: string) => {
    if (!safeTopic(id)) throw new HttpError(404, "not found");
    const dir = topicDir("rapidos");
    const contained = resolveContained(dir, join(dir, `${id}.md`));
    if (!contained.ok) throw new HttpError(404, `no quick note ${id}`);
    const markdown = obsidianToMarkdown(readFileSync(contained.targetReal, "utf8"), dir);
    const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || id;
    page(res, title, {
      kind: "part",
      topic: "rapidos",
      part: "",
      title,
      topicTitle: "Rápidos",
      topicBase: `/${token}/`,
      markdown,
      quiz: null,
      answered: null,
      demos: [],
      app: null,
      verdicts: null,
    });
  };

  const diagnosisPage = (res: ServerResponse, topic: string) => {
    const dir = topicDir(topic);
    const questions = readQuestions(join(dir, "quiz.json"));
    if (!questions) throw new HttpError(404, `topic ${topic} has no diagnosis quiz`);
    const plan = readPlan(dir);
    page(res, "Diagnóstico", {
      kind: "diagnosis",
      topic,
      title: "Diagnóstico",
      topicTitle: plan?.topic || topic,
      topicBase: `/${token}/${encodeURIComponent(topic)}/`,
      quiz: { questions: questions.map(publicQuestion) },
      answered: gradeRecorded(questions, readAnswers(join(dir, "quiz.answers.json"))),
      demos: [],
      verdicts: readVerdicts(join(dir, "diagnostico-conceptos.json")),
    });
  };

  const appPage = (res: ServerResponse, topic: string, partId: string) => {
    const dir = topicDir(topic);
    const plan = readPlan(dir);
    const file = plan?.parts.some((p) => p.id === partId) ? partApp(dir, partId) : undefined;
    if (!file) throw new HttpError(404, `part ${partId} has no interactive app`);
    const config = JSON.stringify({ submitUrl: `/${token}/submit`, topic, part: partId }).replace(/</g, "\\u003c");
    const script = `<script>window.LEARNING_BRIDGE = ${config};</script>`;
    const injected = injectFirst(readFileSync(file, "utf8"), script);
    send(res, 200, "text/html; charset=utf-8", injected, { "content-security-policy": appCsp });
  };

  const serveFile = (req: IncomingMessage, res: ServerResponse, topic: string, segments: string[]) => {
    const dir = topicDir(topic);
    if (segments.length === 0 || segments.some((s) => s === "" || s === "." || s === ".." || /[\\/\0]/.test(s))) {
      throw new HttpError(404, "not found");
    }
    const contained = resolveContained(dir, join(dir, ...segments));
    if (!contained.ok) throw new HttpError(404, "not found");
    const codeDir = resolveContained(dir, join(dir, "codigo"));
    // Exercise files hold the hidden tests; the vault may sit on a case-insensitive drive.
    const target = contained.targetReal.toLowerCase();
    const codeRoot = codeDir.ok ? codeDir.targetReal.toLowerCase() : join(dir, "codigo").toLowerCase();
    if (target === codeRoot || target.startsWith(codeRoot + sep)) throw new HttpError(404, "not found");
    const stat = statSync(contained.targetReal);
    if (!stat.isFile()) throw new HttpError(404, "not found");
    const headers: Record<string, string> = {
      "content-type": MIME[extname(contained.targetReal).toLowerCase()] ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      // Demos and any other topic file run in an opaque origin: they cannot use the token routes.
      "content-security-policy": "sandbox allow-scripts",
    };
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match && match[1] !== "" ? Number(match[1]) : NaN;
      let end = match && match[2] !== "" ? Number(match[2]) : stat.size - 1;
      if (match && match[1] === "" && match[2] !== "") {
        start = Math.max(0, stat.size - Number(match[2]));
        end = stat.size - 1;
      }
      end = Math.min(end, stat.size - 1);
      if (!match || Number.isNaN(start) || start > end) {
        res.writeHead(416, { ...headers, "content-range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": String(end - start + 1) });
      createReadStream(contained.targetReal, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "content-length": String(stat.size) });
    createReadStream(contained.targetReal).pipe(res);
  };

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolveBody, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      });
      req.on("end", () =>
        size > MAX_BODY_BYTES ? reject(new HttpError(413, "body too large")) : resolveBody(Buffer.concat(chunks).toString("utf8")),
      );
      req.on("error", reject);
    });

  const deliver = async (text: string) => {
    try {
      await pi.sendUserMessage(text, { deliverAs: "followUp" });
    } catch (err) {
      throw new HttpError(502, `could not send to the chat: ${(err as Error).message}`);
    }
  };

  const codeRequest = async (res: ServerResponse, payload: Record<string, unknown>, submit: boolean) => {
    const dir = topicDir(payload.topic);
    const file = exerciseFile(dir, payload.exercise);
    const runners = loadRunners(options.runnersFile);
    const ex = readExercise(file, runners);
    if (typeof payload.code !== "string") throw new HttpError(400, "code must be a string");
    if (payload.input !== undefined && (typeof payload.input !== "string" || payload.input.length > 100_000)) throw new HttpError(400, "input must be a string of at most 100000 characters");
    const note = optionalText(payload, "note");
    const tests = submit ? ex.tests : payload.input !== undefined ? [{ nombre: "Entrada libre", entrada: payload.input as string }] : ex.tests.filter((t) => !t.oculto);
    const result = await runCode({ runner: runners[ex.lenguaje], code: payload.code, tests, limitSeconds: ex.limite_segundos });
    if (!submit) return sendJson(res, 200, forPage(result));
    const savedFile = saveSubmission(dirname(file), { ...result, lenguaje: ex.lenguaje, codigo: payload.code, ...(note ? { nota: note } : {}) });
    const saved = relative(dir, savedFile).split(sep).join("/");
    const score = `${result.aprobados}/${result.total}`;
    const lines = [`[Vista HTML · ${payload.topic} · código ${payload.exercise}]`, `Guardado: ${saved}`, `Resultado: ${score}`, `Compilación: ${result.compilacion.ok ? "correcta" : "error"}`, result.compilacion.salida];
    for (const r of result.resultados) {
      lines.push(`${r.nombre}${r.oculto ? " (oculto)" : ""}: ${r.estado}`);
      if (r.estado !== "correcto") lines.push(`Esperado: ${r.esperado ?? ""}\nObtenido: ${r.obtenido ?? ""}\nErrores: ${r.errores ?? ""}`);
    }
    lines.push("", `\`\`\`${ex.lenguaje}\n${payload.code}\n\`\`\``);
    if (note) lines.push(quote(note));
    lines.push("Revisa la corrección según las pruebas, el enfoque, la legibilidad y los errores típicos. Inyecta la corrección en la nota del tema como de costumbre.");
    await deliver(lines.join("\n"));
    sendJson(res, 200, { ...forPage(result), saved, score });
  };

  const codeRun = async (req: IncomingMessage, res: ServerResponse) => {
    if (!allowedOrigins().has(String(req.headers.origin ?? ""))) throw new HttpError(403, "foreign origin");
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "JSON only");
    let payload: unknown;
    try { payload = JSON.parse(await readBody(req)); } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "body is not JSON");
    }
    if (!isRecord(payload) || Object.keys(payload).some((k) => !["topic", "exercise", "code", "input"].includes(k))) throw new HttpError(400, "unknown field");
    return codeRequest(res, payload, false);
  };

  const codePage = (res: ServerResponse, topic: string, id: string) => {
    const dir = topicDir(topic);
    const file = exerciseFile(dir, id);
    const runners = loadRunners(options.runnersFile);
    const ex = readExercise(file, runners);
    page(res, ex.titulo, { kind: "code", topic, title: ex.titulo, exercise: { ...publicExercise(ex), id }, file: runners[ex.lenguaje].file,
      ...readSubmissions(dirname(file)), runUrl: `/${token}/api/code/run`, topicBase: `/${token}/${encodeURIComponent(topic)}/`, topicTitle: readPlan(dir)?.topic || topic });
  };

  const submit = async (req: IncomingMessage, res: ServerResponse) => {
    if (!allowedOrigins().has(String(req.headers.origin ?? ""))) throw new HttpError(403, "foreign origin");
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "JSON only");
    const raw = await readBody(req);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "body is not JSON");
    }
    if (!isRecord(payload) || typeof payload.kind !== "string" || !(payload.kind in ALLOWED_KEYS)) {
      throw new HttpError(400, "unknown kind");
    }
    const kind = payload.kind;
    const unknownKey = Object.keys(payload).find((key) => !ALLOWED_KEYS[kind].has(key));
    if (unknownKey) throw new HttpError(400, `unknown field: ${unknownKey}`);
    if (kind === "code") return codeRequest(res, payload, true);
    const dir = topicDir(payload.topic);
    const topic = payload.topic as string;
    const plan = readPlan(dir);
    const partId = payload.part;
    if (partId !== undefined && (typeof partId !== "string" || !plan?.parts.some((p) => p.id === partId))) {
      throw new HttpError(400, "part is not in plan.json");
    }

    if (kind === "video") {
      if (typeof partId !== "string") throw new HttpError(400, "part is required");
      const header = ["Vista HTML", topic, partId, "video"].join(" · ");
      await deliver(
        `[${header}]\nLa persona pide el video de esta parte: prodúcelo con el pipeline de learnings-video (video-distill.md) y guárdalo en ${partVideo(plan!, partId)}.`,
      );
      sendJson(res, 200, { sent: true });
      return;
    }

    if (kind === "question") {
      const text = optionalText(payload, "text");
      if (text.trim() === "") throw new HttpError(400, "text must not be empty");
      const demo = payload.demo;
      if (demo !== undefined && (typeof demo !== "string" || !/^[\w.-]+\.html$/.test(demo))) {
        throw new HttpError(400, "demo must be a demo file name");
      }
      const header = ["Vista HTML", topic, partId, "pregunta", demo && `demo ${demo}`].filter(Boolean).join(" · ");
      await deliver(`[${header}]\nPregunta de la persona:\n${quote(text)}`);
      sendJson(res, 200, { sent: true });
      return;
    }

    if (kind === "mini-quiz") {
      if (typeof partId !== "string") throw new HttpError(400, "part is required");
      const questions = readQuestions(join(dir, "mini-quiz", `${partId}.json`));
      if (!questions) throw new HttpError(400, `part ${partId} has no mini-quiz`);
      const answers = checkAnswers(payload.answers, questions, true);
      const reasoning = optionalReasoning(payload.reasoning, answers);
      const ownWords = optionalText(payload, "ownWords");
      const exercises = optionalText(payload, "exercises");
      const saved = `mini-quiz/${partId}.answers.json`;
      const file = join(dir, saved);
      if (existsSync(file)) throw new HttpError(409, `${saved} already exists; the quiz is answered`);
      const ordered = Object.fromEntries(questions.map((q) => [q.id, answers[q.id]]));
      writeAnswers(file, { answers: ordered, razonamientos: Object.fromEntries(questions.map((q) => [q.id, reasoning[q.id]])) });
      const results = questions.map((q) => grade(q, ordered[q.id]));
      const lines = quizMessage(`[Vista HTML · ${topic} · ${partId} · mini-quiz]`, saved, results, reasoning);
      if (ownWords.trim()) lines.push("", "Vuelco con mis palabras:", quote(ownWords));
      if (exercises.trim()) lines.push("", "Ejercicios:", quote(exercises));
      await deliver(lines.join("\n"));
      sendJson(res, 200, { results, score: `${results.filter((r) => r.ok).length}/${results.length}`, saved });
      return;
    }

    const questions = readQuestions(join(dir, "quiz.json"));
    if (!questions) throw new HttpError(400, `topic ${topic} has no diagnosis quiz`);
    const answers = checkAnswers(payload.answers, questions, false);
    const reasoning = optionalReasoning(payload.reasoning, answers);
    const saved = "quiz.answers.json";
    const file = join(dir, saved);
    const recorded = readAnswers(file) ?? { answers: {}, razonamientos: {} };
    const repeated = Object.keys(answers).find((id) => id in recorded.answers);
    if (repeated) throw new HttpError(409, `${repeated} is already answered`);
    writeAnswers(file, {
      answers: { ...recorded.answers, ...answers },
      razonamientos: { ...recorded.razonamientos, ...reasoning },
    });
    const results = questions.filter((q) => q.id in answers).map((q) => grade(q, answers[q.id]));
    await deliver(quizMessage(`[Vista HTML · ${topic} · diagnóstico]`, saved, results, reasoning).join("\n"));
    sendJson(res, 200, { results, score: `${results.filter((r) => r.ok).length}/${results.length}`, saved });
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    if (!allowedHosts().has(String(req.headers.host ?? ""))) throw new HttpError(403, "host not allowed");
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let segments: string[];
    try {
      segments = url.pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      throw new HttpError(404, "not found");
    }
    if (!tokenMatches(segments[0] ?? "")) throw new HttpError(404, "not found");
    const rest = segments.slice(1);
    if (rest.length > 0 && rest[rest.length - 1] === "") rest.pop();

    if (req.method === "POST") {
      if (rest.join("/") === "api/code/run") return codeRun(req, res);
      if (rest.length === 1 && rest[0] === "submit") return submit(req, res);
      throw new HttpError(404, "not found");
    }
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "method not allowed");
    if (rest.length === 0) return indexPage(res);
    if (rest[0] === "kit" && rest.length >= 2) return kitFile(res, rest.slice(1).join("/"));
    if (rest.length === 2 && rest[0] === "api" && rest[1] === "quiz") return quizApi(res, url);
    if (rest.length === 1 && (rest[0] === "app.js" || rest[0] === "app.css")) {
      return send(res, 200, MIME[extname(rest[0])], readFileSync(join(VIEW_DIR, rest[0])));
    }
    const [topic, second, ...more] = rest;
    if (second === undefined) return topicPage(res, topic);
    if (second === "codigo" && more.length === 1) return codePage(res, topic, more[0]);
    if (second === "file") return serveFile(req, res, topic, more);
    if (topic === "rapidos" && more.length === 0) return quickPage(res, second);
    if (more.length === 1 && more[0] === "app") return appPage(res, topic, second);
    if (more.length > 0) throw new HttpError(404, "not found");
    if (second === DIAGNOSIS) return diagnosisPage(res, topic);
    return partPage(res, topic, second);
  };

  const start = async () => {
    if (server) return;
    starting ??= new Promise<void>((resolveStart, reject) => {
      const contained = resolveContained(options.root, options.root);
      if (!contained.ok) return reject(new Error(contained.reason));
      rootReal = contained.rootReal;
      token = randomBytes(32).toString("hex");
      const candidate = createServer((req, res) => {
        route(req, res).catch((err: unknown) => {
          const status = err instanceof HttpError ? err.status : err instanceof CodeRunError ? 422 : 500;
          if (!res.headersSent) sendJson(res, status, { error: (err as Error).message });
          else res.destroy();
        });
      });
      candidate.once("error", (err) => {
        starting = undefined;
        reject(err);
      });
      candidate.listen(options.port ?? 0, "127.0.0.1", () => {
        port = (candidate.address() as { port: number }).port;
        server = candidate;
        resolveStart();
      });
    });
    await starting;
  };

  const stop = async () => {
    const current = server;
    server = undefined;
    starting = undefined;
    if (!current) return;
    current.closeAllConnections();
    await new Promise<void>((done) => current.close(() => done()));
  };

  pi.on("session_shutdown", stop);

  const viewError = (detail: string) => ({
    content: [{ type: "text" as const, text: `learning_view: ${detail}` }],
    details: { error: detail },
    structuredContent: { error: detail } as Record<string, unknown>,
    isError: true,
  });

  pi.registerTool({
    name: "learning_view",
    label: "Learning HTML view",
    description:
      "Start (once per session) the local interactive HTML view of the Learnings vault and return its URL: index of topics, a topic, one written part (note, video, demos, live mini-quiz) the diagnosis quiz (part = \"quiz\") or a code exercise (part = \"codigo/<id>\"). " +
      "The learner's quiz answers are stored in the answers file the engine reads (never overwriting recorded answers) and arrive in this chat as a message starting with [Vista HTML · ...], together with reasoning, own words, exercises or questions.",
    promptSnippet: "Get the interactive HTML view URL of a Learnings topic or part",
    promptGuidelines: [
      "After a part, a mini-quiz or a diagnosis round is written, call learning_view for it and give the learner the URL as the place to watch, try the demos and answer.",
      "A message starting with [Vista HTML · ...] is the learner's own submission: treat it exactly like answers typed in the chat; the answers file it names is already written.",
    ],
    // SAFETY: plain JSON Schema object; the host only reads it as a TypeBox-compatible schema.
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic folder name directly under the Learnings root; omit for the index." },
        part: { type: "string", description: "Part id from plan.json (p1, p2, ...) or \"quiz\" for the diagnosis, or codigo/<id> for code; requires topic." },
      },
      additionalProperties: false,
    } as unknown as TSchema,
    // SAFETY: open JSON Schema object, read by the host as a TypeBox-compatible schema.
    outputSchema: { type: "object", additionalProperties: true } as unknown as TSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const session = resolveContained(options.root, ctx.cwd);
      if (!session.ok) return viewError(`session cwd is outside the Learnings root — ${session.reason}`);
      const { topic, part } = params as { topic?: unknown; part?: unknown };
      if (part !== undefined && topic === undefined) return viewError("part requires topic");
      let path: string;
      try {
        path = viewPath(session.rootReal, topic, part);
      } catch (err) {
        return viewError((err as Error).message);
      }
      try {
        await start();
      } catch (err) {
        return viewError(`could not start the view server: ${(err as Error).message}`);
      }
      const url = base() + path;
      const hasApp = typeof topic === "string" && typeof part === "string" && partApp(join(session.rootReal, topic), part) !== undefined;
      const appUrl = hasApp ? `${url}/app` : undefined;
      return {
        content: [{ type: "text" as const, text: appUrl ? `Aplicación interactiva: ${appUrl}\nVista HTML: ${url}` : `Vista HTML: ${url}` }],
        details: { url, appUrl },
        structuredContent: { url, base: base(), ...(appUrl ? { appUrl } : {}) } as Record<string, unknown>,
        isError: false,
      };
    },
  });
}
