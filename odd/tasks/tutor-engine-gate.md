# Tutor engine gate rebuild

Rebuild the tutor runtime and shared engine gate on `feat/108-tutor-rebuild` from `origin/main`.
Prior work remains untouched in `learning-tanda2`; do not import its unrelated history.

## Specs

S1 — "seleccione explícitamente el tema activo" para "una tutoría profunda"; "las notas rápidas y conversaciones generales quedarían fuera de la compuerta".
S2 — "Pi y Antigravity usarían entonces la misma validación del motor, sin ejecutar la de Pi dos veces."
S3 — "llevalo a main"; "hazlo todo".
S4 — "no pasa nada, se hace de nuevo con las skills"

## Tasks

T1 — S1,S2,S4 — Rebuild provider selection and tutor runtimes — in_progress — #108 — commit pending
T2 — S1,S4 — Select and bind the active deep topic — pending — #109 — commit pending
T3 — S1,S2,S4 — Apply the shared engine gate and cover independent review findings — pending — #110 — commit pending
T4 — S1,S2,S3 — Verify, integrate, and publish — pending — commit pending

## Log

L7 — Reopened in a new session after the user reported Pi repaired; clean branch feat/108-tutor-rebuild based on origin/main 594368c1fc3f; issues #108–#110 remain open. Previous worktrees remain untouched.

L1 — Original request: "Quiero que revises la posibilidad de que podamos utilizar no solo GentleP o GentleShell como creador y tutor. O sea, la gente del tutor, sino que yo dentro de la aplicación pueda elegir en configuraciones cuál es el proveedor, solamente quiero integrar ahorita dos. SDP SDPI mira, esa person, o sea, la gente del tutor, sino que yo dentro de la aplicación pueda elegir en configuraciones cuál es el proveedor en el... O sea, solamente quiero integrar ahorita dos. GentlePI y Antigravity. De forma que yo pueda elegir cualquiera de las dos para que sea mi tutor. O sea, que también funcione con Antigravity de fondo. Porque tengo la cuota ahí y casi no la uso, entonces quiero probar. O también, otra opción, o sea, evalúa, no evalúa, revisa qué hay que hacer para las tres. También el Open Code u Open Code 2 con algún modelo gratuito. No sé, el DeepSeek Flash, el Mimo V2 Flash, 2.6 Flash, y que dentro del Gentle Shell yo también pueda elegir el modelo, aunque la mayoría del tiempo va a ser DeepSeek, pero bueno, que yo pueda decidir el modelo desde configuraciones. Pero veo más probable que utilice Antigravity como main porque es el que tengo más uso sin darle uso real. Entonces, bueno,"
L2 — User authorized "si, hazlo todo", then "llevalo a main", then "hazlo todo" for the remaining gate and publication.
L3 — User answered "si" to: "Recomiendo que el usuario seleccione explícitamente el tema activo para una tutoría profunda; las notas rápidas y conversaciones generales quedarían fuera de la compuerta. Pi y Antigravity usarían entonces la misma validación del motor, sin ejecutar la de Pi dos veces."
L4 — Prior implementation was not approved: selected topics without .learning skip validation; cancellation/settlement races require reproduction; Pi parity and no-selection behavior need coverage; integration documentation misstates canContinue.
L5 — User instructed: "no pasa nada, se hace de nuevo con las skills". Fresh isolated worktree starts at origin/main ec3070115604951a73d329ca1e37952aa8e195a7; prior branch and uncommitted work remain intact.
L6 — Issues #108, #109 and #110 created in milestone #4 and read back. T1 worker mw411i5v-2-0ml2 unavailable: Pi exited before agent_settled because extension /home/ale/.pi/agent/npm/node_modules/pi-rtk-optimizer/index.ts could not be loaded. No worker edits or tests confirmed; no retry.
