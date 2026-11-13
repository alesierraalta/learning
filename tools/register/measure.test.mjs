// La medida del registro también se prueba: una que mide cualquier cosa no
// distingue nada. Aquí se fija el tokenizador, el divisor de frases y las dos
// medidas que sostienen la calibración.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize,
  splitSentences,
  splitInline,
  syllables,
  extractProse,
  measureText,
  explainedAtFirstUse,
  boundToExample,
  isStepLine,
  stem,
  isCommonWord,
} from './measure.mjs';

test('tokenize: acentos, decimales y código en línea', () => {
  assert.deepEqual(tokenize('El niño comió 2,77 kg de pan.'), ['El', 'niño', 'comió', '2,77', 'kg', 'de', 'pan']);
  // El código en línea no aporta palabras: se mide la prosa, no el identificador.
  assert.deepEqual(tokenize('La variable `v_saldo` guarda el saldo.'), ['La', 'variable', 'guarda', 'el', 'saldo']);
  assert.deepEqual(tokenize('2.77 bits por peso'), ['2.77', 'bits', 'por', 'peso']);
});

test('splitSentences: siglas, decimales y comillas de cierre', () => {
  assert.deepEqual(splitInline('El motor, etc. Y sigue.'), ['El motor, etc.', 'Y sigue.']);
  assert.deepEqual(splitInline('Pesa 2,77 kg. Luego baja.'), ['Pesa 2,77 kg.', 'Luego baja.']);
  assert.deepEqual(splitInline('Dijo «abramos esa caja». Después siguió.'), ['Dijo «abramos esa caja».', 'Después siguió.']);
  assert.deepEqual(splitInline('¿Qué acaba de ocurrir? Eso es la recompensa.'), [
    '¿Qué acaba de ocurrir?',
    'Eso es la recompensa.',
  ]);
  // Un elemento de lista es una frase propia aunque no lleve punto.
  assert.deepEqual(splitSentences('- aspirar\n- moverse\n1. **Ruta:** qué ocurre'), ['aspirar', 'moverse', '**Ruta:** qué ocurre']);
});

test('syllables: un núcleo vocálico por sílaba', () => {
  assert.equal(syllables('ción'), 1);
  assert.equal(syllables('ahora'), 3);
  assert.equal(syllables('también'), 2);
  assert.equal(syllables('cuantización'), 4);
});

test('extractProse: fuera código, piezas, tablas y quiz; queda la prosa y la cuenta', () => {
  const markdown = `---
tipo: explicacion
---

# Parte 1

El buffer es una zona de memoria temporal.

<lk-scene>
<script type="application/json">
{"viewBox":"0 0 10 10","scene":{}}
</script>
</lk-scene>

\`\`\`sql
SELECT 1 FROM dual;
\`\`\`

| Tabla | Uso |
|---|---|
| cuentas | saldo |

### **Agente**

Es quien toma decisiones.

\`\`\`text
10 + (-1) + 10 = 19
retorno = 19
\`\`\`

## Mini-quiz

1. ¿Qué flag envía el cliente?
- **A**: SYN.
`;
  const { prose, steps } = extractProse(markdown);
  assert.match(prose, /El buffer es una zona de memoria temporal\./);
  assert.match(prose, /\*\*Agente\*\*/, 'la etiqueta en negrita se conserva: es el término');
  assert.match(prose, /Es quien toma decisiones\./);
  assert.doesNotMatch(prose, /lk-scene|viewBox|SELECT|cuentas \| saldo|Mini-quiz|¿Qué flag/);
  assert.ok(steps.length >= 2, 'la cuenta paso a paso se guarda aparte');
  assert.ok(steps.every(isStepLine));
});

test('medida: densidad de nominalizaciones', () => {
  const nominal = measureText('La implementación de la configuración requiere la verificación de la documentación.');
  const llano = measureText('Cuando el robot limpia la sala, la batería baja.');
  assert.equal(llano.nominalizationsPer100, 0);
  assert.ok(nominal.nominalizationsPer100 > 25, `esperaba densidad alta, fue ${nominal.nominalizationsPer100}`);
  assert.ok(nominal.nominalizationsPer100 > llano.nominalizationsPer100);
});

test('medida: Fernández-Huerta premia la frase corta y la palabra corta', () => {
  const simple = measureText('El gato duerme. La casa es grande. El sol sale.');
  const denso = measureText(
    'La implementación sistemática de la configuración transaccional requiere la verificación documental de la infraestructura.',
  );
  assert.ok(simple.fernandezHuerta > denso.fernandezHuerta, `${simple.fernandezHuerta} > ${denso.fernandezHuerta}`);
});

test('medida principal: el término se explica o no se explica', () => {
  // El fallo que reportó el alumno: se usa el término y no se dice qué es.
  const fallo = splitSentences('La sesión ejecuta código secuencial en el buffer de la memoria.\nDespués confirma los cambios.');
  assert.equal(explainedAtFirstUse('buffer', fallo), false);

  const bien = splitSentences('El buffer es una zona de memoria temporal donde viven los cambios.\nDespués el motor los escribe en disco.');
  assert.equal(explainedAtFirstUse('buffer', bien), true);

  // La etiqueta sola y la definición en la frase siguiente también cuentan.
  const etiqueta = splitSentences('**Agente**\nEs quien toma decisiones.');
  assert.equal(explainedAtFirstUse('Agente', etiqueta), true);

  // «A eso lo llamamos retorno» define con el verbo delante.
  const llamada = splitSentences('La suma de recompensas futuras se llama retorno.\nA eso lo llamamos retorno.');
  assert.equal(explainedAtFirstUse('retorno', llamada), true);
});

test('mecanismo: el término se ata al ejemplo concreto', () => {
  const atado = splitSentences('En nuestro ejemplo:\nagente = robot aspirador.\nPodría ser también un personaje.');
  assert.equal(boundToExample('agente', atado), true);

  const suelto = splitSentences('El agente decide qué hacer en cada paso.\nTambién recibe una recompensa.');
  assert.equal(boundToExample('agente', suelto), false);
});

test('léxico: la raíz decide si una palabra es jerga', () => {
  assert.equal(stem('transacciones'), stem('transacción'));
  assert.equal(isCommonWord('casa'), true);
  assert.equal(isCommonWord('savepoint'), false);
});

test('measureText: la ruta al abrir y la cuenta paso a paso se detectan', () => {
  const conRuta = measureText(`Vamos a construirlo en este orden:

1. **Agente:** qué ocurre en cada paso.
2. **Entorno:** con quién interactúa.
3. **Recompensa:** qué señal recibe.

\`\`\`text
10 + (-1) + 10 = 19
retorno = 19
\`\`\``);
  assert.equal(conRuta.route, 1);
  assert.ok(conRuta.stepsPer1000 > 0);
  assert.ok(conRuta.longestStepRun >= 2);

  const sinRuta = measureText('El motor intercepta las tuplas huérfanas.');
  assert.equal(sinRuta.route, 0);
  assert.equal(sinRuta.stepsPer1000, 0);
});

// Una línea de fuente o de atribución nombra de dónde sale el texto; no es prosa de la explicación.
test('extractProse: una línea de fuente no es prosa, pero una frase que empieza por «Fuente» sí', () => {
  const text = [
    'Imagina un robot aspirador en la sala.',
    '**Fuente**: Feuerstein y Pribyl (2014) y documentación oficial de Oracle PL/SQL.',
    'Fuente: RFC 9293, sección 3.4.',
    '### **Fuente**',
    'Fuente de datos es la tabla que consultas.',
  ].join('\n\n');
  const { prose } = extractProse(text);
  assert.doesNotMatch(prose, /Feuerstein|RFC 9293|Oracle/, 'la línea de fuente no entra en la prosa');
  assert.doesNotMatch(prose, /^\*\*Fuente\*\*$/m, 'un encabezado de fuente tampoco');
  assert.match(prose, /Fuente de datos es la tabla que consultas\./, 'una frase que empieza por «Fuente» sigue siendo prosa');
  assert.equal(measureText(text).sentences, 2, 'la fuente no cuenta como frase');
});
