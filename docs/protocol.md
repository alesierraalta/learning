# Engine / adapter contract

Implementation contract agreed before parallel writes. The Go engine owns learning rules, state, validation, judging and completion. The Pi adapter is transport and local activation only. No global prompt or global settings changes. No dependencies need installation for the Go standard-library implementation.

## Activation

Both conditions are required: canonical workspace is within the configured Learnings root, and mode is explicitly `deep`. Conceptual mode reports `skipped`, writes no learning state, records no review, and does not impose the deep diagnostic or bundle. Preserve the existing conceptual teaching skill; do not rewrite its quiz policy in this implementation.

## CLI boundary

Build: `go build -o bin/learning ./cmd/learning`.
Commands: `learning init|validate|advance|status|review --root ROOT --workspace TOPIC --rules RULES [--mode deep|conceptual] [--stage STAGE] [--rule RULE --verdict PASS|FAIL --reason TEXT [--reviewer ID]] [--json]`.
`--rules` points to repository `rules/deep.json`. Adapter passes canonical paths as argv, never concatenates a shell command. CLI help documents each command, input artifacts and configuration. stdout with `--json` is exactly one JSON object, no logging mixed in. Exit 0 = accepted/completed/waiting/skipped; 1 = failed mandatory validation; 2 = invalid arguments/configuration/operational failure. Errors must produce a machine-readable report with JSON mode.

Response: `{ "status": "accepted|completed|waiting|skipped|blocked|error", "stage": "...", "checks": [{"id":"...", "kind":"deterministic|semantic", "status":"PASS|FAIL|SKIP", "reason":"..."}], "nextStage": "..." }`. Additional structured evidence fields may be added. Adapter uses status/checks, not prose matching.

`init` creates engine-owned state for a new deep run, refusing to overwrite an existing run. `validate` checks without marking a stage complete and returns `pendingReviews` (the rubric, artifact, context and instruction for every review that is missing or stale). `advance` validates objective rules first, then requires a recorded, fresh review for every applicable rubric before it records successful stage evidence; a recorded `gate` FAIL verdict blocks. Reviews are produced by the chat (with subagents when useful) and recorded through `review`, never by `advance` arguments: `advance` cannot carry a verdict, and `review` only accepts the frontier stage after its objective checks pass. `status` revalidates receipt freshness, reports next required stage, and returns completed only if all obligatory stages and conditional obligations are current. Missing or stale reviews or evidence block, never PASS. Rejected transitions leave stage state and successful counters unchanged. A separate rejection report may be written without marking advancement.

Stages: preparation, diagnosis, planning, explanation, own_words, quiz, feedback, adaptation, final. Preserve sequential dependencies and required human-input wait points. Support repeated explanation/own_words/quiz/feedback/adaptation cycles for planned parts and bounded re-teaching; do not call a multi-part topic completed after only its first part. Stage inputs and multi-part shape must be documented by engine owner and communicated promptly to integration owner. Distinguish waiting for user answers from invalid generated output.

## Evidence and conditions

Structured JSON rules declare IDs, stage, validator kind, arguments, semantic rubric and conditional triggers; version/hash is recorded. Validate actual on-disk artifacts (not only model-authored done booleans): existence, required nonempty sections, concrete examples/visuals when planned, diagnostic/mini-quiz counts and question option/tag structure, recorded learner responses/results, required outputs after feedback, order. Content hash snapshots before feedback allow proving that plan/explanation was changed AFTER the triggering event; changing before feedback must not satisfy the later obligation. Content changes, rules changes, response changes, or omitted mandatory stages invalidate completion. Unknown rules/check types and malformed input fail closed. Confine artifacts and state to canonical workspace; reject traversal and symlink escapes. Sequential mutation/locking or conflict rejection must prevent simultaneous advances from losing state.

Default deep diagnostic: 6 prerequisite + 6 topic questions, topic levels 2/2/2, A-D plus E `No sé`. This 12-question default satisfies both existing prose clauses. Mini-quiz: 5. Failure at <=3/5 or central conceptual gaps -> re-teach, maximum 2 rounds, no unlock without own-words + quiz passing. Examples and visuals are required according to the declared per-part plan. Existing notes are not migrated and may fail strict validation until deliberately enrolled; never fabricate historical stage events.

## Recorded reviews (chat, possibly with subagents)

Interpretive rules stay out of deterministic checks but also out of any external
model call: no provider endpoint, key or judge environment exists. `validate`
returns `pendingReviews`, each entry naming `rule`, `stage`, `part`, `kind`
(gate|assessment), `artifact`, `artifactHash`, `instruction` (the rubric text
from `rules/deep.json`) and `context` (learner/diagnostic evidence the rule
requires). The chat — directly or through a subagent — evaluates the rubric
against that artifact and context and records exactly one verdict with
`review --stage S --rule R --verdict PASS|FAIL --reason TEXT [--reviewer ID]`.
The engine owns admission: objective checks must pass first, the stage must be
the recordless frontier, the verdict is `PASS|FAIL`, the reason is non-empty and
the receipt is bound to the artifact hash, rules hash and binding-context hash.
Recorded receipts live in `state.semantic[]` with a `reviewer` identity that
must carry no secrets. Editing the artifact or any binding context makes the
receipt stale: `validate` lists it again as pending and `advance` blocks (exit
1) until it is re-recorded. A `gate` FAIL blocks progression; an `assessment`
verdict stays evidence (`central-gap` PASS means a central gap was detected and
triggers the plan-update condition, FAIL means none) and never blocks by
itself. Missing, stale or FAIL gate reviews block, never PASS. Tests must prove
that missing/stale/FAIL reviews block progression and that edits invalidate
previous reviews; no live provider and no credentials are involved anywhere.

## Local adapter

Repository `integrations/pi/` contains adapter source and tests. Local vault `.pi` holds only a reference to it, not the engine or duplicated rules. Load only when cwd is inside Learnings (realpath boundary, not prefix text comparison). Explicit mode selection and topic enrollment; no inference from unrelated chat. Tools/commands invoke CLI using fixed executable/rules paths resolved from repository; binary absence visible, no silent fallback. Active stage gate before settle rechecks engine state; failures request bounded correction if host can continue, otherwise leave explicit blocked status. Waiting for user input is a legitimate pause, never topic completion. Pi lifecycle cannot promise infinite correction or suppress all prose; authoritative completion is engine status. Test host interactions using a fake ExtensionAPI and actual CLI seam when available; document live-host check separately.

## Verification

Engine: `go test ./...`, `go test -race ./...`, `go vet ./...`, `go build -o bin/learning ./cmd/learning`. Integration: `node --test integrations/pi/*.test.mjs`. All shell via RTK. Isolated temp workspaces and recorded-review fixtures only; no live provider, no credentials, real Obsidian notes remain unchanged. Each writer observes RED before behavior implementation, then GREEN, reports exact commands, failed/skipped checks, covered S# and Risk. No commits, publishing or global settings writes.
