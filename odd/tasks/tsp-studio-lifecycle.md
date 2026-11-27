# Test plan — the studio's turn lifecycle (#469)

Created: 2026-02-06 · Plan path: `odd/tasks/tsp-studio-lifecycle.md` · Sandbox: this worktree
(`test/469-tsp-studio-lifecycle`) · Findings precision: 2 / 2 (both confirmed and pinned)
Baseline: `790dca7` · untracked files at baseline: none · dirty at baseline: none (this run changes
`studio/server.test.mjs` and adds this file, both inside the delegated edit surfaces).

What was attacked: the code that decides whether a part reaches the learner. #459 (`partVerdict`,
`expectedAtStart`, the 409) and #461 (one decision per turn, `Turn.settling`, and the abort stopping the
runtime before the rollback). Both were written under time pressure against a red main; #461 shipped with no
test at all (`git show --stat ec9ac72` → `studio/server.ts | 37 +++`, no test file).

This plan is not `docs/testing/test-plan.md`: `tsp plan init/add-finding/admit` were not run because the run
writes one document at `odd/tasks/` and no source change accompanies the pins. Every row below is a real
execution whose command and observed output are quoted; `Admit` and `Digest` stay empty rather than claim an
admittance that was never taken. Failing tests live in the repository's own suite (`studio/server.test.mjs`)
and are named per row.

## Inventory

| Surface | Entry points | Owner module | Notes |
|---|---|---|---|
| The part's verdict | `checkParts` → `partVerdict` + `markPartGate` | `studio/server.ts:1919` | runs once per settle, after the engine's verdict, on the files the turn wrote plus the owed part |
| The owed part | `partExpected`, `expectedAtStart` | `studio/server.ts:2001`, `studio/server.ts:1872` | the part comes from the plan (regeneration's part or the part the write prompt named) |
| Announced as ready | `partServes` → `fase: "lista"` | `studio/server.ts:1980`, `studio/server.ts:1719` | the UI offers «Abrir la Parte N» on `lista` |
| Refused (409) | `assertPartServes` | `studio/server.ts:1996` | called by `api/view` (`:3358`) and `api/offline` (`:3329`) |
| One decision per turn | `Turn.settling`, `settleTurn` | `studio/server.ts:2054` | latch set before the first await, cleared in `finally` |
| The abort | `case "abort"`, `case "api/tareas/abortar"` | `studio/server.ts:2844` | sets `aborted`, stops the runtime, then releases and rolls back |
| Every exit | `releaseTurn(owner)` | `studio/server.ts:1652` | rollback of an unfinished regeneration lives here |

## Ranked targets

| Target | Blast radius | Churn / past fixes | Consequence class | Existing evidence | Altitude | Target rung | Sibling skill | Verdict | Status | Run |
|---|---|---|---|---|---|---|---|---|---|---|
| `studio/server.ts:1948` the verdict is recorded after an `await`, for a turn that may be gone | every aborted/restarted turn that was already measuring | #460/#452, no test | gate bypass / wrong refusal | 1 test (abort rolls back) | unit + HTTP | L3 | `crash-and-process-testing` | pin | done | #469 |
| `studio/server.ts:1945` the mark only covers the part the prompt named | every turn that writes a part other than the one asked for | #452 | gate bypass (unmeasured/failed part served) | 1 test (named part only) | unit + HTTP | L3 | none | pin | done | #469 |
| `studio/server.ts:2062` the `settling` latch | every settle | #460, no test | turn decides twice / hangs | 1 probe | unit | L3 | none | probe | done | #469 |
| `studio/server.ts:1872` `expectedAtStart` (metadata, not content) | every turn that rewrites a part unchanged | #452 | correction for findings the turn did not cause | 2 probes | unit | L3 | none | probe | n/a | #469 |
| `studio/server.ts:2863` `releaseTurn(session)` with no owner after an `await` | abort | #460 | a release that takes a turn it does not own | none | unit | L3 | none | probe | blocked | #469 |

## Findings

| Id | Finding (path:line, one line) | Severity | Data safe? | Evidence id | Pinning test (suite path :: test name) | Status | Verdict by / date | Reason | Cited-files fingerprint at verdict |
|---|---|---|---|---|---|---|---|---|---|
| LC1 | `studio/server.ts:1948` `checkParts` records the verdict and the 409 mark after its `await`, for a turn that may already be released: an abort during the measurement rolls the previous version back first, and the mark is then written with the bytes of `bytesOf(expected.file)` *after* the rollback, so the version the chat says is kept is refused by `api/view` and `api/offline` | gate bypass (the kept version cannot be read) | yes | E2, E3 | `studio/server.test.mjs` :: `an aborted regeneration keeps the previous version served, not the verdict of the version it discarded` | confirmed | #469 / 2026-02-06 | pinned, RED on this checkout | - |
| LC2 | `studio/server.ts:1945` `mine`/`markPartGate` record only `expected.file`: a note the turn wrote, measured and rejected that is not the part the prompt named is never marked, so the learner is told «La parte todavía tiene problemas visuales…» and then served that part with `200` by `api/view` and `api/offline` | gate bypass (a measured, rejected part is served) | yes | E0, E4 | `studio/server.test.mjs` :: `a part the studio measured and rejected is refused, even when the turn was asked for another part` | confirmed | #469 / 2026-02-06 | pinned, RED on this checkout | - |

Statuses: open · confirmed · fixed · gap-closed · rejected · wontfix.

## Evidence ledger

| Id | Claim | Executed | Admit | Inputs and parameters | Observed | Digest | Normalize | Mode | Mutate | Expect | Mutation or negative control → result | Reproduction | Label |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E0 | The refusal works for the part the prompt named (control for LC2) | `node --input-type=module -e '<probe P1>'` (studio + `fake-pi.mjs`, injected failing `partChecks`) | | `prompt {text:"Escribe la Parte 1", tema:"redes"}`, 1 turn + 2 corrections, every measurement names `trazo-sobre-texto` | `api/view?topic=redes&part=p1` → `409 {"error":"«Parte 1 - Capas» no pasó las comprobaciones: 1 hallazgo (trazo-sobre-texto). No se sirve hasta que pase."}`; `api/offline` → `409`; `partes-medidas.json` carries `{"bytes":"68:…","count":1,"rules":["trazo-sobre-texto"]}`; no `fase: lista` | | | host | | fail | the same measurement over a part the prompt named → 409, so the 200 in E4 is the unexpected part, not a broken gate | probe P1 | observado |
| E1 | An abort mid-measurement leaves the mark keyed to the restored file | `node --input-type=module -e '<probe P2>'` | | `api/regenerar redes p1`, `api/tareas/dialogo`, then `api/tareas/abortar` while `partChecks` is held open; measurement then returns 1 finding | disk = the previous version; `error` = «La Parte 1 «Capas» NO se regeneró: el turno terminó antes de comprobar la parte. Se mantiene la versión anterior.»; `partes-medidas.json` = `{"bytes":"64:…","count":1,…}` (the restored bytes); `api/view` → `409`, `api/offline` → `409` | | | host | | fail | E2/E3 | probe P2 | observado |
| E2 | LC1 pinned: the kept version is refused | `timeout 300 node --test --test-name-pattern='aborted regeneration\|measured and rejected' studio/server.test.mjs` | | new test 1 | `✖ an aborted regeneration keeps the previous version served…` → `AssertionError: the version the learner was told is kept must stay served: {"error":"«Parte 1 - Capas» no pasó las comprobaciones: 1 hallazgo (trazo-sobre-texto)…"}` `409 !== 200` at `studio/server.test.mjs:1029` | | | host | | fail | E3 | probe P2 → test 1 | observado |
| E3 | The negative control: the same failing measurement, finishing *before* the abort | `node --input-type=module -e '<probe P3>'` | | same regeneration and same failing measurement, no abort; the budget is spent and the rollback happens after the measurement | disk = previous version; `error` = «…NO se regeneró: La parte todavía tiene problemas visuales…»; `api/view` → **`200`** | | | host | | pass | the mark was written before the rollback, so it keys bytes that are no longer on disk — the same code (LC1) with the opposite order serves the part | probe P3 | observado |
| E4 | LC2 pinned: the measured, rejected note is served | `timeout 300 node --test --test-name-pattern='aborted regeneration\|measured and rejected' studio/server.test.mjs` | | new test 2: `prompt {text:"Escribe la Parte 1"}`, the turn writes `Parte 2 - TCP.md`, 1 turn + 2 corrections | `✖ a part the studio measured and rejected is refused…` → `AssertionError: a part the studio measured and rejected is not served: {"url":"…/redes/p2"}` `200 !== 409` at `studio/server.test.mjs:1072`; the same probe observed `partes-medidas.json` = `none` and `api/offline` → `200` | | | host | | fail | E0 → test 2 | observado |
| E5 | The dedupe holds: one file written twice in one turn is measured once | `node --input-type=module -e '<probe P4>'` | | `FAKE_PI_WRITES` writes `Parte 1 - Capas.md` twice; one settle | `partChecks` called once with `["Parte 1 - Capas.md"]`; fases `escribiendo, comprobando, lista` | | | host | | pass | two writes of two different notes in one turn → two files, one measurement | probe P4 | observado |
| E6 | `expectedAtStart` holds: the pre-existing note the turn did not change is not measured | `node --input-type=module -e '<probe P5>'` | | prompt names Part 1; the turn writes only `Parte 1 - Capas.html`; the note already exists from `makeRoot` | `partChecks` called once with `["Parte 1 - Capas.html"]` only | | | host | | pass | a turn that writes the note → the note is measured (E0) | probe P5 | observado |
| E7 | The latch holds: a settle that arrives after an abort decides nothing | `node --input-type=module -e '<probe P6>'` | | `prompt` (dialog still pending) → `POST abort` → answer the pending dialog | no `fase`, no `error`, no measurement, `busy:false`; the late dialog answer decides nothing | | | host | | pass | without the latch the late settle would run `checkParts` and emit `comprobando`/`corrigiendo` | probe P6 | observado |
| E8 | A restart mid-turn tells the learner nothing | `node --input-type=module -e '<probe P7>'` | | `prompt` with `tema`, dialog answered, `POST restart` while the turn is held (engine delayed 900 ms) | reloaded `history.interrupted` = `null`; no `error`; last state `{"busy":false,"alive":true,"tema":"redes"}` | | | host | | — | `POST abort {cause:"update"}` re-marks `interrupted` with the cause, so the opposite result is reachable on this same code | probe P7 | razonado |

## Cells left unprobed, and why

- **A second, concurrent `settleTurn` for the same turn.** The latch (`studio/server.ts:2062`) is only
  observable when two decisions overlap, and neither fake can produce it: `testdata/fake-pi.mjs` emits one
  `agent_settled` per turn, and its abort answer emits the settle *after* the abort response, so the settle
  never lands inside another settle. The concurrent cell stays unprobed; the sequential cell (E7) is probed.
- **A runtime that reports its end twice, in sequence.** `Turn.settling` is cleared in `finally`, so two
  sequential settles decide twice. Not reachable with the shipped fakes; reported as a hypothesis, not a pin.
- **`releaseTurn(session)` with no owner after the `await` in the abort route (`studio/server.ts:2863`).**
  `docs/studio.md:191` says every exit releases only its own turn. The window needs a new prompt accepted
  between the runtime's abort answer and the abort route's `finally`, which is a microtask apart in this
  harness, so it cannot be driven from HTTP. Blocked, not pinned.
- **`expectedAtStart` is metadata (`size:mtime`), not content.** A turn that rewrites a part with identical
  bytes counts as changing it, so pre-existing findings become this turn's correction. The contract sentence
  ("a part the turn did not change is not this turn's to measure") reads as content, but a maintainer can
  read "touched" as "changed", so this stays `razonado` and unpinned rather than guessed into the suite.
- **A crash during the measurement, and a part deleted by the turn.** `testdata/fake-pi.mjs` cannot delete a
  file or crash mid-turn without a script the edit surfaces do not allow.

## Witnesses that stayed local

The probes above (`P1`–`P7`) were run as `node --input-type=module -e` scripts and are not in the
repository's suite; only the two pins are. The pins use the studio's real server, the repo's `fake-pi.mjs`
and the real regeneration/abort routes, with the five tools injected through `startStudio({partChecks})`:
what is pinned is the studio's handling of a verdict, not the tools' rules (already covered by #452's
`prosa-en-cajas` test).
