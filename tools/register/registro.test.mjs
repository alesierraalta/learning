// El registro en el checador: las reglas se miden sobre partes reales y sobre notas mínimas, y las
// preferencias del alumno (sencillez, tecnicidad) mueven los umbrales desde su raíz de Learnings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = join(HERE, '..');
const ENGINE_DATA = join(HERE, '..', '..', 'internal', 'engine', 'testdata');
const BENCH = join(HERE, 'fixtures', 'bench246');
const REPO = join(HERE, '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'registro-check-'));
// La base del alumno nunca se mete en una prueba: STUDIO_DB vacío apaga la variable.
const SIN_BASE = { ...process.env, STUDIO_DB: '' };

const reglas = (file, env = SIN_BASE) => {
  const r = spawnSync(process.execPath, [join(TOOLS, 'explain-check.mjs'), file, '--json'], { encoding: 'utf8', env });
  return Object.fromEntries(JSON.parse(r.stdout).rows.map((row) => [row.rule, row]));
};

const PARTE_REAL = [
  join(ENGINE_DATA, 'plsql-parte-1.md'),
  join(ENGINE_DATA, 'plsql-parte-1-actores.md'),
  join(ENGINE_DATA, 'sql-parte-1.md'),
  join(ENGINE_DATA, 'tcp-parte-1-banco.md'),
  ...['bayes-theorem', 'css-flexbox', 'git-branching', 'rust-borrowing', 'tcp-handshake'].map((t) => join(BENCH, `${t}.md`)),
];

const nota = (name, body) => {
  const file = join(dir, name);
  writeFileSync(file, `# Parte 1\n\n## Ruta\n\n1. Uno.\n2. Dos.\n3. Tres.\n\n## 1. Algo\n\n${body}\n`);
  return file;
};

test('cada parte real de agy falla termino-sin-explicar, y cita cada término con su frase y su instrucción', () => {
  for (const file of PARTE_REAL) {
    const row = reglas(file)['termino-sin-explicar'];
    assert.equal(row.ok, false, `${file}: ${row.detail}`);
    assert.ok(row.items.length > 0, `${file}: no cita ningún término`);
    for (const item of row.items) {
      assert.equal(item.instruccion, 'explícalo en palabras llanas aquí y átalo al ejemplo', file);
      assert.ok(item.term && item.sentence, `${file}: ${JSON.stringify(item)}`);
    }
  }
});

test('la parte real de PL/SQL cita el buffer con la frase donde aparece', () => {
  const row = reglas(join(ENGINE_DATA, 'plsql-parte-1.md'))['termino-sin-explicar'];
  const buffer = row.items.find((item) => item.term === 'buffer');
  assert.ok(buffer, 'el buffer no aparece citado');
  assert.match(buffer.sentence, /buffer de sesión/);
});

test('las partes reales de PL/SQL y de TCP fallan frases-largas: su media pasa de 8 palabras', () => {
  for (const file of [join(ENGINE_DATA, 'plsql-parte-1.md'), join(ENGINE_DATA, 'tcp-parte-1-banco.md')]) {
    assert.equal(reglas(file)['frases-largas'].ok, false, file);
  }
});

test('la parte real de PL/SQL no tiene ninguna negrita-término: falla sin-negritas', () => {
  assert.equal(reglas(join(ENGINE_DATA, 'plsql-parte-1.md'))['sin-negritas'].ok, false);
});

test('sin-escena-antes con una nota mínima: la definición antes del ejemplo falla', () => {
  const primero = nota('ejemplo-primero.md', 'Imagina un robot aspirador en la sala.\n\n**Estado**: es todo lo que hace falta saber para decidir.');
  const despues = nota('definicion-primero.md', '**Estado**: es todo lo que hace falta saber para decidir.\n\nImagina un robot aspirador en la sala.');
  assert.equal(reglas(primero)['sin-escena-antes'].ok, true);
  assert.equal(reglas(despues)['sin-escena-antes'].ok, false);
});

test('cuentas-sin-pasos con una nota mínima: la cuenta dentro de la frase falla; en renglones pasa', () => {
  const enFrase = nota('cuenta-en-frase.md', 'La recompensa suma 10 - 0.9 + 8.1 = 17.2 en total. El robot repite el ciclo.');
  const renglones = nota('cuenta-en-renglones.md', 'La recompensa suma así:\n\n```\n10 - 0.9\n+ 8.1\n= 17.2\n```\n\nEl robot repite el ciclo.');
  assert.equal(reglas(enFrase)['cuentas-sin-pasos'].ok, false);
  assert.equal(reglas(renglones)['cuentas-sin-pasos'].ok, true);
});

// Una raíz de Learnings con sus preferencias: la base (learning.db, como la guarda el estudio)
// o el archivo de antes de la base (niveles-alumno.json). La nota de diez palabras por frase es
// la que el umbral por defecto rechaza y el alumno con «menos» sencillez acepta.
// Sin `## Ruta`: sus elementos son frases de una palabra y bajarían la media que la prueba mide.
const PARTE_DE_DIEZ = `# Parte 1\n\n## 1. Algo\n\n${Array(6).fill('El robot limpia la sala cada tarde con mucho cuidado.').join(' ')}\n`;

const raiz = (name, { base, archivo } = {}) => {
  const root = join(dir, name);
  mkdirSync(join(root, 'tema', 'explicaciones'), { recursive: true });
  if (base !== undefined) {
    // The studio keeps both: the store, and the copy the tools and the engine read.
    const db = new DatabaseSync(join(root, 'learning.db'));
    db.exec('CREATE TABLE documentos (clave TEXT PRIMARY KEY, json TEXT NOT NULL, actualizado TEXT NOT NULL)');
    db.prepare('INSERT INTO documentos (clave, json, actualizado) VALUES (?, ?, ?)').run('preferencias', base, new Date().toISOString());
    db.close();
    writeFileSync(join(root, 'niveles-alumno.json'), base);
  }
  if (archivo !== undefined) writeFileSync(join(root, 'niveles-alumno.json'), archivo);
  const file = join(root, 'tema', 'explicaciones', 'parte.md');
  writeFileSync(file, PARTE_DE_DIEZ);
  return file;
};

const conSencillez = (nivel) => JSON.stringify({
  version: 1,
  aspectos: [{ id: 'sencillez', titulo: 'Qué tan simple', descripcion: 'Cuánto se parte la idea.', nivel }],
});

test('sin preferencias, sencillez es «más» y una frase de diez palabras de media falla frases-largas', () => {
  const row = reglas(raiz('sin-preferencias'))['frases-largas'];
  assert.equal(row.ok, false);
  assert.match(row.detail, /sencillez=más/, 'el detalle dice qué nivel aplicó');
});

test('la base del alumno con sencillez «menos» acepta la misma parte y lo dice', () => {
  const row = reglas(raiz('base-menos', { base: conSencillez('menos') }))['frases-largas'];
  assert.equal(row.ok, true, row.detail);
  assert.match(row.detail, /sencillez=menos/);
});

test('el archivo de antes de la base también cuenta: sencillez «medio» acepta diez palabras', () => {
  const row = reglas(raiz('archivo-medio', { archivo: conSencillez('medio') }))['frases-largas'];
  assert.equal(row.ok, true, row.detail);
});

test('una base sin los aspectos de registro (anterior a este cambio) usa el defecto', () => {
  const viejo = JSON.stringify({ version: 1, aspectos: [{ id: 'texto', titulo: 'Cantidad de texto', descripcion: 'x', nivel: 'menos' }] });
  assert.equal(reglas(raiz('base-vieja', { base: viejo }))['frases-largas'].ok, false);
});

test('sencillez «menos» acepta una definición antes del ejemplo en el checador, y «más» la rechaza', () => {
  const body = '# Parte 1\n\n## 1. Algo\n\n**Estado**: es todo lo que hace falta saber para decidir.\n\nImagina un robot aspirador en la sala.\n';
  const menos = raiz('escena-menos', { base: conSencillez('menos') });
  writeFileSync(menos, body);
  assert.equal(reglas(menos)['sin-escena-antes'].ok, true, 'menos no exige');
  const mas = raiz('escena-mas', { base: conSencillez('más') });
  writeFileSync(mas, body);
  assert.equal(reglas(mas)['sin-escena-antes'].ok, false, 'más: ninguna definición antes del ejemplo');
});

test('la parte limpia pasa las seis reglas de registro en el checador', () => {
  const rows = reglas(join(HERE, 'fixtures', 'limpia.md'));
  for (const rule of ['termino-sin-explicar', 'frases-largas', 'sin-negritas', 'sin-escena-antes', 'sin-contraste', 'cuentas-sin-pasos']) {
    assert.equal(rows[rule].ok, true, `${rule}: ${rows[rule].detail}`);
  }
});

test('la skill y el AGENTS de Learnings dicen la regla del registro y su sección', () => {
  const skill = readFileSync(join(REPO, 'skills', 'explicacion-interactiva', 'SKILL.md'), 'utf8');
  const agents = readFileSync(join(REPO, 'deploy', 'vps', 'learnings', 'AGENTS.md'), 'utf8');
  assert.match(skill, /^## Registro/m, 'la skill tiene una sección «Registro»');
  assert.match(skill, /técnico en el contenido, sencillo en la forma/);
  assert.match(agents, /técnico en el contenido, sencillo en la forma/);
});

// The learner's levels come from the Learnings root above the note, at most four folders up: a file
// further up is not this learner's root, and the defaults apply.
test('niveles-alumno.json solo cuenta a cuatro carpetas o menos por encima de la nota', () => {
  const lejos = mkdtempSync(join(tmpdir(), 'registro-lejos-'));
  writeFileSync(join(lejos, 'niveles-alumno.json'), conSencillez('menos'));
  mkdirSync(join(lejos, 'a', 'b', 'c', 'd', 'e'), { recursive: true });
  const nota = join(lejos, 'a', 'b', 'c', 'd', 'e', 'parte.md');
  writeFileSync(nota, PARTE_DE_DIEZ);
  assert.equal(reglas(nota)['frases-largas'].ok, false, 'la raíz está cinco carpetas arriba: mandan los defectos');
});
