# Code exercises
Objective: graded programming exercises inside Learnings (HTML view, studio and shell), for any language, corrected by running the learner's code against tests in an isolated container, plus a tutor review in the chat.
Authorized by L1–L2; branch feat/code-exercises in worktree ~/documents/learning-code-exercises (the other study chat keeps working on feat/learning-studio). Push and merge stay the user's decision.

## Specs
S1 — "necesito que también incluyamos una sección o una forma de poder evaluar código. Porque ya tenemos para matemáticas y preguntas" — a code-exercise section next to the existing quizzes.
S2 — "que con el Gentle Shell o lo que sea, se pueda, no sé, hacer ejercicios de código. Y que se vayan corrigiendo bien" — exercises are solved and graded from the HTML view/studio and from the shell; grading is objective (the code is executed against tests), never an opinion only.
S3 — "para laboratorio 2, escribir mucho código" / "hacer evaluaciones basadas en el código y hacer ejercicios. que se puedan ir corrigiendo dentro de nuestro de nuestra aplicación" — every attempt is corrected inside the app and recorded.
S4 — "son varios, asi que debe adaptarse a cualquiera" — language-agnostic: a language is a configuration entry (container image, file name, compile and run commands); adding one needs no code change.

## Design
- Vault: `<topic>/codigo/<id>/ejercicio.json` = `{titulo, enunciado (markdown), lenguaje, plantilla?, parte?, limite_segundos?, tests: [{nombre, entrada, salida, oculto?}]}`. Submissions: `<topic>/codigo/<id>/entregas/<NNN>.json` (never overwritten).
- Grading is stdin/stdout, like online judges: the program reads `entrada` and must print `salida` (trailing whitespace and CRLF normalized). Works the same for every language.
- Runners: `integrations/pi/runners.json` maps `lenguaje` → `{image, file, compile?, run}`. Execution: one `docker run` per attempt, no network, memory/CPU/pids limits, read-only root, all capabilities dropped, non-root user, per-test timeout, output size limit, container killed on overall timeout.
- Hidden tests (`oculto`) never reach the page: only their name and pass/fail.
- Bridge: page `GET /<token>/<topic>/codigo/<id>`; `POST /<token>/api/code/run` (visible tests + free input, not recorded); `POST /<token>/submit` kind `code` (all tests, saved, delivered to the chat for the tutor review). The topic page lists the exercises.
- Shell: `learning code list|open|test|submit|setup` over the same runner module.

## Tasks
- T1 — S2, S4 — runner module `integrations/pi/coderun.ts` + `runners.json` + tests — inline — commit: pending
- T2 — S1, S2, S3 — bridge routes, code page in the view, topic listing + tests — inline — commit: pending
- T3 — S2, S3 — shell CLI `learning code` + docs — inline — commit: pending
- T4 — S1, S3 — skill `explicacion-interactiva`: author exercises, review submissions — inline — commit: n/a (outside repo)
- T5 — S1–S4 — real run (C, Python, Java) through HTTP and CLI + independent verify (Risk item 2: sandbox) — verify — commit: n/a

## Log
L1 — "Necesito que mientras el otro chat que tenemos ahorita de Learning vaya trabajando. Necesito que también incluyamos una sección o una forma de poder evaluar código. Porque ya tenemos para matemáticas y preguntas, pero quisiera alguna forma de. de que con el Gentle Shell o lo que sea, se pueda, no sé, hacer ejercicios de código. Y que se vayan corrigiendo bien. No sé, es que no sé, pero tiene que haber alguna sección. Porque yo estudio programación. Entonces necesito, por lo menos, para laboratorio 2, escribir mucho código. Y no sé si hay alguna forma de hacer evaluaciones basadas en el código y hacer ejercicios. que se puedan ir corrigiendo dentro de nuestro de nuestra aplicación."
L2 — Asked which language Lab 2 uses. Answer: "son varios, asi que debe adaptarse a cualquiera".
L3 — Environment: docker 29.1.5 available; node v24 (type stripping, no build); worktree isolated from the other chat.
