# Exam mode: prepare a specific exam with the vital 20%, shaped by its format

Objective: a third explanation mode, next to quick and university, that takes a topic or a long pasted text, keeps only the vital 20% (Pareto always on), asks how the exam will be (oral, written, practical and which kind of practice), shapes the study plan to that format, keeps the prior diagnosis and closes with a mock exam in that same format. University mode stays unchanged.
Authorized: L1 + L2. Milestone #7 "Exam mode", issues #210-#214. Branch `feat/210-exam-mode` from `origin/main` @ 74d896e. The user authorized implementation, TSP testing and merge to main (L2).

## Specs
S1 — "hacer un modo examen" / "reunir un poquito lo mejor de ambas" — a third mode, `examen`, offered next to quick and university; it reuses the university (deep) engine run, its prior diagnosis and its checks.
S2 — "Puede pegar un bloque muy grande de texto. Y va a generar un plan de estudio para buscar aprender el 80% del contenido con el 20% del esfuerzo" — the source may be a long pasted text; the run is always in `pareto` scope (the existing vital-20% contract: `pareto.criterio`, `pareto.descartado`, part cap, `El 20% que rinde el 80%`).
S3 — "mantener la misma filosofía de explicaciones, eso sí está bien solamente que buscando quitar cosas innecesarias. Por ejemplo, si te busco ingeniería de características, no quiero aprender estadística" — the explanation standard stays the same; what is cut is declared in `pareto.descartado`.
S4 — "obviamente después hacerme un examen previo para saber cómo estoy" — the prior diagnosis stays.
S5 — "Vamos a preguntar, el examen es oral escrito, práctico" / "¿Qué tipo de práctico? Ah, mira, bueno, no vamos a hacer laboratorios y vamos a tener que hacer una aplicación" — the skill asks the exam format and, for practical, the kind of practice; the engine records it at init: `--exam oral|written|practical`, `--practice "<kind>"` (only with practical, only on init), `state.exam = {"format": ..., "practice": ...}`.
S6 — "va a ser oral. Entonces no te voy a preguntar, no te voy a explicar tanto la fórmula, sino el por qué y el cómo funcionan las cosas. Escrito, ah bueno, vas a necesitar saber más esto, esto y esto. Práctico, ah bueno, vamos a practicar" — the plan is shaped by the format: `plan.json` carries `"examen": {"formato": <format>, "practica": <kind or omitted>}` equal to the run's exam, and every part carries `"examen": "<what this part buys for this exam format>"` (at least `minPartChars`). Check `exam-plan` at preparation and planning.
S7 — Closing mock exam in the declared format (agreed in the milestone draft): `cuestionario-final.json` carries `"formato"` equal to the run's format; oral needs at least as many open questions as choice questions; practical needs at least one question with `"tipo": "practica"` and a nonempty `"entregable"`; written keeps the current mix. Check `exam-mock` at final_quiz.
S8 — "yo creo que el modo universitario tiene que ser también de las bases, como tal cual como está" — runs without exam behave exactly as today: `exam-plan` and `exam-mock` report `SKIP`; old states without `exam` load unchanged.

## Contract (shared by engine, adapter, skill, studio)
- CLI: `learning init ... [--exam oral|written|practical] [--practice "<kind>"]`. `--exam` implies `scope=pareto` (an explicit `--scope complete` with `--exam` is an error). `--practice` without `--exam practical` is an error. Both only on `init`.
- State: `state.exam` (`{"format": "practical", "practice": "build an app"}`), absent outside exam runs. `init` returns `evidence.exam`; `status` reports `exam` when present.
- Rules `rules/deep.json` thresholds add `exam`: `{"formats": ["oral", "written", "practical"], "minPartChars": 24}`; fail-closed validation like `pareto`.
- Checks: `exam_plan` (id `exam-plan`, preparation + planning, `plan.json`), `exam_mock` (id `exam-mock`, final_quiz, `cuestionario-final.json`). Outside exam runs both `SKIP`.
- Adapter `learning_stage` init accepts `exam` and `practice` and passes the flags once; rejects them outside init or invalid before calling the engine.
- Skill `explicacion-interactiva`: third mode `examen` in Phase 0a; `references/examen.md`.
- Studio: exam topics (state with `exam`) show an `Examen` tag; the home page and tutorial show the third mode.

## Tasks
T1 — S2,S5,S6,S7,S8 — engine + CLI + rules + tests — #210 — gentle-ai-worker — done: 1e4edb8
T2 — S5,S8 — adapter `learning_stage` — #211 — gentle-ai-worker — done: 65dfed0, F1 fix 5f075f2
T3 — S1-S6 — skill `explicacion-interactiva` (outside this repo: `~/.claude/skills/explicacion-interactiva`) — #212 — gentle-ai-worker — done: SKILL.md Phase 0a/Output Contract/Decision Gates, new references/examen.md, metodo-explicame.md, learning-validation.md, pareto.md (not in this repository)
T4 — S1 — studio home, tag, tutorial — #213 — gentle-ai-worker — done: 0b43861
T5 — S5-S8 — docs + real run on a scratch root — #214 — gentle-ai-worker — done: 23de1bc; real run scenarios a-g green
T6 — all — TSP verification, PR, merge to main — parent — TSP e11747f (plan odd/tests/exam-mode-tsp.md)

## Log
L1 — "necesito reunir un poquito lo mejor de ambas. y hacer un modo examen. ¿En qué consiste el modo examen? Va a ver todo lo que le vas a pasar. O sea, va a ver el tema que le vas a pasar. Puede pegar un bloque muy grande de texto. Y va a generar un plan de estudio para buscar aprender el 80% del contenido con el 20% del esfuerzo. Por eso la ley de Pareto. [...] mantener la misma filosofía de explicaciones, eso sí está bien solamente que buscando quitar cosas innecesarias. Por ejemplo, si te busco ingeniería de características, no quiero aprender estadística. Quiero aprender cómo funcionan los modelos, pues igual que me lo explique la forma más sencilla posible, obviamente después hacerme un examen previo para saber cómo estoy. [...] Vamos a preguntar, el examen es oral escrito, práctico. y armar un plan de estudios basado en [...] va a ser oral. Entonces no te voy a preguntar, no te voy a explicar tanto la fórmula, sino el por qué y el cómo funcionan las cosas. Escrito, ah bueno, vas a necesitar saber más esto, esto y esto. Práctico, ah bueno, vamos a practicar. ¿Qué tipo de práctico? Ah, mira, bueno, no vamos a hacer laboratorios y vamos a tener que hacer una aplicación. [...] yo creo que el modo universitario tiene que ser también de las bases, como tal cual como está, entonces no veo viable. hacer un modo de eso."
L2 — "si, y go con todo, hasta que este listo y mergeado y testeado con tsp a main" — approves the milestone draft (third mode on the deep engine, Pareto forced, format, engine-checked mock exam).
D1 — Agent decision: the mock exam is the existing final_quiz stage with a format contract, not a new stage, so exam runs keep every university gate and the stage graph does not change.
D2 — Agent decision: the long pasted text is a skill-side source (the engine never ingests sources today); no engine change for it.
L3 — TSP: one defect, F1 (adapter accepted a whitespace-only `practice` and created/enrolled the topic before the engine refused it), pinned RED in adapter.test.mjs and fixed in 5f075f2. Real run found a pre-existing receipt-hashing defect (pretty-printed plan.json makes the adaptation receipt stale): out of scope, filed as #225.
L4 — Final checks: `go test ./...` 416 passed; `go vet ./...` clean; `node --test integrations/pi/*.test.mjs studio/*.test.mjs` 498 pass, 0 fail, 12 skipped; `tsp check --base origin/main` exit 0.
