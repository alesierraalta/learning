import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readGlobalTelemetry,
  saveGlobalTelemetry,
  readTopicTelemetry,
  saveTopicTelemetry,
  recordQuizTelemetry,
  defaultGlobalTelemetry,
} from "./telemetry.ts";

test("readGlobalTelemetry returns default telemetry when file is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  try {
    const data = readGlobalTelemetry(root);
    assert.equal(data.version, 1);
    assert.equal(data.estadisticas_globales.total_quizzes, 0);
    assert.ok(data.perfil_alumno.tendencias.matematicas);
    assert.equal(existsSync(join(root, "telemetria.json")), false);
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
    assert.ok(existsSync(join(root, "telemetria.json")));
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
