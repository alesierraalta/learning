# Test plan — Fast notes and course materials (T1/T2 #370/#372, T6 #376)

Created: 2026-11-19 · Last updated: 2026-11-19 · Plan path: `.tsp/fast-notes-tsp.md` · Sandbox: this isolated worktree, Playwright at `/tmp/fast-notes-pw` · Findings precision: 8 / 8
Baseline: `c81b451` (branch range `origin/main...HEAD`) · untracked files: 1 (this plan) · fingerprint: `0091a23b546925a7c4ec8a093a63de3cb35623bf66e69c01a8431a2eaabac67b` (scoped fingerprint of the 41 changed production paths at plan time; the plan itself is excluded)

Tables are the format: prose never replaces a row.
A finding is a row whose cell opens with `path:line` and one line of finding. The path is a file with an
extension (`src/a.js:5`), a dotfile (`.gitignore:1`) or a conventional build file (`Makefile:3`); a
directory or a `host:port` is not a location.
A finding that lives only in prose does not exist for the scorer.

## Inventory

| Surface | Entry points | Owner module | Notes |
|---|---|---|---|
| Page timing v2 | `createPageTiming`, `isEngineTool`, `studio/timing-summary.mjs` | `studio/timing.ts`, `studio/server.ts`, `studio/timing-summary.mjs` | tool executions of both runtimes, model gaps, engine round-trips |
| Part brief | `partBrief`, `startTurn` | `studio/brief.ts`, `studio/server.ts`, `studio/agy.ts` | write-part prompts only; Pi and Antigravity share the path |
| One-command check | `partCheck`, `ruleSheet`, `parsedFindingsOf`, `runPartChecks` | `tools/part-check.mjs`, `studio/checks.ts` | five studio gates plus part-lint, register, ASCII sweep |
| Rule metadata | `HINTS`, rule `hint`, `lineOfFirstUse` | `tools/explain-check/**`, `tools/register/**` | generated sheet; no gate rule, threshold or verdict changed |
| Browser gates | scene-gate, scene-lint, deck-gate, page-gate | `tools/*.mjs` | PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH wired, no skips |
| Waiting document | `buildEspera`, `writePartTarget`, `api/espera` | `studio/espera.ts`, `studio/server.ts` | Part 1 never reviews, answers withheld, map from `plan.json` |
| Preliminary glossary | `createGlosario`, `parseGlosario`, `glosarioArgs` | `studio/glosario.ts` | one bounded one-shot call outside the tutor loop; cache in state |
| Live phases | `emitFase`, SSE `fase` | `studio/server.ts` | escribiendo, comprobando, corrigiendo, lista; both runtimes |
| Waiting UI | `esperaCard`, `loadEspera`, `on("fase")` | `studio/ui/studio.js`, `studio/ui/studio.css` | three glossary states, both question types, keyboard and 390 px |

## Ranked targets

Rows are never removed by budget; budget changes order and status only. Rows contributed by a
sibling in the layer sweep name that sibling in "Sibling skill".

| Target | Blast radius | Churn / past fixes | Consequence class | Existing evidence | Altitude | Target rung | Sibling skill | Verdict | Status | Run |
|---|---|---|---|---|---|---|---|---|---|---|
| Tool events and model gaps (`studio/timing.ts:115`) | every measured turn, both runtimes | new code | silently wrong measurement | 8 timing tests, real L12/L14 reports | unit + integration | L2 | `exploit-testing` | probe | done | fast-notes-t2 |
| Brief selects the right part (`studio/brief.ts:74`) | every write-part prompt | new code | silently wrong answer, wrong file overwritten | 9 brief tests | unit + integration | L2 | `contract-compat-testing` | pin | done | fast-notes-t2 |
| One-command check reports every gate (`tools/part-check.mjs:130`) | tutor corrections, studio comprobaciones | new code | silently wrong verdict | 9 CLI tests, 18 checks tests | CLI + integration | L2 | `real-run-validation` | pin | done | fast-notes-t2 |
| Check failures beside findings reach the log (`studio/server.ts:1565`) | all turn settles, both runtimes | new field added this branch | silently dropped operational failure | server suite, stubbed gates | integration | L2 | `resilience-fault-injection` | pin | done | fast-notes-t2 |
| Rule sheet generated from the rules (`tools/part-check.mjs:62`) | brief plus CLI | new code | stale or missing rule | part-check and explain-check suites | unit | L2 | `contract-compat-testing` | probe | done | fast-notes-t2 |
| Register line numbers (`tools/register/measure.mjs:589`) | unexplained-term findings | new code | wrong line shown to the tutor | measure tests, probes with code before prose | unit | L2 | `exploit-testing` | probe | done | fast-notes-t2 |
| Real print output parsing (`studio/glosario.ts:95`) | every glossary reader of both runtimes | new code | silently empty glossary | 6 glosario tests, real agy and Pi stdout | unit + real call | L2 | `contract-compat-testing` | pin | done | fast-notes-t6 |
| Failed-call state (`studio/glosario.ts:202`) | every later `api/espera` reader | new code | repeated doomed 60 s calls | new witness plus real smoke | unit + integration | L2 | `resilience-fault-injection` | pin | done | fast-notes-t6 |
| Answer letter mapping (`studio/glosario.ts:120`) | every ungraded glossary question | new code | silently wrong answer revealed | new witness, parser probe | unit | L2 | `exploit-testing` | pin | done | fast-notes-t6 |
| Empty map blocks (`studio/ui/studio.js:2584`) | every waiting section | new code | section shown where nothing applies | new Playwright witness | UI | L2 | `real-run-validation` | pin | done | fast-notes-t6 |
| Waiting contract and phases (`studio/espera.ts:166`, `studio/server.ts:717`) | Part 1, Part 3, both runtimes | new code | wrong questions or missing progress | 6 espera tests, 2 SSE tests, real API smoke | unit + integration | L2 | `contract-compat-testing` | probe | done | fast-notes-t6 |

Verdicts: probe · pin · none. Statuses: pending · in progress · done · blocked · n/a.
A `none` verdict is created with status `n/a`; the execution ratio excludes `n/a` rows.

## Real-run recipes

How each critical journey is driven for real (`real-run-validation`), so EXECUTE never rediscovers it.

| Journey | Start command | Data setup | Sample requests | Expected observable |
|---|---|---|---|---|
| Timing report and summary | `PLAYWRIGHT_MODULE=file:///tmp/fast-notes-pw/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/fast-notes-pw/browsers node --test studio/timing.test.mjs` | fake Pi/Agy, isolated XDG state | one turn, one engine correction | v2 report, tools plus gaps account for the call, one line per report in the summary |
| Write-part brief | `node --test studio/brief.test.mjs` | `makeRoot` with 3 and 20 parts | composer prompt, part chat, duplicate titles | exact destination, complete rule sheet under 12288 bytes, number wins over a repeated title |
| One-command check | `node --test tools/part-check.test.mjs studio/checks.test.mjs` | stub gates and real notes with real browsers | broken and clean notes, a crash beside a finding | grouped findings with rule/where/fix, failures reported apart, exit 0/1/2 |
| Turn settle with mixed verdicts | `node --test studio/server.test.mjs` | fake runtimes, stubbed part checks | findings plus one gate that could not measure | tutor hears only the finding, studio log keeps the measurement failure |
| Waiting API and glossary for real | `LEARNING_ROOT=<scratch>/root XDG_STATE_HOME=<scratch>/state STUDIO_AGENT_DISABLED=1 node studio/server.ts --no-open` | scratch root copied from `content/aprendizaje-por-refuerzo`, `tutor.json` set to agy | `GET /<token>/api/espera?topic=aprendizaje-por-refuerzo&part=p1` and `part=p3` | Part 1 `dependeDe: []`, no answers; Part 3 two earlier parts; `generando` then `listo` with 7 terms and 3 ungraded questions |
| Waiting UI | `PLAYWRIGHT_MODULE=... node --test studio/espera-ui.test.mjs` | stubbed `api/espera`, fake SSE, real Chromium | Part 1, Part 3, three glossary states, 390 px | all states render, radios are operable, no horizontal scroll |

## Layer matrix

The `Run` column identifies which bounded run owns each layer and target row; leave it blank for unscoped work.

| Layer | Skill | Scope | Status | Run |
|---|---|---|---|---|
| Security | `appsec-adversarial-auditor` | n/a: local single-user studio, no auth, tenant boundary, secret or remote input in this change | n/a |  |
| Runtime and faults | `resilience-fault-injection` | gates that cannot measure beside gates that find; timing events; browser-backed gate runs | done | fast-notes-t2 |
| Persistence and migrations | `database-persistence-testing` | n/a: no schema, migration or DB write in this change; timing reports are append-only JSON | n/a |  |
| Architecture conformance | `clean-architecture-audit` | n/a: no new import direction; `tsp probe arch` has no rules file here and `tsp probe quality` has no JS/TS adapter | n/a |  |
| Critical e2e journeys | `real-run-validation` | timing, brief, CLI, turn-settle and waiting journeys in Real-run recipes, with real browsers and a real one-shot glossary call | done | fast-notes-t6 |
| Sandbox | `docker-test-containers` | n/a: Playwright scratch and temporary roots suffice; no database, cache or network service to containerize | n/a |  |

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
| Real tutor generation speed | L10/L12/L14 already record one real run per lever with the same part; re-running a 10-minute model call changes no gate verdict |
| Rule and gate thresholds | S2 forbids weakening them; only their reporting and delivery changed |
| Go engine suites | unchanged in this branch; run as regression gate only |
| Professor section with course material | T3–T5 are not implemented; `profesor` is contractually `null` and the UI hides the block |

## Characterization (legacy)

| Test | Behavior pinned | Believed correct? | Promote or delete after the change |
|---|---|---|---|

## Execution log

| Date | Target | Rung reached | Findings (path:line) | Promoted tests | Evidence (ledger id) | Notes |
|---|---|---|---|---|---|---|
| 2026-11-19 | timing, brief, CLI, checks, server suites | L2 | - | - | E1 | regression gate: all touched suites green with Playwright wired in (server needs its default timeout) |
| 2026-11-19 | measurement failures beside findings | L2 | `studio/server.ts:1565` | `studio/server.test.mjs :: a measurement failure beside a finding is logged, never sent to the tutor` | E2 | RED observed on 2 runtime variants, GREEN after logging all reported failures |
| 2026-11-19 | duplicate part titles in the brief | L2 | `studio/brief.ts:74` | `studio/brief.test.mjs :: the part number decides the destination when two parts share a title` | E3 | RED observed with two equal titles, GREEN after letting the number decide |
| 2026-11-19 | touched suites and Go suite | L2 | - | - | E4 | final bounded validation, after both fixes |
| 2026-11-19 | real print output and glossary state | L2 | `studio/glosario.ts:95`, `studio/glosario.ts:202`, `studio/glosario.ts:120` | `studio/glosario.test.mjs :: both runtimes' print wrappers are unwrapped before parsing`, `a failed short call stays no-disponible instead of restarting on every reader`, `a reordered answer keeps the letter the model meant` | E6, E7, E8 | RED observed on each witness, GREEN after the fixes; real agy call produced 7 terms and 3 questions in 54.7 s |
| 2026-11-19 | empty map blocks and waiting contract | L2 | `studio/ui/studio.js:2584` | `studio/espera-ui.test.mjs :: empty map sections are not shown where the plan has nothing` | E9, E10 | RED then GREEN in Chromium; Part 1 and Part 3 API smoke and full suites green |

## Findings

A rejected or wontfix finding is a known non-issue: it is never re-proposed unless the fingerprint
of its cited files changed; when a run skips it, it cites the row. Severity is the consequence
class: money moved or lost, data destroyed or corrupted, a permission or tenant boundary, a
silently wrong answer a human will act on, a visible error, cosmetic; always state whether data is
safe. A `confirmed` or `fixed` finding names the promoted test that asserts the promised behaviour,
so it is red on the current code and green once fixed (rule 13); a test written the other way round
is a characterization test and says so in its name. A finding that never got a test stays `open`,
reason `not pinned`.
The fingerprint cell holds the `assets/fingerprint.sh` output, one or more git SHAs, `-` when none
is recorded, or `pending` while the value is owed; `plan check` refuses anything else.

| Id | Finding (path:line, one line) | Severity (consequence class) | Data safe? | Evidence id | Pinning test (suite path :: test name) | Status | Verdict by / date | Reason | Cited-files fingerprint at verdict | Causality (`introduced` / `pre-existing` / `unknown`) | Reproduction |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | studio/server.ts:1565 | silently wrong answer a human will act on | yes | E2 | studio/server.test.mjs :: a measurement failure beside a finding is logged, never sent to the tutor | fixed | test-strategy / 2026-11-19 | runPartChecks now returns failures beside findings, but checkParts logged them only for kind crashed; a gate that could not measure vanished from the studio log whenever another gate found something. Fixed by logging every reported failure before branching on the verdict; witness RED on both runtimes, GREEN after. | c81b451 | introduced | node --test --test-name-pattern=measurement failure beside a finding studio/server.test.mjs |
| F2 | studio/brief.ts:74 | silently wrong answer a human will act on | no | E3 | studio/brief.test.mjs :: the part number decides the destination when two parts share a title | fixed | test-strategy / 2026-11-19 | The composer identifies the part by number and title; matching the title first sent the tutor to Parte 1 when the prompt asked for Parte 2 of a plan with two equal titles. Fixed by letting the valid number decide and keeping the title as a fallback; witness RED then GREEN. | c81b451 | introduced | node --test --test-name-pattern=part number decides the destination studio/brief.test.mjs |
| F3 | studio/timing.ts:155 | silently wrong answer a human will act on | yes | E5 | studio/timing.test.mjs :: overlapping tools are counted once: the model gap is the time no tool was running | fixed | test-strategy / 2026-11-19 | The learner contract decision: tool intervals are a union, overlap counted once, and modelMs is call.ms minus that union. The code summed tool durations, reporting 40 ms inside tools and 0 ms of model time for a 40 ms call with a 30 ms union. Fixed with toolUnionMs; witness RED then GREEN. | c81b451 | introduced | node --test --test-name-pattern=overlapping tools are counted once studio/timing.test.mjs |
| F4 | studio/glosario.ts:95 | silently empty glossary the learner would read as no-disponible | yes | E6 | studio/glosario.test.mjs :: both runtimes' print wrappers are unwrapped before parsing | fixed | test-strategy / 2026-11-19 | Print mode wraps the JSON: agy returns an envelope with `response`, Pi returns NDJSON whose last assistant `message_end` holds the JSON. The parser parsed the envelope and found no `terminos`; a real agy call failed with `glosario sin términos`. Fixed by unwrapping both shapes before parsing; witness RED then GREEN, real call later returned 7 terms and 3 questions. | d91d1ee | introduced | node --test --test-name-pattern=print wrappers are unwrapped studio/glosario.test.mjs |
| F5 | studio/glosario.ts:202 | visible error and repeated doomed calls | yes | E8 | studio/glosario.test.mjs :: a failed short call stays no-disponible instead of restarting on every reader | fixed | test-strategy / 2026-11-19 | A bad answer, timeout or missing CLI left no state: every later `api/espera` reader started another bounded call and saw `generando` again. Fixed with a per-topic/part failed set; a new owner after a tutor change still retries. Witness RED then GREEN. | d91d1ee | introduced | node --test --test-name-pattern=failed short call stays no-disponible studio/glosario.test.mjs |
| F6 | studio/glosario.ts:120 | silently wrong answer a human will act on | yes | E7 | studio/glosario.test.mjs :: a reordered answer keeps the letter the model meant | fixed | test-strategy / 2026-11-19 | Options were relabelled in insertion order while the answer was found by the raw key index: a model answer with `opciones {B,A}` and `respuesta A` moved the key to B, and a filtered empty option dropped the question. Fixed by sorting canonical letters before relabelling and mapping the raw answer through the same list. Witness RED then GREEN. | d91d1ee | introduced | node --test --test-name-pattern=reordered answer keeps the letter studio/glosario.test.mjs |
| F7 | studio/ui/studio.js:2584 | section shown where nothing applies | yes | E9 | studio/espera-ui.test.mjs :: empty map sections are not shown where the plan has nothing | fixed | test-strategy / 2026-11-19 | The waiting map always rendered `Subtemas` and `Necesitas antes` headings even when the plan had no subtemas and Part 1 had no previous parts. Fixed by rendering a block only with items; Chromium witness RED then GREEN. | d91d1ee | introduced | node --test --test-name-pattern=empty map sections studio/espera-ui.test.mjs |
| F8 | studio/ui/studio.js:2589 | keyboard access was correct but untested | yes | E11 | studio/espera-ui.test.mjs :: the waiting questions can be answered from the keyboard | gap-closed | test-strategy / 2026-11-19 | The radios are real labelled inputs; a focused option takes Space and the waiting section records the choice with its ungraded feedback. No source change was needed; the Chromium witness closes the gap. | d91d1ee | unknown | node --test --test-name-pattern=waiting questions can be answered from the keyboard studio/espera-ui.test.mjs |

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

One row per conclusion you executed and observed (`observado`). `razonado` items go under
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
| E1 | Before any fix, all touched suites pass with the browser gates really measured | PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH exported; node --test on each touched suite, timeout 900 |  | this branch at c81b451; Playwright at /tmp/fast-notes-pw | timing 8/8, brief 8/8, agy 6/6, checks 18/18, part-check 9/9, explain-check 102/102, register/measure 12/12, part-lint 4/4 pass; server suite passed except two browser correction tests that hit an artificially imposed 30s test timeout |  |  |  |  |  | browser-backed checks ran with a real Playwright module instead of skipping | node --test studio/timing.test.mjs studio/brief.test.mjs tools/part-check.test.mjs | observado |
| E2 | If a gate cannot measure while another gate finds something, the studio log drops the measurement failure | node --test --test-name-pattern=measurement failure beside a finding studio/server.test.mjs | node --test --test-name-pattern=measurement failure beside a finding studio/server.test.mjs | stub partChecks returns kind findings with one finding and failures deck-gate.mjs no pudo medir; pi and agy runtimes | RED on both runtimes: AssertionError a gate that could not measure is logged even when another gate found something, logged was empty; GREEN after the fix: estudio: comprobación fallida · deck-gate.mjs no pudo medir Parte 1 - Capas.md (salida 2), 2 pass 0 fail |  |  |  |  |  | the existing crashed-only test passes both before and after the fix; the new witness fails only on the defective code | a turn writes a part, one gate finds trazo-sobre-texto and another gate exits 2 | observado |
| E3 | If two plan parts share a title, the brief sends the tutor to the part named by the prompt number | node --test --test-name-pattern=part number decides the destination studio/brief.test.mjs | node --test --test-name-pattern=part number decides the destination studio/brief.test.mjs | plan parts p1 Igual/Uno and p2 Igual/Dos; prompt Escribe la Parte 2 «Igual» de Redes (carpeta redes) | RED: Destino pointed at Parte 1 - Uno.md; GREEN after the fix: Destino points at Parte 2 - Dos.md, full brief suite 9 pass 0 fail |  |  |  |  |  | a write-part prompt with distinct titles still reaches the same destination as before | partBrief(root, the duplicate-title prompt) | observado |
| E4 | After both fixes, every touched suite and the Go suite are green with real browser gates | for each suite: PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH exported, timeout 900 node --test <suite>; timeout 900 go test ./... |  | this worktree after the two fixes; Playwright at /tmp/fast-notes-pw | timing 8/8, brief 9/9, agy 6/6, checks 18/18, server 182/182, part-check 9/9, explain-check 102/102, register hallazgos 23/23, measure 12/12, nota-html 3/3, registro 14/14, part-lint 4/4; Go 641 passed in 3 packages; all commands exit 0 |  |  |  |  |  | the two promoted witnesses pass after their fixes and fail on the original code (E2, E3) | node --test studio/server.test.mjs studio/brief.test.mjs | observado |
| E5 | If two tool intervals overlap, the report counts that overlap once and the model gap is what no tool was using | node --test --test-name-pattern=overlapping tools are counted once studio/timing.test.mjs, then the full timing suite | node --test --test-name-pattern=overlapping tools are counted once studio/timing.test.mjs | one call of 40 ms; read tool 0-30 ms, bash tool 10-20 ms, union 30 ms | RED: AssertionError the time inside tools counts the overlap once: 40, expected 30; GREEN after toolUnionMs: toolMs 30, modelMs 10, modelGapMs 10, 9 pass 0 fail in the full timing suite |  |  |  |  |  | sequential tools still give sum==union, so the existing per-call accounting test stayed green before and after | createPageTiming with a controlled clock and two overlapping tool ids | observado |
| E6 | If print mode wraps the glossary JSON, the parser unwraps both runtimes | node --test --test-name-pattern=print wrappers are unwrapped studio/glosario.test.mjs | node --test --test-name-pattern=print wrappers are unwrapped studio/glosario.test.mjs | agy envelope with response and Pi NDJSON with a last assistant message_end, each holding 5 terms and 1 question | RED: Error: glosario sin términos; GREEN after answerOf: 8 pass 0 fail in studio/glosario.test.mjs; real agy stdout with 6 terms and 2 questions also parses |  |  |  |  |  | raw JSON and fenced JSON still parse, so the existing parser tests stayed green | parseGlosario(agyEnvelope) and parseGlosario(piNdjson) | observado |
| E7 | If the model lists options out of order, the answer stays with its own text | node --test --test-name-pattern=reordered answer keeps the letter studio/glosario.test.mjs | node --test --test-name-pattern=reordered answer keeps the letter studio/glosario.test.mjs | opciones B seguida A, respuesta A; then A uno, B blank, C tres, respuesta C | RED: actual opciones A segunda B primera, expected A primera B segunda; GREEN after sorting canonical letters: both cases pass |  |  |  |  |  | canonical A,B,C input gives the same result before and after | parseGlosario with the two option maps | observado |
| E8 | If a short call fails, another reader keeps seeing no-disponible and starts no process | node --test --test-name-pattern=failed short call stays no-disponible studio/glosario.test.mjs | node --test --test-name-pattern=failed short call stays no-disponible studio/glosario.test.mjs | fake CLI replies not JSON; two start calls for redes/p1 | RED: second view was generando and argv.log grew; GREEN after the failed set: no-disponible and argv.log unchanged |  |  |  |  |  | a new createGlosario owner still retries after a tutor change | g.start twice after awaiting whenSettled | observado |
| E9 | If the plan has no subtemas and Part 1 has no previous parts, those headings are absent | PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH exported; node --test --test-name-pattern=empty map sections studio/espera-ui.test.mjs | node --test --test-name-pattern=empty map sections studio/espera-ui.test.mjs | stub api/espera with aprende one item, subtemas empty, dependeDe empty in Chromium | RED: 1 heading named Subtemas; GREEN after the block guard: 0 Subtemas, 0 Necesitas antes, the objective still visible |  |  |  |  |  | a map with items still renders all three blocks in the original Part 1 UI witness | page.goto hash tema redes and emit a write-part user event | observado |
| E10 | The real waiting API and glossary match the S6 contract and the suites stay green | scratch vault with the real topic, studio started with agy, then curl api/espera for p1 and p3; bounded full suites |  | scratch root copied from content/aprendizaje-por-refuerzo with tutor.json agy; XDG state under the scratch; no part generation | first p1 generando in 11 ms; cache listo after 54740 ms with 7 terms and 3 ungraded glossary questions; p3 two earlier parts with written true; profesor null; 519/519 studio tests and go test packages ok |  |  |  |  |  | default Pi with an unset model failed with acp/gemini in this machine; a configured agy call succeeded and the UI degrades to no-disponible on failure | GET /<token>/api/espera for p1 and p3 from the scratch studio | observado |
| E11 | A focused option takes Space and records an ungraded answer | PLAYWRIGHT_MODULE and PLAYWRIGHT_BROWSERS_PATH exported; node --test --test-name-pattern=waiting questions can be answered from the keyboard studio/espera-ui.test.mjs | node --test --test-name-pattern=waiting questions can be answered from the keyboard studio/espera-ui.test.mjs | stub antes question in Chromium; option Oculta los detalles focused and Space pressed | option is checked and the section shows Anotado. Podrás comparar cuando la parte esté lista. |  |  |  |  |  | the same radio also works by click in the original Part 1 witness | page.goto hash tema redes, emit a write-part user event, focus the radio | observado |

### Hypotheses (razonado)

| Hypothesis | Probe that would settle it |
|---|---|

## Calibration history

One row per calibration run — defects seeded from a key the run never reads, recall measured against
that key — and never overwritten.

| Date | Skill version | K | Found | Recall | Misses (file:line operator, why) | False positives |
|---|---|---|---|---|---|---|

## Blocked by testability

| Target | Rung | Why | Minimal change that opens it |
|---|---|---|---|

## Remaining, in order

1. TSP loop: `tsp findings record --since origin/main` then `tsp findings next` — blocked until the round's test and fix changes are committed; the binary refuses a dirty tree and this agent may not commit. T6 findings F4-F7 are reported directly to the parent for the same reason; no gate or witness was weakened.
