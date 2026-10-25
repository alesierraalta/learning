/** Path containment shared by the engine adapter and the study-view bridge. */
import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

export function resolveContained(
  root: string,
  target: string,
): { ok: true; rootReal: string; targetReal: string } | { ok: false; reason: string } {
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return { ok: false, reason: `configured Learnings root unavailable: ${root}` };
  }
  let targetReal: string;
  try {
    targetReal = realpathSync(target);
  } catch {
    return { ok: false, reason: `workspace does not exist: ${target}` };
  }
  const rel = relative(rootReal, targetReal);
  const outside = rel === ".." || rel.startsWith(`..${sep}`);
  if (outside || isAbsolute(rel)) {
    return { ok: false, reason: `workspace escapes the Learnings root: ${targetReal} is not inside ${rootReal}` };
  }
  return { ok: true, rootReal, targetReal };
}

/** A topic is one folder directly under the Learnings root. */
export function safeTopic(topic: unknown): topic is string {
  return typeof topic === "string" && topic !== "" && topic !== "." && topic !== ".." && !/[\\/\0]/.test(topic);
}
