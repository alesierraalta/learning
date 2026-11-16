/**
 * The pieces background topic tasks share with the main chat: a FIFO writer lock per
 * topic, the status the UI reads, and the Antigravity conversation ids kept outside the vault.
 *
 * The lock is about a topic's files, not about a runtime: the main chat and a task queue on the
 * same ticket. Its release is idempotent so a route can hand a ticket to a turn and still clean
 * up if the turn never starts. Nobody waits on a global limit: different topics never share a
 * queue entry.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type TaskState = "working" | "waiting" | "asking" | "done" | "failed";

export type TaskView = {
  topic: string;
  state: TaskState;
  activity: string;
  queued: number;
};

type Ticket = { topic: string; release: () => void };
type Queue = { active: boolean; waiters: Array<(ticket: Ticket) => void> };

/** A FIFO lock with one owner per topic and no global cap. */
export function createTopicLocks() {
  const queues = new Map<string, Queue>();
  const queueOf = (topic: string) => {
    let entry = queues.get(topic);
    if (!entry) {
      entry = { active: false, waiters: [] };
      queues.set(topic, entry);
    }
    return entry;
  };
  const grant = (topic: string, entry: Queue) => {
    if (entry.active || entry.waiters.length === 0) return;
    entry.active = true;
    const next = entry.waiters.shift()!;
    let released = false;
    next({
      topic,
      release() {
        if (released) return;
        released = true;
        entry!.active = false;
        grant(topic, entry!);
        if (!entry!.active && entry!.waiters.length === 0) queues.delete(topic);
      },
    });
  };
  return {
    /** Resolves with the ticket when this request is the topic's one writer. */
    acquire(topic: string): Promise<Ticket> {
      const entry = queueOf(topic);
      return new Promise((resolve) => {
        entry.waiters.push(resolve);
        grant(topic, entry);
      });
    },
    /** How many requests are waiting behind the current writer; the visible queue. */
    queued(topic: string): number {
      return queues.get(topic)?.waiters.length ?? 0;
    },
    topics(): string[] {
      return [...queues.keys()];
    },
  };
}

export type TopicLocks = ReturnType<typeof createTopicLocks>;

type ConversationDoc = { version: 1; conversaciones: Record<string, string> };
type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/** Next to `chats.json`: a restart keeps each topic's Antigravity thread. */
export function taskConversationsFile(chatsFile: string): string {
  return join(dirname(chatsFile), "tareas.json");
}

export function readTaskConversations(file: string): ConversationDoc {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.conversaciones)) return { version: 1, conversaciones: {} };
    const conversaciones = Object.fromEntries(
      Object.entries(parsed.conversaciones).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""),
    );
    return { version: 1, conversaciones };
  } catch {
    return { version: 1, conversaciones: {} };
  }
}

/** Writes one topic's id without losing the others'; the file is always replaced whole. */
export function saveTaskConversation(file: string, topic: string, id: string): void {
  const doc = readTaskConversations(file);
  doc.conversaciones[topic] = id;
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(doc, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* nothing to clean */ }
    throw error;
  }
}
