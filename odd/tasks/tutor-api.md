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
| T1 | S1,S3,S5,S8 | `studio/proveedores.ts`: registry, `detectar`, `detectarClave`, `nivelesDeEffort`; tests | inline | pending |
| T2 | S1,S2 | `studio/tutor.ts`: `version: 2` with `proveedor`, v1 migrated on read; tests | inline | pending |
| T3 | S1,S2,S5 | `api/tutor` reports detected providers and key presence; effort follows the model; Configuración shows the provider block | inline | pending |
| T4 | S4,S9 | `studio/api-runtime.ts`: SSE parser (string and chunk-array deltas, `[DONE]`), streamed tool calls, bounded tool loop, abort, transcript | inline | pending |
| T5 | S7 | Tools `read`/`write`/`edit`/`bash` with `resolveContained` and a `bash` restricted to the study engine | inline | pending |
| T6 | S4,S7,S10 | Wire `agente: "api"` in `studio/server.ts`; conformance across the three runtimes | inline | pending |
| T7 | S3,S7 | `docs/studio.md`: the runtime, what it does differently, what it cannot do | inline | pending |

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
