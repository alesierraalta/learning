// El kit que mide la puerta sale de su manifiesto, y la puerta no mide un kit incompleto (#336).
//
// La puerta copiaba una lista escrita a mano que no llevaba `question.js`: una pregunta con código se
// dibujaba como texto dentro de la página que medía, y esa página no es la que ve el alumno. Estos
// casos fijan lo observable: la página de la puerta dibuja el `<pre>` de la pregunta, y un archivo del
// manifiesto que falta hace fallar la puerta con un mensaje que lo nombra.
//
// Uso: node --test tools/test/scene-gate-kit.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('../scene-gate.mjs', import.meta.url));
const KIT = fileURLToPath(new URL('../../integrations/pi/kit', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'scene-gate-kit-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const manifest = () => JSON.parse(readFileSync(join(KIT, 'manifest.json'), 'utf8'));

// Una copia del kit, sin los ejemplos ni los tests, y sin un archivo si se pide: la puerta mide esa carpeta.
function kitCopy(without = null) {
  const kit = mkdtempSync(join(dir, 'kit-'));
  cpSync(KIT, kit, {
    recursive: true,
    filter: (src) => {
      const rel = relative(KIT, src);
      return rel === '' || (basename(src) !== without && !/^(examples|test)(\/|$)/.test(rel));
    },
  });
  return kit;
}

function run(args, env = {}) {
  return new Promise((done) => {
    execFile(process.execPath, [GATE, ...args], { timeout: 90000, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      done({ code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// Una escena que pasa la puerta y una pregunta de un punto con código cercado, como la escribe el tutor.
const SCENE = `<lk-scene>\n<script type="application/json">\n${JSON.stringify({ viewBox: '0 0 760 410', scene: { boxes: [{ x: 200, y: 20, w: 360, h: 370, label: 'Uno', size: 24 }] } })}\n</script>\n</lk-scene>`;
const PREGUNTA = { id: 'q-codigo', pregunta: '¿Qué imprime?\n```sql\nSELECT 1 FROM dual;\n```', opciones: { A: '1', B: '2' } };
const QUIZ = `<lk-quick-quiz point="1. Consulta" categoria="conceptual"><script type="application/json">${JSON.stringify(PREGUNTA)}</script></lk-quick-quiz>`;
const NOTE = `# Consulta\n\n${SCENE}\n\n${QUIZ}\n`;

test('una pregunta con código cercado dibuja su <pre> dentro de la página de la puerta', async () => {
  const note = join(dir, 'pregunta-con-codigo.md');
  writeFileSync(note, NOTE);
  const dump = mkdtempSync(join(dir, 'dump-'));
  await run([note], { SCENE_GATE_DUMP: dump });
  const html = join(dump, 'pregunta-con-codigo.html');
  const main = existsSync(html) ? /<main[\s\S]*<\/main>/.exec(readFileSync(html, 'utf8'))?.[0] ?? '' : '';
  assert.match(main, /Qué imprime/, 'la pregunta llega a la página de la puerta');
  assert.match(main, /<pre[\s>]/, 'la pregunta se dibuja con su bloque de código, no como texto');
  const visible = main.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(visible, /```/, 'fuera de su payload, la cerca no queda escrita como texto');
});

test('un archivo del manifiesto que falta en el kit hace fallar la puerta y lo nombra', async () => {
  const note = join(dir, 'kit-incompleto.md');
  writeFileSync(note, NOTE);
  const kit = kitCopy('question.js');
  const { code, stdout, stderr } = await run([note], { SCENE_GATE_KIT: kit });
  assert.equal(code, 2, 'una página sin su kit no es la que ve el alumno: es un fallo de la herramienta, no un aprobado');
  assert.match(stdout, /kit incompleto: falta question\.js/, 'el mensaje nombra el archivo que falta');
  assert.doesNotMatch(stderr, /^\s+at /m, 'sin traza de pila');
});

test('un manifiesto que no se puede leer hace fallar la puerta con un mensaje, sin traza de pila', async () => {
  const note = join(dir, 'manifiesto-roto.md');
  writeFileSync(note, NOTE);
  const kit = kitCopy();
  writeFileSync(join(kit, 'manifest.json'), '{ no es json');
  const { code, stdout, stderr } = await run([note], { SCENE_GATE_KIT: kit });
  assert.equal(code, 2);
  assert.match(stdout, /manifiesto del kit ilegible/, 'el mensaje dice qué no se pudo leer');
  assert.doesNotMatch(stderr, /^\s+at /m, 'sin traza de pila');
});

test('el manifiesto lista cada archivo que kit.js carga al lado con beside()', () => {
  const loaded = [...readFileSync(join(KIT, 'kit.js'), 'utf8').matchAll(/beside\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(loaded.length > 0, 'kit.js carga algo al lado: si no, este test no mira nada');
  for (const file of loaded) {
    assert.ok(manifest().beside.includes(file), `${file} lo carga kit.js y el manifiesto no lo lista: la puerta no lo copiaría`);
  }
});

test('el manifiesto lista cada fuente que kit.css pide con url()', () => {
  const asked = [...readFileSync(join(KIT, 'kit.css'), 'utf8').matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/g)].map((m) => m[1]);
  assert.ok(asked.length > 0, 'kit.css pide alguna fuente: si no, este test no mira nada');
  for (const file of asked) {
    assert.ok(manifest().assets.includes(file), `${file} lo pide kit.css y el manifiesto no lo lista: la puerta la mediría con otra letra`);
  }
});

test('cada archivo del manifiesto existe en el kit, y kit.css y scene.js cargan antes que kit.js', () => {
  const { head, beside, assets } = manifest();
  for (const file of [...head, ...beside, ...assets]) {
    assert.ok(existsSync(join(KIT, file)), `${file} no está en el kit`);
  }
  assert.ok(head.indexOf('kit.css') < head.indexOf('scene.js'), 'kit.css va antes que scene.js');
  assert.ok(head.indexOf('scene.js') < head.indexOf('kit.js'), 'scene.js va antes que kit.js: kit.js mide `S` al cargar');
});
