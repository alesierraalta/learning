# Tercera corrida del banco del tutor (issue #246)

Corrida del 2026-11-13, 09:18–10:11 UTC, sobre el VPS con el repo desplegado en **`ffa08a8`** (`main`).
`HEAD` se muestreó cada 30 s durante toda la corrida (de 09:18 a 10:11, un vigilante propio): todas las muestras
dan `ffa08a8`, y el `HEAD` de cada tema al inicio y al final coincide. El `HEAD` sigue en `ffa08a8` después de la corrida.
Raíz de prueba `/tmp/bench3-246/scratch` (propia), salida `/tmp/bench3-246/out`, `XDG_STATE_HOME` y `XDG_CACHE_HOME`
propios, estudio propio en el puerto 4833, token propio. El vault real (`~/Learnings`) se leyó con
`git status --porcelain` antes y después: idéntico.

Mismo runtime, modelo, reglas y skill que R1 y R2: `agy` · `gemini-3.8-flash-high`, `rules/deep.json`,
`explicacion-interactiva`. Mismo procedimiento que R2: modo Universitario; diagnóstico respondido por la ruta
`submit` del puente con la clave del propio quiz (alumno competente); método `pareto` por `api/metodo` cuando el
motor lo pide; Parte 1 pedida con el texto del botón. Temas en serie, en una sola corrida del banco. Durante los primeros tres minutos, el vigilante de `HEAD` apuntó a un grupo de procesos equivocado (error de arranque, corregido antes de que terminara el primer tema); ninguna muestra cambió en esa ventana.

Cambio en el banco: `PIECES` ahora incluye `lk-tree` y `lk-explorer`. Están en la tabla de piezas de `docs/kit.md`,
pero no estaban en la lista, así que R1 y R2 no las contaban ni las capturaban. Ninguna de las cinco partes de R3
las usa, así que no hay capturas de esas dos piezas.

El VPS tiene 6 archivos sin seguimiento (un backup de Caddy, un HTML de ejemplo y cuatro especificaciones de audio).
Ninguno está en las rutas que usa esta corrida (reglas, skill, puertas).

## Qué miden las puertas y el registro: la nota, no la página

Las cuatro puertas reciben la nota `explicaciones/Parte 1 - <slug>.md`, y el registro también mide esa nota.
Desde R3 el lector sirve la página rica `explicaciones/Parte 1 - <slug>.html` cuando existe
(`integrations/pi/bridge.ts`, `richPage`, líneas 1306–1307), así que lo que lee el alumno no pasa por las puertas
ni por el registro. Por eso la tabla de piezas y personajes de R3 se midió sobre el `.html`, y las dos mediciones
se muestran por separado. Ver N1.

## Tabla 1: puertas, correcciones, página rica y tiempo

Cada celda lleva **R1 · R2 · R3**. R1 = `1d9046f`, R2 = `53700d1`, R3 = `ffa08a8`.
«Puertas, medidas entonces» es lo que decía cada corrida con sus propias herramientas. «Puertas, hoy» es la
misma nota puntuada con las herramientas de `ffa08a8`.

| Tema | Puertas, medidas entonces | Puertas, hoy | Correcciones | Página rica | Turnos | Tiempo (min) |
| --- | --- | --- | --- | --- | --- | --- |
| Rust borrowing | 4/4 · 4/4 · 4/4 | falla scene-gate, scene-lint, explain-check · falla scene-gate, explain-check · **pasa 4/4** | 0 · 0 · 0 | no · no · **sí** | 3 · 3 · 3 | 26 · — · 27 |
| TCP handshake | 4/4 · 4/4 · 4/4 | falla explain-check · falla scene-gate, explain-check · **pasa 4/4** | 0 · 0 · 0 | no · no · **sí** | 2 · 3 · 3 | 12 · — · 9 |
| Bayes' theorem | 4/4 · 4/4 · 4/4 | falla explain-check · falla scene-gate · **pasa 4/4** | 0 · 0 · 0 | no · no · **sí** | 2 · 3 · 3 | 8 · — · 5 |
| Git branching | 4/4 · 4/4 · 4/4 | falla explain-check · falla scene-gate, explain-check · **pasa 4/4** | 0 · 0 · 0 | no · no · **sí** | 3 · 3 · 3 | 7 · — · 6 |
| CSS flexbox | 4/4 · no medido · 4/4 | falla explain-check · no medido · **pasa 4/4** | 0 · — · 0 | no · no medido · **sí** | 3 · — · 3 | 6 · — · 7 |

Notas de la tabla:

- **Correcciones**: en R3 son los informes de tiempo del estudio (`engine-correction` y `part-correction`): 0 en
  los cinco temas, y 0 puertas fallidas en el log. R1 contó solo las puertas del log, porque entonces no había
  informes de tiempo.
- **Puertas, hoy**: R1 y R2 no pasan con las herramientas de hoy, aunque pasaron cuando se midieron.
  Las herramientas se endurecieron entre corridas (ver «Límites»).
- **Turnos de R3**: tres en todos los temas (aprender, diagnóstico, método). La Parte 1 se escribe en el turno del
  método, sin turno propio: el motor se detiene en la etapa `method` y el método lo elige el banco.
- **Tiempo**: de la primera acción a la última del tema. R1 lo anotó en su tabla (criterio no verificado); R2 no lo anotó por tema.

## Tabla 2: piezas y personajes

| Tema | Piezas en la nota (R1 · R2 · R3) | Piezas en la página (R3) | Personajes (R3: página · nota) |
| --- | --- | --- | --- |
| Rust borrowing | lk-scene, lk-story, lk-quiz · lk-story, lk-cards · lk-story, lk-cards | lk-story, lk-cards | s, r1 (&s), r2 (&s), r (&mut s), r2 (&mut s) · los mismos |
| TCP handshake | lk-scene, lk-story, lk-quiz · lk-story, lk-cards · lk-story, lk-cards | **lk-cards** (sin figura) | ninguno · cli, srv |
| Bayes' theorem | lk-scene, lk-story, lk-quiz · lk-story, lk-venn · lk-story, lk-cards | **lk-cards** (sin figura) | ninguno · total, casos |
| Git branching | lk-scene, lk-story, lk-quiz · lk-story, lk-cards · lk-story, lk-cards | **lk-cards** (sin figura) | ninguno · C1, main |
| CSS flexbox | lk-scene, lk-story, lk-quiz · — · lk-story, lk-cards | **lk-cards** (sin figura) | ninguno · barra, hijos |

En todas las páginas de R3 aparecen además `lk-video` y `lk-audio`, pero son controles que el puente inyecta cuando
la nota no los trae (`bridge.ts`, líneas 340–341): los botones «Generar video» y «Generar audio». No los escribe el tutor.

## Tabla 3: registro (`tools/register/measure.mjs`, sobre la nota; R1 · R2 · R3)

| Tema | Palabras/frase | Términos explicados (uso) | Negritas/1000 | Contrastes/1000 |
| --- | --- | --- | --- | --- |
| Rust borrowing | 8.9 · 6.8 · 6.3 | 31% · 100% · 100% | 5.8 · 37.9 · 33.6 | 0.00 · 15.2 · 13.4 |
| TCP handshake | 9.8 · 8.0 · 6.9 | 29% · 83% · 82% | 5.3 · 37.6 · 29.6 | 5.3 · 16.1 · 17.8 |
| Bayes' theorem | 10.1 · 6.3 · 7.9 | 33% · 100% · 80% | 5.2 · 37.0 · 23.8 | 0.00 · 22.2 · 11.9 |
| Git branching | 10.0 · 7.7 · 5.5 | 13% · 50% · 70% | 5.2 · 30.5 · 30.8 | 0.00 · 18.3 · 15.4 |
| CSS flexbox | 10.3 · — · 6.6 | 44% · — · 67% | 5.0 · — · 28.2 | 0.00 · — · 14.1 |

Palabras medidas de la nota: R1 173–199, R2 132–186, R3 130–169. R1 y R2 se volvieron a medir con el medidor de
`ffa08a8`: coinciden con las tablas de `findings-2.md`. El medidor no cambió desde `53700d1`, así que R2 y R3 son
comparables en registro.

## Figuras

| | R1 | R2 | R3 |
| --- | --- | --- | --- |
| Cajas y flechas por figura | 2 cajas y 1 flecha, en los cinco | 0 cajas | 0 cajas, 0 flechas |
| Movimientos por parte | 0 | 1 a 3 (Rust: 1) | Rust: 0; TCP, Bayes, Git y CSS: 1 |
| Forma de la figura de la nota | la misma en los cinco | — | la misma en TCP, Bayes, Git y CSS: 3 escenas, 2 actores, 1 movimiento (paso 2) |

Rust es la única con escenas de tres actores y dos piezas (en dos de sus tres pasos). Las otras cuatro comparten el
esqueleto y cambian las palabras.

## Defectos que se repiten (y su estado)

| Defecto (R1) | R1 | R2 | R3 |
| --- | --- | --- | --- |
| 1. Misma figura (dos cajas y una flecha) | sí | resuelto en la forma | resuelto: 0 cajas, 0 flechas |
| 2. Recorrido sin movimiento | sí (0) | parcial (1 a 3) | **sí, y peor**: 0 en Rust, 1 en los demás |
| 3. Flechas de texto en la cabecera | sí | parcial | no: 0 en notas y páginas |
| 4. Todas las respuestas correctas son A | sí | resuelto | resuelto en la forma, pero **ABC en las diez claves** (ver N4) |
| 5. Ninguna parte tiene su página rica | sí | sí (0 de 4) | **existe en 5 de 5**, pero sin figura en 4 (ver N1) |
| 6. El tutor elige el método | sí (2 de 5) | no | no: se detiene en `method` en 5 de 5 |
| 7. Enlaces `file://` | sí | resuelto | no: 0 en los últimos 2000 caracteres de cada turno |

Defectos nuevos o que ahora se ven:

- **N1. La página rica pierde la figura de la nota.** La nota de cada parte trae `lk-story` y `lk-cards`. La página
  de Rust los trae los dos; las de TCP, Bayes, Git y CSS solo traen `lk-cards`, y su figura de la nota no llega al
  alumno. Las puertas y el registro leen la nota, así que no lo ven. Es el defecto de mayor peso de esta corrida.
- **N2. La misma figura, cuatro veces.** TCP, Bayes, Git y CSS tienen la misma forma (3 escenas, 2 actores, un
  movimiento en el paso 2). Cambian los nombres, no el dibujo. El aviso del banco «todas las figuras comparten la misma forma» no
  salta, porque Rust es distinta.
- **N3. Negritas.** 24 a 34 términos en negrita por 1000 palabras (R2: 30 a 38; R1: ~5). Son 4 a 5 definiciones
  por parte, del tipo «**Cliente**: es el equipo que…». La página es sobre todo una lista de definiciones.
- **N4. Claves fijas.** Las diez claves (cinco diagnósticos y cinco mini-quizzes) son `ABC`. Ya no son todas A,
  pero el patrón es el mismo en todos los temas, y se adivina.
- **N5. «El 20% que rinde el 80%».** Aparece en las cinco notas y en las cinco páginas. Es el principio 80/20 que da
  nombre al método `pareto`, que el banco eligió en los cinco temas. Es probable que el encabezado venga de esa
  elección, no de una decisión del tutor: en R1 el tutor eligió `pareto` solo en dos temas.
- **N6. Mini-quiz como texto.** Las tres preguntas aparecen en la página como texto numerado, sin controles. El quiz
  vive en `mini-quiz/p1.json`. Ya se veía en R2.
- **N7. Observación de la skill.** `skills/explicacion-interactiva/SKILL.md` nombra `lk-checkpoint` dos veces, pero
  el kit no lo define (`define('lk-checkpoint'`: 0 en `integrations/pi/kit/kit.js`). Ninguna parte de R3 lo usó.

Lo que mejoró respecto de R1 y R2:

- Las puertas pasan a la primera en las cinco partes. Con las herramientas de hoy, R1 y R2 no pasan.
- La página rica existe en 5 de 5 (R1 y R2: 0).
- Ni cajas ni flechas en las figuras, ni flechas de texto, ni enlaces `file://`.
- Términos explicados entre 67% y 100% (R1: 13% a 44%).
- Frases de 5.5 a 7.9 palabras (R1: 8.9 a 10.3).
- El tutor se detiene en `method` en los cinco temas; el banco elige el método.
- Las notas usan `lk-story` y `lk-cards`; `lk-scene` y `lk-quiz` ya no aparecen.

## Límites de la medida

- **Nota frente a página.** Puertas y registro miden la nota `.md`, como en R1 y R2. La página `.html` (la que lee el
  alumno) solo tiene medidas de piezas y personajes en esta corrida. No hay un medidor de registro para el HTML.
- **Herramientas que cambian.** Entre R1 y R3 cambiaron las herramientas de puertas o de registro en cuatro commits
  (#228, #245, #250, #261); desde R2, en dos (#228, #261). Por eso R1 y R2 se re-puntuaron (columna «hoy»).
- **Método fijo.** El banco eligió `pareto` en los cinco, como en R2. El encabezado N5 y parte de la forma de las
  figuras pueden venir de esa elección.
- **Alumno competente.** El diagnóstico se responde con la clave del quiz, como en R1 y R2: no se mide el camino de
  un alumno que duda.
- **Preferencias por defecto.** El banco no copia `preferencias.md` ni `preferencias.json`, como en R1 y R2.
- **Solo la Parte 1.** Igual que las corridas anteriores.

## Capturas (negro × ancho, 1440 px, escala 2)

Página completa (una por tema, Parte 1):

- `/tmp/bench3-shots/rust-borrowing-p1-black-wide.png`
- `/tmp/bench3-shots/tcp-handshake-p1-black-wide.png`
- `/tmp/bench3-shots/bayes-theorem-p1-black-wide.png`
- `/tmp/bench3-shots/git-branching-p1-black-wide.png`
- `/tmp/bench3-shots/css-flexbox-p1-black-wide.png`

Una captura por pieza (`lk-story`, `lk-cards`, y las dos controles del puente, `lk-video` y `lk-audio`):

- Rust: `rust-borrowing-p1-lk-story-1`, `…-lk-cards-2`, `…-lk-video-3`, `…-lk-audio-4`
- TCP, Bayes, Git y CSS: `<tema>-p1-lk-cards-1`, `…-lk-video-2`, `…-lk-audio-3` (sin `lk-story`: la página no lo trae)
- `lk-tree` y `lk-explorer`: ninguna parte de R3 los usa; no hay captura.

Todas en `/tmp/bench3-shots/` con el sufijo `-black-wide.png`. Las copias de los temas que usó el lector están en
`/tmp/bench3-shots/vault/`.
