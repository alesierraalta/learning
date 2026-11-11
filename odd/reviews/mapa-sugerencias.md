# Mapa de las reviews del alumno (#203)

Las 14 reviews guardadas en `sugerencias.json` (copia del almacén vivo del 2026-11-06) y qué las
cubre hoy. Una review es de dos clases:

- **parte** — habla de un pasaje de una parte («no entendí esto», «de dónde sale `c/(1−γ)`»). Se
  guarda con `alcance: "parte"` y solo la lee la regeneración de esa parte, como hasta ahora.
- **general** — habla de cómo se hace una explicación en cualquier tema («faltan visuales», «da
  pasos intermedios»). Se guarda con `alcance: "general"` y una `regla` corta, en imperativo, y
  entra en el bloque «Lecciones del alumno (aplícalas siempre)» que llevan **todos** los turnos de
  **todos** los temas (`studio/sugerencias.ts`, `withLecciones`).

La clasificación de una review nueva la decide el estudio, sin modelo, a partir de sus chips:
`faltan-visuales`, `faltan-ejemplos` y `sin-paso-a-paso` nombran una manera de explicar y son
generales; cualquier otra cosa (`no-entendi`, `matematicas-confusas`, `demasiado-texto`,
`muy-abstracto`, `sobran-preguntas`, o palabras sueltas sin chip) es de la parte. Las 14 de abajo
son anteriores a la clasificación: las generales se escribieron a mano en
`studio/lecciones-base.json`, que el estudio lee y mezcla con las reviews generales vivas.

## Las 14, una por una

| id | fecha | tema/parte | motivos | lo que dijo (≤ 120) | clase | qué lo cubre |
| --- | --- | --- | --- | --- | --- | --- |
| `s-7f611d27884e` | 2026-11-03 | `fundamentos-aprendizaje-por-refuerzo`/p3 | faltan-ejemplos, faltan-visuales, muy-abstracto, sin-paso-a-paso, no-entendi | «Realmente los ejemplos no están bien dibujados. faltan diagramas entre texto… los dibujos, las partes visuales» | general | R1, R2, R8 |
| `s-29ac62640001` | 2026-11-03 | `fundamentos-aprendizaje-por-refuerzo`/p3 | faltan-ejemplos, faltan-visuales, sin-paso-a-paso, no-entendi | «los visuales no representan lo que se quiere… las matemáticas las hiciste mal, como tablitas» | general | R1, R5, R8 |
| `s-f22267f0b54e` | 2026-11-05 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «¿Qué robot? ¿Cuáles casillas? Asumes cosas que no son… no sigue los lineamientos de una explicación» | general | R6, R7 |
| `s-f6bf81632440` | 2026-11-05 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «Me equivoqué y escribí lo que había dicho en sugerencias… te vuelvo a pegar cómo debería iniciar una parte» | general | R6, R7 (repite la anterior) |
| `s-d0378399ae26` | 2026-11-05 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «las partes de matemáticas deben indicar qué es cada elemento… q(s,a) donde: a → es …» | general | R3 |
| `s-dc97d9e3dc99` | 2026-11-05 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «después de explicarme una fórmula… debes mostrarme un ejemplo de la fórmula funcionando» | general | R4 |
| `s-3f8702407643` | 2026-11-05 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «el formato de los ejemplos matemáticos debe ser igual al de la fórmula» | general | R4 |
| `s-62bc1a495862` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «El robot está junto al charco… pero no muestras nada, difícil de imaginar» | general | R1, R2 |
| `s-b190c735ccbf` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «éste ejemplo no concuerda con el ejemplo real» | general | R6 |
| `s-4df6b6e60382` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «aquí se debería decir y mejorar visualmente… el robot que se ve que está en la casilla del charco» | general | R1, R2 |
| `s-a6a019ecbccc` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «Dices De dónde sale c/(1−γ) pero no lo habías nombrado antes» | parte | parte: se usa al regenerar esa parte (si se repite, R3) |
| `s-52c82db30f91` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «En ejercicios más largos debes dar pasos intermedios explicando el paso a paso como aquí, y en todo» | general | R5 |
| `s-c563d3a39284` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | — | «No entiendo ésta parte: Dos números que parecen contradecirse… De dónde sale c/(1−γ)» | parte | parte: se usa al regenerar esa parte |
| `s-ce663b847937` | 2026-11-06 | `fundamentos-aprendizaje-por-refuerzo`/p3 | matematicas-confusas, faltan-ejemplos, muy-abstracto | (sin palabras: solo los chips) | general | R4 |

**12 generales, 2 de parte.** Las 12 generales caben en 8 reglas porque varias dicen lo mismo con
otras palabras: `s-f6bf81632440` repite `s-f22267f0b54e`, y «no muestres una caja con el nombre»
aparece en cuatro reviews.

## Las 8 reglas del bloque y qué las hace cumplir

Cada regla es la de `studio/lecciones-base.json`, palabra por palabra (el test
`studio/lecciones.test.mjs` cruza este documento con el seed).

| # | regla | la hace cumplir |
| --- | --- | --- |
| R1 | Dibuja la cosa misma, no una caja con su nombre: la curva, el icono, el estado que cambia | `references/visuales.md` §1 y §9; `tools/explain-check.mjs` mide que haya una escena dibujada (la fidelidad la mide el tutor con la revisión `visual-value`) |
| R2 | Cada idea con forma lleva su figura: si el lector tiene que imaginarla, falta la escena | `tools/explain-check.mjs` (`0 drawn <lk-scene> scene(s)`); `references/estandar-explicacion.md` §5 |
| R3 | Cada fórmula se anota símbolo por símbolo: un callout numerado por símbolo, con su nombre | `tools/explain-check.mjs` (`formula symbol(s) … never named`); `references/visuales.md` §8 |
| R4 | Después de cada fórmula, muéstrala funcionando con números y con la misma notación | `references/estandar-explicacion.md` §4 (aritmética) |
| R5 | Da el paso intermedio de cada cálculo, uno por línea, también en los ejercicios largos | `references/estandar-explicacion.md` §4 (aritmética, línea por línea) |
| R6 | Un solo ejemplo conductor: el escenario y sus números no cambian entre partes | `references/estandar-explicacion.md` §2.2 y §4 («los números de un ejemplo se quedan pegados al ejemplo») |
| R7 | Presenta el ejemplo antes de usarlo: nunca asumas datos que el alumno no tiene | `references/estandar-explicacion.md` §2.1 (caja negra primero, definición después) |
| R8 | Ninguna flecha ni trazo cruza el texto: la punta cae sobre la pieza que nombra | `tools/scene-lint.mjs` (`trazo-sobre-texto`, `flecha-al-aire`), que el estudio corre en cada turno (`docs/studio.md` «The part's own checks») |

**Ninguna regla quedó sin cobertura**, así que no hizo falta añadir texto nuevo a la skill: R1, R2,
R3 y R8 las mide una herramienta, y R4–R7 ya estaban escritas en `estandar-explicacion.md` §2 y §4.
Lo que faltaba no era la regla, era que llegara: hasta ahora la sección existía y el turno de otro
tema no la recibía.

## Cómo entra una regla nueva

1. El alumno escribe una review con un chip general (`faltan-visuales`, `faltan-ejemplos`,
   `sin-paso-a-paso`): el estudio la clasifica sola, le pone la regla del chip y la aplica al turno
   siguiente, en cualquier tema.
2. Una lección que ningún chip nombra y que ya se repitió en varias reviews se escribe a mano en
   `studio/lecciones-base.json` (con las reviews que la enseñaron y qué la hace cumplir) y en la
   tabla de arriba. El seed es del repo: se revisa con el código y aplica desde el despliegue.
3. Si la regla no tiene todavía sección ni comprobación, primero se escribe en la skill
   (`skills/explicacion-interactiva`, la referencia que le toque) y se anota aquí; una regla sin
   nada que la mida o la explique es una opinión.
