/**
 * The studio's own state directory: the files a deploy reads without a token and
 * the conversation copy a restart comes back to. Same root as `opened.json`
 * (`$XDG_STATE_HOME/learning-studio`).
 *
 * The idle marker is the one rule a deploy needs: a turn is in flight while the
 * marker names a live pid and a turn that started inside the turn timeout. A
 * studio that crashed cannot clear its marker, so one that fails either test is a
 * leftover and never blocks a deploy.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The longest a tutor turn may hold the studio; an older marker is a crashed studio's leftover. */
export const TURN_TIMEOUT_MS = 60 * 60 * 1000;

/** What the studio writes while it holds a tutor turn; `busy` is always true. */
export type BusyMark = { busy: true; pid: number; startedAt: number; topic: string | null };

/** One message of the conversation the studio keeps for itself. */
export type ChatMessage = { role: "user" | "assistant"; text: string };

/** The turn a process was holding when it went away. */
export type InterruptedTurn = { topic: string | null; at: number };

/** The active chat's thread and the turn that was in flight, written outside the vault. */
export type ChatSnapshot = {
  version: 1;
  chat: string;
  /** The process that wrote it: a copy written by a live studio belongs to that studio, not to this one. */
  pid: number | null;
  messages: ChatMessage[];
  interrupted: InterruptedTurn | null;
};

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);

/** The marker and the conversation copy live beside the file the studio already keeps. */
export const busyFile = (stateFile: string): string => join(dirname(stateFile), "busy.json");
export const snapshotFile = (stateFile: string): string => join(dirname(stateFile), "conversacion.json");

/** A state file is replaced whole, so a reader never sees half of one. */
function writeAtomic(file: string, text: string): void {
  const temporary = `${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(temporary, text, { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* nothing to clean */ }
    throw error;
  }
}

/** Writes the marker a deploy reads: the turn the studio is holding right now. */
export function markBusy(file: string, mark: { pid: number; startedAt: number; topic: string | null }): void {
  writeAtomic(file, `${JSON.stringify({ busy: true, pid: mark.pid, startedAt: mark.startedAt, topic: mark.topic })}\n`);
}

/** A turn that ended leaves no marker; a marker already gone is not an error. */
export function clearBusy(file: string): void {
  try {
    unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** A damaged or half-written marker is no marker: a deploy must never be blocked by one. */
export function readBusy(file: string): BusyMark | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.busy !== true) return null;
  const { pid, startedAt, topic } = parsed;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return null;
  return { busy: true, pid, startedAt, topic: typeof topic === "string" ? topic : null };
}

/** Whether a pid exists. A pid this user may not signal still exists. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The one rule: a marker holds the studio only while its process lives and its
 * turn started inside the turn timeout. Everything else is a leftover.
 */
export function busyActive(
  mark: BusyMark | null,
  options: { now?: number; alive?: (pid: number) => boolean; timeoutMs?: number } = {},
): boolean {
  if (mark === null || !mark.busy) return false;
  const now = options.now ?? Date.now();
  const alive = options.alive ?? pidAlive;
  const timeoutMs = options.timeoutMs ?? TURN_TIMEOUT_MS;
  if (!alive(mark.pid)) return false;
  return now - mark.startedAt <= timeoutMs;
}

export function saveSnapshot(file: string, snapshot: ChatSnapshot): void {
  writeAtomic(file, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function messageOf(value: unknown): ChatMessage | null {
  if (!isRecord(value) || (value.role !== "user" && value.role !== "assistant") || typeof value.text !== "string") return null;
  return { role: value.role, text: value.text };
}

/** A damaged copy is no copy: the runtime's own history is still the source when it has one. */
export function readSnapshot(file: string): ChatSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.chat !== "string" || !Array.isArray(parsed.messages)) return null;
  const messages = parsed.messages.map(messageOf).filter((message): message is ChatMessage => message !== null);
  const pid = typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0 ? parsed.pid : null;
  const raw = parsed.interrupted;
  const interrupted = isRecord(raw) && typeof raw.at === "number" && Number.isFinite(raw.at)
    ? { topic: typeof raw.topic === "string" ? raw.topic : null, at: raw.at }
    : null;
  return { version: 1, chat: parsed.chat, pid, messages, interrupted };
}

/**
 * The copy a restart comes back to: the active chat's own, written by a process that is
 * gone. A copy written by a studio that is still running belongs to that studio, so two
 * studios on one machine never adopt each other's interrupted turn. A hand-written copy
 * has no pid and is taken as it is.
 */
export function readRestartSnapshot(file: string, chat: string): ChatSnapshot | null {
  const copied = readSnapshot(file);
  if (copied === null || copied.chat !== chat) return null;
  if (copied.pid !== null && pidAlive(copied.pid)) return null;
  return copied;
}

/**
 * The deploy asks this module instead of re-implementing the rule:
 * `node studio/state.ts --busy <file> [--timeout-ms N]` prints `idle` or
 * `busy <topic>` and exits 0; a usage error exits 2.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--busy");
  const file = at >= 0 ? args[at + 1] : undefined;
  const timeoutAt = args.indexOf("--timeout-ms");
  const timeoutMs = timeoutAt >= 0 ? Number(args[timeoutAt + 1]) : TURN_TIMEOUT_MS;
  if (!file || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    process.stderr.write("usage: node studio/state.ts --busy <file> [--timeout-ms N]\n");
    process.exit(2);
  }
  const mark = readBusy(file);
  if (!busyActive(mark, { timeoutMs })) process.stdout.write("idle\n");
  else process.stdout.write(`busy${mark?.topic ? ` ${mark.topic}` : ""}\n`);
}
