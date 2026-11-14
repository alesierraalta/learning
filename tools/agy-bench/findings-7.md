# Séptima corrida del banco del tutor (issue #246)

Corrida del 2026-11-14, 06:01:25–06:32:57 UTC (31,5 min), sobre el VPS con el repo desplegado en
**`4cfcb24`** (`main`; PR #293 —la tabla «Reparaciones frecuentes» de la skill, `SKILL.md` 1.47 → 1.48,
+13/−1, y dos líneas en `deploy/vps/learnings/AGENTS.md`—). **Es una línea base nueva**: el cambio no es
de motor sino de la skill que el tutor lee, así que las notas de R7 no se comparan palabra por palabra con
R1–R6; las puertas, la forma de las figuras y el registro sí se siguen midiendo con las mismas
herramientas y en las mismas condiciones de banco.

El `HEAD` se muestreó cada 30 s (73 muestras, de 06:01:23 a 06:37:24 UTC): las 73 dan `4cfcb24`. El `HEAD`
de cada tema al inicio y al final, y el de la corrida, son
`4cfcb242fcf677103beadfa47a652e7edb838104`. No hubo `HEAD-MOVED`: el vigilante no disparó ninguna parada.

## Antes de esta corrida: cuota agotada y un despliegue

Se anota entero porque explica por qué la corrida empieza a las 06:01 y no antes:

- **Intento 1, 05:10:41–05:13:23 UTC, sobre `0c6d16a`.** Los cinco temas se atascaron en el turno
  «aprender» con «Antigravity terminó con estado ERROR» y «el tutor no creó la carpeta del tema`. No era la
  nota: una llamada directa al `agy` desplegado (05:15:14 UTC) devolvió
  `RESOURCE_EXHAUSTED (code 429): Individual quota reached … Resets in 45m5s`, es decir, reinicio de la
  cuota hacia las 06:00:19 UTC. Los artefactos de ese intento quedan en `/tmp/bench7-246/attempt1/`.
- **El `HEAD` se movió solo a las 05:31:37–41 UTC**, con la corrida parada esperando la cuota:
  `0c6d16a` → `4cfcb24`, y el despliegue reinició el estudio (PID 1436005 → 1455126; no envié ninguna
  señal ni comando de control). El vigilante lo anotó y ahí paré para preguntar.
- **Corrida de verdad, 06:01:25**, sobre `4cfcb24`, después de que una llamada de prueba al `agy`
  (06:01:02) devolviera `SUCCESS`. `bench.mjs` es el del repo desplegado (sha256 `60c1c44e…`), copiado
  otra vez desde `~/learning` antes de arrancar.

Raíz de prueba `/tmp/bench7-246/scratch` (propia), salida `/tmp/bench7-246/out`, puertos 4799–4803,
estado y caché XDG propios por tema, token derivado del tema. Runtime, modelo, reglas y skill:
`agy` · `gemini-3.8-flash-high`, `rules/deep.json`, `explicacion-interactiva` 1.48. Los cinco temas
corrieron **a la vez** (`--concurrency 5`), como en R4–R6. Node del VPS: v24.14.1; capturas, puertas y
mediciones locales, con Node v26.12.1.

**La caché de Chromium (N-C de R6) se sembró a mano.** Antes de arrancar dejé, en cada tema,
`scratch/<tema>/xdg-cache/ms-playwright` como enlace a `~/.cache/ms-playwright` (los cinco, no tres de
cinco como salió en R6). Es preparación del scratch, no un cambio del banco, y hace que la fila de puertas
medida en el VPS sea la buena: en R7 coincide con la re-puntuación local.

Procedimiento: modo Universitario; diagnóstico respondido en el puente con la letra que sirve la página
para la clave del quiz (alumno competente), salvo Bayes, que responde «No sé» (E) en las tres preguntas;
método por `api/metodo` cuando el motor lo pide (el banco alterna `pareto` y `preferencias`); Parte 1
pedida con el texto del botón del estudio, en el turno del método.

Vault real (`~/Learnings`): `git status --porcelain` antes y después, idéntico (54 169 bytes, sha256
`1e0f4c38…`, el mismo de R5 y R6). Producción: el estudio es el proceso node `1455126`
(`studio/server.ts`), iniciado por el despliegue de las 05:31:37 y **sin reiniciarse durante la corrida**;
4747 y 4748 escuchando todo el tiempo. No se envió ninguna señal ni comando de control a
`learning-studio` ni a `learning-autodeploy`.

## Los dos hallazgos con los que Git cerró R6

R6 terminó con dos hallazgos en «Git branching»: `escenario-de-cajas` sobre la escena quieta «Cadena de
commits en checkout-service» y `marca-eco` sobre el paso 3, que marcaba «c4» repitiendo la etiqueta
«commit c4» del mismo paso. En R7:

| Hallazgo de R6 | ¿Vuelve en R7? | Por qué |
| --- | --- | --- |
| `escenario-de-cajas` · «Cadena de commits en checkout-service» | **no** | La nota de R7 no tiene ninguna `<lk-scene>`, ni una escena con ese título: la pieza es `<lk-tables>` (puntero `refs/heads` → objeto commit, con su `join`) y el recorrido es un `<lk-story>` de 3 pasos. `explain-check` da `ok escenario-de-cajas`. |
| `marca-eco` · paso 3 «c4» | **no** | La nota de R7 no tiene ni una `marks` (0/0/0 en los tres pasos) y no aparece «c4» ni una vez. `explain-check` da `ok marca-eco`. |

**Y no los arregló una corrección: no hubo ninguna.** Git cerró el turno del método con **0 correcciones**
(0 `engine-correction` y 0 `part-correction`), **15 de 15 marcos de puerta en `passing: true`** en los cinco
temas, y **una sola llamada al modelo** en su informe de tiempos. El tutor escribió la forma buena de
primera —la que la tabla nueva de la skill pide literalmente: el `lk-story` con cada commit como actor
`file` y sus `moves`, la marca que nombra el resultado del paso— sin que el estudio le devolviera nada.
Dentro de esa única llamada corrió las herramientas él mismo (161 `run_command` de 220 herramientas en
Git), como en R5, pero esta vez no hizo falta reescribir.

Dos cautivas para no sobreleer el resultado:

- **La ausencia no prueba que la regla se enseñara.** La nota de R7 cambió el tema de sitio (DAG, tablas de
  referencias) y el defecto de R6 no tenía dónde aparecer. Lo que sí se puede afirmar es que el par
  «antes/después» que #293 copia en la skill es exactamente la forma de R6, y que la nota de R7 usa la
  columna de la derecha.
- **El pie suelto sigue en Git**: su recorrido escribe «Cómo leerlo: …» como nodo de texto, no como
  párrafo (tabla 4). Git pasa con eso porque la franja se comparte y queda a 41 px.

## Tabla 1: puertas, correcciones, lector y tiempo

| | R1 (`1d9046f`) | R2 (`53700d1`) | R3 (`ffa08a8`) | R4 (`2fcd035`) | R5 (`0c3795a`) | R6 (`bdfb193`) | R7 (`4cfcb24`) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Puertas, medidas en su corrida | 4/4 en los 5 | 4/4 en 4 (CSS no medido) | 4/4 en los 5 | 4/4 en los 5 | 4/4 en los 5 | 3/5 (Rust y Git, por la caché del navegador) | **5/5** |
| Puertas, con las herramientas de `4cfcb24` | 0/5 | 0/4 | 0/5 | 2/5 | 0/5 | 4/5 | **5/5** |
| Correcciones (informes de tiempo) | 0 (no había informes) | 0 (no había informes) | 0 en los 5 | 1 en CSS (`part-correction`) | 3 (`part-correction` en Git, TCP y Rust) | 2 `engine-correction` en Rust, Git y Bayes | **0 en los 5** (0 de motor, 0 de parte) |
| Fallos de puerta en el log | — | — | 0 | 0 | 0 | 3 en Rust, Git y Bayes | **0** (15 marcos, todos `passing: true`) |
| Lo que sirvió el lector | la nota (0 de 5 con página) | la nota (0 de 4 con página) | el `.html` en 5 de 5 | la nota en 5 de 5 | la nota en 5 de 5 | la nota en 5 de 5 | **la nota en 5 de 5** (0 páginas de parte; 2 demos `.html`) |
| Turnos por tema | 2–3 | 3 | 3 | 3 | 3 | 3 en los 5 | **3 en los 5** |
| Minutos: Rust · TCP · Bayes · Git · CSS | 26 · 12 · 8 · 7 · 6 | — | 27 · 9 · 5 · 6 · 7 (en serie) | 23,0 · 33,1 · 21,2 · 40,5 · 34,5 | 34,0 · 26,8 · 20,3 · 15,8 · 20,6 | 16,1 · 15,3 · 16,9 · 16,6 · 15,0 | **31,5 · 15,9 · 19,7 · 31,5 · 20,0** |

Notas de la tabla:

- **La fila «con las herramientas de `4cfcb24`» se midió de nuevo sobre las copias de R1–R6**
  (`/tmp/bench*-shots/vault`), no es la fila publicada en `findings-4.md`, `findings-5.md` ni
  `findings-6.md`. Los ficheros de herramienta son los mismos que en `0c6d16a` (`4cfcb24` solo toca dos
  documentos), pero R5 baja de 1/5 a 0/5 respecto de lo publicado en R6: con las reglas de hoy Bayes
  también falla `scene-lint` y `explain-check`. R4 sigue en 2/5 (CSS y Rust).
- **R7 es la primera corrida con 0 correcciones y 0 marcos fallidos.** Los cinco turnos de método terminan
  con el motor en `waiting/quiz` y la parte aceptada al primer marco: 15 marcos de puerta, los 15 en
  `passing: true`. Lo que en R6 bloqueaba a Rust, Git y Bayes (`explanation … without a single arrow`,
  `internal/engine/decks.go` leyendo `steps[].scene` y no `steps[].stage.scene`, N-A de R6) ya está
  desplegado: #291 entró en `0c6d16a` y esta corrida lo ejercita.
- **El tutor corre las puertas por su cuenta, dentro de una sola llamada.** Una llamada al modelo por
  generación (`timings: reports 1, modelCalls 1, turns 1`) y, dentro de ella, 85–235 herramientas, de las
  cuales 38–161 son `run_command`. No gasta presupuesto de corrección, pero gasta reloj: el turno de método
  llegó a 1 397 s (Rust) y 1 364 s (Git), y la corrida entera dura 31,5 min, casi el doble de los 16–17 min
  de R6. Es el intercambio de la tabla: menos correcciones, más tiempo de un turno.
- **Turnos.** Tres en todos (aprender, diagnóstico, método); la Parte 1 se escribe en el turno del método.
  Duraciones: Rust 392/85/1 397 s · TCP 345/89/503 s · Bayes 391/57/714 s · Git 440/69/1 364 s ·
  CSS 398/53/735 s.
- **Lector.** Las cinco copias sirven la nota: 0 archivos `Parte 1….html` y solo dos demos sueltas
  (`rust-borrowing/explicaciones/demos/p1-prestamo.html`, `git-branching/…/demos/p1-ramas.html`). Cero
  errores de consola y de página en las cinco, en negro y en modo ancho.
- **Mini-quiz.** Los cinco sirven el cuestionario interactivo de `mini-quiz/p1.json` (3 preguntas, 3
  `fieldset`, 24 `radio` por página). Git, que en R6 no tenía el archivo, lo trae otra vez: la regresión
  N-E está cerrada en este camino.

## Tabla 2: método, piezas, personajes, píldoras y cuestionario

Piezas contadas en el DOM del navegador, en negro × ancho; personajes leídos de los
`<script type="application/json">` que la página conserva.

| Tema | Método (origen) | Piezas en el DOM | Personajes | Píldoras de la baraja | Cuestionario |
| --- | --- | --- | --- | --- | --- |
| Rust borrowing | `pareto` (banco) | lk-story 1, lk-cards 1 | doc, r1, r2 | COMPILA «Muchas &» · COMPILA «Una sola &» · NO COMPILA «& y &mut» | 3 preguntas (24 radios) |
| TCP handshake | `preferencias` (banco) | lk-story 1, lk-cards 1 | Cliente, Servidor | CORRECTO «Flag SYN» · CORRECTO «Campo seq» · RECHAZADO «Datos en SYN» | 3 preguntas (24 radios) |
| Bayes' theorem | `pareto` (banco) | lk-tree 1, lk-story 1 | 9 enfermos, 99 sanos, 108 positivos | — (sin baraja) | 3 preguntas (24 radios) |
| Git branching | `preferencias` (banco) | lk-tables 1, lk-story 1 | Commit c1, Commit c2, Commit c3 | — (sin baraja) | 3 preguntas (24 radios) |
| CSS flexbox | `pareto` (banco) | lk-story 1, lk-cards 1 | Contenedor, Ítem | CORRECTO «flex-direction: row» · CORRECTO «flex-direction: column» · RECHAZADO «Eje fijo inmutable» | 3 preguntas (24 radios) |

El tutor no eligió el método en ninguno de los cinco: el banco respondió `pareto` en Rust, Bayes y CSS, y
`preferencias` en TCP y Git, como estaba previsto, y el motor se detuvo en `method` en 5 de 5.

Baraja: **cambia el contenido y no la forma.** Las píldoras ya no son una palabra suelta: cada tarjeta
lleva su veredicto y su texto (CORRECTO «Flag SYN»), lo que las hace mucho más útiles; pero el trío de
veredictos se repite igual en 2 de 5 (TCP y CSS, como en R6) y la forma «dos aciertos y un contraejemplo»
sigue en 3 de 5 (Rust, TCP y CSS).

Forma de la figura principal, escena por paso, como `cajas·flechas·actores·piezas·movimientos`:

| Tema · figura | Paso 1 | Paso 2 | Paso 3 | Paso 4 |
| --- | --- | --- | --- | --- |
| Rust · lk-story | `0·0·2·1·0` | `0·0·2·1·1` | `0·0·3·0·0` | — |
| TCP · lk-story | `0·1·2·1·0` | `0·1·2·1·1` | `0·1·2·0·0` | — |
| Bayes · lk-story | `0·0·3·0·0` | `0·0·3·0·2` | `0·0·3·0·1` | `0·0·3·0·1` |
| Git · lk-story | `0·0·1·1·0` | `0·0·2·1·1` | `0·0·3·1·1` | — |
| CSS · lk-story | `0·1·2·1·0` | `0·0·2·1·1` | `0·1·2·0·0` | — |

Lectura: **TCP y CSS tienen la misma firma paso por paso**, las tres idénticas (`0·1·2·1·0`, `0·1·2·1·1`,
`0·1·2·0·0`). Rust coincide con ellas en los pasos 1 y 2 y difiere en el 3 (tres actores en vez de dos y
sin flecha). Bayes (4 pasos, 3 actores, sin flechas) y Git (1→2→3 actores, sin flechas) son las dos formas
distintas. Cero cajas en las cinco, como en R5 y R6.

## Tabla 3: movimientos declarados frente a trazos que el lector dibuja

Cada celda es `declarados en la nota / grupos data-move en el DOM / trazos con d`. Se leyeron los payloads
de la nota y el DOM real, paso por paso, en negro × ancho.

| Tema · figura | Paso 1 | Paso 2 | Paso 3 | Paso 4 |
| --- | --- | --- | --- | --- |
| Rust · lk-story | 0/0/0 | 1/1/1 | 0/0/0 | — |
| TCP · lk-story | 0/0/0 | 1/1/1 | 0/0/0 | — |
| Bayes · lk-story | 0/0/0 | 2/2/2 | 1/1/1 | 1/1/1 |
| Git · lk-story | 0/0/0 | 1/1/1 | 1/1/1 | — |
| CSS · lk-story | 0/0/0 | 1/1/1 | 0/0/0 | — |

**Total: 9 movimientos declarados, 9 grupos en el DOM, 9 trazos dibujados, 0 sin dibujar.** R5 declaraba 8
y dibujaba 4; R6 declaraba 8 y dibujaba 8. La forma del tutor `{actor,toX,toY}` de #286 aparece **una vez**
(Rust, paso 2, `doc → punto`) y se dibuja; TCP, Git, Bayes y CSS usan la canónica `{from,to,verb}` y también
se dibujan. **Rust vuelve a declarar un movimiento** (en R6 declaraba 0): el defecto N-B de R6 no se repite.

## Tabla 4: el pie «Cómo leerlo» y las píldoras

Medido en la página del lector, en modo ancho, con el mismo criterio de `scene-lint`: el pie tiene que
compartir la franja horizontal de su figura y quedar directamente debajo (tope 64 px). «Dentro» es un
`caption` declarado en el JSON de la pieza; «P» es un párrafo siguiente; «texto suelto» es un nodo de texto
siguiente, sin `<p>`.

| Tema · pieza | Pie «Cómo leerlo» | Franja compartida / debajo | Píldoras |
| --- | --- | --- | --- |
| Rust · lk-story | sin pie | — | — |
| Rust · lk-cards | P | 624 px / 30 px | COMPILA · COMPILA · NO COMPILA |
| TCP · lk-story | sin pie | — | — |
| TCP · lk-cards | P | 624 px / 30 px | CORRECTO · CORRECTO · RECHAZADO |
| Bayes · lk-tree | dentro (JSON) | — | — |
| Bayes · lk-story | sin pie | — | — |
| CSS · lk-story | sin pie | — | — |
| CSS · lk-cards | P | 624 px / 30 px | CORRECTO · CORRECTO · RECHAZADO |
| Git · lk-tables | dentro (JSON) | — | — |
| Git · lk-story | texto suelto | 147 px / 41 px | — |

Lectura: **los seis pies que existen se quedan con su figura** (ninguno `leyenda-descolgada`): 624 px de
franja y 30 px de separación en los tres de tarjetas, 41 px en el de Git. Mejora sobre R6: **los tres pies
de tarjetas ya son párrafos** (`<p>`), no nodos de texto sueltos como en R6 (N-D). Queda uno suelto, el del
recorrido de Git, y cuatro recorridos (`lk-story`) sin pie: el narrador de cada paso hace ese papel, pero
no es la línea `Cómo leerlo:` que pide la skill.

## Tabla 5: registro (`tools/register/measure.mjs`, sobre la nota)

Cada celda lleva R1 · R2 · R3 · R4 · R5 · R6 · **R7**. R1–R6 son las cifras de `findings-3.md`,
`findings-4.md`, `findings-5.md` y `findings-6.md`; el medidor no cambió.

| Tema | Palabras/frase | Términos explicados (uso) | Negritas/1000 | Contrastes/1000 | Palabras (R7) |
| --- | --- | --- | --- | --- | --- |
| Rust borrowing | 8,9 · 6,8 · 6,3 · 7,1 · 7,2 · 6,8 · **5,9** | 31% · 100% · 100% · 85% · 56% · 92% · **80%** | 5,8 · 37,9 · 33,6 · 24,9 · 14,7 · 25,8 · **18,2** | 0,00 · 15,2 · 13,4 · 14,9 · 14,7 · 15,5 · **18,2** | 110 |
| TCP handshake | 9,8 · 8,0 · 6,9 · 6,8 · 7,4 · 6,0 · **7,4** | 29% · 83% · 82% · 86% · 75% · 75% · **75%** | 5,3 · 37,6 · 29,6 · 29,1 · 23,8 · 24,2 · **23,8** | 5,3 · 16,1 · 17,8 · 14,5 · 19,0 · 30,3 · **19,0** | 210 |
| Bayes' theorem | 10,1 · 6,3 · 7,9 · 6,7 · 7,7 · 7,7 · **7,9** | 33% · 100% · 80% · 67% · 100% · 100% · **67%** | 5,2 · 37,0 · 23,8 · 24,5 · 24,8 · 24,8 · **21,6** | 0,00 · 22,2 · 11,9 · 12,3 · 19,8 · 19,8 · **10,8** | 185 |
| Git branching | 10,0 · 7,7 · 5,5 · 5,9 · 6,0 · 10,0 · **7,5** | 13% · 50% · 70% · 50% · 70% · 43% · **50%** | 5,2 · 30,5 · 30,8 · 26,5 · 25,2 · 11,4 · **24,1** | 0,00 · 18,3 · 15,4 · 26,5 · 12,6 · 11,4 · **20,1** | 249 |
| CSS flexbox | 10,3 · — · 6,6 · 7,8 · 7,6 · 6,7 · **6,7** | 44% · — · 67% · 100% · 63% · 86% · **50%** | 5,0 · — · 28,2 · 25,3 · 19,9 · 24,4 · **24,4** | 0,00 · — · 14,1 · 18,1 · 14,9 · 14,6 · **12,2** | 164 |

Palabras por parte: R1 173–199, R2 132–186, R3 130–169, R4 151–277, R5 159–210, R6 165–263, R7 110–249.
Las puertas pasan con las cinco notas, y las frases se acortan a 5,9–7,9 palabras (R6: 6,0–10,0). Git deja
de ser el extremo: 7,5 palabras por frase, 24,1 negritas y 20,1 contrastes, contra 10,0 / 11,4 / 11,4 de
R6. El extremo por abajo es Rust, con 110 palabras de prosa.

**Cuidado con Git en dos reglas:** `termino-sin-explicar` pasa justo en el mínimo (50 %, 13 términos sin
explicar de 21) y `frases-largas` pasa con media 7,5 y p90 10,0 (topes 8 y 13). Aprobado, sin margen.

## Tabla 6: claves de respuesta

| Tema | Diagnóstico, clave del tutor | Diagnóstico, letra servida | Mini-quiz, clave del tutor |
| --- | --- | --- | --- |
| Rust borrowing | BCA | ACC (3/3) | BAC |
| TCP handshake | BAC | ABC (3/3) | CBA |
| Bayes' theorem | EEE («No sé») | EEE (0/3) | BCA |
| Git branching | BAC | CDD (3/3) | BAC |
| CSS flexbox | BAC | DBB (3/3) | BAC |

Patrón: **8 de 9 claves empiezan por B** (la excepción es el mini-quiz de TCP, `CBA`) y solo hay tres
cadenas, contando diagnóstico y mini-quiz: BAC ×6, BCA ×2, CBA ×1 (Bayes responde «No sé», así que su
clave de diagnóstico no se cuenta). Las letras servidas sí cambian por alumno (ACC, ABC, EEE, CDD, DBB), que
es el barajado de #272/#276 funcionando; lo que no cambia es la clave.

## Defectos que se repiten (y su estado)

| Defecto | R1 | R2 | R3 | R4 | R5 | R6 | R7 | Estado en R7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Figura repetida | sí | resuelto en la forma | resuelto: 0 cajas | 3 cajas y 2 flechas en CSS y Git | misma firma en Git y CSS | sí, menos marcado | **sí, en 3 de 5** | recurre: TCP y CSS con la misma firma paso por paso, Rust a una flecha de distancia; la baraja repite forma en 3 de 5 |
| 2. Recorrido sin movimiento | sí (0) | parcial (1 a 3) | Rust 0; resto 1 | Rust 0; resto 1 o 2 | el contador dice 1, el lector dibuja 0 en 4 de 5 | 8 de 8 dibujados; Rust declara 0 | **9 de 9 dibujados; Rust declara 1** | resuelto en el lector y en la nota |
| 3. Flechas de texto en la cabecera | sí | parcial | no | no | no | no | **no (0 en las cinco)** | resuelto |
| 4. Claves de respuesta fijas | todas A | no todas A | ABC en las diez | B en la primera posición de las diez | 9 de 10 empiezan por B | 9 de 9 empiezan por B; tres cadenas | **8 de 9 empiezan por B; tres cadenas** | recurre |
| 5. Página rica | no existe | 0 de 4 | existe en 5 de 5; sin figura en 4 | no existe (la regla de #265 pide la nota) | no existe: la nota es la página | no existe; 3 demos `.html` | **no existe; 2 demos `.html`** | cambió por diseño |
| 6. El tutor elige el método | sí (2 de 5) | no | no: se detiene en `method` en 5 de 5 | no | no | no | **no: se detiene en `method` en 5 de 5; el banco responde** | recurre |
| 7. Enlaces `file://` | sí | resuelto | no | no | no | no | **no (0)** | resuelto |
| 8. Negritas | ~5 | 30–38 | 24–34 | 25–29 | 14,7–25,2 | 11,4–25,8 | **18,2–24,4** | recurre dentro de rango |
| 9. «El 20% que rinde el 80%» | — | — | 5 de 5 | 5 de 5 | 4 de 5 | 3 de 5 | **3 de 5 (Rust, Bayes, CSS; TCP y Git no)** | recurre |
| 10. Mini-quiz como lista numerada | — | sí | 5 de 5 | 0 de 5: quiz interactivo | 0 de 5: quiz interactivo | 0 de 5; Git sin archivo | **0 de 5: quiz interactivo en los cinco** | resuelto (Git recuperó su `p1.json`) |
| 11. La página rica pierde la figura de la nota | — | — | sí (4 de 5) | no aplica | no aplica | no aplica | **no aplica** | cambió por diseño |
| 12. `lk-checkpoint` nombrado en la skill sin definición | — | — | sí (2 líneas) | sí (1 línea) | no (0 líneas) | no (0 líneas) | **no (0 líneas)** | resuelto |

## Defectos nuevos o cambiados en R7

- **N-A (R6). El motor no veía los recorridos `lk-story` ni sus movimientos: resuelto.** Los cinco temas
  aceptan la Parte 1 al primer marco de puerta, sin una sola corrección y sin `blocked`: 15 marcos, 15 en
  `passing: true`, todos los turnos de método cerrando en `waiting/quiz`. #291 (el chequeo de demo lee
  `steps[].stage.scene` y `moves`) está desplegado y esta corrida lo ejercita en cuatro temas con
  `lk-story`.
- **N-B (R6). Rust se quedaba sin movimiento: resuelto.** Declara 1 en el paso 2 y el lector lo dibuja.
- **N-C (R6). Las puertas de figura del VPS dependían de un Chromium que no estaba en la caché del tema:
  mitigado en la operación.** Sembré el enlace `xdg-cache/ms-playwright` en los cinco temas antes de
  arrancar y las puertas corrieron en el VPS; la fila del VPS y la local coinciden (5/5). Sigue siendo un
  paso manual del banco, no algo que el banco haga solo.
- **N-D (R6). Tres pies eran texto suelto: queda uno.** Las tarjetas de Rust, TCP y CSS ya escriben
  «Cómo leerlo:» como párrafo (30 px debajo, 624 px de franja). El recorrido de Git sigue dejándolo como
  nodo de texto (41 px debajo), así que `captionsApart` no lo mide.
- **N-E (R6). Git sin mini-quiz: resuelto.** `mini-quiz/p1.json` está, la página sirve 3 preguntas y 24
  radios.
- **N-F (R6). Git era el tema peor dibujado y peor escrito: resuelto.** Pasa las cuatro puertas y el
  registro, sin un hallazgo de `scene-lint` ni de `scene-gate`. La figura es ahora una tabla de referencias
  con su `join` y un recorrido de tres pasos con dos `moves` («avanza», de `c1` a `c2` y de `c2` a `c3`).
  Aprobado al límite en `termino-sin-explicar` (50 %).
- **N-G. El turno de método cuesta más reloj.** El tutor corre las puertas dentro de la misma llamada
  (38–161 `run_command`) y no gasta presupuesto de corrección, pero Rust (1 397 s) y Git (1 364 s) doblan
  el turno más largo de R6; la corrida entera pasa de 16,9 a 31,5 min con la misma concurrencia.
- **N-H. La baraja cambia de texto y no de forma.** Las píldoras ahora llevan su veredicto y su etiqueta
  (CORRECTO «Flag SYN»), lo que las hace mucho más útiles, pero el patrón «dos aciertos y un
  contraejemplo» sigue en 3 de 5 y TCP y CSS comparten los mismos tres veredictos.

## La suite en `4cfcb24`

Estas pruebas se corrieron con `--test-force-exit` y `node --test`:

- `tools/scene-lint.test.mjs tools/explain-check.test.mjs tools/deck-gate.test.mjs tools/tools.test.mjs
  tools/part-lint.test.mjs tools/explain-bench.test.mjs`: **211/212 pasan**. Falla la misma prueba que en
  R6, «las cinco notas reales del banco pasan scene-gate y scene-lint», por la fixture vieja
  `tools/register/fixtures/bench265/notas/bayes-theorem.md`, que trae un movimiento de longitud cero
  (`pop → 80,150`) y la regla de #286 lo rechaza como `movimiento-no-dibujado`. Ninguna nota de R7 tiene un
  movimiento así, pero **`main` desplegado no pasa su propia suite**, igual que en R6.
- `integrations/pi/kit/test/moves.test.mjs integrations/pi/kit/test/story.test.mjs`: **24/24 pasan**.

## Capturas (negro × ancho, 1440 px, escala 2)

Las cinco páginas completas, Parte 1:

- `/tmp/bench7-shots/rust-borrowing-p1-black-wide.png`
- `/tmp/bench7-shots/tcp-handshake-p1-black-wide.png`
- `/tmp/bench7-shots/bayes-theorem-p1-black-wide.png`
- `/tmp/bench7-shots/git-branching-p1-black-wide.png`
- `/tmp/bench7-shots/css-flexbox-p1-black-wide.png`

Una captura por pieza (2 por tema; 10 en total). El cuestionario interactivo no es una pieza `lk-*` y no
tiene captura propia; aparece en las capturas completas.

- Rust: `rust-borrowing-p1-lk-story-1-black-wide.png`, `rust-borrowing-p1-lk-cards-2-black-wide.png`
- TCP: `tcp-handshake-p1-lk-story-1-black-wide.png`, `tcp-handshake-p1-lk-cards-2-black-wide.png`
- Bayes: `bayes-theorem-p1-lk-tree-1-black-wide.png`, `bayes-theorem-p1-lk-story-2-black-wide.png`
- Git: `git-branching-p1-lk-tables-1-black-wide.png`, `git-branching-p1-lk-story-2-black-wide.png`
- CSS: `css-flexbox-p1-lk-story-1-black-wide.png`, `css-flexbox-p1-lk-cards-2-black-wide.png`

Las cinco páginas se capturaron con `theme=black` y `wide` activo (`.reading-toggle`), comprobado en el DOM
antes del disparo. Las copias que leyó el lector están en `/tmp/bench7-shots/vault/`.

## Límites

- **Línea base nueva.** `4cfcb24` cambia la skill (1.47 → 1.48) con una tabla de reparaciones que el tutor
  lee. Las notas de R7 no son comparables palabra por palabra con R1–R6, ni el «antes» de esta tabla debe
  leerse como una mejora del motor: el motor cambió en `0c6d16a` (#291) y la skill en `4cfcb24` (#293).
- **La cuota del runtime.** El intento de las 05:10 murió con `RESOURCE_EXHAUSTED (429)` en los cinco
  temas; la corrida válida arrancó a las 06:01, después del reinicio de cuota. Cualquier lectura de tiempos
  debe ignorar el intento 1, que no midió nada.
- **La caché de Chromium se sembró a mano** en los cinco temas para que las puertas de figura del VPS
  corrieran (N-C). Sin ese paso, R7 habría repetido el 3/5 de R6 por una razón de entorno.
- **Concurrencia.** Los cinco temas corrieron a la vez, así que los minutos no son comparables con la serie
  de R3 (en serie).
- **Re-puntuación de R1–R6.** Se hizo con las herramientas desplegadas sobre las copias de
  `/tmp/bench*-shots`, que siguen en esta máquina. Las filas publicadas de R1–R6 usaron las herramientas de
  su corrida.
- **Fuera de XDG.** El runtime `agy` puede escribir bajo `$HOME`, y el banco no lo aísla (límite conocido de
  `README.md`). No lo verifiqué; el vault real no cambió.
- **Alumno competente, método fijo, sin preferencias, sólo la Parte 1.** Igual que en R4–R6, con Bayes en
  el camino de «No sé».
- **Tres capturas por pieza van al ras de la caja.** Los bordes de las tarjetas y el título de la tabla de
  Git quedan cortados a la mitad en el PNG de la pieza porque el elemento se fotografía exacto; en la página
  completa se ven enteros. Es un artefacto de la captura, no del lector.
- **`rtk` y los flujos largos.** `ssh` a través de `rtk` corta cada línea a ~160 caracteres y recorta la
  salida total, así que la salida del VPS se trajo con `fold -w 120` en trozos de 100 líneas y `base64`.

## Cómo se corrió

En el VPS, con `bench.mjs` copiado del repo desplegado (sha256 `60c1c44e…`), en `/tmp/bench7-246`, lanzado
con `setsid --fork` en su propio grupo de procesos, y con un vigilante que muestreaba
`git -C ~/learning rev-parse HEAD` cada 30 s y habría detenido la corrida —matando el grupo del banco, no
el suyo— si salía de `4cfcb24`:

```bash
node bench.mjs run --repo "$HOME/learning" --scratch /tmp/bench7-246/scratch \
  --out /tmp/bench7-246/out --port 4799 --concurrency 5 --vault "$HOME/Learnings"
```

En local, sobre la copia de la salida en la misma ruta absoluta:

```bash
node tools/agy-bench/bench.mjs gates --repo . --out /tmp/bench7-246/out
PLAYWRIGHT_MODULE=/home/ale/.npm-global/lib/node_modules/playwright/index.mjs \
  node tools/agy-bench/bench.mjs shots --repo . --out /tmp/bench7-246/out --shots /tmp/bench7-shots
```

La medición de movimientos, pies y píldoras fue un script suelto en el scratch (`/tmp/bench7-work/`), sobre
el lector real y el DOM; la re-puntuación de R1–R6, otro. El scratch del VPS (`/tmp/bench7-246`, con
`attempt1/` dentro) se borró al terminar; las capturas se conservan en `/tmp/bench7-shots/`.
