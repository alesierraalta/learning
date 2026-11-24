import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained } from "../integrations/pi/paths.ts";
import { proveedorPorId } from "./proveedores.ts";

/** Every runtime the studio can tutor with. */
export const TUTOR_AGENTS = ["pi", "agy", "api"] as const;
export type TutorAgent = (typeof TUTOR_AGENTS)[number];
/**
 * The runtimes that read the vault's skills. The API runtime talks to a provider and reads none of
 * them, so it declares no skill directory; the check that guards the others must not invent one.
 */
export const TUTOR_SKILL_AGENTS = ["pi", "agy"] as const;
/**
 * `proveedor` names the API provider the learner chose, and is empty for the CLI runtimes: an
 * empty provider means "detect it from the environment", never "pick one for me".
 */
export type TutorConfig = { version: 2; agente: TutorAgent; modelo: string; pensamiento: string; proveedor: string };
const DEFAULT: TutorConfig = { version: 2, agente: "pi", modelo: "", pensamiento: "", proveedor: "" };
const LEVELS = ["", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** The levels Mistral documents, union across its models; a model's own subset is checked when saving. */
export const API_LEVELS = ["", "none", "low", "medium", "high", "max"];
/** What Antigravity's `--effort` accepts; a level outside this list would be dropped, so it is refused. */
export const AGY_LEVELS = ["low", "medium", "high", "xhigh", "max"];

const isAgent = (value: unknown): value is TutorAgent => typeof value === "string" && (TUTOR_AGENTS as readonly string[]).includes(value);

function supported(agente: TutorAgent, pensamiento: string): boolean {
  if (agente === "agy") return pensamiento === "" ? LEVELS.includes(pensamiento) : AGY_LEVELS.includes(pensamiento);
  if (agente === "api") return API_LEVELS.includes(pensamiento);
  return LEVELS.includes(pensamiento);
}

/**
 * A v1 file (the shape written before providers existed) is valid input and comes back as v2 with
 * an empty provider, so an upgrade never costs the learner the tutor they had. Anything the studio
 * cannot honour is refused instead of quietly replaced.
 */
function validate(input: unknown): TutorConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "invalid tutor settings");
  const data = input as Record<string, unknown>;
  const keys = Object.keys(data).sort().join(",");
  const v1 = keys === "agente,modelo,pensamiento,version" && data.version === 1;
  const v2 = keys === "agente,modelo,pensamiento,proveedor,version" && data.version === 2;
  if ((!v1 && !v2) ||
      !isAgent(data.agente) || typeof data.modelo !== "string" ||
      (data.modelo !== "" && !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,119}$/.test(data.modelo)) ||
      typeof data.pensamiento !== "string" ||
      (!v1 && typeof data.proveedor !== "string")) {
    throw new HttpError(400, "invalid tutor settings");
  }
  const proveedor = v1 ? "" : (data.proveedor as string);
  if (proveedor !== "" && proveedorPorId(proveedor) === null) throw new HttpError(400, "unknown provider");
  if (!supported(data.agente, data.pensamiento)) {
    const quien = { agy: "Antigravity", api: "Mistral", pi: "Pi" }[data.agente];
    const niveles = data.agente === "agy" ? AGY_LEVELS : data.agente === "api" ? API_LEVELS.filter(Boolean) : LEVELS.filter(Boolean);
    throw new HttpError(400, `${quien} does not accept the thinking level "${data.pensamiento}"; choose ${niveles.join(", ")} or leave it empty`);
  }
  return { version: 2, agente: data.agente, modelo: data.modelo, pensamiento: data.pensamiento, proveedor };
}

function filePath(root: string): string {
  const file = join(root, "tutor.json");
  try {
    lstatSync(file);
    if (!resolveContained(root, file).ok) throw new HttpError(400, "invalid tutor path");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return file;
}

export function readTutor(root: string): TutorConfig {
  const file = filePath(root);
  let text: string;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT };
    throw error;
  }
  try { return validate(JSON.parse(text)); }
  catch (error) {
    // A saved level the provider cannot apply is reported, never silently replaced.
    if (error instanceof HttpError && error.status === 400 && error.message.startsWith("Antigravity does not accept")) {
      throw new HttpError(500, `tutor.json: ${error.message}`);
    }
    throw new HttpError(500, "invalid saved tutor settings");
  }
}

export function saveTutor(root: string, input: unknown): TutorConfig {
  const config = validate(input);
  const file = filePath(root);
  const temporary = join(root, `.tutor-${randomBytes(12).toString("hex")}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* nothing to remove */ }
    throw error;
  }
  return config;
}
