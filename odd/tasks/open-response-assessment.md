# Open-response assessment
Objective: replace multiple-choice assessment with developed answers and evidence-based grading across diagnosis, mini-quizzes and final assessment, with an adaptive knowledge map that preserves past attempts. Milestone #15; issues #470, #471, #472.
Branch `feat/470-open-assessment` from `origin/main`.

## Specs

**S1** — «Quiero cambiar el método de aprendizaje de múltiple choice a preguntas en todas, tanto en el mini quiz de la parte como en el diagnóstico inicial. En todos lados quiero preguntas a desarrollar. Ya no quiero múltiple choice. Quiero todo que yo tenga que desarrollar y explicar la respuesta, y en base a eso se definirá si está bien, si está mal. Y además, obviamente, para los ejercicios que lo requieran, ejercicios de código, el ejercicio de explicar con mis propias palabras, todo ese tipo de cosas. Pero justamente quiero mejorar eso. Y además, quiero que me propongas una nueva forma de, por ejemplo, de que de categoricemos. Esto es todo para armar el nuevo, una mejor estrategia para la explicación. O sea, que con mejores preguntas podamos abarcar más campos para saber qué tanto sé y qué tanto no. Pero eso, proponme cosas.»

**S2** — «Implementar el modelo completo»

**S3** — «Conservarlas como historial»

Approved design (shared by S1–S3): diagnosis, mini-quizzes and final assessments are all open-response. Question formats cover explain, apply, predict, debug, build, compare and transfer. Code exercises keep executable tests plus a graded written explanation. Per-answer verdicts are `correct`, `partial`, `incorrect`, `no-evidence`, each backed by a verbatim evidence span from the learner's answer. Per-concept states are `laguna`, `dudoso`, `claro`, `transferible`, with learner confidence stored separately from the verdict. A mini-quiz passes at a 2/3 domain ratio with no central gap. Historical multiple-choice attempts are neither deleted nor rewritten.

## Delivery

Strategy `ask-on-risk`. Forecast reviewable work-unit commits: four, one per task — T1 versioned contract and grading engine, T2 reader/studio/tutor experience, T3 adaptive map and teaching strategy, T4 integrated verification and delivery evidence — each with its own tests and docs. Units are sliced by behavior, not by file type; a unit above about 400 authored changed lines is split by work unit rather than compressed, and if no honest split exists the overage is reported. Local work-unit commits remain authorized and separate from publishing. `ask-on-risk` applies only when the user asks to push or create a PR. A unit whose Risk line names a high-risk item gets its own commit and an independent verifier.

## Tasks

- [ ] **T1** (issue #470; S1–S3; deps: none) — in_progress. Risk: item 3 (changes versioned assessment contracts shared with existing diagnosis, mini-quiz and final-flow consumers). Versioned open-response contract, evidence-backed rubric grading engine, and legacy compatibility: question and answer schema, verdicts and concept states, evidence validation, legacy multiple-choice attempts preserved as history. Route: contract and engine. Commit: —
- [ ] **T2** (issue #471; S1–S3; deps: T1) — Reader, studio and tutor open text/code experience: developed-answer inputs and code submission with explanation, per-answer evidence-backed feedback, open diagnosis/mini-quiz/final flows. Route: reader, studio and tutor. Commit: —
- [ ] **T3** (issue #472; S1–S3; deps: T1, T2) — Adaptive knowledge map, categorization, coverage-first diagnosis and teaching strategy: concept states and coverage tracking, question selection by uncovered domain, re-teaching and strategy from verdicts with confidence kept separate. Route: knowledge map and tutoring strategy. Commit: —
- [ ] **T4** (issues #470, #471, #472; S1–S3; deps: T1, T2, T3) — Integrated verification and delivery evidence: cross-task seam checks, project test runners, real open-response run, review assessment and recorded delivery decision. Route: verification and delivery evidence. Commit: —

## Log

**L1** — «Quiero cambiar el método de aprendizaje de múltiple choice a preguntas en todas, tanto en el mini quiz de la parte como en el diagnóstico inicial. En todos lados quiero preguntas a desarrollar. Ya no quiero múltiple choice. Quiero todo que yo tenga que desarrollar y explicar la respuesta, y en base a eso se definirá si está bien, si está mal. Y además, obviamente, para los ejercicios que lo requieran, ejercicios de código, el ejercicio de explicar con mis propias palabras, todo ese tipo de cosas. Pero justamente quiero mejorar eso. Y además, quiero que me propongas una nueva forma de, por ejemplo, de que de categoricemos. Esto es todo para armar el nuevo, una mejor estrategia para la explicación. O sea, que con mejores preguntas podamos abarcar más campos para saber qué tanto sé y qué tanto no. Pero eso, proponme cosas.»

**L2** — The user selected the complete model and the preservation of the existing attempts as history: «Implementar el modelo completo» and «Conservarlas como historial». Historical multiple-choice attempts stay as they are; the open-response model is added without deleting or rewriting them.

**L3** — Confirmed milestone #15 and issues #470, #471, #472 on branch `feat/470-open-assessment` from `origin/main`. Delivery strategy `ask-on-risk`. This document records no implementation evidence: all tasks are forecast, unchecked, and carry commit placeholder `—`.

**L4** — T1 started: baseline `rtk go test ./internal/rules ./internal/engine` green (650 passed); contract and grading-engine tests are being added through the engine's public Run/Report surface before implementation. T1 stays unchecked; the parent owns checkoff.

**L5** — T1 implementation evidence: RED `rtk go test ./internal/engine -run 'TestOpen|TestAllOpen' -count=1` (29 failures: no open-answer schema); GREEN same command 32 passed (combined rules+engine focused run: 33); PRESERVE `rtk go test ./internal/engine -run 'TestLegacyAnsweredQuizKeepsItsScore|TestLegacyMCQStillScoresByKeyUnderOpenRules|TestOldRunsKeepTheirQuizRules|TestConceptMiniQuizPassesAtTwoThirds|TestWrittenExamStillRequiresTheExistingMixedQuestionFormat' -count=1` 5 passed before and after; full `rtk go test ./internal/rules ./internal/engine` 685 passed; `rtk git diff --check` clean. No commit, T1 remains unchecked.

**L6** — Parent-review correction: code verdicts now bind the executable submission and explanation (`correct` needs all declared tests passed plus `explanation.correct`; `partial` accepts only `correct`/`partial` explanation), and code no-evidence answers need no invented content, score zero and keep central-gap behavior. RED `rtk go test ./internal/engine -run 'TestOpenCodeVerdictConsistency|TestOpenCodeNoEvidence' -count=1` → 2 passed / 10 failed; GREEN same command → 12 passed; full `rtk go test ./internal/rules ./internal/engine` → 697 passed. T1 remains unchecked.
