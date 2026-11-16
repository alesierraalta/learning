# Background tasks — the main chat never waits for a topic's work

Milestone «Parallel background tasks» (#340 runtime pool, #341 routing, #342 UI) · branch
`feat/340-background-tasks` · base `origin/main @ ebd01ac31142`. Push and PR stay the user's decision.

## Specs

**S1 — Work runs at the same time.** The learner's words: «necesitamos un sistema donde puedan
haber multiples chats funcionando al mismo tiempo, por ejemplo, si dejo un quiz analizandose, y
luego quiero generar una nueva nota, no puedo, porque solo se puede uno a la vez». While a topic's
quiz is being analysed, a prompt in the main chat (e.g. generating a new note) starts at once: it
is neither refused with 409 nor queued behind the analysis.

**S2 — One main chat plus background tasks.** The learner chose «Un chat principal + tareas de
fondo»: the main chat (with its conversations, #103) stays as it is; a topic's work runs as a
background task with its own runtime process, never as a second visible chat.

**S3 — A topic's reader work goes to that topic's task.** The learner chose «Al chat de ese tema»:
quiz answers, reader questions and diagnostics sent from a part page, and `api/regenerar`, go to
the background task of their topic, created on first use. The task keeps its topic's conversation
across submissions (Pi: its own session id per topic; Antigravity: its own conversation per topic).

**S4 — No global limit.** The learner chose «Sin límite»: any number of topic tasks may work at once.

**S5 — One writer per topic.** The learner chose «No, uno por tema»: two runtimes never work on the
same topic at once. A second submission for a topic whose task is working queues on that task; a
task whose topic the main chat's current turn is working on waits until that turn settles, and a
main-chat prompt for a topic whose task is working waits until the task settles. Waiting is
visible, never silent.

**S6 — Antigravity too.** The learner's words: «recuerda tambien antigravity». Everything above
works with the Antigravity runtime as with Pi.

**S7 — The tasks are visible.** The studio shows each background task: its topic, its state
(working, waiting, asking, done, failed), its current activity, its transcript, its open dialogs
(answerable) and an abort control.

## Tasks

| ID | Spec | Issue | Route | Commit |
|---|---|---|---|---|
| T1 | S1, S2, S4, S5, S6 | #340 | worker (with T2, one writer) | — |
| T2 | S1, S3, S5, S6 | #341 | worker (with T1) | — |
| T3 | S7 | #342 | worker | — |

## Log

**L1** — «necesitamos un sistema donde puedan haber multiples chats funcionando al mismo tiempo,
por ejemplo, si dejo un quiz analizandose, y luego quiero generar una nueva nota, no puedo, porque
solo se puede uno a la vez»

**L2** — Decisions from the learner's answers: view = «Un chat principal + tareas de fondo»;
reader submissions = «Al chat de ese tema (Recomendado)»; limit = «Sin límite»; same topic =
«No, uno por tema (Recomendado)».

**L3** — «recuerda tambien antigravity»

**L4** — Evidence of today's limit (origin/main): one runtime and one in-flight `turn` in
`studio/server.ts`; a second prompt is refused with 409 `TURN_ACTIVE`. Conversations from #103
switch on that one process, so they never run at the same time.

**L5** — Design decisions from the exploration map (parent):
- Shape: one `Session` object (runtime process, in-flight turn, dialogs, busy, settle gate, assistant ids, tool args) instantiated once for the main chat and once per topic task. Global: HTTP, token, SSE clients, root/engine/rules, chat list, method choices, bridge tools, shutdown.
- Identity: a topic task's Pi session id is `tarea-<topic>`; its Antigravity conversation id is persisted per topic outside the vault (next to `chats.json`), so a studio restart keeps the thread.
- Lock: a per-topic FIFO lock shared by the main session and the task sessions, acquired BEFORE any bridge answer-file write or regeneration backup, so a queued request never writes before it owns its topic. A main turn that discovers its topic only on its first write takes the lock then; if a task holds it, that main turn's tool result is not blocked, but the task waiting for it starts only after the main turn settles.
- Queueing replaces the 409 for topic work: a second submission for a busy topic is accepted (202) and queued visibly. The main chat keeps its own one-turn rule for itself only.
- Tutor change (agent/model): running tasks finish on their current runtime; the next turn of each task and every new task use the new settings (an idle task's runtime is replaced before its next turn).
- Idle shutdown and the busy marker count every session: per-session busy entries, aggregated.
- Part checks share the root-level gate verdict cache (`integrations/pi/gate-verdicts.ts`): writes to it must stay safe under two topics settling at once.
