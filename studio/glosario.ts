/**
 * The quick preliminary glossary of the waiting section (#376/S6): one short
 * one-shot model call, outside the tutor's runtime and tool loop, never awaited
 * by a generation. It asks for five to eight terms (and, when the topic has no
 * diagnosis, two or three ungraded questions), caches the answer per topic and
 * part beside the studio state, and degrades to `no-disponible` on any failure.
 *
 * It does not take the topic's writer lock and never writes inside the vault.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseAgyModels } from "./agy.ts";
import { parsePiModels } from "./pi-models.ts";
import type { TutorConfig } from "./tutor.ts";

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const LETTERS = ["A", "B", "C", "D", "E"] as const;
const MIN_TERMS = 5;
const MAX_TERMS = 8;
const MAX_QUESTIONS = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const CATALOG_TIMEOUT_MS = 10_000;

export interface Termino {
  termino: string;
  definicion: string;
  ejemplo: string;
}
export interface SuggestedQuestion {
  enunciado: string;
  opciones: Record<string, string>;
  respuesta?: string;
  explicacion?: string;
}
export interface GlosarioCache {
  version: 1;
  topic: string;
  part: string;
  actualizado: string;
  terminos: Termino[];
  preguntas: SuggestedQuestion[];
}
export interface GlosarioVista {
  estado: "listo" | "generando" | "no-disponible";
  terminos: Termino[];
  preliminar: true;
}

/** Pi has an explicit no-tools switch; Antigravity's print mode is one shot and its prompt forbids tools. */
export function glosarioArgs(spec: { agente: "pi" | "agy"; prompt: string; model: string }): string[] {
  if (spec.agente === "pi") {
    return [
      "-p", "--mode", "json", ...(spec.model ? ["--model", spec.model] : []),
      "--no-tools", "--no-extensions", "--no-skills", "--no-mcp", "--no-context-files", "--no-session",
      "--", spec.prompt,
    ];
  }
  return [
    "-p", spec.prompt, "--output-format", "json", ...(spec.model ? ["--model", spec.model] : []),
    "--mode", "plan", "--print-timeout", "60s",
  ];
}

const catalogArgs = (agente: "pi" | "agy"): string[] => agente === "pi" ? ["--list-models"] : ["models"];

/** A model id chosen from what this runtime actually offers, with a known fast fallback. */
export function fastModel(agente: "pi" | "agy", output: string, fallback: string): string {
  const models = agente === "pi" ? parsePiModels(output) : parseAgyModels(output);
  const quick = models.find((model) => /flash-low|flash-mini|flash-lite|nano|haiku|fast|mini/i.test(model));
  if (quick) return quick;
  const flash = models.find((model) => /flash/i.test(model));
  if (flash) return flash;
  if (agente === "agy") return "gemini-3.8-flash-low";
  return fallback || models[0] || "";
}

/** The prompt asks for a small, bounded JSON document and nothing else. */
export function glosarioPrompt(info: { topicTitle: string; partTitle: string; subtemas: string[] }): string {
  const data = JSON.stringify({ tema: info.topicTitle, parte: info.partTitle, subtemas: info.subtemas });
  return (
    "Da una respuesta rápida sobre este tema de study. No uses herramientas, no escribas archivos y " +
    "responde SOLO un objeto JSON válido, sin texto ni cercas de código. " +
    `Tema y parte: ${data}. ` +
    'Formato: {"terminos":[{"termino":"…","definicion":"…","ejemplo":"…"}],' +
    '"preguntas":[{"enunciado":"…","opciones":{"A":"…","B":"…"},"respuesta":"A","explicacion":"…"}]}. ' +
    "Incluye entre 5 y 8 términos breves en español neutro, cada uno con su definición de una frase y un ejemplo concreto. " +
    "Incluye entre 2 y 3 preguntas de repaso sin responder aún, con dos a cuatro opciones y la letra correcta."
  );
}

/** Accept only a bounded, well-formed answer; a malformed one is the same as no call. */
export function parseGlosario(text: string): { terminos: Termino[]; preguntas: SuggestedQuestion[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("glosario sin JSON");
  let data: unknown;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("glosario con JSON inválido"); }
  if (!object(data) || !Array.isArray(data.terminos)) throw new Error("glosario sin términos");
  const terminos = data.terminos.filter((raw): raw is Termino => object(raw) &&
    ["termino", "definicion", "ejemplo"].every((key) => typeof raw[key] === "string" && (raw[key] as string).trim() !== ""),
  ).slice(0, MAX_TERMS);
  if (terminos.length < MIN_TERMS) throw new Error("glosario con menos de cinco términos");
  const preguntas: SuggestedQuestion[] = [];
  if (Array.isArray(data.preguntas)) {
    for (const raw of data.preguntas) {
      if (!object(raw) || typeof raw.enunciado !== "string" || !object(raw.opciones)) continue;
      const entries = Object.entries(raw.opciones).filter(([, value]) => typeof value === "string" && value.trim() !== "");
      if (entries.length < 2 || entries.length > LETTERS.length) continue;
      const opciones = Object.fromEntries(entries.map(([, value], index) => [LETTERS[index], value as string]));
      const letter = typeof raw.respuesta === "string" ? Object.keys(opciones)[Object.keys(raw.opciones).indexOf(raw.respuesta)] : "";
      if (!letter || !Object.hasOwn(opciones, letter)) continue;
      preguntas.push({
        enunciado: raw.enunciado.trim(),
        opciones,
        respuesta: letter,
        ...(typeof raw.explicacion === "string" && raw.explicacion.trim() ? { explicacion: raw.explicacion.trim() } : {}),
      });
      if (preguntas.length >= MAX_QUESTIONS) break;
    }
  }
  return { terminos, preguntas };
}

function readCache(file: string): GlosarioCache | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!object(parsed) || parsed.version !== 1 || !Array.isArray(parsed.terminos) || !Array.isArray(parsed.preguntas)) return undefined;
    const { terminos, preguntas } = parseGlosario(JSON.stringify({ terminos: parsed.terminos, preguntas: parsed.preguntas }));
    return { ...parsed, terminos, preguntas } as GlosarioCache;
  } catch {
    return undefined;
  }
}

function run(command: string[], args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const [program, ...base] = command;
    execFile(program, [...base, ...args], { cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? ""));
    });
  });
}

export interface GlosarioOptions {
  /** The vault is only the command's cwd: no file of the tutor turn is touched. */
  root: string;
  /** Directory of `opened.json`, i.e. XDG state; the cache never goes into the vault. */
  stateDir: string;
  config: TutorConfig;
  /** Injectable command, e.g. `[process.execPath, fakeScript]`, with the runtime's args appended. */
  command?: string[];
  timeoutMs?: number;
  catalogTimeoutMs?: number;
}

/** A cache owner for a studio: starts calls without ever blocking the caller. */
export function createGlosario(options: GlosarioOptions) {
  const command = options.command ?? [options.config.agente];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const catalogTimeoutMs = options.catalogTimeoutMs ?? CATALOG_TIMEOUT_MS;
  const directory = join(options.stateDir, "espera-glosario");
  const inflight = new Map<string, Promise<void>>();
  let model: Promise<string> | undefined;
  const key = (topic: string, part: string) => `${topic}__${part}`;
  const fileFor = (topic: string, part: string) => join(directory, `${key(topic, part)}.json`);

  const generate = async (topic: string, part: string, info: { topicTitle: string; partTitle: string; subtemas: string[] }) => {
    model ??= run(command, catalogArgs(options.config.agente), options.root, catalogTimeoutMs)
      .then((output) => fastModel(options.config.agente, output, options.config.modelo))
      .catch(() => options.config.agente === "agy" ? "gemini-3.8-flash-low" : options.config.modelo);
    const chosen = await model;
    const stdout = await run(command, glosarioArgs({ agente: options.config.agente, prompt: glosarioPrompt(info), model: chosen }), options.root, timeoutMs);
    const parsed = parseGlosario(stdout);
    const cache: GlosarioCache = { version: 1, topic, part, actualizado: new Date().toISOString(), ...parsed };
    const file = fileFor(topic, part);
    mkdirSync(directory, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(cache, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      renameSync(temporary, file);
    } catch {
      // A cache that cannot be written is not a reason to fail the waiting section.
      // A leftover temporary is inert; the next call overwrites it on its own.
      try { writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 }); } catch { /* nothing to cache */ }
    }
  };

  return {
    /** The cache file this owner uses; also handy for a reader that wants to clear it. */
    fileFor,
    /** The last generated state: ready from the cache, in flight, or unavailable. */
    view(topic: string, part: string): GlosarioVista {
      const cached = readCache(fileFor(topic, part));
      if (cached) return { estado: "listo", terminos: cached.terminos, preliminar: true };
      if (inflight.has(key(topic, part))) return { estado: "generando", terminos: [], preliminar: true };
      return { estado: "no-disponible", terminos: [], preliminar: true };
    },
    /** Questions from the same short call, used only when the topic has no diagnosis. */
    questions(topic: string, part: string): SuggestedQuestion[] {
      return readCache(fileFor(topic, part))?.preguntas ?? [];
    },
    /** Fire and forget: the write-part turn must never wait for this call. */
    start(topic: string, part: string, info: { topicTitle: string; partTitle: string; subtemas: string[] }): void {
      const id = key(topic, part);
      if (inflight.has(id) || readCache(fileFor(topic, part))) return;
      const pending = generate(topic, part, info)
        .catch((error: unknown) => {
          process.stderr.write(`estudio: glosario no disponible · ${(error as Error).message}\n`);
        })
        .finally(() => { inflight.delete(id); });
      inflight.set(id, pending);
    },
    /** Settles after an started call: tests and shutdown observe it without awaiting it in a turn. */
    whenSettled(topic: string, part: string): Promise<void> {
      return inflight.get(key(topic, part)) ?? Promise.resolve();
    },
    stop(): void { inflight.clear(); },
  };
}
