# Honest regeneration (#393)

When the tutor does not write a part, or the engine rejects it, the studio asks once for exactly what is missing; if it fails again it keeps the previous version and says so in its own words, in the chat and in the part view. One shared turn path for Pi and Antigravity, never in `studio/agy.ts`.

## Specs

- S1 — Issue #393, Expected 1: "Before giving up, the studio tells the tutor in the same turn what is missing (the part file was not written / the engine rejected it, with the engine's findings) and lets it fix that once; only then it rolls back."
- S2 — Issue #393, Expected 2: "When a regeneration (or a new part) does not land, the chat shows the studio's own verdict, clearly and above the tutor's text: the part was NOT regenerated, the previous version was kept, and why. The tutor's success claim is never the last word." Chat notice wording: «no se regeneró, se mantiene la versión anterior, motivo…».
- S3 — Issue #393, Expected 3: "The topic/part view shows the same state, so the learner does not open an old part thinking it is new." Exact text: «La última regeneración no se completó: se mantiene la versión anterior».
- S4 — The studio's verdict survives a reload and a studio restart (it is part of the saved transcript), and it is never sent back to the tutor as if the tutor or the learner had said it.
- S5 — Learner: «no podemos dejar que eso pase porque eso es tiempo perdido.» / «siempre lo haces solo en pi, no hay forma de que se haga en ambos para no tener que hacerlo 2 veces? usando herencia»: the logic lives in the common turn path in `studio/server.ts`, shared by both runtimes.

## Tasks

- T1 S1-S5 — finish the uncommitted work in this worktree and fix the review defects listed in L2 — writer — pending

## Log

- L1 — Original request (handoff 2026-11-19): «#393, que la app diga la verdad. Cuando el tutor no escribe la parte o el motor la rechaza, la app le manda una corrección en el mismo turno, diciéndole exactamente qué falta. Si vuelve a fallar, restaura la versión vieja y deja en el chat un aviso propio de la app: «no se regeneró, se mantiene la versión anterior, motivo…». La vista de la parte muestra «La última regeneración no se completó: se mantiene la versión anterior». Va en la ruta común de turnos, no en `studio/agy.ts`.»
- L2 — Parent review of the uncommitted diff: (a) `name` already starts with «la Parte N «…»» and the verdict and the correction prompt prefix «La », producing «La la Parte 1»; (b) `studio/state.ts:187` drops every role except `user`/`assistant` when a transcript is read back, so the `studio` verdict is lost after a restart, and `server.ts` inserts it with `as unknown as ChatMessage`; (c) `Turn.correctionsSent` is written and never read; (d) the new test in `studio/layout.test.mjs` was inserted between the `// S3-S5` comment and the test that comment describes.
