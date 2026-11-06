# Tutor engine gate rebuild

Rebuild the tutor runtime and shared engine gate on `feat/108-tutor-rebuild` from `origin/main`.
Prior work remains untouched in `learning-tanda2`; do not import its unrelated history.

## Specs

S1 — "seleccione explícitamente el tema activo" para "una tutoría profunda"; "las notas rápidas y conversaciones generales quedarían fuera de la compuerta".
S2 — "Pi y Antigravity usarían entonces la misma validación del motor, sin ejecutar la de Pi dos veces."
S3 — "llevalo a main"; "hazlo todo".
S4 — "no pasa nada, se hace de nuevo con las skills"

## Tasks

T1 — S1,S2,S4 — Rebuild provider selection and tutor runtimes — done — #108 — 145975c
T2 — S1,S4 — Select and bind the active deep topic — done — #109 — 2194e65
T3 — S1,S2,S4 — Apply the shared engine gate and cover independent review findings — done — #110 — 2194e65
T4 — S1,S2,S3 — Verify, integrate, and publish — pending — — — commit pending

## Log

L7 — Reopened in a new session after the user reported Pi repaired; clean branch feat/108-tutor-rebuild based on origin/main 594368c1fc3f; issues #108–#110 remain open. Previous worktrees remain untouched.
L8 — T1 delivered in 145975c: tutor.json settings (pi|agy), studio/agy.ts stream-json runtime, preferences selector, tests 51/51.
L9 — T2/T3 delivered together in 2194e65 the composer on a topic page sends {text, tema}; a topic without .learning/state.json is refused with 400 before the tutor; the pass rule moved to integrations/pi/gate-rules.ts and the studio applies it once after agent_settled for Antigravity only, never a second time for Pi; a failing verdict blocks the next deep turn with 409 until the topic passes or another topic is selected. Evidence: studio/server.test.mjs 53/53, studio/layout.test.mjs 69/69 (includes the new composer-topic case and the restored seven-aspect preferences invariant).
L10 — Native review (lineage review-1af2681071f8807e, four lenses) raised nine candidate-caused critical findings and demanded one bounded correction: a refused prompt repointed or cleared the turn's topic so its gate could be skipped; restart refused while busy removed the only recovery for a wedged turn; Antigravity accepted thinking levels it cannot apply and silently dropped them; a blocked topic was never re-evaluated because the gate only ran after a settle that a blocked prompt prevented. Correction: the prompt route validates and sends before it moves any studio state, a blocked topic is re-asked before it is refused, restart works while busy, and levels are per provider (Antigravity low..max) and refused instead of dropped. Evidence: RED on the previous code (409!==200 release, 'hash'!=='redes' repoint, 200!==400 level), then studio/server.test.mjs 54/54, studio/layout.test.mjs 69/69, go build ./... and go test ./... green.

L1 — Original request: "Quiero que revises la posibilidad de que podamos utilizar no solo GentleP o GentleShell como creador y tutor. O sea, la gente del tutor, sino que yo dentro de la aplicación pueda elegir en configuraciones cuál es el proveedor, solamente quiero integrar ahorita dos. SDP SDPI mira, esa person, o sea, la gente del tutor, sino que yo dentro de la aplicación pueda elegir en configuraciones cuál es el proveedor en el... O sea, solamente quiero integrar ahorita dos. GentlePI y Antigravity. De forma que yo pueda elegir cualquiera de las dos para que sea mi tutor. O sea, que también funcione con Antigravity de fondo. Porque tengo la cuota ahí y casi no la uso, entonces quiero probar. O también, otra opción, o sea, evalúa, no evalúa, revisa qué hay que hacer para las tres. También el Open Code u Open Code 2 con algún modelo gratuito. No sé, el DeepSeek Flash, el Mimo V2 Flash, 2.6 Flash, y que dentro del Gentle Shell yo también pueda elegir el modelo, aunque la mayoría del tiempo va a ser DeepSeek, pero bueno, que yo pueda decidir el modelo desde configuraciones. Pero veo más probable que utilice Antigravity como main porque es el que tengo más uso sin darle uso real. Entonces, bueno,"
L2 — User authorized "si, hazlo todo", then "llevalo a main", then "hazlo todo" for the remaining gate and publication.
L3 — User answered "si" to: "Recomiendo que el usuario seleccione explícitamente el tema activo para una tutoría profunda; las notas rápidas y conversaciones generales quedarían fuera de la compuerta. Pi y Antigravity usarían entonces la misma validación del motor, sin ejecutar la de Pi dos veces."
L4 — Prior implementation was not approved: selected topics without .learning skip validation; cancellation/settlement races require reproduction; Pi parity and no-selection behavior need coverage; integration documentation misstates canContinue.
L5 — User instructed: "no pasa nada, se hace de nuevo con las skills". Fresh isolated worktree starts at origin/main ec3070115604951a73d329ca1e37952aa8e195a7; prior branch and uncommitted work remain intact.
L6 — Issues #108, #109 and #110 created in milestone #4 and read back. T1 worker mw411i5v-2-0ml2 unavailable: Pi exited before agent_settled because extension /home/ale/.pi/agent/npm/node_modules/pi-rtk-optimizer/index.ts could not be loaded. No worker edits or tests confirmed; no retry.
