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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CDN_SCRIPTS,
  HttpError,
  NoteRevMismatch,
  deleteNote,
  listTopics,
  parsePublicOrigins,
  readQuickNote,
  registerBridge,
  writeQuickNote,
  type DeleteResult,
} from "../integrations/pi/bridge.ts";
import { lintMarkdown } from "../tools/deck-lint.mjs";
import { resolveContained } from "../integrations/pi/paths.ts";
import { buildPanorama } from "./panorama.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const UI_DIR = join(HERE, "ui");
const CANONICAL_ROOT = "/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings";
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
  const contained = resolveContained(options.root ?? CANONICAL_ROOT, options.root ?? CANONICAL_ROOT);
  if (!contained.ok) throw new Error(contained.reason);
  if (options.token !== undefined && !TOKEN_SHAPE.test(options.token)) throw new Error("token must be 64 lowercase hex characters");
  const root = contained.rootReal;
  // Its own session id: terminal sessions in the same folder are never written by two processes.
  const piCommand = options.piCommand ?? ["pi", "--mode", "rpc", "--session-id", "estudio"];
  const enginePath = options.enginePath ?? join(REPO, "bin", "learning");
  const rulesPath = options.rulesPath ?? join(REPO, "rules", "deep.json");
  const token = options.token ?? randomBytes(32).toString("hex");
  const openedFile = options.openedFile ?? join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "learning-studio", "opened.json");
  let port = 0;

  // ---- Server-Sent Events ------------------------------------------------
  const clients = new Set<ServerResponse>();
  const emit = (event: string, data: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  };

  // ---- Pi child (JSONL RPC) ----------------------------------------------
  let child: ChildProcessWithoutNullStreams | undefined;
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
        }
        return;
      }
      case "tool_execution_start": {
        const name = String(record.toolName);
        const id = String(record.toolCallId);
        toolArgs.set(id, record.args);
        const note = toolNote(name, record.args, root);
        const topic = toolTopic(name, record.args, root);
        emit("tool", { phase: "start", id: record.toolCallId, name: record.toolName, label: toolLabel(name, record.args), ok: true, ...(note === null ? {} : { note }), ...(topic === null ? {} : { topic }) });
        return;
      }
      case "tool_execution_end": {
        const name = String(record.toolName);
        const id = String(record.toolCallId);
        const args = record.args ?? toolArgs.get(id);
        toolArgs.delete(id);
        const note = toolNote(name, args, root);
        const topic = toolTopic(name, args, root);
        emit("tool", { phase: "end", id: record.toolCallId, name: record.toolName, label: toolLabel(name, args), ok: !record.isError, ...(note === null ? {} : { note }), ...(topic === null ? {} : { topic }) });
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
    const [cmd, ...args] = piCommand;
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

  /** A prompt while Pi works is queued until it finishes. */
  const prompt = async (text: string) => {
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
    const data = JSON.stringify({ base: `/${token}/` }).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Estudio — Learnings</title>
<link rel="icon" href="/${token}/favicon.svg" type="image/svg+xml">
${FONT_STYLESHEETS.map(([href, sri]) => `<link rel="stylesheet" href="${href}" integrity="${sri}" crossorigin="anonymous">`).join("\n")}
<link rel="stylesheet" href="/${token}/studio.css">
${scripts}
</head>
<body>
<main id="studio"></main>
<script type="application/json" id="studio-data">${data}</script>
<script src="/${token}/kit/scene.js"></script>
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
      `frame-src ${bridgeOrigin}`,
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

  const post = async (req: IncomingMessage, res: ServerResponse, action: string) => {
    const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(publicOrigins ?? []).map((origin) => origin.origin)]);
    if (!allowed.has(String(req.headers.origin ?? ""))) throw new HttpError(403, "foreign origin");
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "JSON only");
    const body = await readBody(req);
    switch (action) {
      case "prompt": {
        const text = body.text;
        if (typeof text !== "string" || !text.trim() || text.length > MAX_PROMPT_CHARS) {
          throw new HttpError(400, `text must be non-empty, at most ${MAX_PROMPT_CHARS} characters`);
        }
        await prompt(text.trim());
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
        await call({ type: "abort" }, 60000);
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
      case "new-session": {
        const reply = await call({ type: "new_session" });
        if (reply.success === false) throw new HttpError(409, String(reply.error ?? "Pi refused a new session"));
        emit("history", { messages: [], note: null });
        break;
      }
      case "restart":
        if (alive) child?.kill();
        startPi();
        break;
      default:
        throw new HttpError(404, "not found");
    }
    sendJson(res, 200, { ok: true });
  };

  const history = async (): Promise<{ messages: Json[]; note: Note | null }> => {
    if (!alive) return { messages: [], note: null };
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
        return send(res, 200, "text/javascript; charset=utf-8", readFileSync(join(HERE, "..", "integrations", "pi", "kit", "scene.js")));
      case "studio.css":
        return send(res, 200, "text/css; charset=utf-8", readFileSync(join(UI_DIR, "studio.css")));
      case "favicon.svg":
        // The same mark the reader serves, so both surfaces share one icon file.
        return send(res, 200, "image/svg+xml", readFileSync(join(HERE, "..", "integrations", "pi", "view", "favicon.svg")), { "cache-control": "public, max-age=3600" });
      case "events":
        return events(res);
      case "api/library":
        return sendJson(res, 200, await library());
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
            { planJson: text("plan.json"), plan: text("planificador.md"), map: text("mapa.mmd") },
          ),
        );
      }
      case "api/note": {
        const quick = url.searchParams.get("quick") ?? "";
        return sendJson(res, 200, readQuickNote(root, quick));
      }
      case "api/view": {
        const quick = url.searchParams.get("quick");
        if (quick !== null) {
          const file = join(root, "rapidos", `${quick}.md`);
          if (!/^[\w-]+$/.test(quick) || !existsSync(file)) throw new HttpError(404, `no quick note ${quick}`);
          return sendJson(res, 200, { url: `${String((await view()).base)}rapidos/${encodeURIComponent(quick)}` });
        }
        const result = await view(url.searchParams.get("topic") ?? undefined, url.searchParams.get("part") ?? undefined);
        return sendJson(res, 200, { url: result.url, ...(result.appUrl ? { appUrl: result.appUrl } : {}) });
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
  startPi();

  return {
    url: `http://127.0.0.1:${port}/${token}/`,
    port,
    close: async () => {
      for (const res of clients) res.end();
      clients.clear();
      const proc = child;
      child = undefined;
      proc?.kill();
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
