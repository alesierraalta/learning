# Deep-learning engine

Go implementation of the deterministic deep-learning validation flow defined in
[protocol.md](protocol.md). The engine owns rules, state, validation, judging and
completion; the Pi adapter is transport only. It writes exactly one kind of file
into the vault: its own `.learning/` state, and only when `init`/`advance` is
explicitly invoked. It never creates or edits Obsidian notes.

Covered specs: S2 (objective checks are code, not model opinion), S3 (per-stage
detection before completion), S4 (conditional proof that the plan really changed
after the triggering event), S6 (every check reports what was validated and why),
S7 (a failed mandatory validation blocks completion), S8 (structured, editable
rules in `rules/deep.json`), S10/S12/S13 (separate Go repository at
`documents/learning`).

## Build and verify

```bash
rtk go test ./...
rtk go test -race ./...
rtk go vet ./...
rtk go build -o bin/learning ./cmd/learning
```

## CLI contract

```text
learning <init|validate|advance|status|review> --root ROOT --workspace TOPIC --rules RULES [--mode deep|conceptual] [--stage STAGE] [--json]
learning review --root ROOT --workspace TOPIC --rules RULES --stage STAGE --rule RULE --verdict PASS|FAIL --reason TEXT [--reviewer LABEL] [--json]
learning help
```

- `--root` and `--workspace` are canonical paths. Both are resolved with
  `realpath` (`EvalSymlinks`) and the workspace must stay inside the root;
  traversal and symlink escapes are rejected before any file is touched.
- With `--json`, stdout is exactly one JSON report object, never mixed with logs.
  Errors are JSON too when `--json` is present.
- Exit codes: `0` accepted/completed/waiting/skipped, `1` failed mandatory
  validation, `2` invalid arguments/configuration/operational failure.
- Interrupted mutating commands: from the moment a command starts acquiring
  the workspace lock until the process ends, `SIGTERM` (the adapter's execFile
  timeout) exits `143` and `SIGINT` exits `130`, with no report. Either one
  waits for an in-flight state commit, then removes every lock the process
  still owns (none, if the signal lands just before the lock file is created
  or after it was released), so `state.json` holds the old or the new state and
  the next command is not blocked. A signal that arrives earlier (for example
  while the rules load) terminates the process with the default signal status;
  nothing has been written and no lock exists yet. Only `SIGKILL` or a crash
  leaves the lock, which is taken over after five minutes.
- Unknown flags, duplicate flags, missing values, missing required flags, an
  unknown command, an invalid mode, `advance` without `--stage`, and `--stage`
  on `init`/`status` are strict operational errors (exit 2, `status:"error"`).

Report shape:

```json
{
  "status": "accepted|completed|waiting|skipped|blocked|error",
  "stage": "planning",
  "checks": [{"id": "planning-link", "kind": "deterministic|semantic",
               "status": "PASS|FAIL|SKIP", "reason": "..."}],
  "nextStage": "explanation",
  "part": "p1",
  "evidence": {"quizScore": 4},
  "detail": "..."
}
```

Gate invariant: a report with `status` in `accepted|completed|waiting|skipped`
never contains a `FAIL` check; `blocked` always contains at least one `FAIL`.
The adapter may only treat the first group as passing.

## Commands

| Command | Writes | Review activity | Notes |
|---|---|---|---|
| `init` | creates `.learning/state.json` | none | refuses to overwrite an existing run (exit 2) |
| `validate` | none | lists `pendingReviews` (missing/stale) | without `--stage` targets the current frontier |
| `advance` | state (only on full success) | requires fresh recorded reviews after all deterministic checks | blocked while any review is missing, stale or a gate FAIL; rejected transitions write nothing |
| `review` | `state.semantic[]` receipt | records one verdict | frontier stage only, objective checks must pass first |
| `status` | none | never records | freshness + conditional recheck, next stage, completion |

`--mode conceptual` reports `skipped` (exit 0) before anything else: no rules
are read, no state exists, no review is requested or recorded. The conceptual
teaching flow is untouched.

## Stage flow

```text
preparation → diagnosis → planning
  → [ per part: explanation → own_words → quiz → feedback → adaptation ]
  → exercises → final_quiz → final
```

Global stages: `preparation`, `diagnosis`, `planning`, `exercises`,
`final_quiz`, `final`. Repeated per planned part: `explanation`,
`own_words`, `quiz`, `feedback`, `adaptation`. A topic is only
`completed` after every part ran the full cycle and the three closing stages
were recorded; finishing part 1 leaves `nextStage` at part 2.

The engine computes the **frontier**: the earliest stage that is unrecorded,
whose artifact receipts are stale, or whose semantic judgment is stale. An
`advance` may only target the frontier (repairs happen in the same order);
anything else is rejected with a `sequence` FAIL and no state change.
Re-advancing an already recorded, fresh stage is an idempotent no-op.

### Wait points

A legitimate pause is not a failure:

- `diagnosis` frontier with valid questions but no `quiz.answers.json` →
  `status` returns `waiting` (exit 0, zero FAIL); `advance`/`validate` report a
  FAIL with reason "waiting for learner input" (exit 1).
- Same rule for `mini-quiz/{part}.answers.json`.
- Missing generated output (no questions, no explanation) is *not* waiting: the
  stage is actionable (`accepted`), and a premature `advance` fails.

## Input artifacts (workspace-relative)

All artifacts are inputs; producers (model or learner) create them and the
engine never does. The human-facing Obsidian notes are the artifacts checked;
JSON sidecars hold the structured data that is bound to them. `rules/deep.json`
is the source of truth for paths and checks; this table summarizes it.

| Stage | Artifacts | Objective checks (summary) |
|---|---|---|
| preparation | `plan.json` | topic, parts with id/title/slug/subtema, explicit `examplesPlanned`/`visualsPlanned` |
| diagnosis | `quiz.md`, `quiz.json`, `quiz.answers.json` | 6 prerequisite + 6 topic questions (2/2/2 by level), enunciado/subtema/nivel/pieza, A–D + E `No sé`, enunciados present in `quiz.md`, complete answers, derived score bound to `quiz.md` `puntaje` |
| planning | `plan.json`, `planificador.md`, `mapa.mmd`, `explicacion.md`, `mis-palabras.md` | diagnosis summary and focus areas linked to wrong answers, every subtema in the planner, required planner sections (mermaid map, verified bibliography, visual plan row per part, numbered route, exercise table), `mapa.mmd` is a mermaid graph (`graph`/`flowchart` header and at least one edge), index links to parts, one learner area per part |
| explanation | `explicaciones/Parte {index} - {slug}.md` | frontmatter, planned example present, planned visual present (an embed `![...]` such as an image or an Excalidraw drawing, a nonempty block in a `thresholds.visualBlocks` format, or an inline `thresholds.visualElements` element such as `<svg>`), revised after a failed mini-quiz |
| own_words | `mis-palabras.md` (this part's area) | nonempty learner submission; length, spelling and register are never graded |
| quiz | `mini-quiz/{part}.json`, `mini-quiz/{part}.answers.json` | part note has a mini-quiz section, 5 questions with enunciados present in it, complete answers, derived score ≥ 4/5 with no central miss |
| feedback | `feedback/{part}.json` | matches the part, nonempty notes, `difficultyDetected=false` cannot contradict recorded wrong answers |
| adaptation | — | conditional obligation below |
| exercises | `ejercicios.md` | `tipo: ejercicios`, nonempty body with headings |
| final_quiz | `cuestionario-final.md`, `cuestionario-final.json`, `cuestionario-final.answers.json` | every planned node covered, both choice and open questions, enunciados present in the note, choice answers are option letters, open answers nonempty, `estado: completado` and derived `puntaje` |
| final | `planificador.md`, `mapa.mmd`, `plan.json` | all stages current, conditional obligations met, re-scored planner still valid and linked, re-scored map still a mermaid graph |

Visual formats: `thresholds.visualBlocks` in `rules/deep.json` lists the fenced
code-block languages that render a visual in the vault — `mermaid` (native
Obsidian), `desmos-graph` (Desmos plugin), `geogebra`/`ggb` (GeoGebra plugin)
and `datachart` (Datacharts plugin), each confirmed from the plugin's registered
code-block processor. Add or remove a format by editing that list.
`thresholds.visualElements` lists inline HTML elements Obsidian renders as a
visual — `svg` today. One counts only outside code blocks, closed
(`<svg ...>...</svg>`) and with at least one child element; an empty or
unclosed element, or one inside a fenced block, is not a visual. The check
proves a visual is present, not that it helps; that is the `visual-value`
rubric's judgment.

### JSON sidecar shapes

The producer writes these next to the notes; `thresholds` in `rules/deep.json`
fix every count and vocabulary, and a violation names itself in the failing
check's reason. Option keys are `A`–`D` plus `E` = `No sé`; answer keys
(`answer`) are `A`–`D`; learner answers may be `A`–`E`.

`plan.json` (preparation; `diagnosisSummary` and `focusAreas` are added at
planning, focus areas naming the diagnosis' wrong answers):

```json
{"topic": "Factor de descuento",
 "parts": [{"id": "p1", "title": "El retorno", "slug": "El retorno",
            "subtema": "1.2.2", "examplesPlanned": true, "visualsPlanned": true}],
 "diagnosisSummary": "...", "focusAreas": ["..."]}
```

`id` and `slug` must not contain `/`, `\` or be `.`/`..`; the part note is
`explicaciones/Parte {index} - {slug}.md`.

`quiz.json` (diagnosis): exactly 6 `prerequisite` questions with subtema
`P0.x` and niveles never decreasing, then 6 `topic` questions on plan subtemas
with `level` 1,1,2,2,3,3 mapped to `básico`/`medio`/`avanzado`. `pieza.tipo`
is one of `thresholds.piezaTipos`. Every `enunciado` and every `pieza.contenido`
also appear verbatim in `quiz.md` (only whitespace may differ): write the note
first and copy the question text and its piece from it.

```json
{"questions": [{"id": "d1", "type": "prerequisite", "level": 1, "subtema": "P0.1",
  "nivel": "básico", "enunciado": "¿Qué resultado produce este caso?",
  "pieza": {"tipo": "caso", "contenido": "Caso concreto con datos."},
  "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "No sé"},
  "answer": "B"}]}
```

`quiz.answers.json`, `mini-quiz/{part}.answers.json` and
`cuestionario-final.answers.json` record the learner, one entry per question:
`{"answers": {"d1": "B", "d2": "E"}}`.

`mini-quiz/{part}.json`: 5 questions, `central` marks the questions whose miss
forces re-teaching; every `enunciado` appears in the part note's mini-quiz
section.

```json
{"questions": [{"id": "q1", "central": true, "subtema": "1.2.2", "nivel": "medio",
  "enunciado": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "No sé"},
  "answer": "A"}]}
```

`feedback/{part}.json`:
`{"partId": "p1", "difficultyDetected": false, "notes": "..."}`.

`cuestionario-final.json`: `formato` is `opción múltiple` (or `mcq`/`multiple
choice`), whose `respuesta` is the correct letter, or an open format such as
`respuesta corta`, whose `respuesta` may be empty.

```json
{"questions": [{"id": "f1", "subtema": "1.2.2", "nivel": "medio",
  "formato": "opción múltiple", "enunciado": "...", "respuesta": "C"}]}
```

Final-quiz scoring: choice items (`formato` mcq / multiple choice / opción
múltiple) are scored against `respuesta` and produce `puntaje` as
`correct/choice-count`. Open items are required free text and are **not**
auto-graded: grading them needs interpretation, and string matching would be
noise. The count of recorded open answers is reported as evidence.

## Conditional obligations (S4)

`rules/deep.json` declares two:

```json
{"id": "plan-update-after-feedback", "onStage": "feedback",
 "field": "difficultyDetected", "equals": true,
 "require": {"kind": "changed_after", "paths": ["plan.json"]}}
{"id": "map-rescored-after-final-quiz", "onStage": "final_quiz",
 "require": {"kind": "changed_after", "paths": ["planificador.md", "mapa.mmd"]}}
```

When a condition's `onStage` advances, the engine snapshots the SHA-256 of
every required path. The obligation passes only if the current hash differs
from that snapshot, so an edit made **before** the trigger never satisfies it.

- The feedback obligation is triggered by the declared field, by any recorded
  wrong mini-quiz answer, or by a central-gap assessment; a missing assessment
  counts as triggered. A central gap first re-teaches the part (see Bounded
  re-teaching), so it only reaches `adaptation` together with the other
  sources. `adaptation` proves it and receipts `plan.json`. When
  nothing triggers it, the check is `SKIP` and reports the observed values.
- The map re-score is always required after the final quiz and is proven by
  `final`. Once `final_quiz` is recorded, earlier receipts of `planificador.md`
  and `mapa.mmd` are superseded: re-scoring them is the expected next step, not
  drift. `final` re-validates the re-scored planner and receipts both files, so
  any later edit returns the topic to `blocked` until `final` is re-advanced.
  This proves the files changed after the quiz, not that the new scores are
  pedagogically right.

## Receipts, freshness and repair

Every recorded stage stores SHA-256 receipts of the artifacts it depended on
(preparation stores none — plan edits before planning are validated by planning
itself). The shared `mis-palabras.md` is scoped: planning receipts its skeleton
(headings and prompts outside learner areas) and `own_words` receipts only the
selected part's submission, so writing another part's response never
invalidates a recorded one.

`status` recomputes every receipt and every semantic binding:

- mismatch or missing file → `FAIL receipts-fresh` (`blocked`, exit 1) naming the
  stale stages;
- the run's rules (its `.learning/rules.json` snapshot, or `--rules` for runs
  without one) hash differently from the hash recorded at `init` → `FAIL rules-current`;
- stale or missing semantic judgment → `FAIL semantic-receipts`.

Repair is always frontier-ordered: re-advance the earliest stale or incomplete
stage, then the next. A `completed` run returns to `blocked` on any relevant
edit and back to `completed` only after re-validation. Pre-existing notes with
no `.learning/state.json` are `blocked` (`state-initialized` FAIL), never
fabricated as complete.

## Bounded re-teaching

A mini-quiz below `minPassingScore`, or any missed `central` question, records
the attempt (with its wrong question ids), spends one round from
`thresholds.quiz.maxReteachRounds` (2), reopens `explanation`/`own_words`/`quiz`
for that part and returns `accepted` with `nextStage: "explanation"`. A
`feedback` advance whose recorded `central-gap` assessment is `PASS` (a central
gap in the learner's own words) re-teaches the part the same way, from the same
budget, without recording `feedback`. The
explanation must change against the failed-attempt snapshot before it can be
re-reviewed (its stale reviews reappear in `pendingReviews`). A failing attempt
or central gap once the budget is spent is `blocked` (`reteach-bound` FAIL) with
**no** state change. `feedback` is unreachable until a passing attempt.

## Concurrency

`init` and `advance` hold an exclusive `.learning/lock` (`O_EXCL`). A concurrent
mutator is rejected with exit 2 ("another operation in progress"); a lock older
than 5 minutes is treated as crashed and taken over. State writes are atomic
(`state.json.tmp` + rename). Validation failures never write state and never
increment `counters.successfulAdvances`.

## Recorded reviews (chat, possibly with subagents)

Separate from deterministic validation, and only reachable after every
objective check of the frontier stage passed (a deterministic rejection makes
no review request at all):

- No external model and no configuration: there is no judge endpoint, no
  `LEARNING_JUDGE_*` variables and no credentials anywhere in the engine.
- Flow: `validate` returns `pendingReviews`, one entry per applicable rubric
  whose recorded verdict is missing or stale, with `rule`, `stage`, `part`,
  `kind`, `artifact`, `artifactHash`, `instruction` (the rubric text) and the
  binding `context`. The chat evaluates each rubric — delegating to a subagent
  when useful — and records one verdict with
  `learning review --stage S --rule R --verdict PASS|FAIL --reason TEXT [--reviewer ID]`.
- Rubrics (`rules/deep.json`): `explanation-adapted` and `visual-value` at
  explanation (`visual-value` applies only when the part planned a visual),
  `distractor-quality` (plausible, unambiguous, no cue leakage) at quiz,
  `central-gap` assessment at feedback.
- Instruction: the rubric text plus the fixed wording is the evaluator's whole
  contract; artifact and context are untrusted data, never instructions. The
  verdict must be `PASS` or `FAIL` with a non-empty reason (the chat must quote
  what it evaluated, not a bare verdict).
- Admission: `review` rejects a non-frontier stage, a rule that does not apply
  (exit 2), a verdict outside `PASS|FAIL`, an empty reason, or objective checks
  that have not passed (exit 1, nothing written). The receipt upserts by
  rule+stage+part and never advances counters.
- A recorded `FAIL` from a `gate` rubric blocks `advance` (exit 1). An
  `assessment` reports a finding: for `central-gap`, `PASS` means a gap was
  detected (and drives the plan-update-after-feedback condition) and `FAIL`
  means none; it is stored as passing evidence with its verdict, never as a
  gate failure. Missing or stale assessments block; they are never read as
  "no gap".

**Binding and freshness.** Each review is stored in `state.semantic[]` bound
to the artifact hash, the rules hash and a hash of the learner and diagnostic
evidence it saw (`diagnostic-wrong`, `own-words`, `quiz-wrong-answers`,
`previous-feedback` = earlier parts' feedback and this part's failed attempts).
If any of these changes, the receipt goes stale, `validate` lists it as pending
again and re-advancing the stage requires a fresh review. Plan-derived context
(`plan`, `plan-visual`, `part-explanation`) is included in the review context
but excluded from freshness on purpose: adaptation revises the plan after a
part closes, and that revision must not reopen closed parts. Later parts are
reviewed against the revised plan.

`status` reports a stale recorded review as a FAIL (so the settle gate blocks
after an edit) but never records; `validate` never mutates state. The tests
prove transport, admission and binding — they make no claim about review
quality, which rests on the evaluator named in each receipt.

## State layout (`.learning/state.json`)

```json
{
  "version": 1, "runId": "…", "mode": "deep", "workspace": "…",
  "createdAt": "…", "rulesHash": "sha256:…",
  "counters": {"successfulAdvances": 12},
  "global": {"planning": {"completedAt": "…", "receipts": {"plan.json": "sha256:…"}, "evidence": {}}},
  "partOrder": ["p1"],
  "parts": {"p1": {"stages": {"quiz": {"evidence": {"quizScore": 5, "quizPassed": true}}},
            "reteachRounds": 0,
            "quizAttempts": [{"score": 5, "passed": true, "wrongIds": [], "at": "…"}]}},
  "semantic": [{"ruleId": "explanation-adapted", "stage": "explanation", "part": "p1",
                "artifact": "explicaciones/Parte 1 - p1.md", "artifactHash": "sha256:…",
                "rulesHash": "sha256:…", "contextHash": "sha256:…", "reviewer": "…",
                "verdict": "PASS", "reason": "…"}]
}
```

States written before the scoped learner-note receipts can fail freshness. They
are never migrated or rewritten implicitly; start a new topic workspace.

## Rules file

`rules/deep.json` is the single source of truth: stage order, per-stage check
declarations (closed set of kinds), thresholds, conditional triggers and
semantic rubrics. `rules.Load` strictly rejects unknown fields, unknown check
kinds, unknown condition kinds, path traversal or absolute artifact paths,
missing part placeholders in part-scoped paths, inconsistent stage orders and
invalid thresholds — malformed rules fail closed (exit 2) before any stage is
evaluated. `init` records the SHA-256 of the rules file and snapshots the exact
file into `.learning/rules.json`; every later command of that run loads the
snapshot, so editing `rules/deep.json` changes new runs only and never blocks a
run in progress. A snapshot that no longer matches the recorded hash (edited by
hand) fails `rules-current`. Runs initialized before snapshots existed have no
`.learning/rules.json`: they keep using `--rules`, and a rules edit blocks them
with `rules-current`; copying the rules file they started with into
`.learning/rules.json` (same hash) moves them to the snapshot behavior.

## Verification evidence

`go test ./...` includes `TestCLIEndToEndDeepTopic`, which builds the real
binary and drives a complete one-part topic through the CLI subprocess
(including waits, rejected transitions that leave state unchanged, the
post-feedback plan obligation, the closing stages and the map re-score), plus
`TestCLIConceptualAndOutsideRoot`. Both are skipped under `-short`.
