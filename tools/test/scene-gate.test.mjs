// El comprobador de escenas también se comprueba.
//
// `tools/scene-gate.mjs` existe para que una figura no se publique sin medir.
// Si el propio comprobador miente, el gate es decorativo: estos casos fijan el
// contrato observable de la herramienta —código de salida y qué dice—, no su
// implementación.
//
// Uso: node --test tools/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('../scene-gate.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'scene-gate-test-'));

function note(name, body) {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

function scene(spec, title = 'prueba') {
  return `<lk-scene title="${title}">\n<script type="application/json">\n${JSON.stringify({ scene: spec })}\n</script>\n</lk-scene>\n`;
}

function run(args) {
  return new Promise((done) => {
    execFile(process.execPath, [GATE, ...args], { timeout: 90000 }, (error, stdout, stderr) => {
      done({ code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

test('una nota sin escenas no es un aprobado', async () => {
  const path = note('prosa.md', '# Prosa\n\nSolo texto, sin figuras.\n');
  const { code, stdout } = await run([path]);
  assert.equal(code, 0, 'no hay nada que medir, así que no hay fallo');
  assert.match(stdout, /sin escenas/i, 'decir "ok" por haber medido cero escenas es fingir una garantía');
});

test('una nota que no existe es un fallo de la herramienta, no un hallazgo', async () => {
  const { code, stdout, stderr } = await run([join(dir, 'no-existe.md')]);
  assert.equal(code, 2, 'no poder leer la nota no es lo mismo que encontrar defectos en ella');
  assert.match(stdout, /no-existe\.md/, 'el mensaje nombra el archivo que no encontró');
  assert.doesNotMatch(stderr, /^\s+at /m, 'sin traza de pila: no se depura el gate leyendo un stack');
});

test('la letra ilegible falla la nota', async () => {
  const path = note('ilegible.md', scene({ boxes: [{ x: 20, y: 60, w: 120, h: 70, label: 'Uno', size: 7 }] }));
  const { code, stdout } = await run([path]);
  assert.equal(code, 1);
  assert.match(stdout, /text-too-small/);
});

test('el texto que se sale del lienzo falla la nota', async () => {
  const path = note('ancho.md', scene({
    labels: [{ x: 1000, y: 100, text: 'un rotulo larguisimo que no cabe de ninguna manera', size: 40 }],
  }));
  const { code, stdout } = await run([path]);
  assert.equal(code, 1);
  assert.match(stdout, /text-outside-canvas/, stdout);
});

test('una escena que no dibuja nada es un hallazgo, no un aprobado', async () => {
  const sinCapa = `<lk-scene title="sin capa">\n<script type="application/json">\n${JSON.stringify({ boxes: [{ x: 20, y: 60, w: 120, h: 70, label: 'Uno' }] })}\n</script>\n</lk-scene>\n`;
  const path = note('sin-capa.md', sinCapa);
  const { code, stdout } = await run([path]);
  assert.equal(code, 1, 'un JSON con la forma equivocada dibuja cero cosas y pasaba como bueno');
  assert.match(stdout, /empty-scene/);
});

test('una escena rota no esconde las demás notas', async () => {
  const rota = note('rota.md', '<lk-scene title="roto">\n<script type="application/json">\n{ esto no es json }\n</script>\n</lk-scene>\n');
  const buena = note('buena.md', scene({ boxes: [{ x: 20, y: 60, w: 120, h: 70, label: 'Uno', size: 7 }] }));
  const { code, stdout } = await run([rota, buena]);
  assert.equal(code, 1, 'una nota rota es un fallo, no una excusa para dejar de mirar');
  assert.match(stdout, /rota\.md/, 'la nota rota se nombra');
  assert.match(stdout, /text-too-small/, 'y la siguiente nota sí se midió');
});
