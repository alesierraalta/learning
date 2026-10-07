# Pi integration (local adapter)

Scope of `integrations/pi/`: activation, CLI transport and host lifecycle only. Learning
rules, stage semantics, validation, hashing, locking and recorded reviews live in the Go
engine and are defined by [protocol.md](protocol.md) — this document never redefines them.

## What the adapter does

- Registers one tool (`learning_stage`) that the chat uses for every deep-mode operation,
  enrollment included, one manual fallback command (`/learning`), and one
  `agent_before_settle` gate that rechecks engine state.
- Spawns the engine with `execFile` using an argv array (never a concatenated shell command)
  and consumes exactly one JSON object from stdout.
- Persists enrollment as a session custom entry (`gentle-learning/enrollment`) and rebuilds
  active state from the branch on `session_start`/reload instead of silently disabling a
  deep session.

## What the adapter never does

- No global prompt injection: no `before_agent_start`, `context` or `context_with_system`
  handlers exist (asserted by `adapter.test.mjs`).
- No gate outside an explicitly enrolled deep session; both the session cwd and enrolled
  workspace must resolve inside Learnings. Passing an in-root target from an unrelated
  project cannot activate or restore the gate. Conceptual/short mode never reaches it (S11).
- No `advance` (and therefore no recorded-review requirement or completion claim) outside
  an explicit tool call with an explicit stage. The settle gate only ever runs `status`.
- No verdict of its own: `review` transports exactly the chat's `rule`/`verdict`/`reason`;
  admission (frontier, objective checks, hashes) is the engine's.
- No PASS of its own: unknown or malformed engine output fails closed.

## Local loading path

| Mode | How |
|---|---|
| One-off | `pi -e /home/alesierraalta/documents/learning/integrations/pi` |
| Project-local | add that path to `<project>/.pi/settings.json` → `extensions: [...]` |
| Manual dev | `pi --extension ./integrations/pi` from this repository |

The Pi package system can also load it as a local package; no npm dependency is installed
by this repository — `@earendil-works/pi-coding-agent` and `typebox` are host virtual
package aliases, and both imports are type-only.

Installed on this machine at
`/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings/.pi/settings.json`,
which only lists this adapter path. Pi reads project `.pi` from the working directory,
not from parent directories, so the study chat starts in the `Learnings` folder. On this
machine the shell function `aprender` in `~/.bashrc` does that from any directory: it
changes to the `Learnings` folder and runs `pi` with any arguments it receives. The first
run asks for project trust. `Learnings/AGENTS.md` (a Pi context file, additive to the
user's global instructions) declares the session a study session: every message goes
through the `explicacion-interactiva` skill and the learner never types a command — the
chat enrolls the topic itself with `learning_stage` `init` (new topic) or `start` (resume).
A project `.pi/APPEND_SYSTEM.md` is deliberately not used: it would replace the user's
global `~/.pi/agent/APPEND_SYSTEM.md`. Do not start the study chat from this repository:
the adapter is not loaded there, and builder subagents can only write inside the Git
repository of the session (the vault's `notes/` repository).

Verified with the installed Pi (`get_commands` over RPC, `--offline --approve`, no model
call): started in `Learnings`, `/learning` is listed with scope `project` from
`integrations/pi/index.ts` and no extension load errors; started in the home directory,
`/learning` is absent.

## Build and fixed paths

```bash
cd /home/alesierraalta/documents/learning
go build -o bin/learning ./cmd/learning
```

| Item | Value | Resolution |
|---|---|---|
| Engine binary | `<repo>/bin/learning` | `import.meta.url` of `integrations/pi/index.ts`, two levels up |
| Rules | `<repo>/rules/deep.json` | same |
| Learnings root | `LEARNING_ROOT` env, default `/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings` | read at extension load |
| Canonical target | notes under `04-RECURSOS/Learnings/` in the `ale` Obsidian vault | spec S1 calls it `Learning`; on disk it is `Learnings` (plural), see task log L4 |

Missing binary → explicit `binary-missing` error naming the path and the build command;
the adapter never falls back to a PATH lookup.

## Recorded reviews (no provider configuration)

There is no judge endpoint and no secret: interpretive rubrics are evaluated by the chat
(possibly delegating to a subagent) and recorded through the engine's `review` command.
`validate` returns `pendingReviews` with the rubric instruction, artifact and binding
context; the chat records one `PASS|FAIL` verdict per rule with a reason before `advance`
will proceed. Tests configure nothing and never call a provider.

## Stage usage

| Host action | Engine command | Notes |
|---|---|---|
| tool `learning_stage {action:"init", topic}` | `init` | creates `<root>/<topic>` (one folder name, no separators), enrolls it, records a new run; engine refuses to overwrite an existing run |
| tool `learning_stage {action:"start", topic}` | `status` | enrolls an existing topic (`not-found` if absent), then status report |
| `/learning start [ws]` | `status` | enrollment first (realpath containment), then status report |
| `/learning init [ws]` | `init` | engine refuses to overwrite an existing run |
| `/learning stop` | — | persists `active: false`; survives reload |
| `/learning status` | `status` | active session only |
| tool `learning_stage {action:"validate", stage?}` | `validate` | check without recording; returns `pendingReviews` |
| tool `learning_stage {action:"advance", stage}` | `advance` | stage is mandatory in the adapter — the only completion-recording path |
| tool `learning_stage {action:"review", stage, rule, verdict, reason, reviewer?}` | `review` | records one chat verdict; engine rejects non-frontier or objectively failing stages |
| tool `learning_stage {action:"status"}` | `status` | read-only recheck |

Stage names come from `docs/protocol.md`; unknown stages are the engine's rejection, not
the adapter's business.

## CLI JSON boundary as the adapter consumes it

- argv: `<command> --root <realpath> --workspace <realpath> --rules <rulesPath> --mode deep
  [--stage <stage>] [--rule <rule> --verdict <PASS|FAIL> --reason <text> [--reviewer <id>]]
  --json`, `cwd` = workspace, timeout 120 s.
- Exit codes: `0` accepted, `1` failed mandatory validation (surfaced as `isError: true`
  with the report intact), `2` operational/configuration error (also `isError: true`).
- Parse contract (fail closed): stdout must be exactly one JSON object; `status` must be a
  string; if `checks` is present it must be an array of `{id: string, status: PASS|FAIL|SKIP,
  reason?: string}` entries. Additional fields are passed through untouched.
- A report gates as **passing** only when `status` ∈ `accepted|completed|waiting|skipped`
  and no check is `FAIL`; any other string status (including unknown future values) blocks.
- Adapter-generated errors carry `source: "adapter"` with `reason` ∈
  `binary-missing|operational|malformed|invalid-arguments|inactive`.

## Settle gate semantics

1. Inactive session → handler returns nothing; engine is never touched.
2. Compromised enrollment (malformed record, root gone, workspace realpath escaped) →
   explicit blocked entry, no engine call, no continuation.
3. `status` returns passing → silence (waiting is a legitimate pause, never completion;
   completion is the engine saying so).
4. `status` returns a failing report → one `custom_message` correction entry; `continue:
   true` only when `event.context.canContinue` **and** the budget (2 corrections per user
   input, reset on `input` or on a passing status) is not exhausted.
5. Missing/malformed engine output → blocked entry and **no** continuation — an unavailable
   engine cannot be argued with, and the transcript keeps the explicit blocked status.

Pi's lifecycle limits are accepted, not hidden: no infinite retry, no claim that prose is
suppressed, no hard prohibition of assistant messages. Engine status remains the authority.

## Verification evidence

### Fake-host suite (always runnable)

```bash
rtk node --test integrations/pi/*.test.mjs
```

- Fixtures: fake `ExtensionAPI` + CLI stub (recorded argv, scripted stdout/exit codes),
  temp workspaces under `os.tmpdir()`, no real provider, no network.
- Observed at implementation time: `20 tests, 20 pass, 0 fail` (the real-CLI seam runs
  against the built `bin/learning`).
- Mutation checks (each proves the kept tests can go red):
  - dropping `realpath` from containment → 2 containment tests fail;
  - unbounded settle continuation → 2 bound/budget tests fail.
- These tests verify **adapter behavior against the documented contract only**; they make no
  claim about the engine implementation.

### Live-host check (installed Pi tooling, no model call)

```bash
cd /home/alesierraalta/documents/learning
pi --offline --no-extensions -e ./integrations/pi --mode rpc --no-session </dev/null
```

Observed: exit `0`, zero output, zero `Failed to load extension` diagnostics — the factory
loaded and registered under the real jiti runtime (`import.meta.url` repo resolution works).
Control run with `-e ./integrations/pi/does-not-exist.ts` exited `1` with
`Failed to load extension ... Extension path does not exist`, proving `-e` paths are
processed and load failures are surfaced. This checks *load*, not session behavior; interactive
behavior was not exercised (would require a real model turn).

### Real-CLI seam (auto-skips until the engine exists)

The suite contains `live CLI seam: real engine binary emits exactly one machine-readable
status report`, which runs the actual `bin/learning status ... --json` in a temp workspace
and asserts exit ∈ {0,1,2} plus the JSON report shape. It skips with
`engine binary bin/learning not built yet` until the engine task produces the binary; run
the suite again after `go build` to see it execute.

## Skill pointer paths

For the operator's later skill/pointer work (no file is written here):

- Adapter: `/home/alesierraalta/documents/learning/integrations/pi`
- Engine binary: `/home/alesierraalta/documents/learning/bin/learning`
- Rules: `/home/alesierraalta/documents/learning/rules/deep.json`
- Learnings root: `/mnt/c/Users/ismar/Documents/obsidian/ale/notes/04-RECURSOS/Learnings`
