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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
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
import { MAX_AUDIO_BYTES, TranscribeError, transcribeAudio } from "../integrations/pi/transcribe.ts";
import { lintMarkdown } from "../tools/deck-lint.mjs";
import { ROOT_UNSET, resolveContained } from "../integrations/pi/paths.ts";
import { buildPanorama } from "./panorama.ts";
import { OFFLINE_CSP, partLoader, snapshotPage } from "./offline.ts";
import { readPreferences, savePreferences } from "./preferences.ts";
import { readTutor, saveTutor, type TutorConfig } from "./tutor.ts";
import { createAgy, parseAgyModels } from "./agy.ts";
import { checkTutorContext, driftMessage } from "./context.ts";
import {
  busyFile,
  clearBusy,
  markBusy,
  readRestartSnapshot,
  saveSnapshot as saveSnapshotFile,
  snapshotFile,
  type ChatMessage,
  type InterruptedTurn,
} from "./state.ts";
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
import { runPartChecks, type PartChecks, type PartReport } from "./checks.ts";
import { PASS_STATUSES, gateVerdict, type GateReport } from "../integrations/pi/gate-rules.ts";
import { STUDY_MODES, createSettleGate, isStudioPrompt, modeLine } from "./runtime.ts";
import { candidatos, descubrir, olvidar } from "./descubrir.ts";
import { readGlobalTelemetry, readTopicTelemetry, recordQuizTelemetry, saveGlobalTelemetry } from "./telemetry.ts";
import { listSugerencias, motivos, recordSugerencia, resumenSugerencias, stripLecciones, tutorContext, validateSugerencia, withLecciones } from "./sugerencias.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const UI_DIR = join(HERE, "ui");
const MAX_BODY_BYTES = 64 * 1024;
/** The learning entry accepts a full syllabus; JSON escaping can use six bytes per source character. */
const MAX_LEARNING_SOURCE_CHARS = 200_000;
const MAX_LEARNING_SOURCE_BODY_BYTES = MAX_LEARNING_SOURCE_CHARS * 6 + 1024;
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
  rulesPath?: string;
  /** A fixed 64-hex token, so restarts never invalidate an open tab; random per run when absent. */
  token?: string;
  /** When each topic was last opened; kept outside the vault. Default: the user's state directory. */
  openedFile?: string;
  /** The conversation index; kept outside the vault. Default: next to `openedFile`. */
  chatsFile?: string;
  /** Where the CDN libraries of saved parts are kept after the first download. Default: the user's cache directory. */
  offlineCacheDir?: string;
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
}

export interface Studio {
  url: string;
  port: number;
  close: () => Promise<void>;
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
   * The part notes this turn wrote or edited, in order: what the studio measures itself before the
   * turn is offered as done. A turn that wrote no part owes no measurement.
   */
  parts: string[];
};

/** The learner reads this when the studio refuses a second turn: one turn at a time, studio-wide. */
const TURN_ACTIVE = "El tutor está trabajando; espera a que termine.";

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
  // Its own session id: terminal sessions in the same folder are never written by two processes.
  let tutor = readTutor(root);
  const piCommand = () => options.piCommand ?? ["pi", "--mode", "rpc", "--session-id", "estudio", ...(tutor.modelo ? ["--model", tutor.modelo] : []), ...(tutor.pensamiento ? ["--thinking", tutor.pensamiento] : [])];
  const enginePath = options.enginePath ?? join(REPO, "bin", "learning");
  const rulesPath = options.rulesPath ?? join(REPO, "rules", "deep.json");
  const token = options.token ?? randomBytes(32).toString("hex");
  const openedFile = options.openedFile ?? join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "learning-studio", "opened.json");
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
  /** The active chat's thread, written as it happens: a restart must not take the turn with it. */
  let transcript: ChatMessage[] = [];
  /** The turn a previous process was holding when it went away; shown until the learner resumes. */
  let interrupted: InterruptedTurn | null = null;
  {
    // Only a copy whose writer is gone: a studio that is still running keeps its own.
    const copied = readRestartSnapshot(conversationFile, chats.activo);
    if (copied) {
      transcript = copied.messages;
      interrupted = copied.interrupted;
    }
  }
  /** The studio's own copy of the conversation, written at every turn boundary. */
  const saveSnapshot = () =>
    saveSnapshotFile(conversationFile, { version: 1, chat: chats.activo, pid: process.pid, messages: transcript, interrupted });
  /** A message the studio keeps for itself; the runtime's own session is not the only copy. */
  const remember = (message: ChatMessage) => {
    transcript.push(message);
    saveSnapshot();
  };
  /** Adopting the boot session must finish before the first prompt decides where it lands. */
  let ready: Promise<void> = Promise.resolve();
  const offlineCacheDir = options.offlineCacheDir ?? join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "learning-studio", "cdn");
  let port = 0;

  // ---- Server-Sent Events ------------------------------------------------
  const clients = new Set<ServerResponse>();
  const emit = (event: string, data: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  };

  // ---- Pi child (JSONL RPC) ----------------------------------------------
  let child: ChildProcessWithoutNullStreams | undefined;
  /** Antigravity keeps its conversation per process, so the studio keeps what the learner read. */
  let agy: ReturnType<typeof createAgy> | undefined;
  const agyTurns: Array<{ role: "user" | "assistant"; text: string }> = [];
  /** The topic the learner picked for deep tutoring; general chat and quick notes never set it. */
  let tema: string | null = null;
  /**
   * The topic the last turn taught, or null when it taught none. The page needs it at the end of
   * the turn to offer that topic's next step: a turn that writes nothing still teaches a topic.
   */
  let turnTopic: string | null = null;
  let gateBlocked = false;
  /**
   * The one turn in flight, from the moment the studio accepts it until its settle is decided —
   * gate corrections included. Holding it is what makes a second turn impossible by construction:
   * every turn start refuses while it is held, and every exit releases it.
   */
  let turn: Turn | null = null;
  /** The failing-stage rule: one gate for every runtime, its counters reset when the learner talks. */
  const settleGate = createSettleGate();
  let alive = false;
  let nextId = 0;
  let assistantSeq = 0;
  let assistantId = "";
  const waiting = new Map<string, (record: Json) => void>();
  // A tool's end event may arrive without its arguments; the row keeps the ones its start carried.
  const toolArgs = new Map<string, unknown>();
  const dialogs = new Map<string, Json>();
  const state = () => ({ busy: turn !== null, alive, tema: turnTopic });

  const handle = (record: Json) => {
    const type = record.type;
    if (type === "response" && typeof record.id === "string" && waiting.has(record.id)) {
      waiting.get(record.id)!(record);
      waiting.delete(record.id);
      return;
    }
    switch (type) {
      case "agent_start":
        return;
      case "agent_settled": {
        toolArgs.clear();
        // Only the session Pi is in can report its usage, so it is read while it is active.
        if (!agy) void refreshContexto();
        emit("library_changed", {});
        // There is exactly one turn in flight, so the settle always belongs to it. The engine is the
        // authority on whether it is over; a turn that teaches no topic simply ends.
        const settled = turn;
        if (!settled) return;
        if (!settled.topic) {
          // A Universitario request whose tutor wrote no topic folder has nothing to gate; the
          // learner is told instead of being left with a silent stop.
          if (settled.creation) emit("notice", { level: "warning", message: "El tutor no creó ningún tema todavía." });
          releaseTurn(settled);
          return;
        }
        void settleTurn(settled);
        return;
      }
      case "message_start": {
        const message = record.message;
        if (isRecord(message) && message.role === "user") {
          // The standing lessons travel inside the turn's prompt; the chat shows what the learner
          // wrote, so the block is stripped before it is ever served as their message.
          const text = stripLecciones(messageText(message));
          // The gate's instruction is the studio's prompt, never the learner's own words.
          if (isStudioPrompt(text)) return;
          if (text) {
            emit("user", { text });
            if (agy) agyTurns.push({ role: "user", text });
            remember({ role: "user", text });
          }
        }
        if (isRecord(message) && message.role === "assistant") assistantId = `a${++assistantSeq}`;
        return;
      }
      case "message_update": {
        const ev = record.assistantMessageEvent;
        if (isRecord(ev) && ev.type === "text_delta" && typeof ev.delta === "string") {
          emit("assistant_delta", { id: assistantId, delta: ev.delta });
        }
        return;
      }
      case "message_end": {
        const message = record.message;
        if (isRecord(message) && message.role === "assistant") {
          const text = messageText(message);
          if (text) emit("assistant_end", { id: assistantId, text });
          if (agy && text) agyTurns.push({ role: "assistant", text });
          if (text) remember({ role: "assistant", text });
        }
        return;
      }
      case "tool_execution_start": {
        const name = String(record.toolName);
        const id = String(record.toolCallId);
        toolArgs.set(id, record.args);
        const note = toolNote(name, record.args, root);
        const topic = toolTopic(name, record.args, root);
        emit("tool", { phase: "start", chat: chats.activo, id: record.toolCallId, name: record.toolName, label: toolLabel(name, record.args), ok: true, ...(note === null ? {} : { note }), ...(topic === null ? {} : { topic }) });
        return;
      }
      case "tool_execution_end": {
        const name = String(record.toolName);
        const id = String(record.toolCallId);
        const args = record.args ?? toolArgs.get(id);
        toolArgs.delete(id);
        const note = toolNote(name, args, root);
        const topic = toolTopic(name, args, root);
        // The part notes the turn wrote are measured at its settle: the studio knows them from the
        // tool events, so no file is guessed from the plan.
        if (turn && !record.isError && note !== null && "index" in note && typeof args === "object" && args !== null) {
          const path = (args as Json).path;
          if (typeof path === "string") {
            const file = resolve(root, path);
            if (!turn.parts.includes(file)) turn.parts.push(file);
          }
        }
        // A Universitario request creates the topic its own writes name: the first folder the tutor
        // writes into becomes the held turn's topic, so the gate can ask the engine about it.
        if (turn?.creation && turn.topic === null && !record.isError && topic !== null) {
          turn.topic = topic;
          tema = topic;
          gateBlocked = false;
          // The deploy's message names the topic the turn is really teaching.
          const startedAt = interrupted?.at ?? Date.now();
          interrupted = { topic, at: startedAt };
          markBusy(busyMarker, { pid: process.pid, startedAt, topic });
          saveSnapshot();
        }
        emit("tool", { phase: "end", chat: chats.activo, id: record.toolCallId, name: record.toolName, label: toolLabel(name, args), ok: !record.isError, ...(note === null ? {} : { note }), ...(topic === null ? {} : { topic }) });
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
          dialogs.set(record.id, dialog);
          emit("dialog", dialog);
        } else if (method === "notify" && typeof record.message === "string") {
          if (!HARNESS_NOTICE.test(record.message.trim())) emit("notice", { level: record.notifyType ?? "info", message: record.message });
          else process.stderr.write(`estudio: aviso del arnés fuera del chat · ${record.message}\n`);
        }
        return;
      }
    }
  };

  const startPi = () => {
    const [cmd, ...args] = piCommand();
    const proc = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, GENTLE_SHELL_INTERACTIVE_HOST: "1", LEARNING_SETTLE_GATE: "studio" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child = proc;
    alive = true;
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
          if (isRecord(record)) handle(record);
        } catch {
          // Not a protocol record; Pi reserves stdout for records.
        }
      }
    });
    proc.stderr.resume();
    proc.on("exit", () => {
      if (child !== proc) return;
      alive = false;
      for (const resolve of waiting.values()) resolve({ success: false, error: "Pi exited" });
      waiting.clear();
      for (const id of dialogs.keys()) emit("dialog_closed", { id });
      dialogs.clear();
      // A dead runtime cannot finish its turn: releasing it is what keeps nothing latched.
      releaseTurn();
      emit("state", state());
      emit("error", { message: "El tutor se detuvo." });
    });
    proc.on("error", (err) => emit("error", { message: `No se pudo iniciar Pi: ${err.message}` }));
    emit("state", state());
  };

  const write = (command: Json) => {
    // Learner-visible: the page shows these words, so they are the studio's Spanish.
    if (options.agentDisabled) throw new HttpError(503, "El tutor está desactivado.");
    if (!child || !alive) throw new HttpError(503, "El tutor no está en marcha.");
    child.stdin.write(`${JSON.stringify(command)}\n`);
  };

  const call = (command: Json, timeoutMs = 30000): Promise<Json> =>
    new Promise((resolve, reject) => {
      const id = `s${++nextId}`;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new HttpError(504, `Pi did not answer ${command.type}`));
      }, timeoutMs);
      waiting.set(id, (record) => {
        clearTimeout(timer);
        resolve(record);
      });
      try {
        write({ ...command, id });
      } catch (err) {
        clearTimeout(timer);
        waiting.delete(id);
        reject(err);
      }
    });

  // ---- conversations -------------------------------------------------------
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
  const piStats = async (): Promise<{ file: string | null; contexto: ChatContexto | null }> => {
    if (!child || !alive) return { file: null, contexto: null };
    try {
      // A short bound: a runtime that cannot report its session must not stall a turn.
      const reply = await call({ type: "get_session_stats" }, 2500);
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
  const refreshContexto = async () => {
    const current = activeChat();
    if (!current) return;
    const stats = await piStats();
    if (stats.contexto) persist(recordContexto(chats, current.id, stats.contexto));
    emit("chats", chats);
  };

  /**
   * Opening a chat points the runtime at that chat's own conversation. A chat with
   * no handle yet starts one and records it, so the next open comes back to it.
   */
  const switchTo = async (chat: Chat) => {
    if (turn) throw new HttpError(409, TURN_ACTIVE);
    if (agy) {
      // Antigravity names its conversation per turn, so switching is choosing the id.
      agy.open(chat.agyConversation ?? undefined);
      return;
    }
    if (chat.piSession) {
      const reply = await call({ type: "switch_session", sessionPath: chat.piSession });
      if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi no quiso cambiar de conversación."));
      if (isRecord(reply.data) && reply.data.cancelled === true) throw new HttpError(409, "una extensión canceló el cambio de conversación.");
      return;
    }
    const reply = await call({ type: "new_session" });
    if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi no quiso abrir una conversación nueva."));
    const stats = await piStats();
    if (stats.file) persist(setPiSession(chats, chat.id, stats.file));
  };

  /** The copy belongs to the chat that is now active; the runtime serves this chat's thread. */
  const adoptConversation = async () => {
    transcript = [];
    interrupted = null;
    saveSnapshot();
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
    if (turn) throw new HttpError(409, TURN_ACTIVE);
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
    if (agy) return;
    const stats = await piStats();
    if (!alive) return;
    const current = activeChat();
    if (!current) return;
    // A restart boots the studio's own session; the active chat may be another one.
    const switched = Boolean(current.piSession && stats.file && current.piSession !== stats.file);
    if (!current.piSession && stats.file) persist(setPiSession(chats, current.id, stats.file));
    else if (switched) {
      try { await switchTo(current); } catch (error) { emit("error", { message: (error as Error).message }); }
    }
    // The studio's own copy follows what the runtime serves, so a restart comes back to the
    // whole thread even when the runtime's session is gone.
    const shown = await rememberHistory();
    if (switched) emit("history", shown);
    emit("chats", chats);
  };

  const startTutor = (config: TutorConfig) => {
    const previous = child;
    // A restart ends the turn the previous tutor was running, and restores the front of the rule.
    releaseTurn();
    settleGate.reset();
    child = undefined;
    previous?.kill();
    for (const resolve of waiting.values()) resolve({ success: false, error: "Tutor restarted" });
    waiting.clear();
    agy?.stop();
    agy = undefined;
    tutor = config;
    if (config.agente === "pi") {
      startPi();
      ready = adoptBoot();
    } else {
      agy = createAgy({
        command: options.agyCommand ?? ["agy"],
        cwd: root,
        config,
        onRecord: handle,
        onError: message => emit("error", { message }),
        // The id belongs to the chat that is talking, so it is recorded where it can be found again.
        onConversation: id => { if (activeChat()) persist(setAgyConversation(chats, chats.activo, id)); },
      });
      ready = Promise.resolve();
      alive = true;
      emit("state", state());
    }
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
    "validate and advance planning, then continue to part 1. The plan is yours: never show it or list future parts to the learner.";

  /**
   * The engine's own report on a topic: the call the library makes, so the gate and the library can
   * never describe the same topic differently, with the error handling that call already has.
   */
  const runGate = async (topic: string) => {
    // The engine's own answer, even for a folder with no run yet: a topic a Universitario request
    // just created must still hear the engine's words ("run not initialized: …"), not a shortcut.
    const report = await engineReport(join(root, topic));
    const verdict = gateVerdict(report as GateReport);
    // A gate for a topic the learner already left says nothing about the one they are on.
    if (tema === topic) {
      gateBlocked = !verdict.passing;
      emit("gate", { tema: topic, ...verdict });
    }
    return { report, verdict };
  };

  /** One turn at a time: a turn start while another is held is refused, in the learner's language. */
  const requireNoTurn = () => {
    if (turn) throw new HttpError(409, TURN_ACTIVE);
  };

  /** Holds the one turn and tells the page the tutor is working. */
  const holdTurn = (started: Turn) => {
    turn = started;
    turnTopic = started.topic;
    // Written before the runtime is asked to work: a deploy reads it, and a process that
    // dies leaves the turn marked so the next boot can say it was interrupted.
    const at = Date.now();
    interrupted = { topic: started.topic, at };
    markBusy(busyMarker, { pid: process.pid, startedAt: at, topic: started.topic });
    saveSnapshot();
    emit("state", state());
  };

  /**
   * Every exit of a turn goes through here: settled and decided, aborted, restarted, a dead runtime
   * or an engine call that could not answer. Nothing may leave a turn held.
   *
   * A release that resumes after an `await` names the turn it was called for (`owner`), so a settle
   * that finishes late can never release the turn the learner started after it: an abort or a
   * restart may have released that turn and a new one may be in flight. The studio's own immediate
   * decisions (abort, restart, a dead runtime, a turn that teaches no topic) release the live turn.
   */
  const releaseTurn = (owner?: Turn) => {
    if (!turn) return;
    if (owner !== undefined && turn !== owner) return;
    turn = null;
    interrupted = null;
    clearBusy(busyMarker);
    saveSnapshot();
    emit("state", state());
  };

  /** One prompt to the runtime. A refusal is the studio's log, never the learner's words. */
  const deliver = async (text: string, started: Turn) => {
    try {
      if (agy) {
        agy.prompt(text);
      } else {
        // One turn at a time: the studio never queues a follow-up behind a running turn.
        const reply = await call({ type: "prompt", message: text });
        if (reply.success === false) throw new HttpError(409, String(reply.error ?? "el tutor rechazó el turno"));
      }
    } catch (error) {
      const cause = error instanceof HttpError ? `${error.status} ${error.message}` : (error as Error).message;
      process.stderr.write(`estudio: el turno de ${started.topic ?? "chat general"} no llegó al tutor · ${cause}\n`);
      // A studio refusal the route already explains (disabled or stopped tutor) keeps its status;
      // anything the runtime said in its own words is replaced by the studio's.
      if (error instanceof HttpError && error.status !== 409) throw error;
      throw new HttpError(409, "El tutor no pudo empezar el turno; vuelve a pedírselo.");
    }
  };

  /** What the learner is told when a correction could not be sent; the cause stays in the log. */
  const correctionRefused = (topic: string) => {
    emit("error", { message: `El tutor no pudo retomar «${topic}»: el motor sigue sin darlo por cerrado. Vuelve a pedírselo.` });
  };

  /**
   * The tutor reads its skill and the Learnings `AGENTS.md` from links the deploy
   * owns. A link that resolves anywhere else means the learner would be taught
   * with a standard nobody reviewed, so the turn never starts.
   */
  const refuseDriftedContext = () => {
    // A disabled tutor starts no turn at all, so its own refusal is the answer.
    if (options.skipContextCheck || options.agentDisabled) return;
    const drift = checkTutorContext({ repo: REPO, root, home: options.contextHome });
    if (!drift) return;
    const message = driftMessage(drift);
    emit("error", { message });
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
   * page, a regeneration. Every one names the topic it teaches, or says in code why it teaches none.
   * The turn is held until its settle is decided; only an accepted learner turn restores the budget.
   */
  const startTurn = async (text: string, spec: { topic: string | null; correction?: boolean; creation?: boolean }) => {
    requireNoTurn();
    // A drifted skill or AGENTS.md link means nobody reviewed what the tutor would read.
    refuseDriftedContext();
    // Never route a turn before the studio knows which conversation it belongs to.
    await ready;
    // `ready` can take a moment, and the studio must not hold two turns because of it.
    requireNoTurn();
    const started: Turn = { topic: spec.topic, correction: spec.correction === true, creation: spec.creation === true, parts: [] };
    holdTurn(started);
    try {
      // Every turn of every topic carries the learner's standing lessons: the same place for both
      // runtimes, so neither can start a turn without them. Read per turn, so a lesson just
      // recorded already applies to the next one.
      await deliver(withLecciones(namedPart(text), root), started);
    } catch (error) {
      releaseTurn(started);
      throw error;
    }
    if (!started.correction) settleGate.reset();
    // The topic the tutor is teaching is the topic the page is on, whatever path started the turn.
    if (started.topic) {
      tema = started.topic;
      gateBlocked = false;
    }
  };

  /**
   * The part notes a turn wrote, as the tools measure them: a note is the `.md` the standard is
   * written in, so a rich `.html` page is measured through the note beside it, and one with no note
   * is left to the reader's own gate instead of being measured as prose.
   */
  const partNotes = (parts: string[]): string[] =>
    parts
      .map((part) => (part.endsWith(".md") ? part : part.replace(/\.html$/i, ".md")))
      .filter((file) => existsSync(file));

  /**
   * What the tools say about the parts a turn wrote. A tool that could not run is the studio's own
   * failure and goes to the log: it is never a finding the tutor is asked to fix.
   */
  const checkParts = async (settled: Turn): Promise<PartReport | null> => {
    const files = partNotes(settled.parts);
    if (!files.length) return null;
    const checked = await (options.partChecks ?? runPartChecks)(files);
    if (checked.kind === "crashed") {
      for (const failure of checked.failures) process.stderr.write(`estudio: comprobación fallida · ${failure}\n`);
      return null;
    }
    return checked.kind === "findings" ? checked : null;
  };

  /**
   * What a settled turn still owes, for every runtime. The engine decides first: a cleared turn ends
   * its part, a failing stage comes back as one more prompt of the same turn carrying the engine's
   * own reasons, and a spent budget tells the learner instead of stopping silently. A turn the
   * engine cleared still owes the part's own checks, because the engine cannot see a figure. Every
   * path out releases the turn; only a correction that was sent keeps it.
   */
  const settleTurn = async (settled: Turn) => {
    const topic = settled.topic;
    let corrected = false;
    try {
      if (!topic) return;
      const { report } = await runGate(topic);
      // Aborted or restarted while the engine answered: this turn is no longer the studio's.
      if (turn !== settled) return;
      const decision = settleGate.decide(report);
      if (decision.action === "ask") {
        // The correction is the same turn, one more prompt: it is not a new turn start.
        try {
          await deliver(decision.text, settled);
          corrected = true;
        } catch {
          correctionRefused(topic);
        }
      } else if (decision.action === "stop") {
        emit("error", { message: decision.text });
      } else {
        if (decision.action === "unreadable") {
          emit("notice", { level: "warning", message: `El motor no pudo revisar «${topic}»: el turno termina sin comprobarlo.` });
        }
        // The engine is done with this turn, so what it cannot measure is measured here: the part
        // the turn wrote still owes the scene and explanation checks before it reaches the learner.
        const found = await checkParts(settled);
        if (turn !== settled) return;
        if (found) {
          const verdict = settleGate.decideFindings(found);
          if (verdict.action === "ask") {
            try {
              await deliver(verdict.text, settled);
              corrected = true;
            } catch {
              correctionRefused(topic);
            }
          } else if (verdict.action === "stop") {
            emit("error", { message: verdict.text });
          }
        }
      }
    } catch (error) {
      correctionRefused(topic ?? "el tema");
      process.stderr.write(`estudio: el motor no pudo decidir el turno · ${(error as Error).message}\n`);
    } finally {
      // Only the turn this settle was called for: a late answer may belong to a turn already gone.
      if (!corrected) releaseTurn(settled);
    }
  };

  // ---- hosted study-view bridge -------------------------------------------
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<Json> }>();
  const shutdownHandlers: Array<() => Promise<void> | void> = [];
  const fakePi = {
    on(event: string, handler: () => Promise<void> | void) {
      if (event === "session_shutdown") shutdownHandlers.push(handler);
      return () => {};
    },
    registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<Json> }) {
      tools.set(tool.name, tool);
    },
    sendUserMessage(text: string) {
      // The page's own submissions are deep turns when they belong to an enrolled topic.
      return startTurn(text, { topic: bridgeTopic(text) });
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

  const library = async () => {
    const opened = readOpened();
    const topics = await Promise.all(
      listTopics(root).map(async (t) => {
        const report = await engineStatus(join(root, t.id));
        return { ...t, status: report.status ?? "", stage: report.stage ?? "", nextStage: report.nextStage ?? "", part: report.part ?? "", method: report.method ?? "", opened: opened[t.id] ?? 0 };
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
    return { topics, quick };
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
      tutorContext(root, tema),
    ].filter((line) => line !== "").join("\n");
  };

  const post = async (req: IncomingMessage, res: ServerResponse, action: string) => {
    const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicOrigins ?? []).map((origin) => origin.origin)]);
    if (!allowed.has(String(req.headers.origin ?? ""))) throw new HttpError(403, "foreign origin");
    // Audio is not JSON: it is streamed to the transcriber as it arrives.
    if (action === "api/transcribe") return transcribe(req, res);
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
      case "api/regenerar": {
        if (options.agentDisabled) throw new HttpError(503, "El tutor está desactivado.");
        if (!isRecord(body)) throw new HttpError(400, "No pude leer la regeneración.");
        // A regeneration starts a turn: it is refused before anything is written or moved aside.
        requireNoTurn();
        const tema = typeof body.tema === "string" ? body.tema : "";
        const parte = typeof body.parte === "string" ? body.parte : "";
        if (!/^[\w-]+$/.test(tema) || !/^p\d+$/.test(parte)) throw new HttpError(400, "Esa parte no se puede regenerar.");
        // Everything that can refuse this request happens before the first write: a refused
        // regeneration must leave the part in the library, not in the trash.
        const input = validateSugerencia({ tema, parte, motivos: body.motivos, texto: body.texto, origen: "regenerar" });
        const planned = regenerationTrash(root, { topic: tema, part: parte });
        const text = regenerationPrompt(tema, parte, input, planned.trash);
        if (text.length > MAX_PROMPT_CHARS) throw new HttpError(400, "La regeneración pide demasiado texto de una vez.");
        const saved = recordSugerencia(root, { ...input, origen: "regenerar" });
        const backup = backupPartForRegeneration(root, { topic: tema, part: parte }, new Date(), planned.trash || undefined);
        // A part lives in a deep topic: a regeneration the engine does not clear is not an end.
        await startTurn(text, { topic: enrolled(root, tema) ? tema : null });
        return sendJson(res, 200, { ok: true, prompt: text, trash: backup.trash, entrada: saved.entrada });
      }
      case "api/telemetry": {
        if (isRecord(body) && body.entry) {
          const result = recordQuizTelemetry(root, body.entry);
          return sendJson(res, 200, { ok: true, ...result });
        }
        return sendJson(res, 200, { ok: true, global: saveGlobalTelemetry(root, body) });
      }
      case "api/tutor": {
        if (turn) throw new HttpError(409, TURN_ACTIVE);
        const config = saveTutor(root, body);
        startTutor(config);
        return sendJson(res, 200, config);
      }
      case "api/tema": {
        if (turn) throw new HttpError(409, TURN_ACTIVE);
        tema = requireTopic(body.tema);
        gateBlocked = false;
        return sendJson(res, 200, { tema });
      }
      case "api/aprender": {
        // One of the learner's questions, asked by the page: the mode is decided before the turn.
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) throw new HttpError(400, "escribe qué quieres aprender");
        if (text.length > MAX_LEARNING_SOURCE_CHARS) {
          throw new HttpError(400, `El texto es demasiado largo: como mucho ${MAX_LEARNING_SOURCE_CHARS} caracteres.`);
        }
        requireNoTurn();
        const modo = STUDY_MODES.find((mode) => mode === body.modo);
        if (!modo) throw new HttpError(400, "elige rápido, universitario o examen antes de enviar");
        // A deep-mode request's topic does not exist yet: its first write under a topic folder
        // binds it, and the gate asks the engine about that folder when it settles.
        await startTurn(`Quiero aprender ${text}.\n\n${modeLine(modo)}`, { topic: null, creation: modo !== "rapido" });
        return sendJson(res, 200, { ok: true, modo });
      }
      case "api/metodo": {
        // The engine's method stage, answered on the page: recorded with the engine's own command.
        requireNoTurn();
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
        tema = topic;
        gateBlocked = false;
        emit("library_changed", {});
        // The tutor continues to planning with the method the learner just chose.
        await startTurn(methodPrompt(metodo), { topic });
        return sendJson(res, 200, { ok: true, metodo });
      }
      case "prompt": {
        const text = body.text;
        if (typeof text !== "string" || !text.trim() || text.length > MAX_PROMPT_CHARS) {
          throw new HttpError(400, `El mensaje tiene que tener texto, como mucho ${MAX_PROMPT_CHARS} caracteres.`);
        }
        // One turn at a time, studio-wide. This early check only saves the engine call below;
        // `startTurn` refuses the turn itself, so no path can slip in through the gate window.
        requireNoTurn();
        // A prompt with no tema is the general chat or a quick note: the engine tracks no topic
        // there, so there is nothing to gate. Nothing else in this route moves the studio's state
        // before the turn is accepted: a refused prompt must neither clear the gate of the turn in
        // flight nor repoint it at another topic.
        const deep = body.tema === undefined ? null : requireTopic(body.tema);
        if (deep !== null && deep === tema && gateBlocked) {
          // A blocked topic is re-asked before it is refused, so passing releases it again.
          const { verdict } = await runGate(deep);
          if (!verdict.passing) throw new HttpError(409, `El motor no dio por cerrado el último turno de «${deep}»; vuelve a pedírselo.`);
        }
        await startTurn(text.trim(), { topic: deep });
        break;
      }
      case "dialog": {
        const id = body.id;
        if (typeof id !== "string" || !dialogs.has(id)) throw new HttpError(404, "Ese diálogo ya no está abierto.");
        const response: Json = { type: "extension_ui_response", id };
        if (body.cancelled === true) response.cancelled = true;
        else if (typeof body.confirmed === "boolean") response.confirmed = body.confirmed;
        else if (typeof body.value === "string" && body.value.length <= MAX_PROMPT_CHARS) response.value = body.value;
        else throw new HttpError(400, "dialog answer needs value, confirmed or cancelled");
        write(response);
        dialogs.delete(id);
        emit("dialog_closed", { id });
        break;
      }
      case "abort":
        // A turn the learner stopped is not the engine's business, and not a correction either:
        // releasing it here is what makes the abort final, whatever the runtime does afterwards.
        releaseTurn();
        if (agy) agy.abort();
        else await call({ type: "abort" }, 60000);
        break;
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
        if (!agy && id === chats.activo) await call({ type: "set_session_name", name: chatById(doc, id).nombre }).catch(() => undefined);
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
        if (agy) throw new HttpError(400, "Antigravity does not export conversations");
        if (id !== chats.activo) throw new HttpError(409, "Abre la conversación antes de exportarla.");
        const chat = chatById(chats, id);
        // Pi writes the export into its working directory, which here is the vault.
        // The file is named outside it instead, next to the conversation index.
        const dir = join(dirname(chatsFile), "exports");
        mkdirSync(dir, { recursive: true });
        const slug = chat.nombre.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chat";
        const outputPath = join(dir, `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
        const reply = await call({ type: "export_html", outputPath }, 30000);
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
        // Restart is the escape hatch for a turn that never settles, so it works while busy.
        if (alive) child?.kill();
        startTutor(tutor);
        break;
      default:
        throw new HttpError(404, "not found");
    }
    sendJson(res, 200, { ok: true });
  };

  /** What the chat shows about a turn a previous process was holding: the topic and its title. */
  const interruptedView = () => {
    const turn = interrupted;
    if (turn === null) return null;
    const topic = turn.topic;
    return { topic, title: topic === null ? null : listTopics(root).find((t) => t.id === topic)?.title ?? topic };
  };

  const history = async (): Promise<{ messages: Json[]; note: Note | null; interrupted: { topic: string | null; title: string | null } | null }> => {
    const shown = interruptedView();
    const copy = transcript.map((message) => ({ role: message.role, text: message.text }));
    if (!alive || agy) return { messages: agy ? [...agyTurns] : copy, note: null, interrupted: shown };
    try {
      const reply = await call({ type: "get_messages" }, 10000);
      const raw = isRecord(reply.data) && Array.isArray(reply.data.messages) ? reply.data.messages : [];
      const messages = raw
        .filter((m): m is Json => isRecord(m) && (m.role === "user" || m.role === "assistant"))
        // The standing lessons travel inside the turn's prompt, so the thread keeps the learner's
        // words and never the block the studio added after them.
        .map((m) => ({ role: m.role, text: m.role === "user" ? stripLecciones(messageText(m)) : messageText(m) }))
        // The gate's instruction is the studio's own prompt: the thread keeps the learner's words.
        .filter((m) => m.text && !(m.role === "user" && isStudioPrompt(m.text)));
      // A runtime that lost the conversation still has the studio's own copy of the turn.
      return { messages: messages.length ? messages : copy, note: noteFromMessages(raw, root), interrupted: shown };
    } catch {
      return { messages: copy, note: null, interrupted: shown };
    }
  };

  /** The copy follows what the runtime serves, so a restart falls back to the whole thread. */
  const rememberHistory = async () => {
    const shown = await history();
    if (shown.messages.length) {
      transcript = shown.messages.map((message) => ({ role: message.role as ChatMessage["role"], text: String(message.text) }));
      saveSnapshot();
    }
    return shown;
  };

  const events = async (res: ServerResponse) => {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-content-type-options": "nosniff" });
    res.write(`event: history\ndata: ${JSON.stringify(await history())}\n\n`);
    res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
    for (const dialog of dialogs.values()) res.write(`event: dialog\ndata: ${JSON.stringify(dialog)}\n\n`);
    clients.add(res);
    res.on("close", () => clients.delete(res));
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
    if (req.method !== "GET") throw new HttpError(405, "method not allowed");
    switch (path) {
      case "":
        return send(res, 200, "text/html; charset=utf-8", shell(), { "content-security-policy": shellCsp() });
      case "studio.js":
      case "tutorial.js":
        return send(res, 200, "text/javascript; charset=utf-8", readFileSync(join(UI_DIR, path)));
      case "kit/scene.js":
      case "kit/theme.js":
      case "kit/dictate.js":
        // The reader's own scripts, served by the studio: one paper, one dictation box, one kit.
        return send(res, 200, "text/javascript; charset=utf-8", readFileSync(join(HERE, "..", "integrations", "pi", "kit", path.slice(4))));
      case "studio.css":
        return send(res, 200, "text/css; charset=utf-8", readFileSync(join(UI_DIR, "studio.css")));
      case "favicon.svg":
        // The same mark the reader serves, so both surfaces share one icon file.
        return send(res, 200, "image/svg+xml", readFileSync(join(HERE, "..", "integrations", "pi", "view", "favicon.svg")), { "cache-control": "public, max-age=3600" });
      case "events":
        return events(res);
      case "api/library":
        return sendJson(res, 200, await library());
      case "api/chats": {
        // The list is only true once the boot session has been adopted.
        await ready;
        // The active Pi chat reports its usage live; the others keep the last value seen.
        if (!agy) {
          const stats = await piStats();
          const current = activeChat();
          if (current && stats.contexto) persist(recordContexto(chats, current.id, stats.contexto));
        }
        return sendJson(res, 200, chats);
      }
      case "api/preferences":
        return sendJson(res, 200, readPreferences(root));
      case "api/tutor":
        return sendJson(res, 200, readTutor(root));
      case "api/tutor/modelos": {
        // The catalogue belongs to the runtime selected in the page, which may not be saved yet.
        const provider = url.searchParams.get("agente") ?? readTutor(root).agente;
        if (provider !== "pi" && provider !== "agy") throw new HttpError(400, "agente must be pi or agy");
        return sendJson(res, 200, { modelos: provider === "agy" ? await agyCatalog() : await piCatalog() });
      }
      case "api/tema":
        return sendJson(res, 200, { tema });
      case "api/preferences/candidatos": {
        const preferences = readPreferences(root);
        const taken = new Set([...preferences.aspectos.map((a) => a.id), ...(preferences.rechazados ?? [])]);
        return sendJson(res, 200, { candidatos: candidatos(readGlobalTelemetry(root)).filter((c) => !taken.has(c.id)) });
      }
      case "api/sugerencias/resumen":
        return sendJson(res, 200, resumenSugerencias(root));
      case "api/sugerencias":
        return sendJson(res, 200, listSugerencias(root, {
          tema: url.searchParams.get("tema") ?? undefined,
          parte: url.searchParams.get("parte") ?? undefined,
        }));
      case "api/contexto":
        // The lines a writing prompt carries: preferences, weak spots and the learner's words.
        return sendJson(res, 200, { texto: tutorContext(root, url.searchParams.get("tema") ?? undefined) });
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
        const result = await view(url.searchParams.get("topic") ?? undefined, url.searchParams.get("part") ?? undefined);
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
    // One turn at a time: a submission from the page is refused before it writes anything.
    refuseTurn: () => (turn ? TURN_ACTIVE : null),
    tokenSeed: token,
    transcriber: options.transcriberUrl === undefined ? undefined : { url: options.transcriberUrl, token: options.transcriberToken! },
    port: options.bridgePort,
    publicOrigin: options.bridgePublicOrigin,
    publicEmbedder: options.publicOrigin,
    frameAncestors: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
  });
  try {
    bridgeOrigin = new URL(String((await view()).base)).origin;
  } catch {
    throw new Error("the study-view bridge returned an invalid origin");
  }
  if (!bridgeOrigin) throw new Error("the study-view bridge did not start");
  if (!options.agentDisabled) startTutor(tutor);

  return {
    url: `http://127.0.0.1:${port}/${token}/`,
    port,
    close: async () => {
      // SIGTERM from a deploy lands here: the conversation and the turn it was holding are
      // written before the process goes, so the next boot can say what was interrupted.
      saveSnapshot();
      clearBusy(busyMarker);
      for (const res of clients) res.end();
      clients.clear();
      const proc = child;
      child = undefined;
      proc?.kill();
      agy?.stop();
      for (const handler of shutdownHandlers) await handler();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
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
  const studio = await startStudio({
    root: process.env.LEARNING_ROOT?.trim() || undefined,
    agentDisabled: process.env.STUDIO_AGENT_DISABLED === "1",
    port: Number(process.env.STUDIO_PORT) || 4747,
    publicOrigin,
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
}
