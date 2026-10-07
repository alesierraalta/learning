# Test plan — Learning deep-validation engine (Go CLI + Pi adapter)

Created: 2026-10-07 · Last updated: 2026-10-07 · Plan path: `docs/testing/test-plan.md` · Sandbox: per-test `t.TempDir()` workspaces and `/tmp` copies; no containers needed (no network, no database) · Findings precision: 2 / 2
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
| 2026-10-07 | crash mid-save | L4 | internal/engine/state.go:168 | none | E5, E6, E7 | write fault and SIGKILL keep state intact; SIGTERM leaves the lock (F2, not pinned: fix needs a user decision) |
| 2026-10-07 | F2 SIGTERM lock release | L4 | internal/engine/state.go:168 | internal/engine/signal_test.go :: TestSignalReleasesWorkspaceLock | E8 | RED observed before the fix, GREEN after; 3 of 3 fix mutants killed |

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
| F2 | internal/engine/state.go:168 no signal handling: SIGTERM (Node execFile timeout kill in integrations/pi/index.ts:60) skipped the deferred lock release, blocking every mutating command for 5 minutes | availability | yes: state.json stays valid; only the lock file remained | E7, E8 | internal/engine/signal_test.go :: TestSignalReleasesWorkspaceLock | fixed | test-strategy / 2026-10-07 | user approved the fix; lockGuard releases the lock on SIGTERM/SIGINT after any in-flight commit | 1ab56a7 |
| F1 | internal/engine/artifacts.go:109 unsafe part slug/id rejection had no test: removing it left the suite green | security (path traversal) | yes: behavior was correct, only unpinned | E3 | internal/engine/guard_test.go :: TestUnsafePlanPathSegmentsBlockPreparation | gap-closed | test-strategy / 2026-10-07 | M6 survived the full suite before the test existed | 1996bff |

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

| E8 | an interrupted command releases the lock and keeps state | child test process parks inside the lock via lockAcquiredHook, parent sends the signal; then 150 random SIGTERM and 150 SIGINT kills against the rebuilt binary | go test ./internal/engine -run TestSignalReleasesWorkspaceLock -count=1 | readyForExplanation fixture with reviews recorded; signals SIGTERM and SIGINT | before fix: both subtests red (signal: terminated / interrupt, lock left); after fix: green 3/3 runs, exit 143 and 130, state unchanged, next advance accepted; random kills 0/300 lock left, 0 torn |  |  |  | if g.path != "" && !g.released { => if false { @ internal/engine/state.go:223 |  | handler without remove: both red; no signal.Notify: both red; SIGTERM code 0: SIGTERM red | rerun Admit | observado |
| E5 | a failed tmp write reports an error and keeps the previous state | state.json.tmp pre-created as a directory, then advance --stage explanation with the real binary | /tmp/learning-crash status --root /tmp/p1/Learnings --workspace /tmp/p1/Learnings/consensus --rules rules/deep.json --mode deep --json | exported fixture workspace with explanation reviews recorded | exit 2, detail state write failed ... is a directory; state.json sha256 byte-identical; lock released; stray state.json.tmp remains |  |  |  |  |  | negative control: same workspace without the fault advances to own_words | scratch export test (deleted) plus shell probe in session | observado |
| E6 | SIGKILL at any point never tears state.json | 150 runs: fresh copy, advance in background, kill -9 after 0-8 ms, then status | /tmp/learning-crash status --root /tmp/p2/Learnings --workspace /tmp/p2/Learnings/consensus --rules rules/deep.json --mode deep --json | same exported workspace | 150/150 status parsed state; 0 torn; lock left in 26/150 (stale takeover after 5 min, TestAdvanceLocking) |  |  |  |  |  | n/a | shell loop in session | observado |
| E7 | SIGTERM leaves the workspace lock behind | 60 runs each: advance in background, kill -TERM or -INT after 0-8 ms, check .learning/lock | /tmp/learning-crash status --root /tmp/ps/Learnings --workspace /tmp/ps/Learnings/consensus --rules rules/deep.json --mode deep --json | same exported workspace | SIGTERM: lock left in 8/60; SIGINT: 0/60 in this sample; no signal.Notify anywhere in cmd/ or internal/ |  |  |  |  |  | n/a | shell loop in session | observado |

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
