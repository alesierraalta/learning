// Indexes copied from the vault link parts through the vault path
// ([[notes/04-RECURSOS/Learnings/<tema>/explicaciones/...]]). Outside the vault
// the engine expects the topic-relative link, so this one-time migration rewrites them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'relink-index.mjs');
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

function root() {
  const dir = mkdtempSync(join(tmpdir(), 'relink-'));
  const topic = (name, body) => {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, 'explicacion.md'), body);
  };
  topic('sql', '# Índice\n- [[notes/04-RECURSOS/Learnings/sql/explicaciones/Parte 1 - a|Parte 1]]\n- [[notes/04-RECURSOS/Learnings/sql/explicaciones/Parte 2 - b]]\n- [[otro/explicaciones/Parte 9 - x]]\n');
  topic('redes', '# Índice\n- [[explicaciones/Parte 1 - a|Parte 1]]\n');
  return dir;
}

test('dry run reports what it would change and writes nothing', () => {
  const dir = root();
  const before = readFileSync(join(dir, 'sql', 'explicacion.md'), 'utf8');
  const out = run(dir);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, '');
  assert.equal(out.stdout, 'sql/explicacion.md: 2 enlaces\n1 índice(s), 2 enlace(s) por reescribir (sin --write no se cambia nada)\n');
  assert.equal(readFileSync(join(dir, 'sql', 'explicacion.md'), 'utf8'), before);
});

test('--write rewrites only links into the topic itself and is idempotent', () => {
  const dir = root();
  const out = run(dir, '--write');
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, 'sql/explicacion.md: 2 enlaces\n1 índice(s), 2 enlace(s) reescritos\n');
  assert.equal(readFileSync(join(dir, 'sql', 'explicacion.md'), 'utf8'),
    '# Índice\n- [[explicaciones/Parte 1 - a|Parte 1]]\n- [[explicaciones/Parte 2 - b]]\n- [[otro/explicaciones/Parte 9 - x]]\n');
  assert.equal(readFileSync(join(dir, 'redes', 'explicacion.md'), 'utf8'), '# Índice\n- [[explicaciones/Parte 1 - a|Parte 1]]\n');
  assert.equal(run(dir, '--write').stdout, '0 índice(s), 0 enlace(s) reescritos\n');
});

test('a missing or unknown argument is refused', () => {
  for (const args of [[], ['/no/such/root'], [mkdtempSync(join(tmpdir(), 'relink-')), '--force']]) {
    const out = run(...args);
    assert.equal(out.status, 2);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /^Uso: node tools\/relink-index\.mjs <raíz> \[--write\]/m);
  }
});
