# Test plan — exam-mode change (#210, #211, #213)

Created: 2026-11-12 · Last updated: 2026-11-12 · Plan path: `odd/tests/exam-mode-tsp.md` · Sandbox: current isolated feature worktree · Findings precision: 1 / 1
Baseline: `0b43861` · task range: `origin/main..HEAD` · untracked files at start: 0 · fingerprint: `55fbdea95736bfcac3277d697be07cb622046276f8613e0800acfc22028aba92` (SHA-256 of unchanged `integrations/pi/index.ts`; a full-tree fingerprint was not captured)

Tables are the format: prose never replaces a row.
A finding is a row whose cell opens with `path:line` and one line of finding. The path is a file with an
extension (`src/a.js:5`), a dotfile (`.gitignore:1`) or a conventional build file (`Makefile:3`); a
directory or a `host:port` is not a location.
A finding that lives only in prose does not exist for the scorer.

## Inventory

| Surface | Entry points | Owner module | Notes |
|---|---|---|---|
| Engine CLI and persisted run state | `learning init`, `validate`, `advance`, `status` | `cmd/learning`, `internal/engine`, `internal/rules` | Exam format, Pareto scope, state/report round trip, old rules snapshots |
| Pi adapter | `learning_stage` init and later actions | `integrations/pi/index.ts` | Preflight validation, argv, no state change on rejection |
| MCP adapter | `learning_init` schema and CLI forwarding | `cmd/learning/mcp.go` | Optional exam/practice flags remain init-only and backward-compatible |
| Studio library and UI | `listTopics`, home mode creation, topic tags, tutorial | `integrations/pi/bridge.ts`, `studio/server.ts`, `studio/ui` | Valid exam metadata shows Examen; malformed metadata preserves the topic |

## Ranked targets

Rows are never removed by budget; budget changes order and status only. Rows contributed by a
sibling in the layer sweep name that sibling in "Sibling skill".

| Target | Blast radius | Churn / past fixes | Consequence class | Existing evidence | Altitude | Target rung | Sibling skill | Verdict | Status | Run |
|---|---|---|---|---|---|---|---|---|---|---|
| Exam init, state, and CLI flags (`cmd/learning/main.go`, `internal/engine/engine.go`, `state.go`) | CLI, state, and tool callers | feature change | corrupted run scope or silently wrong exam | exam init/status tests; new command matrix | CLI plus unit | L2 | `go-testing` | probe | done |  |
| Pareto and exam plan/mock gates (`internal/engine/exam.go`, `pareto.go`, `checks.go`) | every deep run stage | feature change | silently wrong study plan or mock exam | prep/planning and final-quiz tests; new Pareto and boundary probes | engine workflow | L2 | `go-testing` | probe | done |  |
| Adapter preflight and init side effects (`integrations/pi/index.ts`) | Pi `learning_stage` consumers | feature change | unwanted topic/enrollment state | existing invalid-argument tests; new whitespace witness F1 | tool contract | L2 | `contract-compat-testing` | pin | done |  |
| Studio exam mode and tag (`studio/ui/studio.js`, `bridge.ts`, `server.ts`) | home and topic pages | feature change | wrong visible mode or hidden topic | browser mode/tag tests including malformed metadata | browser integration | L2 | `real-run-validation` | probe | done |  |
| Durable init failure boundaries (`internal/engine/state.go`, `engine.go`) | state and rules snapshots | write path unchanged | lost or torn run state | normal legacy/frozen-snapshot tests only | process/durability | L2 | `crash-and-process-testing` | probe | pending |  |

Verdicts: probe · pin · none. Statuses: pending · in progress · done · blocked · n/a.
A `none` verdict is created with status `n/a`; the execution ratio excludes `n/a` rows.

## Real-run recipes

How each critical journey is driven for real (`real-run-validation`), so EXECUTE never rediscovers it.

| Journey | Start command | Data setup | Sample requests | Expected observable |
|---|---|---|---|---|
| Exam CLI and report/state round trip | `go test -v -timeout 30s ./cmd/learning -run TestCLIExam` | `t.TempDir` workspace | `init --exam practical --practice` with Unicode; later exam/practice flags on validate, advance, status | state/report store trimmed practice, exam implies pareto; invalid calls exit 2 with state byte-identical |
| Exam plan and mock gates | `go test -v -timeout 30s ./internal/engine -run TestExam` | engine fixture | oral/written/practical questions and planning rewrite | check IDs report PASS/FAIL/SKIP; rejected advances leave state unchanged |
| Written exam mix | `go test -v -timeout 30s ./internal/engine -run TestWrittenExamStillRequiresTheExistingMixedQuestionFormat` | written exam with only choice questions | advance final_quiz | `exam-mock` passes shape; existing final-quiz check rejects missing open questions |
| Pi adapter preflight | `node --test --test-timeout=5000 integrations/pi/adapter.test.mjs` | fake host and synthetic Learnings root | `learning_stage init` with whitespace-only practical text | rejected input makes no engine call, creates no topic, and does not enroll the session; currently RED on F1 |
| Studio mode creation | `node --test --test-timeout=5000 --test-name-pattern='home offers quick' studio/layout.test.mjs` | browser, synthetic topic root, fake Pi | select Examen and submit a topic | selected exam mode reaches the prompt |
| Studio valid exam tag | `node --test --test-timeout=5000 --test-name-pattern='exam topics expose' studio/layout.test.mjs` | browser, synthetic exam state | read home and topic views | both views show Examen with the declared format |
| Studio malformed exam tag | `node --test --test-timeout=5000 --test-name-pattern='malformed exam state keeps a topic visible' studio/layout.test.mjs` | browser, synthetic invalid JSON and unsupported format | reload topic library and home card | topic remains visible with the ordinary Universitario tag |

## Layer matrix

The `Run` column identifies which bounded run owns each layer and target row; leave it blank for unscoped work.

| Layer | Skill | Scope | Status | Run |
|---|---|---|---|---|
| Security | `appsec-adversarial-auditor` | No authN, tenant, secret, or remote trust boundary in this local feature; malformed exam metadata is covered by the Studio test | n/a |  |
| Runtime and faults | `crash-and-process-testing` | SIGTERM, crash-between-write-steps, short-write and ENOSPC injection on state/rules files not run | pending |  |
| Persistence and migrations | `contract-compat-testing` | Legacy state and frozen rules snapshots read normally; crash durability of the added field not injected | pending |  |
| Architecture conformance | `clean-architecture-audit` | No new import direction or layer was introduced; CodeGraph call paths inspected | n/a |  |
| Critical e2e journeys | `real-run-validation` | Browser mode creation/tag with fake Pi is run; complete tutor-generated exam journey through a fresh built artifact is not run | pending |  |
| Sandbox | `docker-test-containers` | No database, cache, or container dependency in this change | n/a |  |

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
| `skills/explicacion-interactiva` and its references | Outside this repository and outside the exact allowed edit surfaces; issues #210, #211, and #213 are the requested scope |
| Model-generated exam content quality | The engine checks structural contracts only; no provider/model run is in this bounded TSP |
| Crash, SIGTERM, short-write, ENOSPC, and concurrent init failure injection | Existing atomic writer is unchanged; no deterministic fault seam was exercised, so these remain pending rather than ruled out |

## Characterization (legacy)

| Test | Behavior pinned | Believed correct? | Promote or delete after the change |
|---|---|---|---|

## Execution log

| Date | Target | Rung reached | Findings (path:line) | Promoted tests | Evidence (ledger id) | Notes |
|---|---|---|---|---|---|---|
| 2026-11-12 | Engine/CLI exam contract | L2 | - | exam-init, flags, legacy, Pareto, plan/mock boundary tests | E2,E3 | Focused Go checks pass; full `go test ./...` result recorded below |
| 2026-11-12 | Pi adapter preflight | L2 | `integrations/pi/index.ts:679` | `integrations/pi/adapter.test.mjs :: stage tool rejects blank practical descriptions before any init side effect` | E1 | One current-code RED; full adapter file: 46 pass, 1 fail (the witness) |
| 2026-11-12 | Studio mode and malformed-state tag | L2 | - | browser mode/tag tests | E4 | 4 focused browser tests pass |
| 2026-11-12 | Repository test suites | L2 | `integrations/pi/index.ts:679` | `go test ./...`; adapter file; four browser tests | E1,E4,E5 | Go suite PASS; adapter file 46 pass/1 RED witness; focused Studio tests 4 pass; full Node suite interrupted at the 20s cap in `integrations/pi/bridge.test.mjs` |
| 2026-11-12 | TSP regression gate | L2 | `integrations/pi/index.ts:679` | `tsp redcheck`; explicit adapter redcheck | E1 | automatic redcheck chose Go tests and found no Go witness; explicit Node suite found F1; `tsp check --base origin/main` timed out at 20s with no output |

## Findings

A rejected or wontfix finding is a known non-issue: it is never re-proposed unless the fingerprint
of its cited files changed; when a run skips it, it cites the row. Severity is the consequence class
(`references/prioritization.md`); always state whether data is safe. A `confirmed` or `fixed`
finding names the promoted test that asserts the promised behaviour, so it is red on the current
code and green once fixed (rule 13); a test written the other way round is a characterization
test and says so in its name. A finding that never got a test stays `open`, reason `not pinned`.
The fingerprint cell holds the `assets/fingerprint.sh` output, one or more git SHAs, `-` when none
is recorded, or `pending` while the value is owed; `plan check` refuses anything else.

| Id | Finding (path:line, one line) | Severity (consequence class) | Data safe? | Evidence id | Pinning test (suite path :: test name) | Status | Verdict by / date | Reason | Cited-files fingerprint at verdict | Causality (`introduced` / `pre-existing` / `unknown`) | Reproduction |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | integrations/pi/index.ts:679 | data corrupted | no | E1 | integrations/pi/adapter.test.mjs :: stage tool rejects blank practical descriptions before any init side effect | confirmed | test-strategy / 2026-11-12 | Whitespace-only practical practice passes the adapter preflight, which creates the topic, appends active enrollment, and invokes the engine before the CLI rejects it. | 65dfed0 | introduced | learning_stage init with exam=practical and practice=" \t " |

Statuses: open · confirmed · fixed · gap-closed · rejected · wontfix.
`gap-closed` is a behaviour that was correct but untested, now held by the promoted test it names; like
`confirmed` and `fixed` it owes that test.

## Security candidates

This optional table records security dispositions separately from Findings statuses; older plans do not
need it. Name the actor, their effective authority, resource, action and boundary. For `confirmed`,
record the observed boundary violation and cite an executed, observed Evidence ledger row. For `blocked`,
record the missing fact and a safe validation step; do not assign a confirmed severity. For `rejected`,
cite the executed, observed ledger row that refutes the claim. Use `-` for inapplicable fields. A plan
check validates the recorded structure and references, not whether an observation is truthful or proves
an actual violation. Use one Security candidates section with one table and a distinct ID for each populated
row. Promote actionable findings to Findings using its existing statuses and evidence.

| Id | Actor | Authority | Resource | Action | Boundary | Evidence id | Disposition | Observed boundary violation | Missing fact | Safe validation step | Refuting evidence id |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Candidate reviews

Optional, and separate from `Security candidates`: a candidate row's `Disposition` is its author's claim,
while a review is a second answer to it. One row per review of an existing candidate, naming its
`Candidate id`. `Reviewer` names who did the review, and `Independence attestation` is the literal
`attested`, recording that the reviewer states they did not produce the candidate. `Refutation attempt`
records a real attempt to refute the claimed path, and `Effective controls` records the controls found to
prevent it. `Outcome` is `confirmed`, `rejected` or `blocked`. A `confirmed` or `rejected` review cites an
executed, observed Evidence ledger row that is decisive; a `blocked` review names the specific `Blocker`
that still has to be resolved. Use `-` for inapplicable cells. A candidate keeps its own disposition
whether or not it is reviewed, and a review confirmation never replaces the author's disposition.

`plan check` validates the recorded structure and references, not whether the reviewer was truly
independent or whether the cited evidence proves the claim: an attestation and a table cannot mechanically
prove identity or truth. Test verification is a different instrument: `tsp verify` freezes the candidate
in a read-only worktree and asks a second session for a verdict document, publishing `.tsp-verify.json`,
while a review row is a plan record a human reads. Use one section with one table and a distinct review
id; duplicate sections or ids, malformed tables, dangling candidate or evidence references, and an
outcome without its required evidence are refused.

| Id | Candidate id | Reviewer | Independence attestation | Refutation attempt | Effective controls | Outcome | Decisive evidence id | Blocker |
|---|---|---|---|---|---|---|---|---|

## Security coverage

Optional, and separate from both Findings and Security candidates: one row per surface, boundary,
subsystem or attack class the security audit considered. `Source` is the `path:line` that locates the
work, so a coverage claim can be checked against the code it names; `Kind` is `surface`, `boundary`,
`subsystem` or `attack class`. A `covered` row cites an executed, observed Evidence ledger row, and
coverage without observed evidence is refused rather than counted. `blocked` and `deferred` state why
the work is not covered and stay owed in `plan gaps`; `excluded` states why the item is not
applicable, so a reasoned exclusion leaves the denominator the way an `n/a` layer does. Use `-` for
inapplicable cells. Plans without this section remain valid.

| Id | Source | Kind | Subject | Disposition | Reason | Evidence id |
|---|---|---|---|---|---|---|

## Evidence ledger

One row per `observado` conclusion (`references/evidence.md`). `razonado` items go under
"Hypotheses" below, never here.

`Admit` holds ONE bare shell command, with no backticks and no placeholders, because `Executed` is
prose a human reads and `Admit` is the command the binary runs. `Digest` holds the `sha256:` digest of the
canonical output, written by `tsp plan admit --execute --record <id>` rather than by hand.

A pin only means something over output that holds still, so `--execute` runs each admitted command twice:
the second run is the probe, and a row whose two observations disagree is refused as unstable instead of
pinned. A zero exit whose output shows a skipped Go test or a filter that matched nothing is refused as
`tests-not-run`, so a Go test row runs `go test -v`, where a skip is visible. `Normalize` is the escape hatch for the part of an output that legitimately moves, such as an
elapsed time: it holds a Go regular expression whose every match becomes `X` before hashing. Leave it empty
the first time and fill it only when the probe names what moves, keeping it as narrow as that part — a
pattern broad enough to swallow the output turns the pin into decoration. `plan check` requires none of
these columns; `plan admit` refuses a row whose `Admit` is absent, whose `Digest` is unpinned, or whose
output does not hold still.

`Mode` says where the observation was taken, and a pin is only comparable inside the mode it was taken in,
because the same command digests differently in a container than on this machine. An empty cell means `host`,
which is where every pin taken before the column existed was taken. `--sandbox` runs each command in a
container with the tree mounted read-only and no network, and a row that tries to write is refused instead
of admitted. `--record` writes both cells, so recording is how a row's mode gets set; a row pinned in one mode
and checked in the other is refused as a mode mismatch, rather than as a digest mismatch that would say
nothing about why the digests disagree. Only a pin has a mode: a row that carries no digest is refused for the
missing pin, not told it was pinned somewhere.

`Mutate` is the machine half of a falsifiability claim: `<old> => <new> @ <path>:<line>`, one textual edit whose
old text must occur exactly once in that file and on that line, naming a file inside the tree. It is a value and
not a command because a replay has to be able to undo exactly what it did, and an edit admits an exact inverse
while a command does not. A row that declares one is claiming its own command goes red under the edit and green
without it, so the claim is checked rather than believed: `plan admit` refuses a mutation it cannot parse, find,
or tell apart from another, and under `--sandbox` it replays the claim — the edit lands on a copy of the tree git
knows, the command must fail there, the file is put back and its bytes verified, and the command must pass again.
A row whose command survives the edit, or whose restored half fails, is refused; outside `--sandbox` there is no
copy to edit and put back, so the claim is refused rather than admitted unchecked. `Mutation or negative control →
result` stays prose for a human to read; `Mutate` is the part a binary can act on and undo.

A `Mutate` cell may also hold a survey: several edits separated by ` ;; ` (space, two semicolons, space), each
checked before any runs and each replayed on its own copy. An edit prefixed `~ ` is declared equivalent, so the
command must stay green under it instead of going red; one that goes red is refused as `mutation-not-equivalent`.
The first edit that breaks its declaration refuses the row and is named by its position (`edit 2 of 3`), and an
admitted survey reports its tally (`2 killed, 1 equivalent`). An edit whose own text contains ` ;; ` cannot be
written in a cell.

`Mutate` sees production code only. A test that asserts against a double reimplementing the rule under test
survives every edit, because the edit lands in code the test never runs, so the matrix reports it green and the
test proves the double. Read what a test is asserting before trusting its row: a reversion that cannot reach the
assertion is not evidence that the assertion holds.

`Expect` says which way the command must exit: empty or `pass` for zero, `fail` for a FAIL_TO_PASS test
observed red. With `fail` only an exit from 1 to 125 qualifies (126, 127 and signals mean the command never
ran as a test, a timeout or a sandbox refusal keeps its own reason, and a zero exit is refused as
`expected-failure-passed`), and the output is pinned exactly as a passing
command's is, so it should show the failing test's name: a compile error must not be able to stand in for the red
test. Prefer it over `! cmd`, which also passes on a compile failure. `Expect` beside `Mutate` is refused, because
a mutation already defines its own red and green runs.

Every row carries exactly one cell per header column (14 here); an empty cell stays as `| |`. An observation that is a `None`, a refusal, or a "cannot be measured" is a pass
nowhere: before it counts, `Observed` names the real input that reaches that branch, one real file per common
source rather than a stub built for the probe. A rejection no real input produces is a gap in the claim, not
evidence for it, so it goes under Hypotheses until an input is named. A literal
`|` inside a cell is written `\|`, or it splits the cell and `plan check` refuses the row. `tsp plan add-evidence`
writes a ledger row from flags, escaping `|` and leaving `Digest` and `Mode` empty. Add the ledger
row before `tsp plan add-finding` names it: that command writes the Findings row only and refuses
an Evidence id the ledger does not carry.

| Id | Claim | Executed | Admit | Inputs and parameters | Observed | Digest | Normalize | Mode | Mutate | Expect | Mutation or negative control → result | Reproduction | Label (`observado` / `razonado`, literal) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | If blank practical practice is accepted, the adapter witness observes topic creation, enrollment, engine calls, and an active status instead of a side-effect-free rejection. | rtk timeout 20 node --test --test-timeout=5000 --test-name-pattern='stage tool rejects blank practical descriptions' integrations/pi/adapter.test.mjs |  | action=init; topic=blank-practice; exam=practical; practice=" \t " | AssertionError [ERR_ASSERTION]: practice " \t " must be refused without side effects; actual: { rejected: false, reason: undefined, engineCalls: 2, topicCreated: true, enrollmentEntries: 1, statusAfterRejection: undefined } |  |  |  |  | fail | The nonempty practical control passes; the whitespace-only input is accepted, invokes the engine twice, creates the topic, and persists one enrollment entry. | learning_stage init with topic=blank-practice, exam=practical, practice=" \t " | observado |
| E2 | The CLI trims Unicode edge whitespace from a valid practice kind, rejects a whitespace-only kind, and rejects both flags outside init without changing stored state. | rtk timeout 20 go test -v -timeout 30s ./cmd/learning -run 'TestCLIExam' |  | practice=" Construir una aplicación con café ☕ "; commands=validate,advance,status with --exam or --practice | --- PASS: TestCLIExamPracticeTrimsUnicodeWhitespaceAndPreservesText; --- PASS: TestCLIExamAndPracticeAreInitOnly |  |  |  |  | pass | The table includes blank Unicode practice and the positive practical Unicode value; each late-flag case compares state bytes before and after. | TestCLIExamPracticeTrimsUnicodeWhitespaceAndPreservesText and TestCLIExamAndPracticeAreInitOnly | observado |
| E3 | Exam checks run at preparation and planning, survive plan.json rewriting, retain both Pareto gates, and enforce oral, written, practical, legacy, and frozen-snapshot contracts. | rtk timeout 20 go test -v -timeout 30s ./internal/engine -run 'TestExam\|TestWrittenExam\|TestFrozenRulesWithoutNewThresholdsKeepWorking' |  | oral open=choice; practical tipo=practica with empty and Unicode-whitespace entregable; state/plan/questionnaire format mismatch and case/whitespace variants; planning rewrite; legacy state without scope/exam; frozen rules snapshot without exam | --- PASS: TestExamPlanStillRequiresTheParetoPlan; --- PASS: TestExamMockEnforcesFormatSpecificQuestionShape; --- PASS: TestWrittenExamStillRequiresTheExistingMixedQuestionFormat; ok learning/internal/engine 0.374s |  |  |  |  | pass | Invalid plan, mismatched format, missing Pareto declaration, short oral balance, blank practical deliverable, and written-only-choice inputs assert FAIL/blocked without state mutation; valid counterparts assert PASS. | TestExamPlanRejectsMissingMismatchedAndShortDeclarations, TestExamPlanMustSurvivePlanningRewrite, TestExamPlanDoesNotBypassTheParetoPartGate, TestExamMockEnforcesFormatSpecificQuestionShape, TestWrittenExamStillRequiresTheExistingMixedQuestionFormat, TestExamPlanSkipsForRunsWithoutExamIncludingLegacyState, TestFrozenRulesWithoutNewThresholdsKeepWorking | observado |
| E4 | The Studio exposes exam mode and format tags, while malformed or unsupported exam state keeps its topic visible and uses the ordinary tag. | rtk timeout 20 node --test --test-timeout=5000 --test-name-pattern='home offers quick\|exam topics expose\|malformed exam state\|tutorial presents Examen' studio/layout.test.mjs |  | browser viewport 1280x844; valid practical state; malformed JSON and unsupported format state; mode selection submitted for redes neuronales | ℹ tests 4; ℹ pass 4; ℹ fail 0 |  |  |  |  | pass | Valid state shows Examen práctico; malformed states omit exam metadata, preserve the topic, and render Universitario without aria-label/title. | home offers quick, university, and exam modes; exam topics expose their format; malformed exam state keeps a topic visible; tutorial presents Examen | observado |
| E5 | The repository-wide Go suite remains green with the exam-mode engine and CLI tests included. | rtk timeout 20 go test -timeout 30s ./... |  | all Go packages, including cmd/learning and internal/engine | ok learning/cmd/learning (cached); ok learning/internal/engine (cached); ? learning/internal/rules [no test files] |  |  |  |  | pass | Focused exam tests also exercise invalid options, wrong formats, missing Pareto declaration, rejected plans, and malformed final-exam shapes. | go test -timeout 30s ./... | observado |

### Hypotheses (razonado)

| Hypothesis | Probe that would settle it |
|---|---|
| A kill or ENOSPC between rules snapshot write and atomic state replacement may leave a partial init footprint; the state writer is unchanged, but the new exam field shares that durable path | Add/use a deterministic filesystem fault seam or syscall injection, fail between open/write/fsync/rename steps, then reopen state and snapshot |
| The complete generated exam workflow has not been exercised through a fresh built binary and real tutor runtime; browser tests use fake Pi and engine unit tests use fixtures | Run the built binary in a fresh synthetic root with isolated HOME and no credentials, then drive one valid and one invalid exam workflow and observe files/reports |
| Concurrent init or signal interruption around the new state field has not been tested | Start two init processes on the same synthetic workspace and inject SIGTERM at each save step; reopen and verify old-or-new state plus lock cleanup |

## Calibration history

One row per calibration run (`references/calibration.md`); never overwritten.

| Date | Skill version | K | Found | Recall | Misses (file:line operator, why) | False positives |
|---|---|---|---|---|---|---|

## Blocked by testability

| Target | Rung | Why | Minimal change that opens it |
|---|---|---|---|

## Remaining, in order

1. `state.json`/`rules.json` crash and write-fault matrix — L2 — `crash-and-process-testing`
2. Fresh built-artifact exam journey through a real tutor session — L2 — `real-run-validation`
