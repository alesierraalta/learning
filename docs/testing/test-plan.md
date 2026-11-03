# Test plan — Learning deep-validation engine (Go CLI + Pi adapter)

Created: 2026-10-07 · Last updated: 2026-10-07 · Plan path: `docs/testing/test-plan.md` · Sandbox: per-test `t.TempDir()` workspaces and `/tmp` copies; no containers needed (no network, no database) · Findings precision: 3 / 3
Baseline: `1996bff` · untracked files: 1 (this plan) · fingerprint: `f4ce081aacb91334487cc2e68e376d0010d4ae8e7522759e57e3c5f8444ca8ce` (a change is anything that differs from this fingerprint, not raw `git status`; the plan itself is excluded)

Tables are the format: prose never replaces a row.
A finding is a row whose cell opens with `path:line` and one line of finding. The path is a file with an
extension (`src/a.js:5`), a dotfile (`.gitignore:1`) or a conventional build file (`Makefile:3`); a
directory or a `host:port` is not a location.
A finding that lives only in prose does not exist for the scorer.

## Inventory

| Surface | Entry points | Owner module | Notes |
|---|---|---|---|
| CLI | `learning init/status/validate/advance/review` | `cmd/learning/main.go:19` | single JSON report on stdout; exit 0 accepted, 1 blocked, 2 operational |
| Engine API | `engine.Run(Options)` | `internal/engine/engine.go:120` | rules load, realpath workspace containment, command dispatch |
| Persistent state | `.learning/state.json`, `.learning/lock` | `internal/engine/state.go:134` | atomic tmp+rename save; O_EXCL lock with 5 min stale takeover |
| Recorded reviews | `review` command, `pendingReviews` evidence | `internal/engine/engine.go:862` | binding = artifact hash + rules hash + context hash; gate FAIL blocks |
| Artifact readers | plan.json, quizzes, answers, notes | `internal/engine/artifacts.go:61` | part id / slug become path segments |
| Rules contract | `rules/deep.json` | `internal/rules/rules.go:1` | repository-owned, trusted input |
| Pi adapter | `/learning` command, `learning_stage` tool | `integrations/pi/index.ts:195` | realpath scoping to the Learnings vault; spawns `bin/learning` |
| Critical journey | init → preparation → … → final | `internal/engine/cli_e2e_test.go:112` | real binary built per test run |

## Ranked targets

Rows are never removed by budget; budget changes order and status only. Rows contributed by a
sibling in the layer sweep name that sibling in "Sibling skill".

| Target | Blast radius | Churn / past fixes | Consequence class | Existing evidence | Altitude | Target rung | Sibling skill | Verdict | Status | Run |
|---|---|---|---|---|---|---|---|---|---|---|
| state lock + in-lock reload (`internal/engine/engine.go:304`) | every mutating command | new code, 1 commit | data integrity (lost review/advance) | TestConcurrentAdvancesNeverCorruptState, TestAdvanceLocking | engine API | L4 | `crash-and-process-testing` | probe | blocked |  |
| recorded-review binding (`internal/engine/engine.go:862`) | every judged stage | rewritten in T5 | correctness gate (S7/S14) | judge_test.go suite | engine API | L4 | `exploit-testing` | probe | done |  |
| plan path segments (`internal/engine/artifacts.go:83`) | every part-scoped artifact path | new code | security (path traversal) | none before this run | engine API | L4 | `appsec-adversarial-auditor` | pin | done |  |
| workspace containment (`internal/engine/engine.go:139`) | all commands | new code | security (writes outside vault) | TestWorkspaceContainment, TestCLIConceptualAndOutsideRoot | engine API + CLI | L4 | `appsec-adversarial-auditor` | probe | done |  |
| stage receipt staleness (`internal/engine/engine.go:715`) | status/advance after edits | new code | correctness gate (S3/S7) | TestStatusReportsStaleReview | engine API | L4 | `exploit-testing` | probe | done |  |
| CLI contract (`cmd/learning/main.go:19`) | Pi adapter, chat | rewritten in T5 | public contract | main_test.go, cli_e2e_test.go | CLI binary | L3 | `contract-compat-testing` | probe | done |  |
| Pi adapter scoping (`integrations/pi/index.ts:195`) | Pi sessions in the vault | rewritten in T6 | scope leak (S1) | adapter.test.mjs 20 tests | adapter | L3 | `real-run-validation` | probe | done |  |
| deep journey end to end (`internal/engine/cli_e2e_test.go:112`) | whole product | new | product works | TestCLIEndToEndDeepTopic | real binary | L5 | `real-run-validation` | probe | done |  |
| crash mid-save (`internal/engine/state.go:143`) | state.json | new code | data integrity | atomic rename by construction | process | L4 | `crash-and-process-testing` | probe | done |  |

Verdicts: probe · pin · none. Statuses: pending · in progress · done · blocked · n/a.
A `none` verdict is created with status `n/a`; the execution ratio excludes `n/a` rows.

## Real-run recipes

How each critical journey is driven for real (`real-run-validation`), so EXECUTE never rediscovers it.

| Journey | Start command | Data setup | Sample requests | Expected observable |
|---|---|---|---|---|
| deep topic end to end | `go test ./internal/engine -run TestCLIEndToEndDeepTopic -count=1` | test builds the binary and a temp Learnings workspace | init, validate, review, advance through final | each stage accepted with exit 0; blocked stages exit 1 with the failing check id |
| recorded review gate | `go build -o /tmp/learning-verify ./cmd/learning` then run in a `/tmp` workspace | fixture artifacts up to explanation | `review --stage explanation --rule <r> --verdict PASS --reason x` | missing/stale/gate-FAIL review blocks advance, exit 1, state unchanged |
| adapter seam | `node --test integrations/pi/*.test.mjs` | `go build -o bin/learning ./cmd/learning` first | live CLI seam test | one machine-readable status report from the real binary |

## Layer matrix

The `Run` column identifies which bounded run owns each layer and target row; leave it blank for unscoped work.

| Layer | Skill | Scope | Status | Run |
|---|---|---|---|---|
| Security | `appsec-adversarial-auditor` | workspace containment, plan path segments; local single-user CLI, no auth or secrets | done |  |
| Runtime and faults | `runtime-reliability-testing`, `resilience-fault-injection` | n/a: local one-shot CLI, no service, no network dependency, no load profile | n/a |  |
| Persistence and migrations | `database-persistence-testing` | n/a: no database or migrations; state file integrity is owned by the crash and lock targets | n/a |  |
| Architecture conformance | `clean-architecture-audit` | n/a: three packages (cmd → engine → rules), no layering contract to enforce | n/a |  |
| Critical e2e journeys | `real-run-validation` | deep topic end to end, recorded review gate, adapter seam | done |  |
| Sandbox | `docker-test-containers` | n/a: temp directories suffice; no external dependency to containerize | n/a |  |

Statuses: pending · in progress · done · blocked · n/a. `plan gaps` counts a row as swept when its
status cell reads `done`, `fixed` or `closed`, and drops `n/a`, `na`, `none` and `skipped` from the
denominator entirely; the `Skill` cell only labels the rows still owed. In a plan that declares
`Light:`, every `n/a` row also states its reason in the `Scope` cell, and the declared blast radius
(`Light: <blast radius> · touches <classes>`) must be corroborated by the plan: either it equals a
`Target` cell in Ranked targets exactly (a directory works this way), or it is a file path the plan
cites somewhere as `path:line`. Write the path without `:line` in the declaration; the check compares
it with the part of each citation before the colon.

## Not testing, on purpose

| Target | Reason |
|---|---|
| artifact symlinks pointing outside the workspace | local single-user tool reading the user's own files; reading through a symlink discloses nothing to another principal |
| malformed `rules/deep.json` beyond existing coverage | repository-owned trusted input; TestMalformedRulesFailClosed already fails closed |
| load and latency | one-shot CLI over a handful of small files |

## Characterization (legacy)

| Test | Behavior pinned | Believed correct? | Promote or delete after the change |
|---|---|---|---|

## Execution log

| Date | Target | Rung reached | Findings (path:line) | Promoted tests | Evidence (ledger id) | Notes |
|---|---|---|---|---|---|---|
| 2026-10-07 | state lock + in-lock reload | L3 | internal/engine/engine.go:309 | none | E1 | contention observed, no lost review; reload mutation survives, see Blocked by testability |
| 2026-10-07 | recorded-review binding, containment, staleness, lock window, verdict arg | L4 | none | none | E2 | mutation survey: 7 of 7 compiling mutants killed by the existing suite |
| 2026-10-07 | plan path segments | L4 | internal/engine/artifacts.go:109 | internal/engine/guard_test.go :: TestUnsafePlanPathSegmentsBlockPreparation | E3 | gap closed; 4 of 4 adjacent mutants killed |
| 2026-10-07 | CLI contract, adapter, deep journey | L5 | none | none | E4 | full suites green against the rebuilt binary |
| 2026-10-07 | crash mid-save | L4 | internal/engine/state.go:173 | none | E5, E6, E7 | write fault and SIGKILL keep state intact; SIGTERM leaves the lock (F2, not pinned: fix needs a user decision) |
| 2026-10-07 | F2 SIGTERM lock release | L4 | internal/engine/state.go:173 | internal/engine/signal_test.go :: TestSignalReleasesWorkspaceLock | E8 | RED observed before the fix, GREEN after; 3 of 3 fix mutants killed |

## Findings

A rejected or wontfix finding is a known non-issue: it is never re-proposed unless the fingerprint
of its cited files changed; when a run skips it, it cites the row. Severity is the consequence class
(`references/prioritization.md`); always state whether data is safe. A `confirmed` or `fixed`
finding names the promoted test that asserts the promised behaviour, so it is red on the current
code and green once fixed (rule 13); a test written the other way round is a characterization
test and says so in its name. A finding that never got a test stays `open`, reason `not pinned`.
The fingerprint cell holds the `assets/fingerprint.sh` output, one or more git SHAs, `-` when none
is recorded, or `pending` while the value is owed; `plan check` refuses anything else.

| Id | Finding (path:line, one line) | Severity (consequence class) | Data safe? | Evidence id | Pinning test (suite path :: test name) | Status | Verdict by / date | Reason | Cited-files fingerprint at verdict |
|---|---|---|---|---|---|---|---|---|---|
| F2 | internal/engine/state.go:173 no signal handling: SIGTERM (Node execFile timeout kill in integrations/pi/index.ts:60) skipped the deferred lock release, blocking every mutating command for 5 minutes | availability | yes: state.json stays valid; only the lock file remained | E7, E8 | internal/engine/signal_test.go :: TestSignalReleasesWorkspaceLock, TestSignalReleasesEveryHeldLock | fixed | test-strategy / 2026-10-07 | user approved the fix; one process-wide handler releases every owned lock on SIGTERM/SIGINT after any in-flight commit (round 2 after independent verify muye9cbr-2-azp5 found per-lock handlers stranded a second lock; re-verify muyezg82-3-xdzj PASS on a9ccd41: new test red on b872aac and green on a9ccd41, -race 106 passed, 100 random binary kills with no leftover lock; docs/engine.md narrowed to the observed handler window) | 1ab56a7 |
| F3 | internal/engine/checks.go:309 diagnosis pieza.contenido binding to quiz.md had no test and an opaque reason; the real Pi rehearsal needed three diagnosis attempts and read Go source to understand it | correctness gate (S3) | yes: behavior was correct, only unpinned and undocumented | E10 | internal/engine/flow_test.go :: TestDiagnosisPieceMustAppearInTheNote | gap-closed | test-strategy / 2026-10-07 | removing the check survived the suite; reason now says to copy pieza.contenido verbatim; docs/engine.md JSON sidecar shapes documents it | 33f3200 |
| F1 | internal/engine/artifacts.go:109 unsafe part slug/id rejection had no test: removing it left the suite green | security (path traversal) | yes: behavior was correct, only unpinned | E3 | internal/engine/guard_test.go :: TestUnsafePlanPathSegmentsBlockPreparation | gap-closed | test-strategy / 2026-10-07 | M6 survived the full suite before the test existed | 1996bff |
| F4 | integrations/pi/telemetry.ts:276 | security | no | E11 | studio/telemetry.test.mjs :: recordQuizTelemetry does not pollute Object.prototype when categoria is __proto__ or Object properties | fixed | test-strategy / 2026-11-02 | sanitized unsafe category keys (__proto__, constructor, prototype) and used Object.hasOwn for category lookups | - |
| F5 | integrations/pi/telemetry.ts:153 | security | no | E12 | studio/telemetry.test.mjs :: saveTopicTelemetry and readTopicTelemetry reject symlinks escaping the Learnings root | fixed | test-strategy / 2026-11-02 | safeTopic validation plus symlink detection and resolveContained checks reject topic symlinks escaping root | - |
| F6 | integrations/pi/telemetry.ts:127 | availability | yes | E13 | studio/telemetry.test.mjs :: validateGlobalTelemetry rejects malformed telemetry with missing or non-object tendencias or por_categoria | fixed | test-strategy / 2026-11-02 | validateGlobalTelemetry now strictly validates tendencias and por_categoria object records | - |
| F7 | integrations/pi/telemetry.ts:241 | correctness gate | yes | E14 | studio/telemetry.test.mjs :: recordQuizTelemetry normalizes category diacritics so accented and unaccented categories update the same profile | fixed | test-strategy / 2026-11-02 | categories normalized with normalizeText and slugified to match profile without diacritic fragmentation | - |
| F8 | studio/sugerencias.ts:112 | data integrity | yes: no entry is lost; a healthy file is renamed and the store is rewritten the same way | E15 | studio/server.test.mjs :: a store with no suggestions is not a broken store | confirmed | test-strategy / 2026-11-03 | keepAside treats an entry-less but parseable store as unreadable, renaming a valid file to sugerencias.corrupta-<stamp>.json | - |
| F9 | studio/sugerencias.ts:96 | data integrity | no: the unreadable entry is dropped and the rewrite persists the filtered list | E16 | studio/server.test.mjs :: an entry the store cannot read is never thrown away | confirmed | test-strategy / 2026-11-03 | readSugerencias drops entries that fail clean() and keepAside only keeps the file when every entry vanished, so one odd entry among good ones disappears without a copy | - |
| F10 | studio/sugerencias.ts:246 | correctness gate | yes: one entry is stored, but the caller is told the request failed | E17 | studio/server.test.mjs :: recording a suggestion never half-succeeds | confirmed | test-strategy / 2026-11-03 | recordSugerencia writes the entry and only then calls applyMotivos; an unreadable preferencias.json answers 500 after the write and a retry stores the same words twice | - |
| F11 | integrations/pi/bridge.ts:452 | data integrity | no: the older page is overwritten in the trash | E18 | integrations/pi/bridge.test.mjs :: two regenerations in the same millisecond keep both previous versions | confirmed | test-strategy / 2026-11-03 | the trash folder is named after the millisecond, so two backups in the same millisecond share it: the second manifest replaces the first and renameSync overwrites the same relative page | - |
| F12 | studio/server.ts:632 | data integrity | yes: the part is preserved in .papelera, but out of the library | E19 | studio/server.test.mjs :: a regeneration that is refused never moves the part | confirmed | test-strategy / 2026-11-03 | the prompt is measured after recordSugerencia and backupPartForRegeneration already ran, so a 400 answers a request that moved the part out of the reader and left it unregenerated | - |

Statuses: open · confirmed · fixed · gap-closed · rejected · wontfix.
`gap-closed` is a behaviour that was correct but untested, now held by the promoted test it names; like
`confirmed` and `fixed` it owes that test.

## Evidence ledger

One row per `observado` conclusion (`references/evidence.md`). `razonado` items go under
"Hypotheses" below, never here.

`Admit` holds ONE bare shell command, with no backticks and no placeholders, because `Executed` is
prose a human reads and `Admit` is the command the binary runs. `Digest` holds the `sha256:` digest of the
canonical output, written by `tsp plan admit --execute --record <id>` rather than by hand.

| Id | Claim | Executed | Admit | Inputs and parameters | Observed | Digest | Normalize | Mode | Mutate | Expect | Mutation or negative control → result | Reproduction | Label (`observado` / `razonado`, literal) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | concurrent review recording loses no accepted review | scratch probe goroutines recording 2 pending reviews in parallel with retry on lock held, 30 runs with -race | go test ./internal/engine -run TestConcurrentAdvancesNeverCorruptState -count=1 | readyForExplanation fixture, 2 pending reviews | 30/30 no lost review; lock-held retries in 29/30 runs; race detector clean |  |  |  |  |  | removing the in-lock loadState reload: probe still 30/30 green (survived; window too narrow to force) | scratch probe deleted after the run; recreate from Execution log row 1 | observado |
| E2 | existing suite kills mutants of the critical decisions | go test ./... -count=1 per mutant, file restored after each | go test ./... -count=1 | M1 review artifact hash, M2 context hash, M3 gate FAIL, M4 stale-lock window, M5 containment, M7 verdict arg, M8 receipt hash | all 7 killed (TestEditedArtifactInvalidatesRecordedReview, TestChangedLearnerResponseRequiresQuizRejudgment, TestGateFailReviewBlocksAssessmentIsEvidence, TestAdvanceLocking, TestWorkspaceContainment, TestReviewCommandValidation, TestStatusReportsStaleReview); M6 slug check survived |  |  |  | rec.ArtifactHash == b.artifactHash && => true && @ internal/engine/engine.go:863 |  | each mutant red, restored tree green | codemode mutation script in session; tree verified clean after | observado |
| E3 | unsafe plan slug or id blocks preparation with state unchanged | go test ./internal/engine -run TestUnsafePlanPathSegmentsBlockPreparation -count=1 -v | go test ./internal/engine -run TestUnsafePlanPathSegmentsBlockPreparation -count=1 | slugs ../escape, a/b, a\b; id .. | 4/4 subtests pass on current code |  |  |  | if !safeID(p.Slug) { => if false { @ internal/engine/artifacts.go:109 ;; if !safeID(p.ID) { => if false { @ internal/engine/artifacts.go:99 |  | slug check removed: 3 slug subtests red; id check removed: id subtest red; backslash dropped from safeID: backslash subtest red; ".." allowed: id subtest red | rerun Admit | observado |
| E4 | full suites green after the change | go test ./... -count=1; go vet ./...; node --test integrations/pi/*.test.mjs | go test ./... -count=1 | baseline 1996bff plus guard_test.go | Go 102 passed in 3 packages; vet clean; adapter 20 pass 0 fail |  |  |  |  |  | n/a | rerun Admit | observado |

| E8 | an interrupted command releases the lock and keeps state | child test process parks inside the lock via lockAcquiredHook, parent sends the signal; then 150 random SIGTERM and 150 SIGINT kills against the rebuilt binary | go test ./internal/engine -run TestSignalReleasesWorkspaceLock -count=1 | readyForExplanation fixture with reviews recorded; signals SIGTERM and SIGINT | before fix: both subtests red (signal: terminated / interrupt, lock left); after fix: green 3/3 runs, exit 143 and 130, state unchanged, next advance accepted; random kills 0/300 lock left, 0 torn |  |  |  | _ = os.Remove(p)\n\t\t}\n\t\tcode := 130 => _ = os.Remove(p)\n\t\t\tbreak\n\t\t}\n\t\tcode := 130 @ internal/engine/state.go:227 |  | handler without remove: both red; no signal.Notify: both red; SIGTERM code 0: SIGTERM red; round 2: handler removing only one lock: TestSignalReleasesEveryHeldLock red (RED observed before the process-wide handler); 200 more random kills 0 lock left | rerun Admit | observado |
| E10 | a diagnosis piece missing from quiz.md blocks with an actionable reason, whitespace-only differences still bind | go test ./internal/engine -run TestDiagnosisPieceMustAppearInTheNote -count=1 | go test ./internal/engine -run TestDiagnosisPieceMustAppearInTheNote -count=1 | default fixture questions; d1 piece re-spaced, then replaced by text absent from the note | whitespace variant binds (PASS); missing piece blocks quiz-structure with the copy-verbatim reason; state unchanged |  |  |  | if !containsNorm(note, q.Pieza.Contenido) { => if false && !containsNorm(note, q.Pieza.Contenido) { @ internal/engine/checks.go:309 |  | check disabled: test red; strings.Contains instead of containsNorm: test red | rerun Admit | observado |
| E5 | a failed tmp write reports an error and keeps the previous state | state.json.tmp pre-created as a directory, then advance --stage explanation with the real binary | /tmp/learning-crash status --root /tmp/p1/Learnings --workspace /tmp/p1/Learnings/consensus --rules rules/deep.json --mode deep --json | exported fixture workspace with explanation reviews recorded | exit 2, detail state write failed ... is a directory; state.json sha256 byte-identical; lock released; stray state.json.tmp remains |  |  |  |  |  | negative control: same workspace without the fault advances to own_words | scratch export test (deleted) plus shell probe in session | observado |
| E6 | SIGKILL at any point never tears state.json | 150 runs: fresh copy, advance in background, kill -9 after 0-8 ms, then status | /tmp/learning-crash status --root /tmp/p2/Learnings --workspace /tmp/p2/Learnings/consensus --rules rules/deep.json --mode deep --json | same exported workspace | 150/150 status parsed state; 0 torn; lock left in 26/150 (stale takeover after 5 min, TestAdvanceLocking) |  |  |  |  |  | n/a | shell loop in session | observado |
| E7 | SIGTERM leaves the workspace lock behind | 60 runs each: advance in background, kill -TERM or -INT after 0-8 ms, check .learning/lock | /tmp/learning-crash status --root /tmp/ps/Learnings --workspace /tmp/ps/Learnings/consensus --rules rules/deep.json --mode deep --json | same exported workspace | SIGTERM: lock left in 8/60; SIGINT: 0/60 in this sample; no signal.Notify anywhere in cmd/ or internal/ |  |  |  |  |  | n/a | shell loop in session | observado |
| E11 | categoria __proto__ pollutes Object.prototype in recordQuizTelemetry | node --test --test-name-pattern='pollute Object.prototype' studio/telemetry.test.mjs | node --test --test-name-pattern='pollute Object.prototype' studio/telemetry.test.mjs |  | test failed: Object.prototype.hasOwnProperty('total') was true |  |  |  |  | fail |  |  | observado |
| E12 | symlink escaping the Learnings root is accepted and written in saveTopicTelemetry | node --test --test-name-pattern='reject symlinks escaping' studio/telemetry.test.mjs | node --test --test-name-pattern='reject symlinks escaping' studio/telemetry.test.mjs |  | test failed: Missing expected exception, symlink was followed |  |  |  |  | fail |  |  | observado |
| E13 | validateGlobalTelemetry allows missing tendencias or por_categoria leading to TypeError crash | node --test --test-name-pattern='validateGlobalTelemetry rejects malformed' studio/telemetry.test.mjs | node --test --test-name-pattern='validateGlobalTelemetry rejects malformed' studio/telemetry.test.mjs |  | test failed: Missing expected exception on malformed objects |  |  |  |  | fail |  |  | observado |
| E14 | accented category duplicates key in perfil_alumno.tendencias instead of matching existing category | node --test --test-name-pattern='normalizes category diacritics' studio/telemetry.test.mjs | node --test --test-name-pattern='normalizes category diacritics' studio/telemetry.test.mjs |  | test failed: duplicate accented key matemáticas created |  |  |  |  | fail |  |  | observado |
| E15 | a store that parses with no entries must not be renamed as corrupt when the next suggestion is written | node --test --test-concurrency=1 studio/server.test.mjs (test: a store with no suggestions is not a broken store) |  | root/sugerencias.json = {"version":1,"actualizado":"","entradas":[]}; then POST /<token>/api/sugerencias {tema:redes,parte:p1,texto:'una idea'} | response 200 and sugerencias.corrupta-2026-11-03T16-39-52-364Z.json appears next to the rewritten store; the pinning test fails with 'a store that parses with no entries was kept aside as corrupt' |  |  |  | empty store kept in place => empty store renamed sugerencias.corrupta-<stamp>.json @ studio/sugerencias.ts:112 |  |  | cd /home/ale/documents/learning && node --test --test-concurrency=1 studio/server.test.mjs | observado |
| E16 | an entry the store cannot parse must survive a later write, at least as a copy | node --test --test-concurrency=1 studio/server.test.mjs (test: an entry the store cannot read is never thrown away) |  | root/sugerencias.json holds one clean entry and {id:7,texto:'no la entiendo'}; then POST /<token>/api/sugerencias | the store is rewritten with only the clean entry and the new one: no sugerencias.corrupta-* file and no surviving copy of 'no la entiendo'; the pinning test fails with 'the unreadable entry vanished without a copy' |  |  |  | whole-file keepAside => keepAside only when every entry is unreadable @ studio/sugerencias.ts:112 |  |  | cd /home/ale/documents/learning && node --test --test-concurrency=1 studio/server.test.mjs | observado |
| E17 | a suggestion is either stored and reported stored, or refused with nothing stored | node --test --test-concurrency=1 studio/server.test.mjs (test: recording a suggestion never half-succeeds) |  | root/preferencias.json = '{ roto'; then POST /<token>/api/sugerencias {motivos:['faltan-ejemplos'],texto:'mas ejemplos de capas'} | response 500 with the raw JSON.parse message after sugerencias.json already holds the entry; the pinning test fails with 'the studio answered 500 after storing the entry' |  |  |  | entry written before applyMotivos => applyMotivos inside the stored result @ studio/sugerencias.ts:246 |  |  | cd /home/ale/documents/learning && node --test --test-concurrency=1 studio/server.test.mjs | observado |
| E18 | two backups of one part never share a folder or overwrite each other's page | node --test --test-concurrency=1 integrations/pi/bridge.test.mjs (test: two regenerations in the same millisecond keep both previous versions) |  | one plan (redes/p1), page written as '<p>primera version</p>', backupPartForRegeneration(now=2026-01-01T00:00:00.000Z), page rewritten as '<p>segunda version</p>', backup again with the same now | both calls return .papelera/2026-01-01T00-00-00-000__regeneracion__redes-p1; the manifest lists only the second move and only '<p>segunda version</p>' survives under .papelera |  |  |  | unique trash folder per call => folder named only after the millisecond @ integrations/pi/bridge.ts:452 |  |  | cd /home/ale/documents/learning && node --test --test-concurrency=1 integrations/pi/bridge.test.mjs | observado |
| E19 | a refused regeneration leaves the part in the library, writes no backup and asks the tutor nothing | node --test --test-concurrency=1 studio/server.test.mjs (test: a regeneration that is refused never moves the part) |  | redes/plan.json with part p1 title of 40000 chars, redes/explicaciones/Parte 1 - Capas.html present, POST /<token>/api/regenerar {motivos:['demasiado-texto']} | response 400 'the regeneration prompt is too long'; the page is gone from the vault and sits in .papelera/<stamp>__regeneracion__redes-p1/redes/explicaciones/, and the fake tutor received no prompt |  |  |  | prompt built and measured before the backup => measured after recordSugerencia and backupPartForRegeneration @ studio/server.ts:632 |  |  | cd /home/ale/documents/learning && node --test --test-concurrency=1 studio/server.test.mjs | observado |

### Hypotheses (razonado)

| Hypothesis | Probe that would settle it |
|---|---|
| stale-lock takeover can let two processes hold the lock if both observe staleness at once (remove then create race) | two processes forced past the stale check together through a test hook before os.Remove |
| saveState never fsyncs the tmp file or the directory (internal/engine/state.go:143), so a power loss after rename could leave an empty state.json and brick the run | block-level power-loss simulation (dm-flakey); not runnable on this WSL host |
| with stdout closed, advance commits state and exits 0 with no report: is a lost report a failure under the CLI contract? | decide the contract in docs/engine.md, then assert the exit code with stdout closed |

## Calibration history

One row per calibration run (`references/calibration.md`); never overwritten.

| Date | Skill version | K | Found | Recall | Misses (file:line operator, why) | False positives |
|---|---|---|---|---|---|---|

## Blocked by testability

| Target | Rung | Why | Minimal change that opens it |
|---|---|---|---|
| state lock + in-lock reload | L4 | the lost-update window between the pre-lock loadState and acquireLock is too narrow to force from outside; removing the reload survives every test | a package-level test hook called in runStage after the first loadState and before acquireLock, set only by tests |

## Remaining, in order

1. state lock + in-lock reload — L4 — `crash-and-process-testing` (needs the test hook above)
