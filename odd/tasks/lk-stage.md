# lk-stage — replace the figure base with a declared isometric stage

Milestone #8 «Visual language like the learner's references» · issues #358 (engine), #359 (object library), #360 (tutor contract), #361 (real run).
Branch `feat/358-lk-stage` from `origin/main @ cbaf699`. Prototypes the learner chose: `scratch/visual-base/b-isometric/` (engine) with the narration of `scratch/visual-base/a-story-stage/` (in the main checkout `/home/ale/documents/learning`, gitignored).

## Specs

**S1 — The base changes, not the decoration.** The learner: «Solamente cambiaste el diseño sin cambiar la base. Necesito que cambiemos la base. La base con la que estamos partiendo me parece muy fea.» A new element `<lk-stage>` renders figures from a JSON spec. It does not reuse `scene.js` primitives (`box`, `gear`, `sheet`, `packet`, …) for its scene.

**S2 — Chosen direction.** The learner picked «B + narración de A (recomendado)»: the isometric stage of base B, with base A's narration — the question with a highlighted key word and a narrator with coloured chips.

**S3 — No coordinates.** Actors sit in named cells of an isometric grid. The spec has no x/y anywhere; placement, label placement and camera framing are computed.

**S4 — Spec vocabulary.** `question` (with one highlighted word), `actors[]` (`id`, `kind`, `cell`, `name`, identity colour), `lanes[]` (`from`, `to`, `verb`, identity), `steps[]` (`activeActor`, `highlightLane`, `facts[]`, `narrator` with chips `[text|tone]`). Unknown keys, kinds, cells, tones or ids fail loudly naming the offending value and where it is.

**S5 — Stage behaviour.** Objects drawn as isometric prisms with three-tone faces and a soft shadow; the camera eases toward the active actor of each step; lanes are dashed, flow, and carry their verb; a facts panel shows the numbers of the step; a player with previous / next, step dots and `N/M`.

**S6 — Motion.** One ease `cubic-bezier(.2,.8,.2,1)`, 150–420 ms. `prefers-reduced-motion` disables motion.

**S7 — Quality gate.** A real-browser check fails when two labels overlap or a label leaves the stage. The prototype's defect must be caught: the lane verb «cargar» drawn over the actor tag «Cargador».

**S8 — Kit rules.** No runtime npm dependency and no build step, like the rest of the kit. Works in light and night themes.

**S9 — Object library v1 (#359).** Kinds `robot`, `room`, `charger`, `battery`, `block`, `agent`, `environment`, each with a committed reference screenshot. Adding a kind is one documented entry.

**S10 — Tutor contract (#360).** The tutor authors `<lk-stage>` and can no longer author `lk-scene` / `lk-story` for a new part; existing parts with old figures keep rendering unchanged.

**S11 — Real run (#361).** The live tutor regenerates Parte 1 of aprendizaje por refuerzo on `lk-stage`; it passes every gate; a side-by-side old/new is delivered to the learner's PC (`C:\Users\ismar\Downloads\`).

## Tasks

- T1 S1-S6,S8 — `<lk-stage>` element: spec validation + isometric renderer + narration + player, with the prototype's four kinds (`robot`, `room`, `charger`, `block`); docs in `docs/kit.md` — writer — pending
- T2 S7 — real-browser label gate for `lk-stage` — writer — pending (after T1)
- T3 S9 — object library v1 + reference screenshots (#359) — writer — pending (after T1)
- T4 S10 — tutor contract + explain-check/engine standard (#360) — writer + independent verify (Risk: item 3) — pending (after T3)
- T5 S11 — live real run and side-by-side on the PC (#361) — parent — pending (after T4)

## Log

- L1 (2026-11-17, learner, verbatim): «No, eso es justo lo que no quiero. Solamente cambiaste el diseño sin cambiar la base. Necesito que cambiemos la base. La base con la que estamos partiendo me parece muy fea. Fíjate que ya hemos hablado de herramientas como aprenderust.dev que utilizan otro tipo de diseño mucho más bonito. Entonces, no me gusta la base por la cual estamos partiendo.»
- L2 (2026-11-17): four bases built on the same robot story and delivered to the PC as `cuatro-bases.html`: 0 current scene.js, A story stage (Kenney CC0 pixel art), B isometric, C Motion Canvas. Inspected: 0 has no robot and detached arrowheads; A's grammar reads but the generic pack has no robot or battery; B is the only real scene, flaws: «cargar» lane over the «Cargador» tag, an irrelevant wall, cell codes shown as noise; C is a card UI, no robot, needs a build step.
- L3 (2026-11-17, learner choice): «B + narración de A (recomendado)». Issues #358–#361 published in milestone #8 on the learner's «Publica y arranca».
