# panorama-estudio

Un tema del Estudio gana dos secciones panorámicas —Planificación y Mapa de dependencias— con desglose al clic; el chat deja de mostrar avisos internos del arnés; y una parte sin escribir nunca es un callejón sin salida.
Branch: `feat/panorama-estudio`

## Specs

S1 — Un tema tiene dos secciones nuevas y separadas, «Planificación» y «Mapa de dependencias», panorámicas y navegables, dentro del Estudio: «debe poder haber una sección dentro de las notas que yo pueda ver la planificación y el mapa de dependencias así bien bonito como tenemos el diseño de forma completa, panorámica y muy bonita. Tanto la planificación, o sea, uno para la planificación y otro para el mapa de dependencias».
  S1.1 La sección Planificación muestra la ruta completa del tema: cada parte del plan con su número, título, subtema, estado (escrita / ahora / pendiente), las promesas del plan (ejemplos y visuales) y el enfoque del diagnóstico; y las secciones de `planificador.md` como desplegables.
  S1.2 La sección Mapa de dependencias dibuja `mapa.mmd` como un mapa propio (pan/zoom, grupos por subgrafo, estados con color) en vez de un Mermaid vertical apretado.
  S1.3 Ambas secciones usan los tokens y el lenguaje visual del Estudio y se apilan en una pantalla estrecha.

S2 — Cada elemento se puede desglosar y conecta con la explicación: «y que se puedan desglosar. O sea, que si yo le doy clic a una dependencia, me despliegue algo que me sirva para ver más o menos cómo está conectado todo con mis explicaciones».
  S2.1 Al clic en un concepto del mapa se abre su detalle: título, estado evaluado, de qué depende, qué desbloquea, y la parte del plan que lo explica, con enlace a leerla.
  S2.2 Un concepto cuyo número (`1.2.1.3`) cae dentro del subtema de una parte (`1.2.1a`) nombra esa parte; si ninguna parte lo cubre todavía, lo dice y ofrece pedirla.

S3 — El chat del Estudio no muestra los avisos internos del arnés: «Hay una sección dentro del tutor que dice que si Gentle AI received driving development status is unavailable native… Quiero que esa parte ya no aparezca dentro del chat».
  S3.1 Un `notify` cuyo texto es del arnés (prefijo «Gentle AI», «el Gentleman» o «gentle-ai») no llega al hilo; se registra en stderr para el operador.
  S3.2 Los avisos del propio tutor sobre el tema siguen llegando.

S4 — Una parte sin escribir se puede pedir desde donde se ve: «me dice que la parte 1 todavía no está escrita y por más que yo le dé a la parte del tutor a ver el tema, no me lleva… no me deja hacer absolutamente más nada».
  S4.1 Cada parte pendiente de la ruta lleva su acción visible «Escribir esta parte», no solo la primera.
  S4.2 La tarjeta del siguiente paso pide escribir esa parte también cuando el motor todavía no marcó una parte actual.
  S4.3 La acción queda disponible aunque el motor no lleve seguimiento del tema.

## Tasks

| # | Spec | Entregable | Commit |
|---|------|------------|--------|
| T1 | S3 | El chat filtra los avisos del arnés | C1 · `8cb003f` |
| T2 | S4 | Toda parte pendiente es accionable | C2 · `daf9fb9` |
| T3 | S1.1, S1.2, S2.2 | `studio/panorama.ts`: plan + secciones + mapa parseado y maquetado | C3 · `ff2c4c4` |
| T4 | S1, S1.3, S2.1 | Vista Panorama, navegación y estilos | C4 · `0661e13` |
| T5 | S1–S4 | Verificación completa y docs | C5 · `4ecefa9` |

## Log

L1 — alesierraalta (10/30/2026 12:43): «debe poder haber una sección dentro de las notas que yo pueda ver la planificación y el mapa de dependencias así bien bonito como tenemos el diseño de forma completa, panorámica y muy bonita. Tanto la planificación, o sea, uno para la planificación y otro para el mapa de dependencias, y que se puedan desglosar. O sea, que si yo le doy clic a una dependencia, me despliegue algo que me sirva para ver más o menos cómo está conectado todo con mis explicaciones. La idea es tener un ecosistema de explicaciones donde el alumno pueda ver todo. Y está buenísimo esa parte que me gusta mucho.»

L2 — alesierraalta (10/30/2026 12:43): «Hay una sección dentro del tutor que dice que si Gentle AI received driving development status is unavailable native, etcétera, etcétera, etcétera. Quiero que esa parte ya no aparezca dentro del chat porque creo que se ve bastante feo. No sé, creo que sí, pero lo quiero quitar. Entonces, bueno, para que lo quites, pues.»

L3 — alesierraalta (10/30/2026 12:45): «Ok, ya me aparece el botón de ir al tema, o sea, ver el tema. ¿Qué pasa? Me devuelve a la página donde te da como el roadmap, pero ya hice el diagnóstico inicial, me sale hecho, enfocó el plan de tu ruta, pero pues me dice que la parte 1 todavía no está escrita y por más que yo le dé a la parte del tutor a ver el tema, no me lleva me lleva solamente al roadmap y no puedo hacer nada más, no me deja hacer absolutamente más nada.»

L4 — evidencia: `/home/alesierraalta/gentle-pi/extensions/gentle-ai.ts:1188` emite `Gentle AI: receipt-driven-development status is unavailable: …` por `ctx.ui.notify`; el RPC lo entrega como `extension_ui_request/notify` y `studio/server.ts:279` lo reenvía al hilo como `notice`.
L5 — evidencia: `studio/ui/studio.js:415` solo ofrece «Pedir esta parte» a la primera parte pendiente y como botón fantasma; el resto de las pendientes no lleva acción. Las partes se marcan escritas en `integrations/pi/bridge.ts` (`listTopics`, `written: rich || note !== undefined`).
L6 — decisión: la vista Panorama vive en el Estudio (`#/panorama/<tema>`), porque es la superficie ancha y ya tiene la biblioteca y el estado del motor; se abre desde el tema y desde la barra del lector, y su mapa se dibuja con maquetación propia en lugar de Mermaid para poder desglosar cada concepto.
L7 — evidencia (T4): el mapa real declara conceptos sin flechas y la clase va en `:::cls` (tres dos puntos). Dos defectos del parser aparecieron al escribir la prueba: los conceptos sueltos no entraban y el grupo de la clase pedía dos dos puntos, así que ningún `:::ok`/`:::neu` se aplicaba. Ambos se corrigieron en `studio/panorama.ts` y quedaron fijados por «a concept the tutor declares without an edge still belongs to the map».
L8 — evidencia (T4): con `width`/`height` fijos en el `<svg>`, el encuadre empujaba el dibujo fuera de su propia caja y el clic sobre un concepto caía en el lienzo; ahora el dibujo ocupa el lienzo (unidad = píxel CSS) y un `ResizeObserver` reencuadra cuando el cajón del chat cambia el ancho.
L9 — decisión: la vista de planificación no repite la tabla de plan ni el diagrama del mapa, porque la ruta ya es la tabla y el mapa tiene su propia vista; `parsePlan` descarta esas dos secciones y conserva el resto del texto.
L10 — evidencia (T5, datos reales): el `mapa.mmd` de `gramatica-y-phrasal-verbs-speaking` es plano y escribe el subtema después de un punto (`Frase base · 1.1 · pregunta 1 · verde`), así que ningún concepto quedaba ligado a su parte. `parseMap` ahora lee también esa forma: el segmento que es solo un número es el subtema, el primer nombre es el título y el resto va como nota. Queda fijado por «a map that writes its subtema after a dot still links every concept to its part». Sobre el vault real: `paradigma-relacional-sql-transacciones` liga 28/28 conceptos y `gramatica-y-phrasal-verbs-speaking` 4/6 (los otros dos son `P0.5` y un concepto sin número, que dicen en su caja que no tienen parte).
L11 — evidencia (T5): suites completas del estudio en verde — `node --test studio/server.test.mjs studio/panorama.test.mjs studio/layout.test.mjs`. Las advertencias del compilador sobre `node:*`/`process`/`Buffer` son del entorno (el repo no tiene `package.json` ni `node_modules`, por diseño) y aparecen igual en archivos que este trabajo no tocó.

L12 — evidencia (cierre): para publicar la rama hubo que rebasar sobre `origin/main` (6 commits del flujo de quiz tocaban `studio/ui/studio.js`, `studio/server.ts` y `studio/ui/studio.css`). Los conflictos se resolvieron conservando ambos lados: los tests de quiz del main y los del panorama; el `mapa.mmd`/`planificador.md` del fixture quedaron intactos. Los hashes de la tabla son los de la rama rebasada; suite completa en verde después del rebase.
