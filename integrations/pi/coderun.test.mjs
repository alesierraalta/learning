// Code-exercise judge tests: pure grading rules, exercise validation, and real
// container runs (skipped with a reason when Docker or the image is missing).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { existsSync } from "node:fs";
import { forPage, imageFailure, loadRunners, publicExercise, readExercise, runCode, sameOutput, workRoot } from "./coderun.ts";

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
