/**
 * The tutor's instructions live outside this repository: each runtime reads the
 * skill from its own skills directory, and the Learnings folder carries the
 * `AGENTS.md` that frames a study session. `deploy/vps/link-tutor-context.sh`
 * links both to the repo; when a link resolves anywhere else the live tutor would
 * explain with another standard, so the studio refuses the turn instead of
 * answering it with instructions nobody reviewed.
 *
 * The check is a `realpath` of three paths: cheap enough to run before every
 * turn, and exact enough that a link to a stale copy is never mistaken for the
 * repo's own.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The skill both runtimes load; the deploy links it under this name. */
export const TUTOR_SKILL = "explicacion-interactiva";

/** A path the tutor reads that does not resolve to the repo's copy. */
export type ContextDrift = { path: string; expected: string; actual: string };

export type ContextInput = {
  /** This repository, derived from the studio's own module location. */
  repo: string;
  /** The Learnings root the studio serves. */
  root: string;
  /** The home whose links the tutor reads; defaults to the running user's. */
  home?: string;
};

/** The paths the tutor reads, each with the repo copy it must resolve to. */
export function tutorContextLinks(input: ContextInput): Array<{ path: string; expected: string }> {
  const home = input.home ?? homedir();
  const skill = join(input.repo, "skills", TUTOR_SKILL);
  return [
    { path: join(home, ".claude", "skills", TUTOR_SKILL), expected: skill },
    { path: join(home, ".agents", "skills", TUTOR_SKILL), expected: skill },
    { path: join(input.root, "AGENTS.md"), expected: join(input.repo, "deploy", "vps", "learnings", "AGENTS.md") },
  ];
}

const real = (path: string): string | null => {
  try { return realpathSync(path); } catch { return null; }
};

/** The first path that does not resolve to its repo copy, or null when the context is the repo's. */
export function checkTutorContext(input: ContextInput): ContextDrift | null {
  for (const link of tutorContextLinks(input)) {
    const expected = real(link.expected);
    if (expected === null) return { path: link.path, expected: link.expected, actual: "el repositorio no tiene esa copia" };
    const actual = real(link.path);
    if (actual !== expected) return { path: link.path, expected, actual: actual ?? "nada (no existe)" };
  }
  return null;
}

/** The one sentence the studio shows and logs when the context drifted. */
export function driftMessage(drift: ContextDrift): string {
  return `El tutor no empieza: ${drift.path} resuelve a ${drift.actual} y debe resolver a ${drift.expected}. Corrige el despliegue con deploy/vps/update.sh.`;
}
