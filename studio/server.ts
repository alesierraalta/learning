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
import { checkDeep, enrolled } from "./gate.ts";
import { candidatos, descubrir, olvidar } from "./descubrir.ts";
import { readGlobalTelemetry, readTopicTelemetry, recordQuizTelemetry, saveGlobalTelemetry } from "./telemetry.ts";
import { listSugerencias, motivos, recordSugerencia, tutorContext, validateSugerencia } from "./sugerencias.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const UI_DIR = join(HERE, "ui");
const MAX_BODY_BYTES = 64 * 1024;
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

/** A note the studio can open: a part of a topic, or a quick note. */
export type Note = { topic: string; index: number } | { quick: string };

/**
 * `explicaciones/Parte N - <slug>.md` (or its rich `.html` page) inside a topic folder, or
 * `rapidos/<id>.md`: the studio can open that note, so a write that produced it comes back with
 * what the reader routes on. With the Learnings `root`, only the notes the reader serves count:
 * `<root>/rapidos/<id>.md` and `<root>/<topic>/explicaciones/Parte N - <slug>.(md|html)`.
 */
export function noteFromPath(path: unknown, root?: string): Note | null {
  if (typeof path !== "string") return null;
  const inRoot = root === undefined ? path : relative(root, resolve(root, path));
  if (root !== undefined && (inRoot.startsWith("..") || isAbsolute(inRoot))) return null;
  const segments = inRoot.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  if (root !== undefined && segments.length !== (segments[0] === "rapidos" ? 2 : 3)) return null;
  if (segments.at(-2) === "rapidos") {
    const quick = /^([\w-]+)\.md$/.exec(segments.at(-1) ?? "");
    return quick === null ? null : { quick: quick[1] };
  }
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
  let gateBlocked = false;
  /** The topic this turn teaches, so a general question is never charged to a deep topic. */
  let turnTema: string | null = null;
  let alive = false;
  let busy = false;
  let nextId = 0;
  let assistantSeq = 0;
  let assistantId = "";
  const waiting = new Map<string, (record: Json) => void>();
  // A tool's end event may arrive without its arguments; the row keeps the ones its start carried.
  const toolArgs = new Map<string, unknown>();
  const dialogs = new Map<string, Json>();
  const state = () => ({ busy, alive });

  const handle = (record: Json) => {
    const type = record.type;
    if (type === "response" && typeof record.id === "string" && waiting.has(record.id)) {
      waiting.get(record.id)!(record);
      waiting.delete(record.id);
      return;
    }
    switch (type) {
      case "agent_start":
        busy = true;
        emit("state", state());
        return;
      case "agent_settled":
        busy = false;
        toolArgs.clear();
        emit("state", state());
        // Only the session Pi is in can report its usage, so it is read while it is active.
        if (!agy) void refreshContexto();
        // Pi runs this same check inside its settle gate; a provider without that hook gets it here.
        // The topic is taken and cleared first: a later prompt must not decide what this turn taught.
        {
          const settled = turnTema;
          turnTema = null;
          if (agy && settled) void runGate(settled);
        }
        emit("library_changed", {});
        return;
      case "message_start": {
        const message = record.message;
        if (isRecord(message) && message.role === "user") emit("user", { text: messageText(message) });
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
      env: { ...process.env, GENTLE_SHELL_INTERACTIVE_HOST: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child = proc;
    alive = true;
    busy = false;
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
      busy = false;
      for (const resolve of waiting.values()) resolve({ success: false, error: "Pi exited" });
      waiting.clear();
      for (const id of dialogs.keys()) emit("dialog_closed", { id });
      dialogs.clear();
      emit("state", state());
      emit("error", { message: "El tutor se detuvo." });
    });
    proc.on("error", (err) => emit("error", { message: `No se pudo iniciar Pi: ${err.message}` }));
    emit("state", state());
  };

  const write = (command: Json) => {
    if (options.agentDisabled) throw new HttpError(503, "the tutor is disabled");
    if (!child || !alive) throw new HttpError(503, "the tutor is not running");
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
    if (busy) throw new HttpError(409, "the tutor is busy");
    if (agy) {
      // Antigravity names its conversation per turn, so switching is choosing the id.
      agy.open(chat.agyConversation ?? undefined);
      return;
    }
    if (chat.piSession) {
      const reply = await call({ type: "switch_session", sessionPath: chat.piSession });
      if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi refused the switch"));
      if (isRecord(reply.data) && reply.data.cancelled === true) throw new HttpError(409, "an extension cancelled the session switch");
      return;
    }
    const reply = await call({ type: "new_session" });
    if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi refused a new session"));
    const stats = await piStats();
    if (stats.file) persist(setPiSession(chats, chat.id, stats.file));
  };

  const openConversation = async (id: unknown): Promise<ChatDoc> => {
    const chat = chatById(chats, id);
    if (chat.id === chats.activo) return chats;
    await switchTo(chat);
    const doc = persist(openChat(chats, chat.id));
    emit("history", await history());
    emit("chats", doc);
    return doc;
  };

  const newConversation = async (input: { nombre: unknown; ambito?: unknown }): Promise<{ doc: ChatDoc; chat: Chat }> => {
    if (busy) throw new HttpError(409, "the tutor is busy");
    const { doc, chat } = createChat(chats, input);
    persist(doc);
    await switchTo(chat);
    emit("history", await history());
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
    if (!current.piSession && stats.file) {
      persist(setPiSession(chats, current.id, stats.file));
      emit("chats", chats);
      return;
    }
    // A restart boots the studio's own session; the active chat may be another one.
    if (current.piSession && stats.file && current.piSession !== stats.file) {
      try { await switchTo(current); } catch (error) { emit("error", { message: (error as Error).message }); }
      emit("history", await history());
    }
    emit("chats", chats);
  };

  const startTutor = (config: TutorConfig) => {
    const previous = child;
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
      busy = false;
      emit("state", state());
    }
  };

  /** A deep topic must be one the engine tracks; anything else would be tutored without a gate. */
  const requireTopic = (value: unknown): string => {
    if (typeof value !== "string" || !value) throw new HttpError(400, "tema must be a string");
    if (!listTopics(root).some((t) => t.id === value)) throw new HttpError(404, `unknown topic: ${value}`);
    if (!enrolled(root, value)) throw new HttpError(400, `topic ${value} is not enrolled in the learning engine`);
    return value;
  };

  const runGate = async (topic: string) => {
    const verdict = await checkDeep({ root, topic, enginePath, rulesPath });
    // A gate for a topic the learner already left says nothing about the one they are on.
    if (tema === topic) {
      gateBlocked = !verdict.passing;
      emit("gate", { tema: topic, ...verdict });
    }
    return verdict;
  };

  /** A prompt while Pi works is queued until it finishes. */
  const prompt = async (text: string) => {
    // Never route a turn before the studio knows which conversation it belongs to.
    await ready;
    if (agy) {
      // Antigravity refuses a second turn while it works: the transcript grows only after that.
      agy.prompt(text);
      agyTurns.push({ role: "user", text });
      return;
    }
    const reply = await call(busy ? { type: "prompt", message: text, streamingBehavior: "followUp" } : { type: "prompt", message: text });
    if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi rejected the prompt"));
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
      return prompt(text);
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
  const engineStatus = (workspace: string): Promise<Json> =>
    new Promise((resolve) => {
      if (!existsSync(enginePath) || !existsSync(join(workspace, ".learning"))) return resolve({ status: "sin inscribir" });
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

  const readBody = (req: IncomingMessage): Promise<Json> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      });
      req.on("end", () => {
        if (size > MAX_BODY_BYTES) return reject(new HttpError(413, "body too large"));
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
    const body = await readBody(req);
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
        if (options.agentDisabled) throw new HttpError(503, "the tutor is disabled");
        if (!isRecord(body)) throw new HttpError(400, "invalid regeneration");
        const tema = typeof body.tema === "string" ? body.tema : "";
        const parte = typeof body.parte === "string" ? body.parte : "";
        if (!/^[\w-]+$/.test(tema) || !/^p\d+$/.test(parte)) throw new HttpError(400, "invalid regeneration target");
        // Everything that can refuse this request happens before the first write: a refused
        // regeneration must leave the part in the library, not in the trash.
        const input = validateSugerencia({ tema, parte, motivos: body.motivos, texto: body.texto, origen: "regenerar" });
        const planned = regenerationTrash(root, { topic: tema, part: parte });
        const text = regenerationPrompt(tema, parte, input, planned.trash);
        if (text.length > MAX_PROMPT_CHARS) throw new HttpError(400, "the regeneration prompt is too long");
        const saved = recordSugerencia(root, { ...input, origen: "regenerar" });
        const backup = backupPartForRegeneration(root, { topic: tema, part: parte }, new Date(), planned.trash || undefined);
        await prompt(text);
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
        if (busy) throw new HttpError(409, "the tutor is busy");
        const config = saveTutor(root, body);
        startTutor(config);
        return sendJson(res, 200, config);
      }
      case "api/tema": {
        if (busy) throw new HttpError(409, "the tutor is busy");
        tema = requireTopic(body.tema);
        gateBlocked = false;
        return sendJson(res, 200, { tema });
      }
      case "prompt": {
        const text = body.text;
        if (typeof text !== "string" || !text.trim() || text.length > MAX_PROMPT_CHARS) {
          throw new HttpError(400, `text must be non-empty, at most ${MAX_PROMPT_CHARS} characters`);
        }
        // Nothing here moves the studio's state before the turn is accepted: a refused prompt
        // must neither clear the gate of the turn in flight nor repoint it at another topic.
        const deep = body.tema === undefined ? null : requireTopic(body.tema);
        if (deep !== null && deep === tema && gateBlocked) {
          // A blocked topic is re-asked before it is refused, so passing releases it again.
          const verdict = await runGate(deep);
          if (!verdict.passing) throw new HttpError(409, `the engine did not accept the last deep turn on ${deep}`);
        }
        await prompt(text.trim());
        if (deep !== null) {
          tema = deep;
          gateBlocked = false;
        }
        turnTema = deep;
        break;
      }
      case "dialog": {
        const id = body.id;
        if (typeof id !== "string" || !dialogs.has(id)) throw new HttpError(404, "no such open dialog");
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
        if (id !== chats.activo) throw new HttpError(409, "open the chat before exporting it");
        const chat = chatById(chats, id);
        // Pi writes the export into its working directory, which here is the vault.
        // The file is named outside it instead, next to the conversation index.
        const dir = join(dirname(chatsFile), "exports");
        mkdirSync(dir, { recursive: true });
        const slug = chat.nombre.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chat";
        const outputPath = join(dir, `${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
        const reply = await call({ type: "export_html", outputPath }, 30000);
        // Pi's own refusal is the answer: an empty conversation cannot be exported.
        if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi refused the export"));
        const path = isRecord(reply.data) && typeof reply.data.path === "string" ? reply.data.path : "";
        if (!path) throw new HttpError(502, "Pi did not export the conversation");
        return sendJson(res, 200, { path });
      }
      case "new-session": {
        // The old control now creates a chat: the list is the only source of conversations.
        await newConversation({ nombre: `Chat ${chats.chats.length + 1}` });
        break;
      }
      case "restart":
        if (options.agentDisabled) throw new HttpError(503, "the tutor is disabled");
        // Restart is the escape hatch for a turn that never settles, so it works while busy.
        if (alive) child?.kill();
        startTutor(tutor);
        break;
      default:
        throw new HttpError(404, "not found");
    }
    sendJson(res, 200, { ok: true });
  };

  const history = async (): Promise<{ messages: Json[]; note: Note | null }> => {
    if (!alive || agy) return { messages: agy ? [...agyTurns] : [], note: null };
    try {
      const reply = await call({ type: "get_messages" }, 10000);
      const raw = isRecord(reply.data) && Array.isArray(reply.data.messages) ? reply.data.messages : [];
      const messages = raw
        .filter((m): m is Json => isRecord(m) && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role, text: messageText(m) }))
        .filter((m) => m.text);
      return { messages, note: noteFromMessages(raw, root) };
    } catch {
      return { messages: [], note: null };
    }
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
  registerBridge(fakePi as never, { root, tokenSeed: token, transcriber: options.transcriberUrl === undefined ? undefined : { url: options.transcriberUrl, token: options.transcriberToken! }, port: options.bridgePort, publicOrigin: options.bridgePublicOrigin, publicEmbedder: options.publicOrigin, frameAncestors: [`http://127.0.0.1:${port}`, `http://localhost:${port}`] });
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
