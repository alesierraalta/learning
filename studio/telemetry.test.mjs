import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HttpError } from "../integrations/pi/bridge.ts";
import { stored } from "./testdata/stored.mjs";

import {
  readGlobalTelemetry,
  saveGlobalTelemetry,
  readTopicTelemetry,
  saveTopicTelemetry,
  recordQuizTelemetry,
  validateGlobalTelemetry,
  defaultGlobalTelemetry,
} from "./telemetry.ts";

test("readGlobalTelemetry returns default telemetry when file is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  try {
    const data = readGlobalTelemetry(root);
    assert.equal(data.version, 1);
    assert.equal(data.estadisticas_globales.total_quizzes, 0);
    assert.ok(data.perfil_alumno.tendencias.matematicas);
    assert.equal(stored(root, "telemetria"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("saveGlobalTelemetry persists telemetry atomically and validates format", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  try {
    const initial = readGlobalTelemetry(root);
    initial.perfil_alumno.fortalezas.push("Prueba");
    const saved = saveGlobalTelemetry(root, initial);
    assert.deepEqual(JSON.parse(stored(root, "telemetria")).perfil_alumno.fortalezas, saved.perfil_alumno.fortalezas);
    assert.deepEqual(readGlobalTelemetry(root).perfil_alumno.fortalezas, saved.perfil_alumno.fortalezas);

    // Rejection of invalid structure
    assert.throws(() => saveGlobalTelemetry(root, { version: 2 }), /invalid telemetry/);
    assert.throws(() => saveGlobalTelemetry(root, { ...initial, perfil_alumno: null }), /invalid telemetry/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recordQuizTelemetry updates global and topic telemetry", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  try {
    const entry1 = {
      punto: "1. Por qué existe",
      tema: "prueba-tema",
      categoria: "matematicas",
      pregunta: "¿Cuánto es 2 + 2?",
      respuesta_alumno: "A",
      respuesta_correcta: "B",
      ok: false,
      por_que: "Error de cálculo aritmético básico",
    };

    const res1 = recordQuizTelemetry(root, entry1);
    assert.equal(res1.global.estadisticas_globales.total_quizzes, 1);
    assert.equal(res1.global.estadisticas_globales.total_aciertos, 0);
    assert.equal(res1.global.estadisticas_globales.total_fallos, 1);
    assert.equal(res1.global.estadisticas_globales.por_categoria.matematicas.total, 1);
    assert.equal(res1.global.estadisticas_globales.por_categoria.matematicas.fallos, 1);
    assert.equal(res1.global.historial_reciente.length, 1);
    assert.equal(res1.global.historial_reciente[0].por_que, "Error de cálculo aritmético básico");

    // Topic telemetry
    assert.ok(res1.topic);
    assert.equal(res1.topic.quizzes.length, 1);
    assert.equal(res1.topic.resumen.fallos, 1);
    assert.ok(res1.topic.resumen.puntos_debiles.includes("1. Por qué existe"));
    assert.ok(res1.topic.resumen.recomendaciones_refuerzo.some((r) => r.includes("Error de cálculo")));

    // Second entry (correct)
    const entry2 = {
      punto: "2. Las piezas",
      tema: "prueba-tema",
      categoria: "matematicas",
      pregunta: "¿Cuánto es 2 * 3?",
      respuesta_alumno: "B",
      respuesta_correcta: "B",
      ok: true,
      por_que: "Cálculo correcto",
    };

    const res2 = recordQuizTelemetry(root, entry2);
    assert.equal(res2.global.estadisticas_globales.total_quizzes, 2);
    assert.equal(res2.global.estadisticas_globales.total_aciertos, 1);
    assert.equal(res2.global.estadisticas_globales.total_fallos, 1);
    assert.equal(res2.global.estadisticas_globales.por_categoria.matematicas.total, 2);
    assert.equal(res2.global.estadisticas_globales.por_categoria.matematicas.aciertos, 1);
    assert.equal(res2.global.historial_reciente.length, 2);

    assert.ok(res2.topic);
    assert.equal(res2.topic.resumen.aciertos, 1);
    assert.ok(res2.topic.resumen.puntos_fuertes.includes("2. Las piezas"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adaptive categorization dynamically learns trends across any domain (grammar, medicine, finance)", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-adaptive-test-"));
  try {
    // 1. Friction in grammar (Languages topic)
    const failGrammar = {
      punto: "Phrasal verbs transitivos",
      tema: "gramatica-speaking",
      categoria: "gramatica",
      pregunta: "¿Qué significa 'call off'?",
      respuesta_alumno: "Llamar a alguien",
      respuesta_correcta: "Cancelar",
      ok: false,
      por_que: "Confusión con el significado idiomático",
    };
    const res1 = recordQuizTelemetry(root, failGrammar);
    assert.equal(res1.global.estadisticas_globales.por_categoria.gramatica.fallos, 1);
    assert.ok(res1.global.perfil_alumno.tendencias.gramatica);
    assert.equal(res1.global.perfil_alumno.tendencias.gramatica.nivel_dificultad, "media");
    assert.equal(res1.global.perfil_alumno.tendencias.gramatica.accion_tutor, "reforzar_gramatica");
    assert.ok(res1.global.perfil_alumno.puntos_a_reforzar.some((p) => p.toLowerCase().includes("gramatica")));

    // Second failure in grammar escalates difficulty
    const failGrammar2 = {
      punto: "Phrasal verbs inseparables",
      tema: "gramatica-speaking",
      categoria: "gramatica",
      pregunta: "¿Cuál es inseparable?",
      respuesta_alumno: "Turn off",
      respuesta_correcta: "Look after",
      ok: false,
      por_que: "No distingue separables de inseparables",
    };
    const res2 = recordQuizTelemetry(root, failGrammar2);
    assert.equal(res2.global.perfil_alumno.tendencias.gramatica.nivel_dificultad, "alta");

    // 2. Mastery in medicine / physiology
    const okMed1 = {
      punto: "Ciclo cardíaco",
      tema: "fisiologia-cardiovascular",
      categoria: "fisiologia",
      pregunta: "¿Qué válvula se abre en la sístole ventricular izquierda?",
      respuesta_alumno: "Aórtica",
      respuesta_correcta: "Aórtica",
      ok: true,
      por_que: "Conocimiento exacto de hemodinámica",
    };
    recordQuizTelemetry(root, okMed1);

    const okMed2 = {
      punto: "Presión arterial media",
      tema: "fisiologia-cardiovascular",
      categoria: "fisiologia",
      pregunta: "¿Cuál es la fórmula aproximada de PAM?",
      respuesta_alumno: "PAD + (PAS - PAD)/3",
      respuesta_correcta: "PAD + (PAS - PAD)/3",
      ok: true,
      por_que: "Cálculo y concepto fisiológico correcto",
    };
    const resMed2 = recordQuizTelemetry(root, okMed2);
    assert.equal(resMed2.global.estadisticas_globales.por_categoria.fisiologia.aciertos, 2);
    assert.ok(resMed2.global.perfil_alumno.tendencias.fisiologia);
    assert.equal(resMed2.global.perfil_alumno.tendencias.fisiologia.nivel_dificultad, "baja");
    assert.equal(resMed2.global.perfil_alumno.tendencias.fisiologia.accion_tutor, "usar_como_ancla");
    assert.ok(resMed2.global.perfil_alumno.fortalezas.some((f) => f.toLowerCase().includes("fisiologia")));

    // Check topic telemetry recommendations include category prefix
    assert.ok(res1.topic?.resumen.recomendaciones_refuerzo.some((r) => r.includes("[gramatica]")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recordQuizTelemetry does not pollute Object.prototype when categoria is __proto__ or Object properties", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-proto-test-"));
  try {
    recordQuizTelemetry(root, { pregunta: "¿Seguridad?", categoria: "__proto__", ok: true });
    assert.equal(Object.prototype.hasOwnProperty("total"), false, "Object.prototype.total must not be polluted");
    assert.equal(Object.prototype.hasOwnProperty("aciertos"), false, "Object.prototype.aciertos must not be polluted");
    assert.equal(({}).total, undefined, "plain object must not have total property");
  } finally {
    delete Object.prototype.total;
    delete Object.prototype.aciertos;
    delete Object.prototype.fallos;
    rmSync(root, { recursive: true, force: true });
  }
});

test("topic telemetry is keyed by the folder name and never writes through a symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-escape-root-"));
  const outside = mkdtempSync(join(tmpdir(), "telemetry-escape-outside-"));
  try {
    symlinkSync(outside, join(root, "symlink-topic"));
    for (const name of ["../escape", "a/b", "..", ""]) {
      assert.throws(
        () => saveTopicTelemetry(root, name, { tema: name, quizzes: [], resumen: {} }),
        (err) => err instanceof HttpError && err.status === 400
      );
      assert.throws(() => readTopicTelemetry(root, name), (err) => err instanceof HttpError && err.status === 400);
    }
    saveTopicTelemetry(root, "symlink-topic", { tema: "symlink-topic", quizzes: [], resumen: {} });
    assert.equal(existsSync(join(outside, "telemetria.json")), false, "must not write outside root");
    assert.equal(JSON.parse(stored(root, "telemetria/symlink-topic")).tema, "symlink-topic");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("validateGlobalTelemetry rejects malformed telemetry with missing or non-object tendencias or por_categoria", () => {
  const invalid1 = {
    version: 1,
    ultima_actualizacion: new Date().toISOString(),
    perfil_alumno: {
      fortalezas: [],
      puntos_a_reforzar: [],
    },
    estadisticas_globales: {
      total_quizzes: 0,
      total_aciertos: 0,
      total_fallos: 0,
      por_categoria: {},
    },
    directrices_tutor: [],
    historial_reciente: [],
  };
  assert.throws(() => validateGlobalTelemetry(invalid1), (err) => err instanceof HttpError && err.status === 400);

  const invalid2 = {
    version: 1,
    ultima_actualizacion: new Date().toISOString(),
    perfil_alumno: {
      tendencias: {},
      fortalezas: [],
      puntos_a_reforzar: [],
    },
    estadisticas_globales: {
      total_quizzes: 0,
    },
    directrices_tutor: [],
    historial_reciente: [],
  };
  assert.throws(() => validateGlobalTelemetry(invalid2), (err) => err instanceof HttpError && err.status === 400);
});

test("recordQuizTelemetry normalizes category diacritics so accented and unaccented categories update the same profile", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-accent-test-"));
  try {
    recordQuizTelemetry(root, { pregunta: "¿Cuánto es 1 + 1?", categoria: "Matemáticas", ok: false });
    const global = readGlobalTelemetry(root);
    assert.equal(global.perfil_alumno.tendencias.hasOwnProperty("matemáticas"), false, "must not create duplicate accented key");
    assert.ok(global.estadisticas_globales.por_categoria.matematicas, "must record in unaccented slug category");
    assert.equal(global.estadisticas_globales.por_categoria.matematicas.fallos, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
