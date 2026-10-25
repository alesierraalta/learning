# Learning studio
Objective: a local study app (in the spirit of learnharness) where the learner browses and chooses every Learnings content and drives the study, while Pi runs in the background with the unchanged skill, engine, preferences and mode choice.
Authorized by the request below ("Si" to merging feat/part-apps, then this request); branch feat/learning-studio. Push stays the user's decision.

## Specs
S1 — "la idea es poder tener no sé si una aplicación donde pueda yo acceder a cada contenido de forma automática no automática pero que lo puede elegir yo como una aplicación"
S2 — "cada vez que yo vaya seleccionando cosas vaya trabajando con Gentle Shell o el Pi o el cual de estos dos de fondo para que vaya utilizando la IA de fondo para ir tanto haciendo las predicciones las explicaciones"
S3 — "eso si no lo vas a cambiar va a va a tener que hacer de fondo todo la planificación el tema de las preferencias el elegir si es una si es una explicación universitaria o rápida todo eso igual" — the skill, engine, preferences and mode choice stay as they are; they run in the background Pi.
S4 — "es como lo que está haciendo el repositorio que te mandé pero enfocado a lo que ya teníamos nosotros" (https://github.com/amosblomqvist/learnharness)
S5 — "hacerlo también una interfaz para poder hacerlo nosotros desde aquí" — everything that today happens in the chat can be done from the app.

## Design (from the spike, L2)
- `studio/server.ts` (Node, no dependencies, type-stripped like the adapter) listens on 127.0.0.1 behind a per-run token (Host/Origin/JSON checks as the bridge), spawns `pi --mode rpc --session-id estudio` (its own persistent conversation, never shared with a terminal session) in the Learnings folder with `GENTLE_SHELL_INTERACTIVE_HOST=1` (Gentle then asks through RPC dialogs), and hosts its own study-view bridge (`registerBridge`) whose submissions become prompts of that same Pi session.
- The browser UI (`studio/ui/`) has three areas: library (topics with engine stage and parts, quick notes), center viewer (bridge pages and part apps in an iframe; `frameAncestors` lets the bridge allow the studio origin), and the tutor panel (streamed text, tool activity, dialogs as buttons, input, stop, new conversation).
- Launcher: `estudio` shell function starts the server and opens the Windows browser.

## API contract (server ↔ UI), all under `/<token>/`
- `GET /` UI shell; `GET studio.js`, `GET studio.css`.
- `GET events` (Server-Sent Events, `event: <name>` + JSON `data`):
  - `history` `{messages: [{role: "user"|"assistant", text}]}` once on connect;
  - `state` `{busy: boolean, alive: boolean}`;
  - `user` `{text}` when a prompt is sent (from the UI or a view submission);
  - `assistant_delta` `{id, delta}`; `assistant_end` `{id, text}`;
  - `tool` `{phase: "start"|"end", id, name, label, ok}`;
  - `dialog` `{id, method: "select"|"confirm"|"input"|"editor", title, message, options, placeholder}` (replayed to new clients while open); `dialog_closed` `{id}`;
  - `notice` `{level, message}`; `library_changed` `{}` after Pi settles; `error` `{message}`.
- `POST prompt` `{text}`; `POST dialog` `{id, value}` | `{id, confirmed}` | `{id, cancelled: true}`; `POST abort` `{}`; `POST new-session` `{}`; `POST restart` `{}`. JSON only, same Origin, `200 {ok: true}` or `4xx {error}`.
- `GET api/library` → `{topics: [{id, title, status, stage, nextStage, part, hasDiagnosis, parts: [{id, title, written, hasApp, hasQuiz, answered}]}], quick: [{id, title}]}`.
- `GET api/view?topic=<id>[&part=<p|quiz>]` → `{url, appUrl?}` on the studio's bridge (iframe-able from the studio origin).

## Tasks
T1 — S2,S3 — spike: Pi RPC in Learnings with the interactive-host env asks the mode as an RPC select dialog — inline — done (L2)
T2 — S1,S2,S3,S5 — studio server: Pi RPC child, SSE relay, prompt/dialog/abort/new-session/restart, library API, hosted bridge with frameAncestors, security checks, tests with a fake Pi — inline — pending
T3 — S1,S4,S5 — studio UI: library, viewer, tutor panel (stream, tool activity, dialogs, input), Distill design — worker — pending
T4 — S1,S5 — launcher `estudio`, docs (README, docs/studio.md), skill/AGENTS note that the studio shows parts by itself — inline — pending
T5 — S1-S5 — real run: the studio with real Pi starts a quick topic, answers the mode dialog, shows the new note and a part page — inline — pending

## Log
L1 — "Si, y  la idea es poder tener no sé si una aplicación donde pueda yo acceder a cada contenido de forma automática no automática pero que lo puede elegir yo como una aplicación creo que como te mandé el cómo se llama el repositorio y bueno cada vez que yo vaya seleccionando cosas vaya trabajando con Gentle Shell o el Pi o el cual de estos dos de fondo para que vaya utilizando la IA de fondo para ir tanto haciendo las predicciones las explicaciones que recuerda eso si no lo vas a cambiar va a va a tener que hacer de fondo todo la planificación el tema de las preferencias el elegir si es una si es una explicación universitaria o rápida todo eso igual queda solamente que es como lo que está haciendo el repositorio que te mandé pero enfocado a lo que ya teníamos nosotros pero hacerlo también una interfaz para poder hacerlo nosotros desde aquí"
L2 (T1) — Spike: `pi --mode rpc --no-session` in Learnings with GENTLE_SHELL_INTERACTIVE_HOST=1, prompt "Quiero aprender qué es una función hash." → tools read, ask_user_choice; RPC `extension_ui_request` select "¿Cómo quieres aprender qué es una función hash?" options Universitario / Rápido con quiz / Rápido desde cero (gentle-pi/extensions/ask-user-choice.ts askThroughDialogs). Also 44 extension_ui_request events (mostly fire-and-forget status/widgets). feat/part-apps merged to main (52360fe), not pushed.
