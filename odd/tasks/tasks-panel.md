# Tasks panel — state-driven controls, dismissal, result route and one panel at a time (issue #365)

Rama `fix/365-tareas`. Documento de función escrito antes de tocar el código; el encuadre es el panel de tareas y la coexistencia con el cajón del tutor, no un rediseño del cajón.

## Specs

- S1 — El control sigue al estado. Queja literal: "A task that already finished keeps showing only «Detener»". «Detener» existe sólo mientras la tarea pueda detenerse; un estado terminado ofrece lo que su estado permita.
- S2 — Retirar una tarea terminada. Queja literal: "there is no way to remove it from the list". La retirada sobrevive a un repintado del panel.
- S3 — Salida hacia el resultado. Queja literal: "when it ends it does not take you anywhere — unlike the tutor, which offers a button to go." El destino sale de los datos reales de la tarea; si no los hay, no se inventa un enlace.
- S4 — Un panel a la vez. Queja literal: "And opening Tareas and Tutor at the same time puts one panel on top of the other." Abrir uno cierra el otro, con `aria-expanded` veraz y foco que nunca queda en un panel oculto; ni anchura ni geometría de escritorio cambian.
- S5 — Estado desconocido honesto. "an unknown state shows an honest unknown — never `done`". Los seis grupos del cajón del tutor siguen fusionados como están.

## Tasks

- T1 — S1,S5 — sustituir el botón fijo y el `?? "done"` por controles y texto que sigan al estado real — `studio/ui/studio.js` — unstarted — commit: 
- T2 — S2 — retirar una tarea terminada sin que reaparezca al repintar — `studio/ui/studio.js` — unstarted — commit: 
- T3 — S3 — ofrecer la salida real que los datos de la tarea permitan — `studio/ui/studio.js` — unstarted — commit: 
- T4 — S4 — exclusión mutua de Tareas y Tutor, `aria-expanded` y foco — `studio/ui/studio.js`, `studio/ui/studio.css` — unstarted — commit: 
- T5 — S1,S2,S3,S4,S5 — pruebas de navegador para cada regresión y evidencia de la suite — `studio/layout.test.mjs` — unstarted — commit: 

## Log

- L1 (issue #365, verbatim): "A task that already finished keeps showing only «Detener», there is no way to remove it from the list, and when it ends it does not take you anywhere — unlike the tutor, which offers a button to go. And opening Tareas and Tutor at the same time puts one panel on top of the other."
- L2 — Los datos no bastan para inventar un destino: `api/tareas` sólo publica `topic`, `state`, `activity` y `queued` (`studio/tasks.ts:15`). La salida real está en los eventos `tool` del stream de la tarea, que llevan `note` (`studio/server.ts:911,952`); sin nota, la tarjeta ofrece el tema real de la tarea sólo si la biblioteca lo inscribe, y si no, lo dice sin enlace. Los cinco tests de navegador fallaron antes del cambio y pasan después.
- L3 — Revisión independiente: dos defectos altos en «Quitar» — (1) la retirada no sobrevivía a `page.reload()` porque vivía en un `Set` en memoria; (2) la clave era el tema, así que una tarea posterior del mismo tema quedaba invisible. La clave elegida es `localStorage["estudio.tareas.descartadas"][topic] = JSON.stringify({state, activity})`: el resumen no trae un id de ejecución, y el estado terminal junto con la actividad es lo único que distingue la instancia terminada. Un estado no terminal (`working`/`waiting`/`asking`) borra esa entrada en cuanto se informa, y «Quitar» sigue oculto mientras la tarea pueda detenerse.
