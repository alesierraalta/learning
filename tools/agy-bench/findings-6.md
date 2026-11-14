# Sexta corrida del banco del tutor (issue #246)

Corrida del 2026-11-14, 03:28:23–03:45:21 UTC (17,0 min), sobre el VPS con el repo desplegado en
**`bdfb193`** (`main`; trae el PR #289 —las movidas que el tutor escribe ahora se dibujan, #286— y
el PR #288 —el pie queda con su figura y dos cosas distintas dejan de compartir personaje, #287—).
El `HEAD` se muestreó cada 30 s durante toda la corrida (34 muestras, de 03:28:23 a 03:45:21 UTC):
las 34 dan `bdfb193`. El `HEAD` de cada tema al inicio y al final, y el de la corrida, son
`bdfb193b197d5d283f1334ce75ac9e9cc9416f8b`. Sigue en `bdfb193` después de la corrida. No hubo
`HEAD-MOVED`: el vigilante no disparó ninguna parada.

Raíz de prueba `/tmp/bench6-246/scratch` (propia), salida `/tmp/bench6-246/out`, puertos 4799–4803,
estado y caché XDG propios por tema, token derivado del tema. `bench.mjs` corrió byte a byte el del
repo desplegado (sha256 `60c1c44e…`, idéntico al de `~/learning/tools/agy-bench/bench.mjs` y al del
worktree local). Runtime, modelo, reglas y skill: `agy` · `gemini-3.8-flash-high`, `rules/deep.json`,
`explicacion-interactiva`. Los cinco temas corrieron **a la vez** (`--concurrency 5`), como en R4 y
R5. Node del VPS: v24.14.1; las capturas y la re-puntuación local, con Node v26.12.1.

Procedimiento: modo Universitario; diagnóstico respondido en el puente con la letra que sirve la
página para la clave del quiz (alumno competente), salvo Bayes, que responde «No sé» (E) en las
tres preguntas; método por `api/metodo` cuando el motor lo pide; Parte 1 pedida con el texto del
botón del estudio, en el turno del método.

Vault real (`~/Learnings`): `git status --porcelain` antes y después, idéntico (54 169 bytes, sha256
`1e0f4c38…`, el mismo de R5). Producción: en esta máquina `learning-studio` **no es una unidad
systemd** (`Unit learning-studio.service could not be found`); el estudio vivo es el proceso node
`1350217` (`studio/server.ts`), iniciado a las 03:22:56 UTC, **antes** de la corrida, y seguía con
el mismo PID al terminar; 4747 y 4748 escuchando todo el tiempo. `learning-autodeploy` tampoco es
una unidad en esta máquina; el estado observado fue inactivo. No se envió ninguna señal ni comando
de control a esos procesos.

## Qué leyó el alumno: la nota, otra vez

- **La nota en las cinco partes.** En las copias no hay ninguna página `Parte 1….html` (0 archivos).
  Lo único `.html` son tres demos bajo `explicaciones/demos/` (Rust, Git y Bayes), que no son la
  página de la parte. El lector sirvió la rama de la nota: la vista responde 200 con `"kind":"part"`
  en sus datos y con la CSP de página (`script-src 'self' https://cdn.jsdelivr.net`, sin
  `'unsafe-inline'` en `script-src`).
- **Sin errores.** Las cinco páginas cargan con cero errores de consola y de página, en negro y en
  modo ancho (comprobado en el DOM antes de capturar).
- **El mini-quiz.** Cuatro de cinco sirven el cuestionario interactivo desde `mini-quiz/p1.json`
  (3 preguntas). **Git no tiene `mini-quiz/p1.json`**: la página sirve 0 preguntas y la nota solo
  dice «Las preguntas de esta parte viven en su `mini-quiz/p1.json`». Es una regresión frente a R5
  (Git tenía 3 preguntas).

## Tabla 1: puertas, correcciones, lector y tiempo

| | R1 (`1d9046f`) | R2 (`53700d1`) | R3 (`ffa08a8`) | R4 (`2fcd035`) | R5 (`0c3795a`) | R6 (`bdfb193`) |
| --- | --- | --- | --- | --- | --- | --- |
| Puertas, medidas en su corrida | 4/4 en los 5 | 4/4 en 4 (CSS no medido) | 4/4 en los 5 | 4/4 en los 5 | 4/4 en los 5 | **3/5** (Rust y Git fallan en el VPS; la de Rust es del entorno, ver N-C) |
| Puertas, con las herramientas de `bdfb193` | 0/5 | 0/4 | 0/5 | 2/5 | 1/5 | **4/5** (solo Git falla) |
| Correcciones (informes de tiempo) | 0 (no había informes) | 0 (no había informes) | 0 en los 5 | 1 en CSS (`part-correction`) | 3 (`part-correction` en Git, TCP y Rust) | **2 `engine-correction` en Rust, Git y Bayes; 0 en CSS y TCP** |
| Fallos de puerta en el log | — | — | 0 | 0 | 0 | **3 en Rust, Git y Bayes; 0 en CSS y TCP** |
| Lo que sirvió el lector | la nota (0 de 5 con página) | la nota (0 de 4 con página) | el `.html` en 5 de 5 | la nota en 5 de 5 | la nota en 5 de 5 | **la nota en 5 de 5** (0 páginas de parte; 3 demos `.html`) |
| Turnos por tema | 2–3 | 3 | 3 | 3 | 3 | **3 en los 5** |
| Minutos: Rust · TCP · Bayes · Git · CSS | 26 · 12 · 8 · 7 · 6 | — | 27 · 9 · 5 · 6 · 7 (en serie) | 23,0 · 33,1 · 21,2 · 40,5 · 34,5 | 34,0 · 26,8 · 20,3 · 15,8 · 20,6 | **16,1 · 15,3 · 16,9 · 16,6 · 15,0** |

Notas de la tabla:

- **La fila con las herramientas de `bdfb193` se midió de nuevo**, sobre las copias de R1–R5
  (`/tmp/bench*-shots/vault`), no es la fila publicada en `findings-4.md`/`findings-5.md` (que usó
  `2fcd035` o `0c3795a`). Las reglas de #286 y #287 cambian el veredicto de las notas viejas: R5,
  que pasaba 5/5 con las herramientas de `0c3795a`, hoy pasa 1/5 —Bayes— porque `scene-lint` marca
  `movimiento-no-dibujado` en cuatro notas (el defecto N-A de R5) y `explain-check` añade
  `figuras`. Es la prueba de que la regla nueva ve el defecto que la corrida anterior no veía.
- **La fila de R6 medida en el VPS no es la buena para juzgar la nota.** Las herramientas de figura
  del VPS no encontraron el navegador en la caché aislada del tema: `browserType.launch: Executable
  doesn't exist at /tmp/bench6-246/scratch/<tema>/xdg-cache/ms-playwright/…`. Bayes, CSS y TCP
  tenían en su `xdg-cache/ms-playwright` un enlace al cache global (`~/.cache/ms-playwright`), así
  que sus puertas corrieron; Rust y Git no lo tenían y `scene-gate`, `scene-lint`, `deck-gate` y la
  regla `figuras` de `explain-check` terminaron con excepción. Rust, que pasa 4/4 al re-medirlo en
  local, aparecía como fallo de las cuatro en el VPS. La columna válida es la de `bdfb193` en local.
- **Correcciones.** Las tres de R6 son `engine-correction`, no `part-correction`: el motor pidió dos
  correcciones y se agotó el presupuesto en Rust, Git y Bayes. El log tiene 3 marcos de puerta
  fallidos en cada uno (el último es el alto que sigue, no otra corrección). CSS y TCP terminaron
  el turno sin corrección.
- **Turnos.** Tres en todos los temas (aprender, diagnóstico, método); la Parte 1 se escribe en el
  turno del método, como en R3–R5. En Rust, Git y Bayes el turno del método termina
  `se agotaron las correcciones`; en CSS y TCP, `termina`.

## Tabla 2: método, lector, piezas y personajes

| Tema | Método (origen) | Lector | Piezas en el DOM | Personajes | Píldoras de la baraja | Cuestionario |
| --- | --- | --- | --- | --- | --- | --- |
| Rust borrowing | `pareto` (banco) | nota | lk-story 1, lk-cards 1 | s, r1: &s, r2: &s, r: &mut s, r2: &mut s | COMPILA, COMPILA, NO COMPILA | 3 preguntas |
| TCP handshake | `preferencias` (banco) | nota | lk-story 1, lk-cards 1, lk-quiz 1 en la nota | Cliente, Servidor | CORRECTO, CORRECTO, RECHAZADO | 3 preguntas |
| Bayes' theorem | `pareto` (banco) | nota | lk-tree 1, lk-story 1, lk-quiz 1 en la nota | 9 enfermos, 99 sanos, 108 positivos | — (sin baraja) | 3 preguntas |
| Git branching | `preferencias` (banco) | nota | lk-scene 1, lk-story 1 | commit c1, commit c2, commit c3, main, c3, c4 | — (sin baraja) | **0 preguntas** (falta `mini-quiz/p1.json`) |
| CSS flexbox | `pareto` (banco) | nota | lk-story 1, lk-cards 1 | c1, c2 | CORRECTO, CORRECTO, RECHAZADO | 3 preguntas |

El tutor no eligió el método en ninguno de los cinco: el banco respondió `pareto` en Rust, Bayes y
CSS, y `preferencias` en TCP y Git, como estaba previsto. La repetición de la baraja baja respecto
de R5 (eran 4 de 5 con el mismo trío), pero no desaparece: **CSS y TCP tienen las mismas tres
píldoras y la misma forma de tres tarjetas**; Rust cambia las palabras (COMPILA/NO COMPILA) y
mantiene la forma. Git y Bayes no usan `lk-cards`.

## Tabla 3: movimientos declarados frente a trazos que el lector dibuja

Cada celda es `declarados en la nota / grupos data-move en el DOM / trazos con d`. Se leyeron los
payloads de la nota y el DOM real, paso por paso, en negro × ancho. `—` es una pieza sin pasos.

| Tema · figura | Paso 1 | Paso 2 | Paso 3 | Paso 4 |
| --- | --- | --- | --- | --- |
| Rust · lk-story | 0/0/0 | 0/0/0 | 0/0/0 | — |
| TCP · lk-story | 0/0/0 | 1/1/1 | 0/0/0 | — |
| Bayes · lk-story | 0/0/0 | 2/2/2 | 1/1/1 | 1/1/1 |
| Git · lk-story | 0/0/0 | 1/1/1 | 1/1/1 | — |
| Git · lk-scene | 0/0/0 | — | — | — |
| CSS · lk-story | 0/0/0 | 1/1/1 | 0/0/0 | — |
| Bayes · lk-tree | 0/0/0 | — | — | — |

**Total: 8 movimientos declarados, 8 grupos en el DOM, 8 trazos dibujados, 0 sin dibujar.** En R5
eran los mismos 8 declarados y solo 4 dibujados (los de Bayes): el lector los ignoraba en Git, CSS,
TCP y Rust. Ahora los dibuja todos. El caso nuevo de #286 —la forma del tutor `{actor,toX,toY}`, no
la canónica `{from,to}`— aparece en **CSS, paso 2** (`actor c1 → punto 222,150`) y se dibuja; TCP,
Git y Bayes usan la forma canónica y también se dibujan. **Rust no declara ningún movimiento** (en
R5 declaraba uno que no se dibujaba): su recorrido es ahora completamente quieto.

## Tabla 4: el pie «Cómo leerlo» y las píldoras

Medido en la página del lector, en modo ancho, con el mismo criterio de `scene-lint`: el pie tiene
que compartir la franja horizontal de su figura y quedar directamente debajo (tope 64 px). «Dentro»
es un `caption` declarado en el JSON de la pieza; «P» es un párrafo siguiente; «texto suelto» es un
nodo de texto siguiente, sin `<p>`.

| Tema · pieza | Pie «Cómo leerlo» | Franja compartida / debajo | Píldoras |
| --- | --- | --- | --- |
| Rust · lk-story | sin pie | — | — |
| Rust · lk-cards | texto suelto | 584 px / 35 px | COMPILA · COMPILA · NO COMPILA |
| TCP · lk-story | sin pie | — | — |
| TCP · lk-cards | texto suelto | 620 px / 35 px | CORRECTO · CORRECTO · RECHAZADO |
| Bayes · lk-tree | dentro (JSON) | — | — |
| Bayes · lk-story | sin pie | — | — |
| Git · lk-scene | dentro (JSON) | — | — |
| Git · lk-story | P (fuera) | 332 px / 36 px | — |
| CSS · lk-story | sin pie | — | — |
| CSS · lk-cards | texto suelto | 577 px / 35 px | CORRECTO · CORRECTO · RECHAZADO |

Lectura: **los seis pies que existen se quedan con su figura** (todos comparten franja y quedan a
35–36 px), así que no hay ningún `leyenda-descolgada` en R6; la regla de #287 no tiene un caso
descolgado que corregir. Pero **tres de los seis son texto suelto, no párrafos**: la nota escribe
`Cómo leerlo:` en la línea inmediatamente siguiente a `</lk-cards>`, sin línea en blanco, y el
Markdown lo deja como nodo de texto. Se lee debajo de la figura, pero pierde el estilo de párrafo y
`scene-lint` no lo mide porque `captionsApart` solo mira hermanos `P`. Cuatro recorridos
(`lk-story`) no llevan pie; el narrador del propio recorrido hace ese papel, pero no es la línea
`Cómo leerlo:` que pide la skill.

## Tabla 5: registro (`tools/register/measure.mjs`, sobre la nota)

Cada celda lleva R1 · R2 · R3 · R4 · R5 · **R6**. R1–R5 son las cifras de `findings-3.md`,
`findings-4.md` y `findings-5.md`; el medidor no cambió.

| Tema | Palabras/frase | Términos explicados (uso) | Negritas/1000 | Contrastes/1000 | Palabras (R6) |
| --- | --- | --- | --- | --- | --- |
| Rust borrowing | 8,9 · 6,8 · 6,3 · 7,1 · 7,2 · **6,8** | 31% · 100% · 100% · 85% · 56% · **92%** | 5,8 · 37,9 · 33,6 · 24,9 · 14,7 · **25,8** | 0,00 · 15,2 · 13,4 · 14,9 · 14,7 · **15,5** | 194 |
| TCP handshake | 9,8 · 8,0 · 6,9 · 6,8 · 7,4 · **6,0** | 29% · 83% · 82% · 86% · 75% · **75%** | 5,3 · 37,6 · 29,6 · 29,1 · 23,8 · **24,2** | 5,3 · 16,1 · 17,8 · 14,5 · 19,0 · **30,3** | 165 |
| Bayes' theorem | 10,1 · 6,3 · 7,9 · 6,7 · 7,7 · **7,7** | 33% · 100% · 80% · 67% · 100% · **100%** | 5,2 · 37,0 · 23,8 · 24,5 · 24,8 · **24,8** | 0,00 · 22,2 · 11,9 · 12,3 · 19,8 · **19,8** | 202 |
| Git branching | 10,0 · 7,7 · 5,5 · 5,9 · 6,0 · **10,0** | 13% · 50% · 70% · 50% · 70% · **43%** | 5,2 · 30,5 · 30,8 · 26,5 · 25,2 · **11,4** | 0,00 · 18,3 · 15,4 · 26,5 · 12,6 · **11,4** | 263 |
| CSS flexbox | 10,3 · — · 6,6 · 7,8 · 7,6 · **6,7** | 44% · — · 67% · 100% · 63% · **86%** | 5,0 · — · 28,2 · 25,3 · 19,9 · **24,4** | 0,00 · — · 14,1 · 18,1 · 14,9 · **14,6** | 205 |

Palabras por parte: R1 173–199, R2 132–186, R3 130–169, R4 151–277, R5 159–210, R6 165–263. Las
puertas pasan con esas notas salvo Git (que falla por figura y por registro). Git es el extremo
otra vez: 263 palabras, 10,0 palabras por frase, 43 % de términos explicados, 11,4 de contraste y
11,4 negritas; el resto queda entre 6,0 y 7,7 palabras por frase.

## Tabla 6: claves de respuesta

| Tema | Diagnóstico, clave del tutor | Diagnóstico, letra servida | Mini-quiz, clave del tutor |
| --- | --- | --- | --- |
| Rust borrowing | BAC | AAA (3/3) | BAC |
| TCP handshake | BDA | ACD (3/3) | BAC |
| Bayes' theorem | BAC | EEE («No sé», 0/3) | ABC |
| Git branching | BDA | CAA (3/3) | — (sin archivo) |
| CSS flexbox | BDA | DCD (3/3) | BDA |

Patrón: **9 de 9 claves empiezan por B** (Git no tiene mini-quiz) y solo hay tres cadenas: BDA ×4,
BAC ×4, ABC ×1. Las letras servidas sí cambian por alumno (AAA, ACD, EEE, CAA, DCD), que es el
barajado de #272/#276 funcionando; lo que no cambia es la clave. Las claves siguen siendo
predecibles, igual que en R5.

## Defectos que se repiten (y su estado)

| Defecto | R1 | R2 | R3 | R4 | R5 | R6 | Estado en R6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Figura repetida | sí | resuelto en la forma | resuelto: 0 cajas | 3 cajas y 2 flechas en CSS y Git | misma firma en Git y CSS | **sí, menos marcado**: CSS y TCP comparten el recorrido de 3 pasos, 2 actores y movimientos 0/1/0; Git y Bayes comparten escenas de 3 actores con movimientos al final; la baraja se repite en 2 de 5 | recurre |
| 2. Recorrido sin movimiento | sí (0) | parcial (1 a 3) | Rust 0; resto 1 | Rust 0; resto 1 o 2 | el contador dice 1, el lector dibuja 0 en 4 de 5 | **el lector dibuja 8 de 8 movimientos declarados; Rust declara 0; el motor no cuenta los movimientos** | resuelto en el lector, no en el motor |
| 3. Flechas de texto en la cabecera | sí | parcial | no | no | no | **no (0 en las cinco)** | resuelto |
| 4. Claves de respuesta fijas | todas A | no todas A | ABC en las diez | B en la primera posición de las diez | 9 de 10 empiezan por B | **9 de 9 empiezan por B; tres cadenas** | recurre |
| 5. Página rica | no existe | 0 de 4 | existe en 5 de 5; sin figura en 4 | no existe (la regla de #265 pide la nota) | no existe: la nota es la página | **no existe como página de parte; la nota es la página; hay 3 demos `.html` sueltas** | cambió por diseño |
| 6. El tutor elige el método | sí (2 de 5) | no | no: se detiene en `method` en 5 de 5 | no: se detiene en `method` en 5 de 5 | no: se detiene en `method` en 5 de 5 | **no: se detiene en `method` en 5 de 5; el banco responde** | recurre |
| 7. Enlaces `file://` | sí | resuelto | no | no | no | **no (0)** | resuelto |
| 8. Negritas | ~5 | 30–38 | 24–34 | 25–29 | 14,7–25,2 | **11,4–25,8** | recurre, más bajo en Git |
| 9. «El 20% que rinde el 80%» | — | — | 5 de 5 | 5 de 5 | 4 de 5 | **3 de 5 (Rust, Bayes, CSS; TCP y Git no)** | recurre |
| 10. Mini-quiz como lista numerada | — | sí | 5 de 5 | 0 de 5: quiz interactivo | 0 de 5: quiz interactivo | **0 de 5: quiz interactivo en 4; Git sin quiz** | resuelto en 4 de 5; Git sin mini-quiz |
| 11. La página rica pierde la figura de la nota | — | — | sí (4 de 5) | no aplica: no hay página | no aplica | **no aplica** | cambió por diseño |
| 12. `lk-checkpoint` nombrado en la skill sin definición | — | — | sí (2 líneas) | sí (1 línea) | no (0 líneas) | **no (0 líneas)** | resuelto |

## Defectos nuevos o cambiados en R6

- **N-A. El motor no ve los recorridos `lk-story` ni sus movimientos (3 de 5).** Rust, Git y Bayes
  declaran `demosPlanned: true` en su plan; el motor pidió `demo-part` y en los tres terminó
  `blocked` en `explanation` con «… without a single arrow — every deck draws arrows». Bayes y Git
  **sí dibujan** movimientos (4 y 2, todos trazados en el DOM) y Rust no dibuja ninguno. La causa
  está en `internal/engine/decks.go`: `deckStep` lee `steps[].scene` y `guideArrowGaps` solo cuenta
  `arrows`; un `lk-story` escribe su escena en `steps[].stage.scene` y sus trazos en `moves`, así
  que el motor ve un paso vacío y un deck sin flechas. Consecuencia: #286 arregló el lector, pero
  el motor sigue rechazando la nota que el lector ya dibuja. Bayes pasa las cuatro puertas y aun
  así queda bloqueado por el motor. Es el defecto más importante de la corrida.
- **N-B. Rust se quedó sin movimiento.** En R5 declaraba un movimiento (que el lector no dibujaba);
  en R6 declara 0. El recorrido es una sucesión de tres escenas quietas con actores y props, y el
  motor pide una flecha. Aquí la corrección no es del lector: falta el movimiento en la nota.
- **N-C. Las puertas de figura del VPS dependen de un navegador que no está en la caché del tema.**
  El banco aísla `XDG_CACHE_HOME` por tema, y Playwright busca su Chromium ahí; en Bayes, CSS y TCP
  la carpeta `xdg-cache/ms-playwright` era un enlace a `~/.cache/ms-playwright`, pero en Rust y Git
  no existía. En esos dos, `scene-gate`, `scene-lint`, `deck-gate` y la regla `figuras` de
  `explain-check` terminan con `browserType.launch: Executable doesn't exist at
  /tmp/bench6-246/scratch/<tema>/xdg-cache/ms-playwright/…`. La fila de puertas de la corrida en el
  VPS no sirve para juzgar las notas; la re-puntuación local sobre las copias sí. Es un límite de
  operación, no de la nota, pero explica el 3/5 de la primera fila.
- **N-D. Tres pies son texto suelto, no párrafos.** Las tarjetas de Rust, TCP y CSS escriben
  `Cómo leerlo:` sin línea en blanco después de `</lk-cards>`; el Markdown lo deja como nodo de
  texto. El pie se queda debajo de la figura (584/620/577 px de franja y 35 px de separación), así
  que #287 cumple su regla, pero el texto pierde el estilo de párrafo y `captionsApart` no lo mide.
  La nota debe dejar la línea en blanco o usar el `caption` de la pieza.
- **N-E. Git perdió el mini-quiz.** No hay `mini-quiz/p1.json` en la copia; la página sirve 0
  preguntas y la nota solo promete que el archivo existe. Es una regresión frente a R5 (3 preguntas)
  y convive con que Git es el único tema que falla las cuatro puertas.
- **N-F. Git sigue siendo el tema peor dibujado y peor escrito.** Falla `scene-gate` (15 problemas
  en 2 escenas: letras de 12,4 px, cajas fuera del lienzo, `commit c3`/`hash c3` encimados, 36 % de
  lienzo usado), `scene-lint` (cajas fuera del lienzo, texto encimado, trazo sobre texto),
  `deck-gate` (el mismo texto encimado) y `explain-check` (5 reglas: `escenario-de-cajas`,
  `marca-eco`, `termino-sin-explicar` 43 %, `frases-largas` 10,0 palabras, `figuras`). La captura
  completa lo muestra: la escena de la cadena de commits y el recorrido del puntero se pisan.
- **N-G. La baraja se repite.** CSS y TCP tienen las mismas tres píldoras (CORRECTO, CORRECTO,
  RECHAZADO) y la misma forma de tres tarjetas; Rust cambia el texto pero no la forma. R5 tenía el
  mismo trío en 4 de 5; R6 lo baja a 2 de 5 idénticos y 3 de 5 con la misma estructura, pero el
  patrón «dos aciertos y un contraejemplo» sigue.

## La suite en `bdfb193` (no cambia la medición, pero deja `main` en rojo)

Se corrieron las pruebas de las dos correcciones con `--test-force-exit`:

- `integrations/pi/kit/test/moves.test.mjs`: **4/4 pasan** (`{actor,toX,toY}` dibuja, la canónica
  sigue dibujando 4 de 4 en Bayes, las dos formas significan lo mismo).
- `integrations/pi/bridge.test.mjs --test-name-pattern=caption`: **1/1 pasa** (la pieza cruza las
  columnas y conserva su «Cómo leerlo»).
- `tools/scene-lint.test.mjs`: **109/110 pasan**. Falla «las cinco notas reales del banco pasan
  scene-gate y scene-lint»: la fixture `tools/register/fixtures/bench265/notas/bayes-theorem.md`
  trae `moves:[{"actor":"pop","toX":80,"toY":150}]`, un movimiento de longitud cero, y la regla
  nueva de #286 lo rechaza como `movimiento-no-dibujado`. Es una fixture vieja, no una nota de R6
  (las notas de R6 no tienen ningún movimiento de longitud cero), pero el `main` desplegado no
  pasa su propia suite.

## Capturas (negro × ancho, 1440 px, escala 2)

Las cinco páginas completas, Parte 1:

- `/tmp/bench6-shots/rust-borrowing-p1-black-wide.png`
- `/tmp/bench6-shots/tcp-handshake-p1-black-wide.png`
- `/tmp/bench6-shots/teorema-de-bayes-p1-black-wide.png`
- `/tmp/bench6-shots/git-branching-p1-black-wide.png`
- `/tmp/bench6-shots/css-flexbox-p1-black-wide.png`

Una captura por pieza (2 por tema; 10 en total). El cuestionario interactivo no es una pieza
`lk-*` y no tiene captura propia; aparece en las capturas completas.

- Rust: `rust-borrowing-p1-lk-story-1-black-wide.png`, `rust-borrowing-p1-lk-cards-2-black-wide.png`
- TCP: `tcp-handshake-p1-lk-story-1-black-wide.png`, `tcp-handshake-p1-lk-cards-2-black-wide.png`
- Bayes: `teorema-de-bayes-p1-lk-tree-1-black-wide.png`, `teorema-de-bayes-p1-lk-story-2-black-wide.png`
- Git: `git-branching-p1-lk-scene-1-black-wide.png`, `git-branching-p1-lk-story-2-black-wide.png`
- CSS: `css-flexbox-p1-lk-story-1-black-wide.png`, `css-flexbox-p1-lk-cards-2-black-wide.png`

El recorrido paso a paso de Bayes (`lk-story`, 4 pasos), que es el que más movimientos dibuja:

- `/tmp/bench6-shots/teorema-de-bayes-p1-story-step-1-black-wide.png` (1/4, sin movimiento)
- `/tmp/bench6-shots/teorema-de-bayes-p1-story-step-2-black-wide.png` (2/4, 2 movimientos dibujados)
- `/tmp/bench6-shots/teorema-de-bayes-p1-story-step-3-black-wide.png` (3/4, 1 movimiento dibujado)
- `/tmp/bench6-shots/teorema-de-bayes-p1-story-step-4-black-wide.png` (4/4, 1 movimiento dibujado)

Las cinco páginas se capturaron con `theme=black` y `wide` activo (`.reading-toggle`), comprobado en
el DOM antes del disparo. Las copias que leyó el lector están en `/tmp/bench6-shots/vault/`.

## Límites

- **Concurrencia.** Los cinco temas corrieron a la vez, así que los minutos no son comparables con
  la serie de R3 (en serie). El turno de método más largo fue 532 s (Rust).
- **Re-puntuación de R1–R5.** Se hizo con las herramientas de `bdfb193` sobre las copias de
  `/tmp/bench-shots`, `/tmp/bench2-shots`, `/tmp/bench3-shots`, `/tmp/bench4-shots` y
  `/tmp/bench5-shots`, que siguen en esta máquina. Las filas publicadas de R1–R5 usaron las
  herramientas de su corrida; esta tabla las vuelve a medir con las de R6.
- **Las puertas de figura del VPS.** No encuentran Chromium en la caché aislada del tema (N-C). La
  re-puntuación local es la que decide; la fila del VPS se conserva para mostrar el fallo de
  operación, no el de la nota.
- **Fuera de XDG.** El runtime `agy` puede escribir bajo `$HOME`, y el banco no lo aísla (límite
  conocido de `README.md`). No lo verifiqué; el vault real no cambió.
- **Alumno competente, método fijo, sin preferencias, sólo la Parte 1.** Igual que en R4 y R5, con
  Bayes en el camino de «No sé».
- **La captura por pieza va al ras de la caja de la pieza.** Los bordes de las tarjetas y el título
  del árbol de Bayes quedan cortados a la mitad en el PNG de la pieza porque el elemento se
  fotografía exacto; en la página completa se ven enteros. Es un artefacto de la captura, no del
  lector.

## Cómo se corrió

En el VPS, con `bench.mjs` copiado del repo desplegado (sha256 `60c1c44e…`), en
`/tmp/bench6-246`, lanzado con `setsid` en su propio grupo de procesos, y con un vigilante que
muestreaba `git -C ~/learning rev-parse HEAD` cada 30 s y habría detenido la corrida si salía de
`bdfb193`:

```bash
node bench.mjs run --repo "$HOME/learning" --scratch /tmp/bench6-246/scratch \
  --out /tmp/bench6-246/out --port 4799 --concurrency 5 --vault "$HOME/Learnings"
```

En local, sobre la copia de la salida en la misma ruta absoluta:

```bash
node tools/agy-bench/bench.mjs gates --repo . --out /tmp/bench6-246/out
PLAYWRIGHT_MODULE=/home/ale/.npm-global/lib/node_modules/playwright/index.mjs \
  node tools/agy-bench/bench.mjs shots --repo . --out /tmp/bench6-246/out --shots /tmp/bench6-shots
```

La medición de movimientos, pies y píldoras fue un script suelto en el scratch, sobre el lector
real y el DOM; la re-puntuación de R1–R5, otro. El scratch (`/tmp/bench6-246`, local y en el VPS, y
`/tmp/bench6-work`) **quedó sin borrar**: el arnés de seguridad del agente bloqueó la orden de
borrado aunque la corrida autorizaba limpiar sus propios directorios. Lo deja para que lo borre el
orquestador; las capturas se conservan en `/tmp/bench6-shots/`.
