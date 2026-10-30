# Studio quiz flow and note offer

Five studio fixes reported by the user on 2026-10-29. Branch `fix/studio-quiz-flow`, worktree
`~/documents/learning-quiz-flow`, based on `origin/main` 574bac0. The deployed studio runs on the VPS.

## Specs

- **S1** "ir a la nota me lo debe decir cuando ya generó la nota, no arriba, porque no debe ni saber a dónde me debe redirigir, no tiene sentido". The «Ir a la nota» button appears only once the note was written: at the end of the tutor's turn, under its explanation (the existing `offerNote`). Tool activity rows never carry it (neither at start nor at end), and the drawer-head button is only updated by the end-of-turn offer and by the history of a reloaded tab, never by a tool start.
- **S2** "de paso al darle me sale unknown topic "undefined": use one folder name under the Learnings root". Root cause (verified by reading): `readerView` in `studio/ui/studio.js` builds the `api/view` query from `quick ? {quick} : {topic}`, where `quick` is the library entry; when `#/rapido/<id>` is opened before the library lists that note (freshly written), the query becomes `topic=undefined`. A `#/rapido/<id>` route always asks `api/view?quick=<id>`, whether or not the library already lists it, and never sends `topic=undefined`.
- **S3** "las notas universitarias también deben ordenarse por la última vez que se abrió". The «Tus temas» cards on the home page are ordered by the last time each topic was opened in the studio (its topic page or any of its parts/diagnosis/exercises), most recent first; never-opened topics follow in the current order. Opens are recorded server-side (they must survive reloads and be shared by every browser of the same studio), outside the vault. Quick notes keep their current order.
- **S4** "si la respuesta en el quiz es "no se" no debes tener que elegir seguro dudo o adiviné". In every quiz (plain part pages and the diagnosis in `integrations/pi/view/app.js`, rich pages `lk-quiz` in `integrations/pi/kit/kit.js`), choosing the «No sé» option hides the confidence choice and does not require it; the payload sends no `confianza` for that question. Choosing another option again shows (and, in app.js, requires) it.
- **S5** "y al terminar el quiz debe mandarte a otra página mostrándote los resultados mientras hay un mensaje de "el agente está leyendo tus análisis" y al terminar dé un botón para ir a lo siguiente". In the studio, a successful quiz or diagnosis submission navigates to a results page (studio route) with the score and each question's result, and the message «El agente está leyendo tus análisis…» while the tutor works; when the tutor finishes, the message is replaced by a button «Ir a lo siguiente» that runs the topic's next step (the same `nextStep(topic)` action the home page offers, from a reloaded library).
- **S6** "luego del quiz no se genera nada ni se ve al agente trabajando". Evidence (VPS session `2026-10-27T12-43-24-723Z_estudio.jsonl`, 2026-10-30 03:02 UTC): after the diagnosis submission the agent did work for ~2 minutes (wrote quiz.json round 2, quiz.md, planificador.md, explicacion.md) and replied; the learner saw nothing because the page stayed on the quiz with the drawer closed. The results page of S5 shows the tutor working live: the spinner and the current activity label (`tutor.activity`) while busy.

## Contract between the view and the studio (S5)

After a successful submission, a page embedded in a frame (`window.parent !== window`) posts to its parent:

```js
window.parent.postMessage({
  type: "learning:submitted",
  kind: "diagnosis" | "mini-quiz",
  topic: "<topic folder>",
  part: "<part id>" /* omitted for diagnosis */,
  score: "5/6",
  results: [{ id, enunciado, chosen, chosenText, correct, correctText, ok }],
}, "*");
```

`"*"` is acceptable: the bridge's CSP `frame-ancestors` restricts embedders to the studio, and the studio accepts the message only when `event.source` is the reader frame's `contentWindow`. A standalone page (not framed) keeps its current inline results.

## Tasks

| ID | Specs | Route | Commit |
|---|---|---|---|
| T1 | S4, S5 (emitter) | worker A: `integrations/pi/view/app.js`, `integrations/pi/kit/kit.js` + their tests | |
| T2 | S1, S2, S3, S5, S6 | worker B: `studio/server.ts`, `studio/ui/*`, studio tests | |
| T3 | all | parent: integrate, run full suites, Risk line | |

## Log

- **L1** (user, 2026-10-29, verbatim):
  [22:53, 10/29/2026] alesierraalta: ir a la nota me lo debe decir cuando ya generó la nota, no arriba, porque no debe ni saber a dónde me debe redirigir, no tiene sentido, de paso al darle me sale unknown topic "undefined": use one folder name under the Learnings root
  [22:53, 10/29/2026] alesierraalta: las notas universitarias también deben ordenarse por la última vez que se abrió
  [23:03, 10/29/2026] alesierraalta: si la respuesta en el quiz es "no se" no debes tener que elegir seguro dudo o adiviné
  [23:04, 10/29/2026] alesierraalta: y al terminar el quiz debe mandarte a otra página mostrándote los resultados mientras hay un mensaje de "el agente está leyendo tus análisis" y al terminar dé un botón para ir a lo siguiente
  [23:06, 10/29/2026] alesierraalta: luego del quiz no se genera nada ni se ve al agente trabajandl
- **L2** Another session works in `~/documents/learning` (PR #56, VPS deploy); this feature uses its own worktree to avoid collisions.
