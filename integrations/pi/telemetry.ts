import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveContained } from "./paths.ts";
import { HttpError } from "./bridge.ts";

export interface QuizTelemetryEntry {
  id: string;
  punto: string;
  tema?: string;
  parte?: string;
  categoria: string;
  pregunta: string;
  respuesta_alumno: string;
  respuesta_correcta: string;
  ok: boolean;
  confianza?: string;
  razonamiento?: string;
  por_que: string;
  timestamp: string;
}

export interface GlobalTelemetry {
  version: 1;
  ultima_actualizacion: string;
  perfil_alumno: {
    tendencias: Record<string, {
      observacion: string;
      nivel_dificultad: "baja" | "media" | "alta";
      accion_tutor: string;
    }>;
    fortalezas: string[];
    puntos_a_reforzar: string[];
  };
  estadisticas_globales: {
    total_quizzes: number;
    total_aciertos: number;
    total_fallos: number;
    por_categoria: Record<string, { total: number; aciertos: number; fallos: number }>;
  };
  directrices_tutor: string[];
  historial_reciente: QuizTelemetryEntry[];
}

export interface TopicTelemetry {
  tema: string;
  ultima_actualizacion: string;
  quizzes: QuizTelemetryEntry[];
  resumen: {
    total: number;
    aciertos: number;
    fallos: number;
    por_categoria: Record<string, { total: number; aciertos: number; fallos: number }>;
    puntos_fuertes: string[];
    puntos_debiles: string[];
    recomendaciones_refuerzo: string[];
  };
}

export const defaultGlobalTelemetry: GlobalTelemetry = {
  version: 1,
  ultima_actualizacion: new Date().toISOString(),
  perfil_alumno: {
    tendencias: {
      matematicas: {
        observacion: "Tiende a no entender partes matemáticas abstractas o fórmulas directas; requiere reforzamiento con números concretos, cuentas paso a paso e intuición física antes del formalismo.",
        nivel_dificultad: "alta",
        accion_tutor: "reforzar_paso_a_paso",
      },
      diagramas_y_flujos: {
        observacion: "Excelente asimilación de diagramas de estados, flujos de datos y modelos visuales.",
        nivel_dificultad: "baja",
        accion_tutor: "usar_como_ancla",
      },
      analogias_practicas: {
        observacion: "Aprende con rapidez mediante analogías concretas del mundo real acompañadas de su límite técnico explícito.",
        nivel_dificultad: "baja",
        accion_tutor: "analogia_con_limite",
      },
      terminos_abstractos: {
        observacion: "Fricción con términos técnicos huérfanos sin definición terrenal previa.",
        nivel_dificultad: "media",
        accion_tutor: "definicion_cotidiana_primero",
      },
    },
    fortalezas: [
      "Arquitectura relacional y diseño de esquemas",
      "Diagramas de flujo y modelos de estados",
      "Modelos mentales intuitivos y analogías cotidianas",
    ],
    puntos_a_reforzar: [
      "Partes matemáticas y deducción de fórmulas",
      "Cálculos aritméticos sin desglose explícito",
      "Casos borde algorítmicos",
    ],
  },
  estadisticas_globales: {
    total_quizzes: 0,
    total_aciertos: 0,
    total_fallos: 0,
    por_categoria: {},
  },
  directrices_tutor: [
    "En cada punto explicable, incluir un quiz rápido de 1 pregunta para verificar comprensión inmediata.",
    "Si el punto involucra matemáticas, fórmulas o cálculos: desglosar renglón a renglón con un ejemplo numérico concreto antes de formalizar.",
    "Registrar siempre si la respuesta fue correcta o no y el POR QUÉ (diagnóstico del error o consolidación).",
    "Consultar la telemetría antes de iniciar una explicación para anticipar y reforzar las áreas de debilidad identificadas.",
    "Si el alumno falla un quiz rápido, explicar la causa del fallo de forma empática y ofrecer un mini refuerzo antes de continuar.",
  ],
  historial_reciente: [],
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validateGlobalTelemetry(value: unknown): GlobalTelemetry {
  if (!record(value) || value.version !== 1) throw new HttpError(400, "invalid telemetry: version must be 1");
  if (!record(value.perfil_alumno) || !Array.isArray(value.perfil_alumno.fortalezas) || !Array.isArray(value.perfil_alumno.puntos_a_reforzar)) {
    throw new HttpError(400, "invalid telemetry: malformed perfil_alumno");
  }
  if (!record(value.estadisticas_globales) || typeof value.estadisticas_globales.total_quizzes !== "number") {
    throw new HttpError(400, "invalid telemetry: malformed estadisticas_globales");
  }
  if (!Array.isArray(value.directrices_tutor) || !Array.isArray(value.historial_reciente)) {
    throw new HttpError(400, "invalid telemetry: malformed directrices or history");
  }
  return value as GlobalTelemetry;
}

function globalTelemetryPath(root: string): string {
  const file = join(root, "telemetria.json");
  try {
    lstatSync(file);
    if (!resolveContained(root, file).ok) throw new HttpError(400, "invalid telemetry path");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return file;
}

function topicTelemetryPath(root: string, topic: string): string {
  const topicDir = join(root, topic);
  const check = resolveContained(root, topicDir);
  if (!check.ok) {
    const file = join(root, topic, "telemetria.json");
    if (!topic || topic === "." || topic === ".." || /[\\/\0]/.test(topic)) {
      throw new HttpError(400, `invalid topic name: ${topic}`);
    }
    return file;
  }
  return join(check.targetReal, "telemetria.json");
}

export function readGlobalTelemetry(root: string): GlobalTelemetry {
  const file = globalTelemetryPath(root);
  try {
    return validateGlobalTelemetry(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(defaultGlobalTelemetry);
    }
    throw error;
  }
}

export function saveGlobalTelemetry(root: string, input: unknown): GlobalTelemetry {
  const data = validateGlobalTelemetry(input);
  data.ultima_actualizacion = new Date().toISOString();
  const file = globalTelemetryPath(root);
  const temp = join(root, `.telemetria-${randomBytes(12).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
  return data;
}

export function readTopicTelemetry(root: string, topic: string): TopicTelemetry {
  const file = topicTelemetryPath(root, topic);
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (record(raw) && typeof raw.tema === "string" && Array.isArray(raw.quizzes)) {
      return raw as TopicTelemetry;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    tema: topic,
    ultima_actualizacion: new Date().toISOString(),
    quizzes: [],
    resumen: {
      total: 0,
      aciertos: 0,
      fallos: 0,
      por_categoria: {},
      puntos_fuertes: [],
      puntos_debiles: [],
      recomendaciones_refuerzo: [],
    },
  };
}

export function saveTopicTelemetry(root: string, topic: string, data: TopicTelemetry): TopicTelemetry {
  data.ultima_actualizacion = new Date().toISOString();
  const file = topicTelemetryPath(root, topic);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.telemetria-${randomBytes(12).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
  return data;
}

export function recordQuizTelemetry(root: string, rawEntry: unknown): { global: GlobalTelemetry; topic?: TopicTelemetry } {
  if (!record(rawEntry)) throw new HttpError(400, "entry must be an object");
  const punto = typeof rawEntry.punto === "string" ? rawEntry.punto.trim() : "";
  const pregunta = typeof rawEntry.pregunta === "string" ? rawEntry.pregunta.trim() : "";
  const respuesta_alumno = typeof rawEntry.respuesta_alumno === "string" ? rawEntry.respuesta_alumno.trim() : "";
  const respuesta_correcta = typeof rawEntry.respuesta_correcta === "string" ? rawEntry.respuesta_correcta.trim() : "";
  const ok = Boolean(rawEntry.ok);
  const por_que = typeof rawEntry.por_que === "string" ? rawEntry.por_que.trim() : (ok ? "Respuesta correcta" : "Error en el concepto evaluado");
  const categoria = typeof rawEntry.categoria === "string" && rawEntry.categoria.trim() ? rawEntry.categoria.trim() : "conceptual";
  const id = typeof rawEntry.id === "string" && rawEntry.id ? rawEntry.id : `qq-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const timestamp = typeof rawEntry.timestamp === "string" ? rawEntry.timestamp : new Date().toISOString();
  const tema = typeof rawEntry.tema === "string" ? rawEntry.tema.trim() : undefined;
  const parte = typeof rawEntry.parte === "string" ? rawEntry.parte.trim() : undefined;
  const confianza = typeof rawEntry.confianza === "string" ? rawEntry.confianza.trim() : undefined;
  const razonamiento = typeof rawEntry.razonamiento === "string" ? rawEntry.razonamiento.trim() : undefined;

  if (!pregunta) throw new HttpError(400, "pregunta is required in telemetry entry");

  const entry: QuizTelemetryEntry = {
    id,
    punto: punto || "Punto explicable",
    tema,
    parte,
    categoria,
    pregunta,
    respuesta_alumno,
    respuesta_correcta,
    ok,
    confianza,
    razonamiento,
    por_que,
    timestamp,
  };

  // 1. Update Global Telemetry
  const global = readGlobalTelemetry(root);
  global.estadisticas_globales.total_quizzes += 1;
  if (ok) {
    global.estadisticas_globales.total_aciertos += 1;
  } else {
    global.estadisticas_globales.total_fallos += 1;
  }

  const catStats = global.estadisticas_globales.por_categoria[categoria] ?? { total: 0, aciertos: 0, fallos: 0 };
  catStats.total += 1;
  if (ok) catStats.aciertos += 1;
  else catStats.fallos += 1;
  global.estadisticas_globales.por_categoria[categoria] = catStats;

  // Track recent history (up to 50 items)
  global.historial_reciente.unshift(entry);
  if (global.historial_reciente.length > 50) global.historial_reciente.pop();

  // Dynamic adaptation based on pattern:
  if (categoria === "matematicas") {
    if (!ok && !global.perfil_alumno.puntos_a_reforzar.includes("Partes matemáticas y deducción de fórmulas")) {
      global.perfil_alumno.puntos_a_reforzar.push("Partes matemáticas y deducción de fórmulas");
    }
  }

  saveGlobalTelemetry(root, global);

  // 2. Update Topic Telemetry if topic is provided
  let topicTelemetry: TopicTelemetry | undefined;
  if (tema) {
    try {
      topicTelemetry = readTopicTelemetry(root, tema);
      topicTelemetry.quizzes.push(entry);
      topicTelemetry.resumen.total += 1;
      if (ok) {
        topicTelemetry.resumen.aciertos += 1;
        if (!topicTelemetry.resumen.puntos_fuertes.includes(entry.punto)) {
          topicTelemetry.resumen.puntos_fuertes.push(entry.punto);
        }
      } else {
        topicTelemetry.resumen.fallos += 1;
        if (!topicTelemetry.resumen.puntos_debiles.includes(entry.punto)) {
          topicTelemetry.resumen.puntos_debiles.push(entry.punto);
        }
        const rec = `Reforzar ${entry.punto}: ${entry.por_que}`;
        if (!topicTelemetry.resumen.recomendaciones_refuerzo.includes(rec)) {
          topicTelemetry.resumen.recomendaciones_refuerzo.push(rec);
        }
      }
      const tCat = topicTelemetry.resumen.por_categoria[categoria] ?? { total: 0, aciertos: 0, fallos: 0 };
      tCat.total += 1;
      if (ok) tCat.aciertos += 1;
      else tCat.fallos += 1;
      topicTelemetry.resumen.por_categoria[categoria] = tCat;

      saveTopicTelemetry(root, tema, topicTelemetry);
    } catch {
      /* topic telemetry is best effort if directory exists */
    }
  }

  return { global, topic: topicTelemetry };
}
