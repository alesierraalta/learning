/**
 * Who tutors: the agent runtime that drives the study, and the model it uses.
 *
 * The choice is a file in the vault (`tutor.json`) so it survives restarts and
 * belongs to the learner, the same way `preferencias.json` does. Nothing here
 * decides authority: the study engine still owns PASS, whatever agent runs.
 */
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained } from "../integrations/pi/paths.ts";

/** The runtimes the studio can drive. `agy` is Antigravity's CLI. */
export const AGENTES = [
  { id: "pi", nombre: "Pi" },
  { id: "agy", nombre: "Antigravity" },
] as const;

export type Agente = (typeof AGENTES)[number]["id"];

/** Pi's thinking levels. `""` leaves the runtime's own default untouched. */
export const PENSAMIENTOS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export interface TutorConfig {
  version: 1;
  agente: Agente;
  /** A `provider/id` model, or `""` for the runtime's own default. */
  modelo: string;
  /** A level from PENSAMIENTOS, or `""` for the runtime's own default. */
  pensamiento: string;
}

const defaults: TutorConfig = { version: 1, agente: "pi", modelo: "", pensamiento: "" };

/** The form Pi takes on the command line and in `set_model`: `provider/id`. */
const MODELO = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,119}$/;

function validate(value: unknown): TutorConfig {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k));
  if (!record(value) || !keys(value, ["version", "agente", "modelo", "pensamiento"]) || value.version !== 1) throw new HttpError(400, "invalid tutor settings");
  if (!AGENTES.some((agent) => agent.id === value.agente)) throw new HttpError(400, "unknown tutor agent");
  if (typeof value.modelo !== "string" || (value.modelo !== "" && !MODELO.test(value.modelo))) throw new HttpError(400, "invalid tutor model");
  if (typeof value.pensamiento !== "string" || (value.pensamiento !== "" && !(PENSAMIENTOS as readonly string[]).includes(value.pensamiento))) {
    throw new HttpError(400, "invalid thinking level");
  }
  return { version: 1, agente: value.agente as Agente, modelo: value.modelo, pensamiento: value.pensamiento };
}

function filePath(root: string) {
  const file = join(root, "tutor.json");
  try {
    lstatSync(file);
    if (!resolveContained(root, file).ok) throw new HttpError(400, "invalid tutor path");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return file;
}

/**
 * A settings file that is missing or damaged must not stop the studio from
 * opening: the defaults start the tutor, and the next save rewrites the file.
 */
export function readTutor(root: string): TutorConfig {
  const file = filePath(root);
  let text: string;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaults);
    throw error;
  }
  try { return validate(JSON.parse(text)); }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`estudio: tutor.json ilegible, arranco con los valores por defecto · ${reason}\n`);
    return structuredClone(defaults);
  }
}

export function saveTutor(root: string, input: unknown): TutorConfig {
  const data = validate(input);
  const file = filePath(root);
  const temp = join(root, `.tutor-${randomBytes(12).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* no temporary file */ }
    throw error;
  }
  return data;
}

/** `provider/id` split where Pi splits it: the first slash separates the two. */
export function modelParts(modelo: string): { provider: string; modelId: string } | null {
  const slash = modelo.indexOf("/");
  if (slash <= 0 || slash === modelo.length - 1) return null;
  return { provider: modelo.slice(0, slash), modelId: modelo.slice(slash + 1) };
}

/**
 * Its own session id: terminal sessions in the same folder are never written by
 * two processes. The model and the level are flags, so a restart keeps them.
 */
export function piArgs(config: TutorConfig): string[] {
  return [
    "--mode", "rpc",
    "--session-id", "estudio",
    ...(config.modelo ? ["--model", config.modelo] : []),
    ...(config.pensamiento ? ["--thinking", config.pensamiento] : []),
  ];
}
