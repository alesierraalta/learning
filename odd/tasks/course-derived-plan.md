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
| T2b | S1, S2 | #407 | worker, verified by the parent | `29b7e9e` |
| T3 | S2, S3 | #408 | worker, verified by the parent | `937d70f` |
| T4 | S4, S5 | #374 | worker, verified by the parent | `867f395` |
| T5 | S2 | #421 | worker, verified by the parent | `d3c7de7` |
| T6 | S3 | #423 | worker, verified by the parent | `b319e04` |
| T7 | S4 | #422 | worker, verified by the parent | `268324a` |

## Log

**L1** — User's original request, verbatim: «Claro, cuando yo quiero generar una nueva materia, un nuevo tema, en vez de escribirle cuáles temas quiero ver, o sea, en vez de escribirle yo y de hacerle la lista, pasarle todos los documentos, que los ordene y entienda cuál es el paso a paso que yo tengo que seguir, como con el examen.»

**L2** — Learner's decisions this session: plan «Oculto: lo deriva y lo verifica el motor»; order «Cobertura completa, examen pondera el orden». Authorized the two new issues in milestone 12 and to start at T1.

**L3** — Baseline evidence: the upload path caps at 5 sources (`studio/server.ts:174`); a course's documents live in `.materias/<id>/fuentes/` and are never read (`studio/materias.ts:8-9`); the planning turn lists paths and says read every file (`studio/runtime.ts:56-72`); `plan.json` has no provenance fields (`internal/engine/artifacts.go:54-77`) and `validatePlanStructure` ignores them (`:106-130`); `maxParts: 4` (`rules/deep.json:124-129`) blocks complete coverage; #309 shipped exam derivation as prompt text only, its engine check verifying declared fuente/estructura (`internal/engine/exam.go:14-81`). Branch `feat/373-course-index` (tip `e644075`, clean, local-only) holds the index: `studio/indice.ts` with `segmentarTexto`, `indizarFuente`, `buscar`, FTS5 + vectors.

**L4** — Open contradiction, not acted on: the plan is hidden by rule (`integrations/pi/index.ts:498-501`) while `api/panorama` serves `plan.json`/`planificador.md` and the UI shows «Tu ruta» (`studio/server.ts:2916-2945`, `studio/ui/studio.js:1068-1070`). Left untouched pending the learner's word; it may be the map, not the part list.

**L5** — T2 evidence: `materialOrdenado` (every chunk of a course, exam first, stable order) and `planBrief` (bounded, says how many fragments it left out, empty without a course/material/plan-owed) in `studio/indice.ts` and `studio/brief.ts`; injected in `deliver` for every turn whose topic still owes its route. 26 focused tests green. Known limit found while verifying: the brief only applies while `plan.json` is missing, and a topic born from «Quiero aprender X» binds its course *after* the plan may already be written. Two ways out, and the choice is the learner's: link the course before the route is planned, or offer a regeneration that re-derives an existing plan from the material.

**L6** — T2b evidence (learner's decision: «Crear el tema desde la materia»). `POST api/aprender` accepts an optional `materia`, validated as an existing course id and refused with the studio's own 400 before any turn exists; the creation turn carries it, and at the existing mid-turn binding the topic joins the course (`studio/server.ts`). Every delivery for that topic awaits the pending link before `planBrief` reads the material; a refused link is a stderr line and the turn proceeds untouched. The UI reuses the one new-topic entry (a course selector, hidden with no courses and for `rapido`) and the materias page gains «Nuevo tema en esta materia». Five tests, one per criterion; `studio/server.test.mjs` + `studio/plan-brief.test.mjs` reach 222 and `studio/materias.test.mjs` stays at 10.

**L9** — Delivered in #417 and merged into `main` (2026-11-24), closing #373, #374, #407 and #408. Node 578 pass / 0 fail, `go test ./...` exit 0, CI green on every job. Follow-ups opened in milestone 12 and done on `feat/421-course-route-followups`: T5 #421 (`d3c7de7`) the explanation-stage `pareto_part` gate now also reads a plan's declared `cobertura: "pareto"`, so a course route that promised the trim is held to it under complete scope too, while a plan without course material keeps following the state scope; T6 #423 (`b319e04`) the payload itself stops carrying unwritten parts — `planRoute` filters to written parts and renumbers survivors, `revealedMap` prunes nodes bound to unwritten parts plus their edges and frames while keeping concepts no part covers, the «N de M escritas» wording is gone and a topic with nothing written shows one neutral line; T7 #422 the course part brief uses `buscar`'s hybrid rank inside a 1500 ms bound (`PART_MATERIAL_TIMEOUT_MS`) through a new awaited `partBriefAsync`, falling back to today's keyword brief at the bound or without an embedder. Honest gaps: `studio/layout.test.mjs` was updated to the #423 contract but never executed here (Playwright is not importable in this worktree), so CI is the first machine to run it; #422's semantic rule is proven with a documented fake-embedder collision fixture, which proves the plumbing and the bound, not paraphrase recall (that is what `tools/eval/retrieval.mjs` measures); and after the bound an abandoned embed request keeps the client busy until its own timeout before retrying once — nothing awaits it, so the turn is unaffected, but cancellation is not implemented.

**L7** — Residual and environment, stated so nobody reads them as green. (a) The very first prompt of a creation turn still carries no brief: the topic does not exist before that turn. In deep mode the route is planned after `init` and the diagnosis, so by then the link has landed — that is an inference from the stage order, not a live run, and a tutor that wrote `plan.json` in its first prompt would still plan without material. (b) `an aborted regeneration rolls back at once and asks for no correction` failed once inside the full suite and passes in isolation (2/2): a 300 ms window against the engine's `delayMs: 500`, on a path this change does not touch. (c) The frontend has no browser proof here: Playwright is not importable in this worktree, so the new selector and button are covered by a source-contract test only. (d) `materia` on a `rapido` request is accepted and inert, documented and never sent by the UI, but not refused by the API.

**L8** — T3 evidence (#408). `plan.json` gained plan-level `cobertura`/`material` and per-part `fuentes[{nombre,ubicacion}]`; two new fail-closed check kinds (`plan_cobertura`, `plan_provenance`, registered in `internal/rules/rules.go` and declared in `preparation` and `planning`) prove no part is sourceless, no declared source goes uncited, and no part cites material the plan never declared. `cobertura: "completa"` escapes the pareto cap; `"pareto"` still owes its trim and cap; a run without course material reports both checks SKIP and keeps every existing check (a test iterates every declared preparation check and fails if one stops running). Evidence: `go test ./... -count=1` exit 0 (engine 220 s), plan-brief 6/6 exit 0, gofmt/vet clean, one RED per rule. Residual: the part-level `pareto_part` explanation gate still keys off state scope, so a complete-scope route declaring `cobertura: "pareto"` is held to the trim at the plan but not to the 80/20 heading; and `studio/server.ts` carries two pre-existing TypeScript diagnostics about `part.subtema` in `integrations/pi/bridge.ts`, untouched here.
