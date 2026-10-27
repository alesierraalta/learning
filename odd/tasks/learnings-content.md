# Learnings · contenido de Fundamentos del Aprendizaje por Refuerzo

Rama: `feat/topic-gaps` (código) · vault `~/Learnings` en el VPS (contenido)
Estado: p1 y p2 escritas con visuales y mini-quiz; p3 migrada al tema canónico y con figuras nuevas; p4–p7 pendientes; app interactiva pendiente de decisión.

## Specs

- **S1.** `fundamentos-aprendizaje-por-refuerzo` debe tener escritas las partes 1 y 2 con el mismo nivel que la parte 3: fuente citada, ejemplo que corre, al menos dos visuales y mini-quiz de cuatro preguntas con opciones A–E incluida «No sé».
- **S2.** Cada parte escrita lleva su `mini-quiz/<parte>.json` con `id`, `central`, `subtema`, `nivel`, `conceptos`, `enunciado`, `options` A–E y `answer`.
- **S3.** La parte 3 conserva su contenido y gana figuras: no puede quedarse «solamente con la app interactiva».
- **S4.** Los visuales deben dibujarse en la vista real: la vista convierte bloques ```` ```mermaid ```` en diagramas y conserva SVG en línea; un `<pre class="mermaid">` dentro de `<figure>` no se dibuja.
- **S5.** No puede haber dos temas con el mismo título: el duplicado `prueba-vista-aprendizaje-por-refuerzo` se archiva.
- **S6.** El motor debe reportar qué falta por tema (partes sin escribir, partes sin visuales, partes sin mini-quiz) en vez de decir solo «no escrita».

## Tasks

- T1 · S6 · auditar huecos en `integrations/pi/bridge.ts` + `studio/ui/studio.js` · commit `5ceece8` (PR #6, merge `596cb23`)
- T2 · S1, S2 · escribir `Parte 1 - Agente y entorno.md` + `mini-quiz/p1.json` · commit `fe8a03e` (vault)
- T3 · S1, S2 · escribir `Parte 2 - RL frente a supervisado.md` + `mini-quiz/p2.json` · commits `fe8a03e`, `231025e`
- T4 · S3 · migrar la parte 3 (nota, app, demo, quiz) al tema canónico y añadir dos figuras SVG · commit `fe8a03e`
- T5 · S5 · archivar `prueba-vista-aprendizaje-por-refuerzo` en `_archivo/` · commit `fe8a03e`
- T6 · S4 · verificar que los visuales se dibujan con el renderizador real (`marked` 15 + `DOMPurify` 3) · sin commit (verificación)
- T7 · S1 · escribir p4–p7 con visuales y quiz · pendiente
- T8 · decisión · mejorar la app interactiva de p3 («putrefacta») · pendiente de decisión del usuario

## Log

- **L1** (usuario, verbatim): «fíjate que lo que te había dicho en el aprendizaje por refuerzo que justamente lo de fundamentos aprendizaje por refuerzo parte tres no están las visuales solamente está la app interactiva que de paso es putrefacta de verdad parece que lo hizo un modelo del dos mil veinticuatro entonces no entiendo por qué si te pido que hagas algo no lo haces»
- **L2** (usuario, verbatim): «Me faltan las otras partes, me sale parte uno todavía no escrita, parte dos todavía no escrita … tienes que encontrar la forma de que el motor detecte que faltan cosas»
- **L3** (evidencia, 2026-10-27): `/api/library` → `fundamentos-aprendizaje-por-refuerzo | partes: 7 | faltan: ['p4','p5','p6','p7'] | sinVisuales: []`, con `p1 visuales: 4`, `p2 visuales: 3`, `p3 visuales: 5`, las tres con `quiz: true`.
- **L4** (hallazgo): la vista renderiza en el cliente (`integrations/pi/view/app.js:25`), así que el HTML del servidor no contiene el `<svg>`: hay que verificar con el DOM renderizado, no con `curl`. Los SVG en línea y las tablas sobreviven a `DOMPurify`; los bloques ```` ```mermaid ```` se convierten en diagramas y un `<pre class="mermaid">` no.
- **L5** (causa de la queja): existían dos temas con el mismo título; el canónico no tenía nada escrito y el de pruebas solo la parte 3. La parte 3 no tenía figuras, solo un diagrama y la app.
