/**
 * The tutor's instructions live outside this repository: every supported agent
 * reads the skill from a directory declared once in
 * `deploy/vps/tutor-skill-dirs.tsv`, and the Learnings folder carries the
 * `AGENTS.md` that frames a study session. `deploy/vps/link-tutor-context.sh`
 * links both to the repo; when a link resolves anywhere else the live tutor would
 * explain with another standard, so the studio refuses the turn instead of
 * answering it with instructions nobody reviewed.
 *
 * The check is a `realpath` of every declared path: cheap enough to run before
 * every turn, and exact enough that a link to a stale copy is never mistaken for
 * the repo's own.
 */
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The skill every supported agent loads; the deploy links it under this name. */
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

/** One agent's declared skill directory; the placeholders are expanded per turn. */
export type DeclaredSkillDir = { agent: string; template: string };

const DIRS_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "deploy", "vps", "tutor-skill-dirs.tsv");

/** The single table the linker and the studio both read, so no agent is left out. */
export function declaredSkillDirs(): DeclaredSkillDir[] {
  const text = readFileSync(DIRS_FILE, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#")).map((line) => {
    const cells = line.split("\t");
    if (cells.length !== 2 || !cells[0] || !cells[1]) throw new Error(`línea inválida en ${DIRS_FILE}: ${line}`);
    return { agent: cells[0], template: cells[1] };
  });
}

const expand = (template: string, input: ContextInput): string => {
  if (template.startsWith("$HOME/")) return join(input.home ?? homedir(), template.slice("$HOME/".length));
  if (template.startsWith("$LEARNING_ROOT/")) return join(input.root, template.slice("$LEARNING_ROOT/".length));
  throw new Error(`directorio de skills no declarado: ${template} (${DIRS_FILE})`);
};

/** The paths the tutor reads, each with the repo copy it must resolve to. */
export function tutorContextLinks(input: ContextInput): Array<{ path: string; expected: string }> {
  const skill = join(input.repo, "skills", TUTOR_SKILL);
  const declared = declaredSkillDirs().map((dir) => ({
    path: join(expand(dir.template, input), TUTOR_SKILL),
    expected: skill,
  }));
  return [...declared, { path: join(input.root, "AGENTS.md"), expected: join(input.repo, "deploy", "vps", "learnings", "AGENTS.md") }];
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
