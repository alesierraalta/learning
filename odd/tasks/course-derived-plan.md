# Course-derived plan

The learner hands over a course's material (20 PDFs, the exam) instead of typing a subject, and the
route is derived from that material: complete coverage, exam-weighted order, plan hidden, engine-verified
provenance. Reuses milestone 12 (Course materials with retrieval); issues #373 #374 #407 #408.

## Specs

**S1 — Hand over the material, not a list.** «Claro, cuando yo quiero generar una nueva materia, un nuevo tema, en vez de escribirle cuáles temas quiero ver, o sea, en vez de escribirle yo y de hacerle la lista, pasarle todos los documentos, que los ordene y entienda cuál es el paso a paso que yo tengo que seguir, como con el examen.»

**S2 — Complete coverage, exam weights the order.** The learner's decision: «Cobertura completa, examen pondera el orden» — everything in the material enters the route; the exam decides what comes first and what gets reinforced; nothing is dropped silently, and Pareto stays the explicit trim it already is («cuando te vaya a hacer una explicación te preguntes si quieres aprender con la ley de Pareto», `odd/tasks/pareto-scope.md`; measurement is never trimmed).

**S3 — The plan stays hidden, and the engine verifies it.** The learner's decision: «Oculto: lo deriva y lo verifica el motor». Keeps S9 of `odd/tasks/strict-university-flow.md` («la idea es que yo nunca vea el plan en el flujo completo»), so nothing new is shown; and every part must declare the material it came from, checked by the engine, never by prose.

**S4 — Do not read everything.** «no tenga que leer todo y eso sea un absurdo desgaste de contexto» — the planner enumerates the material through the course index within a bounded budget, and each part still receives only its relevant chunks.

**S5 — Nothing already delivered may regress.** A run without course material, an exam-only run, and a Pareto run keep today's behaviour and today's gates; the 5-file cap stays for the topic-upload path it belongs to.

## Tasks

| ID | Spec | Issue | Route | Commit |
|---|---|---|---|---|
| T1 | S1, S4 | #373 | inline: merge the index branch, prove it green | `7be1b14` |
| T2 | S1, S2, S4 | #407 | inline, after T1 | `a9a8a85` |
| T2b | S1, S2 | #407 | pending a learner decision (L5) | pending |
| T3 | S2, S3 | #408 | inline, after T2 | pending |
| T4 | S4, S5 | #374 | inline, after T3 | pending |

## Log

**L1** — User's original request, verbatim: «Claro, cuando yo quiero generar una nueva materia, un nuevo tema, en vez de escribirle cuáles temas quiero ver, o sea, en vez de escribirle yo y de hacerle la lista, pasarle todos los documentos, que los ordene y entienda cuál es el paso a paso que yo tengo que seguir, como con el examen.»

**L2** — Learner's decisions this session: plan «Oculto: lo deriva y lo verifica el motor»; order «Cobertura completa, examen pondera el orden». Authorized the two new issues in milestone 12 and to start at T1.

**L3** — Baseline evidence: the upload path caps at 5 sources (`studio/server.ts:174`); a course's documents live in `.materias/<id>/fuentes/` and are never read (`studio/materias.ts:8-9`); the planning turn lists paths and says read every file (`studio/runtime.ts:56-72`); `plan.json` has no provenance fields (`internal/engine/artifacts.go:54-77`) and `validatePlanStructure` ignores them (`:106-130`); `maxParts: 4` (`rules/deep.json:124-129`) blocks complete coverage; #309 shipped exam derivation as prompt text only, its engine check verifying declared fuente/estructura (`internal/engine/exam.go:14-81`). Branch `feat/373-course-index` (tip `e644075`, clean, local-only) holds the index: `studio/indice.ts` with `segmentarTexto`, `indizarFuente`, `buscar`, FTS5 + vectors.

**L4** — Open contradiction, not acted on: the plan is hidden by rule (`integrations/pi/index.ts:498-501`) while `api/panorama` serves `plan.json`/`planificador.md` and the UI shows «Tu ruta» (`studio/server.ts:2916-2945`, `studio/ui/studio.js:1068-1070`). Left untouched pending the learner's word; it may be the map, not the part list.

**L5** — T2 evidence: `materialOrdenado` (every chunk of a course, exam first, stable order) and `planBrief` (bounded, says how many fragments it left out, empty without a course/material/plan-owed) in `studio/indice.ts` and `studio/brief.ts`; injected in `deliver` (`studio/server.ts:1581-1585`) for every turn whose topic still owes its route. 26 focused tests green. Known limit found while verifying: the brief only applies while `plan.json` is missing, and a topic born from «Quiero aprender X» binds its course *after* the plan may already be written (`studio/server.ts:1063-1082` binds mid-turn; `linkTema` runs from the materias page). So for the learner's own journey — 20 PDFs then a new topic — the route can be planned before the course exists. Two ways out, and the choice is the learner's: link the course before the route is planned (topic created from the course), or offer a regeneration that re-derives an existing plan from the material.
