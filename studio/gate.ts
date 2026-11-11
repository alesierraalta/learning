/**
 * The topic the engine tracks, shared by every studio route that must refuse one it does not.
 *
 * The gate itself lives in runtime.ts and reads gate-rules.ts; the engine call it uses is the
 * studio's own `engineStatus`, the same report the library lists.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Enrolled is what the engine tracks: a topic folder alone is not a topic yet. */
export function enrolled(root: string, topic: string): boolean {
  return existsSync(join(root, topic, ".learning", "state.json"));
}
