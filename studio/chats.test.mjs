// The chat index: names, the part anchor, the active chat and the last context
// Pi reported. Nothing here talks to a runtime, so the whole file is the store.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  chatForAmbito,
  createChat,
  deleteChat,
  emptyDoc,
  openChat,
  readChats,
  recordContexto,
  renameChat,
  saveChats,
  setPiSession,
} from "./chats.ts";

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function file() {
  const dir = mkdtempSync(join(tmpdir(), "chats-"));
  roots.push(dir);
  return join(dir, "chats.json");
}

test("a created chat keeps the learner's name and has no session yet", () => {
  const { doc, chat } = createChat(emptyDoc(), { nombre: "dudas de MDP" });

  assert.equal(chat.nombre, "dudas de MDP");
  assert.equal(chat.piSession, null);
  assert.equal(chat.agyConversation, null);
  assert.equal(chat.ambito, null);
  assert.equal(doc.activo, chat.id);
  assert.equal(doc.chats.length, 1);
});

test("a name is trimmed, and an empty or overlong one is refused", () => {
  const { chat } = createChat(emptyDoc(), { nombre: "  repaso examen  " });
  assert.equal(chat.nombre, "repaso examen");

  assert.throws(() => createChat(emptyDoc(), { nombre: "   " }), /name/i);
  assert.throws(() => createChat(emptyDoc(), { nombre: "x".repeat(81) }), /name/i);
});

test("the index survives a restart and keeps every chat", () => {
  const path = file();
  const first = createChat(emptyDoc(), { nombre: "uno" });
  const second = createChat(first.doc, { nombre: "dos" });
  saveChats(path, second.doc);

  const reloaded = readChats(path);
  assert.deepEqual(reloaded.chats.map((c) => c.nombre), ["uno", "dos"]);
  assert.equal(reloaded.activo, second.chat.id);
});

test("a damaged file starts empty instead of stopping the studio", () => {
  const path = file();
  writeFileSync(path, "{ not json");

  const doc = readChats(path);
  assert.deepEqual(doc.chats, []);
  assert.equal(doc.activo, "");
});

test("opening a chat makes it active and marks it used", () => {
  const first = createChat(emptyDoc(), { nombre: "uno" });
  const second = createChat(first.doc, { nombre: "dos" });

  const opened = openChat(second.doc, first.chat.id);
  assert.equal(opened.activo, first.chat.id);
  assert.ok(opened.chats[0].usado >= first.chat.usado);
  assert.throws(() => openChat(second.doc, "nope"), /unknown chat/i);
});

test("the active chat cannot be deleted", () => {
  const first = createChat(emptyDoc(), { nombre: "uno" });
  const second = createChat(first.doc, { nombre: "dos" });

  assert.throws(() => deleteChat(second.doc, second.chat.id), /active/i);

  const after = deleteChat(second.doc, first.chat.id);
  assert.deepEqual(after.chats.map((c) => c.nombre), ["dos"]);
  assert.equal(after.activo, second.chat.id);
});

test("the part anchor finds its chat and a free chat has none", () => {
  const free = createChat(emptyDoc(), { nombre: "libre" });
  const anchored = createChat(free.doc, { nombre: "Parte 2 · MDP", ambito: "parte:refuerzo/p2" });

  assert.equal(chatForAmbito(anchored.doc, "parte:refuerzo/p2")?.id, anchored.chat.id);
  assert.equal(chatForAmbito(anchored.doc, "parte:refuerzo/p3"), null);
  assert.equal(chatForAmbito(anchored.doc, "tema:refuerzo"), null);
  assert.throws(() => createChat(emptyDoc(), { nombre: "x", ambito: "../escape" }), /anchor/i);
});

test("the last context Pi reported is kept per chat", () => {
  const first = createChat(emptyDoc(), { nombre: "uno" });
  const withSession = setPiSession(first.doc, first.chat.id, "/tmp/s1.jsonl");

  const recorded = recordContexto(withSession, first.chat.id, { tokens: 60000, ventana: 200000, porcentaje: 30 });
  assert.deepEqual(recorded.chats[0].contexto, { tokens: 60000, ventana: 200000, porcentaje: 30 });
  assert.equal(recorded.chats[0].piSession, "/tmp/s1.jsonl");
});
