# learning

Separate repository for the deep-learning validation system (spec: `odd/tasks/learning-validation.md`).
A Go engine owns every rule, validation, semantic judgment and completion decision; a thin,
project-scoped Pi adapter only activates, executes and reports the engine's CLI.

> "Todo este sistema debe aplicarse específicamente cuando se esté trabajando dentro de mi
> vault/carpeta de Obsidian llamada **`Learning`**" (S1) — on disk the folder is
> `notes/04-RECURSOS/Learnings` (plural); see [docs/integration.md](docs/integration.md).

## Authority and honesty

- **Engine status is authority.** The adapter never decides a PASS; it only transports
  `init|validate|advance|status` calls and renders the returned JSON report.
- The adapter **cannot promise suppressing all prose** or infinite correction. Pi's settle
  boundary can request at most a bounded number of continuations; when the host cannot
  continue, or the engine output is missing/malformed, an explicit *blocked* entry is left
  instead. Authoritative completion is `learning status` reporting completed, nothing else.
- Conceptual/short explanations stay lightweight: the adapter registers no gate outside an
  explicitly enrolled deep session and injects nothing into any global prompt (S11).

## Repository layout

| Path | Owner | Purpose |
|---|---|---|
| `cmd/`, `internal/`, `rules/` | engine | Deterministic rules, stages, semantic judge (see `docs/protocol.md`, `docs/engine.md`) |
| `integrations/pi/` | adapter | Local Pi extension: activation, execFile transport, settle gate |
| `docs/protocol.md` | shared contract | Engine/adapter boundary this adapter implements |
| `docs/integration.md` | adapter | Loading, configuration, usage, verification evidence |

## Build

```bash
go build -o bin/learning ./cmd/learning
```

The adapter resolves `bin/learning` and `rules/deep.json` from this repository itself
(`integrations/pi/index.ts` → two levels up); binary absence is reported explicitly with
this build hint, never silently worked around.

## Load the adapter in Pi

One-off (local path, no install):

```bash
pi -e /home/alesierraalta/documents/learning/integrations/pi
```

Project-local: add the same path to the `extensions` array of the target project's
`.pi/settings.json`. No vault `.pi` file is modified by this repository; installation and
any skill pointer are operator tasks.

## Stage usage

- `/learning start [workspace]` — explicit deep enrollment (realpath containment under the
  configured Learnings root) + engine `status`.
- `/learning init [workspace]` — enrollment + engine `init` for a new run.
- `/learning stop` — persist deactivation (survives reload).
- `/learning status` — engine `status` for the active session.
- `learning_stage` tool — `init` / `start` (the chat enrolls a topic by folder name, so the
  learner never types a command) and `validate` / `advance` / `status` / `review` transport; `advance`
  requires an explicit stage and blocks while any applicable review is missing, stale or a
  gate `FAIL`.

Stage names and per-stage rules are defined once, in [docs/protocol.md](docs/protocol.md)
and `rules/deep.json`; this README does not duplicate them.

## Recorded reviews

There is no external judge and no configuration. `validate` returns `pendingReviews`; the Pi
chat evaluates each rubric (optionally through a subagent) and records the verdict with
`learning review --stage --rule --verdict PASS|FAIL --reason [--reviewer]`. See
[docs/engine.md](docs/engine.md#recorded-reviews-chat-possibly-with-subagents). No secret or
credential exists in this repository.

## Verification

```bash
go test ./... && go test -race ./... && go vet ./...   # engine
go build -o bin/learning ./cmd/learning
rtk node --test integrations/pi/*.test.mjs             # adapter (fake ExtensionAPI + CLI stub)
```

The adapter suite verifies adapter behavior against the documented CLI contract; it does
**not** verify the engine. The live-host load check and the real-CLI seam check are
documented separately with observed results in
[docs/integration.md](docs/integration.md#verification-evidence).
