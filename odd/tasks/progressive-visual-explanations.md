Objective: every part teaches its running example with a progressive walkthrough that draws the example and points at it; the tutor skill knows how, the engine refuses a part without it.
Branch: feat/progressive-walkthroughs · Milestone #3 (issues #73, #74) · Delivery: ask-on-risk · Runner: `go test ./...`, `node --test`, `node tools/deck-gate.mjs`.

## Specs

- S1 (engine, #73): every part the engine has not yet certified fails `explanation` unless its note carries at least one `<lk-walkthrough>` with a valid deck; an `lk-widget` or a separate app does not substitute. Applies to runs initialised before the rule, without rewriting `.learning/rules.json`, state, notes or receipts; certified parts keep validating as before.
- S2 (engine, #73): each required deck has 3 to 6 steps; every step draws something and at least one arrow; a step whose largest figure is a table no arrow points into fails ("No me sirve que me muestres una tabla e iconos que se van actualizando abajo"); a table the arrow points into stays allowed where the data is the example ("no estoy en contra de las tablas, pero en estos casos prioriza otras formas").
- S3 (engine, #73): the `visual-value` rubric of new runs asks whether the steps build the idea progressively; `docs/engine.md` describes S1-S3.
- S4 (skill, #74): the tutor skill says when a walkthrough is required and how to design it like the studio tutorial: "Quiero algo que me muestre visualmente, que me muestre la flecha, dónde tengo que ver"; tables only complement a scene ("no estoy en contra de las tablas, pero en estos casos prioriza otras formas").
- S5 (skill, #74): a worked reference deck (warehouse robot, RL Part 3) ships with the skill, passes the deck gate, and replaces the table-based decks in the live Part 3; the study-folder instructions agree with the skill.

## Tasks

- T1 S1-S3 engine rule, tests, docs — inline — done, commit 32f32d6 (RED: 3 new tests failed before the rule; GREEN: go test ./... ok, node --test 216/0/9; S3 rubric test written after the rubric, no RED)
- T2 S4-S5 skill guidance, reference deck, live Part 3 — inline — pending

## Log

- L1 (2026-11-01, user): "Esta explicación que me estás dando del ejemplo, el robot en un almacén de 4x3 casillas … no veo ninguna representación visual … fíjate que en el tutorial del estudio … te sale que si el iconito de la PC, la flechita que indica dónde va cada cosa … y te va progresivamente mostrando visualmente cómo funciona la aplicación … Te lo estoy diciendo para que lo pongas en todas las explicaciones, en todas las partes … en el dibujo que pusiste de política y valor, el texto de salida y charco se salen de los cuadros."
- L2 (2026-11-01, user): "la idea es arreglarlo para que no vuelva a suceder en una nueva ocasión."
- L3 (2026-11-01, user): "debe estar en las skills del tutor también para que no solamente … tenga bloqueos en caso de que lo haga mal, sino que él ya sepa más o menos cómo debe hacerlo. Y bueno, que sea mucho más sencilla esa primera iteración."
- L4 (2026-11-01, user): "No me sirve que me muestres una tabla e iconos que se van actualizando abajo … Quiero algo que me muestre visualmente, que me muestre la flecha, dónde tengo que ver … no estoy en contra de las tablas, pero en estos casos prioriza otras formas."
- L6: T1 design — the check sits in `explanation-content`, which only runs for the frontier part, so certified parts of old runs keep their receipts; page demos (`explicaciones/apps/`) can no longer stand in for a part's walkthrough, and demo tests now judge `demo-part` apart from the stage exit. Native assess on 32f32d6: medium, deferred to the slice.
- L7: S2 revised — the first rule (a table can never be the largest figure) would have broken data topics such as SQL, where the table is the example; no user asked for that. Now a table may be the scene only when an arrow points into it. RED: the SQL-shaped case failed before the change; GREEN: go test ./... ok. Probe: the old live Part 3 decks still fail (28 step problems), the new ones pass.
- L8: T2 progress — scene decks (tiles, robot, labelled arrows; scratch generator) replaced the six table decks in the live Part 3 on the VPS (sha256 109ac655…, 6 walkthroughs, 0 grids, mini-quiz intact; browser gate PASSED; screenshots reviewed).
- L5: the live Part 3 decks of 2026-11-01 are table-based (gen.py `scene()` puts a grid on top and two caption boxes below); T2 replaces them.
