// The tutor's instructions live outside the repo: the skill each runtime reads
// and the Learnings `AGENTS.md` that frames a study session. The deploy links
// both, and the studio refuses a turn when a link points elsewhere. These tests
// drive the link script in a temporary home and the check the studio runs before
// a turn; the file lives under `studio/` because that is the glob CI runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkTutorContext, driftMessage } from "./context.ts";

const SCRIPT = join(import.meta.dirname, "..", "deploy", "vps", "link-tutor-context.sh");
const SKILL = "explicacion-interactiva";

/** A repo-shaped tree: two skills, one directory that is not a skill, the Learnings AGENTS.md. */
function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "tutor-context-")));
  const home = join(base, "home");
  const repo = join(base, "learning");
  const learnings = join(base, "Learnings");
  const backups = join(base, "backups");
  mkdirSync(home, { recursive: true });
  for (const name of [SKILL, "otra-skill"]) {
    mkdirSync(join(repo, "skills", name), { recursive: true });
    writeFileSync(join(repo, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  }
  mkdirSync(join(repo, "skills", "sin-skill"), { recursive: true });
  writeFileSync(join(repo, "skills", "sin-skill", "notas.md"), "no es una skill\n");
  mkdirSync(join(repo, "deploy", "vps", "learnings"), { recursive: true });
  writeFileSync(join(repo, "deploy", "vps", "learnings", "AGENTS.md"), "# Learnings\n");
  mkdirSync(learnings, { recursive: true });
  return { base, home, repo, learnings, backups, env: { HOME: home, LEARNING_REPO: repo, LEARNING_ROOT: learnings, LEARNING_BACKUP_DIR: backups } };
}

const run = (env, args = []) => spawnSync("bash", [SCRIPT, ...args], { env: { ...process.env, ...env }, encoding: "utf8" });

/**
 * The studio's env file is shell-compatible, so the deploy must read it the way
 * the shell does: `sed` would keep the quotes and the inline comment and link a
 * directory whose name is literally `"/x"`. These cases drive `--env-file` with
 * no LEARNING_ROOT in the environment, which is the VPS situation.
 */
/**
 * A fixture with no LEARNING_ROOT in the environment and an env file to read.
 * An unquoted shell value cannot hold a space, so only the quoted case uses one.
 */
function envFileFixture(name = "Learnings") {
  const f = fixture();
  const { LEARNING_ROOT: _, ...env } = f.env;
  const file = join(f.base, "learning-studio.env");
  const root = join(f.base, name);
  mkdirSync(root, { recursive: true });
  return { ...f, env, file, root };
}

const linkedAgents = (root) => {
  const agents = join(root, "AGENTS.md");
  return existsSync(agents) && lstatSync(agents).isSymbolicLink();
};

// A raw value that `sed` kept verbatim would start with a quote or end with a
// comment, so the script would `mkdir` a relative path: run it from the fixture
// root so a wrong path lands there and the assertion can see it.
const runIn = (f, args) => spawnSync("bash", [SCRIPT, ...args], { cwd: f.base, env: { ...process.env, ...f.env }, encoding: "utf8" });

/** A directory whose name carries the raw value's quote or comment is the bug. */
const strayDirs = (f) => readdirSync(f.base).filter((name) => name.startsWith('"') || name.includes("#"));

test("--env-file reads a quoted LEARNING_ROOT without the quotes", () => {
  const f = envFileFixture("Learnings con espacios");
  writeFileSync(f.file, `LEARNING_ROOT="${f.root}"\nSTUDIO_PORT=4747\n`);
  const result = runIn(f, ["--env-file", f.file]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(linkedAgents(f.root), `AGENTS.md linked into ${f.root}`);
  assert.deepEqual(strayDirs(f), [], "no directory named after the raw value");
});

test("--env-file reads an unquoted LEARNING_ROOT", () => {
  const f = envFileFixture("Learnings-sin-espacios");
  writeFileSync(f.file, `LEARNING_ROOT=${f.root}\n`);
  const result = runIn(f, ["--env-file", f.file]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(linkedAgents(f.root));
});

test("--env-file drops an inline comment instead of making it part of the path", () => {
  const f = envFileFixture("Learnings-comentario");
  writeFileSync(f.file, `LEARNING_ROOT=${f.root}  # raíz de Learnings\n`);
  const result = runIn(f, ["--env-file", f.file]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(linkedAgents(f.root), `AGENTS.md linked into ${f.root}`);
  assert.deepEqual(strayDirs(f), [], "the comment is not part of the path");
});

test("a missing env file falls back to ~/Learnings", () => {
  const f = envFileFixture();
  const result = runIn(f, ["--env-file", join(f.base, "no-existe.env")]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(linkedAgents(join(f.home, "Learnings")), "AGENTS.md linked into the default root");
});

test("a relative LEARNING_ROOT is refused, never linked", () => {
  const f = envFileFixture();
  writeFileSync(f.file, "LEARNING_ROOT=Learnings\n");
  const result = runIn(f, ["--env-file", f.file]);
  assert.notEqual(result.status, 0, "a relative root must fail the deploy");
  assert.match(result.stderr, /LEARNING_ROOT must be an absolute path/);
  assert.match(result.stderr, /Learnings/);
  assert.equal(existsSync(join(f.base, "Learnings", "AGENTS.md")), false);
});

test("a relative LEARNING_ROOT in the environment is refused too", () => {
  const f = fixture();
  const result = run({ ...f.env, LEARNING_ROOT: "Learnings" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LEARNING_ROOT must be an absolute path/);
});

test("the deploy links every skill and the Learnings AGENTS.md into a fresh home", () => {
  const f = fixture();
  const result = run(f.env);
  assert.equal(result.status, 0, result.stderr);
  for (const runtime of [".claude", ".agents"]) {
    for (const name of [SKILL, "otra-skill"]) {
      const link = join(f.home, runtime, "skills", name);
      assert.ok(lstatSync(link).isSymbolicLink(), `${link} is a link`);
      assert.equal(realpathSync(link), realpathSync(join(f.repo, "skills", name)));
    }
    assert.equal(existsSync(join(f.home, runtime, "skills", "sin-skill")), false, "a directory without SKILL.md is not a skill");
  }
  const agents = join(f.learnings, "AGENTS.md");
  assert.ok(lstatSync(agents).isSymbolicLink());
  assert.equal(realpathSync(agents), realpathSync(join(f.repo, "deploy", "vps", "learnings", "AGENTS.md")));
  assert.equal(existsSync(f.backups), false, "a fresh home has nothing to keep");
});

test("a real directory where a link belongs moves to a timestamped backup, never deleted", () => {
  const f = fixture();
  const target = join(f.home, ".claude", "skills", SKILL);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "viejo.md"), "editado a mano\n");
  const result = run(f.env);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(lstatSync(target).isSymbolicLink(), "the link replaced the directory");
  assert.equal(realpathSync(target), realpathSync(join(f.repo, "skills", SKILL)));
  const kept = readdirSync(f.backups);
  assert.equal(kept.length, 1, `one backup, got ${kept.join(",")}`);
  assert.equal(readFileSync(join(f.backups, kept[0], ".claude", "skills", SKILL, "viejo.md"), "utf8"), "editado a mano\n");
});

test("a link that points elsewhere is replaced in place, not followed", () => {
  const f = fixture();
  const decoy = join(f.base, "skills-registry", SKILL);
  mkdirSync(decoy, { recursive: true });
  mkdirSync(join(f.home, ".agents", "skills"), { recursive: true });
  symlinkSync(decoy, join(f.home, ".agents", "skills", SKILL), "dir");
  const result = run(f.env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(realpathSync(join(f.home, ".agents", "skills", SKILL)), realpathSync(join(f.repo, "skills", SKILL)));
  assert.equal(existsSync(f.backups), false, "a link is replaced, not kept");
});

test("verification fails loudly when a link does not resolve to the repo", () => {
  const f = fixture();
  mkdirSync(join(f.home, ".claude", "skills"), { recursive: true });
  symlinkSync(join(f.base, "skills-registry", SKILL), join(f.home, ".claude", "skills", SKILL), "dir");
  const before = run(f.env, ["--verify"]);
  assert.notEqual(before.status, 0, "a stale link must fail the check");
  assert.match(before.stderr, /deploy\/vps\/update\.sh/);
  assert.match(before.stderr, new RegExp(SKILL));
  assert.equal(run(f.env).status, 0);
  const after = run(f.env, ["--verify"]);
  assert.equal(after.status, 0, after.stderr);
});

test("a repo without skills is refused instead of linked", () => {
  const f = fixture();
  const result = run({ ...f.env, LEARNING_REPO: join(f.base, "vacio") });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no skills found/);
});

test("the drift check names the path that does not resolve to the repo", () => {
  const f = fixture();
  const input = { repo: f.repo, root: f.learnings, home: f.home };
  const drift = checkTutorContext(input);
  assert.match(drift.path, /\.claude\/skills\/explicacion-interactiva$/);
  assert.match(driftMessage(drift), /^El tutor no empieza: /);
  assert.match(driftMessage(drift), /deploy\/vps\/update\.sh/);
  assert.equal(run(f.env).status, 0);
  assert.equal(checkTutorContext(input), null, "the deploy leaves the context the repo's own");
});
