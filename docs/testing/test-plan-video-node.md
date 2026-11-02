# Test plan — video control on every node, retired app and mid-node checkpoints

Created: 2026-11-02 · Last updated: 2026-11-02 · Plan path: `docs/testing/test-plan-video-node.md` · Sandbox: per-test temp roots and Playwright Chromium; Go fixtures use `t.TempDir()` · Findings precision: 3 / 3
Baseline: `8efbf30` · untracked files: 2 · fingerprint: `b8259e93d06575f7722a29174f6be00c922133def98b6add54e98d05a3ad6d30` (a change is anything that differs from this fingerprint, not raw `git status`; the plan itself is excluded)

Tables are the format: prose never replaces a row.
A finding is a row whose cell opens with `path:line` and one line of finding. The path is a file with an
extension (`src/a.js:5`), a dotfile (`.gitignore:1`) or a conventional build file (`Makefile:3`); a
directory or a `host:port` is not a location.
A finding that lives only in prose does not exist for the scorer.

## Inventory

| Surface | Entry points | Owner module | Notes |
|---|---|---|---|

## Ranked targets

Rows are never removed by budget; budget changes order and status only. Rows contributed by a
sibling in the layer sweep name that sibling in "Sibling skill".

| Target | Blast radius | Churn / past fixes | Consequence class | Existing evidence | Altitude | Target rung | Sibling skill | Verdict | Status | Run |
|---|---|---|---|---|---|---|---|---|---|---|
| demo receipt for a part page (`internal/engine/pareto.go:238`) | every part that plans a demo | incomplete app retirement | correctness gate | TestDemoPageFilesSatisfyTheDemoPromise encodes the old behavior | engine API | L4 | `exploit-testing` | pin | done | tsp |
| bridge video injection (`integrations/pi/bridge.ts:271`) | every rich part page | new code | documented injection contract | rich-page test only | HTTP + browser | L4 | `contract-compat-testing` | pin | done | tsp |
| part page video control (`integrations/pi/view/app.js:511`) | every part view | new code | documented contract | none before this run | browser | L4 | `real-run-validation` | pin | done | tsp |

Verdicts: probe · pin · none. Statuses: pending · in progress · done · blocked · n/a.
A `none` verdict is created with status `n/a`; the execution ratio excludes `n/a` rows.

## Real-run recipes

How each critical journey is driven for real (`real-run-validation`), so EXECUTE never rediscovers it.

| Journey | Start command | Data setup | Sample requests | Expected observable |
|---|---|---|---|---|

## Layer matrix

The `Run` column identifies which bounded run owns each layer and target row; leave it blank for unscoped work.

| Layer | Skill | Scope | Status | Run |
|---|---|---|---|---|
| Security | `appsec-adversarial-auditor` | n/a: the change injects fixed tags and asset links into an author-owned page; no new untrusted input, auth or secret path | n/a |  |
| Runtime and faults | `runtime-reliability-testing`, `resilience-fault-injection` | n/a: no service, queue, retry or load path changed | n/a |  |
| Persistence and migrations | `database-persistence-testing` | n/a: no state, file format or schema change | n/a |  |
| Architecture conformance | `clean-architecture-audit` | n/a: the retired app removed a route and a CSP, no new boundary | n/a |  |
| Critical e2e journeys | `real-run-validation` | part page click → video file appears in the player (Chromium); validate → demo-part (Go fixture) | done | tsp |
| Sandbox | `docker-test-containers` | n/a: per-test temp roots and Chromium need no container | n/a |  |

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

## Characterization (legacy)

| Test | Behavior pinned | Believed correct? | Promote or delete after the change |
|---|---|---|---|

## Execution log

| Date | Target | Rung reached | Findings (path:line) | Promoted tests | Evidence (ledger id) | Notes |
|---|---|---|---|---|---|---|

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
| F1 | internal/engine/pareto.go:238 | correctness gate (demo receipt) | yes: read-only | E1 | internal/engine/demo_pages_test.go :: TestRetiredPartAppDoesNotSatisfyTheDemoPromise | confirmed | test-strategy / 2026-11-02 | The app is retired but demoPartPage still returns explicaciones/apps/<part>.html before the demos fallback, so demo-part and buildReceipts bind a page the bridge no longer serves; TestDemoPageFilesSatisfyTheDemoPromise still encodes that as correct. | pending |
| F2 | integrations/pi/bridge.ts:271 | correctness (documented injection) | yes: read-only | E2 | integrations/pi/bridge.test.mjs :: a video control or kit asset named only inside a comment is still missing | confirmed | test-strategy / 2026-11-02 | ensureNodeVideo tests the raw HTML, so a control or kit asset that appears only inside an HTML comment suppresses the injection the docs promise. | pending |
| F3 | integrations/pi/view/app.js:511 | correctness (documented contract) | yes: read-only | E3 | integrations/pi/bridge.test.mjs :: the part video control swaps the player in once the file exists | confirmed | test-strategy / 2026-11-02 | The part page says it updates when the file exists, but the click handler only posts and never polls; the kit's lk-video polls every 30 s. | pending |

Statuses: open · confirmed · fixed · gap-closed · rejected · wontfix.
`gap-closed` is a behaviour that was correct but untested, now held by the promoted test it names; like
`confirmed` and `fixed` it owes that test.

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
| E1 | A retired explicaciones/apps page still satisfies a planned demo | go test ./internal/engine -run TestRetiredPartAppDoesNotSatisfyTheDemoPromise -v | go test ./internal/engine -run TestRetiredPartAppDoesNotSatisfyTheDemoPromise -count=1 |  | FAIL: demo-part = PASS exit 1; the retired app page satisfied the demo promise |  |  |  |  | fail |  | go test ./internal/engine -run TestRetiredPartAppDoesNotSatisfyTheDemoPromise -count=1 | observado |
| E2 | A video control or kit asset named only inside a comment suppresses the bridge injection | node --test --test-force-exit --test-name-pattern 'a video control or kit asset named only inside a comment' integrations/pi/bridge.test.mjs | node --test --test-force-exit --test-name-pattern 'a video control or kit asset named only inside a comment' integrations/pi/bridge.test.mjs |  | 1 fail: AssertionError a control only inside a comment is still missing; no lk-video tag and no kit script were injected |  |  |  |  | fail |  | node --test --test-force-exit --test-name-pattern 'a video control or kit asset named only inside a comment' integrations/pi/bridge.test.mjs | observado |
| E3 | The part video control never swaps the player in after the request | node --test --test-force-exit --test-name-pattern 'the part video control swaps the player' integrations/pi/bridge.test.mjs | node --test --test-force-exit --test-name-pattern 'the part video control swaps the player' integrations/pi/bridge.test.mjs |  | 1 fail after 34 s: locator .video-block video timed out at 33 s; the button posted but nothing polled the file |  |  |  |  | fail |  | node --test --test-force-exit --test-name-pattern 'the part video control swaps the player' integrations/pi/bridge.test.mjs | observado |

### Hypotheses (razonado)

| Hypothesis | Probe that would settle it |
|---|---|

## Calibration history

One row per calibration run (`references/calibration.md`); never overwritten.

| Date | Skill version | K | Found | Recall | Misses (file:line operator, why) | False positives |
|---|---|---|---|---|---|---|

## Blocked by testability

| Target | Rung | Why | Minimal change that opens it |
|---|---|---|---|

## Remaining, in order

1. <target — target rung — sibling>
