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

// #429. Una puerta que miente es peor que ninguna, así que todo lo de abajo se
// midió primero a mano contra un repositorio real y solo después se fijó aquí.

// El contrato del encabezado: «Exit 0 fresh, 1 stale (behind the base, or missing
// surface the base has), 2 cannot tell». Un HEAD sin commit no está «behind» nada:
// no hay commit que comparar, así que la respuesta honesta es 2. Hoy la lectura de
// git que falla escapa como excepción y node sale con 1, que el llamador lee como
// «stale».
test('a checkout without a commit says it cannot tell instead of reporting stale', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'branch-fresh-'));
  git(cwd, 'init', '-q');
  commit(cwd, 'the contract', {
    'integrations/pi/kit/kit.js': kit('lk-callout'),
    'tools/deck-lint.mjs': 'export const only = true;\n'
  });
  git(cwd, 'branch', '-M', 'main');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
  git(cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  git(cwd, 'checkout', '-q', '--orphan', 'sin-commit');
  const out = run(cwd);
  assert.equal(out.status, 2, `an unborn HEAD is not «behind»: ${out.stdout}${out.stderr}`);
  assert.doesNotMatch(out.stderr, /^\s+at .*node:/m, 'it exited through an exception, not a diagnosis');
});

// El encabezado pregunta por «this checkout», que es el repositorio, no el
// directorio donde alguien tecleó el comando. Desde `tools/` el tool lee `tools/`
// como si fuera la raíz: no encuentra el kit, declara perdidos los 16 componentes
// que sí están y sale 1. Un hueco inventado es la única respuesta que esta
// herramienta no puede dar.
test('run from a subdirectory it measures the repository and invents no gap', () => {
  const cwd = repoBehindTheBase();
  git(cwd, 'checkout', '-q', 'main');
  const out = run(join(cwd, 'tools'));
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /fresh/);
  assert.doesNotMatch(out.stdout, /missing/);
});

// «--base needs a ref» y «unknown base ref … exit 2» valen para toda forma de
// nombrar la base. Escrito `--base=<ref>` el argumento se ignora en silencio y el
// tool contesta sobre la base configurada: se pregunta por una ref que no existe y
// se recibe un «fresh». Una base que no resuelve nunca puede acabar en exit 0.
test('--base=<ref> is a base too: an unknown one is never answered with fresh', () => {
  const cwd = repoBehindTheBase();
  const out = run(cwd, '--base=no-existe');
  assert.equal(out.status, 2, out.stdout + out.stderr);
  assert.match(out.stderr, /fetch/);
});

// «The components a kit source declares» es la promesa; el regex solo ve
// `define('lk-…')`. El mismo componente declarado con comillas dobles (y la forma
// `define(`lk-${kind}`)` que el kit usa hoy en la línea 3280) no existe para el
// tool: con el kit local sin `lk-figure` y la base publicándolo, contesta «fresh».
test('a base that declares a component with double quotes still names the gap', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'branch-fresh-'));
  git(cwd, 'init', '-q');
  commit(cwd, 'older contract', {
    'integrations/pi/kit/kit.js': kit('lk-callout'),
    'tools/deck-lint.mjs': 'export const older = true;\n'
  });
  git(cwd, 'branch', '-M', 'main');
  commit(cwd, 'newer contract', {
    'integrations/pi/kit/kit.js': "  define('lk-callout', function () {});\n  define(\"lk-figure\", function () {});\n"
  });
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
  git(cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  // el autor se quedó con el kit de antes: no tiene el componente que la base sí
  writeFileSync(join(cwd, 'integrations/pi/kit/kit.js'), kit('lk-callout'));
  const out = run(cwd);
  assert.equal(out.status, 1, out.stdout + out.stderr);
  assert.match(out.stdout, /lk-figure/);
});

// Las cinco piezas el kit no las declara una a una: las declara en un bucle,
// `define(`lk-${kind}`)` (`integrations/pi/kit/kit.js:3280`), y ahí vive `lk-venn`.
// Una base que añade una pieza a esa lista publica un componente que el tool no ve:
// el mismo hueco que `define('lk-figure')` sí nombra pasa como «fresh». El contrato
// pregunta por «the components a kit source declares», no por los que caben en un
// regex, y arreglar las comillas no arregla la plantilla.
test('a component the kit declares in its piece loop is named as a gap too', () => {
  const bucle = (piezas) => "define('lk-explorer', function () { explorerPiece(this); });\n"
    + `for (const [kind, label] of [${piezas.map(([k, l]) => `['${k}','${l}']`).join(',')}]) {\n`
    + '  define(`lk-${kind}`, function () { piece(this); });\n}\n';
  const cwd = mkdtempSync(join(tmpdir(), 'branch-fresh-'));
  git(cwd, 'init', '-q');
  commit(cwd, 'the base declares the sets piece', {
    'integrations/pi/kit/kit.js': bucle([['cards', 'Las tarjetas'], ['venn', 'Los conjuntos']]),
    'tools/deck-lint.mjs': 'export const only = true;\n'
  });
  git(cwd, 'branch', '-M', 'main');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
  git(cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  // el autor tiene el kit de antes: el bucle no declara lk-venn
  writeFileSync(join(cwd, 'integrations/pi/kit/kit.js'), bucle([['cards', 'Las tarjetas']]));
  const out = run(cwd);
  assert.equal(out.status, 1, `la base declara lk-venn y aquí no está: ${out.stdout}${out.stderr}`);
  assert.match(out.stdout, /lk-venn/);
});

// Un clon superficial esconde la historia compartida tras un injerto, así que
// `rev-list base..HEAD` cuenta el commit de la base como si fuera trabajo propio:
// el mismo checkout que solo va por detrás se reporta «ahead 1». Que el clon tenga
// commits propios es un hecho que el tool puede comprobar (`merge-base
// --is-ancestor`), de modo que el 0 de `ahead` no es una suposición: es la verdad.
// Cuánto va por detrás no se puede saber sin red, y este test no lo exige.
test('a shallow clone does not claim to be ahead of the base it is only behind', () => {
  const origin = mkdtempSync(join(tmpdir(), 'branch-fresh-origin-'));
  git(origin, 'init', '-q');
  commit(origin, 'one', {
    'integrations/pi/kit/kit.js': kit('lk-callout'),
    'tools/deck-lint.mjs': 'export const one = true;\n'
  });
  git(origin, 'branch', '-M', 'main');

  const shallow = mkdtempSync(join(tmpdir(), 'branch-fresh-shallow-'));
  const clone = join(shallow, 'clone');
  git(shallow, 'clone', '-q', '--depth', '1', `file://${origin}`, clone);

  for (const name of ['two', 'three', 'four', 'five', 'six']) commit(origin, name, { [`docs/${name}.md`]: `${name}\n` });
  git(clone, 'fetch', '-q', '--depth', '1', 'origin', 'main');

  const out = run(clone, '--json');
  if (out.status === 2) return; // declinar contestar también es honesto
  const report = JSON.parse(out.stdout);
  assert.equal(report.fresh, false, out.stdout);
  assert.equal(report.ahead, 0, `the clone owns no commit of its own: ${out.stdout}`);
  assert.ok(report.behind >= 1, out.stdout);
});
