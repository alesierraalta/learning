# Video button on every node, no interactive app, mid-node checkpoints
Objective: every part node exposes «Generar video»; the separate interactive app disappears; a part page can carry mini-quiz checkpoints in the middle of a section; the reinforcement-learning Part 3 page is rewritten with both. Persist the pattern in the skill and in Engram.

## Specs
S1 — "every single node should have a button to create a video"
S2 — "you're gonna delete the interactive app, no API app"
S3 — "I want to remember if we have like something to prepare something to put like in the middle of a point of a node, like a mini quiz"
S4 — "In the third part of the reinforcement learning, I cannot see the create a video part ... so you have to rewrite it."
S5 — "save it to the memory and every place where you need it to use it"

## Contract
- The part view (Markdown render and rich page) always shows one video control: the player when `explicaciones/adjuntos/Parte N - <slug>.mp4` exists, otherwise «🎬 Generar video» posting `{kind:"video", topic, part}`. A rich page that forgot `<lk-video>` gets one injected, plus the kit assets.
- `explicaciones/apps/<part>.html`, the `/<topic>/<part>/app` route, `hasApp`/`appUrl`, the studio App switch and the app docs are removed. Deleting the vault file is part of the change.
- Kit component `lk-checkpoint`: inline JSON questions, immediate local feedback and retry, no engine call; used mid-section so a node can quiz inside a `## N` section. The end-of-part graded quiz stays `lk-quiz`.
- Part 3 rich page: full explanation (sections 1–8, quiz, exercises) with the video control and three checkpoints inside sections 3, 5 and 7.

## Tasks
T1 — S2 — remove the interactive app from bridge, view, studio, docs and tests; delete the vault `explicaciones/apps/p3.html` — done, working tree
T2 — S1 — video control in the part payload and SPA, and a guard that injects `<lk-video>` into rich pages — done, working tree
T3 — S3 — mid-node quiz: upstream `main` standardized `lk-quick-quiz` while this work was in flight, so the local `lk-checkpoint` was dropped and the vault note adopted the upstream component (telemetry included) — done, commit `2a710f1`
T4 — S4 — the live Part 3 note (VPS `~/Learnings`) gets the video control and one quick quiz per section; its retired app file and folder are deleted — done, VPS live
T5 — S5 — update the skills and save the pattern in Engram — done (Engram id 12131)
T6 — S6 — Part 3 video: rebuild the lost renderer on the VPS and deliver `adjuntos/Parte 3 - Política, valor y modelo.mp4|.srt` — done, see L8/L9

## Log
L2 — Decision: remove the app feature end to end, not only the vault file, because the user rejected how the app was produced ("no API app"); keep legacy app cleanup in part deletion so an older vault can drop it.
L3 — Decision: the video control is guaranteed by the bridge, not by author discipline: `video` travels in the part payload and `ensureNodeVideo` injects `<lk-video>` plus kit assets into a rich page that lacks them.
L4 — Evidence: adapter suite 112 pass / 0 fail / 9 skipped (playwright); studio suite 47 pass / 0 fail; bridge rich-page test proves the injected control and kit assets; Markdown part test proves `video: {src, exists}`.
L5 — The active source is the VPS Learnings checkout (`~/Learnings`, per memory `learning/study-source-vps`), whose Part 3 note is 62 KB. Edited it in place: `<lk-video>` after the definition and three `<lk-checkpoint>` blocks (inside `<script type="application/json">`) at the end of sections 3, 5 and 7; deleted `explicaciones/apps/p3.html` and the empty folder. The local `~/documents/projects/learnings` clone is stale and not authoritative; the condensed rich page created there was removed so it cannot overwrite the live note.
L6 — The `explicacion-interactiva` skill now documents `lk-video` on every node, no apps, and the upstream `lk-quick-quiz` per explanatory point; stale `/home/alesierraalta/...` paths fixed to `/home/ale/documents/learning/...`.
L7 — Pivot: `origin/main` had moved to `a3f8ae7` and already shipped `lk-quick-quiz` with per-point telemetry, so `lk-checkpoint` was removed rather than keeping two quiz systems; the live Part 3 note now carries 8 quick quizzes, one per section, with E = «No sé» and a validated answer key.
L8 — Video: the historical renderer (`~/Developer/learnings-video-html-renderer`) no longer exists on any machine. With the user's authorization (m01332) it was rebuilt on the VPS at `~/learnings-video`: edge-tts voice with word boundaries, Pillow frames at 1080p30, ffmpeg mux, SRT cues. Toolchain: ffmpeg 8, Python 3.14 venv, Pillow 13, edge-tts, Atkinson TTF converted from the kit's woff2.
L9 — Evidence: Part 3 rendered twice to fix tofu glyphs (DejaVu first), section labels, flow geometry and SRT overlap; final `375 s`, 1920x1080, H.264/AAC, delivered with its `.srt`; md5 recorded in the task log.
L1 — "In the third part of the reinforcement learning, I cannot see the create a video part, so you have to build it and save it to the memory and every place where you need it to use it, because every single node should have a button to create a video, and that's it. Also, you're gonna delete the interactive app, no API app. So because I didn't like how did you manage the creation of the interactive application, and I want to remember if we have like something to prepare something to put like in the middle of a point of a node, like a mini quiz to, but I cannot see it in like in this part, so you have to rewrite it."
