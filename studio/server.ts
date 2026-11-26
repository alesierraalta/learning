/**
 * Learning studio: a local app to browse every Learnings content and drive the
 * study while Pi runs in the background.
 *
 * The server spawns `pi --mode rpc` in the Learnings folder as an interactive
 * RPC host (Gentle then asks its questions through RPC dialogs), relays Pi's
 * events to the browser over Server-Sent Events, and hosts its own study-view
 * bridge whose submissions become prompts of that same Pi session. Skill,
 * engine, preferences and mode choice are untouched: they run inside Pi.
 * Every route requires the per-run token; the Host header must be loopback and
 * a POST must come from this origin with a JSON body.
 */
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CDN_SCRIPTS,
  HttpError,
  NoteRevMismatch,
  backupPartForRegeneration,
  regenerationTrash,
  deleteNote,
  listTopics,
  parsePublicOrigins,
  readPlan,
  readQuickNote,
  registerBridge,
  writeQuickNote,
  type DeleteResult,
} from "../integrations/pi/bridge.ts";
import { loadCatalogue, runnerList } from "../integrations/pi/coderun.ts";
import { MAX_AUDIO_BYTES, TranscribeError, transcribeAudio } from "../integrations/pi/transcribe.ts";
import { lintMarkdown } from "../tools/deck-lint.mjs";
import { ROOT_UNSET, resolveContained } from "../integrations/pi/paths.ts";
import { buildPanorama } from "./panorama.ts";
import { partBriefAsync, planBrief } from "./brief.ts";
import { OFFLINE_CSP, partLoader, snapshotPage } from "./offline.ts";
import { readPreferences, savePreferences } from "./preferences.ts";
import { AGY_LEVELS, PI_LEVELS, readTutor, saveTutor, TUTOR_AGENTS, type TutorConfig } from "./tutor.ts";
import { createAgy, parseAgyModels } from "./agy.ts";
import { createApi } from "./api-runtime.ts";
import { catalogoMistral, detectar, nivelesDeEffort, proveedorDisponible, proveedorPorId } from "./proveedores.ts";
import { checkTutorContext, driftMessage } from "./context.ts";
import { VISUAL_CONTRACT_PROMPT, withVisualContract } from "../integrations/pi/contract.ts";
import {
  busyFile,
  createBusyTracker,
  readRestartSnapshot,
  saveSnapshot as saveSnapshotFile,
  sessionSnapshotFile,
  snapshotFile,
  type ChatMessage,
  type InterruptedTurn,
  withStudioNotices,
} from "./state.ts";
import {
  createTopicLocks,
  readTaskConversations,
  saveTaskConversation,
  taskConversationsFile,
  type TaskState,
  type TaskView,
} from "./tasks.ts";
import {
  chatById,
  chatForAmbito,
  createChat,
  deleteChat,
  openChat,
  readChats,
  recordContexto,
  renameChat,
  saveChats,
  setAgyConversation,
  setPiSession,
  type Chat,
  type ChatContexto,
  type ChatDoc,
} from "./chats.ts";
import { parsePiModels } from "./pi-models.ts";
import { enrolled } from "./gate.ts";
import { parsedFindingsOf, runPartChecks, type PartChecks, type PartReport } from "./checks.ts";
import { gateVerdictsFile, warmGateVerdicts } from "../integrations/pi/gate-verdicts.ts";
import { PASS_STATUSES, gateVerdict, type GateReport } from "../integrations/pi/gate-rules.ts";
import {
  STUDY_MODES,
  createSettleGate,
  isStudioPrompt,
  fuentesLine,
  modeLine,
  type CallReason,
  type ExamChoice,
  type ExamFormat,
} from "./runtime.ts";
import { createPageTiming, type PageTiming, type PageTimingReport } from "./timing.ts";
import { candidatos, descubrir, olvidar } from "./descubrir.ts";
import { readGlobalTelemetry, readTopicTelemetry, recordQuizTelemetry, saveGlobalTelemetry } from "./telemetry.ts";
import { listSugerencias, motivos, recordSugerencia, resumenSugerencias, stripLecciones, stripTema, tutorContext, validateSugerencia, withLecciones, withTema } from "./sugerencias.ts";
import { listarValoraciones, recordValoracion, stripGustos, withGustos } from "./valoraciones.ts";
import { buildEspera, partNotePath, writePartTarget } from "./espera.ts";
import { createGlosario } from "./glosario.ts";
import {
  MATERIA_ERRORS,
  addFuente,
  createMateria,
  deleteFuente,
  getMateria,
  linkTema,
  listMaterias,
  readFuenteBody,
  unlinkTema,
  writePdfDerivatives,
} from "./materias.ts";
import { buscar, cerrarIndice, desindizarFuente, indizarFuente, progresoIndice, estadoIndice } from "./indice.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const UI_DIR = join(HERE, "ui");
const MAX_BODY_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const PDF_PAGE_INFO_FILE = "pages.json";
const UPLOAD_TYPES = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
} as const;
type UploadType = keyof typeof UPLOAD_TYPES;
const UPLOAD_TYPE_BY_EXTENSION = new Map<string, UploadType>(
  Object.entries(UPLOAD_TYPES).map(([type, extension]) => [extension, type as UploadType]),
);
const UPLOAD_ERRORS = {
  tooLarge: "El archivo supera el límite de 20 MB.",
  unsupported: "Tipo de archivo no permitido. Sube PDF, PNG, JPEG o WebP.",
  pdfText: "No se pudo extraer el texto del PDF.",
  pdfPages: "No se pudieron generar las imágenes de las páginas del PDF.",
  storage: "No se pudo guardar el archivo en el vault.",
  filename: "Incluye un nombre de archivo válido en X-File-Name.",
  empty: "El archivo está vacío.",
  fuentes: "Las fuentes deben ser entre 1 y 5 archivos subidos válidos.",
  deducir: "El formato «deducir» requiere al menos una fuente.",
} as const;
/** The learning entry accepts a full syllabus; JSON escaping can use six bytes per source character. */
const MAX_LEARNING_SOURCE_CHARS = 200_000;
const MAX_LEARNING_SOURCE_BODY_BYTES = MAX_LEARNING_SOURCE_CHARS * 6 + 1024;

function safeUploadName(raw: string, type: UploadType): string {
  const leaf = basename(raw.replace(/\\/g, "/"));
  const extension = UPLOAD_TYPES[type];
  const suffix = type === "application/pdf" ? `${extension}.p${MAX_PDF_PAGES}.png` : extension;
  const stemLimit = 255 - Buffer.byteLength(suffix, "utf8");
  const cleanedStem = (extname(leaf) ? leaf.slice(0, -extname(leaf).length) : leaf)
    .normalize("NFKC")
    .replace(/[\\/]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  let safeStem = "";
  let safeStemBytes = 0;
  for (const character of cleanedStem) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (safeStemBytes + characterBytes > stemLimit) break;
    safeStem += character;
    safeStemBytes += characterBytes;
  }
  safeStem = safeStem.replace(/[.\\s]+$/g, "");
  return `${safeStem || "documento"}${extension}`;
}

function uploadedSources(root: string, raw: unknown): Array<{ path: string; textPath?: string; pagePaths?: string[]; pagesTruncated?: boolean }> {
  const invalid = () => new HttpError(400, UPLOAD_ERRORS.fuentes);
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) throw invalid();
  return raw.map((value) => {
    if (typeof value !== "string" || !/^[a-f0-9]{32}$/.test(value)) throw invalid();
    const directory = join(root, ".subidas", value);
    const containedDirectory = resolveContained(root, directory);
    if (!containedDirectory.ok || containedDirectory.targetReal !== directory) throw invalid();
    try {
      const entries = readdirSync(directory, { withFileTypes: true });
      const pdfFiles = entries.filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".pdf");
      const generatedPageNames = new Set(pdfFiles.length === 1
        ? Array.from({ length: MAX_PDF_PAGES }, (_, index) => `${pdfFiles[0].name}.p${index + 1}.png`)
        : []);
      const files = entries.filter((entry) =>
        entry.isFile() && UPLOAD_TYPE_BY_EXTENSION.has(extname(entry.name).toLowerCase()) && !generatedPageNames.has(entry.name),
      );
      if (files.length !== 1) throw invalid();
      const path = join(directory, files[0].name);
      const containedFile = resolveContained(root, path);
      if (!containedFile.ok || containedFile.targetReal !== path) throw invalid();
      if (UPLOAD_TYPE_BY_EXTENSION.get(extname(path).toLowerCase()) !== "application/pdf") return { path };
      const textPath = `${path}.txt`;
      const containedText = resolveContained(root, textPath);
      if (!containedText.ok || containedText.targetReal !== textPath || !statSync(textPath).isFile()) throw invalid();
      const pageNumbers = entries
        .filter((entry) => entry.isFile() && generatedPageNames.has(entry.name))
        .map((entry) => Number(entry.name.slice(`${basename(path)}.p`.length, -".png".length)))
        .sort((left, right) => left - right);
      if (!pageNumbers.length || pageNumbers.some((page, index) => page !== index + 1)) throw invalid();
      const pagePaths = pageNumbers.map((page) => {
        const pagePath = `${path}.p${page}.png`;
        const containedPage = resolveContained(root, pagePath);
        if (!containedPage.ok || containedPage.targetReal !== pagePath || !statSync(pagePath).isFile()) throw invalid();
        return pagePath;
      });
      const pageInfoPath = join(directory, PDF_PAGE_INFO_FILE);
      const containedPageInfo = resolveContained(root, pageInfoPath);
      if (!containedPageInfo.ok || containedPageInfo.targetReal !== pageInfoPath || !statSync(pageInfoPath).isFile()) throw invalid();
      const pageInfo = JSON.parse(readFileSync(pageInfoPath, "utf8")) as Record<string, unknown>;
      if (
        pageInfo.pdf !== basename(path) ||
        !Number.isSafeInteger(pageInfo.totalPages) || (pageInfo.totalPages as number) < pagePaths.length ||
        pageInfo.renderedPages !== pagePaths.length || pageInfo.renderedPages !== Math.min(pageInfo.totalPages as number, MAX_PDF_PAGES) ||
        pageInfo.truncated !== ((pageInfo.totalPages as number) > MAX_PDF_PAGES)
      ) throw invalid();
      return { path, textPath, pagePaths, pagesTruncated: pageInfo.truncated as boolean };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw invalid();
    }
  });
}
/** A draft preview is bounded like a saved note; the reader refuses anything longer. */
const DRAFT_MAX_CHARS = 200_000;
const MAX_PROMPT_CHARS = 20000;
/** A configured token keeps the shape of a generated one, so a weak secret is refused. */
const TOKEN_SHAPE = /^[a-f0-9]{64}$/;
/**
 * Notices the harness writes about its own plumbing (review authority, RDD
 * status, swarms). They are for the operator driving Pi, not for someone
 * studying: the chat keeps the tutor's notices and the studio log keeps these.
 */
const HARNESS_NOTICE = /^(?:gentle\s*ai|el\s+gentleman|gentle-ai)\b/i;
const DIALOG_METHODS = new Set(["select", "confirm", "input", "editor"]);
/**
 * A local studio nobody has open is a studio and a Pi child nobody asked for: it waits this
 * long with no page before closing itself. A deploy keeps its own uptime rules, so it is off
 * there unless `idleMinutes` says otherwise.
 */
export const DEFAULT_IDLE_MINUTES = 30;
/** How long a closing studio waits for Pi to end on its own before it is killed. */
const CHILD_EXIT_MS = 5000;
/** The slides' serif: Tinos is metric-compatible with the Liberation Serif the decks render with. */
const FONT_STYLESHEETS = [
  ["https://cdn.jsdelivr.net/npm/@fontsource/tinos@5.3.0/latin-400.css", "sha384-8zbxI8QzWEG4vEML31iP2/kJ3U7lZQKpjbhBQnsXSbyqwu2/5YmJNYnEi8S+uHyC"],
  ["https://cdn.jsdelivr.net/npm/@fontsource/tinos@5.3.0/latin-700.css", "sha384-SUULE/FwhRJnmmtZndNoCfOi2n/ydFO6ffMg4mDxNeSCspEHHiBdowU/a+tlFOlz"],
  ["https://cdn.jsdelivr.net/npm/@fontsource/tinos@5.3.0/latin-400-italic.css", "sha384-xtYZmcQDNPOcdvs9ioo/E0M7S86A02Sic6XambqSTnJv2cDk6aK6sIvH5RC60vOD"],
  ["https://cdn.jsdelivr.net/npm/@fontsource/tinos@5.3.0/latin-700-italic.css", "sha384-TLhjWwWSdMcdB920UnQtGVM74H/aTHtueKc1XkRABo3RSBzHj7NFnKLJMO/TXGGJ"],
];

export interface StudioOptions {
  root?: string;
  /** Pi command line; the default resumes the studio's own persistent conversation. */
  piCommand?: string[];
  agyCommand?: string[];
  /** Disable the tutor process and tutor actions; this is not a sandbox. */
  agentDisabled?: boolean;
  port?: number;
  publicOrigin?: string;
  bridgePublicOrigin?: string;
  bridgePort?: number;
  transcriberUrl?: string;
  transcriberToken?: string;
  enginePath?: string;
  /**
   * Base URL of the API provider the tutor talks to; a test or a local proxy points it elsewhere.
   * Default: the detected provider's own base, as the registry declares it.
   */
  apiBase?: string;
  /**
   * Where the provider's key is read from, presence only; never written anywhere. Default: the
   * studio's own environment.
   */
  apiEnv?: Record<string, string | undefined>;
  rulesPath?: string;
  /** A fixed 64-hex token, so restarts never invalidate an open tab; random per run when absent. */
  token?: string;
  /** When each topic was last opened; kept outside the vault. Default: the user's state directory. */
  openedFile?: string;
  /** The conversation index; kept outside the vault. Default: next to `openedFile`. */
  chatsFile?: string;
  /** Where the CDN libraries of saved parts are kept after the first download. Default: the user's cache directory. */
  offlineCacheDir?: string;
  /** Base command of the one-shot preliminary-glossary call; default: the configured tutor's CLI. */
  glosarioCommand?: string[];
  /** Bound of that one call; default: 60 s. It never holds a turn or a topic lock. */
  glosarioTimeoutMs?: number;
  /**
   * Skip the check that the tutor's deployed instructions are this repo's own.
   * Only for tests that do not exercise it: the check is what keeps a drifted
   * deploy from teaching with another standard, so it is on by default.
   */
  skipContextCheck?: boolean;
  /** The home whose tutor links the context check reads. Default: the running user's. */
  contextHome?: string;
  /**
   * How a part the turn wrote is measured before the turn ends. Default: the repo's own
   * `scene-lint`, `deck-gate` and `explain-check`, run with the studio's Node.
   */
  partChecks?: (files: string[]) => Promise<PartChecks>;
  /** Override explain-check for deterministic tests. */
  gateToolPath?: string;
  /**
   * Minutes with nobody watching before the studio closes itself and its Pi child; `0`
   * turns it off. Default: `DEFAULT_IDLE_MINUTES` locally, off for a deploy (#183).
   */
  idleMinutes?: number;
}

export interface Studio {
  url: string;
  port: number;
  close: () => Promise<void>;
  /**
   * Resolves once the studio closed because nobody had it open; it never settles while the
   * window is off, nor while a page or a turn holds the studio.
   */
  whenIdleClosed: Promise<void>;
}


type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** The text parts of a Pi message, joined. */
function messageText(message: unknown): string {
  if (!isRecord(message)) return "";
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is Json => isRecord(c) && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");
}

/** A short Spanish label of what the tutor is doing, from one tool call. */
function toolLabel(name: string, args: unknown): string {
  const a = isRecord(args) ? args : {};
  const file = typeof a.path === "string" ? basename(a.path) : "";
  switch (name) {
    case "write":
      return `Escribiendo ${file || "un archivo"}`;
    case "edit":
      return `Editando ${file || "un archivo"}`;
    case "read":
      return `Leyendo ${file || "un archivo"}`;
    case "learning_stage":
      return `Motor: ${[a.action, a.stage].filter(Boolean).join(" ")}`;
    case "learning_view":
      return "Preparando la vista";
    case "ask_user_choice":
    case "ask_user_question":
      return "Preguntándote";
    case "subagent_run":
      return `Builder: ${typeof a.label === "string" ? a.label : "trabajando"}`;
    case "bash":
      return "Ejecutando un comando";
    default:
      return name;
  }
}

/**
 * The one tutor turn the studio has accepted and not yet decided against the engine. A turn is only
 * decided against the engine when it names a topic, and a correction is never a learner's turn.
 */
type Turn = {
  topic: string | null;
  correction: boolean;
  /** A new deep-mode request whose topic does not exist yet: the first topic folder it writes. */
  creation?: boolean;
  /**
   * The course the request named for the topic it is about to create: the topic joins it the moment
   * it is bound, so the turn that plans its route already reads the material (#407/T2b).
   */
  materia?: string;
  /**
   * A regeneration's previous version, waiting in `.papelera`: the new one replaces it only after
   * passing every gate. The same turn carries it through its corrections, so every exit knows what
   * to put back.
   */
  regeneration?: {
    trash: string;
    moved: string[];
    part?: string;
    passed?: boolean;
    reason?: string;
  };
  /**
   * The part files this turn wrote or edited, in order, each file once (a part's note and its page apart): what the
   * studio measures itself before the turn is offered as done. A turn that wrote no part owes no measurement.
   */
  parts: string[];
  /**
   * The method the engine had recorded for the topic when the turn started, read from its state file; `null`
   * when that could not be read. The guard blames this turn only for a method the turn itself changed (#314).
   */
  methodBefore: string | null;
  /**
   * What each phase of this turn cost and how many times the tutor was called: the data of the
   * report the studio writes when the turn ends. It only reads the turn; it never changes it.
   */
  timing: PageTiming;
  /**
   * What the studio's own measurement said about the part this turn had to produce (#452).
   * `undefined` means no part was owed and `crashed` means nothing could measure it: neither is a
   * part the studio may present as finished. Only `clean` is.
   */
  partVerdict?: PartChecks;
  /**
   * How the part this turn owed looked before the turn started (#452). A part the turn did not
   * change is not this turn's to measure: its findings are the note's, never this turn's failure.
   */
  expectedAtStart?: string | null;
  /** The topic writer ticket this turn inherited from its route, released when the turn ends. */
  lock?: { release: () => void } | null;
  lockPromise?: Promise<{ release: () => void }>;
  /** An aborted turn ends as failed, whatever the runtime reports afterwards. */
  aborted?: boolean;
  /**
   * A settle is already deciding this turn (#460). A runtime that reports its end twice, or a
   * correction whose own settle lands while the previous one is still asking for it, must not
   * decide the same turn again: the second decision reads a part the first one is still writing
   * and rolls back a regeneration that did write.
   */
  settling?: boolean;
  /**
   * This turn already used its one explicit correction for a part that was not written or that
   * the gates rejected; a second failure rolls back instead of asking again (#393).
   */
  partCorrectionSent?: boolean;
  /** Corrections this turn has received so far, from the engine, the gates or the explicit one (#393). */
  correctionsSent?: number;
  /**
   * The first text the tutor wrote this turn and the id the page knows it by. A studio verdict about the
   * turn is placed above it, live and in the saved thread (#393).
   */
  tutorMessage?: ChatMessage;
  tutorId?: string;
  /** The write-part turn the waiting section follows, with the clock its phase events use. */
  espera?: {
    topic: string;
    part: string;
    note: string | null;
    startedAt: number;
    emitted: Set<string>;
  };
};

/** One main-chat Session plus one per topic task: each owns its process and its in-flight turn. */
type Session = {
  id: string;
  topic: string | null;
  kind: "main" | "task";
  child?: ChildProcessWithoutNullStreams;
  agy?: ReturnType<typeof createAgy>;
  /** The API runtime: same surface as `agy`, no resident process and no conversation to reopen. */
  api?: ReturnType<typeof createApi>;
  agyTurns: Array<{ role: "user" | "assistant"; text: string }>;
  alive: boolean;
  ready: Promise<void>;
  turn: Turn | null;
  turnTopic: string | null;
  tema: string | null;
  gateBlocked: boolean;
  settleGate: ReturnType<typeof createSettleGate>;
  nextId: number;
  assistantSeq: number;
  assistantId: string;
  waiting: Map<string, (record: Json) => void>;
  toolArgs: Map<string, unknown>;
  dialogs: Map<string, Json>;
  transcript: ChatMessage[];
  interrupted: InterruptedTurn | null;
  /** The file a deploy reads; each session also has its own entry in the busy directory. */
  busyMarker: string;
  conversationFile: string;
  activity: string;
  status: TaskState;
  /** The tutor changed while this session was working: replace its runtime before the next turn. */
  stale: boolean;
  agyConversation: string | null;
  emit: (event: string, data: unknown) => void;
  state: () => Record<string, unknown>;
  saveSnapshot: () => void;
  remember: (message: ChatMessage) => void;
};

/** The learner reads this when the studio refuses a second turn: one turn at a time, studio-wide. */
const TURN_ACTIVE = "El tutor está trabajando; espera a que termine.";

/** A path that really lives inside the vault: no absolute path, no `..`, never the root itself. */
const insideVault = (root: string, file: string): boolean => {
  const rel = relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** Where a verdict about a turn goes: above the first text the tutor wrote that turn, or last when it wrote none (#393). */
const aboveTutor = (turn: Turn | null | undefined): { before?: string } => (turn?.tutorId ? { before: turn.tutorId } : {});

/**
 * Moves what a failed regeneration wrote out of the library without deleting it: it waits in the
 * trash beside the previous version, so a hand can still read what the tutor produced. The reason it
 * did not pass is written beside the moved files, even when the tutor wrote none (#314).
 */
function quarantineRegeneration(root: string, files: string[], folderRel: string, reason: string): number {
  const moved: string[] = [];
  for (const file of files) {
    if (!existsSync(file) || !insideVault(root, file)) continue;
    const rel = relative(root, file);
    const target = join(root, folderRel, rel);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(file, target);
    moved.push(rel);
  }
  mkdirSync(join(root, folderRel), { recursive: true });
  writeFileSync(
    join(root, folderRel, "papelera.json"),
    `${JSON.stringify({ kind: "regeneracion-fallida", at: new Date().toISOString(), moved, reason }, null, 2)}\n`,
  );
  return moved.length;
}

/**
 * Puts the previous version back from the trash: every path the backup moved, the learner's answers included, so
 * a regeneration that does not pass leaves the part exactly as it was (#316, #416). Returns false when there was
 * nothing to restore.
 */
export function restoreRegeneration(
  root: string,
  regeneration: { trash: string; moved: string[] },
): boolean {
  if (!regeneration.trash) return false;
  let restored = false;
  for (const rel of regeneration.moved) {
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    const source = join(root, regeneration.trash, rel);
    if (!existsSync(source)) continue;
    const target = join(root, rel);
    if (!insideVault(root, target)) continue;
    // A symlink where the file goes would carry the copy outside the vault: the backup refuses to
    // move one, and the restore must refuse to write through one (#416).
    try {
      if (lstatSync(target).isSymbolicLink()) {
        process.stderr.write(`estudio: no restauro ${rel}, es un enlace simbólico\n`);
        continue;
      }
    } catch { /* nothing there yet: a plain file */ }
    // What was written during the turn is not thrown away to make room: it waits in the trash beside
    // the version that replaces it, so an answer given while the regeneration ran is still readable.
    if (existsSync(target)) {
      const aside = join(root, regeneration.trash, "rechazada", rel);
      mkdirSync(dirname(aside), { recursive: true });
      copyFileSync(target, aside);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    restored = true;
  }
  return restored;
}

/**
 * The last regeneration of each part, in the studio's own state directory (never in the vault):
 * a part that was rolled back says so until a later regeneration replaces it (#393).
 */
type RegenerationMarks = Record<string, { at: string; reason: string }>;

function readRegenerationMarks(file: string): RegenerationMarks {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const marks: RegenerationMarks = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.at === "string" && typeof entry.reason === "string") marks[key] = { at: entry.at, reason: entry.reason };
    }
    return marks;
  } catch {
    return {};
  }
}

/** One part's last regeneration: a failure is remembered, a success forgets the failure. */
function markRegeneration(file: string, topic: string, part: string, reason: string | null): void {
  const key = `${topic}/${part}`;
  const marks = readRegenerationMarks(file);
  if (reason === null) {
    if (!(key in marks)) return;
    delete marks[key];
  } else {
    marks[key] = { at: new Date().toISOString(), reason };
  }
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(marks, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* nothing to clean */ }
    process.stderr.write(`estudio: no se pudo guardar el estado de la regeneración · ${(error as Error).message}\n`);
  }
}

/**
 * One part's last measurement, keyed by the bytes it measured (#452): a part that changed since
 * then is not covered by it, and a part nobody measured carries no mark at all.
 */
export type PartGateMark = { bytes: string; count: number; rules: string[] };

function readPartGateMarks(file: string): Record<string, PartGateMark> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const marks: Record<string, PartGateMark> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as Record<string, unknown>;
      const rules = Array.isArray(entry.rules) ? entry.rules.filter((rule): rule is string => typeof rule === "string") : null;
      if (typeof entry.bytes === "string" && typeof entry.count === "number" && rules !== null) {
        marks[key] = { bytes: entry.bytes, count: entry.count, rules };
      }
    }
    return marks;
  } catch {
    return {};
  }
}

/** One part's last measurement: a failing one is remembered, a passing one forgets it (#452). */
function markPartGate(file: string, key: string, mark: PartGateMark | null): void {
  const marks = readPartGateMarks(file);
  if (mark === null) {
    if (!(key in marks)) return;
    delete marks[key];
  } else marks[key] = mark;
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(marks, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* nothing to clean */ }
    process.stderr.write(`estudio: no se pudo guardar la medida de la parte · ${(error as Error).message}\n`);
  }
}

/** A note the studio can open: a part, diagnosis, or quick note. */
export type Note = { topic: string; index: number } | { topic: string; diagnosis: true } | { quick: string };

/**
 * `explicaciones/Parte N - <slug>.md` (or its rich `.html` page) inside a topic folder, or
 * `<topic>/quiz.md`, or `rapidos/<id>.md`: the studio can open that note. With the Learnings
 * `root`, only paths at the reader's exact depth count: `<root>/<topic>/quiz.md`,
 * `<root>/rapidos/<id>.md`, and `<root>/<topic>/explicaciones/Parte N - <slug>.(md|html)`.
 */
export function noteFromPath(path: unknown, root?: string): Note | null {
  if (typeof path !== "string") return null;
  const inRoot = root === undefined ? path : relative(root, resolve(root, path));
  if (root !== undefined && (inRoot.startsWith("..") || isAbsolute(inRoot))) return null;
  const segments = inRoot.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  if (root !== undefined && segments.length !== (segments[0] === "rapidos" || segments.at(-1) === "quiz.md" ? 2 : 3)) return null;
  if (segments.at(-2) === "rapidos") {
    const quick = /^([\w-]+)\.md$/.exec(segments.at(-1) ?? "");
    return quick === null ? null : { quick: quick[1] };
  }
  // `<topic>/quiz.md` is the diagnosis the first deep turn writes. A `quiz.md` nested in a
  // topic's own folders is not it: the diagnosis sits at the topic's root, beside its plan.
  const parent = segments.at(-2);
  if (segments.at(-1) === "quiz.md" && parent !== undefined && parent !== "explicaciones") return { topic: parent, diagnosis: true };
  const folder = segments.lastIndexOf("explicaciones");
  const topic = folder < 1 ? undefined : segments[folder - 1];
  if (topic === undefined) return null;
  const name = /^Parte (\d+) - .+\.(md|html)$/.exec(segments[folder + 1] ?? "");
  const index = name === null ? 0 : Number(name[1]);
  return index < 1 ? null : { topic, index };
}

/**
 * A reply the learner can act on. A tutor that cannot see the page hands a note over as a `file://`
 * URL, which opens nothing in a studio served over https. A link to a part note becomes the studio's
 * own route (`#/leer/<topic>/<part>`, what «Ir a Parte N» opens); any other filesystem link keeps
 * its words and loses the URL, because a path the browser cannot open is not a link.
 */
export function studioLinks(text: string, root?: string): string {
  if (!text.includes("file:")) return text;
  const route = (target: string): string | null => {
    let path: string;
    try {
      path = fileURLToPath(target);
    } catch {
      return null;
    }
    const note = noteFromPath(path, root);
    if (note === null) return null;
    if ("quick" in note) return `#/rapido/${encodeURIComponent(note.quick)}`;
    if ("diagnosis" in note) return `#/leer/${note.topic}/quiz`;
    // The part's id comes from the plan, never from the file name: the page routes by id.
    let part: string | undefined;
    try {
      part = readPlan(join(root ?? ".", note.topic))?.parts[note.index - 1]?.id;
    } catch {
      return null;
    }
    return part === undefined ? null : `#/leer/${note.topic}/${part}`;
  };
  const name = (target: string): string => {
    const last = target.split("/").pop() ?? target;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  };
  return text
    .replace(/\[([^\]\n]*)\]\(\s*(file:[^)\s]+)\s*\)/g, (_whole, words: string, target: string) => {
      const to = route(target);
      return to === null ? words.trim() || name(target) : `[${words.trim() || name(target)}](${to})`;
    })
    .replace(/(^|[\s(<])file:\/\/[^\s<>)"'\]]+/g, (whole, before: string) => {
      // The URL is the match without the character that opened the line or the bracket.
      const target = whole.slice(before.length);
      return `${before}${route(target) ?? name(target)}`;
    });
}

/**
 * The topic folder a path lies in: `<root>/<topic>/...`, any file of it. Quick notes and hidden
 * folders belong to no topic. Without a root the first folder is the topic.
 */
export function topicFromPath(path: unknown, root?: string): string | null {
  if (typeof path !== "string") return null;
  const inRoot = root === undefined ? path : relative(root, resolve(root, path));
  if (root !== undefined && (inRoot.startsWith("..") || isAbsolute(inRoot))) return null;
  const segments = inRoot.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  const topic = segments[0];
  if (segments.length < 2 || topic === undefined || topic === "rapidos" || topic.startsWith(".")) return null;
  return topic;
}

/** The topic a write or edit worked on, so the end of the turn can offer its next step. */
function toolTopic(name: string, args: unknown, root?: string): string | null {
  if (name !== "write" && name !== "edit") return null;
  return isRecord(args) ? topicFromPath(args.path, root) : null;
}

/** The note a write or edit produced, when the tutor is working on a part of a topic. */
function toolNote(name: string, args: unknown, root?: string): Note | null {
  if (name !== "write" && name !== "edit") return null;
  return isRecord(args) ? noteFromPath(args.path, root) : null;
}

/**
 * The last part note the conversation wrote or edited: a reloaded tab still knows which note the
 * tutor was talking about, so the chat keeps the way back to it.
 */
export function noteFromMessages(messages: unknown, root?: string): Note | null {
  if (!Array.isArray(messages)) return null;
  let found: Note | null = null;
  for (const message of messages) {
    if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!isRecord(part) || part.type !== "toolCall") continue;
      const note = toolNote(String(part.name), part.arguments, root);
      if (note !== null) found = note;
    }
  }
  return found;
}

/**
 * The idle window, in minutes: `DEFAULT_IDLE_MINUTES` with nobody watching a local studio, off
 * for a deploy (`publicOrigin` set), because a deploy has its own uptime rules. `0` disables it.
 */
export function idleMinutesFor(options: { idleMinutes?: number; publicOrigin?: string }): number {
  if (options.idleMinutes !== undefined) {
    if (!Number.isFinite(options.idleMinutes) || options.idleMinutes < 0) {
      throw new Error("idleMinutes must be a number of minutes, 0 to disable it");
    }
    return options.idleMinutes;
  }
  return options.publicOrigin === undefined ? DEFAULT_IDLE_MINUTES : 0;
}

/**
 * A studio that closes never leaves its Pi behind (#183): SIGTERM, a bounded wait for the exit,
 * and only a child that ignored it is killed. The caller clears `child` first, so this exit is
 * the studio's own close and not a runtime that died mid-turn.
 */
async function stopChild(proc: ChildProcessWithoutNullStreams): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  proc.kill();
  await Promise.race([exited, new Promise<void>((resolve) => { setTimeout(resolve, CHILD_EXIT_MS).unref(); })]);
  if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
}

export async function startStudio(options: StudioOptions = {}): Promise<Studio> {
  if ((options.transcriberUrl !== undefined) !== (options.transcriberToken !== undefined)) {
    throw new Error("transcriberUrl and transcriberToken must be set together");
  }
  if ((options.publicOrigin !== undefined) !== (options.bridgePublicOrigin !== undefined)) {
    throw new Error("publicOrigin and bridgePublicOrigin must be set together");
  }
  const publicOrigins = parsePublicOrigins("publicOrigin", options.publicOrigin);
  parsePublicOrigins("bridgePublicOrigin", options.bridgePublicOrigin);
  if (!options.root) throw new Error(ROOT_UNSET);
  const contained = resolveContained(options.root, options.root);
  if (!contained.ok) throw new Error(contained.reason);
  if (options.token !== undefined && !TOKEN_SHAPE.test(options.token)) throw new Error("token must be 64 lowercase hex characters");
  const root = contained.rootReal;
  let tutor = readTutor(root);
  /** Bumped on every tutor change so work started for an old runtime cannot speak for the new one. */
  let tutorGeneration = 0;
  /** Every task gets its own Pi session id; the main chat keeps the one it always had. */
  const piCommand = (topic?: string | null): string[] => {
    const base = options.piCommand ?? ["pi", "--mode", "rpc"];
    if (topic) {
      const args = [...base];
      const at = args.indexOf("--session-id");
      if (at >= 0) args[at + 1] = `tarea-${topic}`;
      else args.push("--session-id", `tarea-${topic}`);
      return args;
    }
    if (options.piCommand) return base;
    return [...base, "--session-id", "estudio", ...(tutor.modelo ? ["--model", tutor.modelo] : []), ...(tutor.pensamiento ? ["--thinking", tutor.pensamiento] : [])];
  };
  const enginePath = options.enginePath ?? join(REPO, "bin", "learning");
  const rulesPath = options.rulesPath ?? join(REPO, "rules", "deep.json");
  const token = options.token ?? randomBytes(32).toString("hex");
  const openedFile = options.openedFile ?? join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "learning-studio", "opened.json");
  /** Outside the vault, beside `opened.json`: the glossary cache and its one short call. */
  const newGlosario = () => createGlosario({
    root, stateDir: dirname(openedFile), config: tutor,
    command: options.glosarioCommand, timeoutMs: options.glosarioTimeoutMs,
  });
  let glosario = newGlosario();
  const gateStoreFile = gateVerdictsFile(root);
  const chatsFile = options.chatsFile ?? join(dirname(openedFile), "chats.json");
  /** The learner's conversations; the active one is the session the tutor talks in. */
  let chats: ChatDoc = readChats(chatsFile);
  // The list always holds the conversation the studio already had, whatever the runtime.
  if (!chats.chats.some((chat) => chat.id === chats.activo)) {
    chats = chats.chats.length === 0 ? createChat(chats, { nombre: "Chat general" }).doc : { ...chats, activo: chats.chats[0].id };
    chats = saveChats(chatsFile, chats);
  }
  // The deploy reads the idle marker without a token; the conversation copy is what a
  // restart comes back to when the runtime's session is gone. Both live next to `opened.json`.
  const busyMarker = busyFile(openedFile);
  const conversationFile = snapshotFile(openedFile);
  const busyTracker = createBusyTracker(openedFile);
  const locks = createTopicLocks();
  /**
   * The course links a creation turn still owes. A topic is born inside its course, so the delivery
   * for that topic waits for the link before it reads the material (#407/T2b); a link that fails is
   * the studio's own log line and never the turn's.
   */
  const enlacesDeMateria = new Map<string, Promise<void>>();
  const unirAMateria = (materia: string, topic: string): void => {
    const enlace: Promise<void> = linkTema(root, materia, topic).then(
      () => undefined,
      (error) => {
        process.stderr.write(`estudio: no se pudo unir «${topic}» a su materia · ${(error as Error).message}\n`);
      },
    );
    enlacesDeMateria.set(topic, enlace);
    void enlace.then(() => {
      if (enlacesDeMateria.get(topic) === enlace) enlacesDeMateria.delete(topic);
    });
  };
  const taskConversationFile = taskConversationsFile(chatsFile);
  /** The last regeneration verdict per part, outside the vault: the topic view reads it (#393). */
  const regenerationMarksFile = join(dirname(openedFile), "regeneraciones.json");
  /** The last measurement of each part, keyed by the bytes it measured: what the studio may serve (#452). */
  const partGateMarksFile = join(dirname(openedFile), "partes-medidas.json");
  /** One Session for the main chat, one per topic: a map, never a global limit. */
  const tasks = new Map<string, Session>();
  const taskClients = new Map<string, Set<ServerResponse>>();
  const allTaskClients = new Set<ServerResponse>();
  const taskView = (session: Session): TaskView => ({
    topic: session.topic ?? session.id,
    state: taskState(session),
    activity: session.activity,
    queued: session.topic === null ? 0 : locks.queued(session.topic),
  });
  const taskViews = (): TaskView[] => [...tasks.values()].map(taskView).sort((a, b) => a.topic.localeCompare(b.topic));
  const emitTareas = () => {
    const frame = `event: tareas\ndata: ${JSON.stringify({ tareas: taskViews() })}\n\n`;
    for (const res of clients) res.write(frame);
    for (const res of allTaskClients) res.write(frame);
  };
  const offlineCacheDir = options.offlineCacheDir ?? join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "learning-studio", "cdn");
  let port = 0;

  // ---- Server-Sent Events ------------------------------------------------
  const clients = new Set<ServerResponse>();
  const emit = (event: string, data: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  };
  // Background embeddings publish their progress on the same stream as the turns.
  progresoIndice((evento) => emit("indice", evento));
  /** Task frames are written to a task stream and always name the topic; main frames never do. */
  const emitTask = (topic: string, event: string, data: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify({ ...(isRecord(data) ? data : {}), task: topic })}\n\n`;
    const group = taskClients.get(topic);
    for (const res of group ?? []) res.write(frame);
    // A topic stream is in both sets: the global set is only for streams with no topic filter.
    for (const res of allTaskClients) if (!group?.has(res)) res.write(frame);
  };

  /**
   * Live progress of a write-part turn, derived from the tool events the studio
   * already receives. `t` is milliseconds since the turn began.
   */
  const emitFase = (session: Session, turn: Turn, fase: string, hallazgos?: number, once = false) => {
    const target = turn.espera;
    // `lista` is emitted from releaseTurn, after the turn has already been let go.
    if (!target || (session.turn !== turn && fase !== "lista")) return;
    if (once && target.emitted.has(fase)) return;
    target.emitted.add(fase);
    session.emit("fase", {
      type: "fase",
      topic: target.topic,
      part: target.part,
      fase,
      ...(hallazgos === undefined ? {} : { hallazgos }),
      t: Math.max(0, Date.now() - target.startedAt),
    });
  };

  const taskState = (session: Session): TaskState => {
    const queued = session.topic === null ? 0 : locks.queued(session.topic);
    if (session.turn) {
      if (queued > 0) return "waiting";
      if (session.dialogs.size > 0) return "asking";
      return "working";
    }
    // A task waiting for the main chat's writer is visible even before it owns a turn (S5).
    if (queued > 0) return "waiting";
    return session.status;
  };
  const stateOf = (session: Session): Record<string, unknown> => ({
    busy: session.turn !== null,
    alive: session.alive,
    tema: session.turnTopic,
    ...(session.kind === "task" ? { estado: taskState(session), activity: session.activity, queued: locks.queued(session.topic ?? "") } : {}),
  });

  /** A session owns its process, its turn, its dialogs, its transcript and its busy entry. */
  function createSession(spec: { id: string; kind: "main" | "task"; topic?: string | null }): Session {
    const file = spec.kind === "main" ? conversationFile : sessionSnapshotFile(openedFile, spec.id);
    const session: Session = {
      id: spec.id,
      topic: spec.kind === "task" ? spec.id : null,
      kind: spec.kind,
      agyTurns: [],
      alive: false,
      ready: Promise.resolve(),
      turn: null,
      turnTopic: null,
      tema: null,
      gateBlocked: false,
      settleGate: createSettleGate(),
      nextId: 0,
      assistantSeq: 0,
      assistantId: "",
      waiting: new Map(),
      toolArgs: new Map(),
      dialogs: new Map(),
      transcript: [],
      interrupted: null,
      busyMarker,
      conversationFile: file,
      activity: "Preparado",
      status: "done",
      stale: false,
      agyConversation: null,
      emit: (_event, _data) => {},
      state: () => ({}),
      saveSnapshot: () => {},
      remember: (_message) => {},
    };
    // Only a copy whose writer is gone: a studio that is still running keeps its own. A topic's copy comes
    // back as well, so the verdict its regeneration left survives a restart (#393).
    const copied = readRestartSnapshot(file, spec.kind === "main" ? chats.activo : `tarea:${spec.id}`);
    if (copied) {
      session.transcript = copied.messages;
      if (spec.kind === "main") session.interrupted = copied.interrupted;
      // Antigravity's thread is built from the studio's own turns, so a topic's copy rebuilds those too.
      else session.agyTurns = copied.messages.flatMap((message) => (message.role === "studio" ? [] : [{ role: message.role, text: message.text }]));
    }
    session.emit = (event, data) => {
      if (session.kind === "main") emit(event, data);
      else emitTask(session.id, event, data);
    };
    session.state = () => stateOf(session);
    session.saveSnapshot = () => saveSnapshotFile(file, {
      version: 1,
      chat: session.kind === "main" ? chats.activo : `tarea:${session.id}`,
      pid: process.pid,
      messages: session.transcript,
      interrupted: session.interrupted,
    });
    session.remember = (message) => {
      session.transcript.push(message);
      session.saveSnapshot();
    };
    return session;
  }
  /** The chat the learner sees: its behaviour, frames and one-turn rule stay where they were. */
  const main = createSession({ id: "main", kind: "main" });

  // ---- Idle exit ---------------------------------------------------------
  /**
   * A studio nobody has open is a studio and a Pi child nobody asked for (#183): after the idle
   * window with no `/events` client it closes itself and its tutor. Nothing closes while a turn
   * is in flight, while the busy marker names one, or while the page is still connected.
   */
  const idleMs = idleMinutesFor(options) * 60_000;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let shuttingDown = false;
  let announceIdle = () => {};
  /** Resolves once the studio closed because nobody had it open; never when the window is off. */
  const whenIdleClosed = new Promise<void>((resolve) => { announceIdle = resolve; });
  /** What holds a studio open with no page on it: a message stream, a turn, or a marker a deploy wrote. */
  const idleHeld = () => clients.size > 0 || taskClients.size > 0 || busyTracker.held();
  /** A page or a turn took over: the countdown starts again when it lets go. */
  const holdIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  const armIdle = () => {
    holdIdle();
    if (shuttingDown || idleMs <= 0) return;
    const timer = setTimeout(() => void idleExit(), idleMs);
    // A countdown is never the reason a process stays up: the server and Pi already are.
    // SAFETY: under Node this handle is a `Timeout`, which has `unref`; the inferred DOM
    // lib types it as a number, so the call is made optional instead of retyped.
    (timer as unknown as { unref?: () => void }).unref?.();
    idleTimer = timer;
  };
  const idleExit = async () => {
    idleTimer = undefined;
    if (shuttingDown) return;
    // The window passing is not the whole rule: what holds the studio is asked once more here.
    if (idleHeld()) {
      armIdle();
      return;
    }
    await close();
    announceIdle();
  };

  const handle = (record: Json, session: Session) => {
    const type = record.type;
    if (type === "response" && typeof record.id === "string" && session.waiting.has(record.id)) {
      session.waiting.get(record.id)!(record);
      session.waiting.delete(record.id);
      return;
    }
    const chatId = () => session.kind === "main" ? chats.activo : `tarea:${session.id}`;
    const changed = () => { if (session.kind === "task") emitTareas(); };
    switch (type) {
      case "agent_start":
        return;
      case "agent_settled": {
        session.toolArgs.clear();
        // The call the studio was waiting for is over: its time is the runtime's own work, and what
        // follows (the engine's verdict, the part's checks) is the studio's own phase.
        session.turn?.timing.endCall(true);
        // Only the session Pi is in can report its usage, so it is read while it is active.
        if (!session.agy && session.kind === "main") void refreshContexto(session);
        session.emit("library_changed", {});
        // There is exactly one turn in flight per Session, so the settle always belongs to it. The
        // engine is the authority on whether it is over; a turn that teaches no topic simply ends.
        const settled = session.turn;
        if (!settled) return;
        if (!settled.topic) {
          // A Universitario request whose tutor wrote no topic folder has nothing to gate; the
          // learner is told instead of being left with a silent stop.
          if (settled.creation) session.emit("notice", { level: "warning", message: "El tutor no creó ningún tema todavía." });
          // A regeneration of a topic the engine does not track has nothing to check the part against.
          if (settled.regeneration) settled.regeneration.reason ??= "el tema no está inscrito en el motor de aprendizaje";
          releaseTurn(session, settled);
          return;
        }
        session.activity = "Revisando el motor";
        changed();
        void settleTurn(session, settled);
        return;
      }
      case "message_start": {
        const message = record.message;
        if (isRecord(message) && message.role === "user") {
          // The studio's blocks travel inside the turn's prompt; the chat shows what the learner
          // wrote, so they are stripped before it is ever served as their message.
          const text = stripGustos(stripTema(stripLecciones(messageText(message))));
          // The gate's instruction is the studio's prompt, never the learner's own words.
          if (isStudioPrompt(text)) return;
          if (text) {
            session.emit("user", { text });
            if (session.agy) session.agyTurns.push({ role: "user", text });
            session.remember({ role: "user", text });
            if (session.kind === "task") { session.activity = text.slice(0, 80); changed(); }
          }
        }
        if (isRecord(message) && message.role === "assistant") session.assistantId = `a${++session.assistantSeq}`;
        return;
      }
      case "message_update": {
        const ev = record.assistantMessageEvent;
        if (isRecord(ev) && ev.type === "text_delta" && typeof ev.delta === "string") {
          session.emit("assistant_delta", { id: session.assistantId, delta: ev.delta });
        }
        return;
      }
      case "message_end": {
        const message = record.message;
        if (isRecord(message) && message.role === "assistant") {
          // A tutor that was handed a `file://` URL hands it back: the reply carries the studio's own
          // route to the part instead, so the learner can open what the turn wrote (#248).
          const raw = messageText(message);
          const text = studioLinks(raw, root);
          // What the call answered, as the model produced it: the size of its own output, before the
          // studio rewrote a single link.
          if (raw && session.turn) session.turn.timing.addOutput(raw.length);
          if (text) session.emit("assistant_end", { id: session.assistantId, text });
          if (session.agy && text) session.agyTurns.push({ role: "assistant", text });
          if (text) {
            const tutorMessage: ChatMessage = { role: "assistant", text };
            // The first words the tutor writes this turn: a verdict about the turn is placed above them (#393).
            if (session.turn && !session.turn.tutorMessage) {
              session.turn.tutorMessage = tutorMessage;
              session.turn.tutorId = session.assistantId;
            }
            session.remember(tutorMessage);
          }
        }
        return;
      }
      case "tool_execution_start": {
        const name = String(record.toolName);
        const id = String(record.toolCallId);
        // The tool is part of the call in flight, whether the runtime is Pi or Antigravity.
        session.turn?.timing.startTool(id, name, record.args);
        session.toolArgs.set(id, record.args);
        const note = toolNote(name, record.args, root);
        const topic = toolTopic(name, record.args, root);
        const label = toolLabel(name, record.args);
        if (session.kind === "task") { session.activity = label; changed(); }
        session.emit("tool", { phase: "start", chat: chatId(), id: record.toolCallId, name: record.toolName, label, ok: true, ...(note === null ? {} : { note }), ...(topic === null ? {} : { topic }) });
        return;
      }
      case "tool_execution_end": {
        const name = String(record.toolName);
        const id = String(record.toolCallId);
        const args = record.args ?? session.toolArgs.get(id);
        session.toolArgs.delete(id);
        session.turn?.timing.endTool(id, record.isError !== true);
        const note = toolNote(name, args, root);
        const topic = toolTopic(name, args, root);
        // The part notes the turn wrote are measured at its settle: the studio knows them from the
        // tool events, so no file is guessed from the plan.
        if (session.turn && !record.isError && note !== null && "index" in note && typeof args === "object" && args !== null) {
          const path = (args as Json).path;
          if (typeof path === "string") {
            // A part's note and its page are two files: each is listed once and measured on its own (#265).
            const file = resolve(root, path);
            if (!session.turn.parts.includes(file)) session.turn.parts.push(file);
            // The first write of the part note is what the waiting section calls «escribiendo».
            if (session.turn.espera?.note === file) emitFase(session, session.turn, "escribiendo", undefined, true);
          }
        }
        // A Universitario request creates the topic its own writes name: the first folder the tutor
        // writes into becomes the held turn's topic, so the gate can ask the engine about it. The
        // writer ticket is taken here without blocking the tool result (L5).
        if (session.turn?.creation && session.turn.topic === null && !record.isError && topic !== null) {
          const started = session.turn;
          started.topic = topic;
          started.methodBefore = methodOf(topic);
          session.tema = topic;
          session.gateBlocked = false;
          const startedAt = session.interrupted?.at ?? Date.now();
          session.interrupted = { topic, at: startedAt };
          started.lockPromise = locks.acquire(topic);
          void started.lockPromise.then((ticket) => {
            if (session.turn === started) started.lock = ticket;
            else ticket.release();
            changed();
          });
          session.emit("state", session.state());
          busyTracker.mark(session.id, { pid: process.pid, startedAt, topic });
          session.saveSnapshot();
          // The topic is born inside the course the request named, before anything else is delivered.
          if (started.materia) unirAMateria(started.materia, topic);
        }
        session.emit("tool", { phase: "end", chat: chatId(), id: record.toolCallId, name: record.toolName, label: toolLabel(name, args), ok: !record.isError, ...(note === null ? {} : { note }), ...(topic === null ? {} : { topic }) });
        return;
      }
      case "extension_ui_request": {
        const method = String(record.method);
        if (DIALOG_METHODS.has(method) && typeof record.id === "string") {
          const dialog = {
            id: record.id,
            method,
            title: record.title ?? "",
            message: record.message ?? "",
            options: Array.isArray(record.options) ? record.options : [],
            placeholder: record.placeholder ?? "",
          };
          session.dialogs.set(record.id, dialog);
          session.emit("dialog", dialog);
          if (session.kind === "task") { session.activity = `Preguntándote: ${dialog.title || dialog.message || ""}`.trim(); changed(); }
        } else if (method === "notify" && typeof record.message === "string") {
          if (!HARNESS_NOTICE.test(record.message.trim())) session.emit("notice", { level: record.notifyType ?? "info", message: record.message });
          else process.stderr.write(`estudio: aviso del arnés fuera del chat · ${record.message}\n`);
        }
        return;
      }
    }
  };

  const startPi = (session: Session) => {
    const [cmd, ...args] = piCommand(session.topic);
    const proc = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, GENTLE_SHELL_INTERACTIVE_HOST: "1", LEARNING_SETTLE_GATE: "studio" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    session.child = proc;
    session.alive = true;
    let buffer = Buffer.alloc(0);
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      let nl: number;
      // JSONL framing: records end only at LF (never Unicode line separators).
      while ((nl = buffer.indexOf(0x0a)) >= 0) {
        const line = buffer.subarray(0, nl).toString("utf8").replace(/\r$/, "");
        buffer = buffer.subarray(nl + 1);
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (isRecord(record)) handle(record, session);
        } catch {
          // Not a protocol record; Pi reserves stdout for records.
        }
      }
    });
    proc.stderr.resume();
    proc.on("exit", () => {
      if (session.child !== proc) return;
      session.alive = false;
      for (const resolve of session.waiting.values()) resolve({ success: false, error: "Pi exited" });
      session.waiting.clear();
      for (const id of session.dialogs.keys()) session.emit("dialog_closed", { id });
      session.dialogs.clear();
      // A dead runtime cannot finish its turn: releasing it is what keeps nothing latched.
      if (session.turn) session.turn.aborted = true;
      releaseTurn(session);
      if (session.kind === "task") { session.status = "failed"; session.activity = "El tutor se detuvo"; emitTareas(); }
      session.emit("state", session.state());
      session.emit("error", { message: "El tutor se detuvo." });
    });
    proc.on("error", (err) => session.emit("error", { message: `No se pudo iniciar Pi: ${err.message}` }));
    session.emit("state", session.state());
  };

  const stopRuntime = (session: Session) => {
    const proc = session.child;
    session.child = undefined;
    if (proc) proc.kill();
    session.agy?.stop();
    session.agy = undefined;
    session.api?.stop();
    session.api = undefined;
    session.alive = false;
  };

  /** The API tutor: the provider's own endpoint, with tools and no resident process. */
  const startApiRuntime = (session: Session, config: TutorConfig) => {
    session.api = createApi({
      root,
      config,
      engine: enginePath,
      rulesPath,
      // Presence is read here and nowhere else; nothing writes a key to the vault or the page.
      env: options.apiEnv ?? process.env,
      base: options.apiBase,
      // A task's turn still tells the engine which topic it is working on.
      ...(session.kind === "task" ? { childEnv: { LEARNING_TASK_TOPIC: session.id } } : {}),
      onRecord: (record) => handle(record, session),
      onError: (message) => session.emit("error", { message }),
    });
    session.ready = Promise.resolve();
    session.alive = true;
    session.emit("state", session.state());
  };

  /** Starts the runtime a task will use; new settings only reach tasks that were idle at the change. */
  const startTaskRuntime = (session: Session) => {
    if (options.agentDisabled) return;
    session.stale = false;
    if (tutor.agente === "pi") {
      startPi(session);
      session.ready = Promise.resolve();
    } else if (tutor.agente === "agy") {
      const conversations = readTaskConversations(taskConversationFile);
      session.agyConversation = conversations.conversaciones[session.id] ?? null;
      session.agy = createAgy({
        command: options.agyCommand ?? ["agy"],
        cwd: root,
        config: tutor,
        onRecord: (record) => handle(record, session),
        onError: (message) => session.emit("error", { message }),
        onConversation: (id) => {
          session.agyConversation = id;
          saveTaskConversation(taskConversationFile, session.id, id);
        },
        env: { LEARNING_TASK_TOPIC: session.id },
      });
      if (session.agyConversation) session.agy.open(session.agyConversation);
      session.ready = Promise.resolve();
      session.alive = true;
      session.emit("state", session.state());
    } else {
      startApiRuntime(session, tutor);
    }
  };

  const missingRuntime = (session: Session) => !session.agy && !session.api && !(session.child && session.alive);

  /** The task for a topic is created on first use and then kept for the studio's lifetime. */
  const ensureTask = (topic: string): Session => {
    let session = tasks.get(topic);
    if (!session) {
      session = createSession({ id: topic, kind: "task", topic });
      session.agyConversation = readTaskConversations(taskConversationFile).conversaciones[topic] ?? null;
      tasks.set(topic, session);
      emitTareas();
    }
    return session;
  };

  const write = (session: Session, command: Json) => {
    // Learner-visible: the page shows these words, so they are the studio's Spanish.
    if (options.agentDisabled) throw new HttpError(503, "El tutor está desactivado.");
    if (!session.child || !session.alive) throw new HttpError(503, "El tutor no está en marcha.");
    session.child.stdin.write(`${JSON.stringify(command)}\n`);
  };

  const call = (session: Session, command: Json, timeoutMs = 30000): Promise<Json> =>
    new Promise((resolve, reject) => {
      const id = `s${++session.nextId}`;
      const timer = setTimeout(() => {
        session.waiting.delete(id);
        reject(new HttpError(504, `Pi did not answer ${command.type}`));
      }, timeoutMs);
      session.waiting.set(id, (record) => {
        clearTimeout(timer);
        resolve(record);
      });
      try {
        write(session, { ...command, id });
      } catch (err) {
        clearTimeout(timer);
        session.waiting.delete(id);
        reject(err);
      }
    });

  // ---- conversations (the main chat only) ----------------------------------
  /** The index is the list; every change is written before the browser hears about it. */
  const persist = (doc: ChatDoc): ChatDoc => {
    chats = saveChats(chatsFile, doc);
    return chats;
  };

  const activeChat = (): Chat | null => chats.chats.find((chat) => chat.id === chats.activo) ?? null;

  const chatIdOf = (body: unknown): string => {
    if (!isRecord(body) || typeof body.id !== "string") throw new HttpError(400, "id must be a string");
    return body.id;
  };

  /** The only session files the studio may delete are the ones Pi keeps for this folder. */
  const piSessionsRoot = () => process.env.PI_CODING_AGENT_SESSION_DIR || join(homedir(), ".pi", "agent", "sessions");

  /** Pi's own report of the session it is in: the file, and how full its context is. */
  const piStats = async (session: Session): Promise<{ file: string | null; contexto: ChatContexto | null }> => {
    if (!session.child || !session.alive) return { file: null, contexto: null };
    try {
      // A short bound: a runtime that cannot report its session must not stall a turn.
      const reply = await call(session, { type: "get_session_stats" }, 2500);
      const data = isRecord(reply.data) ? reply.data : {};
      const file = typeof data.sessionFile === "string" ? data.sessionFile : null;
      const usage = isRecord(data.contextUsage) ? data.contextUsage : null;
      // Right after a compaction Pi reports null until a fresh response measures the window.
      const contexto = usage && typeof usage.tokens === "number" && typeof usage.contextWindow === "number" && usage.contextWindow > 0
        ? {
            tokens: usage.tokens,
            ventana: usage.contextWindow,
            porcentaje: typeof usage.percent === "number" ? usage.percent : Math.round((usage.tokens / usage.contextWindow) * 100),
          }
        : null;
      return { file, contexto };
    } catch {
      return { file: null, contexto: null };
    }
  };

  /** The last usage Pi measured for the active chat, so the list shows how full it is. */
  const refreshContexto = async (session: Session) => {
    if (session.kind !== "main") return;
    const current = activeChat();
    if (!current) return;
    const stats = await piStats(session);
    if (stats.contexto) persist(recordContexto(chats, current.id, stats.contexto));
    emit("chats", chats);
  };

  /**
   * Opening a chat points the runtime at that chat's own conversation. A chat with
   * no handle yet starts one and records it, so the next open comes back to it.
   */
  const switchTo = async (chat: Chat) => {
    if (main.turn) throw new HttpError(409, TURN_ACTIVE);
    if (main.agy) {
      // Antigravity names its conversation per turn, so switching is choosing the id.
      main.agy.open(chat.agyConversation ?? undefined);
      return;
    }
    if (chat.piSession) {
      const reply = await call(main, { type: "switch_session", sessionPath: chat.piSession });
      if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi no quiso cambiar de conversación."));
      if (isRecord(reply.data) && reply.data.cancelled === true) throw new HttpError(409, "una extensión canceló el cambio de conversación.");
      return;
    }
    const reply = await call(main, { type: "new_session" });
    if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi no quiso abrir una conversación nueva."));
    const stats = await piStats(main);
    if (stats.file) persist(setPiSession(chats, chat.id, stats.file));
  };

  /** The copy belongs to the chat that is now active; the runtime serves this chat's thread. */
  const adoptConversation = async () => {
    main.transcript = [];
    main.interrupted = null;
    main.saveSnapshot();
    return rememberHistory();
  };

  const openConversation = async (id: unknown): Promise<ChatDoc> => {
    const chat = chatById(chats, id);
    if (chat.id === chats.activo) return chats;
    await switchTo(chat);
    const doc = persist(openChat(chats, chat.id));
    emit("history", await adoptConversation());
    emit("chats", doc);
    return doc;
  };

  const newConversation = async (input: { nombre: unknown; ambito?: unknown }): Promise<{ doc: ChatDoc; chat: Chat }> => {
    if (main.turn) throw new HttpError(409, TURN_ACTIVE);
    const { doc, chat } = createChat(chats, input);
    persist(doc);
    await switchTo(chat);
    emit("history", await adoptConversation());
    emit("chats", chats);
    return { doc: chats, chat };
  };

  /**
   * The conversation the studio already had becomes the first entry of the list, and
   * a later boot returns to the active chat's own session instead of the boot one.
   */
  const adoptBoot = async () => {
    // A tutor change settles this runtime's pending calls with "Tutor restarted". That is the
    // studio replacing its own runtime, never a failure the learner asked to hear about (#385).
    const generation = tutorGeneration;
    if (main.agy) return;
    const stats = await piStats(main);
    if (generation !== tutorGeneration) return;
    if (!main.alive) return;
    const current = activeChat();
    if (!current) return;
    // A restart boots the studio's own session; the active chat may be another one.
    const switched = Boolean(current.piSession && stats.file && current.piSession !== stats.file);
    if (!current.piSession && stats.file) persist(setPiSession(chats, current.id, stats.file));
    else if (switched) {
      try {
        await switchTo(current);
      } catch (error) {
        if (generation !== tutorGeneration) return;
        emit("error", { message: (error as Error).message });
      }
    }
    // The studio's own copy follows what the runtime serves, so a restart comes back to the
    // whole thread even when the runtime's session is gone.
    const shown = await rememberHistory();
    if (generation !== tutorGeneration) return;
    if (switched) emit("history", shown);
    emit("chats", chats);
  };

  /** Changing tutor never kills a task that is working: its next turn uses the new settings. */
  const startTutor = (config: TutorConfig) => {
    tutorGeneration += 1;
    releaseTurn(main);
    main.settleGate.reset();
    stopRuntime(main);
    for (const resolve of main.waiting.values()) resolve({ success: false, error: "Tutor restarted" });
    main.waiting.clear();
    tutor = config;
    glosario = newGlosario();
    for (const session of tasks.values()) {
      // A running task finishes on this runtime; the next turn replaces it with the new one.
      session.stale = true;
      if (session.turn) continue;
      stopRuntime(session);
      session.activity = "Actualizando al tutor";
    }
    if (config.agente === "pi") {
      startPi(main);
      main.ready = adoptBoot();
    } else if (config.agente === "api") {
      startApiRuntime(main, config);
    } else {
      main.agy = createAgy({
        command: options.agyCommand ?? ["agy"],
        cwd: root,
        config,
        onRecord: (record) => handle(record, main),
        onError: (message) => emit("error", { message }),
        // The id belongs to the chat that is talking, so it is recorded where it can be found again.
        onConversation: (id) => { if (activeChat()) persist(setAgyConversation(chats, chats.activo, id)); },
      });
      main.ready = Promise.resolve();
      main.alive = true;
      emit("state", main.state());
    }
    emitTareas();
  };

  /** A deep topic must be one the engine tracks; anything else would be tutored without a gate. */
  const requireTopic = (value: unknown): string => {
    if (typeof value !== "string" || !value) throw new HttpError(400, "El tema tiene que ser texto.");
    if (!listTopics(root).some((t) => t.id === value)) throw new HttpError(404, `No encuentro el tema «${value}».`);
    if (!enrolled(root, value)) throw new HttpError(400, `El tema «${value}» no está inscrito en el motor de aprendizaje.`);
    return value;
  };

  /**
   * The topic a delivery from the page teaches. Every submission the hosted view sends opens with
   * `[Vista HTML · <topic> · …]` and the bridge already validated that topic, so the studio reads it
   * from there. A delivery that names no enrolled topic is the general chat, and it is not gated.
   */
  const bridgeTopic = (text: string): string | null => {
    const named = /^\[Vista HTML · ([^·\]\n]+) ·/.exec(text)?.[1]?.trim() ?? "";
    return named && listTopics(root).some((topic) => topic.id === named) && enrolled(root, named) ? named : null;
  };

  /** The tutor's continuation once the page recorded the method: the instruction the push carried. */
  const methodPrompt = (metodo: string) =>
    `Learning engine: the learner chose the ${metodo} method. Plan the route now with that method (planificador.md and plan.json), ` +
    "validate and advance planning, then continue to part 1. The plan is yours: never show it or list future parts to the learner.\n\n" +
    VISUAL_CONTRACT_PROMPT;

  /**
   * The engine's own report on a topic: the call the library makes, so the gate and the library can
   * never describe the same topic differently, with the error handling that call already has.
   */
  const runGate = async (session: Session, topic: string) => {
    // The engine's own answer, even for a folder with no run yet: a topic a Universitario request
    // just created must still hear the engine's words ("run not initialized: …"), not a shortcut.
    const report = await engineReport(join(root, topic));
    const verdict = gateVerdict(report as GateReport);
    // A gate for a topic this Session already left says nothing about the one it is on.
    if (session.tema === topic) {
      session.gateBlocked = !verdict.passing;
      session.emit("gate", { tema: topic, ...verdict });
    }
    return { report, verdict };
  };

  /** One turn per Session at a time: the main chat keeps its own rule, tasks queue before this. */
  const requireNoTurn = (session: Session) => {
    if (session.turn) throw new HttpError(409, TURN_ACTIVE);
  };

  /** Holds a Session's turn and tells its stream the tutor is working. */
  const holdTurn = (session: Session, started: Turn) => {
    session.turn = started;
    session.turnTopic = started.topic;
    // Written before the runtime is asked to work: a deploy reads it, and a process that
    // dies leaves the turn marked so the next boot can say it was interrupted.
    const at = Date.now();
    session.interrupted = { topic: started.topic, at };
    busyTracker.mark(session.id, { pid: process.pid, startedAt: at, topic: started.topic });
    session.status = "working";
    session.activity = "Trabajando";
    session.saveSnapshot();
    session.emit("state", session.state());
    emitTareas();
  };

  // ---- the timing of a generation --------------------------------------------
  /**
   * One report per generation, inside the studio's own state directory (beside `opened.json`),
   * never in the vault: the page the tutor wrote is left exactly as it is. Each report is a whole
   * JSON document with the same shape, so two generations are compared by reading two files.
   */
  const pageTimingsDir = join(dirname(openedFile), "page-timings");
  const savePageTiming = (timing: PageTiming, parts: string[]) => {
    try {
      const written = parts.map((file) => ({
        // Inside the vault, never the absolute path of whoever ran the studio.
        path: relative(root, file),
        bytes: existsSync(file) ? statSync(file).size : 0,
      }));
      const report: PageTimingReport = timing.report(written);
      // A measurement must never end a turn the page already survived.
      mkdirSync(pageTimingsDir, { recursive: true });
      const base = `page-${report.startedAt.replace(/[:.]/g, "-")}`;
      let file = join(pageTimingsDir, `${base}.json`);
      for (let n = 2; existsSync(file); n += 1) file = join(pageTimingsDir, `${base}-${n}.json`);
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      renameSync(temporary, file);
    } catch (error) {
      process.stderr.write(`estudio: no se pudo escribir el reporte de tiempos · ${(error as Error).message}\n`);
    }
  };

  /**
   * Every exit of a turn goes through here: settled and decided, aborted, restarted, a dead runtime
   * or an engine call that could not answer. Nothing may leave a turn held.
   *
   * A release that resumes after an `await` names the turn it was called for (`owner`), so a settle
   * that finishes late can never release the turn the learner started after it. The writer ticket
   * the turn inherited is released here, never before its files are safe.
   */
  const releaseTurn = (session: Session, owner?: Turn) => {
    if (!session.turn) return;
    if (owner !== undefined && session.turn !== owner) return;
    const ended = session.turn;
    session.turn = null;
    session.interrupted = null;
    busyTracker.clear(session.id);
    ended.lock?.release();
    if (ended.lockPromise) void ended.lockPromise.then((ticket) => ticket.release());
    session.status = ended.aborted ? "failed" : "done";
    session.activity = ended.aborted ? "Turno detenido" : "Terminado";
    // A regeneration only replaces the previous version once it has passed. Every exit goes through
    // here, so an aborted, restarted or spent correction puts the reader back on the old part.
    if (ended.regeneration && !ended.regeneration.passed) {
      const regeneration = ended.regeneration;
      const label = `${ended.topic ?? "tema"}-${regeneration.part ?? "parte"}`.replace(/[^\w.-]/g, "-");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
      const folder = regeneration.trash || join(".papelera", `${stamp}__regeneracion-fallida__${label}`);
      const written = ended.parts.filter(
        (file) => insideVault(root, file) && (ended.topic === null || relative(root, file).split(/[\\/]/)[0] === ended.topic),
      );
      // Every rejection says why: the reason is kept beside the rejected files and the learner reads the same
      // words. An exit that named no reason (an abort, a restart, a dead runtime) says the turn ended early (#314).
      const why = regeneration.reason?.trim() || "el turno terminó antes de comprobar la parte";
      try {
        quarantineRegeneration(root, written, join(folder, "rechazada"), why);
      } catch (error) {
        process.stderr.write(`estudio: no se pudo apartar la versión rechazada · ${(error as Error).message}\n`);
      }
      // A copy back that throws is not a missing previous version: the chat says which one happened (#393).
      let restored = false;
      let restoreFailure: string | null = null;
      try {
        restored = restoreRegeneration(root, regeneration);
      } catch (error) {
        restoreFailure = (error as Error).message;
        process.stderr.write(`estudio: no se pudo restaurar la versión anterior · ${restoreFailure}\n`);
      }
      const sentence = /[.!?]$/.test(why) ? why : `${why}.`;
      const expected = partExpected(ended);
      // An unknown part reads as "La parte" on its own; a known one is named the way the plan names it.
      const subject = expected ? `La Parte ${expected.number} «${expected.title}»` : "La parte";
      const verdict = restored
        ? `${subject} NO se regeneró: ${sentence} Se mantiene la versión anterior.`
        : restoreFailure !== null
          ? `${subject} NO se regeneró: ${sentence} No se pudo restaurar la versión anterior: sigue guardada en la papelera.`
          : `${subject} NO se regeneró: ${sentence} Esta parte no tenía una versión anterior: no hay nada que mostrar.`;
      if (ended.topic) {
        // The topic view says the previous version is kept only when it is back; otherwise no rollback mark stays (#393).
        try { markRegeneration(regenerationMarksFile, ended.topic, regeneration.part ?? "parte", restored ? why : null); }
        catch (error) { process.stderr.write(`estudio: no se pudo guardar la regeneración fallida · ${(error as Error).message}\n`); }
      }
      session.emit("error", { message: verdict, ...aboveTutor(ended) });
      studioVerdict(session, verdict, ended);
    } else if (ended.regeneration?.passed) {
      const part = ended.regeneration.part ?? "parte";
      // The explicit correction worked: say it in one short sentence instead of leaving only the tutor's claim.
      if (ended.partCorrectionSent) studioVerdict(session, "La regeneración sí se completó: ya se sirve la versión nueva.", ended);
      // A regeneration that lands forgets an earlier rollback, on the first try as well as after a correction (#393).
      if (ended.topic) {
        try { markRegeneration(regenerationMarksFile, ended.topic, part, null); }
        catch (error) { process.stderr.write(`estudio: no se pudo guardar la regeneración · ${(error as Error).message}\n`); }
      }
    }
    // A turn that wrote a part generated a page: its timings are on disk before the page hears
    // the turn is over, so a reader can compare this generation with the next one.
    if (ended.parts.length > 0) savePageTiming(ended.timing, ended.parts);
    if (!ended.aborted && ended.espera?.note && existsSync(ended.espera.note) &&
        !(ended.regeneration && !ended.regeneration.passed) && partServes(ended)) {
      emitFase(session, ended, "lista", undefined, true);
    }
    session.saveSnapshot();
    session.emit("state", session.state());
    emitTareas();
    // The turn that held the studio is over: the idle window starts counting again.
    armIdle();
  };

  /** One prompt to the runtime. A refusal is the studio's log, never the learner's words. */
  const deliver = async (session: Session, text: string, started: Turn, reason: CallReason = "turn") => {
    // A topic a creation turn just put in a course waits for that link: the route is planned from
    // the material, never from a topic name alone (#407/T2b).
    const enlace = started.topic ? enlacesDeMateria.get(started.topic) : undefined;
    if (enlace) await enlace;
    // Every runtime hears the same figure contract, once, whatever prompted the turn.
    // A topic whose route is still unwritten also hears its course material, so the plan is
    // derived from what the learner uploaded instead of invented from the topic name (#407).
    const material = started.topic ? planBrief(root, started.topic) : "";
    const prompt = material ? `${withVisualContract(text)}\n\n${material}` : withVisualContract(text);
    // From here until the runtime settles is this call's own time; the sizes are what it sends.
    started.timing.startCall(reason, prompt.length);
    try {
      if (session.agy) {
        session.agy.prompt(prompt);
      } else if (session.api) {
        session.api.prompt(prompt);
      } else {
        const reply = await call(session, { type: "prompt", message: prompt });
        if (reply.success === false) throw new HttpError(409, String(reply.error ?? "el tutor rechazó el turno"));
      }
      // A correction counts against the turn's budget once it has reached the tutor, whichever gate asked for it (#393).
      if (reason === "engine-correction" || reason === "part-correction") started.correctionsSent = (started.correctionsSent ?? 0) + 1;
    } catch (error) {
      // A prompt that never reached the tutor is a call that produced nothing.
      started.timing.endCall(false);
      const cause = error instanceof HttpError ? `${error.status} ${error.message}` : (error as Error).message;
      process.stderr.write(`estudio: el turno de ${started.topic ?? "chat general"} no llegó al tutor · ${cause}\n`);
      // A studio refusal the route already explains (disabled or stopped tutor) keeps its status;
      // anything the runtime said in its own words is replaced by the studio's.
      if (error instanceof HttpError && error.status !== 409) throw error;
      throw new HttpError(409, "El tutor no pudo empezar el turno; vuelve a pedírselo.");
    }
  };

  /** What the learner is told when a correction could not be sent; the cause stays in the log. */
  const correctionRefused = (session: Session, topic: string) => {
    session.emit("error", { message: `El tutor no pudo retomar «${topic}»: el motor sigue sin darlo por cerrado. Vuelve a pedírselo.` });
  };

  /**
   * The tutor reads its skill and the Learnings `AGENTS.md` from links the deploy
   * owns. A link that resolves anywhere else means nobody reviewed what the tutor would read,
   * so the turn never starts.
   */
  const refuseDriftedContext = (session: Session) => {
    // A disabled tutor starts no turn at all, so its own refusal is the answer.
    if (options.skipContextCheck || options.agentDisabled) return;
    const drift = checkTutorContext({ repo: REPO, root, home: options.contextHome });
    if (!drift) return;
    const message = driftMessage(drift);
    session.emit("error", { message });
    throw new HttpError(409, message);
  };

  /**
   * A part chat names its part. The hosted view's submission arrives as
   * `[Vista HTML · <topic> · <part> · …]`, which names the part by id only; a concept question
   * answered in that chat has to use the example the part already runs, so the studio adds the
   * part's own name and number to the turn the tutor reads.
   */
  const namedPart = (text: string): string => {
    const header = /^\[Vista HTML · ([^·\]\n]+) · ([^·\]\n]+) ·/.exec(text);
    if (!header) return text;
    const [, topic, part] = header;
    const plan = readPlan(join(root, topic));
    const index = plan?.parts.findIndex((entry) => entry.id === part) ?? -1;
    if (!plan || index < 0) return text;
    const nombre = `Parte ${index + 1} «${plan.parts[index].title}»`;
    return (
      `${text}\n\n[Parte en curso: ${nombre} de ${plan.topic || topic}. ` +
      "Si lo que pregunta es un concepto, respóndelo con el ejemplo que esta parte ya viene usando.]"
    );
  };

  /**
   * The only way a tutor turn starts, whatever path asks for it: the composer, a submission from the
   * page, a regeneration. A writer ticket may already be held by the route; the turn takes it over
   * and releases it when the settle (or an abort) ends. A regeneration's backup comes after the hold.
   */
  const startTurn = async (session: Session, text: string, spec: {
    topic: string | null;
    correction?: boolean;
    creation?: boolean;
    /** The course a creation turn puts its topic in, checked by the route that named it. */
    materia?: string;
    lock?: { release: () => void } | null;
    backup?: () => NonNullable<Turn["regeneration"]>;
  }) => {
    let started: Turn | null = null;
    try {
      requireNoTurn(session);
      // A drifted skill or AGENTS.md link means nobody reviewed what the tutor would read.
      refuseDriftedContext(session);
      // Never route a turn before the studio knows which conversation it belongs to.
      try {
        await session.ready;
      } catch (error) {
        process.stderr.write(`estudio: el tutor no pudo abrir su conversación · ${(error as Error).message}\n`);
        const message = "El tutor no empieza: no pudo abrir su conversación. Vuelve a intentarlo en un momento.";
        session.emit("error", { message });
        throw new HttpError(503, message);
      }
      // A task whose settings changed while it was working gets its new runtime before the next turn.
      if (session.kind === "task" && (session.stale || missingRuntime(session))) {
        stopRuntime(session);
        startTaskRuntime(session);
        await session.ready;
      }
      // `ready` can take a moment, and a Session must not hold two turns because of it.
      requireNoTurn(session);
      started = {
        topic: spec.topic,
        correction: spec.correction === true,
        creation: spec.creation === true,
        ...(spec.materia ? { materia: spec.materia } : {}),
        parts: [],
        methodBefore: spec.topic === null ? null : methodOf(spec.topic),
        timing: createPageTiming({ runtime: tutor.agente, model: tutor.modelo, topic: spec.topic }),
        lock: spec.lock ?? null,
      };
      holdTurn(session, started);
      // A write-part turn starts the quick glossary without waiting for it: no topic lock,
      // no vault write and no place in the tutor's tool loop.
      const target = writePartTarget(root, spec.topic, text);
      if (target) {
        started.espera = { ...target, note: partNotePath(root, target.topic, target.part), startedAt: Date.now(), emitted: new Set() };
        try {
          const plan = readPlan(join(root, target.topic));
          glosario.start(target.topic, target.part, {
            topicTitle: plan?.topic || target.topic,
            partTitle: plan?.parts[target.number - 1]?.title || target.part,
            subtemas: plan?.parts.map((part) => part.subtema).filter((subtema) => subtema !== "") ?? [],
          });
        } catch { /* a topic the plan cannot describe still gets its phase events */ }
      }
      try {
        if (spec.backup) started.regeneration = spec.backup();
        // #452: what the part owed looked like before this turn, so only a part the turn itself
        // wrote or changed is measured here.
        const owed = partExpected(started);
        started.expectedAtStart = owed ? bytesOf(owed.file) : undefined;
        // The learner's words stay first; a write-part turn also carries the facts the
        // tutor would otherwise discover with ls/find/reads. Both runtimes get the same prompt.
        const prompt = await started.timing.measure("contexto", async () => {
          // #412/#413: the learner's verdicts ride with the lessons; #422 made the brief async.
          // #440: a turn that writes a part also carries that topic's own digest, after the lessons
          // and before the verdicts, so a line never rides in two channels.
          const base = withGustos(withTema(withLecciones(namedPart(text), root), root, target?.topic), root);
          // The awaited brief adds the course slices the embedder ranks; it returns at once and
          // starts nothing for a prompt that is not a course part (#422).
          const brief = await partBriefAsync(root, text);
          return brief ? `${base}\n\n${brief}` : base;
        });
        await deliver(session, prompt, started);
      } catch (error) {
        releaseTurn(session, started);
        throw error;
      }
      if (!started.correction) session.settleGate.reset();
      // The topic the tutor is teaching is the topic the page is on, whatever path started the turn.
      if (started.topic) {
        session.tema = started.topic;
        session.gateBlocked = false;
      }
    } catch (error) {
      // Every exit owns the ticket: a held turn unwinds through releaseTurn, while a refusal
      // before the hold releases the route's ticket right here. Release is idempotent, so a
      // delivery failure that already let go still passes safely through this final path.
      try {
        if (started && session.turn === started) releaseTurn(session, started);
      } finally {
        spec.lock?.release();
      }
      throw error;
    }
  };

  /**
   * The part files a turn wrote, as the tools measure them. The list holds each file once (#265), so a
   * part's note and its page are each measured once; a file that is not on disk is left out.
   */
  const partNotes = (parts: string[]): string[] => parts.filter((file) => existsSync(file));

  /**
   * What the tools say about the parts a turn wrote. A tool that could not run is the studio's own
   * failure and goes to the log: it is never a finding the tutor is asked to fix.
   */
  const checkParts = async (settled: Turn): Promise<PartReport | null> => {
    const expected = partExpected(settled);
    // #452: the part the turn owed is measured even when its own write events never named it, so
    // the file the learner will open is the one that must pass. Only when the turn is what changed
    // it: a part that was already there is not this turn's to measure, and re-measuring it would
    // hand the tutor findings it did not produce.
    const owed = expected !== null && settled.expectedAtStart !== undefined && bytesOf(expected.file) !== settled.expectedAtStart
      ? expected.file
      : null;
    const files = [...new Set(partNotes([...settled.parts, ...(owed ? [owed] : [])]))];
    if (!files.length) return null;
    const checkPartsWithVerdicts = options.partChecks ?? ((paths: string[]) => runPartChecks(paths, { gateVerdictsFile: gateStoreFile, gateToolPath: options.gateToolPath }));
    const checked = await checkPartsWithVerdicts(files);
    // A gate that could not measure is the studio's own failure even when other gates found
    // something: it never becomes a tutor finding, and it is never silently dropped (#372/T2a).
    for (const failure of "failures" in checked ? checked.failures : []) {
      process.stderr.write(`estudio: comprobación fallida · ${failure}\n`);
    }
    settled.partVerdict = checked;
    // What the measurement said about the part itself is kept beside the studio's own state, so
    // the part cannot be served as if it had passed (#452). A measurement that could not run
    // leaves no mark: the studio does not refuse what it could not read. The findings counted are
    // the ones in the note the reader opens, never another file's: a page that failed does not
    // hide a note that passed.
    if (owed && expected && settled.topic) {
      const bytes = bytesOf(expected.file);
      const mine = checked.kind === "findings" ? checked.tools.filter((tool) => tool.file === expected.file) : [];
      const count = mine.reduce((total, tool) => total + tool.findings.length, 0);
      const rules = [...new Set(mine.flatMap((tool) => parsedFindingsOf(tool.tool, tool.output).map((found) => found.rule)).filter((rule) => rule !== ""))].slice(0, 12);
      markPartGate(
        partGateMarksFile,
        `${root}::${settled.topic}/${expected.part}`,
        bytes === null ? null : count > 0 ? { bytes, count, rules } : null,
      );
    }
    if (checked.kind === "crashed") {
      // A gate that could not measure did not pass: a regeneration keeps the previous version.
      if (settled.regeneration) settled.regeneration.reason ??= "una comprobación no pudo medir la parte";
      return null;
    }
    return checked.kind === "findings" ? checked : null;
  };

  /**
   * The studio's own words in the conversation, kept in the transcript so a reload still shows what
   * really happened (#393). A verdict about a turn goes above that turn's first tutor text, live and saved alike.
   */
  const studioVerdict = (session: Session, text: string, turn?: Turn | null) => {
    const notice: ChatMessage = { role: "studio", text };
    const at = turn?.tutorMessage ? session.transcript.indexOf(turn.tutorMessage) : -1;
    if (at >= 0) {
      session.transcript.splice(at, 0, notice);
      session.saveSnapshot();
    } else session.remember(notice);
    session.emit("studio", { text, ...aboveTutor(turn) });
  };

  /**
   * A part the studio presents as finished was measured and nothing was found in it (#452): a
   * part nobody measured is not presented as a finished part either.
   */
  const partServes = (turn: Turn): boolean => turn.partVerdict?.kind === "clean";

  /** The bytes a measurement covers: a part that changed since then is not covered by it (#452). */
  const bytesOf = (file: string): string | null => {
    try {
      const stats = statSync(file);
      return `${stats.size}:${stats.mtimeMs}`;
    } catch {
      return null;
    }
  };

  /**
   * A part the studio measured and rejected is not served as if it had passed (#452): the learner
   * gets the findings instead. A mark that does not match the note's bytes covers another version.
   */
  const assertPartServes = (topic: string, part: string): void => {
    const file = partNotePath(root, topic, part);
    if (!file) return;
    const mark = readPartGateMarks(partGateMarksFile)[`${root}::${topic}/${part}`];
    if (!mark || mark.count === 0 || bytesOf(file) !== mark.bytes) return;
    const count = mark.count === 1 ? "1 hallazgo" : `${mark.count} hallazgos`;
    const rules = mark.rules.length ? ` (${mark.rules.join(", ")})` : "";
    throw new HttpError(409, `«${basename(file, ".md")}» no pasó las comprobaciones: ${count}${rules}. No se sirve hasta que pase.`);
  };

  /**
   * The part this turn had to produce: a regeneration's part, or the part a write request named.
   */
  const partExpected = (settled: Turn): { file: string; part: string; title: string; number: number } | null => {
    const topic = settled.topic;
    const part = settled.regeneration?.part ?? settled.espera?.part;
    if (!topic || !part) return null;
    let plan;
    try { plan = readPlan(join(root, topic)); } catch { return null; }
    const index = plan?.parts.findIndex((entry) => entry.id === part) ?? -1;
    if (!plan || index < 0) return null;
    const file = partNotePath(root, topic, part);
    if (!file) return null;
    return { file, part, title: plan.parts[index].title, number: index + 1 };
  };

  /**
   * One last, explicit chance before a part-producing turn is given up: the studio says which file
   * is missing, or which checks rejected the part, and the tutor fixes exactly that. It is the turn's
   * first and only correction: once any correction was delivered, a further failure reports at once (#393).
   */
  const askForMissingPart = async (session: Session, settled: Turn, why?: string): Promise<boolean> => {
    if (settled.partCorrectionSent || (settled.correctionsSent ?? 0) > 0) return false;
    const expected = partExpected(settled);
    if (!expected) return false;
    settled.partCorrectionSent = true;
    const name = `Parte ${expected.number} «${expected.title}»`;
    const rel = relative(root, expected.file);
    const missing = !existsSync(expected.file);
    const prompt = missing
      ? `Falta escribir la ${name}: el archivo «${rel}» no existe. Escríbela ahora en ese archivo y no la des por terminada hasta que exista.`
      : `La ${name} no pasó las comprobaciones:\n${(why ?? "el motor no la dio por buena").trim()}\nCorrige eso en «${rel}» y vuelve a escribir la parte. No la des por terminada hasta que pase.`;
    // A fresh verdict follows the correction; the old one must not survive a second failure.
    if (settled.regeneration) delete settled.regeneration.reason;
    try {
      await deliver(session, prompt, settled, "part-correction");
      return true;
    } catch {
      if (settled.regeneration) settled.regeneration.reason ??= "el tutor no pudo retomar la corrección";
      correctionRefused(session, settled.topic ?? "el tema");
      return false;
    }
  };

  /**
   * What a settled turn still owes, for every runtime and every Session. Every path out releases
   * only its own turn; only a correction that was sent keeps it.
   */
  const settleTurn = async (session: Session, settled: Turn) => {
    // #460: the learner stopped this turn, so what the runtime reports afterwards decides nothing:
    // the abort already said how it ends, and a late settle would only roll back its own result.
    if (settled.aborted) {
      releaseTurn(session, settled);
      return;
    }
    // #460: one decision per turn at a time, whatever a runtime reports and however late.
    if (settled.settling) return;
    settled.settling = true;
    const topic = settled.topic;
    let corrected = false;
    try {
      if (!topic) return;
      const { report } = await settled.timing.measure("motor", () => runGate(session, topic));
      // Aborted or restarted while the engine answered: this turn is no longer the studio's.
      if (session.turn !== settled) return;
      const chose = tutorChoseMethod(topic, report, settled.methodBefore);
      if (chose) {
        const message = `El tutor eligió el método por ti (${chose}): el método se elige en la página del tema, no en el chat. El turno no se da por bueno.`;
        if (settled.regeneration) settled.regeneration.reason = message;
        else session.emit("error", { message });
        return;
      }
      const decision = session.settleGate.decide(report);
      if (decision.action === "stop" && settled.regeneration) settled.regeneration.reason = decision.text;
      if (decision.action === "ask") {
        // The correction is the same turn, one more prompt: it is not a new turn start.
        try {
          await deliver(session, decision.text, settled, "engine-correction");
          corrected = true;
        } catch {
          if (settled.regeneration) settled.regeneration.reason ??= "el tutor no pudo retomar la corrección";
          correctionRefused(session, topic);
        }
      } else if (decision.action === "stop") {
        if (await askForMissingPart(session, settled, decision.text)) corrected = true;
        else session.emit("error", { message: decision.text });
      } else {
        if (decision.action === "unreadable") {
          session.emit("notice", { level: "warning", message: `El motor no pudo revisar «${topic}»: el turno termina sin comprobarlo.` });
        }
        // The engine is done with this turn, so what it cannot measure is measured here: the part
        // the turn wrote still owes the scene and explanation checks before it reaches the learner.
        emitFase(session, settled, "comprobando");
        const found = await settled.timing.measure("comprobaciones", () => checkParts(settled));
        if (session.turn !== settled) return;
        if (found) {
          emitFase(session, settled, "corrigiendo", found.count);
          const verdict = session.settleGate.decideFindings(found);
          if (verdict.action === "ask") {
            try {
              await deliver(session, verdict.text, settled, "part-correction");
              corrected = true;
            } catch {
              if (settled.regeneration) settled.regeneration.reason = "el tutor no pudo retomar la corrección";
              correctionRefused(session, topic);
            }
          } else if (verdict.action === "stop") {
            if (await askForMissingPart(session, settled, verdict.text)) corrected = true;
            else if (settled.regeneration) settled.regeneration.reason = verdict.text;
            else session.emit("error", { message: verdict.text });
          }
        } else {
          // The engine cleared the turn: a part-producing turn still owes its file. Before giving
          // up, the tutor gets one explicit correction saying exactly what is missing (#393).
          const expected = partExpected(settled);
          const missing = expected !== null && !existsSync(expected.file);
          if (missing) {
            if (await askForMissingPart(session, settled)) corrected = true;
            else {
              const message = `La Parte ${expected.number} «${expected.title}» no se escribió: el archivo «${relative(root, expected.file)}» sigue sin existir.`;
              if (settled.regeneration) settled.regeneration.reason ??= "el tutor no escribió la parte";
              else {
                session.emit("error", { message, ...aboveTutor(settled) });
                studioVerdict(session, message, settled);
              }
            }
          } else if (settled.regeneration && !settled.regeneration.passed && !settled.regeneration.reason) {
            // The engine cleared the turn and the tools found nothing: the new version is what the
            // learner can read from now on. A regeneration that wrote no part never replaces one.
            if (settled.parts.some((file) => existsSync(file))) settled.regeneration.passed = true;
            else settled.regeneration.reason ??= "el tutor no escribió la parte";
          }
        }
      }
    } catch (error) {
      if (settled.regeneration) settled.regeneration.reason ??= "el turno no pudo comprobarse entero";
      correctionRefused(session, topic ?? "el tema");
      process.stderr.write(`estudio: el motor no pudo decidir el turno · ${(error as Error).message}\n`);
    } finally {
      settled.settling = false;
      // Only the turn this settle was called for: a late answer may belong to a turn already gone.
      if (!corrected) releaseTurn(session, settled);
    }
  };

  // ---- hosted study-view bridge -------------------------------------------
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<Json> }>();
  const shutdownHandlers: Array<() => Promise<void> | void> = [];
  /** The bridge owns a topic ticket while it writes an answer file; the turn then inherits it. */
  type LockHandle = { ticket: { release: () => void }; transfer: () => void; release: () => void };
  const pendingTickets = new Map<string, LockHandle>();
  const fakePi = {
    on(event: string, handler: () => Promise<void> | void) {
      if (event === "session_shutdown") shutdownHandlers.push(handler);
      return () => {};
    },
    registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<Json> }) {
      tools.set(tool.name, tool);
    },
    sendUserMessage(text: string) {
      // A topic's work belongs to that topic's task; the main chat keeps general submissions.
      const topic = bridgeTopic(text);
      const session = topic === null ? main : ensureTask(topic);
      const handle = topic === null ? undefined : pendingTickets.get(topic);
      const lock = handle?.ticket ?? null;
      if (session.kind === "task" && missingRuntime(session)) startTaskRuntime(session);
      return startTurn(session, text, { topic, lock }).then((result) => {
        // Until the turn holds the ticket the bridge still owns it, so its `finally` is the
        // safety net for a refusal before the hold. Only then is the handoff final.
        handle?.transfer();
        return result;
      });
    },
  };
  const view = async (topic?: string, part?: string) => {
    const params: Json = {};
    if (topic) params.topic = topic;
    if (part) params.part = part;
    const result = await tools.get("learning_view")!.execute("studio", params, undefined, undefined, { cwd: root });
    if (result.isError) throw new HttpError(404, String((result.structuredContent as Json)?.error ?? "not found"));
    return result.structuredContent as Json;
  };

  // ---- library -------------------------------------------------------------
  /** The models the chosen runtime offers, straight from its own CLI. */
  const agyCatalog = (): Promise<string[]> =>
    new Promise((resolve) => {
      const [command, ...base] = options.agyCommand ?? ["agy"];
      execFile(command, [...base, "models"], { cwd: root, timeout: 20000, encoding: "utf8" }, (_err, stdout) => {
        resolve(parseAgyModels(String(stdout ?? "")));
      });
    });
  const piCatalog = (): Promise<string[]> =>
    new Promise((resolve) => {
      const [command, ...base] = options.piCommand ?? ["pi"];
      execFile(command, [...base, "--list-models"], { cwd: root, timeout: 45000, encoding: "utf8" }, (_err, stdout) => {
        resolve(parsePiModels(String(stdout ?? "")));
      });
    });
  /**
   * The models the API provider returns for its own key. A missing key or a failed request is an
   * answer with a reason, never a 500: the page must still open and say what is missing.
   */
  const apiCatalog = async (id: string): Promise<{ modelos: string[]; aviso?: string }> => {
    const provider = proveedorPorId(id);
    if (!provider) throw new HttpError(400, "unknown provider");
    if (!provider.implementado) return { modelos: [], aviso: `${provider.nombre} todavía no está implementado` };
    const env = options.apiEnv ?? process.env;
    const key = String(env[provider.variable] ?? "").trim();
    if (!key) return { modelos: [], aviso: `Falta ${provider.variable}: expórtala y reinicia el estudio.` };
    try {
      const response = await fetch(`${options.apiBase ?? provider.base}models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return { modelos: [], aviso: `${provider.nombre} respondió ${response.status}` };
      return { modelos: catalogoMistral(await response.json()).map((modelo) => modelo.id) };
    } catch (error) {
      return { modelos: [], aviso: `No se pudo leer el catálogo de ${provider.nombre}: ${error instanceof Error ? error.message : String(error)}` };
    }
  };

  const engineReport = (workspace: string): Promise<Json> =>
    new Promise((resolve) => {
      if (!existsSync(enginePath)) return resolve({ status: "desconocido" });
      execFile(
        enginePath,
        ["status", "--root", root, "--workspace", workspace, "--rules", rulesPath, "--mode", "deep", "--json"],
        { timeout: 20000, encoding: "utf8" },
        (_err, stdout) => {
          try {
            const report = JSON.parse(stdout);
            resolve(isRecord(report) ? report : { status: "desconocido" });
          } catch {
            resolve({ status: "desconocido" });
          }
        },
      );
    });

  /** The library's list: a topic the engine does not track yet has no report to show. */
  const engineStatus = (workspace: string): Promise<Json> =>
    !existsSync(enginePath) || !existsSync(join(workspace, ".learning")) ? Promise.resolve({ status: "sin inscribir" }) : engineReport(workspace);

  /** The engine records the learner's method choice with its own command; the studio never guesses it. */
  const recordMethod = (topic: string, metodo: string): Promise<Json> =>
    new Promise((resolve) => {
      execFile(
        enginePath,
        ["method", "--root", root, "--workspace", join(root, topic), "--rules", rulesPath, "--method", metodo, "--json"],
        { timeout: 20000, encoding: "utf8" },
        (_err, stdout) => {
          try {
            const report = JSON.parse(stdout);
            resolve(isRecord(report) ? report : { status: "desconocido" });
          } catch {
            resolve({ status: "desconocido" });
          }
        },
      );
    });

  // ---- opened topics ---------------------------------------------------------
  // Topic id -> epoch ms of its last open in the studio; shared by every browser of this studio.
  const readOpened = (): Record<string, number> => {
    try {
      const stored = JSON.parse(readFileSync(openedFile, "utf8"));
      return isRecord(stored) ? Object.fromEntries(Object.entries(stored).filter(([, at]) => typeof at === "number")) as Record<string, number> : {};
    } catch {
      return {};
    }
  };
  const recordOpened = (topic: string) => {
    const opened = { ...readOpened(), [topic]: Date.now() };
    mkdirSync(dirname(openedFile), { recursive: true });
    const temporary = `${openedFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(opened));
    renameSync(temporary, openedFile);
  };

  // ---- the method the learner chose ------------------------------------------
  // `<root>::<topic>` -> the method the page recorded. The engine cannot tell who called its method
  // command (the page and the tutor run the same CLI), so the studio keeps the page's own choices
  // and refuses a turn that recorded one itself. The root is part of the key because one state
  // directory serves every vault this user opens. Kept beside `opened.json`, so a restarted studio
  // does not mistake a page choice for a tutor's.
  const methodsFile = join(dirname(openedFile), "metodos.json");
  const methodKey = (topic: string) => `${root}::${topic}`;
  const readMethods = (): Record<string, string> => {
    try {
      const stored = JSON.parse(readFileSync(methodsFile, "utf8"));
      return isRecord(stored) ? Object.fromEntries(Object.entries(stored).filter(([, m]) => typeof m === "string")) as Record<string, string> : {};
    } catch {
      return {};
    }
  };
  const pageMethods = readMethods();
  const recordPageMethod = (topic: string, metodo: string) => {
    pageMethods[methodKey(topic)] = metodo;
    mkdirSync(dirname(methodsFile), { recursive: true });
    const temporary = `${methodsFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(pageMethods));
    renameSync(temporary, methodsFile);
  };
  /**
   * The engine's method for a topic as its state file holds it, read when a turn starts. `runStatus`
   * reports that same field on every status, so the turn's "before" and the settle's "after" name one
   * value. No state file means the engine recorded nothing (""); a state that cannot be read is unknown
   * (null), and an unknown method blames no turn (#314).
   */
  const methodOf = (topic: string): string | null => {
    let raw: string;
    try {
      raw = readFileSync(join(root, topic, ".learning", "state.json"), "utf8");
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? "" : null;
    }
    try {
      const state: unknown = JSON.parse(raw);
      if (!isRecord(state)) return null;
      return typeof state.method === "string" ? state.method : "";
    } catch {
      return null;
    }
  };
  /**
   * The method this turn chose: the engine reports one that differs from the one it had when the turn
   * started, and the page never recorded it (#248). A method the engine already had is the learner's or
   * an earlier turn's, so no turn is blamed for it (#314).
   */
  const tutorChoseMethod = (topic: string, report: Json, before: string | null): string => {
    const method = typeof report.method === "string" ? report.method : "";
    if (before === null || method === "" || method === before) return "";
    return pageMethods[methodKey(topic)] === method ? "" : method;
  };

  const library = async () => {
    const opened = readOpened();
    const marks = readRegenerationMarks(regenerationMarksFile);
    const topics = await Promise.all(
      listTopics(root).map(async (t) => {
        const report = await engineStatus(join(root, t.id));
        // A part whose last regeneration was rolled back says so until a later one succeeds (#393).
        const parts = t.parts.map((part) => ({ ...part, rolledBack: marks[`${t.id}/${part.id}`] !== undefined }));
        return { ...t, parts, status: report.status ?? "", stage: report.stage ?? "", nextStage: report.nextStage ?? "", part: report.part ?? "", method: report.method ?? "", opened: opened[t.id] ?? 0 };
      }),
    );
    const quickDir = join(root, "rapidos");
    const quick = existsSync(quickDir)
      ? readdirSync(quickDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => {
            const file = join(quickDir, f);
            const text = readFileSync(file, "utf8");
            const h1 = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
            const id = f.replace(/\.md$/, "");
            return { id, title: h1 || id, used: statSync(file).mtimeMs };
          })
          // The note used most recently is the one you are likely to open again.
          .sort((a, b) => b.used - a.used || a.id.localeCompare(b.id))
          .map(({ used: _used, ...note }) => note)
      : [];
    const audioDir = join(root, "audios");
    const audio = existsSync(audioDir)
      ? readdirSync(audioDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && /^[a-z0-9][a-z0-9-]{0,39}$/.test(e.name))
          .flatMap((e) => {
            const file = join(audioDir, e.name, "sesion.json");
            if (!existsSync(file)) return [];
            let title = e.name;
            let used = 0;
            try {
              used = statSync(file).mtimeMs;
              const session: unknown = JSON.parse(readFileSync(file, "utf8"));
              if (isRecord(session) && typeof session.titulo === "string" && session.titulo.trim()) title = session.titulo.trim();
            } catch { /* an unreadable session is still listed under its folder name */ }
            return [{ id: e.name, title, used }];
          })
          .sort((a, b) => b.used - a.used || a.id.localeCompare(b.id))
          .map(({ used: _used, ...session }) => session)
      : [];
    return { topics, quick, audio };
  };

  // ---- HTTP -----------------------------------------------------------------
  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...extra });
    res.end(body);
  };
  const sendJson = (res: ServerResponse, status: number, body: unknown) => send(res, status, "application/json; charset=utf-8", JSON.stringify(body));

  let bridgeOrigin = "";
  const shell = () => {
    const scripts = CDN_SCRIPTS.slice(0, 2)
      .map(([src, sri]) => `<script src="${src}" integrity="${sri}" crossorigin="anonymous"></script>`)
      .join("\n");
    // The dictation box needs the address of the studio's own proxy; without a transcriber
    // the shared script falls back to the browser's speech recognition.
    const transcribe = options.transcriberUrl ? { transcribeUrl: `/${token}/api/transcribe` } : {};
    const data = JSON.stringify({ base: `/${token}/`, ...transcribe }).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estudio — Learnings</title>
<link rel="icon" href="/${token}/favicon.svg" type="image/svg+xml">
${FONT_STYLESHEETS.map(([href, sri]) => `<link rel="stylesheet" href="${href}" integrity="${sri}" crossorigin="anonymous">`).join("\n")}
<link rel="stylesheet" href="/${token}/studio.css">
<script src="/${token}/kit/theme.js"></script>
${scripts}
</head>
<body>
<main id="studio"></main>
<script type="application/json" id="studio-data">${data}</script>
<script src="/${token}/kit/scene.js"></script>
<script src="/${token}/kit/dictate.js"></script>
<script src="/${token}/kit/question.js"></script>
<script src="/${token}/kit/code-field.js"></script>
<script src="/${token}/tutorial.js"></script>
<script src="/${token}/studio.js"></script>
</body>
</html>
`;
  };
  const shellCsp = () =>
    [
      "default-src 'none'",
      "script-src 'self' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "font-src https://cdn.jsdelivr.net",
      "img-src 'self' data:",
      "connect-src 'self'",
      // The reader frames the bridge, or a part saved on this device when there is no connection.
      `frame-src ${bridgeOrigin} 'self'`,
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; ");

  const readBody = (req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<Json> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= maxBytes) chunks.push(chunk);
      });
      req.on("end", () => {
        if (size > maxBytes) return reject(new HttpError(413, "body too large"));
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          return isRecord(body) ? resolve(body) : reject(new HttpError(400, "body must be a JSON object"));
        } catch {
          return reject(new HttpError(400, "body is not JSON"));
        }
      });
      req.on("error", reject);
    });

  /** The studio's own proxy to the dictation service: the reader's script posts here too. */
  const transcribe = async (req: IncomingMessage, res: ServerResponse) => {
    const target = options.transcriberUrl && options.transcriberToken
      ? { url: options.transcriberUrl, token: options.transcriberToken }
      : undefined;
    if (!target) throw new HttpError(503, "La transcripción no está configurada en el Estudio.");
    const type = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!type.startsWith("audio/")) throw new HttpError(415, "Se necesita audio.");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= MAX_AUDIO_BYTES) chunks.push(chunk);
    }
    if (size > MAX_AUDIO_BYTES) throw new HttpError(413, "Audio demasiado grande.");
    if (!size) throw new HttpError(400, "El audio está vacío.");
    try {
      return sendJson(res, 200, { text: await transcribeAudio(target, Buffer.concat(chunks), type) });
    } catch (error) {
      if (!(error instanceof TranscribeError)) throw error;
      throw new HttpError(error.kind === "timeout" ? 504 : 502, "No se pudo transcribir el audio.");
    }
  };

  /** A regeneration is a prompt plus the reason that produced it; the previous version waits in the trash. */
  const regenerationPrompt = (tema: string, parte: string, entrada: { motivos: string[]; texto: string }, trash: string) => {
    const plan = readPlan(join(root, tema));
    const index = plan?.parts.findIndex((p) => p.id === parte) ?? -1;
    const part = index >= 0 ? plan!.parts[index] : undefined;
    const nombre = part ? `Parte ${index + 1} «${part.title}»` : `la parte ${parte}`;
    // The plan's title names the topic for a human; the folder names it on disk.
    const titulo = plan?.topic || tema;
    const dicho = [
      entrada.motivos.length ? `motivos: ${entrada.motivos.map((id) => motivos.find((m) => m.id === id)?.texto ?? id).join(", ")}` : "",
      entrada.texto ? `sus palabras: «${entrada.texto}»` : "",
    ].filter(Boolean).join("; ");
    return [
      `Regenera ${nombre} de ${titulo} (carpeta ${tema}).`,
      "",
      `El alumno pidió regenerarla: ${dicho}.`,
      trash ? `La versión anterior está guardada en ${trash} dentro del vault: no la borres.` : "",
      "Rehaz la página rica y la nota, y el mini-quiz de esta parte. Conserva el video y los adjuntos.",
      "El plan no cambia: es una regeneración de una parte que ya existe, no un tema nuevo.",
      "",
      VISUAL_CONTRACT_PROMPT,
      "",
      withGustos(tutorContext(root, tema), root),
    ].filter((line) => line !== "").join("\n");
  };

  const upload = async (req: IncomingMessage, res: ServerResponse) => {
    const type = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
    if (!Object.hasOwn(UPLOAD_TYPES, type)) throw new HttpError(415, UPLOAD_ERRORS.unsupported);
    const uploadType = type as UploadType;
    const headerName = req.headers["x-file-name"];
    if (typeof headerName !== "string" || !headerName) throw new HttpError(400, UPLOAD_ERRORS.filename);
    let requestedName: string;
    try {
      requestedName = decodeURIComponent(headerName);
    } catch {
      throw new HttpError(400, UPLOAD_ERRORS.filename);
    }
    const nombre = safeUploadName(requestedName, uploadType);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size <= MAX_UPLOAD_BYTES) chunks.push(bytes);
    }
    if (size > MAX_UPLOAD_BYTES) throw new HttpError(413, UPLOAD_ERRORS.tooLarge);
    if (!size) throw new HttpError(400, UPLOAD_ERRORS.empty);
    const content = Buffer.concat(chunks, size);
    const uploadsRoot = join(root, ".subidas");
    try {
      if (existsSync(uploadsRoot)) {
        const contained = resolveContained(root, uploadsRoot);
        if (!contained.ok || contained.targetReal !== uploadsRoot || !statSync(uploadsRoot).isDirectory()) {
          throw new HttpError(500, UPLOAD_ERRORS.storage);
        }
      } else {
        mkdirSync(uploadsRoot);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, UPLOAD_ERRORS.storage);
    }
    let id = "";
    let directory = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = randomBytes(16).toString("hex");
      const candidateDirectory = join(uploadsRoot, candidate);
      try {
        mkdirSync(candidateDirectory);
        id = candidate;
        directory = candidateDirectory;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new HttpError(500, UPLOAD_ERRORS.storage);
      }
    }
    if (!id || !directory) throw new HttpError(500, UPLOAD_ERRORS.storage);
    const cleanup = () => {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* best-effort cleanup after a failed upload */ }
    };
    try {
      const containedDirectory = resolveContained(root, directory);
      if (!containedDirectory.ok || containedDirectory.targetReal !== directory) throw new HttpError(500, UPLOAD_ERRORS.storage);
      const filePath = join(directory, nombre);
      writeFileSync(filePath, content, { flag: "wx" });
      const containedFile = resolveContained(root, filePath);
      if (!containedFile.ok || containedFile.targetReal !== filePath) throw new HttpError(500, UPLOAD_ERRORS.storage);
      if (uploadType === "application/pdf") await writePdfDerivatives(root, directory, filePath, nombre);
      return sendJson(res, 200, { id, nombre, tipo: uploadType });
    } catch (error) {
      cleanup();
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, UPLOAD_ERRORS.storage);
    }
  };

  const materiaCreate = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req);
    if (!isRecord(body)) throw new HttpError(400, "No pude leer la materia.");
    return sendJson(res, 201, createMateria(root, body.nombre));
  };

  const materiaFuente = async (req: IncomingMessage, res: ServerResponse, id: string) => {
    const contentType = String(req.headers["content-type"] ?? "");
    const tipo = String(req.headers["x-tipo"] ?? "");
    const fileName = typeof req.headers["x-file-name"] === "string" ? req.headers["x-file-name"] : "";
    const content = await readFuenteBody(req);
    const fuente = await addFuente(root, id, { fileName, contentType, tipo, content });
    // The keyword rows are committed before the 201; embeddings are a queue on
    // purpose, so a slow model never holds the upload's HTTP response (#373).
    try { indizarFuente(root, id, fuente); } catch { /* a rebuild can recover the index later */ }
    return sendJson(res, 201, fuente);
  };

  const materiaTema = async (req: IncomingMessage, res: ServerResponse, id: string) => {
    const body = await readBody(req);
    if (!isRecord(body) || typeof body.tema !== "string") throw new HttpError(400, "Indica el tema a vincular.");
    return sendJson(res, 200, await linkTema(root, id, body.tema));
  };

  const materiaRemove = async (_req: IncomingMessage, res: ServerResponse, action: string) => {
    const match = /^api\/materias\/([a-f0-9]{32})\/(fuentes|temas)\/([^/]+)$/.exec(action);
    if (!match) throw new HttpError(404, "not found");
    const [, id, section, rawLeaf] = match;
    let leaf: string;
    try {
      leaf = decodeURIComponent(rawLeaf);
    } catch {
      throw new HttpError(400, "Identificador no válido.");
    }
    if (section === "fuentes") {
      await deleteFuente(root, id, leaf);
      try { desindizarFuente(root, id, leaf); } catch { /* the source is already in the trash */ }
      res.writeHead(204);
      res.end();
      return;
    }
    return sendJson(res, 200, await unlinkTema(root, id, leaf));
  };

  const post = async (req: IncomingMessage, res: ServerResponse, action: string) => {
    const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicOrigins ?? []).map((origin) => origin.origin)]);
    if (!allowed.has(String(req.headers.origin ?? ""))) throw new HttpError(403, "foreign origin");
    // Raw uploads and audio are streamed; every other POST carries JSON.
    if (action === "api/subir") return upload(req, res);
    if (action === "api/transcribe") return transcribe(req, res);
    if (action === "api/materias") return materiaCreate(req, res);
    const materiaPost = /^api\/materias\/([a-f0-9]{32})\/(fuentes|temas)$/.exec(action);
    if (materiaPost) {
      if (materiaPost[2] === "fuentes") return materiaFuente(req, res, materiaPost[1]);
      return materiaTema(req, res, materiaPost[1]);
    }
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "JSON only");
    const bodyLimit = action === "api/aprender" ? MAX_LEARNING_SOURCE_BODY_BYTES : MAX_BODY_BYTES;
    const body = await readBody(req, bodyLimit);
    switch (action) {
      case "api/preferences":
        return sendJson(res, 200, savePreferences(root, body));
      case "api/preferences/descubrir":
        return sendJson(res, 200, descubrir(root));
      case "api/preferences/olvidar": {
        if (!isRecord(body) || typeof body.id !== "string") throw new HttpError(400, "invalid aspect");
        return sendJson(res, 200, olvidar(root, body.id));
      }
      case "api/sugerencias":
        return sendJson(res, 200, recordSugerencia(root, body));
      case "api/valoraciones":
        // What the learner thought of a part: a verdict with reasons, kept apart from suggestions.
        return sendJson(res, 200, recordValoracion(root, body));
      case "api/regenerar": {
        if (options.agentDisabled) throw new HttpError(503, "El tutor está desactivado.");
        if (!isRecord(body)) throw new HttpError(400, "No pude leer la regeneración.");
        const tema = typeof body.tema === "string" ? body.tema : "";
        const parte = typeof body.parte === "string" ? body.parte : "";
        if (!/^[\w-]+$/.test(tema) || !/^p\d+$/.test(parte)) throw new HttpError(400, "Esa parte no se puede regenerar.");
        // Everything that can refuse this request happens before anything moves: a refused
        // regeneration must leave the part in the library, not in the trash.
        const input = validateSugerencia({ tema, parte, motivos: body.motivos, texto: body.texto, origen: "regenerar" });
        const planned = regenerationTrash(root, { topic: tema, part: parte });
        const text = regenerationPrompt(tema, parte, input, planned.trash);
        if (text.length > MAX_PROMPT_CHARS) throw new HttpError(400, "La regeneración pide demasiado texto de una vez.");
        const saved = recordSugerencia(root, { ...input, origen: "regenerar" });
        // The writer ticket is taken before the backup moves a single file. A busy topic queues
        // here; it never writes an old version aside ahead of the turn that owns it.
        const lock = await locks.acquire(tema);
        const taskSession = enrolled(root, tema) ? ensureTask(tema) : main;
        if (taskSession.kind === "task" && missingRuntime(taskSession)) startTaskRuntime(taskSession);
        // A part lives in a deep topic: a regeneration the engine does not clear is not an end.
        // Every exit of the turn puts the previous version back unless the new one passes (#316).
        try {
          await startTurn(taskSession, text, {
            topic: enrolled(root, tema) ? tema : null,
            lock,
            backup: () => ({ ...backupPartForRegeneration(root, { topic: tema, part: parte }, new Date(), planned.trash || undefined), part: parte }),
          });
        } catch (error) { lock.release(); throw error; }
        return sendJson(res, 200, { ok: true, prompt: text, trash: planned.trash, entrada: saved.entrada });
      }
      case "api/telemetry": {
        if (isRecord(body) && body.entry) {
          const result = recordQuizTelemetry(root, body.entry);
          return sendJson(res, 200, { ok: true, ...result });
        }
        return sendJson(res, 200, { ok: true, global: saveGlobalTelemetry(root, body) });
      }
      case "api/tutor": {
        if (main.turn) throw new HttpError(409, TURN_ACTIVE);
        // Checked before the save, so a refused tutor never replaces the one that works.
        if (isRecord(body) && body.agente === "api") {
          const modelo = typeof body.modelo === "string" ? body.modelo : "";
          const pensamiento = typeof body.pensamiento === "string" ? body.pensamiento : "";
          const id = (typeof body.proveedor === "string" && body.proveedor) || proveedorDisponible(options.apiEnv ?? process.env)?.id || "";
          const provider = id ? proveedorPorId(id) : null;
          if (!provider) throw new HttpError(400, "Para usar Mistral exporta MISTRAL_API_KEY y reinicia el estudio.");
          if (!provider.implementado) throw new HttpError(400, `${provider.nombre} todavía no está implementado`);
          // A named provider whose key is gone must not replace a tutor that works: every turn
          // would then fail while the page said the tutor was ready.
          if (!String((options.apiEnv ?? process.env)[provider.variable] ?? "").trim()) {
            throw new HttpError(400, `Exporta ${provider.variable} y reinicia el estudio antes de guardar ${provider.nombre}.`);
          }
          if (!modelo) throw new HttpError(400, `Elige un modelo de ${provider.nombre} antes de guardar el tutor.`);
          const niveles = nivelesDeEffort(modelo);
          if (pensamiento && !niveles.includes(pensamiento)) {
            throw new HttpError(400, `${provider.nombre} no acepta «${pensamiento}» en ${modelo}; elige ${niveles.length ? niveles.join(", ") : "ningún nivel"}.`);
          }
        }
        const config = saveTutor(root, body);
        startTutor(config);
        return sendJson(res, 200, config);
      }
      case "api/tema": {
        if (main.turn) throw new HttpError(409, TURN_ACTIVE);
        main.tema = requireTopic(body.tema);
        main.gateBlocked = false;
        return sendJson(res, 200, { tema: main.tema });
      }
      case "api/aprender": {
        // One of the learner's questions, asked by the page: the mode is decided before the turn.
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const hasSources = Array.isArray(body.fuentes) && body.fuentes.length > 0;
        if (!text && !hasSources) throw new HttpError(400, "escribe qué quieres aprender");
        if (text.length > MAX_LEARNING_SOURCE_CHARS) {
          throw new HttpError(400, `El texto es demasiado largo: como mucho ${MAX_LEARNING_SOURCE_CHARS} caracteres.`);
        }
        requireNoTurn(main);
        const modo = STUDY_MODES.find((mode) => mode === body.modo);
        if (!modo) throw new HttpError(400, "elige rápido, universitario, examen o audio antes de enviar");
        let examen: ExamChoice | undefined;
        const fuentes = uploadedSources(root, body.fuentes);
        if (modo === "examen") {
          const choice = body.examen;
          if (!isRecord(choice) || (choice.formato !== "oral" && choice.formato !== "written" && choice.formato !== "practical" && choice.formato !== "deducir")) {
            throw new HttpError(400, "Elige un formato válido para tu examen: oral, escrito, práctico o deducir.");
          }
          const formato: ExamFormat = choice.formato;
          if (formato === "practical") {
            if (typeof choice.practica !== "string" || !choice.practica.trim()) {
              throw new HttpError(400, "Indica qué tipo de práctica requiere tu examen práctico.");
            }
            examen = { formato, practica: choice.practica.trim() };
          } else {
            if (formato === "deducir" && fuentes.length === 0) throw new HttpError(400, UPLOAD_ERRORS.deducir);
            if (Object.hasOwn(choice, "practica")) {
              throw new HttpError(400, "Solo puedes indicar una práctica para el formato práctico.");
            }
            examen = { formato };
          }
        } else if (Object.hasOwn(body, "examen")) {
          throw new HttpError(400, "Los datos del examen solo se aceptan en modo examen.");
        }
        // The course the new topic is born in: an existing one, and only its id. An unknown or
        // malformed id is refused here, before any turn exists to be sorry about (#407/T2b).
        let materia: string | undefined;
        if (body.materia !== undefined) {
          if (typeof body.materia !== "string" || !/^[a-f0-9]{32}$/.test(body.materia)) throw new HttpError(400, MATERIA_ERRORS.curso);
          try {
            getMateria(root, body.materia);
          } catch (error) {
            if (error instanceof HttpError && error.status === 404) throw new HttpError(400, MATERIA_ERRORS.curso);
            throw error;
          }
          materia = body.materia;
        }
        // A deep-mode request's topic does not exist yet: its first write under a topic folder
        // binds it, and the gate asks the engine about that folder when it settles.
        const fuentesPrompt = fuentes.length ? `\n${fuentesLine(fuentes)}` : "";
        const learningTarget = text || "el tema que aparece en el examen o documento adjunto";
        await startTurn(main, `Quiero aprender ${learningTarget}.\n\n${modeLine(modo, examen)}${fuentesPrompt}`, { topic: null, creation: modo === "universitario" || modo === "examen", ...(materia ? { materia } : {}) });
        return sendJson(res, 200, { ok: true, modo });
      }
      case "api/metodo": {
        // The engine's method stage, answered on the page: recorded with the engine's own command.
        requireNoTurn(main);
        const topic = requireTopic(body.tema);
        const metodo = body.metodo === "pareto" || body.metodo === "preferencias" ? body.metodo : "";
        if (!metodo) throw new HttpError(400, "elige pareto o preferencias");
        const report = await recordMethod(topic, metodo);
        if (!PASS_STATUSES.has(String(report.status))) {
          const failed = Array.isArray(report.checks) ? report.checks.find((check) => isRecord(check) && check.status === "FAIL") : undefined;
          const reason = isRecord(failed) && typeof failed.reason === "string" ? failed.reason : String(report.status);
          process.stderr.write(`estudio: el motor no aceptó el método ${metodo} en ${topic} · ${reason}\n`);
          throw new HttpError(409, "El motor no aceptó esa elección: el tema no está en el momento de elegir el método.");
        }
        main.tema = topic;
        main.gateBlocked = false;
        recordPageMethod(topic, metodo);
        emit("library_changed", {});
        const lock = await locks.acquire(topic);
        try {
          // The tutor continues to planning with the method the learner just chose.
          await startTurn(main, methodPrompt(metodo), { topic, lock });
        } catch (error) { lock.release(); throw error; }
        return sendJson(res, 200, { ok: true, metodo });
      }
      case "prompt": {
        const text = body.text;
        if (typeof text !== "string" || !text.trim() || text.length > MAX_PROMPT_CHARS) {
          throw new HttpError(400, `El mensaje tiene que tener texto, como mucho ${MAX_PROMPT_CHARS} caracteres.`);
        }
        // One turn at a time, studio-wide. This early check only saves the engine call below;
        // `startTurn` refuses the turn itself, so no path can slip in through the gate window.
        requireNoTurn(main);
        // A prompt with no tema is the general chat or a quick note: the engine tracks no topic
        // there, so there is nothing to gate. A prompt for a topic a task is writing waits for that
        // topic's ticket instead of starting a second writer.
        const deep = body.tema === undefined ? null : requireTopic(body.tema);
        if (deep !== null && deep === main.tema && main.gateBlocked) {
          // A blocked topic is re-asked before it is refused, so passing releases it again.
          const { verdict } = await runGate(main, deep);
          if (!verdict.passing) throw new HttpError(409, `El motor no dio por cerrado el último turno de «${deep}»; vuelve a pedírselo.`);
        }
        const lock = deep === null ? null : await locks.acquire(deep);
        try {
          await startTurn(main, text.trim(), { topic: deep, lock });
        } catch (error) { lock?.release(); throw error; }
        break;
      }
      case "dialog":
      case "api/tareas/dialogo": {
        const session = action === "dialog" ? main : taskFor(body.task);
        const id = body.id;
        if (typeof id !== "string" || !session.dialogs.has(id)) throw new HttpError(404, "Ese diálogo ya no está abierto.");
        const response: Json = { type: "extension_ui_response", id };
        if (body.cancelled === true) response.cancelled = true;
        else if (typeof body.confirmed === "boolean") response.confirmed = body.confirmed;
        else if (typeof body.value === "string" && body.value.length <= MAX_PROMPT_CHARS) response.value = body.value;
        else throw new HttpError(400, "dialog answer needs value, confirmed or cancelled");
        write(session, response);
        session.dialogs.delete(id);
        session.emit("dialog_closed", { id });
        if (session.kind === "task") emitTareas();
        break;
      }
      case "abort":
      case "api/tareas/abortar": {
        // A turn the learner stopped is not the engine's business: releasing it here is what makes
        // the abort final, whatever the runtime reports afterwards. Each Session owns its abort.
        const session = action === "abort" ? main : taskFor(body.task);
        const cause = isRecord(body) && body.cause === "update" ? "update" : undefined;
        const held = session.turn;
        if (held) held.aborted = true;
        // The runtime is stopped before the rollback moves anything back: a process that is still
        // writing would otherwise land its part on top of the version the learner was told is kept
        // (#460). Either way the turn is released, so an abort is final.
        try {
          if (session.agy) session.agy.abort();
          else if (session.api) session.api.abort();
          else if (session.child) await call(session, { type: "abort" }, 60000);
        } finally {
          releaseTurn(session);
          if (cause !== undefined && held !== null) {
            session.interrupted = { topic: held.topic, at: Date.now(), cause };
            session.saveSnapshot();
          }
        }
        if (session.kind === "task") emitTareas();
        break;
      }
      case "api/draft": {
        const written = (value: unknown) => (typeof value === "string" ? value : "");
        const markdown = body.body;
        if (typeof markdown !== "string") throw new HttpError(400, "body must be a string");
        if (markdown.length > DRAFT_MAX_CHARS) throw new HttpError(413, "draft too long");
        // The studio and the bridge share a machine: talk over loopback, never through
        // the public proxy, whose certificate a Node fetch would refuse. The URL handed
        // back is the public one, because the browser — not this process — loads it.
        const reader = await view();
        const localBase = String(reader.localBase ?? reader.base);
        const publicBase = String(reader.base);
        const answer = await fetch(new URL("api/draft", localBase), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: written(body.title), body: markdown }),
        });
        if (!answer.ok) throw new HttpError(answer.status === 413 ? 413 : 502, "the reader refused the draft");
        const draft = (await answer.json()) as { url?: unknown };
        if (typeof draft.url !== "string") throw new HttpError(502, "the reader returned no draft url");
        return sendJson(res, 200, { url: new URL(draft.url, publicBase).href });
      }
      case "save-note": {
        const text = (value: unknown) => (typeof value === "string" ? value : undefined);
        const body_ = body.body;
        if (typeof body_ !== "string") throw new HttpError(400, "body must be a string");
        // The deck rules are the same ones the publishing gate runs, so a note
        // the reader would break cannot be stored in the first place.
        const problems = lintMarkdown(body_);
        if (problems.length) {
          return sendJson(res, 400, {
            error: `${problems.length} problem(s) in the guided decks`,
            problems,
          });
        }
        let result: { id: string; rev: string; created: boolean };
        try {
          result = writeQuickNote(root, { quick: text(body.quick), title: text(body.title), body: body_, rev: text(body.rev) });
        } catch (err) {
          if (err instanceof NoteRevMismatch) return sendJson(res, 409, { error: err.message, rev: err.rev });
          // The bridge owns the vault rules, so its status is the answer, never a 500.
          throw err instanceof HttpError ? err : new HttpError(Number((err as { status?: number }).status) || 500, (err as Error).message);
        }
        emit("library_changed", {});
        return sendJson(res, 200, { ok: true, ...result });
      }
      case "delete": {
        const kind = body.kind;
        if (kind !== "topic" && kind !== "part" && kind !== "quick") throw new HttpError(400, "kind must be topic, part or quick");
        const text = (value: unknown) => (typeof value === "string" ? value : undefined);
        let result: DeleteResult;
        try {
          result = deleteNote(root, { kind, topic: text(body.topic), part: text(body.part), quick: text(body.quick) });
        } catch (err) {
          // The bridge owns the vault rules, so its status is the answer and never a 500.
          throw err instanceof HttpError ? err : new HttpError(Number((err as { status?: number }).status) || 500, (err as Error).message);
        }
        emit("library_changed", {});
        return sendJson(res, 200, { ok: true, ...result });
      }
      case "opened": {
        const topic = body.topic;
        if (typeof topic !== "string") throw new HttpError(400, "topic must be a string");
        if (!listTopics(root).some((t) => t.id === topic)) throw new HttpError(404, `unknown topic: ${topic}`);
        recordOpened(topic);
        break;
      }
      case "api/chats": {
        const nombre = isRecord(body) ? body.nombre : undefined;
        const ambito = isRecord(body) ? body.ambito : undefined;
        const { doc } = await newConversation({ nombre, ambito });
        return sendJson(res, 200, doc);
      }
      case "api/chats/abrir": {
        // The reader opens a part by its address: the first open creates the chat it comes back to.
        if (isRecord(body) && typeof body.ambito === "string") {
          const found = chatForAmbito(chats, body.ambito);
          if (found) return sendJson(res, 200, await openConversation(found.id));
          const { doc } = await newConversation({ nombre: typeof body.nombre === "string" ? body.nombre : body.ambito, ambito: body.ambito });
          return sendJson(res, 200, doc);
        }
        return sendJson(res, 200, await openConversation(chatIdOf(body)));
      }
      case "api/chats/renombrar": {
        const id = chatIdOf(body);
        const doc = persist(renameChat(chats, id, isRecord(body) ? body.nombre : undefined));
        // Pi's own name is cosmetic; the index is the list, so a refusal here is not fatal.
        if (!main.agy && id === chats.activo) await call(main, { type: "set_session_name", name: chatById(doc, id).nombre }).catch(() => undefined);
        emit("chats", doc);
        return sendJson(res, 200, doc);
      }
      case "api/chats/borrar": {
        const id = chatIdOf(body);
        const chat = chatById(chats, id);
        const doc = persist(deleteChat(chats, id));
        // The file goes only after the index stopped pointing at it, and only inside Pi's own store.
        if (chat.piSession) {
          const contained = resolveContained(piSessionsRoot(), chat.piSession);
          if (contained.ok) rmSync(contained.targetReal, { force: true });
        }
        emit("chats", doc);
        return sendJson(res, 200, doc);
      }
      case "api/chats/exportar": {
        const id = chatIdOf(body);
        if (main.agy) throw new HttpError(400, "Antigravity does not export conversations");
        if (id !== chats.activo) throw new HttpError(409, "Abre la conversación antes de exportarla.");
        const chat = chatById(chats, id);
        // Pi writes the export into its working directory, which here is the vault.
        // The file is named outside it instead, next to the conversation index.
        const dir = join(dirname(chatsFile), "exports");
        mkdirSync(dir, { recursive: true });
        const slug = chat.nombre.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chat";
        const outputPath = join(dir, `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
        const reply = await call(main, { type: "export_html", outputPath }, 30000);
        // Pi's own refusal is the answer: an empty conversation cannot be exported.
        if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi no quiso exportar la conversación."));
        const path = isRecord(reply.data) && typeof reply.data.path === "string" ? reply.data.path : "";
        if (!path) throw new HttpError(502, "Pi no exportó la conversación.");
        return sendJson(res, 200, { path });
      }
      case "new-session": {
        // The old control now creates a chat: the list is the only source of conversations.
        await newConversation({ nombre: `Chat ${chats.chats.length + 1}` });
        break;
      }
      case "restart":
        if (options.agentDisabled) throw new HttpError(503, "El tutor está desactivado.");
        // Restart is the escape hatch for the main chat; running tasks finish on their runtime.
        startTutor(tutor);
        break;
      default:
        throw new HttpError(404, "not found");
    }
    sendJson(res, 200, { ok: true });
  };

  /** What the chat shows about a turn a previous process was holding: the topic, its title and why it ended. */
  const interruptedView = (session: Session) => {
    const turn = session.interrupted;
    if (turn === null) return null;
    const topic = turn.topic;
    const view = { topic, title: topic === null ? null : listTopics(root).find((t) => t.id === topic)?.title ?? topic };
    return turn.cause === undefined ? view : { ...view, cause: turn.cause };
  };

  type History = { messages: Json[]; note: Note | null; interrupted: { topic: string | null; title: string | null; cause?: "update" } | null };
  const history = async (session: Session): Promise<History> => {
    const copy = session.transcript.map((message) => ({ role: message.role, text: message.text }));
    // A task's own copy is authoritative: Pi's `get_messages` reports the one session it is in,
    // which belongs to the main chat, not to a topic's separate process. Its interruption is kept
    // on disk for the next turn, but the learner only reads the task's state and activity line.
    // The studio's notices go back into the runtime's thread, which never carries them (#393). An empty
    // thread stays empty, so a restart's saved copy is never replaced by the notices alone.
    const agyThread = () => (session.agyTurns.length ? withStudioNotices([...session.agyTurns], session.transcript) : []);
    if (session.kind === "task") return { messages: session.agy ? agyThread() : copy, note: null, interrupted: null };
    const shown = interruptedView(session);
    if (!session.alive || session.agy) return { messages: session.agy ? agyThread() : copy, note: null, interrupted: shown };
    try {
      const reply = await call(session, { type: "get_messages" }, 10000);
      const raw = isRecord(reply.data) && Array.isArray(reply.data.messages) ? reply.data.messages : [];
      const messages = raw
        .filter((m): m is Json => isRecord(m) && (m.role === "user" || m.role === "assistant"))
        // The studio's blocks travel inside the turn's prompt, so the thread keeps the learner's
        // words and never what was added after them.
        .map((m) => ({ role: m.role, text: m.role === "user" ? stripGustos(stripTema(stripLecciones(messageText(m)))) : messageText(m) }))
        // The gate's instruction is the studio's own prompt: the thread keeps the learner's words.
        .filter((m) => m.text && !(m.role === "user" && isStudioPrompt(m.text)));
      // A runtime that lost the conversation still has the studio's own copy of the turn.
      return { messages: messages.length ? withStudioNotices(messages, session.transcript) : copy, note: noteFromMessages(raw, root), interrupted: shown };
    } catch {
      return { messages: copy, note: null, interrupted: shown };
    }
  };

  /** The copy follows what the runtime serves, so a restart falls back to the whole thread. */
  const rememberHistory = async () => {
    const shown = await history(main);
    if (shown.messages.length) {
      main.transcript = shown.messages.map((message) => ({ role: message.role as ChatMessage["role"], text: String(message.text) }));
      main.saveSnapshot();
    }
    return shown;
  };

  /** The update notice is one notice: once a page has been sent it, no later page or restart repeats it. */
  const spendUpdateNotice = () => {
    if (main.interrupted?.cause !== "update") return;
    main.interrupted = null;
    main.saveSnapshot();
  };

  /** A known topic is needed before a task stream can name whose frames it wants. */
  const taskFor = (value: unknown): Session => {
    if (typeof value !== "string" || !/^[\w-]+$/.test(value)) throw new HttpError(400, "task must be a topic name");
    if (!listTopics(root).some((topic) => topic.id === value)) throw new HttpError(404, `unknown task: ${value}`);
    return ensureTask(value);
  };

  const events = async (res: ServerResponse) => {
    // A page on the studio holds it open, even before the stream has written its first frame.
    holdIdle();
    // Whatever ends this connection, the studio is unwatched again when it closes.
    res.on("close", () => {
      clients.delete(res);
      armIdle();
    });
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
    const shown = await history(main);
    res.write(`event: history\ndata: ${JSON.stringify(shown)}\n\n`);
    if (shown.interrupted?.cause === "update") spendUpdateNotice();
    res.write(`event: state\ndata: ${JSON.stringify(main.state())}\n\n`);
    for (const dialog of main.dialogs.values()) res.write(`event: dialog\ndata: ${JSON.stringify(dialog)}\n\n`);
    res.write(`event: tareas\ndata: ${JSON.stringify({ tareas: taskViews() })}\n\n`);
    // A page that left while the history was being read has already fired its close: counting
    // it now would hold the studio open for a client that is not there.
    if (!res.destroyed) clients.add(res);
  };

  /** A task stream carries the same event names as the chat, with `task` on every data object. */
  const taskEvents = async (res: ServerResponse, session: Session) => {
    holdIdle();
    const leave = () => {
      const group = taskClients.get(session.id);
      group?.delete(res);
      if (group?.size === 0) taskClients.delete(session.id);
      allTaskClients.delete(res);
      armIdle();
    };
    res.on("close", leave);
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
    const shown = await history(session);
    const frame = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify({ ...(isRecord(data) ? data : {}), task: session.id })}\n\n`);
    frame("historial", shown);
    frame("estado", session.state());
    for (const dialog of session.dialogs.values()) frame("dialog", dialog);
    frame("tareas", { tareas: taskViews() });
    if (!res.destroyed) {
      let group = taskClients.get(session.id);
      if (!group) { group = new Set(); taskClients.set(session.id, group); }
      group.add(res);
      allTaskClients.add(res);
    }
  };

  const tokenMatches = (candidate: string) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(publicOrigins ?? []).map((origin) => origin.host)]);
    if (!hosts.has(String(req.headers.host ?? ""))) throw new HttpError(403, "host not allowed");
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    // http://127.0.0.1:<port>/ is a stable, bookmarkable entry; every route behind it needs the token.
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(302, { location: `/${token}/`, "cache-control": "no-store", "referrer-policy": "no-referrer" });
      res.end();
      return;
    }
    // The service worker that keeps the studio readable with no connection. It is static
    // code with no secret, served at the root so its scope covers the root address too.
    if (url.pathname === "/sw.js" && req.method === "GET") {
      return send(res, 200, "text/javascript; charset=utf-8", readFileSync(join(UI_DIR, "sw.js")), { "cache-control": "no-cache" });
    }
    const [first = "", ...rest] = url.pathname.split("/").slice(1);
    if (!tokenMatches(first)) throw new HttpError(404, "not found");
    const path = rest.join("/");
    if (req.method === "POST") return post(req, res, path);
    if (req.method === "DELETE") return materiaRemove(req, res, path);
    if (req.method !== "GET") throw new HttpError(405, "method not allowed");
    const materiaDetail = /^api\/materias\/([a-f0-9]{32})$/.exec(path);
    if (materiaDetail) return sendJson(res, 200, getMateria(root, materiaDetail[1]));
    const indiceBuscar = /^api\/materias\/([a-f0-9]{32})\/buscar$/.exec(path);
    if (indiceBuscar) {
      const id = indiceBuscar[1];
      getMateria(root, id);
      const consulta = (url.searchParams.get("q") ?? "").trim();
      if (!consulta) throw new HttpError(400, "Incluye una consulta en q.");
      const rawK = url.searchParams.get("k");
      const k = rawK === null ? 8 : Number(rawK);
      if (!Number.isSafeInteger(k) || k < 1 || k > 50) throw new HttpError(400, "k debe estar entre 1 y 50.");
      const tipos = url.searchParams.getAll("tipo");
      const validos = new Set(["examen", "documento", "transcripcion"]);
      if (tipos.some((tipo) => !validos.has(tipo))) throw new HttpError(400, "tipo debe ser examen, documento o transcripcion.");
      const modo = url.searchParams.get("modo") ?? "hibrido";
      if (modo !== "hibrido" && modo !== "claves" && modo !== "semantico") throw new HttpError(400, "modo debe ser hibrido, claves o semantico.");
      return sendJson(res, 200, await buscar(root, id, consulta, { k, tipos, modo }));
    }
    const indiceEstado = /^api\/materias\/([a-f0-9]{32})\/indice$/.exec(path);
    if (indiceEstado) {
      getMateria(root, indiceEstado[1]);
      return sendJson(res, 200, estadoIndice(root, indiceEstado[1]));
    }
    switch (path) {
      case "":
        return send(res, 200, "text/html; charset=utf-8", shell(), { "content-security-policy": shellCsp() });
      case "studio.js":
      case "tutorial.js":
        return send(res, 200, "text/javascript; charset=utf-8", readFileSync(join(UI_DIR, path)));
      case "kit/scene.js":
      case "kit/theme.js":
      case "kit/dictate.js":
      case "kit/question.js":
      case "kit/code-field.js":
        // The reader's own scripts, served by the studio: one paper, one dictation box, one kit.
        return send(res, 200, "text/javascript; charset=utf-8", readFileSync(join(HERE, "..", "integrations", "pi", "kit", path.slice(4))));
      case "studio.css":
        return send(res, 200, "text/css; charset=utf-8", readFileSync(join(UI_DIR, "studio.css")));
      case "favicon.svg":
        // The same mark the reader serves, so both surfaces share one icon file.
        return send(res, 200, "image/svg+xml", readFileSync(join(HERE, "..", "integrations", "pi", "view", "favicon.svg")), { "cache-control": "public, max-age=3600" });
      case "events":
        return events(res);
      case "api/tareas":
        return sendJson(res, 200, { tareas: taskViews() });
      case "api/tareas/historial": {
        const session = taskFor(url.searchParams.get("task"));
        return sendJson(res, 200, { task: session.id, ...(await history(session)), estado: taskState(session), activity: session.activity, queued: locks.queued(session.id) });
      }
      case "api/tareas/eventos":
        return taskEvents(res, taskFor(url.searchParams.get("task")));
      case "api/library":
        return sendJson(res, 200, await library());
      case "api/materias":
        return sendJson(res, 200, listMaterias(root));
      case "api/runners": {
        // The studio asks on its own after the shell paints: Docker never blocks a page,
        // and a cheap topic check never runs the engine status of every topic.
        const topic = url.searchParams.get("tema");
        const dir = topic && /^[\w-]+$/.test(topic) && existsSync(join(root, topic)) ? join(root, topic) : undefined;
        return sendJson(res, 200, await runnerList(loadCatalogue({ topicDir: dir })));
      }
      case "api/chats": {
        // The list is only true once the boot session has been adopted.
        await main.ready;
        // The active Pi chat reports its usage live; the others keep the last value seen.
        if (!main.agy) {
          const stats = await piStats(main);
          const current = activeChat();
          if (current && stats.contexto) persist(recordContexto(chats, current.id, stats.contexto));
        }
        return sendJson(res, 200, chats);
      }
      case "api/preferences":
        return sendJson(res, 200, readPreferences(root));
      case "api/tutor":
        return sendJson(res, 200, readTutor(root));
      case "api/proveedores":
        // Presence and a reason, never a key: the page learns whether it can offer the provider.
        return sendJson(res, 200, { proveedores: detectar(options.apiEnv ?? process.env) });
      case "api/tutor/modelos": {
        // The catalogue belongs to the runtime selected in the page, which may not be saved yet.
        const saved = readTutor(root);
        const provider = url.searchParams.get("agente") ?? saved.agente;
        if (!(TUTOR_AGENTS as readonly string[]).includes(provider)) throw new HttpError(400, "agente must be pi, agy or api");
        const modelo = url.searchParams.get("modelo") ?? saved.modelo;
        if (provider === "api") {
          const id = saved.proveedor || proveedorDisponible(options.apiEnv ?? process.env)?.id || "mistral";
          const catalogo = await apiCatalog(id);
          return sendJson(res, 200, { ...catalogo, pensamientos: nivelesDeEffort(modelo) });
        }
        // A model the API does not document gets no levels: the page says so instead of guessing.
        return sendJson(res, 200, {
          modelos: provider === "agy" ? await agyCatalog() : await piCatalog(),
          pensamientos: provider === "agy" ? AGY_LEVELS : PI_LEVELS,
        });
      }
      case "api/tema":
        return sendJson(res, 200, { tema: main.tema });
      case "api/preferences/candidatos": {
        const preferences = readPreferences(root);
        const taken = new Set([...preferences.aspectos.map((a) => a.id), ...(preferences.rechazados ?? [])]);
        return sendJson(res, 200, { candidatos: candidatos(readGlobalTelemetry(root)).filter((c) => !taken.has(c.id)) });
      }
      case "api/sugerencias/resumen":
        return sendJson(res, 200, resumenSugerencias(root));
      case "api/valoraciones":
        return sendJson(res, 200, listarValoraciones(root, {
          tema: url.searchParams.get("tema") ?? undefined,
          parte: url.searchParams.get("parte") ?? undefined,
        }));
      case "api/sugerencias":
        return sendJson(res, 200, listSugerencias(root, {
          tema: url.searchParams.get("tema") ?? undefined,
          parte: url.searchParams.get("parte") ?? undefined,
        }));
      case "api/contexto":
        // The lines a writing prompt carries: preferences, weak spots and the learner's words.
        return sendJson(res, 200, { texto: tutorContext(root, url.searchParams.get("tema") ?? undefined) });
      case "api/espera": {
        // Useful waiting: the map is always from plan.json; the questions come only from the
        // diagnosis or answered mini-quizzes, and the glossary from its own bounded short call.
        const topic = url.searchParams.get("topic") ?? "";
        const part = url.searchParams.get("part") ?? "";
        if (!/^[\w-]+$/.test(topic) || !/^p\d+$/.test(part)) throw new HttpError(400, "invalid topic or part");
        const plan = readPlan(join(root, topic));
        if (!plan?.parts.some((entry) => entry.id === part)) throw new HttpError(404, `part ${part} is not in plan.json`);
        glosario.start(topic, part, {
          topicTitle: plan.topic || topic,
          partTitle: plan.parts.find((entry) => entry.id === part)!.title,
          subtemas: plan.parts.map((entry) => entry.subtema).filter((subtema) => subtema !== ""),
        });
        return sendJson(res, 200, buildEspera(root, topic, part, {
          revelar: url.searchParams.get("revelar") === "1",
          glosario: glosario.view(topic, part),
          preguntasGlosario: glosario.questions(topic, part),
        }));
      }
      case "api/telemetry": {
        const topic = url.searchParams.get("topic");
        if (topic) {
          return sendJson(res, 200, {
            global: readGlobalTelemetry(root),
            topic: readTopicTelemetry(root, topic),
          });
        }
        return sendJson(res, 200, readGlobalTelemetry(root));
      }
      case "api/panorama": {
        const id = url.searchParams.get("topic") ?? "";
        const summary = listTopics(root).find((topic) => topic.id === id);
        if (!summary) throw new HttpError(404, `no such topic ${id}`);
        const report = await engineStatus(join(root, summary.id));
        const text = (name: string) => {
          const found = resolveContained(root, join(root, summary.id, name));
          return found.ok && existsSync(found.targetReal) ? readFileSync(found.targetReal, "utf8") : undefined;
        };
        return sendJson(
          res,
          200,
          buildPanorama(
            {
              id: summary.id,
              title: summary.title,
              status: String(report.status ?? ""),
              stage: String(report.stage ?? ""),
              nextStage: String(report.nextStage ?? ""),
              part: String(report.part ?? ""),
              parts: summary.parts.map((part) => ({ id: part.id, title: part.title, written: part.written })),
            },
            {
              planJson: text("plan.json"), plan: text("planificador.md"), map: text("mapa.mmd"),
              diagnosis: text("diagnostico-conceptos.json"),
              feedback: Object.fromEntries(summary.parts.map((part) => [part.id, text(`feedback/${part.id}.json`)])),
            },
          ),
        );
      }
      case "api/note": {
        const quick = url.searchParams.get("quick") ?? "";
        return sendJson(res, 200, readQuickNote(root, quick));
      }
      case "api/offline": {
        // One written part as a single file that reads with no connection (docs/studio.md).
        const topic = url.searchParams.get("topic") ?? "";
        const part = url.searchParams.get("part") ?? "";
        const entry = listTopics(root).find((t) => t.id === topic)?.parts.find((p) => p.id === part);
        if (!entry?.written) throw new HttpError(404, `no written part ${part} in ${topic}`);
        // A part the studio's own measurement rejected is not packaged for reading either (#452).
        assertPartServes(topic, part);
        // Over loopback, like the draft preview: the public proxy's certificate is for browsers.
        const reader = await view(topic, part);
        const publicBase = String(reader.base);
        const localBase = String(reader.localBase ?? reader.base);
        const page = new URL(String(reader.url).slice(publicBase.length), localBase).href;
        let html: string;
        try {
          html = await snapshotPage(page, partLoader(localBase, offlineCacheDir), [token]);
        } catch (err) {
          throw new HttpError(502, `could not save the part: ${(err as Error).message}`);
        }
        return send(res, 200, "text/html; charset=utf-8", html, { "content-security-policy": OFFLINE_CSP });
      }
      case "api/view": {
        const quick = url.searchParams.get("quick");
        if (quick !== null) {
          const file = join(root, "rapidos", `${quick}.md`);
          if (!/^[\w-]+$/.test(quick) || !existsSync(file)) throw new HttpError(404, `no quick note ${quick}`);
          return sendJson(res, 200, { url: `${String((await view()).base)}rapidos/${encodeURIComponent(quick)}` });
        }
        const audio = url.searchParams.get("audio");
        if (audio !== null) {
          if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(audio)) throw new HttpError(404, `no audio session ${audio}`);
          return sendJson(res, 200, { url: `${String((await view()).base)}audios/${audio}` });
        }
        const topic = url.searchParams.get("topic") ?? undefined;
        const part = url.searchParams.get("part") ?? "";
        // A part the studio's own measurement rejected is not served as if it had passed (#452).
        if (topic !== undefined) assertPartServes(topic, part);
        const result = await view(topic, part === "" ? undefined : part);
        return sendJson(res, 200, { url: result.url });
      }
      default:
        throw new HttpError(404, "not found");
    }
  };

  const server: Server = createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (!res.headersSent) sendJson(res, status, { error: (err as Error).message });
      else res.end();
    });
  });
  // A fixed port keeps the browser's origin (and what it remembers, like the tutorial) across runs;
  // if it is taken, any free port works.
  await new Promise<void>((resolve, reject) => {
    const listen = (wanted: number) => {
      server.once("error", (err: NodeJS.ErrnoException) => (err.code === "EADDRINUSE" && wanted !== 0 && options.publicOrigin === undefined ? listen(0) : reject(err)));
      server.listen(wanted, "127.0.0.1", () => resolve());
    };
    listen(options.port ?? 0);
  });
  port = (server.address() as { port: number }).port;

  // The reader's token follows the studio's: a configured studio token keeps open pages working across restarts.
  registerBridge(fakePi as never, {
    root,
    // A topic queues instead of refusing: the ticket is held before the answer file is written.
    lockTopic: (topic: string) => {
      // Make the waiting task visible before its first message reaches the turn.
      if (enrolled(root, topic)) ensureTask(topic);
      const waiting = locks.acquire(topic);
      // acquire() queues synchronously: this claim can tell the bridge to answer 202 at once,
      // while the ticket it carries still grants the write only when the topic is free.
      const queued = locks.queued(topic) > 0;
      // The queue length changes synchronously inside acquire; publish it before the await.
      queueMicrotask(emitTareas);
      const ticket = waiting.then((owned) => {
        // One flag ends the bridge's ownership, whether by handoff to a turn or by release.
        // The ticket itself is idempotent, so both owners can let go without freeing twice.
        let released = false;
        const handle: LockHandle = {
          ticket: owned,
          transfer() {
            if (released) return;
            released = true;
            pendingTickets.delete(topic);
            emitTareas();
          },
          release() {
            if (released) return;
            released = true;
            pendingTickets.delete(topic);
            owned.release();
            emitTareas();
          },
        };
        pendingTickets.set(topic, handle);
        emitTareas();
        return { release: () => handle.release() };
      });
      return { ticket, queued };
    },
    tokenSeed: token,
    transcriber: options.transcriberUrl === undefined ? undefined : { url: options.transcriberUrl, token: options.transcriberToken! },
    port: options.bridgePort,
    publicOrigin: options.bridgePublicOrigin,
    publicEmbedder: options.publicOrigin,
    frameAncestors: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    gateVerdictsFile: gateStoreFile,
    gateToolPath: options.gateToolPath,
  });
  void warmGateVerdicts(root, { gateVerdictsFile: gateStoreFile, gateToolPath: options.gateToolPath });
  try {
    bridgeOrigin = new URL(String((await view()).base)).origin;
  } catch {
    throw new Error("the study-view bridge returned an invalid origin");
  }
  if (!bridgeOrigin) throw new Error("the study-view bridge did not start");
  if (!options.agentDisabled) startTutor(tutor);

  let closing: Promise<void> | null = null;
  /** Closing is once, whoever asks first: the idle window, a deploy's SIGTERM or a test. */
  const close = (): Promise<void> => (closing ??= shutDown());
  const shutDown = async (): Promise<void> => {
    shuttingDown = true;
    holdIdle();
    // SIGTERM from a deploy lands here: the conversation and the turn it was holding are
    // written before the process goes, so the next boot can say what was interrupted.
    main.saveSnapshot();
    glosario.stop();
    busyTracker.clearAll();
    for (const res of clients) res.end();
    clients.clear();
    for (const group of taskClients.values()) for (const res of group) res.end();
    taskClients.clear();
    for (const res of allTaskClients) res.end();
    allTaskClients.clear();
    const sessions = [main, ...tasks.values()];
    for (const session of sessions) stopRuntime(session);
    for (const session of sessions) {
      const proc = session.child;
      if (proc) await stopChild(proc);
    }
    for (const handler of shutdownHandlers) await handler();
    await cerrarIndice();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  // The window starts with the studio: a run nobody opens is the case this is for.
  armIdle();

  return {
    url: `http://127.0.0.1:${port}/${token}/`,
    port,
    close,
    whenIdleClosed,
  };
}

/** The URL a person should open: the first configured public origin, else the loopback entry. */
export function entryUrl(publicOrigin: string | undefined, port: number): string {
  const origins = parsePublicOrigins("publicOrigin", publicOrigin);
  return `${origins?.[0]?.origin ?? `http://127.0.0.1:${port}`}/`;
}

/** `node studio/server.ts` starts the studio and opens it in the Windows browser (WSL). */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const publicOrigin = process.env.STUDIO_PUBLIC_ORIGIN;
  const configuredIdle = process.env.STUDIO_IDLE_MINUTES?.trim();
  const studio = await startStudio({
    root: process.env.LEARNING_ROOT?.trim() || undefined,
    agentDisabled: process.env.STUDIO_AGENT_DISABLED === "1",
    port: Number(process.env.STUDIO_PORT) || 4747,
    publicOrigin,
    // Unset is the default rule: 30 minutes locally, off for a deploy that has no STUDIO_IDLE_MINUTES.
    idleMinutes: configuredIdle ? Number(configuredIdle) : undefined,
    transcriberUrl: process.env.STUDIO_TRANSCRIBER_URL,
    transcriberToken: process.env.STUDIO_TRANSCRIBER_TOKEN,
    bridgePublicOrigin: process.env.STUDIO_BRIDGE_PUBLIC_ORIGIN,
    bridgePort: process.env.STUDIO_BRIDGE_PORT === undefined ? undefined : Number(process.env.STUDIO_BRIDGE_PORT),
    token: process.env.STUDIO_TOKEN?.trim() || undefined,
  });
  const entry = entryUrl(publicOrigin, studio.port);
  console.log(`Estudio: ${entry}`);
  if (publicOrigin === undefined && !process.argv.includes("--no-open")) {
    spawn("cmd.exe", ["/c", "start", "", entry], { cwd: "/mnt/c", stdio: "ignore", detached: true }).on("error", () => {});
  }
  const stop = async () => {
    await studio.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // Nobody has had the studio open for the whole window: it leaves with its Pi, exit 0 (#183).
  void studio.whenIdleClosed.then(() => {
    console.log("Estudio: nadie lo tenía abierto; cierro el estudio y su Pi.");
    process.exit(0);
  });
}
