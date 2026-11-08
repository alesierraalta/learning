# Studio chats — one conversation per part, with a chat list

Issue #103 · branch `feat/103-studio-chats` · base `origin/main @ 48d65ea32210`

Today the studio runs one conversation for everything (`--session-id estudio`), so every
topic, part, tool call and engine round of one subject lands in the context of all the
others. This feature gives the learner named conversations, a list to open/rename/delete/
export them, one conversation per part opened from the reader, and per-chat context usage.

## Specs

**S1 — Free, named conversations.** The learner's words: «Libre: los crea el usuario» —
"Chats: «dudas de MDP», «repaso examen», «por qué falla Q-learning» — sin atadura a parte".
A conversation has a learner-chosen name and an optional anchor to a part. The name is
1–80 characters after trimming; empty or longer is refused, never truncated.

**S2 — Opening a part opens its chat.** The learner's words: «Abrir la parte abre su chat».
Entering `#/leer/<topic>/<part>` activates the conversation anchored to that part, creating
it on first use. A part has at most one anchored conversation, so opening it repeatedly never
multiplies chats.

**S3 — The list is the index, and it survives restarts.** `GET api/chats` returns
`{version: 1, activo, chats}` where each chat carries `id`, `nombre`, `ambito`, `creado`,
`usado`, `contexto`. The index lives outside the vault, next to `opened.json`
(`$XDG_STATE_HOME/learning-studio/chats.json`). A missing file starts empty; a damaged file
is reported and starts empty instead of stopping the studio.

**S4 — Open, create, rename, delete, export.** Each is one token-gated POST that answers
with the new list: `POST api/chats` (create), `api/chats/abrir`, `api/chats/renombrar`,
`api/chats/borrar`, `api/chats/exportar`. Deleting the active conversation is refused with
409 until another is opened: the studio never deletes the file a running agent writes.

**S5 — Both runtimes.** The learner's words: «También falta antigravity». Pi switches with
`switch_session` on its one process and records the session file from `get_session_stats`;
Antigravity carries a `--conversation` id persisted per chat. A conversation started with one
agent keeps its own id for that agent and is not silently carried to the other: switching
agents starts a fresh conversation for the new agent, and its id is stored on that chat.

**S6 — Per-chat tools.** A tool row belongs to the conversation that produced it. The `tool`
SSE event carries the chat id, and the browser drops rows whose chat is not the active one.

**S7 — Visible context.** The active Pi conversation reports its `contextUsage` from
`get_session_stats`; the list shows it for the active chat and the last value known for the
others. Antigravity reports no usage, so its chats show none rather than a guess.

**S8 — Nothing is lost, nothing is silent.** The conversation the studio already had becomes
the first entry of the list, adopted as «Chat general»; its history is not cleared. Every
refusal (busy tutor, unknown chat, missing session file, stale Antigravity id) answers with a
concrete message, never a silent no-op.

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S1, S3 | inline | `feat(studio): chat index outside the vault` |
| T2 | S4, S5, S7, S8 | inline | `feat(studio): Pi conversations switch, rename, delete, export` |
| T3 | S5, S8 | inline | `feat(studio): Antigravity conversation per chat` |
| T4 | S2, S6, S7 | inline | `feat(studio): chat list drawer and per-part chat` |
| T5 | — | inline | `docs(studio): document conversations` |

## Log

**L1** — «ver si se puede gestionar diferentes chats para cada parte o tema, de forma que
haya un manejo de contexto óptimo, y todo el sistema de lista de chats, borrar, abrir, tools
en chats etc....»

**L2** — Decisions taken from the learner's answers: unit = «Libre: los crea el usuario»;
runtime = «También falta antigravity» (both runtimes, not Pi only); opening a part =
«Abrir la parte abre su chat».

**L3** — Issue #103 ("Switch between tutor conversations", open) already covered the core, so
it is reused and the extra scope was added as a comment there instead of a duplicate issue.

**L4** — Base is `origin/main`, which has no `studio/runtime.ts`: that seam lives in the
uncommitted `feat/tutor-runtime` branch of the main checkout. This branch therefore extends
`studio/agy.ts` and the inline Pi dispatch in `studio/server.ts` directly, and will conflict
with that refactor when both land.
