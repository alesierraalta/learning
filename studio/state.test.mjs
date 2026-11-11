// The studio's own state directory: the idle marker a deploy reads without a
// token, and the conversation copy a restart comes back to.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  TURN_TIMEOUT_MS,
  busyActive,
  busyFile,
  clearBusy,
  markBusy,
  pidAlive,
  readBusy,
  readRestartSnapshot,
  readSnapshot,
  saveSnapshot,
  snapshotFile,
} from "./state.ts";

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function stateDir() {
  const dir = mkdtempSync(join(tmpdir(), "studio-state-"));
  roots.push(dir);
  return dir;
}

test("the idle marker lives next to opened.json and is readable without a token", () => {
  const dir = stateDir();
  const file = busyFile(join(dir, "opened.json"));
  assert.equal(file, join(dir, "busy.json"));
  assert.equal(snapshotFile(join(dir, "opened.json")), join(dir, "conversacion.json"));

  markBusy(file, { pid: 4242, startedAt: 1_700_000_000_000, topic: "redes" });
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
    busy: true,
    pid: 4242,
    startedAt: 1_700_000_000_000,
    topic: "redes",
  });
  assert.deepEqual(readBusy(file), { busy: true, pid: 4242, startedAt: 1_700_000_000_000, topic: "redes" });

  clearBusy(file);
  assert.equal(existsSync(file), false, "a finished turn leaves no marker");
  assert.equal(readBusy(file), null);
});

test("a marker from a dead pid or an old turn is stale and never blocks", () => {
  const now = 1_700_000_000_000;
  const mark = { busy: true, pid: 4242, startedAt: now - 1_000, topic: null };

  assert.equal(busyActive(mark, { now, alive: () => true }), true, "a live pid holds the studio");
  assert.equal(busyActive(mark, { now, alive: () => false }), false, "a crashed studio's marker is stale");
  assert.equal(busyActive({ ...mark, startedAt: now - TURN_TIMEOUT_MS - 1 }, { now, alive: () => true }), false, "an old turn is stale");
  assert.equal(busyActive(null, { now }), false);
  assert.equal(busyActive({ ...mark, busy: false }, { now, alive: () => true }), false);
});

test("pidAlive knows this process and not a pid that is gone", () => {
  assert.equal(pidAlive(process.pid), true);
  // Above Linux's pid_max: no process can hold it, so the marker is a leftover.
  assert.equal(pidAlive(2 ** 22 + 12345), false);
});

test("the conversation copy round-trips and a damaged one is ignored", () => {
  const dir = stateDir();
  const file = snapshotFile(join(dir, "opened.json"));
  const snapshot = {
    version: 1,
    chat: "abc123",
    pid: 4242,
    messages: [
      { role: "user", text: "Responde el diagnóstico" },
      { role: "assistant", text: "Ya está el diagnóstico." },
    ],
    interrupted: { topic: "redes", at: 1_700_000_000_000 },
  };
  saveSnapshot(file, snapshot);
  assert.deepEqual(readSnapshot(file), snapshot);

  writeFileSync(file, "{ not json");
  assert.equal(readSnapshot(file), null);
  assert.equal(readSnapshot(join(dir, "missing.json")), null);
});

test("a restart adopts only the copy of a process that is gone", () => {
  const dir = stateDir();
  const file = snapshotFile(join(dir, "opened.json"));
  const base = { version: 1, chat: "abc123", messages: [], interrupted: { topic: "redes", at: 1 } };

  // A studio that is still running keeps its own copy: two studios never adopt each other.
  saveSnapshot(file, { ...base, pid: process.pid });
  assert.equal(readRestartSnapshot(file, "abc123"), null);
  // A copy from a process that is gone is the restart's own.
  saveSnapshot(file, { ...base, pid: 2 ** 22 + 12345 });
  assert.equal(readRestartSnapshot(file, "abc123")?.interrupted?.topic, "redes");
  // Another chat's copy is never adopted, even when its writer is gone.
  assert.equal(readRestartSnapshot(file, "otro"), null);
  // A hand-written copy has no pid and is taken as it is.
  saveSnapshot(file, { ...base, pid: null });
  assert.equal(readRestartSnapshot(file, "abc123")?.interrupted?.topic, "redes");
});
