# Test plan — the two gates (#429)

Created: 2026-02-05 · Plan path: `odd/tasks/tsp-gates.md` · Sandbox: `/tmp` git repositories and in-process rule
calls · Findings precision: 11 / 12 (11 confirmed and pinned; BF7 is open, not pinned)
Baseline: `91c3fadbb2a43f5ebe6d971206369f78c2ee0279` (branch `test/429-tsp-gates`)
Untracked at baseline: none; the two test files were already dirty from the cancelled run and are itemised below.

A gate that lies is worse than no gate. Both gates are read-only decision points: `branch-fresh` reads text and
git, `prosa-en-cajas` reads the note JSON. Severity is therefore "correctness gate": a wrong verdict is silently
trusted downstream. Data safe: **yes** for every finding (neither tool writes).

This plan is not the repository `docs/testing/test-plan.md`; `tsp plan init/add-finding/admit` were not run, so the
Evidence ledger carries the executed command and its observed output by hand and leaves `Admit`/`Digest` empty
instead of claiming an admittance that was never taken. Pinning tests *are* in the suite and are named per row.

## Inventory

| Surface | Entry points | Owner module | Notes |
|---|---|---|---|
| Staleness gate | `node tools/branch-fresh.mjs [--base <ref>] [--json]` | `tools/branch-fresh.mjs:1` | exit 0 fresh / 1 stale / 2 cannot tell; relative paths `KIT` and `tools/` resolved from `cwd` |
| Component/surface diff | `components`, `missingFrom`, `evaluate` | `tools/branch-fresh.mjs:14` | `COMPONENT = /define\('(lk-[a-z-]+)'/g`; base read with `git show`, local with `readFileSync` |
| Prose-in-boxes gate | `prosaEnCajas.check(nota)` via `node tools/explain-check.mjs <note>` | `tools/explain-check/rules/prosa-en-cajas.mjs:1` | two signals: a box carrying a phrase, or no drawing + every box a clause; only `boxes[].label` is read |
| Sibling gate (oracle for #273) | `escenario-de-cajas` | `tools/explain-check/rules/escenario-de-cajas.mjs:14` | defines "an icon over a box is its adornment" geometrically (`enCaja`) |

## Ranked targets

| Target | Blast radius | Churn / past fixes | Consequence class | Existing evidence | Altitude | Target rung | Sibling skill | Verdict | Status | Run |
|---|---|---|---|---|---|---|---|---|---|---|
| `branch-fresh.mjs:1` CLI contract (exit codes, `--base` forms) | every authoring session | #406 + this run | correctness gate (false stale/fresh) | 6 tests before this run | CLI | L3 | `contract-compat-testing` | pin | done | #429 |
| `branch-fresh.mjs:14` component set (`COMPONENT`) | every stale verdict that names a component | #406 + this run | correctness gate (silent fresh) | none before this run | unit + CLI | L4 | none | pin | done | #429 |
| `branch-fresh.mjs:54` portability of reads (`cwd`, shallow graph) | every checkout not at the repo root, every shallow clone | #406 + this run | correctness gate (invented gap, false ahead) | none before this run | CLI | L4 | `crash-and-process-testing` | pin | done | #429 |
| `prosa-en-cajas.mjs:1` measurement of the visible box (`label`, `sub`) | every figure in every note | #419 + this run | correctness gate (prose passes) | 6 tests before this run | unit + CLI | L4 | none | pin | done | #429 |
| `prosa-en-cajas.mjs:22` unreadable/decodable payload and invisible characters | every figure in every note | #419 + this run | correctness gate (unreadable figure passes) | none before this run | unit + CLI | L4 | `appsec-adversarial-auditor` | pin | done | #429 |
| `prosa-en-cajas.mjs:20` drawing detection vs sibling #273 | every figure with an accessory icon | #419/#273 + this run | correctness gate (two gates disagree) | sibling rule test | unit | L4 | none | pin | done | #429 |

## Findings

| Id | Finding (path:line, one line) | Severity | Data safe? | Evidence id | Pinning test (suite path :: test name) | Status | Verdict by / date | Reason | Cited-files fingerprint at verdict |
|---|---|---|---|---|---|---|---|---|---|
| BF1 | `tools/branch-fresh.mjs:104` an unborn HEAD makes `rev-list` throw; node exits 1, which the caller reads as stale instead of 2 | correctness gate | yes | E1 | `tools/branch-fresh.test.mjs` :: `a checkout without a commit says it cannot tell instead of reporting stale` | confirmed | #429 / 2026-02-05 | pinned | - |
| BF2 | `tools/branch-fresh.mjs:83` reads `KIT` and `tools/` from `cwd`, so from a subdirectory it invents 3 missing components at `behind 0` | correctness gate | yes | E2 | `tools/branch-fresh.test.mjs` :: `run from a subdirectory it measures the repository and invents no gap` | confirmed | #429 / 2026-02-05 | pinned | - |
| BF3 | `tools/branch-fresh.mjs:102` only `--base <ref>` is parsed; `--base=<ref>` is ignored and the configured base answers, so an unknown ref can exit 0/1 instead of 2 | correctness gate | yes | E3 | `tools/branch-fresh.test.mjs` :: `--base=<ref> is a base too: an unknown one is never answered with fresh` | confirmed | #429 / 2026-02-05 | pinned | - |
| BF4 | `tools/branch-fresh.mjs:15` `COMPONENT` accepts only `define('…')`; a base declaring `define("lk-figure")` is invisible and the gap is answered `fresh` | correctness gate | yes | E4 | `tools/branch-fresh.test.mjs` :: `a base that declares a component with double quotes still names the gap` | confirmed | #429 / 2026-02-05 | pinned | - |
| BF5 | `tools/branch-fresh.mjs:15` the kit declares its five pieces as `define(\`lk-${kind}\`)` (`integrations/pi/kit/kit.js:3280`); a base adding `lk-venn` to that loop is invisible, so the gap is answered `fresh` | correctness gate | yes | E5 | `tools/branch-fresh.test.mjs` :: `a component the kit declares in its piece loop is named as a gap too` | confirmed | #429 / 2026-02-05 | pinned | - |
| BF6 | `tools/branch-fresh.mjs:105` a shallow clone's graft makes `rev-list base..HEAD` count the base commit as own work: `ahead: 1` for a clone that owns none | correctness gate | yes | E6 | `tools/branch-fresh.test.mjs` :: `a shallow clone does not claim to be ahead of the base it is only behind` | confirmed | #429 / 2026-02-05 | pinned | - |
| PE1 | `tools/explain-check/rules/prosa-en-cajas.mjs:29` counts UTF-16 code units: the same 38-character title in NFD measures 42 and is refused | correctness gate | yes | E7 | `tools/explain-check.test.mjs` :: `el mismo título compuesto y descompuesto mide lo mismo: 38 caracteres son 38` | confirmed | #429 / 2026-02-05 | pinned | - |
| PE2 | `tools/explain-check/rules/prosa-en-cajas.mjs:45` `catch { continue; }` drops an unparseable spec; the comment delegates it to "la regla del JSON", which does not exist, so the whole gate exits 0 | correctness gate | yes | E8 | `tools/explain-check.test.mjs` :: `una figura cuyo JSON no se lee no pasa la puerta en silencio (#429)` | confirmed | #429 / 2026-02-05 | pinned | - |
| PE3 | `tools/explain-check/rules/prosa-en-cajas.mjs:53` any `icons` array counts as drawing, including one over a box; `escenario-de-cajas.mjs:20` (`enCaja`, #273) says an icon over a box is its adornment. Same input: `prosa ok=true`, `escenario ok=false` | correctness gate | yes | E9 | `tools/explain-check.test.mjs` :: `un icono encima de una caja es adorno y no salva las cláusulas (#273)` | confirmed | #429 / 2026-02-05 | pinned | - |
| PE4 | `tools/explain-check/rules/prosa-en-cajas.mjs:30` `/[.…]$/` after `trim()`: a sentence ending in `.` plus U+200B passes as "not a phrase" although the reader sees the point | correctness gate | yes | E10 | `tools/explain-check.test.mjs` :: `una frase acabada en punto y en un carácter invisible sigue siendo una frase` | confirmed | #429 / 2026-02-05 | pinned | - |
| PE5 | `tools/explain-check/rules/prosa-en-cajas.mjs:50` only `boxes[].label` is pushed; `boxes[].sub` is rendered inside the same box (`integrations/pi/kit/kit.js:1512`), so a 9-word sub-line is prose inside the measured box and passes | correctness gate | yes | E11 | `tools/explain-check.test.mjs` :: `una sub-línea de nueve palabras dentro de la caja es prosa, no un título` | confirmed | #429 / 2026-02-05 | pinned | - |
| BF7 | `tools/branch-fresh.mjs:76` `localTools` reads `tools/` with no `try`; an unreadable `tools/` throws and node exits 1, which reads as stale instead of 2 | correctness gate | yes | E12 | — | open | #429 / 2026-02-05 | not pinned: a `chmod 000` test is green when the suite runs as root, so it could measure nothing in some environments | - |

## Evidence ledger

`Admit`/`Digest` are empty on purpose (see header). Every row is a real execution whose output is quoted.

| Id | Claim | Executed | Admit | Inputs and parameters | Observed | Digest | Normalize | Mode | Mutate | Expect | Mutation or negative control → result | Reproduction | Label |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | An unborn HEAD exits 1 through a raw exception | `node --test --test-name-pattern="without a commit" tools/branch-fresh.test.mjs` | | `git checkout --orphan sin-commit` with `origin/main` present | `status=1 stdout="" stderr[0]="node:internal/errors:999"` | | | host | | fail | literal fixture control: a committed HEAD passes the same CLI | `/tmp/probe-bf.mjs` P1 | observado |
| E2 | Running from `tools/` invents gaps | `node --test --test-name-pattern="subdirectory" tools/branch-fresh.test.mjs` | | `cwd = <repo>/tools`, checkout level with base | `status=1 stdout="branch-fresh: behind 0, ahead 0 (base origin/main)\nbranch-fresh: missing here: lk-callout, lk-figure, lk-walkthrough"` | | | host | | fail | same repo, `cwd = <repo>` → `fresh`, exit 0 | `/tmp/probe-bf.mjs` P2 | observado |
| E3 | `--base=<ref>` is ignored | `node --test --test-name-pattern="--base=<ref>" tools/branch-fresh.test.mjs` | | `--base=no-existe` on a 1-behind checkout | `status=1`, answer about `base origin/main`; `--base=no-existe` (space form) → `status=2 "unknown base ref no-existe"`; `--base=` → `status=0` | | | host | | fail | space form takes the same ref and exits 2 | `/tmp/probe-bf.mjs` P3/P3b | observado |
| E4 | A double-quoted `define` is invisible | `node --test --test-name-pattern="double quotes" tools/branch-fresh.test.mjs` | | base kit has `define("lk-figure")`, local kit has not | `status=0 stdout="branch-fresh: fresh (base origin/main)"` | | | host | | fail | the same repo with `define('lk-figure')` → `missing here: lk-venn`, exit 1 | `/tmp/probe-bf.mjs` P4 | observado |
| E5 | The piece-loop `define` is invisible | `node --test --test-name-pattern="piece loop" tools/branch-fresh.test.mjs` | | base loop `[['cards'],['venn']]`, local loop `[['cards']]`, both containing `define(\`lk-${kind}\`)` | `status=0 stdout="branch-fresh: fresh (base origin/main)"` | | | host | | fail | literal-define control on the same shape → `missing here: lk-venn`, exit 1 | `/tmp/probe-bf4.mjs` P12b/P12c | observado |
| E6 | A shallow clone is reported ahead | `node --test --test-name-pattern="shallow clone" tools/branch-fresh.test.mjs` | | `git clone --depth 1` of a 1-commit file:// origin, origin then gains 5 commits, clone fetches `--depth 1` | `{"fresh":false,"behind":1,"ahead":1,...}` | | | host | | fail | full clone of the same origin at the same point → `{"fresh":true,"behind":0,"ahead":0}` | `/tmp/probe-bf2.mjs` P5/P5b | observado |
| E7 | NFD gets a different verdict for the same title | `node --test --test-name-pattern="compuesto y descompuesto" tools/explain-check.test.mjs` | | `'Configuración rápida del módulo básico'` (38 NFC, 42 NFD) in a box with an outside icon | `ok=false :: 1 figura(s) con frases en las cajas` | | | host | | fail | the NFC form of the same string → `ok=true` | `/tmp/probe-pe.mjs` | observado |
| E8 | An unreadable spec passes the whole gate | `node --test --test-name-pattern="JSON no se lee" tools/explain-check.test.mjs` | | `CUMPLE` scene with one closing brace removed; `JSON.parse` asserted to throw | `exit=0`, every rule `ok` including `escena 1 escena(s)` | | | host | | fail | the intact scene in the same note → also exit 0 only because it is valid; the broken one must exit 1 | `/tmp/probe-pe.mjs` | observado |
| E9 | Two gates disagree on the same icon | `node --test --test-name-pattern="icono encima de una caja" tools/explain-check.test.mjs` | | `ESCENA_DE_CLAUSULAS` + `icons:[{kind:'gear',x:120,y:90,size:24}]` inside box `(20,40,200,100)` | `prosa-en-cajas ok=true` · `escenario-de-cajas ok=false "la escena quieta «sin título» solo dibuja cajas con su texto y flechas"` | | | host | | fail | the same scene with the icon at `x:700` (outside every box) → both `ok=true` | `/tmp/probe-pe3.mjs` | observado |
| E10 | A zero-width space hides the final stop | `node --test --test-name-pattern="carácter invisible" tools/explain-check.test.mjs` | | `'El cliente envía el paquete.' + U+200B` | `ok=true` | | | host | | fail | the same string with a normal space, NBSP or newline after the point → `ok=false` | `/tmp/probe-pe2.mjs` | observado |
| E11 | A box `sub` is not measured | `node --test --test-name-pattern="sub-línea de nueve" tools/explain-check.test.mjs` | | box `label:'la página'`, `sub:'el cliente pide la página y espera la respuesta'` (9 words), icon outside the box | `ok=true` | | | host | | fail | the same 9 words in `label` → `ok=false`; a 4-word sub (existing test) → `ok=true` | `/tmp/probe-pe.mjs`, `/tmp/probe-pe2.mjs` | observado |
| E12 | An unreadable `tools/` reads as stale | `node /tmp/probe-bf3.mjs` (P17) | | `chmod 000 tools`, uid 1000 | `status=1 stderr[0]="node:fs:1956"` | | | host | | fail | `chmod 755` → exit 0 | `/tmp/probe-bf3.mjs` | observado |

## Promises that held

Each line names what would have made the probe fail, so a green result is not blindness.

| Promise | Probed | Observed | What would have failed it |
|---|---|---|---|
| A title of exactly 40 characters passes; 41 does not | `'a'*40` / `'a'*41` with an outside icon | `ok=true` / `ok=false` | a 41-character title answered `ok=true`, or a 40-char one answered `ok=false` |
| A title of exactly 6 words passes; 7 does not | 6-word and 7-word labels | `ok=true` / `ok=false` | a 7-word title answered `ok=true` |
| An empty or whitespace-only label is not a phrase | `''`, `'   '` | `ok=true` | `ok=false` (a false positive would refuse every empty slot) |
| A punctuation-only label is not a title | `'.'`, `'...'` | `ok=false` | `ok=true` (punctuation accepted as a title) |
| The period survives ordinary whitespace | phrase + NBSP / space / newline | `ok=false` for all three | `ok=true`, which is exactly what U+200B did (PE4) |
| A short title with a short sub still passes | `label:'la página', sub:'la pide el cliente'` (existing test) | `ok=true` | `ok=false`, which would contradict the rule's header |
| An icon outside every box saves the clauses | icon at `x:700` | `ok=true` | `ok=false`; the control is E9, where the icon is inside |
| Boxes inside `lk-story` steps, `lk-figure`, `lk-walkthrough` are measured | one phrase box in each | `ok=false` in all three | `ok=true` for any of them (the walker missed a tag) |
| The approved corpus carries no prose in boxes | 127-box corpus + `ejemplo-aprobado.md` | `ok=true` (suite) | one corpus figure refused |
| A base that adds `tools/nuevo.mjs` is named | base commit adds it, checkout behind | `exit=1 "missing here: tools/nuevo.mjs"` | `fresh`, or the tool named a different path |
| An unfetched base cannot answer | `origin` remote added, no ref | `exit=2 "unknown base ref origin/main; run git fetch, or pass --base <ref>"` | `exit=0/1` |
| `--base` accepts a tag, a local branch and itself | `--base v1` / `--base base-vieja` / `--base main` | `exit=0 fresh` in all three | `exit=2`, or a stale verdict for a base HEAD contains |
| No `origin/HEAD` falls back to `origin/main` | remote ref present, no symbolic `HEAD` | `exit=0 "fresh (base origin/main)"` | `exit=2` or a guessed base |
| Thousands of files under `tools/` do not break the diff | 3000 `tools/fNNNN.mjs`, level with base | `exit=0 fresh` in 193 ms | a stall, an ENOBUFS/argv error, or an invented gap |
| A base that declares one component twice still names a real gap | `define('lk-figure')` twice in the base | `missingComponents:["lk-figure","lk-figure"]` | a gap that is not there; the duplication is cosmetic and is not pinned |

## Not pinned, and why

| Target | Reason |
|---|---|
| `scene.labels`, `props[].label`, mark/arrow labels, `caption`, actor `tag`, `facts` | each carries prose and the gate passes it, probed in `/tmp/probe-pe.mjs` and `/tmp/probe-pe2.mjs`. They are not boxes, and this rule's contract is `boxes[].label` (+`sub`, pinned). A `caption` is the figure's own prose by design. Bounding `tag`/`caption` would require a number no file in this repo states: that is a hypothesis, not a defect. The #431 per-slot remit is not implemented in this file; `sub` is pinned because the kit renders it inside the same box whose `label` is already bounded |
| `boxes` as a non-array, and a `null` payload | both crash before or inside `leerNota`/another rule with `TypeError`, outside these two files (`/tmp/probe-boxes-obj.md` → `TypeError: (scene.boxes \|\| []) is not iterable`; `null` → `note.scene` of null). Not edited and not pinned: the crash is not in the two gates under test |
| `tools/branch-fresh.mjs:76` unreadable `tools/` (BF7) | confirmed by probe E12; a `chmod`-based test is green when the suite runs as root, so it cannot hold the promise in every environment |
| A base that moves between `rev-list HEAD..base` and `rev-list base..HEAD` | no seam exists to move the ref deterministically between the two spawns; a reasoned hypothesis (`razonado`), never executed |
| Duplicate component in the base | names a real gap twice; cosmetic, never a gap that is not there (E-row above) |

## Local witnesses kept outside the suite

The eleven findings above land in the repository suite. These stayed local and are named so nobody thinks the net
is wider than it is: `/tmp/probe-bf.mjs`, `/tmp/probe-bf2.mjs`, `/tmp/probe-bf3.mjs`, `/tmp/probe-bf4.mjs`,
`/tmp/probe-pe.mjs`, `/tmp/probe-pe2.mjs`, `/tmp/probe-pe3.mjs`, `/tmp/probe-boxes-obj.md`, `/tmp/boxes-obj.out`.

## Execution log

| Date | Target | Rung reached | Findings (path:line) | Promoted tests | Evidence (ledger id) | Notes |
|---|---|---|---|---|---|---|
| 2026-02-05 | cancelled-run diff triage | — | — | — | — | all 8 new tests from the cancelled run were re-executed; each was RED for the defect it names, so all kept; the one unrelated reformat of the corpus test was restored |
| 2026-02-05 | `branch-fresh.mjs` | pin | BF1-BF6 | 6 tests in `tools/branch-fresh.test.mjs` | E1-E6 | 6 pre-existing tests stay green |
| 2026-02-05 | `prosa-en-cajas.mjs` | pin | PE1-PE5 | 5 tests in `tools/explain-check.test.mjs` | E7-E11 | pre-existing prosa tests stay green |

## Remaining, in order

1. `tools/branch-fresh.mjs:76` — guard `localTools` like `localComponents` — pin once a non-root-only harness exists (BF7).
2. `scene.labels` / `props[].label` / mark+arrow labels / `caption` / `tag` — belongs to #431's per-slot bounds; needs the contract's numbers before a test can assert them.
3. `leerNota`/sibling rules crash on `boxes` not an array and on a `null` payload — a schema rule, outside these two gates.
