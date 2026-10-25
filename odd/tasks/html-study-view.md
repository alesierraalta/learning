# HTML study view
Objective: an interactive HTML view of every Learnings part (video, live quiz, demos) served by the Pi adapter, which sends the learner's answers and reasoning straight into the chat; Obsidian stays the source of truth.
Authorized ("si, es para todo mi sistema de learnings"): branch feat/html-study-view in this repository, adapter + docs + skill update. Push, merge and Pi settings changes stay the user's decision.

## Specs
S1 — "migrar de obsidian a HTML para aprovechar más métodos de enseñanza y quizes en vivo"
S2 — "o que todo también se guarde en el obsidian también"
S3 — "el HTML debería tener el vídeo, incluso con el HTML o de la forma que sea, realmente el lenguaje me da igual"
S4 — "podríamos desbloquear el hacer demos interactivos para yo desbloquear mejor entendimiento"
S5 — "un HTML conectado con gentle shell/pi, para que al responder las preguntas y el razonamiento se pase todo directamente al chat para yo no tener que estar copiando y pegando todo"
S6 — "y que pueda ir guardando en learninga"
S7 — "es para todo mi sistema de learnings": the view is generated from the vault files of any topic and any part (plan.json, explicaciones/, mini-quiz/, quiz.json), never hand-built per part.
S8 — Approved design (proposal answered "si"): Obsidian stays the original; the engine is unchanged (answers still reach it through the chat); the server listens on 127.0.0.1 only, requires a random per-session token, and accepts only fixed-structure data (question id, chosen option, text), never a free prompt.

## Tasks
T1 — S1,S3,S7,S8 — bridge server + learning_view tool: part page (note, video, callouts, mermaid), contained attachment serving with Range — inline — pending
T2 — S1,S2,S5,S6,S8 — live quiz (mini-quiz and diagnosis rounds) + reasoning, own words, exercises, question to tutor → validated submit → pi.sendUserMessage — inline — pending
T3 — S4 — interactive demos: explicaciones/demos/<slug>*.html embedded sandboxed; a demo can post an observation to the chat — inline — pending
T4 — S2,S6,S7 — docs/integration.md + explicacion-interactiva skill (tutor offers the view, records bridge messages as today; builders may author demos) — inline — pending
T5 — S5,S8 — real run: real Pi loads the adapter, learning_view returns a URL, Windows browser path reachable, a submit arrives as a chat turn — inline — pending

## Log
L1 — "ver cómo hago para migrar de obsidian a HTML para aprovechar más métodos de enseñanza y quizes en vivo, o que todo también se guarde en el obsidian también, el HTML debería tener el vídeo, incluso con el HTML o de la forma que sea, realmente el lenguaje me da igual podríamos desbloquear el hacer demos interactivos para yo desbloquear mejor entendimiento, un HTML conectado con gentle shell/pi, para que al responder las preguntas y el razonamiento se pase todo directamente al chat para yo no tener que estar copiando y pegando todo, y que pueda ir guardando en learninga"
L2 — "si, es para todo mi sistema de learnings" (answer to "¿Construyo esa prueba?" after the proposal: Obsidian original, HTML player, Pi extension bridge with pi.sendUserMessage, 127.0.0.1 + token + structured payload).
