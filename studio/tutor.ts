import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "../integrations/pi/bridge.ts";
import { resolveContained } from "../integrations/pi/paths.ts";

export type TutorConfig = { version: 1; agente: "pi" | "agy"; modelo: string; pensamiento: string };
const DEFAULT: TutorConfig = { version: 1, agente: "pi", modelo: "", pensamiento: "" };
const LEVELS = ["", "off", "minimal", "low", "medium", "high", "xhigh", "max"];

function validate(input: unknown): TutorConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "invalid tutor settings");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).sort().join(",") !== "agente,modelo,pensamiento,version" || data.version !== 1 ||
      (data.agente !== "pi" && data.agente !== "agy") || typeof data.modelo !== "string" ||
      (data.modelo !== "" && !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,119}$/.test(data.modelo)) ||
      typeof data.pensamiento !== "string" || !LEVELS.includes(data.pensamiento)) {
    throw new HttpError(400, "invalid tutor settings");
  }
  return { version: 1, agente: data.agente, modelo: data.modelo, pensamiento: data.pensamiento };
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
  catch { throw new HttpError(500, "invalid saved tutor settings"); }
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
