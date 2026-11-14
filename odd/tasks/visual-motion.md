# Visual motion in stories and walkthroughs

Milestone #8 «Visual language like the learner's references». Issues #298-#301. Branch `feat/298-step-motion` from origin/main 2b68a4f.
Research basis: the learner's four reference sites (electronics-101, protocol-explorer, aprenderust, aprendesql). The figure is state, and every step is a visible transition of that state.
Runner: `node --test` on the touched test files; `go test ./...` when the engine changes.

## Specs

- S1 (#298): User: "Vas a generar un trabajo de investigación en el cual vas a extraer todo lo que puedas sobre animaciones, dibujo, visualizaciones, animaciones de iconos, elementos, todo lo que sea visual para ver cómo podemos mejorar nosotros las visuales que estamos utilizando a la hora de generar una nota en la aplicación." Then "si, go" to implementing P1-P4 of the report. P1, step continuity, in `lk-walkthrough` and `lk-story`:
  - Every scene piece has a stable key: an explicit `id`, else one derived from its kind and label.
  - A kept piece animates from its previous position and tone to the new one, in at most 320 ms with `cubic-bezier(.2,.8,.2,1)`. A new piece fades in with a 6 px rise. A removed piece fades out.
  - The settled frame equals today's static render, so the gates and the reader visual matrix measure the same geometry.
  - `prefers-reduced-motion: reduce` swaps instantly.
  - Fast navigation (buttons, dots, arrow keys, «Ver todo», fullscreen) cancels in-flight transitions and never leaves a half state.
- S2 (#299), P2:
  - A kept piece whose text, value or tone changed gets a one-shot highlight of about 600 ms, with no authoring.
  - A step's optional `focus: "<piece id>"` gives that piece a pulsing ring until the step changes, at most one per step.
  - scene-lint rejects a `focus` that names no piece of that step.
  - Reduced motion shows no flash and a static outline.
  - Works in the night themes, wide mode and fullscreen. Docs and the skill reference explain `focus`.
- S3 (#300), P3:
  - An arrow or move with `flow: true` is dashed, and its dash travels in the arrow's direction. It reuses the explorer's `lk-xflow` timing and tokens.
  - An arrow new in a step draws itself in: `pathLength=1`, dashoffset 1→0 in 400 ms, and the head appears at the end.
  - Label placement and the settled geometry are unchanged.
  - Reduced motion shows a solid, static arrow. Docs and the skill reference explain `flow`.
- S4 (#301), P4:
  - A step accepts `facts: [[key, value], ...]`, at most 5 rows. It renders as a key-value table beside the step text, with mono, tabular values, and stacks under the text below 640 px.
  - A deck or story accepts `summary: {title, text?, metrics: [[key, value], ...]}`, shown as a closing card after the last step and in «Ver todo».
  - scene-lint reports a malformed `facts` or `summary`.
  - Works in the night themes and fullscreen.
  - Docs and the skill reference say when to use them: a symbol legend for a formula, and the result of a walkthrough.

## Tasks

- T1 S1 #298 step continuity — worker — done, e6d017d (motion.test 8/8, kit tests 120/120, bridge 133 pass; gates measure with reduced motion; key attr data-piece-key)
- T2 S2 #299 change flash and focus ring — worker — done (focus.test 11/11 and motion.test 8/8 on the final kit; scene-lint focus 2/2; scene-lint.test + deck-gate.test 114/114; kit dir + kit-pages + scene-gate.test 153/153; go ./internal/engine 488 pass; bridge 133 pass, 1 skip; gates skip data-focus-ring; step key data-focus-piece; settled == HEAD on 14 blocks); committed 8fe9dbd
- T3 S3 #300 flowing and draw-on arrows — worker — done (flow.test 9/9, with the draw and dash checks; kit dir 140/140; scene-lint-flow 3/3; deck-gate-flow 1/1; scene-lint, deck-gate, scene-gate, kit-pages 140/140; arch-gate 7/8 with the 3 pre-existing findings; bridge 133 pass, 1 skip; go unchanged; scene-lint rejects a non-boolean flow; reduced motion solid; no HEAD-vs-tree sweep of the examples); committed 1528be5
- T4 S4 #301 facts table and closing summary — worker — done (facts.test 14/14: RED 12 fail + 1 guard; scene-lint-facts 5/5: RED 4 fail + 1 guard; story_facts go 3/3: RED 1 fail + 2 guards, go ./internal/engine 491 pass; deck-gate-facts 2/2: overflow check RED with the check disabled, GREEN with it; kit-pages 14/14: RED no legend; kit dir 154/154; scene-lint, deck-gate, scene-gate, focus and flow sets 134/134; bridge 133 pass, 1 skip; arch-gate 7/8 with the 3 pre-existing findings; «Ver todo» not implemented, see the report)

## Log

- L1 (2026-11-14, user, verbatim): "Vas a generar un trabajo de investigación en el cual vas a extraer todo lo que puedas sobre animaciones, dibujo, visualizaciones, animaciones de iconos, elementos, todo lo que sea visual para ver cómo podemos mejorar nosotros las visuales que estamos utilizando a la hora de generar una nota en la aplicación."
- L2 (2026-11-14, user): "si, go". Accepts turning P1-P4 into issues and implementing them.
- L3 (evidence): on origin/main, kit.css has `@keyframes pulse` and `lk-xflow` (scenario explorer only) and a global reduced-motion kill. Story and walkthrough steps swap scenes without interpolation.
