// La traducción de una página a nota (#265) se prueba contra la salida que el motor Go debe reproducir:
// `internal/engine/nota_html_test.go` lee los mismos archivos de `golden/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notaDeHtml } from './nota-html.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANCO = join(HERE, 'fixtures', 'bench265');
const leer = (...ruta) => readFileSync(join(BANCO, ...ruta), 'utf8');

test('la página del banco se traduce a la nota que el checador lee, con sus figuras intactas', () => {
  assert.equal(notaDeHtml(leer('paginas', 'tcp-handshake.html')), leer('golden', 'bench-tcp-handshake.nota.md'));
});

test('la página limpia se traduce igual que su nota: los mismos títulos, la misma ruta y las mismas figuras', () => {
  assert.equal(notaDeHtml(leer('clean', 'tcp-handshake.html')), leer('golden', 'clean-tcp-handshake.nota.md'));
});

test('una página sin figuras se traduce a párrafos y a listas de Markdown', () => {
  const nota = notaDeHtml('<!doctype html><html><head><title>x</title></head><body><main><h2>Ruta</h2><ol><li>Uno.</li><li>Dos &amp; tres.</li></ol><p><strong>Término</strong>: Es algo.</p></main></body></html>');
  assert.equal(nota, '## Ruta\n\n1. Uno.\n2. Dos & tres.\n\n**Término**: Es algo.\n');
});
