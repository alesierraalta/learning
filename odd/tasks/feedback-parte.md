# Feedback por parte

Objective: a learner can say, at the end of an explained part, whether it worked (thumb up or
down), why, and in their own words — and that record is what makes the following explanations more
theirs. Today only complaints can be recorded, and they reach only the regenerate prompt.

Milestone 13. Issues #412 (the record), #413 (the bar and the dialog), #414 (what the tutor reads).
Branch `feat/412-feedback-parte`, cut from `origin/main`. Push, PR and merge stay the owner's.

## Specs

S1 — "al terminar una parte, estaría bueno integrarle un sistema de feedback, tipo un pulgar
arriba, un pulgar abajo, explicar, o sea, además de lo que ya tenemos o sea, un sistema más
completo de feedback".

S2 — "estar bueno también poder decir las cosas buenas que tiene para tener registro de qué gusta,
qué no gusta, y así ir puliendo cada vez más el sistema de explicaciones del usuario
personalizado".

S3 — "además de lo que ya tenemos": `Sugerir` and `Regenerar` keep their meaning, their bodies and
their flow. A verdict is a third thing, not a rename.

S4 — Measured, not assumed: every motive in `studio/sugerencias.ts:22-29` is a complaint, and
`tutorContext` — the only carrier of the learner's opinions — is called only by the regenerate
prompt (`studio/server.ts:2292`) and `GET api/contexto` (`:2985`). The normal write turn gets
`withLecciones(text)` and nothing else (`:1747`). S2 is unmet today for that reason, not for lack of
a button.

S5 — The verdict record stays apart from `sugerencias.json`: `directrices()` drives corrections and
must not be fed with praise, and a suggestion asks for a change while a verdict reports what the
material did to the learner.

S6 — Same discipline as the rest of the studio: one bounded document, an atomic replace, a damaged
file never blocks the studio, no field above 2000 characters, and the tutor reads a bounded digest
never the whole history.

S7 — The studio's own UI rules still hold: 44 px targets on a coarse pointer, Spanish in neutral
tuteo, and nothing is saved without the learner's tap.

## Tasks

| ID | Specs | What | Route | Commit |
|---|---|---|---|---|
| T1 | S1,S2,S5,S6 | `studio/valoraciones.ts`: document, motives with a sign, validation, record/list, `loQueGusta`; `POST`/`GET api/valoraciones`; tests | inline | pending |
| T2 | S1,S3,S7 | Reader bar: thumbs, dialog with the sign's motives and the learner's words, existing verdict shown on reload; layout and body tests | inline | pending |
| T3 | S2,S4,S6 | `gustosBlock` joins `withLecciones` so every runtime receives it; regenerate too; the feedback page lists verdicts; docs | inline | pending |

## Log

L1 — "arregla eso, ademas: También, al terminar una parte, estaría bueno integrarle un sistema de
feedback, tipo un pulgar arriba, un pulgar abajo, explicar, o sea, además de lo que ya tenemos o
sea, un sistema más completo de feedback. Ya tenemos el de regenerar y feedback, pero estaría bueno
también poder decir las cosas buenas que tiene para tener registro de qué gusta, qué no gusta, y
así ir puliendo cada vez más el sistema de explicaciones del usuario personalizado."

L2 — The "arregla eso" that opens L1 was the voseo slip from the live turn, fixed and committed on
`feat/404-tutor-api` (`ce1efee`) before this feature started: `STYLE_RULE` opens the API tutor's
system message and one corrective pass follows a slip.

L3 — Exploration before design (one explorer, path:line evidence): the motives are all complaints;
`sugerencias.json` is `{version: 1, actualizado, entradas[]}` with a 500 cap and an `origen` field;
the part's content is the tutor's HTML file, while `Sugerir`/`Regenerar` live in the studio's reader
bar (`studio/ui/studio.js:2253-2297`); there is no thumbs or rating code anywhere; the existing
dialog is `askSugerencia` (`:285-365`) with `aria-pressed` chips and a textarea.

L4 — Consequence of S4 that shapes the plan: painting a button would be a lie if the verdict never
reached the writer. T3 therefore moves the digest into `withLecciones`, the one block the normal
turn already carries, instead of leaving it in `tutorContext` — and the test asserts the prompt,
which is the studio's, for the three runtimes at once.
