Objective: la generación de la página de una parte deja de ser una caja negra. Se mide por fase primero y se decide con el número después, sin cambiar lo que la página es.
Branch: feat/242-pagina-medida (desde origin/main @ ea41d23) · Issue #242, milestone 9 · Runner: `node --test studio/*.test.mjs` · Delivery: ask-on-risk

## Specs

- S1 (medición): la generación de una página registra la duración real de cada fase —construcción del prompt, llamada al tutor, aplicación/referencias, guardado— y la persiste junto al resultado. Hoy los eventos del runtime no llevan timestamp (`studio/runtime.ts:21-33`) y el timeout de 30 s (`studio/runtime.ts:236-246`) es una cota, no una medida.
- S2 (sin cambio visible): la página no cambia de estructura ni de contenido. Mismo markdown, mismos componentes, mismos quizzes, misma calidad. Medir no puede alterar lo medido.
- S3 (decidir con número): cualquier optimización —caché por sección, partir el prompt monolítico (`studio/ui/studio.js:392-407`), reutilizar contexto— se elige con la medición de S1 y se declara con su cifra. No se implementa una optimización que la medición no justifique.

## Tasks

- T1 S1 medir por fase y persistir el reporte junto a la página, sin cambiar el resultado — done `8e38b74` (#242)
- T2 S3 decidir con el número qué optimizar y con qué alcance — pendiente (#242)

## Log

- L1 (2026-11-12, humano): al preguntarle qué acelerar, eligió "ambos por igual" —video y página—, y después autorizó publicar este issue y arrancar midiendo, igual que se hizo con el video.
- L2 (2026-11-12, evidencia del explorador): la ruta de la página no tiene caché por hash (`studio/server.ts:601-615`), usa un prompt monolítico con tope de 20 000 caracteres de entrada (`studio/server.ts:56,624-628`) y no registra duraciones (`studio/runtime.ts:21-33`). El número de llamadas internas del modelo no está fijado en el repo: es lo primero que hay que saber.
- L3 (decisión de método, 2026-11-12): esta feature empieza por medir, y la medición se verifica con el mismo criterio que la del video: se mira el reporte, no la impresión. Cualquier ganancia se compara antes/después con su fase, y la página resultante se compara en contenido.
- L4 (T1, 2026-11-12): una generación escribe su reporte con las fases que existen de verdad —`contexto`/prompt, cada llamada al modelo contada con tamaños de entrada y salida, `motor` por settle y `comprobaciones`— y declara ausentes las que no existen: `referencias` sólo se resuelve en la ruta offline y el guardado ocurre dentro de una llamada al modelo, así que su coste vive en `tutor`. El markdown generado es byte a byte el de antes, y el test que lee el reporte es el mismo que lo afirma. Suite de studio: 336 tests, 333 pass, 3 skipped. Commit `8e38b74`.
- L5 (límite, 2026-11-12): el instrumento está listo pero **todavía no hay un número real**. Medir una generación de verdad exige ejecutar una página completa con el tutor real: minutos de modelo, no segundos de test. Esta tarea entrega el aparato, no la cifra; la cifra sale de la primera generación real que se haga con este código.
