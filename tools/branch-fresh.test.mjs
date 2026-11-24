// A checkout that is behind the base describes a contract the base has already
// replaced: the author reads the old docs, uses the old component and pays for a
// redesign. These tests hold the tool to what it promises, through its command
// line, on real repositories built from git alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, 'branch-fresh.mjs');

const git = (cwd, ...args) => {
  const run = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, `git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
};

const kit = (...names) => names.map(name => `  define('${name}', function () {});\n`).join('');

const commit = (cwd, message, files) => {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), body);
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', message);
  return git(cwd, 'rev-parse', 'HEAD');
};

// A repository whose base branch is one commit ahead of the checkout under test,
// exactly the shape that cost a redesign: main gained a component and a tool.
const repoBehindTheBase = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'branch-fresh-'));
  git(cwd, 'init', '-q');
  commit(cwd, 'older contract', {
    'integrations/pi/kit/kit.js': kit('lk-callout', 'lk-walkthrough'),
    'tools/deck-lint.mjs': 'export const older = true;\n'
  });
  const older = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'branch', '-M', 'main');
  commit(cwd, 'newer contract', {
    'integrations/pi/kit/kit.js': kit('lk-callout', 'lk-walkthrough', 'lk-figure'),
    'tools/branch-fresh.mjs': 'export const newer = true;\n'
  });
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
  git(cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git(cwd, 'checkout', '-q', '--detach', older);
  return cwd;
};

const run = (cwd, ...args) => spawnSync(process.execPath, [TOOL, ...args], { cwd, encoding: 'utf8' });

test('a checkout behind the base fails and names what the base has and it lacks', () => {
  const cwd = repoBehindTheBase();
  const out = run(cwd);
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stdout, /behind 1/);
  assert.match(out.stdout, /lk-figure/);
  assert.match(out.stdout, /tools\/branch-fresh\.mjs/);
});

test('a checkout level with the base passes and names nothing missing', () => {
  const cwd = repoBehindTheBase();
  git(cwd, 'checkout', '-q', 'main');
  const out = run(cwd);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /fresh/);
  assert.doesNotMatch(out.stdout, /missing/);
});

test('--json states the same facts for scripts', () => {
  const cwd = repoBehindTheBase();
  const out = run(cwd, '--json');
  assert.equal(out.status, 1, out.stderr);
  const report = JSON.parse(out.stdout);
  assert.equal(report.fresh, false);
  assert.equal(report.behind, 1);
  assert.equal(report.ahead, 0);
  assert.deepEqual(report.missingComponents, ['lk-figure']);
  assert.deepEqual(report.missingTools, ['tools/branch-fresh.mjs']);
});

test('a checkout ahead of the base is not stale', () => {
  const cwd = repoBehindTheBase();
  commit(cwd, 'own work', { 'docs/own.md': 'mine\n' });
  const out = run(cwd);
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stdout, /behind 1, ahead 1/);
});

test('an unknown base ref exits 2 and says to fetch, never reporting fresh', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'branch-fresh-'));
  git(cwd, 'init', '-q');
  commit(cwd, 'only commit', { 'README.md': 'x\n' });
  const out = run(cwd);
  assert.equal(out.status, 2, out.stdout + out.stderr);
  assert.match(out.stderr, /fetch/);
});

test('outside a repository it exits 2 instead of guessing', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'branch-fresh-'));
  const out = run(cwd);
  assert.equal(out.status, 2, out.stdout + out.stderr);
  assert.match(out.stderr, /repository/i);
});
