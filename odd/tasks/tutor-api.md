# Tutor por API

Objective: the studio's tutor stops depending only on a local CLI agent. The learner sets a
provider's API key in the environment, the studio detects which provider that key belongs to,
offers that provider's own model catalogue and the effort levels the chosen model accepts, and
tutors through the provider's chat-completions API with real tools (read, write, edit, engine).

Issues #404 (provider detection and model choice) and #405 (the runtime with tools). Branch
`feat/404-tutor-api`. Push, PR and merge stay the owner's decision.

## Specs

S1 — "para que el usuario pueda configurar su API key y en base a su API key se detecte cuál
sea el API key y definir el modelo".

S2 — "si pongo el API key de Mistral, que detecte que es de Mistral y me pregunte cuál modelo
quiero usar, cuál es el effort y todo eso".

S3 — "el proveedor que sea con su lista de modelos pertinentes": the registry is data, so a
second provider is an entry, not a rewrite. Mistral is the only one implemented here.

S4 — "para incluso hacer que la generación del texto vaya incluso, o sea, la generación de la
parte, la generación de todo vaya más rápido": the point of going straight to the API is speed;
a turn must stream and must not pay for a CLI agent's startup.

S5 — Owner decision (2026-11-06): keys live in **environment variables** per provider. Nothing
writes a key to the vault, `tutor.json`, localStorage or the page; the browser only ever learns
whether a key is present and which variable carries it.

S6 — Owner decision (2026-11-06): **Mistral only** in this slice, end to end.

S7 — Owner decision (2026-11-06): the API tutor needs tools — "sí: leer, escribir, editar y
engine". A chat-only tutor is explicitly not what was asked.

S8 — Mistral evidence (docs.mistral.ai, read 2026-11-06): `GET /v1/models` returns
`data[].{id, capabilities, max_context_length}`. `reasoning_effort` is accepted **per model**:
`mistral-small-2603` and `mistral-medium-3-5` take `high`/`none`; `mistral-large-4-0` takes
`low`/`medium`/`high`; `zai-glm-5-3` and `zai-glm-5-3-flash` take `low`/`high`/`max`. A value in
the API-wide enum is not a value the model accepts, so the studio never offers a level the
selected model does not name, and sends none when it names none.

S9 — Mistral evidence (same source): with reasoning on, `message.content` is a **list of chunks**
(`{type:"thinking"}` / `{type:"text"}`) instead of a string, and the streaming `delta.content`
changes shape mid-stream. Some models always answer with a list. The parser accepts both shapes
in one stream; thinking chunks are not shown as the tutor's words.

S10 — Authority is unchanged: the engine owns PASS. The runtime reports facts; the studio keeps
the vocabulary. A turn that cannot reach a verdict leaves the studio saying so.

## Tasks

| ID | Specs | What | Route | Commit |
|---|---|---|---|---|
| T1 | S1,S3,S5,S8 | `studio/proveedores.ts`: registry, `detectar`, `detectarClave`, `nivelesDeEffort`; tests | inline | 41fbb29 |
| T2 | S1,S2 | `studio/tutor.ts`: `version: 2` with `proveedor`, v1 migrated on read; tests | inline | 41fbb29 |
| T3 | S1,S2,S5 | `api/tutor` reports detected providers and key presence; effort follows the model; Configuración shows the provider block | inline | 1f93d49 |
| T4 | S4,S9 | `studio/api-runtime.ts`: SSE parser (string and chunk-array deltas, `[DONE]`), streamed tool calls, bounded tool loop, abort, transcript | inline | 99593ff |
| T5 | S7 | Tools `read`/`write`/`edit`/`bash` with `resolveContained` and a `bash` restricted to the study engine | inline | 99593ff, L16 fixes |
| T6 | S4,S7,S10 | Wire `agente: "api"` in `studio/server.ts`; conformance across the three runtimes | inline | 1f93d49, L16 fixes |
| T7 | S3,S7 | `docs/studio.md`: the runtime, what it does differently, what it cannot do | inline | e82b315, L16 fixes |

## Log

L1 — "Vamos a construir el sistema para utilizar por API, para que el usuario pueda configurar
su API key y en base a su API key se detecte cuál sea el API key y definir el modelo. Por
ejemplo, si pongo el API key de Mistral, que detecte que es de Mistral y me pregunte cuál modelo
quiero usar, cuál es el effort y todo eso. Si utilizo el de Cent-AI, me pregunte si quiero usar
Hy 4 free No, Haiku for Flash. High for Flash. Bueno, ni modo. O bueno, el proveedor que sea con
su lista de modelos pertinentes. Pero bueno, para incluso hacer que la generación del texto vaya
incluso, o sea, la generación de la parte, la generación de todo vaya más rápido."

L2 — L1 is spoken dictation: "Cent-AI" is Anthropic and "Hy 4 free / Haiku for Flash / High for
Flash" is a garbled model list. Recorded here instead of silently corrected; nothing in this
feature depends on reading it. S3 keeps the answer to the garble: whatever the provider is, it
brings its own pertinent model list.

L3 — Owner decisions, asked and answered before the first write (2026-11-06): keys in environment
variables (S5); Mistral only, vertical slice (S6); the API tutor gets tools — "sí: leer,
escribir, editar y engine" (S7).

L4 — Evidence gathered before designing, not assumed: Mistral's own docs give the per-model
effort table (S8) and the two `content` shapes (S9); the studio's existing surfaces were mapped
at file:line (`toolLabel` recognises `read`/`write`/`edit`/`bash`; `toolNote` reads `args.path`;
`resolveContained` realpaths both sides, so a new file needs a parent-based check).

L5 — Consequence of S8 that shapes the UI: `pensamientos` stops being one list per agent and
becomes a fact of the selected model. A model that declares no levels produces an empty list and
the page says why; it never shows a selector that would only produce a refused request.

L6 — Consequence of S7 that shapes the code: the runtime cannot be a thin HTTP client. It owns a
tool loop, or the tutor cannot write the note it was asked for nor ask the engine for status.
The tool names and argument shapes copy Pi's (`read{path,offset,limit}`, `write{path,content}`,
`edit{path,oldText,newText}`, `bash{command}`) so the studio's existing labels and note-tracking
work unchanged.

L7 — Verification limit stated up front: no provider key exists on this machine (checked by
presence only, never printed), so every test runs against a local fake provider. Live proof
against api.mistral.ai needs the owner's key and is reported as pending, not as passed.

L8 — Slice 1, `41fbb29` (476+/13−): `studio/proveedores.ts`, `studio/tutor.ts` v2, the two new
suites and the skill-directory invariant split (`TUTOR_SKILL_AGENTS`). The API runtime reads no
vault skills, so the old invariant — every tutor agent declares a skill directory — would have
forced a false row into `deploy/vps/tutor-skill-dirs.tsv`; the claim now names the runtimes that
actually read them. Tests after it: `proveedores` 10/10, `tutor` 8/8, `tutor-context` 14/14.

L9 — Slice 2, `99593ff` (708+/1−): `studio/api-runtime.ts` and its suite. Two defects the tests
found and fixed before the commit, both real: (a) the system message was appended after the
learner's, so the provider read an unframed turn — the test that reads `messages[0].role` caught
it; (b) an aborted turn emitted no `agent_settled`, and the studio releases its turn only on that
record, so a stopped turn would have locked the chat. 11/11 after both.

L10 — Slice boundary recorded because slice 2 ran past the ~400-line unit: the runtime and its
tools are one behaviour with one suite, and splitting it would have left a commit whose tests
cannot pass. Slice 1 is 476 lines, most of them tests and the task file. Reviewer can read them
one at a time; the delivery shape (one branch, one PR closing #404 and #405) is chosen when
publishing, and publishing remains the owner's decision.

L11 — Slice 3 (in progress): wiring. A writer was delegated and the studio restart cancelled it
mid-task; what it had already written (`Session.api`, `startApiRuntime`, `startTaskRuntime`'s
branch, `missingRuntime`, the two `StudioOptions`) was sound and was kept, and the rest was
finished inline. Two real gaps the tests found, both silent breakage rather than visible errors:
`deliver` routed every prompt through Pi's RPC unless `session.agy` existed, so an API turn threw
503 "El tutor no está en marcha" — a studio that starts the tutor and then refuses every prompt;
and `GET api/tutor/modelos` gained `pensamientos` while an existing test asserted the whole body
with `deepEqual`, which is exactly the shape a shared-contract change breaks. Both fixed here.

L12 — The effort selector did not exist: `tutor.json` had `pensamiento` but Configuración only
offered agent and model. It now exists, its options come from the returned `pensamientos` (the
model's own levels), and a level the model does not name is refused before `tutor.json` is
written — a refused tutor never replaces the one that works.

L13 — Delivery so far: three commits on `feat/404-tutor-api` from `origin/main` (41fbb29, 99593ff,
1f93d49) plus this documentation slice. The code slices run past the ~400-line unit on purpose and
the reason is on record in L10: each of them is one behaviour with one suite, and splitting them
would produce commits whose tests cannot pass. A reviewer reads them one at a time; the PR closes
#404 and #405 together, because they are one feature and #405's runtime cannot be chosen without
#404's registry.

L14 — Suite evidence, with the environment stated because it changed the plan: the full studio
suite in parallel is killed by `earlyoom` on this machine (13 GB, 6 GB available, 4.9 GB swap in
use) — exit 137 with no output. Serialized (`--test-concurrency=1`) it runs: `studio/server.test.mjs`
213/213 and the remaining `studio/*.test.mjs` 368/368. Two failures it found were both a shared
contract breaking in silence: `GET api/tutor`'s body asserted with `deepEqual` against the v1 shape
(now asserts the v1→v2 migration), and a layout test that pinned *two* selects in the preferences
form (now pins the three by name, which is the claim it was actually making).

L15 — Not verified, and not claimed: a live turn against `api.mistral.ai`. No provider key exists on
this machine, so every test runs against a local fake provider that emits the shapes Mistral
documents. The owner's `MISTRAL_API_KEY` plus a restart of the studio is what turns this from
"tested" into "proven".

L16 — Independent verification (`gentle-ai-verify`, mwuuqjb4-1-bx2c) read the candidate and
reported, with reproductions: **two blocking** and four medium defects. It was right about every
one I checked, and the fixes are pinned by tests that would fail without them:

- **B1, blocking — the stop button never reached this runtime.** `abort` knew `session.agy` and
  `session.child`, not `session.api`, so «Detener» released the page while the runtime stayed busy
  and the model kept writing to the vault. Fixed in `api/server.ts`'s abort branch, and the turn is
  now watched: a provider that goes silent for 60 s is cut with a message that says it was silence,
  instead of holding the studio's only turn for as long as its socket lives.
- **B2, high — `write` escaped through a final-component symlink**, dangling ones included,
  because only `dirname` was realpath'd. A write now refuses a last component that is a link; a
  link that stays inside the folder still works.
- **B3 — the key could reach the page** inside a provider's error body (a proxy may quote the
  request). The body is still reported, with the key scrubbed to `[clave]`.
- **B4 — the engine child inherited the key** because the "never the key map" comment was true of
  `childEnv` and false of `process.env`. Every provider variable is stripped before the child runs.
- **B5/B9 — the engine could be pointed outside the vault** with `--workspace /tmp/x`, and the
  advertised `learning status --json` could never run because the engine requires `--root`,
  `--workspace` and `--rules` on every command. The studio now supplies the three, and refuses any
  of them (or `--source`/`--exam-source`) whose value leaves the folder.
- **6b — a named provider with no key was saved**, replacing a tutor that worked. Refused before
  the write now, like the other unusable configurations.
- Parser: a last event without its trailing blank line was dropped and two `data:` lines in one
  block were joined into unparseable JSON. Both read now.
- One test was reaching the real `api.mistral.ai` because it never pointed the studio at a fake
  provider; it does now, so the suite is offline.

Still open and stated as such: S3 is partially met (the registry is data, but the runtime and the
catalogue still assume Mistral — a second provider is an entry *plus* code); no test exercises a
real engine verdict (the Go binary was never run in this worktree), and nothing was proven against
the real provider API. The Configuración UI is covered only through the names of its three selects.
