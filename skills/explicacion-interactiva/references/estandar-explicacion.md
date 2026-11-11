# Estándar de explicación

Sale de cuatro explicaciones que el usuario aprobó como impecables y que están completas en
`ejemplo-aprobado.md`. Cuando dudes de cómo debe sonar una frase, esa es la fuente: no la
parafrasees, imítala.

La unidad de trabajo es **una parte**: un texto continuo que se lee de arriba abajo, con
escenas intercaladas y quizzes cortos. No es una colección de tarjetas, ni de pasos, ni de
secciones atómicas.

## 0. Tamaño de una parte

Una parte es una idea que se puede sostener en la cabeza mientras se contesta el quiz y se
explica con palabras propias. Si no cabe ahí, no es una parte: son dos.

Presupuesto, medido, no estimado:

| Qué | Tope |
|---|---|
| Prosa de la parte (sin código, tablas ni bloques visuales) | **450 palabras** |
| Secciones de contenido además de `## Ruta` y del heading del mini-quiz | 2 |
| Líneas de `## Ruta` | 4 |
| Escenas | 1 |
| Recorridos (`lk-walkthrough`) | 1 |
| Preguntas del mini-quiz | 3 |

La forma también se mide, y caber no es cumplir: una parte de 411 palabras con dos secciones
puede seguir sin la escena, con muros de prosa y con fórmulas que nadie puede leer. El motor
rechaza eso también, con el arreglo escrito en el mensaje.

| Qué | Regla |
|---|---|
| Escena dibujada | Al menos un `<lk-scene` cuyo payload dibuje algo (cajas, flechas, nodos, barras). El `<lk-walkthrough>` **no** la sustituye |
| Ritmo de los párrafos | Dos frases por párrafo como máximo; una viñeta es su propia unidad |
| Fórmula | Se dibuja como **fórmula anotada**: un callout numerado por símbolo, con su flecha y su nombre en la línea de `labels` («① μ: el centro»). `<lk-math>` queda para una cuenta, nunca para explicar una fórmula |

Los mensajes, literales, para reconocerlos y corregir sin adivinar:

```text
0 drawn <lk-scene> scene(s) (the part needs 1) — dibuja el ejemplo con <lk-scene>: a JSON
payload with boxes, arrows, nodes, bars or formulas the reader draws; a <lk-walkthrough> does
not substitute for it, and the scene vocabulary is in
skills/explicacion-interactiva/references/visuales.md
6 paragraph(s) with more than 2 sentences — the first opens «…»; split it: one idea per
sentence and one beat per paragraph
formula symbol(s) sigma, f never named — draw the formula as an annotated formula scene: one
numbered callout per symbol, each named in its labels line («① sigma: …»)
```

Se corrige la parte, no el mensaje: la escena se dibuja con el vocabulario de `visuales.md`
(nunca se declara una escena vacía para pasar el gate), el párrafo se parte en frases de una
idea, y la fórmula se anota símbolo por símbolo con su callout y su nombre (§8 de
`visuales.md`). La cuenta de párrafos es la misma que la de `node tools/explain-check.mjs`
(`parrafos`), y un test cruza las dos; la leyenda es la misma en el motor y en la herramienta,
y otro test cruza las dos.

Se cuenta antes de entregar:

```bash
sed '/^```/,/^```/d; /<lk-scene>/,/<\/lk-scene>/d; /<lk-walkthrough>/,/<\/lk-walkthrough>/d' "Parte N.md" | wc -w
node tools/explain-check.mjs "Parte N.md"   # el estándar entero: tamaño, forma, leyenda
```

Esa cuenta es la estimación rápida en el baúl. La medida exacta es la del motor
(`explanation-standard`, `thresholds.partStandard` en `rules/deep.json`): prosa sin bloques de
código, sin filas de tabla, sin títulos, sin etiquetas HTML sueltas y sin los bloques
`lk-scene`/`lk-walkthrough`. El motor rechaza la parte con el número medido, el tope y la
corrección («split the part in two»), así que no hay que adivinar: se entrega y, si el motor la
rechaza, se parte. El heading del mini-quiz no cuenta como sección de contenido: es el quiz que
este mismo estándar pide.

Si pasa de 450, **la parte se divide**; nunca se comprime. Dividir es barato: el motor ya
gobierna partes y mini-quizzes. Meter tres ideas en una parte para «no hacer más partes» es el
error que deja a la persona sin recordar lo que acaba de leer cuando llega al quiz.

Preferir cinco partes de una idea antes que una de cinco ideas. El tema avanza más lento por
parte y mucho más rápido de verdad: cada parte se aprueba y se recuerda.

**La prueba de memoria.** Al terminar de leer, la persona debe poder contestar el mini-quiz y
escribir el vuelco **sin releer**. Si necesita volver atrás, la parte era larga: se parte y se
vuelve a escribir. Nunca se le pide más esfuerzo a quien lee para compensar una parte mal medida.

**Qué se recorta antes de dividir**, en este orden: anécdotas, segundo ejemplo, caso límite y
repetición de lo ya dicho. **Qué nunca se recorta**: el ejemplo conductor, la definición de una
frase y el mini-quiz.

## 1. Arquitectura de una parte

1. **`## Ruta` primero.** Tres o cuatro líneas numeradas (§0), cada una con un concepto y una
   promesa de qué se va a entender. Una línea por punto, sin sub-bullets. Abre con
   «Vamos a construirlo en este orden:».
2. **Secciones de contenido.** Una idea por sección, en prosa. Los títulos numerados siguen
   la jerarquía del tema (`1.1`, `1.1.1`, …) y son frases, no etiquetas: «¿Por qué existe el
   aprendizaje por refuerzo?» antes que «Introducción».
3. **Cierre: ninguno propio.** La parte termina en su última sección de contenido. No hay
   «Resumen para guardar», ni «Apuntes comprimidos», ni «Profundiza en los conceptos clave»,
   ni oferta de continuar. La `Ruta` ya dio el mapa y el último quiz ya cerró.

## 2. Cómo se construye un concepto

Estos movimientos aparecen una y otra vez en el ejemplo. No son un formulario: son el orden
en que un lector entiende. En una parte entran tres o cuatro, no los diez: se eligen los que
sostienen esta idea y el resto espera a otra parte, porque el presupuesto de §0 manda.

1. **Caja negra primero, definición después.** Se dibuja la situación con sus actores y sus
   flechas, y recién entonces se dice qué es cada cosa («Abramos esa caja»). Nunca al revés.
2. **Un ejemplo conductor que muta.** Un solo caso terrenal vuelve veinte veces cambiando un
   dato: batería al 70 %, al 4 %, cargando, con la casa limpia. El ejemplo no se reemplaza por
   otro más cómodo cuando se complica.
2b. **Ficha de pieza.** Al abrir la caja negra, cada pieza entra con un molde de tres golpes y
   nada más: plantilla, reglas y lo que sustituye en §2b. Esta forma manda sobre cualquier otra
   manera de presentar una pieza.
3. **Cada pieza, con su pregunta cotidiana.** «Estado: ¿cómo estoy ahora? Acción: ¿qué hago?
   Recompensa: ¿qué acaba de pasar?». La pregunta antes del término técnico.
4. **Pasos discretos.** `T0`, `T1`, `T2`, con lo que cambió marcado (`◄── NUEVO`,
   `◄── BLOQUEO`). Un cambio por paso.
5. **Doble representación.** Primero la intuición en palabras, después una tabla de casos,
   después el formalismo. El formalismo nunca abre el concepto.
6. **La fórmula, al final y como compresión.** Se llega a ella habiendo calculado el caso a
   mano; se la presenta como «la fórmula no dice nada nuevo, solo lo comprime».
7. **Contraste espacial.** `ANTES / DESPUÉS`, `Estado A / Estado B`, `DP / MC / TD`. Dos
   columnas que se miran, no dos párrafos que se suceden.
8. **Errores típicos como desigualdad.** «Recompensa y valor no son lo mismo». Encabezado con
   la creencia errónea entre comillas y el número de orden (`### 3.`), y abajo la corrección.
9. **Límites y verdades completas.** Dónde se rompe la simplificación que se acaba de usar
   (`POMDP`, `average reward`, «dónde se rompe la analogía»). Se declara, no se esconde.
10. **Imagen completa.** La única escena que reúne todo lo anterior. Va al final de la parte,
    no al principio.

## 2b. La ficha de pieza

Al abrir la caja negra, cada pieza entra con este molde y con ningún otro. Tres golpes, y la
pieza siguiente. El tope no se cuenta en líneas físicas —la lista de alternativas ocupa cinco—
sino en golpes: la ficha no lleva segunda definición, ni párrafo que explique la lista, ni
condiciones adicionales.

```markdown
### **Pieza**

Es quien **toma decisiones**.

En nuestro ejemplo:

> pieza = robot aspirador.

Podría ser también:

- un personaje de videojuego;
- un sistema de recomendaciones;
- un algoritmo de trading;
- un controlador de tráfico;
- un modelo que aprende a resolver problemas.
```

Reglas de cada golpe:

1. **La definición ocupa una frase.** Qué es, sin condicionales, sin «es aquello que», sin
   historia y sin listas dentro de la definición. Si necesita dos comas explicativas, no es una
   definición: es un párrafo disfrazado.
2. **La equivalencia baja al ejemplo conductor.** `pieza = …` con el valor concreto que el
   ejemplo ya usa (el robot, la batería al 70 %). Nunca un caso nuevo y nunca un «podríamos
   imaginar».
3. **Las alternativas son 4 o 5 casos nombrados, de dominios distintos entre sí.** Videojuego,
   recomendaciones, trading, tráfico: cinco campos que no se parecen prueban que el concepto no
   pertenece al robot. Prohibidas las categorías abstractas («sistemas inteligentes», «cualquier
   entidad») y prohibido repetir dos casos del mismo dominio. Si la pieza es **un paso de un
   proceso** y no un rol, las alternativas son ese mismo paso en sistemas que la persona ya
   conoce (un código de barras, una factura, una receta), nunca metáforas ni oficios.

Lo que la ficha sustituye, y por eso existe:

- **El párrafo de generalización.** «El concepto es más amplio: en general, un agente es
  cualquier entidad que percibe y actúa…». Esa frase la dice mejor la lista, sin abstracción.
- **La definición enciclopédica de tres líneas con dos excepciones.** Esas excepciones van a la
  sección de límites (movimiento 9 de «Cómo se construye un concepto»), no a la ficha.

Una línea extra se permite solo cuando hay una confusión real que desactivar en ese mismo
punto: «El agente controla sus acciones, pero **no controla directamente las consecuencias**».
Una, y con negrita en lo que se niega.

La pregunta cotidiana del movimiento 3 entra dentro de la ficha como línea opcional; nunca
sustituye la definición de una frase ni la lista de alternativas.

Esto no se solapa con la «regla de cero términos huérfanos» (`metodo-explicame.md`): aquella
explica **palabras** técnicas sueltas (qué es, ejemplo con números, por qué importa), y la ficha
presenta las **piezas del modelo** que se está explicando, con su eje de variación.

Cuando la explicación presenta **varias piezas del mismo modelo**, conviene que cada lista de
alternativas recorra los mismos dominios en el mismo orden: juego, recomendaciones, trading,
tráfico, aprendizaje. Así el lector ve un mismo sistema descompuesto cinco veces, y no cinco
listas que no se relacionan entre sí. `ejemplo-aprobado.md` «Las cinco piezas fundamentales» ya
lo hace así. No es obligatorio: es la versión que más enseña cuando las piezas son pocas.

Origen de esta regla: el molde ya existía en `ejemplo-aprobado.md` «Las cinco piezas
fundamentales», pero no estaba escrito como regla y el §7 prohibía su lista. El resultado era
predecible: la definición se escribía como prosa de tres a seis líneas. Si vuelve a aparecer
prosa donde iba una ficha, la corrección se hace aquí, no en la nota.

## 3. Ritmo

- Frases cortas. Una idea por frase. **Ninguna frase pasa de 18 palabras**: si las pasa, son
  dos frases. La media de la parte debe quedar por debajo de 12.
- **Un párrafo, como mucho dos frases.** Tres frases seguidas ya son un muro: se separan en
  líneas, una idea por línea. El ritmo que se lee es el de una lista de ideas cortas, no el de
  un ensayo. `explain-check` lo cuenta (`frases`, `parrafos`) y falla si no se cumple.
- Frases cortas. Una idea por frase. Cuando una frase necesita dos comas explicativas, son
  dos frases.
- Párrafos de tres a seis líneas. Nunca un muro.
- Preguntas retóricas como bisagra, no como relleno: «¿Vale igual +10 ahora que +10 dentro de
  5.000 pasos?», «¿Qué debe hacer?», «¿De dónde sale ese 10?».
- Frases de transición que el ejemplo usa y conviene reusar: «Esto parece raro hasta que
  ponemos números», «Observa lo ocurrido», «Aquí está una confusión frecuente», «La forma
  mental más útil es».
- Negritas para el término que se está definiendo y para el número que importa. Nada más.
- Segunda persona para lo que el lector hace; impersonal para el mecanismo.

## 4. Aritmética

Un cálculo se muestra solo cuando **el cálculo es la idea**, y siempre dentro del presupuesto de la parte (§0). Cuando se muestra, no se enuncia: se ejecuta línea por línea, y cada línea es una línea propia. Si el cálculo es un detalle al servicio de otra idea, no entra: se enuncia el resultado y se gasta la prosa en lo que la persona tiene que entender.

```
G = 1 + 0.9 + 0.9² + 0.9³ + ⋯
0.9G = 0.9 + 0.9² + 0.9³ + ⋯
G − 0.9G = 1
0.1G = 1
G = 10
```

Nunca «sustituyendo se obtiene 10». Si el resultado sorprende («Tiene sentido: 2 + 1.8 +
1.62 + … = 20»), se muestra el porqué con los primeros términos.

Los números de un ejemplo se quedan pegados al ejemplo: si el robot tenía batería al 4 %,
la conclusión habla de esa batería, no de «el agente».

## 5. Visuales

La geometría no se escribe en el texto. Ni `──►`, ni cajas `┌─┐`, ni barras de `████`, ni
diagramas en `plain text`. Esas ideas se dibujan con los componentes del kit, siguiendo
`references/visuales.md`: escena para lo que se mira, `lk-walkthrough` para lo que se recorre
paso a paso, `lk-math` para lo que se calcula, tabla para lo que se compara celda a celda.

Un bloque de código solo se usa para lo que de verdad es código.

**No es una recomendación: se cuenta.** Antes de dar una nota por terminada, este barrido tiene
que dar **cero líneas**:

```bash
grep -nE '[┌┐└┘├┤┬┴┼│╔╗╚╝║█▓▒░]|─+[►▶▸]' nota.md
```

El patrón persigue cuatro cosas: esquinas de caja, verticales, bloques de barra y la carrera
horizontal que termina en punta hacia la derecha. Cada línea que aparezca es una escena que
falta. No se justifica con «se lee igual»: una caja dibujada con caracteres se desarma en móvil,
en el panel lateral de Obsidian y en la página HTML.

Quedan fuera del barrido, a propósito y por construcción: `◄── NUEVO` y `◄── BLOQUEO` (la
carrera horizontal va **después** de la punta, no antes, y el patrón solo caza la que termina en
punta), `-->` de Mermaid, la tabla Markdown `| a | b |` y las flechas `→` dentro de una frase.
Lo que se persigue es la caja y la barra dibujadas con caracteres, no el símbolo suelto.

**Cómo se migra, en tres pasos.** (1) Se identifica la familia en `visuales.md` §6: dos actores,
cadena, caja negra, contraste, reparto, balanza o mapa de decisión. (2) Se declara la escena con
`<lk-scene>` en `viewBox` de 760. (3) Si lo que había era una secuencia de estados, cada paso
pasa a `lk-walkthrough` y la tabla suelta se convierte en tabla Markdown. Caso canónico
resuelto: «El semáforo, migrado», en `visuales.md` §6b. Si una notación ya es la idea
(`S = {VERDE, AMARILLO, ROJO}`), se queda como texto: no hay nada que dibujar.

**Un recorrido solo si cada paso cambia algo visible.** `<lk-walkthrough>` sirve cuando el lector
ve *ocurrir* la diferencia: la caja que se mueve, el número que sube, la flecha que cambia de
sitio. Un paso que solo cambia una etiqueta —una caja suelta en un lienzo ancho, repetida tres
veces— no es un recorrido: es una escena estática con prosa numerada `T0`, `T1`, `T2`. Regla
práctica: si al pasar de paso no se puede señalar **qué cambió en el dibujo**, no va como
recorrido.

**Una flecha sale y llega a algo.** Sus dos extremos tocan una caja, un icono, un texto o un
trazo; una punta en el vacío se lee como un error de dibujo. `scene-lint` lo mide
(`flecha-al-aire`) y falla si un extremo queda suelto.

**El texto no pisa una caja.** Un rótulo que cruza el borde de una caja queda tapado por ella
y se lee como texto perdido. El gate del kit mide texto sobre texto, pero **no** mide esto: se
revisa en la captura. Si un rótulo cruza un borde, se acorta, se separa o se baja al pie; nunca
se deja que la caja lo tape.

**El número se ancla midiendo, nunca a ojo.** Un callout señala un símbolo o un objeto concreto:
su posición se mide en el render antes de colocarlo. Si dos símbolos quedan a menos de 60 unidades,
los números **alternan altura** en dos filas; si no, se pisan y la numeración deja de corresponder
con la leyenda. Una leyenda de dos o más entradas va **apilada, una por línea**: dos etiquetas al
mismo nivel se leen como una palabra inventada («el valor» + «el estado» = «Valsel Estado»).

**La flecha termina en el borde, nunca dentro de la caja.** Un extremo metido en la caja entierra
la punta y, si esa caja tiene rótulo, el trazo lo atraviesa. Destino correcto: el borde de la
caja destino, con unos pocos unidades de aire. Los dos defectos se detectan sin mirar: se
muestrea el trazo de cada flecha contra las cajas y contra los textos de la escena, y tiene que
dar cero.

**Claro y oscuro: se mira, no se supone.** Toda escena se revisa en los dos temas antes de
entregarla. La convención del kit es que la figura vive sobre papel claro, igual que ya hacen
`lk-walkthrough` y `pre.mermaid`: si en tema oscuro una caja, un rótulo o una etiqueta de flecha
pierde contraste, la escena se envuelve en papel claro y se fuerza la paleta clara dentro de la
figura. Una escena que solo se lee en un tema es un defecto de entrega, no una preferencia.

**Alcance del barrido.** Aplica a toda nota que se entrega (Obsidian, página, rápida), no a los
archivos de `references/`, que son especificación. Ojo con `ejemplo-aprobado.md`: se imita por
el **tono y el ritmo**, nunca por su geometría — sus bloques de caja son anteriores a esta
regla y están pendientes de migración.

## 6. Quiz

Uno corto cada dos o tres secciones, y siempre sobre lo que se acaba de explicar. La pregunta
obliga a decidir algo, no a recordar una etiqueta: «¿Qué acción parece mejor mirando solo la
recompensa inmediata, y cuál mirando el retorno?». Tres o cuatro opciones, una sola correcta,
y la explicación de por qué las otras no.

El quiz se responde en la página. Es parte de la explicación, no un examen final.

## 7. Prohibido

- Abrir con un índice o un «en este documento veremos».
- «En resumen», «como hemos visto», «en conclusión», «cabe destacar», «es importante
  mencionar».
- Cerrar con resumen, con gancho de continuación o con una oferta de profundizar.
- Adjetivos de valor sin medida: «potente», «robusto», «muy eficiente».
- Listas de viñetas donde el ejemplo pide prosa. Una lista de tres elementos sueltos es una
  frase con comas. **Excepción declarada, única**: la lista `Podría ser también:` de la ficha de
  pieza (§2b), porque su propósito es mostrar el eje de variación —cinco dominios que no se
  parecen— y no encadenar ideas.
- Explicar el mecanismo de la plataforma dentro de la explicación.
- Duplicar el mismo concepto en dos secciones por si acaso.

## 8. Chequeo antes de entregar

1. ¿La parte abre con `## Ruta` y termina en contenido, sin resumen ni gancho?
2. ¿Hay un solo ejemplo conductor, y muta al menos cinco veces?
3. ¿Cada fórmula llegó después del caso del ejemplo que la motiva, con sus símbolos nombrados?
4. ¿La escena y el recorrido muestran el ejemplo mismo, con una flecha que dice dónde mirar?
5. ¿Alguna idea importante vive solo dentro de un bloque de código o de un `plain text`?
   Si sí, es una escena que falta.
6. ¿Se lee en voz alta sin trabarse? ¿Alguna frase tiene más de dos comas?
0. ¿Pasan **las cuatro puertas** de «Parámetros mínimos de calidad» del `SKILL.md` (gate, lint,
   part-lint y barrido de ASCII)? Sin las cuatro en verde, la parte no se entrega; el resultado se
   cita en el mensaje, no se supone.
7. ¿Cada pieza tiene su ficha de tres golpes (§2b), sin segunda definición, sin párrafo que
   explique la lista y sin explicación de las alternativas?
8. ¿Quedó algún párrafo que explique que el concepto «es más general»? Se borra: esa frase la
   ocupaba la lista de alternativas.
11. ¿La prosa de la parte queda en 450 palabras o menos (§0)? Si no, ¿se dividió en dos partes
    en lugar de comprimirse?
12. ¿Se puede contestar el quiz y escribir el vuelco **sin releer** la parte?
9. ¿El barrido de §5 (cajas y barras dibujadas con caracteres) da cero líneas?
10. ¿Alguna frase afirma que «lo mismo puede dar resultados distintos» sin mostrar el segundo
    caso? Se muestra el segundo caso o se borra la frase.
