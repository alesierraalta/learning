# Cuarta corrida del banco del tutor (issue #246)

Corrida del 2026-11-13, 14:16:35–14:57:07 UTC, sobre el VPS con el repo desplegado en **`2fcd035`** (`main`; el commit trae el PR #268, el arreglo de #265). El `HEAD` se muestreó cada 30 s durante toda la corrida (83 muestras, de 14:16:35 a 14:57:36 UTC): todas dan `2fcd035`. El `HEAD` de cada tema al inicio y al final, y el de la corrida, son `2fcd035`. Sigue en `2fcd035` después de la corrida.

Raíz de prueba `/tmp/bench4-246/scratch` (propia), salida `/tmp/bench4-246/out`, puertos 4799–4803, estado y caché XDG propios por tema, token derivado del tema. Mismo runtime, modelo, reglas y skill que R1–R3: `agy` · `gemini-3.8-flash-high`, `rules/deep.json`, `explicacion-interactiva`. Mismo procedimiento que R3: modo Universitario; diagnóstico respondido por `submit` con la clave del propio quiz (alumno competente); método `pareto` por `api/metodo` cuando el motor lo pide; Parte 1 pedida con el texto del botón, en el turno del método.

Diferencias con R3: los cinco temas corrieron **a la vez** (`--concurrency 5`; R3 fue en serie), cada uno con su propio proceso y token. El banco no cambió en lo que mide: las mismas cuatro puertas (`scene-gate`, `scene-lint`, `deck-gate`, `explain-check`), el mismo medidor de registro (`tools/register/measure.mjs`, sin cambios desde `ffa08a8`) y las mismas piezas.

Vault real (`~/Learnings`): `git status --porcelain` antes y después, idéntico (53 512 bytes). Producción: `learning-studio` activo, MainPID 253364, iniciado a las 14:11:06 UTC, antes de la corrida, así que no se reinició; 4747 y 4748 escuchando; `learning-autodeploy` inactivo antes y después. No se envió ninguna señal ni comando de control a esos servicios.

## Qué leyó el alumno: la nota, no un `.html`

- **La nota en las cinco partes.** En las copias no hay ningún `.html` (0 archivos en los cinco temas). Desde #265 el tutor no escribe una página aparte: `deploy/vps/learnings/AGENTS.md:31` y `studio/agy.ts:39` dicen que la nota es lo que lee la persona. R3 tenía la página en las cinco partes.
- **Comprobado por HTTP.** La ruta de la vista (la que usa `api/view`) responde 200 con la CSP de página (`PAGE_CSP`, `bridge.ts:71`, no la de la página rica) y con `"kind":"part"` en el HTML: es la rama de la nota de `partPage` (`integrations/pi/bridge.ts:1342–1376`).
- **La regla que aplicaría a un `.html`.** Se sirve una página sólo si existe y pasa `richPageServes` (`bridge.ts:273–281`): trae cada figura de la nota, trae el `lk-quiz` cuando hay mini-quiz y pasa explain-check. Sin página, no se llega a ese punto.
- **El mini-quiz.** La nota se dibuja sin su sección «## Mini-quiz» (`withoutMiniQuiz`, `bridge.ts:1376`), y el cuestionario interactivo sale de `mini-quiz/p1.json`: en cada página, 3 `fieldset` y 24 `radio`. No hay ninguna línea de texto numerada visible en las cinco (en R3 sí la había).

## Tabla 1: puertas, correcciones, lector y tiempo

| | R1 (`1d9046f`) | R2 (`53700d1`) | R3 (`ffa08a8`) | R4 (`2fcd035`) |
| --- | --- | --- | --- | --- |
| Puertas, medidas en su corrida | 4/4 en los 5 | 4/4 en 4 (CSS no medido) | 4/4 en los 5 | 4/4 en los 5 |
| Puertas, con las herramientas de 2fcd035 | 5 de 5 fallan `explain-check`; Rust además `scene-gate` y `scene-lint` | 4 de 4 fallan `scene-gate` y `explain-check` | 5 de 5 fallan `explain-check` | 5 de 5 pasan las cuatro |
| Correcciones (informes de tiempo) | 0 (no había informes) | 0 (no había informes) | 0 en los 5 | 1 en CSS (`part-correction`); 0 en los otros 4 |
| Fallos de puerta en el log | — | — | 0 | 0 |
| Lo que sirvió el lector | la nota (0 de 5 con página) | la nota (0 de 4 con página) | el `.html` en 5 de 5 | la nota en 5 de 5 (no hay `.html`) |
| Turnos por tema | 2–3 | 3 | 3 | 3 |
| Minutos: Rust · TCP · Bayes · Git · CSS | 26 · 12 · 8 · 7 · 6 | — | 27 · 9 · 5 · 6 · 7 (en serie) | 23.0 · 33.1 · 21.2 · 40.5 · 34.5 (a la vez) |

Notas de la tabla:

- **Herramientas de 2fcd035 sobre R1–R3.** Se volvieron a puntuar las notas de la Parte 1 de las copias de cada corrida con las cuatro puertas de 2fcd035. El cambio viene de #265: `tools/explain-check.mjs` ahora rechaza una lista numerada bajo «Mini-quiz» (`FALLA mini-quiz · la lista numerada bajo «Mini-quiz» es el quiz sin controles`), que era el defecto 10 de la tabla de defectos. Por eso R3, que pasó 4/4 con las herramientas de su corrida, falla hoy. En R1 y R2 la lista numerada también aparece (comprobado en cuatro notas), y fallan otras reglas además: R1 Rust falla también `escenario-de-cajas`, `historia-quieta`, `clave-muerta`, `termino-sin-explicar`, `frases-largas`, `sin-contraste` y `figuras`; R2 Rust, `marca-eco`.
- **Correcciones.** En R3 y R4 son los informes de tiempo del estudio (`engine-correction` y `part-correction`). La de CSS es la única medida en R3 y R4. El informe la registra como `part-correction` (60 s, dentro del turno del método), y en el log no hay ninguna puerta fallida. La causa no está en el registro: queda abierta (N-A).
- **Turnos de R4.** Tres en todos los temas (aprender, diagnóstico, método). La Parte 1 se escribe en el turno del método, como en R3.

## Tabla 2: piezas y personajes visibles en la página

Piezas contadas en el DOM, en el navegador, black × wide. Personajes leídos de los `<script type="application/json">` que la página conserva; coinciden con los de la nota.

| Tema | R3, página `.html` (piezas · personajes de la nota) | R4, página = nota: piezas en el DOM | R4: personajes en la página | R4: cuestionario |
| --- | --- | --- | --- | --- |
| Rust borrowing | lk-story, lk-cards · s, r1 (&s), r2 (&s), r (&mut s), r2 (&mut s) | lk-story 1, lk-cards 1 | s, r1: &s, r2: &s, r: &mut s, r2: &mut s | 3 preguntas |
| TCP handshake | lk-cards (sin figura) · cli, srv | lk-story 1, lk-cards 1 | cli, srv | 3 preguntas |
| Bayes' theorem | lk-cards (sin figura) · total, casos | lk-story 1, lk-cards 1 | total, casos | 3 preguntas |
| Git branching | lk-cards (sin figura) · C1, main | lk-story 1, lk-scene 1 | HEAD, main, Commit, 1a2b3c, 5d6e7f | 3 preguntas |
| CSS flexbox | lk-cards (sin figura) · barra, hijos | lk-story 1, lk-scene 1 | Inicio, Buscador, Perfil | 3 preguntas |

Notas:

- Rust, TCP y Git traen un `lk-quiz` dentro de «## Mini-quiz» en la nota. El lector no lo dibuja (esa sección se quita) y pone el cuestionario interactivo de `mini-quiz/p1.json`.
- Los botones «Generar video» y «Generar debate / charla / entrevista / explicación» aparecen en las cinco páginas como controles de la página. No son piezas `lk-video` ni `lk-audio`, así que el contador no los cuenta.
- Caracteres visibles en la página (black × wide): Bayes 3 941, Rust 4 557, TCP 4 975, CSS 4 638, Git 3 532.

## Tabla 3: registro (`tools/register/measure.mjs`, sobre la nota)

Cada celda lleva R1 · R2 · R3 · **R4**. R1–R3 son las cifras de `findings-3.md`; el medidor no cambió desde `ffa08a8`.

| Tema | Palabras/frase | Términos explicados (uso) | Negritas/1000 | Contrastes/1000 | Palabras (R4) |
| --- | --- | --- | --- | --- | --- |
| Rust borrowing | 8.9 · 6.8 · 6.3 · **7.1** | 31% · 100% · 100% · **85%** | 5.8 · 37.9 · 33.6 · **24.9** | 0.00 · 15.2 · 13.4 · **14.9** | 201 |
| TCP handshake | 9.8 · 8.0 · 6.9 · **6.8** | 29% · 83% · 82% · **86%** | 5.3 · 37.6 · 29.6 · **29.1** | 5.3 · 16.1 · 17.8 · **14.5** | 275 |
| Bayes' theorem | 10.1 · 6.3 · 7.9 · **6.7** | 33% · 100% · 80% · **67%** | 5.2 · 37.0 · 23.8 · **24.5** | 0.00 · 22.2 · 11.9 · **12.3** | 163 |
| Git branching | 10.0 · 7.7 · 5.5 · **5.9** | 13% · 50% · 70% · **50%** | 5.2 · 30.5 · 30.8 · **26.5** | 0.00 · 18.3 · 15.4 · **26.5** | 151 |
| CSS flexbox | 10.3 · — · 6.6 · **7.8** | 44% · — · 67% · **100%** | 5.0 · — · 28.2 · **25.3** | 0.00 · — · 14.1 · **18.1** | 277 |

Palabras por parte: R1 173–199, R2 132–186, R3 130–169, R4 151–277. Las puertas pasan con todas esas notas.

## Tabla 4: figuras

Cada escena se da como `cajas·flechas·actores·piezas·movimientos`.

| Tema | R3 (nota) | R4 (nota = página) |
| --- | --- | --- |
| Rust borrowing | 0 cajas, 0 flechas; 0 movimientos | 3 escenas: `0·0·3·2·0`, `0·0·2·1·0`, `0·0·3·2·0`; 0 movimientos |
| TCP handshake | 0 cajas, 0 flechas; 1 movimiento | `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·0·0`; 1 movimiento |
| Bayes' theorem | 0 cajas, 0 flechas; 1 movimiento | `0·0·2·1·0`, `0·0·2·1·1`, `0·0·2·0·1`; 2 movimientos |
| Git branching | 0 cajas, 0 flechas; 1 movimiento | `3·2·0·0·0`, `0·0·1·2·0`, `0·0·2·2·1`, `0·0·2·3·0`; 1 movimiento |
| CSS flexbox | 0 cajas, 0 flechas; 1 movimiento | `3·2·0·0·0`, `0·0·3·0·1`, `0·0·3·0·1`, `0·0·3·0·0`; 2 movimientos |

R1 tenía dos cajas y una flecha en las cinco; R2, cero cajas. En R4, CSS y Git abren con la misma escena de tres cajas y dos flechas (en Git, HEAD → main → Commit), y Bayes y TCP comparten la misma estructura de tres escenas con dos actores.

## Tabla 5: claves de respuesta

| Tema | Diagnóstico | Mini-quiz |
| --- | --- | --- |
| Bayes' theorem | BDA | BDA |
| Rust borrowing | BAC | BAC |
| TCP handshake | BDA | BAC |
| CSS flexbox | BAC | BCA |
| Git branching | BDA | BDA |

Patrón: 10 de 10 claves empiezan por **B**, y sólo hay tres cadenas (BDA ×5, BAC ×4, BCA ×1). En las 30 respuestas: A 10, B 10, C 5, D 5. R1: todas A. R2: no todas A (sin recuento de letras). R3: ABC en las diez. Las claves siguen siendo predecibles; cambia la letra, no el patrón.

## Defectos que se repiten (y su estado)

| Defecto | R1 | R2 | R3 | R4 | Estado en R4 |
| --- | --- | --- | --- | --- | --- |
| 1. Figura repetida (R1: dos cajas y una flecha; R3: misma estructura en cuatro temas) | sí | resuelto en la forma | resuelto: 0 cajas | cambió: 3 cajas y 2 flechas en la primera escena de CSS y Git; Bayes y TCP comparten la estructura | recurre en otra forma |
| 2. Recorrido sin movimiento | sí (0) | parcial (1 a 3) | Rust 0; resto 1 | Rust 0; resto 1 o 2 | recurre (Rust) |
| 3. Flechas de texto en la cabecera | sí | parcial | no | no (0 en las cinco notas) | resuelto |
| 4. Claves de respuesta fijas | todas A | no todas A | ABC en las diez | B en la primera posición de las diez; tres cadenas | recurre |
| 5. Página rica | no existe | 0 de 4 | existe en 5 de 5; sin figura en 4 | no existe: la regla de #265 pide la nota | cambió por diseño |
| 6. El tutor elige el método | sí (2 de 5) | no | no: se detiene en `method` en 5 de 5 | no: se detiene en `method` en 5 de 5; el banco responde `pareto` | recurre |
| 7. Enlaces `file://` | sí | resuelto | no | no (0) | resuelto |
| 8. Negritas (24–34 por 1000 en R3) | ~5 | 30–38 | 24–34 | 25–29 (24.5–29.1) | recurre |
| 9. «El 20% que rinde el 80%» | — | — | 5 de 5 | 5 de 5 (encabezado del método `pareto`) | recurre |
| 10. Mini-quiz como lista numerada | — | sí | 5 de 5 | 0 de 5: quiz interactivo | resuelto en la página; `explain-check` ya lo rechaza |
| 11. La página rica pierde la figura de la nota | — | — | sí (4 de 5) | no aplica: no hay página | cambió por diseño |
| 12. `lk-checkpoint` nombrado en la skill sin definición | — | — | sí (2 líneas que la nombran) | sí (1 línea que la nombra; el kit no lo define; ninguna parte lo usó) | sigue |

Notas: el defecto 6 es una elección del banco (`pareto` en las cinco), y el 9 sale de esa misma elección. Los defectos de R3 «misma figura en cuatro temas» y «claves fijas» quedan en los números 1 y 4.

## Defectos nuevos o cambiados en R4

- **N-A. Corrección en CSS.** Un `part-correction` de 60 s dentro del turno del método (`css-flexbox-timings/`, `inputChars` 2077). El log no tiene ninguna puerta fallida y el informe no dice qué la pidió. Queda sin explicar: hay que leer el prompt de esa llamada.
- **N-B. Icono sobre la etiqueta.** En la pieza `lk-scene` de Git (`git-branching-p1-lk-scene-1-black-wide.png`), el icono de documento tapa parte de la palabra «Commit». Lo vi en la captura; el banco no lo mide.
- **N-C. Git, el registro más cargado.** Contraste 26.5 por 1000 (el más alto de R4; los demás están entre 12.3 y 18.1) y 50 % de términos explicados (el más bajo).
- **N-D. Notas más largas.** 151–277 palabras por parte (R3: 130–169). Pasan las puertas; el alumno lee más.

Resuelto en R4: flechas de texto (0), `file://` (0), lista numerada del mini-quiz (0) y figura perdida al pasar a la página (no hay página).

## Capturas (negro × ancho, 1440 px, escala 2)

Página completa, Parte 1:

- `/tmp/bench4-shots/rust-borrowing-p1-black-wide.png`
- `/tmp/bench4-shots/tcp-handshake-p1-black-wide.png`
- `/tmp/bench4-shots/bayes-theorem-p1-black-wide.png`
- `/tmp/bench4-shots/git-branching-p1-black-wide.png`
- `/tmp/bench4-shots/css-flexbox-p1-black-wide.png`

Una captura por pieza. El cuestionario interactivo no es una pieza `lk-*`, así que no tiene captura propia; aparece en las capturas completas.

- Bayes: `bayes-theorem-p1-lk-story-1-black-wide.png`, `bayes-theorem-p1-lk-cards-2-black-wide.png`
- Rust: `rust-borrowing-p1-lk-story-1-black-wide.png`, `rust-borrowing-p1-lk-cards-2-black-wide.png`
- TCP: `tcp-handshake-p1-lk-story-1-black-wide.png`, `tcp-handshake-p1-lk-cards-2-black-wide.png`
- CSS: `css-flexbox-p1-lk-scene-1-black-wide.png`, `css-flexbox-p1-lk-story-2-black-wide.png`
- Git: `git-branching-p1-lk-scene-1-black-wide.png`, `git-branching-p1-lk-story-2-black-wide.png`

Las copias que leyó el lector están en `/tmp/bench4-shots/vault/`.

## Límites

- **Concurrencia.** Los temas corrieron a la vez, así que los minutos no son comparables con la serie de R3. Los turnos de método llegaron a 1 833 s.
- **Re-puntuación de R1–R3.** Se hizo sobre las copias de scratch de cada corrida (`/tmp/bench-shots`, `/tmp/bench2-shots`, `/tmp/bench3-shots`), que no están en el repo. Sus resultados quedan en las tablas de este documento.
- **Fuera de XDG.** El runtime `agy` puede escribir bajo `$HOME`, y el banco no lo aísla (límite conocido de `README.md`). No lo verifiqué en esta corrida; el vault real no cambió.
- **Alumno competente, método fijo, sin preferencias, sólo la Parte 1.** Igual que en las corridas anteriores.
- **Medición del lector.** Piezas y personajes se leen del DOM y de los payloads que la página conserva. No hay un medidor de registro para el HTML que lee el alumno, porque ahora la página es la nota.
- **Operación.** `rtk` no está instalado en el VPS: los comandos remotos se lanzaron con `rtk ssh -x synchub`. El directorio de salida se trajo con `ssh -x synchub` directo, porque el filtro de salida de `rtk` corrompe un flujo `tar`.

## Cómo se corrió

En el VPS, con `bench.mjs` copiado byte a byte del repo (sha256 `599752a4…`), en `/tmp/bench4-246`, lanzado con `setsid` en su propio grupo de procesos, y con un vigilante de `HEAD` que lo detenía si salía de `2fcd035`:

```bash
node bench.mjs run --repo "$HOME/learning" --scratch /tmp/bench4-246/scratch \
  --out /tmp/bench4-246/out --port 4799 --concurrency 5 --vault "$HOME/Learnings"
```

En local, sobre la copia de la salida en la misma ruta absoluta:

```bash
node tools/agy-bench/bench.mjs gates --repo . --out /tmp/bench4-246/out
PLAYWRIGHT_MODULE=/home/ale/.npm-global/lib/node_modules/playwright/index.mjs \
  node tools/agy-bench/bench.mjs shots --repo . --out /tmp/bench4-246/out --shots /tmp/bench4-shots
```

La comprobación de la ruta de la vista, la re-puntuación de R1–R3 y el resumen de resultados fueron scripts sueltos en el scratch, fuera del repo. El scratch (`/tmp/bench4-246`) se borró al terminar; las capturas se conservan en `/tmp/bench4-shots/`.
