// Antigravity runtime seam: the studio's settle gate sends a correction as one more turn, so the
// runtime has to continue the conversation the first turn opened instead of starting a new one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgy } from "./agy.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_AGY = join(HERE, "testdata", "fake-agy.mjs");

const turns = (file) =>
  existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];

const until = async (pred, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (pred()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("condition not met");
};

test("a second turn resumes the conversation the first one opened", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agy-resume-"));
  const log = join(dir, "turns.log");
  process.env.FAKE_AGY_TURNS = log;
  let settled = 0;
  const agy = createAgy({
    command: [process.execPath, FAKE_AGY],
    cwd: dir,
    config: { version: 1, agente: "agy", modelo: "", pensamiento: "" },
    onRecord: (record) => {
      if (record.type === "agent_settled") settled += 1;
    },
    onError: (message) => assert.fail(message),
  });
  try {
    agy.prompt("primera");
    await until(() => settled === 1);
    assert.equal(agy.conversation(), "test-conversation", "the runtime keeps the id Antigravity assigned");

    // The gate's correction is a second turn, and it must land in the same conversation.
    agy.prompt("segunda");
    await until(() => settled === 2);
    const [first, second] = turns(log);
    assert.doesNotMatch(first.join(" "), /--conversation/, "the first turn opens a conversation");
    assert.match(second.join(" "), /--conversation test-conversation/, "the correction resumes it");
    assert.match(second.join(" "), /segunda/);

    // Opening another chat's conversation points the next turn at that one instead.
    agy.open("otra-conversacion");
    agy.prompt("tercera");
    await until(() => settled === 3);
    assert.match(turns(log)[2].join(" "), /--conversation otra-conversacion/);
  } finally {
    delete process.env.FAKE_AGY_TURNS;
  }
});

// El preámbulo del estudio es lo único que Antigravity recibe en cada turno: si el
// lenguaje de historia no está ahí, el modelo vuelve al `<lk-walkthrough>` clásico
// y el motor rechaza la parte (#237). La línea apunta a la regla, no la repite.
test("the studio preamble points at the story language, and names the classic walkthrough as legacy", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agy-preamble-"));
  const log = join(dir, "turns.log");
  process.env.FAKE_AGY_TURNS = log;
  let settled = 0;
  const agy = createAgy({
    command: [process.execPath, FAKE_AGY],
    cwd: dir,
    config: { version: 1, agente: "agy", modelo: "", pensamiento: "" },
    onRecord: (record) => {
      if (record.type === "agent_settled") settled += 1;
    },
    onError: (message) => assert.fail(message),
  });
  try {
    agy.prompt("escribe la parte 1");
    await until(() => settled === 1);
    const prompt = turns(log)[0].join(" ");
    assert.match(prompt, /lenguaje de historia/);
    assert.match(prompt, /<lk-story>/);
    assert.match(prompt, /<lk-cards>, <lk-memory>, <lk-tables>, <lk-venn>/);
    assert.match(prompt, /<lk-walkthrough> clásico no cuentan/);
    assert.match(prompt, /el motor rechaza la parte que no trae historia ni pieza/);
    assert.match(prompt, /explicacion-interactiva/);
    assert.match(prompt, /técnico en el contenido, sencillo en la forma/);
    assert.match(prompt, /se explica en palabras llanas donde aparece/);
  } finally {
    delete process.env.FAKE_AGY_TURNS;
  }
});

// El método es la pregunta de la página del tema y la parte se señala por su nombre en el estudio:
// agy no tiene herramienta de preguntas en modo -p y no puede abrir un `file://` (#248). El
// preámbulo es lo único que recibe en cada turno, así que las dos reglas viajan ahí.
test("the studio preamble leaves the method to the page and forbids filesystem links", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agy-method-"));
  const log = join(dir, "turns.log");
  process.env.FAKE_AGY_TURNS = log;
  let settled = 0;
  const agy = createAgy({
    command: [process.execPath, FAKE_AGY],
    cwd: dir,
    config: { version: 1, agente: "agy", modelo: "", pensamiento: "" },
    onRecord: (record) => {
      if (record.type === "agent_settled") settled += 1;
    },
    onError: (message) => assert.fail(message),
  });
  try {
    agy.prompt("escribe la parte 1");
    await until(() => settled === 1);
    const prompt = turns(log)[0].join(" ");
    assert.match(prompt, /El método \(pareto o preferencias\) es la pregunta de la página del tema/);
    assert.match(prompt, /nunca lo registres tú/);
    assert.match(prompt, /no corras `learning method`/);
    assert.match(prompt, /dile a la persona que elija en la página del tema y termina el turno/);
    assert.match(prompt, /«Ir a Parte N»/);
    assert.match(prompt, /nunca un enlace `file:\/\/` ni una ruta del sistema de archivos/);
  } finally {
    delete process.env.FAKE_AGY_TURNS;
  }
});
