import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const cli = resolve('integrations/pi/code-cli.ts');
const run = (root, ...args) => spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' });
function fixture(lang = 'python') {
  const root = mkdtempSync(join(tmpdir(), 'code-cli-test-'));
  const dir = join(root, 'lab', 'codigo', 'suma');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ejercicio.json'), JSON.stringify({ titulo: 'Suma', enunciado: 'Suma uno', lenguaje: lang, plantilla: 'print(int(input()) + 1)\n', tests: [{nombre:'visible', entrada:'1\n', salida:'2\n'}, {nombre:'oculta', entrada:'987\n', salida:'988\n', oculto:true}] }));
  return { root, dir };
}
test('ayuda, errores, listado y open no sobrescribe', () => {
  const { root, dir } = fixture();
  const help = run(root, '--help');
  assert.equal(help.status, 0); assert.equal(help.stderr, ''); assert.match(help.stdout, /^Uso: learning code/);
  const bad = run(root, 'open', '../lab', 'suma');
  assert.equal(bad.status, 2); assert.match(bad.stderr, /Uso: learning code/);
  assert.equal(run(root, 'list').stdout, 'lab\nsuma · Suma · python · mejor: — · entregas: 0\n');
  const file = join(dir, 'mi-solucion.py');
  assert.equal(run(root, 'open', 'lab', 'suma').stdout, file + '\n');
  writeFileSync(file, 'personal');
  assert.equal(run(root, 'open', 'lab', 'suma').status, 0);
  assert.equal(readFileSync(file, 'utf8'), 'personal');
  assert.equal(run(root, 'test', 'lab').status, 2);
  assert.equal(run(root, 'setup', 'desconocido').status, 2);
  const java = fixture('java');
  assert.equal(run(java.root, 'open', 'lab', 'suma').stdout, join(java.dir, 'mi-solucion', 'Main.java') + '\n');
});
const image = spawnSync('docker', ['image', 'inspect', 'python:3.12-alpine']);
test('test no guarda; submit guarda 001 y 002 sin revelar ocultos', { skip: image.status !== 0 ? 'Falta python:3.12-alpine; ejecuta learning code setup python' : false }, () => {
  const { root, dir } = fixture();
  run(root, 'open', 'lab', 'suma');
  const tried = run(root, 'test', 'lab', 'suma');
  assert.equal(tried.status, 0); assert.equal(tried.stderr, '');
  assert.equal(tried.stdout, '✔ visible: correcto\nPuntaje: 1/1\n');
  assert.equal(existsSync(join(dir, 'entregas')), false);
  for (const n of ['001', '002']) {
    const result = run(root, 'submit', 'lab', 'suma', '--note', 'hola');
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.equal(result.stdout, `✔ visible: correcto\n✔ oculta: correcto\nPuntaje: 2/2\nEntrega guardada: ${join(dir, 'entregas', n + '.json')}\nDile al tutor en el chat que entregaste este ejercicio.\n`);
    assert.equal(JSON.parse(readFileSync(join(dir, 'entregas', n + '.json'))).nota, 'hola');
  }
  writeFileSync(join(dir, 'mi-solucion.py'), 'print(0)');
  const fail = run(root, 'submit', 'lab', 'suma');
  assert.equal(fail.status, 1); assert.match(fail.stdout, /✘ visible: incorrecto\nEntrada: "1\\n"\nEsperado: "2\\n"\nObtenido: "0\\n"/);
  assert.doesNotMatch(fail.stdout, /987|988/);
  writeFileSync(join(dir, 'mi-solucion.py'), 'raise ValueError("fallo")');
  const crash = run(root, 'test', 'lab', 'suma');
  assert.equal(crash.status, 1); assert.match(crash.stdout, /💥 visible: error/); assert.match(crash.stdout, /ValueError: fallo/);
  writeFileSync(join(dir, 'mi-solucion.py'), 'while True: pass');
  const timeout = run(root, 'test', 'lab', 'suma');
  assert.equal(timeout.status, 1); assert.match(timeout.stdout, /⏱ visible: tiempo/);
});
const gcc = spawnSync('docker', ['image', 'inspect', 'gcc:14']);
test('compilación fallida muestra diagnóstico y sale 1', { skip: gcc.status !== 0 ? 'Falta gcc:14; ejecuta learning code setup c' : false }, () => {
  const { root, dir } = fixture('c');
  const file = join(dir, 'roto.c');
  writeFileSync(file, 'esto no es C');
  const result = run(root, 'test', 'lab', 'suma', file);
  assert.equal(result.status, 1); assert.equal(result.stderr, '');
  assert.match(result.stdout, /^💥 Error de compilación:/); assert.match(result.stdout, /error:/); assert.match(result.stdout, /Puntaje: 0\/1\n$/);
});
