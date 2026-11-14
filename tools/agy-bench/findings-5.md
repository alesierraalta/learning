# Quinta corrida del banco del tutor (issue #246)

Corrida del 2026-11-14, 01:00:15–01:34:14 UTC, sobre el VPS con el repo desplegado en **`0c3795a`**
(`main`; trae el PR #284 —el reruteo de flechas de #283—, el #282 —la etiqueta de la flecha de
#280— y la nota como página de #265). El `HEAD` se muestreó cada 30 s durante toda la corrida
(74 muestras, de 00:57:54 a 01:34:26 UTC): todas dan `0c3795a`. El `HEAD` de cada tema al inicio y
al final, y el de la corrida, son `0c3795a`. Sigue en `0c3795a` después de la corrida.

Raíz de prueba `/tmp/bench5-246/scratch` (propia), salida `/tmp/bench5-246/out`, puertos 4799–4803,
estado y caché XDG propios por tema, token derivado del tema. `bench.mjs` corrió byte a byte el del
repo desplegado (sha256 `60c1c44e…`). Mismo runtime, modelo, reglas y skill que R1–R4: `agy` ·
`gemini-3.8-flash-high`, `rules/deep.json`, `explicacion-interactiva`. Los cinco temas corrieron **a
la vez** (`--concurrency 5`), como en R4.

Procedimiento: modo Universitario; diagnóstico respondido en el puente con la letra que sirve la
página para la clave del quiz (alumno competente), salvo Bayes, que responde «No sé» (E) en las
tres preguntas; método por `api/metodo` cuando el motor lo pide (el banco alterna `pareto` y
`preferencias`); Parte 1 pedida con el texto del botón del estudio, en el turno del método.

Vault real (`~/Learnings`): `git status --porcelain` antes y después, idéntico (54 169 bytes, sha256
`1e0f4c38…`). Producción: `learning-studio` activo antes y después; **no lo toqué**: se reinició solo
a las 00:59:34 UTC por el trabajo «Deploy the live tree» de `run.sh` (journal del sistema, 00:59:30 →
00:59:39), un redespliegue del mismo commit —el `HEAD` no se movió—, antes del primer turno del
banco. `learning-autodeploy` inactivo salvo su temporizador de ~60 s, cuyas 34 ejecuciones de la
ventana —35 ejecuciones— terminaron en menos de un segundo sin desplegar nada. 4747 y 4748
  escuchando todo el tiempo.
No se envió ninguna señal ni comando de control a esos servicios.

## Qué leyó el alumno: la nota, otra vez

- **La nota en las cinco partes.** En las copias no hay ningún `.html` (0 archivos en los cinco
  temas). Es la regla de #265 otra vez: `deploy/vps/learnings/AGENTS.md:31` y `studio/agy.ts:39`.
- **Comprobado por HTTP sobre las copias.** La ruta de la vista del lector responde 200 con la CSP de
  página (`PAGE_CSP`, `bridge.ts:71`: `script-src 'self' https://cdn.jsdelivr.net`, sin
  `'unsafe-inline'`) y con `"kind":"part"` en su `LEARNING_BRIDGE`: es la rama de la nota de
  `partPage` (`bridge.ts:1565`; la rama rica es la de `:1542` y su `RICH_CSP`). Esa rama no se
  alcanza porque no hay página.
- **El mini-quiz.** La nota se dibuja sin su sección «## Mini-quiz» (`withoutMiniQuiz`,
  `bridge.ts:444`) y el cuestionario sale de `mini-quiz/p1.json`: 3 `fieldset` y 24 `radio` por
  página en las cinco (8 radios por pregunta: cinco opciones A–E con «No sé» al final, más
  Seguro/Dudo/Adusto), medidos en el DOM del navegador.
- **Sin errores.** Las cinco páginas cargan sin un solo error de consola ni de página, en negro (la
  comprobación de consola se hizo sin el modo ancho; las capturas sí son negro × ancho).

## Tabla 1: puertas, correcciones, lector y tiempo

| | R1 (`1d9046f`) | R2 (`53700d1`) | R3 (`ffa08a8`) | R4 (`2fcd035`) | R5 (`0c3795a`) |
| --- | --- | --- | --- | --- | --- |
| Puertas, medidas en su corrida | 4/4 en los 5 | 4/4 en 4 (CSS no medido) | 4/4 en los 5 | 4/4 en los 5 | 4/4 en los 5 |
| Puertas, con las herramientas de 0c3795a | 0 de 5 | 0 de 4 | 0 de 5 | 4 de 5 | **5 de 5** |
| Correcciones (informes de tiempo) | 0 (no había informes) | 0 (no había informes) | 0 en los 5 | 1 en CSS (`part-correction`) | **3 en total**: 1 en Git, 1 en TCP, 1 en Rust (todas `part-correction`) |
| Fallos de puerta en el log | — | — | 0 | 0 | 0 |
| Lo que sirvió el lector | la nota (0 de 5 con página) | la nota (0 de 4 con página) | el `.html` en 5 de 5 | la nota en 5 de 5 | la nota en 5 de 5 (no hay `.html`) |
| Turnos por tema | 2–3 | 3 | 3 | 3 | 3 |
| Minutos: Rust · TCP · Bayes · Git · CSS | 26 · 12 · 8 · 7 · 6 | — | 27 · 9 · 5 · 6 · 7 (en serie) | 23.0 · 33.1 · 21.2 · 40.5 · 34.5 (a la vez) | 34.0 · 26.8 · 20.3 · 15.8 · 20.6 (a la vez) |

Notas de la tabla:

- **Re-puntuación con las herramientas de 0c3795a.** Se volvieron a pasar las cuatro puertas sobre
  las notas de la Parte 1 de las copias de R1–R4 (`/tmp/bench-shots`, `/tmp/bench2-shots`,
  `/tmp/bench3-shots`, `/tmp/bench4-shots`), que siguen en esta máquina. Las reglas cambiaron
  desde 2fcd035: `tools/explain-check` se partió en reglas (`tools/explain-check/rules/*.mjs`) y
  `scene-lint` recibió #280 y #283 (`git diff --stat 2fcd035..0c3795a -- tools/`: 37 archivos,
  +1466/−628). Por eso R4, que pasaba 4/4 en su corrida, hoy queda 4 de 5: **Git falla
  `escenario-de-cajas`** (la escena quieta «Estructura de punteros en Git» solo dibuja cajas con su
  texto y flechas). Las demás reglas que fallan por corrida, con las herramientas de hoy:
  R1 — `mini-quiz`, `escenario-de-cajas`, `historia-quieta`, `clave-muerta`,
  `termino-sin-explicar`, `frases-largas`, `sin-contraste` (Rust además `scene-gate`, `scene-lint` y
  `figuras`; `ascii` y `cabecera-con-flechas` en 3 de 5); R2 — `mini-quiz` en las 4,
  `marca-eco` en 3, `accesorio-sin-sentido` en 2, `veredicto-sin-error` en 1, y `scene-gate` en las
  4;
  R3 — `mini-quiz` y `glosario-en-bloque` en las 5. R5 pasa las cuatro en las cinco sin una regla en
  contra.
- **Correcciones.** En R5 son 3, todas `part-correction` y todas dentro del turno del método: Git,
  TCP y Rust tienen dos llamados al modelo en su informe de tiempos (`turn` + `part-correction`;
  2 101, 2 183 y 2 142 caracteres de entrada), Bayes y CSS uno solo. El log no tiene **ninguna**
  puerta fallida en los cinco temas (`gateFailures` 0) y el tutor lo dice con sus palabras al cerrar
  el turno: «He verificado y corregido la nota y las figuras. Ahora todas las comprobaciones pasan
  limpiamente (`scene-gate`, `scene-lint`, `deck-gate` y `explain-check`) con cero hallazgos.» El
  tutor corrió las herramientas él mismo (`run_command`: 131 comandos en Git y 254 en Rust, de 191 y
  377 llamadas a herramientas en total) y reescribió antes de que la puerta del estudio viera la
  parte. Eso explica el mecanismo que en R4
  quedó abierto (N-A): la corrección no la pide el estudio, la pide el propio tutor.
- **Turnos.** Tres en todos los temas (aprender, diagnóstico, método); la Parte 1 se escribe en el
  turno del método, como en R3 y R4. El motor termina ese turno en `quiz`.
- **Tiempo.** La corrida entera duró 34.0 min de reloj; el tema más lento fue Rust (2 038 s) y el más
  rápido Git (948 s). Los turnos de método llegaron a 1 475 s (Rust) y 1 166 s (TCP).

## Tabla 2: piezas y personajes visibles en la página

Piezas contadas en el DOM del navegador, en negro × ancho. Personajes leídos de los
`<script type="application/json">` que la página conserva; coinciden con los de la nota.

| Tema | R5: piezas en el DOM | R5: personajes | R5: cuestionario | Caracteres visibles |
| --- | --- | --- | --- | --- |
| Rust borrowing | lk-story 1, lk-cards 1 | dron, r1: &dron, r2: &dron, w: &mut dron | 3 preguntas (24 radios) | 4 216 |
| TCP handshake | lk-story 1, lk-cards 1 | Cliente, Servidor | 3 preguntas (24 radios) | 4 513 |
| Bayes' theorem | lk-story 1, lk-tree 1 | 9 enfermos, 99 sanos, 108 positivos | 3 preguntas (24 radios) | 4 435 |
| Git branching | lk-story 1, lk-cards 1 | C1, main | 3 preguntas (24 radios) | 3 951 |
| CSS flexbox | lk-story 1, lk-cards 1 | nav, item | 3 preguntas (24 radios) | 4 222 |

Notas:

- **Todas abren con `lk-story` y todas repiten la segunda pieza** (`lk-cards` en cuatro, `lk-tree` en
  Bayes). Es la primera corrida en la que las cinco traen la misma pareja de piezas en el mismo
  orden.
- **`lk-cards` es siempre un trío**: Git y TCP con las mismas píldoras (CORRECTO, CORRECTO,
  RECHAZADO), Rust con (COMPILA, COMPILA, NO COMPILA) —dos aciertos y un contraejemplo— y CSS con
  (FILA, COLUMNA, BLOQUE). Cuatro de cinco comparten la forma de la baraja, no solo la pieza.
- **El `lk-quiz` de la nota no se dibuja como pieza** (la sección «## Mini-quiz» se quita); el
  cuestionario interactivo no es una pieza `lk-*`, así que no tiene captura propia. Rust, TCP y Git
  traen `<lk-quiz>` en la nota; el lector lo reemplaza por el de `mini-quiz/p1.json`.
- Los botones «Generar video», «Generar debate / charla / entrevista / explicación» aparecen en las
  cinco páginas como controles de la página; no son piezas `lk-video` ni `lk-audio`.

## Tabla 3: registro (`tools/register/measure.mjs`, sobre la nota)

Cada celda lleva R1 · R2 · R3 · R4 · **R5**. R1–R4 son las cifras de `findings-3.md` y
`findings-4.md`; el medidor no cambió desde `ffa08a8`.

| Tema | Palabras/frase | Términos explicados (uso) | Negritas/1000 | Contrastes/1000 | Palabras (R5) |
| --- | --- | --- | --- | --- | --- |
| Rust borrowing | 8.9 · 6.8 · 6.3 · 7.1 · **7.2** | 31% · 100% · 100% · 85% · **56%** | 5.8 · 37.9 · 33.6 · 24.9 · **14.7** | 0.00 · 15.2 · 13.4 · 14.9 · **14.7** | 204 |
| TCP handshake | 9.8 · 8.0 · 6.9 · 6.8 · **7.4** | 29% · 83% · 82% · 86% · **75%** | 5.3 · 37.6 · 29.6 · 29.1 · **23.8** | 5.3 · 16.1 · 17.8 · 14.5 · **19.0** | 210 |
| Bayes' theorem | 10.1 · 6.3 · 7.9 · 6.7 · **7.7** | 33% · 100% · 80% · 67% · **100%** | 5.2 · 37.0 · 23.8 · 24.5 · **24.8** | 0.00 · 22.2 · 11.9 · 12.3 · **19.8** | 202 |
| Git branching | 10.0 · 7.7 · 5.5 · 5.9 · **6.0** | 13% · 50% · 70% · 50% · **70%** | 5.2 · 30.5 · 30.8 · 26.5 · **25.2** | 0.00 · 18.3 · 15.4 · 26.5 · **12.6** | 159 |
| CSS flexbox | 10.3 · — · 6.6 · 7.8 · **7.6** | 44% · — · 67% · 100% · **63%** | 5.0 · — · 28.2 · 25.3 · **19.9** | 0.00 · — · 14.1 · 18.1 · **14.9** | 201 |

Palabras por parte: R1 173–199, R2 132–186, R3 130–169, R4 151–277, R5 159–210. Las puertas pasan
con todas esas notas. El registro de R5 se mueve poco y en la dirección buena: negritas de 14.7 a
25.2 por 1000 (R4: 24.5–29.1), contrastes de 12.6 a 19.8, frases de 6.0 a 7.7 palabras. Rust es el
extremo: 56 % de términos explicados (el más bajo de la serie) y las menos negritas.

## Tabla 4: figuras

Cada escena se da como `cajas·flechas·actores·piezas·movimientos`. La última columna es la huella
de la figura principal, la que va en `report.md`.

| Tema | R3 (nota) | R4 (nota = página) | R5 (nota = página) |
| --- | --- | --- | --- |
| Rust borrowing | 0 cajas, 0 flechas; 0 movimientos | `0·0·3·2·0`, `0·0·2·1·1`, `0·0·3·2·0` | `0·1·3·2·0`, `0·0·2·1·1`, `0·0·3·2·0`; lk-story, 3 pasos, 4 actores, movimientos 0/1/0 |
| TCP handshake | 0 cajas, 0 flechas; 1 movimiento | `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·0·0` | `0·1·2·1·0`, `0·1·2·1·1`, `0·1·2·0·0`; lk-story, 3 pasos, 2 actores, movimientos 0/1/0 |
| Bayes' theorem | 0 cajas, 0 flechas; 1 movimiento | `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·0·1` | `0·0·2·0·0`, `0·0·3·0·2`, `0·0·3·0·1`, `0·0·3·0·1`; lk-story, 4 pasos, 3 actores, movimientos 0/2/1/1 |
| Git branching | 0 cajas, 0 flechas; 1 movimiento | `3·2·0·0·0`, `0·0·1·2·0`, `0·0·2·2·1`, `0·0·2·3·0` | `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·0·0`; lk-story, 3 pasos, 2 actores, movimientos 0/1/0 |
| CSS flexbox | 0 cajas, 0 flechas; 1 movimiento | `3·2·0·0·0`, `0·0·3·0·1`, `0·0·3·0·1`, `0·0·3·0·0` | `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·1·0`; lk-story, 3 pasos, 2 actores, movimientos 0/1/0 |

Lectura:

- **Las cajas de R4 desaparecieron** (0 cajas en las cinco; #265 y las reglas de la escena con
  personaje hicieron su trabajo) y **vuelven las flechas de escena en dos**: TCP y Rust traen una
  `arrows` por paso; Git, CSS y Bayes ninguna.
- **Git y CSS tienen la misma firma, escena por escena**: `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·1·0`.
  Bayes y TCP comparten el esqueleto de tres escenas con el mismo número de actores por paso.
- **La forma de la historia se repitió en cuatro de cinco**: 3 pasos, dos actores, un solo paso con
  "movimiento" (el 2). Bayes es la excepción (4 pasos).
- **Los movimientos de la tabla no se dibujan.** Ver el defecto 2: en Git, CSS, TCP y Rust la clave
  `moves` de la escena no es la que lee el lector.

## Tabla 5: claves de respuesta

Las letras del tutor son las de `quiz.json` y `mini-quiz/p1.json`; la columna «servida» es la letra
que la página le mostró al alumno para esa misma clave (orden por alumno, #272/#276).

| Tema | Diagnóstico, clave del tutor | Diagnóstico, letra servida | Mini-quiz, clave del tutor |
| --- | --- | --- | --- |
| Rust borrowing | BCAD | ACCD (4/4) | ACB |
| TCP handshake | BAC | ABC (3/3) | BAC |
| Bayes' theorem | BAC | EEE («No sé», 0/3) | BAC |
| Git branching | BDA | CDA (3/3) | BDA |
| CSS flexbox | BDA | DCD (3/3) | BDA |

Patrón: **9 de 10 claves empiezan por B** (la excepción es el mini-quiz de Rust, `ACB`), y sólo hay
cuatro cadenas: BDA ×4, BAC ×4, BCAD ×1, ACB ×1. En las 31 respuestas: A 10, B 10, C 6, D 5. Las
letras servidas sí varían por alumno (ACCD, ABC, EEE, CDA, DCD), que es el arreglo de #272/#276
funcionando; lo que no cambia es la clave. El barajado mueve la letra, no el patrón.

## Defectos que se repiten (y su estado)

| Defecto | R1 | R2 | R3 | R4 | R5 | Estado en R5 |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Figura repetida | sí | resuelto en la forma | resuelto: 0 cajas | cambió: 3 cajas y 2 flechas en CSS y Git | **sí**: Git y CSS con la misma firma escena por escena; 4 de 5 con historia de 3 pasos y 2 actores | recurre |
| 2. Recorrido sin movimiento | sí (0) | parcial (1 a 3) | Rust 0; resto 1 | Rust 0; resto 1 o 2 | **peor**: el contador dice 1, el lector dibuja 0 en 4 de 5 | recurre y empeora |
| 3. Flechas de texto en la cabecera | sí | parcial | no | no | no (0 en las cinco notas) | resuelto |
| 4. Claves de respuesta fijas | todas A | no todas A | ABC en las diez | B en la primera posición de las diez | 9 de 10 empiezan por B; cuatro cadenas | recurre |
| 5. Página rica | no existe | 0 de 4 | existe en 5 de 5; sin figura en 4 | no existe (la regla de #265 pide la nota) | no existe: la nota es la página | cambió por diseño |
| 6. El tutor elige el método | sí (2 de 5) | no | no: se detiene en `method` en 5 de 5 | no: se detiene en `method` en 5 de 5 | no: se detiene en `method` en 5 de 5; el banco responde | recurre |
| 7. Enlaces `file://` | sí | resuelto | no | no | no (0) | resuelto |
| 8. Negritas | ~5 | 30–38 | 24–34 | 25–29 | 14.7–25.2 | recurre, más bajo |
| 9. «El 20% que rinde el 80%» | — | — | 5 de 5 | 5 de 5 | 4 de 5 (Git, Bayes, CSS, Rust; TCP no) | recurre |
| 10. Mini-quiz como lista numerada | — | sí | 5 de 5 | 0 de 5: quiz interactivo | 0 de 5: quiz interactivo (3 preguntas, 24 radios) | resuelto |
| 11. La página rica pierde la figura de la nota | — | — | sí (4 de 5) | no aplica: no hay página | no aplica | cambió por diseño |
| 12. `lk-checkpoint` nombrado en la skill sin definición | — | — | sí (2 líneas) | sí (1 línea) | no (0 líneas) | resuelto |

Notas: el defecto 6 es una elección del banco (`pareto` en Rust, Bayes y CSS; `preferencias` en TCP y
Git) y el 9 sale de esa misma elección, salvo Git, que usó `preferencias` y aun así tituló «El 20%
que rinde el 80%».

## Defectos nuevos o cambiados en R5

- **N-A. La escena escribe movimientos que el lector no lee (4 de 5).** Git, CSS, TCP y Rust ponen
  `"moves":[{"actor":"c1","toX":80,"toY":150}]`. El lector espera `from`/`to` (`docs/kit.md:258`,
  `kit.js:1618`): serializa `data-move-from="undefined"` y no traza ninguna flecha
  (`if (!from || !to) continue`, `kit.js:905`). Medido en el DOM: Git, CSS, TCP y Rust tienen 1
  grupo de movimiento con `from`/`to` = `undefined` y **0 trazos dibujados**; Bayes, que sí usa
  `from`/`to/verb` (`e→g`, `s→g`, `e→g`, `e→g`), dibuja **4 de 4**. Además, en Git, CSS y TCP el
  movimiento declarado no desplaza nada (`toX/toY` = la posición que el actor ya tiene); en Rust
  desplaza 20 unidades. En R4 esta forma estaba en 2 de 5 (Bayes y TCP): **la proporción creció a 4
  de 5**. Consecuencia para #283: el reruteo de flechas no se puede ejercitar donde la flecha no
  existe. Las puertas no lo ven —`scene-gate` y `scene-lint` no leen `moves`—, y el contador del
  banco lo cuenta igual: por eso la tabla 4 dice «movimientos 0/1/0».
- **N-B. La corrección la pide el tutor, no el estudio (3 de 5).** Un segundo llamado
  `part-correction` dentro del turno del método en Git, TCP y Rust, con `gateFailures` 0 en el log:
  el tutor corre las cuatro herramientas él mismo y reescribe antes de que la puerta del estudio vea
  la parte. Es la explicación del `part-correction` sin causa que quedó abierta en R4 (N-A), y cuesta
  un llamado extra al modelo en 3 de 5 temas.
- **N-C. El mismo personaje para cosas distintas.** Git dibuja el commit y la rama como dos robots
  idénticos (`"icon":"robot"`); Rust dibuja el valor y sus dos referencias como tres robots
  idénticos; CSS dibuja contenedor y flex item como dos robots idénticos. Sólo el rótulo los
  distingue, y el rótulo es lo que el lector compara.
- **N-D. La baraja de tarjetas es la misma en 4 de 5** (ver tabla 2): tres tarjetas, dos aciertos y
  un contraejemplo, con las mismas píldoras en Git y TCP.
- **N-E. La leyenda se separa de su figura.** El texto a dos columnas parte la nota entre la figura y
  su «Cómo leerlo»: en Git la baraja queda en la columna izquierda y su leyenda en la derecha; en CSS
  el «Cómo leerlo» del recorrido cae en la columna izquierda y el recorrido va centrado abajo. El
  lector ve la leyenda lejos de lo que explica.
- **N-F. Bayes: la leyenda del árbol corta una palabra.** «Las dos hojas desta-cadas son los
  positivos»: el guionado parte «destacadas» por donde no va. La puerta de figuras no lo mira.

Resuelto en R5: el mini-quiz como lista numerada (0 de 5), `lk-checkpoint` nombrado sin definición
(0 líneas), los enlaces `file://` (0) y las cajas de R4 (0 cajas). Sigue sin resolverse que las
claves se puedan adivinar y que cuatro de cinco notas se dibujen con el mismo esqueleto.

## Capturas (negro × ancho, 1440 px, escala 2)

Página completa, Parte 1:

- `/tmp/bench5-shots/rust-borrowing-p1-black-wide.png`
- `/tmp/bench5-shots/tcp-handshake-p1-black-wide.png`
- `/tmp/bench5-shots/bayes-theorem-p1-black-wide.png`
- `/tmp/bench5-shots/git-branching-p1-black-wide.png`
- `/tmp/bench5-shots/css-flexbox-p1-black-wide.png`

Una captura por pieza (2 por tema; 10 en total). El cuestionario interactivo no es una pieza
`lk-*` y no tiene captura propia: aparece en las capturas completas.

- Rust: `rust-borrowing-p1-lk-story-1-black-wide.png`, `rust-borrowing-p1-lk-cards-2-black-wide.png`
- TCP: `tcp-handshake-p1-lk-story-1-black-wide.png`, `tcp-handshake-p1-lk-cards-2-black-wide.png`
- Bayes: `bayes-theorem-p1-lk-tree-1-black-wide.png`, `bayes-theorem-p1-lk-story-2-black-wide.png`
- Git: `git-branching-p1-lk-story-1-black-wide.png`, `git-branching-p1-lk-cards-2-black-wide.png`
- CSS: `css-flexbox-p1-lk-story-2-black-wide.png`, `css-flexbox-p1-lk-cards-1-black-wide.png`

Las cinco páginas se capturaron con `theme=black` y `wide` activo (`.reading-toggle`), comprobado en
el DOM antes del disparo. Las copias que leyó el lector están en `/tmp/bench5-shots/vault/`.

## Límites

- **Concurrencia.** Los cinco temas corrieron a la vez, así que los minutos no son comparables con la
  serie de R3 (en serie). El turno de método más largo fue 1 475 s (Rust).
- **Re-puntuación de R1–R4.** Se hizo sobre `/tmp/bench-shots`, `/tmp/bench2-shots`,
  `/tmp/bench3-shots` y `/tmp/bench4-shots`, que no están en el repo. Las herramientas de 0c3795a
  cambiaron respecto de 2fcd035, así que la fila «con las herramientas de 0c3795a» de R1–R3 no
  coincide regla por regla con la de `findings-4.md` (que puntuó con 2fcd035).
- **El contador de movimientos del banco.** `visualsOf` cuenta `scene.moves` tal como viene en la
  nota; no comprueba que el lector las dibuje. En R5 eso infla la tabla 4 en 4 de 5 temas (N-A). El
  banco no se tocó en esta corrida: `bench.mjs` corrió byte a byte el del repo.
- **Fuera de XDG.** El runtime `agy` puede escribir bajo `$HOME`, y el banco no lo aísla (límite
  conocido de `README.md`). No lo verifiqué; el vault real no cambió.
- **Alumno competente, método fijo, sin preferencias, sólo la Parte 1.** Igual que en R4, con Bayes
  en el camino de «No sé».
- **La captura por pieza va al ras de la caja de la pieza.** Los bordes de las tarjetas, el título
  del árbol de Bayes, quedan cortados a la mitad en el PNG de la pieza porque el elemento se
  fotografía exacto; en la página completa se ven enteros. Es un artefacto de la captura, no del
  lector.
- **Operación.** `rtk` no está instalado en el VPS: los comandos remotos se lanzaron con
  `rtk ssh -x synchub`. La salida se trajo con `ssh -x` directo y `base64`, porque el filtro de
  `rtk` corrompe un flujo `tar`.

## Cómo se corrió

En el VPS, con `bench.mjs` copiado del repo desplegado (sha256 `60c1c44e…`), en `/tmp/bench5-246`,
lanzado con `setsid` en su propio grupo de procesos, y con un vigilante de `HEAD` que muestreaba
`git -C ~/learning rev-parse --short HEAD` cada 30 s y habría detenido la corrida si salía de
`0c3795a`:

```bash
node bench.mjs run --repo "$HOME/learning" --scratch /tmp/bench5-246/scratch \
  --out /tmp/bench5-246/out --port 4799 --concurrency 5 --vault "$HOME/Learnings"
```

En local, sobre la copia de la salida en la misma ruta absoluta:

```bash
node tools/agy-bench/bench.mjs gates --repo . --out /tmp/bench5-246/out
PLAYWRIGHT_MODULE=/home/ale/.npm-global/lib/node_modules/playwright/index.mjs \
  node tools/agy-bench/bench.mjs shots --repo . --out /tmp/bench5-246/out --shots /tmp/bench5-shots
```

La comprobación por HTTP de lo que sirve el lector, el recuento en el DOM (piezas, personajes,
`fieldset` y `radio`, movimientos dibujados, errores de consola) y la re-puntuación de R1–R4 fueron
scripts sueltos en el scratch, fuera del repo. El scratch (`/tmp/bench5-246`, local y en el VPS, y
`/tmp/bench5-work`) se borró al terminar; las capturas se conservan en `/tmp/bench5-shots/`.
