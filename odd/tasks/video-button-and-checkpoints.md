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
T3 — S3 — `lk-checkpoint` component (kit.js, kit.css), docs and test — done, working tree
T4 — S4 — the live Part 3 note (VPS `~/Learnings`) gets the video control and three mid-node checkpoints; its retired app file and folder are deleted — done, VPS working tree
T5 — S5 — update the `explicacion-interactiva` skill and save the pattern in Engram — done, working tree

## Log
L2 — Decision: remove the app feature end to end, not only the vault file, because the user rejected how the app was produced ("no API app"); keep legacy app cleanup in part deletion so an older vault can drop it.
L3 — Decision: the video control is guaranteed by the bridge, not by author discipline: `video` travels in the part payload and `ensureNodeVideo` injects `<lk-video>` plus kit assets into a rich page that lacks them.
L4 — Evidence: adapter suite 112 pass / 0 fail / 9 skipped (playwright); studio suite 47 pass / 0 fail; bridge rich-page test proves the injected control and kit assets; Markdown part test proves `video: {src, exists}`.
L5 — The active source is the VPS Learnings checkout (`~/Learnings`, per memory `learning/study-source-vps`), whose Part 3 note is 62 KB. Edited it in place: `<lk-video>` after the definition and three `<lk-checkpoint>` blocks (inside `<script type="application/json">`) at the end of sections 3, 5 and 7; deleted `explicaciones/apps/p3.html` and the empty folder. The local `~/documents/projects/learnings` clone is stale and not authoritative; the condensed rich page created there was removed so it cannot overwrite the live note.
L6 — The `explicacion-interactiva` skill now documents `lk-video` on every node, `lk-checkpoint`, and no apps; stale `/home/alesierraalta/...` paths fixed to `/home/ale/documents/learning/...`. The kit example remains the rich-page reference.
L1 — "In the third part of the reinforcement learning, I cannot see the create a video part, so you have to build it and save it to the memory and every place where you need it to use it, because every single node should have a button to create a video, and that's it. Also, you're gonna delete the interactive app, no API app. So because I didn't like how did you manage the creation of the interactive application, and I want to remember if we have like something to prepare something to put like in the middle of a point of a node, like a mini quiz to, but I cannot see it in like in this part, so you have to rewrite it."
