# Segunda corrida del banco del tutor (issue #246)

Corrida del 2026-11-13, 03:28–04:13 UTC, sobre el VPS. Raíz de prueba `/tmp/bench2-246/scratch`
(propia), estudio propio en el puerto 4811, token propio, `XDG_STATE_HOME` y `XDG_CACHE_HOME`
propios. Mismo runtime que la primera corrida: `agy` · `gemini-3.8-flash-high`, `rules/deep.json`
y la skill `explicacion-interactiva`. Un turno por acción, en serie, los cinco temas pedidos.

**Esta corrida no mide un solo commit.** A las 04:11:36 UTC `~/learning` pasó de `53700d1` a
`2eb6cfd` (PR #260, scenario explorer). Ese cambio toca `skills/explicacion-interactiva/references/visuales.md`,
`tools/explain-check.mjs` (una de las cuatro puertas) y el kit que sirve el lector. Por eso:

- **Rust, TCP y Bayes** se midieron por completo en `53700d1` (03:28:58–04:05:00).
- **Git** se midió a caballo: el texto de la parte se escribió en el turno que empezó a las
  04:07:02 (con la skill de `53700d1`), pero el cierre del turno (motor a las 04:11:40, fin a las
  04:11:53) y las puertas del VPS corrieron después del despliegue.
- **CSS flexbox** no se midió: arrancó a las 04:12:08 en `2eb6cfd` y se detuvo al empezar, sin
  puertas ni turno medido.

El banco se detuvo a mano en ese punto. Ver «Pendiente».

## La tabla

Puertas: las cuatro de `tools/` sobre la parte 1. «Hoy» = las herramientas de `53700d1` aplicadas
a las copias de la primera corrida (`/tmp/bench2-246/first-recheck/`).

| Tema | Corrida | Puertas (p1) | Correcciones | Desenlace del turno | Piezas · actores | Palabras/frase | Términos explicados (uso) | Negritas/1000 | Contrastes/1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rust borrowing | 1ª (`1d9046f`) | 4/4 entonces · **hoy 2 fallan** (scene-lint, explain-check) | 0 (solo puertas del log) | termina, sin errores ni avisos | lk-story, lk-scene, lk-quiz · libro, ref1, ref2 (robot) | 8.9 | 31% | 5.8 | 0.00 |
| | 2ª (`53700d1`) | 4/4 | 0 | 3/3 termina | lk-story, lk-cards · s1, r1, r2 (robot) | 6.8 | 100% | 37.9 | 15.2 |
| TCP handshake | 1ª | 4/4 entonces · **hoy falla** explain-check | 0 | 2 turnos; el tutor eligió `pareto` solo | lk-story, lk-scene, lk-quiz · Cliente, Servidor (robot) | 9.8 | 29% | 5.3 | 5.3 |
| | 2ª (`53700d1`) | 4/4 | 0 | 3/3 termina; método elegido por el banco | lk-story, lk-cards · Cliente, Servidor (robot, server) | 8.0 | 83% | 37.6 | 16.1 |
| Bayes' theorem | 1ª | 4/4 entonces · **hoy falla** explain-check | 0 | 2 turnos; el tutor eligió `pareto` solo | lk-story, lk-scene, lk-quiz · Universo Omega, Condición B (robot) | 10.1 | 33% | 5.2 | 0.00 |
| | 2ª (`53700d1`) | 4/4 | 0 | 3/3 termina; método elegido por el banco | lk-story, lk-venn · Paciente, Laboratorio (user, server) | 6.3 | 100% | 37.0 | 22.2 |
| Git branching | 1ª | 4/4 entonces · **hoy falla** explain-check | 0 | 3 turnos; método elegido por el banco | lk-story, lk-scene, lk-quiz · HEAD, main, commits (robot) | 10.0 | 13% | 5.2 | 0.00 |
| | 2ª (mixta) | 4/4 en el VPS; 4/4 al re-medir con `53700d1` | 0 | 3/3 termina; el cierre del turno 3 fue después del despliegue | lk-story, lk-cards · C1, main, C2, feature (file, robot) | 7.7 | 50% | 30.5 | 18.3 |
| CSS flexbox | 1ª | 4/4 entonces · **hoy falla** (mini-quiz, explain-check) | 0 | 3 turnos; método elegido por el banco | lk-story, lk-scene, lk-quiz · Contenedor, Ítems, Eje X/Y (robot) | 10.3 | 44% | 5.0 | 0.00 |
| | 2ª | no medido | — | — | — | — | — | — | — |

Notas de la tabla:

- **Correcciones (2ª)**: contadas de los informes de tiempo del estudio (`engine-correction` y
  `part-correction`). Las correcciones de la parte no emiten evento ni línea en el log, así que el
  conteo del log sería 0 aun habiéndolas. En las cuatro partes, cero puertas fallidas en el log.
  **(1ª)**: solo puertas del log; la primera corrida no tenía informes de tiempo.
- **Desenlace**: `termina` = ningún `error` del estudio en el turno. No apareció «se agotaron las
  correcciones» ni «el tutor eligió el método» en ningún turno de la 2ª. La 1ª no clasificaba el
  desenlace, pero sus logs no tienen ni `error` ni `notice`.
- **Registro**: `tools/register/measure.mjs`, sin cambios entre `53700d1` y `2eb6cfd`. Sus
  «palabras» no son las de `explain-check` (TCP 1ª: 189 según measure, 388 según explain-check),
  así que solo se comparan entre sí.
- **Actores**: los actores de la escena nombran por `tag` (o `id`); la primera versión del banco
  solo leía `label`, que ya no existe (ver «Adaptaciones»). La 1ª se volvió a medir con el banco
  adaptado para que las dos columnas salgan del mismo código.

## Lo que la primera corrida no veía y las puertas de hoy sí

Las cinco partes de la primera corrida pasaban 4/4 cuando se midieron. Con las herramientas de
`53700d1` fallan las cinco (`explain-check` en todas; `scene-lint` además en Rust). Los chequeos que
fallan, tal como los imprime la herramienta:

- `actor-sin-personaje` y `pieza-adecuada`: en las cinco.
- `ejemplo` y `header`: en las cinco.
- `repetida`: TCP, Git y CSS.
- `cabecera-con-flechas`: Rust y Bayes.
- `mini-quiz`: CSS.
- `scene-lint`, `fila-torcida`: Rust («los centros de sus personajes difieren en 22u (máximo 6)»).

La 2ª corrida pasa las cuatro puertas en las cuatro partes medidas, con las herramientas de `53700d1`.

## Defectos de la primera corrida: estado

| Defecto (1ª corrida) | 2ª corrida |
| --- | --- |
| 1. La misma figura en los cinco temas (dos cajas y una flecha) | **Resuelto en su forma**: ninguna figura tiene cajas. La estructura se repite (ver abajo). |
| 2. Recorrido sin movimiento (`moves` = 0) | **Resuelto en parte**: 1 a 3 movimientos por parte; Rust solo tiene 1, en el paso 2. |
| 3. Flechas de texto como cabecera | **Parcial**: TCP usa una ecuación (`SYN: seq=1000`); Git conserva `HEAD -> main -> C1`. |
| 4. Todas las respuestas correctas son A | **Resuelto**: diagnósticos `ABC` en las cuatro; mini-quizzes `ABB` (Rust) y `ABC`. |
| 5. Ninguna parte tiene su página rica (`explicaciones/*.html`) | **Recurre**: 0 de 4 partes. |
| 6. El tutor elige el método en 2 de 5 temas | **No se repitió**: en las cuatro, el tutor se detuvo en la etapa `method` y el banco eligió `pareto` por `api/metodo`. |
| 7. Enlaces `file://` en vez de la vista del estudio | **Resuelto**: 0 en notas y en turnos. |

Defectos nuevos o que ahora se ven:

- **Estructura de figura repetida.** TCP, Bayes y Git tienen 3 pasos, 2 o 3 actores y un
  movimiento por paso. Rust es distinto (1, 2 y 3 actores; un movimiento en total), pero sus tres
  figuras son robots.
- **Iconos genéricos.** `robot` para variables y punteros (Rust: `s1`, `r1`, `r2`; Git: `HEAD`).
  El icono no distingue roles: la dueña y las referencias se ven iguales.
- **La metáfora no dibuja el concepto (Bayes).** Un paciente y un laboratorio que se pasan una
  «muestra» (captura). La ecuación del encabezado sí lleva `P(A|B)`, pero la figura no muestra
  el espacio muestral que se reduce a B. Es el mismo defecto que la skill llama «dibujar la cosa».
- **La segunda pieza es casi siempre `lk-cards`** (3 de 4 partes); Bayes usa `lk-venn`.
- **Negritas**: 6 a 8 definiciones `**Término**:` por parte, 30 a 38 por 1000 palabras frente a ~5
  en la primera corrida. ¿Lo pide el registro de #250 o es exceso? No lo juzgo aquí; conviene
  revisarlo.
- **El mini-quiz sale de la nota.** La nota lista tres preguntas en texto; el quiz vive en
  `mini-quiz/p1.json`. `lk-quiz` ya no aparece en el texto de la parte.

## Capturas (negro × ancho, 1440 px, escala 2)

Página completa:

- `/tmp/bench2-shots/rust-borrowing-p1-black-wide.png`
- `/tmp/bench2-shots/tcp-handshake-p1-black-wide.png`
- `/tmp/bench2-shots/bayes-theorem-p1-black-wide.png`
- `/tmp/bench2-shots/git-branching-p1-black-wide.png`

Una captura por pieza:

- `/tmp/bench2-shots/rust-borrowing-p1-lk-story-1-black-wide.png`, `…-p1-lk-cards-2-black-wide.png`
- `/tmp/bench2-shots/tcp-handshake-p1-lk-story-1-black-wide.png`, `…-p1-lk-cards-2-black-wide.png`
- `/tmp/bench2-shots/bayes-theorem-p1-lk-story-1-black-wide.png`, `…-p1-lk-venn-2-black-wide.png`
- `/tmp/bench2-shots/git-branching-p1-lk-story-1-black-wide.png`, `…-p1-lk-cards-2-black-wide.png`

CSS no tiene capturas (no se midió).

## Adaptaciones de `bench.mjs`

Mínimas, y motivadas por cambios reales del estudio o por la corrida:

1. **Piezas**: `lk-quick-quiz`, `lk-figure` y `lk-audio` (definidas en el kit desde la primera corrida).
2. **Actores y figuras**: el nombre del actor es `tag` o `id` (la escena ya no usa `label`); las
   flechas son `paths[].arrow`; la firma de cada figura incluye `movimientos`.
3. **Método**: la tarjeta de método del lector aparece cuando `nextStage || stage` es `method`
   (`studio/ui/studio.js`). El banco mira lo mismo.
4. **Correcciones**: se cuentan de los informes de tiempo del estudio
   (`<state>/page-timings/`), porque las correcciones de la parte no pasan por el log.
   `gateFailures` queda como el conteo de puertas fallidas en el log.
5. **Desenlace por turno**: `termina`, `se agotaron las correcciones`, `el tutor eligió el método`
   o `error`, a partir de los eventos `error` del turno.
6. **Registro** por parte con `tools/register/measure.mjs`; `gates` vuelve a medir puertas,
   figura y registro sobre las copias.
7. **Capturas**: una por pieza, además de la página completa.
8. **Vault**: lectura con `git --no-optional-locks status`, que no refresca el índice de `~/Learnings`.
9. **Commit por tema** (`head.start` y `head.end`): se añadió después de esta corrida, así que la
   2ª no lo tiene; la fecha de cada tema está en los logs.

Una lección de mecánica: `run` tiene que correr contra `~/learning`, no contra una copia. El tutor
exige que `~/.claude/skills/explicacion-interactiva` resuelva al repo que se corre; con una copia en
`/tmp` el estudio responde 409 «El tutor no empieza» (primer intento, sin efectos).

## Vault

El banco solo ejecutó `git status` de lectura sobre `~/Learnings`. No escribió su registro «antes y
después» porque la corrida se detuvo antes del final. Después revisé el vault: dos archivos cambiaron a
las 04:03:42 UTC (`learning.db-shm` y `learning.db.backup`). Esa es la hora exacta en que disparó
`learnings-backup.timer` (timer de usuario de systemd, que ejecuta `deploy/vps/learnings-backup.sh`,
la rutina de producción que escribe `learning.db.backup`). `learning.db` no cambió. El banco no tiene
ninguna ruta de escritura hacia `~/Learnings`.

## Pendiente

- **CSS flexbox** no tiene medida en ningún commit.
- **Git** se midió a caballo del despliegue (ver arriba).
- **Decisión**: `53700d1` ya no está desplegado; medirlo de nuevo exigiría desplegarlo. Opciones:
  (a) volver a correr los cinco temas en el main actual, con `head` por tema, para una tabla de un solo
  commit; (b) aceptar esta tabla, con Git marcado y CSS pendiente.
