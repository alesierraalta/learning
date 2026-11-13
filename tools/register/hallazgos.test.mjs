// Los hallazgos de registro también se prueban: una regla que nunca rechaza no separa nada.
// La medida viene de measure.mjs; aquí se prueba lo que el tutor lee: la frase, el término y lo que hay que hacer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { umbralesDe, NIVEL_DEFECTO, NIVELES } from './niveles.mjs';
import { hallazgosDeRegistro, REGLAS_DE_REGISTRO } from './hallazgos.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const leer = (ruta) => readFileSync(join(HERE, ruta), 'utf8');
const REAL_PLSQL = join(HERE, '..', '..', 'internal', 'engine', 'testdata', 'plsql-parte-1.md');
const porRegla = (text, umbrales = umbralesDe()) =>
  Object.fromEntries(hallazgosDeRegistro(text, umbrales).map((row) => [row.rule, row]));

test('las seis reglas que separan la referencia, y el glosario en bloque (#265), en ese orden', () => {
  assert.deepEqual(REGLAS_DE_REGISTRO, [
    'termino-sin-explicar',
    'frases-largas',
    'sin-negritas',
    'sin-escena-antes',
    'sin-contraste',
    'cuentas-sin-pasos',
    'glosario-en-bloque',
  ]);
});

// El glosario en bloque (#265): tres o más definiciones «Término: Es …» seguidas, sin una frase del ejemplo
// entre ellas. La referencia del alumno nunca pone dos seguidas: su explicación de RL reparte cada definición.
const RL_REFERENCIA = join(HERE, 'corpus', 'ref-chatgpt-rl.txt');
const BANCO_NOTA = join(HERE, 'fixtures', 'bench265', 'notas', 'tcp-handshake.md');
const BANCO_LIMPIA = join(HERE, 'fixtures', 'bench265', 'clean', 'tcp-handshake.md');

test('el glosario en bloque: la explicación de RL del alumno no pone definiciones seguidas y pasa', () => {
  const row = porRegla(readFileSync(RL_REFERENCIA, 'utf8'))['glosario-en-bloque'];
  assert.equal(row?.ok, true, `la referencia falla el glosario: ${row?.detail}`);
});

test('el glosario en bloque: los cinco términos del banco seguidos fallan, y se cita el primero', () => {
  const row = porRegla(readFileSync(BANCO_NOTA, 'utf8'))['glosario-en-bloque'];
  assert.equal(row?.ok, false, 'five definitions in a row pass');
  assert.match(row.detail, /5 definiciones seguidas/);
  assert.match(row.items[0].linea, /Cliente/);
});

test('el glosario en bloque: tres seguidas fallan, dos seguidas pasan (el umbral sale de la referencia)', () => {
  const tres = ['**A**: Es uno.', '**B**: Es dos.', '**C**: Es tres.'].join('\n\n');
  const dos = ['**A**: Es uno.', '**B**: Es dos.', 'Imagina un robot en la sala.', '**C**: Es tres.'].join('\n\n');
  assert.equal(porRegla(tres)['glosario-en-bloque']?.ok, false, 'three in a row pass');
  assert.equal(porRegla(dos)['glosario-en-bloque']?.ok, true, 'two with a scene between pass');
});

test('el glosario en bloque: la parte limpia del banco, con las definiciones repartidas, pasa', () => {
  const row = porRegla(readFileSync(BANCO_LIMPIA, 'utf8'))['glosario-en-bloque'];
  assert.equal(row?.ok, true, `la parte limpia falla el glosario: ${row?.detail}`);
});

test('los niveles por defecto son los valores de la referencia: «más» en los dos ejes', () => {
  assert.equal(NIVEL_DEFECTO, 'más');
  const u = umbralesDe();
  assert.equal(u.frasesMedia, 8);
  assert.equal(u.frasesP90, 13);
  assert.equal(u.contraste, 4);
  assert.equal(u.pasos, 12);
  assert.equal(u.racha, 3);
  assert.equal(u.escenaAntes, 1, 'más: todas las definiciones después del ejemplo');
  assert.equal(u.explicado, 0.5);
  assert.equal(u.negritas, 5);
});

test('cada nivel de cada eje mueve su umbral, según el mapa de la referencia', () => {
  const con = (sencillez, tecnicidad) =>
    umbralesDe({ aspectos: [{ id: 'sencillez', nivel: sencillez }, { id: 'tecnicidad', nivel: tecnicidad }] });
  const menos = con('menos', 'menos');
  assert.deepEqual(
    [menos.frasesMedia, menos.frasesP90, menos.contraste, menos.pasos, menos.explicado, menos.negritas],
    [14, 20, 2, 1, 0.2, 1],
  );
  const medio = con('medio', 'medio');
  assert.deepEqual(
    [medio.frasesMedia, medio.frasesP90, medio.contraste, medio.pasos, medio.explicado, medio.negritas],
    [11, 16, 3, 6, 0.35, 3],
  );
  // §7: sceneFirst es una parte de las definiciones que van después del ejemplo.
  assert.equal(menos.escenaAntes, 0, 'menos: no exige');
  assert.equal(medio.escenaAntes, 0.7, 'medio: al menos el 70 %');
  assert.equal(menos.racha, 1);
  assert.equal(medio.racha, 2);
});

test('un nivel desconocido o un eje ausente usa el defecto', () => {
  assert.equal(umbralesDe({ aspectos: [{ id: 'sencillez', nivel: 'mucho' }] }).frasesMedia, 8);
  assert.equal(umbralesDe({ aspectos: [] }).explicado, 0.5);
});

test('una palabra técnica explicada en su frase no tiene hallazgo de término', () => {
  const row = porRegla(
    'El buffer es una zona de memoria temporal donde la sesión guarda los cambios. Después el motor los escribe en disco.',
  )['termino-sin-explicar'];
  assert.equal(row.ok, true, row.detail);
});

test('un término sin explicar da un hallazgo por término: su frase y lo que hay que hacer', () => {
  const row = porRegla('La sesión ejecuta código secuencial en el buffer de la memoria.')['termino-sin-explicar'];
  assert.equal(row.ok, false);
  const buffer = row.items.find((item) => item.term === 'buffer');
  assert.ok(buffer, 'el buffer es un término sin explicar');
  assert.equal(buffer.sentence, 'La sesión ejecuta código secuencial en el buffer de la memoria.');
  assert.equal(buffer.instruccion, 'explícalo en palabras llanas aquí y átalo al ejemplo');
  assert.ok(row.items.some((item) => item.term === 'secuencial'), 'el «código secuencial» también se cita');
});

test('la parte real de PL/SQL no pasa el registro por defecto: sin explicar, frases largas y sin negritas', () => {
  const rows = porRegla(readFileSync(REAL_PLSQL, 'utf8'));
  for (const rule of ['termino-sin-explicar', 'frases-largas', 'sin-negritas']) {
    assert.equal(rows[rule].ok, false, `${rule}: ${rows[rule].detail}`);
  }
});

test('frases-largas cita las frases más largas, sin volcar el texto', () => {
  const row = porRegla(readFileSync(REAL_PLSQL, 'utf8'))['frases-largas'];
  assert.equal(row.ok, false);
  assert.ok(row.items.length >= 1 && row.items.length <= 3, `cita de 1 a 3: ${row.items.length}`);
  assert.match(row.items[0].instruccion, /dos frases/);
  assert.ok(row.items[0].sentence.split(/\s+/).length > 13, 'la frase citada pasa el tope');
});

test('sin-escena-antes: una definición antes del primer ejemplo falla; con el ejemplo primero pasa', () => {
  const definicionPrimero = '**Estado**: es todo lo que hace falta saber para decidir.\n\nImagina un robot aspirador en la sala.';
  const ejemploPrimero = 'Imagina un robot aspirador en la sala.\n\n**Estado**: es todo lo que hace falta saber para decidir.';
  assert.equal(porRegla(definicionPrimero)['sin-escena-antes'].ok, false);
  assert.equal(porRegla(ejemploPrimero)['sin-escena-antes'].ok, true);
});

test('sin-contraste: una parte sin antes y después falla; con un contraste pasa', () => {
  const plano = 'El robot limpia la sala. La batería baja con cada paso. El cargador repone la energía del robot.';
  const contrastado = 'Antes, el robot limpia la sala. Después, la batería baja con cada paso. El cargador repone la energía del robot.';
  assert.equal(porRegla(plano)['sin-contraste'].ok, false);
  assert.equal(porRegla(contrastado)['sin-contraste'].ok, true);
});

test('cuentas-sin-pasos: una cuenta dentro de la frase falla; la misma cuenta en renglones pasa', () => {
  const enFrase = 'La recompensa suma 10 - 0.9 + 8.1 = 17.2 en total. El robot repite el ciclo.';
  const renglones = 'La recompensa suma así:\n\n```\n10 - 0.9\n+ 8.1\n= 17.2\n```\n\nEl robot repite el ciclo.';
  assert.equal(porRegla(enFrase)['cuentas-sin-pasos'].ok, false);
  assert.equal(porRegla(renglones)['cuentas-sin-pasos'].ok, true);
});

test('sin cuentas no hay cuentas-sin-pasos', () => {
  assert.equal(porRegla('El robot limpia la sala. Después carga la batería.')['cuentas-sin-pasos'].ok, true);
});

test('sin-negritas: un término técnico sin negrita falla y lo cita; con negrita y definición pasa', () => {
  const sinNegrita = porRegla('El buffer guarda los cambios antes de escribirlos en disco.')['sin-negritas'];
  assert.equal(sinNegrita.ok, false);
  assert.ok(sinNegrita.items.some((item) => item.term === 'buffer'));
  const conNegrita = porRegla('**Buffer**: es una zona de memoria temporal. El buffer guarda los cambios antes de escribirlos en disco.');
  assert.equal(conNegrita['sin-negritas'].ok, true);
});

// §7 mide sceneFirst como la parte de definiciones que van después del ejemplo, no como un «sí o no».
test('sin-escena-antes con «medio» exige el 70 % de las definiciones después del ejemplo', () => {
  const tres = ['**Uno**: es la primera idea.', 'Imagina un ejemplo concreto.', '**Dos**: es la segunda idea.', '**Tres**: es la tercera idea.'].join('\n\n');
  const nivel = (sencillez) => umbralesDe({ aspectos: [{ id: 'sencillez', nivel: sencillez }] });
  assert.equal(porRegla(tres, nivel('menos'))['sin-escena-antes'].ok, true, 'menos no exige');
  assert.equal(porRegla(tres, nivel('medio'))['sin-escena-antes'].ok, false, '2 de 3 después = 67 %, bajo el 70 %');
  assert.equal(porRegla(tres)['sin-escena-antes'].ok, false, 'más: ninguna antes del ejemplo');

  const diez = ['**A**: es uno.', '**B**: es dos.', '**C**: es tres.', 'Imagina un robot en la sala.', '**D**: es cuatro.', '**E**: es cinco.', '**F**: es seis.', '**G**: es siete.', '**H**: es ocho.', '**I**: es nueve.', '**J**: es diez.'].join('\n\n');
  assert.equal(porRegla(diez, nivel('medio'))['sin-escena-antes'].ok, true, '7 de 10 después = 70 %');
});

// El tutor reescribe lo que se le cita: un código en línea no pide negrita, se explica.
test('sin-negritas no pide negrita para un valor escrito en código', () => {
  const row = porRegla('El valor `buffer` guarda los cambios antes de escribirlos.')['sin-negritas'];
  assert.equal(row.ok, false);
  assert.ok(!row.items.some((item) => item.term === 'buffer'), 'el código se explica, no se marca en negrita');
});

// La frase que se cita para reescribir en antes y después debe afirmar algo, no ser el ejemplo que abre la parte.
test('sin-contraste cita una frase que afirma, no la apertura del ejemplo', () => {
  const row = porRegla('Imagina un robot aspirador en la sala de estar.\n\nLa batería baja con cada paso que el robot da por la casa.')['sin-contraste'];
  assert.equal(row.ok, false);
  assert.equal(row.items[0].sentence, 'La batería baja con cada paso que el robot da por la casa.');
});

test('la parte limpia pasa las seis reglas de registro', () => {
  const rows = porRegla(leer('fixtures/limpia.md'));
  for (const rule of REGLAS_DE_REGISTRO) {
    assert.equal(rows[rule].ok, true, `${rule}: ${rows[rule].detail}`);
  }
});

// La fuente nombra el origen del texto: sus siglas no son términos que la parte deba explicar.
test('una línea de fuente no se mide como prosa: sus siglas no se citan como términos', () => {
  const text = 'Imagina un robot aspirador en la sala.\n\n**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.';
  const row = porRegla(text)['termino-sin-explicar'];
  assert.equal(row.ok, true, row.detail);
});

// One table for the engine and for the tools: the levels live in rules/deep.json, where the Go code reads them too.
test('la tabla de niveles vive en rules/deep.json: cada medida tiene sus tres niveles en los dos ejes', () => {
  const deep = JSON.parse(readFileSync(join(HERE, '..', '..', 'rules', 'deep.json'), 'utf8'));
  const levels = deep.thresholds.partStandard.register.levels;
  for (const axis of ['sencillez', 'tecnicidad']) {
    for (const [measure, values] of Object.entries(levels[axis])) {
      assert.deepEqual(Object.keys(values).sort(), [...NIVELES].sort(), `${axis}.${measure}`);
    }
  }
});
