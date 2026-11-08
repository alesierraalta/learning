/**
 * The learner's conversations, as the studio's own index.
 *
 * The list lives outside the vault, next to `opened.json`, and never reads Pi's
 * session directory: that folder also holds the terminal sessions of the same
 * working directory, and the studio must only list and delete what it created.
 * A chat is a name, an optional anchor to the part it was opened from, and the
 * handle each runtime needs to resume it -- Pi's session file, Antigravity's
 * conversation id -- plus the last context usage Pi reported while it was active.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { HttpError } from "../integrations/pi/bridge.ts";

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

/** A name the learner typed; long enough for a sentence, short enough for one row. */
const NOMBRE_MAX = 80;
/** A part anchor is the reader's own address: `<topic>/<part>`, nothing else. */
const AMBITO = /^(?:tema:[\w-]+|parte:[\w-]+\/p\d+)$/;

export interface ChatContexto {
  tokens: number;
  ventana: number;
  porcentaje: number;
}

export interface Chat {
  id: string;
  nombre: string;
  /** `tema:<id>` or `parte:<id>/<part>`, or null for a chat the learner named freely. */
  ambito: string | null;
  /** Pi's session file for this chat, once the runtime reported it. */
  piSession: string | null;
  /** Antigravity's conversation id for this chat. */
  agyConversation: string | null;
  creado: number;
  usado: number;
  /** The last usage Pi reported while this chat was active; null until it reports one. */
  contexto: ChatContexto | null;
}

export interface ChatDoc {
  version: 1;
  /** The chat the tutor is talking in; empty only when the list is empty. */
  activo: string;
  chats: Chat[];
}

export function emptyDoc(): ChatDoc {
  return { version: 1, activo: "", chats: [] };
}

function nombre(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "a chat name must be a string");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > NOMBRE_MAX) throw new HttpError(400, `a chat name must be 1 to ${NOMBRE_MAX} characters`);
  return trimmed;
}

function ambito(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !AMBITO.test(value)) throw new HttpError(400, "invalid chat anchor");
  return value;
}

function contexto(value: unknown): ChatContexto | null {
  if (!isRecord(value)) return null;
  const { tokens, ventana, porcentaje } = value;
  if (![tokens, ventana, porcentaje].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return { tokens: tokens as number, ventana: ventana as number, porcentaje: porcentaje as number };
}

/** A stored chat is read field by field, so a hand-edited file cannot inject a shape. */
function chatOf(value: unknown): Chat | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.nombre !== "string") return null;
  const at = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
  return {
    id: value.id,
    nombre: value.nombre,
    ambito: typeof value.ambito === "string" ? value.ambito : null,
    piSession: typeof value.piSession === "string" ? value.piSession : null,
    agyConversation: typeof value.agyConversation === "string" ? value.agyConversation : null,
    creado: at(value.creado),
    usado: at(value.usado),
    contexto: contexto(value.contexto),
  };
}

/**
 * A missing file is an empty list; a damaged one is reported and also starts
 * empty, because a broken index must not stop the studio from opening.
 */
export function readChats(file: string): ChatDoc {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDoc();
    throw error;
  }
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.chats)) throw new Error("not a chat index");
    const chats = parsed.chats.map(chatOf).filter((chat): chat is Chat => chat !== null);
    const activo = typeof parsed.activo === "string" && chats.some((chat) => chat.id === parsed.activo) ? parsed.activo : chats[0]?.id ?? "";
    return { version: 1, activo, chats };
  } catch (error) {
    process.stderr.write(`estudio: chats.json ilegible, empiezo con la lista vacía · ${(error as Error).message}\n`);
    return emptyDoc();
  }
}

export function saveChats(file: string, doc: ChatDoc): ChatDoc {
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(temporary, `${JSON.stringify(doc, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* nothing to clean */ }
    throw error;
  }
  return doc;
}

export function chatById(doc: ChatDoc, id: unknown): Chat {
  const chat = typeof id === "string" ? doc.chats.find((c) => c.id === id) : undefined;
  if (!chat) throw new HttpError(404, `unknown chat: ${String(id)}`);
  return chat;
}

export function chatForAmbito(doc: ChatDoc, value: string): Chat | null {
  return doc.chats.find((chat) => chat.ambito === value) ?? null;
}

export function createChat(doc: ChatDoc, input: { nombre: unknown; ambito?: unknown }): { doc: ChatDoc; chat: Chat } {
  const now = Date.now();
  const chat: Chat = {
    id: randomBytes(6).toString("hex"),
    nombre: nombre(input.nombre),
    ambito: ambito(input.ambito),
    piSession: null,
    agyConversation: null,
    creado: now,
    usado: now,
    contexto: null,
  };
  return { doc: { ...doc, activo: chat.id, chats: [...doc.chats, chat] }, chat };
}

export function openChat(doc: ChatDoc, id: unknown): ChatDoc {
  const chat = chatById(doc, id);
  return { ...doc, activo: chat.id, chats: doc.chats.map((c) => (c.id === chat.id ? { ...c, usado: Math.max(Date.now(), c.usado) } : c)) };
}

export function renameChat(doc: ChatDoc, id: unknown, value: unknown): ChatDoc {
  const chat = chatById(doc, id);
  const renamed = nombre(value);
  return { ...doc, chats: doc.chats.map((c) => (c.id === chat.id ? { ...c, nombre: renamed } : c)) };
}

/**
 * The file a running agent writes is never deleted: deleting the active chat is
 * refused until another one is opened.
 */
export function deleteChat(doc: ChatDoc, id: unknown): ChatDoc {
  const chat = chatById(doc, id);
  if (chat.id === doc.activo) throw new HttpError(409, "cannot delete the active chat");
  return { ...doc, chats: doc.chats.filter((c) => c.id !== chat.id) };
}

/** Each runtime's handle is recorded on the chat it belongs to, never shared. */
export function setPiSession(doc: ChatDoc, id: unknown, sessionFile: string | null): ChatDoc {
  const chat = chatById(doc, id);
  return { ...doc, chats: doc.chats.map((c) => (c.id === chat.id ? { ...c, piSession: sessionFile } : c)) };
}

export function setAgyConversation(doc: ChatDoc, id: unknown, conversation: string | null): ChatDoc {
  const chat = chatById(doc, id);
  return { ...doc, chats: doc.chats.map((c) => (c.id === chat.id ? { ...c, agyConversation: conversation } : c)) };
}

export function recordContexto(doc: ChatDoc, id: unknown, usage: ChatContexto | null): ChatDoc {
  const chat = chatById(doc, id);
  return { ...doc, chats: doc.chats.map((c) => (c.id === chat.id ? { ...c, contexto: usage } : c)) };
}
