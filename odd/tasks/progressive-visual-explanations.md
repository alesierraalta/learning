Objective: every part teaches its running example with a progressive walkthrough that draws the example and points at it; the tutor skill knows how, the engine refuses a part without it.
Branch: feat/progressive-walkthroughs · Milestone #3 (issues #73, #74) · Delivery: ask-on-risk · Runner: `go test ./...`, `node --test`, `node tools/deck-gate.mjs`.

## Specs

- S1 (engine, #73): every part the engine has not yet certified fails `explanation` unless its note carries at least one `<lk-walkthrough>` with a valid deck; an `lk-widget` or a separate app does not substitute. Applies to runs initialised before the rule, without rewriting `.learning/rules.json`, state, notes or receipts; certified parts keep validating as before.
- S2 (engine, #73): each required deck has 3 to 6 steps; every step draws at least one figure that is not a table and at least one arrow; a step whose largest figure is a table fails ("No me sirve que me muestres una tabla e iconos que se van actualizando abajo").
- S3 (engine, #73): the `visual-value` rubric of new runs asks whether the steps build the idea progressively; `docs/engine.md` describes S1-S3.
- S4 (skill, #74): the tutor skill says when a walkthrough is required and how to design it like the studio tutorial: "Quiero algo que me muestre visualmente, que me muestre la flecha, dónde tengo que ver"; tables only complement a scene ("no estoy en contra de las tablas, pero en estos casos prioriza otras formas").
- S5 (skill, #74): a worked reference deck (warehouse robot, RL Part 3) ships with the skill, passes the deck gate, and replaces the table-based decks in the live Part 3; the study-folder instructions agree with the skill.

## Tasks

- T1 S1-S3 engine rule, tests, docs — inline — pending
- T2 S4-S5 skill guidance, reference deck, live Part 3 — inline — pending

## Log

- L1 (2026-11-01, user): "Esta explicación que me estás dando del ejemplo, el robot en un almacén de 4x3 casillas … no veo ninguna representación visual … fíjate que en el tutorial del estudio … te sale que si el iconito de la PC, la flechita que indica dónde va cada cosa … y te va progresivamente mostrando visualmente cómo funciona la aplicación … Te lo estoy diciendo para que lo pongas en todas las explicaciones, en todas las partes … en el dibujo que pusiste de política y valor, el texto de salida y charco se salen de los cuadros."
- L2 (2026-11-01, user): "la idea es arreglarlo para que no vuelva a suceder en una nueva ocasión."
- L3 (2026-11-01, user): "debe estar en las skills del tutor también para que no solamente … tenga bloqueos en caso de que lo haga mal, sino que él ya sepa más o menos cómo debe hacerlo. Y bueno, que sea mucho más sencilla esa primera iteración."
- L4 (2026-11-01, user): "No me sirve que me muestres una tabla e iconos que se van actualizando abajo … Quiero algo que me muestre visualmente, que me muestre la flecha, dónde tengo que ver … no estoy en contra de las tablas, pero en estos casos prioriza otras formas."
- L5: the live Part 3 decks of 2026-11-01 are table-based (gen.py `scene()` puts a grid on top and two caption boxes below); T2 replaces them.
