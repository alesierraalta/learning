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
| T1 | S1,S2,S5,S6 | `studio/valoraciones.ts`: document, motives with a sign, validation, record/list, `loQueGusta`; `POST`/`GET api/valoraciones`; tests | inline | d6fab8c |
| T2 | S1,S3,S7 | Reader bar: thumbs, dialog with the sign's motives and the learner's words, existing verdict shown on reload; layout and body tests | writer + parent | this slice |
| T3 | S2,S4,S6 | `gustosBlock` joins `withLecciones` so every runtime receives it; regenerate too; the feedback page lists verdicts; docs | inline | d6fab8c (prompt + docs); page in T2's commit |

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

L5 — Slice 1, `d6fab8c` (540 lines): the record, its two routes, `gustosBlock`/`withGustos`/
`stripGustos` in the write path, and the docs. The test that matters is not the storage suite but
the one that reads the prompt a real turn hands to the fake tutor: it fails if the block is built
and never delivered, which is the defect this feature exists to avoid on the other side of the
problem.

L6 — The docs' older paragraph "before writing, the prompts for a part, the plan and the map carry a
compact context built from the stored preferences, the weak telemetry categories and the last
suggestions" was **not** verified by this work: the explorer traced `tutorContext` to the regenerate
prompt and `GET api/contexto` only, and `startTurn` carries lessons and now verdicts. Whether the
plan and map prompts carry preferences was left unproven rather than contradicted; it needs its own
reading before anyone quotes that sentence again.

L7 — The UI (T2) runs as a separate writer on `studio/ui/studio.js`, `studio.css` and
`studio/layout.test.mjs`, disjoint from the files this slice owns, under the parallel-writers rule:
the parent owns git, the writer never commits.

L8 — Slice 2, the UI: two thumbs in the reader's own menu (they carry only their label, the glyph is
CSS, so the accessible name is the whole sentence), one dialog with the reasons of **its** sign, the
learner's box prefilled from the verdict already stored, and a verdicts block on «Tu feedback» beside
the suggestions. A verdict is never recorded before «Guardar», and the second thumb replaces the
first instead of adding a second opinion.

Evidence, with a browser: `studio/layout.test.mjs` 128/128 and the three new tests on their own
3/3 — the thumbs are 44 px on a coarse pointer and offer only their sign's reasons, the save posts
`{tema, parte, valor, motivos, texto}`, and a stored verdict comes back pressed when the part is
reopened. Note for the next session: the suite resolves Playwright by itself from the global npm
root; a bare `import('playwright')` says it is missing and that probe is wrong, not the suite.

L9 — The writer ran on `studio/ui/studio.js`, `studio.css` and `layout.test.mjs` as agreed, and was
cancelled by a session restart before it could report; its work was verified here rather than
trusted. It also edited this task file (outside its surfaces) to mark T1/T3 with their commit, which
was accurate and is kept.
