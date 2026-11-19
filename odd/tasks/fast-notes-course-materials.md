# Fast notes and course materials with retrieval

Measure where a part's generation spends its time and cut it; then let the learner upload a course's
real material (exams, documents, class transcripts) and give each part only the relevant slice of it.
Branch `feat/370-fast-notes-course-materials` from `origin/main @ b1eaf3d`. Milestones 9 (speed) and 12 (course materials).

## Specs

**S1 — Measure before optimising.** «tenemos que optimizar el tiempo de generación de cualquier nota … vas a hacer todo ese proceso de verificación, de cuánto tiempo tarda para luego buscar mejoras … Vas a hacer las mediciones pertinentes y todo.» The page timing report breaks each tutor call down per tool (name, start offset, duration, ok) and the model time between tools, for Pi and Antigravity.

**S2 — Faster notes.** «no puedo esperar 10 minutos por una nota». Target: the learner chose «Lo que dé la medición»: the target time is decided with the learner after S1's breakdown. Quality may not drop: no gate removed or relaxed, no rule weakened (as in milestone 9's «no quiero perder calidad»).

**S3 — Course material.** «yo te paso el examen, pero también quiero pasarte todos los documentos de por ejemplo, la universidad, para prepararme no solamente para el examen, sino con el contenido de la materia real, para que puedas tener en cuenta ejemplos, cosas que habla del profesor, cosas que sí, cosas que no. O incluso yo te paso las transcripciones de las clases … creo que deberían estar las dos, porque hay profesores que tienen formas particulares y solamente se ven en clase.» Grouping: the learner chose «Por materia»: a course holds exams, documents and transcripts; its topics and parts consult that material. Transcripts arrive «Ya en texto» (TXT/PDF/DOCX/MD); no audio transcription.

**S4 — Do not read everything.** «necesitamos que de alguna forma, no sé si se hagan embeddings de la data que vaya subiendo, porque no sé de qué otra forma podemos hacer que, bueno, cuando el modelo vaya a leer todo, no tenga que leer todo y eso sea un absurdo desgaste de contexto». Embeddings: the learner chose «Local en la VPS»: local multilingual model plus hybrid search (keywords + semantic) in SQLite, no external API.

**S5 — Grounded parts.** Each part receives only the relevant chunks within a bounded budget, with their source and type, and cites where each example or claim comes from.

## Tasks

| ID | Spec | Issue | Route | Commit |
|---|---|---|---|---|
| T1 | S1 | #370 | worker | pending |
| T2 | S2 | #372 | worker, after T1 measurement | pending |
| T3 | S3 | #371 | worker | pending |
| T4 | S4 | #373 | worker, after T3 | pending |
| T5 | S4, S5 | #374 | worker, after T4 | pending |

## Log

**L1** — User's original request, verbatim: «Ahora necesito una funcionalidad compleja porque, o sea, te voy a pedir varias cosas. Uno, tenemos que optimizar el tiempo de generación de cualquier nota. No sé cómo vamos a hacer eso, no sé si cómo vamos a mejorar, a optimizar ese flujo para como lo tenemos ahorita, pero necesitamos optimizarlo porque no puedo esperar 10 minutos por una nota. Entonces, bueno, vas a hacer todo ese proceso de verificación, de cuánto tiempo tarda para luego buscar mejoras, etcétera, etcétera, etcétera. Vas a hacer las mediciones pertinentes y todo. Y luego de eso también necesitamos armar una buena arquitectura en ese sentido, que yo pueda subir contenido. Por ejemplo, imagínate que yo quiero estudiar para este examen. Y bueno, yo te paso el examen, pero también quiero pasarte todos los documentos de por ejemplo, la universidad, para prepararme no solamente para el examen, sino con el contenido de la materia real, para que puedas tener en cuenta ejemplos, cosas que habla del profesor, cosas que sí, cosas que no. O incluso yo te paso las transcripciones de las clases, también puede ser una, o sea, creo que deberían estar las dos, porque hay profesores que tienen formas particulares y solamente se ven en clase. Entonces, ese tipo de cosas, pero para eso, como te digo, necesitamos, además de mejorar la velocidad de generación, necesitamos que de alguna forma, no sé si se hagan embeddings de la data que vaya subiendo, porque no sé de qué otra forma podemos hacer que, bueno, cuando el modelo vaya a leer todo, no tenga que leer todo y eso sea un absurdo desgaste de contexto, ¿me entiendes?»

**L2** — Learner's answers: target time «Lo que dé la medición»; grouping «Por materia (Recomendado)»; embeddings «Local en la VPS (Recomendado)»; transcripts «Ya en texto».

**L3** — Baseline evidence (VPS `~/.local/state/learning-studio/page-timings/`, 13 real reports, agy / gemini-3.8-flash-high, 2026-11-13..18): totals 8.7–24.6 min, median ~14.5 min; the tutor phase is 95–99 % of each; contexto ≈0 s, motor ≈0 s, comprobaciones seconds. Earlier finding (#242): the time is the tool loop inside the first call, not output speed (a correction call answers in about 1 min). The report has no per-tool breakdown yet.

**L4** — VPS capacity: 4 cores, 7 GB RAM (5 GB available), 268 GB free disk, SQLite 3.46.1, no ollama. A small multilingual ONNX embedding model on CPU fits; large models (bge-m3) would be slow.

**L5** — Exploration map for T3–T5 (read-only explorer):
- Uploads today: `POST api/subir` → `<root>/.subidas/<32-hex>/<name>`, PDF/PNG/JPEG/WEBP only, 20 MiB/file, 5 files per entry (`studio/server.ts:108-212,1977-2090`); PDFs get `pdftotext` text + up to 20 page PNGs. Engine stages them into `<topic>/fuentes/` (`internal/engine/sources.go:18-178`). The tutor is told to read every file in full (`studio/runtime.ts:55-72`): no chunking or retrieval exists.
- No course/materia grouping exists: a topic is a root directory with `plan.json`; `TopicSummary` is `id/title/parts/gaps/exam` (`integrations/pi/bridge.ts:1173-1180,1433-1476`).
- Prompt for a part: `withLecciones(namedPart(text), root)` (`studio/server.ts:1519`); Antigravity appends `STUDIO_CONTRACT` (`studio/agy.ts:29-43,92`).
- Tools: Pi registers one bridge tool `learning_view` (`integrations/pi/bridge.ts:2434-2494`); Antigravity has no tool hook, so on-demand search for it goes through a CLI/MCP command (`cmd/learning/mcp.go:249-280`) plus a contract line.
- Storage: `node:sqlite` `DatabaseSync` already used (WAL, `integrations/pi/store.ts:9-45`); Node ≥24 on the VPS (`deploy/vps/install.sh:46-49`). No embedding library present: Node in-process ONNX vs a Python venv is still open for T4.
- T3 must also accept DOCX/TXT/MD (transcripts arrive as text, L2).
